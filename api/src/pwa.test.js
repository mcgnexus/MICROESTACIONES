import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const publicDir = new URL('../public/', import.meta.url);

test('PWA has a standalone Spanish manifest with install icons', async () => {
  const [manifestText, html, icon192, icon512] = await Promise.all([
    readFile(new URL('manifest.webmanifest', publicDir), 'utf8'),
    readFile(new URL('../views/index.html', import.meta.url), 'utf8'),
    readFile(new URL('pwa-192.png', publicDir)),
    readFile(new URL('pwa-512.png', publicDir)),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.name, 'TecRural · Estaciones');
  assert.equal(manifest.lang, 'es');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.deepEqual([icon192.readUInt32BE(16), icon192.readUInt32BE(20)], [192, 192]);
  assert.deepEqual([icon512.readUInt32BE(16), icon512.readUInt32BE(20)], [512, 512]);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
});

test('PWA service worker never caches API responses and app registers it', async () => {
  const [serviceWorker, app] = await Promise.all([
    readFile(new URL('service-worker.js', publicDir), 'utf8'),
    readFile(new URL('app.js', publicDir), 'utf8'),
  ]);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(serviceWorker, /request\.mode === 'navigate'/);
  assert.match(app, /serviceWorker\.register\('\/service-worker\.js'\)/);
});

test('el service worker cachea los estáticos al primer uso (stale-while-revalidate)', async () => {
  const source = await readFile(new URL('service-worker.js', publicDir), 'utf8');
  // Los estáticos —incluido cualquier módulo del frontend— quedan en caché
  // tras la primera visita, así que el offline no depende de una lista a mano.
  assert.ok(source.includes(String.raw`STATIC_ASSET = /\.(?:css|js`), 'la regex de estáticos cubre css y js');
  assert.ok(source.includes('cache.match(request)'), 'responde desde caché si existe');
  assert.ok(source.includes('cache.put(request, response.clone())'), 'actualiza la caché en segundo plano');
  // La portada se precachea para poder abrir la app sin conexión.
  assert.ok(source.includes("addAll(['/'])"), 'precachea la portada');
});

test('las páginas legales y las API no se interceptan ni sobrescriben el shell', async () => {
  const source = await readFile(new URL('service-worker.js', publicDir), 'utf8');
  const handlers = {};
  vm.runInNewContext(source, { URL, self: { location: { origin: 'https://app.test' },
    addEventListener: (name, fn) => { handlers[name] = fn; } } });
  for (const path of ['/privacidad', '/cookies.html', '/aviso-legal', '/contacto', '/api/v1/me']) {
    let intercepted = false;
    handlers.fetch({ request: { url: `https://app.test${path}`, method: 'GET', mode: 'navigate' },
      respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
});

test('la instalación se ofrece tras consultar datos o iniciar sesión, y el logout limpia el estado privado', async () => {
  const [app, landing] = await Promise.all([
    readFile(new URL('app.js', publicDir), 'utf8'),
    readFile(new URL('js/landing.js', publicDir), 'utf8'),
  ]);
  // El botón no aparece solo con beforeinstallprompt: exige elegibilidad real.
  assert.match(app, /function offerInstallIfEligible/);
  assert.match(app, /installEligible/);
  assert.match(landing, /tecrural:data-loaded/);
  assert.match(app, /addEventListener\('tecrural:data-loaded'/);
  // El cierre de sesión vacía el DOM del panel y el estado en memoria.
  assert.match(app, /function clearPrivateState/);
  assert.match(app, /clearPrivateState\(\)/);
  assert.match(app, /viewRoot\.innerHTML = ''/);
});
