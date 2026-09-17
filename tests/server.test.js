/**
 * server.test.js
 * Интеграционный тест локального HTTP-сервера и API endpoints.
 */

const assert = require('assert');
const { startServer, server } = require('../server/server');

const TEST_PORT = 3899;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function runServerTests() {
  console.log('🧪 [TEST] Запуск интеграционных тестов локального HTTP-сервера...');

  await startServer(TEST_PORT);

  try {
    // 1. Проверка отдачи главной страницы index.html
    const resRoot = await fetch(`${BASE_URL}/`);
    assert.strictEqual(resRoot.status, 200, 'GET / должен возвращать 200');
    assert(resRoot.headers.get('content-type').includes('text/html'), 'MIME-тип должен быть text/html');
    const html = await resRoot.text();
    assert(html.includes('Решебник 1 класс'), 'В HTML должен быть заголовок приложения');
    console.log('  ✓ GET / — главная страница отдается корректно (200 OK)');

    // 2. Проверка статических файлов CSS и JS
    const resCss = await fetch(`${BASE_URL}/css/style.css`);
    assert.strictEqual(resCss.status, 200);
    assert(resCss.headers.get('content-type').includes('text/css'));
    console.log('  ✓ GET /css/style.css — стили отдаются с корректным MIME-типом');

    const resJs = await fetch(`${BASE_URL}/js/app.js`);
    assert.strictEqual(resJs.status, 200);
    assert(resJs.headers.get('content-type').includes('javascript'));
    console.log('  ✓ GET /js/app.js — скрипты отдаются с корректным MIME-типом');

    // 3. Проверка Service Worker и манифеста
    const resSw = await fetch(`${BASE_URL}/sw.js`);
    assert.strictEqual(resSw.status, 200);
    assert.strictEqual(resSw.headers.get('service-worker-allowed'), '/');
    console.log('  ✓ GET /sw.js — Service Worker доступен с заголовком Service-Worker-Allowed');

    const resManifest = await fetch(`${BASE_URL}/manifest.json`);
    assert.strictEqual(resManifest.status, 200);
    const manifest = await resManifest.json();
    assert(manifest.name.includes('Решебник'), 'Манифест PWA валиден');
    console.log('  ✓ GET /manifest.json — PWA манифест для iOS и Windows валиден');

    // 4. Проверка API каталога
    const resCatalog = await fetch(`${BASE_URL}/api/catalog`);
    assert.strictEqual(resCatalog.status, 200);
    const catalog = await resCatalog.json();
    assert.strictEqual(catalog.length, 5);
    console.log(`  ✓ GET /api/catalog — возвращает ${catalog.length} учебников`);

    // 5. Проверка API книги (/api/book/math)
    const resBook = await fetch(`${BASE_URL}/api/book/math`);
    assert.strictEqual(resBook.status, 200);
    const mathBook = await resBook.json();
    assert.strictEqual(mathBook.id, 'math');
    assert(mathBook.parts['1'].pages['4'], 'Страница 4 математики должна присутствовать');
    console.log('  ✓ GET /api/book/math — возвращает полные данные учебника по математике');

    // 6. Проверка API поиска (/api/search?q=бусы)
    const resSearch = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent('бусы')}`);
    assert.strictEqual(resSearch.status, 200);
    const searchResults = await resSearch.json();
    assert(Array.isArray(searchResults));
    assert(searchResults.length > 0, 'Поиск по "бусы" должен найти задания');
    console.log(`  ✓ GET /api/search?q=бусы — быстрый поиск нашел ${searchResults.length} совпадений`);

    // 7. Проверка отдачи картинок (/images/*)
    const resImagesList = await fetch(`${BASE_URL}/api/all-images`);
    assert.strictEqual(resImagesList.status, 200);
    const imagesList = await resImagesList.json();
    assert(imagesList.length > 0, 'Должен быть список картинок');

    // Запрашиваем первую реальную картинку
    const sampleImgUrl = imagesList[0];
    const resImg = await fetch(`${BASE_URL}${sampleImgUrl}`);
    assert.strictEqual(resImg.status, 200, `Картинка ${sampleImgUrl} должна отдаваться со статусом 200`);
    assert(resImg.headers.get('content-type').includes('image/'), 'MIME-тип картинки должен быть image/*');
    console.log(`  ✓ GET ${sampleImgUrl} — локальные иллюстрации отдаются корректно`);

    console.log('✅ [УСПЕХ] Все интеграционные тесты сервера пройдены!\n');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runServerTests().catch(err => {
    console.error('Test failure:', err);
    process.exit(1);
  });
}

module.exports = {
  runServerTests
};
