import {
  $, api, escapeText, dateText, numberText, validationBadge, canEdit, openDialog,
  localIsoDate, periodRange,
} from './ui.js';

// Tabla de mediciones reutilizable: filtros por rango, estación y validación,
// con trazo completo (hora observada vs. recepción), insignias de estado y
// acciones de revisión manual sin perder la fila original.
export function mountMeasurements(root, { stations = [], fixedStation = null } = {}) {
  const editable = canEdit();
  const deviceOptions = stations.length
    ? stations.map((s) => `<option value="${escapeText(s.id)}">${escapeText(s.name)}</option>`).join('')
    : '<option value="">Sin estaciones</option>';

  root.innerHTML = `
    <div class="section-heading"><div><p class="eyebrow">REGISTROS</p><h2>Tabla de mediciones</h2></div></div>
    <div class="table-filters">
      <label>Ver por<select data-filter="period">
        <option value="day">Día</option><option value="week">Semana</option>
        <option value="month" selected>Mes</option><option value="year">Año</option>
        <option value="custom">Rango libre</option></select></label>
      <label data-date-label>Fecha de referencia<input data-filter="date" type="date"></label>
      <label class="custom-range hidden" data-from-label>Desde<input data-filter="from" type="date"></label>
      <label class="custom-range hidden" data-to-label>Hasta<input data-filter="to" type="date"></label>
      ${fixedStation ? '' : `<label>Estación<select data-filter="device"><option value="">Todas</option>${deviceOptions}</select></label>`}
      <label>Validación<select data-filter="validated">
        <option value="">Todas</option><option value="valid">Solo válidas</option><option value="invalid">Solo inválidas</option>
      </select></label>
      <button type="button" data-action="apply">Aplicar</button>
    </div>
    <div class="measurements-toolbar">
      <button type="button" data-action="csv">Exportar CSV</button>
    </div>
    <p class="error" data-error role="alert"></p>
    <p class="coverage" data-summary></p>
    <div class="table-wrap">
      <table class="measurements-table">
        <thead><tr>
          <th>Observado</th><th>Recibido</th><th>Sec.</th><th>Temp.</th><th>Humedad</th><th>Presión</th>
          <th>Batería</th><th>Lux</th><th>Origen</th><th>Estado</th><th>Alerta</th><th></th>
        </tr></thead>
        <tbody data-rows></tbody>
      </table>
    </div>
    <div class="table-pagination hidden" data-pagination aria-label="Paginación de mediciones">
      <button type="button" class="quiet" data-action="previous">Anterior</button>
      <span data-page-status></span>
      <button type="button" class="quiet" data-action="next">Siguiente</button>
    </div>`;

  const state = { rows: [], total: 0, valid: 0, invalid: 0, page: 0, pageSize: 10, gaps: null };

  const today = new Date();
  $('[data-filter="date"]', root).value = localIsoDate(today);
  $('[data-filter="from"]', root).value = localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  $('[data-filter="to"]', root).value = localIsoDate(today);

  const syncFilterVisibility = () => {
    const custom = $('[data-filter="period"]', root).value === 'custom';
    root.querySelectorAll('.custom-range').forEach((el) => el.classList.toggle('hidden', !custom));
    $('[data-date-label]', root).classList.toggle('hidden', custom);
  };

  function currentRange() {
    if ($('[data-filter="period"]', root).value === 'custom') {
      const from = $('[data-filter="from"]', root).value ? new Date(`${$('[data-filter="from"]', root).value}T00:00:00`) : new Date(0);
      const to = $('[data-filter="to"]', root).value ? new Date(`${$('[data-filter="to"]', root).value}T00:00:00`) : new Date();
      if ($('[data-filter="to"]', root).value) to.setDate(to.getDate() + 1);
      return { from, to };
    }
    return periodRange($('[data-filter="period"]', root).value, $('[data-filter="date"]', root).value);
  }

  function currentParams({ forCsv = false } = {}) {
    const { from, to } = currentRange();
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    const device = fixedStation || $('[data-filter="device"]', root)?.value || '';
    if (device) params.set('device_id', device);
    const validated = $('[data-filter="validated"]', root).value;
    if (validated) params.set('validated', validated);
    if (!forCsv) params.set('limit', String(state.pageSize));
    return { params, from, to };
  }

  function cell(value, unit, digits) {
    return value == null ? '—' : `${numberText(value, digits ?? 1)} ${unit}`;
  }

  function renderRow(row) {
    const alert = row.alertLevel === 1 ? 'Prioritaria' : row.alertLevel === 2 ? 'Aviso' : '—';
    const actions = [
      `<button type="button" class="quiet" data-detail="${escapeText(row.id)}">Detalle</button>`,
      editable && !row.deletedAt && !row.isValidated
        ? `<button type="button" data-validate="${escapeText(row.id)}" data-next="true">Validar</button>` : '',
      editable && !row.deletedAt && row.isValidated
        ? `<button type="button" class="quiet" data-validate="${escapeText(row.id)}" data-next="false">Invalidar</button>` : '',
      editable && !row.deletedAt
        ? `<button type="button" class="danger" data-delete="${escapeText(row.id)}">Borrar</button>` : '',
    ].join(' ');
    return `<tr class="${row.deletedAt ? 'row-deleted' : row.isValidated ? '' : 'row-invalid'}">
      <td>${dateText(row.observedAt)}</td>
      <td>${dateText(row.receivedAt)}</td>
      <td>${escapeText(row.sequence)}</td>
      <td>${cell(row.temperatureC, '°C')}</td>
      <td>${cell(row.humidityPct, '%')}</td>
      <td>${cell(row.pressurePa, 'Pa', 0)}</td>
      <td>${cell(row.batteryMv, 'mV', 0)}</td>
      <td>${cell(row.lux, '', 0)}</td>
      <td>${escapeText(row.source || '—')}</td>
      <td>${validationBadge(row)}</td>
      <td>${alert}</td>
      <td class="row-actions">${actions}</td>
    </tr>`;
  }

  async function loadGaps(from, to) {
    state.gaps = null;
    if (!fixedStation) return;
    try {
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      state.gaps = await api(`/api/v1/stations/${encodeURIComponent(fixedStation)}/measurements/gaps?${params}`);
    } catch { state.gaps = null; }
  }

  async function load({ resetPage = false } = {}) {
    $('[data-error]', root).textContent = '';
    if (resetPage) state.page = 0;
    const { params, from, to } = currentParams();
    params.set('offset', String(state.page * state.pageSize));
    try {
      const data = await api(`/api/v1/measurements?${params}`);
      state.total = data.total;
      state.valid = data.valid;
      state.invalid = data.invalid;
      state.rows = data.measurements;
      if (state.rows.length === 0 && state.total > 0 && state.page > 0) {
        state.page = Math.min(state.page - 1, Math.ceil(state.total / state.pageSize) - 1);
        return load();
      }
      $('[data-rows]', root).innerHTML = state.rows.map(renderRow).join('')
        || '<tr><td colspan="12">No hay mediciones en este periodo.</td></tr>';
      if (resetPage || state.gaps === null) await loadGaps(from, to);
      const gapsInfo = state.gaps
        ? ` · huecos de secuencia: ${state.gaps.gaps.length} (${state.gaps.missing} muestras sin recibir, cobertura ${state.gaps.coveragePct ?? '—'} %)`
        : '';
      const first = state.total ? state.page * state.pageSize + 1 : 0;
      const last = Math.min((state.page + 1) * state.pageSize, state.total);
      $('[data-summary]', root).textContent =
        `Mostrando ${first}–${last} de ${state.total} mediciones · ${state.valid} válidas · ${state.invalid} inválidas`
        + ` · ${from.toLocaleDateString('es-ES')} → ${new Date(to.getTime() - 1).toLocaleDateString('es-ES')}${gapsInfo}`;
      const pageCount = Math.ceil(state.total / state.pageSize);
      $('[data-pagination]', root).classList.toggle('hidden', pageCount <= 1);
      $('[data-page-status]', root).textContent = `Página ${state.page + 1} de ${pageCount}`;
      $('[data-action="previous"]', root).disabled = state.page === 0;
      $('[data-action="next"]', root).disabled = state.page + 1 >= pageCount;
    } catch (error) {
      $('[data-error]', root).textContent = `No se pudo cargar la tabla: ${error.message}`;
    }
  }

  async function exportCsv() {
    $('[data-error]', root).textContent = '';
    const { params, from } = currentParams({ forCsv: true });
    try {
      const response = await fetch(`/api/v1/measurements.csv?${params}`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `tecrural-mediciones-${localIsoDate(from)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      $('[data-error]', root).textContent = `No se pudo exportar: ${error.message}`;
    }
  }

  async function showDetail(id) {
    try {
      const { measurement: row } = await api(`/api/v1/measurements/${id}`);
      const flags = [
        row.temperatureC == null ? 'temperatura: sin valor validado' : null,
        row.invalidatedReason ? `motivo: ${row.invalidatedReason}` : null,
        row.validatedByEmail ? `revisado por ${row.validatedByEmail} ${dateText(row.validatedAt)}` : null,
      ].filter(Boolean);
      const body = `<dl class="detail-grid">
        <dt>Estación</dt><dd>${escapeText(row.deviceName)} (${escapeText(row.deviceId)})</dd>
        <dt>Secuencia</dt><dd>${escapeText(row.sequence)}</dd>
        <dt>Hora observada</dt><dd>${dateText(row.observedAt)} · calidad ${escapeText(row.timeQuality)}</dd>
        <dt>Hora de recepción</dt><dd>${dateText(row.receivedAt)}</dd>
        <dt>Estado</dt><dd>${validationBadge(row)} ${flags.map(escapeText).join(' · ')}</dd>
        <dt>Valores</dt><dd>${numberText(row.temperatureC)} °C · ${numberText(row.humidityPct)} % · ${numberText(row.pressurePa, 0)} Pa · ${numberText(row.batteryMv, 0)} mV · ${numberText(row.lux, 0)} lux</dd>
        <dt>Origen / flags</dt><dd>${escapeText(row.source || '—')} · ${escapeText(row.flags)} · validación ${escapeText(row.validationFlags)}</dd>
        <dt>Valor recibido (raw)</dt><dd><code>${escapeText(row.rawPayload ? JSON.stringify(row.rawPayload) : '—')}</code></dd>
      </dl>`;
      const actions = editable && !row.deletedAt
        ? `<button type="button" data-dialog-validate="${escapeText(row.id)}" data-next="${!row.isValidated}">${row.isValidated ? 'Marcar inválida' : 'Marcar válida'}</button>
           <button type="button" class="danger" data-dialog-delete="${escapeText(row.id)}">Borrar medición</button>`
        : '';
      openDialog(`Medición #${row.sequence}`, body, actions);
    } catch (error) {
      $('[data-error]', root).textContent = `No se pudo abrir la medición: ${error.message}`;
    }
  }

  async function validate(id, next) {
    const reason = next ? undefined : (window.prompt('Motivo de la invalidación (opcional):') || undefined);
    try {
      await api(`/api/v1/measurements/${id}/validate`, { method: 'PATCH', body: JSON.stringify({ is_validated: next, ...(reason ? { reason } : {}) }) });
      await load();
    } catch (error) {
      $('[data-error]', root).textContent = `No se pudo revisar: ${error.message}`;
    }
  }

  async function remove(id) {
    if (!window.confirm('¿Borrar esta medición? La fila se conserva con su trazo de borrado.')) return;
    try {
      await api(`/api/v1/measurements/${id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      $('[data-error]', root).textContent = `No se pudo borrar: ${error.message}`;
    }
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.action === 'apply') load({ resetPage: true });
    else if (button.dataset.action === 'csv') exportCsv();
    else if (button.dataset.action === 'previous' && state.page > 0) { state.page -= 1; load(); }
    else if (button.dataset.action === 'next' && (state.page + 1) * state.pageSize < state.total) { state.page += 1; load(); }
    else if (button.dataset.detail) showDetail(button.dataset.detail);
    else if (button.dataset.validate) validate(button.dataset.validate, button.dataset.next === 'true');
    else if (button.dataset.delete) remove(button.dataset.delete);
  });

  // Acciones dentro del diálogo de detalle (onclick: sustituye al montaje anterior).
  $('#detail-dialog').onclick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.dialogValidate) {
      $('#detail-dialog').close();
      validate(button.dataset.dialogValidate, button.dataset.next === 'true');
    } else if (button.dataset.dialogDelete) {
      $('#detail-dialog').close();
      remove(button.dataset.dialogDelete);
    }
  };

  root.querySelectorAll('[data-filter="period"]').forEach((el) =>
    el.addEventListener('change', () => { syncFilterVisibility(); load({ resetPage: true }); }));

  syncFilterVisibility();
  load();
  return { reload: load };
}
