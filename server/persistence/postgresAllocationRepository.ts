/**
 * Production PostgreSQL-backed allocation repository, suitable for Vercel
 * serverless functions.
 *
 * Storage:
 *   - allocation_snapshots  the wallet allocation snapshots (one row per
 *     wallet/network, never two)
 *   - allocation_pool_ledger a single-row-per-network lock that serializes pool
 *     budget consumption across concurrent serverless instances
 *
 * Concurrency:
 *   - Same wallet, simultaneous requests: the UNIQUE(wallet_address, network)
 *     constraint + insert-followed-by-read means the second request
 *     hits a unique-violation (SQLSTATE 23505), rolls back and returns the
 *     winner's row. Both callers receive the identical allocation.
 *   - Pool budget, simultaneous distinct wallets: a transaction takes
 *     SELECT ... FOR UPDATE on the network's ledger row, which serializes
 *     remaining-budget calculation so the pool cap is never exceeded.
 *
 * Schema migration:
 *   - initializeSchema() (and every schema ensure on a cold start) detects a
 *     legacy "Season 01" schema - one whose allocation_snapshots still has a
 *     season column - and repairs it in place, idempotently:
 *       + collapses any duplicate wallet/network rows to one snapshot
 *       + swaps the (wallet_address, season, network) unique constraint for
 *         UNIQUE(wallet_address, network)
 *       + drops the legacy season column from both tables
 *       + rebuilds ledger PK(season, network) as PK(network) and reconciles
 *         total_allocated straight from the snapshots
 *   - No existing snapshot is ever dropped or recalculated during migration.
 *
 * The connection is a serverless-safe Pool (Neon serverless driver by default).
 * Connections are lazily created and reused for the lifetime of the warm
 * function instance; no connection is opened at construction time, so a Vercel
 * cold start only pays for a connection when a real query arrives.
 */

import { Pool as NeonPool } from '@neondatabase/serverless';
import {
  type AllocationRecord,
  type AllocationRepository,
  type CreateAllocationSnapshotInput,
  type CreateSnapshotOutcome,
} from './allocationRepository.js';

