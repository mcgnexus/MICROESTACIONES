import test from 'node:test';
import assert from 'node:assert/strict';
import { installationForTime, wasOpenAt, installationPayload } from './installations.js';

const open = { id: 1, startedAt: '2026-01-01T00:00:00Z', endedAt: null, siteName: 'Finca A' };
const closed = { id: 2, startedAt: '2025-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:00Z', siteName: 'Vega' };

test('la muestra se asocia a la instalación vigente en su instante', () => {
  assert.equal(installationForTime([open, closed], '2025-06-01T00:00:00Z').id, 2);
  assert.equal(installationForTime([open, closed], '2026-06-01T00:00:00Z').id, 1);
});

test('el extremo final es exclusivo: no pertenece a la instalación cerrada', () => {
  // Justo en el instante de cierre ya no pertenece a la instalación anterior.
  assert.equal(installationForTime([closed], '2026-01-01T00:00:00Z'), null);
  assert.equal(installationForTime([closed], '2025-12-31T23:59:59Z').id, 2);
});

test('una muestra fuera de todo intervalo no tiene instalación', () => {
  assert.equal(installationForTime([open, closed], '2024-01-01T00:00:00Z'), null);
  assert.equal(installationForTime([], '2026-06-01T00:00:00Z'), null);
  assert.equal(installationForTime([open], 'no-es-fecha'), null);
});

test('wasOpenAt refleja si la instalación estaba abierta en ese momento', () => {
  assert.equal(wasOpenAt(open, '2030-01-01T00:00:00Z'), true);
  assert.equal(wasOpenAt(closed, '2025-06-01T00:00:00Z'), true);
  assert.equal(wasOpenAt(closed, '2026-06-01T00:00:00Z'), false);
});

test('installationPayload normaliza camelCase y snake_case', () => {
  const fromSnake = installationPayload({ id: 7, device_id: 'd1', site_name: 'Casa', started_at: '2026-01-01T00:00:00Z', height_m: 2 });
  assert.equal(fromSnake.id, '7');
  assert.equal(fromSnake.deviceId, 'd1');
  assert.equal(fromSnake.siteName, 'Casa');
  assert.equal(fromSnake.heightM, 2);
});
