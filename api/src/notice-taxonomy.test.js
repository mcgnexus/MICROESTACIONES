import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTICE_CATEGORIES, NOTICE_NATURES, NOTICE_SOURCES, RISK_NATURES, WHATSAPP_MANUAL_NOTE,
  classifyNotice, coverageCaveat, originText, validityText, isCommunicationNotice,
} from '../public/js/notice-taxonomy.js';
import { renderAlertsList, caveatBlock, alertMeta } from '../public/js/alert-copy.js';
import { nextRisk } from '../public/js/farm-cards.js';
import { alertEngineVerified } from './env.js';
import { alertableDeviceIds } from './auth.js';
import { renderAlertMessage, renderVerificationMessage } from './notify.js';
import { renderMagicLink } from './magic-link.js';
import { renderCommercialMessage } from './consent.js';

const fresh = (over = {}) => ({
  device: { id: 'a', name: 'Huéscar', sensors: { temperature: true, battery: true } },
  status: { connectivity: 'online', dataFreshness: 'fresh', lastContact: '2026-01-01T10:00:00Z' },
  weather: { advisories: [], aemet: { warnings: [], warningsStatus: 'current' } },
  ...over,
});

test('every notice type declares category, source, date, state and validity', () => {
  const types = [
    { input: { kind: 'status', message: 'Estación sin comunicación' }, category: 'status' },
    { input: { source: 'external_forecast', observedAt: '2026-01-01T10:00:00Z' }, category: 'forecast' },
    { input: { source: 'station_measurement', ruleId: '7', observedAt: '2026-01-01T10:00:00Z' }, category: 'threshold' },
    { input: { simulated: true }, category: 'simulated' },
    { input: { kind: 'commercial' }, category: 'commercial' },
    { input: { kind: 'access', expiresAt: '2026-01-01T10:15:00Z' }, category: 'access' },
  ];
  for (const { input, category } of types) {
    const meta = classifyNotice(input);
    assert.equal(meta.category, category, `categoría de ${JSON.stringify(input)}`);
    assert.ok(meta.categoryLabel, 'etiqueta de categoría');
    assert.ok(meta.sourceLabel, 'fuente');
    assert.ok(meta.stateLabel, 'estado');
    assert.ok(typeof meta.origin === 'string' && meta.origin.length > 0, 'origen');
    const validity = validityText(meta.category, input.expiresAt || input.observedAt);
    assert.ok(validity && validity.length > 0, `vigencia de ${category}`);
  }
  assert.equal(Object.keys(NOTICE_CATEGORIES).length, 6, 'los seis tipos de la versión');
  assert.equal(Object.keys(NOTICE_SOURCES).length >= 6, true);
  assert.equal(Object.keys(NOTICE_NATURES).length, 5);
});

test('a notice can be told apart as real, forecast, calculated or simulated', () => {
  assert.deepEqual(RISK_NATURES, ['real', 'previsto', 'calculado', 'simulado']);
  const byNature = Object.fromEntries(RISK_NATURES.map((nature) => [nature, []]));
  for (const input of [
    { kind: 'status' },
    { source: 'station_measurement', ruleId: '1' },
    { source: 'external_forecast' },
    { source: 'estimate' },
    { source: 'derived' },
    { simulated: true },
  ]) {
    const meta = classifyNotice(input);
    if (byNature[meta.nature]) byNature[meta.nature].push(input);
  }
  for (const nature of RISK_NATURES) {
    assert.ok(byNature[nature].length > 0, `falta la naturaleza ${nature}`);
    assert.ok(NOTICE_NATURES[nature].label && NOTICE_NATURES[nature].hint);
  }
  // Las dos clases de mensaje no son avisos de riesgo y se marcan aparte.
  assert.equal(classifyNotice({ kind: 'commercial' }).nature, 'comunicacion');
  assert.equal(classifyNotice({ kind: 'access' }).nature, 'comunicacion');
});

test('simulated notices are confined to the demonstration', () => {
  const meta = classifyNotice({ simulated: true });
  assert.equal(meta.category, 'simulated');
  assert.equal(meta.nature, 'simulado');
  assert.equal(NOTICE_CATEGORIES.simulated.audience, 'demo');
  // «Simulación» queda reservado para los datos inventados: la palabra
  // «demostración» ya no describe la naturaleza de un dato.
  assert.match(validityText('simulated'), /simulación/);
  assert.doesNotMatch(validityText('simulated'), /demostración/);
  assert.match(NOTICE_CATEGORIES.simulated.description, /inventado/);
  // Nada de la simulación se cuela en las categorías reales.
  for (const input of [
    { source: 'station_measurement', ruleId: '1' },
    { source: 'external_forecast' },
    { kind: 'commercial' },
    { kind: 'access' },
    { kind: 'status' },
  ]) {
    assert.notEqual(classifyNotice(input).nature, 'simulado');
  }
});

