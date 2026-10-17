/** 探针3：完整复现 v4 流程，定位 v4-3 截图中"第 1 节"的来源 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 1', { timeout: 20000 });
await page.waitForTimeout(1200);

const state = () => page.evaluate(() => {
  const modalP = [...document.querySelectorAll('p')].find((p) => p.textContent?.trim() === '正在投影');
  const modal = modalP?.parentElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '(无)';
  const menu = [...document.querySelectorAll('span')].find((s) => /^[\u4e00-\u9fa5]+ \d+:\d+$/.test(s.textContent?.trim() ?? ''));
  return `${modal} | menu=${menu?.textContent ?? '无'}`;
});

await page.click('text=神说：要有光', { timeout: 10000 });
await page.waitForTimeout(900);
console.log('1 点击创1:3      →', await state());

await page.click('text=逐节对照');
await page.waitForTimeout(1200);
console.log('2 逐节对照       →', await state());

await page.click('button:has-text("以弗所书")', { timeout: 10000 });
await page.waitForTimeout(1500);
console.log('3 切换以弗所书   →', await state());

await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);
console.log('4 投影           →', await state());

const out2 = await ctx.newPage();
out2.on('pageerror', (e) => console.log('OUT2 PAGEERROR:', e.message));
await out2.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out2.waitForSelector('[data-verse]', { timeout: 15000 });
await out2.waitForTimeout(1200);
console.log('5 开投影窗口     →', await state());

await browser.close();
