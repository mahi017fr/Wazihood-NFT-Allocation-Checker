/** Mirrors the backend /api/allocation/check response for the
 *  transaction-activity-based eligibility system.
 *
 *  Eligibility = at least 1 Robinhood Chain transaction.
 *  Wazi NFT ownership is BONUS information only (adds to the allocation).
 */

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
  allocationFinalized: boolean;
  allocationSource: 'new_calculation' | 'snapshot';
  reason?: string;
}

export interface NetworkMetrics {
  network: string;
  allocationPool: number;
  amountAllocated: number;
  remainingPool: number;
  totalWaziNftHolders: number | null;
  totalWaziNftSupply: number | null;
  totalIndexedTransactions: number | null;
}

export interface AllocationCheckError {
  code: string;
  message: string;
  details?: string;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiFailureEnvelope {
  success: false;
  error: AllocationCheckError;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiFailureEnvelope;

export interface AppConfig {
  openseaCollectionUrl: string;
  nftContractConfigured: boolean;
}

export type ScannerStage =
  | 'idle'
  | 'scanning_wallet'
  | 'checking_nft'
  | 'analyzing_activity'
  | 'calculating_allocation'
  | 'complete';
