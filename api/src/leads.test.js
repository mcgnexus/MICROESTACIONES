import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leadSchema, isHoneypot, leadRateLimitKeys, leadColumns, normalizePhone,
  ACTIVITIES, INTERESTS, LEAD_STATUSES,
} from './leads.js';

const base = {
  name: 'María Pérez',
  phone: '+34 600 123 456',
  consent: true,
};

test('lead contract normalizes the WhatsApp phone and strips separators', () => {
  const parsed = leadSchema.parse({ ...base });
  assert.equal(parsed.phone, '+34600123456');
  assert.equal(normalizePhone('600-123.456'), '600123456');
});

test('lead contract requires explicit consent', () => {
  assert.equal(leadSchema.safeParse({ ...base, consent: false }).success, false);
  assert.equal(leadSchema.safeParse({ name: base.name, phone: base.phone }).success, false);
});

test('lead contract rejects malformed phones and unexpected fields', () => {
  assert.equal(leadSchema.safeParse({ ...base, phone: '123' }).success, false);
  assert.equal(leadSchema.safeParse({ ...base, phone: 'no-es-telefono' }).success, false);
  assert.equal(leadSchema.safeParse({ ...base, is_admin: true }).success, false);
});

test('lead contract validates email, activity and interest options', () => {
  assert.equal(leadSchema.safeParse({ ...base, email: 'no-es-email' }).success, false);
  assert.equal(leadSchema.safeParse({ ...base, email: 'Finca@Example.test' }).success, true);
  assert.equal(leadSchema.safeParse({ ...base, activity: 'pesca' }).success, false);
  assert.equal(leadSchema.safeParse({ ...base, interest: 'terremotos' }).success, false);
});

test('the catalogues match the brief', () => {
  assert.deepEqual(ACTIVITIES, ['agricultura', 'ganaderia', 'mixta', 'otra']);
  assert.deepEqual(INTERESTS, ['heladas', 'calor', 'tormentas', 'viento', 'humedad', 'general']);
  assert.deepEqual(LEAD_STATUSES, ['nuevo', 'contactado', 'interesado', 'piloto_activo', 'cliente', 'descartado']);
});

test('honeypot submissions are detected without being stored', () => {
  const parsed = leadSchema.parse({ ...base, website: 'http://spam.example' });
  assert.equal(isHoneypot(parsed), true);
  assert.equal(isHoneypot(leadSchema.parse({ ...base, website: '' })), false);
});

test('lead rate limit keys hash IP and phone without keeping personal data', () => {
  const keys = leadRateLimitKeys('192.0.2.15', '+34 600 123 456');
  assert.equal(keys.length, 2);
  assert.ok(keys.every((key) => /^[a-f0-9]{64}$/.test(key)));
  assert.deepEqual(keys, leadRateLimitKeys('192.0.2.15', '+34600123456'));
  assert.notDeepEqual(keys, leadRateLimitKeys('192.0.2.16', '+34600123456'));
});

test('lead columns keep the farm data, default the activity, and drop the honeypot', () => {
  const parsed = leadSchema.parse({
    ...base, email: 'finca@example.test', zone: 'Huéscar', interest: 'heladas', website: '',
  });
  const columns = leadColumns(parsed);
  assert.equal(columns.activity, 'agricultura');
  assert.equal(columns.zone, 'Huéscar');
  assert.equal(columns.email, 'finca@example.test');
  assert.equal(columns.interest, 'heladas');
  assert.equal(columns.source, 'web');
  assert.equal('consent' in columns, false);
  assert.equal('website' in columns, false);
});
