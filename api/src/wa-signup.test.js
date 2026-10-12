import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleInboundWhatsApp, waVerificationHash } from './notify.js';
import { recordConsent } from './consent.js';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
const [schema, migrate, notify, consent, publicAlerts, server, signup, landing, indexHtml] =
  await Promise.all([
    read('./schema.sql'), read('./migrate.js'), read('./notify.js'), read('./consent.js'),
    read('./public-alerts.js'), read('./server.js'), read('../public/js/wa-alerts-signup.js'),
    read('../public/js/landing.js'), read('../views/index.html'),
  ]);

function fakeClient(responses) {
  const calls = [];
  const fn = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return responses.shift() ?? [];
  };
  fn.calls = calls;
  return fn;
}

// Cambio 19: alta solo por WhatsApp, sin cuenta y sin email ficticio. Un
// teléfono nunca es una cuenta: identidad de servicio, verificación por código
// y permisos únicamente públicos.

test('el esquema y la migración traen la identidad wa y la ampliación de sujetos', () => {
  for (const source of [schema, migrate]) {
    assert.match(source, /CREATE TABLE (IF NOT EXISTS )?wa_alert_identities/);
    assert.match(source, /wa_phone text/);
    assert.match(source, /num_nonnulls\(subscriber_id, lead_id, wa_phone\) = 1/);
  }
  assert.match(schema, /phone text PRIMARY KEY/);
  assert.match(migrate, /ALTER COLUMN subscriber_id DROP NOT NULL/);
  assert.match(migrate, /DROP CONSTRAINT IF EXISTS consent_records_check/);
});

test('el libro de consentimientos acepta la identidad wa como sujeto único', async () => {
  const calls = [];
  const ok = async (strings, ...values) => { calls.push({ text: strings.join('?'), values }); return []; };
  await recordConsent(ok, {
    waPhone: '+34600111222', purpose: 'service', channel: 'whatsapp',
    action: 'granted', source: 'whatsapp',
  });
  assert.match(calls[0].text, /wa_phone/);
  await assert.rejects(
    recordConsent(ok, {
      subscriberId: 1, waPhone: '+34600111222', purpose: 'service', channel: 'whatsapp',
      action: 'granted', source: 'whatsapp',
    }),
    /invalid_consent_subject/,
    'dos sujetos a la vez se rechazan',
  );
});

test('los destinatarios públicos incluyen identidades wa verificadas', () => {
  assert.match(notify, /JOIN wa_alert_identities w ON w\.phone = pas\.wa_phone/);
  assert.match(notify, /w\.verified_at IS NOT NULL AND w\.opted_out_at IS NULL/);
  assert.match(notify, /NULL::bigint AS subscriber_id, 'whatsapp' AS channel, pas\.wa_phone AS address/);
});

test('la revalidación previa cubre las suscripciones solo por WhatsApp', () => {
  assert.match(notify, /if \(row\.audience === 'public' && row\.subscriberId == null\)/);
  assert.match(notify, /teléfono sin verificar/);
  assert.match(notify, /baja por WhatsApp/);
});

test('la baja por teléfono cancela los pendientes públicos de esa identidad', () => {
  assert.match(notify, /phone = null \}\)/);
  assert.match(notify, /regexp_replace\(o\.address, '\[\^0-9\]', '', 'g'\) = regexp_replace/);
});

