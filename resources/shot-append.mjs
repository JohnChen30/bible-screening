/** 截图演示：【经文追加】功能 + 三端同步
 *  流程：默认单段创1 → 点「添加到后续」进入追加模式 → 选 创2:1-25 → 追加为多段（段间分割线）
 *       → 同时投影窗渲染同一多段内容（三端一致）
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'E:/workspace/bible_screening/resources';
const errors = [];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`[console] PAGEERROR: ${e.message.slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] CONSOLE: ${m.text().slice(0, 200)}`); });

const btnText = (p) => p.evaluate(() => document.querySelector('[aria-label="经文选择器"]')?.parentElement?.parentElement?.querySelector('button')?.textContent?.trim() ?? '');

/** 在 Miller Columns 指定列里点某个按钮（按列头文本 + 按钮文本定位） */
const pick = (p, colHeader, label) =>
  p.evaluate(({ colHeader, label }) => {
    const container = document.querySelector('[aria-label="经文选择器"]');
    for (const col of container.children) {
      const header = col.querySelector('span');
      if (header && header.textContent.trim() === colHeader) {
        const btn = [...col.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
        btn?.click();
        return !!btn;
      }
    }
    return false;
  }, { colHeader, label });

const countTitles = (p) => p.evaluate(() => document.querySelectorAll('[data-panel-canvas] [data-passage-title]').length);

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 第1章', { timeout: 20000 });
await page.waitForTimeout(1200);

// 1) 初始：单段创1，按钮默认「添加到后续」
const t0 = await btnText(page);
const seg0 = await countTitles(page);
await page.screenshot({ path: `${OUT}/shot-append-1-initial.png` });
console.log(`初始: 按钮="${t0}" 段数=${seg0}`);

// 2) 进入追加模式
await page.getByRole('button', { name: '添加到后续', exact: true }).click();
await page.waitForTimeout(400);
const t1 = await btnText(page);
await page.screenshot({ path: `${OUT}/shot-append-2-appendmode.png` });
console.log(`追加模式: 按钮="${t1}"`);

// 3) 选 创2:1-25（章 → 起始节1 → 结束节25；结束节触发 onAppend 追加）
await pick(page, '章节', '2');
await page.waitForTimeout(500);
await pick(page, '起始节', '1');
await page.waitForTimeout(500);
await pick(page, '结束节', '25');
await page.waitForTimeout(1500);

const t2 = await btnText(page);
const seg2 = await countTitles(page);
// 滚到两段交界处，让「分割线 + 第 2 段标题」同框可见
await page.evaluate(() => {
  const d = document.querySelector('[data-panel-canvas] .passage-divider');
  d?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/shot-append-3-appended.png` });
console.log(`追加后: 按钮="${t2}" 段数=${seg2}`);

// 4) 三端同步：主区（阅读/预览） + 投影窗（滚动比例自动同步，两屏停在交界处）
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(700);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1800);
await page.evaluate(() => {
  const d = document.querySelector('[data-panel-canvas] .passage-divider');
  d?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/shot-append-4-console.png` });
await out.screenshot({ path: `${OUT}/shot-append-5-output.png` });
const segOut = await out.evaluate(() => document.querySelectorAll('[data-passage-title]').length);
console.log(`投影窗段数=${segOut}`);

await browser.close();

console.log('\n===== 经文追加 截图演示 =====');
console.log(`初始按钮="${t0}"(期望 添加到后续) / 追加模式="${t1}"(期望 选择后续经文) / 追加后="${t2}"(期望 添加到后续)`);
console.log(`段数: 初始=${seg0}(期望1) / 追加后=${seg2}(期望2) / 投影窗=${segOut}(期望2)`);
if (errors.length) { console.log('\n--- 页面错误 ---'); for (const e of errors) console.log(e); process.exit(1); }
if (t0 !== '添加到后续' || t1 !== '选择后续经文' || t2 !== '添加到后续' || seg0 !== 1 || seg2 !== 2 || segOut !== 2) {
  console.log('❌ 功能验证未通过'); process.exit(1);
}
console.log('✅ 经文追加功能 + 三端同步验证通过');
