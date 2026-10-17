import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE_ERR:', m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
// 切到「逐节」排版
await page.evaluate(() => {
  localStorage.setItem('bible-reader-settings', JSON.stringify({ state: { layoutMode: 'verse' }, version: 4 }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-verse]', { timeout: 20000 });
await page.waitForTimeout(600);

const canvas = page.locator('[data-panel-canvas]').first();
await canvas.screenshot({ path: 'E:/tmp/verse-canvas.png' });

// 检测相邻行盒是否垂直重叠
const diag = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('[data-index]')).map((el) => {
    const r = el.getBoundingClientRect();
    return { idx: el.getAttribute('data-index'), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), text: (el.textContent || '').slice(0, 12) };
  }).sort((a, b) => a.top - b.top);
  const overlaps = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].top < rows[i - 1].bottom - 1) {
      overlaps.push({ prev: rows[i - 1], cur: rows[i], overlapPx: rows[i - 1].bottom - rows[i].top });
    }
  }
  return { rowCount: rows.length, overlaps: overlaps.slice(0, 6) };
});
console.log(JSON.stringify(diag, null, 2));

// 也量一下 VerseItem 块（[data-verse] 内层）
const inner = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('[data-verse]')).slice(0, 8).map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { v: el.getAttribute('data-verse'), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), lh: cs.lineHeight, display: cs.display };
  });
  return items;
});
console.log(JSON.stringify(inner, null, 2));

await browser.close();
console.log('DONE');
