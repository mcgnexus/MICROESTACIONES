import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cancelPendingPublicAlerts, recipientsForDevice } from './notify.js';
import { recipientWants } from './alert-preferences.js';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
const [schema, migrate, stations, notify, consent, messageTtl, publicAlerts, server, accountUi] =
  await Promise.all([
    read('./schema.sql'), read('./migrate.js'), read('./stations.js'), read('./notify.js'),
    read('./consent.js'), read('./message-ttl.js'), read('./public-alerts.js'),
    read('./server.js'), read('../public/js/account.js'),
  ]);

// Cambio 18: suscripción explícita a los avisos públicos de una estación
// habilitada. Consultar datos o gráficos no suscribe; una estación privada se
// rechaza; el acceso privado y la suscripción pública no se cruzan.

test('el esquema y la migración traen el modelo completo de forma idempotente', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS public_alert_subscriptions/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS public_alert_interest/);
  assert.match(migrate, /CREATE TABLE public_alert_subscriptions \(/);
  assert.match(migrate, /CREATE TABLE public_alert_interest \(/);
  for (const source of [schema, migrate]) {
    assert.match(source, /public_alerts_enabled boolean NOT NULL DEFAULT false/);
  }
  // El sujeto puede ser cuenta o teléfono: la unicidad va por índices parciales.
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS public_alert_subscriptions_account_idx/);
  assert.match(schema, /CHECK \(num_nonnulls\(subscriber_id, wa_phone\) = 1\)/);
  assert.match(migrate, /ADD COLUMN IF NOT EXISTS audience text/);
  assert.match(migrate, /'subscription_test'/);
  assert.match(schema, /'subscription_test'/);
  assert.match(schema, /notification_outbox_subscription_idx/);
});

test('la habilitación va por el mismo camino que publicar datos', () => {
  assert.match(stations, /public_alerts_enabled: z\.boolean\(\)/);
  assert.match(stations, /'publish_permission', 'public_alerts_enabled', 'coverage_km'/);
  assert.match(stations, /publish_permission, public_alerts_enabled/);
});

test('recipientsForDevice incorpora suscriptores públicos con dedupe a favor del privado', () => {
  assert.match(notify, /FROM public_alert_subscriptions pas/);
  assert.match(notify, /d\.active AND d\.public_alerts_enabled/);
  assert.match(notify, /audience: row\.publicCategories != null \? 'public' : 'private'/);
  // El INSERT de avisos escribe la audiencia para revalidar y cancelar sin cruzar.
  assert.match(notify, /audience,\n?\s*template_name/);
  assert.match(notify, /\$\{recipient\.audience\}/);
});

test('las categorías de la suscripción mandan sobre las preferencias en lo público', () => {
  const publicRow = { publicCategories: ['frost'], quietStart: null, quietEnd: null, channel: 'email' };
  assert.equal(recipientWants(publicRow, 'frost', 2), true, 'usa recipientWants solo para filas privadas');
  // La decisión pública se toma en recipientsForDevice: categorías de la suscripción.
  assert.match(notify, /row\.publicCategories\.includes\(category\)/);
});

test('la revalidación previa al envío comprueba suscripción y habilitación', () => {
  assert.match(notify, /if \(row\.audience === 'public'\)/);
  assert.match(notify, /suscripción revocada/);
  assert.match(notify, /estación sin avisos públicos/);
});

test('la baja cancela solo los pendientes públicos de esa estación', () => {
  assert.match(notify, /export async function cancelPendingPublicAlerts/);
  assert.match(notify, /o\.audience = 'public'/);
  assert.match(notify, /SELECT id FROM alerts WHERE device_id = \$\{deviceId\}/);
});

test('el alta valida estación habilitada, cuenta y contacto verificados', () => {
  assert.match(publicAlerts, /'station_not_found', status: 404/);
  assert.match(publicAlerts, /'station_not_enabled', status: 409/);
  assert.match(publicAlerts, /'account_not_verified', status: 409/);
  assert.match(publicAlerts, /'contact_not_verified', status: 409/);
  assert.match(publicAlerts, /\(subscriber_id, device_id, channel\) WHERE subscriber_id IS NOT NULL DO UPDATE/);
  assert.match(publicAlerts, /source: 'public_alerts'/);
});

test('la prueba va etiquetada, con TTL corto y topes propios', () => {
  assert.match(publicAlerts, /'subscription_test'/);
  assert.match(publicAlerts, /PRUEBA — /);
  assert.match(messageTtl, /subscription_test: 15/);
  assert.match(publicAlerts, /public-alert-test:contact:/);
  assert.match(publicAlerts, /too_many_requests/);
});

test('el permiso del servicio se registra en el libro de consentimientos', () => {
  assert.match(consent, /'public_alerts'/);
});

test('el router está montado y la cuenta muestra la suscripción explícita', () => {
  assert.match(server, /app\.use\('\/api\/v1\/public-alerts', publicAlertsRouter\)/);
  assert.match(accountUi, /Activar avisos de esta estación/);
  assert.match(accountUi, /lista de interés/);
  assert.match(accountUi, /data-public-test/);
  assert.match(accountUi, /public\/alerts\/options|public-alerts\/options/);
});

test('una baja sin suscripción activa es 404 y no cancela nada', () => {
  assert.match(publicAlerts, /'subscription_not_found'/);
  assert.match(publicAlerts, /cancelPendingPublicAlerts\(tx,/);
});

// Unidad: la cancelación solo toca filas públicas de ese suscriptor y estación.
test('cancelPendingPublicAlerts actualiza la entrega de cada fila cancelada', async () => {
  const calls = [];
  const client = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return [{ id: 7, alertId: 3 }];
  };
  const cancelled = await cancelPendingPublicAlerts(client, { subscriberId: 5, deviceId: 'urbana' });
  assert.equal(cancelled, 1);
  assert.match(calls[0].text, /audience = 'public'/);
  assert.match(calls[0].text, /subscriber_id = \?/);
  assert.match(calls[1].text, /delivery_status/);
});
