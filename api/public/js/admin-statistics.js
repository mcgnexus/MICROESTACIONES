import {
  $, api, escapeText, dateText, numberText, pressureMbar, makeChart, METRIC_ICONS,
} from './ui.js';

// Panel de cálculo estadístico para administración: elige estación(es) y
// periodo, ejecuta el informe validado y permite exportarlo a CSV.
// Comparar varias estaciones es simplemente pedir el informe a cada una.

const TREND_LABELS = { sube: 'sube', baja: 'baja', estable: 'estable', insuficiente: 'sin datos suficientes' };
const TREND_COLORS = { sube: '#a13333', baja: '#246b91', estable: '#49745a', insuficiente: '#8a938c' };

const localIsoDate = (value) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function periodRange(period, fromValue, toValue) {
  const to = new Date();
  if (period === 'custom') {
    const from = fromValue ? new Date(`${fromValue}T00:00:00`) : new Date(to.getTime() - 7 * 24 * 3600 * 1000);
    const end = toValue ? new Date(`${toValue}T00:00:00`) : new Date();
    end.setDate(end.getDate() + 1);
    return { from, to: end };
  }
  const hours = { '24h': 24, '7d': 168, '30d': 720 }[period] || 168;
  return { from: new Date(to.getTime() - hours * 3600 * 1000), to };
}

function normalizeMetric(key, metric) {
  if (key !== 'pressure_pa') return { ...metric, displayUnit: metric.unit, digits: metric.digits ?? 1 };
  return {
    ...metric,
    unit: 'Pa',
    displayUnit: 'mbar',
    digits: 1,
    min: pressureMbar(metric.min), max: pressureMbar(metric.max), avg: pressureMbar(metric.avg),
    stddev: pressureMbar(metric.stddev), p10: pressureMbar(metric.p10), p50: pressureMbar(metric.p50), p90: pressureMbar(metric.p90),
    trend: metric.trend ? { ...metric.trend, slopePerHour: metric.trend.slopePerHour == null ? null : pressureMbar(metric.trend.slopePerHour) } : metric.trend,
  };
}

function metricCard(key, source) {
  const metric = normalizeMetric(key, source);
  const icon = METRIC_ICONS[metric.label] || '📊';
  const trend = metric.trend || { direction: 'insuficiente' };
  const arrow = trend.direction === 'sube' ? '↑' : trend.direction === 'baja' ? '↓' : trend.direction === 'estable' ? '→' : '·';
  return `<div class="stat-card">
    <p class="eyebrow"><span class="metric-icon" aria-hidden="true">${icon}</span>${escapeText(metric.label)} <small>${escapeText(metric.displayUnit)}</small></p>
    <div class="stat-row">
      <span>Mín</span><strong>${numberText(metric.min, metric.digits)}</strong>
      <span>Máx</span><strong>${numberText(metric.max, metric.digits)}</strong>
      <span>Media</span><strong>${numberText(metric.avg, metric.digits)}</strong>
    </div>
    <div class="stat-row">
      <span>p10</span><strong>${numberText(metric.p10, metric.digits)}</strong>
      <span>p50</span><strong>${numberText(metric.p50, metric.digits)}</strong>
      <span>p90</span><strong>${numberText(metric.p90, metric.digits)}</strong>
    </div>
    <div class="stat-row">
      <span>Desv.</span><strong>${numberText(metric.stddev, metric.digits)}</strong>
      <span>Muestras</span><strong>${metric.count}</strong>
      <span></span><strong></strong>
    </div>
    <p class="trend trend-${escapeText(trend.direction)}" style="--trend-color:${TREND_COLORS[trend.direction] || TREND_COLORS.insuficiente}">
      ${arrow} Tendencia ${escapeText(TREND_LABELS[trend.direction] || trend.direction)}${trend.slopePerHour != null ? ` · ${numberText(trend.slopePerHour, 3)} ${escapeText(metric.displayUnit)}/h` : ''}
    </p>
  </div>`;
}

