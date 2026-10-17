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
await page.waitForSelector('[data-verse]', { timeout: 20000 });

// 开始投影
await page.locator('button', { hasText: '投影' }).first().click().catch(() => {});
await page.waitForTimeout(700);

const dock = await page.evaluate(() => {
  const d = document.querySelector('[data-projection-dock]');
  return d ? Array.from(d.querySelectorAll('button')).map((b) => b.textContent?.trim()).filter(Boolean) : null;
});
console.log('DOCK BUTTONS:', JSON.stringify(dock));
console.log('HAS 上一节:', await page.locator('button', { hasText: '上一节' }).count());

// 键盘 → 不报错
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('c');
await page.waitForTimeout(300);
console.log('AFTER KEYS OK');

await browser.close();
console.log('DONE');
