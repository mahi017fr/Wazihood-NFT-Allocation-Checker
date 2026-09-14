import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import {
  PostgresAllocationRepository,
  type PostgresPool,
} from '../server/persistence/postgresAllocationRepository';
import { ALLOCATION_NETWORK, ALLOCATION_SEASON, type CreateAllocationSnapshotInput } from '../server/persistence/allocationRepository';

const SEASON = ALLOCATION_SEASON;
const NETWORK = ALLOCATION_NETWORK;
const WALLET = '0x71c44f3a9b3f6b4e90b04af5796e25bb24f88f29';
const UPPER = WALLET.replace('71c', '71C').replace('f3a', 'F3A');
const BIG_POOL = 30_000_000_000;

function makeSnapshot(overrides: Partial<CreateAllocationSnapshotInput> = {}): CreateAllocationSnapshotInput {
  return {
    walletAddress: WALLET,
    season: SEASON,
    network: NETWORK,
    allocation: 18_500,
    transactionCountAtSnapshot: 42,
    nftHolderAtSnapshot: true,
    nftCountAtSnapshot: 1,
    activityScore: 78,
    nftBonus: 2_000,
    ...overrides,
  };
}

function makePool(): PostgresPool {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PostgresPool;
}

async function makeRepo(pool: PostgresPool = makePool()): Promise<PostgresAllocationRepository> {
  const repo = new PostgresAllocationRepository(pool);
  await repo.initializeSchema();
  return repo;
}

test('1: postgres repository creates a snapshot that is persisted and retrievable', async () => {
  const repo = await makeRepo();
  const outcome = await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  assert.equal(outcome.status, 'created');
  assert.equal(outcome.record.walletAddress, WALLET);
  assert.equal(outcome.record.allocation, 18_500);
  assert.equal(outcome.record.transactionCountAtSnapshot, 42);
  assert.equal(outcome.record.nftHolderAtSnapshot, true);
  assert.equal(outcome.record.activityScore, 78);
  assert.equal(outcome.record.nftBonus, 2_000);

  const found = await repo.findByWallet(WALLET, SEASON, NETWORK);
  assert.ok(found, 'snapshot must be found after creation');
  assert.equal(found.allocation, 18_500);
  assert.ok(found.createdAt.length > 0, 'createdAt must be populated');
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
  await repo.close();
});

test('2: get returns the persisted snapshot for an existing wallet', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  const read = await repo.findByWallet(WALLET, SEASON, NETWORK);
  assert.ok(read, 'get must return the snapshot');
  assert.equal(read.allocation, 18_500);
  assert.equal(read.nftHolderAtSnapshot, true);
  const nothing = await repo.findByWallet('0x' + 'f'.repeat(40), SEASON, NETWORK);
  assert.equal(nothing, null, 'unknown wallet must return null');
  await repo.close();
});

test('3: unique wallet/season/network constraint forbids a second row', async () => {
  const repo = await makeRepo();
  const first = await repo.createAllocationSnapshot(makeSnapshot({ allocation: 18_500 }), BIG_POOL);
  assert.equal(first.status, 'created');
  const second = await repo.createAllocationSnapshot(makeSnapshot({ allocation: 99_999 }), BIG_POOL);
  assert.equal(second.status, 'existing', 'duplicate must never be created');
  assert.equal(second.record.allocation, 18_500);
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
  await repo.close();
});

test('4: an existing snapshot is returned instead of a new allocation', async () => {
  const repo = await makeRepo();
  const outcome = await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  assert.equal(outcome.status, 'created');
  const again = await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  assert.equal(again.status, 'existing');
  assert.equal(again.record.allocation, outcome.record.allocation);
  await repo.close();
});

test('5: an existing snapshot is never recalculated or overwritten', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  const retry = await repo.createAllocationSnapshot(
    makeSnapshot({
      walletAddress: '0x' + 'e'.repeat(40),
      season: SEASON,
      network: NETWORK,
    }),
    BIG_POOL,
  );
  assert.equal(retry.status, 'created');
  // The same wallet retried with completely different inputs still resolves to
  // its original snapshot.
  const again = await repo.createAllocationSnapshot(
    makeSnapshot({
      allocation: 100_000,
      transactionCountAtSnapshot: 999,
      nftHolderAtSnapshot: false,
      nftCountAtSnapshot: 0,
      activityScore: 100,
      nftBonus: 0,
    }),
    BIG_POOL,
  );
  assert.equal(again.status, 'existing');
  assert.equal(again.record.allocation, 18_500);
  assert.equal(again.record.transactionCountAtSnapshot, 42);
  assert.equal(again.record.nftHolderAtSnapshot, true);
  await repo.close();
});

