import {
  $, api, escapeText, dateText, roleLabel, planLabel, isAdmin,
} from './ui.js';
import { mountAdminStatistics } from './admin-statistics.js';

const ROLES = ['admin', 'operator', 'viewer'];
const PLANS = ['free', 'pro', 'enterprise'];

function subscriberRow(row) {
  return `<tr>
    <td>${escapeText(row.email)}<br><span class="badge badge-muted">${row.active ? 'activo' : 'desactivado'}</span></td>
    <td><select data-role="${row.id}">${ROLES.map((role) =>
      `<option value="${role}" ${row.role === role ? 'selected' : ''}>${roleLabel(role)}</option>`).join('')}</select></td>
    <td><select data-plan="${row.id}">${PLANS.map((plan) =>
      `<option value="${plan}" ${row.plan === plan ? 'selected' : ''}>${planLabel(plan)}</option>`).join('')}</select></td>
    <td><label class="check"><input type="checkbox" data-active="${row.id}" ${row.active ? 'checked' : ''}> activo</label></td>
    <td>${row.communicationConsent
      ? `<span class="badge badge-valid">consentido</span><br><small>${dateText(row.consentAt)}</small>`
      : '<span class="badge badge-invalid">sin consentimiento</span>'}</td>
    <td>${row.stationCount} · ${row.sessionCount} sesiones</td>
    <td class="row-actions">
      <button type="button" data-access="${row.id}" data-email="${escapeText(row.email)}">Accesos</button>
    </td>
  </tr>`;
}

function pilotRow(request) {
  const badge = request.status === 'approved' ? '<span class="badge badge-valid">Aprobada</span>'
    : request.status === 'rejected' ? '<span class="badge badge-invalid">Rechazada</span>'
      : '<span class="badge badge-warn">Pendiente</span>';
  const decision = request.status !== 'pending' ? `<br><small>${escapeText(request.decided_by || '')} ${dateText(request.decided_at)}${request.decision_notes ? ` · ${escapeText(request.decision_notes)}` : ''}</small>` : '';
  const actions = request.status === 'pending'
    ? `<button type="button" data-approve="${escapeText(request.subscriber_id)}/${escapeText(request.id)}">Aprobar</button>
       <button type="button" class="quiet" data-reject="${escapeText(request.subscriber_id)}/${escapeText(request.id)}">Rechazar</button>`
    : '';
  return `<tr>
    <td>${escapeText(request.farm_name)}<div class="alert-detail">${escapeText(request.location || '')}</div></td>
    <td>${escapeText(request.subscriber_email)}</td>
    <td>${escapeText(request.contact || '—')}</td>
    <td>${dateText(request.created_at)}${decision}</td>
    <td>${badge}</td>
    <td class="row-actions">${actions}</td>
  </tr>`;
}

