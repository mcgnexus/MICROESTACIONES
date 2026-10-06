import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertStatus, alertTitle, alertExplanation, alertMeta, alertCategory,
  renderAlertsList, zoneByDevice,
} from '../public/js/alert-copy.js';

const alert = (over = {}) => ({
  id: '1', deviceId: 'a', deviceName: 'Huéscar', level: 2, message: 'Helada',
  value: { value: 1.8 }, category: 'frost', source: 'station_measurement',
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

test('metadata includes station, zone, time, origin and level', () => {
  const meta = alertMeta(alert({ level: 1 }), { zone: 'Vega' }).join(' · ');
  assert.match(meta, /Estación: Huéscar/);
  assert.match(meta, /Zona: Vega/);
  assert.match(meta, /Origen: Medición de tu estación/);
  assert.match(meta, /Nivel: Prioritario/);
  assert.match(meta, /hace 12 min/);
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
