import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/console', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 第1章', { timeout: 20000 });
await page.waitForTimeout(1200);
const light = await page.evaluate(() => {
  const header = document.querySelector('header.toolbar-glass');
  const rs = getComputedStyle(document.documentElement);
  return {
    dark: document.documentElement.classList.contains('dark'),
    borderToken: rs.getPropertyValue('--border').trim(),
    headerBorderBottom: header ? getComputedStyle(header).borderBottomColor : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  };
});
console.log(JSON.stringify(light, null, 2));
await browser.close();