export async function renderAdmin(root) {
  if (!isAdmin()) {
    root.innerHTML = '<section class="panel"><p class="empty">Esta sección es solo para administradores.</p></section>';
    return;
  }
  root.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">ADMINISTRACIÓN</p><h1>Usuarios, accesos y trazabilidad</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPTORES</p><h2>Roles, planes y consentimiento</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Usuario</th><th>Rol</th><th>Plan</th><th>Estado</th><th>Consentimiento</th><th>Acceso</th><th></th></tr></thead>
        <tbody data-subscribers></tbody>
      </table></div>
    </section>
    <section class="panel hidden" data-access-panel>
      <div class="section-heading"><div><p class="eyebrow">ACCESOS</p><h2 data-access-title>Estaciones autorizadas</h2></div>
        <button type="button" class="quiet" data-access-close>Cerrar</button></div>
      <div class="access-grid">
        <div><h3>Concedidas</h3><ul class="plain-list" data-granted></ul></div>
        <div><h3>Disponibles</h3><ul class="plain-list" data-available></ul></div>
      </div>
    </section>
    <section class="panel" data-statistics-panel>
      <p class="empty">Cargando análisis estadístico…</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PILOTOS EN FINCAS</p><h2>Solicitudes de acceso</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Finca</th><th>Solicitante</th><th>Contacto</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
        <tbody data-pilots></tbody>
      </table></div>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">AUDITORÍA</p><h2>Cambios sensibles</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Destino</th><th>IP</th><th>Detalle</th></tr></thead>
        <tbody data-audit></tbody>
      </table></div>
    </section>`;

  const error = (message) => { $('[data-error]', root).textContent = message; };

  async function loadAccess(subscriberId) {
    const panel = $('[data-access-panel]', root);
    panel.classList.remove('hidden');
    $('[data-access-title]', root).textContent = `Estaciones autorizadas · #${subscriberId}`;
    const data = await api(`/api/v1/admin/subscribers/${subscriberId}/access`);
    $('[data-granted]', root).innerHTML = data.granted.map((device) =>
      `<li>${escapeText(device.name)} <small>${escapeText(device.id)}</small>
        <button type="button" class="quiet" data-revoke="${escapeText(device.id)}" data-subscriber="${data.subscriber.id}">Quitar</button></li>`).join('')
      || '<li class="empty">Sin estaciones concedidas.</li>';
    $('[data-available]', root).innerHTML = data.available.map((device) =>
      `<li>${escapeText(device.name)} <small>${escapeText(device.id)}</small>
        <button type="button" data-grant="${escapeText(device.id)}" data-subscriber="${data.subscriber.id}">Conceder</button></li>`).join('')
      || '<li class="empty">No quedan estaciones disponibles.</li>';
  }

  async function load() {
    error('');
    try {
      const [{ subscribers }, { requests }, audit] = await Promise.all([
        api('/api/v1/admin/subscribers'),
        api('/api/v1/admin/pilot-requests'),
        api('/api/v1/admin/audit?limit=100'),
      ]);
      $('[data-subscribers]', root).innerHTML = subscribers.map(subscriberRow).join('');
      $('[data-pilots]', root).innerHTML = requests.map(pilotRow).join('')
        || '<tr><td colspan="6">Sin solicitudes de piloto.</td></tr>';
      $('[data-audit]', root).innerHTML = audit.entries.map((entry) => `<tr>
        <td>${dateText(entry.createdAt)}</td>
        <td>${escapeText(entry.actorEmail || '—')}</td>
        <td>${escapeText(entry.action)}</td>
        <td>${escapeText(entry.targetType || '')} ${escapeText(entry.targetId || '')}</td>
        <td>${escapeText(entry.ipAddress || '—')}</td>
        <td><details><summary>Ver</summary><pre>${escapeText(JSON.stringify({ antes: entry.beforeJson, después: entry.afterJson }, null, 2))}</pre></details></td>
      </tr>`).join('') || '<tr><td colspan="6">Sin registros de auditoría.</td></tr>';
    } catch (error_) {
      error(`No se pudo cargar la administración: ${error_.message}`);
    }
  }

  const patchSubscriber = async (id, body) => {
    try {
      await api(`/api/v1/admin/subscribers/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
    } catch (error_) {
      error(`No se pudo actualizar el usuario: ${error_.message}`);
      await load();
    }
  };

  root.onchange = async (event) => {
    const el = event.target;
    if (el.dataset.role) await patchSubscriber(el.dataset.role, { role: el.value });
    else if (el.dataset.plan) await patchSubscriber(el.dataset.plan, { plan: el.value });
    else if (el.dataset.active) await patchSubscriber(el.dataset.active, { active: el.checked });
  };

  root.onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.dataset.access) await loadAccess(button.dataset.access);
      else if (button.dataset.accessClose !== undefined) $('[data-access-panel]', root).classList.add('hidden');
      else if (button.dataset.grant) {
        await api(`/api/v1/admin/subscribers/${button.dataset.subscriber}/access`, { method: 'POST', body: JSON.stringify({ device_id: button.dataset.grant }) });
        await loadAccess(button.dataset.subscriber);
      } else if (button.dataset.revoke) {
        await api(`/api/v1/admin/subscribers/${button.dataset.subscriber}/access/${encodeURIComponent(button.dataset.revoke)}`, { method: 'DELETE' });
        await loadAccess(button.dataset.subscriber);
      } else if (button.dataset.approve || button.dataset.reject) {
        const [subscriberId, requestId] = (button.dataset.approve || button.dataset.reject).split('/');
        const status = button.dataset.approve ? 'approved' : 'rejected';
        const notes = window.prompt('Notas de la decisión (opcional):', '') || undefined;
        await api(`/api/v1/admin/pilot-requests/${subscriberId}/${encodeURIComponent(requestId)}`, {
          method: 'PATCH', body: JSON.stringify({ status, ...(notes ? { decision_notes: notes } : {}) }),
        });
        await load();
      }
    } catch (error_) {
      error(`No se pudo completar la acción: ${error_.message}`);
    }
  }

  await load();
  await mountAdminStatistics($('[data-statistics-panel]', root));
}