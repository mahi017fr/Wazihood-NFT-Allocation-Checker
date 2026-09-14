import { ApiError } from './errors';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isValidEthereumAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value);
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function validateWalletAddress(raw: string): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    throw new ApiError(400, 'INVALID_ADDRESS', 'A wallet address is required.', 'Missing wallet address.');
  }
  if (!isValidEthereumAddress(value)) {
    throw new ApiError(
      400,
      'INVALID_ADDRESS',
      'Invalid wallet address.',
      'The address must be a 0x-prefixed, 40 character hex Ethereum address.',
    );
  }
  return normalizeAddress(value);
}