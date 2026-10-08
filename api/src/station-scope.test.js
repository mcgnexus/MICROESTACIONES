import test from 'node:test';
import assert from 'node:assert/strict';
import { accessibleDeviceIds } from './auth.js';

// El ámbito de estaciones se aplica en servidor: administración ve todo; el
// registro público (viewer) queda limitado a sus concesiones y a la demostración.
test('only administration has an unrestricted station scope', () => {
  assert.equal(accessibleDeviceIds({ id: 1, role: 'admin' }), null);
  assert.ok(accessibleDeviceIds({ id: 2, role: 'viewer' }), 'viewer debe llevar un ámbito acotado');
  assert.ok(accessibleDeviceIds({ id: 3, role: 'operator' }), 'operator debe llevar un ámbito acotado');
  // Sin rol reconocido tampoco se abre todo.
  assert.ok(accessibleDeviceIds({ id: 4, role: 'desconocido' }));
});
