import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPublicWeather, renderLocalWeatherCard, selectUrbanStation } from '../public/js/landing.js';
import { injectLandingParts } from '../src/landing-ssr.js';

const landing = readFileSync(new URL('../public/js/landing.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

const urban = {
  name: 'Casco', locationType: 'urbano', zone: 'Huéscar',
  temperatureFreshness: 'fresh', temperatureC: 12.3, temperatureObservedAt: '2026-10-07T12:00:00Z',
  humidityFreshness: 'fresh', humidityPct: 61, humidityObservedAt: '2026-10-07T12:00:00Z',
};

// El HTML mínimo con los marcadores que toca el SSR.
const shell = () => `<!doctype html><body>
  <div id="local-weather-state" class="public-loading" role="status" aria-live="polite"><span class="loading-dot" aria-hidden="true"></span> Cargando las últimas mediciones públicas…</div>
  <div id="local-weather-card"></div>
  <div id="public-comparison" class="public-loading" aria-live="polite">Cargando observaciones…</div>
  <div id="public-evolution" class="public-loading" aria-live="polite">Cargando la serie reciente…</div>
  </body>`;

test('renderPublicWeather reúne tarjeta, comparación y evolución de la estación urbana', () => {
  const parts = renderPublicWeather([urban, { name: 'Finca', locationType: 'finca' }]);
  assert.match(parts.card, /12,3 °C/);
  assert.match(parts.card, /public-now-card/);
  assert.match(parts.card, /Medido hace/);
  assert.match(parts.comparison, /AEMET/);
  assert.match(parts.evolution, /chart-box|No hay suficientes mediciones reales/);
  assert.equal(parts.observedAt, '2026-10-07T12:00:00Z');
});

test('sin estación urbana la tarjeta explica el vacío, no inventa un dato', () => {
  const card = renderLocalWeatherCard(selectUrbanStation([]));
  assert.match(card, /No hay una medición urbana pública/);
});

test('injectLandingParts incrusta solo la tarjeta y marca el contenedor', () => {
  const card = renderLocalWeatherCard(urban);
  const html = injectLandingParts(shell(), card);
  assert.match(html, /<div id="local-weather-card" data-public-ready="1">/);
  assert.match(html, /12,3 °C/);
  // El estado de carga desaparece.
  assert.doesNotMatch(html, /class="public-loading" role="status"/);
  assert.doesNotMatch(html, /Cargando las últimas mediciones/);
  // La comparación y la evolución NO se incrustan (las carga el cliente): el HTML
  // no arrastra la gráfica de 24 h y el LCP no depende de JS.
  assert.match(html, /<div id="public-comparison" class="public-loading" aria-live="polite">Cargando observaciones…<\/div>/);
  assert.match(html, /<div id="public-evolution" class="public-loading" aria-live="polite">Cargando la serie reciente…<\/div>/);
  // Idempotente: una segunda pasada no vuelve a tocar el HTML.
  assert.equal(injectLandingParts(html, card), html);
});

test('sin tarjeta (SSR no disponible) el HTML se sirve tal cual', () => {
  const original = shell();
  assert.equal(injectLandingParts(original, null), original);
});

test('el cliente siempre pide los datos, pero un fallo no borra la tarjeta del servidor', () => {
  // La comparación y la evolución siguen viniendo del cliente.
  assert.match(landing, /mountLeadForms\(\);\s*loadPublicWeather\(\);/);
  // Un fallo posterior conserva la última lectura pintada por el servidor.
  assert.match(landing, /if \(card && !card\.hasAttribute\('data-public-ready'\)\) card\.innerHTML = ''/);
});

test('el servidor inyecta el SSR y cachea la portada pública en el borde', () => {
  assert.match(server, /import \{ injectLandingWeather \} from '\.\/landing-ssr\.js'/);
  assert.match(server, /html = await injectLandingWeather\(html\)/);
  assert.match(server, /injectLandingWeather\(publicMetadata/);
  assert.match(server, /PUBLIC_PAGES\[path\] && !req\.query\.token/);
});
