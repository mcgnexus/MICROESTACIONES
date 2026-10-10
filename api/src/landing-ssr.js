// Render en servidor de la lectura pública para el primer pintado.
//
// La portada mostraba la tarjeta, la comparación y la evolución solo después de
// cargar el JS y pedir /api/v1/public/stations. Aquí se generan las mismas
// piezas con las funciones del cliente y se incrustan en el HTML servido: el
// dato se ve sin esperar a JS ni a la API. El cliente detecta `data-public-ready`
// y no repite la petición inicial; el refresco periódico sigue funcionando.
import { loadPublicStations } from './public.js';
import { renderPublicWeather } from '../public/js/landing.js';

const TTL_MS = 60 * 1000;
let cache = null;
let inflight = null;

// Piezas ya renderizadas. Se guardan 60 s en memoria: la portada recibe muchas
// visitas y la consulta no debe repetirse en cada una. Coincide con la caché de
// CDN de /api/v1/public/stations, así que no añade más antigüedad que aquella.
export async function landingWeatherParts() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.parts;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const parts = renderPublicWeather(await loadPublicStations());
      cache = { at: Date.now(), parts };
      return parts;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Sustituye los marcadores del HTML por el contenido renderizado. Es puro
// (recibe las piezas) para poder probarlo sin base de datos.
export function injectLandingParts(html, parts) {
  if (!parts || html.includes('data-public-ready')) return html;
  const replaceElement = (source, id, replacement) =>
    source.replace(new RegExp(`<div id="${id}"[^>]*>[\\s\\S]*?</div>`), replacement);
  let out = replaceElement(html, 'local-weather-state',
    '<div id="local-weather-state" role="status" aria-live="polite"></div>');
  out = replaceElement(out, 'local-weather-card',
    `<div id="local-weather-card" data-public-ready="1">${parts.card}</div>`);
  out = replaceElement(out, 'public-comparison',
    `<div id="public-comparison" aria-live="polite">${parts.comparison}</div>`);
  out = replaceElement(out, 'public-evolution',
    `<div id="public-evolution" aria-live="polite">${parts.evolution}</div>`);
  return out;
}

// Carga + inyección, degradando con seguridad: si la base de datos no responde
// se sirve el HTML sin SSR y el cliente carga los datos como antes.
export async function injectLandingWeather(html) {
  try {
    return injectLandingParts(html, await landingWeatherParts());
  } catch {
    return html;
  }
}
