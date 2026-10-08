const CACHE_NAME = 'tecrural-shell-v3';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/manifest.webmanifest',
  '/tecrural-icon.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/js/account.js',
  '/js/admin.js',
  '/js/admin-statistics.js',
  '/js/alerts.js',
  '/js/config.js',
  '/js/device-config.js',
  '/js/measurements.js',
  '/js/panel.js',
  '/js/statistics.js',
  '/js/stations.js',
  '/js/ui.js',
  '/js/landing.js',
  '/js/leads.js',
  '/js/notifications.js',
  '/js/farm-cards.js',
  '/js/farm-overview.js',
  '/js/farm-sim.js',
  '/js/notice-taxonomy.js',
  '/js/alert-copy.js',
  '/js/prospects.js',
  '/js/analytics.js',
  '/js/admin-analytics.js',
];
const SHELL_PATHS = new Set(SHELL_FILES.map((path) => new URL(path, self.location.origin).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('tecrural-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

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

  if (!SHELL_PATHS.has(url.pathname) || url.search || request.headers.has('Authorization')) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      return caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).then(() => response);
    }
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});
