/** 验证脚本：隐藏节号设置项（用户反馈：给一个隐藏节号的设置项） */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const errors = [];
const results = [];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 200)}`);
});

const pass = (label, ok, detail = '') => results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-passage-title]', { timeout: 20000 });
await page.waitForTimeout(1200);

const verseNums = (p) => p.evaluate(() => document.querySelectorAll('[data-panel-canvas] sup.verse-number').length);

/* ---- 默认显示节号 ---- */
const before = await verseNums(page);
pass('默认显示节号', before >= 5, `节号数=${before}`);

/* ---- 开投影，投影窗同样有节号 ---- */
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1500);
const outBefore = await verseNums(out);
pass('投影窗默认显示节号', outBefore >= 5, `节号数=${outBefore}`);

/* ---- 关闭「显示节号」→ 三屏节号消失 ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(500);
// 投影中打开小窗默认落「投影」tab，先切回「排版」tab
await page.waitForTimeout(300);
// ToggleRow：<label>包裹文案 + Switch（Playwright 读不到包裹 label 的可访问名，改走 label 文本定位）
const switchEl = page.locator('label', { hasText: '显示节号' }).locator('[role="switch"]');
await switchEl.click();
await page.waitForTimeout(300);
const toggleOff = await switchEl.getAttribute('aria-checked');
pass('「显示节号」开关已关闭', toggleOff === 'false', `aria-checked=${toggleOff}`);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(900);
const after = await verseNums(page);
const outAfter = await verseNums(out);
pass('关闭后主控台节号消失', after === 0, `节号数=${after}`);
pass('关闭后投影窗节号同步消失', outAfter === 0, `节号数=${outAfter}`);
await page.screenshot({ path: 'E:/workspace/bible_screening/resources/verse-num-off.png' });

/* ---- 重新打开 → 三屏恢复 ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(500);
await page.waitForTimeout(300);
await page.locator('label', { hasText: '显示节号' }).locator('[role="switch"]').click();
await page.waitForTimeout(300);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(900);
const restored = await verseNums(page);
const outRestored = await verseNums(out);
pass('重开后主控台节号恢复', restored >= 5, `节号数=${restored}`);
pass('重开后投影窗节号恢复', outRestored >= 5, `节号数=${outRestored}`);

await browser.close();

console.log('\n===== 隐藏节号设置验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
