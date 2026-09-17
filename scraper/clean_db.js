const fs = require('fs');
const path = require('path');
const booksDir = path.join(__dirname, '..', 'data', 'books');

for (const file of fs.readdirSync(booksDir)) {
  if (!file.endsWith('.json')) continue;
  const filePath = path.join(booksDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let modifiedCount = 0;

  for (const part of Object.values(data.parts)) {
    for (const page of Object.values(part.pages)) {
      if (page.contentHtml) {
        const orig = page.contentHtml;
        // Удаляем любые остатки блока автора (включая обрезанные открывающие теги)
        page.contentHtml = page.contentHtml
          .replace(/<a\s+class=["']author["'][\s\S]*?<\/a>/gi, '')
          .replace(/<div\s+class=["']article-author[\s\S]*?<\/a>/gi, '')
          .replace(/>\s*<div\s+class=["']article-author[\s\S]*?<\/a>/gi, '')
          .replace(/<div\s+class=["']article-author[\s\S]*?<\/div>\s*<\/div>/gi, '')
          .replace(/<div\s+class=["']article-author__avatar-wrap[\s\S]*?<\/a>/gi, '')
          .replace(/>\s*<div\s+class=["']article-author__avatar-wrap[\s\S]*?<\/a>/gi, '')
          .trim();

        if (page.contentHtml !== orig) {
          modifiedCount++;
        }
      }
    }
  }

  if (modifiedCount > 0) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Cleaned ${modifiedCount} pages in ${file}`);
  }
}
