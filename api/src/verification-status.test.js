import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verificationState, channelAvailable, channelAvailability } from './verification-status.js';

const source = await readFile(new URL('./verification-status.js', import.meta.url), 'utf8');

// C13: el estado de un código refleja lo que de verdad ocurre; encolado no es
// enviado y enviado no es entregado.

test('sin verificación no hay código que mostrar', () => {
  assert.equal(verificationState({}), 'sin_codigo');
  assert.equal(verificationState(null), 'sin_codigo');
  assert.equal(verificationState({ id: null }), 'sin_codigo');
});

test('el estado sigue la realidad de la cola, sin confundir pasos', () => {
  const base = { id: 1, expiresAt: new Date(Date.now() + 60000) };
  assert.equal(verificationState({ ...base, status: 'pending' }), 'queued');
  assert.equal(verificationState({ ...base, status: 'sending' }), 'queued');
  assert.equal(verificationState({ ...base, status: 'manual' }), 'manual');
  assert.equal(verificationState({ ...base, status: 'sent' }), 'sent');
  assert.equal(verificationState({ ...base, status: 'delivered' }), 'delivered');
  assert.equal(verificationState({ ...base, status: 'failed' }), 'failed');
  assert.equal(verificationState({ ...base, status: 'expired' }), 'expired');
  assert.equal(verificationState({ ...base, status: 'cancelled' }), 'expired');
});

test('verificado solo cuando el contacto lo está y el código se consumió', () => {
  assert.equal(verificationState({ id: 1, consumedAt: new Date(), verifiedAt: new Date() }), 'verified');
  // Consumido sin verificar: lo sustituyó otro código.
  assert.equal(verificationState({ id: 1, consumedAt: new Date(), verifiedAt: null }), 'expired');
});

test('un código caducado no se presenta como vivo', () => {
  const past = new Date(Date.now() - 1000);
  assert.equal(verificationState({ id: 1, status: 'pending', expiresAt: past }), 'expired');
  assert.equal(verificationState({ id: 1, status: 'manual', expiresAt: past }), 'expired');
});

test('la disponibilidad del canal depende del proveedor configurado', () => {
  assert.equal(channelAvailable('whatsapp', { WHATSAPP_PROVIDER: 'disabled' }), false);
  assert.equal(channelAvailable('whatsapp', {}), false);
  assert.equal(channelAvailable('whatsapp', { WHATSAPP_PROVIDER: 'manual' }), true);
  assert.equal(channelAvailable('whatsapp', { WHATSAPP_PROVIDER: 'meta' }), true);
  assert.equal(channelAvailable('email', { EMAIL_PROVIDER: 'disabled' }), false);
  assert.equal(channelAvailable('email', { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.es' }), true);
  assert.deepEqual(channelAvailability({}), { email: false, whatsapp: false });
});

test('el módulo no filtra el código ni su hash', () => {
  assert.doesNotMatch(source, /code_hash|codeHash/);
});
