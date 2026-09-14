import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, toApiErrorBody, toApiSuccessBody } from '../server/errors';

test('toApiErrorBody wraps ApiError into success:false envelope', () => {
  const { status, body } = toApiErrorBody(
    new ApiError(502, 'RPC_UNAVAILABLE', 'Robinhood Chain could not be reached.', 'Try again later.'),
  );
  assert.equal(status, 502);
  assert.equal(body.success, false);
  assert.deepEqual(body.error, {
    code: 'RPC_UNAVAILABLE',
    message: 'Robinhood Chain could not be reached.',
    details: 'Try again later.',
  });
});

test('toApiErrorBody omits details when absent', () => {
  const { body } = toApiErrorBody(new ApiError(400, 'INVALID_ADDRESS', 'Invalid wallet address.'));
  assert.equal(body.success, false);
  assert.deepEqual(body.error, { code: 'INVALID_ADDRESS', message: 'Invalid wallet address.' });
});

test('toApiErrorBody maps unknown errors to INTERNAL_ERROR', () => {
  const { status, body } = toApiErrorBody(new Error('boom'));
  assert.equal(status, 500);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.equal(body.success, false);
});

test('NFT_CONTRACT_NOT_DEPLOYED maps to HTTP 503 with a structured code', () => {
  const { status, body } = toApiErrorBody(
    new ApiError(503, 'NFT_CONTRACT_NOT_DEPLOYED', 'The configured NFT contract was not found on Robinhood Chain.'),
  );
  assert.equal(status, 503);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'NFT_CONTRACT_NOT_DEPLOYED');
  assert.equal(body.error.message, 'The configured NFT contract was not found on Robinhood Chain.');
});

test('toApiSuccessBody wraps data into success:true envelope', () => {
  const payload = toApiSuccessBody({ eligible: false, allocation: { final: 0 } });
  assert.deepEqual(payload, {
    success: true,
    data: { eligible: false, allocation: { final: 0 } },
  });
});