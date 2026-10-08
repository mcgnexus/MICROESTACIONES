import {
  $, api, escapeText, dateText, roleLabel, planLabel, isAdmin,
} from './ui.js';
import { mountAdminStatistics } from './admin-statistics.js';
import { mountProspects } from './prospects.js';
import { mountAdminAnalytics } from './admin-analytics.js';

const ROLES = ['admin', 'operator', 'viewer'];
const PLANS = ['free', 'pro', 'enterprise'];
const LEAD_STATUSES = ['nuevo', 'contactado', 'interesado', 'piloto_activo', 'cliente', 'descartado'];
const LEAD_STATUS_LABELS = {
  nuevo: 'Nuevo', contactado: 'Contactado', interesado: 'Interesado',
  piloto_activo: 'Piloto activo', cliente: 'Cliente', descartado: 'Descartado',
};
const ACTIVITY_LABELS = { agricultura: 'Agricultura', ganaderia: 'Ganadería', mixta: 'Agricultura y ganadería', otra: 'Otra' };
const CONSENT_CHANNELS = ['email', 'whatsapp'];
const CHANNEL_LABELS = { email: 'Correo', whatsapp: 'WhatsApp' };

function advertisingBadges(commercial) {
  const active = CONSENT_CHANNELS.filter((channel) => commercial?.[channel] === true);
  return active.length
    ? active.map((channel) => `<span class="badge badge-valid">${CHANNEL_LABELS[channel]}</span>`).join(' ')
    : '<span class="badge badge-invalid">sin publicidad</span>';
}

function consentButtons(scope, id, commercial) {
  return CONSENT_CHANNELS.map((channel) => {
    const granted = commercial?.[channel] === true;
    return `<button type="button" class="quiet" data-consent-scope="${scope}" data-consent-id="${id}"
      data-consent-channel="${channel}" data-consent-action="${granted ? 'revoked' : 'granted'}">
      ${granted ? 'Quitar' : 'Dar'} ${CHANNEL_LABELS[channel]}</button>`;
  }).join(' ');
}
const INTEREST_LABELS = {
  heladas: 'Heladas', calor: 'Golpes de calor', tormentas: 'Tormentas',
  viento: 'Viento', humedad: 'Humedad', general: 'Información general',
  futura_instalacion: 'Futura instalación',
};

function subscriberRow(row) {
  const profile = row.profile
    ? [row.profile.activity && (ACTIVITY_LABELS[row.profile.activity] || row.profile.activity),
        row.profile.municipality, row.profile.cropOrLivestock].filter(Boolean).join(' · ')
    : '';
  return `<tr>
    <td>${escapeText(row.email)}<br>
      <span class="badge badge-muted">registrado</span>
      ${row.verified
        ? '<span class="badge badge-valid">verificado</span>'
        : '<span class="badge badge-warn">sin verificar</span>'}
      ${row.active ? '' : '<span class="badge badge-invalid">desactivado</span>'}
      ${profile ? `<div class="alert-detail">${escapeText(profile)}</div>` : ''}</td>
    <td><select data-role="${row.id}">${ROLES.map((role) =>
      `<option value="${role}" ${row.role === role ? 'selected' : ''}>${roleLabel(role)}</option>`).join('')}</select></td>
    <td><select data-plan="${row.id}">${PLANS.map((plan) =>
      `<option value="${plan}" ${row.plan === plan ? 'selected' : ''}>${planLabel(plan)}</option>`).join('')}</select></td>
    <td><label class="check"><input type="checkbox" data-active="${row.id}" ${row.active ? 'checked' : ''}> activo</label></td>
    <td>${advertisingBadges(row.commercial)}<div class="row-actions">${consentButtons('subscriber', row.id, row.commercial)}</div></td>
    <td>${row.stationCount} · ${row.sessionCount} sesiones</td>
    <td class="row-actions">
      <button type="button" data-access="${row.id}" data-email="${escapeText(row.email)}">Accesos</button>
      <button type="button" class="quiet" data-test="${row.id}">Probar aviso</button>
    </td>
  </tr>`;
}

