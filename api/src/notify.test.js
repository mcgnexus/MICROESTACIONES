import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATTEMPTS, backoffSeconds, agingText, renderAlertMessage, renderVerificationMessage,
  renderLeadConfirmation, renderLeadNotice, isQuietHour, recipientWants,
  sendWhatsApp, sendEmail, whatsappProvider, emailProvider,
} from './notify.js';

test('backoff grows, caps at one hour, and never overflows', () => {
  assert.equal(backoffSeconds(0), 30);
  assert.equal(backoffSeconds(1), 60);
  assert.equal(backoffSeconds(2), 120);
  assert.equal(backoffSeconds(10), 3600);
  assert.equal(backoffSeconds(999), 3600);
  assert.equal(backoffSeconds(-5), 30);
});

test('aging text is human and bounded', () => {
  assert.equal(agingText(null), 'sin referencia de hora');
  assert.match(agingText(10), /segundos/);
  assert.match(agingText(600), /10 min/);
  assert.match(agingText(7200), /2 h/);
});

test('alert message names the level, farm, station, value and disclaimer', () => {
  const { subject, body } = renderAlertMessage({
    farmName: 'El Llano', deviceName: 'Huéscar', metric: 'temperature',
    value: -1.4, message: 'Helada', level: 1, observedAt: new Date('2026-01-05T05:12:00Z'), ageSeconds: 720,
  });
  assert.match(subject, /ALERTA PRIORITARIA: Helada/);
  assert.match(body, /Finca: El Llano/);
  assert.match(body, /Estación: Huéscar/);
  assert.match(body, /-1,4 °C/);
  assert.match(body, /orientativo, no oficial/);
  assert.doesNotMatch(body, /[\u{1F300}-\u{1FAFF}]/u);
});

test('a level-2 alert is labelled as a warning and tolerates missing context', () => {
  const { subject, body } = renderAlertMessage({ message: 'Batería baja', level: 2, metric: 'battery', value: 3300 });
  assert.match(subject, /^AVISO: Batería baja/);
  assert.doesNotMatch(body, /Finca:/);
  assert.match(body, /3300 mV/);
});

test('verification message carries the code and its validity', () => {
  const { subject, body } = renderVerificationMessage({ code: '042317', ttlMinutes: 10 });
  assert.match(subject, /verificación/i);
  assert.match(body, /042317/);
  assert.match(body, /10 minutos/);
});

test('lead confirmation tells the visitor no account is needed yet', () => {
  const { subject, body } = renderLeadConfirmation({ name: 'María' });
  assert.match(subject, /TecRural/);
  assert.match(body, /María/);
  assert.match(body, /no necesitas crear ninguna cuenta/i);
});

test('internal lead notice summarises how to contact the visitor', () => {
  const { subject, body } = renderLeadNotice({
    name: 'María', phone: '+34600123456', email: 'finca@example.test',
    activity: 'agricultura', zone: 'Huéscar', interest: 'heladas', notes: 'Cereal',
  });
  assert.match(subject, /María/);
  assert.match(body, /\+34600123456/);
  assert.match(body, /finca@example.test/);
  assert.match(body, /Huéscar/);
  assert.match(body, /heladas/);
});

test('quiet hours cover windows that cross midnight', () => {
  const night = new Date('2026-01-01T23:30:00Z'); // 00:30 en Madrid (UTC+1)
  assert.equal(isQuietHour('22:00', '07:00', night), true);
  const midday = new Date('2026-01-01T12:00:00Z'); // 13:00 en Madrid
  assert.equal(isQuietHour('22:00', '07:00', midday), false);
  assert.equal(isQuietHour('22:00', '07:00', new Date('2026-01-01T05:30:00Z')), true);
  assert.equal(isQuietHour(null, null, midday), false);
});

test('preferences filter category and channel; priority 1 ignores quiet hours', () => {
  const row = {
    channel: 'whatsapp', receiveFrost: true, channelWhatsapp: true,
    quietStart: '22:00', quietEnd: '07:00',
  };
  const night = new Date('2026-01-01T23:30:00Z');
  const midday = new Date('2026-01-01T12:00:00Z');
  assert.equal(recipientWants(row, 'frost', 2, night), false);
  assert.equal(recipientWants(row, 'frost', 1, night), true);
  assert.equal(recipientWants({ ...row, receiveFrost: false }, 'frost', 1, midday), false);
  assert.equal(recipientWants({ ...row, channelWhatsapp: false }, 'frost', 1, midday), false);
  assert.equal(recipientWants({ ...row, receiveFrost: false }, 'heat', 1, midday), true);
});

test('providers default to disabled instead of pretending to send', async () => {
  assert.equal(whatsappProvider({}), 'disabled');
  assert.equal(emailProvider({}), 'disabled');
  const whatsapp = await sendWhatsApp('+34600123456', 'hola', {});
  assert.equal(whatsapp.ok, false);
  assert.equal(whatsapp.permanent, false);
  assert.equal(whatsapp.error, 'provider_not_configured');
  const email = await sendEmail('a@b.es', 'asunto', 'cuerpo', {});
  assert.equal(email.ok, false);
  assert.equal(email.error, 'provider_not_configured');
});

test('the manual WhatsApp provider leaves the message for a human to send', async () => {
  const result = await sendWhatsApp('+34600123456', 'hola', { WHATSAPP_PROVIDER: 'manual' });
  assert.equal(result.ok, false);
  assert.equal(result.manual, true);
  assert.equal(result.error, 'manual');
});

test('the console provider marks the send as done', async () => {
  const whatsapp = await sendWhatsApp('+34600123456', 'hola', { WHATSAPP_PROVIDER: 'console' });
  assert.equal(whatsapp.ok, true);
  assert.equal(whatsapp.messageId, 'console');
  const email = await sendEmail('a@b.es', 'asunto', 'cuerpo', { EMAIL_PROVIDER: 'console' });
  assert.equal(email.ok, true);
});

test('the attempt cap is small enough to stop retrying a dead address', () => {
  assert.ok(MAX_ATTEMPTS >= 3 && MAX_ATTEMPTS <= 10);
});
