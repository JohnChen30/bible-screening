import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const con = await context.newPage();
await con.goto(URL, { waitUntil: 'networkidle' });
await con.evaluate(() => localStorage.setItem('bible-reader-settings', JSON.stringify({ state: { layoutMode: 'verse' }, version: 4 })));
await con.reload({ waitUntil: 'networkidle' });
await con.waitForSelector('[data-verse]', { timeout: 20000 });

const out = await context.newPage();
await out.goto(URL + 'output', { waitUntil: 'networkidle' });

await con.locator('button', { hasText: '投影' }).first().click();
await out.waitForTimeout(1500);

const measureOut = async (tag) => {
  const r = await out.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-index]')).map((el) => {
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10 };
    }).sort((a, b) => a.top - b.top);
    let bad = 0; const s = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 0.6) { bad++; if (s.length < 4) s.push([rows[i - 1].bottom, rows[i].top]); }
    const c = document.querySelector('[data-panel-canvas]');
    return { rows: rows.length, bad, s, w: c?.getAttribute('data-canvas-w'), h: c?.getAttribute('data-canvas-h'), scale: c?.getAttribute('data-canvas-scale') };
  });
  console.log(tag, 'rows=', r.rows, 'bad=', r.bad, 'canvas=', r.w + 'x' + r.h, 'scale=', r.scale, JSON.stringify(r.s));
};

await measureOut('OUT_start');
// 主控台滚动 → 镜像
for (const st of [300, 800, 1500, 2500]) {
  await con.evaluate((v) => { const el = document.querySelector('.scrollbar-thin.overflow-y-auto'); if (el) el.scrollTop = v; }, st);
  await out.waitForTimeout(600);
  await measureOut('OUT_after_con_scroll_' + st);
}
await out.screenshot({ path: 'E:/tmp/output-1920.png' });

await browser.close();
console.log('DONE');
