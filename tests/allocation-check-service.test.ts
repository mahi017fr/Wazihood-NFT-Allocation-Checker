import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AllocationCheckService, type AllocationCheckServiceDeps } from '../server/services/allocationCheckService';
import { ApiError } from '../server/errors';
import { REQUIRED_TRANSACTION_REASON, type AllocationConfig } from '../server/services/allocationEngine';
import { SqliteAllocationRepository } from '../server/persistence/sqliteAllocationRepository';
import { ALLOCATION_NETWORK, type AllocationRepository } from '../server/persistence/allocationRepository';

const NETWORK = ALLOCATION_NETWORK;
const VALID_ADDRESS = '0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29';
const LOWERCASE = VALID_ADDRESS.toLowerCase();
const BIG_POOL = 300_000_000;

const DEFAULT_CONFIG: AllocationConfig = {
  minAllocation: 1,
  maxAllocation: 100_000,
  maxActivityAllocation: 70_000,
  activityScoreTiers: [
    { threshold: 1, score: 1 },
    { threshold: 10, score: 10 },
    { threshold: 25, score: 20 },
    { threshold: 50, score: 30 },
    { threshold: 100, score: 50 },
    { threshold: 250, score: 60 },
    { threshold: 500, score: 70 },
    { threshold: 700, score: 80 },
    { threshold: 1000, score: 100 },
  ],
  nftHolderBonusPercent: 0,
  nftHolderBonusAllocation: 25_000,
  maxNonNftAllocation: 70_000,
};

interface BuildOptions {
  tx?: number;
  nftCount?: number;
  nftConfigured?: boolean;
  chainError?: ApiError;
  nftError?: ApiError;
  config?: Partial<AllocationConfig>;
  allocationPool?: number;
  alreadyAllocated?: number;
  repo?: AllocationRepository;
}

function fakeChain(initial: number, onChange?: (set: (v: number) => void) => void) {
  let current = initial;
  let calls = 0;
  return {
    calls: () => calls,
    set: (v: number) => {
      current = v;
    },
    getTransactionCount: async () => {
      calls += 1;
      return { transactionCount: current, capped: false };
    },
  };
}

function failingNft(error: ApiError) {
  return {
    getBalance: async () => {
      throw error;
    },
    isConfigured: () => true,
  };
}

