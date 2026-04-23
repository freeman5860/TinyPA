const CACHE = "tinypa-shell-v1";
const SHELL = ["/", "/today", "/review", "/settings", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => null)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache API or auth
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data")) return;

  // Network first for HTML so users always get the latest UI when online.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy).catch(() => null));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/")))
    );
    return;
  }

  // Cache first for static assets.
  if (url.origin === location.origin && /\.(css|js|png|jpg|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy).catch(() => null));
          return res;
        })
      )
    );
  }
});
