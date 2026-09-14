import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WaziNftService, decodeUint256, type WaziNftServiceDeps } from '../server/services/waziNftService';
import { ApiError } from '../server/errors';

const CONTRACT = '0x46A41016d1D9c120C7BDEDE3A95b98702A38bAa0';
const WALLET = '0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29';
const TOKEN_ID = '75622';
const DEPLOYED_CODE = '0x6080604052';

const ZERO32 = '0x' + '0'.repeat(64); // uint256 0
const ONE32 = '0x' + '0'.repeat(63) + '1'; // uint256 1
const THREE32 = '0x' + '0'.repeat(63) + '3'; // uint256 3

type RpcBehavior = {
  getCode: unknown;
  call: unknown;
  throwOn?: 'getCode' | 'call';
  error?: ApiError;
};

function stubRpc(behavior: RpcBehavior): WaziNftServiceDeps['rpc'] {
  return async (_url: string, method: string) => {
    if (behavior.throwOn && method === 'eth_' + behavior.throwOn) throw behavior.error;
    if (method === 'eth_getCode') return behavior.getCode;
    if (method === 'eth_call') return behavior.call;
    return undefined;
  };
}

function buildService(behavior: RpcBehavior): WaziNftService {
  return new WaziNftService({
    rpcUrl: 'https://rpc.test',
    contractAddress: CONTRACT,
    standard: 'ERC721',
    tokenId: TOKEN_ID,
    timeoutMs: 5000,
    rpc: stubRpc(behavior),
  });
}

function buildService1155(behavior: RpcBehavior): WaziNftService {
  return new WaziNftService({
    rpcUrl: 'https://rpc.test',
    contractAddress: CONTRACT,
    standard: 'ERC1155',
    tokenId: TOKEN_ID,
    timeoutMs: 5000,
    rpc: stubRpc(behavior),
  });
}

async function assertCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (e: unknown) => e instanceof ApiError && e.code === code);
}

test('ERC-721 balanceOf(0x0...) decodes to 0', async () => {
  const service = buildService({ getCode: DEPLOYED_CODE, call: ZERO32 });
  assert.equal(await service.getBalance(WALLET), 0);
});

test('ERC-721 balanceOf(0x0...1) decodes to 1', async () => {
  const service = buildService({ getCode: DEPLOYED_CODE, call: ONE32 });
  assert.equal(await service.getBalance(WALLET), 1);
});

test('ERC-721 balanceOf(0x0...3) decodes to multiple', async () => {
  const service = buildService({ getCode: DEPLOYED_CODE, call: THREE32 });
  assert.equal(await service.getBalance(WALLET), 3);
});

test('ERC-1155 balanceOf(address, tokenId) decodes to 0', async () => {
  const service = buildService1155({ getCode: DEPLOYED_CODE, call: ZERO32 });
  assert.equal(await service.getBalance(WALLET), 0);
});

test('ERC-1155 balanceOf(address, tokenId) decodes to positive', async () => {
  const service = buildService1155({ getCode: DEPLOYED_CODE, call: THREE32 });
  assert.equal(await service.getBalance(WALLET), 3);
});

test('empty eth_call result is a verification error, not non-eligible', async () => {
  const service = buildService({ getCode: DEPLOYED_CODE, call: '0x' });
  await assertCode(service.getBalance(WALLET), 'NFT_CHECK_FAILED');
});

test('malformed eth_call result is a verification error', async () => {
  const service = buildService({ getCode: DEPLOYED_CODE, call: '0xzzzz' });
  await assertCode(service.getBalance(WALLET), 'NFT_CHECK_FAILED');
});

test('eth_call RPC failure propagates as a verification error', async () => {
  const service = buildService({
    getCode: DEPLOYED_CODE,
    call: '0x',
    throwOn: 'call',
    error: new ApiError(502, 'RPC_UNAVAILABLE', 'Robinhood Chain could not be reached.'),
  });
  await assertCode(service.getBalance(WALLET), 'RPC_UNAVAILABLE');
});

test('eth_getCode returning 0x yields HTTP 503 NFT_CONTRACT_NOT_DEPLOYED config error, never NFT-not-held', async () => {
  const service = buildService({ getCode: '0x', call: '0x' });
  await assert.rejects(service.getBalance(WALLET), (e: unknown) => {
    return (
      e instanceof ApiError &&
      e.code === 'NFT_CONTRACT_NOT_DEPLOYED' &&
      e.status === 503 &&
      e.message === 'The configured NFT contract was not found on Robinhood Chain.'
    );
  });
});

test('correctly configured deployed contract returns its NFT count', async () => {
  const service = buildService1155({ getCode: DEPLOYED_CODE, call: ONE32 });
  assert.equal(await service.getBalance(WALLET), 1);
});

test('decodeUint256 rejects empty, malformed, and non-string values', () => {
  assert.equal(decodeUint256('0x'), null);
  assert.equal(decodeUint256('0xnothex'), null);
  assert.equal(decodeUint256('123'), null);
  assert.equal(decodeUint256(42), null);
  assert.equal(decodeUint256(null), null);
  assert.equal(decodeUint256(ZERO32), 0);
  assert.equal(decodeUint256(ONE32), 1);
});