test('6: case-normalized wallet addresses resolve to the same snapshot', async () => {
  const repo = await makeRepo();
  const created = await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: UPPER }), BIG_POOL);
  assert.equal(created.status, 'created');
  assert.equal(created.record.walletAddress, WALLET, 'address must be stored lowercase');
  const viaLower = await repo.findByWallet(WALLET, SEASON, NETWORK);
  const viaUpper = await repo.findByWallet(UPPER, SEASON, NETWORK);
  assert.ok(viaLower && viaUpper, 'both case variants resolve to the record');
  assert.equal(viaUpper.allocation, 18_500);
  const dup = await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: UPPER, allocation: 99 }), BIG_POOL);
  assert.equal(dup.status, 'existing');
  assert.equal(dup.record.allocation, 18_500);
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
  await repo.close();
});

test('7: concurrent duplicate creation resolves to exactly one snapshot', async () => {
  const repo = await makeRepo();
  const attempts = await Promise.all(
    Array.from({ length: 12 }, () => repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL)),
  );
  const created = attempts.filter((a) => a.status === 'created').length;
  const existing = attempts.filter((a) => a.status === 'existing').length;
  assert.equal(created, 1, 'exactly one request must create the snapshot');
  assert.equal(existing, attempts.length - 1, `expected existing outcomes, got ${existing}`);
  for (const attempt of attempts) {
    if (attempt.status !== 'pool_exhausted') assert.equal(attempt.record.allocation, 18_500);
  }
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
  await repo.close();
});

test('8: a new process/connection reads the same durable snapshot', async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();

  const poolA = new Pool() as unknown as PostgresPool;
  const repoA = new PostgresAllocationRepository(poolA);
  await repoA.initializeSchema();
  const outcome = await repoA.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  assert.equal(outcome.status, 'created');
  await repoA.close();

  // Simulates a serverless cold start / redeploy: a brand new connection
  // (and repository instance) sees the previously persisted snapshot.
  const poolB = new Pool() as unknown as PostgresPool;
  const repoB = new PostgresAllocationRepository(poolB);
  const reloaded = await repoB.findByWallet(WALLET, SEASON, NETWORK);
  assert.ok(reloaded, 'snapshot must survive a cold start');
  assert.equal(reloaded.allocation, 18_500);
  assert.equal(await repoB.countAllocations(SEASON, NETWORK), 1);
  await repoB.close();
});

test('pool cap: allocation is capped to the remaining Season 01 budget', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(
    makeSnapshot({ walletAddress: '0x' + 'a'.repeat(40), allocation: 30_000 }),
    BIG_POOL,
  );
  const capped = await repo.createAllocationSnapshot(
    makeSnapshot({ allocation: 100_000 }),
    40_000, // remaining budget for the season
  );
  assert.equal(capped.status, 'created');
  assert.equal(capped.record.allocation, 10_000, 'must be capped to the remaining 10,000');
  assert.equal(await repo.totalAllocated(SEASON, NETWORK), 40_000);
  await repo.close();
});

test('pool exhausted: returns pool_exhausted and writes nothing', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(makeSnapshot({ allocation: 1_000 }), 1_000);
  const exhausted = await repo.createAllocationSnapshot(
    makeSnapshot({ walletAddress: '0x' + 'b'.repeat(40), allocation: 1 }),
    1_000,
  );
  assert.equal(exhausted.status, 'pool_exhausted');
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
  assert.equal(await repo.totalAllocated(SEASON, NETWORK), 1_000);
  await repo.close();
});

test('totalAllocated and countAllocations reflect real sums across wallets', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: '0x' + 'a'.repeat(40), allocation: 5_000 }), BIG_POOL);
  await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: '0x' + 'b'.repeat(40), allocation: 7_000 }), BIG_POOL);
  assert.equal(await repo.totalAllocated(SEASON, NETWORK), 12_000);
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 2);
  await repo.close();
});

test('migration is idempotent and safe to run repeatedly', async () => {
  const repo = new PostgresAllocationRepository(makePool());
  await repo.initializeSchema();
  await repo.initializeSchema();
  await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  await repo.initializeSchema();
  const out = await repo.createAllocationSnapshot(
    makeSnapshot({ walletAddress: '0x' + 'c'.repeat(40) }),
    BIG_POOL,
  );
  assert.equal(out.status, 'created');
  await repo.close();
});