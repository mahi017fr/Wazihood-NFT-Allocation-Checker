import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { validateWalletAddress } from '../validation.js';
import { evaluateAllocation, nftBonusFor, REQUIRED_TRANSACTION_REASON, type AllocationConfig } from './allocationEngine.js';
import { getRobinhoodChainService, type RobinhoodChainService } from './robinhoodChainService.js';
import { getWaziNftService, type WaziNftService } from './waziNftService.js';
import type { AllocationRepository, AllocationRecord } from '../persistence/allocationRepository.js';
import { getAllocationRepository } from '../persistence/index.js';

export interface AllocationCheckResponse {
  walletAddress: string;
  network: string;
  chainId: number;
  eligible: boolean;
  transactionCount: number;
  nftHolder: boolean;
  nftCount: number;
  activityScore: number;
  baseAllocation: number;
  nftBonus: number;
  allocation: number;
  allocationFinalized: boolean;
  allocationSource: 'new_calculation' | 'snapshot' | 'nft_upgrade';
  /** Whether the one-time NFT bonus has been granted to this wallet. */
  nftBonusApplied: boolean;
  /** Whether this snapshot was upgraded via the one-time NFT bonus path. */
  allocationUpgraded: boolean;
  reason?: string;
}

export interface AllocationCheckServiceDeps {
  chain: Pick<RobinhoodChainService, 'getTransactionCount'>;
  nft: Pick<WaziNftService, 'getBalance' | 'isConfigured'>;
  allocationConfig: AllocationConfig;
  /** Total $WAZI in the allocation pool. */
  allocationPool: number;
  /** $WAZI of the allocation pool already committed outside this system. */
  alreadyAllocated: number;
  networkName: string;
  chainId: number;
  repository: AllocationRepository;
}

export class AllocationCheckService {
  constructor(private readonly deps: AllocationCheckServiceDeps) {}

  async check(rawWalletAddress: string): Promise<AllocationCheckResponse> {
    const walletAddress = validateWalletAddress(rawWalletAddress);
    const { chainId } = this.deps;
    const network = this.deps.networkName;

    // ── Step 1: Check persistent snapshot ──────────────────────────────────
    const existing = await this.deps.repository.findByWallet(walletAddress, network);
    if (existing) {
      return this.checkExistingSnapshot(existing, walletAddress, network);
    }

    // ── Step 2: NFT contract guard ────────────────────────────────────────
    if (!this.deps.nft.isConfigured()) {
      throw new ApiError(
        503,
        'NFT_CONTRACT_NOT_CONFIGURED',
        'Wazi NFT contract address is not configured.',
        'Set WAZI_NFT_CONTRACT_ADDRESS in the server environment before running eligibility checks.',
      );
    }

    // ── Step 3: Blockchain verification (parallel) ────────────────────────
    const [txResult, nftCount] = await Promise.all([
      this.deps.chain.getTransactionCount(walletAddress),
      this.deps.nft.getBalance(walletAddress),
    ]);

    const txCount = txResult.transactionCount;
    const holder = nftCount > 0;

    // ── Step 4: Eligibility decision ──────────────────────────────────────
    if (txCount < 1) {
      return {
        walletAddress,
        network,
        chainId,
        eligible: false,
        transactionCount: txCount,
        nftHolder: holder,
        nftCount,
        activityScore: 0,
        baseAllocation: 0,
        nftBonus: 0,
        allocation: 0,
        allocationFinalized: false,
        allocationSource: 'new_calculation',
        nftBonusApplied: false,
        allocationUpgraded: false,
        reason: REQUIRED_TRANSACTION_REASON,
      };
    }

    // ── Step 5: Deterministic allocation calculation ──────────────────────
    const calcResult = evaluateAllocation(
      { transactionCount: txCount, nftCount },
      this.deps.allocationConfig,
    );

    // ── Step 6: Persist snapshot (atomic; handles pool cap + race safety) ─
    const poolBudget =
      this.deps.allocationPool - this.deps.alreadyAllocated;
    const outcome = await this.deps.repository.createAllocationSnapshot(
      {
        walletAddress,
        network,
        allocation: calcResult.allocation,
        transactionCountAtSnapshot: txCount,
        nftHolderAtSnapshot: holder,
        nftCountAtSnapshot: nftCount,
        activityScore: calcResult.activityScore,
        baseAllocation: calcResult.baseAllocation,
        nftBonus: calcResult.nftBonus,
      },
      poolBudget,
    );

    if (outcome.status === 'pool_exhausted') {
      throw new ApiError(
        409,
        'ALLOCATION_POOL_EXHAUSTED',
        'Allocation pool is exhausted.',
        'No tokens remain in the allocation pool.',
      );
    }

    return this.toResponseFromRecord(outcome.record, outcome.status === 'created' ? 'new_calculation' : 'snapshot');
  }

