import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { signupSteps, renderSignupSteps, signupBlock, availableChannels } from '../public/js/alerts.js';

const alertsSource = await readFile(new URL('../public/js/alerts.js', import.meta.url), 'utf8');
const accountSource = await readFile(new URL('../public/js/account.js', import.meta.url), 'utf8');

const me = (over = {}) => ({
  stations: [{ id: 'st-1', name: 'Casco urbano' }],
  contacts: [{ channel: 'email', address: 'a@b.es', verified: true, optedIn: true }],
  channelAvailability: { email: true, whatsapp: true },
  ...over,
});

// Preferencias con todos los tipos elegidos y ambos canales activos.
const fullPrefs = {
  receiveFrost: true, receiveHeat: true, receiveStorm: true, receiveWind: true,
  receiveHumidity: true, receiveGeneral: true, channelWhatsapp: true, channelEmail: true,
};

const alta = (over = {}) => signupSteps({ me: me(), engineVerified: true, whatsappDelivery: 'manual', prefs: fullPrefs, ...over });

// F17 · P2: «No hay avisos para estos filtros» no diferencia falta de avisos,
// acceso pendiente o configuración incompleta. El estado de alta sí.

test('una cuenta con el alta completa no pide ninguna acción', () => {
  const steps = alta();
  assert.deepEqual(steps.map((s) => s.state), ['ok', 'ok', 'ok', 'ok']);
  for (const step of steps) assert.equal(step.action, undefined);
});

test('sin estación ni finca, el primer paso falta y apunta al piloto', () => {
  const station = alta({ me: me({ stations: [], farms: [] }) })[0];
  assert.equal(station.state, 'missing');
  assert.equal(station.action.href, '#/');
  assert.match(station.detail, /medición propia/i);
});

test('sin canal de contacto, falta el canal y la acción lleva a Cuenta', () => {
  const steps = alta({ me: me({ contacts: [] }) });
  const channel = steps.find((step) => step.key === 'channel');
  assert.equal(channel.state, 'missing');
  assert.equal(channel.action.href, '#/cuenta');
});

test('sin canal configurado pero con correo de acceso, se ofrece reutilizarlo', () => {
  const steps = alta({ me: me({ contacts: [], emailVerifiedAt: '2026-10-01T00:00:00Z' }) });
  assert.match(steps.find((step) => step.key === 'channel').detail, /correo de acceso/i);
});

test('la verificación del alta habla del destinatario, no del acceso por correo', () => {
  const steps = alta({ me: me({ contacts: [{ channel: 'email', address: 'a@b.es', verified: false, optedIn: false }] }) });
  const email = steps.find((step) => step.key === 'channel:email');
  assert.equal(email.state, 'pending');
  assert.match(email.detail, /sin verificar/i);
  assert.doesNotMatch(email.detail, /correo de acceso/i);
});

test('motor sin comprobar degrada el paso de servicio y se declara', () => {
  const service = alta({ engineVerified: false }).find((step) => step.key === 'service');
  assert.equal(service.state, 'pending');
  assert.match(service.detail, /motor de avisos/i);
});

test('WhatsApp manual se declara en el servicio sin degradarlo', () => {
  const service = alta({ whatsappDelivery: 'manual' }).find((step) => step.key === 'service');
  assert.equal(service.state, 'ok');
  assert.match(service.detail, /manual/i);
});

test('renderSignupSteps pinta insignia, etiqueta, detalle y acción', () => {
  const html = renderSignupSteps(alta({ me: me({ stations: [], farms: [] }) }));
  assert.match(html, /badge-invalid/);
  assert.match(html, /<a class="link" href="#\/">Solicitar acceso al piloto<\/a>/);
  assert.match(html, /Sin estación concedida ni finca/);
});

test('el bloque de alta vacía distingue alta incompleta de alta completa', () => {
  const incomplete = signupBlock({ me: me({ contacts: [] }), engineVerified: true, whatsappDelivery: 'manual', prefs: fullPrefs });
  assert.match(incomplete, /data-signup/);
  assert.match(incomplete, /incompleta/);
  assert.match(incomplete, /tampoco significa que no haya riesgo/);
  const complete = signupBlock({ me: me(), engineVerified: true, whatsappDelivery: null, prefs: fullPrefs });
  assert.match(complete, /ninguna condición ha pasado de su límite/);
});

