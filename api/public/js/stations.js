import {
  $, api, escapeText, dateText, numberText, connectivityBadge, batteryLabel,
  locationLabel, canEdit, isAdmin, verificationBadge,
} from './ui.js';
import { renderStationCard } from './panel.js';
import { mountMeasurements } from './measurements.js';
import { renderConfigTab } from './config.js';
import { renderRemoteControl } from './device-config.js';
import { renderStationAlertsTab } from './alerts.js';
import { renderStatisticsTab } from './statistics.js';

const SENSOR_KEYS = [['temperature', 'Temperatura'], ['humidity', 'Humedad'], ['pressure', 'Presión'], ['battery', 'Batería'], ['lux', 'Lux']];

const TEXT_FIELD = (name, label, extra = '') =>
  `<label>${label}<input name="${name}" ${extra}></label>`;

function applyAemetDefaults(form) {
  const location = form.elements.public_zone.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!/(^|\W)huescar(\W|$)/.test(location)) return;
  if (!form.elements.aemet_municipality_code.value) form.elements.aemet_municipality_code.value = '18098';
  if (!form.elements.aemet_station_id.value) form.elements.aemet_station_id.value = '5051X';
}

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
          ${TEXT_FIELD('public_zone', 'Localidad o zona de referencia', 'maxlength="200"')}
          <label>Latitud (privada)<input name="latitude" type="number" step="any" min="-90" max="90"></label>
          <label>Longitud (privada)<input name="longitude" type="number" step="any" min="-180" max="180"></label>
          ${TEXT_FIELD('aemet_municipality_code', 'Código de municipio AEMET', 'inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="opcional"')}
          ${TEXT_FIELD('aemet_station_id', 'Indicativo estación observadora AEMET', 'maxlength="5" placeholder="opcional"')}
          ${TEXT_FIELD('aemet_warning_area', 'Área de avisos AEMET', 'maxlength="12" placeholder="opcional"')}
          ${TEXT_FIELD('altitude', 'Altitud (m)', 'type="number" step="1" min="-500" max="9000"')}
          ${TEXT_FIELD('installation_date', 'Fecha de instalación', 'type="date"')}
          ${TEXT_FIELD('firmware_version', 'Versión de firmware', 'maxlength="60"')}
          ${TEXT_FIELD('coverage_km', 'Cobertura (km)', 'type="number" step="0.1" min="0.1" max="500" placeholder="25"')}
        </div>
        <p class="hint">Open-Meteo usa las coordenadas automáticamente. Para AEMET, añade el código municipal, el indicativo de la estación observadora más cercana y el área de avisos; la API key debe estar guardada como variable privada AEMET_API_KEY en el servidor. Para Huéscar se sugieren el municipio 18098 y la estación observadora 5051X.</p>
        <fieldset class="sensor-set"><legend>Sensores activos</legend>${SENSOR_KEYS
          .map(([key, label]) => `<label class="check"><input type="checkbox" name="sensor_${key}" checked> ${label}</label>`).join('')}</fieldset>
        <fieldset class="sensor-set"><legend>Documentación del emplazamiento</legend>
          <div class="form-grid">
            ${TEXT_FIELD('site_sensor_model', 'Modelo de sensor', 'maxlength="160"')}
            ${TEXT_FIELD('site_shelter', 'Garita o abrigo', 'maxlength="160"')}
            ${TEXT_FIELD('site_height_m', 'Altura del sensor (m)', 'type="number" step="0.1"')}
            ${TEXT_FIELD('site_ventilation', 'Ventilación', 'maxlength="200"')}
            ${TEXT_FIELD('site_orientation', 'Orientación', 'maxlength="160"')}
            ${TEXT_FIELD('site_power', 'Alimentación', 'maxlength="160"')}
            ${TEXT_FIELD('site_notes', 'Notas del emplazamiento', 'maxlength="1000"')}
          </div>
          <p class="hint">Documentar el montaje (sensor, abrigo, altura, ventilación, orientación y alimentación) permite interpretar la medida; no la convierte en exacta.</p>
        </fieldset>
        <fieldset class="sensor-set"><legend>Verificación frente a referencia</legend>
          <label>Estado<select name="verification_status">
            <option value="unverified">Sin verificar</option>
            <option value="pending">Verificación pendiente</option>
            <option value="verified">Verificada frente a referencia</option>
          </select></label>
          <div class="form-grid">
            ${TEXT_FIELD('verification_reference', 'Referencia usada', 'maxlength="200" placeholder="patrón, estación oficial..."')}
            ${TEXT_FIELD('verification_method', 'Método', 'maxlength="600"')}
            ${TEXT_FIELD('verification_date', 'Fecha de verificación', 'type="date"')}
            ${TEXT_FIELD('verification_error', 'Error observado', 'maxlength="300" placeholder="p. ej. ±0,4 °C frente al patrón"')}
            ${TEXT_FIELD('verification_bias', 'Sesgo observado', 'maxlength="300"')}
            ${TEXT_FIELD('verification_tolerance', 'Tolerancia acordada', 'maxlength="300" placeholder="la define el equipo"')}
            ${TEXT_FIELD('verification_conditions', 'Condiciones', 'maxlength="500"')}
            ${TEXT_FIELD('verification_limitations', 'Limitaciones', 'maxlength="1000"')}
            ${TEXT_FIELD('verification_responsible', 'Responsable', 'maxlength="200"')}
          </div>
          <p class="hint">La tolerancia y el error dependen del modelo y del uso acordado: este formulario registra lo medido, no fija umbrales. Los controles automáticos de rango no sustituyen esta prueba.</p>
        </fieldset>
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
      .map((s) => `${s.name} (${s.id === 'pressure' ? 'mbar' : s.unit})`).join(' · ')}. La disponibilidad por estación se ajusta con las casillas anteriores.`;
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
              ${status.dataFreshness === 'stale' ? '<span class="badge badge-warn">Datos antiguos</span>' : status.dataFreshness === 'unknown' ? '<span class="badge badge-muted">Sin datos válidos</span>' : ''}
              ${station.publishPermission ? '<span class="badge badge-muted">Datos públicos</span>' : ''}
              ${verificationBadge(station.verification)}
            </div>
          </div>
          <p class="coverage">Último contacto: ${dateText(status.lastContact)} · último dato válido: ${dateText(status.lastValidData)} · batería ${numberText(status.batteryMv, 0)} mV (${batteryLabel(status.batteryLevel)}) · configuración v${status.configVersion}</p>
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
      form.elements.aemet_municipality_code.value = station.aemetMunicipalityCode ?? '';
      form.elements.aemet_station_id.value = station.aemetStationId ?? '';
      form.elements.aemet_warning_area.value = station.aemetWarningArea ?? '';
      form.elements.altitude.value = station.altitude ?? '';
      form.elements.installation_date.value = station.installationDate ?? '';
      form.elements.firmware_version.value = station.firmwareVersion ?? '';
      form.elements.coverage_km.value = station.coverageKm ?? '';
      form.elements.publish_permission.checked = !!station.publishPermission;
      form.elements.active.checked = !!station.active;
      const site = station.siteInfo || {};
      form.elements.site_sensor_model.value = site.sensor_model ?? '';
      form.elements.site_shelter.value = site.shelter ?? '';
      form.elements.site_height_m.value = site.height_m ?? '';
      form.elements.site_ventilation.value = site.ventilation ?? '';
      form.elements.site_orientation.value = site.orientation ?? '';
      form.elements.site_power.value = site.power ?? '';
      form.elements.site_notes.value = site.notes ?? '';
      const verification = station.verification || {};
      form.elements.verification_status.value = verification.status ?? 'unverified';
      form.elements.verification_reference.value = verification.reference ?? '';
      form.elements.verification_method.value = verification.method ?? '';
      form.elements.verification_date.value = verification.date ?? '';
      form.elements.verification_error.value = verification.error ?? '';
      form.elements.verification_bias.value = verification.bias ?? '';
      form.elements.verification_tolerance.value = verification.tolerance ?? '';
      form.elements.verification_conditions.value = verification.conditions ?? '';
      form.elements.verification_limitations.value = verification.limitations ?? '';
      form.elements.verification_responsible.value = verification.responsible ?? '';
    } else {
      form.elements.location_type.value = 'finca';
      form.elements.verification_status.value = 'unverified';
      SENSOR_KEYS.forEach(([key]) => { form.elements[`sensor_${key}`].checked = key !== 'lux'; });
      form.elements.active.checked = true;
    }
    applyAemetDefaults(form);
    const sensors = { ...(station?.sensors || {}) };
    SENSOR_KEYS.forEach(([key]) => {
      if (station) form.elements[`sensor_${key}`].checked = sensors[key] !== false;
    });
    formPanel.classList.remove('hidden');
    list.classList.add('hidden');
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.elements.public_zone.addEventListener('input', () => applyAemetDefaults(form));

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
  }

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
      aemet_municipality_code: text('aemet_municipality_code') || null,
      aemet_station_id: text('aemet_station_id') || null,
      aemet_warning_area: text('aemet_warning_area') || null,
      altitude: num('altitude'),
      installation_date: text('installation_date') || null,
      firmware_version: text('firmware_version') || null,
      publish_permission: form.elements.publish_permission.checked,
      sensors: Object.fromEntries(SENSOR_KEYS.map(([key]) => [key, form.elements[`sensor_${key}`].checked])),
      site_info: {
        sensor_model: text('site_sensor_model') || null,
        shelter: text('site_shelter') || null,
        height_m: num('site_height_m'),
        ventilation: text('site_ventilation') || null,
        orientation: text('site_orientation') || null,
        power: text('site_power') || null,
        notes: text('site_notes') || null,
      },
      verification: {
        status: text('verification_status') || 'unverified',
        reference: text('verification_reference') || null,
        method: text('verification_method') || null,
        date: text('verification_date') || null,
        error: text('verification_error') || null,
        bias: text('verification_bias') || null,
        tolerance: text('verification_tolerance') || null,
        conditions: text('verification_conditions') || null,
        limitations: text('verification_limitations') || null,
        responsible: text('verification_responsible') || null,
      },
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
  ['estadisticas', 'Estadísticas'],
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
        <p class="coverage">Periodo solicitado ${dateText(gaps.requested?.from)} → ${dateText(gaps.requested?.to)} ·
          con datos ${gaps.available?.from ? `${dateText(gaps.available.from)} → ${dateText(gaps.available.to)}` : 'sin datos'} ·
          denominador desde ${gaps.denominator?.basis === 'installation_date' ? 'la fecha de instalación' : 'la primera medición'} (${dateText(gaps.service?.from)})${gaps.truncatedToNow
            ? ` · <strong>cobertura evaluada hasta el ${dateText(gaps.evaluated?.to)}</strong>, no hasta el final del periodo pedido`
            : ''}</p>
        <p class="coverage">Recibidas ${gaps.received} · aceptadas ${gaps.valid} · inválidas ${gaps.invalid} ·
          esperadas por tiempo ${gaps.expected ?? '—'} · faltan por tiempo ${gaps.timeMissing ?? '—'} ·
          cobertura de recibidas ${gaps.receivedPct ?? '—'} % · de aceptadas ${gaps.validPct ?? '—'} %</p>
        <p class="coverage">Huecos de secuencia: ${gaps.sequence?.gaps?.length ?? 0} (${gaps.sequence?.total ?? 0} muestras) ·
          reinicios de secuencia: ${gaps.sequence?.resets?.length ?? 0} ·
          ausencia al inicio: ${gaps.leadingMissing ?? 0} · al final: ${gaps.trailingMissing ?? 0}</p>
        <p class="hint">El denominador son las muestras esperadas entre la puesta en servicio y el final del periodo
          evaluado, con las cadencias que la estación tuvo activas. Si el periodo pedido llega más allá de ahora,
          el futuro no se cuenta: no puede restar fiabilidad a una estación. Los huecos de secuencia son saltos
          del contador del equipo: no equivalen a las muestras ausentes por tiempo.</p>
        ${gaps.gaps.length ? `<div class="table-wrap"><table><thead><tr><th>Secuencia desde</th><th>Secuencia hasta</th><th>Muestras</th></tr></thead><tbody>${gaps.gaps
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
  const site = station.siteInfo || {};
  const verification = station.verification || {};
  const verificationText = verification.status === 'verified'
    ? `verificada frente a referencia${verification.reference ? ` (${verification.reference})` : ''}${verification.date ? ` el ${verification.date}` : ''}`
    : verification.status === 'pending' ? 'verificación pendiente' : 'sin verificar frente a referencia';
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
    ['Modelo de sensor', site.sensor_model],
    ['Garita o abrigo', site.shelter],
    ['Altura del sensor', site.height_m == null ? null : `${numberText(site.height_m, 1)} m`],
    ['Ventilación', site.ventilation],
    ['Orientación', site.orientation],
    ['Alimentación', site.power],
    ['Notas del emplazamiento', site.notes],
    ['Verificación', verificationText],
    ['Referencia de verificación', verification.reference],
    ['Método de verificación', verification.method],
    ['Error observado', verification.error],
    ['Sesgo observado', verification.bias],
    ['Tolerancia acordada', verification.tolerance],
    ['Condiciones de verificación', verification.conditions],
    ['Limitaciones de verificación', verification.limitations],
    ['Responsable de verificación', verification.responsible],
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
  // La ficha de configuración y reglas queda fuera del rol de demostración.
  const staffRows = new Set(['Configuración aplicada', 'Muestras pendientes', 'Reglas de aviso', 'Versiones de configuración']);
  const visibleRows = canEdit() ? rows : rows.filter(([label]) => !staffRows.has(label));
  content.innerHTML = `<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">ESTADO OPERATIVO</p><h2>Ficha técnica y de estado</h2></div>
      ${canEdit() ? '<a class="button-link" href="#/estaciones">Editar desde el listado</a>' : ''}</div>
    <dl class="detail-grid">${visibleRows
      .map(([label, value]) => `<dt>${label}</dt><dd>${escapeText(value ?? '—')}</dd>`).join('')}</dl>
    <h3>Sensores</h3><ul class="plain-list">${sensorState}</ul>
  </section>`;
}

