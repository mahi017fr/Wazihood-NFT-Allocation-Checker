import { ApiError } from '../errors.js';
import { jsonRpcCall } from '../rpc.js';
import { config, isNftContractConfigured } from '../config.js';

export interface WaziNftServiceDeps {
  rpcUrl: string;
  contractAddress: string;
  standard: string;
  tokenId: string;
  timeoutMs: number;
  rpc?: RpcCall;
}

export type RpcCall = typeof jsonRpcCall;

const SELECTORS: Record<string, string> = {
  ERC721: '0x70a08231', // balanceOf(address)
  ERC1155: '0x00fdd58e', // balanceOf(address, uint256)
};

const NO_CODE = '0x';
const HEX_BODY_PATTERN = /^[0-9a-fA-F]+$/;

function padHex(value: string, bytes: number): string {
  const hex = value.replace(/^0x/, '');
  return hex.padStart(bytes * 2, '0');
}

/**
 * Safely decodes an ABI-encoded uint256 hex value into a number.
 * Returns null when the value cannot be parsed (empty, non-hex, wrong type),
 * never guessing at ownership from an unparsable response.
 */
export function decodeUint256(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.startsWith('0x')) return null;
  const body = raw.slice(2);
  if (body.length === 0 || !HEX_BODY_PATTERN.test(body)) return null;
  try {
    const bigintValue = BigInt('0x' + body);
    return bigintValue > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(bigintValue);
  } catch {
    return null;
  }
}

export class WaziNftService {
  constructor(private readonly deps: WaziNftServiceDeps) {}

  isConfigured(): boolean {
    return this.deps.contractAddress.length > 0;
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new ApiError(
        503,
        'NFT_CONTRACT_NOT_CONFIGURED',
        'Wazi NFT contract is not configured yet.',
        'Set WAZI_NFT_CONTRACT_ADDRESS in the server environment before running eligibility checks.',
      );
    }
  }

  private rpc(): RpcCall {
    return this.deps.rpc ?? jsonRpcCall;
  }

  async getBalance(address: string): Promise<number> {
    this.requireConfigured();

    const selector = SELECTORS[this.deps.standard];
    if (!selector) {
      throw new ApiError(
        503,
        'NFT_CONTRACT_NOT_CONFIGURED',
        'Wazi NFT contract is not configured yet.',
        `Standard "${this.deps.standard}" is not supported. Supported standards: ERC721, ERC1155.`,
      );
    }

    let data: string;
    if (this.deps.standard === 'ERC1155') {
      if (!this.deps.tokenId) {
        throw new ApiError(
          503,
          'NFT_CONTRACT_NOT_CONFIGURED',
          'Wazi NFT contract is not configured yet.',
          'Set WAZI_NFT_TOKEN_ID when WAZI_NFT_STANDARD is ERC1155.',
        );
      }
      data = selector + padHex(address, 32) + padHex(this.deps.tokenId, 32);
    } else {
      data = selector + padHex(address, 32);
    }

    console.log(
      `[AllocationCheck] NFT check address=${address} contract=${this.deps.contractAddress} standard=${this.deps.standard}` +
        (this.deps.standard === 'ERC1155' ? ` tokenId=${this.deps.tokenId}` : ''),
    );

    await this.verifyContractDeployed();

    let raw: unknown;
    try {
      raw = await this.rpc()(
        this.deps.rpcUrl,
        'eth_call',
        [{ to: this.deps.contractAddress, data }, 'latest'],
        this.deps.timeoutMs,
        'Robinhood Chain RPC',
      );
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'UNKNOWN';
      console.error(`[AllocationCheck] NFT balance check failed code=${code} wallet=${address}`);
      throw error;
    }

    const decoded = decodeUint256(raw);
    if (decoded === null) {
      console.error(
        `[AllocationCheck] NFT balance check failed code=NFT_CHECK_FAILED wallet=${address}` +
          ` rawType=${typeof raw} rawLength=${typeof raw === 'string' ? raw.length : 'N/A'}` +
          ` rawPrefix=${typeof raw === 'string' ? raw.slice(0, 10) : 'N/A'}`,
      );
      throw new ApiError(
        502,
        'NFT_CHECK_FAILED',
        'Wazi NFT ownership could not be verified.',
        'The NFT contract returned an unexpected balance response.',
      );
    }

    console.log(`[AllocationCheck] NFT balance decoded wallet=${address} balance=${decoded}`);
    return decoded;
  }

  /**
   * Verifies the configured address actually holds deployed code before reading
   * balances. An address with no code (eth_getCode returns 0x) means the
   * contract is misconfigured or not deployed on this chain - a configuration
   * error, never proof the wallet does not hold an NFT.
   */
  private async verifyContractDeployed(): Promise<void> {
    let code: unknown;
    try {
      code = await this.rpc()(
        this.deps.rpcUrl,
        'eth_getCode',
        [this.deps.contractAddress, 'latest'],
        this.deps.timeoutMs,
        'Robinhood Chain RPC',
      );
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError(502, 'NFT_CHECK_FAILED', 'Wazi NFT ownership could not be verified.');
      console.error(`[AllocationCheck] NFT contract code check failed code=${failure.code}`);
      throw failure;
    }

    if (typeof code !== 'string' || code === NO_CODE) {
      console.error(
        `[AllocationCheck] NFT contract NOT deployed codeLength=${typeof code === 'string' ? code.length : 'N/A'}`,
      );
      throw new ApiError(
        503,
        'NFT_CONTRACT_NOT_DEPLOYED',
        'The configured NFT contract was not found on Robinhood Chain.',
      );
    }

    console.log(`[AllocationCheck] NFT contract code present length=${typeof code === 'string' ? code.length : 0}`);
  }
}

let sharedNftService: WaziNftService | null = null;

export function getWaziNftService(): WaziNftService {
  if (!sharedNftService) {
    sharedNftService = new WaziNftService({
      rpcUrl: config.network.rpcUrl,
      contractAddress: config.waziNft.contractAddress,
      standard: config.waziNft.standard,
      tokenId: config.waziNft.tokenId,
      timeoutMs: config.network.timeoutMs,
    });
  }
  return sharedNftService;
}

export function isWaziNftConfigured(): boolean {
  return isNftContractConfigured();
}