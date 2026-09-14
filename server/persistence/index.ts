import { config } from '../config.js';
import { PostgresAllocationRepository, createNeonPostgresPool } from './postgresAllocationRepository.js';
import type { AllocationRepository } from './allocationRepository.js';

// node:sqlite only ships with Node >= 22.5. It is loaded lazily (and guarded)
// so a serverless runtime (e.g. Vercel) without node:sqlite can still run the
// production postgres store without crashing at import time.
let sqliteRepositoryCtor: typeof import('./sqliteAllocationRepository.js').SqliteAllocationRepository | null = null;
try {
  sqliteRepositoryCtor = (await import('./sqliteAllocationRepository.js')).SqliteAllocationRepository;
} catch {
  sqliteRepositoryCtor = null;
}

export interface AllocationRepositoryOptions {
  /** Hosted PostgreSQL connection string (required for ALLOCATION_STORE=postgres). */
  databaseUrl?: string;
  /** SQLite file path (only used by ALLOCATION_STORE=sqlite). */
  databasePath?: string;
}

/**
 * Builds the configured persistent allocation repository.
 *
 *   ALLOCATION_STORE=postgres (production / Vercel):
 *     hosted PostgreSQL (Neon) with a serverless-safe connection pool, atomic
 *     INSERT + unique-constraint get-or-create, and distributed pool budgeting.
 *     Requires DATABASE_URL; a missing value raises a clear configuration error.
 *
 *   ALLOCATION_STORE=sqlite (local development):
 *     on-disk SQLite via Node's built-in node:sqlite; restart-safe single
 *     instance, ideal for local development when no PostgreSQL is available.
 */
export function createAllocationRepository(
  store = config.persistence.store,
  options: AllocationRepositoryOptions = {},
): AllocationRepository {
  const resolvedStore = store.trim().toLowerCase();
  if (resolvedStore === 'postgres') {
    const databaseUrl = (options.databaseUrl ?? config.persistence.databaseUrl).trim();
    if (!databaseUrl) {
      throw new Error(
        'ALLOCATION_STORE=postgres requires DATABASE_URL. Create a hosted ' +
          'PostgreSQL database (e.g. Neon) and set DATABASE_URL in the server ' +
          'environment before starting.',
      );
    }
    return new PostgresAllocationRepository(createNeonPostgresPool(databaseUrl));
  }
  if (resolvedStore === 'sqlite') {
    if (!sqliteRepositoryCtor) {
      throw new Error(
        "ALLOCATION_STORE=sqlite requires Node's built-in node:sqlite module " +
          '(Node >= 22.5), which this runtime does not provide. Use ' +
          'ALLOCATION_STORE=postgres for production.',
      );
    }
    return new sqliteRepositoryCtor(options.databasePath ?? config.persistence.databasePath);
  }
  throw new Error(`Unsupported ALLOCATION_STORE "${resolvedStore}". Supported: sqlite, postgres.`);
}

export function getAllocationRepository(): AllocationRepository {
  if (!sharedRepository) {
    sharedRepository = createAllocationRepository();
  }
  return sharedRepository;
}

let sharedRepository: AllocationRepository | null = null;

export function resetSharedRepositoryForTesting(): void {
  if (sharedRepository) {
    const repo = sharedRepository;
    sharedRepository = null;
    void repo.close().catch(() => {
      // ignore close failures during test teardown
    });
  }
}