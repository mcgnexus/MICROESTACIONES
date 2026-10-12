import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contacts = await readFile(new URL('./contacts.js', import.meta.url), 'utf8');
const accountSrc = await readFile(new URL('./account.js', import.meta.url), 'utf8');
const accountUi = await readFile(new URL('../public/js/account.js', import.meta.url), 'utf8');

// C13: estado real de los códigos — disponibilidad, espera, topes y que un
// código viejo no llegue después del nuevo.

test('pedir un código comprueba antes la disponibilidad del canal', () => {
  assert.match(contacts, /channelAvailable\(channel\)/);
  assert.match(contacts, /res\.status\(409\)\.json\(\{ error: 'channel_unavailable' \}\)/);
});

test('el reenvío respeta espera y topes y devuelve cuándo reintentar', () => {
  assert.match(contacts, /RESEND_COOLDOWN_SECONDS/);
  assert.match(contacts, /error: 'cooldown', retryAt/);
  assert.match(contacts, /contact-verify:contact:/);
  assert.match(contacts, /contact-verify:account:/);
  assert.match(contacts, /contact-verify-ip:/);
  assert.match(contacts, /error: 'rate_limited', retryAt/);
});

test('pedir un código nuevo aparta solo el anterior de ese contacto', () => {
  assert.match(contacts, /last_error = 'sustituido por un código nuevo'/);
  assert.match(contacts, /contact_verification_id IN/);
  assert.match(contacts, /WHERE contact_id = \$\{contact\.id\} AND id <> \$\{verification\.id\}/);
});

test('un código caducado no verifica', () => {
  assert.match(contacts, /consumed_at IS NULL AND expires_at > now\(\)/);
});

test('el estado del código se consulta sin exponer el código', () => {
  assert.match(contacts, /router\.get\('\/:channel\/verification'/);
  assert.match(contacts, /verificationState\(/);
});

test('/me informa de la disponibilidad por canal', () => {
  assert.match(accountSrc, /channelAvailability: channelAvailability\(\)/);
});

test('Cuenta no ofrece verificar sin disponibilidad y sondea el estado real', () => {
  assert.match(accountUi, /const canVerify = Boolean\(contact\) && !verified && Boolean\(available\)/);
  assert.match(accountUi, /VERIFY_STATE_TEXT/);
  assert.match(accountUi, /data-verify-state/);
  assert.match(accountUi, /data-resend/);
  assert.match(accountUi, /contacts\/\$\{key\}\/verification/);
});

// C14: reutilizar el correo de acceso ya confirmado, solo para servicio.

test('reutilizar el correo exige correo verificado y solo autoriza servicio', () => {
  assert.match(accountSrc, /router\.post\('\/account\/alert-email'/);
  assert.match(accountSrc, /error: 'email_not_verified'/);
  assert.match(accountSrc, /purpose: 'service', channel: 'email'/);
  assert.match(accountSrc, /source: 'account'/);
});

test('no se crea permiso comercial ni suscripción al reutilizar el correo', () => {
  const start = accountSrc.indexOf("router.post('/account/alert-email'");
  const reuse = accountSrc.slice(start, start + 1600);
  assert.doesNotMatch(reuse, /commercial/i);
  assert.doesNotMatch(reuse, /subscriber_devices|INSERT INTO services/);
});

test('Cuenta ofrece usar el correo de acceso para los avisos', () => {
  assert.match(accountUi, /data-reuse-email/);
  assert.match(accountUi, /Usar este correo para los avisos/);
  assert.match(accountUi, /account\/alert-email/);
});
