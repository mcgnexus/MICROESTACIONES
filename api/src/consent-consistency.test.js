import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('./server.js', import.meta.url), 'utf8');
const contacts = await readFile(new URL('./contacts.js', import.meta.url), 'utf8');
const adminSrc = await readFile(new URL('./admin.js', import.meta.url), 'utf8');
const notify = await readFile(new URL('./notify.js', import.meta.url), 'utf8');
const accountSrc = await readFile(new URL('./account.js', import.meta.url), 'utf8');
const adminUi = await readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8');
const accountUi = await readFile(new URL('../public/js/account.js', import.meta.url), 'utf8');

// Cambio 12: libro de consentimientos y estado de contactos consistentes.
// Ni un duplicado oculta una autorización nueva, ni un número nuevo hereda
// permisos, ni un canal verifica a otro.

test('un duplicado conserva la autorización comercial nueva, sin revocar nada', () => {
  assert.match(server, /samePreferredContact/);
  assert.match(server, /const current = await latestConsent\(tx, \{ leadId: duplicate\.id, purpose: 'commercial', channel \}\)/);
  assert.match(server, /if \(current\?\.granted\) continue;/);
  assert.match(server, /leadId: duplicate\.id, purpose: 'commercial', channel, action: 'granted', source: 'lead'/);
  // Un duplicado no vuelve a contar como solicitud de acceso.
  assert.match(server, /if \(outcome\.grantedNew\)/);
  assert.doesNotMatch(server.slice(server.indexOf('if (duplicate) {'), server.indexOf('const [created] = await tx`INSERT INTO farm_leads')),
    /revoked/, 'la deduplicación nunca revoca');
});

test('cambiar el número de WhatsApp no hereda permisos del anterior', () => {
  assert.match(contacts, /if \(addressChanged\) \{/);
  assert.match(contacts, /await revokeCommercialConsent\(tx, \{\s*subscriberId: req\.subscriber\.id, channel, source: 'account'/);
  assert.match(contacts, /verified_at = CASE WHEN \$\{addressChanged\} THEN null ELSE verified_at END/);
  // Los avisos solo siguen si se vuelven a autorizar en este guardado.
  assert.match(contacts, /addressChanged \? sql`now\(\)` : sql`coalesce\(opted_in_at, now\(\)\)`/);
});

test('ningún canal verifica ni concede permisos a otro por venir en el mismo formulario', () => {
  // Confirmar un código toca solo su canal.
  const confirm = contacts.slice(contacts.indexOf("router.post('/:channel/confirm'"));
  assert.match(confirm, /UPDATE subscriber_contacts SET verified_at = now\(\), updated_at = now\(\) WHERE id = \$\{contact\.id\}/);
  assert.doesNotMatch(confirm, /channel = 'email'[\s\S]*channel = 'whatsapp'/);
  // Activar un lead crea cuenta sin copiar el libro de consentimientos.
  const activate = adminSrc.slice(adminSrc.indexOf("router.post('/leads/:id/activate'"), adminSrc.indexOf("router.post('/subscribers/:id/test-message'"));
  assert.doesNotMatch(activate, /recordConsent|INSERT INTO consent_records/);
});

test('la baja por WhatsApp solo afecta a ese canal y no bloquea la consulta web', () => {
  const inbound = notify.slice(notify.indexOf('export async function handleInboundWhatsApp'), notify.indexOf('export async function handleInboundWhatsApp') + 1400);
  assert.match(inbound, /UPDATE subscriber_contacts SET opted_in_at = null, opted_out_at = now\(\)[\s\S]*channel = 'whatsapp'/);
  assert.match(inbound, /revokeCommercialConsent\(client, \{ subscriberId, channel: 'whatsapp', source: 'whatsapp' \}\)/);
  // No toca la cuenta ni la sesión web: darse de baja de avisos no cierra el acceso.
  assert.doesNotMatch(inbound, /UPDATE subscribers|web_sessions/);
});

test('administración muestra contacto, verificación, finalidad y canal por separado', () => {
  assert.match(adminSrc, /async function consentSummaryBySubject\(\)/);
  assert.match(adminSrc, /consents: consents\.get\(`sub:\$\{row\.id\}`\)/);
  assert.match(adminSrc, /consents: consents\.get\(`lead:\$\{row\.numericId\}`\)/);
  assert.match(adminUi, /function contactsBlock\(subject\)/);
  assert.match(adminUi, /<th>Canal<\/th><th>Dirección<\/th><th>Verificado<\/th><th>Avisos<\/th><th>Servicio<\/th><th>Publicidad<\/th>/);
  assert.match(adminUi, /contactsBlock\(row\)/);
  assert.match(adminUi, /contactsBlock\(lead\)/);
});

test('el segundo canal comercial exige elección explícita y registra ese canal', () => {
  assert.match(accountUi, /data-commercial="\$\{channel\.key\}"/);
  assert.match(accountUi, /body: JSON\.stringify\(\{ purpose: 'commercial', channel, action \}\)/);
  assert.match(accountSrc, /if \(!contact\) return res\.status\(409\)\.json\(\{ error: 'channel_not_available' \}\)/);
  assert.match(accountSrc, /grantCommercialConsent\(sql, options\)/);
});
