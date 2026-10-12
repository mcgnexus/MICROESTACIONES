// Alta solo por WhatsApp: suscripción pública a los avisos de una estación
// habilitada, sin cuenta y sin email. Dos pasos: petición (teléfono + estación +
// categorías) y confirmación del código recibido por WhatsApp. Nunca da acceso
// al panel ni a datos privados; la baja es respondiendo BAJA.
//
// Cuando todavía no hay ninguna estación con avisos habilitados, el mismo bloque
// ofrece la lista de interés: solo el teléfono y un consentimiento de servicio,
// sin código de verificación. La identidad se verificará cuando el servicio se
// active.
import { $, api, escapeText, dateText } from './ui.js';

const CATEGORY_LABELS = {
  frost: 'Heladas', heat: 'Calor', storm: 'Tormentas',
  wind: 'Viento', humidity: 'Humedad', general: 'General',
};

const SUBSCRIBE_TITLE = 'Recibe los avisos disponibles de esta estación';
const INTEREST_TITLE = '¿Te interesan los avisos por WhatsApp?';

function shell() {
  // El encabezado (h2) vive en la propia página antes de que cargue el cliente;
  // aquí se vuelve a renderizar para poder ajustar su texto al estado real
  // (suscripción o lista de interés) sin perder el anclaje `#avisos-whatsapp`.
  return `<div class="section-heading"><div><p class="eyebrow">AVISOS POR WHATSAPP</p><h2 data-wa-title>${SUBSCRIBE_TITLE}</h2></div></div>
    <div data-wa-body><p class="hint">Cargando estaciones…</p></div>
    <p class="error" data-wa-error role="alert"></p>`;
}

function stepRequest(stations) {
  return `<p class="hint">Los avisos se refieren al punto medido por esta estación, no al resto de la comarca. Elige estación y tipos de aviso, verifica tu teléfono con un código y listo. Solo recibirás los avisos de esa estación; respondiendo BAJA te das de baja. Sin acceso al panel ni a datos privados.</p>
    <form class="rule-form" data-wa-request>
    <label>Estación<select name="device_id" required>${stations.map((station) =>
      `<option value="${escapeText(station.id)}">${escapeText(station.name)}${station.zone ? ` · ${escapeText(station.zone)}` : ''}</option>`).join('')}</select></label>
    <fieldset><legend>Tipos de aviso</legend>${stations[0].categories.map((key) =>
      `<label class="check"><input type="checkbox" name="category" value="${key}" checked> ${CATEGORY_LABELS[key] ?? key}</label>`).join('')}</fieldset>
    <label>Teléfono de WhatsApp<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required></label>
    <button type="submit">Recibir código de verificación</button>
  </form>`;
}

function stepInterest() {
  return `<p class="hint">Todavía no hay estaciones con avisos públicos habilitados. Déjanos tu teléfono y te avisaremos cuando el servicio esté disponible. No recibirás avisos hasta que confirmes un código cuando se active.</p>
    <form class="rule-form" data-wa-interest>
    <label>Teléfono de WhatsApp<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required></label>
    <label class="check"><input type="checkbox" name="consent" required> Acepto que TecRural guarde mi número para avisarme cuando el servicio de avisos esté disponible. Consulta la <a href="/privacidad">Política de privacidad</a>.</label>
    <button type="submit">Apuntarme a la lista de interés</button>
  </form>`;
}

function interestDone() {
  return `<p class="ok">Hemos registrado tu interés. Todavía no se han activado avisos meteorológicos. Te avisaremos en este número cuando el servicio esté disponible.</p>`;
}

function stepConfirm(phone, stationName) {
  return `<form class="rule-form" data-wa-confirm>
    <p class="hint">Te hemos enviado un código por WhatsApp${stationName ? ` para los avisos de ${escapeText(stationName)}` : ''}. Introdúcelo para activar la suscripción del ${escapeText(phone)}.</p>
    <label>Código recibido<input name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code" required></label>
    <input type="hidden" name="phone" value="${escapeText(phone)}">
    <button type="submit">Confirmar y activar</button>
  </form>`;
}

