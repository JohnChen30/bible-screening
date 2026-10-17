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
await page.evaluate(() => { document.documentElement.style.setProperty('zoom', '1.1'); });
await page.waitForTimeout(800);

const r = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('[data-index]')).map((el) => {
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top * 100) / 100, bottom: Math.round(b.bottom * 100) / 100, h: Math.round(b.height * 100) / 100 };
  }).sort((a, b) => a.top - b.top);
  let bad = 0; const s = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 0.4) { bad++; if (s.length < 4) s.push({ prevBottom: rows[i - 1].bottom, curTop: rows[i].top, ov: Math.round((rows[i - 1].bottom - rows[i].top) * 100) / 100 }); }
  return { bad, s, first: rows.slice(0, 5) };
});
console.log('ZOOM-1.1 bad=', r.bad, JSON.stringify(r.s));
console.log('first:', JSON.stringify(r.first));

await browser.close();
console.log('DONE');
