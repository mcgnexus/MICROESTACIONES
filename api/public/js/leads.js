// Solicitud reutilizable de acceso gratuito. El alta se tramita desde administración.
import { api } from './ui.js';
import { showNotice, clearNotice, setError } from './notifications.js';

// La normalización de teléfonos arrastra los metadatos de países (pesados): se
// carga de forma diferida, solo cuando se va a usar el canal de WhatsApp, para
// no engordar la portada. Hasta entonces, el país por defecto es España.
const DEFAULT_COUNTRY = 'ES';
let phoneModule = null;
const loadPhone = async () => (phoneModule ??= await import('./phone.js'));

// Rellena los selectores de país del formulario con los metadatos de la
// biblioteca, dejando España seleccionada.
async function fillCountrySelects(form) {
  const { countryOptions } = await loadPhone();
  const options = countryOptions().map((country) =>
    `<option value="${country.code}"${country.code === DEFAULT_COUNTRY ? ' selected' : ''}>${country.name} (+${country.callingCode})</option>`).join('');
  form.querySelectorAll('select[data-phone-country]').forEach((select) => { select.innerHTML = options; });
}

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

// Modalidad abierta por enlace de campaña (?tipo=instalacion|piloto). Se muestra
// al visitante y el servidor valida el valor: el parámetro solo preselecciona.
const campaignRequestType = (() => {
  if (typeof location === 'undefined') return null;
  const value = new URLSearchParams(location.search).get('tipo');
  return value === 'instalacion' ? 'installation_info'
    : value === 'piloto' ? 'pilot' : null;
})();

const REQUEST_TYPE_LABELS = {
  installation_info: 'Información para estudiar una instalación',
  pilot: 'Probar el servicio en mi finca',
};

export const LEAD_FORM_HTML = `
  <div class="section-heading"><div><p class="eyebrow">SOLICITUD</p><h2 data-lead-title></h2></div></div>
    <p class="hint" data-lead-description>Déjanos tus datos y revisaremos la solicitud.</p>
    <p class="hint"><strong>Esta no es la vía de acceso inmediato.</strong> Para entrar ahora mismo con tu correo, usa <a href="#/entrar">Entrar</a>. Y para ver un ejemplo con datos inventados, está la <a href="#/demo-agricola">simulación</a>.</p>
  <form class="rule-form" data-lead-form>
    <label>Tu nombre<input name="name" required minlength="2" maxlength="120" autocomplete="name"></label>
    <label>Municipio<input name="zone" required maxlength="160" autocomplete="address-level2"></label>
    <fieldset class="contact-choice span-all">
      <legend>¿Qué necesitas?</legend>
      <label class="check"><input type="radio" name="request_type" value="installation_info"> Información para estudiar una instalación</label>
      <label class="check"><input type="radio" name="request_type" value="pilot"> Probar el servicio en mi finca</label>
    </fieldset>
    <p class="hint span-all hidden" data-request-type-note></p>
    <fieldset class="contact-choice span-all">
      <legend>¿Cómo prefieres que te contactemos?</legend>
      <label class="check"><input type="radio" name="preferred_channel" value="email" checked> Email</label>
      <label class="check"><input type="radio" name="preferred_channel" value="whatsapp"> WhatsApp</label>
    </fieldset>
    <label data-contact-email>Correo electrónico<input name="email" type="email" maxlength="254" autocomplete="email" placeholder="tu@correo.com"></label>
    <label data-contact-whatsapp class="hidden">País del teléfono
      <select name="phone_country" data-phone-country>
        <option value="ES" selected>España (+34)</option>
      </select>
    </label>
    <label data-contact-whatsapp class="hidden">Teléfono de WhatsApp<input name="phone" type="tel" inputmode="tel" maxlength="40" autocomplete="tel" placeholder="600 000 000">
      <small class="hint">Usamos este número para responderte por WhatsApp a esta solicitud. El formato no garantiza que la cuenta exista: se confirma al verificar el contacto.</small></label>
    <p class="error span-all hidden" data-contact-error role="alert"></p>
    <details class="lead-details span-all"><summary>¿Quieres añadir otro canal de contacto o contarnos más? (opcional)</summary>
      <label data-secondary-email>Correo electrónico (opcional)<input name="secondary_email" type="email" maxlength="254" autocomplete="off"></label>
      <label data-secondary-whatsapp class="hidden">País del teléfono (opcional)
        <select name="secondary_phone_country" data-phone-country>
          <option value="ES" selected>España (+34)</option>
        </select>
      </label>
      <label data-secondary-whatsapp class="hidden">Teléfono de WhatsApp (opcional)<input name="secondary_phone" type="tel" inputmode="tel" maxlength="40" autocomplete="off"></label>
      <label>Actividad (opcional)
        <select name="activity">
          <option value="">No indicada</option>
          <option value="agricultura">Agricultura</option>
          <option value="ganaderia">Ganadería</option>
          <option value="mixta">Agricultura y ganadería</option>
          <option value="otra">Otra</option>
        </select>
      </label>
      <label>Cultivo o ganado<input name="crop_or_livestock" maxlength="160"></label>
      <label>Problema principal en tu finca (opcional)
        <select name="interest">
          <option value="">Sin concretar</option>
          <option value="heladas">Heladas</option>
          <option value="calor">Golpes de calor</option>
          <option value="tormentas">Tormentas</option>
          <option value="viento">Viento</option>
          <option value="humedad">Humedad</option>
          <option value="general">Información general</option>
        </select>
      </label>
      <label>Notas<textarea name="notes" maxlength="1000" rows="2"></textarea></label>
    </details>
    <p class="hint span-all">Siguiente paso: revisamos la solicitud y te contactamos por el canal que elijas. El envío no programa una instalación automática.</p>
    <label class="check span-all"><input type="checkbox" name="consent" required> Acepto que TecRural contacte conmigo para responder a esta solicitud y tramitar el acceso. Consulta la <a href="/privacidad">Política de privacidad</a>.</label>
    <label class="check span-all"><input type="checkbox" name="commercial_consent"> Quiero recibir novedades y ofertas sobre microestaciones (opcional). Puedes darte de baja cuando quieras.</label>
    <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot">
    <p class="error span-all" data-lead-error role="alert"></p>
    <p class="ok span-all hidden" data-lead-ok role="status">Solicitud recibida. Te contactaremos.</p>
    <button type="submit" class="span-all">Enviar solicitud de acceso</button>
  </form>`;

