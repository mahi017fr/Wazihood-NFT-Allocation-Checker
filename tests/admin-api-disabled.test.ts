import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// ADMIN_API_KEY intentionally NOT set in this process: config must report the
// admin endpoints as disabled. Runs in its own process via `tsx --test`, so the
// absence here cannot leak into the other admin-api test file.

const { buildApp } = await import('../server/app');
const { SqliteAllocationRepository } = await import('../server/persistence/sqliteAllocationRepository');
const { ALLOCATION_NETWORK } = await import('../server/persistence/allocationRepository');

const servers: Server[] = [];

// The disabled test never hits /api/allocation/check; injecting a no-op check
// service keeps the app entirely in memory (no on-disk repository is opened).
const NULL_CHECK_SERVICE = {
  check: async (walletAddress: string) => ({
    walletAddress,
    eligible: true,
    allocation: 0,
    allocationSource: 'new_calculation' as const,
  }),
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const repo = new SqliteAllocationRepository(':memory:');
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

test('L: admin endpoints are disabled (503) when ADMIN_API_KEY is not configured', async () => {
  const { url, close } = await startServer();
  for (const path of ['/api/admin/allocations', '/api/admin/metrics']) {
    const response = await fetch(`${url}${path}`, {
      headers: { 'x-admin-api-key': 'any-key' },
    });
    const body = await response.json();
    assert.equal(response.status, 503, `${path} must be disabled without ADMIN_API_KEY`);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'ADMIN_API_NOT_CONFIGURED');
  }
  await close();
});