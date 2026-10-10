import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEAD_FORM_HTML, submitLead } from '../public/js/leads.js';

// F23 · P2: la solicitud pedía ocho campos y dos casillas antes de concretar el
// beneficio, sin plazo de respuesta y con el teléfono como texto libre. Ahora se
// abre con nombre, teléfono y zona; actividad e interés van en un desplegable
// opcional; se anuncia el siguiente paso con un plazo real; y el teléfono usa
// teclado telefónico (type="tel" + inputmode="tel").

test('la solicitud se abre solo con nombre, teléfono y zona', () => {
  for (const core of ['name="name"', 'name="phone"', 'name="zone"']) {
    assert.match(LEAD_FORM_HTML, new RegExp(`<label>.*?<input ${core}`), `falta ${core}`);
  }
});

test('actividad, interés, cultivo, correo y notas van en un desplegable opcional', () => {
  assert.match(LEAD_FORM_HTML, /<details class="lead-details/);
  assert.match(LEAD_FORM_HTML, /Cuéntanos más de tu actividad \(opcional\)/);
  for (const field of ['name="activity"', 'name="interest"', 'name="crop_or_livestock"',
    'name="email"', 'name="notes"']) {
    assert.match(LEAD_FORM_HTML, new RegExp(field));
  }
  // Los campos opcionales quedan dentro del desplegable, no visibles al abrir.
  const detailsStart = LEAD_FORM_HTML.indexOf('<details class="lead-details');
  const detailsEnd = LEAD_FORM_HTML.indexOf('</details>', detailsStart);
  for (const field of ['name="activity"', 'name="interest"', 'name="crop_or_livestock"',
    'name="email"', 'name="notes"']) {
    const at = LEAD_FORM_HTML.indexOf(field);
    assert.ok(at > detailsStart && at < detailsEnd, `${field} debe ir dentro del desplegable`);
  }
});

test('el teléfono usa teclado telefónico: type="tel" con inputmode="tel"', () => {
  const phone = LEAD_FORM_HTML.match(/<input[^>]*name="phone"[^>]*>/)[0];
  assert.match(phone, /type="tel"/);
  assert.match(phone, /inputmode="tel"/);
});

test('la solicitud anuncia el siguiente paso con un plazo real', () => {
  assert.match(LEAD_FORM_HTML, /5 días laborables/);
  assert.match(LEAD_FORM_HTML, /revisamos la solicitud/);
  assert.match(LEAD_FORM_HTML, /no programa una instalación automática/);
});

test('el formulario mantiene consentimiento, honeypot y aviso de acceso inmediato', () => {
  assert.match(LEAD_FORM_HTML, /name="consent"/);
  assert.match(LEAD_FORM_HTML, /name="commercial_consent"/);
  assert.match(LEAD_FORM_HTML, /name="website"/);
  assert.match(LEAD_FORM_HTML, /no es la vía de acceso inmediato/);
});
