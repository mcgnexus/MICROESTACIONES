import { $, api, escapeText, dateText, roleLabel, planLabel, session } from './ui.js';
import { WHATSAPP_MANUAL_NOTE } from './notice-taxonomy.js';
import { FROST_C, HEAT_C } from './farm-cards.js';
import { DEFAULT_COUNTRY, countryOptions } from './phone.js';
import {
  alertReadiness, READINESS_CHANNELS, READINESS_CHANNEL_LABELS, READINESS_MISSING_LABELS,
} from './alert-readiness.js';

// Estado visible de un código de verificación: el servidor lo deriva de la cola
// real (encolado ≠ enviado ≠ entregado) y aquí solo se traduce a texto.
const VERIFY_STATE_TEXT = {
  sin_codigo: 'Todavía no has pedido ningún código.',
  queued: 'Estamos preparando tu código.',
  manual: 'Tu código queda pendiente de envío manual durante el piloto.',
  sent: 'Código enviado. Introdúcelo para verificar.',
  delivered: 'Código entregado. Introdúcelo para verificar.',
  failed: 'No se pudo enviar el código. Puedes reintentarlo.',
  expired: 'El código ha caducado. Pide uno nuevo.',
  verified: 'Destinatario verificado.',
};
const VERIFY_FINAL_STATES = ['delivered', 'failed', 'expired', 'verified'];
const VERIFY_POLL_MS = 3000;
const VERIFY_POLL_MAX_MS = 120000;

// Sondeo acotado del estado real del código. Se corta en estados finales o a los
// dos minutos para no castigar la API; al re-renderizar la cuenta se cancelan.
const verifyTimers = new Map();
function stopVerifyPolls() {
  for (const timer of verifyTimers.values()) clearTimeout(timer);
  verifyTimers.clear();
}

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp', placeholder: '600 000 000', addressLabel: 'Teléfono de WhatsApp', inputType: 'tel', autocomplete: 'tel', inputmode: 'tel' },
  { key: 'email', label: 'Correo', placeholder: 'tu@correo.es', addressLabel: 'Correo electrónico', inputType: 'email', autocomplete: 'email', inputmode: 'email' },
];

// Selector de país del teléfono de WhatsApp (España por defecto). El servidor
// vuelve a validar y guarda en E.164.
function countrySelect() {
  return `<select name="country">${countryOptions().map((country) =>
    `<option value="${country.code}"${country.code === DEFAULT_COUNTRY ? ' selected' : ''}>${country.name} (+${country.callingCode})</option>`).join('')}</select>`;
}

function channelBlock(channel, contact, available) {
  const optedIn = Boolean(contact?.optedIn);
  const verified = Boolean(contact?.verified);
  const status = contact
    ? `${verified ? 'verificado' : 'sin verificar'} · ${optedIn ? 'recibe avisos' : 'no recibe avisos'}`
    : 'sin configurar';
  // Solo se ofrece verificar si el canal puede entregar el código hoy. En modo
  // manual sigue disponible: el código queda pendiente de envío humano.
  const canVerify = Boolean(contact) && !verified && Boolean(available);
  return `<div class="contact-block">
    <div class="section-heading"><div><h3>${channel.label}</h3><p class="hint">${escapeText(status)}</p></div></div>
    <form data-contact-form="${channel.key}" class="rule-form">
      ${channel.key === 'whatsapp' ? `<label>País del teléfono${countrySelect()}</label>` : ''}
      <label>${channel.addressLabel}<input name="address" type="${channel.inputType}" inputmode="${channel.inputmode}" autocomplete="${channel.autocomplete}" value="${escapeText(contact?.address || '')}" placeholder="${channel.placeholder}"></label>
      <label class="check"><input type="checkbox" name="opt_in" ${optedIn ? 'checked' : ''}> Autorizar avisos por ${channel.label.toLowerCase()}</label>
      <button type="submit">Guardar</button>
    </form>
    ${canVerify ? `<div class="contact-verify">
      <button type="button" class="quiet" data-verify="${channel.key}">Enviar código de verificación</button>
      <button type="button" class="quiet hidden" data-resend="${channel.key}">Reenviar código</button>
      <form data-confirm-form="${channel.key}" class="rule-form hidden">
        <label>Código recibido<input name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code"></label>
        <button type="submit">Confirmar código</button>
      </form>
      <p class="hint" data-verify-hint="${channel.key}"></p>
      <p class="hint" data-verify-state="${channel.key}"></p>
    </div>` : ''}
    ${contact && !verified && !available
      ? `<p class="hint">La verificación por ${channel.label} no está disponible ahora mismo. Puedes guardar el contacto y verificarlo cuando el canal vuelva.</p>`
      : ''}
  </div>`;
}

