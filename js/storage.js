/**
 * storage.js
 * Локальное хранилище данных на основе IndexedDB и Cache Storage
 * для 100% автономной работы на iPad, iPhone и Windows.
 */

const DB_NAME = 'TeacherReshebnikDB';
const DB_VERSION = 2;

// Срок свежести кэшированной книги: 7 дней
const BOOK_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

class AppStorage {
  constructor() {
    this.db = null;
    this.initPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB не поддерживается');
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Очищаем старые кэшированные книги, чтобы применить обновления
        if (db.objectStoreNames.contains('books')) {
          db.deleteObjectStore('books');
        }
        if (db.objectStoreNames.contains('meta')) {
          db.deleteObjectStore('meta');
        }
        db.createObjectStore('books', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Ошибка инициализации IndexedDB:', event.target.error);
        resolve(null);
      };
    });
  }

  async getFromDB(storeName, key) {
    await this.initPromise;
    if (!this.db) return null;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async saveToDB(storeName, value) {
    await this.initPromise;
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        store.put(value);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  // Получение каталога (сначала IndexedDB, затем fetch)
  async getCatalog() {
    const cached = await this.getFromDB('meta', 'catalog');
    if (cached && cached.data) {
      // Фоновое обновление, если онлайн
      if (navigator.onLine) {
        fetch('/api/catalog')
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data) this.saveToDB('meta', { key: 'catalog', data });
          }).catch(() => {});
      }
      return cached.data;
    }

    try {
      // Сначала пробуем относительный локальный файл (для Electron и iOS бандла)
      let res = await fetch('./data/catalog.json').catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('/api/catalog').catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        await this.saveToDB('meta', { key: 'catalog', data });
        return data;
      }
    } catch (e) {
      console.warn('Не удалось загрузить каталог:', e);
    }
    return [];
  }

  // Загрузка книги: локальный статический файл, затем API
  async fetchBookFromNetwork(bookId) {
    let res = await fetch(`./data/books/${bookId}.json?t=${Date.now()}`).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`/api/book/${bookId}?t=${Date.now()}`).catch(() => null);
    }
    if (res && res.ok) {
      try {
        return await res.json();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // Фоновое обновление книги в IndexedDB (не блокирует выдачу из кэша)
  refreshBookInBackground(bookId) {
    if (!navigator.onLine) return;
    this.fetchBookFromNetwork(bookId).then((data) => {
      if (data && data.parts) {
        data.fetchedAt = Date.now();
        this.saveToDB('books', data);
      }
    }).catch(() => {});
  }

  // Получение учебника: сначала IndexedDB (если свежее 7 дней), сеть — в фоне
  // или при устаревшем/отсутствующем кэше. Офлайн кэш отдаётся всегда.
  async getBook(bookId) {
    const cached = await this.getFromDB('books', bookId);
    const hasCache = !!(cached && cached.parts);

    // Нет сети — кэш отдаётся всегда
    if (hasCache && !navigator.onLine) {
      return cached;
    }

    // Свежий кэш (младше 7 дней): отдаем сразу, обновление — параллельно
    const fetchedAt = cached && typeof cached.fetchedAt === 'number' ? cached.fetchedAt : 0;
    if (hasCache && fetchedAt && (Date.now() - fetchedAt) < BOOK_FRESH_MS) {
      this.refreshBookInBackground(bookId);
      return cached;
    }

    // Нет кэша или он устарел: сеть, затем кэш
    try {
      const data = await this.fetchBookFromNetwork(bookId);
      if (data && data.parts) {
        data.fetchedAt = Date.now();
        await this.saveToDB('books', data);
        return data;
      }
    } catch (e) {
      console.warn(`Ошибка сети при загрузке ${bookId}, используем локальный кэш:`, e);
    }

    return hasCache ? cached : null;
  }

  // Получение поискового индекса
  async getSearchIndex() {
    const cached = await this.getFromDB('meta', 'search_index');
    if (cached && cached.data) return cached.data;

    try {
      let res = await fetch('./data/search_index.json').catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('/api/search').catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        await this.saveToDB('meta', { key: 'search_index', data });
        return data;
      }
    } catch (e) {
      console.warn('Не удалось загрузить индекс поиска:', e);
    }
    return [];
  }

  // Проверка статуса офлайн-готовности
  async isFullySynced() {
    const status = await this.getFromDB('meta', 'sync_status');
    return status && status.completed === true;
  }

  // Полная офлайн-синхронизация для iPad/iPhone
  async syncAll(progressCallback) {
    if (progressCallback) progressCallback({ status: 'start', text: 'Загрузка каталога и книг...' });

    const catalog = await this.getCatalog();
    const urlsToCache = [
      './',
      './index.html',
      './css/style.css',
      './fonts/fonts.css',
      './js/app.js',
      './js/storage.js',
      './js/billing.js',
      './manifest.json',
      './icons/icon.svg',
      './api/catalog',
      './api/search'
    ];

    // 1. Скачиваем все книги в IndexedDB
    for (let i = 0; i < catalog.length; i++) {
      const b = catalog[i];
      if (progressCallback) {
        progressCallback({
          status: 'books',
          text: `Сохранение базы: ${b.title}...`,
          current: i + 1,
          total: catalog.length
        });
      }
      const bookData = await this.getBook(b.id);
      urlsToCache.push(`/api/book/${b.id}`);
    }

    // 2. Скачиваем список картинок
    if (progressCallback) progressCallback({ status: 'images_list', text: 'Получение списка иллюстраций...' });
    let imageUrls = [];
    try {
      const imgRes = await fetch('/api/all-images');
      if (imgRes.ok) imageUrls = await imgRes.json();
    } catch (e) {}

    urlsToCache.push(...imageUrls);

    // 3. Отправляем в Service Worker для кэширования в Cache Storage
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      if (progressCallback) progressCallback({ status: 'caching', text: 'Кэширование медиа-файлов на устройство...' });

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SYNC_PROGRESS') {
          if (progressCallback) {
            progressCallback({
              status: 'progress',
              text: `Кэширование иллюстраций: ${event.data.done} из ${event.data.total}`,
              current: event.data.done,
              total: event.data.total
            });
          }
        }
      });

      navigator.serviceWorker.controller.postMessage({
        action: 'CACHE_ALL_DATA',
        urls: urlsToCache
      });
    }

    await this.saveToDB('meta', { key: 'sync_status', completed: true, date: new Date().toISOString() });
    if (progressCallback) progressCallback({ status: 'done', text: 'Все материалы сохранены на устройство!' });
  }
}

window.appStorage = new AppStorage();
