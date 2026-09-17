/**
 * server.js
 * Локальный HTTP-сервер для Windows, iPad и iPhone.
 * Полностью автономен (работает на встроенных модулях Node.js).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getLocalIpAddress, printConnectionBanner } = require('./qr_helper');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const BOOKS_DIR = path.join(DATA_DIR, 'books');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS-заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // 1. API: Каталог учебников
  if (pathname === '/api/catalog') {
    const catalogPath = path.join(DATA_DIR, 'catalog.json');
    if (fs.existsSync(catalogPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      fs.createReadStream(catalogPath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Каталог еще не сформирован' }));
    }
    return;
  }

  // 2. API: Содержимое конкретного учебника (/api/book/:id)
  if (pathname.startsWith('/api/book/')) {
    const bookId = pathname.replace('/api/book/', '').replace('.json', '');
    const bookFilePath = path.join(BOOKS_DIR, `${bookId}.json`);
    if (fs.existsSync(bookFilePath)) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      });
      fs.createReadStream(bookFilePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Учебник ${bookId} не найден` }));
    }
    return;
  }

  // 3. API: Поисковый индекс
  if (pathname === '/api/search') {
    const searchPath = path.join(DATA_DIR, 'search_index.json');
    const query = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();

    if (!fs.existsSync(searchPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Поисковый индекс еще формируется' }));
      return;
    }

    if (!query) {
      // Возвращаем весь индекс
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      fs.createReadStream(searchPath).pipe(res);
      return;
    }

    try {
      const index = JSON.parse(fs.readFileSync(searchPath, 'utf-8'));
      const isNum = !isNaN(parseInt(query, 10));
      const qNum = isNum ? parseInt(query, 10) : null;

      const filtered = index.filter(item => {
        if (qNum !== null && item.page === qNum) return true;
        if (item.topics && item.topics.some(t => t.toLowerCase().includes(query))) return true;
        if (item.snippet && item.snippet.toLowerCase().includes(query)) return true;
        return false;
      }).slice(0, 30);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(filtered));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 4. API: Список всех картинок для офлайн-кэширования на iPad
  if (pathname === '/api/all-images') {
    if (fs.existsSync(IMAGES_DIR)) {
      const files = fs.readdirSync(IMAGES_DIR);
      const urls = files.map(f => `/images/${f}`);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(urls));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([]));
    }
    return;
  }

  // 5. API: Статус системы
  if (pathname === '/api/status') {
    let booksCount = 0;
    let imagesCount = 0;
    if (fs.existsSync(BOOKS_DIR)) booksCount = fs.readdirSync(BOOKS_DIR).length;
    if (fs.existsSync(IMAGES_DIR)) imagesCount = fs.readdirSync(IMAGES_DIR).length;

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      booksCount,
      imagesCount,
      localIp: getLocalIpAddress(),
      port: PORT
    }));
    return;
  }

  // 6. Раздача картинок (/images/*)
  if (pathname.startsWith('/images/')) {
    const filename = pathname.replace('/images/', '');
    const imgPath = path.join(IMAGES_DIR, filename);

    if (fs.existsSync(imgPath) && fs.statSync(imgPath).isFile()) {
      const ext = path.extname(imgPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      fs.createReadStream(imgPath).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('Image not found');
    return;
  }

  // 7. Раздача статики фронтенда (public/*)
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Безопасность путей (защита от path traversal)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    const headers = { 'Content-Type': mime };
    if (pathname === '/sw.js') {
      headers['Service-Worker-Allowed'] = '/';
      headers['Cache-Control'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=86400';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA Fallback на index.html
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

function startServer(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      printConnectionBanner(port);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  server,
  startServer
};
