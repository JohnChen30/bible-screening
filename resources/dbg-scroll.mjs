import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[console] PAGEERROR:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console] ERR:', m.text()));

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 1', { timeout: 20000 });
await page.waitForTimeout(1200);

// 选创世记第 2 章（25 节完整数据，有真实滚动范围；第 1 章数据源仅 10 节）
await page.evaluate(() => {
  const container = document.querySelector('[aria-label="经文选择器"]');
  for (const col of container.children) {
    const header = col.querySelector('span');
    if (header && header.textContent.trim() === '章节') {
      const btn = [...col.querySelectorAll('button')].find((b) => b.textContent.trim() === '2');
      btn?.click();
      return;
    }
  }
});
await page.waitForTimeout(2000);

const dump = (p, tag) =>
  p.evaluate((tag) => {
    const els = document.querySelectorAll('[data-panel-canvas] .overflow-y-auto');
    const verses = document.querySelectorAll('[data-verse]').length;
    const title = document.querySelector('[data-panel-canvas] h2')?.textContent ?? '';
    return `${tag}: count=${els.length} verses=${verses} title="${title}" ` + [...els].map((el, i) => `[${i}] sh=${el.scrollHeight} ch=${el.clientHeight} st=${Math.round(el.scrollTop)} r=${(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)).toFixed(3)}`).join(' | ');
  }, tag);

console.log(await dump(page, 'console 单版'));

const setRatio = (p, idx, r) =>
  p.evaluate(({ idx, r }) => {
    const els = document.querySelectorAll('[data-panel-canvas] .overflow-y-auto');
    const el = els[idx];
    if (!el) return 'missing';
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = r * max;
    return `max=${max}`;
  }, { idx, r });

await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);
const out = await ctx.newPage();
out.on('pageerror', (e) => console.log('[output] PAGEERROR:', e.message));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1800);
console.log(await dump(page, 'console 投影后'));
console.log(await dump(out, 'output 初始'));

console.log('set console 0.5 →', await setRatio(page, 0, 0.5));
await page.waitForTimeout(500);
console.log(await dump(page, 'console set 0.5'));
console.log(await dump(out, 'output after 0.5'));

await page.click('button:has-text("分屏对照")');
await page.waitForTimeout(2500);
console.log(await dump(page, 'console 分屏'));
console.log(await dump(out, 'output 分屏'));

console.log('set col0 0.3 →', await setRatio(page, 0, 0.3));
console.log('set col1 0.6 →', await setRatio(page, 1, 0.6));
await page.waitForTimeout(600);
console.log(await dump(page, 'console 分屏 set'));
console.log(await dump(out, 'output 分屏 after'));

await page.waitForTimeout(1000);
console.log(await dump(page, 'console 1s 后'));
console.log(await dump(out, 'output 1s 后'));

await browser.close();
