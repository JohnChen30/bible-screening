import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

async function readTitle() {
  await page.waitForSelector('[data-passage-title]', { timeout: 15000 });
  return (await page.locator('[data-passage-title]').first().innerText()).replace(/\s+/g, ' ').trim();
}

// 1) 全新（无持久化）→ 应取新默认 reference
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
console.log('FRESH title:', await readTitle());

// 2) 已有 v3 持久化（旧默认 chapterCn）→ 迁移应改成 reference
await page.evaluate(() => {
  localStorage.setItem(
    'bible-reader-settings',
    JSON.stringify({ state: { titleFormat: 'chapterCn', lineHeight: 1.5 }, version: 3 }),
  );
});
await page.reload({ waitUntil: 'networkidle' });
console.log('MIGRATED title:', await readTitle());

// 3) 用户主动设回 chapterCn → 不应被迁移覆盖
await page.evaluate(() => {
  localStorage.setItem(
    'bible-reader-settings',
    JSON.stringify({ state: { titleFormat: 'reference' }, version: 4 }),
  );
});
await page.reload({ waitUntil: 'networkidle' });
console.log('V4 kept title:', await readTitle());

await browser.close();
console.log('DONE');
