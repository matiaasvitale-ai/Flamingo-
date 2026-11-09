/* Flamingo — service worker: guarda la app para que abra rápido y también sin internet.
   Los datos NUNCA pasan por acá: van directo a GitHub. Al publicar una versión nueva, subí el número de VERSION. */
const VERSION = "flamingo-web-2";
const ARCHIVOS = ["./", "index.html", "app.js", "core.js", "archivos.js", "lector.js", "store.js", "config.js", "manifest.webmanifest",
  "icono-192.png", "icono-512.png", "icono-mask.png", "lib/pdf.js", "lib/pdf.worker.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  /* primero la red (así siempre ves la última versión); sin internet, la copia guardada */
  e.respondWith(fetch(r).then(resp => { if (resp.ok) { const c = resp.clone(); caches.open(VERSION).then(ca => ca.put(r, c)); } return resp; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(x => x || (r.mode === "navigate" ? caches.match("index.html") : undefined))));
});