function dixonCard(key, source) {
  const metric = normalizeMetric(key, source);
  const result = source.dixonQ;
  if (!result) return '';
  const pressure = key === 'pressure_pa';
  const value = result.suspectedValue == null ? '—'
    : pressure ? `${numberText(pressureMbar(result.suspectedValue), 1)} mbar`
      : `${numberText(result.suspectedValue, metric.digits)} ${metric.displayUnit}`;
  const label = result.status === 'possible_outlier' ? 'Extremo a revisar'
    : result.status === 'no_outlier' ? 'Sin atípico detectado'
      : result.status === 'no_variation' ? 'Serie constante' : 'Muestras insuficientes';
  const badgeClass = result.status === 'possible_outlier' ? 'badge badge-warn' : 'badge badge-muted';
  return `<article class="dixon-card">
    <div class="dixon-card-head"><strong>${escapeText(metric.label)}</strong><span class="${badgeClass}">${label}</span></div>
    <div class="dixon-result"><span>Q obs.</span><strong>${numberText(result.q, 3)}</strong><span>Q crítica</span><strong>${numberText(result.criticalQ, 3)}</strong></div>
    <p>${result.status === 'possible_outlier' ? `Posible valor extremo (${result.side}): ${value} · ${dateText(result.suspectedAt)}.` : `Muestras evaluadas: ${result.n} de hasta ${result.sampleLimit}.`}</p>
  </article>`;
}

function stationReport(entry) {
  if (entry.error) {
    return `<section class="panel stats-station"><div class="section-heading"><div><p class="eyebrow">ESTACIÓN</p><h2>${escapeText(entry.name)}</h2></div></div><p class="error">No se pudo calcular: ${escapeText(entry.error)}</p></section>`;
  }
  const data = entry.data;
  const coverage = data.coverage;
  const metrics = Object.entries(data.metrics);
  const metricCards = metrics.map(([key, metric]) => metricCard(key, metric)).join('');
  const dixonCards = metrics.map(([key, metric]) => dixonCard(key, metric)).join('');
  const chartRows = (data.series || [])
    .filter((point) => point.temperatureAvg != null)
    .map((point) => ({ observedAt: point.at, temperatureC: point.temperatureAvg }));
  return `<section class="panel stats-station">
    <div class="section-heading">
      <div><p class="eyebrow">ESTACIÓN · ${escapeText(data.deviceId)}</p><h2>${escapeText(entry.name)}</h2></div>
      <p class="coverage">${dateText(data.from)} → ${dateText(data.to)} · ${data.samples} medidas validadas</p>
    </div>
    <div class="fact-grid">
      <div><span>Recibidos</span><strong>${coverage.received}</strong></div>
      <div><span>Esperados</span><strong>${coverage.expected ?? '—'}</strong></div>
      <div><span>Cobertura</span><strong>${coverage.receivedPct != null ? `${numberText(coverage.receivedPct, 1)} %` : '—'}</strong></div>
      <div><span>Válidos</span><strong>${coverage.valid} · ${coverage.invalid} inválidos</strong></div>
      <div><span>Avisos</span><strong>${data.alerts.total}${data.alerts.open ? ` · ${data.alerts.open} abiertos` : ''}</strong></div>
    </div>
    <div class="stat-grid">${metricCards}</div>
    <section class="dixon-analysis"><div class="dixon-heading"><div><p class="eyebrow">VALORES ATÍPICOS · Q DE DIXON</p><h3>Solo revisa, no borra</h3></div><span class="badge badge-muted">95 %</span></div><div class="dixon-grid">${dixonCards}</div></section>
    ${chartRows.length > 1 ? `<div class="stats-chart">${makeChart('Temperatura media', chartRows, 'temperatureC', '#16a6bf', '°C')}</div>` : ''}
    <p class="hint">${(data.limits || []).map((limit) => escapeText(limit)).join(' ')}</p>
  </section>`;
}

function resultsCsv(entries, range) {
  const lines = [['estacion_id', 'estacion', 'desde', 'hasta', 'metrica', 'unidad', 'muestras', 'min', 'max', 'media', 'desviacion', 'p10', 'p50', 'p90', 'tendencia', 'pendiente_por_hora'].join(',')];
  for (const entry of entries) {
    if (entry.error) continue;
    const { data } = entry;
    for (const [key, source] of Object.entries(data.metrics)) {
      const metric = normalizeMetric(key, source);
      const trend = metric.trend || { direction: 'insuficiente', slopePerHour: null };
      lines.push([
        data.deviceId, entry.name, data.from, data.to, metric.label, metric.displayUnit,
        metric.count, metric.min, metric.max, metric.avg, metric.stddev, metric.p10, metric.p50, metric.p90,
        trend.direction, trend.slopePerHour,
      ].map(csvCell).join(','));
    }
  }
  return lines.join('\r\n');
}

