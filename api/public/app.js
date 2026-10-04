const $ = (selector, root = document) => root.querySelector(selector);
const loginView = $('#login-view');
const dashboardView = $('#dashboard-view');
const logoutButton = $('#logout');
const escapeText = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateText = (value) => value ? new Date(value).toLocaleString('es-ES') : 'Sin lecturas';
const numberText = (value, digits = 1) => value == null ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits });

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'X-Requested-With': 'fetch', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (response.status === 401) showLogin();
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function showLogin() {
  loginView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  logoutButton.classList.add('hidden');
}

function metric(label, value, unit = '') {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong> <small>${unit}</small></div>`;
}

function makeChart(title, rows, key, color, unit, digits = 1) {
  const points = rows.filter((row) => row[key] != null);
  if (!points.length) return `<div class="chart-box"><h3>${title}</h3><p class="empty">No hay mediciones en este periodo.</p></div>`;
  const width = 500, height = 135, pad = 18;
  const values = points.map((row) => Number(row[key]));
  let low = Math.min(...values), high = Math.max(...values);
  if (high === low) { high += 1; low -= 1; }
  const coords = points.map((row, index) => {
    const x = pad + (points.length === 1 ? 0.5 : index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - (Number(row[key]) - low) / (high - low) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = dateText(points[0].observedAt);
  const last = dateText(points.at(-1).observedAt);
  return `<div class="chart-box"><h3>${title} · ${unit}</h3><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title} desde ${first} hasta ${last}"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" stroke="#dfe7df"/><polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>${points.map((row, i) => { const p = coords.split(' ')[i].split(','); return `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/>`; }).join('')}</svg><div class="summary"><span>Mín. ${numberText(Math.min(...values), digits)} ${unit}</span><span>Máx. ${numberText(Math.max(...values), digits)} ${unit}</span><span>Prom. ${numberText(values.reduce((a,b)=>a+b,0)/values.length, digits)} ${unit}</span></div></div>`;
}

function renderStation(item) {
  const { device, status, latest, history, forecasts, nearby } = item;
  const sensors = status.sensors;
  const sensorState = sensors ? Object.entries({ Temperatura: sensors.temperature, Humedad: sensors.humidity, Presión: sensors.pressure, Batería: sensors.battery }).map(([label, ok]) => `${label} ${ok ? 'OK' : 'sin dato'}`).join(' · ') : 'Sin mediciones';
  const low = item.summary;
  const batteryLabel = status.battery === 'ok' ? 'Correcta' : status.battery === 'low' ? 'Baja' : status.battery === 'critical' ? 'Crítica' : 'Sin dato';
  const chartSection = `<div class="chart-grid">${makeChart('Temperatura', history, 'temperatureC', '#d47749', '°C')}${makeChart('Humedad', history, 'humidityPct', '#4286a8', '%')}${makeChart('Presión', history, 'pressurePa', '#735bb0', 'Pa', 0)}${makeChart('Batería', history, 'batteryMv', '#528452', 'mV', 0)}</div>`;
  const forecastSection = forecasts.length ? forecasts.map((forecast) => `<div class="forecast-row"><span><span class="source-tag">Previsión externa · ${escapeText(forecast.provider)}</span><br>${dateText(forecast.forecastFor)}</span><span>${numberText(forecast.temperatureC)} °C · lluvia ${numberText(forecast.precipitationMm)} mm</span></div>`).join('') : '<p class="empty">Sin previsión externa disponible. No se muestran estimaciones propias.</p>';
  const nearbyRows = nearby.stations.length ? nearby.stations.map((station) => `<div class="nearby-row"><span>${escapeText(station.name)} · última conexión ${dateText(station.lastSeenAt)}</span><strong>${numberText(station.distanceKm, 1)} km</strong></div>`).join('') : '<p class="empty">No hay estaciones cercanas activas y cubiertas.</p>';
  return `<article class="station-card"><div class="station-head"><div><p class="eyebrow">ESTACIÓN</p><h2>${escapeText(device.name)}</h2><p class="updated">Última actualización: ${dateText(latest?.observedAt || status.last_seen_at)}</p></div><span class="status ${status.connected ? '' : 'offline'}">${status.connected ? 'Conectada' : 'Sin conexión reciente'}</span></div>
    <div class="metrics">${metric('Temperatura', numberText(latest?.temperatureC), '°C')}${metric('Humedad', numberText(latest?.humidityPct), '%')}${metric('Presión', numberText(latest?.pressurePa, 0), 'Pa')}${metric('Batería', latest?.batteryMv == null ? '—' : numberText(latest.batteryMv, 0), latest?.batteryMv == null ? batteryLabel : `mV · ${batteryLabel}`)}</div>
    <p class="coverage">Sensores: ${sensorState}</p>${chartSection}
    <div class="subsection"><h3>Previsión meteorológica</h3><p class="coverage">Fuente externa separada de las mediciones de la estación.</p>${forecastSection}</div>
    <div class="subsection"><h3>Estaciones cercanas</h3><p class="coverage">${escapeText(nearby.message)} ${nearby.representative ? 'Cobertura representativa disponible.' : 'La cobertura puede ser insuficiente.'}</p>${nearbyRows}</div>
  </article>`;
}

function renderAlerts(alerts) {
  if (!alerts.length) return '<p class="empty">No hay avisos recientes.</p>';
  return alerts.map((alert) => `<div class="alert-row"><div><strong>${escapeText(alert.deviceName)} · ${escapeText(alert.message)}</strong><div class="alert-detail">${dateText(alert.observedAt)} · fuente: ${escapeText(alert.source)} · dato: ${escapeText(JSON.stringify(alert.value))}</div></div><span class="alert-level ${alert.level === 2 ? 'warning' : ''}">${alert.level === 1 ? 'Prioritario' : 'Aviso'}</span></div>`).join('');
}

async function loadDashboard() {
  $('#dashboard-error').textContent = '';
  try {
    const data = await api(`/api/v1/dashboard?period=${encodeURIComponent($('#period').value)}`);
    $('#stations').innerHTML = data.devices.length ? data.devices.map(renderStation).join('') : '<section class="panel"><p class="empty">Tu suscripción aún no tiene estaciones vinculadas.</p></section>';
    $('#alerts').innerHTML = renderAlerts(data.alerts);
    syncDeviceFilter(data.devices);
    await loadTable();
    loginView.classList.add('hidden'); dashboardView.classList.remove('hidden'); logoutButton.classList.remove('hidden');
  } catch (error) {
    if (error.message !== 'authentication_required' && error.message !== 'session_expired') $('#dashboard-error').textContent = `No se pudo cargar el panel: ${error.message}`;
  }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  $('#login-error').textContent = '';
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    await loadDashboard();
  } catch { $('#login-error').textContent = 'No se pudo iniciar sesión. Revisa tus credenciales.'; }
});

$('#period').addEventListener('change', loadDashboard);
logoutButton.addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

// ---- Tabla de mediciones: filtros año/mes/semana/día y borrado -----------
const tableBody = $('#measurements-table tbody');
const tableState = { rows: [], total: 0, limit: 100 };

const localIsoDate = (value) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

function periodRange(kind, isoDate) {
  const from = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  let to;
  if (kind === 'day') {
    to = new Date(from); to.setDate(to.getDate() + 1);
  } else if (kind === 'week') {
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); // lunes
    to = new Date(from); to.setDate(to.getDate() + 7);
  } else if (kind === 'month') {
    from.setDate(1);
    to = new Date(from); to.setMonth(to.getMonth() + 1);
  } else {
    from.setMonth(0, 1);
    to = new Date(from); to.setFullYear(to.getFullYear() + 1);
  }
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function syncDeviceFilter(devices) {
  const select = $('#table-device');
  const previous = select.value;
  select.innerHTML = devices.map((item) => `<option value="${escapeText(item.device.id)}">${escapeText(item.device.name)}</option>`).join('') || '<option value="">Sin estaciones</option>';
  if (previous && [...select.options].some((option) => option.value === previous)) select.value = previous;
}

function renderTableRow(row) {
  const alert = row.alertLevel === 1 ? 'Prioritaria' : row.alertLevel === 2 ? 'Aviso' : '—';
  const cell = (value, unit, digits) => value == null ? '—' : `${numberText(value, digits ?? 1)} ${unit}`;
  return `<tr><td>${dateText(row.observedAt)}</td><td>${escapeText(row.sequence)}</td><td>${cell(row.temperatureC, '°C')}</td><td>${cell(row.humidityPct, '%')}</td><td>${cell(row.pressurePa, 'Pa', 0)}</td><td>${cell(row.batteryMv, 'mV', 0)}</td><td>${alert}</td><td><button class="danger" type="button" data-delete="${escapeText(row.id)}">Borrar</button></td></tr>`;
}

async function loadTable({ append = false } = {}) {
  $('#table-error').textContent = '';
  if (!append) tableState.rows = [];
  const { from, to } = periodRange($('#table-period').value, $('#table-date').value);
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), limit: String(tableState.limit), offset: String(tableState.rows.length) });
  if ($('#table-device').value) params.set('device_id', $('#table-device').value);
  try {
    const data = await api(`/api/v1/measurements?${params}`);
    tableState.total = data.total;
    tableState.rows = tableState.rows.concat(data.measurements);
    tableBody.innerHTML = tableState.rows.map(renderTableRow).join('') || '<tr><td colspan="8">No hay mediciones en este periodo.</td></tr>';
    $('#table-summary').textContent = `${tableState.rows.length} de ${data.total} mediciones · ${from.toLocaleDateString('es-ES')} → ${new Date(to.getTime() - 1).toLocaleDateString('es-ES')}`;
    $('#table-more').classList.toggle('hidden', tableState.rows.length >= data.total);
  } catch (error) {
    $('#table-error').textContent = `No se pudo cargar la tabla: ${error.message}`;
  }
}

tableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-delete]');
  if (!button) return;
  if (!confirm('¿Borrar esta medición? No se puede deshacer.')) return;
  button.disabled = true;
  try {
    await api(`/api/v1/measurements/${button.dataset.delete}`, { method: 'DELETE' });
    await loadTable();
  } catch (error) {
    $('#table-error').textContent = `No se pudo borrar: ${error.message}`;
    button.disabled = false;
  }
});

$('#table-apply').addEventListener('click', () => loadTable());
$('#table-period').addEventListener('change', () => loadTable());
$('#table-more').addEventListener('click', () => loadTable({ append: true }));
$('#table-date').value = localIsoDate(new Date());

loadDashboard();
