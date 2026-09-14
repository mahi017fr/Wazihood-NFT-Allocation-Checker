#!/usr/bin/env node
/**
 * Idempotent migration runner for the selected ALLOCATION_STORE.
 *
 * Usage:
 *   ALLOCATION_STORE=postgres  DATABASE_URL=... npx tsx server/persistence/migrate.ts
 *   ALLOCATION_STORE=sqlite    npx tsx server/persistence/migrate.ts
 *
 * Safe to run repeatedly: CREATE TABLE IF NOT EXISTS; a legacy "Season 01"
 * schema (with a season column) is automatically migrated in place to the
 * season-free schema - the season column and its constraints are removed, the
 * unique constraint becomes (wallet_address, network), and the pool ledger is
 * rebuilt with PRIMARY KEY (network). Existing allocation snapshots are never
 * dropped or recalculated during migration.
 */

import { createAllocationRepository } from './index.js';
import { PostgresAllocationRepository } from './postgresAllocationRepository.js';
import { config } from '../config.js';

async function main(): Promise<void> {
  const store = config.persistence.store;
  const repo = createAllocationRepository();

  if (repo instanceof PostgresAllocationRepository) {
    await repo.initializeSchema();
    const host = config.persistence.databaseUrl.includes('@')
      ? config.persistence.databaseUrl.split('@')[1]?.split('?')[0] ?? '<host>'
      : '<host>';
    console.log(
      `[migrate] PostgreSQL schema ready on "${host}" ` +
        `(store=postgres, table=allocation_snapshots, ledger=allocation_pool_ledger)`,
    );
    console.log('[migrate] legacy "Season 01" schema is upgraded automatically when detected');
  } else {
    // SqliteAllocationRepository applies its own schema in the constructor.
    console.log(`[migrate] SQLite schema ready on ${config.persistence.databasePath} (store=sqlite)`);
  }

  await repo.close();
  console.log('[migrate] done');
}

main().catch((error) => {
  console.error('[migrate] FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
