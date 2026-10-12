import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metaTemplatePayload, sendWhatsApp, whatsappRequiresTemplate } from './whatsapp.js';
import { dispatchOutbox } from './notify.js';
import { channelAvailable } from './verification-status.js';

const notify = await readFile(new URL('./notify.js', import.meta.url), 'utf8');
const consent = await readFile(new URL('./consent.js', import.meta.url), 'utf8');
const webhooks = await readFile(new URL('./webhooks.js', import.meta.url), 'utf8');
const adminSrc = await readFile(new URL('./admin.js', import.meta.url), 'utf8');
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const migrate = await readFile(new URL('./migrate.js', import.meta.url), 'utf8');

function fakeClient(responses) {
  const calls = [];
  const fn = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return responses.shift() ?? [];
  };
  fn.calls = calls;
  return fn;
}

// Cambio 16: un destinatario fuera de la ventana recibe una plantilla admitida, y
// un error de plantilla o destinatario queda registrado, nunca como éxito.

test('el payload de Meta usa type template con nombre, idioma y parámetros', () => {
  const payload = metaTemplatePayload('+34 600 123 456', {
    name: 'aviso_tecrural', language: 'es', category: 'utility', button: 'none',
    params: ['Aviso: helada', 'El Llano', 'Huéscar', '-1,4 °C', '05/01 05:12'],
  });
  assert.equal(payload.type, 'template');
  assert.equal(payload.to, '34600123456');
  assert.equal(payload.template.name, 'aviso_tecrural');
  assert.equal(payload.template.language.code, 'es');
  assert.equal(payload.template.components.length, 1);
  assert.equal(payload.template.components[0].type, 'body');
  assert.deepEqual(payload.template.components[0].parameters, [
    { type: 'text', text: 'Aviso: helada' },
    { type: 'text', text: 'El Llano' },
    { type: 'text', text: 'Huéscar' },
    { type: 'text', text: '-1,4 °C' },
    { type: 'text', text: '05/01 05:12' },
  ]);
});

test('una plantilla de autenticación añade el botón solo si está configurado', () => {
  const base = { name: 'codigo', language: 'es', category: 'authentication', params: ['042317'] };
  const none = metaTemplatePayload('+34600', { ...base, button: 'none' });
  assert.equal(none.template.components.length, 1);
  const copy = metaTemplatePayload('+34600', { ...base, button: 'copy_code' });
  assert.equal(copy.template.components.length, 2);
  assert.equal(copy.template.components[1].sub_type, 'copy_code');
  assert.deepEqual(copy.template.components[1].parameters, [{ type: 'text', text: '042317' }]);
});

test('qué proveedores exigen plantilla para todo envío automático', () => {
  assert.equal(whatsappRequiresTemplate({ WHATSAPP_PROVIDER: 'meta' }), true);
  assert.equal(whatsappRequiresTemplate({ WHATSAPP_PROVIDER: 'twilio' }), true);
  assert.equal(whatsappRequiresTemplate({ WHATSAPP_PROVIDER: 'manual' }), false);
  assert.equal(whatsappRequiresTemplate({ WHATSAPP_PROVIDER: 'console' }), false);
  assert.equal(whatsappRequiresTemplate({}), false);
});

test('Meta sin plantilla no envía texto: devuelve template_required', async () => {
  const result = await sendWhatsApp('+34600', 'hola', { WHATSAPP_PROVIDER: 'meta' });
  assert.equal(result.ok, false);
  assert.equal(result.permanent, true);
  assert.equal(result.error, 'template_required');
});

test('Twilio sin ContentSid no envía texto: devuelve template_required', async () => {
  const result = await sendWhatsApp('+34600', 'hola', { WHATSAPP_PROVIDER: 'twilio' }, { template: { params: [] } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'template_required');
});

test('console sirve para desarrollo pero no en producción', async () => {
  const dev = await sendWhatsApp('+34600', 'hola', { WHATSAPP_PROVIDER: 'console' });
  assert.equal(dev.ok, true);
  assert.equal(dev.messageId, 'console');
  const prod = await sendWhatsApp('+34600', 'hola', { WHATSAPP_PROVIDER: 'console', NODE_ENV: 'production' });
  assert.equal(prod.ok, false);
  assert.equal(prod.error, 'console_not_allowed_in_production');
});

test('la disponibilidad de WhatsApp no cuenta console en producción', () => {
  assert.equal(channelAvailable('whatsapp', { WHATSAPP_PROVIDER: 'console' }), true);
  assert.equal(channelAvailable('whatsapp', { WHATSAPP_PROVIDER: 'console', NODE_ENV: 'production' }), false);
  assert.equal(channelAvailable('whatsapp', { WHATSAPP_PROVIDER: 'meta' }), true);
  assert.equal(channelAvailable('whatsapp', { WHATSAPP_PROVIDER: 'disabled' }), false);
});

test('una fila de WhatsApp de Meta sin plantilla queda manual, no enviada', async () => {
  const row = {
    id: 1, kind: 'alert', channel: 'whatsapp', address: '+34600', subject: 'Aviso', body: 'texto',
    attempts: 0, alertId: null, subscriberId: 5, contactVerificationId: null, leadId: null,
    templateName: null, templateLanguage: null, templateParams: null,
    expiresAt: new Date(Date.now() + 60000), claimedBy: 'w1',
  };
  const client = fakeClient([
    [], [], [row], [{ subscriberActive: true, contactOk: true }], [{ id: 1 }],
  ]);
  const result = await dispatchOutbox({ client, env: { WHATSAPP_PROVIDER: 'meta' } });
  assert.equal(result.manual, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 0);
  const update = client.calls.at(-1);
  assert.match(update.text, /status = 'manual'/);
  assert.match(update.text, /provider_detail/);
});

test('la cola guarda plantilla por tipo y el detalle del proveedor', () => {
  // Encolado de verificación, aviso y comercial con descriptor de plantilla.
  assert.match(notify, /whatsappTemplate\('contact_verification', \{ env, params: \[code\] \}\)/);
  assert.match(notify, /whatsappTemplate\('alert', \{ params: alertParams \}\)/);
  assert.match(consent, /whatsappTemplate\('commercial', \{ env, params: \[subject, body\] \}\)/);
  for (const source of [notify, consent]) {
    assert.match(source, /template_name, template_language, template_params/);
  }
  // El webhook guarda el motivo del proveedor sin convertirlo en éxito.
  assert.match(webhooks, /provider_detail = \$\{detail\}::jsonb/);
  assert.match(webhooks, /status = 'failed'/);
});

test('el esquema y la migración traen las columnas de plantilla y su índice', () => {
  for (const column of ['template_name', 'template_language', 'template_params', 'provider_detail']) {
    assert.match(schema, new RegExp(column));
    assert.match(migrate, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }
  assert.match(schema, /notification_outbox_provider_message_idx/);
  assert.match(migrate, /notification_outbox_provider_message_idx/);
});

test('administración muestra la modalidad y la plantilla de la cola', async () => {
  assert.match(adminSrc, /template_name, template_language, provider_detail/);
  const adminUi = await readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8');
  assert.match(adminUi, /Plantilla: \$\{escapeText\(row\.templateName\)\}/);
  assert.match(adminUi, /Sin plantilla: envío manual/);
});
