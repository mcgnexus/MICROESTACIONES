import test from 'node:test';
import assert from 'node:assert/strict';
import { stationPayload, siteInfoSchema, verificationSchema } from './stations.js';

test('site documentation accepts the mounting facts and rejects unknown keys', () => {
  const parsed = siteInfoSchema.safeParse({
    sensor_model: 'SHT31', shelter: 'garita ventilada', height_m: 2,
    ventilation: 'pasiva', orientation: 'N', power: 'solar', notes: 'sin sombra al mediodía',
  });
  assert.equal(parsed.success, true);
  assert.equal(siteInfoSchema.safeParse({ height_m: 'dos metros' }).success, false);
  assert.equal(siteInfoSchema.safeParse({ unknown: 1 }).success, false);
});

test('verification records error, bias, conditions and tolerance as agreed text', () => {
  const parsed = verificationSchema.safeParse({
    status: 'verified', reference: 'termómetro patrón calibrado', method: 'comparación 24 h',
    date: '2026-05-01', error: '±0,4 °C', bias: '+0,2 °C', conditions: 'noche despejada',
    limitations: 'no cubre radiación directa', tolerance: 'la acordada por el equipo', responsible: 'A. Pérez',
  });
  assert.equal(parsed.success, true);
  assert.equal(verificationSchema.safeParse({ status: 'certified' }).success, false);
  assert.equal(verificationSchema.safeParse({ date: '01/05/2026' }).success, false);
});

test('station payload exposes site documentation and verification separately', () => {
  const payload = stationPayload({
    id: 'a', name: 'Huéscar', sensors: {},
    siteInfo: { sensor_model: 'SHT31' }, verification: { status: 'verified' },
  });
  assert.equal(payload.siteInfo.sensor_model, 'SHT31');
  assert.equal(payload.verification.status, 'verified');
  // Sin columnas quedan objetos vacíos: la interfaz nunca recibe null.
  const empty = stationPayload({ id: 'b', name: 'X' });
  assert.deepEqual(empty.siteInfo, {});
  assert.deepEqual(empty.verification, {});
});
