import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { session, supportText, whatsappLink } from '../public/js/ui.js';

const server = await readFile(new URL('./server.js', import.meta.url), 'utf8');
const contacto = await readFile(new URL('../public/contacto.html', import.meta.url), 'utf8');

// Cambio 9: el contacto ofrece un enlace wa.me real con el número comercial
// (SUPPORT_WHATSAPP), no una llamada al teléfono de voz, y sin número no hay
// enlace vacío. Abrir WhatsApp no crea lead: es solo contacto.

test('whatsappLink builds a wa.me url with the prepared message', () => {
  const url = whatsappLink('+34 600 123 456');
  assert.match(url, /^https:\/\/wa\.me\/34600123456\?text=/);
  assert.match(decodeURIComponent(url), /me interesa una microestación TecRural para mi finca\. Está en el municipio de…/);
  assert.equal(whatsappLink(''), '');
  assert.equal(whatsappLink(null), '');
  assert.equal(whatsappLink('no-es-numero'), '');
});

test('supportText mixes phone and whatsapp independently', () => {
  const original = session.support;
  session.support = { supportPhone: '+34 600 000 001' };
  assert.match(supportText(), /tel:\+34600000001/);
  assert.doesNotMatch(supportText(), /wa\.me/);
  session.support = { supportWhatsapp: '600123456' };
  assert.match(supportText(), /wa\.me\/600123456/);
  assert.doesNotMatch(supportText(), /tel:/);
  session.support = { supportPhone: '600000001', supportWhatsapp: '600123456' };
  assert.match(supportText(), /tel:600000001/);
  assert.match(supportText(), /wa\.me\/600123456/);
  session.support = {};
  assert.equal(supportText(), '');
  session.support = original;
});

test('server exposes the conditional block and keeps the number separate', () => {
  assert.match(server, /export function supportWhatsappLink/);
  assert.match(server, /replace\(\/\\D\/g, ''\)/, 'el número va limpio de separadores');
  assert.match(server, /me interesa una microestación TecRural para mi finca/);
  // Bloque condicional: sin número el marcador desaparece, no queda href vacío.
  assert.match(server, /replaceAll\('<!--SUPPORT_WHATSAPP-->', supportWhatsappBlock\(\)\)/);
  assert.match(server, /if \(!url\) return '';/);
});

test('la página de contacto usa el bloque condicional de WhatsApp', () => {
  assert.match(contacto, /<!--SUPPORT_WHATSAPP-->/);
  assert.match(contacto, /Pedir información para instalar una estación/);
  assert.doesNotMatch(contacto, /Solicitar acceso gratuito/);
  // Ya no se remite al número de voz para WhatsApp: hay enlace propio o nada.
  assert.doesNotMatch(contacto, /escríbenos por WhatsApp a ese mismo número/);
});
