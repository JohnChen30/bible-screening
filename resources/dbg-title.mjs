/** 调试：输出窗标题为何缺范围后缀 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[console PAGEERROR]', e.message.slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console ERR]', m.text().slice(0, 300));
});

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 第1章', { timeout: 20000 });
await page.waitForTimeout(1500);

// 切到格式二
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(400);
await page.getByRole('button', { name: '章:节区间', exact: true }).click();
await page.waitForTimeout(600);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(400);

const consoleDump = await page.evaluate(() => {
  const h2s = [...document.querySelectorAll('h2')].map((h) => h.textContent?.trim());
  return { h2s, verseLine: !!document.querySelector('.verse-line') };
});
console.log('console:', JSON.stringify(consoleDump));

// 投影
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(800);

// context 里已有的 output popup（window.open 打开的）
const pages = ctx.pages();
console.log('context pages:', pages.length, pages.map((p) => p.url()));

const out = pages.find((p) => p.url().includes('/output')) ?? (await ctx.newPage());
if (!out.url().includes('/output')) {
  await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
}
out.on('pageerror', (e) => console.log('[output PAGEERROR]', e.message.slice(0, 300)));
out.on('console', (m) => {
  if (m.type() === 'error') console.log('[output ERR]', m.text().slice(0, 300));
});
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(2000);

const outDump = await out.evaluate(() => {
  const canvas = document.querySelector('[data-panel-canvas]');
  const h2 = canvas?.querySelector('h2');
  const row = document.querySelector('[data-verse]');
  return {
    h2html: h2?.outerHTML?.slice(0, 400) ?? null,
    verseLine: !!document.querySelector('.verse-line'),
    readerTextCount: document.querySelectorAll('.reader-text').length,
    rowHtml: row?.outerHTML?.slice(0, 300) ?? null,
    canvasCount: document.querySelectorAll('[data-panel-canvas]').length,
  };
});
console.log('output:', JSON.stringify(outDump, null, 2));

await browser.close();