test('ALTA responde con el enlace y no crea nada por su cuenta', async () => {
  const replies = [];
  const client = fakeClient([[{ n: 1 }]]);
  const result = await handleInboundWhatsApp(client, '+34 600 111 222', 'alta', {
    siteUrl: 'https://tecrural.example',
    reply: async (text) => { replies.push(text); },
  });
  assert.equal(result.action, 'signup_link_sent');
  assert.match(replies[0], /https:\/\/tecrural\.example\/#avisos-whatsapp/);
  // Solo la consulta de estaciones habilitadas: ni identidades ni suscripciones.
  assert.equal(client.calls.length, 1);
  assert.match(client.calls[0].text, /public_alerts_enabled = true/);
});

test('ALTA sin estaciones habilitadas ofrece la lista de interés', async () => {
  const replies = [];
  const client = fakeClient([[{ n: 0 }]]);
  await handleInboundWhatsApp(client, '+34600111222', 'ALTA', {
    siteUrl: 'https://tecrural.example',
    reply: async (text) => { replies.push(text); },
  });
  assert.match(replies[0], /lista de interés/);
});

test('el código correcto verifica la identidad; el incorrecto consume intento', async () => {
  const phone = '+34600111222';
  const hash = waVerificationHash(phone, '042317');
  const ok = fakeClient([
    [{ phone, codeHash: hash, codeExpiresAt: new Date(Date.now() + 300000), codeAttempts: 0, verifiedAt: null }],
    [],
  ]);
  const replies = [];
  const result = await handleInboundWhatsApp(ok, phone, '042317', {
    reply: async (text) => { replies.push(text); },
  });
  assert.equal(result.action, 'verified');
  assert.match(ok.calls[1].text, /verified_at = now\(\)/);
  assert.match(replies[0], /verificado/i);

  const bad = fakeClient([
    [{ phone, codeHash: hash, codeExpiresAt: new Date(Date.now() + 300000), codeAttempts: 0, verifiedAt: null }],
    [],
  ]);
  const wrong = await handleInboundWhatsApp(bad, phone, '999999', {
    reply: async () => {},
  });
  assert.equal(wrong.action, 'invalid_code');
  assert.match(bad.calls[1].text, /code_attempts \+ 1/);
});

test('un código caducado se rechaza sin verificar', async () => {
  const phone = '+34600111222';
  const hash = waVerificationHash(phone, '042317');
  const client = fakeClient([
    [{ phone, codeHash: hash, codeExpiresAt: new Date(Date.now() - 1000), codeAttempts: 0, verifiedAt: null }],
    [],
  ]);
  const result = await handleInboundWhatsApp(client, phone, '042317', { reply: async () => {} });
  assert.equal(result.action, 'code_expired');
  assert.match(client.calls[1].text, /code_hash = NULL/);
});

test('BAJA da de baja también la identidad wa y cancela sus pendientes', async () => {
  const client = fakeClient([[], [], [{ phone: '+34600111222' }], [], []]);
  const result = await handleInboundWhatsApp(client, '+34600111222', 'BAJA', { reply: async () => {} });
  assert.equal(result.action, 'opted_out');
  assert.equal(result.waIdentities, 1);
  assert.match(client.calls[2].text, /UPDATE wa_alert_identities SET opted_out_at = now\(\)/);
  assert.match(client.calls[3].text, /public_alert_subscriptions SET unsubscribed_at/);
  assert.match(client.calls[4].text, /audience = 'public'/);
});

test('los endpoints wa son públicos y exigen estación habilitada y opt-out respetado', () => {
  const waSection = publicAlerts.slice(0, publicAlerts.indexOf('router.use(requireSubscriber)'));
  for (const route of [`router.get('/wa/stations'`, `router.post('/wa/request'`, `router.post('/wa/confirm'`]) {
    assert.match(waSection, new RegExp(route.replace(/[()']/g, (char) => `\\${char}`)));
  }
  assert.match(publicAlerts, /'invalid_phone'/);
  assert.match(publicAlerts, /'wa_opted_out'/);
  assert.match(publicAlerts, /'channel_unavailable'/);
  assert.match(publicAlerts, /'no_pending_code'/);
  assert.match(publicAlerts, /'code_expired'/);
  assert.match(publicAlerts, /'too_many_attempts'/);
  assert.match(publicAlerts, /'invalid_code'/);
  assert.match(publicAlerts, /whatsappTemplate\('contact_verification', \{ params: \[code\] \}\)/);
});

test('las respuestas del webhook usan la ventana abierta y el origin público', () => {
  assert.match(server, /inWindow: true/);
  assert.match(server, /siteUrl: siteOrigin\(process\.env\.PUBLIC_SITE_URL\)/);
});

test('el formulario público de dos pasos está montado en la portada', () => {
  assert.match(signup, /data-wa-request/);
  assert.match(signup, /public-alerts\/wa\/request/);
  assert.match(signup, /public-alerts\/wa\/confirm/);
  assert.match(signup, /respondiendo BAJA/i);
  assert.match(landing, /mountWaSignup\(\)/);
  assert.match(indexHtml, /data-wa-signup/);
  assert.match(indexHtml, /id="avisos-whatsapp"/);
});
