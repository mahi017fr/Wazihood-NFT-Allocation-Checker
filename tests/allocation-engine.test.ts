import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MAX_ALLOCATION,
  DEFAULT_MIN_ALLOCATION,
  REQUIRED_TRANSACTION_REASON,
  activityScore,
  clampAllocation,
  evaluateAllocation,
  nftBonusFor,
  type AllocationConfig,
  type ScoreTier,
} from '../server/services/allocationEngine';

const TIERS: ScoreTier[] = [
  { threshold: 1, score: 500 / 700 },
  { threshold: 3, score: 1500 / 700 },
  { threshold: 5, score: 2000 / 700 },
  { threshold: 10, score: 4000 / 700 },
  { threshold: 25, score: 8000 / 700 },
  { threshold: 50, score: 15000 / 700 },
  { threshold: 100, score: 25000 / 700 },
  { threshold: 250, score: 40000 / 700 },
  { threshold: 500, score: 50000 / 700 },
  { threshold: 700, score: 60000 / 700 },
  { threshold: 1000, score: 100 },
];

const config: AllocationConfig = {
  minAllocation: DEFAULT_MIN_ALLOCATION,
  maxAllocation: DEFAULT_MAX_ALLOCATION,
  maxActivityAllocation: 70_000,
  activityScoreTiers: TIERS,
  nftHolderBonusPercent: 0,
  nftHolderBonusAllocation: 9_000,
};

function resultFor(nftCount: number, transactionCount: number) {
  return evaluateAllocation({ nftCount, transactionCount }, config);
}

// ── Eligibility rules ────────────────────────────────────────────────────────

test('transactionCount >= 1 is the only eligibility requirement', () => {
  assert.equal(resultFor(0, 1).eligible, true); // no NFT + 1 tx  → eligible
  assert.equal(resultFor(0, 500).eligible, true); // no NFT + many tx → eligible
  assert.equal(resultFor(1, 1).eligible, true); // NFT + 1 tx → eligible
  assert.equal(resultFor(5, 5000).eligible, true); // NFT + many tx → eligible
  assert.equal(resultFor(1, 0).eligible, false); // NFT + 0 tx → NOT eligible
  assert.equal(resultFor(0, 0).eligible, false); // no NFT + 0 tx → NOT eligible
});

test('zero transactions is never eligible, even with NFTs, with the required reason', () => {
  const withNft = resultFor(1, 0);
  const withoutNft = resultFor(0, 0);
  for (const r of [withNft, withoutNft]) {
    assert.equal(r.eligible, false);
    assert.equal(r.allocation, 0);
    assert.equal(r.reason, REQUIRED_TRANSACTION_REASON);
    assert.equal(r.reason, 'At least 1 Robinhood Chain transaction is required.');
  }
  assert.equal('Wazi NFT not held' in withNft, false, 'NFT ownership must never be the stated reason');
});

test('see eligibility reason: never the old NFT-required message', () => {
  assert.notEqual(REQUIRED_TRANSACTION_REASON, 'Wazi NFT not held');
});

// ── Test cases 1-4 from spec ────────────────────────────────────────────────

test('1: NFT holder + 1 transaction is eligible', () => {
  const r = resultFor(1, 1);
  assert.equal(r.eligible, true);
  assert.equal(r.transactionCount, 1);
  assert.equal(r.nftHolder, true);
  assert.ok(r.allocation >= config.minAllocation, 'eligible wallets receive >= 1 $WAZI');
});

test('2: NFT holder + many transactions is eligible and receives the NFT bonus', () => {
  const r = resultFor(1, 200);
  assert.equal(r.eligible, true);
  assert.equal(r.nftHolder, true);
  assert.ok(r.nftBonus > 0, 'NFT holder bonus must be positive');
  assert.equal(r.allocation, r.baseAllocation + r.nftBonus);
});

test('3: non-NFT + 1 transaction is eligible', () => {
  const r = resultFor(0, 1);
  assert.equal(r.eligible, true);
  assert.equal(r.nftHolder, false);
  assert.equal(r.nftCount, 0);
  assert.ok(r.allocation >= config.minAllocation);
});

