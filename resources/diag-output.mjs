import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const console_ = await context.newPage();
console_.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE_ERR:', m.text()); });

await console_.goto(URL, { waitUntil: 'networkidle' });
await console_.evaluate(() => localStorage.setItem('bible-reader-settings', JSON.stringify({ state: { layoutMode: 'verse' }, version: 4 })));
await console_.reload({ waitUntil: 'networkidle' });
await console_.waitForSelector('[data-verse]', { timeout: 20000 });

// 打开投影窗口（第二标签页，共享 BroadcastChannel）
const out = await context.newPage();
out.on('console', (m) => { if (m.type() === 'error') console.log('OUT_ERR:', m.text()); });
await out.goto(URL + 'output', { waitUntil: 'networkidle' });

// 主控台开始投影
await console_.locator('button', { hasText: '投影' }).first().click();
await out.waitForTimeout(1500);
// 让投影窗收到负载
await out.evaluate(() => window.dispatchEvent(new Event('focus')));
await out.waitForTimeout(1500);

const r = await out.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('[data-index]')).map((el) => {
    const b = el.getBoundingClientRect();
    return { idx: Number(el.getAttribute('data-index')), top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
  }).sort((a, b) => a.top - b.top);
  const bad = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 1) bad.push({ idx: rows[i].idx, overlapPx: rows[i - 1].bottom - rows[i].top });
  const bodyText = (document.body.innerText || '').slice(0, 60).replace(/\n/g, ' | ');
  return { rows: rows.length, badLen: bad.length, bad: bad.slice(0, 6), sample: rows.slice(0, 8), bodyText };
});
console.log('OUTPUT rows:', r.rows, 'overlaps:', r.badLen, 'bodyText:', r.bodyText);
console.log('bad:', JSON.stringify(r.bad));
console.log('sample:', JSON.stringify(r.sample));

await out.screenshot({ path: 'E:/tmp/output-verse.png' });
await browser.close();
console.log('DONE');
