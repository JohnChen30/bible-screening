/** macOS 化改造视觉验收：回归 v5 断言 + 截图 m6-1~3 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'E:/workspace/bible_screening/resources';
const errors = [];
const results = [];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 200)}`); });

const pass = (label, ok, detail = '') => results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 第1章', { timeout: 20000 });
await page.waitForTimeout(1200);

/* 回归关键点 */
const canvas = () => page.evaluate(() => {
  const el = document.querySelector('[data-panel-canvas]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), ratio: r.width / r.height, bg: getComputedStyle(el).backgroundColor };
});
const c0 = await canvas();
pass('面板画布存在 16:9', !!c0 && Math.abs(c0.ratio - 16 / 9) < 0.06, c0 ? `${c0.w}x${c0.h}` : 'not found');
pass('面板固定底色 #121212', !!c0 && c0.bg === 'rgb(18, 18, 18)', c0?.bg ?? '');

/* 工具栏毛玻璃生效 */
const headerGlass = await page.evaluate(() => {
  const h = document.querySelector('main header');
  if (!h) return null;
  const s = getComputedStyle(h);
  return { blur: s.backdropFilter || s.webkitBackdropFilter, bg: s.backgroundColor };
});
pass('顶栏毛玻璃材质', !!headerGlass && /blur/.test(headerGlass.blur ?? ''), headerGlass ? `blur=${headerGlass.blur}` : 'not found');

/* m6-1 主界面 */
await page.screenshot({ path: `${OUT}/m6-1-console.png` });

/* 高亮 dock + m6-2 */
await page.click('text=神说：要有光', { timeout: 10000 });
await page.waitForTimeout(900);
const dock = await page.locator('[data-projection-dock]');
pass('控件条嵌入文档流', await dock.count() === 1 && await dock.first().evaluate((el) => getComputedStyle(el).position) === 'static');
await page.screenshot({ path: `${OUT}/m6-2-dock.png` });

/* 设置弹窗 + m6-3 */
await page.click('button[title="排版设置"]', { timeout: 5000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/m6-3-settings.png` });
await page.keyboard.press('Escape');

console.log(results.join('\n'));
console.log('---');
console.log(errors.length ? `RUNTIME ERRORS (${errors.length}):\n` + errors.join('\n') : 'RUNTIME ERRORS: 0');
await browser.close();
