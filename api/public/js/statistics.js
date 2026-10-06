import { $, api, escapeText, dateText, numberText, pressureMbar, canEdit, METRIC_ICONS } from './ui.js';
import { makeChart } from './ui.js';

const TREND_LABELS = { sube: 'sube', baja: 'baja', estable: 'estable', insuficiente: 'sin datos suficientes' };

const TREND_COLORS = { sube: '#a13333', baja: '#4286a8', estable: '#5d6f62', insuficiente: '#8a938c' };

// Informe estadístico del periodo. Solo se usan mediciones validadas, y se
// citan siempre el periodo y la estación usados para no insinuar más de lo medido.
export async function renderStatisticsTab(content, stationId, station) {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  const [data, impact] = await Promise.all([
    api(`/api/v1/stations/${encodeURIComponent(stationId)}/statistics?from=${from.toISOString()}&to=${to.toISOString()}`),
    api(`/api/v1/stations/${encodeURIComponent(stationId)}/urgent-impact`).catch(() => null),
  ]);

  const coverage = data.coverage;
  const metricCards = Object.entries(data.metrics).map(([key, sourceMetric]) => {
    const metric = key === 'pressure_pa' ? {
      ...sourceMetric,
      unit: 'mbar', digits: 1,
      min: pressureMbar(sourceMetric.min), max: pressureMbar(sourceMetric.max),
      avg: pressureMbar(sourceMetric.avg), stddev: pressureMbar(sourceMetric.stddev),
      p10: pressureMbar(sourceMetric.p10), p50: pressureMbar(sourceMetric.p50), p90: pressureMbar(sourceMetric.p90),
      trend: sourceMetric.trend ? {
        ...sourceMetric.trend,
        slopePerHour: pressureMbar(sourceMetric.trend.slopePerHour),
        totalChange: pressureMbar(sourceMetric.trend.totalChange),
      } : sourceMetric.trend,
    } : sourceMetric;
    return `
    <div class="stat-card">
      <p class="eyebrow">${METRIC_ICONS[metric.label] ? `<span class="metric-icon" aria-hidden="true">${METRIC_ICONS[metric.label]} </span>` : ''}${escapeText(metric.label)} <small>${escapeText(metric.unit)}</small></p>
      <div class="stat-row">
        <span>Mín</span><strong>${numberText(metric.min, metric.digits ?? 1)}</strong>
        <span>Máx</span><strong>${numberText(metric.max, metric.digits ?? 1)}</strong>
        <span>Media</span><strong>${numberText(metric.avg, metric.digits ?? 1)}</strong>
      </div>
      <div class="stat-row">
        <span>Mediana</span><strong>${numberText(metric.p50, metric.digits ?? 1)}</strong>
        <span>Desv.</span><strong>${numberText(metric.stddev, metric.digits ?? 1)}</strong>
        <span>Muestras</span><strong>${metric.count}</strong>
      </div>
      <p class="trend trend-${escapeText(metric.trend.direction)}" style="--trend-color:${TREND_COLORS[metric.trend.direction] || TREND_COLORS.insuficiente}">
        ${metric.trend.direction === 'sube' ? '↑ ' : metric.trend.direction === 'baja' ? '↓ ' : metric.trend.direction === 'estable' ? '→ ' : '· '}
        Tendencia ${escapeText(TREND_LABELS[metric.trend.direction] || metric.trend.direction)}
        ${metric.trend.slopePerHour != null ? ` · ${numberText(metric.trend.slopePerHour, 3)} ${escapeText(metric.unit)}/h` : ''}
      </p>
    </div>`;
  }).join('');

  const dixonCards = Object.entries(data.metrics).map(([key, metric]) => {
    const result = metric.dixonQ;
    if (!result) return '';
    const pressure = key === 'pressure_pa';
    const value = result.suspectedValue == null ? '—'
      : pressure ? `${numberText(pressureMbar(result.suspectedValue), 1)} mbar`
        : `${numberText(result.suspectedValue, metric.digits ?? 1)} ${metric.unit}`;
    const label = result.status === 'possible_outlier' ? 'Extremo a revisar'
      : result.status === 'no_outlier' ? 'Sin atípico detectado'
        : result.status === 'no_variation' ? 'Serie constante' : 'Muestras insuficientes';
    const badgeClass = result.status === 'possible_outlier' ? 'badge badge-warn' : 'badge badge-muted';
    return `<article class="dixon-card">
      <div class="dixon-card-head"><strong>${escapeText(metric.label)}</strong><span class="${badgeClass}">${label}</span></div>
      <div class="dixon-result"><span>Q observada</span><strong>${numberText(result.q, 3)}</strong><span>Q crítica 95 %</span><strong>${numberText(result.criticalQ, 3)}</strong></div>
      <p>${result.status === 'possible_outlier'
        ? `Posible valor extremo (${result.side}): ${value} · ${dateText(result.suspectedAt)}.`
        : `Muestras evaluadas: ${result.n} de hasta ${result.sampleLimit}.`}</p>
    </article>`;
  }).join('');

  const seriesRows = data.series.map((point) => `<tr>
    <td>${dateText(point.at)}</td><td>${point.count}</td>
    <td>${numberText(point.temperatureAvg)}</td><td>${numberText(point.humidityAvg)}</td>
  </tr>`).join('');

  const chartRows = data.series
    .filter((point) => point.temperatureAvg != null)
    .map((point) => ({ observedAt: point.at, temperatureC: point.temperatureAvg }));

  const impactBlock = impact ? `
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">ALERTA URGENTE</p><h2>Coste de envío inmediato</h2></div>
        ${impact.pending ? `<span class="badge badge-warn">${impact.pending} pendiente(s)</span>` : ''}</div>
      <p class="coverage">Con lotes cada ${numberText(impact.delay.syncIntervalS, 0)} s, un aviso urgente llega como muy tarde
        ese tiempo después de la medida. Una alerta de helada no puede esperar a media hora.</p>
      <div class="fact-grid">
        <div><span>Envíos urgentes</span><strong>${impact.impact.urgentEvents}</strong></div>
        <div><span>Medidos</span><strong>${impact.impact.measuredEvents}</strong></div>
        <div><span>Gasto de fondo</span><strong>${impact.impact.baselineMvPerHour != null ? `${numberText(impact.impact.baselineMvPerHour, 2)} mV/h` : '—'}</strong></div>
        <div><span>Coste extra por evento</span><strong>${impact.impact.extraDropMvPerUrgentEvent != null ? `${numberText(impact.impact.extraDropMvPerUrgentEvent, 1)} mV` : '—'}</strong></div>
        <div><span>Consumo extra diario</span><strong>${impact.impact.estimatedExtraDrainMvPerDay != null ? `${numberText(impact.impact.estimatedExtraDrainMvPerDay, 1)} mV` : '—'}</strong></div>
      </div>
      <p class="${impact.impact.sufficiency === 'suficiente' ? 'hint' : 'warn-box'}">${escapeText(impact.impact.note)}</p>
      <p class="hint">El firmware actual todavía no aplica la directiva: se mide sobre envíos reales antes de
        decidir si compensa el gasto. Con LoRa el mismo pendiente sigue siendo válido.</p>
    </section>` : '';

  content.innerHTML = `
    <section class="panel">
      <div class="section-heading">
        <div><p class="eyebrow">ESTADÍSTICAS</p><h2>${escapeText(station.name)} · últimos ${data.hours >= 48 ? `${Math.round(data.hours / 24)} días` : `${data.hours} h`}</h2></div>
        <p class="coverage">${dateText(data.from)} → ${dateText(data.to)} · ${data.samples} medidas validadas</p>
      </div>
      <div class="fact-grid">
        <div><span>Recibidos</span><strong>${coverage.received}</strong></div>
        <div><span>Esperados</span><strong>${coverage.expected ?? '—'}</strong></div>
        <div><span>Cobertura</span><strong>${coverage.receivedPct != null ? `${numberText(coverage.receivedPct, 1)} %` : '—'}</strong></div>
        <div><span>Válidos</span><strong>${coverage.valid} (${coverage.invalid} inválidos)</strong></div>
        <div><span>Avisos del periodo</span><strong>${data.alerts.total}${data.alerts.open ? ` · ${data.alerts.open} abiertos` : ''}</strong></div>
      </div>
      ${coverage.expected && coverage.receivedPct != null && coverage.receivedPct < 90
        ? `<div class="warn-box"><p>Ha llegado el ${numberText(coverage.receivedPct, 1)} % de las medidas previstas
            (intervalo configurado ${numberText(coverage.intervalSeconds, 0)} s). Faltan ${coverage.missing}.</p></div>`
        : ''}
      <div class="stat-grid">${metricCards}</div>
      <section class="dixon-analysis" aria-labelledby="dixon-heading">
        <div class="dixon-heading"><div><p class="eyebrow">CONTROL ESTADÍSTICO · ADMINISTRACIÓN</p><h3 id="dixon-heading">Valores atípicos · Q de Dixon</h3></div><span class="badge badge-muted">95 % · α = 0,05</span></div>
        <p class="hint">Evalúa el valor mínimo o máximo más extremo de las últimas 30 mediciones validadas por variable. Es una señal para revisar, no elimina ni invalida datos automáticamente.</p>
        <div class="dixon-grid">${dixonCards}</div>
      </section>
      <p class="hint">${(data.limits || []).map((limit) => escapeText(limit)).join(' ')}</p>
    </section>
    ${chartRows.length > 1 ? `<section class="panel"><h3>Evolución por bloques de ${data.bucketHours} h</h3>
      ${makeChart('Temperatura media', chartRows, 'temperatureC', '#d47749', '°C')}</section>` : ''}
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">DETALLE</p><h2>Valores por bloque</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Bloque</th><th>Muestras</th><th>Temp. media</th><th>Humedad media</th></tr></thead>
        <tbody>${seriesRows || '<tr><td colspan="4">Sin datos en el periodo.</td></tr>'}</tbody>
      </table></div>
    </section>
    ${impactBlock}
    ${canEdit() ? '' : '<p class="empty">Tu rol es de solo lectura.</p>'}`;
}