// C15 · el alta se calcula por canal y destinatario: cada canal se valora sobre
// el mismo contacto y las categorías o el terreno no se marcan por venir de un
// contacto completo.
test('email verificado sin permiso y WhatsApp con permiso sin verificar quedan ambos pendientes', () => {
  const contacts = [
    { channel: 'email', address: 'a@b.es', verified: true, optedIn: false },
    { channel: 'whatsapp', address: '+34600', verified: false, optedIn: true },
  ];
  const steps = alta({ me: me({ contacts }) });
  const channels = steps.filter((step) => step.key === 'channel:email' || step.key === 'channel:whatsapp');
  assert.equal(channels.length, 2);
  for (const step of channels) assert.equal(step.state, 'pending');
});

test('un contacto completo no activa categorías ni estaciones no elegidas', () => {
  const steps = alta({ me: me({ stations: [], farms: [] }), prefs: { channelEmail: true, channelWhatsapp: true } });
  assert.equal(steps.find((step) => step.key === 'categories').state, 'pending');
  assert.equal(steps.find((step) => step.key === 'station').state, 'missing');
  assert.equal(steps.find((step) => step.key === 'channel:email').state, 'pending');
});

test('el canal apagado en preferencias deja el canal pendiente', () => {
  const steps = alta({ prefs: { ...fullPrefs, channelEmail: false } });
  const email = steps.find((step) => step.key === 'channel:email');
  assert.equal(email.state, 'pending');
  assert.match(email.detail, /apagado/i);
});

// F18 · P2: el centro ofrecía SMS, Webhook, Push y WhatsApp aunque la cuenta
// solo opera correo y WhatsApp (manual). Tres selectores + Aplicar comían la
// primera pantalla móvil.

test('los canales disponibles para la cuenta son en pantalla, correo y WhatsApp', () => {
  const keys = availableChannels({ me: me(), whatsappDelivery: 'manual' }).map((c) => c.key);
  assert.deepEqual(keys, ['in_app', 'email', 'whatsapp']);
  for (const forbidden of ['sms', 'webhook', 'push']) assert.ok(!keys.includes(forbidden));
});

test('sin contacto de WhatsApp y sin entrega, el canal no se ofrece', () => {
  const keys = availableChannels({ me: me(), whatsappDelivery: 'disabled' }).map((c) => c.key);
  assert.deepEqual(keys, ['in_app', 'email']);
});

test('el contacto de WhatsApp basta para ofrecer el canal, aunque no haya entrega', () => {
  const withContact = availableChannels({ me: me({ contacts: [{ channel: 'whatsapp', address: '+34600', verified: true, optedIn: true }] }), whatsappDelivery: null });
  assert.deepEqual(withContact.map((c) => c.key), ['in_app', 'email', 'whatsapp']);
});

