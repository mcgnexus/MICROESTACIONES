import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const publicDir = new URL('../public/', import.meta.url);

test('PWA has a standalone Spanish manifest with install icons', async () => {
  const [manifestText, html, icon192, icon512] = await Promise.all([
    readFile(new URL('manifest.webmanifest', publicDir), 'utf8'),
    readFile(new URL('index.html', publicDir), 'utf8'),
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

test('el shell incluye todas las dependencias importadas del frontend', async () => {
  const source = await readFile(new URL('service-worker.js', publicDir), 'utf8');
  const cached = new Set([...source.matchAll(/'((?:\/js\/|\/app\.)[^']+)'/g)].map((m) => m[1]));
  const visited = new Set();
  async function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    assert.ok(cached.has(path), `${path} debe estar disponible sin conexión`);
    const text = await readFile(new URL(`.${path}`, publicDir), 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      await visit(new URL(match[1], `https://app.test${path}`).pathname);
    }
  }
  await visit('/app.js');
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