export const POSTGRES_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS allocation_snapshots (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    network TEXT NOT NULL,
    allocation BIGINT NOT NULL,
    transaction_count_at_snapshot BIGINT NOT NULL,
    nft_holder_at_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
    nft_count_at_snapshot BIGINT NOT NULL DEFAULT 0,
    activity_score DOUBLE PRECISION NOT NULL,
    nft_bonus BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_allocation_snapshots_wallet_network
      UNIQUE (wallet_address, network)
  )`,
  `CREATE TABLE IF NOT EXISTS allocation_pool_ledger (
    network TEXT NOT NULL,
    total_allocated BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (network)
  )`,
];

/**
 * Idempotent statements that bring a legacy "Season 01" schema forward to the
 * current season-free schema. Each statement is individually safe to re-run:
 *
 * - the dedupe collapses legacy multiple-per-wallet rows (one row per season)
 *   to a single snapshot, keeping the newest (MAX id);
 * - legacy DROP ... IF EXISTS / DROP COLUMN IF EXISTS statements are no-ops
 *   when the objects are already gone;
 * - the ADD CONSTRAINT / ADD PRIMARY KEY statements raise an "already exists"
 *   error when run twice; the runner treats that as success.
 *
 * Ordering is important: snapshots are deduplicated and the new unique
 * constraint is applied before the season column is dropped, and the ledger's
 * season column is dropped before the ledger is rebuilt from the snapshots.
 */
export const POSTGRES_MIGRATION_STATEMENTS: string[] = [
  // Keep exactly one snapshot per (wallet_address, network): MAX(id) wins so
  // the most recently persisted allocation is preserved.
  `DELETE FROM allocation_snapshots
    WHERE id IN (
      SELECT a.id
        FROM allocation_snapshots a
        JOIN allocation_snapshots b
          ON b.wallet_address = a.wallet_address
         AND b.network = a.network
         AND b.id > a.id
    )`,
  // Legacy Season-01 unique constraint and its supporting index.
  `ALTER TABLE allocation_snapshots
     DROP CONSTRAINT IF EXISTS uq_allocation_snapshots_wallet_season_network`,
  `DROP INDEX IF EXISTS idx_allocation_snapshots_season_network`,
  // Current one-snapshot-per-wallet/network guarantee.
  `ALTER TABLE allocation_snapshots
     ADD CONSTRAINT uq_allocation_snapshots_wallet_network
     UNIQUE (wallet_address, network)`,
  `ALTER TABLE allocation_snapshots DROP COLUMN IF EXISTS season`,
  // Legacy Season-01 ledger lock key.
  `ALTER TABLE allocation_pool_ledger
     DROP CONSTRAINT IF EXISTS allocation_pool_ledger_pkey`,
  `ALTER TABLE allocation_pool_ledger DROP COLUMN IF EXISTS season`,
  // Reconcile the ledger straight from the snapshots: one row per network.
  `DELETE FROM allocation_pool_ledger`,
  `INSERT INTO allocation_pool_ledger (network, total_allocated)
     SELECT network, COALESCE(SUM(allocation), 0)::BIGINT
       FROM allocation_snapshots
      GROUP BY network`,
  `ALTER TABLE allocation_pool_ledger
     ADD PRIMARY KEY (network)`,
];

/** Structural pool contract so tests can inject an in-memory Postgres. */
export interface PostgresRow {
  [column: string]: unknown;
}

export interface PostgresQueryResult {
  rows: PostgresRow[];
  rowCount: number | null;
}

export interface PostgresClient {
  query(text: string, params?: unknown[]): Promise<PostgresQueryResult>;
  release(): void;
}

export interface PostgresPool {
  query(text: string, params?: unknown[]): Promise<PostgresQueryResult>;
  connect(): Promise<PostgresClient>;
  end(): Promise<void>;
}

/** Wallet lookups are always normalized to lowercase before touching storage. */
function normalizeWallet(address: string): string {
  return address.trim().toLowerCase();
}

/** @neondatabase/serverless returns int8 as a string; pg-mem returns a Number. */
function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function toIsoDate(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && typeof (value as { toISOString?: unknown }).toISOString === 'function') {
    return (value as Date).toISOString();
  }
  return String(value);
}

function rowToRecord(row: PostgresRow): AllocationRecord {
  return {
    id: toNumber(row.id),
    walletAddress: String(row.wallet_address ?? ''),
    network: String(row.network ?? ''),
    allocation: toNumber(row.allocation),
    transactionCountAtSnapshot: toNumber(row.transaction_count_at_snapshot),
    nftHolderAtSnapshot: Boolean(row.nft_holder_at_snapshot),
    nftCountAtSnapshot: toNumber(row.nft_count_at_snapshot),
    activityScore: toNumber(row.activity_score),
    nftBonus: toNumber(row.nft_bonus),
    createdAt: toIsoDate(row.created_at),
  };
}

export function createNeonPostgresPool(databaseUrl: string): PostgresPool {
  return new NeonPool({ connectionString: databaseUrl }) as unknown as PostgresPool;
}

export class PostgresAllocationRepository implements AllocationRepository {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly pool: PostgresPool) {}

  /** Applies the idempotent schema. Safe to run repeatedly. */
  async initializeSchema(): Promise<void> {
    await this.ensureSchema();
  }

  private ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.runSchemaIfNeeded().catch((error) => {
        // A failed attempt must not poison the warm instance for its lifetime.
        this.schemaReady = null;
        throw error;
      });
    }
    return this.schemaReady;
  }

  /**
   * Ensures both tables exist and that any legacy "Season 01" schema has been
   * repaired to the current season-free schema.
   *
   * Repairs are performed only when the legacy season column is detected, so
   * an up-to-date database is untouched on every cold start. For a legacy
   * database the migration is fully applied and is safe to re-run.
   */
  private async runSchemaIfNeeded(): Promise<void> {
    const result = await this.pool.query(
      `SELECT COUNT(*)::BIGINT AS existing
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('allocation_snapshots', 'allocation_pool_ledger')`,
    );
    if (toNumber(result.rows[0]?.existing) < 2) {
      for (const statement of POSTGRES_SCHEMA_STATEMENTS) {
        await this.pool.query(statement);
      }
    }

    // Detect the legacy "Season 01" schema: allocation_snapshots still has a
    // season column. A freshly created or already-migrated schema has no such
    // column (SELECT with LIMIT 0 raises 42703 / "does not exist"), which is
    // treated as up-to-date.
    let hasLegacySeason = false;
    try {
      await this.pool.query('SELECT season FROM allocation_snapshots LIMIT 0');
      hasLegacySeason = true;
    } catch (error) {
      if (!isUndefinedColumnError(error)) throw error;
    }

    if (hasLegacySeason) {
      for (const statement of POSTGRES_MIGRATION_STATEMENTS) {
        try {
          await this.pool.query(statement);
        } catch (error) {
          // Re-running an ADD CONSTRAINT / ADD PRIMARY KEY that already
          // exists is expected during an idempotent migration; ignore it.
          if (!isAlreadyExistsError(error)) throw error;
        }
      }
    }
  }

  async findByWallet(
    walletAddress: string,
    network: string,
  ): Promise<AllocationRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT id, wallet_address, network, allocation,
              transaction_count_at_snapshot, nft_holder_at_snapshot,
              nft_count_at_snapshot, activity_score, nft_bonus, created_at
         FROM allocation_snapshots
        WHERE wallet_address = $1 AND network = $2`,
      [normalizeWallet(walletAddress), network],
    );
    return result.rows.length > 0 ? rowToRecord(result.rows[0]) : null;
  }

  async createAllocationSnapshot(
    input: CreateAllocationSnapshotInput,
    poolBudget: number,
  ): Promise<CreateSnapshotOutcome> {
    await this.ensureSchema();

    const walletAddress = normalizeWallet(input.walletAddress);

    // Fast path: an already-finalized snapshot is returned untouched. Nothing
    // is recalculated or written.
    const existing = await this.findByWallet(walletAddress, input.network);
    if (existing) {
      return { status: 'existing', record: existing };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Make sure the budget lock row exists, seeding it from any rows that
      // were already committed (keeps the ledger self-healing on migration).
      await client.query(
        `INSERT INTO allocation_pool_ledger (network, total_allocated)
         SELECT $1, COALESCE(SUM(allocation), 0)::BIGINT
           FROM allocation_snapshots
          WHERE network = $1
         ON CONFLICT (network) DO NOTHING`,
        [input.network],
      );

      // Serialize remaining-budget calculation across concurrent requests for
      // different wallets, so the pool cap can never be exceeded.
      const lockResult = await client.query(
        `SELECT total_allocated::BIGINT AS total
           FROM allocation_pool_ledger
          WHERE network = $1
            FOR UPDATE`,
        [input.network],
      );
      const alreadyAllocated = toNumber(lockResult.rows[0]?.total);
      const remaining = Math.max(0, Math.floor(poolBudget) - alreadyAllocated);

      let allocation = Math.floor(input.allocation);
      if (remaining < allocation) {
        if (remaining < 1) {
          await client.query('ROLLBACK');
          return { status: 'pool_exhausted' };
        }
        allocation = remaining;
      }

      const insertResult = await client.query(
        `INSERT INTO allocation_snapshots (
           wallet_address, network, allocation,
           transaction_count_at_snapshot, nft_holder_at_snapshot,
           nft_count_at_snapshot, activity_score, nft_bonus, created_at
         ) VALUES ($1, $2, $3::BIGINT, $4::BIGINT, $5::BOOLEAN, $6::BIGINT,
                   $7::DOUBLE PRECISION, $8::BIGINT, $9::TIMESTAMPTZ)`,
        [
          walletAddress,
          input.network,
          allocation,
          input.transactionCountAtSnapshot,
          input.nftHolderAtSnapshot,
          input.nftCountAtSnapshot,
          input.activityScore,
          input.nftBonus,
          new Date().toISOString(),
        ],
      );

      if (insertResult.rowCount === 1) {
        await client.query(
          `UPDATE allocation_pool_ledger
              SET total_allocated = $1::BIGINT
            WHERE network = $2`,
          [alreadyAllocated + allocation, input.network],
        );
        await client.query('COMMIT');

        const saved = await this.findByWallet(walletAddress, input.network);
        if (!saved) {
          throw new Error('Inserted allocation snapshot could not be read back.');
        }
        return { status: 'created', record: saved };
      }

      // rowCount === 0 should not happen for a VALUES insert; treat as done.
      await client.query('COMMIT');
      const winner = await this.findByWallet(walletAddress, input.network);
      if (winner) return { status: 'existing', record: winner };
      return { status: 'pool_exhausted' };
    } catch (error) {
      // SQLSTATE 23505 = unique_violation on (wallet_address, network):
      // a simultaneous request finalized this wallet first. Return its snapshot.
      if (isUniqueViolation(error)) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // transaction may already be aborted
        }
        const winner = await this.findByWallet(walletAddress, input.network);
        if (winner) return { status: 'existing', record: winner };
      }
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore secondary rollback failures; propagate the original error
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async totalAllocated(network: string): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(allocation), 0)::BIGINT AS total
         FROM allocation_snapshots
        WHERE network = $1`,
      [network],
    );
    return result.rows.length > 0 ? toNumber(result.rows[0].total) : 0;
  }

  async countAllocations(network: string): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT COUNT(*)::BIGINT AS count
         FROM allocation_snapshots
        WHERE network = $1`,
      [network],
    );
    return result.rows.length > 0 ? toNumber(result.rows[0].count) : 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { code?: unknown }).code === '23505' ||
      String((error as { message?: unknown }).message ?? '').includes('duplic'))
  );
}

/**
 * True when a query failed only because a referenced column does not exist
 * (SQLSTATE 42703). Used to detect the absence of the legacy season column.
 */
function isUndefinedColumnError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.toUpperCase() === '42703') return true;
  return /column ["'][^"']+["'].*does not exist/i.test(
    String((error as { message?: unknown }).message ?? ''),
  );
}

/**
 * True when a DDL statement failed only because the object it tried to add
 * already exists (a duplicate constraint or an existing primary key). Such
 * errors are expected on an idempotent re-run and are treated as success.
 */
function isAlreadyExistsError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (
    typeof code === 'string' &&
    ['42P07', '42710', '42P16'].includes(code.toUpperCase())
  ) {
    return true;
  }
  return /already exists|already has a primary key|multiple primary keys/i.test(
    String((error as { message?: unknown }).message ?? ''),
  );
}
