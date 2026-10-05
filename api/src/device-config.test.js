import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONFIG_RULES, CONFIG_DEFAULTS, validateConfigObject, configWarnings,
  mergeConfig, versionState, hasAppliedHint, stateTimeline, effectiveConfig,
} from './device-config.js';

// Los límites del servidor nunca pueden ser más laxos que los del firmware:
// StationConfig::validate() rechaza la configuración completa si un valor no cabe.
test('los límites del servidor son un subconjunto de los del firmware', () => {
  const firmwareRanges = {
    interval_normal_s: [60, 86400], interval_risk_s: [60, 86400], interval_risk_min_s: [60, 86400],
    sync_interval_s: [60, 86400], battery_low_mv: [2500, 4200], battery_critical_mv: [2000, 4200],
    humidity_alert_high_pct: [0, 100], pressure_alert_low_pa: [30000, 110000],
    temp_alert_high_c: [-40, 85], temp_alert_low_c: [-40, 85],
  };
  for (const [key, [low, high]] of Object.entries(firmwareRanges)) {
    const rule = CONFIG_RULES[key];
    assert.ok(rule, `falta la clave ${key}`);
    assert.ok(rule.min >= low && rule.max <= high,
      `${key} permite ${rule.min}…${rule.max} y el firmware solo ${low}…${high}`);
  }
});

test('los valores por defecto son aplicables por el firmware', () => {
  const validation = validateConfigObject(CONFIG_DEFAULTS);
  assert.deepEqual(validation.errors, []);
  assert.equal(CONFIG_DEFAULTS.interval_normal_s, 360, 'medir cada 6 minutos');
  assert.equal(CONFIG_DEFAULTS.sync_interval_s, 1800, 'enviar cada 30 minutos');
});

test('un valor fuera del rango del firmware se rechaza', () => {
  const result = validateConfigObject({ interval_normal_s: 30 });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /Fuera de rango/);
});

test('se respetan las relaciones que el firmware exige', () => {
  const battery = validateConfigObject({ battery_low_mv: 3000, battery_critical_mv: 3300 });
  assert.equal(battery.ok, false);
  const risk = validateConfigObject({ interval_normal_s: 120, interval_risk_s: 300 });
  assert.equal(risk.ok, false);
  const temp = validateConfigObject({ temp_alert_low_c: 40, temp_alert_high_c: 20 });
  assert.equal(temp.ok, false);
});

test('una clave desconocida se rechaza', () => {
  const result = validateConfigObject({ interval_normal_s: 360, inventada: 1 });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /no permitida/);
});

test('los avisos de consumo no bloquean la configuración', () => {
  assert.deepEqual(validateConfigObject({ interval_normal_s: 60 }).errors, []);
  const warnings = configWarnings({ interval_normal_s: 100, sync_interval_s: 90 });
  assert.ok(warnings.some((warning) => warning.key === 'interval_normal_s'));
  assert.ok(warnings.some((warning) => warning.key === 'sync_interval_s'));
  assert.deepEqual(configWarnings(CONFIG_DEFAULTS), []);
});

test('fusionar conserva lo no enviado y null elimina la clave', () => {
  const merged = mergeConfig({ interval_normal_s: 360, sync_interval_s: 1800 }, { sync_interval_s: null, battery_low_mv: 3300 });
  assert.deepEqual(merged, { interval_normal_s: 360, battery_low_mv: 3300 });
});

test('el estado va de solicitado a recibido y solo al confirmar queda aplicado', () => {
  const published = { version: 3, createdAt: '2026-01-01T10:00:00Z', requestedVersion: null, dataAfter: null };
  assert.equal(versionState(published), 'solicitado');

  const received = { ...published, requestedVersion: 3, requestedAt: '2026-01-01T11:00:00Z' };
  assert.equal(versionState(received), 'recibido');

  // Datos posteriores solo son un indicio: el cambio sigue pendiente.
  const withData = { ...received, dataAfter: '2026-01-01T11:30:00Z' };
  assert.equal(versionState(withData), 'recibido');
  assert.equal(hasAppliedHint(withData), true);

  // Lo confirma el equipo.
  const confirmed = { ...withData, confirmedVersion: 3, appliedAt: '2026-01-01T11:35:00Z' };
  assert.equal(versionState(confirmed), 'aplicado');
  assert.equal(hasAppliedHint(confirmed), false);
});

test('los datos anteriores a pedir la versión no son indicio', () => {
  const row = { version: 2, createdAt: '2026-01-01T10:00:00Z', requestedVersion: 2, dataAfter: '2026-01-01T09:00:00Z' };
  assert.equal(versionState(row), 'recibido');
  assert.equal(hasAppliedHint(row), false);
});

test('la línea de tiempo solo marca aplicado con confirmación', () => {
  const timeline = stateTimeline({
    version: 4, createdAt: '2026-01-01T10:00:00Z', requestedVersion: 4,
    requestedAt: '2026-01-01T11:00:00Z', dataAfter: '2026-01-01T11:30:00Z', confirmedVersion: null,
  });
  assert.equal(timeline.solicitado.done, true);
  assert.equal(timeline.recibido.done, true);
  assert.equal(timeline.aplicado.done, false, 'sin confirmación no se marca aplicado');

  const confirmed = stateTimeline({
    version: 4, createdAt: '2026-01-01T10:00:00Z', requestedVersion: 4,
    requestedAt: '2026-01-01T11:00:00Z', confirmedVersion: 4, appliedAt: '2026-01-01T11:35:00Z',
  });
  assert.equal(confirmed.aplicado.done, true);
  assert.equal(confirmed.aplicado.at, '2026-01-01T11:35:00Z');
});

test('la configuración efectiva completa las claves ausentes', () => {
  const effective = effectiveConfig({ interval_normal_s: 600 });
  assert.equal(effective.interval_normal_s, 600);
  assert.equal(effective.sync_interval_s, CONFIG_DEFAULTS.sync_interval_s);
});