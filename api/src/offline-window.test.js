import assert from 'node:assert/strict';
import test from 'node:test';

import { inOfflineWindow, parseOfflineWindow } from './alert-engine.js';

// Ventana por defecto: lunes a viernes, 16:30-18:00 Europe/Madrid.
// En octubre Madrid es CEST (UTC+2): 17:00 locales son 15:00 UTC.
const at = (iso) => new Date(iso);

test('la ventana por defecto cubre lunes a viernes de 16:30 a 18:00 de Madrid', () => {
  // Miércoles 2026-10-14.
  assert.equal(inOfflineWindow(at('2026-10-14T14:31:00Z')), true);  // 16:31
  assert.equal(inOfflineWindow(at('2026-10-14T15:00:00Z')), true);  // 17:00
  assert.equal(inOfflineWindow(at('2026-10-14T14:29:00Z')), false); // 16:29: aún no
  assert.equal(inOfflineWindow(at('2026-10-14T16:00:00Z')), false); // 18:00: fin (intervalo [inicio, fin))
  assert.equal(inOfflineWindow(at('2026-10-14T17:01:00Z')), false); // 19:01
});

test('fuera de los días configurados la ventana no aplica', () => {
  // Sábado 2026-10-10, 17:00 de Madrid: hay clase no, el detector evalúa.
  assert.equal(inOfflineWindow(at('2026-10-10T15:00:00Z')), false);
  // Domingo 2026-10-11, 17:00 de Madrid.
  assert.equal(inOfflineWindow(at('2026-10-11T15:00:00Z')), false);
});

test('con la ventana desactivada el detector se evalúa siempre', () => {
  const env = { OFFLINE_WINDOW_DAYS: '', OFFLINE_WINDOW_START: '16:30', OFFLINE_WINDOW_END: '18:00' };
  assert.equal(inOfflineWindow(at('2026-10-14T15:00:00Z'), env), false);
  assert.equal(parseOfflineWindow(env), null);
});

test('los valores por defecto cubren la env parcial', () => {
  // Sin más variables, la ventana existe: L-V 16:30-18:00 Europe/Madrid.
  assert.deepEqual(parseOfflineWindow({ OFFLINE_WINDOW_DAYS: '1-5' }),
    { daySet: new Set([1, 2, 3, 4, 5]), startMin: 990, endMin: 1080, timeZone: 'Europe/Madrid' });
});

test('una configuración vacía o inválida desactiva la ventana', () => {
  assert.equal(parseOfflineWindow({ OFFLINE_WINDOW_DAYS: '1-5', OFFLINE_WINDOW_START: '', OFFLINE_WINDOW_END: '18:00' }), null);
  assert.equal(parseOfflineWindow({ OFFLINE_WINDOW_DAYS: '', OFFLINE_WINDOW_START: '16:30', OFFLINE_WINDOW_END: '18:00' }), null);
  assert.equal(parseOfflineWindow({ OFFLINE_WINDOW_DAYS: 'x', OFFLINE_WINDOW_START: 'mal', OFFLINE_WINDOW_END: '18:00' }), null);
});

test('la ventana admite días sueltos y listas, y otra zona horaria', () => {
  const env = { OFFLINE_WINDOW_DAYS: '2,4', OFFLINE_WINDOW_START: '09:00', OFFLINE_WINDOW_END: '10:15', OFFLINE_WINDOW_TZ: 'UTC' };
  assert.equal(inOfflineWindow(at('2026-10-13T09:30:00Z'), env), true);  // martes 09:30 UTC
  assert.equal(inOfflineWindow(at('2026-10-15T10:15:00Z'), env), false); // jueves 10:15 UTC: fin
  assert.equal(inOfflineWindow(at('2026-10-14T09:30:00Z'), env), false); // miércoles
});
