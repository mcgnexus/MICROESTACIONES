import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { signupSteps, renderSignupSteps, signupBlock, availableChannels } from '../public/js/alerts.js';

const alertsSource = await readFile(new URL('../public/js/alerts.js', import.meta.url), 'utf8');
const accountSource = await readFile(new URL('../public/js/account.js', import.meta.url), 'utf8');

const me = (over = {}) => ({
  stations: [{ id: 'st-1', name: 'Casco urbano' }],
  contacts: [{ channel: 'email', address: 'a@b.es', verified: true, optedIn: true }],
  ...over,
});

const alta = (over = {}) => signupSteps({ me: me(), engineVerified: true, whatsappDelivery: 'manual', ...over });

// F17 · P2: «No hay avisos para estos filtros» no diferencia falta de avisos,
// acceso pendiente o configuración incompleta. El estado de alta sí.

test('una cuenta con el alta completa no pide ninguna acción', () => {
  const steps = alta();
  assert.deepEqual(steps.map((s) => s.state), ['ok', 'ok', 'ok', 'ok', 'ok']);
  for (const step of steps) assert.equal(step.action, undefined);
});

test('sin estación concedida, el primer paso falta y apunta al piloto', () => {
  const station = alta({ me: me({ stations: [] }) })[0];
  assert.equal(station.state, 'missing');
  assert.equal(station.action.href, '#/');
  assert.match(station.detail, /medición propia/i);
});

test('sin canal de contacto, falta el canal y la acción lleva a Cuenta', () => {
  const steps = alta({ me: me({ contacts: [] }) });
  assert.equal(steps[1].state, 'missing');
  assert.equal(steps[1].action.href, '#/cuenta');
  // Sin canal no hay autorización ni verificación que revisar: se dice, sin acción.
  assert.equal(steps[2].state, 'missing');
  assert.ok(!steps[2].action);
  assert.equal(steps[3].state, 'missing');
});

test('canal configurado a medias se marca pendiente y pide completarlo', () => {
  const steps = alta({ me: me({ contacts: [{ channel: 'whatsapp', address: '+34600', verified: false, optedIn: true }] }) });
  assert.equal(steps[1].state, 'pending');
  assert.equal(steps[1].action.href, '#/cuenta');
  assert.equal(steps[2].state, 'ok', 'hay autorización: opt_in a true');
  assert.equal(steps[3].state, 'pending', 'falta la verificación del destinatario');
});

test('la verificación del alta habla del destinatario, no del acceso por correo', () => {
  const steps = alta({ me: me({ contacts: [{ channel: 'email', address: 'a@b.es', verified: false, optedIn: false }] }) });
  assert.match(steps[3].detail, /destinatario/i);
  assert.match(steps[3].detail, /código/i);
  assert.doesNotMatch(steps[3].detail, /correo de acceso/i);
});

test('motor sin comprobar degrada el paso de servicio y se declara', () => {
  const service = alta({ engineVerified: false })[4];
  assert.equal(service.state, 'pending');
  assert.match(service.detail, /motor de avisos/i);
});

test('WhatsApp manual se declara en el servicio sin degradarlo', () => {
  const service = alta({ whatsappDelivery: 'manual' })[4];
  assert.equal(service.state, 'ok');
  assert.match(service.detail, /manual/i);
});

test('renderSignupSteps pinta insignia, etiqueta, detalle y acción', () => {
  const html = renderSignupSteps(alta({ me: me({ stations: [] }) }));
  assert.match(html, /badge-invalid/);
  assert.match(html, /<a class="link" href="#\/">Solicitar acceso al piloto<\/a>/);
  assert.match(html, /Sin estación concedida no hay medición propia/);
});

