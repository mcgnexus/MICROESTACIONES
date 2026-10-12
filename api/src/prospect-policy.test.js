import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProspects, authorizedExport } from './prospect-policy.js';
const base = { municipality: 'Huéscar', activity: 'agricultura', interest: 'heladas', verified: true,
  status: 'registrado', commercial: { email: true, whatsapp: false }, email: 'campo@example.test', whatsapp: '+34600000000' };
test('el alcance combina municipio, actividad, interés y permiso sin asumir solicitud de llamada', () => {
  const rows = [base, { ...base, activity: 'otra' }, { ...base, commercial: {} }];
  assert.deepEqual(filterProspects(rows, { municipality: 'hués', activity: 'agricultura', interest: 'heladas', permission: 'yes', status: 'registrado' }), [base]);
  assert.equal(filterProspects(rows, { status: 'contacto_solicitado' }).length, 0);
});
test('el alcance filtra por modalidad y canal preferido, y deja fuera el legado', () => {
  const installation = { ...base, requestType: 'installation_info', preferredChannel: 'email' };
  const pilot = { ...base, requestType: 'pilot', preferredChannel: 'whatsapp' };
  const legacy = { ...base, requestType: null, preferredChannel: null };
  const rows = [installation, pilot, legacy];
  assert.deepEqual(filterProspects(rows, { request_type: 'installation_info' }), [installation]);
  assert.deepEqual(filterProspects(rows, { preferred_channel: 'whatsapp' }), [pilot]);
  // Sin canal ni modalidad declarados, el registro legado no se reinterpreta.
  assert.deepEqual(filterProspects(rows, { preferred_channel: 'email' }), [installation]);
});
test('la exportación excluye canales no autorizados, bajas, archivados y retención vencida', () => {
  const rows = [base, { ...base, status: 'archivado' }, { ...base, accountActive: false },
    { ...base, commercial: { email: false } }, { ...base, retainUntil: '2000-01-01T00:00:00Z' }];
  assert.deepEqual(authorizedExport(rows, 'email'), [base]);
  assert.deepEqual(authorizedExport(rows, 'whatsapp'), []);
});
