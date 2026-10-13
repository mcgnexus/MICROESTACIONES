// Análisis del periodo del panel de consulta (solo lectura).
//
// Se carga bajo demanda desde panel.js: solo lo usan los usuarios con rol de
// consulta, así que quien entra al panel de administración o del agricultor no
// descarga este código. Aquí vive solo lo que dibuja el análisis; los textos de
// la portada del panel y el armazón siguen en panel.js.
import { escapeText, numberText, pressureMbar, trendSentence, trendPeriodForHours } from './ui.js';
import { stampText, panelDocumentation } from './panel-shared.js';

export function demoMetricCard(metric, unit, digits, metricKey, periodLabel) {
  if (!metric || !metric.count) {
    return `<div class="stat-card"><p class="eyebrow">${escapeText(metric?.label || '')} <small>${escapeText(unit)}</small></p><p class="empty">Sin datos en el periodo.</p></div>`;
  }
  const trend = metric.trend || { direction: 'insuficiente', totalChange: null };
  const sentence = trendSentence(metricKey, trend.direction, trend.totalChange, periodLabel, digits, { estimated: true });
  return `<div class="stat-card">
    <p class="eyebrow">${escapeText(metric.label)} <small>${escapeText(unit)}</small></p>
    <div class="stat-row"><span>Mín</span><strong>${numberText(metric.min, digits)}</strong><span>${escapeText(stampText(metric.minAt))}</span></div>
    <div class="stat-row"><span>Máx</span><strong>${numberText(metric.max, digits)}</strong><span>${escapeText(stampText(metric.maxAt))}</span></div>
    <div class="stat-row"><span>Media</span><strong>${numberText(metric.avg, digits)}</strong><span>${metric.count} muestras</span></div>
    <p class="${trend.direction === 'insuficiente' ? 'hint' : 'coverage'}">${trend.direction === 'sube' ? '↑ ' : trend.direction === 'baja' ? '↓ ' : trend.direction === 'estable' ? '→ ' : ''}${escapeText(sentence)}</p>
  </div>`;
}

function demoDailyTable(daily, unit, digits) {
  if (!daily?.length) return '<p class="empty">Sin días completos en el periodo seleccionado.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Día</th><th>Muestras</th><th>Mín</th><th>Hora mín.</th><th>Máx</th><th>Hora máx.</th><th>Media</th></tr></thead>
    <tbody>${daily.map((day) => `<tr>
      <td>${escapeText(day.date)}</td><td>${day.count}</td>
      <td>${numberText(day.min, digits)} ${escapeText(unit)}</td><td>${escapeText(stampText(day.minAt))}</td>
      <td>${numberText(day.max, digits)} ${escapeText(unit)}</td><td>${escapeText(stampText(day.maxAt))}</td>
      <td>${numberText(day.avg, digits)} ${escapeText(unit)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// El análisis del periodo se parte en dos salidas porque ocupan lugares
// distintos en la pantalla: el resumen del periodo acompaña a la evolución, y
// todo lo que documenta cómo se ha calculado se pliega en Detalles.
export function renderDemoOverview(data) {
  const periodLabel = trendPeriodForHours(data.hours);
  return `
    <div class="stat-grid">
      ${demoMetricCard(data.metrics.temperature_c, '°C', 1, 'temperature_c', periodLabel)}
      ${demoMetricCard(data.metrics.humidity_pct, '%', 1, 'humidity_pct', periodLabel)}
      ${demoMetricCard({ ...data.metrics.pressure_pa, min: pressureMbar(data.metrics.pressure_pa.min), max: pressureMbar(data.metrics.pressure_pa.max), avg: pressureMbar(data.metrics.pressure_pa.avg), trend: data.metrics.pressure_pa.trend ? { ...data.metrics.pressure_pa.trend, slopePerHour: pressureMbar(data.metrics.pressure_pa.trend.slopePerHour), totalChange: pressureMbar(data.metrics.pressure_pa.trend.totalChange) } : null }, 'milibares', 1, 'pressure_pa', periodLabel)}
    </div>
    <p class="${data.period.complete ? 'hint' : 'warn-box'}">${escapeText(data.period.note)}</p>`;
}

export function renderDemoDetails(data) {
  const coverage = data.coverage;
  const coverageBlock = `<div class="fact-grid">
    <div><span>Recibidos</span><strong>${coverage.received}</strong></div>
    <div><span>Esperados</span><strong>${coverage.expected ?? '—'}</strong></div>
    <div><span>Datos recibidos</span><strong>${coverage.receivedPct != null ? `${numberText(coverage.receivedPct, 1)} %` : '—'}</strong></div>
    <div><span>Datos aceptados</span><strong>${coverage.validPct != null ? `${numberText(coverage.validPct, 1)} %` : '—'}</strong></div>
    <div><span>Aceptadas</span><strong>${coverage.valid} (${coverage.invalid} inválidas)</strong></div>
    <div><span>Faltantes por tiempo</span><strong>${coverage.timeMissing ?? '—'}</strong></div>
  </div>`;
  const dew = data.dewPoint;
  const dewBlock = `<p class="coverage">Punto de rocío: <strong>${numberText(dew.value, 1)} °C</strong> <span class="badge badge-muted">Calculado</span>${dew.count ? ` · mín ${numberText(dew.min, 1)} / máx ${numberText(dew.max, 1)} °C en el periodo` : ''}</p>
    <p class="hint">${escapeText(dew.method)} ${(dew.limitations || []).map(escapeText).join(' ')}</p>`;
  const comparison = data.aemet.comparison;
  const aemetBlock = comparison.matched
    ? `<div class="fact-grid">
        <div><span>Lecturas comparables (menos de ${comparison.windowMinutes} min)</span><strong>${comparison.matched}</strong></div>
        <div><span>Diferencia media</span><strong>${numberText(comparison.differences.avg, 2)} °C</strong></div>
        <div><span>Rango de diferencia</span><strong>${numberText(comparison.differences.min, 1)} … ${numberText(comparison.differences.max, 1)} °C</strong></div>
      </div><p class="hint">La diferencia es la medida de tu estación menos la de la oficial. Proveedor AEMET · estación ${escapeText(data.aemet.stationId || '—')} · última observación ${escapeText(stampText(data.aemet.lastObservedAt))}.</p>`
    : `<p class="empty">Sin lecturas de AEMET comparables en el periodo (${data.aemet.observations} observaciones disponibles).</p>`;
  return `
    ${coverageBlock}
    <h3>Resúmenes diarios · temperatura</h3>
    ${demoDailyTable(data.weekly.dailyTemperature, '°C', 1)}
    <h3>Punto de rocío <span class="badge badge-muted">Calculado</span></h3>
    ${dewBlock}
    <h3>Comparación histórica con AEMET <span class="badge badge-muted">Fuente externa</span></h3>
    ${aemetBlock}
    <p class="hint">${(data.limits || []).map(escapeText).join(' ')}</p>
    ${panelDocumentation()}`;
}
