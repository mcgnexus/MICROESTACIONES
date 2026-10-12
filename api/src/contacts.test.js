import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_CHANNELS, generateVerificationCode, verificationHash, verificationMatches,
  normalizeWhatsappAddress,
} from './contacts.js';

test('la dirección de WhatsApp se guarda en E.164 con el país indicado', () => {
  assert.equal(normalizeWhatsappAddress('600 123 456'), '+34600123456');
  assert.equal(normalizeWhatsappAddress('0034 600 123 456'), '+34600123456');
  assert.equal(normalizeWhatsappAddress('6 12 34 56 78', 'FR'), '+33612345678');
  // Un valor que no es un teléfono válido no se acepta ni se convierte a ciegas.
  assert.equal(normalizeWhatsappAddress('123456789'), null);
  assert.equal(normalizeWhatsappAddress('no-es-telefono'), null);
});

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
