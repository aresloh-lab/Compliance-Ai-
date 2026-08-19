const CACHE_NAME = "weight-coach-shell-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first, falling back to cache only when the network fails — so a
// deployed update is always what a user with connectivity actually gets,
// and the cache exists purely for offline use, not as an accidental
// permanent freeze of whatever was first ever loaded.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never cache API calls — always hit the live backend so data stays fresh.
  if (request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (request.method === "GET" && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
