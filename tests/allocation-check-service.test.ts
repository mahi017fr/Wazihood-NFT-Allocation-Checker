import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AllocationCheckService, type AllocationCheckServiceDeps } from '../server/services/allocationCheckService';
import { ApiError } from '../server/errors';
import { REQUIRED_TRANSACTION_REASON, type AllocationConfig } from '../server/services/allocationEngine';
import { SqliteAllocationRepository } from '../server/persistence/sqliteAllocationRepository';
import { ALLOCATION_NETWORK, ALLOCATION_SEASON, type AllocationRepository } from '../server/persistence/allocationRepository';

const SEASON = ALLOCATION_SEASON;
const NETWORK = ALLOCATION_NETWORK;
const VALID_ADDRESS = '0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29';
const LOWERCASE = VALID_ADDRESS.toLowerCase();
const BIG_POOL = 30_000_000_000;

const DEFAULT_CONFIG: AllocationConfig = {
  minAllocation: 1,
  maxAllocation: 100_000,
  maxActivityAllocation: 30_000,
  activityScoreTiers: [
    { threshold: 1, score: 10 },
    { threshold: 5, score: 25 },
    { threshold: 10, score: 40 },
    { threshold: 25, score: 55 },
    { threshold: 50, score: 70 },
    { threshold: 100, score: 80 },
    { threshold: 250, score: 92 },
    { threshold: 500, score: 100 },
  ],
  nftHolderBonusPercent: 20,
  nftHolderBonusAllocation: 0,
  season1Pool: BIG_POOL,
};

interface BuildOptions {
  tx?: number;
  nftCount?: number;
  nftConfigured?: boolean;
  chainError?: ApiError;
  nftError?: ApiError;
  config?: Partial<AllocationConfig>;
  alreadyAllocated?: number;
  repo?: AllocationRepository;
  seasons?: string;
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
    alreadyAllocated: options.alreadyAllocated ?? 0,
    season: options.seasons ?? SEASON,
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

// ── Eligibility decision ────────────────────────────────────────────────────

test('1: NFT holder + 1 transaction is eligible and persisted', async () => {
  const { service, repo } = buildService({ tx: 1, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.eligible, true);
  assert.equal(r.nftHolder, true);
  assert.equal(r.nftCount, 1);
  assert.equal(r.transactionCount, 1);
  assert.ok(r.allocation >= 1);
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
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
  assert.equal(holder.activityScore, nonHolder.activityScore);
  assert.ok(holder.nftBonus > nonHolder.nftBonus);
  assert.ok(holder.allocation > nonHolder.allocation, 'NFT holder must receive more');
});

// ── Persistence / snapshot behavior ────────────────────────────────────────

test('11: first check persists the allocation as new_calculation', async () => {
  const { service, repo } = buildService({ tx: 42, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.allocationSource, 'new_calculation');
  assert.equal(r.allocationFinalized, true);
  const saved = await repo.findByWallet(LOWERCASE, SEASON, NETWORK);
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
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
});

test('13: second check does not recalculate blockchain allocation (no chain calls)', async () => {
  const chain = fakeChain(42);
  const repo = new SqliteAllocationRepository(':memory:');
  const service = new AllocationCheckService({
    chain: chain as AllocationCheckServiceDeps['chain'],
    nft: fakeNft(1),
    allocationConfig: DEFAULT_CONFIG,
    alreadyAllocated: 0,
    season: SEASON,
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
    alreadyAllocated: 0,
    season: SEASON,
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

test('15: NFT ownership changing does not change the saved allocation', async () => {
  const repo = new SqliteAllocationRepository(':memory:');
  let nftCount = 0;
  const nft = {
    getBalance: async () => nftCount,
    isConfigured: () => true,
  };
  const service = new AllocationCheckService({
    chain: fakeChain(50) as unknown as AllocationCheckServiceDeps['chain'],
    nft,
    allocationConfig: DEFAULT_CONFIG,
    alreadyAllocated: 0,
    season: SEASON,
    networkName: NETWORK,
    chainId: 4663,
    repository: repo,
  });
  const first = await service.check(VALID_ADDRESS);
  assert.equal(first.nftHolder, false);
  assert.equal(first.nftBonus, 0);
  nftCount = 1; // wallet later acquires an NFT
  const second = await service.check(VALID_ADDRESS);
  assert.equal(second.allocation, first.allocation);
  assert.equal(second.nftHolder, false, 'snapshot NFT state must be preserved');
  assert.equal(second.nftBonus, 0);
  assert.equal(second.allocationSource, 'snapshot');
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
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1, 'case differences must not create duplicate records');
});

test('17: duplicate allocation cannot be created via the service', async () => {
  const { service, repo } = buildService({ tx: 42, nftCount: 1 });
  await service.check(VALID_ADDRESS);
  const dup = await service.check(VALID_ADDRESS);
  assert.equal(dup.allocationSource, 'snapshot');
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
});

test('18: concurrent requests cannot create two allocations', async () => {
  const { service, repo } = buildService({ tx: 42, nftCount: 1 });
  const results = await Promise.all(Array.from({ length: 10 }, () => service.check(VALID_ADDRESS)));
  const createdSources = results.filter((r) => r.allocationSource === 'new_calculation').length;
  const snapshotSources = results.filter((r) => r.allocationSource === 'snapshot').length;
  assert.equal(createdSources, 1, 'exactly one request creates the snapshot');
  assert.equal(snapshotSources, results.length - 1);
  for (const r of results) assert.equal(r.allocation, results[0].allocation);
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 1);
});

// ── Season 01 pool cap ──────────────────────────────────────────────────────

test('19: Season 01 pool cap caps the allocation to the remaining pool', async () => {
  const { service, repo } = buildService({
    tx: 5000,
    nftCount: 1,
    config: { season1Pool: 1000 },
    alreadyAllocated: 900, // remaining budget = 100
  });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.allocation, 100, 'allocation must be capped to the remaining pool');
  assert.ok(await repo.totalAllocated(SEASON, NETWORK) <= 100);
});

test('19b: exhausted Season 01 pool returns ALLOCATION_POOL_EXHAUSTED, writes nothing', async () => {
  const { service, repo } = buildService({
    tx: 5000,
    nftCount: 1,
    config: { season1Pool: 100 },
    alreadyAllocated: 100, // remaining budget = 0
  });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => {
    return e instanceof ApiError && e.code === 'ALLOCATION_POOL_EXHAUSTED' && e.status === 409;
  });
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 0, 'exhausted pool must not create records');
});

// ── Provider failures ───────────────────────────────────────────────────────

test('20: transaction provider failure never creates an allocation', async () => {
  const { service, repo } = buildService({ chainError: new ApiError(502, 'RPC_UNAVAILABLE', 'Robinhood Chain could not be reached.') });
  await assert.rejects(service.check(VALID_ADDRESS), (e: unknown) => e instanceof ApiError && e.code === 'RPC_UNAVAILABLE');
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 0);
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
  assert.equal(await repo.countAllocations(SEASON, NETWORK), 0);
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

test('response uses the documented Season 01 / Robinhood Chain values', async () => {
  const { service } = buildService({ tx: 42, nftCount: 1 });
  const r = await service.check(VALID_ADDRESS);
  assert.equal(r.season, 'Season 01');
  assert.equal(r.network, 'Robinhood Chain');
  assert.equal(r.chainId, 4663);
});