/** 验证脚本：下划线只加下划线、不带高亮背景（反馈：添加下划线不要 highlight） */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'E:/workspace/bible_screening/resources';
const errors = [];
const results = [];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`[console] PAGEERROR: ${e.message.slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] CONSOLE: ${m.text().slice(0, 200)}`);
});

const pass = (label, ok, detail = '') => results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 第1章', { timeout: 20000 });
await page.waitForTimeout(1200);

/* 选中第 3 节 → 呼出高亮控件 */
await page.click('[data-verse="3"]', { timeout: 10000 });
await page.waitForTimeout(800);

/** 读取当前节 <mark> 的计算样式（阅读区画布内） */
const markStyle = () =>
  page.evaluate(() => {
    const mark = document.querySelector('[data-panel-canvas] mark');
    if (!mark) return null;
    const cs = getComputedStyle(mark);
    return {
      underline: cs.textDecorationLine.includes('underline'),
      bg: cs.backgroundColor,
      text: mark.textContent?.slice(0, 12) ?? '',
    };
  });

/* ---- 1. 点下划线：只有下划线、无背景 ---- */
await page.click('button[aria-label="下划线"]');
await page.waitForTimeout(700);
const m1 = await markStyle();
const pressed1 = await page.evaluate(() => document.querySelector('button[aria-label="下划线"]')?.getAttribute('aria-pressed'));
pass('下划线不附带高亮背景', !!m1 && m1.underline && m1.bg === 'rgba(0, 0, 0, 0)',
  m1 ? `underline=${m1.underline}, bg=${m1.bg}` : '无 mark');
pass('下划线按钮激活态', pressed1 === 'true', `aria-pressed=${pressed1}`);

/* ---- 2. 开投影 + 投影窗：下划线三屏一致 ---- */
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1200);
const outM = await out.evaluate(() => {
  const mark = document.querySelector('[data-panel-canvas] mark');
  if (!mark) return null;
  const cs = getComputedStyle(mark);
  return { underline: cs.textDecorationLine.includes('underline'), bg: cs.backgroundColor };
});
pass('投影窗下划线同样无背景', !!outM && outM.underline && outM.bg === 'rgba(0, 0, 0, 0)',
  outM ? `underline=${outM.underline}, bg=${outM.bg}` : '投影窗无 mark');

/* ---- 3. 再点一次下划线：取消 ---- */
await page.click('button[aria-label="下划线"]');
await page.waitForTimeout(700);
const m2 = await markStyle();
pass('再点下划线可取消', m2 === null, m2 ? `仍有 mark: ${m2.text}` : '已移除');

/* ---- 4. 点上色：只有背景、无下划线 ---- */
await page.click('button[aria-label="高亮-琥珀"]');
await page.waitForTimeout(700);
const m3 = await markStyle();
pass('纯色高亮无下划线', !!m3 && !m3.underline && m3.bg !== 'rgba(0, 0, 0, 0)',
  m3 ? `underline=${m3.underline}, bg=${m3.bg}` : '无 mark');

/* ---- 5. 彩色高亮上叠下划线：两者共存（用户主动叠加） ---- */
await page.click('button[aria-label="下划线"]');
await page.waitForTimeout(700);
const m4 = await markStyle();
pass('彩色高亮可叠下划线', !!m4 && m4.underline && m4.bg !== 'rgba(0, 0, 0, 0)',
  m4 ? `underline=${m4.underline}, bg=${m4.bg}` : '无 mark');

/* ---- 6. 再点下划线：只去掉下划线、保留颜色 ---- */
await page.click('button[aria-label="下划线"]');
await page.waitForTimeout(700);
const m5 = await markStyle();
pass('取消下划线保留颜色', !!m5 && !m5.underline && m5.bg !== 'rgba(0, 0, 0, 0)',
  m5 ? `underline=${m5.underline}, bg=${m5.bg}` : '无 mark');

/* ---- 7. 换色替换而非叠加（节内仅一条 mark） ---- */
await page.click('button[aria-label="高亮-宝石蓝"]');
await page.waitForTimeout(700);
const m6 = await page.evaluate(() => {
  const marks = document.querySelectorAll('[data-panel-canvas] mark');
  const cs = marks[0] ? getComputedStyle(marks[0]) : null;
  return { count: marks.length, bg: cs?.backgroundColor ?? '', underline: cs?.textDecorationLine.includes('underline') ?? false };
});
pass('换色替换不叠加', m6.count === 1 && m6.bg !== 'rgba(0, 0, 0, 0)' && !m6.underline,
  `marks=${m6.count}, bg=${m6.bg}, underline=${m6.underline}`);

/* ---- 8. 投影窗同步最终状态 ---- */
await page.waitForTimeout(600);
const outFinal = await out.evaluate(() => {
  const marks = document.querySelectorAll('[data-panel-canvas] mark');
  return { count: marks.length, bg: marks[0] ? getComputedStyle(marks[0]).backgroundColor : '' };
});
pass('投影窗同步换色结果', outFinal.count === 1 && outFinal.bg === m6.bg, `投影 marks=${outFinal.count}, bg=${outFinal.bg}`);

await page.screenshot({ path: `${OUT}/underline-1-console.png` });
await out.screenshot({ path: `${OUT}/underline-2-output.png` });

await browser.close();

console.log('\n===== 下划线修复验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
