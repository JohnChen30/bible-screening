/**
 * 验证脚本：面板比例严格性 + 投影画面 = 预览画面等比放大
 *
 * 用户反馈：「比例完全不对」「投影画面要和预览画面一致，比例也一致，
 * 显示的内容范围也一致，只是大小不一致」
 *
 * 旧缺陷：
 *   1) aspect-ratio + width:100% + max-height:100% → 容器偏矮时高度被夹、
 *      宽度不变，比例被压扁（设 4:3 实际出 1.443）；
 *   2) 字号固定 px → 投影画布更大就显示更多行，内容范围对不上。
 * 修复：PanelCanvas 实测容器后 contain 计算像素尺寸；投影屏按
 *       scale = 自身画布宽 / 预览画布宽 整体等比放大排版。
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'E:/workspace/bible_screening/resources';
const errors = [];
const results = [];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`[console] PAGEERROR: ${e.message.slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] CONSOLE: ${m.text().slice(0, 200)}`);
});
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));

const pass = (label, ok, detail = '') =>
  results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);

/** 画布几何 + 缩放 + 字号 + 可见经文范围 */
const probe = (p) =>
  p.evaluate(() => {
    const c = document.querySelector('[data-panel-canvas]');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const sc = c.querySelector('.overflow-y-auto');
    const scr = sc?.getBoundingClientRect();
    const vt = c.querySelector('.reader-text');
    const rows = [...c.querySelectorAll('[data-verse]')]
      .map((v) => ({
        n: Number(v.getAttribute('data-verse')),
        top: v.getBoundingClientRect().top,
        bottom: v.getBoundingClientRect().bottom,
      }))
      .filter((v) => Number.isFinite(v.n));
    // 只统计「完整落在滚动视口内」的节：避免部分可见节的 4px 边界阈值
    // 在两屏不同缩放下被判成可见/不可见，造成假差异
    const vis = rows
      .filter((v) => scr && v.top >= scr.top - 1 && v.bottom <= scr.bottom + 1)
      .map((v) => v.n);
    const uniq = [...new Set(vis)].sort((a, b) => a - b);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      ratio: +(r.width / r.height).toFixed(3),
      scale: Number(c.getAttribute('data-canvas-scale')),
      fontSize: vt ? parseFloat(getComputedStyle(vt).fontSize) : 0,
      visible: uniq,
      visLabel: uniq.length ? `${uniq[0]}~${uniq[uniq.length - 1]}` : '无',
      scrollRatio: sc && sc.scrollHeight > sc.clientHeight ? +(sc.scrollTop / (sc.scrollHeight - sc.clientHeight)).toFixed(3) : 0,
    };
  });

const setRatio = async (label) => {
  await page.click('button[aria-label="排版设置"]');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(500);
  await page.click('button[aria-label="关闭设置"]');
  await page.waitForTimeout(700);
};

const EXPECT = { '4:3': 4 / 3, '16:9': 16 / 9, '16:10': 16 / 10 };

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-passage-title]', { timeout: 20000 });
await page.waitForTimeout(1200);

/* ============ 1. 预览画布比例严格等于设置值 ============ */
for (const [label, exp] of Object.entries(EXPECT)) {
  await setRatio(label);
  const a = await probe(page);
  pass(`预览画布比例严格 = ${label}`, !!a && Math.abs(a.ratio - exp) < 0.02,
    `实测 ${a?.w}x${a?.h} = ${a?.ratio}（期望 ${exp.toFixed(3)}）`);
}

/* ============ 2. 开投影，投影窗比例与预览一致 ============ */
await setRatio('16:10'); // 故意选非屏幕比例（1600x900 是 16:9），暴露任何失真
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(700);
await out.setViewportSize({ width: 1600, height: 900 });
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1800);

const pv = await probe(page);
const po = await probe(out);
pass('投影画布比例 = 预览画布比例', !!pv && !!po && Math.abs(pv.ratio - po.ratio) < 0.02,
  `预览 ${pv?.w}x${pv?.h}=${pv?.ratio} / 投影 ${po?.w}x${po?.h}=${po?.ratio}`);
