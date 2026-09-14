import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { jsonRpcCall } from '../server/rpc';
import { ApiError } from '../server/errors';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetchWithResponse(status: number, body?: unknown) {
  globalThis.fetch = (async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body ?? {};
      },
    } as Response;
  }) as typeof fetch;
}

function stubFetchToThrow(message: string) {
  globalThis.fetch = (async () => {
    throw new TypeError(message);
  }) as typeof fetch;
}

async function assertRpcErrorCode(promise: Promise<unknown>, code: string, status: number) {
  await assert.rejects(promise, (e: unknown) => e instanceof ApiError && e.code === code && e.status === status);
}

test('HTTP 429 maps to RATE_LIMITED', async () => {
  stubFetchWithResponse(429);
  await assertRpcErrorCode(jsonRpcCall('https://rpc.example.org', 'eth_call', [], 5000), 'RATE_LIMITED', 429);
});

test('HTTP 500 maps to RPC_UNAVAILABLE', async () => {
  stubFetchWithResponse(500);
  await assertRpcErrorCode(jsonRpcCall('https://rpc.example.org', 'eth_call', [], 5000), 'RPC_UNAVAILABLE', 502);
});

test('network failure maps to RPC_UNAVAILABLE', async () => {
  stubFetchToThrow('fetch failed');
  await assertRpcErrorCode(jsonRpcCall('https://rpc.example.org', 'eth_call', [], 5000), 'RPC_UNAVAILABLE', 502);
});

test('empty provider URL maps to PROVIDER_UNAVAILABLE', async () => {
  await assertRpcErrorCode(jsonRpcCall('', 'eth_call', [], 5000), 'PROVIDER_UNAVAILABLE', 503);
});

test('JSON-RPC error object maps to RPC_UNAVAILABLE', async () => {
  stubFetchWithResponse(200, { jsonrpc: '2.0', error: { code: -32000, message: 'execution reverted' } });
  await assertRpcErrorCode(jsonRpcCall('https://rpc.example.org', 'eth_call', [], 5000), 'RPC_UNAVAILABLE', 502);
});

test('valid result is returned unwrapped', async () => {
  stubFetchWithResponse(200, { jsonrpc: '2.0', result: '0x01' });
  const result = await jsonRpcCall('https://rpc.example.org', 'eth_call', [], 5000);
  assert.equal(result, '0x01');
});

test('RPC_TIMEOUT fires when request exceeds the timeout', async () => {
  // A fetch stub that rejects when jsonRpcCall's own AbortController aborts.
  globalThis.fetch = ((_url: unknown, options: RequestInit | undefined) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal ?? null;
      if (signal && signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as typeof fetch;
  await assertRpcErrorCode(jsonRpcCall('https://rpc.example.org', 'eth_call', [], 50), 'RPC_TIMEOUT', 504);
});