import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('bible-reader-settings', JSON.stringify({ state: { layoutMode: 'verse' }, version: 4 })));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-verse]', { timeout: 20000 });
await page.waitForTimeout(500);

const measure = async (tag) => {
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-index]')).map((el) => {
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10 };
    }).sort((a, b) => a.top - b.top);
    let bad = 0; const s = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 0.6) { bad++; if (s.length < 3) s.push([rows[i - 1].bottom, rows[i].top]); }
    return { bad, s };
  });
  console.log(tag, 'bad=', r.bad, JSON.stringify(r.s));
};

await measure('start');
// 滚动后再投影
await page.evaluate(() => { const el = document.querySelector('.scrollbar-thin.overflow-y-auto'); if (el) el.scrollTop = 900; });
await measure('scrolled');
await page.locator('button', { hasText: '投影' }).first().click();
await measure('after_project');
// 投影后改变窗口尺寸
await page.setViewportSize({ width: 1366, height: 768 });
await measure('after_resize_1366');
await page.setViewportSize({ width: 1000, height: 700 });
await measure('after_resize_1000');
await page.setViewportSize({ width: 1600, height: 1000 });
await measure('back_to_1600');

await browser.close();
console.log('DONE');
