const CACHE_NAME = 'beesmart-v11';
const ASSETS_TO_CACHE = [
  './',
  './index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Jangan intervensi permintaan API (folder /api/)
  if (url.pathname.includes('/api/')) return;

  // Navigasi: network-first supaya index.html terbaru yang dipakai,
  // cache hanya sebagai fallback saat offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('./index.html', copy.clone());
              cache.put(event.request, copy);
            });
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html');
          })
        )
    );
    return;
  }

  // Aset lokal & CDN: cache dulu, perbarui di background,
  // hanya simpan respons sukses (status 200).
  if (url.origin === self.location.origin || url.host.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkPromise = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkPromise;
      })
    );
  }
});
