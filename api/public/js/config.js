import { $, api, escapeText, dateText, numberText, canEdit } from './ui.js';

const STATE_LABELS = {
  solicitado: ['Solicitado', 'state-requested'],
  recibido: ['Recibido', 'state-received'],
  aplicado: ['Aplicado', 'state-applied'],
};

const KEYS_SUMMARY = [
  ['interval_normal_s', 'Medir cada', 's'],
  ['sync_interval_s', 'Enviar cada', 's'],
  ['battery_low_mv', 'Batería baja', 'mV'],
  ['battery_critical_mv', 'Batería crítica', 'mV'],
];

// Pestaña resumen: estado del ciclo, valores efectivos y enlace a la pantalla completa.
export async function renderConfigTab(content, stationId) {
  const data = await api(`/api/v1/stations/${encodeURIComponent(stationId)}/config`);
  const [label, css] = STATE_LABELS[data.state] ?? STATE_LABELS.solicitado;
  const effective = data.effectiveConfig || {};
  const latestChanges = data.history?.[0]?.changes || {};
  const changes = Object.entries(latestChanges);

  content.innerHTML = `<section class="panel">
    <div class="section-heading">
      <div><p class="eyebrow">CONFIGURACIÓN DEL EQUIPO</p><h2>Versión ${data.version} · <span class="badge ${css}">${label}</span></h2></div>
      <a class="button-link" href="#/estaciones/${encodeURIComponent(stationId)}/remoto">Control remoto del dispositivo</a>
    </div>
    ${data.timeline ? `<ol class="stepper compact">
      ${['solicitado', 'recibido', 'aplicado'].map((key) => {
        const info = data.timeline[key] ?? { done: false, at: null };
        const [stepLabel] = STATE_LABELS[key];
        return `<li class="${info.done ? 'done' : ''} ${data.state === key ? 'current' : ''}">
          <span class="step-dot">${info.done ? '✓' : ''}</span>
          <strong>${stepLabel}</strong>
          ${info.at ? `<time>${dateText(info.at)}</time>` : ''}
        </li>`;
      }).join('')}
    </ol>` : ''}
    <p class="coverage">Firmware ${escapeText(data.firmware?.reported || data.firmware?.declared || 'sin registrar')} ·
      equipo en v${data.deviceConfigVersion ?? 0} · último contacto ${dateText(data.lastContact)}</p>
    ${data.warnings?.length
      ? `<div class="warn-box">${data.warnings.map((warning) =>
        `<p><strong>${escapeText(warning.key)}</strong>: ${escapeText(warning.message)}</p>`).join('')}</div>`
      : ''}
    <div class="fact-grid">
      ${KEYS_SUMMARY.map(([key, text, unit]) => `<div><span>${escapeText(text)}</span>
        <strong>${numberText(effective[key], 0)} ${unit}</strong></div>`).join('')}
    </div>
    ${changes.length ? `<h3>Cambios de la v${data.version}</h3><ul class="diff">${changes.map(([key, change]) =>
      `<li><code>${escapeText(key)}</code>: ${escapeText(JSON.stringify(change.from))} → <strong>${escapeText(JSON.stringify(change.to))}</strong></li>`).join('')}</ul>` : ''}
    ${canEdit() && data.state !== 'aplicado'
      ? `<div class="row-actions"><button type="button" data-confirm="${data.version}">Confirmar aplicación</button>
         <a class="button-link" href="#/estaciones/${encodeURIComponent(stationId)}/remoto">Cambiar parámetros</a></div>`
      : ''}
  </section>
  <section class="panel">
    <div class="section-heading"><div><p class="eyebrow">HISTORIAL</p><h2>Versiones aplicadas</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Motivo</th><th>Estado</th><th>Confirmación</th><th>Cambios</th><th></th></tr></thead>
      <tbody>${(data.history || []).map((entry) => {
        const [entryLabel, entryCss] = STATE_LABELS[entry.state] ?? STATE_LABELS.solicitado;
        const entryChanges = Object.entries(entry.changes || {});
        return `<tr>
          <td>v${entry.version}${entry.version === data.version ? ' <span class="badge badge-valid">actual</span>' : ''}</td>
          <td>${dateText(entry.createdAt)}</td>
          <td>${escapeText(entry.changedByEmail || '—')}</td>
          <td>${escapeText(entry.changeReason || '—')}</td>
          <td><span class="badge ${entryCss}">${entryLabel}</span>${entry.appliedHint ? '<br><small>con datos posteriores</small>' : ''}</td>
          <td>${entry.confirmedVersion ? `confirmada ${dateText(entry.appliedAt)}` : 'sin confirmar'}</td>
          <td>${entryChanges.length ? `<ul class="diff">${entryChanges.map(([key, change]) =>
            `<li><code>${escapeText(key)}</code>: ${escapeText(JSON.stringify(change.from))} → <strong>${escapeText(JSON.stringify(change.to))}</strong></li>`).join('')}</ul>`
            : '<span class="empty">sin cambios</span>'}</td>
          <td class="row-actions">${canEdit() && !entry.confirmedVersion && entry.version === data.version
            ? `<button type="button" data-confirm="${entry.version}">Confirmar</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8">Sin versiones registradas.</td></tr>'}</tbody>
    </table></div>
  </section>`;

  content.onclick = async (event) => {
    const button = event.target.closest('button[data-confirm]');
    if (!button) return;
    try {
      await api(`/api/v1/stations/${encodeURIComponent(stationId)}/config/${button.dataset.confirm}/confirm`, {
        method: 'POST', body: JSON.stringify({}),
      });
      await renderConfigTab(content, stationId);
    } catch (error) {
      const target = $('[data-error]', content);
      if (target) target.textContent = `No se pudo confirmar: ${error.message}`;
    }
  };
}