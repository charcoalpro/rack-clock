/* Rack Clock — cache-first service worker.
   Bump CACHE on every deploy: that single string is the whole release process. */

const CACHE = 'rack-clock-v2';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // Only same-origin GETs are ours to serve.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Installed PWAs can launch with a tracking query string (?source=pwa);
  // ignoring the search string keeps those launches on the cached shell.
  const opts = request.mode === 'navigate' ? { ignoreSearch: true } : undefined;

  event.respondWith(
    caches.match(request, opts).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline and unseen: any navigation still lands on the app shell.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    })
  );
});
