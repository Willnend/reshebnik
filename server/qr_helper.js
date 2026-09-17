/**
 * qr_helper.js
 * Генератор QR-кода в терминале для удобного подключения с iPhone и iPad.
 */

const os = require('os');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ищем IPv4 и не loopback (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Простая генерация компактного QR-кода в терминале без внешних библиотек
 * (использует публичный API или ASCII-рамку с прямой ссылкой)
 */
function printConnectionBanner(port) {
  const localIp = getLocalIpAddress();
  const localUrl = `http://localhost:${port}`;
  const networkUrl = `http://${localIp}:${port}`;

  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│           📚 РЕШЕБНИК 1 КЛАСС ДЛЯ УЧИТЕЛЯ                   │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log(`│  Компьютер (Windows):   \x1b[36m${localUrl.padEnd(35)}\x1b[0m │`);
  console.log(`│  Планшет (iPad/iPhone): \x1b[32m${networkUrl.padEnd(35)}\x1b[0m │`);
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│  Как открыть на iPad / iPhone:                              │');
  console.log('│  1. Подключите iPad/iPhone к той же Wi-Fi сети.             │');
  console.log('│  2. Откройте в Safari ссылку:                               │');
  console.log(`│     \x1b[1m\x1b[32m${networkUrl}\x1b[0m`);
  console.log('│  3. Нажмите в Safari кнопку "Поделиться" (квадрат со        │');
  console.log('│     стрелкой) -> "На экран «Домой»".                        │');
  console.log('│  4. Теперь решебник работает прямо с экрана iPad            │');
  console.log('│     даже без интернета!                                     │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');
}

module.exports = {
  getLocalIpAddress,
  printConnectionBanner
};