test('4: non-NFT + many transactions is eligible', () => {
  const r = resultFor(0, 300);
  assert.equal(r.eligible, true);
  assert.equal(r.nftHolder, false);
  assert.equal(r.nftBonus, 0);
  assert.ok(r.allocation >= config.minAllocation);
});

// ── New rules: deterministic anchor-based activity scoring ───────────────────

test('anchor points: transaction count maps to the exact allocation', () => {
  const expected: Array<[number, number, number]> = [
    [1, 0.71, 500],
    [3, 2.14, 1_500],
    [5, 2.86, 2_000],
    [10, 5.71, 4_000],
    [25, 11.43, 8_000],
    [50, 21.43, 15_000],
    [100, 35.71, 25_000],
    [250, 57.14, 40_000],
    [500, 71.43, 50_000],
    [700, 85.71, 60_000],
    [1000, 100, 70_000],
    [5000, 100, 70_000],
  ];
  for (const [tx, score, allocation] of expected) {
    const r = resultFor(0, tx);
    assert.equal(r.eligible, true, `tx=${tx} must be eligible`);
    assert.equal(r.activityScore, score, `tx=${tx} must score exactly ${score}`);
    assert.equal(r.allocation, allocation, `tx=${tx} must allocate exactly ${allocation}`);
  }
});

test('3 transactions must be around 1,500 and NOT close to 12,000', () => {
  const r = resultFor(0, 3);
  assert.equal(r.eligible, true);
  assert.equal(r.activityScore, 2.14);
  assert.equal(r.allocation, 1_500, '3 tx must map to ~1,500 $WAZI exactly');
  assert.ok(r.allocation < 2_000, `3 tx allocation ${r.allocation} is too high for low activity`);
  assert.ok(r.allocation < 12_000, `regression: 3 tx allocation ${r.allocation} must never be thousands of $WAZI`);
});

test('H: activity score at 100 transactions matches the 25,000 target', () => {
  for (let tx = 50; tx <= 100; tx += 1) {
    assert.ok(resultFor(0, tx).activityScore <= 50, `tx=${tx} score exceeds 50`);
  }
  assert.equal(resultFor(0, 100).activityScore, 35.71);
});

test('H2: the score curve is identical for NFT holders and non-holders', () => {
  for (const tx of [1, 100, 500, 1000]) {
    assert.equal(resultFor(1, tx).activityScore, resultFor(0, tx).activityScore, `tx=${tx}`);
  }
  assert.equal(resultFor(1, 5000).activityScore, 100);
});

test('H5: non-NFT allocation follows the activity curve up to maxActivityAllocation', () => {
  const expected: Array<[number, number]> = [
    [1, 500],
    [3, 1_500],
    [5, 2_000],
    [10, 4_000],
    [25, 8_000],
    [50, 15_000],
    [100, 25_000],
    [250, 40_000],
    [500, 50_000],
    [700, 60_000],
    [1000, 70_000],
    [5000, 70_000],
  ];
  for (const [tx, allocation] of expected) {
    const r = resultFor(0, tx);
    assert.equal(r.eligible, true, `tx=${tx} must be eligible`);
    assert.equal(r.allocation, allocation, `tx=${tx} non-NFT allocation`);
    assert.ok(r.allocation <= 70_000, `tx=${tx} non-NFT allocation exceeds 70,000`);
  }
});

test('H6: NFT holder allocation = activity allocation + exactly 9,000 per NFT, never above 100,000', () => {
  const expected: Array<[number, number]> = [
    [1, 9_500],
    [100, 34_000],
    [250, 49_000],
    [500, 59_000],
    [700, 69_000],
    [1000, 79_000],
  ];
  for (const [tx, allocation] of expected) {
    const r = resultFor(1, tx);
    assert.equal(r.nftBonus, 9_000, `tx=${tx} bonus must be exactly 9,000`);
    assert.equal(r.baseAllocation, resultFor(0, tx).allocation, `tx=${tx} activity allocation`);
    assert.equal(r.allocation, allocation, `tx=${tx} NFT holder allocation`);
    assert.ok(r.allocation <= 100_000, `tx=${tx} NFT allocation exceeds 100,000`);
  }
  assert.equal(resultFor(1, 5000).allocation, 79_000);
});

