import test from 'node:test';
import assert from 'node:assert/strict';
import { loginLimitReached, loginRateLimitKeys } from './login-rate-limit.js';

test('login limiter hashes IP and normalized email without retaining personal data', () => {
  const keys = loginRateLimitKeys('192.0.2.15', ' Farmer@Example.test ');
  assert.equal(keys.length, 2);
  assert.ok(keys.every((key) => /^[a-f0-9]{64}$/.test(key)));
  assert.deepEqual(keys, loginRateLimitKeys('192.0.2.15', 'farmer@example.test'));
  assert.notDeepEqual(keys, loginRateLimitKeys('192.0.2.16', 'farmer@example.test'));
});

test('login limiter allows exactly ten attempts and blocks the next one', () => {
  assert.equal(loginLimitReached(10), false);
  assert.equal(loginLimitReached(11), true);
});
