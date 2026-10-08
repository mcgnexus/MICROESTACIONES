// Solicitud reutilizable de acceso gratuito. El alta se tramita desde administración.
import { api } from './ui.js';
import { showNotice, clearNotice, setError } from './notifications.js';

// Captación de la visita (utm_* y ref). El servidor la valida de nuevo. Se lee
// de forma defensiva para poder importar el módulo fuera del navegador.
const acquisition = (() => {
  if (typeof location === 'undefined') return {};
  const params = new URLSearchParams(location.search);
  const out = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term', 'ref']) {
    const value = params.get(key) ?? params.get(`utm_${key}`);
    if (value) out[key] = value;
  }
  return out;
})();

export const LEAD_FORM_HTML = `
  <div class="section-heading"><div><p class="eyebrow">SOLICITUD</p><h2 data-lead-title></h2></div></div>
  <p class="hint" data-lead-description>Déjanos tus datos y revisaremos la solicitud de acceso.</p>
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
        <option value="futura_instalacion">Futura instalación</option>
      </select>
    </label>
    <label>Notas<textarea name="notes" maxlength="1000" rows="2"></textarea></label>
    <label class="check span-all"><input type="checkbox" name="consent" required> Acepto que TecRural contacte conmigo para responder a esta solicitud y tramitar el acceso. Consulta la <a href="/privacidad">Política de privacidad</a>.</label>
    <label class="check span-all"><input type="checkbox" name="commercial_consent"> Quiero recibir novedades y ofertas sobre microestaciones (opcional). Puedes darte de baja cuando quieras.</label>
    <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot">
    <p class="error span-all" data-lead-error role="alert"></p>
    <p class="ok span-all hidden" data-lead-ok role="status">Solicitud recibida. Te contactaremos.</p>
    <button type="submit" class="span-all">Enviar solicitud de acceso</button>
  </form>`;

export async function submitLead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.submitting) return;
  form.dataset.submitting = 'true';
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
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
    commercial_consent: data.get('commercial_consent') === 'on',
    website: data.get('website') ?? '',
  };
  for (const field of ['email', 'zone', 'crop_or_livestock', 'notes']) {
    if (data.get(field)) body[field] = data.get(field);
  }
  if (Object.keys(acquisition).length) body.campaign = acquisition;
  try {
    await api('/api/v1/leads', { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    showNotice(scope, '[data-lead-ok]', scope.dataset.leadSuccess || 'Solicitud recibida. Te contactaremos.');
  } catch (error) {
    setError(scope, '[data-lead-error]', `No se pudo enviar la solicitud: ${error.message}`);
  } finally {
    delete form.dataset.submitting;
    if (submit) submit.disabled = false;
  }
}

// Rellena cada bloque [data-lead-embed] con el formulario y lo deja funcionando.
export function mountLeadForms(root = document) {
  root.querySelectorAll('[data-lead-embed]').forEach((section) => {
    section.innerHTML = LEAD_FORM_HTML;
    const title = section.querySelector('[data-lead-title]');
    if (title) title.textContent = section.dataset.leadTitle || 'Cuéntanos de tu finca';
    const description = section.querySelector('[data-lead-description]');
    if (description && section.dataset.leadDescription) description.textContent = section.dataset.leadDescription;
    const success = section.querySelector('[data-lead-ok]');
    if (success && section.dataset.leadSuccess) success.textContent = section.dataset.leadSuccess;
    const form = section.querySelector('[data-lead-form]');
    if (form) form.addEventListener('submit', submitLead);
  });
}
