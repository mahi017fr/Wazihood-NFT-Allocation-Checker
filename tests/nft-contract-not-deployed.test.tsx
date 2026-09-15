import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AllocationApiError, checkWalletAllocation } from '../src/services/allocationApiService';
import { VerificationError } from '../src/components/VerificationError';
import { NotEligibleResult } from '../src/components/NotEligibleResult';
import type { AllocationCheckResponse } from '../src/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetchWithEnvelope(status: number, success: boolean, error?: { code: string; message: string }) {
  globalThis.fetch = (async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return success ? { success: true, data: {} } : { success: false, error };
      },
    } as Response;
  }) as typeof fetch;
}

test('backend NFT_CONTRACT_NOT_DEPLOYED code survives through the frontend API service', async () => {
  stubFetchWithEnvelope(503, false, {
    code: 'NFT_CONTRACT_NOT_DEPLOYED',
    message: 'The configured NFT contract was not found on Robinhood Chain.',
  });
  await assert.rejects(
    checkWalletAllocation('0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29'),
    (e: unknown) =>
      e instanceof AllocationApiError &&
      e.code === 'NFT_CONTRACT_NOT_DEPLOYED' &&
      e.message === 'The configured NFT contract was not found on Robinhood Chain.',
  );
});

test('structured backend error is never collapsed into UPSTREAM_ERROR', async () => {
  stubFetchWithEnvelope(503, false, {
    code: 'NFT_CHECK_FAILED',
    message: 'Wazi NFT ownership could not be verified.',
  });
  await assert.rejects(
    checkWalletAllocation('0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29'),
    (e: unknown) => e instanceof AllocationApiError && e.code === 'NFT_CHECK_FAILED',
  );
});

test('NFT_CONTRACT_NOT_DEPLOYED renders VERIFICATION TEMPORARILY UNAVAILABLE, never NOT ELIGIBLE', () => {
  const error = new AllocationApiError(
    'NFT_CONTRACT_NOT_DEPLOYED',
    'The configured NFT contract was not found on Robinhood Chain.',
  );
  const html = renderToStaticMarkup(<VerificationError error={error} onDismiss={() => {}} />);
  assert.ok(html.includes('VERIFICATION TEMPORARILY UNAVAILABLE'));
  assert.ok(html.includes('The configured Wazi NFT contract was not found on Robinhood Chain.'));
  assert.ok(html.includes('Please verify that the NFT contract address is deployed on Robinhood Chain Mainnet.'));
  assert.ok(html.includes('Error code: NFT_CONTRACT_NOT_DEPLOYED'));

  const asNotEligible = renderToStaticMarkup(
    <NotEligibleResult
      data={
        {
          walletAddress: '0x71c44f3a9b3f6b4e90b04af5796e25bb24f88f29',
          network: 'Robinhood Chain',
          chainId: 4663,
          eligible: false,
          transactionCount: 0,
          nftHolder: false,
          nftCount: 0,
          activityScore: 0,
          baseAllocation: 0,
          nftBonus: 0,
          allocation: 0,
          allocationFinalized: false,
          allocationSource: 'new_calculation',
          nftBonusApplied: false,
          allocationUpgraded: false,
          reason: 'At least 1 Robinhood Chain transaction is required.',
        } as AllocationCheckResponse
      }
      openseaCollectionUrl=""
      onReset={() => {}}
    />,
  );

  assert.equal(html.includes(asNotEligible.split('Not Eligible')[0]), false);
  assert.ok(!html.includes('You are not eligible'));
  assert.ok(!html.includes("don&#x27;t currently hold a Wazi NFT"));
});

test('NFT_CONTRACT_NOT_DEPLOYED does not instruct the user to retry', () => {
  const error = new AllocationApiError(
    'NFT_CONTRACT_NOT_DEPLOYED',
    'The configured NFT contract was not found on Robinhood Chain.',
  );
  const html = renderToStaticMarkup(<VerificationError error={error} onRetry={() => {}} />);
  assert.ok(!html.includes('TRY AGAIN'));
  assert.ok(!html.includes('Please try again in a few moments'));
});

test('retrying does not fix a wrong-chain contract - no primary retry message', () => {
  const error = new AllocationApiError(
    'NFT_CONTRACT_NOT_DEPLOYED',
    'The configured NFT contract was not found on Robinhood Chain.',
  );
  const html = renderToStaticMarkup(<VerificationError error={error} onDismiss={() => {}} />);
  assert.ok(!html.includes('Please try again in a few moments'));
});
