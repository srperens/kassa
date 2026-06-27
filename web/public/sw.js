// Service worker: precache the app shell so Kassa launches offline (e.g. airplane
// mode) even on the very first install. The precache list and build id below are
// injected at build time by scripts/inject-sw.mjs (Vite hashes asset names, so we
// can't hardcode them). API requests (/api/*) are never cached — sync hits the network.
const CACHE = 'kassa-__BUILD_ID__';
const PRECACHE = __PRECACHE_LIST__;

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return; // sync always goes to the network

  // Page loads: try network first (to pick up updates), fall back to the cached
  // shell when offline. This is what makes airplane-mode launch work.
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetch(req);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Assets (hashed, immutable): cache-first, populate on miss.
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
