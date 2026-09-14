#!/usr/bin/env node
/**
 * Idempotent migration runner for the selected ALLOCATION_STORE.
 *
 * Usage:
 *   ALLOCATION_STORE=postgres  DATABASE_URL=... npx tsx server/persistence/migrate.ts
 *   ALLOCATION_STORE=sqlite    npx tsx server/persistence/migrate.ts
 *
 * Safe to run repeatedly; uses CREATE TABLE IF NOT EXISTS.
 * For the Postgres store it will also create/update the pool ledger table.
 * No production data is ever dropped or altered.
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
