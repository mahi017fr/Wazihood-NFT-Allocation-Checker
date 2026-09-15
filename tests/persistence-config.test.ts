import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// These MUST be set before any server module import so `dotenv/config` (which
// never overrides an already-set env var) keeps them. This file runs in its own
// process thanks to `tsx --test`.
process.env.ALLOCATION_STORE = 'postgres';
process.env.DATABASE_URL =
  'postgresql://super-secret-user:super-secret-pass@db.example.internal/wazihood?sslmode=require';
process.env.ALCHEMY_API_KEY = 'alchemy-top-secret-key';

const { createAllocationRepository } = await import('../server/persistence/index');
const { PostgresAllocationRepository } = await import('../server/persistence/postgresAllocationRepository');
const { SqliteAllocationRepository } = await import('../server/persistence/sqliteAllocationRepository');
const { buildApp } = await import('../server/app');
const { ALLOCATION_NETWORK } = await import('../server/persistence/allocationRepository');

const WALLET = '0x71c44f3a9b3f6b4e90b04af5796e25bb24f88f29';

test('9: production configuration (ALLOCATION_STORE=postgres) selects the postgres repository', () => {
  const repo = createAllocationRepository();
  assert.ok(
    repo instanceof PostgresAllocationRepository,
    'ALLOCATION_STORE=postgres must produce a PostgresAllocationRepository',
  );
  // Serverless-safe: constructing the repository must NOT open a connection.
  void repo;
});

test('10: missing DATABASE_URL produces a clear configuration error', () => {
  assert.throws(
    () => createAllocationRepository('postgres', { databaseUrl: '' }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('ALLOCATION_STORE=postgres') &&
      error.message.includes('DATABASE_URL'),
  );
});

test('unsupported ALLOCATION_STORE produces a clear configuration error', () => {
  assert.throws(
    () => createAllocationRepository('mysql'),
    (error: unknown) => error instanceof Error && error.message.includes('Unsupported ALLOCATION_STORE'),
  );
});

test('11: database and provider secrets never reach API responses', async () => {
  const app = buildApp({
    allocationCheckService: {
      check: async () => ({ walletAddress: WALLET, eligible: true }),
    },
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    for (const apiPath of ['/api/health', '/api/config']) {
      const response = await fetch(`http://127.0.0.1:${port}${apiPath}`);
      const text = await response.text();
      assert.ok(response.ok, `${apiPath} should succeed`);
      assert.ok(!text.includes('super-secret'), `${apiPath} leaked the DATABASE_URL password`);
      assert.ok(!text.includes('db.example.internal'), `${apiPath} leaked the DATABASE_URL host`);
      assert.ok(!text.includes('alchemy-top-secret-key'), `${apiPath} leaked the Alchemy API key`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('12: sqlite local store still works when selected', async () => {
  const repo = createAllocationRepository('sqlite', { databasePath: ':memory:' });
  assert.ok(repo instanceof SqliteAllocationRepository, 'sqlite store must remain available');
  const outcome = await repo.createAllocationSnapshot(
    {
      walletAddress: WALLET,
      network: ALLOCATION_NETWORK,
      allocation: 18_500,
      transactionCountAtSnapshot: 42,
      nftHolderAtSnapshot: true,
      nftCountAtSnapshot: 1,
      activityScore: 78,
      baseAllocation: 16_500,
      nftBonus: 2_000,
    },
    300_000_000,
  );
  assert.equal(outcome.status, 'created');
  assert.equal(await repo.countAllocations(ALLOCATION_NETWORK), 1);
  const found = await repo.findByWallet(WALLET.toUpperCase(), ALLOCATION_NETWORK);
  assert.ok(found, 'case-normalized lookup must work in sqlite mode');
  assert.equal(found.allocation, 18_500);
  await repo.close();
});
