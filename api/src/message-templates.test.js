import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATE_KINDS, TEMPLATE_CATEGORIES, DEFAULT_TEMPLATE_LANGUAGE,
  templateLanguage, whatsappTemplateName, twilioContentSid, templateCategory,
  verificationButtonType, whatsappTemplate,
} from './message-templates.js';

// Cambio 16: cada tipo de mensaje resuelve su plantilla aprobada y su idioma.

test('sin variables de entorno no hay plantilla para ningún tipo', () => {
  for (const kind of TEMPLATE_KINDS) {
    assert.equal(whatsappTemplate(kind, { env: {}, params: ['x'] }), null);
  }
});

test('el nombre de plantilla y el idioma salen del entorno', () => {
  const env = {
    WHATSAPP_TEMPLATE_VERIFICATION: 'codigo_tecrural',
    WHATSAPP_TEMPLATE_ALERT: 'aviso_tecrural',
    WHATSAPP_TEMPLATE_LANG: 'es_ES',
  };
  assert.equal(whatsappTemplateName('contact_verification', env), 'codigo_tecrural');
  assert.equal(whatsappTemplateName('alert', env), 'aviso_tecrural');
  assert.equal(whatsappTemplateName('commercial', env), null);
  assert.equal(templateLanguage(env), 'es_ES');
  assert.equal(templateLanguage({}), DEFAULT_TEMPLATE_LANGUAGE);
});

test('el descriptor incluye categoría, idioma y parámetros como texto', () => {
  const env = { WHATSAPP_TEMPLATE_ALERT: 'aviso_tecrural', WHATSAPP_TEMPLATE_LANG: 'es' };
  const template = whatsappTemplate('alert', { env, params: ['Aviso: helada', null, 'Huéscar', '-1,4 °C', '05/01 05:12'] });
  assert.equal(template.name, 'aviso_tecrural');
  assert.equal(template.category, 'utility');
  assert.equal(template.language, 'es');
  assert.deepEqual(template.params, ['Aviso: helada', '', 'Huéscar', '-1,4 °C', '05/01 05:12']);
});

test('la categoría declarada separa verificación, avisos y publicidad', () => {
  assert.equal(templateCategory('contact_verification'), 'authentication');
  assert.equal(templateCategory('alert'), 'utility');
  assert.equal(templateCategory('lead_confirmation'), 'utility');
  assert.equal(templateCategory('commercial'), 'marketing');
  assert.equal(templateCategory('desconocido'), null);
  assert.deepEqual(Object.keys(TEMPLATE_CATEGORIES).sort(), [...TEMPLATE_KINDS].sort());
});

test('el botón de verificación es configurable y por defecto no se exige', () => {
  assert.equal(verificationButtonType({}), 'none');
  assert.equal(verificationButtonType({ WHATSAPP_TEMPLATE_VERIFICATION_BUTTON: 'copy_code' }), 'copy_code');
  assert.equal(verificationButtonType({ WHATSAPP_TEMPLATE_VERIFICATION_BUTTON: 'url' }), 'url');
  assert.equal(verificationButtonType({ WHATSAPP_TEMPLATE_VERIFICATION_BUTTON: 'otro' }), 'none');
  const template = whatsappTemplate('contact_verification', {
    env: { WHATSAPP_TEMPLATE_VERIFICATION: 'codigo', WHATSAPP_TEMPLATE_VERIFICATION_BUTTON: 'copy_code' },
    params: ['042317'],
  });
  assert.equal(template.category, 'authentication');
  assert.equal(template.button, 'copy_code');
});

test('Twilio se resuelve por ContentSid aunque no haya nombre de Meta', () => {
  const env = { TWILIO_CONTENT_ALERT: 'HX123' };
  assert.equal(twilioContentSid('alert', env), 'HX123');
  const template = whatsappTemplate('alert', { env, params: ['a'] });
  assert.equal(template.contentSid, 'HX123');
  assert.equal(template.name, null);
});