export async function renderStationDetail(root, stationId, tab = 'resumen') {
  const detail = await api(`/api/v1/stations/${encodeURIComponent(stationId)}`);
  const station = detail.station;
  const status = detail.status || {};
  // El rol de demostración solo ve lectura: sin configuración, control remoto
  // ni estadísticas de operación. El operador mantiene configuración; el
  // análisis estadístico queda para administración.
  const availableTabs = isAdmin() ? TABS
    : canEdit() ? TABS.filter(([key]) => key !== 'estadisticas')
      : TABS.filter(([key]) => ['resumen', 'estado', 'mediciones', 'avisos'].includes(key));
  const activeTab = availableTabs.some(([key]) => key === tab) ? tab : 'resumen';
  const link = (key) => `#/estaciones/${encodeURIComponent(station.id)}/${key}`;

  // El control remoto es una pantalla propia con su propia cabecera.
  if (tab === 'remoto' && canEdit()) {
    await renderRemoteControl(root, station.id, station);
    return;
  }

  root.innerHTML = `
    <div class="page-heading">
      <div>
        <p class="eyebrow"><a href="#/estaciones">Estaciones</a> · ${escapeText(station.id)}</p>
        <h1>${escapeText(station.name)}</h1>
        <p class="updated">${escapeText([station.owner, station.publicZone].filter(Boolean).join(' · ') || 'Sin propietario registrado')}</p>
      </div>
      <div class="station-tags">
        ${station.active ? connectivityBadge(status.connectivity) : '<span class="badge badge-muted">Desactivada</span>'}
        ${canEdit() ? `<span class="badge badge-muted">Config v${status.configVersion ?? 0}</span>` : ''}
        <span class="badge badge-muted">${batteryLabel(status.batteryLevel)}</span>
        ${verificationBadge(station.verification)}
        ${canEdit() ? `<a class="button-link" href="#/estaciones/${encodeURIComponent(station.id)}/remoto">Control remoto</a>` : ''}
      </div>
    </div>
    <nav class="tabs">${availableTabs.map(([key, label]) =>
      `<a href="${link(key)}" class="${key === activeTab ? 'active' : ''}">${label}</a>`).join('')}</nav>
    <div data-tab-content></div>`;

  const content = $('[data-tab-content]', root);
  if (activeTab === 'resumen') await renderResumen(content, station.id);
  else if (activeTab === 'estado') renderEstado(content, detail);
  else if (activeTab === 'config') await renderConfigTab(content, station.id);
  else if (activeTab === 'mediciones') {
    content.innerHTML = '<section class="panel"></section>';
    mountMeasurements($('section', content), { fixedStation: station.id });
  } else if (activeTab === 'estadisticas') await renderStatisticsTab(content, station.id, station);
  else await renderStationAlertsTab(content, station.id);
}
