import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import {
  PostgresAllocationRepository,
  type PostgresPool,
} from '../server/persistence/postgresAllocationRepository';
import { ALLOCATION_NETWORK, type CreateAllocationSnapshotInput } from '../server/persistence/allocationRepository';

const NETWORK = ALLOCATION_NETWORK;
const WALLET = '0x71c44f3a9b3f6b4e90b04af5796e25bb24f88f29';
const UPPER = WALLET.replace('71c', '71C').replace('f3a', 'F3A');
const BIG_POOL = 300_000_000;

/**
 * The pre-migration "Season 01" schema as shipped by earlier deployments.
 * initializeSchema() must detect and repair this shape automatically.
 */
const LEGACY_SCHEMA_DDL = [
  `CREATE TABLE allocation_snapshots (
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
  `CREATE INDEX idx_allocation_snapshots_season_network
     ON allocation_snapshots (season, network)`,
  `CREATE TABLE allocation_pool_ledger (
     season TEXT NOT NULL,
     network TEXT NOT NULL,
     total_allocated BIGINT NOT NULL DEFAULT 0,
     PRIMARY KEY (season, network)
   )`,
];

function makeSnapshot(overrides: Partial<CreateAllocationSnapshotInput> = {}): CreateAllocationSnapshotInput {
  return {
    walletAddress: WALLET,
    network: NETWORK,
    allocation: 18_500,
    transactionCountAtSnapshot: 42,
    nftHolderAtSnapshot: true,
    nftCountAtSnapshot: 1,
    activityScore: 78,
    baseAllocation: 16_500,
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

  const found = await repo.findByWallet(WALLET, NETWORK);
  assert.ok(found, 'snapshot must be found after creation');
  assert.equal(found.allocation, 18_500);
  assert.ok(found.createdAt.length > 0, 'createdAt must be populated');
  assert.equal(await repo.countAllocations(NETWORK), 1);
  await repo.close();
});

test('2: get returns the persisted snapshot for an existing wallet', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  const read = await repo.findByWallet(WALLET, NETWORK);
  assert.ok(read, 'get must return the snapshot');
  assert.equal(read.allocation, 18_500);
  assert.equal(read.nftHolderAtSnapshot, true);
  const nothing = await repo.findByWallet('0x' + 'f'.repeat(40), NETWORK);
  assert.equal(nothing, null, 'unknown wallet must return null');
  await repo.close();
});

test('3: unique wallet/network constraint forbids a second row', async () => {
  const repo = await makeRepo();
  const first = await repo.createAllocationSnapshot(makeSnapshot({ allocation: 18_500 }), BIG_POOL);
  assert.equal(first.status, 'created');
  const second = await repo.createAllocationSnapshot(makeSnapshot({ allocation: 99_999 }), BIG_POOL);
  assert.equal(second.status, 'existing', 'duplicate must never be created');
  assert.equal(second.record.allocation, 18_500);
  assert.equal(await repo.countAllocations(NETWORK), 1);
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
  const viaLower = await repo.findByWallet(WALLET, NETWORK);
  const viaUpper = await repo.findByWallet(UPPER, NETWORK);
  assert.ok(viaLower && viaUpper, 'both case variants resolve to the record');
  assert.equal(viaUpper.allocation, 18_500);
  const dup = await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: UPPER, allocation: 99 }), BIG_POOL);
  assert.equal(dup.status, 'existing');
  assert.equal(dup.record.allocation, 18_500);
  assert.equal(await repo.countAllocations(NETWORK), 1);
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
  assert.equal(await repo.countAllocations(NETWORK), 1);
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
  const reloaded = await repoB.findByWallet(WALLET, NETWORK);
  assert.ok(reloaded, 'snapshot must survive a cold start');
  assert.equal(reloaded.allocation, 18_500);
  assert.equal(await repoB.countAllocations(NETWORK), 1);
  await repoB.close();
});

test('pool cap: allocation is capped to the remaining budget', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(
    makeSnapshot({ walletAddress: '0x' + 'a'.repeat(40), allocation: 30_000 }),
    BIG_POOL,
  );
  const capped = await repo.createAllocationSnapshot(
    makeSnapshot({ allocation: 100_000 }),
    40_000, // remaining budget
  );
  assert.equal(capped.status, 'created');
  assert.equal(capped.record.allocation, 10_000, 'must be capped to the remaining 10,000');
  assert.equal(await repo.totalAllocated(NETWORK), 40_000);
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
  assert.equal(await repo.countAllocations(NETWORK), 1);
  assert.equal(await repo.totalAllocated(NETWORK), 1_000);
  await repo.close();
});

test('totalAllocated and countAllocations reflect real sums across wallets', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: '0x' + 'a'.repeat(40), allocation: 5_000 }), BIG_POOL);
  await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: '0x' + 'b'.repeat(40), allocation: 7_000 }), BIG_POOL);
  assert.equal(await repo.totalAllocated(NETWORK), 12_000);
  assert.equal(await repo.countAllocations(NETWORK), 2);
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

test('migration: legacy Season-01 schema is upgraded automatically in place', async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as PostgresPool;

  for (const ddl of LEGACY_SCHEMA_DDL) await pool.query(ddl);
  const walletA = '0x' + 'a'.repeat(40);
  const walletB = '0x' + 'b'.repeat(40);
  await pool.query(
    `INSERT INTO allocation_snapshots
       (wallet_address, season, network, allocation, transaction_count_at_snapshot,
        nft_holder_at_snapshot, nft_count_at_snapshot, activity_score, nft_bonus)
     VALUES
       ($1, 'Season 01', $3, 1000, 10, TRUE, 1, 50, 0),
       ($2, 'Season 01', $3, 2000, 20, FALSE, 0, 60, 0)`,
    [walletA, walletB, NETWORK],
  );
  await pool.query(
    `INSERT INTO allocation_pool_ledger (season, network, total_allocated)
     VALUES ('Season 01', $1, 3000)`,
    [NETWORK],
  );

  const repo = new PostgresAllocationRepository(pool);
  await repo.initializeSchema();

  // The season column is gone from both tables.
  const snapRows = (await pool.query('SELECT * FROM allocation_snapshots')).rows;
  assert.ok(snapRows.length > 0, 'snapshots must be preserved');
  assert.ok(!Object.keys(snapRows[0]).includes('season'), 'snapshot season column must be dropped');
  const ledgerRows = (await pool.query('SELECT * FROM allocation_pool_ledger')).rows;
  assert.ok(!Object.keys(ledgerRows[0]).includes('season'), 'ledger season column must be dropped');

  // Every existing finalized snapshot is preserved unchanged.
  const a = await repo.findByWallet(walletA, NETWORK);
  const b = await repo.findByWallet(walletB, NETWORK);
  assert.ok(a && a.allocation === 1000, 'wallet a snapshot must survive');
  assert.ok(b && b.allocation === 2000, 'wallet b snapshot must survive');
  assert.equal(await repo.countAllocations(NETWORK), 2);

  // The ledger is reconciled to the preserved totals.
  assert.equal(await repo.totalAllocated(NETWORK), 3000);

  // UNIQUE(wallet_address, network) is enforced at the database level: a raw
  // second row for the same wallet is impossible.
  try {
    await pool.query(
      `INSERT INTO allocation_snapshots
         (wallet_address, network, allocation, transaction_count_at_snapshot, activity_score)
       VALUES ($1, $2, 99, 99, 99)`,
      [walletA, NETWORK],
    );
  } catch {
    // unique violation — expected
  }
  const uniqueCount = await pool.query(
    `SELECT COUNT(*)::BIGINT AS n FROM allocation_snapshots WHERE wallet_address = $1`,
    [walletA],
  );
  assert.equal(Number(uniqueCount.rows[0].n), 1, 'exactly one row per wallet must be enforced');

  // The service still treats the wallet as already-finalized.
  const dup = await repo.createAllocationSnapshot(
    makeSnapshot({ walletAddress: walletA, allocation: 99_999 }),
    BIG_POOL,
  );
  assert.equal(dup.status, 'existing');
  assert.equal(dup.record.allocation, 1000, 'frozen snapshot must never be recalculated');

  // The migration is fully idempotent: re-running leaves data untouched.
  await repo.initializeSchema();
  assert.equal(await repo.countAllocations(NETWORK), 2);
  assert.equal(await repo.totalAllocated(NETWORK), 3000);
  await repo.close();
});

test('migration: duplicate legacy rows for one wallet collapse to a single snapshot', async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as PostgresPool;
  const wallet = '0x' + 'c'.repeat(40);

  for (const ddl of LEGACY_SCHEMA_DDL) await pool.query(ddl);
  await pool.query(
    `INSERT INTO allocation_snapshots
       (wallet_address, season, network, allocation, transaction_count_at_snapshot, activity_score)
     VALUES
       ($1, 'Season 01', $2, 1500, 30, 70),
       ($1, 'Season 00', $2, 1800, 32, 72)`,
    [wallet, NETWORK],
  );
  await pool.query(
    `INSERT INTO allocation_pool_ledger (season, network, total_allocated)
     VALUES ('Season 01', $1, 1500), ('Season 00', $1, 1800)`,
    [NETWORK],
  );

  const repo = new PostgresAllocationRepository(pool);
  await repo.initializeSchema();

  assert.equal(await repo.countAllocations(NETWORK), 1, 'exactly one snapshot per wallet');
  const kept = await repo.findByWallet(wallet, NETWORK);
  assert.ok(kept, 'the surviving snapshot must be retrievable');
  assert.equal(kept.allocation, 1_800, 'the most recently persisted allocation wins');
  assert.equal(await repo.totalAllocated(NETWORK), 1_800, 'ledger must reconcile to the kept snapshot');
  await repo.close();
});

// ── NFT upgrade + new columns / migration backfill ─────────────────────────

test('NFT upgrade: postgres grants the one-time bonus exactly once and persists it', async () => {
  const repo = await makeRepo();
  const created = await repo.createAllocationSnapshot(
    makeSnapshot({ nftHolderAtSnapshot: false, nftCountAtSnapshot: 0, activityScore: 75, baseAllocation: 22_500, nftBonus: 0, allocation: 22_500 }),
    BIG_POOL,
  );
  assert.equal(created.status, 'created');
  assert.equal(created.record.nftBonusApplied, false);

  const upgraded = await repo.applyNftUpgrade({
    walletAddress: WALLET,
    network: NETWORK,
    bonusAllocation: 25_000,
    maxAllocation: 100_000,
    nftCount: 1,
  });
  assert.equal(upgraded.status, 'upgraded');
  assert.equal(upgraded.record.allocation, 47_500);
  assert.equal(upgraded.record.nftBonus, 25_000);
  assert.equal(upgraded.record.baseAllocation, 22_500);
  assert.equal(upgraded.record.nftBonusApplied, true);
  assert.notEqual(upgraded.record.nftUpgradeAt, null);

  const again = await repo.applyNftUpgrade({
    walletAddress: WALLET,
    network: NETWORK,
    bonusAllocation: 25_000,
    maxAllocation: 100_000,
    nftCount: 2,
  });
  assert.equal(again.status, 'already_applied');
  assert.equal(again.record.allocation, 47_500, 'bonus must never be granted twice');
  assert.equal(await repo.countAllocations(NETWORK), 1);
  await repo.close();
});

test('NFT upgrade: cap at 100,000 is respected', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(
    makeSnapshot({ allocation: 90_000, baseAllocation: 90_000, nftBonus: 0, nftHolderAtSnapshot: false }),
    BIG_POOL,
  );
  const upgraded = await repo.applyNftUpgrade({
    walletAddress: WALLET,
    network: NETWORK,
    bonusAllocation: 25_000,
    maxAllocation: 100_000,
    nftCount: 1,
  });
  assert.equal(upgraded.status, 'upgraded');
  assert.equal(upgraded.record.allocation, 100_000);
  assert.equal(upgraded.record.nftBonus, 25_000);
  await repo.close();
});

test('NFT upgrade: missing wallet returns not_found', async () => {
  const repo = await makeRepo();
  const result = await repo.applyNftUpgrade({
    walletAddress: '0x' + 'f'.repeat(40),
    network: NETWORK,
    bonusAllocation: 25_000,
    maxAllocation: 100_000,
    nftCount: 1,
  });
  assert.equal(result.status, 'not_found');
  await repo.close();
});

test('NFT upgrade: concurrent requests apply the bonus exactly once', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(
    makeSnapshot({ nftHolderAtSnapshot: false, nftCountAtSnapshot: 0, activityScore: 75, baseAllocation: 22_500, nftBonus: 0, allocation: 22_500 }),
    BIG_POOL,
  );
  const attempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      repo.applyNftUpgrade({
        walletAddress: WALLET,
        network: NETWORK,
        bonusAllocation: 25_000,
        maxAllocation: 100_000,
        nftCount: 1,
      }),
    ),
  );
  const upgraded = attempts.filter((a) => a.status === 'upgraded').length;
  const alreadyApplied = attempts.filter((a) => a.status === 'already_applied').length;
  assert.equal(upgraded, 1);
  assert.equal(alreadyApplied, attempts.length - 1);
  const saved = await repo.findByWallet(WALLET, NETWORK);
  assert.ok(saved);
  assert.equal(saved.allocation, 47_500);
  assert.equal(saved.nftBonusApplied, true);
  await repo.close();
});

test('I: migration preserves existing snapshots and backfills the new NFT fields idempotently', async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as PostgresPool;

  // Pre-migration schema WITHOUT the new columns, with live data.
  for (const ddl of LEGACY_SCHEMA_DDL) await pool.query(ddl);
  await pool.query(
    `INSERT INTO allocation_snapshots
       (wallet_address, season, network, allocation, transaction_count_at_snapshot,
        nft_holder_at_snapshot, nft_count_at_snapshot, activity_score, nft_bonus)
     VALUES
       ($1, 'Season 01', $3, 1000, 10, TRUE, 1, 50, 0),
       ($2, 'Season 01', $3, 2000, 20, FALSE, 0, 60, 0),
       ($4, 'Season 01', $3, 3000, 30, TRUE, 2, 70, 2500)`,
    ['0x' + 'a'.repeat(40), '0x' + 'b'.repeat(40), NETWORK, '0x' + 'd'.repeat(40)],
  );
  await pool.query(
    `INSERT INTO allocation_pool_ledger (season, network, total_allocated)
     VALUES ('Season 01', $1, 6000)`,
    [NETWORK],
  );

  const repo = new PostgresAllocationRepository(pool);
  await repo.initializeSchema();

  // Existing allocations are preserved exactly.
  const a = await repo.findByWallet('0x' + 'a'.repeat(40), NETWORK);
  const b = await repo.findByWallet('0x' + 'b'.repeat(40), NETWORK);
  const d = await repo.findByWallet('0x' + 'd'.repeat(40), NETWORK);
  assert.ok(a && a.allocation === 1000, 'wallet a allocation preserved');
  assert.ok(b && b.allocation === 2000, 'wallet b allocation preserved');
  assert.ok(d && d.allocation === 3000, 'wallet d allocation preserved');

  // base_allocation is backfilled from the recorded split.
  assert.equal(a.baseAllocation, 1000);
  assert.equal(b.baseAllocation, 2000);
  assert.equal(d.baseAllocation, 500, '3000 allocation minus 2500 recorded bonus');

  // Rows that already had a bonus are marked applied; rows without remain eligible.
  assert.equal(d.nftBonusApplied, true, 'already-bonused wallet must not be upgradable again');
  assert.equal(a.nftBonusApplied, false, 'legacy holder with no bonus stays eligible for upgrade');
  assert.equal(b.nftBonusApplied, false);

  // Re-running the migration leaves everything untouched (idempotent).
  await repo.initializeSchema();
  await repo.initializeSchema();
  assert.equal(await repo.countAllocations(NETWORK), 3);
  assert.equal(await repo.totalAllocated(NETWORK), 6000);
  const again = await repo.findByWallet('0x' + 'd'.repeat(40), NETWORK);
  assert.ok(again && again.allocation === 3000 && again.nftBonusApplied === true);
  await repo.close();
});

test('admin listAllocations and allocationStats return real aggregates', async () => {
  const repo = await makeRepo();
  await repo.createAllocationSnapshot(
    makeSnapshot({ walletAddress: '0x' + 'a'.repeat(40), allocation: 22_500, baseAllocation: 22_500, nftHolderAtSnapshot: false, nftBonus: 0 }),
    BIG_POOL,
  );
  await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: '0x' + 'b'.repeat(40) }), BIG_POOL);
  await repo.applyNftUpgrade({
    walletAddress: '0x' + 'a'.repeat(40),
    network: NETWORK,
    bonusAllocation: 25_000,
    maxAllocation: 100_000,
    nftCount: 1,
  });

  const stats = await repo.allocationStats(NETWORK);
  assert.equal(stats.totalWallets, 2);
  assert.equal(stats.eligibleWallets, 2);
  assert.equal(stats.totalAllocated, 66_000);
  assert.equal(stats.totalNftBonus, 27_000);
  assert.equal(stats.nftUpgradedWallets, 1);

  const listed = await repo.listAllocations(NETWORK, { limit: 1, offset: 0 });
  assert.equal(listed.total, 2);
  assert.equal(listed.records.length, 1);
  const listedAll = await repo.listAllocations(NETWORK, { limit: 10, offset: 0 });
  assert.equal(listedAll.records.length, 2);
  await repo.close();
});
