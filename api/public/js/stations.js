import {
  $, api, escapeText, dateText, numberText, connectivityBadge, batteryLabel,
  locationLabel, canEdit, isAdmin,
} from './ui.js';
import { renderStationCard } from './panel.js';
import { mountMeasurements } from './measurements.js';
import { renderConfigTab } from './config.js';
import { renderStationAlertsTab } from './alerts.js';

const SENSOR_KEYS = [['temperature', 'Temperatura'], ['humidity', 'Humedad'], ['pressure', 'Presión'], ['battery', 'Batería'], ['lux', 'Lux']];

const TEXT_FIELD = (name, label, extra = '') =>
  `<label>${label}<input name="${name}" ${extra}></label>`;

// ---- Listado con alta/edición ---------------------------------------------
export async function renderStations(root) {
  root.innerHTML = `
    <div class="page-heading">
      <div><p class="eyebrow">ESTACIONES</p><h1>Estaciones vinculadas</h1></div>
      ${canEdit() ? '<button type="button" data-new>Nueva estación</button>' : ''}
    </div>
    <p class="error" data-error role="alert"></p>
    <div data-list class="station-list"></div>
    <section class="panel hidden" data-form-panel>
      <div class="section-heading">
        <div><p class="eyebrow">FICHA DE ESTACIÓN</p><h2 data-form-title>Nueva estación</h2></div>
        <button type="button" class="quiet" data-cancel>Cancelar</button>
      </div>
      <form data-station-form class="station-form">
        <div class="form-grid">
          ${TEXT_FIELD('id', 'Identificador del equipo', 'data-create-only maxlength="80" placeholder="esp32c3-01"')}
          ${TEXT_FIELD('name', 'Nombre público', 'required maxlength="120"')}
          ${TEXT_FIELD('owner', 'Propietario o responsable', 'maxlength="200"')}
          <label>Emplazamiento<select name="location_type">
            <option value="finca">Finca</option><option value="urbano">Urbano</option><option value="otro">Otro</option>
          </select></label>
          ${TEXT_FIELD('public_zone', 'Zona pública (para cobertura representativa)', 'maxlength="200"')}
          <label>Latitud (privada)<input name="latitude" type="number" step="any" min="-90" max="90"></label>
          <label>Longitud (privada)<input name="longitude" type="number" step="any" min="-180" max="180"></label>
          ${TEXT_FIELD('altitude', 'Altitud (m)', 'type="number" step="1" min="-500" max="9000"')}
          ${TEXT_FIELD('installation_date', 'Fecha de instalación', 'type="date"')}
          ${TEXT_FIELD('firmware_version', 'Versión de firmware', 'maxlength="60"')}
          ${TEXT_FIELD('coverage_km', 'Cobertura (km)', 'type="number" step="0.1" min="0.1" max="500" placeholder="25"')}
        </div>
        <fieldset class="sensor-set"><legend>Sensores activos</legend>${SENSOR_KEYS
          .map(([key, label]) => `<label class="check"><input type="checkbox" name="sensor_${key}" checked> ${label}</label>`).join('')}</fieldset>
        <div class="form-grid">
          <label class="check"><input type="checkbox" name="publish_permission"> Permitir datos públicos agregados</label>
          <label class="check"><input type="checkbox" name="active" checked data-edit-only> Estación activa</label>
        </div>
        <p class="hint" data-catalog></p>
        <p class="error" data-form-error role="alert"></p>
        <button type="submit">Guardar estación</button>
      </form>
    </section>`;

  const list = $('[data-list]', root);
  const formPanel = $('[data-form-panel]', root);
  const form = $('[data-station-form]', root);
  const formError = $('[data-form-error]', root);
  let editing = null;

  api('/api/v1/stations/sensors-catalog').then(({ sensors }) => {
    $('[data-catalog]', root).textContent = `Catálogo de sensores: ${sensors
      .map((s) => `${s.name} (${s.unit})`).join(' · ')}. La disponibilidad por estación se ajusta con las casillas anteriores.`;
  }).catch(() => {});

  async function loadList() {
    $('[data-error]', root).textContent = '';
    try {
      const { stations } = await api('/api/v1/stations');
      list.innerHTML = stations.length ? stations.map((station) => {
        const status = station.status || {};
        const meta = [station.owner, station.publicZone, locationLabel(station.locationType),
          station.altitude == null ? null : `${station.altitude} m`,
          `${numberText(station.coverageKm, 1)} km de cobertura`].filter(Boolean).join(' · ');
        const actions = [
          `<a class="button-link" href="#/estaciones/${encodeURIComponent(station.id)}">Detalle</a>`,
          canEdit() ? `<button type="button" data-edit="${escapeText(station.id)}">Editar</button>` : '',
          isAdmin() && station.active ? `<button type="button" class="danger" data-deactivate="${escapeText(station.id)}">Desactivar</button>` : '',
        ].join(' ');
        return `<article class="station-card">
          <div class="station-head">
            <div><p class="eyebrow">${escapeText(station.id)}</p>
              <h2><a href="#/estaciones/${encodeURIComponent(station.id)}">${escapeText(station.name)}</a></h2>
              <p class="updated">${escapeText(meta)}</p></div>
            <div class="station-tags">
              ${station.active ? connectivityBadge(status.connectivity) : '<span class="badge badge-muted">Desactivada</span>'}
              ${station.publishPermission ? '<span class="badge badge-muted">Datos públicos</span>' : ''}
            </div>
          </div>
          <p class="coverage">Último contacto: ${dateText(status.lastContact)} · batería ${numberText(status.batteryMv, 0)} mV (${batteryLabel(status.batteryLevel)}) · configuración v${status.configVersion}</p>
          <div class="row-actions">${actions}</div>
        </article>`;
      }).join('') : '<section class="panel"><p class="empty">Tu suscripción aún no tiene estaciones vinculadas.</p></section>';
    } catch (error) {
      $('[data-error]', root).textContent = `No se pudieron cargar las estaciones: ${error.message}`;
    }
  }

  function openForm(station = null) {
    editing = station;
    formError.textContent = '';
    $('[data-form-title]', root).textContent = station ? `Editar ${station.name}` : 'Nueva estación';
    form.reset();
    root.querySelectorAll('[data-create-only]').forEach((el) => el.classList.toggle('hidden', !!station));
    root.querySelectorAll('[data-edit-only]').forEach((el) => el.classList.toggle('hidden', !station));
    if (station) {
      form.elements.name.value = station.name;
      form.elements.owner.value = station.owner ?? '';
      form.elements.location_type.value = station.locationType ?? 'finca';
      form.elements.latitude.value = station.latitude ?? '';
      form.elements.longitude.value = station.longitude ?? '';
      form.elements.public_zone.value = station.publicZone ?? '';
      form.elements.altitude.value = station.altitude ?? '';
      form.elements.installation_date.value = station.installationDate ?? '';
      form.elements.firmware_version.value = station.firmwareVersion ?? '';
      form.elements.coverage_km.value = station.coverageKm ?? '';
      form.elements.publish_permission.checked = !!station.publishPermission;
      form.elements.active.checked = !!station.active;
    } else {
      form.elements.location_type.value = 'finca';
      SENSOR_KEYS.forEach(([key]) => { form.elements[`sensor_${key}`].checked = key !== 'lux'; });
      form.elements.active.checked = true;
    }
    const sensors = { ...(station?.sensors || {}) };
    SENSOR_KEYS.forEach(([key]) => {
      if (station) form.elements[`sensor_${key}`].checked = sensors[key] !== false;
    });
    formPanel.classList.remove('hidden');
    list.classList.add('hidden');
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeForm() {
    formPanel.classList.add('hidden');
    list.classList.remove('hidden');
    editing = null;
  }

  root.onclick = async (event) => {
    const button = event.target.closest('button, a');
    if (!button) return;
    if (button.dataset.new !== undefined) { openForm(); return; }
    if (button.dataset.cancel !== undefined) { closeForm(); return; }
    if (button.dataset.edit) {
      const { stations } = await api('/api/v1/stations');
      const station = stations.find((item) => item.id === button.dataset.edit);
      if (station) openForm(station);
      return;
    }
    if (button.dataset.deactivate) {
      const id = button.dataset.deactivate;
      if (!window.confirm(`¿Desactivar la estación ${id}? Dejará de admitir datos.`)) return;
      try {
        await api(`/api/v1/stations/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await loadList();
      } catch (error) {
        $('[data-error]', root).textContent = `No se pudo desactivar: ${error.message}`;
      }
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';
    const text = (name) => form.elements[name].value.trim();
    const num = (name) => (text(name) === '' ? null : Number(text(name)));
    const body = {
      name: text('name'),
      owner: text('owner') || null,
      location_type: text('location_type'),
      latitude: num('latitude'),
      longitude: num('longitude'),
      public_zone: text('public_zone') || null,
      altitude: num('altitude'),
      installation_date: text('installation_date') || null,
      firmware_version: text('firmware_version') || null,
      publish_permission: form.elements.publish_permission.checked,
      sensors: Object.fromEntries(SENSOR_KEYS.map(([key]) => [key, form.elements[`sensor_${key}`].checked])),
    };
    if (text('coverage_km') !== '') body.coverage_km = Number(text('coverage_km'));
    try {
      if (editing) {
        body.active = form.elements.active.checked;
        await api(`/api/v1/stations/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        body.id = text('id');
        body.active = form.elements.active.checked;
        await api('/api/v1/stations', { method: 'POST', body: JSON.stringify(body) });
      }
      closeForm();
      await loadList();
    } catch (error) {
      formError.textContent = `No se pudo guardar: ${error.message}`;
    }
  });

  await loadList();
}

// ---- Detalle con pestañas ---------------------------------------------------
const TABS = [
  ['resumen', 'Resumen'],
  ['estado', 'Estado'],
  ['config', 'Configuración'],
  ['mediciones', 'Mediciones'],
  ['avisos', 'Avisos'],
];

async function renderResumen(content, stationId) {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  const [dashboard, gaps] = await Promise.all([
    api('/api/v1/dashboard?period=24h'),
    api(`/api/v1/stations/${encodeURIComponent(stationId)}/measurements/gaps?from=${from.toISOString()}&to=${to.toISOString()}`),
  ]);
  const item = (dashboard.devices || []).find((entry) => entry.device.id === stationId);
  content.innerHTML = item
    ? `${renderStationCard(item)}<section class="panel"><div class="section-heading"><div>
        <p class="eyebrow">COBERTURA</p><h2>Integridad de la serie (7 días)</h2></div></div>
        <p class="coverage">Esperadas ${gaps.expected ?? '—'} según intervalo ${gaps.intervalSeconds ?? '—'} s ·
          recibidas ${gaps.received} · válidas ${gaps.valid} · inválidas ${gaps.invalid} ·
          ausentes ${gaps.missing} · cobertura ${gaps.coveragePct ?? '—'} %</p>
        ${gaps.gaps.length ? `<div class="table-wrap"><table><thead><tr><th>Desde</th><th>Hasta</th><th>Faltantes</th></tr></thead><tbody>${gaps.gaps
          .map((gap) => `<tr><td>${escapeText(gap.gapFrom)}</td><td>${escapeText(gap.gapTo)}</td><td>${escapeText(gap.missing)}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="empty">No se detectan huecos de secuencia en el periodo.</p>'}
      </section>`
    : '<section class="panel"><p class="empty">La estación no aparece en el panel (puede estar desactivada o sin acceso).</p></section>';
}

function renderEstado(content, detail) {
  const station = detail.station;
  const status = detail.status;
  const stats = detail.measurementStats || {};
  const sensorState = SENSOR_KEYS
    .map(([key, label]) => `<li>${label}: ${station.sensors?.[key] === false ? 'desactivado' : 'activo'}</li>`)
    .join('');
  const rows = [
    ['Identificador', station.id],
    ['Propietario', station.owner],
    ['Emplazamiento', locationLabel(station.locationType)],
    ['Zona pública', station.publicZone],
    ['Ubicación privada', station.latitude == null ? 'sin coordenadas' : `${station.latitude}, ${station.longitude}`],
    ['Altitud', station.altitude == null ? '—' : `${station.altitude} m`],
    ['Instalación', dateText(station.installationDate)],
    ['Cobertura', `${numberText(station.coverageKm, 1)} km`],
    ['Firmware', station.firmwareVersion],
    ['Permiso de publicación', station.publishPermission ? 'concedido' : 'no concedido'],
    ['Alta en el sistema', dateText(station.createdAt)],
    ['Connectividad', status.connectivity],
    ['Último contacto', dateText(status.lastContact)],
    ['Último dato válido', dateText(status.lastValidData)],
    ['Batería', status.batteryMv == null ? 'sin dato' : `${numberText(status.batteryMv, 0)} mV (${batteryLabel(status.batteryLevel)})`],
    ['Configuración aplicada', `v${status.configVersion}`],
    ['Muestras pendientes', status.pendingSamples],
    ['Mediciones', `${stats.valid ?? 0} válidas de ${stats.total ?? 0} · última ${dateText(stats.lastObserved)}`],
    ['Reglas de aviso', detail.alertRuleCount],
    ['Versiones de configuración', detail.configVersionCount],
  ];
  content.innerHTML = `<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">ESTADO OPERATIVO</p><h2>Ficha técnica y de estado</h2></div>
      ${canEdit() ? '<a class="button-link" href="#/estaciones">Editar desde el listado</a>' : ''}</div>
    <dl class="detail-grid">${rows
      .map(([label, value]) => `<dt>${label}</dt><dd>${escapeText(value ?? '—')}</dd>`).join('')}</dl>
    <h3>Sensores</h3><ul class="plain-list">${sensorState}</ul>
  </section>`;
}

export async function renderStationDetail(root, stationId, tab = 'resumen') {
  const detail = await api(`/api/v1/stations/${encodeURIComponent(stationId)}`);
  const station = detail.station;
  const status = detail.status || {};
  const activeTab = TABS.some(([key]) => key === tab) ? tab : 'resumen';
  const link = (key) => `#/estaciones/${encodeURIComponent(station.id)}/${key}`;

  root.innerHTML = `
    <div class="page-heading">
      <div>
        <p class="eyebrow"><a href="#/estaciones">Estaciones</a> · ${escapeText(station.id)}</p>
        <h1>${escapeText(station.name)}</h1>
        <p class="updated">${escapeText([station.owner, station.publicZone].filter(Boolean).join(' · ') || 'Sin propietario registrado')}</p>
      </div>
      <div class="station-tags">
        ${station.active ? connectivityBadge(status.connectivity) : '<span class="badge badge-muted">Desactivada</span>'}
        <span class="badge badge-muted">Config v${status.configVersion ?? 0}</span>
        <span class="badge badge-muted">${batteryLabel(status.batteryLevel)}</span>
      </div>
    </div>
    <nav class="tabs">${TABS.map(([key, label]) =>
      `<a href="${link(key)}" class="${key === activeTab ? 'active' : ''}">${label}</a>`).join('')}</nav>
    <div data-tab-content></div>`;

  const content = $('[data-tab-content]', root);
  if (activeTab === 'resumen') await renderResumen(content, station.id);
  else if (activeTab === 'estado') renderEstado(content, detail);
  else if (activeTab === 'config') await renderConfigTab(content, station.id);
  else if (activeTab === 'mediciones') {
    content.innerHTML = '<section class="panel"></section>';
    mountMeasurements($('section', content), { fixedStation: station.id });
  }
  else await renderStationAlertsTab(content, station.id);
}