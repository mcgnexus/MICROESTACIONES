import test from 'node:test';
import assert from 'node:assert/strict';
import { emailDeliveryReady, emailFailureScope, emailProvider } from './email.js';

// Matriz de entorno con guardado y restauración, sin tocar otras pruebas.
function withEnv(overrides, fn) {
  const previous = {};
  for (const key of ['EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_FROM', 'NODE_ENV', 'VERCEL_ENV']) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('email provider comes from the environment and defaults to disabled', () => {
  assert.equal(withEnv({ EMAIL_PROVIDER: undefined }, () => emailProvider()), 'disabled');
  assert.equal(withEnv({ EMAIL_PROVIDER: 'RESEND' }, () => emailProvider()), 'resend');
});

test('email delivery is only ready with a usable channel', () => {
  assert.equal(withEnv({ EMAIL_PROVIDER: undefined }, () => emailDeliveryReady()), false, 'disabled no entrega');
  assert.equal(withEnv({ EMAIL_PROVIDER: 'console', NODE_ENV: undefined, VERCEL_ENV: undefined }, () => emailDeliveryReady()), true, 'console solo fuera de producción');
  assert.equal(withEnv({ EMAIL_PROVIDER: 'console', VERCEL_ENV: 'production' }, () => emailDeliveryReady()), false, 'console en producción no es entrega');
  assert.equal(withEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: undefined, EMAIL_FROM: 'a@b.co' }, () => emailDeliveryReady()), false, 'resend sin clave no está listo');
  assert.equal(withEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: undefined }, () => emailDeliveryReady()), false, 'resend sin remitente no está listo');
  assert.equal(withEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'TecRural <a@b.co>' }, () => emailDeliveryReady()), true);
});

test('delivery failures are classified as channel-wide or per-recipient', () => {
  const global = (result) => emailFailureScope(result);
  // Una entrega correcta no se clasifica: así un proveedor válido (p. ej. console)
  // no se toma por caída del canal.
  assert.equal(global({ ok: true, permanent: false, messageId: 'console' }), null);
  assert.equal(global({ ok: true, messageId: 'resend_1' }), null);
  assert.equal(global({ ok: false, error: 'provider_not_configured' }), 'global');
  assert.equal(global({ ok: false, error: 'console_not_allowed_in_production' }), 'global');
  assert.equal(global({ ok: false, error: 'unknown_email_provider:whatever' }), 'global');
  assert.equal(global({ ok: false, error: 'rate_limited' }), 'global');
  // Ambiguo: el proveedor pudo aceptar antes de fallar; se trata como canal.
  assert.equal(global({ ok: false, permanent: true, ambiguous: true, error: 'resend_503_delivery_unknown' }), 'global');
  assert.equal(global({ ok: false, permanent: true, ambiguous: true, error: 'delivery_unknown_timeout_resend' }), 'global');
  assert.equal(global({ ok: false, manual: true, error: 'manual' }), 'global');
  // Rechazo definitivo de la dirección concreta: sigue siendo genérico hacia fuera.
  assert.equal(global({ ok: false, permanent: true, error: 'resend_422' }), 'recipient');
  // Transitorio no clasificado: se asume canal.
  assert.equal(global({ ok: false, permanent: false, error: 'provider_502' }), 'global');
});
