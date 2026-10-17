/**
 * 边距演示脚本：截图展示 margin 在「居中」与「左靠齐」两种模式下都真实内缩正文与标题。
 * 用法：node resources/demo-margin.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'E:/workspace/bible_screening/resources';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-passage-title]', { timeout: 20000 });
await page.waitForTimeout(1200);

const segBtn = (setting, opt) =>
  page.locator(`[data-setting="${setting}"]`).getByRole('button', { name: opt, exact: true });
const openSettings = async () => {
  await page.click('button[aria-label="排版设置"]');
  await page.waitForTimeout(500);
  await page.waitForTimeout(300);
};
const closeSettings = async () => {
  await page.click('button[aria-label="关闭设置"]');
  await page.waitForTimeout(600);
};
const setMargin = async (dir, times) => {
  await openSettings();
  const h = await page.evaluateHandle(() => {
    const span = [...document.querySelectorAll('span')].find((s) => s.textContent?.trim() === '边距');
    return span?.closest('div.space-y-2')?.querySelector('[role="slider"]') ?? null;
  });
  const el = h.asElement();
  if (el) {
    await el.focus();
    for (let i = 0; i < times; i++) await page.keyboard.press(dir === 'up' ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(300);
  }
  await closeSettings();
};
const measure = () =>
  page.evaluate(() => {
    const c = document.querySelector('[data-panel-canvas]');
    const t = c?.querySelector('[data-passage-title]');
    const v = c?.querySelector('[data-verse]');
    return {
      titleLeft: t ? Math.round(t.getBoundingClientRect().left) : null,
      verseLeft: v ? Math.round(v.getBoundingClientRect().left) : null,
      verseRight: v ? Math.round(v.getBoundingClientRect().right) : null,
    };
  });
const clipCanvas = async () => {
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-panel-canvas]')?.getBoundingClientRect();
    return r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null;
  });
  return box ? { clip: box } : {};
};

// 居中：3rem（默认） vs 6rem（最大）
await page.screenshot({ path: `${OUT}/margin-1-center-3rem.png`, ...(await clipCanvas()) });
const c3 = await measure();
await setMargin('up', 10); // → 6rem
await page.screenshot({ path: `${OUT}/margin-2-center-6rem.png`, ...(await clipCanvas()) });
const c6 = await measure();

// 左靠齐：0rem（最小） vs 6rem（最大）
await openSettings();
await segBtn('标题对齐', '左').click();
await page.waitForTimeout(600);
await closeSettings();
await setMargin('down', 12); // → 0rem
await page.screenshot({ path: `${OUT}/margin-3-left-0rem.png`, ...(await clipCanvas()) });
const l0 = await measure();
await setMargin('up', 12); // → 6rem
await page.screenshot({ path: `${OUT}/margin-4-left-6rem.png`, ...(await clipCanvas()) });
const l6 = await measure();

console.log('居中 3rem :', c3);
console.log('居中 6rem :', c6, ' → 经文左缘内移', c6.verseLeft - c3.verseLeft, 'px');
console.log('左靠齐 0rem:', l0);
console.log('左靠齐 6rem:', l6, ' → 经文左缘内移', l6.verseLeft - l0.verseLeft, 'px');
await browser.close();