import { $, api, escapeText, dateText, roleLabel, planLabel, session } from './ui.js';

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp', placeholder: '+34 600 000 000', addressLabel: 'Teléfono de WhatsApp' },
  { key: 'email', label: 'Correo', placeholder: 'tu@correo.es', addressLabel: 'Correo electrónico' },
];

function channelBlock(channel, contact) {
  const optedIn = Boolean(contact?.optedIn);
  const verified = Boolean(contact?.verified);
  const status = contact
    ? `${verified ? 'verificado' : 'sin verificar'} · ${optedIn ? 'recibe avisos' : 'no recibe avisos'}`
    : 'sin configurar';
  return `<div class="contact-block">
    <div class="section-heading"><div><h3>${channel.label}</h3><p class="hint">${escapeText(status)}</p></div></div>
    <form data-contact-form="${channel.key}" class="rule-form">
      <label>${channel.addressLabel}<input name="address" value="${escapeText(contact?.address || '')}" placeholder="${channel.placeholder}"></label>
      <label class="check"><input type="checkbox" name="opt_in" ${optedIn ? 'checked' : ''}> Autorizar avisos por ${channel.label.toLowerCase()}</label>
      <button type="submit">Guardar</button>
    </form>
    ${contact && !verified ? `<div class="contact-verify">
      <button type="button" class="quiet" data-verify="${channel.key}">Enviar código de verificación</button>
      <form data-confirm-form="${channel.key}" class="rule-form hidden">
        <label>Código recibido<input name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code"></label>
        <button type="submit">Confirmar código</button>
      </form>
      <p class="hint" data-verify-hint="${channel.key}"></p>
    </div>` : ''}
  </div>`;
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
  const me = session.me;
  const contacts = me.contacts || [];
  const byChannel = Object.fromEntries(contacts.map((contact) => [contact.channel, contact]));
  const farms = me.farms || [];
  const prefs = await api('/api/v1/alert-preferences').then((result) => result.preferences).catch(() => null)
    || DEFAULT_PREFS;

  root.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>${escapeText(me.email)}</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPCIÓN</p><h2>Perfil y consentimiento</h2></div></div>
      <dl class="detail-grid">
        <dt>Rol</dt><dd>${escapeText(roleLabel(me.role))}</dd>
        <dt>Plan</dt><dd>${escapeText(planLabel(me.plan))}</dd>
        <dt>Estaciones</dt><dd>${me.stations.map((station) => escapeText(station.name)).join(', ') || 'sin estaciones vinculadas'}</dd>
        <dt>Consentimiento de comunicaciones</dt><dd>${me.communicationConsent
          ? `<span class="badge badge-valid">concedido ${dateText(me.consentAt)}</span>`
          : '<span class="badge badge-invalid">no concedido</span>'}</dd>
      </dl>
      <label class="check"><input type="checkbox" data-consent ${me.communicationConsent ? 'checked' : ''}>
        Autorizar el envío de avisos por los canales configurados</label>
      <p class="hint">Sin consentimiento solo recibirás avisos dentro del panel. Puedes revocarlo en cualquier momento.</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">DESTINATARIOS</p><h2>Canales de aviso</h2></div></div>
      <p class="hint">Añade tu WhatsApp o correo, autoriza el envío y verifica la dirección. Las alertas solo salen a contactos verificados y autorizados.</p>
      ${CHANNELS.map((channel) => channelBlock(channel, byChannel[channel.key])).join('')}
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PREFERENCIAS</p><h2>Qué alertas quieres recibir</h2></div></div>
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
        <label>Umbral propio de helada (°C)<input type="number" step="0.5" name="frost_c" value="${prefs.customThresholds?.frost_c ?? ''}"></label>
        <label>Umbral propio de calor (°C)<input type="number" step="0.5" name="heat_c" value="${prefs.customThresholds?.heat_c ?? ''}"></label>
        <p class="hint span-all">El horario silencioso no frena las alertas prioritarias. Los umbrales propios quedan guardados como referencia para afinar tus avisos.</p>
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
      <div class="section-heading"><div><p class="eyebrow">PILOTO</p><h2>¿Quieres alertas en otra finca?</h2></div></div>
      <p class="hint">Las solicitudes de piloto se gestionan desde la web pública. Si conoces a alguien interesado, puedes compartir la dirección de la portada.</p>
      <p class="hint"><a class="link" href="#/">Ir a la página pública</a></p>
    </section>`;

  const error = (message) => { $('[data-error]', root).textContent = message; };
  const refresh = async () => { session.me = await api('/api/v1/me'); await renderAccount(root); };

  $('[data-consent]', root).addEventListener('change', async (event) => {
    const checked = event.target.checked;
    try {
      await api('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ communication_consent: checked }) });
      session.me.communicationConsent = checked;
      session.me.consentAt = checked ? new Date().toISOString() : null;
    } catch (err) {
      event.target.checked = !checked;
      error(`No se pudo guardar el consentimiento: ${err.message}`);
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
    const custom = {};
    if (data.get('frost_c')) custom.frost_c = Number(data.get('frost_c'));
    if (data.get('heat_c')) custom.heat_c = Number(data.get('heat_c'));
    body.custom_thresholds = custom;
    try {
      await api('/api/v1/alert-preferences', { method: 'PUT', body: JSON.stringify(body) });
      await renderAccount(root);
    } catch (err) {
      error(`No se pudieron guardar las preferencias: ${err.message}`);
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
        }) });
        await refresh();
      } catch (err) {
        error(`No se pudo guardar ${channel.label}: ${err.message}`);
      }
    });

    const verifyButton = $(`[data-verify="${channel.key}"]`, root);
    if (verifyButton) {
      verifyButton.addEventListener('click', async () => {
        error('');
        try {
          const result = await api(`/api/v1/contacts/${channel.key}/verify`, { method: 'POST' });
          $(`[data-confirm-form="${channel.key}"]`, root).classList.remove('hidden');
          $(`[data-verify-hint="${channel.key}"]`, root).textContent = result.devCode
            ? `Código de prueba: ${result.devCode}`
            : 'Te hemos enviado un código. Introdúcelo para verificar.';
        } catch (err) {
          error(`No se pudo enviar el código: ${err.message}`);
        }
      });
    }

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
