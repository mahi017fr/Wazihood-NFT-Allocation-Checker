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
  { threshold: 1, score: 1 },
  { threshold: 10, score: 10 },
  { threshold: 25, score: 20 },
  { threshold: 50, score: 30 },
  { threshold: 100, score: 50 },
  { threshold: 250, score: 60 },
  { threshold: 500, score: 70 },
  { threshold: 700, score: 80 },
  { threshold: 1000, score: 100 },
];

const config: AllocationConfig = {
  minAllocation: DEFAULT_MIN_ALLOCATION,
  maxAllocation: DEFAULT_MAX_ALLOCATION,
  maxActivityAllocation: 70_000,
  activityScoreTiers: TIERS,
  nftHolderBonusPercent: 0,
  nftHolderBonusAllocation: 25_000,
  maxNonNftAllocation: 70_000,
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

test('anchor points: transaction count maps to the exact activity score', () => {
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
    const r = resultFor(0, tx);
    assert.equal(r.eligible, true, `tx=${tx} must be eligible`);
    assert.equal(r.activityScore, score, `tx=${tx} must score exactly ${score}`);
  }
});

test('H: activity score at 100 transactions never exceeds 50', () => {
  for (let tx = 50; tx <= 100; tx += 1) {
    assert.ok(resultFor(0, tx).activityScore <= 50, `tx=${tx} score exceeds 50`);
  }
  assert.equal(resultFor(0, 100).activityScore, 50);
});

test('H2: the score curve is identical for NFT holders and non-holders', () => {
  for (const tx of [1, 100, 500, 1000]) {
    assert.equal(resultFor(1, tx).activityScore, resultFor(0, tx).activityScore, `tx=${tx}`);
  }
  assert.equal(resultFor(1, 5000).activityScore, 100);
});

test('H4: the non-NFT allocation ceiling is configurable via maxNonNftAllocation', () => {
  const cfg: AllocationConfig = { ...config, maxNonNftAllocation: 55_000 };
  const r = evaluateAllocation({ nftCount: 0, transactionCount: 5000 }, cfg);
  assert.equal(r.activityScore, 100);
  assert.equal(r.allocation, 55_000, 'non-NFT allocation must be clamped to maxNonNftAllocation');
});

test('H5: non-NFT allocation = round(score/100 * 70,000), capped at 70,000', () => {
  const expected: Array<[number, number]> = [
    [1, 700],
    [10, 7_000],
    [25, 14_000],
    [50, 21_000],
    [100, 35_000],
    [250, 42_000],
    [500, 49_000],
    [700, 56_000],
    [1000, 70_000],
    [5000, 70_000],
  ];
  for (const [tx, allocation] of expected) {
    const r = resultFor(0, tx);
    assert.equal(r.allocation, allocation, `tx=${tx} non-NFT allocation`);
    assert.ok(r.allocation <= 70_000, `tx=${tx} non-NFT allocation exceeds 70,000`);
  }
});

test('H6: NFT holder allocation = activity allocation + exactly 25,000, never above 100,000', () => {
  const expected: Array<[number, number]> = [
    [100, 60_000],
    [500, 74_000],
    [700, 81_000],
    [1000, 95_000],
  ];
  for (const [tx, allocation] of expected) {
    const r = resultFor(1, tx);
    assert.equal(r.nftBonus, 25_000, `tx=${tx} bonus must be exactly 25,000`);
    assert.equal(r.baseAllocation, resultFor(0, tx).allocation, `tx=${tx} activity allocation`);
    assert.equal(r.allocation, allocation, `tx=${tx} NFT holder allocation`);
    assert.ok(r.allocation <= 100_000, `tx=${tx} NFT allocation exceeds 100,000`);
  }
  assert.equal(resultFor(1, 5000).allocation, 95_000);
});

// ── New rules: flat 25,000 one-time NFT bonus ──────────────────────────────

test('C: NFT holder allocation includes exactly the flat +25,000 bonus', () => {
  for (const tx of [1, 10, 100, 500]) {
    const r = resultFor(1, tx);
    assert.equal(r.nftBonus, 25_000, `tx=${tx} bonus must be exactly 25,000`);
    assert.equal(r.allocation, r.baseAllocation + r.nftBonus);
  }
});

test('C2: flat NFT_HOLDER_BONUS_ALLOCATION default is 25,000', () => {
  assert.equal(config.nftHolderBonusAllocation, 25_000);
});

test('C3: percent-based bonus remains as the fallback when the flat bonus is 0', () => {
  const percentCfg: AllocationConfig = {
    ...config,
    nftHolderBonusAllocation: 0,
    nftHolderBonusPercent: 20,
  };
  const r = evaluateAllocation({ nftCount: 1, transactionCount: 500 }, percentCfg);
  assert.equal(r.nftBonus, Math.floor((r.baseAllocation * 20) / 100));
  assert.ok(r.nftBonus > 0);
});

// ── New rules: non-NFT 70,000 ceiling respected under extreme config ────────

test('J: a non-NFT wallet can never exceed 70,000 even with a huge score ceiling', () => {
  const highCfg: AllocationConfig = {
    ...config,
    maxActivityAllocation: 10_000_000,
  };
  const r = evaluateAllocation({ nftCount: 0, transactionCount: 1_000_000 }, highCfg);
  assert.equal(r.activityScore, 100, 'score reaches 100 with enough activity');
  assert.equal(r.allocation, 70_000, 'non-NFT allocation must clamp to the 70,000 ceiling');
  assert.ok(r.allocation <= 70_000, 'non-NFT allocation exceeds the 70,000 ceiling');
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

test('flat NFT_HOLDER_BONUS_ALLOCATION overrides the percent bonus', () => {
  const flatCfg: AllocationConfig = { ...config, nftHolderBonusAllocation: 1250 };
  const r = evaluateAllocation({ nftCount: 1, transactionCount: 100 }, flatCfg);
  assert.equal(r.nftBonus, 1250);
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
