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
  nftBonus: number;
  createdAt: string;
}

export interface CreateAllocationSnapshotInput {
  walletAddress: string;
  network: string;
  allocation: number;
  transactionCountAtSnapshot: number;
  nftHolderAtSnapshot: boolean;
  nftCountAtSnapshot: number;
  activityScore: number;
  nftBonus: number;
}

export type CreateSnapshotOutcome =
  | { status: 'created'; record: AllocationRecord }
  /** Another request already finalized this wallet's snapshot. */
  | { status: 'existing'; record: AllocationRecord }
  /** Remaining allocation pool cannot cover a new allocation. */
  | { status: 'pool_exhausted' };

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

  close(): Promise<void>;
}
