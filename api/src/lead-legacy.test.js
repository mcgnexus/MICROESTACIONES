import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const leads = await readFile(new URL('./leads.js', import.meta.url), 'utf8');
const prospects = await readFile(new URL('./prospects.js', import.meta.url), 'utf8');
const server = await readFile(new URL('./server.js', import.meta.url), 'utf8');
const adminUi = await readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8');
const prospectsUi = await readFile(new URL('../public/js/prospects.js', import.meta.url), 'utf8');
const migrate = await readFile(new URL('./migrate.js', import.meta.url), 'utf8');
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');

// Cambio 10: los registros anteriores al contrato por canales se conservan y se
// etiquetan como legado al leer. No se reinterpretan ni se les inventa un canal.

test('los registros antiguos se etiquetan como legado al leer', () => {
  // Panel de leads: sin modalidad ni canal declarados, badge de legado.
  assert.match(adminUi, /Legado · sin modalidad declarada/);
  assert.match(adminUi, /const legacy = !lead\.requestType && !lead\.preferredChannel/);
  // Bandeja de interesados: canal y modalidad se muestran o se marcan legado.
  assert.match(prospectsUi, /Legado · sin declarar/);
});

test('la exportación añade canal y modalidad sin reinterpretar el legado', () => {
  assert.match(prospects, /'Canal preferido', 'Modalidad'/);
  assert.match(prospects, /r\.preferredChannel \? CHANNEL_LABELS\[r\.preferredChannel\] : 'Legado'/);
  assert.match(prospects, /r\.requestType \? REQUEST_LABELS\[r\.requestType\] : 'Legado'/);
});

test('la migración conserva los registros y endurece el contacto', () => {
  // El contacto debe tener valor real, no solo no nulo.
  assert.match(migrate, /coalesce\(nullif\(btrim\(phone\),''\), nullif\(btrim\(email\),''\)\) IS NOT NULL/);
  assert.match(schema, /CONSTRAINT farm_leads_contact_check CHECK \(coalesce\(nullif\(btrim\(phone\),''\), nullif\(btrim\(email\),''\)\) IS NOT NULL\)/);
  // Índice de apoyo a la deduplicación por contacto.
  assert.match(migrate, /farm_leads_contact_idx/);
  // Sin backfill: no se reescribe preferred_channel ni request_type de lo antiguo.
  assert.doesNotMatch(migrate, /UPDATE farm_leads SET (preferred_channel|request_type)/);
});

test('la migración de teléfonos solo toca los nacionales ES válidos', () => {
  assert.match(migrate, /await normalizeLegacyPhones\(\)/);
  assert.match(migrate, /phone IS NOT NULL AND phone NOT LIKE '\+%'/);
  assert.match(migrate, /channel = 'whatsapp' AND address NOT LIKE '\+%'/);
  assert.match(migrate, /normalizePhoneE164\(row\.phone, 'ES'\)/);
  assert.match(migrate, /normalizePhoneE164\(row\.address, 'ES'\)/);
});

test('la deduplicación usa canal y contacto, no solo el nombre', () => {
  assert.match(leads, /export function leadContactKey/);
  // El lock y la consulta de duplicados se apoyan en la clave de contacto.
  assert.match(server, /leadContactKey\(parsed\.data\)/);
  assert.match(server, /pg_advisory_xact_lock\(hashtext\(\$\{contactKey\}\)\)/);
  assert.match(server, /const byPhone = lead\.phone \? sql`phone = \$\{lead\.phone\}` : null/);
  assert.match(server, /const byEmail = lead\.email \? sql`email = \$\{lead\.email\}` : null/);
  // Solo compara contactos informados, sin casar NULL con NULL.
  assert.doesNotMatch(server, /phone IS NOT DISTINCT FROM \$\{lead\.phone\}/);
});
