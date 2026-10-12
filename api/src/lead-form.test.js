import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEAD_FORM_HTML } from '../public/js/leads.js';

// F23 · Cambio 5: la solicitud abría con teléfono obligatorio y correo escondido
// en un desplegable. Ahora el visitante elige canal (Email o WhatsApp), ve solo
// el campo de ese canal con su explicación, y el segundo canal es opcional.
// El municipio sustituye a la zona libre y sigue siendo obligatorio.

test('la solicitud se abre solo con nombre, municipio y elección de canal', () => {
  for (const core of ['name="name"', 'name="zone"', 'name="preferred_channel"']) {
    assert.match(LEAD_FORM_HTML, new RegExp(core), `falta ${core}`);
  }
  assert.match(LEAD_FORM_HTML, /<label>Municipio<input name="zone" required/);
  assert.match(LEAD_FORM_HTML, /¿Cómo prefieres que te contactemos\?/);
  // Radios de canal: email marcado por defecto, whatsapp disponible.
  assert.match(LEAD_FORM_HTML, /type="radio" name="preferred_channel" value="email" checked/);
  assert.match(LEAD_FORM_HTML, /type="radio" name="preferred_channel" value="whatsapp"/);
});

test('la modalidad se declara con request_type acotado y visible', () => {
  // Radios sin opción marcada: la preselección la decide el origen (embed o
  // campaña), nunca el formulario por su cuenta.
  assert.match(LEAD_FORM_HTML, /¿Qué necesitas\?/);
  assert.match(LEAD_FORM_HTML, /type="radio" name="request_type" value="installation_info"/);
  assert.match(LEAD_FORM_HTML, /type="radio" name="request_type" value="pilot"/);
  assert.doesNotMatch(LEAD_FORM_HTML, /name="request_type"[^>]*checked/);
  assert.match(LEAD_FORM_HTML, /data-request-type-note/);
});

test('la preselección por embed o campaña se muestra y se puede cambiar', async () => {
  const source = await readFile(new URL('../public/js/leads.js', import.meta.url), 'utf8');
  assert.match(source, /data-lead-request-type/);
  assert.match(source, /tipo=instalacion|value === 'instalacion'/, 'acepta el parámetro de campaña');
  assert.match(source, /Has abierto la /, 'anuncia la modalidad abierta por campaña');
});

test('cada canal muestra su campo y WhatsApp explica para qué se usa el número', () => {
  assert.match(LEAD_FORM_HTML, /data-contact-email>Correo electrónico<input name="email" type="email"/);
  assert.match(LEAD_FORM_HTML, /data-contact-whatsapp[^>]*class="hidden"/);
  assert.match(LEAD_FORM_HTML, /data-contact-whatsapp[^>]*>Teléfono de WhatsApp<input name="phone" type="tel" inputmode="tel"/);
  assert.match(LEAD_FORM_HTML, /responderte por WhatsApp a esta solicitud/);
  // Ninguno de los dos campos de canal lleva required en el HTML: la exigencia
  // la pone la elección del canal, no el marcado.
  const email = LEAD_FORM_HTML.match(/<input[^>]*name="email"[^>]*>/)[0];
  const phone = LEAD_FORM_HTML.match(/<input[^>]*name="phone"[^>]*>/)[0];
  assert.doesNotMatch(email, /required/);
  assert.doesNotMatch(phone, /required/);
  assert.match(phone, /type="tel"/);
  assert.match(phone, /inputmode="tel"/);
});

test('el teléfono lleva selector de país con España por defecto y se normaliza a E.164', async () => {
  assert.match(LEAD_FORM_HTML, /name="phone_country"/);
  assert.match(LEAD_FORM_HTML, /data-phone-country/);
  assert.match(LEAD_FORM_HTML, /<option value="ES" selected>España \(\+34\)/);
  // La disponibilidad de WhatsApp no se deduce del formato: se confirma en el canal.
  assert.match(LEAD_FORM_HTML, /El formato no garantiza que la cuenta exista/);
  const source = await readFile(new URL('../public/js/leads.js', import.meta.url), 'utf8');
  assert.match(source, /normalizePhoneE164\(rawPhone, phoneCountry\)/);
  assert.match(source, /body\.phone_country = phoneCountry/);
  assert.match(source, /countryOptions\(\)/, 'el selector se rellena con los metadatos');
  assert.match(source, /Ese teléfono no es válido para el país seleccionado/);
});

test('el error de canal vacío aparece junto al campo', () => {
  assert.match(LEAD_FORM_HTML, /data-contact-error role="alert"/);
});

