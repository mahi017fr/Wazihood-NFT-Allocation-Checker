import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { buildApp } from '../server/app';
import { ApiError, toApiErrorBody } from '../server/errors';
import { checkWalletAllocation, AllocationApiError } from '../src/services/allocationApiService';
import { verifyContractDeployedScenario } from './helpers/contractScenarioHelpers';

const VALID_WALLET = '0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29';

const SUCCESS_RESPONSE = {
  walletAddress: VALID_WALLET.toLowerCase(),
  network: 'Robinhood Chain',
  chainId: 4663,
  eligible: false,
  transactionCount: 0,
  nftHolder: false,
  nftCount: 0,
  activityScore: 0,
  nftBonus: 0,
  allocation: 0,
  allocationFinalized: false,
  allocationSource: 'new_calculation',
  reason: 'At least 1 Robinhood Chain transaction is required.',
};

const servers: Server[] = [];
const originalFetch = globalThis.fetch;

async function startTestServer(check: (wallet: string) => Promise<unknown>): Promise<{ url: string; close: () => Promise<void> }> {
  const app = buildApp({ allocationCheckService: { check } });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

test('known ApiError from the service layer survives the Express route as its original code', async () => {
  const known = new ApiError(503, 'NFT_CONTRACT_NOT_DEPLOYED', 'The configured NFT contract was not found on Robinhood Chain.');
  const { url, close } = await startTestServer(async () => {
    throw known;
  });

  const response = await fetch(`${url}/api/allocation/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ walletAddress: VALID_WALLET }),
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'NFT_CONTRACT_NOT_DEPLOYED');
  assert.equal(body.error.message, 'The configured NFT contract was not found on Robinhood Chain.');
  assert.notEqual(body.error.code, 'UPSTREAM_ERROR');
  await close();
});

test('each known structured error code survives the Express route unchanged', async () => {
  const codes = [
    new ApiError(400, 'INVALID_ADDRESS', 'Invalid wallet address.'),
    new ApiError(503, 'NFT_CONTRACT_NOT_CONFIGURED', 'Not configured.'),
    new ApiError(503, 'NFT_CONTRACT_NOT_DEPLOYED', 'Not deployed.'),
    new ApiError(502, 'NFT_CHECK_FAILED', 'Could not verify NFT ownership.'),
    new ApiError(502, 'TRANSACTION_CHECK_FAILED', 'Could not verify activity.'),
    new ApiError(502, 'RPC_UNAVAILABLE', 'RPC unavailable.'),
    new ApiError(504, 'RPC_TIMEOUT', 'Timed out.'),
    new ApiError(429, 'RATE_LIMITED', 'Rate limited.'),
    new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Provider unavailable.'),
    new ApiError(500, 'INTERNAL_ERROR', 'Internal error.'),
    new ApiError(503, 'TRANSACTION_INDEXER_NOT_CONFIGURED', 'Indexer not configured.'),
  ];

  for (const known of codes) {
    const { url, close } = await startTestServer(async () => {
      throw known;
    });
    const response = await fetch(`${url}/api/allocation/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress: VALID_WALLET }),
    });
    const body = await response.json();
    assert.equal(response.status, known.status, `status for ${known.code}`);
    assert.equal(body.success, false, `success flag for ${known.code}`);
    assert.equal(body.error.code, known.code, `code preservation for ${known.code}`);
    assert.equal(body.error.code === 'UPSTREAM_ERROR', false, `no collapse for ${known.code}`);
    await close();
  }
});

test('unknown non-ApiError from the service reaches the API as INTERNAL_ERROR, never UPSTREAM_ERROR', async () => {
  const { url, close } = await startTestServer(async () => {
    throw new Error('boom from an unforeseen code path');
  });
  const response = await fetch(`${url}/api/allocation/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ walletAddress: VALID_WALLET }),
  });
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.notEqual(body.error.code, 'UPSTREAM_ERROR');
  await close();
});

test('a 503 failure envelope keeps its backend code through the frontend allocationApiService', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.ok(url.includes('/api/allocation/check'));
    return {
      ok: false,
      status: 503,
      async json() {
        return {
          success: false,
          error: { code: 'NFT_CONTRACT_NOT_DEPLOYED', message: 'The configured NFT contract was not found on Robinhood Chain.' },
        };
      },
    } as Response;
  }) as typeof fetch;

  await assert.rejects(
    checkWalletAllocation(VALID_WALLET),
    (e: unknown) =>
      e instanceof AllocationApiError &&
      e.code === 'NFT_CONTRACT_NOT_DEPLOYED' &&
      e.message === 'The configured NFT contract was not found on Robinhood Chain.',
  );
});

test('successful service result passes through the Express route unchanged', async () => {
  const { url, close } = await startTestServer(async () => SUCCESS_RESPONSE);
  const response = await fetch(`${url}/api/allocation/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ walletAddress: VALID_WALLET }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.eligible, false);
  assert.equal('season' in body.data, false, 'API response must not contain season field');
  await close();
});

test('toApiErrorBody preserves the exact structured error for the demo contract scenario', () => {
  verifyContractDeployedScenario(toApiErrorBody);
});
