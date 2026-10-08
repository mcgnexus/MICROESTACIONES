import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { campaignBucket, completedAgriculturalProfile, ratio, aggregateMetrics } from './analytics-policy.js';

test('las campañas requieren valores exactos del catálogo y nunca conservan datos sensibles', () => {
  assert.equal(campaignBucket({ utm_source: 'Google', utm_medium: 'cpc', utm_campaign: 'spring' }, ['spring']), 'google|cpc|spring');
  const malicious = { source: '600123456', medium: 'persona@example.test', campaign: 'token-secreto', ref: 'https://example.test/?email=persona@example.test', latitude: 37.4 };
  assert.equal(campaignBucket(malicious, ['spring']), 'other|none|none');
  assert.equal(campaignBucket({ campaign: 'spring-extra' }, ['spring']), 'direct|none|none');
  assert.equal(campaignBucket(), 'direct|none|none');
});

test('perfil agrícola completo exige actividad relevante, municipio, cultivo o ganado e interés', () => {
  const base = { municipality: 'Huéscar', activity: 'agricultura', cropOrLivestock: 'Olivo', interest: 'heladas' };
  assert.equal(completedAgriculturalProfile(base), true);
  assert.equal(completedAgriculturalProfile({ ...base, activity: 'mixta' }), true);
  assert.equal(completedAgriculturalProfile({ ...base, activity: 'otra' }), false);
  assert.equal(completedAgriculturalProfile({ ...base, municipality: '  ' }), false);
  assert.equal(completedAgriculturalProfile({ ...base, cropOrLivestock: '' }), false);
  assert.equal(completedAgriculturalProfile(null), false);
});

test('las tasas exponen numerador y denominador y no inventan conversión con cero cuentas', () => {
  assert.deepEqual(ratio(2, 3), { numerator: 2, denominator: 3, percent: 66.7 });
  assert.deepEqual(ratio(0, 0), { numerator: 0, denominator: 0, percent: null });
});

test('el informe cruza agricultura, verificación y autorización sin mezclar visitas con denominadores de cuentas', () => {
  const report = aggregateMetrics([{ event: 'home_visit', bucket: 'google|cpc|spring', count: 20 }], [
    { acquisition: { source: 'google', medium: 'cpc', campaign: 'spring', email: 'private@example.test' }, verified: true, agricultural: true, authorized: true, installation: true },
    { acquisition: { source: 'google', medium: 'cpc', campaign: 'spring' }, verified: false, agricultural: true },
    { acquisition: { source: 'whatsapp' }, verified: true, agricultural: false, authorized: false },
  ], ['spring']);
  assert.equal(report.total.registered, 3);
  assert.equal(report.total.verifiedAgriculturalAuthorized, 1);
  assert.equal(report.total.agriculturalInstallation, 1);
  const google = report.channels.find((r) => r.bucket === 'google|cpc|spring');
  assert.deepEqual(google.rates.verified, { numerator: 1, denominator: 2, percent: 50 });
  assert.equal(google.events.home_visit, 20);
  assert.doesNotMatch(JSON.stringify(report), /private@example|email|acquisition|subscriberId/);
  const empty = aggregateMetrics([{ event: 'home_visit', bucket: 'direct|none|none', count: 1 }], []);
  assert.equal(empty.rates.verified.percent, null);
});

async function browser(choice) {
  const source = (await readFile(new URL('../public/js/analytics.js', import.meta.url), 'utf8')).replace(/export /g, '');
  const requests = [];
  const context = vm.createContext({ URLSearchParams, localStorage: { getItem: () => choice },
    location: { search: '?utm_source=google&utm_medium=cpc&utm_campaign=persona@example.test&email=persona@example.test&phone=600123456&token=secreto&lat=37.3' },
    navigator: { onLine: true }, console,
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true }; } });
  vm.runInContext(source, context);
  vm.runInContext('ready = true; campaigns = ["spring"];', context);
  return { requests, context };
}
test('sin consentimiento o tras rechazar no se envían métricas públicas', async () => {
  for (const choice of [null, 'rejected']) {
    const { requests, context } = await browser(choice);
    await vm.runInContext('publicMetric("home_visit")', context);
    assert.equal(requests.length, 0);
  }
});
test('el envío consentido omite credenciales, referente y parámetros sensibles y deduplica en memoria', async () => {
  const { requests, context } = await browser('accepted');
  await vm.runInContext('publicMetric("home_visit")', context);
  await vm.runInContext('publicMetric("home_visit")', context);
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  assert.equal(url, '/api/v1/metrics/events');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.deepEqual(JSON.parse(options.body), { event: 'home_visit', consent: true, campaign: { source: 'google', medium: 'cpc', campaign: '' } });
  assert.doesNotMatch(options.body, /persona|600123456|secreto|37\.3|email|phone|token|latitude/);
  vm.runInContext('choice = "rejected"', context);
  await vm.runInContext('publicMetric("locked_tool_open")', context);
  assert.equal(requests.length, 1);
});
