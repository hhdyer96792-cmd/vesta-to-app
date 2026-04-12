const CACHE_NAME = 'vesta-to-v2';
const urlsToCache = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'ТО Веста', body: 'Напоминание о ТО' };
  const options = {
    body: data.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'vesta-to'
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});