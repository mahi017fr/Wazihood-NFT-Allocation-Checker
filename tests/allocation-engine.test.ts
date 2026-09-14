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
  { threshold: 1, score: 10 },
  { threshold: 5, score: 25 },
  { threshold: 10, score: 40 },
  { threshold: 25, score: 55 },
  { threshold: 50, score: 70 },
  { threshold: 100, score: 80 },
  { threshold: 250, score: 92 },
  { threshold: 500, score: 100 },
];

const config: AllocationConfig = {
  minAllocation: DEFAULT_MIN_ALLOCATION,
  maxAllocation: DEFAULT_MAX_ALLOCATION,
  maxActivityAllocation: 30_000,
  activityScoreTiers: TIERS,
  nftHolderBonusPercent: 20,
  nftHolderBonusAllocation: 0,
  season1Pool: 30_000_000_000,
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