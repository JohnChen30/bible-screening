import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE_ERR:', m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-vmeta]', { timeout: 20000 });
await page.waitForTimeout(500);

// 1) 默认（段落排版 + reference 标题）
await page.screenshot({ path: 'E:/tmp/layout-default.png', fullPage: false });
const canvas = page.locator('[data-panel-canvas]').first();
if (await canvas.count()) await canvas.screenshot({ path: 'E:/tmp/layout-canvas.png' });

// 诊断：节元素与其父行盒的几何，检测垂直重叠
const diag = await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll('[data-vmeta]'));
  const rects = spans.map((el) => {
    const r = el.getBoundingClientRect();
    return { v: el.getAttribute('data-vmeta'), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  });
  return { count: rects.length, sample: rects.slice(0, 12) };
});
console.log(JSON.stringify(diag, null, 2));

await browser.close();
console.log('DONE');
