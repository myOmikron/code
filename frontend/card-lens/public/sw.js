const CACHE = "card-lens-v15";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  // Activate the updated worker immediately instead of waiting for all tabs to close.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Network-first for the app shell (so code deploys reach clients without a cache bump) and
  // for files that change every index build. Cache is the offline fallback.
  const networkFirst =
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/data/all-card-index/manifest.json") ||
    url.pathname.endsWith("/data/all-card-index/routing.json.gz") ||
    url.pathname.endsWith("/data/all-card-index/names.json.gz");

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => (await caches.match(event.request)) ?? (await caches.match("/"))),
    );
    return;
  }

  // Cache-first for hashed build assets, set shards, and the self-hosted OCR runtime.
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }),
    ),
  );
});
