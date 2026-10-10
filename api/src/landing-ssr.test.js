import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPublicWeather } from '../public/js/landing.js';
import { injectLandingParts } from '../src/landing-ssr.js';

const landing = readFileSync(new URL('../public/js/landing.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

const urban = {
  name: 'Casco', locationType: 'urbano', zone: 'Huéscar',
  temperatureFreshness: 'fresh', temperatureC: 12.3, temperatureObservedAt: '2026-10-07T12:00:00Z',
  humidityFreshness: 'fresh', humidityPct: 61, humidityObservedAt: '2026-10-07T12:00:00Z',
};

// El HTML mínimo con los cuatro marcadores que rellena el SSR.
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

test('sin estación urbana devuelve estados vacíos, no una tarjeta inventada', () => {
  const parts = renderPublicWeather([]);
  assert.match(parts.card, /No hay una medición urbana pública/);
  assert.match(parts.comparison, /Aún no hay una estación urbana con permiso/);
});

test('injectLandingParts rellena los marcadores y marca la tarjeta como prerenderizada', () => {
  const parts = renderPublicWeather([urban]);
  const html = injectLandingParts(shell(), parts);
  // La tarjeta se incrusta y queda marcada para que el cliente no repita la petición.
  assert.match(html, /<div id="local-weather-card" data-public-ready="1">/);
  assert.match(html, /12,3 °C/);
  // Desaparece el estado de carga y su clase de fila.
  assert.doesNotMatch(html, /id="local-weather-state" class="public-loading"/);
  assert.doesNotMatch(html, /Cargando observaciones…/);
  assert.doesNotMatch(html, /Cargando la serie reciente…/);
  // Idempotente: una segunda pasada no vuelve a tocar el HTML.
  assert.equal(injectLandingParts(html, parts), html);
});

test('sin datos (parts nulos) el HTML se sirve tal cual', () => {
  const original = shell();
  assert.equal(injectLandingParts(original, null), original);
});

test('el cliente omite la petición inicial cuando el servidor ya pintó la lectura', () => {
  assert.match(landing, /if \(!document\.querySelector\('#local-weather-card\[data-public-ready\]'\)\) loadPublicWeather\(\)/);
});

test('el servidor inyecta el SSR y cachea la portada pública en el borde', () => {
  assert.match(server, /import \{ injectLandingWeather \} from '\.\/landing-ssr\.js'/);
  assert.match(server, /html = await injectLandingWeather\(html\)/);
  assert.match(server, /injectLandingWeather\(publicMetadata/);
  assert.match(server, /PUBLIC_PAGES\[path\] && !req\.query\.token/);
});
