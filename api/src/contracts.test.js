import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementSchema, hasAnyValue } from './contracts.js';
import { evaluateMeasurement, VFLAG, AUTOMATIC_VALIDATION_LIMITS } from './validation.js';

const base = {
  device_id: 'esp32c3-01', sequence: 1, ts: 1760000000, quality: 2,
  temp_c: 20.5, hum_pct: 55, press_pa: 100800, batt_mv: 3800, flags: 31, alert: 0,
};

test('measurement contract accepts the firmware uint32 sequence range', () => {
  assert.equal(measurementSchema.safeParse({ ...base, sequence: 4294967295 }).success, true);
  assert.equal(measurementSchema.safeParse({ ...base, sequence: 4294967296 }).success, false);
});

test('measurement contract rejects malformed payloads and unexpected fields', () => {
  assert.equal(measurementSchema.safeParse({ ...base, temp_c: 151 }).success, false);
  assert.equal(measurementSchema.safeParse({ ...base, api_key: 'not-allowed' }).success, false);
});

// El registro sin canales no se rechaza en el contrato: hacerlo tumbaria el
// lote entero y dejaria a la estacion bloqueada. Se descarta en el endpoint.
test('a record without any channel is flagged as empty instead of rejected', () => {
  const empty = { ...base, temp_c: undefined, hum_pct: undefined,
    press_pa: undefined, batt_mv: undefined, lux: undefined };
  assert.equal(measurementSchema.safeParse(empty).success, true);
  assert.equal(hasAnyValue(measurementSchema.parse(empty)), false);
  assert.equal(hasAnyValue(base), true);
});

test('strange readings pass the contract so they can be stored with trace', () => {
  const parsed = measurementSchema.safeParse({ ...base, temp_c: 101 });
  assert.equal(parsed.success, true);
  const evaluated = evaluateMeasurement(parsed.data);
  assert.equal(evaluated.is_validated, true, 'the remaining valid channels make the sample usable');
  assert.equal(evaluated.columns.temperature_c, null);
  assert.deepEqual(evaluated.raw_payload, { temp_c: 101 });
  assert.equal(evaluated.validation_flags & VFLAG.TEMP, VFLAG.TEMP);
  assert.match(evaluated.invalidated_reason, /fuera_de_rango/);
});

test('valid measurements are kept validated and time without reference is excluded', () => {
  const valid = evaluateMeasurement({ ...base, flags: 31, quality: 2 });
  assert.equal(valid.is_validated, true);
  assert.equal(valid.columns.temperature_c, 20.5);
  assert.equal(valid.invalidated_reason, null);

  const timeless = evaluateMeasurement({ ...base, quality: 0 });
  assert.equal(timeless.is_validated, false);
  assert.equal(timeless.validation_flags & VFLAG.TIME, VFLAG.TIME);
  assert.match(timeless.invalidated_reason, /hora_sin_referencia/);
});

test('device flag without valid bit marks the channel invalid but keeps the value', () => {
  // 0b01101 = temp, presión y batería válidas; humedad (bit 1) no válida.
  const evaluated = evaluateMeasurement({ ...base, flags: 0b01101, quality: 2 });
  assert.equal(evaluated.is_validated, true, 'valid channels remain usable independently');
  assert.equal(evaluated.columns.humidity_pct, null);
  assert.deepEqual(evaluated.raw_payload, { hum_pct: 55 });
  assert.equal(evaluated.valid_values.temp_c, 20.5);
  assert.equal(evaluated.validation_flags & VFLAG.HUM, VFLAG.HUM);
});

test('an impossible channel is excluded while other valid channels remain admissible', () => {
  const evaluated = evaluateMeasurement({ ...base, temp_c: 151 });
  assert.equal(evaluated.columns.temperature_c, null);
  assert.equal(evaluated.columns.humidity_pct, 55);
  assert.equal(evaluated.is_validated, true);
  assert.deepEqual(evaluated.valid_values, { hum_pct: 55, press_pa: 100800, batt_mv: 3800 });
});

test('future and unreferenced timestamps cannot feed current data or alerts', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const futureTs = now.getTime() / 1000 + 301;
  const future = evaluateMeasurement({ ...base, ts: futureTs }, { now });
  assert.equal(future.time_valid, false);
  assert.equal(future.is_validated, false);
  assert.equal(future.raw_payload.timestamp, futureTs);
  const noTime = evaluateMeasurement({ ...base, quality: 0 }, { now });
  assert.equal(noTime.time_valid, false);
  assert.equal(noTime.valid_values.temp_c, 20.5);
  assert.equal(noTime.raw_payload.quality, 0);
});

test('automatic validation declares what it does not prove', () => {
  const text = AUTOMATIC_VALIDATION_LIMITS.join(' ');
  assert.match(text, /no demuestra calibración/i);
  assert.match(text, /influencia del emplazamiento/i);
  assert.match(text, /no es una lectura «verificada frente a una referencia»/i);
});