test('local thresholds are only a threshold when the engine is verified', () => {
  const engineOk = classifyNotice({ source: 'station_measurement', ruleId: '3' });
  assert.equal(engineOk.category, 'threshold');
  assert.equal(engineOk.requiresEngine, true);
  assert.equal(engineOk.engineVerified, true);

  const engineOff = classifyNotice({ source: 'station_measurement', ruleId: '3', engineVerified: false });
  assert.equal(engineOff.engineVerified, false);

  const list = renderAlertsList(
    [{ id: '1', deviceId: 'a', message: 'Helada', level: 2, value: { value: 1 }, source: 'station_measurement', ruleId: '7' }],
    [], { engineVerified: false });
  assert.doesNotMatch(list, /alert-card/);
  assert.match(list, /motor de avisos no está comprobado/);

  const shown = renderAlertsList(
    [{ id: '1', deviceId: 'a', message: 'Helada', level: 2, value: { value: 1 }, source: 'station_measurement', ruleId: '7' }],
    []);
  assert.match(shown, /alert-card/);

  // Una marca enviada por el propio equipo no es umbral local: se sigue viendo.
  const declared = renderAlertsList([{ id: '2', deviceId: 'a', message: 'Aviso de la estación', level: 2 }],
    [], { engineVerified: false });
  assert.match(declared, /alert-card/);
});

test('the engine flag is read from the environment and defaults to verified', () => {
  assert.equal(alertEngineVerified({}), true);
  assert.equal(alertEngineVerified({ ALERT_ENGINE_VERIFIED: 'true' }), true);
  assert.equal(alertEngineVerified({ ALERT_ENGINE_VERIFIED: 'false' }), false);
  assert.equal(alertEngineVerified({ ALERT_ENGINE_VERIFIED: 'FALSE' }), false);
});

test('the origin always names the datum or forecast and never promises detection', () => {
  assert.match(originText({ __category: 'threshold', category: 'frost', value: 1.8 }), /Medida de 1,8 °C/);
  assert.match(originText({ source: 'external_forecast', temperatureC: -2 }), /Previsión externa de -2 °C/);
  assert.match(originText({ source: 'estimate', value: { value: 0 } }), /Estimación propia/);
  assert.match(originText({ source: 'official_warning' }), /Aviso oficial de AEMET/);
  assert.match(originText({ simulated: true }), /serie inventada/);
  for (const input of [{ kind: 'access' }, { kind: 'commercial' }, { source: 'external_forecast' }]) {
    assert.doesNotMatch(originText(input), /detectamos|detectado|llega una helada/i);
  }
});

test('an empty list is never read as "no risk" while data or a provider is missing', () => {
  assert.equal(coverageCaveat([fresh()]), null, 'con datos frescos y fuente viva no se advierte nada');

  const offline = coverageCaveat([fresh({ status: { connectivity: 'offline', dataFreshness: 'stale' } })]);
  assert.ok(offline);
  assert.match(offline.text, /sin conexión/);
  assert.match(offline.text, /sin mediciones recientes/);

  // Un fallo genérico sin estado por recurso no permite decir cuál falló: se
  // afirma «contexto externo incompleto», no que la previsión no esté (F06).
  const providerDown = coverageCaveat([fresh({ weather: { stale: true, errors: ['aemet_500'], advisories: [] } })]);
  assert.ok(providerDown, 'proveedor caído = advertencia');
  assert.match(providerDown.text, /contexto externo incompleto/);

  // Con estados por recurso, cada fallo se nombra por separado: un 429 de la
  // previsión no puede describirse como si los avisos oficiales tampoco fueran
  // consultables.
  const forecastOnlyDown = coverageCaveat([fresh({
    weather: {
      advisories: [],
      aemet: { warnings: [], warningsStatus: 'current', forecastStatus: 'unavailable' },
    },
  })]);
  assert.match(forecastOnlyDown.text, /previsión no disponible/);
  assert.doesNotMatch(forecastOnlyDown.text, /avisos oficiales no disponibles/);

  const warningsOnlyDown = coverageCaveat([fresh({
    weather: {
      advisories: [],
      aemet: { warnings: [], warningsStatus: 'unavailable', forecastStatus: 'current' },
    },
  })]);
  assert.match(warningsOnlyDown.text, /avisos oficiales no disponibles/);
  assert.doesNotMatch(warningsOnlyDown.text, /previsión no disponible/);

  const noStations = coverageCaveat([]);
  assert.ok(noStations);
  assert.match(noStations.text, /no se puede afirmar nada/);

  // El bloque de aviso acompaña a un listado vacío.
  assert.match(caveatBlock(offline), /no significa que no haya riesgo/);
  assert.equal(caveatBlock(null), '');
});

