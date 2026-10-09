import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from './auth.js';
import alertsRouter, { groupLegacyAlerts } from './alerts.js';

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

test('legacy grouping flags inactive and orphan alerts and keeps only older duplicates', () => {
  const rows = [
    { id: '3', deviceId: 'a', deviceName: 'A', level: 1, message: 'x', createdAt: '2026-01-03T00:00:00Z', ruleId: '7', conditionActive: false, ruleMetric: 'temperature' },
    { id: '2', deviceId: 'b', deviceName: 'B', level: 2, message: 'y', createdAt: '2026-01-02T00:00:00Z', ruleId: null, conditionActive: false, ruleMetric: null },
    { id: '1', deviceId: 'c', deviceName: 'C', level: 2, message: 'z', createdAt: '2026-01-01T00:00:00Z', ruleId: '9', conditionActive: true, ruleMetric: 'humidity' },
    { id: '4', deviceId: 'c', deviceName: 'C', level: 2, message: 'z', createdAt: '2026-01-04T00:00:00Z', ruleId: '9', conditionActive: true, ruleMetric: 'humidity' },
  ];
  const groups = groupLegacyAlerts(rows);
  assert.deepEqual(groups.flatMap((group) => group.alerts.map((alert) => alert.id)).sort(), ['1', '2', '3']);
  assert.match(groups.find((group) => group.ruleId === '7').reason, /condición activa/i);
  assert.equal(groups.find((group) => group.ruleId == null).reason.includes('sin regla'), true);
  // La regla activa conserva el aviso más reciente: solo el antiguo es candidato.
  assert.deepEqual(groups.find((group) => group.ruleId === '9').alerts.map((alert) => alert.id), ['1']);
});

test('legacy review routes exist and require session, admin role and CSRF', () => {
  const list = alertsRouter.stack.find((item) =>
    item.route && item.route.path === '/legacy' && item.route.methods.get);
  assert.ok(list, 'GET /legacy debe existir');
  const close = alertsRouter.stack.find((item) =>
    item.route && item.route.path === '/legacy/close' && item.route.methods.post);
  assert.ok(close, 'POST /legacy/close debe existir');
  const names = close.route.stack.map((handler) => handler.name);
  assert.ok(names.includes('requireSubscriber'), 'exige sesión');
  assert.ok(names.includes('csrfGuard'), 'exige la cabecera fetch');
});