function manualRow(row) {
  const digits = String(row.address || '').replace(/[^\d]/g, '');
  const text = row.body || row.subject || '';
  const expired = row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now();
  const link = digits && !expired ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : '';
  return `<tr>
    <td>${dateText(row.createdAt)}${row.expiresAt ? `<div class="alert-detail">${expired ? 'Caducado' : `Caduca ${dateText(row.expiresAt)}`}</div>` : ''}</td>
    <td>${escapeText(row.address)}</td>
    <td><details><summary>Ver mensaje</summary><pre>${escapeText(text)}</pre></details></td>
    <td class="row-actions">
      ${link ? `<a class="button-link" href="${escapeText(link)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>` : ''}
      ${expired ? '<span class="badge badge-invalid">No enviar</span>' : `<button type="button" data-outbox-sent="${escapeText(row.id)}">Marcar enviado</button>`}
    </td>
  </tr>`;
}

function leadRow(lead) {
  const contact = [lead.phone, lead.email].filter(Boolean).join(' · ');
  const detail = [
    ACTIVITY_LABELS[lead.activity] || lead.activity,
    lead.cropOrLivestock,
    INTEREST_LABELS[lead.interest] || lead.interest,
  ].filter(Boolean).join(' · ');
  const campaign = lead.campaign?.source || lead.campaign?.campaign
    ? `<div class="alert-detail">captación: ${escapeText([lead.campaign.source, lead.campaign.campaign].filter(Boolean).join(' · '))}</div>`
    : '';
  const followUp = lead.nextContactAt ? `<div class="alert-detail">próximo contacto: ${dateText(lead.nextContactAt)}</div>` : '';
  return `<tr>
    <td>${escapeText(lead.name)}<div class="alert-detail">${escapeText(contact || '—')}</div>${campaign}</td>
    <td>${escapeText(lead.zone || '—')}<div class="alert-detail">${escapeText(detail || '—')}</div>${followUp}</td>
    <td>${dateText(lead.createdAt)}</td>
    <td><select data-lead-status="${lead.id}">${LEAD_STATUSES.map((status) =>
      `<option value="${status}" ${lead.status === status ? 'selected' : ''}>${LEAD_STATUS_LABELS[status]}</option>`).join('')}</select></td>
    <td>${advertisingBadges(lead.commercial)}<div class="row-actions">${consentButtons('lead', lead.id, lead.commercial)}</div></td>
    <td class="row-actions">
      <button type="button" data-next-contact="${lead.id}">Próximo contacto</button>
      <button type="button" data-activate="${lead.id}" data-email="${escapeText(lead.email || '')}">Crear cuenta</button>
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
    <section class="panel" data-analytics></section>
    <section class="panel" data-prospects></section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPTORES</p><h2>Registrados, verificados y publicidad</h2>
        <p class="hint" data-audience-counts></p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Usuario</th><th>Rol</th><th>Plan</th><th>Estado</th><th>Publicidad</th><th>Acceso</th><th></th></tr></thead>
        <tbody data-subscribers></tbody>
      </table></div>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">WHATSAPP MANUAL</p><h2>Envíos pendientes de enviar a mano</h2></div></div>
      <p class="hint">Durante el piloto no se envía WhatsApp automáticamente. Abre el enlace, envía el mensaje desde tu teléfono y márcalo como enviado.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Destino</th><th>Mensaje</th><th></th></tr></thead>
        <tbody data-manual></tbody>
      </table></div>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SOLICITUDES WEB</p><h2>Fincas que piden alertas</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Contacto</th><th>Finca</th><th>Fecha</th><th>Estado</th><th>Publicidad</th><th></th></tr></thead>
        <tbody data-leads></tbody>
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
      const [{ subscribers, counts }, { requests }, { leads }, { outbox }, audit] = await Promise.all([
        api('/api/v1/admin/subscribers'),
        api('/api/v1/admin/pilot-requests'),
        api('/api/v1/admin/leads'),
        api('/api/v1/admin/outbox?status=manual'),
        api('/api/v1/admin/audit?limit=100'),
      ]);
      $('[data-subscribers]', root).innerHTML = subscribers.map(subscriberRow).join('');
      if (counts) {
        $('[data-audience-counts]', root).textContent =
          `Registrados: ${counts.registered} · Verificados: ${counts.verified} · Autorizados para publicidad: ${counts.advertising}`;
      }
      $('[data-manual]', root).innerHTML = outbox.map(manualRow).join('')
        || '<tr><td colspan="4">No hay envíos manuales pendientes.</td></tr>';
      $('[data-leads]', root).innerHTML = leads.map(leadRow).join('')
        || '<tr><td colspan="6">Sin solicitudes web.</td></tr>';
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
    else if (el.dataset.leadStatus) {
      try {
        await api(`/api/v1/admin/leads/${el.dataset.leadStatus}`, { method: 'PATCH', body: JSON.stringify({ status: el.value }) });
        await load();
      } catch (error_) {
        error(`No se pudo actualizar la solicitud: ${error_.message}`);
      }
    }
  };

  root.onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (button.dataset.access) await loadAccess(button.dataset.access);
      else if (button.dataset.accessClose !== undefined) $('[data-access-panel]', root).classList.add('hidden');
      else if (button.dataset.grant) {
        await api(`/api/v1/admin/subscribers/${button.dataset.subscriber}/access`, { method: 'POST', body: JSON.stringify({ device_id: button.dataset.grant }) });
        await loadAccess(button.dataset.subscriber);
      } else if (button.dataset.revoke) {
        await api(`/api/v1/admin/subscribers/${button.dataset.subscriber}/access/${encodeURIComponent(button.dataset.revoke)}`, { method: 'DELETE' });
        await loadAccess(button.dataset.subscriber);
      } else if (button.dataset.consentScope) {
        const scope = button.dataset.consentScope;
        const base = scope === 'subscriber'
          ? `/api/v1/admin/subscribers/${button.dataset.consentId}/consents`
          : `/api/v1/admin/leads/${button.dataset.consentId}/consents`;
        await api(base, { method: 'POST', body: JSON.stringify({
          channel: button.dataset.consentChannel, action: button.dataset.consentAction,
        }) });
        await load();
      } else if (button.dataset.nextContact) {
        const value = window.prompt('Fecha del próximo contacto (AAAA-MM-DD, vacío para borrar):', '');
        if (value === null) return;
        const next_contact_at = value ? new Date(`${value}T09:00:00`).toISOString() : null;
        await api(`/api/v1/admin/leads/${button.dataset.nextContact}`, {
          method: 'PATCH', body: JSON.stringify({ next_contact_at }),
        });
        await load();
      } else if (button.dataset.activate) {
        const email = window.prompt('Correo del nuevo suscriptor:', button.dataset.email || '') || '';
        if (!email) return;
        const result = await api(`/api/v1/admin/leads/${button.dataset.activate}/activate`, {
          method: 'POST', body: JSON.stringify({ email }),
        });
        window.alert(`Suscriptor creado: ${result.subscriber.email}\nContraseña temporal (se muestra una sola vez): ${result.temporaryPassword}`);
        await load();
      } else if (button.dataset.test) {
        const result = await api(`/api/v1/admin/subscribers/${button.dataset.test}/test-message`, { method: 'POST' });
        window.alert(result.ok
          ? `Prueba enviada por ${result.channel} a ${result.address}.`
          : `No se pudo enviar la prueba: ${result.error}`);
      } else if (button.dataset.outboxSent) {
        await api(`/api/v1/admin/outbox/${button.dataset.outboxSent}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) });
        await load();
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
    } finally {
      button.disabled = false;
    }
  }

  await load();
  await mountProspects($('[data-prospects]', root));
  await mountAdminAnalytics($('[data-analytics]', root));
  await mountAdminStatistics($('[data-statistics-panel]', root));
}
