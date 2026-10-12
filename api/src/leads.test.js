import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leadSchema, isHoneypot, leadRateLimitKeys, leadColumns, normalizePhone, leadContact, leadContactKey,
  commercialConsentChannels, serviceConsentChannels, REQUEST_TYPES,
  ACTIVITIES, INTERESTS, LEAD_STATUSES,
} from './leads.js';

const base = {
  name: 'María Pérez',
  preferred_channel: 'email',
  request_type: 'installation_info',
  email: 'maria@example.test',
  zone: 'Huéscar',
  consent: true,
};

const whatsappBase = {
  ...base,
  preferred_channel: 'whatsapp',
  email: undefined,
  phone: '+34 600 123 456',
};

test('lead contract normalizes the WhatsApp phone and strips separators', () => {
  const parsed = leadSchema.parse({ ...whatsappBase });
  assert.equal(parsed.phone, '+34600123456');
  assert.equal(normalizePhone('600-123.456'), '600123456');
});

test('a valid lead can be submitted with email only', () => {
  const parsed = leadSchema.parse({ ...base });
  assert.equal(parsed.preferred_channel, 'email');
  assert.equal(parsed.phone, undefined);
});

test('a valid lead can be submitted with WhatsApp only', () => {
  const parsed = leadSchema.parse({ ...whatsappBase });
  assert.equal(parsed.preferred_channel, 'whatsapp');
  assert.equal(parsed.email, undefined);
});

test('the chosen channel requires its own contact', () => {
  const withoutEmail = { ...base, email: undefined };
  assert.equal(leadSchema.safeParse(withoutEmail).success, false);
  const issues = leadSchema.safeParse(withoutEmail).error.issues;
  assert.ok(issues.some((issue) => issue.path.includes('email')), 'fallo sin señalar el email');
  const withoutPhone = { ...whatsappBase, phone: undefined };
  assert.equal(leadSchema.safeParse(withoutPhone).success, false);
  const phoneIssues = leadSchema.safeParse(withoutPhone).error.issues;
  assert.ok(phoneIssues.some((issue) => issue.path.includes('phone')), 'fallo sin señalar el teléfono');
});

test('the second channel is optional but validated when present', () => {
  const both = leadSchema.parse({ ...base, phone: '+34 600 123 456' });
  assert.equal(both.phone, '+34600123456');
  assert.equal(leadSchema.safeParse({ ...base, phone: '123' }).success, false);
});

test('lead contract requires explicit consent and the municipality', () => {
  assert.equal(leadSchema.safeParse({ ...base, consent: false }).success, false);
  assert.equal(leadSchema.safeParse({ name: base.name, preferred_channel: base.preferred_channel, email: base.email }).success, false,
    'sin municipio la solicitud no entra');
  assert.equal(leadSchema.safeParse({ ...base, zone: 'H' }).success, false);
});

test('lead contract rejects malformed contacts and unexpected fields', () => {
  assert.equal(leadSchema.safeParse({ ...base, email: 'no-es-email' }).success, false);
  assert.equal(leadSchema.safeParse({ ...whatsappBase, phone: 'no-es-telefono' }).success, false);
  assert.equal(leadSchema.safeParse({ ...base, is_admin: true }).success, false);
  assert.equal(leadSchema.safeParse({ ...base, preferred_channel: 'telegram' }).success, false);
});

test('lead contract validates activity and interest options', () => {
  assert.equal(leadSchema.safeParse({ ...base, activity: 'pesca' }).success, false);
  assert.equal(leadSchema.safeParse({ ...base, interest: 'terremotos' }).success, false);
  assert.equal(leadSchema.safeParse({ ...base, email: 'Finca@Example.test' }).success, true);
});

test('the request type is bounded and drives the installation interest', () => {
  assert.equal(leadSchema.safeParse({ ...base, request_type: 'demo' }).success, false);
  // Una consulta de instalación cuenta como tal aunque no se abra el
  // desplegable: sin activity ni interest declarados, el contrato pasa.
  const parsed = leadSchema.parse({ ...base });
  assert.equal(parsed.request_type, 'installation_info');
  assert.equal(parsed.activity, undefined);
  assert.equal(parsed.interest, undefined);
  const columns = leadColumns(parsed);
  assert.equal(columns.request_type, 'installation_info');
  // Y sin actividad declarada, nadie se guarda como agricultor por defecto.
  assert.equal(columns.activity, null);
});

test('the catalogues match the brief', () => {
  assert.deepEqual(ACTIVITIES, ['agricultura', 'ganaderia', 'mixta', 'otra']);
  assert.deepEqual(INTERESTS,
    ['heladas', 'calor', 'tormentas', 'viento', 'humedad', 'general', 'futura_instalacion']);
  assert.deepEqual(LEAD_STATUSES, ['nuevo', 'contactado', 'interesado', 'piloto_activo', 'cliente', 'descartado']);
});

test('a lead can express interest in a future installation', () => {
  const parsed = leadSchema.parse({ ...base, interest: 'futura_instalacion', crop_or_livestock: 'Olivar' });
  assert.equal(parsed.interest, 'futura_instalacion');
  const columns = leadColumns(parsed);
  assert.equal(columns.interest, 'futura_instalacion');
  assert.equal(columns.zone, 'Huéscar');
  assert.equal(columns.crop_or_livestock, 'Olivar');
  // Seguirá siendo una solicitud de servicio: la casilla comercial sigue aparte.
  assert.equal(columns.commercial_consent, undefined);
});

