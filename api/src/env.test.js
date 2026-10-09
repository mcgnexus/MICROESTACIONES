import test from 'node:test';
import assert from 'node:assert/strict';
import { alertSendEnabled, alertEngineVerified, isProduction, otpDebugEnabled } from './env.js';

test('el envío de avisos está permitido por defecto y se desactiva con false', () => {
  assert.equal(alertSendEnabled({}), true);
  assert.equal(alertSendEnabled({ ALERT_SEND_ENABLED: 'true' }), true);
  assert.equal(alertSendEnabled({ ALERT_SEND_ENABLED: 'false' }), false);
  assert.equal(alertSendEnabled({ ALERT_SEND_ENABLED: 'FALSE' }), false);
});

test('el motor se considera verificado salvo que se ponga a false', () => {
  assert.equal(alertEngineVerified({}), true);
  assert.equal(alertEngineVerified({ ALERT_ENGINE_VERIFIED: 'false' }), false);
});

test('producción se detecta por NODE_ENV o VERCEL_ENV y el modo OTP debug nunca va en producción', () => {
  assert.equal(isProduction({ NODE_ENV: 'production' }), true);
  assert.equal(isProduction({ VERCEL_ENV: 'production' }), true);
  assert.equal(isProduction({ NODE_ENV: 'development' }), false);
  assert.equal(otpDebugEnabled({ OTP_DEBUG: 'true' }), true);
  assert.equal(otpDebugEnabled({ OTP_DEBUG: 'true', NODE_ENV: 'production' }), false);
});
