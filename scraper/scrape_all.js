/**
 * scrape_all.js
 * Главный скрипт выгрузки всех 5 учебников, парсинга заданий и решений,
 * скачивания картинок и построения локальной базы данных.
 */

const fs = require('fs');
const path = require('path');
const { parsePageHtml, cleanText } = require('./parsers/html_parser');
const { downloadImage, processHtmlImages } = require('./media_downloader');

const BASE_URL = 'https://gdz-raketa.ru';
const DATA_DIR = path.join(__dirname, '..', 'data');
const BOOKS_DIR = path.join(DATA_DIR, 'books');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

[DATA_DIR, BOOKS_DIR, IMAGES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const TEXTBOOKS = [
  {
    id: 'math',
    title: 'Математика',
    grade: 1,
    authors: 'Моро М. И., Волкова С. И., Степанова С. В.',
    series: 'Школа России (ФГОС)',
    url: 'https://gdz-raketa.ru/matematika/1-klass/moro-uchebnik/',
    icon: '📐',
    color: '#3B82F6'
  },
  {
    id: 'azbuka',
    title: 'Азбука',
    grade: 1,
    authors: 'Горецкий В. Г., Кирюшкин В. А., Виноградская Л. А.',
    series: 'Школа России (ФГОС)',
    url: 'https://gdz-raketa.ru/russkiy-yazyk/1-klass/azbuka-goreckiy/',
    icon: '🔤',
    color: '#10B981'
  },
  {
    id: 'russian',
    title: 'Русский язык',
    grade: 1,
    authors: 'Канакина В. П., Горецкий В. Г.',
    series: 'Школа России (ФГОС)',
    url: 'https://gdz-raketa.ru/russkiy-yazyk/1-klass/uchebnik-kanakina/',
    icon: '📖',
    color: '#8B5CF6'
  },
  {
    id: 'world',
    title: 'Окружающий мир',
    grade: 1,
    authors: 'Плешаков А. А.',
    series: 'Школа России (ФГОС)',
    url: 'https://gdz-raketa.ru/okruzhayushchiy-mir/1-klass/uchebnik-pleshakov/',
    icon: '🌍',
    color: '#F59E0B'
  },
  {
    id: 'reading',
    title: 'Литературное чтение',
    grade: 1,
    authors: 'Климанова Л. Ф., Горецкий В. Г., Голованова М. В.',
    series: 'Школа России (ФГОС)',
    url: 'https://gdz-raketa.ru/literaturnoe-chtenie/1-klass/uchebnik-klimanova/',
    icon: '📚',
    color: '#EC4899'
  }
];

// Утилита для выполнения запросов с повторами при сбоях
async function fetchWithRetry(url, retries = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
          'Referer': BASE_URL
        }
      });
      if (res.ok) {
        return await res.text();
      }
      console.warn(`[WARN] Attempt ${attempt}: Status ${res.status} for ${url}`);
    } catch (err) {
      console.warn(`[WARN] Attempt ${attempt}: Error ${err.message} for ${url}`);
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

// Пул параллельных задач с ограничением concurrency
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

// Извлечение ссылок на страницы из оглавления книги
function extractBookStructure(landingHtml, bookConfig) {
  const parts = {};
  
  // Ищем обложку книги
  let coverUrl = null;
  const coverMatch = landingHtml.match(/<div class="img-wrapper"[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i) ||
                     landingHtml.match(/<div class="book"[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
  if (coverMatch) {
    coverUrl = coverMatch[1];
  }

  // Разделение по секциям h2
  const sections = landingHtml.split(/<h2[^>]*>/i);
  
  for (let i = 1; i < sections.length; i++) {
    const sectionBlock = sections[i];
    const headingEndIdx = sectionBlock.indexOf('</h2>');
    if (headingEndIdx === -1) continue;
    
    const heading = cleanText(sectionBlock.substring(0, headingEndIdx));
    if (!heading.toLowerCase().includes('страниц')) continue;

    let partNum = 1;
    if (heading.includes('2') || heading.toLowerCase().includes('часть 2')) {
      partNum = 2;
    } else if (heading.includes('1') || heading.toLowerCase().includes('часть 1')) {
      partNum = 1;
    }

    if (!parts[partNum]) parts[partNum] = [];

    // Ищем ссылки внутри этой секции
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(sectionBlock)) !== null) {
      const href = match[1];
      const pageStr = cleanText(match[2].replace(/<[^>]+>/g, ''));
      const pageNum = parseInt(pageStr, 10);
      
      if (!isNaN(pageNum) && (href.includes('stranica') || href.includes('stranitsa'))) {
        const fullUrl = href.startsWith('http') ? href : BASE_URL + href;
        if (!parts[partNum].some(p => p.pageNumber === pageNum)) {
          parts[partNum].push({
            pageNumber: pageNum,
            url: fullUrl
          });
        }
      }
    }
  }

  // Если секции не разбились (например, русский язык в 1 части), ищем все ссылки
  if (Object.keys(parts).length === 0 || (parts[1] && parts[1].length === 0)) {
    parts[1] = [];
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(landingHtml)) !== null) {
      const href = match[1];
      const pageStr = cleanText(match[2].replace(/<[^>]+>/g, ''));
      const pageNum = parseInt(pageStr, 10);
      if (!isNaN(pageNum) && (href.includes('stranica') || href.includes('stranitsa'))) {
        let partNum = 1;
        if (href.includes('2-chast')) partNum = 2;
        if (!parts[partNum]) parts[partNum] = [];
        if (!parts[partNum].some(p => p.pageNumber === pageNum)) {
          parts[partNum].push({
            pageNumber: pageNum,
            url: href.startsWith('http') ? href : BASE_URL + href
          });
        }
      }
    }
  }

  // Сортируем страницы по возрастанию номеров
  for (const partNum of Object.keys(parts)) {
    parts[partNum].sort((a, b) => a.pageNumber - b.pageNumber);
  }

  return { coverUrl, parts };
}