  /**
   * Handles every check for a wallet that already has a finalized snapshot.
   *
   * The activity-based allocation is NEVER recalculated: the exact frozen
   * snapshot is returned unchanged. The only mutation allowed is the ONE-TIME
   * NFT upgrade: when a snapshot was created without an NFT bonus and the
   * wallet now holds the Wazi NFT, the per-NFT bonus (nftCount × 9,000)
   * is added once and the snapshot is updated to the final upgraded allocation.
   * Once the bonus has been applied (whether on the first check or via the
   * upgrade path) it can never be granted or reverted again.
   */
  private async checkExistingSnapshot(
    snapshot: AllocationRecord,
    walletAddress: string,
    network: string,
  ): Promise<AllocationCheckResponse> {
    // Bonus already granted: the frozen allocation is final. Selling or
    // transferring the NFT later must never reduce it.
    if (snapshot.nftBonusApplied || !this.deps.nft.isConfigured()) {
      return this.toResponseFromRecord(snapshot, 'snapshot');
    }

    // One-time NFT upgrade detection. A transient ownership-check failure is
    // non-fatal: the exact frozen snapshot is returned and the upgrade is
    // retried on the next check. The transaction count is never queried again.
    let nftCount: number;
    try {
      nftCount = await this.deps.nft.getBalance(walletAddress);
    } catch {
      return this.toResponseFromRecord(snapshot, 'snapshot');
    }

    if (nftCount <= 0) {
      return this.toResponseFromRecord(snapshot, 'snapshot');
    }

    const bonus = nftBonusFor(0, nftCount, this.deps.allocationConfig);

    const outcome = await this.deps.repository.applyNftUpgrade({
      walletAddress,
      network,
      bonusAllocation: bonus,
      maxAllocation: this.deps.allocationConfig.maxAllocation,
      nftCount,
    });

    if (outcome.status === 'upgraded') {
      return this.toResponseFromRecord(outcome.record, 'nft_upgrade');
    }
    // A concurrent request already applied the bonus (or the snapshot
    // disappeared); return the persisted truth — never a duplicated bonus.
    if (outcome.status === 'already_applied') {
      return this.toResponseFromRecord(outcome.record, 'snapshot');
    }
    return this.toResponseFromRecord(snapshot, 'snapshot');
  }

  private toResponseFromRecord(
    record: AllocationRecord,
    fallbackSource: AllocationCheckResponse['allocationSource'] = 'snapshot',
  ): AllocationCheckResponse {
    return {
      walletAddress: record.walletAddress,
      network: record.network,
      chainId: this.deps.chainId,
      eligible: record.allocation > 0,
      transactionCount: record.transactionCountAtSnapshot,
      nftHolder: record.nftHolderAtSnapshot,
      nftCount: record.nftCountAtSnapshot,
      activityScore: record.activityScore,
      baseAllocation: record.baseAllocation,
      nftBonus: record.nftBonus,
      allocation: record.allocation,
      allocationFinalized: true,
      allocationSource: fallbackSource,
      nftBonusApplied: record.nftBonusApplied,
      allocationUpgraded: record.nftUpgradeAt !== null,
    };
  }
}

function defaultAllocationConfig(): AllocationConfig {
  return {
    minAllocation: config.allocation.minAllocation,
    maxAllocation: config.allocation.maxAllocation,
    maxActivityAllocation: config.allocation.maxActivityAllocation,
    activityScoreTiers: config.allocation.activityScoreTiers,
    nftHolderBonusPercent: config.allocation.nftHolderBonusPercent,
    nftHolderBonusAllocation: config.allocation.nftHolderBonusAllocation,
  };
}

let sharedService: AllocationCheckService | null = null;

export function getAllocationCheckService(): AllocationCheckService {
  if (!sharedService) {
    sharedService = new AllocationCheckService({
      chain: getRobinhoodChainService(),
      nft: getWaziNftService(),
      allocationConfig: defaultAllocationConfig(),
      allocationPool: config.tokenomics.allocationPool,
      alreadyAllocated: config.tokenomics.alreadyAllocated,
      networkName: config.network.name,
      chainId: config.network.chainId,
      repository: getAllocationRepository(),
    });
  }
  return sharedService;
}

export function resetSharedServiceForTesting(): void {
  sharedService = null;
}
