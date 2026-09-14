import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { SqliteAllocationRepository } from '../server/persistence/sqliteAllocationRepository';
import { ALLOCATION_NETWORK } from '../server/persistence/allocationRepository';

const NETWORK = ALLOCATION_NETWORK;
const WALLET = '0x71c44f3a9b3f6b4e90b04af5796e25bb24f88f29';
const UPPER = WALLET.replace('71c', '71C').replace('f3a', 'F3A');
const BIG_POOL = 300_000_000;

function makeSnapshot(overrides: Partial<Parameters<SqliteAllocationRepository['createAllocationSnapshot']>[0]> = {}) {
  return {
    walletAddress: WALLET,
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

test('11: first allocation snapshot is persisted and retrievable', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const outcome = await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  assert.equal(outcome.status, 'created');
  assert.equal(outcome.record.walletAddress, WALLET);
  assert.equal(outcome.record.allocation, 18_500);
  const found = await repo.findByWallet(WALLET, NETWORK);
  assert.ok(found, 'snapshot must be found after creation');
  assert.equal(found.allocation, 18_500);
  assert.equal(found.transactionCountAtSnapshot, 42);
  assert.equal(found.nftHolderAtSnapshot, true);
  assert.equal(found.activityScore, 78);
  await repo.close();
});

test('12: second check returns the exact same allocation', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  const second = await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  assert.equal(second.status, 'existing');
  assert.equal(second.record.allocation, 18_500);
  assert.equal((await repo.findByWallet(WALLET, NETWORK))?.allocation, 18_500);
  await repo.close();
});

test('13/22: stored snapshot is never recalculated, even with changed inputs', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  // A later request with completely different activity/NFT inputs must still
  // return the original snapshot untouched.
  const retry = await repo.createAllocationSnapshot(
    makeSnapshot({
      allocation: 100_000,
      transactionCountAtSnapshot: 500,
      nftHolderAtSnapshot: false,
      nftCountAtSnapshot: 0,
      activityScore: 100,
      nftBonus: 0,
    }),
    BIG_POOL,
  );
  assert.equal(retry.status, 'existing');
  assert.equal(retry.record.allocation, 18_500);
  assert.equal(retry.record.transactionCountAtSnapshot, 42);
  assert.equal(retry.record.nftHolderAtSnapshot, true);
  assert.equal(await repo.countAllocations(NETWORK), 1);
  await repo.close();
});

test('16: wallet address case normalization resolves to one record', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const created = await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: UPPER }), BIG_POOL);
  assert.equal(created.status, 'created');
  assert.equal(created.record.walletAddress, WALLET, 'address must be stored normalized/lowercase');
  const viaLower = await repo.findByWallet(WALLET, NETWORK);
  const viaUpper = await repo.findByWallet(UPPER, NETWORK);
  assert.ok(viaLower && viaUpper, 'both case variants must resolve to the record');
  assert.equal(viaUpper.walletAddress, WALLET);
  assert.equal(viaUpper.allocation, 18_500);
  // A second insert using different casing must not create a duplicate.
  const dup = await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: UPPER, allocation: 99 }), BIG_POOL);
  assert.equal(dup.status, 'existing');
  assert.equal(dup.record.allocation, 18_500);
  assert.equal(await repo.countAllocations(NETWORK), 1);
  await repo.close();
});

test('17: a duplicate allocation can never be created (unique constraint)', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  const duplicate = await repo.createAllocationSnapshot(makeSnapshot({ allocation: 2 }), BIG_POOL);
  assert.equal(duplicate.status, 'existing');
  assert.equal(duplicate.record.allocation, 18_500);
  assert.equal(await repo.countAllocations(NETWORK), 1);
  await repo.close();
});

test('18: concurrent requests cannot create two allocations for the same wallet', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const attempts = await Promise.all(
    Array.from({ length: 12 }, () => repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL)),
  );
  const created = attempts.filter((a) => a.status === 'created').length;
  const existing = attempts.filter((a) => a.status === 'existing').length;
  assert.equal(created, 1, 'exactly one request must create the snapshot');
  assert.equal(existing, attempts.length - 1);
  assert.equal(await repo.countAllocations(NETWORK), 1);
  await repo.close();
});

test('19: allocation pool cap caps the allocation to the remaining pool', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: '0xaaaa...0'.replace('...', 'a'.repeat(36)), allocation: 30_000 }), BIG_POOL);
  const capped = await repo.createAllocationSnapshot(
    makeSnapshot({ walletAddress: WALLET, allocation: 100_000 }),
    40_000, // pool budget left
  );
  assert.equal(capped.status, 'created');
  assert.equal(capped.record.allocation, 10_000, 'must be capped to the remaining 10,000');
  assert.ok(capped.record.allocation <= 10_000);
  await repo.close();
});

test('19b: exhausted pool returns pool_exhausted and writes nothing', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  await repo.createAllocationSnapshot(makeSnapshot({ allocation: 1000 }), 1000);
  const exhausted = await repo.createAllocationSnapshot(
    makeSnapshot({ walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', allocation: 1 }),
    1000,
  );
  assert.equal(exhausted.status, 'pool_exhausted');
  assert.equal(await repo.countAllocations(NETWORK), 1);
  assert.equal(await repo.totalAllocated(NETWORK), 1000);
  await repo.close();
});

test('totalAllocated and countAllocations reflect real totals', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: '0x' + 'a'.repeat(40), allocation: 5_000 }), BIG_POOL);
  await repo.createAllocationSnapshot(makeSnapshot({ walletAddress: '0x' + 'b'.repeat(40), allocation: 7_000 }), BIG_POOL);
  assert.equal(await repo.totalAllocated(NETWORK), 12_000);
  assert.equal(await repo.countAllocations(NETWORK), 2);
  await repo.close();
});

test('persistence survives repository restart (on-disk database)', async () => {
  const file = path.join(tmpdir(), `wazi-allocation-${Date.now()}.sqlite`);
  try {
    const first = new SqliteAllocationRepository(file);
    const outcome = await first.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
    assert.equal(outcome.status, 'created');
    await first.close();

    const second = new SqliteAllocationRepository(file);
    const reloaded = await second.findByWallet(WALLET, NETWORK);
    assert.ok(reloaded, 'snapshot must survive a database restart');
    assert.equal(reloaded.allocation, 18_500);
    await second.close();
  } finally {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try {
        fs.unlinkSync(file + suffix);
      } catch {
        // file may not exist
      }
    }
  }
});

test('pool budget is respected across many wallets (never exceeds the pool)', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const pool = 100_000;
  let total = 0;
  for (let i = 0; i < 15; i += 1) {
    const outcome = await repo.createAllocationSnapshot(
      makeSnapshot({ walletAddress: `0x${i.toString(16).padStart(40, '0')}`, allocation: 8_000 }),
      pool,
    );
    if (outcome.status === 'created') total += outcome.record.allocation;
    if (outcome.status === 'pool_exhausted') break;
  }
  assert.ok(total <= pool, `allocated ${total} exceeds pool ${pool}`);
  await repo.close();
});

test('repeated wallet submission returns the exact same allocation snapshot', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const first = await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
  assert.equal(first.status, 'created');
  for (let i = 0; i < 5; i++) {
    const result = await repo.createAllocationSnapshot(makeSnapshot(), BIG_POOL);
    assert.equal(result.status, 'existing');
    assert.equal(result.record.allocation, first.record.allocation);
  }
  await repo.close();
});
