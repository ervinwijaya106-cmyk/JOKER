/**
 * SCORE CEKIH — sw.js (Service Worker)
 * Sadewa Corp | PWA Offline Support
 */

const CACHE_NAME = 'score-cekih-v7';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './images/background.png',
  './images/joker.png',
  './images/joker.ico',
  './images/card_1.png',
  './images/card_2.png',
  './images/card_3.png',
  './images/card_4.png',
  './audio/casino_bg.mp3',
  './audio/mulai_dari_0_ya_bapak.wav',
  './audio/kok_minus_terus_sih_gamau_menang.wav',
  './audio/klik.wav',
  './video/dragon.mp4',
  './video/tiger.mp4',
  './video/eagle.mp4',
  './video/cobra.mp4',
];

/* ===== INSTALL ===== */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache assets individually so one failure doesn't block all
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ===== ACTIVATE ===== */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ===== FETCH ===== */
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      // Fetch from network and cache dynamically
      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

/* ===== MESSAGE (skip waiting) ===== */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
