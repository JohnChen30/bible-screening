import { createRequire } from 'module';
const require = createRequire('C:/Users/afire/.workbuddy/binaries/node/workspace/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE_ERR:', m.text()); });

async function reset() {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-verse]', { timeout: 20000 });
  await page.waitForTimeout(300);
}
async function selectVerses(verses) {
  for (const v of verses) {
    const el = page.locator(`[data-verse="${v}"]`).first();
    await el.scrollIntoViewIfNeeded();
    await el.click();
    await page.waitForTimeout(120);
  }
}
async function copyBarVisible() {
  return await page.getByRole('button', { name: '复制经文' }).count();
}
async function copyAndRead() {
  const btn = page.getByRole('button', { name: '复制经文' });
  await btn.waitFor({ state: 'visible', timeout: 4000 });
  await btn.click();
  await page.waitForTimeout(400);
  return await page.evaluate(async () => navigator.clipboard.readText());
}
/** 页面上仍带强调色的节号数量（VerseItem 的 sup 带内联 color） */
async function accentCount() {
  return await page.evaluate(() => document.querySelectorAll('sup[style*="color"]').length);
}

// ---------- 1) 非连号同章：3,5,7 ----------
await reset();
await selectVerses([3, 5, 7]);
console.log('T1 bar visible:', await copyBarVisible());
const t1 = await copyAndRead();
console.log('T1 clip>>>\n' + t1 + '\n<<<');
console.log('T1 bar after:', await copyBarVisible(), ' accents after:', await accentCount());

// ---------- 2) 连号：2,3,4 ----------
await reset();
await selectVerses([2, 3, 4]);
const t2 = await copyAndRead();
console.log('T2 clip>>>\n' + t2 + '\n<<<');

// ---------- 3) 单节：3 ----------
await reset();
await selectVerses([3]);
const t3 = await copyAndRead();
console.log('T3 clip>>>\n' + t3 + '\n<<<');

// ---------- 4) 新建面板：先清屏 ----------
await reset();
const verseBefore = await page.evaluate(() => document.querySelectorAll('[data-verse]').length);
await page.getByRole('button', { name: '新建面板' }).click();
await page.waitForTimeout(500);
const verseAfterNew = await page.evaluate(() => document.querySelectorAll('[data-verse]').length);
const hasEmptyMsg = await page.evaluate(() => document.body.innerText.includes('暂无内容'));
console.log('T4 verses before:', verseBefore, ' after new panel:', verseAfterNew, ' emptyMsg:', hasEmptyMsg);

// 选经文上屏：点一个新书卷
await page.locator('button', { hasText: '出埃及记' }).first().click();
await page.waitForTimeout(600);
const verseAfterPick = await page.evaluate(() => document.querySelectorAll('[data-verse]').length);
const panelNames = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-panel-bar] button span')).map((s) => s.textContent).filter(Boolean).slice(0, 6),
);
console.log('T4 verses after pick book:', verseAfterPick, ' panel labels:', JSON.stringify(panelNames));

await browser.close();
console.log('DONE');