async function scrapeTextbook(bookConfig, pageLimit = null) {
  console.log(`\n==================================================`);
  console.log(`[START] Скачивание учебника: ${bookConfig.title} (1 класс)`);
  console.log(`[URL] ${bookConfig.url}`);

  const landingHtml = await fetchWithRetry(bookConfig.url);
  const { coverUrl, parts } = extractBookStructure(landingHtml, bookConfig);

  let localCover = null;
  if (coverUrl) {
    const coverRes = await downloadImage(coverUrl);
    if (coverRes && coverRes.filename) {
      localCover = `/images/${coverRes.filename}`;
    }
  }

  const bookData = {
    id: bookConfig.id,
    title: bookConfig.title,
    grade: bookConfig.grade,
    authors: bookConfig.authors,
    series: bookConfig.series,
    url: bookConfig.url,
    icon: bookConfig.icon,
    color: bookConfig.color,
    cover: localCover,
    parts: {}
  };

  const totalPagesCount = Object.values(parts).reduce((acc, list) => acc + list.length, 0);
  console.log(`[INFO] Найдено частей: ${Object.keys(parts).length}, всего страниц: ${totalPagesCount}`);

  let processedCount = 0;
  const searchIndexEntries = [];

  for (const partNumStr of Object.keys(parts)) {
    const partNum = parseInt(partNumStr, 10);
    let pageItems = parts[partNum];
    if (pageLimit && pageLimit > 0) {
      pageItems = pageItems.slice(0, pageLimit);
    }

    bookData.parts[partNum] = {
      partNumber: partNum,
      totalPages: pageItems.length,
      pages: {}
    };

    console.log(`\n--- Обработка Части ${partNum} (${pageItems.length} страниц) ---`);

    // Загружаем страницы параллельно батчами по 6 штук
    await asyncPool(6, pageItems, async (pageItem) => {
      try {
        const pageHtml = await fetchWithRetry(pageItem.url);
        const parsed = parsePageHtml(pageHtml, pageItem.url);

        // Скачиваем все картинки задания
        const { updatedHtml, downloadedMap } = await processHtmlImages(parsed.rawContentHtml, parsed.images);

        // Также обрабатываем картинки в изданиях по годам, если есть
        let editionDataProcessed = null;
        if (parsed.hasEditions && parsed.editionData) {
          editionDataProcessed = {};
          if (parsed.editionData.year2020) {
            const res20 = await processHtmlImages(parsed.editionData.year2020, parsed.images);
            editionDataProcessed.year2020 = res20.updatedHtml;
          }
          if (parsed.editionData.year2023) {
            const res23 = await processHtmlImages(parsed.editionData.year2023, parsed.images);
            editionDataProcessed.year2023 = res23.updatedHtml;
          }
        }

        const localImages = Object.values(downloadedMap);

        bookData.parts[partNum].pages[pageItem.pageNumber] = {
          pageNumber: pageItem.pageNumber,
          url: pageItem.url,
          h1: parsed.h1,
          topics: parsed.topics,
          hasEditions: parsed.hasEditions,
          editionData: editionDataProcessed,
          images: localImages,
          contentHtml: updatedHtml,
          textContent: parsed.textContent
        };

        // Запись в поисковый индекс
        searchIndexEntries.push({
          bookId: bookConfig.id,
          bookTitle: bookConfig.title,
          part: partNum,
          page: pageItem.pageNumber,
          topics: parsed.topics,
          snippet: parsed.textContent.substring(0, 160)
        });

        processedCount++;
        if (processedCount % 10 === 0 || processedCount === totalPagesCount) {
          process.stdout.write(`\r[ПРОГРЕСС] Обработано страниц: ${processedCount}/${totalPagesCount}`);
        }
      } catch (err) {
        console.error(`\n[ОШИБКА] Страница ${pageItem.pageNumber} (${pageItem.url}): ${err.message}`);
      }
    });
  }

  console.log(`\n[ГОТОВО] Сохранение данных ${bookConfig.title} в data/books/${bookConfig.id}.json`);
  fs.writeFileSync(
    path.join(BOOKS_DIR, `${bookConfig.id}.json`),
    JSON.stringify(bookData, null, 2),
    'utf-8'
  );

  return {
    bookData,
    searchIndexEntries
  };
}

