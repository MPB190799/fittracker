// Minimaler Service Worker — macht die App installierbar + cached die Shell offline.
// Relative Pfade, damit es auch unter github.io/<repo>/ funktioniert.
const CACHE = "fittracker-v2";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.json", "icon-192.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Fremd-Origin (Open Food Facts, CDN) immer frisch aus dem Netz
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
