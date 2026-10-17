/** 验证脚本：滚动完全同步（反馈4-一）— 比例广播 / rAF 节流 / 投影窗瞬时应用 */
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

/* 选创世记第 2 章（25 节完整数据；第 1 章数据源仅 10 节无滚动范围） */
await page.evaluate(() => {
  const container = document.querySelector('[aria-label="经文选择器"]');
  for (const col of container.children) {
    const header = col.querySelector('span');
    if (header && header.textContent.trim() === '章节') {
      const btn = [...col.querySelectorAll('button')].find((b) => b.textContent.trim() === '2');
      btn?.click();
      return;
    }
  }
});
await page.waitForTimeout(2200);

/** 设置第 idx 个滚动容器的比例，返回 max scroll */
const setRatio = (p, idx, r) =>
  p.evaluate(({ idx, r }) => {
    const els = document.querySelectorAll('[data-panel-canvas] .overflow-y-auto');
    const el = els[idx];
    if (!el) return -1;
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = r * max;
    return max;
  }, { idx, r });

/** 读取第 idx 个滚动容器的比例 */
const getRatio = (p, idx) =>
  p.evaluate((idx) => {
    const els = document.querySelectorAll('[data-panel-canvas] .overflow-y-auto');
    const el = els[idx];
    if (!el) return null;
    const max = el.scrollHeight - el.clientHeight;
    return max > 0 ? el.scrollTop / max : 0;
  }, idx);

/* ---- 先滚到 50%，再开投影 + 开投影窗：握手拉取初始比例 ---- */
const max0 = await setRatio(page, 0, 0.5);
pass('阅读区可滚动', max0 > 300, `max=${Math.round(max0)}px`);
await page.waitForTimeout(400); // 等虚拟列表测量稳定
const cInit = await getRatio(page, 0);

await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1500); // 握手 + 双 rAF 重应用

const initOut = await getRatio(out, 0);
pass('握手：投影窗拉取初始滚动比例', initOut != null && cInit != null && Math.abs(initOut - cInit) < 0.03,
  `阅读区=${cInit?.toFixed(3)} / 投影窗=${initOut?.toFixed(3)}`);

/* ---- 手动设置比例 40% / 75%：投影窗瞬时跟随 ---- */
await setRatio(page, 0, 0.4);
await page.waitForTimeout(600); // 等测量稳定后再比对
const c40 = await getRatio(page, 0);
const o40 = await getRatio(out, 0);
pass('滚动比例同步 40%', c40 != null && o40 != null && Math.abs(o40 - c40) < 0.02,
  `阅读区=${c40?.toFixed(3)} / 投影窗=${o40?.toFixed(3)}`);

await setRatio(page, 0, 0.75);
await page.waitForTimeout(600);
const c75 = await getRatio(page, 0);
const o75 = await getRatio(out, 0);
pass('滚动比例同步 75%', c75 != null && o75 != null && Math.abs(o75 - c75) < 0.02,
  `阅读区=${c75?.toFixed(3)} / 投影窗=${o75?.toFixed(3)}`);

/* ---- 滚轮滚动：连续滚动也跟随（rAF 节流不卡顿） ---- */
await setRatio(page, 0, 0.2);
await page.waitForTimeout(500);
const box = await page.locator('[data-panel-canvas]').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(250);
await page.mouse.wheel(0, 300);
await page.waitForTimeout(450);
const cw = await getRatio(page, 0);
const ow = await getRatio(out, 0);
pass('滚轮滚动同步', cw != null && ow != null && Math.abs(ow - cw) < 0.03 && cw > 0.2,
  `阅读区=${cw?.toFixed(3)} / 投影窗=${ow?.toFixed(3)}`);

/* ---- 自动滚动：两边同步推进（投影窗不双重驱动） ---- */
// 用户反馈自动滚动已降速（3 档 ≈0.26px/帧）：断言必须基于「实际位移量」而非
// 「固定时间内推进固定比例」，否则任何真实速度都会被误判。
// 先回到顶部，给足推进空间；再测两屏位移同步。
await setRatio(page, 0, 0);
await page.waitForTimeout(600);
const beforeAuto = await getRatio(page, 0);
await page.click('button[aria-label="自动滚动-3"]');
await page.waitForTimeout(4000);
const ca = await getRatio(page, 0);
const oa = await getRatio(out, 0);
// 只断言「确实推进了 + 两屏同步」，不约束推进多少（速度是可调的产品参数）
pass('自动滚动同步推进',
  ca != null && oa != null && Math.abs(oa - ca) < 0.02 && ca > (beforeAuto ?? 0) + 0.005,
  `阅读区=${ca?.toFixed(4)} / 投影窗=${oa?.toFixed(4)}（起点 ${beforeAuto?.toFixed(4)}，位移 ${((ca ?? 0) - (beforeAuto ?? 0)).toFixed(4)}）`);
await page.click('button[aria-label="自动滚动-3"]'); // 停止
await page.waitForTimeout(300);

/* ---- 分屏对照：双栏各自按 index 同步 ---- */
await page.click('button:has-text("分屏对照")');
await page.waitForTimeout(2600);
await setRatio(page, 0, 0.3);
await setRatio(page, 1, 0.65);
await page.waitForTimeout(700);
const s0 = await getRatio(page, 0);
const s1 = await getRatio(page, 1);
const t0 = await getRatio(out, 0);
const t1 = await getRatio(out, 1);
pass('分屏双栏滚动同步', s0 != null && t0 != null && t1 != null &&
  Math.abs(t0 - (s0 ?? 0)) < 0.02 && Math.abs(t1 - (s1 ?? 0)) < 0.02,
  `阅读区=${s0?.toFixed(2)}/${s1?.toFixed(2)} / 投影窗=${t0?.toFixed(2)}/${t1?.toFixed(2)}`);

/* ---- 同步后投影窗无跳动：连续采样方差小 ---- */
const samples = [];
for (let i = 0; i < 6; i++) {
  samples.push(await getRatio(out, 0));
  await page.waitForTimeout(120);
}
const spread = Math.max(...samples.filter((s) => s != null)) - Math.min(...samples.filter((s) => s != null));
pass('静止时投影窗无跳动', spread < 0.005, `采样极差=${spread.toFixed(4)}`);

await page.screenshot({ path: `${OUT}/scroll-1-console.png` });
await out.screenshot({ path: `${OUT}/scroll-2-output.png` });

await browser.close();

console.log('\n===== 滚动完全同步验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
