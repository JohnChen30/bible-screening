import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('PAGE_ERR:', m.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-vmeta]', { timeout: 20000 });

async function dumpState(tag) {
  const info = await page.evaluate(() => ({
    buttons: Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim()),
    sel: window.getSelection()?.toString(),
    bodyHasCopy: document.body.innerText.includes('复制经文'),
  }));
  console.log(tag, JSON.stringify(info));
}

// ---- 单节单击：用 verse 模式外层 [data-verse] ----
await dumpState('BEFORE_CLICK');
const v3 = page.locator('[data-verse="3"]');
await v3.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await v3.click();
await page.waitForTimeout(500);
await dumpState('AFTER_CLICK_V3');

const copyBtn = page.getByRole('button', { name: '复制经文' });
let appeared = true;
try {
  await copyBtn.waitFor({ state: 'visible', timeout: 4000 });
} catch {
  appeared = false;
}
console.log('SINGLE_CLICK_BAR_APPEARED:', appeared);

if (appeared) {
  await copyBtn.click();
  await page.waitForTimeout(400);
  await dumpState('AFTER_COPY');
  const clip = await page.evaluate(async () => navigator.clipboard.readText());
  console.log('SINGLE_CLIP>>>');
  console.log(clip);
  console.log('<<<SINGLE_CLIP_END');
}

await browser.close();
console.log('DONE');