// Ofrece reutilizar el correo de acceso ya confirmado como destinatario de
// avisos, sin volver a pedir un código. Solo aparece si todavía no hay un
// contacto de correo verificado.
function emailReuseBlock(me, byChannel) {
  const emailContact = byChannel.email;
  if (!me.emailVerifiedAt || (emailContact && emailContact.verified)) return '';
  return `<div class="contact-verify">
    <p class="hint">Tu correo de acceso ya está confirmado. Puedes usarlo para los avisos sin volver a verificarlo.</p>
    <button type="button" data-reuse-email>Usar este correo para los avisos</button>
  </div>`;
}

// Asistente de avisos: muestra el estado real por canal, sobre el mismo
// destinatario, y los pasos propios (tipos de aviso y estación o finca). No
// marca como listo lo que no se ha elegido: un contacto completo no activa por
// sí solo las categorías ni el terreno.
function signupStepper(me, prefs) {
  const readiness = alertReadiness({
    me: { ...me, contacts: me.contacts || [] }, prefs, service: me.channelAvailability || {},
  });
  const state = (ok, pending = false) => (ok ? 'ok' : pending ? 'pending' : 'missing');
  const steps = [];
  for (const key of READINESS_CHANNELS) {
    const channel = readiness.channels[key];
    const label = READINESS_CHANNEL_LABELS[key];
    steps.push({
      label,
      state: state(channel.ready, channel.configured),
      detail: channel.ready
        ? `Destinatario de ${label.toLowerCase()} verificado, autorizado y con el canal activo.`
        : channel.configured
          ? `Falta: ${channel.missing.map((code) => READINESS_MISSING_LABELS[code]).join(', ')}.`
          : `Añade ${label.toLowerCase()} y verifícalo para recibir avisos por este canal.`,
    });
  }
  steps.push({
    label: 'Tipos de aviso',
    state: state(readiness.categories.selected, true),
    detail: readiness.categories.selected
      ? 'Has elegido qué avisos quieres recibir.'
      : 'Selecciona al menos un tipo de aviso abajo.',
  });
  steps.push({
    label: 'Estación o finca',
    state: state(readiness.stations),
    detail: readiness.stations
      ? 'Tu cuenta tiene estación o finca asociada.'
      : 'Crea una finca y asóciale tu estación.',
  });
  const tone = { ok: 'badge-valid', pending: 'badge-warn', missing: 'badge-invalid' };
  const text = { ok: 'Listo', pending: 'Pendiente', missing: 'Falta' };
  return `<ol class="signup-steps avisos-steps">${steps.map((step) =>
    `<li><span class="badge ${tone[step.state]}">${text[step.state]}</span><strong>${escapeText(step.label)}</strong><span>${escapeText(step.detail)}</span></li>`).join('')}</ol>`;
}