// Muestra el campo del canal elegido y esconde el otro, también en el
// desplegable del segundo canal. Se llama al montar y con cada cambio de radio.
function setLeadChannel(form) {
  const channel = form.querySelector('input[name="preferred_channel"]:checked')?.value || 'email';
  const toggle = (selector, show) => {
    const element = form.querySelector(selector);
    if (element) element.classList.toggle('hidden', !show);
  };
  toggle('[data-contact-email]', channel === 'email');
  toggle('[data-contact-whatsapp]', channel === 'whatsapp');
  toggle('[data-secondary-email]', channel === 'whatsapp');
  toggle('[data-secondary-whatsapp]', channel === 'email');
  // Los metadatos de países solo se descargan al abrir WhatsApp: la portada no
  // paga ese peso si nadie lo usa.
  if (channel === 'whatsapp') fillCountrySelects(form).catch(() => {});
}

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
  const contactError = scope.querySelector('[data-contact-error]');
  if (contactError) {
    contactError.textContent = '';
    contactError.classList.add('hidden');
  }
  clearNotice(scope, '[data-lead-ok]');
  // La modalidad y el canal elegidos exigen su valor: si falta, el error se
  // muestra junto al campo y no se llega a enviar nada.
  const requestType = data.get('request_type');
  const channel = data.get('preferred_channel');
  if (!requestType) {
    const message = 'Elige qué necesitas: información de instalación o probar el servicio.';
    const requestError = scope.querySelector('[data-request-type-note]');
    if (requestError) {
      requestError.textContent = message;
      requestError.classList.remove('hidden');
    } else {
      setError(scope, '[data-lead-error]', message);
    }
    delete form.dataset.submitting;
    if (submit) submit.disabled = false;
    return;
  }
  const channelValue = (channel === 'email' ? data.get('email') : data.get('phone')) || '';
  const secondary = channel === 'email' ? data.get('secondary_phone') : data.get('secondary_email');
  if (!channelValue.trim()) {
    const message = channel === 'email'
      ? 'Escribe tu correo electrónico: es el canal que has elegido para el contacto.'
      : 'Escribe tu teléfono de WhatsApp: es el canal que has elegido para el contacto.';
    if (contactError) {
      contactError.textContent = message;
      contactError.classList.remove('hidden');
    } else {
      setError(scope, '[data-lead-error]', message);
    }
    delete form.dataset.submitting;
    if (submit) submit.disabled = false;
    return;
  }
  const email = channel === 'email' ? data.get('email') : data.get('secondary_email');
  const rawPhone = channel === 'whatsapp' ? data.get('phone') : data.get('secondary_phone');
  const phoneCountry = (channel === 'whatsapp' ? data.get('phone_country') : data.get('secondary_phone_country'))
    || DEFAULT_COUNTRY;
  // El teléfono se normaliza a E.164 con el país elegido. Un número inválido no
  // se envía: el error aparece junto al campo y el envío no sigue.
  const { normalizePhoneE164 } = rawPhone ? await loadPhone() : {};
  const phone = rawPhone ? normalizePhoneE164(rawPhone, phoneCountry) : null;
  if (rawPhone && !phone) {
    const message = 'Ese teléfono no es válido para el país seleccionado. Revisa el prefijo o cambia el país.';
    if (contactError) {
      contactError.textContent = message;
      contactError.classList.remove('hidden');
    } else {
      setError(scope, '[data-lead-error]', message);
    }
    delete form.dataset.submitting;
    if (submit) submit.disabled = false;
    return;
  }
  const body = {
    name: data.get('name') ?? '',
    preferred_channel: channel,
    request_type: requestType,
    zone: data.get('zone') ?? '',
    consent: data.get('consent') === 'on',
    commercial_consent: data.get('commercial_consent') === 'on',
    website: data.get('website') ?? '',
  };
  if (data.get('activity')) body.activity = data.get('activity');
  if (data.get('interest')) body.interest = data.get('interest');
  if (email) body.email = email;
  if (phone) {
    body.phone = phone;
    body.phone_country = phoneCountry;
  }
  for (const field of ['crop_or_livestock', 'notes']) {
    if (data.get(field)) body[field] = data.get(field);
  }
  if (Object.keys(acquisition).length) body.campaign = acquisition;
  try {
    await api('/api/v1/leads', { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    setLeadChannel(form);
    // Confirmación concreta: qué se recibió, por qué canal se responde y que no
    // hace falta hacer nada más. Sin anunciar avisos activados ni instalación
    // reservada: la solicitud solo se ha guardado para revisión.
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'el correo electrónico';
    const kind = requestType === 'installation_info'
      ? 'tu consulta sobre una instalación' : 'tu solicitud para probar el servicio';
    const received = `${kind}${body.zone ? ` en ${body.zone}` : ''}`;
    showNotice(scope, '[data-lead-ok]',
      `${scope.dataset.leadSuccess ? `${scope.dataset.leadSuccess} ` : ''}Hemos recibido ${received}. Te responderemos por ${channelLabel}; revisa ese canal en los próximos días. No hace falta que hagas nada más.`);
  } catch (error) {
    // Sin resetear: lo escrito queda en pantalla para reintentar sin reescribir.
    setError(scope, '[data-lead-error]', `No se pudo enviar la solicitud: ${error.message}. Comprueba tu conexión y vuelve a pulsar Enviar: tus datos siguen en el formulario.`);
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
    if (!form) return;
    // Modalidad preseleccionada: la declara el embed (data-lead-request-type) o
    // el enlace de campaña (?tipo=…). La campaña se anuncia para que se vea.
    const preset = section.dataset.leadRequestType || campaignRequestType;
    if (preset) {
      const radio = form.querySelector(`input[name="request_type"][value="${preset}"]`);
      if (radio) radio.checked = true;
      if (campaignRequestType) {
        const note = form.querySelector('[data-request-type-note]');
        if (note) {
          note.textContent = `Has abierto la ${REQUEST_TYPE_LABELS[campaignRequestType].toLowerCase()}: si no es lo que buscabas, cámbialo aquí abajo.`;
          note.classList.remove('hidden');
        }
      }
    }
    form.addEventListener('submit', submitLead);
    form.querySelectorAll('input[name="preferred_channel"]').forEach((radio) => {
      radio.addEventListener('change', () => setLeadChannel(form));
    });
  });
}