async function scrapeAll(pageLimit = null) {
  const startTime = Date.now();
  console.log(`================================================================`);
  console.log(`🚀 ЗАПУСК ПОЛНОЙ ВЫГРУЗКИ УЧЕБНИКОВ ДЛЯ 1 КЛАССА`);
  console.log(`================================================================`);

  const catalog = [];
  let allSearchEntries = [];

  for (const tb of TEXTBOOKS) {
    const { bookData, searchIndexEntries } = await scrapeTextbook(tb, pageLimit);
    
    // Формируем краткий каталог
    const partsSummary = {};
    for (const pNum of Object.keys(bookData.parts)) {
      const p = bookData.parts[pNum];
      const pageNumbers = Object.keys(p.pages).map(Number).sort((a, b) => a - b);
      partsSummary[pNum] = {
        partNumber: Number(pNum),
        pagesCount: pageNumbers.length,
        minPage: pageNumbers[0] || 0,
        maxPage: pageNumbers[pageNumbers.length - 1] || 0
      };
    }

    catalog.push({
      id: bookData.id,
      title: bookData.title,
      grade: bookData.grade,
      authors: bookData.authors,
      series: bookData.series,
      icon: bookData.icon,
      color: bookData.color,
      cover: bookData.cover,
      parts: partsSummary
    });

    allSearchEntries = allSearchEntries.concat(searchIndexEntries);
  }

  // Сохраняем каталог
  console.log(`\n[СОХРАНЕНИЕ] Сохраняем data/catalog.json`);
  fs.writeFileSync(
    path.join(DATA_DIR, 'catalog.json'),
    JSON.stringify(catalog, null, 2),
    'utf-8'
  );

  // Сохраняем поисковый индекс
  console.log(`[СОХРАНЕНИЕ] Сохраняем data/search_index.json (${allSearchEntries.length} записей)`);
  fs.writeFileSync(
    path.join(DATA_DIR, 'search_index.json'),
    JSON.stringify(allSearchEntries, null, 2),
    'utf-8'
  );

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n================================================================`);
  console.log(`🎉 ВСЕ МАТЕРИАЛЫ УСПЕШНО СКАЧАНЫ И СОХРАНЕНЫ ЗА ${durationSec} сек!`);
  console.log(`================================================================\n`);
}

// Запуск из командной строки
if (require.main === module) {
  const args = process.argv.slice(2);
  let limit = null;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10);
  }
  scrapeAll(limit).catch(err => {
    console.error('Fatal scrape error:', err);
    process.exit(1);
  });
}

module.exports = {
  scrapeAll,
  TEXTBOOKS
};