function farmBlock(farm, stations) {
  const devices = (farm.devices || []);
  const options = stations
    .filter((station) => !devices.includes(station.id))
    .map((station) => `<option value="${escapeText(station.id)}">${escapeText(station.name)}</option>`).join('');
  return `<div class="farm-block">
    <div class="section-heading">
      <div><h3>${escapeText(farm.name)}</h3><p class="hint">${escapeText([farm.municipality, farm.crop, farm.livestock].filter(Boolean).join(' · ') || 'sin detalle')}</p></div>
      <button type="button" class="quiet danger" data-farm-delete="${escapeText(farm.id)}">Eliminar</button>
    </div>
    <div class="farm-devices">${devices.length
      ? devices.map((id) => {
          const name = stations.find((s) => s.id === id)?.name || id;
          return `<span class="chip">${escapeText(name)}<button type="button" class="chip-remove" data-farm-unlink="${escapeText(farm.id)}" data-device="${escapeText(id)}" aria-label="Quitar ${escapeText(name)}">×</button></span>`;
        }).join('')
      : '<span class="hint">Sin estaciones asociadas.</span>'}</div>
    ${options ? `<form data-farm-link="${escapeText(farm.id)}" class="rule-form">
      <label>Asociar estación<select name="device_id">${options}</select></label>
      <button type="submit">Asociar</button>
    </form>` : ''}
  </div>`;
}

const DEFAULT_PREFS = {
  receiveFrost: true, receiveHeat: true, receiveStorm: true, receiveWind: true,
  receiveHumidity: true, receiveGeneral: true, channelWhatsapp: true, channelEmail: true,
  quietStart: null, quietEnd: null, zone: null, crop: null, customThresholds: {},
};

