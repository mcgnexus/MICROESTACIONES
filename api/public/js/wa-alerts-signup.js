// Alta solo por WhatsApp: suscripción pública a los avisos de una estación
// habilitada, sin cuenta y sin email. Dos pasos: petición (teléfono + estación +
// categorías) y confirmación del código recibido por WhatsApp. Nunca da acceso
// al panel ni a datos privados; la baja es respondiendo BAJA.
import { $, api, escapeText, dateText } from './ui.js';

const CATEGORY_LABELS = {
  frost: 'Heladas', heat: 'Calor', storm: 'Tormentas',
  wind: 'Viento', humidity: 'Humedad', general: 'General',
};

function shell() {
  // El encabezado (h2) vive en la propia página: así la sección es navegable
  // antes de que el cliente cargue las estaciones.
  return `<p class="hint">Elige estación y tipos de aviso, verifica tu teléfono con un código y listo. Solo recibirás los avisos de esa estación; respondiendo BAJA te das de baja. Sin acceso al panel ni a datos privados.</p>
    <div data-wa-body><p class="hint">Cargando estaciones…</p></div>
    <p class="error" data-wa-error role="alert"></p>`;
}

function stepRequest(stations) {
  if (!stations.length) {
    return `<p class="hint">El servicio de avisos públicos todavía no tiene estaciones habilitadas. Vuelve a comprobarlo más tarde.</p>`;
  }
  return `<form class="rule-form" data-wa-request>
    <label>Estación<select name="device_id" required>${stations.map((station) =>
      `<option value="${escapeText(station.id)}">${escapeText(station.name)}${station.zone ? ` · ${escapeText(station.zone)}` : ''}</option>`).join('')}</select></label>
    <fieldset><legend>Tipos de aviso</legend>${stations[0].categories.map((key) =>
      `<label class="check"><input type="checkbox" name="category" value="${key}" checked> ${CATEGORY_LABELS[key] ?? key}</label>`).join('')}</fieldset>
    <label>Teléfono de WhatsApp<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required></label>
    <button type="submit">Recibir código de verificación</button>
  </form>`;
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
  const error = (message) => { $('[data-wa-error]', mount).textContent = message; };
  let stations = [];

  api('/api/v1/public-alerts/wa/stations').then((result) => {
    stations = result.stations || [];
    body.innerHTML = stepRequest(stations);
  }).catch(() => {
    body.innerHTML = '<p class="hint">No se han podido cargar las estaciones. Inténtalo más tarde.</p>';
  });

  mount.addEventListener('submit', async (event) => {
    const request = event.target.closest('[data-wa-request]');
    const confirm = event.target.closest('[data-wa-confirm]');
    if (!request && !confirm) return;
    event.preventDefault();
    error('');
    try {
      if (request) {
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
