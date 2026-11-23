// Service Worker — installierbar + offline-fähig.
// NETWORK-FIRST für eigene Dateien: online immer frische Version (kein "alte Version klebt"),
// offline aus dem Cache. Fremd-Origin (Open Food Facts, CDN) immer direkt aus dem Netz.
const CACHE = "fittracker-v24";
const SHELL = ["./", "index.html", "favicon.svg", "style.css", "app.js", "manifest.json", "icon-192.png",
  "fonts/outfit-latin-400-normal.woff2", "fonts/outfit-latin-500-normal.woff2", "fonts/outfit-latin-600-normal.woff2",
  "fonts/ibm-plex-mono-latin-400-normal.woff2", "fonts/ibm-plex-mono-latin-500-normal.woff2"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // OFF/CDN: nicht abfangen
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
