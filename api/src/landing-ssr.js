// Render en servidor de la lectura pública para el primer pintado.
//
// La portada mostraba la tarjeta solo después de cargar el JS y pedir
// /api/v1/public/stations. Aquí se genera esa misma tarjeta con las funciones
// del cliente y se incrusta en el HTML servido: el dato de ahora se ve sin
// esperar a JS ni a la API. Solo la tarjeta: la comparación y la evolución son
// contenido bajo el pliegue (y la gráfica pesa), así que las carga el cliente.
import { loadPublicStations } from './public.js';
import { renderLocalWeatherCard, selectUrbanStation } from '../public/js/landing.js';

const TTL_MS = 60 * 1000;
let cache = null;
let inflight = null;

// Tarjeta ya renderizada. Se guarda 60 s en memoria: la portada recibe muchas
// visitas y la consulta no debe repetirse en cada una. Coincide con la caché de
// CDN de /api/v1/public/stations, así que no añade más antigüedad que aquella.
export async function landingWeatherCard() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.card;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const stations = await loadPublicStations();
      const card = renderLocalWeatherCard(selectUrbanStation(stations));
      cache = { at: Date.now(), card };
      return card;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Sustituye el estado de carga y el contenedor de la tarjeta por el contenido
// renderizado. Es puro (recibe la tarjeta) para poder probarlo sin base de datos.
export function injectLandingParts(html, card) {
  if (!card || html.includes('data-public-ready')) return html;
  const replaceElement = (source, id, replacement) =>
    source.replace(new RegExp(`<div id="${id}"[^>]*>[\\s\\S]*?</div>`), replacement);
  let out = replaceElement(html, 'local-weather-state',
    '<div id="local-weather-state" role="status" aria-live="polite"></div>');
  out = replaceElement(out, 'local-weather-card',
    `<div id="local-weather-card" data-public-ready="1">${card}</div>`);
  return out;
}

// Carga + inyección, degradando con seguridad: si la base de datos no responde
// se sirve el HTML sin SSR y el cliente carga los datos como antes.
export async function injectLandingWeather(html) {
  try {
    return injectLandingParts(html, await landingWeatherCard());
  } catch {
    return html;
  }
}
