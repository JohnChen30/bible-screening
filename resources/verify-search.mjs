import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE_ERR:', m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-verse]', { timeout: 20000 });
await page.waitForTimeout(400);

const panelLabels = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-panel-bar] button span')).map((s) => s.textContent).filter(Boolean),
  );

console.log('panels before:', JSON.stringify(await panelLabels()));

const input = page.locator('input[aria-label="搜索经文"]');
console.log('search box present:', await input.count());
await input.click();
await input.fill('光 暗');
await page.waitForTimeout(500);

const marks = await page.locator('mark').count();
const resultBtns = await page.locator('button:has(mark)').count();
console.log('marks(highlights):', marks, ' result rows:', resultBtns);
await page.screenshot({ path: 'E:/tmp/search-open.png' });
const header = page.locator('header').first();
await header.screenshot({ path: 'E:/tmp/search-header.png' });

const first = page.locator('button:has(mark)').first();
const firstText = (await first.innerText().catch(() => '')).replace(/\s+/g, ' ');
console.log('first result:', firstText);

await first.click();
await page.waitForTimeout(700);
console.log('panels after :', JSON.stringify(await panelLabels()));
const versesShown = await page.evaluate(() => Array.from(document.querySelectorAll('[data-verse]')).map((e) => e.getAttribute('data-verse')));
console.log('verses in reading area after jump:', JSON.stringify(versesShown));
await page.locator('[data-panel-canvas]').first().screenshot({ path: 'E:/tmp/search-jumped.png' });

await browser.close();
console.log('DONE');
