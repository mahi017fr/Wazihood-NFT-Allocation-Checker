import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  type AllocationRecord,
  type AllocationRepository,
  type AllocationStats,
  type ApplyNftUpgradeInput,
  type ApplyNftUpgradeOutcome,
  type CreateAllocationSnapshotInput,
  type CreateSnapshotOutcome,
  type ListAllocationsOptions,
  type ListAllocationsResult,
} from './allocationRepository.js';

interface AllocationRow {
  id: number;
  wallet_address: string;
  network: string;
  allocation: number;
  transaction_count_at_snapshot: number;
  nft_holder_at_snapshot: number;
  nft_count_at_snapshot: number;
  activity_score: number;
  base_allocation: number;
  nft_bonus: number;
  nft_bonus_applied: number;
  nft_upgrade_at: string | null;
  created_at: string;
  updated_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS allocation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  network TEXT NOT NULL,
  allocation INTEGER NOT NULL,
  transaction_count_at_snapshot INTEGER NOT NULL,
  nft_holder_at_snapshot INTEGER NOT NULL DEFAULT 0,
  nft_count_at_snapshot INTEGER NOT NULL DEFAULT 0,
  activity_score REAL NOT NULL,
  base_allocation INTEGER NOT NULL DEFAULT 0,
  nft_bonus INTEGER NOT NULL DEFAULT 0,
  nft_bonus_applied INTEGER NOT NULL DEFAULT 0,
  nft_upgrade_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (wallet_address, network)
);
`;

function rowToRecord(row: AllocationRow): AllocationRecord {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    network: row.network,
    allocation: row.allocation,
    transactionCountAtSnapshot: row.transaction_count_at_snapshot,
    nftHolderAtSnapshot: row.nft_holder_at_snapshot === 1,
    nftCountAtSnapshot: row.nft_count_at_snapshot,
    activityScore: row.activity_score,
    baseAllocation: row.base_allocation,
    nftBonus: row.nft_bonus,
    nftBonusApplied: row.nft_bonus_applied === 1,
    nftUpgradeAt: row.nft_upgrade_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Wallet lookups are always normalized to lowercase before touching storage. */
function normalizeWallet(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * SQLite-backed repository built on Node's built-in `node:sqlite` (no native
 * dependency), primarily for LOCAL DEVELOPMENT. The synchronous single-connection
 * model serializes access, and the UNIQUE(wallet_address, network)
 * constraint plus an atomic get-or-create transaction guarantee a wallet can
 * never receive two allocation snapshots, even under simultaneous requests.
 *
 * For production (Vercel serverless / distributed runtime) use the PostgreSQL
 * repository selected via ALLOCATION_STORE=postgres. This implementation only
 * provides persistent, restart-safe storage for a single always-on instance.
 *
 * The public API is async to match the shared AllocationRepository interface;
 * the internal database work stays synchronous so each get-or-create
 * transaction (BEGIN IMMEDIATE ... COMMIT) runs atomically without yielding.
 */
export class SqliteAllocationRepository implements AllocationRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ':memory:') {
      const dir = path.dirname(databasePath);
      if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(databasePath);
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(SCHEMA);
    this.ensureUpgradeColumns();
  }

  /**
   * Brings an existing local database forward with the NFT-upgrade fields.
   * SQLite has no `ADD COLUMN IF NOT EXISTS`, so column presence is checked via
   * PRAGMA table_info first. Existing finalized rows are preserved untouched;
   * their base_allocation is backfilled from the recorded split and rows that
   * already received an NFT bonus are marked nft_bonus_applied (so the +25,000
   * upgrade can never be granted twice).
   */
  private ensureUpgradeColumns(): void {
    const columns = new Set(
      (this.db.prepare('PRAGMA table_info(allocation_records)').all() as Array<{ name: string }>).map(
        (col) => col.name,
      ),
    );

    if (!columns.has('base_allocation')) {
      this.db.exec('ALTER TABLE allocation_records ADD COLUMN base_allocation INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.has('nft_bonus_applied')) {
      this.db.exec('ALTER TABLE allocation_records ADD COLUMN nft_bonus_applied INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.has('nft_upgrade_at')) {
      this.db.exec('ALTER TABLE allocation_records ADD COLUMN nft_upgrade_at TEXT');
    }
    if (!columns.has('updated_at')) {
      // SQLite forbids non-constant defaults in ADD COLUMN, so the column is
      // added with a constant default and existing rows are backfilled from
      // their creation timestamp.
      this.db.exec(`ALTER TABLE allocation_records ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`);
      this.db.exec(`UPDATE allocation_records SET updated_at = created_at WHERE updated_at = ''`);
    }

    this.db.exec(
      `UPDATE allocation_records
          SET base_allocation = allocation - nft_bonus
        WHERE base_allocation = 0 AND allocation >= nft_bonus`,
    );
    this.db.exec(
      `UPDATE allocation_records
          SET nft_bonus_applied = 1
        WHERE nft_bonus > 0 AND nft_bonus_applied = 0`,
    );
  }

  private findByWalletSync(
    walletAddress: string,
    network: string,
  ): AllocationRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM allocation_records WHERE wallet_address = ? AND network = ?',
      )
      .get(normalizeWallet(walletAddress), network) as unknown as AllocationRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  private totalAllocatedSync(network: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(SUM(allocation), 0) AS total FROM allocation_records WHERE network = ?',
      )
      .get(network) as { total: number };
    return Number(row.total ?? 0);
  }

  async findByWallet(
    walletAddress: string,
    network: string,
  ): Promise<AllocationRecord | null> {
    return this.findByWalletSync(walletAddress, network);
  }

  async createAllocationSnapshot(
    input: CreateAllocationSnapshotInput,
    poolBudget: number,
  ): Promise<CreateSnapshotOutcome> {
    input = { ...input, walletAddress: normalizeWallet(input.walletAddress) };
    // The whole get-or-create body runs synchronously with no internal awaits,
    // so the BEGIN IMMEDIATE/COMMIT section below is never interleaved by
    // another request despite the async method signature.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.findByWalletSync(input.walletAddress, input.network);
      if (existing) {
        this.db.exec('COMMIT');
        return { status: 'existing', record: existing };
      }

      const alreadyAllocated = this.totalAllocatedSync(input.network);
      const remaining = Math.max(0, poolBudget - alreadyAllocated);

      if (remaining < input.allocation) {
        if (remaining < 1) {
          this.db.exec('ROLLBACK');
          return { status: 'pool_exhausted' };
        }
        input = { ...input, allocation: Math.floor(remaining) };
      }

      const insert = this.db.prepare(
        `INSERT INTO allocation_records (
           wallet_address, network, allocation,
           transaction_count_at_snapshot, nft_holder_at_snapshot,
           nft_count_at_snapshot, activity_score, base_allocation, nft_bonus,
           nft_bonus_applied, nft_upgrade_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      );
      const createdAt = new Date().toISOString();
      insert.run(
        input.walletAddress,
        input.network,
        input.allocation,
        input.transactionCountAtSnapshot,
        input.nftHolderAtSnapshot ? 1 : 0,
        input.nftCountAtSnapshot,
        input.activityScore,
        input.baseAllocation,
        input.nftBonus,
        input.nftBonus > 0 ? 1 : 0,
        createdAt,
        createdAt,
      );
      this.db.exec('COMMIT');

      const saved = this.findByWalletSync(input.walletAddress, input.network);
      if (!saved) {
        throw new Error('Inserted allocation snapshot could not be read back.');
      }
      return { status: 'created', record: saved };
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback failure; propagate the original error
      }
      throw error;
    }
  }

  async totalAllocated(network: string): Promise<number> {
    return this.totalAllocatedSync(network);
  }

  async countAllocations(network: string): Promise<number> {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS count FROM allocation_records WHERE network = ?',
      )
      .get(network) as { count: number };
    return Number(row.count ?? 0);
  }

  async applyNftUpgrade(input: ApplyNftUpgradeInput): Promise<ApplyNftUpgradeOutcome> {
    const walletAddress = normalizeWallet(input.walletAddress);
    const bonusAllocation = Math.max(0, Math.floor(input.bonusAllocation));
    const maxAllocation = Math.max(0, Math.floor(input.maxAllocation));

    // node:sqlite is synchronous and single-connection, so the get-check-update
    // below runs atomically without interleaving, exactly like the create path.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.findByWalletSync(walletAddress, input.network);
      if (!existing) {
        this.db.exec('ROLLBACK');
        return { status: 'not_found' };
      }
      if (existing.nftBonusApplied) {
        this.db.exec('ROLLBACK');
        return { status: 'already_applied', record: existing };
      }

      const upgradedAllocation = Math.min(maxAllocation, existing.allocation + bonusAllocation);
      const delta = upgradedAllocation - existing.allocation;
      const upgradedAt = new Date().toISOString();

      this.db
        .prepare(
          `UPDATE allocation_records
              SET allocation = ?,
                  nft_holder_at_snapshot = 1,
                  nft_count_at_snapshot = ?,
                  nft_bonus = ?,
                  nft_bonus_applied = 1,
                  nft_upgrade_at = ?,
                  updated_at = ?
            WHERE wallet_address = ? AND network = ?`,
        )
        .run(
          upgradedAllocation,
          input.nftCount,
          bonusAllocation,
          upgradedAt,
          upgradedAt,
          walletAddress,
          input.network,
        );
      this.db.exec('COMMIT');

      const saved = this.findByWalletSync(walletAddress, input.network);
      if (!saved) {
        throw new Error('Upgraded allocation snapshot could not be read back.');
      }
      return { status: 'upgraded', record: saved };
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback failure; propagate the original error
      }
      throw error;
    }
  }

  private listAllocationsSync(
    network: string,
    options: ListAllocationsOptions,
  ): ListAllocationsResult {
    const limit = Math.max(1, Math.min(200, Math.floor(options.limit)));
    const offset = Math.max(0, Math.floor(options.offset));
    const totalRow = this.db
      .prepare('SELECT COUNT(*) AS total FROM allocation_records WHERE network = ?')
      .get(network) as { total: number };
    const rows = this.db
      .prepare(
        `SELECT * FROM allocation_records
          WHERE network = ?
          ORDER BY updated_at DESC, id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(network, limit, offset) as unknown as AllocationRow[];
    return {
      records: rows.map(rowToRecord),
      total: Number(totalRow.total ?? 0),
    };
  }

  private allocationStatsSync(network: string): AllocationStats {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total_wallets,
                COALESCE(SUM(allocation), 0) AS total_allocated,
                COALESCE(SUM(nft_bonus), 0) AS total_nft_bonus,
                COALESCE(SUM(CASE WHEN nft_upgrade_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS nft_upgraded_wallets
           FROM allocation_records
          WHERE network = ?`,
      )
      .get(network) as {
      total_wallets: number;
      total_allocated: number;
      total_nft_bonus: number;
      nft_upgraded_wallets: number;
    };
    const total = Number(row.total_wallets ?? 0);
    return {
      totalWallets: total,
      eligibleWallets: total,
      totalAllocated: Number(row.total_allocated ?? 0),
      totalNftBonus: Number(row.total_nft_bonus ?? 0),
      nftUpgradedWallets: Number(row.nft_upgraded_wallets ?? 0),
    };
  }

  async listAllocations(
    network: string,
    options: ListAllocationsOptions,
  ): Promise<ListAllocationsResult> {
    return this.listAllocationsSync(network, options);
  }

  async allocationStats(network: string): Promise<AllocationStats> {
    return this.allocationStatsSync(network);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
