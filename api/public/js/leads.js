// Captación pública de fincas: un formulario reutilizable que la portada repite
// varias veces. El visitante no crea cuenta; solo deja sus datos y su consentimiento.
import { api } from './ui.js';
import { showNotice, clearNotice, setError } from './notifications.js';

export const LEAD_FORM_HTML = `
  <div class="section-heading"><div><p class="eyebrow">SOLICITUD</p><h2 data-lead-title></h2></div></div>
  <p class="hint">Déjanos tu WhatsApp y te contactamos para activar las alertas. También puedes llamarnos por teléfono.</p>
  <form class="rule-form" data-lead-form>
    <label>Tu nombre<input name="name" required minlength="2" maxlength="120" autocomplete="name"></label>
    <label>Teléfono de WhatsApp<input name="phone" required inputmode="tel" maxlength="30" autocomplete="tel" placeholder="+34 600 000 000"></label>
    <label>Correo electrónico (opcional)<input name="email" type="email" maxlength="254" autocomplete="email"></label>
    <label>Tipo de actividad
      <select name="activity">
        <option value="agricultura">Agricultura</option>
        <option value="ganaderia">Ganadería</option>
        <option value="mixta">Agricultura y ganadería</option>
        <option value="otra">Otra</option>
      </select>
    </label>
    <label>Zona o localidad<input name="zone" maxlength="160"></label>
    <label>Cultivo o ganado<input name="crop_or_livestock" maxlength="160"></label>
    <label>¿Qué te interesa más?
      <select name="interest">
        <option value="general">Información general</option>
        <option value="heladas">Heladas</option>
        <option value="calor">Golpes de calor</option>
        <option value="tormentas">Tormentas</option>
        <option value="viento">Viento</option>
        <option value="humedad">Humedad</option>
      </select>
    </label>
    <label>Notas<textarea name="notes" maxlength="1000" rows="2"></textarea></label>
    <label class="check span-all"><input type="checkbox" name="consent" required> Acepto recibir comunicaciones por WhatsApp y email sobre las alertas de mi finca.</label>
    <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot">
    <p class="error span-all" data-lead-error role="alert"></p>
    <p class="ok span-all hidden" data-lead-ok role="status">Solicitud recibida. Te contactaremos para activar tus alertas.</p>
    <button type="submit" class="span-all">Enviar solicitud</button>
  </form>`;

export async function submitLead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const scope = form.closest('[data-lead-embed]') || form;
  const data = new FormData(form);
  setError(scope, '[data-lead-error]', '');
  clearNotice(scope, '[data-lead-ok]');
  const body = {
    name: data.get('name') ?? '',
    phone: data.get('phone') ?? '',
    activity: data.get('activity') || 'agricultura',
    interest: data.get('interest') || 'general',
    consent: data.get('consent') === 'on',
    website: data.get('website') ?? '',
  };
  for (const field of ['email', 'zone', 'crop_or_livestock', 'notes']) {
    const value = data.get(field);
    if (value) body[field] = value;
  }
  try {
    await api('/api/v1/leads', { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    showNotice(scope, '[data-lead-ok]', 'Solicitud recibida. Te contactaremos para activar tus alertas.');
  } catch (error) {
    setError(scope, '[data-lead-error]', `No se pudo enviar la solicitud: ${error.message}`);
  }
}

// Rellena cada bloque [data-lead-embed] con el formulario y lo deja funcionando.
export function mountLeadForms(root = document) {
  root.querySelectorAll('[data-lead-embed]').forEach((section) => {
    section.innerHTML = LEAD_FORM_HTML;
    const title = section.querySelector('[data-lead-title]');
    if (title) title.textContent = section.dataset.leadTitle || 'Cuéntanos de tu finca';
    const form = section.querySelector('[data-lead-form]');
    if (form) form.addEventListener('submit', submitLead);
  });
}
