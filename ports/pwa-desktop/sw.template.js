const CACHE_NAME = 'cnvs-pwa-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];
const STATIC_EXT_RE = /\.(?:js|css|png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf|json|webmanifest)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    (async () => {
      if (req.mode === 'navigate') {
        try {
          const network = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put('/index.html', network.clone()).catch(() => undefined);
          return network;
        } catch {
          return (await caches.match('/index.html')) || Response.error();
        }
      }

      if (!STATIC_EXT_RE.test(url.pathname)) {
        return fetch(req);
      }

      const cached = await caches.match(req);
      if (cached) {
        void fetch(req)
          .then((response) => {
            if (!response || response.status !== 200) return;
            return caches.open(CACHE_NAME).then((cache) => cache.put(req, response.clone()));
          })
          .catch(() => undefined);
        return cached;
      }

      const network = await fetch(req);
      if (network && network.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, network.clone()).catch(() => undefined);
      }
      return network;
    })()
  );
});
