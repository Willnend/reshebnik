/**
 * scraper.test.js
 * Модульный тест HTML-парсера заданий и решений.
 */

const assert = require('assert');
const { parsePageHtml, cleanText } = require('../scraper/parsers/html_parser');

console.log('🧪 [TEST] Проверка модуля парсера HTML...');

// 1. Тест очистки текста
assert.strictEqual(cleanText('  Привет &nbsp; &laquo;мир&raquo;  — '), 'Привет «мир» —');
console.log('  ✓ Функция cleanText корректно декодирует HTML-сущности и пробелы');

// 2. Тест парсинга стандартной страницы с темой и вопросами
const sampleHtml1 = `
<html>
<body>
  <h1>Математика 1 класс учебник Моро 1 часть ответы – страница 4</h1>
  <div class="titul"></div>
  <h2>Один, два, три...</h2>
  <p class="text">Придумай по этому рисунку разные вопросы со словом сколько. Ответь на них.</p>
  <b class="otvet">Ответ:</b>
  <div class="sdvig">
    <p>Сколько грибков сушится? <b>Ответ: 7.</b></p>
  </div>
  <div class="end-content"></div>
</body>
</html>
`;

const parsed1 = parsePageHtml(sampleHtml1, 'https://example.com/page4');
assert.strictEqual(parsed1.topics.length, 1);
assert.strictEqual(parsed1.topics[0], 'Один, два, три...');
assert.strictEqual(parsed1.hasEditions, false);
assert(parsed1.rawContentHtml.includes('Ответ: 7.'));
assert(parsed1.textContent.includes('Придумай по этому рисунку'));
console.log('  ✓ Парсер успешно извлекает заголовки, темы, вопросы и ответы');

// 3. Тест парсинга страницы с переключением годов (2020 / 2023)
const sampleHtml2 = `
<html>
<body>
  <div class="titul"></div>
  <div class="worko-tabs-first">
    <div id="tab-one-first-panel" class="panel">
      <p class="text">Задание для редакции 2020 года</p>
    </div>
    <div id="tab-two-first-panel" class="panel active">
      <p class="text">Задание для редакции 2023 года</p>
    </div>
  </div>
  <div class="end-content"></div>
</body>
</html>
`;

const parsed2 = parsePageHtml(sampleHtml2, 'https://example.com/page15');
assert.strictEqual(parsed2.hasEditions, true);
assert(parsed2.editionData.year2020.includes('2020 года'));
assert(parsed2.editionData.year2023.includes('2023 года'));
console.log('  ✓ Парсер корректно разделяет редакции учебников по годам (2020 / 2023)');

// 4. Тест извлечения картинок с фильтрацией системных иконок
const sampleHtml3 = `
<html>
<body>
  <div class="titul"></div>
  <img src="/images/rocket.png" />
  <img src="/wp-content/themes/gdz/img/rover.jpg" />
  <img src="/wp-content/themes/gdz/img/uchebnik/zadanie1.jpg" />
  <div class="end-content"></div>
</body>
</html>
`;

const parsed3 = parsePageHtml(sampleHtml3, 'https://example.com/img_test');
assert.strictEqual(parsed3.images.length, 1);
assert.strictEqual(parsed3.images[0], '/wp-content/themes/gdz/img/uchebnik/zadanie1.jpg');
console.log('  ✓ Парсер фильтрует системный мусор и находит только иллюстрации заданий');

console.log('✅ [УСПЕХ] Все тесты парсера пройдены!\n');
