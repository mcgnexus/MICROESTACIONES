import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RETURN_PATH, consumeMagicLink, issueMagicLink, magicLinkHash, magicLinkUrl,
  normalizeEmail, renderMagicLink, resolvePasswordlessAccount, safeReturnPath,
} from './magic-link.js';
import { isProduction, otpDebugEnabled } from './env.js';

// Cliente falso para el patrón tagged-template de `postgres`: devuelve respuestas
// prefijadas y registra las consultas, sin necesidad de una base real.
function fakeClient(responses) {
  const calls = [];
  const fn = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return responses.shift() ?? [];
  };
  fn.calls = calls;
  return fn;
}

test('email normalization removes case and surrounding whitespace', () => {
  assert.equal(normalizeEmail('  Farmer@Example.TEST '), 'farmer@example.test');
  assert.equal(normalizeEmail('A@B.co'), normalizeEmail('a@b.co'));
});

test('the token hash is deterministic and bound to the magic-link purpose', () => {
  assert.equal(magicLinkHash('abc'), magicLinkHash('abc'));
  assert.notEqual(magicLinkHash('abc'), magicLinkHash('abd'));
  assert.match(magicLinkHash('abc'), /^[a-f0-9]{64}$/);
});

test('return destinations are limited to internal tools and reject external URLs', () => {
  assert.equal(safeReturnPath('panel'), '#/panel');
  assert.equal(safeReturnPath('/tiempo-local'), '#/tiempo-local');
  assert.equal(safeReturnPath('#/evolucion?x=1'), '#/evolucion');
  assert.equal(safeReturnPath('https://evil.example.com'), DEFAULT_RETURN_PATH);
  assert.equal(safeReturnPath('//evil.example.com'), DEFAULT_RETURN_PATH);
  assert.equal(safeReturnPath('javascript:alert(1)'), DEFAULT_RETURN_PATH);
  assert.equal(safeReturnPath(null), DEFAULT_RETURN_PATH);
  assert.equal(safeReturnPath('desconocido', '#/cuenta'), '#/cuenta');
});

test('the emailed link carries the token and the internal destination only', () => {
  const url = magicLinkUrl('https://tecrural.example', 'TOKEN-123', '#/herramientas');
  assert.match(url, /^https:\/\/tecrural\.example\/entrar\?/);
  assert.match(url, /token=TOKEN-123/);
  assert.match(url, /next=%23%2Fherramientas/);
  assert.doesNotMatch(url, /evil|http:\/\//);
  const { subject, body } = renderMagicLink({ returnPath: '#/panel' });
  assert.match(subject, /TecRural/);
  assert.match(body, /una vez|un solo uso/i);
});

test('a magic link stores only the hash and returns the raw token once', async () => {
  const original = Math.random;
  Math.random = () => 0.5; // evita la limpieza oportunista aleatoria en la prueba
  try {
    const client = fakeClient([[], []]); // sin envío reciente, luego INSERT
    const now = new Date('2026-10-07T12:00:00Z');
    const result = await issueMagicLink(client, { email: ' Farmer@Example.test ', returnPath: '#/panel', now });
    assert.equal(result.status, 'created');
    assert.ok(result.token.length >= 32);
    const insert = client.calls.at(-1);
    assert.match(insert.text, /INSERT INTO magic_links/);
    assert.equal(insert.values[0], 'farmer@example.test');
    assert.equal(insert.values[1], magicLinkHash(result.token));
    assert.notEqual(insert.values[1], result.token);
    assert.equal(insert.values[2], '#/panel');
  } finally {
    Math.random = original;
  }
});

test('resending within the cooldown window does not create a second link', async () => {
  // El cliente real cameliza las columnas; la fila llega como `createdAt`.
  const client = fakeClient([[{ createdAt: new Date('2026-10-07T12:00:00Z') }]]);
  const result = await issueMagicLink(client, {
    email: 'farmer@example.test', returnPath: '#/panel', now: new Date('2026-10-07T12:00:30Z'),
  });
  assert.equal(result.status, 'cooldown');
  assert.equal(client.calls.length, 1); // solo la comprobación, sin INSERT
});

test('consuming a link is atomic and defaults unknown destinations safely', async () => {
  const missing = fakeClient([[]]);
  assert.equal(await consumeMagicLink(missing, { token: 'x'.repeat(32) }), null);
  const hit = fakeClient([[{ email: 'a@b.co', returnPath: 'https://evil.example.com' }]]);
  const consumed = await consumeMagicLink(hit, { token: 'y'.repeat(32) });
  assert.equal(consumed.email, 'a@b.co');
  assert.equal(consumed.returnPath, DEFAULT_RETURN_PATH);
  assert.match(hit.calls[0].text, /consumed_at IS NULL/);
});

test('passwordless accounts are created as viewer/free and privileged roles are refused', async () => {
  const created = await resolvePasswordlessAccount(
    fakeClient([[{ id: 1, email: 'a@b.co', role: 'viewer', plan: 'free' }]]), 'A@B.co');
  assert.equal(created.status, 'created');
  assert.equal(created.subscriber.role, 'viewer');

  const existing = await resolvePasswordlessAccount(
    fakeClient([[/* insert sin fila */], [{ id: 2, email: 'a@b.co', role: 'viewer', plan: 'free' }]]), 'a@b.co');
  assert.equal(existing.status, 'existing');

  const privileged = await resolvePasswordlessAccount(
    fakeClient([[/* insert sin fila */], [{ id: 3, email: 'admin@b.co', role: 'admin', plan: 'free' }]]), 'admin@b.co');
  assert.equal(privileged.status, 'privileged');
});

test('debug helpers stay off in production', () => {
  assert.equal(isProduction({ NODE_ENV: 'production' }), true);
  assert.equal(isProduction({ VERCEL_ENV: 'production' }), true);
  assert.equal(isProduction({ NODE_ENV: 'development' }), false);
  assert.equal(otpDebugEnabled({ OTP_DEBUG: 'true', NODE_ENV: 'development' }), true);
  assert.equal(otpDebugEnabled({ OTP_DEBUG: 'true', NODE_ENV: 'production' }), false);
  assert.equal(otpDebugEnabled({ OTP_DEBUG: 'true', VERCEL_ENV: 'production' }), false);
  assert.equal(otpDebugEnabled({ OTP_DEBUG: 'false', NODE_ENV: 'development' }), false);
});
