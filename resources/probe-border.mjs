/** 探针：border 令牌与透明度修饰符的实际计算值 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 第1章', { timeout: 20000 });
await page.waitForTimeout(1200);

// 切深色
const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
if (!isDark) {
  await page.click('button[aria-label="切换主题"]');
  await page.waitForTimeout(600);
}

const probe = await page.evaluate(() => {
  const rs = getComputedStyle(document.documentElement);
  const header = document.querySelector('header.toolbar-glass');
  const aside = document.querySelector('aside');
  const canvas = document.querySelector('[data-panel-canvas]');
  return {
    dark: document.documentElement.classList.contains('dark'),
    borderToken: rs.getPropertyValue('--border').trim(),
    bgToken: rs.getPropertyValue('--background').trim(),
    cardToken: rs.getPropertyValue('--card').trim(),
    headerBorderBottom: header ? getComputedStyle(header).borderBottomColor : null,
    asideBorderRight: aside ? getComputedStyle(aside).borderRightColor : null,
    canvasRadius: canvas ? getComputedStyle(canvas).borderRadius : null,
    canvasShadow: canvas ? getComputedStyle(canvas).boxShadow : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
