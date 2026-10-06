import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHttp, providerNotConfigured, manualPending } from './notification-provider.js';

test('HTTP classification separates retryable from permanent failures', () => {
  assert.deepEqual(classifyHttp(429), { permanent: false, error: 'rate_limited' });
  assert.equal(classifyHttp(500).permanent, false);
  assert.equal(classifyHttp(503).permanent, false);
  assert.equal(classifyHttp(400).permanent, true);
  assert.equal(classifyHttp(404).permanent, true);
});

test('provider helpers describe the missing and manual cases', () => {
  assert.deepEqual(providerNotConfigured(), { ok: false, permanent: false, error: 'provider_not_configured' });
  assert.deepEqual(manualPending(), { ok: false, permanent: false, manual: true, error: 'manual' });
});