test('the "next risk" card refuses to say all-clear without data', () => {
  const noData = [{ status: { connectivity: 'offline', dataFreshness: 'stale' }, weather: null }];
  const risk = nextRisk(noData, []);
  assert.notEqual(risk.tone, 'ok');
  assert.match(risk.title, /Sin datos suficientes/);

  const healthy = nextRisk([fresh()], []);
  assert.equal(healthy.tone, 'ok');
  assert.match(healthy.meaning, /lecturas actuales/);
});

test('an open alert beats the caveat and the advisories still win over "all clear"', () => {
  const open = [{ id: '1', message: 'Helada', level: 1, closedAt: null, observedAt: '2026-01-01T10:00:00Z' }];
  assert.equal(nextRisk([fresh()], open).tone, 'alert');
  const advisory = fresh({ weather: { advisories: [{ kind: 'viento', text: 'Rachas', date: '2026-01-03' }], aemet: { warnings: [] } } });
  assert.equal(nextRisk([advisory], []).tone, 'warn');
});

test('the five metadata fields are visible on a rendered alert', () => {
  const meta = alertMeta({
    deviceId: 'a', deviceName: 'Huéscar', level: 2, message: 'Helada',
    value: { value: 1.8 }, category: 'frost', source: 'station_measurement',
    observedAt: '2026-01-05T05:30:00Z', ageSeconds: 60, closedAt: null,
  }).join(' · ');
  for (const field of ['Categoría:', 'Hora:', 'Fuente:', 'Tipo:', 'Estado:', 'Vigencia:']) {
    assert.ok(meta.includes(field), `falta ${field}`);
  }
});

test('WhatsApp is never announced as automatic while it is sent by hand', () => {
  assert.match(WHATSAPP_MANUAL_NOTE, /a mano/);
  assert.doesNotMatch(WHATSAPP_MANUAL_NOTE, /automátic(?!o)/);
  assert.match(WHATSAPP_MANUAL_NOTE, /no es un envío automático/);
  // El cuerpo del aviso no promete entrega automática por ningún canal.
  const { body } = renderAlertMessage({
    deviceName: 'Huéscar', metric: 'temperature', value: 1.5, message: 'Helada',
    level: 2, observedAt: '2026-01-01T05:00:00Z', source: 'station_measurement',
    category: 'frost', ruleId: 7,
  });
  assert.doesNotMatch(body, /automátic/i);
  assert.match(body, /Origen: Medición de tu estación · Tipo: Real/);
  assert.match(body, /Categoría: Umbral local/);
  assert.match(body, /Vigencia: /);
});

test('access and commercial messages say what they are and are not', () => {
  const link = renderMagicLink({ returnPath: 'panel' });
  assert.match(link.body, /comunicación necesaria para completar tu acceso/i);
  assert.match(link.body, /no es un aviso meteorológico ni una novedad comercial/i);

  const code = renderVerificationMessage({ code: '123456' });
  assert.match(code.body, /comunicación necesaria/i);
  assert.match(code.body, /caduca en 10 minutos/i);

  const commercial = renderCommercialMessage({ title: 'Ofertas', body: 'Hola', textVersion: '2026-10-07' });
  assert.match(commercial.body, /autorización específica/);
  assert.match(commercial.body, /no como parte de los avisos de la estación/);
  assert.match(commercial.body, /2026-10-07/);
  assert.match(commercial.body, /respondiendo BAJA/);
});

test('communication alerts are the ones only administration sees', () => {
  assert.equal(isCommunicationNotice({ ruleSnapshot: { metric: 'connectivity' } }), true);
  assert.equal(isCommunicationNotice({ message: 'Estación sin conexión' }), true);
  assert.equal(isCommunicationNotice({ message: 'Helada' }), false);
});

test('the demo scope does not subscribe anyone to a station\'s alerts', () => {
  // admin ve todo; el resto solo las estaciones concedidas explícitamente.
  assert.equal(alertableDeviceIds({ id: 1, role: 'admin' }), null);
  assert.ok(alertableDeviceIds({ id: 2, role: 'viewer' }));
  assert.ok(alertableDeviceIds({ id: 3, role: 'operator' }));
});
