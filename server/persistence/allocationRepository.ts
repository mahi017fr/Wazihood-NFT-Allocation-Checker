/**
 * Persistent allocation snapshot repository.
 *
 * The module-level Shape of the $WAZI allocation snapshot. A wallet may
 * only ever own ONE allocation per (walletAddress, network). Once a
 * snapshot is created it is final: later checks return the stored value and
 * never recalculate.
 *
 * The repository interface is deliberately storage-agnostic so the deployed
 * backend can swap SQLite for a production-grade remote database (e.g. a
 * hosted Postgres or a distributed SQLite service) without touching the
 * service layer.
 */

export const ALLOCATION_NETWORK = 'Robinhood Chain';

export interface AllocationRecord {
  id: number;
  /** Normalized lowercase wallet address - the only lookup key. */
  walletAddress: string;
  network: string;
  allocation: number;
  transactionCountAtSnapshot: number;
  nftHolderAtSnapshot: boolean;
  nftCountAtSnapshot: number;
  activityScore: number;
  /** Activity-derived allocation BEFORE any NFT bonus (frozen at snapshot). */
  baseAllocation: number;
  nftBonus: number;
  /** Whether the one-time NFT +bonus has been granted (=== nftBonus > 0). */
  nftBonusApplied: boolean;
  /** When the one-time NFT bonus was granted via the upgrade path; null otherwise. */
  nftUpgradeAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAllocationSnapshotInput {
  walletAddress: string;
  network: string;
  allocation: number;
  transactionCountAtSnapshot: number;
  nftHolderAtSnapshot: boolean;
  nftCountAtSnapshot: number;
  activityScore: number;
  baseAllocation: number;
  nftBonus: number;
}

export type CreateSnapshotOutcome =
  | { status: 'created'; record: AllocationRecord }
  /** Another request already finalized this wallet's snapshot. */
  | { status: 'existing'; record: AllocationRecord }
  /** Remaining allocation pool cannot cover a new allocation. */
  | { status: 'pool_exhausted' };

export interface ApplyNftUpgradeInput {
  walletAddress: string;
  network: string;
  /** One-time bonus to grant exactly once (nftCount × per-NFT allocation). */
  bonusAllocation: number;
  /** Absolute per-wallet allocation cap; the upgraded allocation never exceeds it. */
  maxAllocation: number;
  /** Current NFT count, persisted onto the snapshot at upgrade time. */
  nftCount: number;
}

export type ApplyNftUpgradeOutcome =
  | { status: 'upgraded'; record: AllocationRecord }
  /** Another request (or an earlier one) already granted the one-time bonus. */
  | { status: 'already_applied'; record: AllocationRecord }
  /** No finalized snapshot exists for the wallet/network. */
  | { status: 'not_found' };

export interface ListAllocationsOptions {
  limit: number;
  offset: number;
}

export interface ListAllocationsResult {
  records: AllocationRecord[];
  total: number;
}

export interface AllocationStats {
  totalWallets: number;
  eligibleWallets: number;
  totalAllocated: number;
  totalNftBonus: number;
  nftUpgradedWallets: number;
}

/**
 * Storage backend for allocation snapshots. This interface is deliberately
 * async so both local development (SQLite) and the production PostgreSQL store
 * behave identically from the service layer's perspective.
 */
export interface AllocationRepository {
  findByWallet(
    walletAddress: string,
    network: string,
  ): Promise<AllocationRecord | null>;

  /**
   * Atomically creates the wallet's snapshot unless one already exists.
   * Applied pool cap: when the remaining pool is insufficient for the
   * requested allocation the stored allocation is capped to the remaining
   * pool; when nothing remains the outcome is `pool_exhausted` and no row is
   * written. Implementations must guarantee the same wallet/network can
   * never be stored twice, even under simultaneous requests, via a database
   * unique constraint and an insert-or-read-existing flow.
   *
   * @param poolBudget total allocation pool budget available for new snapshots.
   */
  createAllocationSnapshot(
    input: CreateAllocationSnapshotInput,
    poolBudget: number,
  ): Promise<CreateSnapshotOutcome>;

  totalAllocated(network: string): Promise<number>;

  countAllocations(network: string): Promise<number>;

  /**
   * Atomically grants the one-time NFT upgrade bonus to an already-finalized
   * snapshot. The activity-derived allocation is never recalculated; only the
   * flat bonus is added (respecting maxAllocation). Implementations must make
   * it impossible for the bonus to be granted twice for the same wallet, even
   * under simultaneous requests (database-level conditional update).
   */
  applyNftUpgrade(input: ApplyNftUpgradeInput): Promise<ApplyNftUpgradeOutcome>;

  /** Paginated listing of finalized allocation snapshots for admin use. */
  listAllocations(
    network: string,
    options: ListAllocationsOptions,
  ): Promise<ListAllocationsResult>;

  /** Aggregates over finalized snapshots for the admin metrics endpoint. */
  allocationStats(network: string): Promise<AllocationStats>;

  close(): Promise<void>;
}
