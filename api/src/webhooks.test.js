import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  verifyMetaSignature, verifySvixSignature, verifyTwilioSignature,
  normalizeDeliveryStatus, parseDeliveryEvents, applyProviderStatus,
} from './webhooks.js';

function fakeClient() {
  const calls = [];
  const fn = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (/RETURNING id, alert_id/.test(text)) return [{ id: 7, alertId: 9 }];
    return [];
  };
  fn.calls = calls;
  // Solo las escrituras sobre la cola (las de alertas van después).
  fn.outboxWrites = () => calls.filter((call) => call.text.includes('UPDATE notification_outbox'));
  return fn;
}

test('la firma de Meta se calcula sobre el cuerpo crudo con el App Secret', () => {
  const secret = 'app-secret-de-prueba';
  const body = JSON.stringify({ entry: [] });
  const good = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body, good, secret), true);
  assert.equal(verifyMetaSignature(body, good, 'otro-secreto'), false);
  assert.equal(verifyMetaSignature(`${body} `, good, secret), false, 'un byte cambia y la firma cae');
  assert.equal(verifyMetaSignature(body, 'sha256=00', secret), false);
  assert.equal(verifyMetaSignature(body, good, null), false, 'sin secreto no se verifica nada');
  assert.equal(verifyMetaSignature(body, null, secret), false);
});

test('la firma SVIX acepta con tolerancia temporal y rechaza lo rebobinado', () => {
  const secret = 'whsec_prueba';
  const body = JSON.stringify({ type: 'email.delivered', data: { id: 'em_1' } });
  const nowMs = Date.parse('2026-01-01T10:00:00Z');
  const timestamp = String(Math.floor(nowMs / 1000));
  const digest = createHmac('sha256', secret).update(`svix_1.${timestamp}.${body}`).digest('base64');
  const signature = `v1,${digest}`;

  assert.equal(verifySvixSignature({
    rawBody: body, id: 'svix_1', timestamp, signature, secret, nowMs,
  }), true);
  assert.equal(verifySvixSignature({
    rawBody: body, id: 'svix_1', timestamp, signature: `v1,${digest} v1,otro`, secret, nowMs,
  }), true, 'se admite la lista de firmas del proveedor');
  assert.equal(verifySvixSignature({
    rawBody: body, id: 'svix_1', timestamp, signature, secret: 'otro', nowMs,
  }), false);
  assert.equal(verifySvixSignature({
    rawBody: body, id: 'svix_1', timestamp, signature, secret,
    nowMs: nowMs + 3600_000,
  }), false, 'una firma de hace una hora no sirve');
  assert.equal(verifySvixSignature({ rawBody: body, id: null, timestamp, signature, secret, nowMs }), false);
});

test('la firma de Twilio ordena los parámetros y usa la URL exacta', () => {
  const token = 'twilio-token';
  const url = 'https://ejemplo.test/api/v1/whatsapp/webhook';
  const params = { MessageSid: 'SM1', MessageStatus: 'delivered', From: 'whatsapp:+34600000000' };
  const data = Object.keys(params).sort().reduce((acc, key) => `${acc}${key}${params[key]}`, url);
  const good = createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');

  assert.equal(verifyTwilioSignature(url, params, good, token), true);
  assert.equal(verifyTwilioSignature(`${url}/`, params, good, token), false, 'la URL debe coincidir');
  assert.equal(verifyTwilioSignature(url, { ...params, extra: 'x' }, good, token), false);
  assert.equal(verifyTwilioSignature(url, params, good, 'otro'), false);
  assert.equal(verifyTwilioSignature(url, params, null, token), false);
});

test('los estados del proveedor se normalizan sin confundir aceptado y entregado', () => {
  assert.equal(normalizeDeliveryStatus('delivered'), 'delivered');
  assert.equal(normalizeDeliveryStatus('read'), 'delivered');
  assert.equal(normalizeDeliveryStatus('sent'), 'sent');
  assert.equal(normalizeDeliveryStatus('queued'), 'sent');
  assert.equal(normalizeDeliveryStatus('failed'), 'failed');
  assert.equal(normalizeDeliveryStatus('undelivered'), 'failed');
  assert.equal(normalizeDeliveryStatus('bounced'), 'failed');
  assert.equal(normalizeDeliveryStatus('desconocido'), null);
  assert.equal(normalizeDeliveryStatus(''), null);
  // Aceptar la llamada no es entregarla.
  assert.notEqual(normalizeDeliveryStatus('sent'), normalizeDeliveryStatus('delivered'));
});

test('se leen los tres formatos de webhook', () => {
  const meta = parseDeliveryEvents({
    entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }],
  });
  assert.deepEqual(meta, [{ messageId: 'wamid.1', status: 'delivered', error: null }]);

  const resend = parseDeliveryEvents([{ type: 'email.bounced', data: { id: 'em_1', reason: 'hard' } }]);
  assert.equal(resend[0].status, 'failed');
  assert.equal(resend[0].error, 'hard');

  const twilio = parseDeliveryEvents({ MessageSid: 'SM1', MessageStatus: 'delivered' });
  assert.deepEqual(twilio, [{ messageId: 'SM1', status: 'delivered', error: null }]);

  assert.deepEqual(parseDeliveryEvents({}), []);
  assert.deepEqual(parseDeliveryEvents(null), []);
  assert.deepEqual(parseDeliveryEvents({ entry: [] }).length, 0, 'sin estados no hay eventos');
});

test('el estado del proveedor sube a delivered y no desciende', async () => {
  const client = fakeClient();
  const now = new Date('2026-01-01T10:00:00Z');

  const delivered = await applyProviderStatus(client, { providerMessageId: 'wamid.1', status: 'delivered', now });
  assert.equal(delivered.status, 'delivered');
  const update = client.calls[0];
  assert.match(update.text, /status = 'delivered'/);
  assert.match(update.text, /status NOT IN \('delivered', 'cancelled', 'expired'\)/);
  assert.equal(update.values[0].toISOString(), now.toISOString());

  const ignored = await applyProviderStatus(client, { providerMessageId: 'wamid.1', status: 'desconocido' });
  assert.equal(ignored.updated, 0);
  assert.equal(ignored.status, null);

  const failed = await applyProviderStatus(client, {
    providerMessageId: 'wamid.2', status: 'failed', error: 'rechazado', now,
  });
  assert.equal(failed.status, 'failed');
  const failedWrite = client.outboxWrites().at(-1);
  assert.match(failedWrite.text, /status = 'failed'/);
  assert.match(failedWrite.text, /NOT IN \('delivered', 'cancelled', 'expired'\)/);

  const sent = await applyProviderStatus(client, { providerMessageId: 'wamid.3', status: 'sent', now });
  assert.equal(sent.status, 'sent');
  assert.match(client.outboxWrites().at(-1).text, /status = 'sent'/);

  const noId = await applyProviderStatus(client, { providerMessageId: null, status: 'delivered' });
  assert.equal(noId.updated, 0);
});
