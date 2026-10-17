/** 验证脚本：反馈4 UI 细节 + 投影标题 + 深色降噪（v6 综合验收） */
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

/* ---- 1. 侧栏单一收起按钮（反馈4-UI） ---- */
const btns = await page.evaluate(() => ({
  headerCollapse: document.querySelectorAll('button[aria-label="收起侧栏"]').length,
  toggle: document.querySelectorAll('button[aria-label="切换侧栏"]').length,
}));
pass('侧栏只有一个收起按钮（顶栏）', btns.headerCollapse === 0 && btns.toggle === 1,
  `头部残留=${btns.headerCollapse}，顶栏=${btns.toggle}`);

await page.click('button[aria-label="切换侧栏"]');
await page.waitForTimeout(700);
const wCollapsed = await page.evaluate(() => document.querySelector('aside')?.getBoundingClientRect().width ?? -1);
await page.click('button[aria-label="切换侧栏"]');
await page.waitForTimeout(700);
const wExpanded = await page.evaluate(() => document.querySelector('aside')?.getBoundingClientRect().width ?? -1);
pass('顶栏按钮可收起/展开侧栏', wCollapsed < 10 && wExpanded > 300, `收起=${wCollapsed}px，展开=${wExpanded}px`);

/* ---- 2. 浅色分割线柔和（令牌自带 alpha，未产生非法 CSS） ---- */
const lightBorder = await page.evaluate(() => {
  const header = document.querySelector('header.toolbar-glass');
  return {
    token: getComputedStyle(document.documentElement).getPropertyValue('--border').trim(),
    color: header ? getComputedStyle(header).borderBottomColor : '',
  };
});
pass('浅色分割线为暖灰 50%', lightBorder.token === '34 16% 86% / 0.5' && lightBorder.color === 'rgba(225, 220, 214, 0.5)',
  `${lightBorder.color}`);

/* ---- 3. 投影画布直角无缝（反馈4-UI） ---- */
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(800);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
out.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[output] CONSOLE: ${m.text().slice(0, 200)}`);
});
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-panel-canvas] h2', { timeout: 15000 });
await out.waitForFunction(
  () => /创世记|以弗所|第\d+章/.test(document.querySelector('[data-panel-canvas] h2')?.textContent ?? ''),
  { timeout: 10000 },
);
await out.waitForTimeout(500);

const outCanvas = await out.evaluate(() => {
  const c = document.querySelector('[data-panel-canvas]');
  const r = c.getBoundingClientRect();
  const cs = getComputedStyle(c);
  return {
    radius: cs.borderRadius,
    shadow: cs.boxShadow,
    left: r.left,
    width: r.width,
    vw: window.innerWidth,
  };
});
pass('投影画布取消圆角', outCanvas.radius === '0px', outCanvas.radius);
pass('投影画布无阴影描边（边缘无缝）', outCanvas.shadow === 'none', outCanvas.shadow.slice(0, 60));
pass('投影画布铺满屏幕宽度（无外边距）', outCanvas.left === 0 && Math.abs(outCanvas.width - outCanvas.vw) < 1,
  `left=${outCanvas.left}，w=${outCanvas.width}/${outCanvas.vw}`);

const preRadius = await page.evaluate(() => {
  const c = document.querySelector('[data-panel-canvas]');
  return c ? getComputedStyle(c).borderRadius : '';
});
pass('预览画布保留圆角（仅投影改直角）', preRadius !== '0px' && preRadius !== '', preRadius);

/* ---- 4. 投影标题必须在画面内（反馈4 紧急项） ---- */
const outTitle = await out.evaluate(() => {
  const canvas = document.querySelector('[data-panel-canvas]');
  const h2 = canvas?.querySelector('h2');
  if (!h2 || !canvas) return null;
  const cr = canvas.getBoundingClientRect();
  const hr = h2.getBoundingClientRect();
  const firstVerse = canvas.querySelector('[data-verse]');
  const vr = firstVerse?.getBoundingClientRect();
  return {
    text: h2.textContent?.trim() ?? '',
    inside: hr.top >= cr.top - 1 && hr.bottom <= cr.bottom + 1 && hr.left >= cr.left - 1,
    above: !vr || hr.bottom <= vr.top + 1,
    fontSize: parseFloat(getComputedStyle(h2).fontSize),
  };
});
pass('投影画面显示标题（画布内、经文正上方）',
  !!outTitle && !!outTitle.inside && !!outTitle.above && outTitle.text.length > 0,
  `"${outTitle?.text}" ${outTitle?.fontSize}px`);

/* ---- 5. 深色白线降噪 + 面板黑度（反馈4-UI） ---- */
const needDark = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
if (needDark) {
  await page.click('button[aria-label="切换主题"]');
  await page.waitForTimeout(700);
}
const dark = await page.evaluate(() => {
  const rs = getComputedStyle(document.documentElement);
  const header = document.querySelector('header.toolbar-glass');
  const canvas = document.querySelector('[data-panel-canvas]');
  return {
    dark: document.documentElement.classList.contains('dark'),
    borderToken: rs.getPropertyValue('--border').trim(),
    bgToken: rs.getPropertyValue('--background').trim(),
    cardToken: rs.getPropertyValue('--card').trim(),
    headerBorder: header ? getComputedStyle(header).borderBottomColor : '',
    bodyBg: getComputedStyle(document.body).backgroundColor,
    canvasBg: canvas ? getComputedStyle(canvas).backgroundColor : '',
  };
});
pass('深色模式已开启', dark.dark);
pass('深色 border 令牌为白 8%', dark.borderToken === '0 0% 100% / 0.08', dark.borderToken);
pass('深色实际分割线 rgba(255,255,255,0.08)', dark.headerBorder === 'rgba(255, 255, 255, 0.08)', dark.headerBorder);
pass('深色背景加深至 5%', dark.bgToken === '24 12% 5%', dark.bgToken);
pass('深色卡片加深至 7%', dark.cardToken === '24 10% 7%', dark.cardToken);
pass('深色下面板画布底色不被覆盖', dark.canvasBg === 'rgb(18, 18, 18)', dark.canvasBg);

const outCanvasDark = await out.evaluate(() => {
  const c = document.querySelector('[data-panel-canvas]');
  const cs = getComputedStyle(c);
  return { radius: cs.borderRadius, shadow: cs.boxShadow };
});
pass('深色下投影画布仍直角无阴影',
  outCanvasDark.radius === '0px' && outCanvasDark.shadow === 'none',
  `${outCanvasDark.radius} / ${outCanvasDark.shadow.slice(0, 40)}`);

await page.screenshot({ path: `${OUT}/v6-1-dark-console.png` });
await out.screenshot({ path: `${OUT}/v6-2-output.png` });

await browser.close();

console.log('\n===== v6 UI 细节与投影标题验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
