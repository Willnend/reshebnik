/**
 * data_integrity.test.js
 * Проверка целостности выгруженной базы данных и локальных медиа-файлов.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BOOKS_DIR = path.join(DATA_DIR, 'books');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

console.log('🧪 [TEST] Проверка целостности базы данных...');

// 1. Проверка catalog.json
const catalogPath = path.join(DATA_DIR, 'catalog.json');
assert(fs.existsSync(catalogPath), 'catalog.json должен существовать');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
assert(Array.isArray(catalog), 'Каталог должен быть массивом');
assert.strictEqual(catalog.length, 5, 'В каталоге должно быть ровно 5 учебников');

const expectedBookIds = ['math', 'azbuka', 'russian', 'world', 'reading'];
let totalPagesAcrossAllBooks = 0;
const referencedImages = new Set();

for (const book of catalog) {
  assert(expectedBookIds.includes(book.id), `Неожиданный ID книги: ${book.id}`);
  assert(book.title, `У книги ${book.id} должно быть название`);
  assert(book.parts && Object.keys(book.parts).length > 0, `У книги ${book.id} должны быть части`);

  // 2. Проверка файла книги
  const bookFilePath = path.join(BOOKS_DIR, `${book.id}.json`);
  assert(fs.existsSync(bookFilePath), `Файл ${book.id}.json должен существовать`);

  const bookData = JSON.parse(fs.readFileSync(bookFilePath, 'utf-8'));
  let bookPagesCount = 0;

  for (const partNum of Object.keys(bookData.parts)) {
    const part = bookData.parts[partNum];
    const pages = part.pages;
    const pageKeys = Object.keys(pages);
    assert(pageKeys.length > 0, `В части ${partNum} книги ${book.id} должны быть страницы`);
    bookPagesCount += pageKeys.length;

    for (const pageNum of pageKeys) {
      const page = pages[pageNum];
      assert(page.pageNumber === parseInt(pageNum, 10), `Номер страницы должен совпадать`);
      assert(typeof page.contentHtml === 'string', `contentHtml должен быть строкой`);

      // Собираем все локальные картинки из HTML
      const matches = page.contentHtml.match(/\/images\/[^"'\s>)]+/g) || [];
      matches.forEach(m => referencedImages.add(path.basename(m)));
    }
  }

  console.log(`  ✓ ${book.title}: ${bookPagesCount} страниц загружено`);
  totalPagesAcrossAllBooks += bookPagesCount;
}

console.log(`\n📊 Всего страниц во всех учебниках: ${totalPagesAcrossAllBooks}`);
assert(totalPagesAcrossAllBooks > 850, `Всего должно быть более 850 страниц (получено ${totalPagesAcrossAllBooks})`);

// 3. Проверка наличия картинок на диске
console.log(`🖼 Проверка наличия локальных изображений (${referencedImages.size} уникальных картинок в заданиях)...`);
let missingImages = 0;
for (const imgName of referencedImages) {
  const localImgPath = path.join(IMAGES_DIR, imgName);
  if (!fs.existsSync(localImgPath) || fs.statSync(localImgPath).size === 0) {
    console.warn(`  ⚠️ Отсутствует картинка на диске: ${imgName}`);
    missingImages++;
  }
}
assert.strictEqual(missingImages, 0, `Не должно быть отсутствующих картинок (найдено: ${missingImages})`);
console.log(`  ✓ Все ${referencedImages.size} картинок присутствуют в data/images/ и имеют ненулевой размер!`);

// 4. Проверка поискового индекса
const searchIndexPath = path.join(DATA_DIR, 'search_index.json');
assert(fs.existsSync(searchIndexPath), 'search_index.json должен существовать');
const searchIndex = JSON.parse(fs.readFileSync(searchIndexPath, 'utf-8'));
assert(searchIndex.length > 800, `В поисковом индексе должно быть более 800 записей (найдено ${searchIndex.length})`);
console.log(`  ✓ Поисковый индекс содержит ${searchIndex.length} записей`);

console.log('\n✅ [УСПЕХ] Все проверки целостности данных пройдены на 100%!\n');
