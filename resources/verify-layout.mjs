/** 验证脚本：排版模式（反馈4-二）— 逐节 / 段落，三屏同步刷新 */
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
await page.waitForTimeout(1500);

/** 读取画布内排版状态 */
const layoutInfo = (p) =>
  p.evaluate(() => {
    const paras = [...document.querySelectorAll('[data-panel-canvas] p.para-text')];
    const verseEls = document.querySelectorAll('[data-panel-canvas] [data-verse]');
    const firstPara = paras[0];
    const cs = firstPara ? getComputedStyle(firstPara) : null;
    return {
      paraCount: paras.length,
      verseCount: verseEls.length,
      textIndent: cs?.textIndent ?? '',
      fontSize: cs ? parseFloat(cs.fontSize) : 0,
      marginBottom: cs?.marginBottom ?? '',
      // 段内节号：sup 在 p 内且为行内上标
      supInPara: firstPara ? firstPara.querySelectorAll('sup.verse-number').length : 0,
      // 逐节模式：相邻节元素纵向堆叠（不同 offsetTop）
      stacked:
        verseEls.length >= 2
          ? Math.abs(verseEls[1].getBoundingClientRect().top - verseEls[0].getBoundingClientRect().top) > 20
          : false,
    };
  });

/* ---- 默认逐节模式：一节一块，无段落 ---- */
const verseMode = await layoutInfo(page);
pass('默认逐节排版（一节一块、无段落）', verseMode.paraCount === 0 && verseMode.verseCount >= 2 && verseMode.stacked,
  `段落=${verseMode.paraCount}，节元素=${verseMode.verseCount}，纵向堆叠=${verseMode.stacked}`);

/* ---- 切到段落模式 ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(500);
await page.getByRole('button', { name: '段落', exact: true }).click();
await page.waitForTimeout(900);
// 点外部关闭小窗
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(400);

const paraMode = await layoutInfo(page);
pass('段落排版：多节成段', paraMode.paraCount >= 1 && paraMode.paraCount < verseMode.verseCount,
  `段落数=${paraMode.paraCount}（原 ${verseMode.verseCount} 节）`);
// 缩进按 em 相对字号断言（投影屏整体等比放大后绝对值会变大，但仍须 = 2em）
pass('段落排版：首行缩进 2em', Math.abs(parseFloat(paraMode.textIndent) - 2 * paraMode.fontSize) < 1,
  `text-indent=${paraMode.textIndent}，字号=${paraMode.fontSize}px`);
pass('段落排版：段间有距', parseFloat(paraMode.marginBottom) > 5, `margin-bottom=${paraMode.marginBottom}`);
pass('段落排版：节号上标插入段内', paraMode.supInPara >= 4, `首段 sup 节号=${paraMode.supInPara} 个`);

/* ---- 段落模式下仍可点击选节（data-verse 在段内） ---- */
await page.click('[data-panel-canvas] [data-verse="3"]', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(700);
const cursorOk = await page.evaluate(() => {
  const hl = document.querySelector('[aria-label="高亮工具"]');
  return /:\s*3/.test(hl?.textContent ?? '');
});
pass('段落模式可点击选节', cursorOk);

/* ---- 三屏同步：投影 + 投影窗同为段落排版 ---- */
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1400);
const outPara = await layoutInfo(out);
pass('投影窗同步段落排版（等比放大后仍为 2em）',
  outPara.paraCount >= 1 && Math.abs(parseFloat(outPara.textIndent) - 2 * outPara.fontSize) < 1 &&
    outPara.supInPara >= 4,
  `投影窗段落=${outPara.paraCount}，缩进=${outPara.textIndent}，字号=${outPara.fontSize}px`);

/* ---- 切回逐节：三屏同步刷新 ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(500);
await page.waitForTimeout(300);
await page.getByRole('button', { name: '逐节', exact: true }).click();
await page.waitForTimeout(900);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(600);
const backVerse = await layoutInfo(page);
const outBack = await layoutInfo(out);
pass('切回逐节（阅读区）', backVerse.paraCount === 0 && backVerse.verseCount >= 2,
  `段落=${backVerse.paraCount}，节元素=${backVerse.verseCount}`);
pass('切回逐节（投影窗同步）', outBack.paraCount === 0 && outBack.verseCount >= 2,
  `投影窗段落=${outBack.paraCount}，节元素=${outBack.verseCount}`);

await page.screenshot({ path: `${OUT}/layout-1-verse.png` });
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(400);
await page.waitForTimeout(300);
await page.getByRole('button', { name: '段落', exact: true }).click();
await page.waitForTimeout(900);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/layout-2-paragraph.png` });
await out.screenshot({ path: `${OUT}/layout-3-output-paragraph.png` });

await browser.close();

console.log('\n===== 排版模式验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
