import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);
const read = (name) => readFile(new URL(name, publicDir), 'utf8');
const readView = (name) => readFile(new URL(`../views/${name}`, import.meta.url), 'utf8');

test('el viewport permite cubrir el notch y la barra respeta la zona segura', async () => {
  const [html, css] = await Promise.all([readView('index.html'), read('app.css')]);
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

test('los umbrales propios no se presentan como si activaran avisos', async () => {
  const account = await read('js/account.js');
  // El formulario operativo de preferencias ya no ofrece campos de umbral.
  const prefsForm = account.slice(
    account.indexOf('<form data-prefs-form'),
    account.indexOf('</form>', account.indexOf('<form data-prefs-form')),
  );
  assert.doesNotMatch(prefsForm, /name="frost_c"/);
  assert.doesNotMatch(prefsForm, /name="heat_c"/);
  assert.doesNotMatch(prefsForm, /umbrales propios/i);

  // Los umbrales viven en su propia sección, con el efecto declarado ANTES del
  // campo: el usuario sabe que no dispara avisos sin tener que leer una nota.
  const thresholds = account.slice(
    account.indexOf('<form data-thresholds-form'),
    account.indexOf('</form>', account.indexOf('<form data-thresholds-form')),
  );
  assert.match(thresholds, /name="frost_c"/);
  assert.match(thresholds, /name="heat_c"/);
  const declared = account.indexOf('no cambian los avisos que recibes');
  assert.ok(declared > -1, 'falta la declaración de que no cambian los avisos');
  assert.ok(declared < account.indexOf('name="frost_c"'), 'la declaración va después del campo');
  // Y no se ofrece un "Guardar" que sugiera un ajuste activo.
  assert.match(thresholds, /Enviar para el equipo/);
  assert.doesNotMatch(thresholds, /Guardar/);
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
