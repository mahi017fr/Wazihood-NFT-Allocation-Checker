/**
 * Production PostgreSQL-backed allocation repository, suitable for Vercel
 * serverless functions.
 *
 * Storage:
 *   - allocation_snapshots  the wallet allocation snapshots (one row per
 *     wallet/season/network, never two)
 *   - allocation_pool_ledger a single-row-per-season lock that serializes pool
 *     budget consumption across concurrent serverless instances
 *
 * Concurrency:
 *   - Same wallet, simultaneous requests: the UNIQUE(wallet_address, season,
 *     network) constraint + insert-followed-by-read means the second request
 *     hits a unique-violation (SQLSTATE 23505), rolls back and returns the
 *     winner's row. Both callers receive the identical allocation.
 *   - Pool budget, simultaneous distinct wallets: a transaction takes
 *     SELECT ... FOR UPDATE on the season's ledger row, which serializes
 *     remaining-budget calculation so the pool cap is never exceeded.
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
} from './allocationRepository';

export const POSTGRES_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS allocation_snapshots (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    season TEXT NOT NULL,
    network TEXT NOT NULL,
    allocation BIGINT NOT NULL,
    transaction_count_at_snapshot BIGINT NOT NULL,
    nft_holder_at_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
    nft_count_at_snapshot BIGINT NOT NULL DEFAULT 0,
    activity_score DOUBLE PRECISION NOT NULL,
    nft_bonus BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_allocation_snapshots_wallet_season_network
      UNIQUE (wallet_address, season, network)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_allocation_snapshots_season_network
    ON allocation_snapshots (season, network)`,
  `CREATE TABLE IF NOT EXISTS allocation_pool_ledger (
    season TEXT NOT NULL,
    network TEXT NOT NULL,
    total_allocated BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (season, network)
  )`,
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
    season: String(row.season ?? ''),
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
   * Applies the idempotent DDL only when the tables do not already exist.
   * Besides being idempotent, this spares each serverless cold start from
   * re-issuing CREATE TABLE statements against the shared production database.
   */
  private async runSchemaIfNeeded(): Promise<void> {
    const result = await this.pool.query(
      `SELECT COUNT(*)::BIGINT AS existing
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('allocation_snapshots', 'allocation_pool_ledger')`,
    );
    if (toNumber(result.rows[0]?.existing) === 2) return;
    for (const statement of POSTGRES_SCHEMA_STATEMENTS) {
      await this.pool.query(statement);
    }
  }

  async findByWallet(
    walletAddress: string,
    season: string,
    network: string,
  ): Promise<AllocationRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT id, wallet_address, season, network, allocation,
              transaction_count_at_snapshot, nft_holder_at_snapshot,
              nft_count_at_snapshot, activity_score, nft_bonus, created_at
         FROM allocation_snapshots
        WHERE wallet_address = $1 AND season = $2 AND network = $3`,
      [normalizeWallet(walletAddress), season, network],
    );
    return result.rows.length > 0 ? rowToRecord(result.rows[0]) : null;
  }

  async createAllocationSnapshot(
    input: CreateAllocationSnapshotInput,
    season1Pool: number,
  ): Promise<CreateSnapshotOutcome> {
    await this.ensureSchema();

    const walletAddress = normalizeWallet(input.walletAddress);

    // Fast path: an already-finalized snapshot is returned untouched. Nothing
    // is recalculated or written.
    const existing = await this.findByWallet(walletAddress, input.season, input.network);
    if (existing) {
      return { status: 'existing', record: existing };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Make sure the budget lock row exists, seeding it from any rows that
      // were already committed (keeps the ledger self-healing on migration).
      await client.query(
        `INSERT INTO allocation_pool_ledger (season, network, total_allocated)
         SELECT $1, $2, COALESCE(SUM(allocation), 0)::BIGINT
           FROM allocation_snapshots
          WHERE season = $1 AND network = $2
         ON CONFLICT (season, network) DO NOTHING`,
        [input.season, input.network],
      );

      // Serialize remaining-budget calculation across concurrent requests for
      // different wallets, so the pool cap can never be exceeded.
      const lockResult = await client.query(
        `SELECT total_allocated::BIGINT AS total
           FROM allocation_pool_ledger
          WHERE season = $1 AND network = $2
            FOR UPDATE`,
        [input.season, input.network],
      );
      const alreadyAllocated = toNumber(lockResult.rows[0]?.total);
      const remaining = Math.max(0, Math.floor(season1Pool) - alreadyAllocated);

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
           wallet_address, season, network, allocation,
           transaction_count_at_snapshot, nft_holder_at_snapshot,
           nft_count_at_snapshot, activity_score, nft_bonus, created_at
         ) VALUES ($1, $2, $3, $4::BIGINT, $5::BIGINT, $6::BOOLEAN, $7::BIGINT,
                   $8::DOUBLE PRECISION, $9::BIGINT, $10::TIMESTAMPTZ)`,
        [
          walletAddress,
          input.season,
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
            WHERE season = $2 AND network = $3`,
          [alreadyAllocated + allocation, input.season, input.network],
        );
        await client.query('COMMIT');

        const saved = await this.findByWallet(walletAddress, input.season, input.network);
        if (!saved) {
          throw new Error('Inserted allocation snapshot could not be read back.');
        }
        return { status: 'created', record: saved };
      }

      // rowCount === 0 should not happen for a VALUES insert; treat as done.
      await client.query('COMMIT');
      const winner = await this.findByWallet(walletAddress, input.season, input.network);
      if (winner) return { status: 'existing', record: winner };
      return { status: 'pool_exhausted' };
    } catch (error) {
      // SQLSTATE 23505 = unique_violation on (wallet_address, season, network):
      // a simultaneous request finalized this wallet first. Return its snapshot.
      if (isUniqueViolation(error)) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // transaction may already be aborted
        }
        const winner = await this.findByWallet(walletAddress, input.season, input.network);
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

  async totalAllocated(season: string, network: string): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(allocation), 0)::BIGINT AS total
         FROM allocation_snapshots
        WHERE season = $1 AND network = $2`,
      [season, network],
    );
    return result.rows.length > 0 ? toNumber(result.rows[0].total) : 0;
  }

  async countAllocations(season: string, network: string): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT COUNT(*)::BIGINT AS count
         FROM allocation_snapshots
        WHERE season = $1 AND network = $2`,
      [season, network],
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