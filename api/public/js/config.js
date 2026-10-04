import { $, api, escapeText, dateText, canEdit } from './ui.js';

// Panel de configuración versionada: edición contra el contrato del firmware,
// historial con diff y confirmación de la versión que el equipo dice aplicar.
export async function renderConfigTab(content, stationId) {
  const data = await api(`/api/v1/stations/${encodeURIComponent(stationId)}/config`);
  const allowed = data.allowedKeys || {};
  const current = data.config || {};

  const inputFor = (key, rule) => {
    const value = current[key];
    const name = `cfg_${key}`;
    if (rule.kind === 'boolean') {
      return `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''} ${canEdit() ? '' : 'disabled'}> ${escapeText(rule.label)}</label>`;
    }
    const step = rule.kind === 'integer' ? 1 : 'any';
    return `<label>${escapeText(rule.label)}
      <input type="number" name="${name}" step="${step}" min="${rule.min}" max="${rule.max}"
        value="${value ?? ''}" ${canEdit() ? '' : 'disabled'} data-key="${key}"></label>`;
  };

  const diffHtml = (changes) => {
    const entries = Object.entries(changes || {});
    if (!entries.length) return '<p class="empty">Sin cambios respecto a la versión anterior.</p>';
    return `<ul class="diff">${entries.map(([key, change]) =>
      `<li><code>${escapeText(key)}</code>: ${escapeText(JSON.stringify(change.from))} → <strong>${escapeText(JSON.stringify(change.to))}</strong></li>`).join('')}</ul>`;
  };

  const historyRows = (data.history || []).map((entry) => `<tr>
    <td>v${entry.version}${entry.version === data.version ? ' <span class="badge badge-valid">actual</span>' : ''}</td>
    <td>${dateText(entry.createdAt)}</td>
    <td>${escapeText(entry.changedByEmail || '—')}</td>
    <td>${escapeText(entry.changeReason || '—')}</td>
    <td>${entry.requestedVersion ? `solicitada v${entry.requestedVersion}` : 'no solicitada'}</td>
    <td>${entry.confirmedVersion ? `confirmada v${entry.confirmedVersion}` : 'sin confirmar'}</td>
    <td>${diffHtml(entry.changes)}</td>
    <td>${canEdit() && !entry.confirmedVersion && entry.version <= (data.version ?? 0)
      ? `<button type="button" data-confirm="${entry.version}">Confirmar</button>` : ''}</td>
  </tr>`).join('');

  content.innerHTML = `<section class="panel">
    <div class="section-heading">
      <div><p class="eyebrow">CONFIGURACIÓN DEL EQUIPO</p><h2>Versión ${data.version}</h2></div>
      <p class="coverage">Actualizada ${dateText(data.updatedAt)}${data.requestedVersion ? ` · el equipo pidió la v${data.requestedVersion}` : ''}</p>
    </div>
    <p class="hint">Las claves son las que reconoce el firmware. Cambios guardados generan una versión nueva;
      el equipo la solicitará en su próximo envío y hay que confirmar cuando la aplique.</p>
    <form data-config-form class="station-form">
      <div class="form-grid">${Object.entries(allowed).map(([key, rule]) => inputFor(key, rule)).join('')}</div>
      <p class="error" data-config-error role="alert"></p>
      ${canEdit() ? '<button type="submit">Guardar nueva versión</button>' : '<p class="empty">Tu rol es de solo lectura.</p>'}
    </form>
  </section>
  <section class="panel">
    <div class="section-heading"><div><p class="eyebrow">HISTORIAL</p><h2>Versiones aplicadas</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Motivo</th><th>Equipo</th><th>Confirmación</th><th>Cambios</th><th></th></tr></thead>
      <tbody>${historyRows || '<tr><td colspan="8">Sin versiones registradas.</td></tr>'}</tbody>
    </table></div>
  </section>`;

  const form = $('[data-config-form]', content);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('[data-config-error]', content).textContent = '';
    const config = {};
    for (const [key, rule] of Object.entries(allowed)) {
      const field = rule.kind === 'boolean'
        ? form.elements[`cfg_${key}`]
        : form.querySelector(`[data-key="${key}"]`);
      const value = rule.kind === 'boolean' ? field.checked
        : field.value === '' ? null : Number(field.value);
      if (value !== null && value !== '') config[key] = value;
    }
    const reason = window.prompt('Motivo del cambio (para el historial):', 'ajuste desde el panel') || undefined;
    try {
      await api(`/api/v1/stations/${encodeURIComponent(stationId)}/config`, {
        method: 'PUT', body: JSON.stringify({ config, ...(reason ? { reason } : {}) }),
      });
      await renderConfigTab(content, stationId);
    } catch (error) {
      $('[data-config-error]', content).textContent = `No se pudo guardar la configuración: ${error.message}`;
    }
  });

  content.onclick = async (event) => {
    const button = event.target.closest('button[data-confirm]');
    if (!button) return;
    const version = button.dataset.confirm;
    try {
      await api(`/api/v1/stations/${encodeURIComponent(stationId)}/config/${version}/confirm`, { method: 'POST', body: JSON.stringify({}) });
      await renderConfigTab(content, stationId);
    } catch (error) {
      $('[data-config-error]', content).textContent = `No se pudo confirmar: ${error.message}`;
    }
  });
}