test('el filtro de canal del centro se construye desde los canales disponibles', () => {
  assert.match(alertsSource, /availableChannels\(\{ me: session\.me, whatsappDelivery: session\.support\?\.whatsappDelivery \}\)/);
  assert.doesNotMatch(alertsSource, /data-filter="channel">\s*\n\s*<option value="">Todos<\/option>\$\{Object\.entries\(CHANNEL_LABELS\)/);
});

test('el centro separa servicio, activos, historial y deja los filtros al final', () => {
  const start = alertsSource.indexOf('<div class="page-heading">');
  const center = alertsSource.slice(start, alertsSource.indexOf('data-rules', start));
  const service = center.indexOf('data-service');
  const active = center.indexOf('data-active-rows');
  const history = center.indexOf('data-history-rows');
  const filters = center.indexOf('filters-advanced');
  assert.ok(service > -1 && active > service && history > active && filters > history,
    'orden esperado: servicio → activos → historial → filtros');
  assert.match(center, /Filtros avanzados<\/summary>/);
  for (const inside of ['data-filter="channel"', 'data-filter="device"', 'data-action="apply"']) {
    assert.ok(center.indexOf(inside) > filters, `${inside} debe quedar dentro del desplegable`);
  }
  // Los activos y el historial son listas distintas: no comparten un selector de estado.
  assert.doesNotMatch(center, /data-filter="status"/);
});

test('el centro declara qué canales existen de verdad para la cuenta', () => {
  const start = alertsSource.indexOf('page-heading');
  const center = alertsSource.slice(start, alertsSource.indexOf('data-rules', start));
  assert.match(center, /de forma manual durante el piloto/);
  assert.match(center, /SMS, Webhook y Push no están disponibles/);
});

// El formulario de reglas compartía el problema: permitía crear reglas por
// canales que la cuenta no puede usar.
test('las reglas nuevas solo se crean para canales disponibles', () => {
  assert.match(alertsSource, /name="channel">\$\{availableChannels\(/);
});

test('Cuenta guía en cuatro pasos y mantiene los ajustes opcionales en segundo plano', () => {
  const steps = [...accountSource.matchAll(/data-account-step="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(steps, ['location', 'receive', 'channel', 'check']);
  for (const title of ['Dónde está mi finca', 'Qué quiero recibir', 'Cómo quiero recibirlo', 'Comprobar que funciona']) {
    assert.ok(accountSource.includes(title), `falta el paso «${title}»`);
  }
  assert.match(accountSource, /data-account-jump/);
  assert.match(accountSource, /accountGuide\(me, prefs\)/);
  const secondary = accountSource.indexOf('<details class="technical-details account-secondary">');
  const commercial = accountSource.indexOf('<details class="technical-details account-commercial">');
  assert.ok(secondary > accountSource.indexOf('data-account-step="check"'));
  assert.ok(commercial > secondary);
  assert.match(accountSource.slice(secondary, commercial), /data-thresholds-form/);
  assert.match(accountSource.slice(commercial), /data-commercial=/);
});

test('las secciones guiadas mantienen formularios con guardado independiente', () => {
  for (const form of ['data-location-prefs-form', 'data-farm-form', 'data-prefs-form',
    'data-public-form', 'data-channel-prefs-form', 'data-contact-form', 'data-profile-form']) {
    assert.match(accountSource, new RegExp(form));
  }
  assert.match(accountSource, /api\('\/api\/v1\/alert-preferences', \{ method: 'PUT'/);
  assert.match(accountSource, /data-public-test/);
});

test('Cuenta presenta el estado por canal y los pasos propios', () => {
  assert.match(accountSource, /function accountGuide\(/);
  assert.match(accountSource, /function signupStepper\(/);
  assert.match(accountSource, /alertReadiness\(/);
  assert.match(accountSource, /READINESS_CHANNEL_LABELS/);
  assert.match(accountSource, /label: 'Tipos de aviso'/);
  assert.match(accountSource, /label: 'Estación o finca'/);
  assert.match(accountSource, /data-channel-prefs-form/);
  // Las preferencias meteorológicas siguen teniendo guardado independiente.
  assert.match(accountSource, /data-prefs-form/);
  assert.match(accountSource, /no envía una alerta privada de prueba/);
});

test('la verificación del correo de acceso se distingue de la del destinatario', () => {
  assert.match(accountSource, /Correo de acceso verificado/);
  assert.match(accountSource, /es distinta de la verificación por código de un destinatario de avisos/);
});

test('el estado de alta se explica aunque ya haya avisos si falta completarlo', () => {
  // Antes el bloque solo aparecía con la lista vacía: una cuenta con avisos en
  // pantalla pero sin contacto verificado no veía qué le faltaba.
  assert.match(alertsSource, /const incomplete = steps\.some\(\(step\) => step\.state !== 'ok'\)/);
  assert.match(alertsSource, /\(open\.length && !incomplete\)/);
});

test('el alta completa no promete que no haya riesgo', () => {
  const complete = signupBlock({ me: me(), engineVerified: true, whatsappDelivery: null, prefs: fullPrefs });
  assert.doesNotMatch(complete, /es porque ninguna condición/);
  assert.match(complete, /revisa la calidad de los datos recibidos/);
});

test('los campos de contacto de Cuenta declaran autocomplete y tipo', () => {
  assert.match(accountSource, /autocomplete: 'tel'/);
  assert.match(accountSource, /autocomplete: 'email'/);
  assert.match(accountSource, /autocomplete="\$\{channel\.autocomplete\}"/);
  assert.match(accountSource, /type="\$\{channel\.inputType\}"/);
});

test('los umbrales propios se declaran como preferencia que aún no modifica avisos', () => {
  assert.match(accountSource, /no modifican los avisos que recibes/);
  const secondary = accountSource.indexOf('<details class="technical-details account-secondary">');
  const thresholdForm = accountSource.indexOf('data-thresholds-form');
  const commercial = accountSource.indexOf('<details class="technical-details account-commercial">');
  assert.ok(thresholdForm > secondary && thresholdForm < commercial, 'los límites de referencia quedan en los ajustes secundarios');
  assert.ok(accountSource.indexOf('no modifican los avisos que recibes') < thresholdForm);
});
