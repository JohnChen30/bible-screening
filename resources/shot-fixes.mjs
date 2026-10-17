// 演示两个修复：全屏保留侧栏 + 清屏经文渐隐（不闪黑）
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'resources';
const errors = [];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`[console] PAGEERROR: ${e.message.slice(0, 200)}`));
await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-verse]', { timeout: 20000 });
await page.waitForTimeout(800);

// 1) 普通态：侧栏 + 面板都在
await page.screenshot({ path: `${OUT}/fix-1-console-normal.png` });

// 2) 全屏结构校验：全屏根节点应是包含 <aside> 的外层 div（而非 <main>）
const fsInfo = await page.evaluate(() => {
  const root = document.querySelector('body > div');
  const tag = root?.tagName;
  const hasAside = !!root?.querySelector('aside');
  const asideInMain = !!document.querySelector('main aside'); // 旧 bug：false 即侧栏被丢出全屏元素
  return { rootTag: tag, hasAsideInsideRoot: hasAside, asideInsideMain: asideInMain };
});
console.log('全屏结构:', JSON.stringify(fsInfo));

// 尝试点击「全屏」按钮进入原生全屏（headless 下可能无效，但验证不报错）
const fsBtn = page.getByRole('button', { name: /全屏|退出全屏/ });
await fsBtn.click().catch(() => {});
await page.waitForTimeout(600);
const fsState = await page.evaluate(() => {
  const fe = document.fullscreenElement;
  return {
    fullscreenElementTag: fe ? fe.tagName : null,
    fullscreenContainsAside: fe ? !!fe.querySelector('aside') : null,
  };
});
console.log('全屏状态:', JSON.stringify(fsState));
await page.screenshot({ path: `${OUT}/fix-2-fullscreen.png` });
// 退出全屏（若进入）
await page.evaluate(() => document.exitFullscreen?.().catch(() => {})).catch(() => {});
await page.waitForTimeout(300);

// 3) 清屏渐隐：投影 → 打开 output → 清屏
await page.getByRole('button', { name: /投影|退出投影/ }).click();
await page.waitForTimeout(600);
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 20000 });
await out.waitForTimeout(1200);
await out.screenshot({ path: `${OUT}/fix-3-output-before-clear.png` });

// 点击「清屏」
await page.getByRole('button', { name: /清屏/ }).click();
await page.waitForTimeout(180); // 渐隐过程中抓一帧
await out.screenshot({ path: `${OUT}/fix-4-output-mid-fade.png` });
// 记录渐隐中根底色（应为画布色，而非纯黑）
const midBg = await out.evaluate(() => {
  const r = document.querySelector('div');
  return getComputedStyle(r).backgroundColor;
});
await page.waitForTimeout(700); // 完全清屏
await out.screenshot({ path: `${OUT}/fix-5-output-cleared.png` });
const finalBg = await out.evaluate(() => {
  const r = document.querySelector('div');
  return getComputedStyle(r).backgroundColor;
});
console.log('清屏根底色 mid=', midBg, ' final=', finalBg, '(画布色而非 rgb(0,0,0) 即无黑屏)');

console.log('PAGEERRORS:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