pass('投影画布比例 = 设置值 16:10', !!po && Math.abs(po.ratio - EXPECT['16:10']) < 0.02,
  `投影 ${po?.ratio} / 期望 ${EXPECT['16:10'].toFixed(3)}`);

/* ============ 3. 等比缩放：投影 = 预览的放大 ============ */
const sizeRatio = pv && po ? po.w / pv.w : 0;
pass('投影缩放系数 = 投影画布宽 / 预览画布宽', !!po && Math.abs(po.scale - sizeRatio) < 0.02,
  `scale=${po?.scale} / 宽度比=${sizeRatio.toFixed(3)}`);
pass('预览为基准屏 scale=1', Math.abs((pv?.scale ?? 0) - 1) < 0.001, `预览 scale=${pv?.scale}`);
const fontRatio = pv && po && pv.fontSize ? po.fontSize / pv.fontSize : 0;
pass('投影字号 = 预览字号 × 同一缩放系数', Math.abs(fontRatio - sizeRatio) < 0.05,
  `字号 ${pv?.fontSize}px → ${po?.fontSize}px（×${fontRatio.toFixed(3)}，宽比 ${sizeRatio.toFixed(3)}）`);

/* ============ 4. 显示的内容范围一致（核心诉求） ============ */
const sameRange = !!pv && !!po && pv.visible.length > 0 && pv.visible.length === po.visible.length &&
  pv.visible.every((n, i) => n === po.visible[i]);
pass('两屏可见经文范围完全一致（顶部）', sameRange, `预览 ${pv?.visLabel} / 投影 ${po?.visLabel}`);

await setScroll(page, 0.5);
const pv2 = await probe(page);
const po2 = await probe(out);
const sameRange2 = !!pv2 && !!po2 && pv2.visible.length > 0 && pv2.visible.length === po2.visible.length &&
  pv2.visible.every((n, i) => n === po2.visible[i]);
pass('滚动到中部后可见经文范围仍一致', sameRange2,
  `预览 ${pv2?.visLabel} / 投影 ${po2?.visLabel}（滚动比例 ${pv2?.scrollRatio} / ${po2?.scrollRatio}）`);

await setScroll(page, 1);
const pv3 = await probe(page);
const po3 = await probe(out);
const sameRange3 = !!pv3 && !!po3 && pv3.visible.length > 0 && pv3.visible.length === po3.visible.length &&
  pv3.visible.every((n, i) => n === po3.visible[i]);
pass('滚到底部后可见经文范围仍一致', sameRange3, `预览 ${pv3?.visLabel} / 投影 ${po3?.visLabel}`);

/* ============ 5. 改比例后三屏同步 ============ */
await setRatio('4:3');
await page.waitForTimeout(2000);
const pv4 = await probe(page);
const po4 = await probe(out);
pass('改 4:3 后投影窗同步同比例', !!pv4 && !!po4 && Math.abs(pv4.ratio - po4.ratio) < 0.02 &&
  Math.abs(po4.ratio - EXPECT['4:3']) < 0.02,
  `预览 ${pv4?.ratio} / 投影 ${po4?.ratio}`);
pass('改比例后两屏内容范围仍一致',
  !!pv4 && !!po4 && pv4.visible.length === po4.visible.length &&
    pv4.visible.every((n, i) => n === po4.visible[i]),
  `预览 ${pv4?.visLabel} / 投影 ${po4?.visLabel}`);

await page.screenshot({ path: `${OUT}/scale-1-console.png` });
await out.screenshot({ path: `${OUT}/scale-2-output.png` });

await browser.close();

console.log('\n===== 面板比例与三屏等比缩放验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);

/** 按滚动比例设置预览滚动位置（滚动同步会带动投影窗） */
async function setScroll(p, ratio) {
  await p.evaluate((rt) => {
    const sc = document.querySelector('[data-panel-canvas] .overflow-y-auto');
    sc.scrollTop = (sc.scrollHeight - sc.clientHeight) * rt;
  }, ratio);
  // 滚动同步有 settle 重播链（80/250/600ms），留足收敛时间
  await p.waitForTimeout(1800);
}
