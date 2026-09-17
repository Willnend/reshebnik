/**
 * html_parser.js
 * Извлекает структурированные данные заданий, ответов, годов изданий и картинок со страницы учебника.
 */

function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePageHtml(html, pageUrl) {
  // 1. Извлечение заголовка и темы
  let h1 = '';
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    h1 = cleanText(h1Match[1].replace(/<[^>]+>/g, ''));
  }

  // 2. Выделение основной зоны контента
  let contentHtml = '';
  const startMarkers = [
    '<div class="titul">',
    'class="article-author"',
    'class="first-ad-wrap"',
    '<div class="book-wrapper">'
  ];
  let startIdx = -1;
  for (const marker of startMarkers) {
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      const afterMarker = idx + marker.length;
      startIdx = afterMarker;
      break;
    }
  }
  if (startIdx === -1) startIdx = 0;

  const endMarkers = [
    '<div class="end-content">',
    '<div class="pagination-down">',
    '<div class="rating-page">',
    '<div class="container-category'
  ];
  let endIdx = html.length;
  for (const marker of endMarkers) {
    const idx = html.indexOf(marker, startIdx);
    if (idx !== -1 && idx < endIdx) {
      endIdx = idx;
    }
  }

  contentHtml = html.substring(startIdx, endIdx);

  // Очистка от рекламы и мусора
  contentHtml = contentHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\s+class=["']author["'][\s\S]*?<\/a>/gi, '')
    .replace(/<div\s+class=["']article-author[\s\S]*?<\/a>/gi, '')
    .replace(/>\s*<div\s+class=["']article-author[\s\S]*?<\/a>/gi, '')
    .replace(/<div\s+class=["']article-author[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div\s+class=["']article-author__avatar-wrap[\s\S]*?<\/a>/gi, '')
    .replace(/>\s*<div\s+class=["']article-author__avatar-wrap[\s\S]*?<\/a>/gi, '')
    .replace(/<div class="first-ad-wrap"[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div class="first-ad-sticky"[\s\S]*?<\/div>/gi, '')
    .replace(/<div id="adfox_[\s\S]*?<\/div>/gi, '');

  // 3. Извлечение названий тем (h2, h3)
  const topics = [];
  const topicRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let topicMatch;
  while ((topicMatch = topicRegex.exec(contentHtml)) !== null) {
    const title = cleanText(topicMatch[1].replace(/<[^>]+>/g, ''));
    if (title && !title.includes('Страницы') && !title.includes('Рекомендуем')) {
      topics.push(title);
    }
  }

  // 4. Проверка на наличие версий по годам (2020 / 2023)
  let hasEditions = false;
  let editionData = null;

  if (contentHtml.includes('worko-tabs-first') || contentHtml.includes('id="tab-one-first-panel"')) {
    hasEditions = true;
    const tab1Match = contentHtml.match(/id="tab-one-first-panel"[^>]*>([\s\S]*?)<\/div>/i);
    const tab2Match = contentHtml.match(/id="tab-two-first-panel"[^>]*>([\s\S]*?)<\/div>/i);
    editionData = {
      year2020: tab1Match ? cleanInnerHtml(tab1Match[1]) : '',
      year2023: tab2Match ? cleanInnerHtml(tab2Match[1]) : ''
    };
  }

  // 5. Извлечение картинок
  const images = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(contentHtml)) !== null) {
    const src = imgMatch[1];
    if (
      !src.includes('rover.jpg') &&
      !src.includes('logo') &&
      !src.includes('author') &&
      !src.includes('sprite') &&
      !src.includes('rocket.png') &&
      !src.includes('/icons/') &&
      !src.includes('ya.ru')
    ) {
      images.push(src);
    }
  }

  // 6. Очищенный HTML для вывода в приложении
  const cleanedHtml = cleanInnerHtml(contentHtml);

  // Текст без тегов для полнотекстового поиска
  const textContent = cleanText(contentHtml.replace(/<[^>]+>/g, ' '));

  return {
    h1,
    topics,
    hasEditions,
    editionData,
    images: [...new Set(images)],
    rawContentHtml: cleanedHtml,
    textContent
  };
}

function cleanInnerHtml(html) {
  if (!html) return '';
  return html
    .replace(/<a class="author"[\s\S]*?<\/a>/gi, '')
    .replace(/<div class="article-author"[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div class="nat">[\s\S]*?<\/div>/gi, '')
    .replace(/<div class="titul">\s*<\/div>/gi, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .trim();
}

module.exports = {
  parsePageHtml,
  cleanText
};
