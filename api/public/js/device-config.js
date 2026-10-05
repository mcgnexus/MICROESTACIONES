import { $, api, escapeText, dateText, numberText, canEdit } from './ui.js';

const STATE_LABELS = {
  solicitado: ['Solicitado', 'state-requested'],
  recibido: ['Recibido por la estación', 'state-received'],
  aplicado: ['Aplicado', 'state-applied'],
};

// Paso a paso: solicitado → recibido → aplicado.
// "Aplicado" solo aparece cuando la estación confirma la versión.
function stepper(timeline, state, appliedHint) {
  const steps = [
    ['solicitado', 'Solicitado', 'Guardada por el administrador'],
    ['recibido', 'Recibido', 'La estación la pidió al servidor'],
    ['aplicado', 'Aplicado', 'La estación declara tenerla aplicada'],
  ];
  return `<ol class="stepper">${steps.map(([key, label, hint]) => {
    const info = timeline?.[key] ?? { done: false, at: null };
    const done = info.done;
    const current = state === key;
    return `<li class="${done ? 'done' : ''} ${current ? 'current' : ''}">
      <span class="step-dot">${done ? '✓' : ''}</span>
      <strong>${label}</strong>
      <small>${hint}</small>
      ${info.at ? `<time>${dateText(info.at)}</time>` : ''}
    </li>`;
  }).join('')}</ol>
  ${state !== 'aplicado' && appliedHint
    ? '<p class="hint">La estación envió datos después de pedir esta versión: es un indicio, no una confirmación. '
      + 'Sigue pendiente hasta que el equipo declare la versión aplicada.</p>'
    : ''}`;
}

function firmwareBlock(firmware, deviceConfigVersion, lastContact) {
  return `<div class="remote-facts">
    <div><span>Versión de firmware</span><strong>${escapeText(firmware.reported || firmware.declared || 'sin registrar')}</strong>
      ${firmware.reported
        ? '<small>confirmada por el equipo</small>'
        : '<small>declarada en la ficha; el firmware actual no la transmite</small>'}</div>
    <div><span>Configuración en el equipo</span><strong>v${deviceConfigVersion}</strong>
      <small>${deviceConfigVersion ? 'última confirmada' : 'sin confirmar'}</small></div>
    <div><span>Último contacto</span><strong>${dateText(lastContact)}</strong><small>el equipo no está siempre conectado</small></div>
  </div>`;
}

function groupFields(group, rules, config, defaults, pendingKeys) {
  const keys = Object.entries(rules).filter(([, rule]) => rule.group === group.id);
  if (!keys.length) return '';
  const reserved = group.firmware === 'pending' || keys.every(([key]) => pendingKeys.includes(key));
  return `<fieldset class="config-group" data-group="${group.id}">
    <legend>${escapeText(group.label)}${reserved ? ' <span class="badge badge-muted">reservado</span>' : ''}</legend>
    <p class="hint">${escapeText(group.hint)}</p>
    <div class="form-grid">
      ${keys.map(([key, rule]) => {
        const saved = config[key];
        const factory = defaults[key];
        if (rule.kind === 'boolean') {
          return `<label class="check">${escapeText(rule.label)}
            <input type="checkbox" data-key="${key}" ${(saved ?? factory) ? 'checked' : ''} ${canEdit() ? '' : 'disabled'}></label>`;
        }
        const fallback = saved === undefined
          ? `placeholder="del equipo: ${factory} ${rule.unit}"`
          : '';
        return `<label>${escapeText(rule.label)} ${pendingKeys.includes(key) ? '<span class="badge badge-muted">reservado</span>' : ''}
          <input type="number" data-key="${key}" step="${rule.step ?? 1}" min="${rule.min}" max="${rule.max}"
            value="${saved ?? ''}" ${fallback} ${canEdit() ? '' : 'disabled'}>
          <small>permitido ${rule.min}–${rule.max} ${escapeText(rule.unit)}</small></label>`;
      }).join('')}
    </div>
  </fieldset>`;
}

