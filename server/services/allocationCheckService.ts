import { config } from '../config';
import { ApiError } from '../errors';
import { validateWalletAddress } from '../validation';
import { evaluateAllocation, REQUIRED_TRANSACTION_REASON, type AllocationConfig } from './allocationEngine';
import { getRobinhoodChainService, type RobinhoodChainService } from './robinhoodChainService';
import { getWaziNftService, type WaziNftService } from './waziNftService';
import type { AllocationRepository, AllocationRecord } from '../persistence/allocationRepository';
import { getAllocationRepository } from '../persistence/index';

export interface AllocationCheckResponse {
  walletAddress: string;
  network: string;
  chainId: number;
  eligible: boolean;
  transactionCount: number;
  nftHolder: boolean;
  nftCount: number;
  activityScore: number;
  nftBonus: number;
  allocation: number;
  season: string;
  allocationFinalized: boolean;
  allocationSource: 'new_calculation' | 'snapshot';
  reason?: string;
}

export interface AllocationCheckServiceDeps {
  chain: Pick<RobinhoodChainService, 'getTransactionCount'>;
  nft: Pick<WaziNftService, 'getBalance' | 'isConfigured'>;
  allocationConfig: AllocationConfig;
  /** $WAZI of the Season 01 pool already committed outside this system. */
  alreadyAllocated: number;
  season: string;
  networkName: string;
  chainId: number;
  repository: AllocationRepository;
}

export class AllocationCheckService {
  constructor(private readonly deps: AllocationCheckServiceDeps) {}

  async check(rawWalletAddress: string): Promise<AllocationCheckResponse> {
    const walletAddress = validateWalletAddress(rawWalletAddress);
    const { season, chainId } = this.deps;
    const network = this.deps.networkName;

    // ── Step 1: Check persistent snapshot ──────────────────────────────────
    const existing = await this.deps.repository.findByWallet(walletAddress, season, network);
    if (existing) {
      return this.toResponseFromRecord(existing);
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
        nftBonus: 0,
        allocation: 0,
        season,
        allocationFinalized: false,
        allocationSource: 'new_calculation',
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
      this.deps.allocationConfig.season1Pool - this.deps.alreadyAllocated;
    const outcome = await this.deps.repository.createAllocationSnapshot(
      {
        walletAddress,
        season,
        network,
        allocation: calcResult.allocation,
        transactionCountAtSnapshot: txCount,
        nftHolderAtSnapshot: holder,
        nftCountAtSnapshot: nftCount,
        activityScore: calcResult.activityScore,
        nftBonus: calcResult.nftBonus,
      },
      poolBudget,
    );

    if (outcome.status === 'pool_exhausted') {
      throw new ApiError(
        409,
        'ALLOCATION_POOL_EXHAUSTED',
        'Season 01 allocation pool is exhausted.',
        'No tokens remain in the Season 01 allocation pool.',
      );
    }

    return this.toResponseFromRecord(outcome.record, outcome.status === 'created' ? 'new_calculation' : 'snapshot');
  }

  private toResponseFromRecord(
    record: AllocationRecord,
    fallbackSource: 'new_calculation' | 'snapshot' = 'snapshot',
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
      nftBonus: record.nftBonus,
      allocation: record.allocation,
      season: record.season,
      allocationFinalized: true,
      allocationSource: fallbackSource,
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
    season1Pool: config.tokenomics.season1Pool,
  };
}

let sharedService: AllocationCheckService | null = null;

export function getAllocationCheckService(): AllocationCheckService {
  if (!sharedService) {
    sharedService = new AllocationCheckService({
      chain: getRobinhoodChainService(),
      nft: getWaziNftService(),
      allocationConfig: defaultAllocationConfig(),
      alreadyAllocated: config.tokenomics.alreadyAllocated,
      season: config.allocation.season,
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