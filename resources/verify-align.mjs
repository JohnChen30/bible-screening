/**
 * 验证脚本：对齐与边距作用域（用户反馈）
 *   1) 标题左靠齐时与经文开头对齐（同一左边缘）；
 *   2) 边距始终左右内缩标题与经文（任何对齐模式下拖动边距都可见：居中向中间收拢、左/右对齐整块内移）；标题与经文始终同缘；
 *   3) 经文对齐（左 / 中 / 右）独立设置，三屏同步。
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'E:/workspace/bible_screening/resources';
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

/** 设置小窗内指定 SegRow 的选项按钮（标题对齐 / 经文对齐 各有一组左中右，必须锚定） */
const segBtn = (setting, opt) =>
  page.locator(`[data-setting="${setting}"]`).getByRole('button', { name: opt, exact: true });

const openSettings = async () => {
  await page.click('button[aria-label="排版设置"]');
  await page.waitForTimeout(500);
  // 投影中打开小窗默认落「投影」tab，先切回「排版」tab
  await page.waitForTimeout(300);
};
const closeSettings = async () => {
  await page.click('button[aria-label="关闭设置"]');
  await page.waitForTimeout(600);
};

/** 画布内标题与首节的左边缘 / 标题内边距 / 经文对齐 */
const edges = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('[data-panel-canvas]');
    const title = canvas?.querySelector('[data-passage-title]');
    const firstVerse = canvas?.querySelector('[data-verse]');
    const titleBox = title?.getBoundingClientRect();
    const verseBox = firstVerse?.getBoundingClientRect();
    const cs = title ? getComputedStyle(title) : null;
    return {
      titleLeft: titleBox ? Math.round(titleBox.left) : null,
      verseLeft: verseBox ? Math.round(verseBox.left) : null,
      titlePadLeft: cs ? parseFloat(cs.paddingLeft) : null,
      titleMarginLeft: cs ? parseFloat(cs.marginLeft) : null,
      align: cs?.textAlign ?? '',
      verseAlign: firstVerse ? getComputedStyle(firstVerse).textAlign : '',
    };
  });

/* ---- 1. 默认居中：标题有左右边距（margin 生效于标题） ---- */
const center = await edges();
pass('默认居中：标题带边距（margin 生效于标题）', !!center.titleMarginLeft && center.titleMarginLeft >= 40,
  `marginLeft=${center.titleMarginLeft}px`);

/* ---- 2. 切左靠齐：标题与经文开头对齐 ---- */
await openSettings();
await segBtn('标题对齐', '左').click();
await page.waitForTimeout(700);
await closeSettings();
const left = await edges();
pass('左靠齐：标题与经文左边缘对齐（≤2px）',
  !!left.titleLeft && !!left.verseLeft && Math.abs(left.titleLeft - left.verseLeft) <= 2,
  `标题左=${left.titleLeft} / 经文左=${left.verseLeft}`);
pass('左靠齐：标题随边距内缩（margin 生效于标题）', !!left.titleMarginLeft && left.titleMarginLeft >= 40,
  `marginLeft=${left.titleMarginLeft}px`);

/* ---- 3. 边距加到最大（6rem）：左靠齐仍贴齐，且经文左边缘不动（边距对经文无效） ---- */
await openSettings();
// 边距行：span[边距] → 标签 flex 行 → 外层 Row div → 其中的 slider
const marginSlider = await page.evaluateHandle(() => {
  const span = [...document.querySelectorAll('span')].find((s) => s.textContent?.trim() === '边距');
  const row = span?.closest('div.space-y-2');
  return row?.querySelector('[role="slider"]') ?? null;
});
const sliderEl = marginSlider.asElement();
if (!sliderEl) {
  pass('边距滑块可定位', false, 'not found');
} else {
  await sliderEl.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight'); // 3rem → 6rem（步进 0.5）
  await page.waitForTimeout(400);
}
const marginVal = await page.evaluate(() => document.body.innerText.match(/边距\s*(\d+(?:\.\d+)?)rem/)?.[1] ?? '?');
await closeSettings();
const maxed = await edges();
pass('边距已加到最大（≥5.5rem）', parseFloat(marginVal) >= 5.5, `margin=${marginVal}rem`);
pass('大边距下：左靠齐标题与经文仍对齐（同左缘）',
  !!maxed.titleLeft && !!maxed.verseLeft && Math.abs(maxed.titleLeft - maxed.verseLeft) <= 2,
  `标题左=${maxed.titleLeft} / 经文左=${maxed.verseLeft}`);