function historyTable(history, currentVersion) {
  if (!history.length) return '<p class="empty">Sin versiones registradas.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Motivo</th><th>Estado</th><th>Cambios</th><th></th></tr></thead>
    <tbody>${history.map((entry) => {
      const [label, css] = STATE_LABELS[entry.state] ?? STATE_LABELS.solicitado;
      const changes = Object.entries(entry.changes || {});
      const confirmable = canEdit() && !entry.confirmedVersion && entry.version === currentVersion;
      return `<tr>
        <td>v${entry.version}${entry.version === currentVersion ? ' <span class="badge badge-valid">actual</span>' : ''}</td>
        <td>${dateText(entry.createdAt)}</td>
        <td>${escapeText(entry.changedByEmail || '—')}</td>
        <td>${escapeText(entry.changeReason || '—')}</td>
        <td><span class="badge ${css}">${label}</span>${entry.appliedHint ? '<br><small>con datos posteriores</small>' : ''}</td>
        <td>${changes.length
          ? `<ul class="diff">${changes.map(([key, change]) =>
            `<li><code>${escapeText(key)}</code>: ${escapeText(JSON.stringify(change.from))} → <strong>${escapeText(JSON.stringify(change.to))}</strong></li>`).join('')}</ul>`
          : '<span class="empty">sin cambios</span>'}</td>
        <td class="row-actions">${confirmable
          ? `<button type="button" data-confirm="${entry.version}">Confirmar aplicación</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// Pantalla "Control remoto del dispositivo".
export async function renderRemoteControl(root, stationId, station) {
  const data = await api(`/api/v1/stations/${encodeURIComponent(stationId)}/config`);
  const rules = data.allowedKeys || {};
  const groups = data.groups || [];
  const pending = data.pendingFirmwareKeys || [];
  const interval = data.effectiveConfig?.interval_normal_s;
  const sync = data.effectiveConfig?.sync_interval_s;

  root.innerHTML = `
    <div class="page-heading">
      <div>
        <p class="eyebrow"><a href="#/estaciones/${encodeURIComponent(stationId)}">← ${escapeText(station.name)}</a></p>
        <h1>Control remoto del dispositivo</h1>
        <p class="updated">Los cambios no son inmediatos: el equipo está dormido y solo los aplica cuando vuelve a
          despertar, como muy tarde en su próximo envío (cada ${escapeText(numberText(sync, 0))} s ahora mismo).</p>
      </div>
      <div class="station-tags"><span class="badge badge-muted">Config v${data.version}</span></div>
    </div>
    <p class="error" data-error role="alert"></p>
    ${firmwareBlock(data.firmware || {}, data.deviceConfigVersion ?? 0, data.lastContact)}
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">CICLO DEL CAMBIO</p><h2>Estado de la versión ${data.version}</h2></div></div>
      ${stepper(data.timeline, data.state, data.appliedHint)}
      ${canEdit() && data.state !== 'aplicado'
        ? `<div class="row-actions"><button type="button" data-confirm="${data.version}">Registrar que la estación la aplicó</button></div>`
        : '<p class="hint">La estación declaró esta versión aplicada. No hay acción pendiente.</p>'}
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PARÁMETROS</p><h2>Valores de la estación</h2></div>
        <p class="coverage">Medición cada ${escapeText(numberText(interval, 0))} s · envío cada ${escapeText(numberText(sync, 0))} s</p></div>
      ${data.warnings?.length
        ? `<div class="warn-box">${data.warnings.map((warning) =>
          `<p><strong>${escapeText(warning.key)}</strong>: ${escapeText(warning.message)}</p>`).join('')}</div>`
        : ''}
      <form data-config-form>
        ${groups.map((group) => groupFields(group, rules, data.config || {}, data.defaults || {}, pending)).join('')}
        <p class="hint">Un campo vacío deja la clave sin definir y el equipo vuelve a su valor de fábrica.
          Los límites son los que admite el firmware: si un valor no fuera aplicable, la estación descartaría la configuración entera.</p>
        <p class="error" data-form-error role="alert"></p>
        ${canEdit() ? '<button type="submit">Guardar nueva versión</button>'
          : '<p class="empty">Tu rol es de solo lectura: puedes consultar los valores pero no cambiarlos.</p>'}
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">HISTORIAL</p><h2>Quién cambió qué</h2></div></div>
      ${historyTable(data.history || [], data.version)}
    </section>
    <section class="panel">
      <p class="hint">No hay acciones inmediatas a propósito: el equipo no mantiene la conexión abierta, así que el
        servidor no puede despertarlo. En LoRa el mismo pendiente de configuración sirve igual.</p>
    </section>`;

  const error = (message) => { $('[data-error]', root).textContent = message || ''; };

  root.onclick = async (event) => {
    const button = event.target.closest('button[data-confirm]');
    if (!button) return;
    const version = button.dataset.confirm;
    const reason = window.prompt('Nota de la confirmación (opcional):', 'aplicada por el equipo') || undefined;
    try {
      await api(`/api/v1/stations/${encodeURIComponent(stationId)}/config/${version}/confirm`, {
        method: 'POST', body: JSON.stringify(reason ? { reason } : {}),
      });
      await renderRemoteControl(root, stationId, station);
    } catch (err) {
      error(`No se pudo confirmar: ${err.message}`);
    }
  };

  const form = $('[data-config-form]', root);
  if (form) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      $('[data-form-error]', root).textContent = '';
      const body = {};
      for (const input of form.querySelectorAll('[data-key]')) {
        const key = input.dataset.key;
        const rule = rules[key];
        if (!rule) continue;
        if (rule.kind === 'boolean') body[key] = input.checked;
        else body[key] = input.value === '' ? null : Number(input.value);
      }
      const reason = window.prompt('Motivo del cambio (queda en el historial):', 'ajuste desde control remoto') || undefined;
      try {
        const result = await api(`/api/v1/stations/${encodeURIComponent(stationId)}/config`, {
          method: 'PUT', body: JSON.stringify({ config: body, ...(reason ? { reason } : {}) }),
        });
        if (result.warnings?.length) {
          $('[data-form-error]', root).textContent = `Guardado como v${result.version}. Ojo: ${result.warnings.map((w) => w.message).join(' ')}`;
        }
        await renderRemoteControl(root, stationId, station);
      } catch (err) {
        $('[data-form-error]', root).textContent = `No se pudo guardar: ${err.message}`;
      }
    };
  }
}