export async function mountAdminStatistics(root) {
  root.innerHTML = `
    <div class="section-heading"><div><p class="eyebrow">ANÁLISIS ESTADÍSTICO</p><h2>Cálculo sobre datos validados</h2></div></div>
    <div class="stats-controls">
      <div class="stats-field stats-field-stations"><span>Estaciones</span><div class="stats-stations" data-stations><small>Cargando…</small></div></div>
      <div class="stats-field"><label>Periodo<select data-period>
        <option value="24h">Últimas 24 h</option>
        <option value="7d" selected>Últimos 7 días</option>
        <option value="30d">Últimos 30 días</option>
        <option value="custom">Rango libre</option></select></label></div>
      <div class="stats-field hidden" data-from-field><label>Desde<input type="date" data-from></label></div>
      <div class="stats-field hidden" data-to-field><label>Hasta<input type="date" data-to></label></div>
      <div class="stats-actions">
        <button type="button" data-calc>Calcular</button>
        <button type="button" class="quiet" data-csv disabled>Exportar CSV</button>
      </div>
    </div>
    <p class="error" data-error role="alert"></p>
    <p class="coverage" data-summary></p>
    <div data-results class="stats-results"></div>`;

  const state = { stations: [], entries: [], range: null };
  const error = (message) => { $('[data-error]', root).textContent = message; };

  const today = new Date();
  $('[data-from]', root).value = localIsoDate(new Date(today.getTime() - 7 * 24 * 3600 * 1000));
  $('[data-to]', root).value = localIsoDate(today);

  try {
    const { stations } = await api('/api/v1/stations');
    state.stations = stations;
    $('[data-stations]', root).innerHTML = stations.length
      ? stations.map((station) => `<label class="check"><input type="checkbox" value="${escapeText(station.id)}" ${stations.length === 1 ? 'checked' : ''}> ${escapeText(station.name)} <small>${escapeText(station.id)}</small></label>`).join('')
      : '<small>No hay estaciones accesibles.</small>';
  } catch (error_) {
    error(`No se pudieron cargar las estaciones: ${error_.message}`);
  }

  const syncFields = () => {
    const custom = $('[data-period]', root).value === 'custom';
    $('[data-from-field]', root).classList.toggle('hidden', !custom);
    $('[data-to-field]', root).classList.toggle('hidden', !custom);
  };

  async function calculate() {
    error('');
    const ids = [...root.querySelectorAll('[data-stations] input:checked')].map((input) => input.value);
    if (!ids.length) { error('Selecciona al menos una estación.'); return; }
    const range = periodRange($('[data-period]', root).value, $('[data-from]', root).value, $('[data-to]', root).value);
    if (range.from >= range.to) { error('El rango de fechas no es válido.'); return; }
    state.range = range;
    $('[data-results]', root).innerHTML = '<p class="empty">Calculando…</p>';
    $('[data-summary]', root).textContent = '';
    $('[data-csv]', root).disabled = true;
    const entries = await Promise.all(ids.map(async (id) => {
      const station = state.stations.find((item) => item.id === id);
      try {
        const data = await api(`/api/v1/stations/${encodeURIComponent(id)}/statistics?from=${range.from.toISOString()}&to=${range.to.toISOString()}`);
        return { id, name: station?.name || id, data };
      } catch (error_) {
        return { id, name: station?.name || id, error: error_.message };
      }
    }));
    state.entries = entries;
    const ok = entries.filter((entry) => !entry.error);
    $('[data-summary]', root).textContent = `${ok.length} de ${entries.length} estación(es) calculadas · ${dateText(range.from)} → ${dateText(range.to)}`;
    $('[data-results]', root).innerHTML = entries.map(stationReport).join('');
    $('[data-csv]', root).disabled = ok.length === 0;
  }

  function exportCsv() {
    if (!state.entries.some((entry) => !entry.error)) return;
    const blob = new Blob([resultsCsv(state.entries, state.range)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tecrural-estadisticas-${localIsoDate(state.range.from)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  $('[data-period]', root).addEventListener('change', syncFields);
  $('[data-calc]', root).addEventListener('click', calculate);
  $('[data-csv]', root).addEventListener('click', exportCsv);
  syncFields();
}