test('honeypot submissions are detected without being stored', () => {
  const parsed = leadSchema.parse({ ...base, website: 'http://spam.example' });
  assert.equal(isHoneypot(parsed), true);
  assert.equal(isHoneypot(leadSchema.parse({ ...base, website: '' })), false);
});

test('lead contact falls back from phone to email', () => {
  assert.equal(leadContact({ phone: '+34600123456', email: null }), '+34600123456');
  assert.equal(leadContact({ phone: null, email: 'finca@example.test' }), 'finca@example.test');
});

test('la clave de contacto va etiquetada por canal y normaliza cada lado', () => {
  assert.equal(leadContactKey({ preferred_channel: 'whatsapp', phone: '+34 600 123 456' }), 'whatsapp:+34600123456');
  assert.equal(leadContactKey({ preferred_channel: 'email', email: ' Finca@Example.test ' }), 'email:finca@example.test');
  // El email no pasa por la normalización de teléfono: conserva puntos y guiones.
  assert.equal(leadContactKey({ preferred_channel: 'email', email: 'a-b@x.test' }), 'email:a-b@x.test');
  // Con ambos contactos, el preferido va primero; sin ninguno, no hay clave.
  assert.equal(leadContactKey({ preferred_channel: 'email', email: 'f@x.test', phone: '600123456' }),
    'email:f@x.test|whatsapp:600123456');
  assert.equal(leadContactKey({ preferred_channel: 'email' }), null);
});

test('lead rate limit keys hash IP and contact without keeping personal data', () => {
  const keys = leadRateLimitKeys('192.0.2.15', { preferred_channel: 'whatsapp', phone: '+34 600 123 456' });
  assert.equal(keys.length, 2);
  assert.ok(keys.every((key) => /^[a-f0-9]{64}$/.test(key)));
  assert.deepEqual(keys, leadRateLimitKeys('192.0.2.15', { preferred_channel: 'whatsapp', phone: '+34600123456' }));
  assert.notDeepEqual(keys, leadRateLimitKeys('192.0.2.16', { preferred_channel: 'whatsapp', phone: '+34600123456' }));
  const byEmail = leadRateLimitKeys('192.0.2.15', { preferred_channel: 'email', email: 'Finca@Example.test' });
  assert.deepEqual(byEmail, leadRateLimitKeys('192.0.2.15', { preferred_channel: 'email', email: 'finca@example.test' }),
    'el límite por email no distingue mayúsculas');
  // Un email-only no comparte clave con otro email-only distinto ni con el
  // hipotético hash de un teléfono vacío.
  const otherEmail = leadRateLimitKeys('192.0.2.15', { preferred_channel: 'email', email: 'otro@example.test' });
  assert.notDeepEqual(byEmail, otherEmail);
  const noContact = leadRateLimitKeys('192.0.2.15', { preferred_channel: 'email' });
  assert.notDeepEqual(byEmail, noContact);
  assert.notDeepEqual(otherEmail, noContact);
});

test('el formulario público no acepta rol ni plan enviados por el visitante', () => {
  for (const field of ['role', 'plan', 'admin', 'status']) {
    assert.equal(leadSchema.safeParse({ ...base, [field]: 'admin' }).success, false, `se coló ${field}`);
  }
});

test('advertising is a separate, unchecked-by-default option', () => {
  const without = leadSchema.parse({ ...whatsappBase });
  assert.equal(without.commercial_consent, undefined);
  assert.deepEqual(commercialConsentChannels(without), []);
  const both = leadSchema.parse({ ...base, phone: '+34600123456', commercial_consent: true });
  assert.deepEqual(commercialConsentChannels(both), ['email', 'whatsapp']);
  assert.deepEqual(serviceConsentChannels(both), ['email', 'whatsapp']);
  const onlyPhone = leadSchema.parse({ ...whatsappBase, commercial_consent: true });
  assert.deepEqual(commercialConsentChannels(onlyPhone), ['whatsapp']);
  const onlyEmail = leadSchema.parse({ ...base, commercial_consent: true });
  assert.deepEqual(commercialConsentChannels(onlyEmail), ['email']);
});

test('campaign parameters are validated and sanitized before storage', () => {
  assert.equal(leadSchema.safeParse({ ...base, campaign: { other: 'x' } }).success, false);
  const parsed = leadSchema.parse({ ...base, campaign: { source: 'Google Ads', medium: 'cpc' } });
  assert.deepEqual(leadColumns(parsed).campaign, { source: 'googleads', medium: 'cpc' });
  assert.deepEqual(leadColumns(leadSchema.parse({ ...base })).campaign, {});
});

test('lead columns keep the farm data, the channel, and drop the honeypot', () => {
  const parsed = leadSchema.parse({
    ...base, interest: 'heladas', website: '',
  });
  const columns = leadColumns(parsed);
  assert.equal(columns.activity, null);
  assert.equal(columns.request_type, 'installation_info');
  assert.equal(columns.zone, 'Huéscar');
  assert.equal(columns.email, 'maria@example.test');
  assert.equal(columns.phone, null);
  assert.equal(columns.preferred_channel, 'email');
  assert.equal(columns.interest, 'heladas');
  assert.equal(columns.source, 'web');
  assert.equal('consent' in columns, false);
  assert.equal('website' in columns, false);
});
