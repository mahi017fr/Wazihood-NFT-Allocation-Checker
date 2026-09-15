import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// MUST be set before any server module import: config.js reads env at load time.
// Runs in its own process via `tsx --test`.
process.env.ADMIN_API_KEY = 'test-admin-secret-key';

const { buildApp } = await import('../server/app');
const { SqliteAllocationRepository } = await import('../server/persistence/sqliteAllocationRepository');
const { ALLOCATION_NETWORK } = await import('../server/persistence/allocationRepository');
const { config } = await import('../server/config');

const NETWORK = ALLOCATION_NETWORK;
const WALLET_A = '0x' + 'a'.repeat(40);
const WALLET_B = '0x' + 'b'.repeat(40);

// The admin tests never hit /api/allocation/check, so no real check service (and
// therefore no on-disk repository) is needed; the injected repo is fully in memory.
const NULL_CHECK_SERVICE = {
  check: async (walletAddress: string) => ({
    walletAddress,
    eligible: true,
    allocation: 0,
    allocationSource: 'new_calculation' as const,
  }),
};

const servers: Server[] = [];

async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const repo = new SqliteAllocationRepository(':memory:');
  await repo.createAllocationSnapshot(
    {
      walletAddress: WALLET_A,
      network: NETWORK,
      allocation: 22_500,
      transactionCountAtSnapshot: 100,
      nftHolderAtSnapshot: false,
      nftCountAtSnapshot: 0,
      activityScore: 75,
      baseAllocation: 22_500,
      nftBonus: 0,
    },
    300_000_000,
  );
  await repo.createAllocationSnapshot(
    {
      walletAddress: WALLET_B,
      network: NETWORK,
      allocation: 18_500,
      transactionCountAtSnapshot: 42,
      nftHolderAtSnapshot: true,
      nftCountAtSnapshot: 1,
      activityScore: 78,
      baseAllocation: 16_500,
      nftBonus: 2_000,
    },
    300_000_000,
  );
  await repo.applyNftUpgrade({
    walletAddress: WALLET_A,
    network: NETWORK,
    bonusAllocation: 25_000,
    maxAllocation: 100_000,
    nftCount: 1,
  });

  const app = buildApp({ allocationRepository: repo, allocationCheckService: NULL_CHECK_SERVICE });
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
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

test('L: admin allocations endpoint rejects requests without an API key', async () => {
  const { url, close } = await startServer();
  const response = await fetch(`${url}/api/admin/allocations`);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'UNAUTHORIZED');
  await close();
});

test('L: admin endpoints reject a wrong API key', async () => {
  const { url, close } = await startServer();
  for (const path of ['/api/admin/allocations', '/api/admin/metrics']) {
    const response = await fetch(`${url}${path}`, {
      headers: { 'x-admin-api-key': 'wrong-key' },
    });
    const body = await response.json();
    assert.equal(response.status, 401, `${path} must reject a wrong key`);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  }
  await close();
});

test('M: admin allocations endpoint returns paginated allocation records with the correct key', async () => {
  const { url, close } = await startServer();
  const response = await fetch(`${url}/api/admin/allocations`, {
    headers: { 'x-admin-api-key': 'test-admin-secret-key' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.pagination.total, 2);
  assert.equal(body.data.records.length, 2);

  const upgraded = body.data.records.find((r: { walletAddress: string }) => r.walletAddress === WALLET_A);
  const plain = body.data.records.find((r: { walletAddress: string }) => r.walletAddress === WALLET_B);
  assert.ok(upgraded);
  assert.ok(plain);
  assert.equal(upgraded.allocation, 47_500);
  assert.equal(upgraded.activityScore, 75);
  assert.equal(upgraded.transactionCount, 100);
  assert.equal(upgraded.baseAllocation, 22_500);
  assert.equal(upgraded.nftHolder, true);
  assert.equal(upgraded.nftBonus, 25_000);
  assert.equal(upgraded.nftBonusApplied, true);
  assert.equal(upgraded.allocationSource, 'nft_upgrade');
  assert.equal(upgraded.allocationUpgraded, true);
  assert.ok(upgraded.createdAt, 'created_at must be present');
  assert.ok(upgraded.updatedAt, 'updated_at must be present');
  assert.ok(upgraded.nftUpgradeAt, 'nft upgrade timestamp must be present for upgraded wallets');

  assert.equal(plain.allocation, 18_500);
  assert.equal(plain.nftBonusApplied, true);
  assert.equal(plain.allocationUpgraded, false);
  assert.equal(plain.allocationSource, 'snapshot');
  assert.equal(plain.nftUpgradeAt, null);
  await close();
});

test('M: admin allocations pagination works (limit + offset)', async () => {
  const { url, close } = await startServer();
  const first = await (await fetch(`${url}/api/admin/allocations?limit=1&offset=0`, {
    headers: { 'x-admin-api-key': 'test-admin-secret-key' },
  })).json();
  assert.equal(first.data.records.length, 1);
  assert.equal(first.data.pagination.total, 2);
  const second = await (await fetch(`${url}/api/admin/allocations?limit=1&offset=1`, {
    headers: { 'x-admin-api-key': 'test-admin-secret-key' },
  })).json();
  assert.equal(second.data.records.length, 1);
  assert.notEqual(
    first.data.records[0].walletAddress,
    second.data.records[0].walletAddress,
    'offset must page into the next record',
  );
  await close();
});

test('M: admin metrics endpoint returns aggregate statistics with the correct key', async () => {
  const { url, close } = await startServer();
  const response = await fetch(`${url}/api/admin/metrics`, {
    headers: { authorization: 'Bearer test-admin-secret-key' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.network, NETWORK);
  assert.equal(body.data.totalWalletsChecked, 2);
  assert.equal(body.data.totalEligibleWallets, 2);
  assert.equal(body.data.totalAllocated, 66_000);
  assert.equal(body.data.totalNftBonusAllocated, 27_000);
  assert.equal(body.data.nftUpgradedWallets, 1);
  assert.equal(body.data.remainingPool, Math.max(0, config.tokenomics.allocationPool - 66_000));
  await close();
});

test('L: public metrics endpoint is unaffected and requires no key', async () => {
  const { url, close } = await startServer();
  const response = await fetch(`${url}/api/metrics`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.amountAllocated, 66_000);
  await close();
});