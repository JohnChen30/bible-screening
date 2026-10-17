import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();

async function run(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('bible-reader-settings', JSON.stringify({ state: { layoutMode: 'verse' }, version: 4 })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-verse]', { timeout: 20000 });
  await page.waitForTimeout(500);

  const measure = async () =>
    page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-index]')).map((el) => {
        const b = el.getBoundingClientRect();
        return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10 };
      }).sort((a, b) => a.top - b.top);
      let bad = 0;
      const samples = [];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].top < rows[i - 1].bottom - 0.6) { bad++; if (samples.length < 4) samples.push([rows[i - 1].bottom, rows[i].top]); }
      }
      const c = document.querySelector('[data-panel-canvas]');
      return { rows: rows.length, bad, samples, w: c?.getAttribute('data-canvas-w'), h: c?.getAttribute('data-canvas-h'), scale: c?.getAttribute('data-canvas-scale') };
    });

  const before = await measure();
  await page.locator('button', { hasText: '投影' }).first().click();
  await page.waitForTimeout(1200);
  const after = await measure();
  console.log(`viewport ${viewport.width}x${viewport.height}  BEFORE bad=${before.bad} w=${before.w} h=${before.h} scale=${before.scale}  |  AFTER bad=${after.bad} w=${after.w} h=${after.h} scale=${after.scale} samples=${JSON.stringify(after.samples)}`);
  await context.close();
}

for (const vp of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 700 }]) {
  await run(vp);
}
await browser.close();
console.log('DONE');
