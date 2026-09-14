import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  type AllocationRecord,
  type AllocationRepository,
  type CreateAllocationSnapshotInput,
  type CreateSnapshotOutcome,
} from './allocationRepository';

interface AllocationRow {
  id: number;
  wallet_address: string;
  season: string;
  network: string;
  allocation: number;
  transaction_count_at_snapshot: number;
  nft_holder_at_snapshot: number;
  nft_count_at_snapshot: number;
  activity_score: number;
  nft_bonus: number;
  created_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS allocation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  season TEXT NOT NULL,
  network TEXT NOT NULL,
  allocation INTEGER NOT NULL,
  transaction_count_at_snapshot INTEGER NOT NULL,
  nft_holder_at_snapshot INTEGER NOT NULL DEFAULT 0,
  nft_count_at_snapshot INTEGER NOT NULL DEFAULT 0,
  activity_score REAL NOT NULL,
  nft_bonus INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (wallet_address, season, network)
);
CREATE INDEX IF NOT EXISTS idx_allocation_season_network
  ON allocation_records (season, network);
`;

function rowToRecord(row: AllocationRow): AllocationRecord {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    season: row.season,
    network: row.network,
    allocation: row.allocation,
    transactionCountAtSnapshot: row.transaction_count_at_snapshot,
    nftHolderAtSnapshot: row.nft_holder_at_snapshot === 1,
    nftCountAtSnapshot: row.nft_count_at_snapshot,
    activityScore: row.activity_score,
    nftBonus: row.nft_bonus,
    createdAt: row.created_at,
  };
}

/** Wallet lookups are always normalized to lowercase before touching storage. */
function normalizeWallet(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * SQLite-backed repository built on Node's built-in `node:sqlite` (no native
 * dependency), primarily for LOCAL DEVELOPMENT. The synchronous single-connection
 * model serializes access, and the UNIQUE(wallet_address, season, network)
 * constraint plus an atomic get-or-create transaction guarantee a wallet can
 * never receive two Season 01 snapshots, even under simultaneous requests.
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
    this.db.exec(SCHEMA);
  }

  private findByWalletSync(
    walletAddress: string,
    season: string,
    network: string,
  ): AllocationRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM allocation_records WHERE wallet_address = ? AND season = ? AND network = ?',
      )
      .get(normalizeWallet(walletAddress), season, network) as unknown as AllocationRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  private totalAllocatedSync(season: string, network: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(SUM(allocation), 0) AS total FROM allocation_records WHERE season = ? AND network = ?',
      )
      .get(season, network) as { total: number };
    return Number(row.total ?? 0);
  }

  async findByWallet(
    walletAddress: string,
    season: string,
    network: string,
  ): Promise<AllocationRecord | null> {
    return this.findByWalletSync(walletAddress, season, network);
  }

  async createAllocationSnapshot(
    input: CreateAllocationSnapshotInput,
    season1Pool: number,
  ): Promise<CreateSnapshotOutcome> {
    input = { ...input, walletAddress: normalizeWallet(input.walletAddress) };
    // The whole get-or-create body runs synchronously with no internal awaits,
    // so the BEGIN IMMEDIATE/COMMIT section below is never interleaved by
    // another request despite the async method signature.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.findByWalletSync(input.walletAddress, input.season, input.network);
      if (existing) {
        this.db.exec('COMMIT');
        return { status: 'existing', record: existing };
      }

      const alreadyAllocated = this.totalAllocatedSync(input.season, input.network);
      const remaining = Math.max(0, season1Pool - alreadyAllocated);

      if (remaining < input.allocation) {
        if (remaining < 1) {
          this.db.exec('ROLLBACK');
          return { status: 'pool_exhausted' };
        }
        input = { ...input, allocation: Math.floor(remaining) };
      }

      const insert = this.db.prepare(
        `INSERT INTO allocation_records (
           wallet_address, season, network, allocation,
           transaction_count_at_snapshot, nft_holder_at_snapshot,
           nft_count_at_snapshot, activity_score, nft_bonus, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const createdAt = new Date().toISOString();
      insert.run(
        input.walletAddress,
        input.season,
        input.network,
        input.allocation,
        input.transactionCountAtSnapshot,
        input.nftHolderAtSnapshot ? 1 : 0,
        input.nftCountAtSnapshot,
        input.activityScore,
        input.nftBonus,
        createdAt,
      );
      this.db.exec('COMMIT');

      const saved = this.findByWalletSync(input.walletAddress, input.season, input.network);
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

  async totalAllocated(season: string, network: string): Promise<number> {
    return this.totalAllocatedSync(season, network);
  }

  async countAllocations(season: string, network: string): Promise<number> {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS count FROM allocation_records WHERE season = ? AND network = ?',
      )
      .get(season, network) as { count: number };
    return Number(row.count ?? 0);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}