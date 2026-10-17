import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-vmeta]', { timeout: 20000 });
await page.waitForTimeout(500);

const canvas = page.locator('[data-panel-canvas]').first();
await canvas.screenshot({ path: 'E:/tmp/zoom-canvas.png' });

await browser.close();
console.log('DONE');