test('el desplegable opcional pide el problema agronómico, sin perfiles por defecto', () => {
  assert.match(LEAD_FORM_HTML, /<details class="lead-details/);
  assert.match(LEAD_FORM_HTML, /¿Quieres añadir otro canal de contacto o contarnos más\? \(opcional\)/);
  for (const field of ['name="secondary_email"', 'name="secondary_phone"', 'name="activity"',
    'name="interest"', 'name="crop_or_livestock"', 'name="notes"']) {
    assert.match(LEAD_FORM_HTML, new RegExp(field));
  }
  // La actividad y el problema son declaraciones, no valores por defecto.
  assert.match(LEAD_FORM_HTML, /Actividad \(opcional\)/);
  assert.match(LEAD_FORM_HTML, /<option value="">No indicada<\/option>/);
  assert.match(LEAD_FORM_HTML, /Problema principal en tu finca \(opcional\)/);
  assert.match(LEAD_FORM_HTML, /<option value="">Sin concretar<\/option>/);
  // El interés de instalación vive ahora en request_type, no en el desplegable.
  assert.doesNotMatch(LEAD_FORM_HTML, /futura_instalacion/);
  // El desplegable contiene el segundo canal y los detalles.
  const detailsStart = LEAD_FORM_HTML.indexOf('<details class="lead-details');
  const detailsEnd = LEAD_FORM_HTML.indexOf('</details>', detailsStart);
  for (const field of ['name="secondary_email"', 'name="secondary_phone"', 'name="activity"',
    'name="interest"', 'name="crop_or_livestock"', 'name="notes"']) {
    const at = LEAD_FORM_HTML.indexOf(field);
    assert.ok(at > detailsStart && at < detailsEnd, `${field} debe ir dentro del desplegable`);
  }
});

test('el paso siguiente declara el plazo de respuesta y el uso de los datos', () => {
  assert.match(LEAD_FORM_HTML, /revisamos la solicitud/);
  assert.match(LEAD_FORM_HTML, /te responderemos por el canal que elijas/);
  assert.match(LEAD_FORM_HTML, /dentro de 1-2 d[ií]as laborables/);
  assert.match(LEAD_FORM_HTML, /no programa una instalación automática/);
  // El uso de los datos se explica junto a la solicitud y enlaza la privacidad.
  assert.match(LEAD_FORM_HTML, /Usamos tus datos solo para responder a esta solicitud/);
  assert.match(LEAD_FORM_HTML, /href="\/privacidad"/);
});

test('la confirmación concreta qué se recibió y por qué canal se responde', async () => {
  const source = await readFile(new URL('../public/js/leads.js', import.meta.url), 'utf8');
  assert.match(source, /Hemos recibido \$\{received\}/);
  assert.match(source, /Te responderemos por \$\{channelLabel\}/);
  assert.match(source, /dentro de 1-2 d[ií]as laborables/);
  assert.match(source, /No hace falta que hagas nada más/);
  assert.match(source, /consulta sobre una instalación/);
  // Ante fallo, lo escrito queda en pantalla para reintentar sin reescribir.
  assert.match(source, /Sin resetear: lo escrito queda en pantalla/);
  assert.match(source, /Comprueba tu conexión y vuelve a pulsar Enviar/);
});

test('el envío valida la modalidad y solo envía lo declarado', async () => {
  const source = await readFile(new URL('../public/js/leads.js', import.meta.url), 'utf8');
  assert.match(source, /Elige qué necesitas: información de instalación o probar el servicio\./);
  assert.match(source, /request_type: requestType/);
  assert.match(source, /if \(data\.get\('activity'\)\) body\.activity = data\.get\('activity'\);/);
  assert.match(source, /if \(data\.get\('interest'\)\) body\.interest = data\.get\('interest'\);/);
  // El bloqueo del botón durante el envío evita el doble clic.
  assert.match(source, /form\.dataset\.submitting = 'true'/);
  assert.match(source, /if \(submit\) submit\.disabled = true/);
});

test('el formulario mantiene consentimiento, honeypot y aviso de acceso inmediato', () => {
  assert.match(LEAD_FORM_HTML, /name="consent"/);
  assert.match(LEAD_FORM_HTML, /name="commercial_consent"/);
  assert.match(LEAD_FORM_HTML, /name="website"/);
  assert.match(LEAD_FORM_HTML, /no es la vía de acceso inmediato/);
});

// El conmutador de canal y el envío con validación de canal se ejercitan en el
// navegador; aquí se comprueba que el módulo sigue exportando lo que la app monta.
test('el módulo expone el montaje con el conmutador de canal', async () => {
  const source = await readFile(new URL('../public/js/leads.js', import.meta.url), 'utf8');
  assert.match(source, /function setLeadChannel\(form\)/);
  assert.match(source, /radio.addEventListener\('change', \(\) => setLeadChannel\(form\)\)/);
  assert.match(source, /data-contact-error/);
});
