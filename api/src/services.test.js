import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceRights, servicePayload, SERVICE_STATUSES } from './services.js';

test('los derechos dependen del estado del servicio, no del plan', () => {
  assert.equal(serviceRights('solicitado').stationAccess, false);
  assert.equal(serviceRights('aprobado').stationAccess, false);
  assert.equal(serviceRights('pendiente_instalacion').stationAccess, false);
  const pilot = serviceRights('piloto_activo');
  assert.equal(pilot.stationAccess, true);
  assert.equal(pilot.historyDays, 90);
  assert.equal(pilot.export, true);
  assert.equal(pilot.alerts, false, 'el piloto aún no ofrece avisos externos');
  const active = serviceRights('activo');
  assert.equal(active.alerts, true);
  assert.equal(serviceRights('suspendido').stationAccess, false);
  assert.equal(serviceRights('finalizado').stationAccess, false);
});

test('todos los estados declarados producen derechos', () => {
  for (const status of SERVICE_STATUSES) {
    assert.equal(serviceRights(status).status, status);
  }
});

test('servicePayload incluye los derechos calculados', () => {
  const payload = servicePayload({ id: 3, status: 'activo', device_name: 'Estación', monthly_fee_cents: 10000 });
  assert.equal(payload.id, '3');
  assert.equal(payload.deviceName, 'Estación');
  assert.equal(payload.monthlyFeeCents, 10000);
  assert.equal(payload.rights.alerts, true);
});
