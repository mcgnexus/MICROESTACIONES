import {
  $, api, escapeText, dateText, numberText, canEdit,
  METRIC_LABELS, COMPARATOR_LABELS, CHANNEL_LABELS, ALERT_LEVELS,
} from './ui.js';

const DELIVERY_LABELS = { pending: 'pendiente', sent: 'enviado', delivered: 'entregado', failed: 'fallido', bounced: 'rebotado' };

function alertRow(alert, editable) {
  const status = alert.closedAt
    ? `<span class="badge badge-muted">Cerrado ${dateText(alert.closedAt)}${alert.closureReason ? ` · ${escapeText(alert.closureReason)}` : ''}</span>`
    : '<span class="badge badge-warn">Abierto</span>';
  const ack = alert.acknowledgedAt
    ? `<span class="badge badge-valid">Reconocido ${dateText(alert.acknowledgedAt)}</span>`
    : '<span class="badge badge-invalid">Sin reconocer</span>';
  const ruleInfo = alert.ruleId
    ? `<span class="source-tag">Regla ${escapeText(METRIC_LABELS[alert.ruleSnapshot?.metric] || alert.ruleSnapshot?.metric || '')} ${escapeText(COMPARATOR_LABELS[alert.ruleSnapshot?.comparator] || '')} ${escapeText(alert.ruleSnapshot?.threshold ?? '')}</span>`
    : '';
  const actions = editable ? [
    !alert.acknowledgedAt && !alert.closedAt ? `<button type="button" data-ack="${escapeText(alert.id)}">Reconocer</button>` : '',
    !alert.closedAt ? `<button type="button" class="quiet" data-close="${escapeText(alert.id)}">Cerrar</button>` : '',
    alert.closedAt ? `<button type="button" class="quiet" data-reopen="${escapeText(alert.id)}">Reabrir</button>` : '',
  ].join(' ') : '';
  return `<tr>
    <td>${alert.level === 1 ? 'Prioritario' : 'Aviso'}</td>
    <td><strong>${escapeText(alert.message)}</strong>${ruleInfo ? `<br>${ruleInfo}` : ''}
      <div class="alert-detail">${dateText(alert.observedAt)} · recibido ${dateText(alert.createdAt)}</div></td>
    <td>${escapeText(alert.deviceName)}</td>
    <td>${escapeText(JSON.stringify(alert.value))}</td>
    <td>${escapeText(alert.source || '—')}</td>
    <td>${escapeText(alert.recipient || '—')}${alert.channel ? ` · ${escapeText(CHANNEL_LABELS[alert.channel] || alert.channel)}` : ''}
      ${alert.deliveryStatus ? `<br><span class="badge badge-muted">${escapeText(DELIVERY_LABELS[alert.deliveryStatus] || alert.deliveryStatus)}</span>` : ''}</td>
    <td>${status}<br>${ack}</td>
    <td class="row-actions">${actions}</td>
  </tr>`;
}

function ruleRow(rule, editable) {
  const actions = editable ? [
    `<button type="button" data-toggle-rule="${rule.id}" data-next="${rule.enabled ? 'false' : 'true'}">${rule.enabled ? 'Desactivar' : 'Activar'}</button>`,
    `<button type="button" class="danger" data-delete-rule="${rule.id}">Eliminar</button>`,
  ].join(' ') : '';
  return `<tr>
    <td>${escapeText(METRIC_LABELS[rule.metric] || rule.metric)}</td>
    <td>${escapeText(COMPARATOR_LABELS[rule.comparator] || rule.comparator)} ${numberText(rule.threshold)}</td>
    <td>${escapeText(ALERT_LEVELS[rule.level] || rule.level)}</td>
    <td>${escapeText(rule.message)}</td>
    <td>${escapeText(rule.recipient || '—')}</td>
    <td>${escapeText(CHANNEL_LABELS[rule.channel] || rule.channel)}</td>
    <td>${rule.enabled ? '<span class="badge badge-valid">Activa</span>' : '<span class="badge badge-muted">Inactiva</span>'}</td>
    <td class="row-actions">${actions}</td>
  </tr>`;
}

