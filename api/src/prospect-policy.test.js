import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProspects, authorizedExport } from './prospect-policy.js';
const base = { kind: 'subscriber', municipality: 'Huéscar', activity: 'agricultura', interest: 'heladas', verified: true,
  status: 'registrado', commercial: { email: true, whatsapp: true }, email: 'campo@example.test', whatsapp: '+34600000000',
  emailReady: true, whatsappReady: true };
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
  const only = { ...base, commercial: { email: true, whatsapp: false } };
  const rows = [only, { ...only, status: 'archivado' }, { ...only, accountActive: false },
    { ...only, commercial: { email: false, whatsapp: false } }, { ...only, retainUntil: '2000-01-01T00:00:00Z' }];
  assert.deepEqual(authorizedExport(rows, 'email'), [only]);
  assert.deepEqual(authorizedExport(rows, 'whatsapp'), []);
});

test('la exportación exige contacto verificado y autorizado en cuentas', () => {
  const lead = { ...base, kind: 'lead', commercial: { whatsapp: true }, whatsappReady: null };
  const rows = [base,
    { ...base, whatsappReady: false },              // verificación perdida o baja
    { ...base, commercial: { whatsapp: false } },   // permiso revocado
    lead];
  // Solo la cuenta lista y el lead con permiso vigente.
  assert.deepEqual(authorizedExport(rows, 'whatsapp'), [rows[0], lead]);
});
