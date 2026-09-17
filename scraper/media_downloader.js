/**
 * media_downloader.js
 * Скачивание картинок с gdz-raketa.ru в локальную папку data/images/
 * и замена ссылок в HTML на локальные.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'https://gdz-raketa.ru';
const IMAGES_DIR = path.join(__dirname, '..', 'data', 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function getSafeFilename(imgUrl) {
  try {
    const ext = path.extname(imgUrl.split('?')[0]) || '.jpg';
    const hash = crypto.createHash('md5').update(imgUrl).digest('hex').substring(0, 12);
    const basename = path.basename(imgUrl.split('?')[0], ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 24);
    return `${basename}_${hash}${ext}`;
  } catch (e) {
    const hash = crypto.createHash('md5').update(imgUrl).digest('hex').substring(0, 16);
    return `media_${hash}.jpg`;
  }
}

async function downloadImage(imgUrl) {
  let fullUrl = imgUrl;
  if (imgUrl.startsWith('//')) {
    fullUrl = 'https:' + imgUrl;
  } else if (imgUrl.startsWith('/')) {
    fullUrl = BASE_URL + imgUrl;
  } else if (!imgUrl.startsWith('http')) {
    fullUrl = BASE_URL + '/' + imgUrl;
  }

  const filename = getSafeFilename(imgUrl);
  const localPath = path.join(IMAGES_DIR, filename);

  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
    return { filename, localPath, cached: true };
  }

  try {
    const res = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': BASE_URL
      }
    });

    if (!res.ok) {
      console.warn(`[WARN] Failed to download image ${fullUrl}: status ${res.status}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(localPath, buffer);
    return { filename, localPath, cached: false, size: buffer.length };
  } catch (err) {
    console.error(`[ERROR] Image download error ${fullUrl}:`, err.message);
    return null;
  }
}

async function processHtmlImages(html, foundImages) {
  let updatedHtml = html;
  const downloadedMap = {};

  for (const imgUrl of foundImages) {
    const result = await downloadImage(imgUrl);
    if (result && result.filename) {
      downloadedMap[imgUrl] = `/images/${result.filename}`;
      // Заменяем в HTML
      const escapedUrl = imgUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`src=["']${escapedUrl}["']`, 'g');
      updatedHtml = updatedHtml.replace(regex, `src="/images/${result.filename}"`);
    }
  }

  return {
    updatedHtml,
    downloadedMap
  };
}

module.exports = {
  downloadImage,
  processHtmlImages,
  getSafeFilename,
  IMAGES_DIR
};