function buildService(options: BuildOptions = {}) {
  const chain = options.chainError
    ? {
        getTransactionCount: async () => {
          throw options.chainError;
        },
      }
    : fakeChain(options.tx ?? 0);
  const repo = options.repo ?? new SqliteAllocationRepository(':memory:');
  const service = new AllocationCheckService({
    chain: chain as AllocationCheckServiceDeps['chain'],
    nft: options.nftError ? failingNft(options.nftError) : fakeNft(options.nftCount ?? 0, options.nftConfigured ?? true),
    allocationConfig: { ...DEFAULT_CONFIG, ...options.config },
    allocationPool: options.allocationPool ?? BIG_POOL,
    alreadyAllocated: options.alreadyAllocated ?? 0,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  return { service, repo, chain };
}

function fakeNft(count: number, configured = true) {
  return {
    getBalance: async () => count,
    isConfigured: () => configured,
  };
}

function mutableNft(initial: number, configured = true) {
  let count = initial;
  return {
    set: (v: number) => {
      count = v;
    },
    get: () => count,
    getBalance: async () => count,
    isConfigured: () => configured,
  };
}

// ── Eligibility decision ────────────────────────────────────────────────────

test('1: NFT holder + 1 transaction is eligible and persisted', async () => {
  const { service, repo } = buildService({ tx: 1, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, true);
  assert.equal(r.nftHolder, true);
  assert.equal(r.nftCount, 1);
  assert.equal(r.transactionCount, 1);
  assert.ok(r.allocation >= 1);
  assert.equal(await repo.countAllocations(NETWORK), 1);
});

test('2: NFT holder + many transactions is eligible with an NFT bonus', async () => {
  const { service } = buildService({ tx: 200, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, true);
  assert.ok(r.nftBonus > 0, 'NFT bonus must be present');
  assert.ok(r.allocation >= r.nftBonus, 'flawed bonus math');
});

test('3: non-NFT + 1 transaction is eligible', async () => {
  const { service } = buildService({ tx: 1, nftCount: 0 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, true);
  assert.equal(r.nftHolder, false);
  assert.equal(r.nftCount, 0);
  assert.equal(r.nftBonus, 0);
  assert.ok(r.allocation >= 1);
});

test('4: non-NFT + many transactions is eligible', async () => {
  const { service } = buildService({ tx: 900, nftCount: 0 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, true);
  assert.equal(r.nftHolder, false);
  assert.equal(r.activityScore > 0, true);
  assert.ok(r.allocation >= 1);
});

test('5: 0 transactions + NFT is NOT eligible with the required reason', async () => {
  const { service } = buildService({ tx: 0, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, false);
  assert.equal(r.allocation, 0);
  assert.equal(r.nftHolder, true);
  assert.equal(r.reason, REQUIRED_TRANSACTION_REASON);
  assert.equal(r.reason, 'At least 1 Robinhood Chain transaction is required.');
  assert.notEqual(r.reason, 'Wazi NFT not held');
});

test('6: 0 transactions + no NFT is NOT eligible', async () => {
  const { service } = buildService({ tx: 0, nftCount: 0 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, false);
  assert.equal(r.allocation, 0);
  assert.equal(r.nftHolder, false);
  assert.equal(r.reason, REQUIRED_TRANSACTION_REASON);
});

// ── Allocation bounds ───────────────────────────────────────────────────────

test('7: minimum eligible allocation is at least 1 even with a near-zero max', async () => {
  const { service } = buildService({ tx: 1, nftCount: 0, config: { maxActivityAllocation: 5 } });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, true);
  assert.ok(r.allocation >= 1, `allocation ${r.allocation} below minimum`);
});

test('8: maximum eligible allocation never exceeds 100,000', async () => {
  const { service } = buildService({
    tx: 5000,
    nftCount: 1,
    config: { maxActivityAllocation: 500_000, nftHolderBonusPercent: 100 },
  });
  const r = await service.check(VALID_ADDRESS);
  assert.ok(r.allocation <= 100_000, `allocation ${r.allocation} exceeds cap`);
  assert.ok(r.allocation >= 1);
});

test('9: more transactions never produce a lower allocation (service level)', async () => {
  let previous = -1;
  const tiers = DEFAULT_CONFIG.activityScoreTiers;
  assert.ok(tiers.length > 0);
  for (let tx = 1; tx <= 1000; tx += 7) {
    const { service } = buildService({ tx, nftCount: 0 });
    const r = await service.check(`0x${tx.toString(16).padStart(40, '0')}`);
    assert.ok(r.allocation >= previous, `allocation dropped at tx=${tx}`);
    previous = r.allocation;
  }
});

test('10: NFT bonus increases allocation for the same activity', async () => {
  const nonHolder = await buildService({ tx: 100, nftCount: 0 }).service.check(VALID_ADDRESS);
  const holder = await buildService({ tx: 100, nftCount: 1 }).service.check('0x' + 'f'.repeat(40));
  assert.equal(holder.transactionCount, nonHolder.transactionCount);
  assert.equal(nonHolder.activityScore, 50, '100 transactions scores exactly 50');
  assert.equal(holder.activityScore, 50, 'score is activity based and identical for both');
  assert.ok(holder.nftBonus > nonHolder.nftBonus);
  assert.ok(holder.allocation > nonHolder.allocation, 'NFT holder must receive more');
});

// ── Persistence / snapshot behavior ────────────────────────────────────────

test('11: first check persists the allocation as new_calculation', async () => {
  const { service, repo } = buildService({ tx: 42, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.allocationSource, 'new_calculation');
  assert.equal(r.allocationFinalized, true);
  const saved = await repo.findByWallet(LOWERCASE, NETWORK);
  assert.ok(saved);
  assert.equal(saved.allocation, r.allocation);
  assert.equal(saved.transactionCountAtSnapshot, 42);
  assert.equal(saved.nftHolderAtSnapshot, true);
  assert.ok(saved.createdAt);
});

test('12: second check returns the exact same allocation as a snapshot', async () => {
  const { service, repo } = buildService({ tx: 42, nftCount: 1 });
  const first = await service.check(VALID_ADDRESS);
  const second = await service.check(VALID_ADDRESS);
  assert.equal(second.allocationSource, 'snapshot');
  assert.equal(second.allocation, first.allocation);
  assert.equal(second.transactionCount, first.transactionCount);
  assert.equal(second.nftCount, first.nftCount);
  assert.equal(await repo.countAllocations(NETWORK), 1);
});

test('13: second check does not recalculate blockchain allocation (no chain calls)', async () => {
  const chain = fakeChain(42);
  const repo = new SqliteAllocationRepository(':memory:');
  const service = new AllocationCheckService({
    chain: chain as AllocationCheckServiceDeps['chain'],
    nft: fakeNft(1),
    allocationConfig: DEFAULT_CONFIG,
    allocationPool: BIG_POOL,
    alreadyAllocated: 0,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  const first = await service.check(VALID_ADDRESS);
  assert.ok(chain.calls() >= 1);
  const callsAfterFirst = chain.calls();
  const second = await service.check(VALID_ADDRESS);
  assert.equal(second.allocationSource, 'snapshot');
  assert.equal(second.allocation, first.allocation);
  assert.equal(chain.calls(), callsAfterFirst, 'snapshot lookup must not hit the blockchain');
});

test('14: transaction count changing does not change the saved allocation', async () => {
  const chain = fakeChain(10);
  const repo = new SqliteAllocationRepository(':memory:');
  const service = new AllocationCheckService({
    chain: chain as AllocationCheckServiceDeps['chain'],
    nft: fakeNft(0),
    allocationConfig: DEFAULT_CONFIG,
    allocationPool: BIG_POOL,
    alreadyAllocated: 0,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  const first = await service.check(VALID_ADDRESS);
  chain.set(500); // activity grew after the snapshot
  const second = await service.check(VALID_ADDRESS);
  assert.equal(second.allocation, first.allocation);
  assert.equal(second.transactionCount, 10, 'must still report the snapshot transaction count');
  assert.equal(second.allocationSource, 'snapshot');
});

test('E: non-NFT wallet that later buys the Wazi NFT upgrades by exactly +25,000 once', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const nft = mutableNft(0);
  const service = new AllocationCheckService({
    chain: fakeChain(50) as unknown as AllocationCheckServiceDeps['chain'],
    nft,
    allocationConfig: DEFAULT_CONFIG,
    allocationPool: BIG_POOL,
    alreadyAllocated: 0,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  const first = await service.check(VALID_ADDRESS);
  assert.equal(first.nftHolder, false);
  assert.equal(first.nftBonus, 0);
  assert.equal(first.nftBonusApplied, false);
  assert.equal(first.allocationSource, 'new_calculation');
  const original = first.allocation;

  nft.set(1); // wallet later acquires the Wazi NFT
  const upgraded = await service.check(VALID_ADDRESS);
  assert.equal(upgraded.allocationSource, 'nft_upgrade');
  assert.equal(upgraded.allocation, original + 25_000);
  assert.equal(upgraded.nftBonus, 25_000);
  assert.equal(upgraded.nftBonusApplied, true);
  assert.equal(upgraded.allocationUpgraded, true);
  assert.equal(upgraded.nftHolder, true, 'snapshot must record the acquired NFT');
  assert.equal(upgraded.baseAllocation, first.baseAllocation, 'activity allocation must stay frozen');
  assert.equal(upgraded.activityScore, first.activityScore);
  assert.equal(await repo.countAllocations(NETWORK), 1);
});

test('F: NFT-upgraded wallet checked again returns the exact upgraded allocation', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const nft = mutableNft(0);
  const service = new AllocationCheckService({
    chain: fakeChain(50) as unknown as AllocationCheckServiceDeps['chain'],
    nft,
    allocationConfig: DEFAULT_CONFIG,
    allocationPool: BIG_POOL,
    alreadyAllocated: 0,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  await service.check(VALID_ADDRESS); // non-NFT baseline at 50 transactions
  nft.set(1);
  const upgraded = await service.check(VALID_ADDRESS);
  assert.equal(upgraded.allocationSource, 'nft_upgrade');

  nft.set(5); // more NFT / more transactions later
  const again = await service.check(VALID_ADDRESS);
  assert.equal(again.allocationSource, 'snapshot');
  assert.equal(again.allocation, upgraded.allocation);
  assert.equal(again.transactionCount, 50, 'transaction count must stay frozen at the snapshot');
  assert.equal(again.activityScore, upgraded.activityScore);
  assert.equal(again.nftBonusApplied, true);
  assert.equal(again.allocationUpgraded, true);
});

test('16: wallet address case normalization resolves to one record', async () => {
  const { service, repo } = buildService({ tx: 42, nftCount: 1 });
  const mixedCase = '0x' + Array.from(VALID_ADDRESS.slice(2))
    .map((c, i) => (i % 3 === 0 ? c.toUpperCase() : c.toLowerCase()))
    .join('');
  const viaMixed = await service.check(mixedCase);
  const viaLower = await service.check(LOWERCASE);
  assert.equal(viaMixed.walletAddress, LOWERCASE);
  assert.equal(viaLower.walletAddress, LOWERCASE);
  assert.equal(viaMixed.allocation, viaLower.allocation);
  assert.equal(viaMixed.allocationSource, 'new_calculation', 'first check creates the snapshot');
  assert.equal(viaLower.allocationSource, 'snapshot', 'second check reuses the snapshot');
  assert.equal(await repo.countAllocations(NETWORK), 1, 'case differences must not create duplicate records');
});

test('17: duplicate allocation cannot be created via the service', async () => {
  const { service, repo } = buildService({ tx: 42, nftCount: 1 });
  await service.check(VALID_ADDRESS);
  const dup = await service.check(VALID_ADDRESS);
  assert.equal(dup.allocationSource, 'snapshot');
  assert.equal(await repo.countAllocations(NETWORK), 1);
});

test('18: concurrent requests cannot create two allocations', async () => {
  const { service, repo } = buildService({ tx: 42, nftCount: 1 });
  const results = await Promise.all(Array.from({ length: 10 }, () => service.check(VALID_ADDRESS)));
  const createdSources = results.filter((r) => r.allocationSource === 'new_calculation').length;
  const snapshotSources = results.filter((r) => r.allocationSource === 'snapshot').length;
  assert.equal(createdSources, 1, 'exactly one request creates the snapshot');
  assert.equal(snapshotSources, results.length - 1);
  for (const r of results) assert.equal(r.allocation, results[0].allocation);
  assert.equal(await repo.countAllocations(NETWORK), 1);
});

// ── Pool cap ────────────────────────────────────────────────────────────────

test('19: allocation pool cap caps the allocation to the remaining pool', async () => {
  const { service, repo } = buildService({
    tx: 5000,
    nftCount: 1,
    allocationPool: 1000,
    alreadyAllocated: 900, // remaining budget = 100
  });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.allocation, 100, 'allocation must be capped to the remaining pool');
  assert.ok(await repo.totalAllocated(NETWORK) <= 100);
});

test('19b: exhausted pool returns ALLOCATION_POOL_EXHAUSTED, writes nothing', async () => {
  const { service, repo } = buildService({
    tx: 5000,
    nftCount: 1,
    allocationPool: 100,
    alreadyAllocated: 100, // remaining budget = 0
  });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => {
    return e instanceof ApiError && e.code === 'ALLOCATION_POOL_EXHAUSTED' && e.status === 409;
  });
  assert.equal(await repo.countAllocations(NETWORK), 0, 'exhausted pool must not create records');
});

// ── Provider failures ───────────────────────────────────────────────────────

test('20: transaction provider failure never creates an allocation', async () => {
  const { service, repo } = buildService({ chainError: new ApiError(502, 'RPC_UNAVAILABLE', 'Robinhood Chain could not be reached.') });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => e instanceof ApiError && e.code === 'RPC_UNAVAILABLE');
  assert.equal(await repo.countAllocations(NETWORK), 0);
});

test('20b: transaction timeout is a verification error, never eligible=false', async () => {
  const { service } = buildService({ chainError: new ApiError(504, 'RPC_TIMEOUT', 'Timed out.') });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => e instanceof ApiError && e.code === 'RPC_TIMEOUT');
});

test('20c: rate limit is a verification error', async () => {
  const { service } = buildService({ chainError: new ApiError(429, 'RATE_LIMITED', 'Rate limited.') });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => e instanceof ApiError && e.status === 429);
});

test('20d: TRANSACTION_CHECK_FAILED is a verification error', async () => {
  const { service } = buildService({ chainError: new ApiError(502, 'TRANSACTION_CHECK_FAILED', 'Could not verify.') });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => e instanceof ApiError && e.code === 'TRANSACTION_CHECK_FAILED');
});

test('21: NFT provider failure never creates an allocation for a new wallet', async () => {
  const { service, repo } = buildService({ tx: 100, nftError: new ApiError(502, 'NFT_CHECK_FAILED', 'Could not verify.') });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => e instanceof ApiError && e.code === 'NFT_CHECK_FAILED');
  assert.equal(await repo.countAllocations(NETWORK), 0);
});

test('21b: NFT_CONTRACT_NOT_DEPLOYED is a verification error, never eligible=false', async () => {
  const { service } = buildService({ tx: 100, nftError: new ApiError(503, 'NFT_CONTRACT_NOT_DEPLOYED', 'Not deployed.') });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => e instanceof ApiError && e.code === 'NFT_CONTRACT_NOT_DEPLOYED');
});

test('22: existing snapshot is returned without any recalculation', async () => {
  const { service } = buildService({ tx: 42, nftCount: 0 });
  const first = await service.check(VALID_ADDRESS);
  await service.check(VALID_ADDRESS); // NFT + more tx would change a recalculated value
  const third = await service.check(VALID_ADDRESS);
  assert.equal(third.allocationSource, 'snapshot');
  assert.equal(third.allocation, first.allocation);
  assert.equal(third.transactionCount, 42);
  assert.equal(third.nftHolder, false);
});

// ── New allocation snapshot rules ───────────────────────────────────────────

test('A: new wallet without NFT gets an allocation created and frozen', async () => {
  const { service, repo } = buildService({ tx: 100, nftCount: 0 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, true);
  assert.equal(r.allocationSource, 'new_calculation');
  assert.equal(r.allocationFinalized, true);
  assert.equal(r.nftBonusApplied, false);
  assert.equal(r.allocationUpgraded, false);
  assert.equal(r.activityScore, 50, '100 transactions scores exactly 50');
  const saved = await repo.findByWallet(LOWERCASE, NETWORK);
  assert.ok(saved);
  assert.equal(saved.allocation, r.allocation);
  assert.equal(saved.nftBonusApplied, false);
});

test('B: same wallet with more transactions and no NFT returns the exact same allocation', async () => {
  const chain = fakeChain(100);
  const repo = new SqliteAllocationRepository(':memory:');
  const service = new AllocationCheckService({
    chain: chain as AllocationCheckServiceDeps['chain'],
    nft: fakeNft(0),
    allocationConfig: DEFAULT_CONFIG,
    allocationPool: BIG_POOL,
    alreadyAllocated: 0,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  const first = await service.check(VALID_ADDRESS);
  chain.set(500_000); // huge activity growth, still no NFT
  const second = await service.check(VALID_ADDRESS);
  assert.equal(second.allocation, first.allocation);
  assert.equal(second.activityScore, first.activityScore);
  assert.equal(second.activityScore, 50);
  assert.equal(second.transactionCount, 100, 'stored transaction count must not change');
  assert.equal(second.allocationSource, 'snapshot');
});

test('C: new wallet with NFT gets exactly the flat +25,000 bonus at creation', async () => {
  const { service, repo } = buildService({ tx: 100, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.nftBonus, 25_000);
  assert.equal(r.nftBonusApplied, true);
  assert.equal(r.allocationUpgraded, false, 'bonus granted at first check is not an upgrade');
  assert.equal(r.allocation, r.baseAllocation + 25_000);
  const saved = await repo.findByWallet(LOWERCASE, NETWORK);
  assert.ok(saved);
  assert.equal(saved.allocation, r.allocation);
  assert.equal(saved.nftBonusApplied, true);
});

test('D: same NFT wallet checked again gets no second +25,000 bonus', async () => {
  const { service } = buildService({ tx: 100, nftCount: 1 });
  const first = await service.check(VALID_ADDRESS);
  assert.equal(first.nftBonus, 25_000);
  assert.equal(first.nftBonusApplied, true);
  const second = await service.check(VALID_ADDRESS);
  assert.equal(second.allocationSource, 'snapshot');
  assert.equal(second.allocation, first.allocation);
  assert.equal(second.nftBonus, 25_000, 'must not double the bonus');
  assert.equal(second.nftBonusApplied, true);
});

test('G: NFT holder that later sells the NFT keeps the full allocation', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const nft = mutableNft(1);
  const service = new AllocationCheckService({
    chain: fakeChain(200) as unknown as AllocationCheckServiceDeps['chain'],
    nft,
    allocationConfig: DEFAULT_CONFIG,
    allocationPool: BIG_POOL,
    alreadyAllocated: 0,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  const first = await service.check(VALID_ADDRESS);
  assert.ok(first.nftBonus > 0);
  assert.equal(first.nftBonusApplied, true);

  nft.set(0); // user sells / transfers the NFT
  const afterSale = await service.check(VALID_ADDRESS);
  assert.equal(afterSale.allocation, first.allocation, 'allocation must not decrease');
  assert.equal(afterSale.nftBonus, first.nftBonus);
  assert.equal(afterSale.allocationSource, 'snapshot');
  assert.equal(afterSale.nftHolder, true, 'snapshot keeps the granted state');
});

test('K: concurrent requests cannot apply the NFT upgrade bonus twice', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  const nft = mutableNft(0);
  const service = new AllocationCheckService({
    chain: fakeChain(80) as unknown as AllocationCheckServiceDeps['chain'],
    nft,
    allocationConfig: DEFAULT_CONFIG,
    allocationPool: BIG_POOL,
    alreadyAllocated: 0,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  const baseline = await service.check(VALID_ADDRESS);
  assert.equal(baseline.nftBonusApplied, false);

  nft.set(1);
  const results = await Promise.all(Array.from({ length: 10 }, () => service.check(VALID_ADDRESS)));
  const upgrades = results.filter((r) => r.allocationSource === 'nft_upgrade').length;
  assert.equal(upgrades, 1, 'exactly one request must win the upgrade');
  for (const r of results) {
    assert.equal(r.allocation, baseline.allocation + 25_000);
    assert.equal(r.nftBonusApplied, true);
    assert.equal(r.nftBonus, 25_000);
  }
  const saved = await repo.findByWallet(LOWERCASE, NETWORK);
  assert.ok(saved);
  assert.equal(saved.allocation, baseline.allocation + 25_000);
  assert.equal(saved.nftBonusApplied, true);
});

test('H (service): a non-NFT wallet at 50,000 transactions scores 100 and caps at 70,000', async () => {
  const { service } = buildService({ tx: 50_000, nftCount: 0 });
  const r = await service.check('0x' + 'e'.repeat(40));
  assert.equal(r.eligible, true);
  assert.equal(r.activityScore, 100);
  assert.equal(r.allocation, 70_000);
  assert.equal(r.allocationUpgraded, false);
  assert.equal(r.nftBonus, 0);
});

test('NEW: new wallet scoring matches the anchor table (service level)', async () => {
  const expected: Array<[number, number]> = [
    [1, 1],
    [10, 10],
    [25, 20],
    [50, 30],
    [100, 50],
    [250, 60],
    [500, 70],
    [700, 80],
    [1000, 100],
    [5000, 100],
  ];
  for (const [tx, score] of expected) {
    const { service } = buildService({ tx, nftCount: 0 });
    const r = await service.check(`0x${tx.toString(16).padStart(40, '0')}`);
    assert.equal(r.eligible, true, `tx=${tx} must be eligible`);
    assert.equal(r.activityScore, score, `tx=${tx} must score exactly ${score}`);
  }
});

test('NEW: single transaction is the minimum for eligibility and creates the snapshot', async () => {
  const { service, repo } = buildService({ tx: 1, nftCount: 0 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, true);
  assert.equal(r.activityScore, 1);
  assert.equal(r.allocation, 700);
  assert.equal(r.allocationSource, 'new_calculation');
  assert.equal(await repo.countAllocations(NETWORK), 1);
});

test('NEW: a new non-NFT wallet allocation never exceeds 70,000 (service level)', async () => {
  const { service } = buildService({ tx: 100_000, nftCount: 0 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.allocation, 70_000);
  assert.ok(r.allocation <= 70_000);
});

test('NEW: a new NFT holder allocation = activity + 25,000, capped at 100,000', async () => {
  const cases: Array<[number, number]> = [
    [100, 60_000],
    [500, 74_000],
    [700, 81_000],
    [1000, 95_000],
  ];
  for (const [tx, expected] of cases) {
    const { service } = buildService({ tx, nftCount: 1 });
    const r = await service.check(`0x${tx.toString(16).padStart(40, '0')}`);
    assert.equal(r.nftBonus, 25_000, `tx=${tx} bonus must be exactly 25,000`);
    assert.equal(r.allocation, expected, `tx=${tx} NFT holder allocation`);
    assert.ok(r.allocation <= 100_000, `tx=${tx} NFT allocation exceeds 100,000`);
  }
});

test('NEW: allocation is monotonic for new wallets (service level)', async () => {
  let previous = -1;
  for (let tx = 1; tx <= 2000; tx += 5) {
    const { service } = buildService({ tx, nftCount: 0 });
    const r = await service.check(`0x${tx.toString(16).padStart(40, '0')}`);
    assert.ok(r.allocation >= previous, `allocation dropped at tx=${tx}`);
    previous = r.allocation;
  }
});

// ── Validation / config errors ──────────────────────────────────────────────

test('invalid wallet returns a 400 INVALID_ADDRESS error', async () => {
  const { service } = buildService();
  await assert.rejects(service.check('not-an-address'), (e: unknown) => {
    return e instanceof ApiError && e.status === 400 && e.code === 'INVALID_ADDRESS';
  });
});

test('missing Wazi NFT contract returns a clear config error', async () => {
  const { service } = buildService({ nftConfigured: false });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => {
    return e instanceof ApiError && e.status === 503 && e.code === 'NFT_CONTRACT_NOT_CONFIGURED';
  });
});

test('response uses the documented Robinhood Chain values and contains no season field', async () => {
  const { service } = buildService({ tx: 42, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.network, 'Robinhood Chain');
  assert.equal(r.chainId, 4663);
  assert.equal('season' in r, false, 'response must not contain a season field');
});

// ── New tokenomics assertions ──────────────────────────────────────────────

test('total supply = 1,000,000,000 (1B)', async () => {
  const { config } = await import('../server/config');
  assert.equal(config.tokenomics.totalSupply, 1_000_000_000);
});

test('allocation pool = 300,000,000 (300M)', async () => {
  const { config } = await import('../server/config');
  assert.equal(config.tokenomics.allocationPool, 300_000_000);
});

test('pool percentage = 30% of total supply', async () => {
  const { config } = await import('../server/config');
  const poolPct = (config.tokenomics.allocationPool / config.tokenomics.totalSupply) * 100;
  assert.equal(poolPct, 30);
});

test('maximum wallet allocation = 100,000', () => {
  assert.equal(DEFAULT_CONFIG.maxAllocation, 100_000);
});

test('minimum eligible allocation = 1', () => {
  assert.equal(DEFAULT_CONFIG.minAllocation, 1);
});

test('no API response contains a season field', async () => {
  const { service } = buildService({ tx: 42, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal('season' in r, false, 'allocation check response must not contain season');
});

test('allocation pool cannot be exceeded', async () => {
  const { service, repo } = buildService({
    tx: 5000,
    nftCount: 1,
    allocationPool: 500,
    alreadyAllocated: 0,
  });
  await service.check(VALID_ADDRESS);
  const total = await repo.totalAllocated(NETWORK);
  assert.ok(total <= 500, `total allocated ${total} exceeds pool 500`);
});
