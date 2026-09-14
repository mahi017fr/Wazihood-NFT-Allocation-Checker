import { AllocationCheckResponse, AllocationCheckError, AppConfig, ApiEnvelope } from '../types';

export class AllocationApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'AllocationApiError';
  }
}

const ETHEREUM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function isValidWalletAddress(value: string): boolean {
  return ETHEREUM_ADDRESS_RE.test(value.trim());
}

async function readApiEnvelope(response: Response): Promise<ApiEnvelope<AllocationCheckResponse> | null> {
  try {
    const payload = (await response.json()) as ApiEnvelope<AllocationCheckResponse>;
    return payload && typeof payload === 'object' && 'success' in payload ? payload : null;
  } catch {
    return null;
  }
}

function errorFromPayload(payload: ApiEnvelope<AllocationCheckResponse> | null): AllocationCheckError | null {
  if (payload && payload.success === false) return payload.error;
  return null;
}

export async function checkWalletAllocation(walletAddressInput: string): Promise<AllocationCheckResponse> {
  const walletAddress = walletAddressInput.trim();

  if (!isValidWalletAddress(walletAddress)) {
    throw new AllocationApiError(
      'INVALID_ADDRESS',
      'Invalid wallet address.',
      'Please enter a valid Robinhood Chain wallet address (0x + 40 hex characters).',
    );
  }

  let response: Response;
  try {
    response = await fetch('/api/allocation/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
  } catch {
    throw new AllocationApiError('NETWORK_ERROR', 'Unable to reach the allocation service.');
  }

  const payload = await readApiEnvelope(response);

  // A parsed failure envelope always keeps its structured backend code. Never
  // collapse known codes (e.g. NFT_CONTRACT_NOT_DEPLOYED) into UPSTREAM_ERROR.
  const failure = errorFromPayload(payload);
  if (failure) {
    throw new AllocationApiError(failure.code, failure.message, failure.details);
  }

  if (payload && payload.success) {
    return payload.data;
  }

  // Genuinely unclassifiable responses (non-JSON body, missing envelope, etc.)
  // fall back to UPSTREAM_ERROR - never for a structured backend error.
  throw new AllocationApiError('UPSTREAM_ERROR', 'The verification service returned an unexpected response.');
}

export async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const response = await fetch('/api/config');
    const payload = (await response.json()) as ApiEnvelope<AppConfig>;
    if (payload && payload.success) return payload.data;
  } catch {
    // fall through to safe defaults
  }
  return { openseaCollectionUrl: '', nftContractConfigured: false };
}