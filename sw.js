/**
 * sw.js - Service Worker для полной автономной работы на iPad, iPhone и Windows.
 */

const CACHE_NAME = 'reshebnik-primary-v4.0';
// ВАЖНО: только статические файлы оболочки. api/* сюда не включаем:
// в APK (Capacitor) таких эндпоинтов нет, и cache.addAll падал бы целиком.
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css?v=primary-4.0',
  './fonts/fonts.css?v=primary-4.0',
  './js/app.js?v=primary-4.0',
  './js/billing.js?v=primary-4.0',
  './js/storage.js?v=primary-4.0',
  './manifest.json',
  './icons/icon.svg'
];

// Установка: отказоустойчивое предварительное кэширование оболочки.
// Каждый ресурс кэшируем отдельно — ошибка одного не срывает установку SW.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map((url) => cache.add(url).catch((err) => {
          console.warn('SW precache пропущен:', url, err);
        }))
      );
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

// Обработка запросов: Cache-First для картинок, Network-First для API и скриптов
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Только GET-запросы
  if (req.method !== 'GET') return;

  // 1. Статические изображения из images/ -> Cache First
  if (url.pathname.includes('/images/')) {
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

  // 2. Учебники и API -> Network First (с fallback на кэш при офлайне)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then((networkRes) => {
        if (networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      }).catch(() => {
        return caches.match(req);
      })
    );
    return;
  }

  // 3. Статические файлы фронтенда (HTML, CSS, JS) -> Network First (с fallback на кэш при офлайне)
  event.respondWith(
    fetch(req).then((networkRes) => {
      if (networkRes.ok) {
        const clone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
      }
      return networkRes;
    }).catch(() => {
      return caches.match(req);
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
