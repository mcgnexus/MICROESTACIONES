import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_CHANNELS, CONSENT_PURPOSES, CONSENT_TEXT_VERSION, cancelPendingCommercialMessages,
  cleanCampaignValue, commercialChannels, consentSummary, hasCommercialConsent, latestConsent,
  normalizeAcquisition, recordConsent,
} from './consent.js';

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

test('the consent catalogues and text version are the agreed ones', () => {
  assert.deepEqual(CONSENT_PURPOSES, ['service', 'commercial']);
  assert.deepEqual(CONSENT_CHANNELS, ['email', 'whatsapp']);
  assert.match(CONSENT_TEXT_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test('campaign parameters are limited to known keys and safe slugs', () => {
  assert.equal(cleanCampaignValue('  Spring/2026! '), 'spring2026');
  assert.equal(cleanCampaignValue(''), null);
  assert.equal(cleanCampaignValue(42), null);
  const acquisition = normalizeAcquisition({
    source: 'Google', medium: 'cpc', campaign: 'heladas verano',
    evil: 'drop me', content: '<script>', ref: 'finca-7',
  });
  assert.deepEqual(acquisition, { source: 'google', medium: 'cpc', campaign: 'heladasverano', content: 'script', ref: 'finca-7' });
  assert.equal('evil' in acquisition, false);
  // También acepta los nombres utm_* tal cual llegan de la web.
  assert.deepEqual(normalizeAcquisition({ utm_source: 'news' }), { source: 'news' });
  assert.deepEqual(normalizeAcquisition(null), {});
});

test('recording a consent writes an immutable fact and validates the input', async () => {
  const client = fakeClient([[]]);
  await recordConsent(client, {
    subscriberId: 7, purpose: 'commercial', channel: 'email', action: 'granted',
    source: 'account',
  });
  const insert = client.calls.at(-1);
  assert.match(insert.text, /INSERT INTO consent_records/);
  assert.deepEqual(insert.values.slice(0, 6), [7, null, 'commercial', 'email', 'granted', CONSENT_TEXT_VERSION]);
  await assert.rejects(() => recordConsent(client, { purpose: 'spam', channel: 'email', action: 'granted' }));
  await assert.rejects(() => recordConsent(client, { purpose: 'commercial', channel: 'sms', action: 'granted' }));
  await assert.rejects(() => recordConsent(client, { purpose: 'commercial', channel: 'email', action: 'maybe' }));
});

test('the latest consent wins and drives the commercial check', async () => {
  const grantedRow = { action: 'granted', textVersion: CONSENT_TEXT_VERSION, source: 'web', recordedAt: new Date() };
  assert.equal((await latestConsent(fakeClient([[grantedRow]]), { subscriberId: 1, purpose: 'commercial', channel: 'email' })).granted, true);
  assert.equal(await hasCommercialConsent(fakeClient([[grantedRow]]), { subscriberId: 1, channel: 'email' }), true);

  const revoked = fakeClient([[{ action: 'revoked', textVersion: CONSENT_TEXT_VERSION, source: 'account', recordedAt: new Date() }]]);
  assert.equal(await hasCommercialConsent(revoked, { subscriberId: 1, channel: 'email' }), false);

  const none = fakeClient([[]]);
  const current = await latestConsent(none, { leadId: 9, purpose: 'commercial', channel: 'whatsapp' });
  assert.equal(current, null);
  assert.equal(await hasCommercialConsent(none, { leadId: 9, channel: 'whatsapp' }), false);
});

test('the summary keeps the current state per purpose and channel', async () => {
  const rows = [
    { purpose: 'commercial', channel: 'email', action: 'granted', textVersion: CONSENT_TEXT_VERSION, source: 'account', recordedAt: new Date() },
    { purpose: 'commercial', channel: 'whatsapp', action: 'revoked', textVersion: 'legacy-v0', source: 'migration', recordedAt: new Date() },
    { purpose: 'service', channel: 'whatsapp', action: 'granted', textVersion: 'legacy-lead-v0', source: 'lead', recordedAt: new Date() },
  ];
  const summary = await consentSummary(fakeClient([rows]), { leadId: 3 });
  assert.equal(summary.commercial.email.granted, true);
  assert.equal(summary.commercial.whatsapp.granted, false);
  assert.equal(summary.service.whatsapp.granted, true);
  assert.deepEqual(await commercialChannels(fakeClient([rows]), { leadId: 3 }), { email: true, whatsapp: false });
});

test('revoking cancels only the pending commercial messages of that subject and channel', async () => {
  const client = fakeClient([[{ id: 5 }, { id: 6 }]]);
  const cancelled = await cancelPendingCommercialMessages(client, {
    subscriberId: 12, channel: 'email',
  });
  assert.equal(cancelled, 2);
  const update = client.calls.at(-1);
  assert.match(update.text, /UPDATE notification_outbox/);
  assert.match(update.text, /kind =/);
  assert.match(update.text, /status IN \('pending', 'sending', 'manual'\)/);
  assert.deepEqual(update.values.slice(0, 5), ['commercial', 12, null, 'email', 'email']);
});
