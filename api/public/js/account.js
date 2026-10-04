import { $, api, escapeText, dateText, roleLabel, planLabel, session } from './ui.js';

export async function renderAccount(root) {
  const me = session.me;
  const requests = me.pilotRequests || [];
  root.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>${escapeText(me.email)}</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPCIÓN</p><h2>Perfil y consentimiento</h2></div></div>
      <dl class="detail-grid">
        <dt>Rol</dt><dd>${escapeText(roleLabel(me.role))}</dd>
        <dt>Plan</dt><dd>${escapeText(planLabel(me.plan))}</dd>
        <dt>Estaciones</dt><dd>${me.stations.map((station) => escapeText(station.name)).join(', ') || 'sin estaciones vinculadas'}</dd>
        <dt>Consentimiento de comunicaciones</dt><dd>${me.communicationConsent
          ? `<span class="badge badge-valid">concedido ${dateText(me.consentAt)}</span>`
          : '<span class="badge badge-invalid">no concedido</span>'}</dd>
      </dl>
      <label class="check"><input type="checkbox" data-consent ${me.communicationConsent ? 'checked' : ''}>
        Autorizar el envío de avisos por los canales configurados</label>
      <p class="hint">Sin consentimiento solo recibirás avisos dentro del panel. Puedes revocarlo en cualquier momento.</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PILOTOS EN FINCAS</p><h2>Solicitudes de acceso</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Finca</th><th>Ubicación</th><th>Contacto</th><th>Solicitada</th><th>Estado</th><th>Decisión</th></tr></thead>
        <tbody>${requests.map((request) => `<tr>
          <td>${escapeText(request.farm_name)}</td>
          <td>${escapeText(request.location || '—')}</td>
          <td>${escapeText(request.contact || '—')}</td>
          <td>${dateText(request.created_at)}</td>
          <td>${request.status === 'approved' ? 'Aprobada' : request.status === 'rejected' ? 'Rechazada' : 'Pendiente'}</td>
          <td>${escapeText(request.decision_notes || '—')}</td>
        </tr>`).join('') || '<tr><td colspan="6">No has solicitado acceso para ninguna finca.</td></tr>'}</tbody>
      </table></div>
      <form data-pilot-form class="rule-form">
        <label>Finca<input name="farm_name" required minlength="2" maxlength="120"></label>
        <label>Ubicación<input name="location" maxlength="200"></label>
        <label>Contacto<input name="contact" maxlength="200"></label>
        <label>Notas<textarea name="notes" maxlength="1000" rows="2"></textarea></label>
        <button type="submit">Solicitar acceso piloto</button>
      </form>
    </section>`;

  const error = (message) => { $('[data-error]', root).textContent = message; };

  $('[data-consent]', root).addEventListener('change', async (event) => {
    const checked = event.target.checked;
    try {
      await api('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ communication_consent: checked }) });
      session.me.communicationConsent = checked;
      session.me.consentAt = checked ? new Date().toISOString() : null;
    } catch (err) {
      event.target.checked = !checked;
      error(`No se pudo guardar el consentimiento: ${err.message}`);
    }
  });

  $('[data-pilot-form]', root).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    error('');
    const body = { farm_name: form.get('farm_name') };
    for (const field of ['location', 'contact', 'notes']) if (form.get(field)) body[field] = form.get(field);
    try {
      const { pilotRequests } = await api('/api/v1/pilot-requests', { method: 'POST', body: JSON.stringify(body) });
      session.me.pilotRequests = pilotRequests;
      event.currentTarget.reset();
      await renderAccount(root);
    } catch (err) {
      error(`No se pudo enviar la solicitud: ${err.message}`);
    }
  });
}