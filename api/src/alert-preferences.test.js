import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, preferenceColumns, preferenceSchema } from './alert-preferences.js';

test('default preferences receive everything by both channels', () => {
  assert.equal(DEFAULT_PREFERENCES.receiveFrost, true);
  assert.equal(DEFAULT_PREFERENCES.channelWhatsapp, true);
  assert.equal(DEFAULT_PREFERENCES.quietStart, null);
  assert.deepEqual(DEFAULT_PREFERENCES.customThresholds, {});
});

test('preference columns keep explicit values, including nulls, and drop undefined', () => {
  const patch = preferenceSchema.parse({ receive_frost: false, quiet_start: null, quiet_end: null, zone: 'Huéscar' });
  const columns = preferenceColumns(patch);
  assert.equal(columns.receive_frost, false);
  assert.equal(columns.quiet_start, null);
  assert.equal(columns.zone, 'Huéscar');
  assert.equal('receive_heat' in columns, false);
});

test('custom thresholds travel alone and never join the operational columns', () => {
  // La interfaz los envía desde un formulario propio (data-thresholds-form):
  // un cuerpo con solo umbrales no debe tocar las preferencias que sí aplican.
  const patch = preferenceSchema.parse({ custom_thresholds: { frost_c: 0 } });
  assert.deepEqual(patch.custom_thresholds, { frost_c: 0 });
  assert.deepEqual(preferenceColumns(patch), {});

  // Distinguir un 0 explícito de un campo en blanco: es un umbral válido.
  const zero = preferenceSchema.parse({ custom_thresholds: { frost_c: 0, heat_c: -4 } });
  assert.deepEqual(zero.custom_thresholds, { frost_c: 0, heat_c: -4 });
});

test('a non-finite custom threshold is rejected instead of stored', () => {
  const parsed = preferenceSchema.safeParse({ custom_thresholds: { frost_c: Number.NaN } });
  assert.equal(parsed.success, false);
  const infinite = preferenceSchema.safeParse({ custom_thresholds: { heat_c: Infinity } });
  assert.equal(infinite.success, false);
});
