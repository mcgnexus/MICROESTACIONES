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
test('la exportación excluye canales no autorizados, bajas, archivados y retención vencida', () => {
  const rows = [base, { ...base, status: 'archivado' }, { ...base, accountActive: false },
    { ...base, commercial: { email: false } }, { ...base, retainUntil: '2000-01-01T00:00:00Z' }];
  assert.deepEqual(authorizedExport(rows, 'email'), [base]);
  assert.deepEqual(authorizedExport(rows, 'whatsapp'), []);
});
