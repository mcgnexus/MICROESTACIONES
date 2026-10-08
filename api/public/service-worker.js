// Estrategia del shell:
//  · install precachea solo la portada (offline básico).
//  · navegación: red primero, cache como respaldo offline.
//  · estáticos (css/js/img/fuentes, incluidos los assets con hash del build):
//    stale-while-revalidate — respuesta instantánea desde caché y
//    actualización en segundo plano. Como los assets firmados cambian de URL
//    en cada build, no hay riesgo de mezclar versiones.
const CACHE_NAME = 'tecrural-shell-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('tecrural-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

const STATIC_ASSET = /\.(?:css|js|mjs|png|jpe?g|webp|avif|svg|ico|woff2?)$/i;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers?.has('Authorization')) return;

  if (request.mode === 'navigate') {
    if (['/privacidad', '/cookies', '/aviso-legal', '/contacto'].some((path) => url.pathname === path || url.pathname === `${path}.html`)) return;
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && response.type === 'basic' && ['/', '/index.html'].includes(url.pathname) && !url.search) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)));
      }
      return response;
    }).catch(async () => (await caches.match('/index.html')) || Response.error()));
    return;
  }

  if (url.search || url.pathname.endsWith('.html') || !STATIC_ASSET.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const refresh = fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    }).catch(() => undefined);
    return cached || (await refresh) || Response.error();
  })());
});
