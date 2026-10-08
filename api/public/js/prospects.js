import { api, escapeText as e, dateText } from './ui.js';
const states = { registrado: 'Registrado', interes_declarado: 'Interés declarado', contacto_solicitado: 'Contacto solicitado', contactado: 'Contactado', archivado: 'Archivado' };
const options = (items) => Object.entries(items).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
export async function mountProspects(root) {
  root.innerHTML = `<h2>Bandeja de interesados</h2>
    <p>Un registro no solicita una llamada. La actividad de cuenta y el seguimiento comercial son independientes.</p>
    <form data-filters class="rule-form">
      <label>Municipio<input name="municipality" maxlength="160"></label>
      <label>Actividad<select name="activity"><option value="">Todas</option>${options({ agricultura: 'Agricultura', ganaderia: 'Ganadería', mixta: 'Mixta', otra: 'Otra' })}</select></label>
      <label>Interés<select name="interest"><option value="">Todos</option>${options({ heladas: 'Heladas', calor: 'Calor', tormentas: 'Tormentas', viento: 'Viento', humedad: 'Humedad', general: 'General', futura_instalacion: 'Instalación' })}</select></label>
      <label>Estado comercial<select name="status"><option value="">Todos</option>${options(states)}</select></label>
      <label>Verificación<select name="verified"><option value="">Todas</option><option value="yes">Correo verificado</option><option value="no">Sin verificar</option></select></label>
      <label>Permiso comercial<select name="permission"><option value="">Todos</option><option value="yes">Autorizado</option><option value="no">Sin permiso</option></select></label>
      <label>Instalación<select name="installation"><option value="">Todos</option><option value="yes">Con interés</option></select></label>
      <button>Aplicar filtros</button>
    </form>
    <div class="row-actions"><label>Canal de exportación<select data-channel><option value="email">Correo</option><option value="whatsapp">WhatsApp</option></select></label>
    <button type="button" data-export>Exportar alcance filtrado autorizado</button><button type="button" data-retention>Aplicar retención</button></div>
    <p role="status" data-count></p><p role="alert" class="error" data-inbox-error></p><div data-results></div>`;
  const filters = root.querySelector('[data-filters]');
  let scope = new URLSearchParams();
  const error = (text) => { root.querySelector('[data-inbox-error]').textContent = text; };
  async function load() {
    const { prospects } = await api(`/api/v1/admin/prospects?${scope}`);
    root.querySelector('[data-count]').textContent = `${prospects.length} contactos en el alcance seleccionado`;
    root.querySelector('[data-results]').innerHTML = prospects.map((r) => `<details class="panel">
      <summary>${e(r.name)} · ${e(r.municipality || 'Sin municipio')} · ${e(states[r.status])}</summary>
      <p>${r.verified ? 'Correo verificado' : 'Sin verificar'} · Cuenta: ${r.accountActive == null ? 'sin cuenta' : r.accountActive ? 'activa' : 'inactiva'}</p>
      <p>Contacto: ${e(r.email || '')} ${e(r.whatsapp || '')}. Permiso comercial: ${e(Object.keys(r.commercial).filter((c) => r.commercial[c]).join(', ') || 'ninguno')}</p>
      <p>Origen: ${e(JSON.stringify(r.origin || {}))} · Registro: ${dateText(r.createdAt)}</p>
      <form data-edit="${r.kind}/${r.id}" class="rule-form">
        <label>Estado comercial<select name="status">${Object.entries(states).map(([key, label]) => `<option value="${key}" ${r.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Notas<textarea name="notes" maxlength="2000">${e(r.notes || '')}</textarea></label>
        <label>Siguiente acción<input name="next_action" maxlength="300" value="${e(r.nextAction || '')}"></label>
        <label>Fecha de siguiente acción<input name="next_action_at" type="datetime-local" value="${localDate(r.nextActionAt)}"></label>
        <label>Retención comercial hasta${r.kind === 'subscriber' ? ' (archiva seguimiento y revoca publicidad)' : ' (suprime solicitud)'}<input name="retain_until" type="datetime-local" value="${localDate(r.retainUntil)}"></label>
        <label class="check"><input name="installation_interest" type="checkbox" ${r.installationInterest ? 'checked' : ''}>Interés en instalación</label>
        <button>Guardar seguimiento</button>
        <button type="button" data-unsubscribe="${r.kind}/${r.id}">Baja comercial de todos los canales</button>
        <button type="button" data-erase="${r.kind}/${r.id}">Suprimir contacto${r.kind === 'subscriber' ? ' y cuenta' : ''}</button>
      </form></details>`).join('') || '<p>No hay contactos con estos filtros.</p>';
  }
  function localDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  root.addEventListener('submit', async (event) => {
    event.preventDefault(); event.stopPropagation();
    const form = event.target;
    if (form.dataset.busy) return;
    form.dataset.busy = 'yes';
    const button = form.querySelector('button'); button.disabled = true; error('');
    try {
      const data = new FormData(form);
      if (form === filters) scope = new URLSearchParams([...data].filter(([, value]) => value));
      else {
        const body = Object.fromEntries(data);
        body.installation_interest = data.has('installation_interest');
        for (const key of ['next_action_at', 'retain_until']) body[key] = body[key] ? new Date(body[key]).toISOString() : null;
        await api(`/api/v1/admin/prospects/${form.dataset.edit}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      await load();
    } catch (err) { error(`No se pudo guardar o cargar la bandeja: ${err.message}`); }
    finally { delete form.dataset.busy; button.disabled = false; }
  });
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('button[type="button"]');
    if (!button) return;
    event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true; error('');
    try {
      if (button.hasAttribute('data-export')) {
        const params = new URLSearchParams(scope); params.set('channel', root.querySelector('[data-channel]').value);
        const response = await fetch(`/api/v1/admin/prospects/export?${params}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('No se pudo exportar');
        const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a');
        link.href = url; link.download = 'contactos-autorizados.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (button.dataset.unsubscribe) {
        await api(`/api/v1/admin/prospects/${button.dataset.unsubscribe}/unsubscribe`, { method: 'POST' }); await load();
      } else if (button.dataset.erase) {
        if (!confirm('¿Suprimir definitivamente este contacto y, si existe, su cuenta?')) return;
        await api(`/api/v1/admin/prospects/${button.dataset.erase}`, { method: 'DELETE' }); await load();
      } else if (button.hasAttribute('data-retention')) {
        const result = await api('/api/v1/admin/maintenance/retention', { method: 'POST' });
        await load(); root.querySelector('[data-count]').textContent += ` · ${result.leadsDeleted} solicitudes suprimidas por retención`;
      }
    } catch (err) { error(`No se pudo completar la acción: ${err.message}`); }
    finally { button.disabled = false; }
  });
  await load();
}
