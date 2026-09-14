/**
 * Deterministic eligibility + allocation engine.
 *
 * Eligibility is purely activity based:
 *   transactionCount >= 1  → eligible
 *   transactionCount === 0 → NOT eligible
 *
 * Wazi NFT ownership is BONUS information only. It never grants eligibility
 * and never takes it away. Allocation grows monotonically with real transaction
 * activity via a configurable score curve, then an optional NFT holder bonus is
 * added, and the result is clamped to the configured [1, 100,000] range.
 *
 * There is intentionally NO randomness, no per-wallet hardcoding and no
 * fabricated values - everything derives from real indexer/chain inputs plus
 * configuration.
 */

export interface ScoreTier {
  threshold: number;
  score: number;
}

export interface AllocationConfig {
  minAllocation: number;
  maxAllocation: number;
  /** $WAZI awarded when a wallet reaches activityScore = 100. */
  maxActivityAllocation: number;
  /** Monotonic transaction-count → score curve (score capped at 100). */
  activityScoreTiers: ScoreTier[];
  /** Bonus percent (of the activity-based allocation) paid to NFT holders. */
  nftHolderBonusPercent: number;
  /** Flat $WAZI bonus paid to NFT holders; used when > 0, overriding percent. */
  nftHolderBonusAllocation: number;
}

export interface AllocationInput {
  transactionCount: number;
  nftCount: number;
}

export interface AllocationResult {
  eligible: boolean;
  transactionCount: number;
  nftHolder: boolean;
  nftCount: number;
  activityScore: number;
  baseAllocation: number;
  /** 0 when the wallet holds no NFT. */
  nftBonus: number;
  /** Final per-wallet allocation, clamped to [minAllocation, maxAllocation]. 0 if not eligible. */
  allocation: number;
  reason?: string;
}

export const DEFAULT_MIN_ALLOCATION = 1;
export const DEFAULT_MAX_ALLOCATION = 100_000;
export const REQUIRED_TRANSACTION_REASON = 'At least 1 Robinhood Chain transaction is required.';

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Normalizes a configured score curve into ascending, strictly-positive
 * thresholds. Thresholds at or below zero are dropped; the lowest threshold is
 * lifted to >= 1 so the curve is well defined for any transaction count.
 */
export function normalizeScoreTiers(tiers: ScoreTier[], fallback: ScoreTier[]): ScoreTier[] {
  if (!Array.isArray(tiers) || tiers.length === 0) return fallback;
  const cleaned = tiers
    .filter((t) => Number.isFinite(t.threshold) && Number.isFinite(t.score))
    .map((t) => ({
      threshold: t.threshold <= 0 ? 1 : t.threshold,
      score: Math.max(0, Math.min(100, t.score)),
    }))
    .sort((a, b) => a.threshold - b.threshold);
  if (cleaned.length === 0) return fallback;
  return cleaned;
}

/**
 * Monotonic, non-decreasing activity score derived from the real transaction
 * count. Score is linearly interpolated between configured curve points and
 * clamped to the curve's [min score, 100] range. More transactions can never
 * produce a lower score.
 */
export function activityScore(
  transactionCount: number,
  tiers: ScoreTier[],
  fallbackTiers: ScoreTier[] = DEFAULT_ACTIVITY_SCORE_TIERS,
): number {
  if (!isPositiveFinite(transactionCount)) return 0;
  const points = normalizeScoreTiers(tiers, fallbackTiers);
  const first = points[0];
  if (transactionCount <= first.threshold) return first.score;
  const last = points[points.length - 1];
  if (transactionCount >= last.threshold) return last.score;

  for (let i = 0; i < points.length - 1; i += 1) {
    const lo = points[i];
    const hi = points[i + 1];
    if (transactionCount >= lo.threshold && transactionCount < hi.threshold) {
      const span = hi.threshold - lo.threshold;
      const ratio = span > 0 ? (transactionCount - lo.threshold) / span : 0;
      return Math.floor(lo.score + ratio * (hi.score - lo.score));
    }
  }
  return first.score;
}

/** $WAZI allocated purely from on-chain activity. */
export function baseAllocationFromScore(score: number, maxActivityAllocation: number): number {
  if (score <= 0) return 0;
  return Math.floor((Math.min(100, score) / 100) * maxActivityAllocation);
}

/**
 * Optional NFT holder bonus on top of the activity allocation. Uses the flat
 * NFT_HOLDER_BONUS_ALLOCATION when defined; otherwise applies
 * NFT_HOLDER_BONUS_PERCENT to the activity allocation. Zero when no NFT held.
 */
export function nftBonusFor(
  baseAllocation: number,
  nftCount: number,
  cfg: Pick<AllocationConfig, 'nftHolderBonusPercent' | 'nftHolderBonusAllocation'>,
): number {
  if (nftCount <= 0) return 0;
  if (isPositiveFinite(cfg.nftHolderBonusAllocation)) return Math.floor(cfg.nftHolderBonusAllocation);
  if (isPositiveFinite(cfg.nftHolderBonusPercent)) {
    return Math.floor((baseAllocation * cfg.nftHolderBonusPercent) / 100);
  }
  return 0;
}

/** Clamps an eligible allocation into the configured 1–100,000 range. */
export function clampAllocation(
  amount: number,
  cfg: Pick<AllocationConfig, 'minAllocation' | 'maxAllocation'>,
): number {
  const min = cfg.minAllocation > 0 ? Math.floor(cfg.minAllocation) : DEFAULT_MIN_ALLOCATION;
  const max = cfg.maxAllocation > 0 ? Math.floor(cfg.maxAllocation) : DEFAULT_MAX_ALLOCATION;
  return Math.min(max, Math.max(min, Math.floor(amount)));
}

export function evaluateAllocation(input: AllocationInput, cfg: AllocationConfig): AllocationResult {
  const eligible = input.transactionCount >= 1;
  const transactionCount = Math.max(0, Math.floor(input.transactionCount));
  const nftHolder = input.nftCount > 0;
  const nftCount = Math.max(0, input.nftCount);

  if (!eligible) {
    return {
      eligible: false,
      transactionCount,
      nftHolder,
      nftCount,
      activityScore: 0,
      baseAllocation: 0,
      nftBonus: 0,
      allocation: 0,
      reason: REQUIRED_TRANSACTION_REASON,
    };
  }

  const score = activityScore(transactionCount, cfg.activityScoreTiers);
  const baseAllocation = baseAllocationFromScore(score, cfg.maxActivityAllocation);
  const bonus = nftBonusFor(baseAllocation, nftCount, cfg);
  const allocation = clampAllocation(baseAllocation + bonus, cfg);

  return {
    eligible: true,
    transactionCount,
    nftHolder,
    nftCount,
    activityScore: score,
    baseAllocation,
    nftBonus: bonus,
    allocation,
  };
}

const DEFAULT_ACTIVITY_SCORE_TIERS: ScoreTier[] = [
  { threshold: 1, score: 10 },
  { threshold: 5, score: 25 },
  { threshold: 10, score: 40 },
  { threshold: 25, score: 55 },
  { threshold: 50, score: 70 },
  { threshold: 100, score: 80 },
  { threshold: 250, score: 92 },
  { threshold: 500, score: 100 },
];