pass('左靠齐：大边距下经文左缘随边距内移（可见反应）',
  !!maxed.verseLeft && !!left.verseLeft && maxed.verseLeft - left.verseLeft >= 40,
  `3rem 时=${left.verseLeft} → ${marginVal}rem 时=${maxed.verseLeft}`);
await page.screenshot({ path: `${OUT}/align-1-left.png` });

/* ---- 4. 切回居中：标题恢复边距（边距只对标题有效的另一面） ---- */
await openSettings();
await segBtn('标题对齐', '中').click();
await page.waitForTimeout(700);
await closeSettings();
const backCenter = await edges();
pass('切回居中：大边距下标题仍有大边距', !!backCenter.titleMarginLeft && backCenter.titleMarginLeft >= 80,
  `marginLeft=${backCenter.titleMarginLeft}px（margin=${marginVal}rem）`);
// 边距现在同时作用于经文：居中模式下 margin 3→6rem 应把经文左缘向内推移（肉眼可见的「收拢」）
pass('居中模式：边距同步内缩经文（3→6rem 经文左缘内移 ≥40px）',
  !!backCenter.verseLeft && !!center.verseLeft && backCenter.verseLeft - center.verseLeft >= 40,
  `3rem 时经文左=${center.verseLeft} → 6rem 时=${backCenter.verseLeft}`);

/* ---- 5. 经文对齐：中 / 右 / 左，主控台 + 投影窗同步 ---- */
const verseAlignOf = (p) =>
  p.evaluate(() => {
    const v = document.querySelector('[data-panel-canvas] [data-verse]');
    return v ? getComputedStyle(v).textAlign : '';
  });

await openSettings();
await segBtn('经文对齐', '中').click();
await page.waitForTimeout(700);
await closeSettings();
const vaCenter = await verseAlignOf(page);
pass('经文对齐=中：主控台经文居中', vaCenter === 'center', `text-align=${vaCenter}`);

// 投影窗同步
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1500);
const outCenter = await verseAlignOf(out);
pass('经文对齐=中：投影窗同步居中', outCenter === 'center', `text-align=${outCenter}`);

await openSettings();
await segBtn('经文对齐', '右').click();
await page.waitForTimeout(700);
await closeSettings();
const vaRight = await verseAlignOf(page);
const outRight = await verseAlignOf(out);
pass('经文对齐=右：主控台经文右对齐', vaRight === 'right', `text-align=${vaRight}`);
pass('经文对齐=右：投影窗同步右对齐', outRight === 'right', `text-align=${outRight}`);
await page.screenshot({ path: `${OUT}/align-3-verse-right.png` });

await openSettings();
await segBtn('经文对齐', '左').click();
await page.waitForTimeout(700);
await closeSettings();
const vaLeft = await verseAlignOf(page);
const outLeft = await verseAlignOf(out);
pass('经文对齐=左：主控台恢复左对齐', vaLeft === 'left', `text-align=${vaLeft}`);
pass('经文对齐=左：投影窗同步左对齐', outLeft === 'left', `text-align=${outLeft}`);

/* ---- 6. 段落模式下非左对齐不首行缩进 ---- */
await openSettings();
await page.locator('[data-setting="排版模式"]').getByRole('button', { name: '段落', exact: true }).click();
await page.waitForTimeout(700);
await segBtn('经文对齐', '中').click();
await page.waitForTimeout(700);
await closeSettings();
const paraInfo = await page.evaluate(() => {
  const p = document.querySelector('[data-panel-canvas] p.para-text');
  if (!p) return null;
  const cs = getComputedStyle(p);
  return { textIndent: parseFloat(cs.textIndent), textAlign: cs.textAlign };
});
pass('段落模式+居中：首行缩进清零', !!paraInfo && paraInfo.textIndent === 0,
  `text-indent=${paraInfo?.textIndent}px, text-align=${paraInfo?.textAlign}`);
await page.screenshot({ path: `${OUT}/align-4-para-center.png` });

// 还原：逐节 + 左对齐
await openSettings();
await page.locator('[data-setting="排版模式"]').getByRole('button', { name: '逐节', exact: true }).click();
await page.waitForTimeout(700);
await segBtn('经文对齐', '左').click();
await page.waitForTimeout(700);
await closeSettings();
await page.locator('header').getByRole('button', { name: '退出投影', exact: true }).click();
await page.waitForTimeout(500);

await browser.close();

console.log('\n===== 对齐与边距作用域验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
