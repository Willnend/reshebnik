/**
 * run_all_tests.js
 * Единый раннер запуска всех тестов системы.
 */

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  { name: 'Модульные тесты парсера (scraper.test.js)', file: 'scraper.test.js' },
  { name: 'Тесты целостности базы и картинок (data_integrity.test.js)', file: 'data_integrity.test.js' },
  { name: 'Интеграционные тесты сервера и PWA (server.test.js)', file: 'server.test.js' }
];

console.log('============================================================');
console.log('🧪 ЗАПУСК КОМПЛЕКСНОГО ТЕСТИРОВАНИЯ РЕШЕБНИКА 1 КЛАССА');
console.log('============================================================\n');

let failedCount = 0;

for (const t of tests) {
  const filePath = path.join(__dirname, t.file);
  try {
    execSync(`node "${filePath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`\n❌ [FAIL] ${t.name} завершился с ошибкой!\n`);
    failedCount++;
  }
}

console.log('============================================================');
if (failedCount === 0) {
  console.log('🎉 ВСЕ ТЕСТЫ (3 из 3) УСПЕШНО ПРОЙДЕНЫ БЕЗ ЕДИНОЙ ОШИБКИ!');
} else {
  console.log(`⚠️ ОБНАРУЖЕНЫ ОШИБКИ В ${failedCount} ТЕСТАХ!`);
  process.exit(1);
}
console.log('============================================================\n');
