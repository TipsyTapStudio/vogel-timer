/**
 * sw.js — Service Worker for VOGEL-TIMER PWA.
 * Cache-first strategy for app shell, network-first for fonts.
 */

const CACHE_NAME = 'vogel-timer-v2';
const APP_SHELL = [
  './',
  './index.html',
  './dist/bundle.js',
  './dist/timer-worker.js',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './logo.svg',
];

// Install: pre-cache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for external resources
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // External resources (fonts): network-first with cache fallback
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
