import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
