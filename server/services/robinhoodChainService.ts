import { ApiError } from '../errors';
import { jsonRpcCall } from '../rpc';
import { config, isDataProviderConfigured } from '../config';

export interface TransactionCountResult {
  transactionCount: number;
  capped: boolean;
}

export interface RobinhoodChainServiceDeps {
  providerUrl: string;
  timeoutMs: number;
}

export class RobinhoodChainService {
  constructor(private readonly deps: RobinhoodChainServiceDeps) {}

  private providerUrl(): string {
    if (this.deps.providerUrl) return this.deps.providerUrl;
    throw new ApiError(
      503,
      'TRANSACTION_INDEXER_NOT_CONFIGURED',
      'Blockchain data provider is not configured.',
      'Set ALCHEMY_URL or ROBINHOOD_RPC_URL.',
    );
  }

  /**
   * Returns the exact number of transactions ever sent FROM the given wallet
   * on Robinhood Chain. `eth_getTransactionCount(address, 'latest')` returns
   * the account nonce, which equals every signed transaction sent by that EOA.
   */
  async getTransactionCount(address: string): Promise<TransactionCountResult> {
    const url = this.providerUrl();
    let raw: unknown;
    try {
      raw = await jsonRpcCall(
        url,
        'eth_getTransactionCount',
        [address, 'latest'],
        this.deps.timeoutMs,
        'Robinhood Chain data provider',
      );
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'UNKNOWN';
      console.error(`[AllocationCheck] transaction count check failed code=${code} wallet=${address}`);
      throw error;
    }

    if (typeof raw !== 'string' || !raw.startsWith('0x')) {
      console.error(`[AllocationCheck] transaction count check failed code=TRANSACTION_CHECK_FAILED wallet=${address}`);
      throw new ApiError(
        502,
        'TRANSACTION_CHECK_FAILED',
        'Wallet activity could not be verified.',
        'The blockchain data provider returned an unexpected response.',
      );
    }

    try {
      const bigintValue = BigInt(raw);
      const count = bigintValue > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(bigintValue);
      return { transactionCount: Math.max(0, count), capped: false };
    } catch {
      console.error(`[AllocationCheck] transaction count check failed code=TRANSACTION_CHECK_FAILED wallet=${address}`);
      throw new ApiError(
        502,
        'TRANSACTION_CHECK_FAILED',
        'Wallet activity could not be verified.',
        'The transaction count value could not be parsed.',
      );
    }
  }
}

let sharedChainService: RobinhoodChainService | null = null;

export function getRobinhoodChainService(): RobinhoodChainService {
  if (!sharedChainService) {
    sharedChainService = new RobinhoodChainService({
      providerUrl: config.dataProvider.url,
      timeoutMs: config.dataProvider.timeoutMs,
    });
  }
  return sharedChainService;
}

export function isDataProviderAvailable(): boolean {
  return isDataProviderConfigured();
}