function done(phone) {
  return `<p class="ok">Número ${escapeText(phone)} verificado: recibirás los avisos elegidos. Para darte de baja responde BAJA a cualquiera de nuestros mensajes.</p>`;
}

export function mountWaSignup(root = document) {
  const mount = root.querySelector('[data-wa-signup]');
  if (!mount) return;
  mount.innerHTML = shell();
  const body = $('[data-wa-body]', mount);
  const heading = mount.querySelector('[data-wa-title]');
  const setTitle = (text) => { if (heading) heading.textContent = text; };
  const error = (message) => { $('[data-wa-error]', mount).textContent = message; };
  let stations = [];

  api('/api/v1/public-alerts/wa/stations').then((result) => {
    stations = result.stations || [];
    if (!stations.length) {
      // Sin estaciones habilitadas no hay nada que suscribir: se ofrece la lista
      // de interés y el encabezado lo declara.
      setTitle(INTEREST_TITLE);
      body.innerHTML = stepInterest();
    } else {
      setTitle(SUBSCRIBE_TITLE);
      body.innerHTML = stepRequest(stations);
    }
  }).catch(() => {
    body.innerHTML = '<p class="hint">No se han podido cargar las estaciones. Inténtalo más tarde.</p>';
  });

  mount.addEventListener('submit', async (event) => {
    const request = event.target.closest('[data-wa-request]');
    const confirm = event.target.closest('[data-wa-confirm]');
    const interest = event.target.closest('[data-wa-interest]');
    if (!request && !confirm && !interest) return;
    event.preventDefault();
    error('');
    try {
      if (interest) {
        const data = new FormData(interest);
        await api('/api/v1/public-alerts/wa/interest', {
          method: 'POST',
          body: JSON.stringify({ phone: data.get('phone') }),
        });
        body.innerHTML = interestDone();
      } else if (request) {
        const data = new FormData(request);
        const categories = [...request.querySelectorAll('input[name="category"]:checked')].map((input) => input.value);
        await api('/api/v1/public-alerts/wa/request', {
          method: 'POST',
          body: JSON.stringify({
            phone: data.get('phone'), device_id: data.get('device_id'),
            categories: categories.length ? categories : undefined,
          }),
        });
        const station = stations.find((item) => item.id === data.get('device_id'));
        body.innerHTML = stepConfirm(String(data.get('phone') || ''), station?.name);
      } else {
        const data = new FormData(confirm);
        await api('/api/v1/public-alerts/wa/confirm', {
          method: 'POST',
          body: JSON.stringify({ phone: data.get('phone'), code: data.get('code') }),
        });
        body.innerHTML = done(String(data.get('phone') || ''));
      }
    } catch (err) {
      const messages = {
        invalid_body: 'Revisa los datos: el teléfono no tiene un formato válido.',
        invalid_phone: 'Ese teléfono no parece válido. Revisa el país y los dígitos.',
        station_not_found: 'Esa estación no existe.',
        station_not_enabled: 'Esa estación no tiene avisos públicos habilitados.',
        wa_opted_out: 'Ese número estaba dado de baja. Escríbenos para reactivarlo.',
        channel_unavailable: 'El envío por WhatsApp no está disponible ahora mismo.',
        no_pending_code: 'No hay ningún código pendiente: pide uno de nuevo.',
        code_expired: 'El código ha caducado: pide uno nuevo.',
        too_many_attempts: 'Demasiados intentos con ese código: pide uno nuevo.',
        too_many_requests: 'Demasiadas peticiones: espera unos minutos.',
        invalid_code: 'Código incorrecto. Compruébalo e inténtalo de nuevo.',
      };
      error(messages[err.message] ?? `No se pudo completar: ${err.message}`);
    }
  });
}
