import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from './auth.js';
import alertsRouter from './alerts.js';

// Doble mínimo de req/res para ejercitar un middleware sin servidor ni base de datos.
function runRole(role, roles) {
  const req = { subscriber: role ? { role } : undefined };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;
  requireRole(...roles)(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode: res.statusCode, body: res.body };
}

test('deleting an alert is admin-only: admin passes, operator and viewer are rejected', () => {
  assert.equal(runRole('admin', ['admin']).nextCalled, true);
  for (const role of ['operator', 'viewer', undefined]) {
    const result = runRole(role, ['admin']);
    assert.equal(result.nextCalled, false, `rol ${role}`);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { error: 'forbidden' });
  }
});

test('the alert router exposes a DELETE /:id protected by session, admin role and CSRF', () => {
  const layer = alertsRouter.stack.find((item) =>
    item.route && item.route.path === '/:id' && item.route.methods.delete);
  assert.ok(layer, 'DELETE /:id debe existir');
  const names = layer.route.stack.map((handler) => handler.name);
  assert.ok(names.includes('requireSubscriber'), 'exige sesión');
  assert.ok(names.includes('csrfGuard'), 'exige la cabecera fetch');
  assert.equal(names.length, 4, 'sesión + rol + CSRF + manejador');
});
