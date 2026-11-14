// Service Worker: speichert die App-Dateien, damit sie auch offline startet.
// Bei Änderungen an der App die Versionsnummer erhöhen.
const CACHE = 'kleiderschrank-v6';
const FILES = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/ai.js', 'js/weather.js', 'js/outfits.js', 'js/colors.js', 'js/tryon.js', 'js/sport.js',
  'vendor/anthropic-sdk.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Eigene Dateien: erst Netz (für Updates), bei Offline aus dem Cache. Fremde APIs: nicht anfassen.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
