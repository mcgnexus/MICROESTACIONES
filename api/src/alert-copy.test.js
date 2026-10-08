import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertStatus, alertTitle, alertExplanation, alertMeta, alertCategory,
  renderAlertsList, zoneByDevice, caveatBlock,
} from '../public/js/alert-copy.js';
import { classifyNotice, RISK_NATURES } from '../public/js/notice-taxonomy.js';

const alert = (over = {}) => ({
  id: '1', deviceId: 'a', deviceName: 'Huéscar', level: 2, message: 'Helada',
  value: { value: 1.8 }, category: 'frost', source: 'station_measurement', ruleId: '7',
  observedAt: '2026-01-05T05:30:00Z', ageSeconds: 720, closedAt: null,
  ...over,
});

test('alert status maps to activa, resuelta and descartada', () => {
  assert.equal(alertStatus(alert()).key, 'active');
  assert.equal(alertStatus(alert({ closedAt: '2026-01-05T08:00:00Z', autoResolved: true })).label, 'Resuelta');
  assert.equal(alertStatus(alert({ closedAt: '2026-01-05T08:00:00Z', autoResolved: false })).label, 'Descartada');
});

test('the title names the risk and the zone', () => {
  assert.equal(alertTitle(alert(), 'Vega'), 'Riesgo de helada — Vega');
  assert.equal(alertTitle(alert(), null), 'Riesgo de helada');
});

test('a frost explanation is preventive and quotes the temperature', () => {
  const text = alertExplanation(alert());
  assert.match(text, /1,8 °C/);
  assert.match(text, /preventivo/i);
  assert.match(text, /protección/i);
});

test('heat explanation mentions shade, water and ventilation', () => {
  const text = alertExplanation(alert({ category: 'heat' }));
  assert.match(text, /sombra/i);
  assert.match(text, /agua/i);
  assert.match(text, /ventilación/i);
});

test('metadata includes category, station, zone, time, source, state, validity and level', () => {
  const meta = alertMeta(alert({ level: 1 }), { zone: 'Vega' }).join(' · ');
  assert.match(meta, /Estación: Huéscar/);
  assert.match(meta, /Zona: Vega/);
  assert.match(meta, /Categoría: Umbral local/);
  assert.match(meta, /Fuente: Medición de tu estación/);
  assert.match(meta, /Tipo: Real/);
  assert.match(meta, /Estado: Activa/);
  assert.match(meta, /Vigencia: /);
  assert.match(meta, /Nivel: Prioritario/);
  assert.match(meta, /hace 12 min/);
});

test('the explanation cites the datum or forecast that originates the notice', () => {
  // Nada de "detectamos que viene una helada": siempre la fuente y el valor.
  const measured = alertExplanation(alert());
  assert.match(measured, /Medida de 1,8 °C/);
  assert.doesNotMatch(measured, /detectamos/i);
  const forecast = alertExplanation(alert({ source: 'external_forecast', value: null }));
  assert.match(forecast, /Previsión externa/);
  const estimate = alertExplanation(alert({ source: 'estimate', value: { value: -1 } }));
  assert.match(estimate, /Estimación propia calculada sobre la previsión: -1 °C/);
});

test('a notice can be classified as real, forecast, calculated or simulated', () => {
  const cases = [
    [{ source: 'station_measurement', ruleId: '1' }, 'real', 'Umbral local'],
    [{ source: 'external_forecast' }, 'previsto', 'Riesgo por previsión externa'],
    [{ source: 'estimate' }, 'calculado', 'Riesgo por previsión externa'],
    [{ simulated: true }, 'simulado', 'Aviso agrícola simulado'],
  ];
  for (const [input, nature, label] of cases) {
    const meta = classifyNotice(input);
    assert.equal(meta.nature, nature, JSON.stringify(input));
    assert.equal(meta.categoryLabel, label);
    assert.ok(meta.sourceLabel && meta.stateLabel && meta.origin, 'fuente, estado y origen obligatorios');
  }
  const messages = [
    classifyNotice({ kind: 'commercial' }),
    classifyNotice({ kind: 'access' }),
  ];
  for (const meta of messages) assert.equal(meta.nature, 'comunicacion');
  // Las cuatro que hay que distinguir de un vistazo están etiquetadas.
  assert.deepEqual(RISK_NATURES, ['real', 'previsto', 'calculado', 'simulado']);
});

test('the category falls back to the rule snapshot', () => {
  assert.equal(alertCategory({ ruleSnapshot: { category: 'wind' } }), 'wind');
  assert.equal(alertCategory({}), 'general');
});

test('zone map links each station to its farm and the list renders cards', () => {
  const zones = zoneByDevice([{ name: 'El Llano', devices: ['a', 'b'] }]);
  assert.equal(zones.get('a'), 'El Llano');
  const html = renderAlertsList([alert()], [{ name: 'El Llano', devices: ['a'] }]);
  assert.match(html, /Riesgo de helada — El Llano/);
  assert.match(html, /Activa/);
});
