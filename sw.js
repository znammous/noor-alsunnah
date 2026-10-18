// Service worker: makes «نور السنة» installable and keeps what the reader has opened available offline.
// V is stamped by scripts/stamp.py on every publish; a new V drops the previous version's caches.
const V = "86dfb9fdc9";
const SHELL = `shell-${V}`, DATA = `data-${V}`, FONTS = "fonts";
const PRECACHE = [
  "./", "index.html", "app.html", "manifest.webmanifest",
  `style.css?v=${V}`, `landing.css?v=${V}`, `app.js?v=${V}`,
  `data/meta.json?v=${V}`, `data/stats.json?v=${V}`,
  "vendor/cytoscape.min.js", "vendor/dagre.min.js", "vendor/cytoscape-dagre.js",
  "icons/icon-192.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA && k !== FONTS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// the response of `req` from the network, saved into cache `name` when it succeeded
const fetchInto = (name, req) => fetch(req).then((res) => {
  if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(name).then((c) => c.put(req, copy)); }
  return res;
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // pages: always the newest when online, the saved copy when not
  if (req.mode === "navigate") {
    e.respondWith(fetchInto(SHELL, req).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match(url.pathname.endsWith("app.html") ? "app.html" : "index.html"))));
    return;
  }
  // Google Fonts: the saved copy at once, refreshed in the background
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then((c) => c.match(req).then((hit) => {
      const net = fetchInto(FONTS, req).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // the site's own files carry ?v=: a saved copy is never stale, so serve it first
  e.respondWith(caches.match(req).then((hit) => hit || fetchInto(url.pathname.includes("/data/") ? DATA : SHELL, req)));
});
