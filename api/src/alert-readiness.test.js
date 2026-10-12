import test from 'node:test';
import assert from 'node:assert/strict';
import { alertReadiness, categorySelected } from '../public/js/alert-readiness.js';

// C15: un canal está listo solo si todas las condiciones se cumplen sobre el
// mismo contacto; las categorías y el terreno son estados propios.

const prefs = (over = {}) => ({
  receiveFrost: true, channelEmail: true, channelWhatsapp: true, ...over,
});
const me = (over = {}) => ({
  stations: [{ id: 'st-1', name: 'Casco urbano' }],
  contacts: [{ channel: 'email', address: 'a@b.es', verified: true, optedIn: true }],
  ...over,
});

test('un contacto verificado y autorizado con el resto cumplido está listo', () => {
  const readiness = alertReadiness({ me: me(), prefs: prefs(), service: { email: true, whatsapp: true } });
  assert.equal(readiness.channels.email.ready, true);
  assert.equal(readiness.anyReady, true);
});

test('verificado pero sin autorización no está listo', () => {
  const readiness = alertReadiness({
    me: me({ contacts: [{ channel: 'email', address: 'a@b.es', verified: true, optedIn: false }] }),
    prefs: prefs(), service: { email: true },
  });
  assert.equal(readiness.channels.email.ready, false);
  assert.ok(readiness.channels.email.missing.includes('authorized'));
});

test('el canal apagado en preferencias deja el canal pendiente', () => {
  const readiness = alertReadiness({
    me: me(), prefs: prefs({ channelEmail: false }), service: { email: true },
  });
  assert.equal(readiness.channels.email.ready, false);
  assert.ok(readiness.channels.email.missing.includes('preferences'));
});

test('sin categorías elegidas ningún canal está listo', () => {
  const readiness = alertReadiness({
    me: me(), prefs: { channelEmail: true, channelWhatsapp: true }, service: { email: true },
  });
  assert.equal(readiness.channels.email.ready, false);
  assert.ok(readiness.channels.email.missing.includes('categories'));
});

test('sin estación ni finca ningún canal está listo', () => {
  const readiness = alertReadiness({
    me: me({ stations: [], farms: [] }), prefs: prefs(), service: { email: true },
  });
  assert.equal(readiness.channels.email.ready, false);
  assert.ok(readiness.channels.email.missing.includes('land'));
});

test('con el servicio del canal caído no está listo, aunque el contacto sea completo', () => {
  const readiness = alertReadiness({ me: me(), prefs: prefs(), service: { email: false } });
  assert.equal(readiness.channels.email.ready, false);
  assert.ok(readiness.channels.email.missing.includes('service'));
});

test('categories y stations se exponen aparte de un contacto completo', () => {
  const readiness = alertReadiness({
    me: me({ contacts: [] }), prefs: { channelEmail: true }, service: {},
  });
  assert.equal(readiness.categories.selected, false);
  assert.equal(readiness.stations, true);
  assert.equal(readiness.channels.email.ready, false);
});

test('categorySelected exige una elección real', () => {
  assert.equal(categorySelected(null), false);
  assert.equal(categorySelected({}), false);
  assert.equal(categorySelected({ receiveGeneral: true }), true);
});
