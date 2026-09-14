import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEthereumAddress, normalizeAddress, validateWalletAddress } from '../server/validation';
import { ApiError } from '../server/errors';

test('valid Ethereum addresses pass validation', () => {
  assert.equal(isValidEthereumAddress('0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29'), true);
  assert.equal(isValidEthereumAddress('0x0000000000000000000000000000000000000000'), true);
  assert.equal(isValidEthereumAddress('0x71c44f3a9b3f6b4e90b04af5796e25bb24f88f29'), true);
});

test('invalid wallet addresses fail validation', () => {
  assert.equal(isValidEthereumAddress(''), false);
  assert.equal(isValidEthereumAddress('0x1234'), false);
  assert.equal(isValidEthereumAddress('hello'), false);
  assert.equal(isValidEthereumAddress('0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'), false);
  assert.equal(isValidEthereumAddress('0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F2'), false);
  assert.equal(isValidEthereumAddress('0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F2911'), false);
  assert.equal(isValidEthereumAddress('71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29'), false);
});

test('validateWalletAddress returns normalized lowercase address', () => {
  assert.equal(
    validateWalletAddress('  0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29  '),
    '0x71c44f3a9b3f6b4e90b04af5796e25bb24f88f29',
  );
});

test('validateWalletAddress rejects missing / invalid input with ApiError 400', () => {
  assert.throws(() => validateWalletAddress(''), (e) => e instanceof ApiError && e.status === 400);
  assert.throws(() => validateWalletAddress(undefined as unknown as string), (e) => e instanceof ApiError && e.code === 'INVALID_ADDRESS');
});

test('normalizeAddress trims and lowercases', () => {
  assert.equal(normalizeAddress(' 0xABC '), '0xabc');
});