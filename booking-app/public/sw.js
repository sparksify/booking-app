// Kanso PWA Service Worker
// Caches the app shell so it loads instantly and shows a splash when offline

const CACHE_NAME = "kanso-mobile-v1";

// App shell assets to pre-cache
const SHELL_ASSETS = [
  "/mobile",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ─── INSTALL: pre-cache shell ─────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ─── ACTIVATE: clear old caches ───────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── FETCH: network-first for API, cache-first for shell ──────────────────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Always go network-first for API routes — never serve stale data
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "Offline — no cached data available" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Cache-first for the app shell
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses for shell assets
        if (event.request.method === "GET" && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
