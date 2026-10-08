import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationPermission, showBrowserNotification, newAlertIds } from '../public/js/notifications.js';

// En Node no existe la API Notification: las funciones de navegador degradan
// de forma segura en lugar de lanzar.
test('browser notification helpers degrade safely outside a browser', () => {
  assert.equal(notificationPermission(), 'unsupported');
  assert.equal(showBrowserNotification('t', 'b'), false);
});

test('newAlertIds returns only the open alerts not seen before', () => {
  const alerts = [
    { id: '1', message: 'Helada' },
    { id: '2', message: 'Calor' },
    { id: '3', message: 'Viento' },
  ];
  const known = new Set(['1']);
  const fresh = newAlertIds(known, alerts);
  assert.deepEqual(fresh.map((alert) => alert.id), ['2', '3']);
  assert.deepEqual(newAlertIds(new Set(), alerts).map((alert) => alert.id), ['1', '2', '3']);
  assert.deepEqual(newAlertIds(new Set(['1', '2', '3']), alerts), []);
  assert.deepEqual(newAlertIds(new Set(), null), []);
});
