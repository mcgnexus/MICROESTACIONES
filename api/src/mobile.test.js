import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);
const read = (name) => readFile(new URL(name, publicDir), 'utf8');

test('el viewport permite cubrir el notch y la barra respeta la zona segura', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('app.css')]);
  assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(css, /\.topbar \{ padding-top: max\(8px, env\(safe-area-inset-top\)\)/);
  assert.match(css, /\.mobile-tab-bar[^}]*env\(safe-area-inset-bottom/);
});

test('el aviso sin conexión queda visible y no tapa la barra de navegación', async () => {
  const css = await read('app.css');
  assert.match(css, /\.connection-notice \{[^}]*position: sticky/);
  // Al desconectar, la barra deja de fijarse para no solaparse con el aviso.
  assert.match(css, /body\.data-offline \.topbar \{ position: static; \}/);
});

test('los controles táctiles mantienen tamaño cómodo y las tablas se desplazan', async () => {
  const css = await read('app.css');
  assert.match(css, /button, \.button-link, input:not\(\[type="checkbox"\]\), select \{ min-height: 44px; \}/);
  assert.match(css, /\.table-wrap \{ -webkit-overflow-scrolling: touch; \}/);
  assert.match(css, /td\.row-actions \.button-link \{ width: 100%/);
});

test('la medición opcional contrasta dentro del pie oscuro', async () => {
  const css = await read('app.css');
  assert.match(css, /\.analytics-choice \{[^}]*background: #fff[^}]*color: #1e2c24/);
  assert.match(css, /\.analytics-choice a \{ color: #1f6241/);
});

test('los contenedores públicos dejan de ser fila de carga al recibir contenido', async () => {
  const landing = await read('js/landing.js');
  // El contenedor nace con public-loading (display:flex); al cargar se retira la
  // clase para que el contenido fluya en bloque y no desborde en horizontal.
  assert.match(landing, /classList\.remove\('public-loading'\)/);
  assert.match(landing, /settle\(root\.querySelector\('#public-comparison'\)\)/);
  assert.match(landing, /settle\(root\.querySelector\('#public-evolution'\)\)/);
});

test('el botón principal tiene fondo y contraste, no sólo al pasar el ratón', async () => {
  const css = await read('app.css');
  assert.match(css, /\.cta\{[^}]*background:#1f6241[^}]*color:white/);
});

test('las secciones públicas se apilan en una columna en móvil', async () => {
  const css = await read('app.css');
  for (const selector of ['.public-chart-grid', '.farm-value-grid', '.tools-preview']) {
    const block = css.split('@media(max-width:760px){').find((part) => part.includes(selector) && part.includes('grid-template-columns:1fr'));
    assert.ok(block, `${selector} debe pasar a una columna en móvil`);
  }
});
