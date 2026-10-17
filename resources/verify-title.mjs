/** 验证脚本：标题格式 + 点击反馈 + 选中强调色（反馈4-三 / 四） */
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
// 等标题渲染到最终态（范围后缀依赖经文数据异步加载；创世记 1 快照共 10 节）
await page.waitForFunction(
  () => /创世记 第1章 \d+-\d+节/.test(document.querySelector('[data-panel-canvas] h2')?.textContent ?? ''),
  { timeout: 10000 },
);

/** 读取画布内标题几何与文本 */
const titleInfo = (p) =>
  p.evaluate(() => {
    const canvas = document.querySelector('[data-panel-canvas]');
    const h2 = canvas?.querySelector('h2');
    if (!h2 || !canvas) return null;
    const cr = canvas.getBoundingClientRect();
    const hr = h2.getBoundingClientRect();
    const firstVerse = canvas.querySelector('[data-verse]');
    const vr = firstVerse?.getBoundingClientRect();
    const cs = getComputedStyle(h2);
    return {
      text: h2.textContent?.trim() ?? '',
      insideCanvas: hr.top >= cr.top - 1 && hr.bottom <= cr.bottom + 1 && hr.left >= cr.left - 1,
      aboveVerses: !vr || hr.bottom <= vr.top + 1,
      fontSize: parseFloat(cs.fontSize),
      centered: getComputedStyle(h2.parentElement).textAlign,
      color: cs.color,
    };
  });

/* ---- 格式一（默认）：第X章 → 创世记 第1章 1-10节 ---- */
const t1 = await titleInfo(page);
pass('标题格式一「书卷 第X章 A-B节」', t1?.text === '创世记 第1章 1-10节', `"${t1?.text}"`);
pass('标题在投影画布内部、经文正上方', !!t1?.insideCanvas && !!t1?.aboveVerses,
  `画布内=${t1?.insideCanvas}，经文上方=${t1?.aboveVerses}`);
pass('标题字号醒目（≥28px）且居中', !!t1 && t1.fontSize >= 28 && t1.centered === 'center',
  `字号=${t1?.fontSize}px，对齐=${t1?.centered}`);

/* ---- 格式二：章:节区间 → 创世记 1:1-10 ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(500);
await page.getByRole('button', { name: '章:节区间', exact: true }).click();
await page.waitForTimeout(700);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(500);
const t2 = await titleInfo(page);
pass('标题格式二「书卷 章:节区间」', t2?.text === '创世记 1:1-10', `"${t2?.text}"`);

/* ---- 点击反馈：闪现类 + 整节强调色 ---- */
await page.click('[data-panel-canvas] [data-verse="3"]', { timeout: 8000 });
await page.waitForTimeout(700);
const clickInfo = await page.evaluate(() => {
  const row = document.querySelector('[data-panel-canvas] [data-verse="3"]');
  const flashEl = row?.closest('.verse-cursor-flash') ?? document.querySelector('[data-panel-canvas] .verse-cursor-flash');
  // 强调色探针（dock 中游标引用用 text-accent）
  const probe = document.querySelector('[aria-label="高亮工具"] .text-accent');
  const verseText = row?.querySelector('.reader-text');
  return {
    hasFlash: !!flashEl,
    accentProbe: probe ? getComputedStyle(probe).color : '',
    verseColor: verseText ? getComputedStyle(verseText).color : '',
  };
});
pass('单击选节有闪现反馈', clickInfo.hasFlash);
pass('选中整节字体变强调色', !!clickInfo.accentProbe && clickInfo.verseColor === clickInfo.accentProbe,
  `经文=${clickInfo.verseColor} / 强调色=${clickInfo.accentProbe}`);

/* ---- 三屏一致：投影 + 投影窗标题相同且在画布内 ---- */
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
// 等标题渲染到最终态（数据异步加载，中间态可能缺范围后缀）
await out.waitForFunction(
  () => {
    const h2 = document.querySelector('[data-panel-canvas] h2');
    return !!h2 && /创世记 \d+:\d+/.test(h2.textContent ?? '');
  },
  { timeout: 10000 },
);
await out.waitForTimeout(600);
const t3 = await titleInfo(page);
const t4 = await titleInfo(out);
pass('投影预览与投影窗标题一致（画布内）', !!t3 && !!t4 && t3.text === t4.text && t4.insideCanvas && t4.aboveVerses,
  `预览="${t3?.text}" / 投影窗="${t4?.text}"`);
const outCursorColor = await out.evaluate(() => {
  const row = document.querySelector('[data-panel-canvas] [data-verse="3"]');
  const vt = row?.querySelector('.reader-text');
  return vt ? getComputedStyle(vt).color : '';
});
pass('投影窗选中节同为强调色', outCursorColor === clickInfo.accentProbe, `投影窗经文色=${outCursorColor}`);

/* ---- 标题格式切换三屏同步 ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(500);
await page.waitForTimeout(300);
await page.getByRole('button', { name: '第X章', exact: true }).click();
await page.waitForTimeout(800);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(600);
const t5 = await titleInfo(page);
const t6 = await titleInfo(out);
pass('标题格式切换三屏同步', t5?.text === '创世记 第1章 1-10节' && t6?.text === '创世记 第1章 1-10节',
  `预览="${t5?.text}" / 投影窗="${t6?.text}"`);

await page.screenshot({ path: `${OUT}/title-1-console.png` });
await out.screenshot({ path: `${OUT}/title-2-output.png` });

await browser.close();

console.log('\n===== 标题与点击反馈验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
