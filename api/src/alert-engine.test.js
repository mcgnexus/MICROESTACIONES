import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRule, hits, recoveryHit, alertAge, batteryImpact, severityFor, ruleFromRow } from './alert-engine.js';
import { describeSeries, trendOf, coverageReport } from './statistics.js';

const baseRule = {
  id: 1, metric: 'temperature', comparator: 'gt', threshold: 30, level: 2,
  minDurationS: 0, recoveryMargin: 0, message: 'Alta', urgent: false,
  conditionActive: false, conditionSince: null, activeAlertOpen: false, activeAlertId: null,
};
const at = (iso) => new Date(iso);

test('un umbral simple dispara en la primera muestra que lo supera', () => {
  assert.equal(evaluateRule(baseRule, { value: 31, at: at('2026-01-01T10:00:00Z') }).action, 'open');
  assert.equal(evaluateRule(baseRule, { value: 29, at: at('2026-01-01T10:00:00Z') }).action, 'idle');
  assert.equal(evaluateRule(baseRule, { value: null, at: at('2026-01-01T10:00:00Z') }).action, 'idle');
});

test('la duración mínima impide el aviso por un pico aislado', () => {
  const rule = { ...baseRule, minDurationS: 600 };
  // Primera medida fuera de rango: la condición empieza, no se avisa.
  const start = evaluateRule(rule, { value: 31, at: at('2026-01-01T10:00:00Z') });
  assert.equal(start.action, 'start');

  // Sigue fuera de rango pero aún no ha pasado el tiempo suficiente.
  const pending = evaluateRule({ ...rule, conditionActive: true, conditionSince: at('2026-01-01T10:00:00Z') },
    { value: 32, at: at('2026-01-01T10:05:00Z') });
  assert.equal(pending.action, 'pending');
  assert.equal(pending.elapsed, 300);

  // Superada la duración mínima, se abre el aviso.
  const opened = evaluateRule({ ...rule, conditionActive: true, conditionSince: at('2026-01-01T10:00:00Z') },
    { value: 32, at: at('2026-01-01T10:10:01Z') });
  assert.equal(opened.action, 'open');
  assert.equal(opened.conditionSince.toISOString(), '2026-01-01T10:00:00.000Z');
});

test('el margen de recuperación evita el baile alrededor del umbral', () => {
  const rule = { ...baseRule, recoveryMargin: 2, conditionActive: true, activeAlertOpen: true, activeAlertId: 42 };
  // Sigue claramente por encima: el aviso se mantiene.
  assert.equal(evaluateRule(rule, { value: 31, at: at('2026-01-01T10:20:00Z') }).action, 'hold');
  // Ha bajado pero sigue dentro del margen: todavía en alarma.
  assert.equal(evaluateRule(rule, { value: 30.5, at: at('2026-01-01T10:20:00Z') }).action, 'hold');
  // Sale del margen: recuperación automática.
  const recovered = evaluateRule(rule, { value: 27, at: at('2026-01-01T10:20:00Z') });
  assert.equal(recovered.action, 'recover');
  assert.equal(recovered.alertId, 42);
});

test('con margen cero la recuperación es inmediata', () => {
  const rule = { ...baseRule, conditionActive: true, activeAlertOpen: true, activeAlertId: 7 };
  assert.equal(evaluateRule(rule, { value: 29.9, at: at('2026-01-01T10:20:00Z') }).action, 'recover');
  assert.equal(hits('gt', 30.1, 30), true);
  assert.equal(recoveryHit('gt', 29, 30, 0), false);
});

test('comparadores de límite inferior', () => {
  const low = { ...baseRule, comparator: 'lt', threshold: 3200, metric: 'battery', recoveryMargin: 100 };
  assert.equal(evaluateRule(low, { value: 3000, at: at('2026-01-01T10:00:00Z') }).action, 'open');
  const recovering = { ...low, conditionActive: true, activeAlertOpen: true, activeAlertId: 3 };
  assert.equal(evaluateRule(recovering, { value: 3250, at: at('2026-01-01T10:00:00Z') }).action, 'hold');
  assert.equal(evaluateRule(recovering, { value: 3350, at: at('2026-01-01T10:00:00Z') }).action, 'recover');
});

test('la nivelación de batería distingue crítica de baja', () => {
  assert.equal(severityFor(3000, { battery_critical_mv: 3200, battery_low_mv: 3400 }), 1);
  assert.equal(severityFor(3300, { battery_critical_mv: 3200, battery_low_mv: 3400 }), 2);
});

