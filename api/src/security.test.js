import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, randomToken, sha256, verifyPassword } from './security.js';

test('password hashes verify without retaining plaintext', async () => {
  const password = 'a-long-test-password-123';
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$/);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword('wrong-password', encoded), false);
});

test('device tokens are random bearer values and can be stored as digests', () => {
  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(sha256(token), sha256(token));
  assert.notEqual(sha256(token), token);
  assert.notEqual(randomToken(), token);
});
