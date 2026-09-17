/**
 * sw.js - Service Worker для полной автономной работы на iPad, iPhone и Windows.
 */

const CACHE_NAME = 'reshebnik-v1.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './manifest.json',
  './icons/icon.svg',
  './api/catalog',
  './api/search'
];

// Установка: предварительное кэширование оболочки приложения
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Активация: очистка устаревших кэшей
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Обработка запросов: Cache-First для картинок и оболочки, Network-First для API
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Только GET-запросы
  if (req.method !== 'GET') return;

  // 1. Статические изображения из /images/ -> Cache First
  if (url.pathname.startsWith('/images/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // 2. Учебники и API -> Cache First с фоновым обновлением при наличии сети
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((networkRes) => {
          if (networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        }).catch(() => null);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Статические файлы фронтенда (HTML, CSS, JS) -> Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkRes) => {
        if (networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      }).catch(() => null);

      return cached || fetchPromise;
    })
  );
});

// Слушатель сообщений для принудительного офлайн-скачивания всей базы на iPad
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'CACHE_ALL_DATA') {
    const urlsToCache = event.data.urls || [];
    event.waitUntil(
      caches.open(CACHE_NAME).then(async (cache) => {
        let done = 0;
        for (const u of urlsToCache) {
          try {
            const match = await cache.match(u);
            if (!match) {
              const res = await fetch(u);
              if (res.ok) await cache.put(u, res);
            }
          } catch (e) {
            console.warn('SW cache failed for', u);
          }
          done++;
          // Отправляем прогресс обратно на клиент
          if (done % 20 === 0 || done === urlsToCache.length) {
            const clients = await self.clients.matchAll();
            clients.forEach((client) => {
              client.postMessage({
                type: 'SYNC_PROGRESS',
                done,
                total: urlsToCache.length
              });
            });
          }
        }
      })
    );
  }
});
