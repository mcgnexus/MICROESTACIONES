import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Ejecuta el arranque de navegación real con una URL y un historial de navegador.
// Incluye la normalización de rutas que precede a la captura del enlace.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const navigation = app.slice(
  app.indexOf('const PATH_ROUTES ='),
  app.indexOf("$('#magic-confirm-button')?.addEventListener"),
);

async function openLink(url) {
  const location = new URL(url);
  let loginShown = 0;
  const context = vm.createContext({
    URLSearchParams,
    location,
    history: { replaceState: (_state, _title, path) => { location.href = new URL(path, location).href; } },
    pendingMagicToken: null,
    showLogin: () => { loginShown += 1; },
    api: () => { throw new Error('El enlace no debe consumirse antes de confirmar'); },
  });
  vm.runInContext(navigation, context);
  const captured = await vm.runInContext('handleMagicReturn()', context);
  return { location, token: context.pendingMagicToken, loginShown, captured };
}

test('abrir /entrar con token conserva el enlace hasta mostrar la confirmación', async () => {
  const result = await openLink('https://example.test/entrar?token=token-de-prueba&next=%23%2Fpanel');
  assert.equal(result.captured, true);
  assert.equal(result.token, 'token-de-prueba');
  assert.equal(result.loginShown, 1);
  assert.equal(result.location.pathname, '/entrar');
  assert.equal(result.location.hash, '#/entrar');
  assert.equal(result.location.search, '', 'el token se retira tras capturarlo');
});

test('abrir un enlace con hash también captura y retira el token sin consumirlo', async () => {
  const result = await openLink('https://example.test/entrar?token=otro-token#/entrar');
  assert.equal(result.token, 'otro-token');
  assert.equal(result.location.search, '');
  assert.equal(result.captured, true);
});

test('la entrada sin enlace sigue mostrando el recorrido normal', async () => {
  const result = await openLink('https://example.test/entrar');
  assert.equal(result.captured, false);
  assert.equal(result.token, null);
  assert.equal(result.loginShown, 0);
  assert.equal(result.location.hash, '#/entrar');
});
