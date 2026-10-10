import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const build = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
const dist = readFileSync(new URL('../public/dist/index.html', import.meta.url), 'utf8');

// CSS crítico: se incrusta en el HTML en lugar de cargarse como hoja aparte, para
// que la tarjeta SSR aparezca ya maquetada sin una petición que bloquee el render.
test('el build incrusta el CSS en el HTML', () => {
  assert.match(build, /\.replace\(CSS_LINK, `<style>\$\{cssMin\}<\/style>`\)/);
  // Si falta la hoja fuente, el build avisa en vez de seguir sin estilos.
  assert.match(build, /if \(!html\.includes\(CSS_LINK\)\) throw new Error/);
});

test('el HTML construido no enlaza una hoja de estilos que bloquee el render', () => {
  assert.match(dist, /<style>/);
  assert.doesNotMatch(dist, /rel="stylesheet" href="\/app\.css"/);
  assert.doesNotMatch(dist, /app-[0-9a-f]+\.css/);
  // El JS firmado y sus chunks se anuncian igual.
  assert.match(dist, /type="module" src="\/dist\/assets\/app-[A-Z0-9]+\.js"/);
  assert.match(dist, /modulepreload/);
});
