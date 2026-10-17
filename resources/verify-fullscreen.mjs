/**
 * 验证脚本：全屏模式配色统一（用户反馈：全屏模式的配色要和原来一样的配色）
 *
 * 主区全屏后应整体切换为「画布配色」（与投影窗同色系）：
 *   - main[data-fullscreen="true"] + 底色 = 画布底色；
 *   - 深色画布 → main.dark 令牌；浅色画布（纸）→ main.canvas-light 令牌；
 *   - 顶栏 / 多面板栏背景 = 画布底色 88% 混合（color-mix），而非另一套主题玻璃色；
 *   - 退出全屏后全部还原。
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

const pass = (label, ok, detail = '') => results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-passage-title]', { timeout: 20000 });
await page.waitForTimeout(1200);

/** 解析 computed 颜色（rgba() / color(srgb ...) 两种序列化都能吃） */
const parseColor = (str) => {
  if (!str) return null;
  const rgba = str.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const p = rgba[1].split(/[,\/\s]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  }
  const srgb = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
  if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: srgb[4] !== undefined ? +srgb[4] : 1 };
  return null;
};

/** 采集 main / 顶栏 / 多面板栏 的状态 */
const chromeState = () =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    const toolbar = document.querySelector('main .toolbar-glass');
    const panelBar = document.querySelector('main [data-panel-bar]');
    return {
      fs: main?.getAttribute('data-fullscreen') ?? null,
      hasDark: !!main?.classList.contains('dark'),
      hasLight: !!main?.classList.contains('canvas-light'),
      mainBg: main ? getComputedStyle(main).backgroundColor : '',
      toolbarBg: toolbar ? getComputedStyle(toolbar).backgroundColor : '',
      panelBg: panelBar ? getComputedStyle(panelBar).backgroundColor : '',
      toolbarBorder: toolbar ? getComputedStyle(toolbar).borderTopColor : '',
    };
  });

const near = (c, r, g, b, tol = 3) => !!c && Math.abs(c.r - r) <= tol && Math.abs(c.g - g) <= tol && Math.abs(c.b - b) <= tol;

/* ---- 1. 非全屏基线：main 无 fullscreen 标记，顶栏为普通玻璃色 ---- */
const before = await chromeState();
pass('非全屏：main 无 fullscreen 标记', before.fs === 'false' || before.fs === null, `data-fullscreen=${before.fs}`);

/* ---- 2. 进入全屏（深色画布 #121212 → dark 令牌 + 画布底色） ---- */
await page.getByRole('button', { name: '全屏', exact: true }).click();
await page.waitForFunction(() => document.fullscreenElement !== null, { timeout: 5000 });
await page.waitForTimeout(900); // 等 fullscreenchange → React 重渲染
const fsDark = await chromeState();
pass('全屏：main[data-fullscreen="true"]', fsDark.fs === 'true', `data-fullscreen=${fsDark.fs}`);
pass('全屏：main 挂 dark 令牌（深色画布）', fsDark.hasDark && !fsDark.hasLight, `dark=${fsDark.hasDark}, canvas-light=${fsDark.hasLight}`);
pass('全屏：main 底色 = 画布底色 #121212', near(parseColor(fsDark.mainBg), 18, 18, 18, 1),
  `mainBg=${fsDark.mainBg}`);
const tbDark = parseColor(fsDark.toolbarBg);
const pbDark = parseColor(fsDark.panelBg);
pass('全屏：顶栏底色 = 画布底色 88% 混合', !!tbDark && near(tbDark, 18, 18, 18, 2) && Math.abs(tbDark.a - 0.88) < 0.03,
  `toolbarBg=${fsDark.toolbarBg}`);
pass('全屏：多面板栏底色同为画布混合色', !!pbDark && near(pbDark, 18, 18, 18, 2) && Math.abs(pbDark.a - 0.88) < 0.03,
  `panelBg=${fsDark.panelBg}`);
pass('全屏：顶栏与非全屏时不同（已切换配色）', fsDark.toolbarBg !== before.toolbarBg,
  `非全屏=${before.toolbarBg} → 全屏=${fsDark.toolbarBg}`);
pass('全屏：顶栏分割线为白 8%', /rgba\(255,\s*255,\s*255,\s*0\.08\)|color\(srgb 1 1 1 \/ 0\.08\)/.test(fsDark.toolbarBorder),
  `border=${fsDark.toolbarBorder}`);
await page.screenshot({ path: `${OUT}/fullscreen-1-dark.png` });

/* ---- 3. 退出全屏：全部还原 ---- */
await page.getByRole('button', { name: '退出全屏', exact: true }).click();
await page.waitForFunction(() => document.fullscreenElement === null, { timeout: 5000 });
await page.waitForTimeout(600);
const after = await chromeState();
pass('退出全屏：标记还原', after.fs === 'false' || after.fs === null, `data-fullscreen=${after.fs}`);
pass('退出全屏：dark 令牌移除', !after.hasDark, `dark=${after.hasDark}`);
pass('退出全屏：底色还原（透明 / 主题底色）', after.mainBg === 'rgba(0, 0, 0, 0)' || after.mainBg === before.mainBg,
  `mainBg=${after.mainBg}`);

/* ---- 4. 浅色画布（纸 #F7F3EA）→ canvas-light 令牌 ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(500);
await page.getByRole('button', { name: '背景颜色-纸', exact: true }).click();
await page.waitForTimeout(400);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(500);
const canvasBg = await page.evaluate(() => getComputedStyle(document.querySelector('[data-panel-canvas]')).backgroundColor);
pass('浅色画布已切换（纸 #F7F3EA）', near(parseColor(canvasBg), 247, 243, 234, 2), `canvasBg=${canvasBg}`);

await page.getByRole('button', { name: '全屏', exact: true }).click();
await page.waitForFunction(() => document.fullscreenElement !== null, { timeout: 5000 });
await page.waitForTimeout(900);
const fsLight = await chromeState();
pass('浅色画布全屏：main 挂 canvas-light 令牌', fsLight.hasLight && !fsLight.hasDark,
  `canvas-light=${fsLight.hasLight}, dark=${fsLight.hasDark}`);
pass('浅色画布全屏：main 底色 = 纸色', near(parseColor(fsLight.mainBg), 247, 243, 234, 2), `mainBg=${fsLight.mainBg}`);
const tbLight = parseColor(fsLight.toolbarBg);
pass('浅色画布全屏：顶栏底色 = 纸色 88% 混合', !!tbLight && near(tbLight, 247, 243, 234, 2) && Math.abs(tbLight.a - 0.88) < 0.03,
  `toolbarBg=${fsLight.toolbarBg}`);
await page.screenshot({ path: `${OUT}/fullscreen-2-light.png` });

/* ---- 5. 还原背景设置（墨）并退出全屏 ---- */
await page.getByRole('button', { name: '退出全屏', exact: true }).click();
await page.waitForFunction(() => document.fullscreenElement === null, { timeout: 5000 });
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(500);
await page.getByRole('button', { name: '背景颜色-墨', exact: true }).click();
await page.waitForTimeout(400);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(500);

await browser.close();

console.log('\n===== 全屏配色统一验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
