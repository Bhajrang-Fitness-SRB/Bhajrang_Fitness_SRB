// Bhajrang Fitness SRB — Offline Service Worker
// Caches the app shell so /warrior (Member App) and /kiosk keep working with no signal.
// Live data (Supabase, /api/*) always goes to the network — never cached, so figures
// stay accurate the moment connectivity returns.

const CACHE_NAME = 'bhajrang-shell-v1';
const OFFLINE_URL = '/warrior';

const APP_SHELL = [
  '/warrior',
  '/kiosk',
  '/static/manifest.json',
  '/static/assets/app_icon.png',
  '/static/assets/app_logo.png',
  '/static/assets/login_bg.png.png',
  '/static/assets/welcome_animation.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never cache API calls or Supabase traffic — always fetch fresh, fall through to
  // a JSON error the frontend can detect if truly offline.
  if (request.url.includes('/api/') || request.url.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ status: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // App shell: try network first (to pick up updates), fall back to cache, then offline page.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
  );
});