// Tableta de avisos + reglas para una estación concreta.
export async function renderStationAlertsTab(content, stationId) {
  const editable = canEdit();
  const [alerts, rules] = await Promise.all([
    api(`/api/v1/alerts?device_id=${encodeURIComponent(stationId)}&status=all&limit=100`),
    api(`/api/v1/alerts/rules?device_id=${encodeURIComponent(stationId)}`),
  ]);
  content.innerHTML = `<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACIÓN</p><h2>Historial de avisos</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nivel</th><th>Aviso</th><th>Estación</th><th>Dato</th><th>Fuente</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${alerts.alerts.map((alert) => alertRow(alert, editable)).join('') || '<tr><td colspan="8">Sin avisos registrados.</td></tr>'}</tbody>
    </table></div>
  </section>
  ${rulesSection(rules.rules || [], stationId, editable)}
  <p class="error" data-alert-error role="alert"></p>`;

  wireActions(content, stationId, () => renderStationAlertsTab(content, stationId));
}

function rulesSection(rules, stationId, editable) {
  return `<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">REGLAS</p><h2>Umbrales de aviso</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Métrica</th><th>Condición</th><th>Nivel</th><th>Mensaje</th><th>Destinatario</th><th>Canal</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rules.map((rule) => ruleRow(rule, editable)).join('') || '<tr><td colspan="8">Sin reglas definidas.</td></tr>'}</tbody>
    </table></div>
    ${editable ? `<form data-rule-form class="rule-form">
      <label>Métrica<select name="metric">${Object.entries(METRIC_LABELS).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
      <label>Condición<select name="comparator">${Object.entries(COMPARATOR_LABELS).map(([key, label]) => `<option value="${key}">${escapeText(label)}</option>`).join('')}</select></label>
      <label>Umbral<input type="number" step="any" name="threshold" required></label>
      <label>Nivel<select name="level"><option value="2">Aviso</option><option value="1">Prioritario</option></select></label>
      <label>Mensaje<input name="message" required maxlength="200"></label>
      <label>Destinatario<input name="recipient" maxlength="200" placeholder="correo o teléfono"></label>
      <label>Canal<select name="channel">${Object.entries(CHANNEL_LABELS).map(([key, label]) => `<option value="${key}" ${key === 'in_app' ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <button type="submit">Crear regla</button>
    </form>` : ''}
  </section>`;
}

function wireActions(content, stationId, reload) {
  content.onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.dataset.ack) {
        await api(`/api/v1/alerts/${button.dataset.ack}/acknowledge`, { method: 'POST', body: JSON.stringify({}) });
      } else if (button.dataset.close) {
        const reason = window.prompt('Motivo del cierre (opcional):', '') || undefined;
        await api(`/api/v1/alerts/${button.dataset.close}/close`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) });
      } else if (button.dataset.reopen) {
        await api(`/api/v1/alerts/${button.dataset.reopen}/reopen`, { method: 'POST', body: JSON.stringify({}) });
      } else if (button.dataset.toggleRule) {
        await api(`/api/v1/alerts/rules/${button.dataset.toggleRule}`, { method: 'PATCH', body: JSON.stringify({ enabled: button.dataset.next === 'true' }) });
      } else if (button.dataset.deleteRule) {
        if (!window.confirm('¿Eliminar esta regla de aviso?')) return;
        await api(`/api/v1/alerts/rules/${button.dataset.deleteRule}`, { method: 'DELETE' });
      } else {
        return;
      }
      await reload();
    } catch (err) {
      $('[data-alert-error]', content).textContent = `No se pudo completar la acción: ${err.message}`;
    }
  };

  const ruleForm = $('[data-rule-form]', content);
  if (ruleForm) {
    ruleForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(ruleForm);
      const body = {
        device_id: stationId,
        metric: form.get('metric'),
        comparator: form.get('comparator'),
        threshold: Number(form.get('threshold')),
        level: Number(form.get('level')),
        message: form.get('message'),
        channel: form.get('channel'),
      };
      if (form.get('recipient')) body.recipient = form.get('recipient');
      try {
        await api('/api/v1/alerts/rules', { method: 'POST', body: JSON.stringify(body) });
        await reload();
      } catch (err) {
        $('[data-alert-error]', content).textContent = `No se pudo crear la regla: ${err.message}`;
      }
    });
  }
}

// ---- Centro de avisos (todas las estaciones) --------------------------------
export async function renderAlertsCenter(root) {
  const editable = canEdit();
  root.innerHTML = `
    <div class="page-heading">
      <div><p class="eyebrow">AVISOS</p><h1>Centro de avisos</h1></div>
    </div>
    <section class="panel">
      <div class="table-filters">
        <label>Estado<select data-filter="status">
          <option value="open">Abiertos</option><option value="closed">Cerrados</option><option value="all">Todos</option></select></label>
        <label>Canal<select data-filter="channel">
          <option value="">Todos</option>${Object.entries(CHANNEL_LABELS).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
        <label>Estación<select data-filter="device"><option value="">Todas</option></select></label>
        <button type="button" data-action="apply">Aplicar</button>
      </div>
      <p class="error" data-alert-error role="alert"></p>
      <p class="coverage" data-counts></p>
      <div class="table-wrap"><table>
        <thead><tr><th>Nivel</th><th>Aviso</th><th>Estación</th><th>Dato</th><th>Fuente</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
        <tbody data-rows></tbody>
      </table></div>
    </section>
    <section class="panel" data-rules></section>`;

  const stations = (await api('/api/v1/stations')).stations;
  $('[data-filter="device"]', root).innerHTML = '<option value="">Todas</option>'
    + stations.map((station) => `<option value="${escapeText(station.id)}">${escapeText(station.name)}</option>`).join('');

  const load = async () => {
    $('[data-alert-error]', root).textContent = '';
    const params = new URLSearchParams({ status: $('[data-filter="status"]', root).value, limit: '200' });
    const channel = $('[data-filter="channel"]', root).value;
    const device = $('[data-filter="device"]', root).value;
    if (channel) params.set('channel', channel);
    if (device) params.set('device_id', device);
    try {
      const data = await api(`/api/v1/alerts?${params}`);
      $('[data-rows]', root).innerHTML = data.alerts.map((alert) => alertRow(alert, editable)).join('')
        || '<tr><td colspan="8">Sin avisos para estos filtros.</td></tr>';
      $('[data-counts]', root).textContent = `${data.counts.open} abiertos · ${data.counts.closed} cerrados`;
      $('[data-rules]', root).innerHTML = rulesSection(
        (await api('/api/v1/alerts/rules')).rules || [], device || stations[0]?.id, editable);
    } catch (error) {
      $('[data-alert-error]', root).textContent = `No se pudieron cargar los avisos: ${error.message}`;
    }
  };

  root.onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.action === 'apply') { await load(); return; }
    try {
      if (button.dataset.toggleRule) {
        await api(`/api/v1/alerts/rules/${button.dataset.toggleRule}`, { method: 'PATCH', body: JSON.stringify({ enabled: button.dataset.next === 'true' }) });
      } else if (button.dataset.deleteRule) {
        if (!window.confirm('¿Eliminar esta regla de aviso?')) return;
        await api(`/api/v1/alerts/rules/${button.dataset.deleteRule}`, { method: 'DELETE' });
      } else {
        const id = button.dataset.ack || button.dataset.close || button.dataset.reopen;
        if (!id) return;
        if (button.dataset.ack) await api(`/api/v1/alerts/${id}/acknowledge`, { method: 'POST', body: JSON.stringify({}) });
        if (button.dataset.close) {
          const reason = window.prompt('Motivo del cierre (opcional):', '') || undefined;
          await api(`/api/v1/alerts/${id}/close`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) });
        }
        if (button.dataset.reopen) await api(`/api/v1/alerts/${id}/reopen`, { method: 'POST', body: JSON.stringify({}) });
      }
      await load();
    } catch (error) {
      $('[data-alert-error]', root).textContent = `No se pudo completar la acción: ${error.message}`;
    }
  };

  $('[data-rules]', root).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const device = $('[data-filter="device"]', root).value || stations[0]?.id;
    if (!device) return;
    const body = {
      device_id: device,
      metric: form.get('metric'),
      comparator: form.get('comparator'),
      threshold: Number(form.get('threshold')),
      level: Number(form.get('level')),
      message: form.get('message'),
      channel: form.get('channel'),
    };
    if (form.get('recipient')) body.recipient = form.get('recipient');
    try {
      await api('/api/v1/alerts/rules', { method: 'POST', body: JSON.stringify(body) });
      await load();
    } catch (error) {
      $('[data-alert-error]', root).textContent = `No se pudo crear la regla: ${error.message}`;
    }
  });

  await load();
}