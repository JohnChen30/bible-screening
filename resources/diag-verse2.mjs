import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE_ERR:', m.text()); });

async function overlaps(tag) {
  const r = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-index]')).map((el) => {
      const b = el.getBoundingClientRect();
      return { idx: Number(el.getAttribute('data-index')), top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
    }).sort((a, b) => a.top - b.top);
    const bad = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 1) bad.push({ a: rows[i - 1], b: rows[i] });
    // 行盒文本
    const sample = rows.slice(0, 3).map((x) => x);
    return { rows: rows.length, bad: bad.slice(0, 4), sample };
  });
  console.log(tag, JSON.stringify(r));
}

async function setLS(state) {
  await page.evaluate((s) => {
    localStorage.setItem('bible-reader-settings', JSON.stringify({ state: s, version: 4 }));
  }, state);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-verse]', { timeout: 20000 });
  await page.waitForTimeout(500);
}

await page.goto(URL, { waitUntil: 'networkidle' });

// A) 逐节排版 + 滚动后
await setLS({ layoutMode: 'verse' });
await overlaps('A_after_load');
await page.evaluate(() => {
  const el = document.querySelector('.scrollbar-thin.overflow-y-auto');
  if (el) el.scrollTop = 1200;
});
await page.waitForTimeout(600);
await overlaps('A_after_scroll');
await page.screenshot({ path: 'E:/tmp/a-scroll.png' });

// B) 逐节对照（compareMode=verse）
await setLS({ layoutMode: 'verse' });
await page.evaluate(() => {
  // 顶栏「逐节对照」
  const btns = Array.from(document.querySelectorAll('button'));
  const b = btns.find((x) => x.textContent?.includes('逐节对照'));
  b?.click();
});
await page.waitForTimeout(800);
await overlaps('B_compare_verse');
await page.screenshot({ path: 'E:/tmp/b-compare.png' });

// C) 分屏对照
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  btns.find((x) => x.textContent?.includes('分屏对照'))?.click();
});
await page.waitForTimeout(800);
await overlaps('C_split');
await page.screenshot({ path: 'E:/tmp/c-split.png' });

// D) 收起侧栏（预览放大 scale>1）+ 逐节
await setLS({ layoutMode: 'verse' });
await page.evaluate(() => {
  const b = document.querySelector('button[aria-label="切换侧栏"]');
  b?.click();
});
await page.waitForTimeout(900);
await overlaps('D_collapsed_sidebar');
await page.screenshot({ path: 'E:/tmp/d-collapsed.png' });

await browser.close();
console.log('DONE');