test('piecewise-linear allocation is deterministic and matches the linear target between anchors', () => {
  const cases: Array<[number, number]> = [
    [2, 1_000], // midpoint of 1→3
    [4, 1_750], // midpoint of 3→5
    [7, 2_800], // 2/5 through 5→10
    [20, 6_667], // 2/3 through 10→25
    [200, 35_000], // 2/3 through 100→250
    [400, 46_000], // 3/5 through 250→500
    [600, 55_000], // midpoint of 500→700
    [850, 65_000], // midpoint of 700→1000
  ];
  for (const [tx, expected] of cases) {
    const r = resultFor(0, tx);
    assert.ok(
      r.allocation >= expected - 25 && r.allocation <= expected + 25,
      `tx=${tx} allocation ${r.allocation} not near linear target ${expected}`,
    );
  }
  // Same inputs always yield the exact same allocation (no randomness).
  for (const [tx] of cases) {
    assert.equal(resultFor(0, tx).allocation, resultFor(0, tx).allocation, `tx=${tx} must be deterministic`);
  }
});

// ── New rules: nftCount × 9,000 NFT bonus ────────────────────────────────

test('C: NFT holder allocation includes exactly nftCount × 9,000 bonus', () => {
  for (const tx of [1, 10, 100, 500]) {
    const r = resultFor(1, tx);
    assert.equal(r.nftBonus, 9_000, `tx=${tx} 1-NFT bonus must be exactly 9,000`);
    assert.equal(r.allocation, r.baseAllocation + r.nftBonus);
  }
  // Multiple NFTs scale linearly
  const r5 = resultFor(5, 100);
  assert.equal(r5.nftBonus, 45_000, '5 NFTs → 45,000 bonus');
  const r10 = resultFor(10, 1000);
  assert.equal(r10.nftBonus, 90_000, '10 NFTs → 90,000 bonus');
});

test('C2: per-NFT allocation default is 9,000', () => {
  assert.equal(config.nftHolderBonusAllocation, 9_000);
});

test('C3: NFT bonus scales linearly with nftCount', () => {
  for (const nft of [1, 2, 3, 5, 10]) {
    const r = evaluateAllocation({ nftCount: nft, transactionCount: 100 }, config);
    assert.equal(r.nftBonus, nft * 9_000, `${nft} NFTs → ${nft * 9_000} bonus`);
    assert.equal(r.allocation, Math.min(100_000, r.baseAllocation + r.nftBonus));
  }
});

// ── Test cases 5-6 from spec ────────────────────────────────────────────────

test('5: 0 transactions + NFT is NOT eligible', () => {
  const r = resultFor(1, 0);
  assert.equal(r.eligible, false);
  assert.equal(r.allocation, 0);
  assert.equal(r.nftHolder, true);
  assert.equal(r.reason, REQUIRED_TRANSACTION_REASON);
});

test('6: 0 transactions + no NFT is NOT eligible', () => {
  const r = resultFor(0, 0);
  assert.equal(r.eligible, false);
  assert.equal(r.allocation, 0);
  assert.equal(r.nftHolder, false);
  assert.equal(r.reason, REQUIRED_TRANSACTION_REASON);
});

// ── Allocation bounds ───────────────────────────────────────────────────────

test('7: every eligible wallet allocation is at least the minimum (1)', () => {
  for (const tx of [1, 2, 3, 10, 100, 500, 5000]) {
    const r = resultFor(0, tx);
    assert.ok(r.eligible, `tx=${tx} should be eligible`);
    assert.ok(r.allocation >= 1, `tx=${tx} allocation ${r.allocation} < 1`);
  }
});

test('8: allocation never exceeds the configured maximum (100,000)', () => {
  const highCfg: AllocationConfig = { ...config, maxActivityAllocation: 1_000_000, nftHolderBonusPercent: 200 };
  for (const tx of [500, 5000, 50000]) {
    const r = evaluateAllocation({ nftCount: 1, transactionCount: tx }, highCfg);
    assert.ok(r.allocation <= 100_000, `tx=${tx} allocation ${r.allocation} > 100000`);
    assert.equal(r.allocation, clampAllocation(r.allocation, highCfg));
  }
  assert.equal(resultFor(0, 0).allocation, 0);
});

