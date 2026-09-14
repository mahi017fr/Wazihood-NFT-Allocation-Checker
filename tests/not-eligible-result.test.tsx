import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { NotEligibleResult } from '../src/components/NotEligibleResult';
import type { AllocationCheckResponse } from '../src/types';

const data: AllocationCheckResponse = {
  walletAddress: '0x71c44f3a9b3f6b4e90b04af5796e25bb24f88f29',
  network: 'Robinhood Chain',
  chainId: 4663,
  eligible: false,
  transactionCount: 0,
  nftHolder: false,
  nftCount: 0,
  activityScore: 0,
  nftBonus: 0,
  allocation: 0,
  season: 'Season 01',
  allocationFinalized: false,
  allocationSource: 'new_calculation',
  reason: 'At least 1 Robinhood Chain transaction is required.',
};

test('not eligible shows the required message, never the old NFT-required reason', () => {
  const html = renderToStaticMarkup(
    <NotEligibleResult data={data} openseaCollectionUrl="" onReset={() => {}} />,
  );
  assert.ok(html.includes('>NOT</span>'));
  assert.ok(html.includes('>ELIGIBLE</span>'));
  assert.ok(html.includes('At least 1 Robinhood Chain transaction is required.'));
  assert.ok(html.includes('Not Eligible'));
  assert.ok(html.includes('0 $WAZI'));
  assert.ok(html.includes('Robinhood Transactions'));
  assert.equal(html.includes("don&#x27;t currently hold a Wazi NFT"), false);
  assert.equal(html.includes('Wazi NFT not held'), false);
});

test('non-eligible shows NFT status as Holder / Not a Holder', () => {
  const html = renderToStaticMarkup(
    <NotEligibleResult data={data} openseaCollectionUrl="" onReset={() => {}} />,
  );
  assert.ok(html.includes('Not a Holder'));
});

test('NFT holder status still shown for a non-eligible wallet that holds an NFT', () => {
  const holderData: AllocationCheckResponse = { ...data, nftHolder: true, nftCount: 2 };
  const html = renderToStaticMarkup(
    <NotEligibleResult data={holderData} openseaCollectionUrl="" onReset={() => {}} />,
  );
  assert.ok(html.includes('Holder'));
  assert.ok(html.includes('At least 1 Robinhood Chain transaction is required.'));
});

test('OpenSea CTA is visible for a bonus-focused CTA when URL is configured', () => {
  const url = 'https://opensea.io/collection/wazihood';
  const html = renderToStaticMarkup(
    <NotEligibleResult data={data} openseaCollectionUrl={url} onReset={() => {}} />,
  );
  assert.ok(html.includes('GET A WAZI NFT'));
  assert.ok(html.includes(`href="${url}"`));
  assert.ok(html.includes('target="_blank"'));
});

test('never fabricates an OpenSea URL when not configured', () => {
  const html = renderToStaticMarkup(
    <NotEligibleResult data={data} openseaCollectionUrl="" onReset={() => {}} />,
  );
  assert.ok(html.includes('GET A WAZI NFT'));
  assert.equal(html.toLowerCase().includes('opensea.io'), false);
});

test('the bonus-focused NFT explanation line is always visible', () => {
  const html = renderToStaticMarkup(
    <NotEligibleResult data={data} openseaCollectionUrl="" onReset={() => {}} />,
  );
  assert.ok(html.includes('Get a Wazi NFT to add a bonus on top of your activity-based allocation.'));
});