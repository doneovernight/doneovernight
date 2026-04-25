/*
 * DONEOVERNIGHT — Service Worker
 * Minimal offline support. Caches the shell, network-first for everything else.
 */
const VERSION = 'v5.0.0';
const SHELL_CACHE = `overnight-shell-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/trust.html',
  '/enterprise.html',
  '/portal.html',
  '/terms.html',
  '/privacy.html',
  '/refund.html',
  '/shared.css',
  '/manifest.webmanifest'
];

// Install — pre-cache the shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      // Use addAll but catch individual failures so SW still installs
      return Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => {
            // Silent fail per-asset
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first, fall back to cache
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only GET + same-origin or our CDN fonts
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Clone and cache HTML and our own assets
        if (res.ok && (req.url.startsWith(self.location.origin))) {
          const resClone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
  );
});
