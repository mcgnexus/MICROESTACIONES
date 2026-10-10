import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const publicSource = read('../src/public.js');
const weatherSource = read('../src/weather.js');
const app = read('../public/app.js');
const ui = read('../public/js/ui.js');

// Carga de la portada pública: no esperar a la API externa, cachear en el CDN y
// no bloquear el primer pintado con la comprobación de sesión.

test('los datos públicos se cachean en el CDN con revalidación en segundo plano', () => {
  // La ventana de refresco real es de ~30 min; 60 s de caché en el borde evitan
  // recalcular en cada visita sin falsear la antigüedad, que va con la hora del dato.
  assert.match(publicSource, /Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300'/);
  assert.match(publicSource, /CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300'/);
  // Se aplica a las dos respuestas públicas.
  assert.equal((publicSource.match(/s-maxage=60, stale-while-revalidate=300/g) || []).length, 4,
    'faltan cabeceras de caché en stations o summary');
});

test('una petición pública no espera a un proveedor meteorológico externo', () => {
  // weatherForDevice puede servir el snapshot cacheado y refrescar en segundo plano.
  assert.match(weatherSource, /weatherForDevice\(device, \{ backgroundRefresh = false \} = \{\}\)/);
  assert.match(weatherSource, /const canDefer = backgroundRefresh && \(openMeteo \|\| aemet\)/);
  assert.match(weatherSource, /Promise\.all\(jobs\)\.catch\(\(\) => \{\}\)/);
  // La ruta pública lo activa.
  assert.match(publicSource, /\}, \{ backgroundRefresh: true \}\)\.catch\(\(\) => null\)/);
});

test('la última lectura pública usa dos joins laterales en vez de cuatro subconsultas', () => {
  assert.match(publicSource, /\) m_temp ON true/);
  assert.match(publicSource, /\) m_hum ON true/);
  assert.match(publicSource, /m_temp\.temperature_c, m_temp\.temperature_observed_at, m_hum\.humidity_pct, m_hum\.humidity_observed_at/);
  assert.doesNotMatch(publicSource, /\) m ON true/);
});

test('la comprobación inicial de sesión no dispara el formulario de acceso', () => {
  // Sin esto, un visitante anónimo veía un parpadeo del login antes de la portada.
  assert.match(ui, /const \{ skipUnauthorized, \.\.\.fetchOptions \} = options/);
  assert.match(ui, /if \(response\.status === 401 && !skipUnauthorized\) onUnauthorized\(\)/);
  assert.match(app, /await api\('\/api\/v1\/me', \{ skipUnauthorized: true \}\)/);
});

test('la portada pública se pinta sin esperar a /me y se reconcilia después', () => {
  assert.match(app, /const meReady = loadMe\(\)/);
  assert.match(app, /const publicFirst = !magicReturn && isRouteFragment\(\)/);
  assert.match(app, /if \(publicFirst\) \{\s*showLanding\(\)/);
  assert.match(app, /if \(publicFirst && session\.me\) \{/);
  // Las rutas privadas siguen esperando a la sesión antes de enrutar.
  assert.match(app, /\} else if \(!publicFirst\) \{\s*await route\(\);/);
});
