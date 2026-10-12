import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aggregateMetrics, METRIC_EVENTS } from './analytics-policy.js';
import { filterProspects } from './prospect-policy.js';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
const [prospectsSrc, prospectsUi, policy, contacts, analytics, alertsUi, adminAnalytics, leadsUi, analyticsUi] =
  await Promise.all([
    read('./prospects.js'), read('../public/js/prospects.js'), read('./prospect-policy.js'), read('./contacts.js'),
    read('./analytics.js'), read('../public/js/alerts.js'), read('../public/js/admin-analytics.js'),
    read('../public/js/leads.js'), read('../public/js/analytics.js'),
  ]);

// Cambio 20: las fases del contacto se muestran por separado en administración.

test('la bandeja expone permiso de servicio, avisos y publicidad por sujeto', () => {
  assert.match(prospectsSrc, /purpose, channel, action FROM consent_records/);
  assert.match(prospectsSrc, /service: \{\}, commercial: \{\}/);
  assert.match(prospectsSrc, /alerts_subscription/);
  assert.match(prospectsSrc, /public_alert_subscriptions pas\s*\n\s*WHERE pas\.subscriber_id = s\.id/);
});

test('la tarjeta distingue fases: verificación, interés, permisos y seguimiento', () => {
  assert.match(prospectsUi, /Atender solicitud:/);
  assert.match(prospectsUi, /Avisos públicos: \$\{r\.alertsSubscription/);
  assert.match(prospectsUi, /Publicidad: /);
  assert.match(prospectsUi, /Sin verificación \(captación/);
  assert.match(prospectsUi, /Siguiente acción: /);
});

test('el filtro «Solicitado» localiza las consultas del día', () => {
  assert.match(policy, /CREATED_SINCE_OPTIONS = \['today', '7d', '30d'\]/);
  const rows = [
    { createdAt: new Date(Date.now() - 3600_000), status: 'registrado' },
    { createdAt: new Date(Date.now() - 10 * 86400000), status: 'registrado' },
  ];
  assert.equal(filterProspects(rows, { created_since: 'today' }).length, 1);
  assert.equal(filterProspects(rows, { created_since: '7d' }).length, 1);
  assert.equal(filterProspects(rows, {}).length, 2);
});

test('la exportación sigue excluyendo canales sin autorización vigente', () => {
  assert.match(policy, /r\.commercial\?\.\[channel\] === true/);
});

// Cambio 21: métricas corregidas antes de interpretar resultados.

test('las verificaciones se cuentan por canal además del total', () => {
  assert.match(METRIC_EVENTS.join(','), /contact_verified_email/);
  assert.match(METRIC_EVENTS.join(','), /contact_verified_whatsapp/);
  assert.match(contacts, /'contact_verified_whatsapp' : 'contact_verified_email'/);
});

test('los leads forman una serie separada que nunca se suma a las cuentas', () => {
  const report = aggregateMetrics(
    [{ event: 'access_requested', bucket: 'direct|none|none', count: 2 }],
    [{ acquisition: {}, verified: true }],
    [{ acquisition: {}, qualified: true, authorized: true }, { acquisition: {}, qualified: false }],
  );
  assert.equal(report.total.registered, 1, 'los leads no inflan la cohorte de cuentas');
  assert.equal(report.leads.total.registered, 2);
  assert.equal(report.leads.total.qualified, 1);
  assert.equal(report.leads.rates.qualified.percent, 50);
  assert.doesNotMatch(JSON.stringify(report), /acquisition|subscriberId|@/);
});

test('el informe incluye la cohorte de leads y declara la relación sin resolver', () => {
  assert.match(analytics, /leadSubjects/);
  assert.match(analytics, /FROM farm_leads l\s*\n\s*WHERE l\.created_at/);
  assert.match(analytics, /aggregateMetrics\(counters, subjects, leadSubjects, campaigns\)/);
  assert.match(analytics, /no se suman a las cuentas/);
  assert.match(analytics, /intención explícita/);
});

test('la activación se publica solo con datos reales en pantalla', () => {
  assert.match(alertsUi, /let activationSent = false;/);
  assert.match(alertsUi, /if \(\(open\.length \|\| closed\.length\) && !activationSent\)/);
  assert.match(alertsUi, /analytics\/activation/);
  assert.match(alertsUi, /\{ tool: 'avisos' \}/);
});

test('el informe muestra coste por registro confirmado y por solicitud cualificada', () => {
  assert.match(adminAnalytics, /Coste publicitario del período/);
  assert.match(adminAnalytics, /cost \/ total\.verified/);
  assert.match(adminAnalytics, /cost \/ result\.leads\.total\.qualified/);
  assert.match(adminAnalytics, /Ejemplo aritmético/);
});

test('las etiquetas de visitas y campañas dicen lo que miden', () => {
  assert.match(adminAnalytics, /Apertura consentida de portada \(carga de página; no visitantes únicos\)/);
  assert.match(adminAnalytics, /se agrupan como «none»/);
  assert.match(analyticsUi, /tecrural:utm/);
});

test('las UTM se conservan durante el recorrido', () => {
  assert.match(leadsUi, /tecrural:acquisition/);
  assert.match(leadsUi, /sessionStorage\.setItem/);
  assert.match(analyticsUi, /sessionStorage\.setItem/);
});