test('el aviso declara la antigüedad de su medida y el retraso de entrega', () => {
  const now = new Date('2026-01-01T10:30:00Z');
  const age = alertAge({
    observedAt: new Date('2026-01-01T10:00:00Z'),
    createdAt: new Date('2026-01-01T10:28:00Z'),
  }, now);
  assert.equal(age.ageSeconds, 1800);
  assert.equal(age.ingestDelaySeconds, 1680);
});

test('sin datos urgentes el impacto en batería se declara insuficiente', () => {
  const impact = batteryImpact({ directives: [], samples: [], syncIntervalS: 1800 });
  assert.equal(impact.sufficiency, 'sin_datos');
  assert.equal(impact.extraDropMvPerUrgentEvent, null);
  assert.equal(impact.baselineDelaySeconds, 1800);
});

test('con envíos urgentes medidos se estima el coste diario', () => {
  const samples = [
    { observedAt: '2026-01-01T00:00:00Z', batteryMv: 4000 },
    { observedAt: '2026-01-01T12:00:00Z', batteryMv: 3900 },
    { observedAt: '2026-01-02T00:00:00Z', batteryMv: 3800 },
  ];
  const directives = [
    { issuedAt: '2026-01-01T06:00:00Z', releasedAt: '2026-01-01T06:05:00Z', batteryMvBefore: 3950 },
    { issuedAt: '2026-01-01T18:00:00Z', releasedAt: '2026-01-01T18:05:00Z', batteryMvBefore: 3850 },
  ];
  const impact = batteryImpact({ directives, samples, syncIntervalS: 1800 });
  assert.equal(impact.baselineMvPerHour, 8.33);
  assert.equal(impact.measuredEvents, 2);
  assert.equal(impact.sufficiency, 'parcial');
  assert.ok(impact.estimatedExtraDrainMvPerDay >= 0);
});

test('la fila de la base de datos se traduce sin perder duración ni margen', () => {
  // Regresión: si la fila snake_case se pasa sin convertir, la regla se evalúa
  // como inmediata y sin histéresis, que es justo lo que no debe pasar.
  const rule = ruleFromRow({
    id: 9, device_id: 'esp32c3-01', metric: 'temperature', comparator: 'gt', threshold: 30,
    level: 2, message: 'Alta', recipient: null, channel: 'in_app', enabled: true,
    min_duration_s: 1200, recovery_margin: 2, urgent: true, system: false,
    condition_active: false, condition_since: null, active_alert_id: null,
  });
  assert.equal(rule.minDurationS, 1200);
  assert.equal(rule.recoveryMargin, 2);
  assert.equal(rule.urgent, true);
  assert.equal(rule.activeAlertOpen, false);
  // Con duración mínima de 1200 s, 31 °C solo marca el inicio de la condición.
  assert.equal(evaluateRule(rule, { value: 31, at: at('2026-01-01T10:00:00Z') }).action, 'start');
  // Por debajo del umbral no hay condición que sostener.
  assert.equal(evaluateRule(rule, { value: 29.5, at: at('2026-01-01T10:05:00Z') }).action, 'idle');
});

test('describeSeries devuelve mínimo, máximo, media y tendencia', () => {
  const points = [
    { at: '2026-01-01T00:00:00Z', value: 10 },
    { at: '2026-01-01T01:00:00Z', value: 20 },
    { at: '2026-01-01T02:00:00Z', value: 30 },
  ];
  const described = describeSeries(points);
  assert.equal(described.count, 3);
  assert.equal(described.min, 10);
  assert.equal(described.max, 30);
  assert.equal(described.avg, 20);
  assert.equal(described.trend.direction, 'sube');
  assert.equal(described.trend.slopePerHour, 10);
  assert.equal(described.p50, 20);
});

test('una serie plana se declara estable', () => {
  const points = [
    { at: '2026-01-01T00:00:00Z', value: 21 },
    { at: '2026-01-01T01:00:00Z', value: 21 },
    { at: '2026-01-01T02:00:00Z', value: 21 },
  ];
  assert.equal(trendOf(points).direction, 'estable');
  assert.equal(describeSeries([]).count, 0);
  assert.equal(describeSeries([{ at: '2026-01-01T00:00:00Z', value: 5 }]).trend.direction, 'insuficiente');
});

test('la cobertura compara recibidos con esperados', () => {
  const report = coverageReport({ received: 90, valid: 85, invalid: 5, intervalSeconds: 360, from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' });
  assert.equal(report.expected, 240);
  assert.equal(report.missing, 150);
  assert.equal(report.receivedPct, 37.5);
  assert.equal(report.validPct, 35.4);
  assert.equal(coverageReport({ received: 0, valid: 0, invalid: 0, intervalSeconds: 0, from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }).expected, null);
});