test('el bloque de alta vacía distingue alta incompleta de alta completa', () => {
  const incomplete = signupBlock({ me: me({ contacts: [] }), engineVerified: true, whatsappDelivery: 'manual' });
  assert.match(incomplete, /data-signup/);
  assert.match(incomplete, /incompleta/);
  assert.match(incomplete, /tampoco significa que no haya riesgo/);
  const complete = signupBlock({ me: me(), engineVerified: true, whatsappDelivery: null });
  assert.match(complete, /ninguna condición ha superado los umbrales/);
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

// F19 · P2: el orden de Cuenta sigue el flujo de activación de avisos:
// avisos y contactos → fincas → perfil → datos de cuenta → equipo → piloto →
// comunicaciones comerciales al final.
test('Cuenta ordena el servicio antes que la publicidad', () => {
  const order = [...accountSource.matchAll(/eyebrow">([A-ZÁÉÍÓÚ ]+)</g)].map((m) => m[1].trim());
  const rank = (name) => order.indexOf(name);
  const seq = ['CONFIGURACIÓN DE AVISOS', 'MIS FINCAS', 'PERFIL OPCIONAL', 'SUSCRIPCIÓN', 'REFERENCIA PARA EL EQUIPO', 'PILOTO', 'PUBLICIDAD'];
  for (const name of seq) assert.ok(rank(name) > -1, `falta la sección ${name}`);
  const ranked = seq.map(rank);
  assert.deepEqual([...ranked].sort((a, b) => a - b), ranked, `orden inesperado: ${order.join(' → ')}`);
});

test('la publicidad ya no remite «arriba» a un bloque que estaba debajo', () => {
  assert.match(accountSource, /añade el canal en Canales de aviso/);
  assert.doesNotMatch(accountSource, /añade el canal arriba/);
});

test('Cuenta presenta los avisos como asistente por pasos', () => {
  assert.match(accountSource, /CONFIGURACIÓN DE AVISOS/);
  assert.match(accountSource, /function signupStepper\(/);
  for (const label of ['Contacto', 'Autorización', 'Verificación', 'Preferencias efectivas']) {
    assert.match(accountSource, new RegExp(`label: '${label}'`), `falta el paso ${label}`);
  }
  // La preferencia operativa sigue siendo un formulario real, ahora como paso final.
  assert.match(accountSource, /data-prefs-form/);
});

test('la verificación del correo de acceso se distingue de la del destinatario', () => {
  assert.match(accountSource, /Correo de acceso verificado/);
  assert.match(accountSource, /Es distinta de la verificación por código de un destinatario de avisos/);
});

test('el estado de alta se explica aunque ya haya avisos si falta completarlo', () => {
  // Antes el bloque solo aparecía con la lista vacía: una cuenta con avisos en
  // pantalla pero sin contacto verificado no veía qué le faltaba.
  assert.match(alertsSource, /const incomplete = steps\.some\(\(step\) => step\.state !== 'ok'\)/);
  assert.match(alertsSource, /\(open\.length && !incomplete\)/);
});

test('el alta completa no promete que no haya riesgo', () => {
  const complete = signupBlock({ me: me(), engineVerified: true, whatsappDelivery: null });
  assert.doesNotMatch(complete, /es porque ninguna condición/);
  assert.match(complete, /revisa la cobertura de datos/);
});

test('los campos de contacto de Cuenta declaran autocomplete y tipo', () => {
  assert.match(accountSource, /autocomplete: 'tel'/);
  assert.match(accountSource, /autocomplete: 'email'/);
  assert.match(accountSource, /autocomplete="\$\{channel\.autocomplete\}"/);
  assert.match(accountSource, /type="\$\{channel\.inputType\}"/);
});

test('los umbrales propios se declaran como preferencia que aún no modifica avisos', () => {
  assert.match(accountSource, /Todavía no modifica tus avisos/);
  // Y la declaración sigue yendo antes del campo, como exige el guardado móvil.
  assert.ok(accountSource.indexOf('Todavía no modifica tus avisos') < accountSource.indexOf('name="frost_c"'));
});