// ── Monotonicity / determinism ─────────────────────────────────────────────

test('9: more transactions never produce a lower allocation', () => {
  let previous = -1;
  for (let tx = 1; tx <= 2000; tx += 1) {
    const r = resultFor(0, tx);
    assert.ok(r.allocation >= previous, `allocation dropped at tx=${tx}: ${previous} -> ${r.allocation}`);
    previous = r.allocation;
  }
});

test('10: NFT bonus increases allocation for the same activity', () => {
  for (const tx of [1, 10, 100, 500]) {
    const noNft = resultFor(0, tx);
    const withNft = resultFor(1, tx);
    assert.equal(withNft.transactionCount, noNft.transactionCount);
    assert.ok(withNft.allocation >= noNft.allocation, `bonus eroded allocation at tx=${tx}`);
    assert.ok(withNft.nftBonus > noNft.nftBonus, 'holder bonus must be greater than non-holder bonus');
  }
});

test('activity score is monotonic and bounded to 0..100', () => {
  let prev = -1;
  for (let tx = 1; tx <= 1500; tx += 1) {
    const score = activityScore(tx, TIERS);
    assert.ok(score >= prev, `score decreased at tx=${tx}`);
    assert.ok(score >= 0 && score <= 100, `score ${score} out of range at tx=${tx}`);
    prev = score;
  }
  assert.equal(activityScore(0, TIERS), 0);
  assert.equal(activityScore(100000, TIERS), 100);
});

test('deterministic: same inputs always produce identical results', () => {
  for (const nftCount of [0, 1, 3]) {
    for (const tx of [0, 1, 9, 50, 100, 500, 5000]) {
      const a = evaluateAllocation({ nftCount, transactionCount: tx }, config);
      const b = evaluateAllocation({ nftCount, transactionCount: tx }, config);
      assert.deepEqual(a, b, `mismatch for nft=${nftCount} tx=${tx}`);
    }
  }
});

// ── Configurable bonus ──────────────────────────────────────────────────────

test('flat NFT_HOLDER_BONUS_ALLOCATION configures the per-NFT amount', () => {
  const flatCfg: AllocationConfig = { ...config, nftHolderBonusAllocation: 1250 };
  const r = evaluateAllocation({ nftCount: 3, transactionCount: 100 }, flatCfg);
  assert.equal(r.nftBonus, 3 * 1250);
});

test('NFT bonus is zero whenever no NFT is held', () => {
  for (const tx of [1, 10, 500, 5000]) {
    assert.equal(resultFor(0, tx).nftBonus, 0);
  }
  assert.equal(nftBonusFor(5000, 0, config), 0);
});

// ── Hard rules: no randomness, no mock data ───────────────────────────────

test('23: allocation engine source contains no Math.random', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../server/services/allocationEngine.ts', import.meta.url)),
    'utf8',
  );
  assert.equal(source.includes('Math.random'), false, 'allocation engine must be fully deterministic');
});

test('24/25: no mock wallet data or demo allocation values in the engine', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../server/services/allocationEngine.ts', import.meta.url)),
    'utf8',
  );
  const hardcodedAddress = /0x[0-9a-fA-F]{40}/;
  assert.equal(source.includes('Math.random'), false);
  assert.equal(hardcodedAddress.test(source), false, 'engine must not contain hardcoded wallet addresses');
  assert.equal(/\bMath\.random\b|\brandom()\b/.test(source), false);
});

// ── Tokenomics assertions ──────────────────────────────────────────────────

test('total supply = 1,000,000,000 (1B)', async () => {
  const { config: liveConfig } = await import('../server/config');
  assert.equal(liveConfig.tokenomics.totalSupply, 1_000_000_000);
});

test('allocation pool = 300,000,000 (300M)', async () => {
  const { config: liveConfig } = await import('../server/config');
  assert.equal(liveConfig.tokenomics.allocationPool, 300_000_000);
});

test('pool percentage = 30% of total supply', async () => {
  const { config: liveConfig } = await import('../server/config');
  const poolPct = (liveConfig.tokenomics.allocationPool / liveConfig.tokenomics.totalSupply) * 100;
  assert.equal(poolPct, 30);
});