export async function renderAccount(root) {
  stopVerifyPolls();
  const me = session.me;
  const contacts = me.contacts || [];
  const byChannel = Object.fromEntries(contacts.map((contact) => [contact.channel, contact]));
  const farms = me.farms || [];
  const availability = me.channelAvailability || {};
  const prefs = await api('/api/v1/alert-preferences').then((result) => result.preferences).catch(() => null)
    || DEFAULT_PREFS;

  root.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>${escapeText(me.email)}</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">CONFIGURACIÓN DE AVISOS</p><h2>Asistente de avisos</h2></div></div>
      <p class="hint">El estado se calcula por canal y destinatario: cada canal solo queda listo si, sobre el mismo contacto, está verificado y autorizado, el canal sigue activo en preferencias, hay algún tipo de aviso elegido, la cuenta tiene estación o finca y el servicio de ese canal está disponible.</p>
      ${signupStepper(me, prefs)}
      <div class="section-heading"><div><h3>Contacto, autorización y verificación</h3></div></div>
      <p class="hint">Añade tu WhatsApp o correo, autoriza el envío y verifica la dirección. Las alertas solo salen a contactos verificados y autorizados.</p>
      ${session.support?.whatsappDelivery === 'manual'
        ? `<p class="hint">${escapeText(WHATSAPP_MANUAL_NOTE)}</p>`
        : ''}
      ${CHANNELS.map((channel) => channelBlock(channel, byChannel[channel.key], availability[channel.key])).join('')}
      ${emailReuseBlock(me, byChannel)}
      <div class="section-heading"><div><h3>Preferencias efectivas</h3></div></div>
      <p class="hint">No todos necesitan lo mismo: un almendro teme la helada y el ganado el calor. Elige aquí tus avisos.</p>
      <form data-prefs-form class="rule-form">
        <fieldset class="prefs-group span-all"><legend>Tipos de aviso</legend>
          <label class="check"><input type="checkbox" name="receive_frost" ${prefs.receiveFrost ? 'checked' : ''}> Heladas</label>
          <label class="check"><input type="checkbox" name="receive_heat" ${prefs.receiveHeat ? 'checked' : ''}> Golpes de calor</label>
          <label class="check"><input type="checkbox" name="receive_storm" ${prefs.receiveStorm ? 'checked' : ''}> Tormentas</label>
          <label class="check"><input type="checkbox" name="receive_wind" ${prefs.receiveWind ? 'checked' : ''}> Viento</label>
          <label class="check"><input type="checkbox" name="receive_humidity" ${prefs.receiveHumidity ? 'checked' : ''}> Humedad</label>
          <label class="check"><input type="checkbox" name="receive_general" ${prefs.receiveGeneral ? 'checked' : ''}> Información general</label>
        </fieldset>
        <fieldset class="prefs-group span-all"><legend>Canales</legend>
          <label class="check"><input type="checkbox" name="channel_whatsapp" ${prefs.channelWhatsapp ? 'checked' : ''}> WhatsApp</label>
          <label class="check"><input type="checkbox" name="channel_email" ${prefs.channelEmail ? 'checked' : ''}> Correo</label>
        </fieldset>
        <label>Silencio desde<input type="time" name="quiet_start" value="${escapeText((prefs.quietStart || '').slice(0, 5))}"></label>
        <label>Silencio hasta<input type="time" name="quiet_end" value="${escapeText((prefs.quietEnd || '').slice(0, 5))}"></label>
        <label>Zona<input name="zone" maxlength="160" value="${escapeText(prefs.zone || '')}"></label>
        <label>Cultivo o ganado<input name="crop" maxlength="160" value="${escapeText(prefs.crop || '')}"></label>
        <p class="hint span-all">El horario silencioso no frena las alertas prioritarias.</p>
        <button type="submit" class="span-all">Guardar preferencias</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">MIS FINCAS</p><h2>Fincas y estaciones</h2></div></div>
      <p class="hint">Agrupa tus estaciones por finca para reconocer cada aviso por su nombre.</p>
      <div class="farm-list">${farms.map((farm) => farmBlock(farm, me.stations)).join('') || '<p class="empty">Todavía no has creado ninguna finca.</p>'}</div>
      <form data-farm-form class="rule-form">
        <label>Nombre de la finca<input name="name" required minlength="2" maxlength="120"></label>
        <label>Municipio<input name="municipality" maxlength="120"></label>
        <label>Cultivo<input name="crop" maxlength="120"></label>
        <label>Ganado<input name="livestock" maxlength="120"></label>
        <button type="submit">Añadir finca</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PERFIL OPCIONAL</p><h2>Para afinar tus avisos</h2></div></div>
      <p class="hint">Rellenarlo es opcional: nos ayuda a ajustar los avisos a tu actividad y zona.</p>
      <form data-profile-form class="rule-form">
        <label>Municipio<input name="municipality" maxlength="120" value="${escapeText(me.profile?.municipality || '')}"></label>
        <label>Actividad
          <select name="activity">
            <option value="">Selecciona…</option>
            <option value="agricultura" ${me.profile?.activity === 'agricultura' ? 'selected' : ''}>Agricultura</option>
            <option value="ganaderia" ${me.profile?.activity === 'ganaderia' ? 'selected' : ''}>Ganadería</option>
            <option value="mixta" ${me.profile?.activity === 'mixta' ? 'selected' : ''}>Agricultura y ganadería</option>
            <option value="otra" ${me.profile?.activity === 'otra' ? 'selected' : ''}>Otra</option>
          </select>
        </label>
        <label>Cultivo o especie<input name="crop_or_livestock" maxlength="120" value="${escapeText(me.profile?.cropOrLivestock || '')}"></label>
        <label>Interés principal
          <select name="interest">
            <option value="">Selecciona…</option>
            <option value="heladas" ${me.profile?.interest === 'heladas' ? 'selected' : ''}>Heladas</option>
            <option value="calor" ${me.profile?.interest === 'calor' ? 'selected' : ''}>Golpes de calor</option>
            <option value="tormentas" ${me.profile?.interest === 'tormentas' ? 'selected' : ''}>Tormentas</option>
            <option value="viento" ${me.profile?.interest === 'viento' ? 'selected' : ''}>Viento</option>
            <option value="humedad" ${me.profile?.interest === 'humedad' ? 'selected' : ''}>Humedad</option>
            <option value="general" ${me.profile?.interest === 'general' ? 'selected' : ''}>Información general</option>
            <option value="futura_instalacion" ${me.profile?.interest === 'futura_instalacion' ? 'selected' : ''}>Futura instalación</option>
          </select>
        </label>
        <button type="submit">Guardar perfil</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPCIÓN</p><h2>Tu cuenta</h2></div></div>
      <dl class="detail-grid">
        <dt>Rol</dt><dd>${escapeText(roleLabel(me.role))}</dd>
        <dt>Plan</dt><dd>${escapeText(planLabel(me.plan))}</dd>
        <dt>Estaciones</dt><dd>${me.stations.map((station) => escapeText(station.name)).join(', ') || 'sin estaciones vinculadas'}</dd>
        <dt>Correo de acceso verificado</dt><dd>${me.emailVerifiedAt
          ? `<span class="badge badge-valid">verificado ${dateText(me.emailVerifiedAt)}</span>`
          : '<span class="badge badge-warn">pendiente</span>'}</dd>
      </dl>
      <p class="hint">Esta verificación es la del correo con el que entras: confirma tu acceso. Es distinta de la verificación por código de un destinatario de avisos, que se hace arriba, en cada canal.</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">REFERENCIA PARA EL EQUIPO</p><h2>Umbrales que te servirían</h2></div></div>
      <p class="hint"><strong>Preferencia para valorar con el equipo. Todavía no modifica tus avisos.</strong> Estos valores no cambian los avisos que recibes: los umbrales que disparan las alertas los fija el equipo por estación y no se editan desde aquí.</p>
      <p class="hint">Déjanos los que tú usarías: los revisamos contigo al ajustar el piloto. Rellenarlo es opcional.</p>
      <form data-thresholds-form class="rule-form">
        <label>A partir de qué °C te preocuparía la helada (°C)<input type="number" step="0.5" placeholder="${FROST_C}" name="frost_c" value="${prefs.customThresholds?.frost_c ?? ''}"></label>
        <label>A partir de qué °C te preocuparía el calor (°C)<input type="number" step="0.5" placeholder="${HEAT_C}" name="heat_c" value="${prefs.customThresholds?.heat_c ?? ''}"></label>
        <p class="hint span-all">En blanco = se queda el actual del equipo (${FROST_C} °C helada, ${HEAT_C} °C calor).</p>
        <button type="submit" class="span-all">Enviar para el equipo</button>
      </form>
      <p class="hint" data-thresholds-ok role="status"></p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PILOTO</p><h2>¿Quieres alertas en otra finca?</h2></div></div>
      <p class="hint">Las solicitudes de piloto se gestionan desde la web pública. Si conoces a alguien interesado, puedes compartir la dirección de la portada.</p>
      <p class="hint"><a class="link" href="#/">Ir a la página pública</a></p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PUBLICIDAD</p><h2>Novedades y ofertas (opcional)</h2></div></div>
      <p class="hint">Usar la demo no depende de esto. Marca solo los canales por los que quieras recibir novedades y ofertas sobre microestaciones. Puedes retirarlos cuando quieras.</p>
      <div class="consent-grid">
        ${CHANNELS.map((channel) => {
          const granted = Boolean(me.consents?.commercial?.[channel.key]?.granted);
          const available = channel.key === 'email' || Boolean(byChannel.whatsapp);
          return `<label class="check"><input type="checkbox" data-commercial="${channel.key}"
            ${granted ? 'checked' : ''} ${available ? '' : 'disabled'}> ${channel.label}${available ? '' : ' (añade el canal en Canales de aviso)'}</label>`;
        }).join('')}
      </div>
      <p class="hint">Texto informativo vigente: <strong>${escapeText(me.consentTextVersion || '')}</strong>. Al revocar, se cancelan los envíos comerciales pendientes.</p>
    </section>`;

  const error = (message) => { $('[data-error]', root).textContent = message; };
  const refresh = async () => { session.me = await api('/api/v1/me'); await renderAccount(root); };

  // Sondeo del estado real del código tras pedirlo: muestra preparando/enviado/
  // entregado/fallido/caducado/verificado y habilita el reenvío cuando toca.
  const startVerifyPoll = (key) => {
    const startedAt = Date.now();
    const tick = async () => {
      let status = null;
      try { status = await api(`/api/v1/contacts/${key}/verification`); } catch { status = null; }
      if (status) {
        const stateEl = $(`[data-verify-state="${key}"]`, root);
        if (stateEl) stateEl.textContent = VERIFY_STATE_TEXT[status.state] || '';
        const resend = $(`[data-resend="${key}"]`, root);
        if (resend) {
          const waitMs = status.resendAt ? new Date(status.resendAt).getTime() - Date.now() : 0;
          resend.classList.remove('hidden');
          resend.disabled = waitMs > 0;
          resend.textContent = waitMs > 0 ? `Reenviar en ${Math.ceil(waitMs / 1000)} s` : 'Reenviar código';
        }
        if (status.state === 'verified') {
          verifyTimers.delete(key);
          await refresh();
          return;
        }
        if (VERIFY_FINAL_STATES.includes(status.state)) {
          verifyTimers.delete(key);
          return;
        }
      }
      if (Date.now() - startedAt > VERIFY_POLL_MAX_MS) { verifyTimers.delete(key); return; }
      verifyTimers.set(key, setTimeout(tick, VERIFY_POLL_MS));
    };
    tick();
  };

  const requestCode = async (key) => {
    error('');
    try {
      const result = await api(`/api/v1/contacts/${key}/verify`, { method: 'POST' });
      const confirm = $(`[data-confirm-form="${key}"]`, root);
      if (confirm) confirm.classList.remove('hidden');
      const hint = $(`[data-verify-hint="${key}"]`, root);
      if (hint) hint.textContent = result.devCode
        ? `Código de prueba: ${result.devCode}`
        : 'Estamos preparando tu código.';
      startVerifyPoll(key);
    } catch (err) {
      if (err.message === 'channel_unavailable') {
        error('Este canal no está disponible ahora mismo. Inténtalo más tarde.');
      } else if (err.message === 'cooldown' || err.message === 'rate_limited') {
        error('Espera un momento antes de pedir otro código.');
      } else {
        error(`No se pudo enviar el código: ${err.message}`);
      }
    }
  };

  const reuseEmail = $('[data-reuse-email]', root);
  if (reuseEmail) {
    reuseEmail.addEventListener('click', async () => {
      error('');
      try {
        await api('/api/v1/account/alert-email', { method: 'POST' });
        await refresh();
      } catch (err) {
        error(err.message === 'email_not_verified'
          ? 'Tu correo de acceso aún no está confirmado.'
          : `No se pudo usar este correo: ${err.message}`);
      }
    });
  }

  root.querySelectorAll('[data-commercial]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const channel = event.target.dataset.commercial;
      const action = event.target.checked ? 'granted' : 'revoked';
      try {
        await api('/api/v1/account/consents', { method: 'POST', body: JSON.stringify({ purpose: 'commercial', channel, action }) });
      } catch (err) {
        event.target.checked = !event.target.checked;
        error(err.message === 'channel_not_available'
          ? 'Añade ese canal en «Canales de aviso» antes de autorizar publicidad por él.'
          : `No se pudo guardar el consentimiento: ${err.message}`);
      }
    });
  });

  $('[data-profile-form]', root).addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    error('');
    try {
      await api('/api/v1/account/profile', { method: 'PUT', body: JSON.stringify({
        municipality: data.get('municipality') || null,
        activity: data.get('activity') || null,
        crop_or_livestock: data.get('crop_or_livestock') || null,
        interest: data.get('interest') || null,
      }) });
      await refresh();
    } catch (err) {
      error(`No se pudo guardar el perfil: ${err.message}`);
    }
  });

  $('[data-prefs-form]', root).addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    error('');
    const bool = (name) => data.get(name) === 'on';
    const body = {
      receive_frost: bool('receive_frost'), receive_heat: bool('receive_heat'),
      receive_storm: bool('receive_storm'), receive_wind: bool('receive_wind'),
      receive_humidity: bool('receive_humidity'), receive_general: bool('receive_general'),
      channel_whatsapp: bool('channel_whatsapp'), channel_email: bool('channel_email'),
      quiet_start: data.get('quiet_start') || null, quiet_end: data.get('quiet_end') || null,
      zone: data.get('zone') || null, crop: data.get('crop') || null,
    };
    try {
      await api('/api/v1/alert-preferences', { method: 'PUT', body: JSON.stringify(body) });
      await renderAccount(root);
    } catch (err) {
      error(`No se pudieron guardar las preferencias: ${err.message}`);
    }
  });

  // Los umbrales propios se piden por separado y se envían solos: no forman parte
  // de las preferencias operativas porque no alteran qué avisos se reciben.
  $('[data-thresholds-form]', root).addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    error('');
    const custom = {};
    if (data.get('frost_c')) custom.frost_c = Number(data.get('frost_c'));
    if (data.get('heat_c')) custom.heat_c = Number(data.get('heat_c'));
    try {
      await api('/api/v1/alert-preferences', {
        method: 'PUT', body: JSON.stringify({ custom_thresholds: custom }),
      });
      await renderAccount(root);
      $('[data-thresholds-ok]', root).textContent = 'Recibido. Lo revisamos contigo al ajustar el piloto; no cambia tus avisos.';
    } catch (err) {
      error(`No se pudieron enviar los umbrales: ${err.message}`);
    }
  });

  for (const channel of CHANNELS) {
    const form = $(`[data-contact-form="${channel.key}"]`, root);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      error('');
      try {
        await api(`/api/v1/contacts/${channel.key}`, { method: 'PUT', body: JSON.stringify({
          address: data.get('address') ?? '', opt_in: data.get('opt_in') === 'on',
          ...(channel.key === 'whatsapp' ? { country: data.get('country') || DEFAULT_COUNTRY } : {}),
        }) });
        await refresh();
      } catch (err) {
        error(`No se pudo guardar ${channel.label}: ${err.message}`);
      }
    });

    const verifyButton = $(`[data-verify="${channel.key}"]`, root);
    if (verifyButton) verifyButton.addEventListener('click', () => requestCode(channel.key));

    const resendButton = $(`[data-resend="${channel.key}"]`, root);
    if (resendButton) resendButton.addEventListener('click', () => requestCode(channel.key));

    const confirmForm = $(`[data-confirm-form="${channel.key}"]`, root);
    if (confirmForm) {
      confirmForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        error('');
        try {
          await api(`/api/v1/contacts/${channel.key}/confirm`, { method: 'POST', body: JSON.stringify({ code: data.get('code') ?? '' }) });
          await refresh();
        } catch (err) {
          error(`No se pudo verificar ${channel.label}: ${err.message}`);
        }
      });
    }
  }

  $('[data-farm-form]', root).addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    error('');
    const body = { name: data.get('name') ?? '' };
    for (const field of ['municipality', 'crop', 'livestock']) {
      if (data.get(field)) body[field] = data.get(field);
    }
    try {
      await api('/api/v1/farms', { method: 'POST', body: JSON.stringify(body) });
      await refresh();
    } catch (err) {
      error(`No se pudo crear la finca: ${err.message}`);
    }
  });

  root.querySelectorAll('[data-farm-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('¿Eliminar esta finca? Las estaciones no se borran.')) return;
      error('');
      try {
        await api(`/api/v1/farms/${button.dataset.farmDelete}`, { method: 'DELETE' });
        await refresh();
      } catch (err) {
        error(`No se pudo eliminar la finca: ${err.message}`);
      }
    });
  });

  root.querySelectorAll('[data-farm-unlink]').forEach((button) => {
    button.addEventListener('click', async () => {
      error('');
      try {
        await api(`/api/v1/farms/${button.dataset.farmUnlink}/devices/${encodeURIComponent(button.dataset.device)}`, { method: 'DELETE' });
        await refresh();
      } catch (err) {
        error(`No se pudo quitar la estación: ${err.message}`);
      }
    });
  });

  root.querySelectorAll('[data-farm-link]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      error('');
      try {
        await api(`/api/v1/farms/${form.dataset.farmLink}/devices`, { method: 'POST', body: JSON.stringify({ device_id: data.get('device_id') }) });
        await refresh();
      } catch (err) {
        error(`No se pudo asociar la estación: ${err.message}`);
      }
    });
  });

}
