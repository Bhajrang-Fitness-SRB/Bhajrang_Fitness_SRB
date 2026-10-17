const CACHE_NAME = 'bhajrang-fitness-v4';
const APP_SHELL = ['/manifest.webmanifest', '/brand/icon-192.png', '/brand/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

// Navigation requests (the app shell / index.html) and hashed assets get different
// strategies: HTML must always be checked against the network first so a new
// deploy is picked up immediately. Hashed JS/CSS filenames change on every build,
// so caching them is always safe and speeds up repeat visits.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Only cache this site's own files. Never cache Supabase / API responses (they must always be live).
  if (new URL(event.request.url).origin !== self.location.origin) return;
  const isNavigation = event.request.mode === 'navigate' || event.request.url.endsWith('/index.html');

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response; })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Hashed build files (/assets/*) never change once published: serve from cache instantly.
  if (new URL(event.request.url).pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); }
        return response;
      }))
    );
    return;
  }

  // Everything else (manifests, icons, sw.js): fresh from the network, cached copy only when offline.
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
