import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_CHANNELS, generateVerificationCode, verificationHash, verificationMatches,
} from './contacts.js';

test('verification codes are always six digits', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateVerificationCode();
    assert.match(code, /^\d{6}$/);
  }
});

test('the verification hash is stable and bound to the contact', () => {
  const code = '123456';
  assert.equal(verificationHash(7, code), verificationHash(7, code));
  assert.notEqual(verificationHash(7, code), verificationHash(8, code));
  assert.notEqual(verificationHash(7, code), verificationHash(7, '123457'));
});

test('verification matches only the right code for the right contact', () => {
  const stored = verificationHash(7, '123456');
  assert.equal(verificationMatches(7, '123456', stored), true);
  assert.equal(verificationMatches(7, '654321', stored), false);
  assert.equal(verificationMatches(8, '123456', stored), false);
});

test('only WhatsApp and email are valid contact channels', () => {
  assert.deepEqual(CONTACT_CHANNELS, ['whatsapp', 'email']);
});
