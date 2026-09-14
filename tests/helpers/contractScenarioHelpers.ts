import assert from 'node:assert/strict';
import { ApiError, type ApiErrorBody } from '../../server/errors';

/**
 * Scenario helper used by route-level tests: ensures the eth_getCode == 0x demo
 * scenario maps to HTTP 503 with NFT_CONTRACT_NOT_DEPLOYED.
 */
export function verifyContractDeployedScenario(
  toApiErrorBody: (error: unknown) => { status: number; body: ApiErrorBody },
): void {
  const notDeployed = new ApiError(
    503,
    'NFT_CONTRACT_NOT_DEPLOYED',
    'The configured NFT contract was not found on Robinhood Chain.',
  );
  const { status, body } = toApiErrorBody(notDeployed);
  assert.equal(status, 503);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'NFT_CONTRACT_NOT_DEPLOYED');
  assert.equal(body.error.message, 'The configured NFT contract was not found on Robinhood Chain.');

  const checkFailed = new ApiError(502, 'NFT_CHECK_FAILED', 'Wazi NFT ownership could not be verified.');
  const checkFailure = toApiErrorBody(checkFailed);
  assert.equal(checkFailure.status, 502);
  assert.equal(checkFailure.body.error.code, 'NFT_CHECK_FAILED');
}