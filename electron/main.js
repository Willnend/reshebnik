/**
 * main.js - Главный процесс Electron для Windows.
 * Запускает нативное окно Windows и встроенный локальный сервер данных.
 */

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let internalServer = null;
let serverPort = null;

// Запуск встроенного легковесного HTTP-сервера для раздачи данных внутри приложения
function startInternalServer() {
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

  return new Promise((resolve) => {
    internalServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = decodeURIComponent(parsedUrl.pathname);

      // API: Каталог
      if (pathname === '/api/catalog') {
        const p = path.join(DATA_DIR, 'catalog.json');
        if (fs.existsSync(p)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          fs.createReadStream(p).pipe(res);
          return;
        }
      }

      // API: Учебник
      if (pathname.startsWith('/api/book/')) {
        const bookId = pathname.replace('/api/book/', '').replace('.json', '');
        const p = path.join(BOOKS_DIR, `${bookId}.json`);
        if (fs.existsSync(p)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          fs.createReadStream(p).pipe(res);
          return;
        }
      }

      // API: Поиск
      if (pathname === '/api/search') {
        const p = path.join(DATA_DIR, 'search_index.json');
        const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        if (fs.existsSync(p)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          if (!q) {
            fs.createReadStream(p).pipe(res);
          } else {
            const index = JSON.parse(fs.readFileSync(p, 'utf-8'));
            const isNum = !isNaN(parseInt(q, 10));
            const qNum = isNum ? parseInt(q, 10) : null;
            const filtered = index.filter(item => {
              if (qNum !== null && item.page === qNum) return true;
              if (item.topics && item.topics.some(t => t.toLowerCase().includes(q))) return true;
              if (item.snippet && item.snippet.toLowerCase().includes(q)) return true;
              return false;
            }).slice(0, 30);
            res.end(JSON.stringify(filtered));
          }
          return;
        }
      }

      // Картинки /images/*
      if (pathname.startsWith('/images/')) {
        const filename = pathname.replace('/images/', '');
        const p = path.join(IMAGES_DIR, filename);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          const ext = path.extname(p).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'image/jpeg' });
          fs.createReadStream(p).pipe(res);
          return;
        }
      }

      // Статика фронтенда
      let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // SPA Fallback
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    // Слушаем случайный свободный порт
    internalServer.listen(0, '127.0.0.1', () => {
      serverPort = internalServer.address().port;
      resolve(serverPort);
    });
  });
}

async function createWindow() {
  await startInternalServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: 'Решебник 1 класс — ГДЗ для Учителя',
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon.png'),
    backgroundColor: '#F8FAFC',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Нативное меню приложения Windows
  const template = [
    {
      label: 'Файл',
      submenu: [
        { label: 'Перезагрузить', accelerator: 'Ctrl+R', click: () => mainWindow.reload() },
        { type: 'separator' },
        { label: 'Выход', accelerator: 'Ctrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { label: 'Увеличить шрифт', accelerator: 'Ctrl+=', click: () => mainWindow.webContents.send('zoom-in') },
        { label: 'Уменьшить шрифт', accelerator: 'Ctrl+-', click: () => mainWindow.webContents.send('zoom-out') },
        { label: 'Сбросить масштаб', accelerator: 'Ctrl+0', click: () => mainWindow.webContents.setZoomLevel(0) },
        { type: 'separator' },
        { label: 'Полноэкранный режим (для проектора)', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) }
      ]
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: 'О программе',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'О программе',
              message: 'Решебник 1 класс (ГДЗ для Учителя)',
              detail: 'Автономная база учебников и решений для 1 класса:\nМатематика, Азбука, Русский язык, Окружающий мир, Литературное чтение.\n\nВерсия: 1.0.0'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (internalServer) internalServer.close();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (internalServer) internalServer.close();
    app.quit();
  }
});
