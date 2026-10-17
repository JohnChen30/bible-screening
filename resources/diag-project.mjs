import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE_ERR:', m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('bible-reader-settings', JSON.stringify({ state: { layoutMode: 'verse' }, version: 4 })));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-verse]', { timeout: 20000 });
await page.waitForTimeout(600);

async function report(tag) {
  const r = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-index]')).map((el) => {
      const b = el.getBoundingClientRect();
      return { idx: Number(el.getAttribute('data-index')), top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
    }).sort((a, b) => a.top - b.top);
    const bad = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 1) bad.push({ prevBottom: rows[i - 1].bottom, curTop: rows[i].top, overlapPx: rows[i - 1].bottom - rows[i].top, idx: rows[i].idx });
    const inner = Array.from(document.querySelectorAll('[data-verse]')).slice(0, 8).map((el) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { v: el.getAttribute('data-verse'), top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), lh: cs.lineHeight, fs: cs.fontSize };
    });
    const stage = document.querySelector('[data-panel-canvas]')?.parentElement;
    return { rows: rows.length, badLen: bad.length, bad: bad.slice(0, 6), inner, canvasH: stage ? Math.round(stage.getBoundingClientRect().height) : null };
  });
  console.log('=== ' + tag + ' ===');
  console.log('rows:', r.rows, 'overlaps:', r.badLen, 'canvasH:', r.canvasH);
  console.log('bad:', JSON.stringify(r.bad));
  console.log('inner:', JSON.stringify(r.inner));
}

await report('BEFORE_PROJECT');

// 开始投影
await page.locator('button', { hasText: '投影' }).first().click();
await page.waitForTimeout(1200);
await report('AFTER_PROJECT');
await page.locator('[data-panel-canvas]').first().screenshot({ path: 'E:/tmp/proj-console.png' });

await browser.close();
console.log('DONE');
