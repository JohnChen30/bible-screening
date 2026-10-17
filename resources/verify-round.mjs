/**
 * 验证脚本：本轮六项用户反馈
 *   1) 启动默认打开一个面板；设置里可选「打开新面板 / 保留原面板」；
 *   2) 高亮与下划线按面板隔离、不永久保存；
 *   3) 去掉设置里的「投影」分区；
 *   4) 去掉「默认自动滚动速度」（开始投影不自动滚动）；
 *   5) 自动滚动速度降速（人眼跟得上）；
 *   6) 「清屏」保留画布背景颜色。
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

const pass = (label, ok, detail = '') =>
  results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);

/** 读localStorage 中持久化的面板列表 */
const readPanels = () =>
  page.evaluate(() => {
    try {
      const raw = localStorage.getItem('bible-panels');
      if (!raw) return null;
      const p = JSON.parse(raw);
      return { panels: p?.state?.panels ?? null, activePanelId: p?.state?.activePanelId ?? null };
    } catch {
 return null;
    }
  });

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-passage-title]', { timeout: 20000 });
await page.waitForTimeout(1500);

/* ---- 1. 启动默认打开一个面板 ---- */
const panelCount = await page.evaluate(() => document.querySelectorAll('[data-panel-bar] button[aria-label^="删除面板"]').length);
pass('启动默认打开一个面板', panelCount === 1, `面板数=${panelCount}`);

const persisted = await readPanels();
pass('面板列表已持久化', Array.isArray(persisted?.panels) && persisted.panels.length >= 1,
  `持久化面板数=${persisted?.panels?.length ?? 0}`);

/* ---- 2. 设置里可选「打开新面板 / 保留原面板」，且无「投影」分区、无「默认自动滚动」 ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(700);
const setInfo = await page.evaluate(() => {
  const body = document.body.innerText;
  return {
    hasStartup: body.includes('启动时'),
    hasNew: body.includes('打开新面板'),
    hasKeep: body.includes('保留原面板'),
    hasProjectionTab: body.includes('默认自动滚动'),
  };
});
pass('设置含「启动时：打开新面板/保留原面板」',
  setInfo.hasStartup && setInfo.hasNew && setInfo.hasKeep, JSON.stringify(setInfo));
pass('已去掉设置里的「投影」分区（无默认自动滚动）', !setInfo.hasProjectionTab);
await page.click('button[aria-label="关闭设置"]');
await page.waitForTimeout(600);

/* ---- 3. 高亮：面板内生效 + 面板隔离 ---- */
// 在创世记1 读一段，先加高亮
const highlightOf = () =>
  page.evaluate(() => document.querySelectorAll('[data-panel-canvas] mark').length);

// 打开投影（用于 dock 出现）
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(700);

// 点第 3 节的经文设游标 → dock 出现
await page.click('[data-verse="3"]', { timeout: 10000 });
await page.waitForTimeout(700);
// 点一个高亮色
await page.click('button[aria-label="高亮-琥珀"]', { timeout: 10000 });
await page.waitForTimeout(700);
const hl1 = await highlightOf();
pass('面板内可加高亮', hl1 >= 1, `mark数=${hl1}`);

// 记下当前面板 id
const activeId1 = await page.evaluate(() => JSON.parse(localStorage.getItem('bible-panels'))?.state?.activePanelId);
pass('存在活动面板', !!activeId1, `activePanelId=${activeId1}`);

/* ---- 4. 「清屏」保留背景颜色 ---- */
// 先设置一个非默认背景色（纸色），便于断言
await page.evaluate(() => {
  const raw = localStorage.getItem('bible-reader-settings');
  const p = raw ? JSON.parse(raw) : { state: {}, version: 0 };
  p.state = { ...(p.state ?? {}), backgroundColor: '#F7F3EA' };
  localStorage.setItem('bible-reader-settings', JSON.stringify(p));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-passage-title]', { timeout: 20000 });
await page.waitForTimeout(1500);

// 重新进入投影
await page.getByRole('button', { name: '投影', exact: true }).click().catch(() => {});
await page.waitForTimeout(700);

const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForTimeout(1500);

// 点「清屏」（dock 在主控台侧）：投影窗应显示画布底色（纸色）而非黑屏/等待页
await page.bringToFront();
await page.click('[data-projection-dock] button:has-text("清屏")', { timeout: 10000 });
await page.waitForTimeout(900);
const clearedInfo = await out.evaluate(() => {
  const cleared = document.querySelector('[data-cleared]');
  const bg = cleared ? getComputedStyle(cleared).backgroundColor : null;
  const bodyText = document.body.innerText;
  return { hasCleared: !!cleared, bg, isIdle: bodyText.includes('等待主控台开始投影') };
});
pass('清屏：显示空白画面且保留画布底色（纸色）',
  clearedInfo.hasCleared && !clearedInfo.isIdle && /247,\s*243,\s*234/.test(clearedInfo.bg ?? ''),
  `bg=${clearedInfo.bg}, idle=${clearedInfo.isIdle}`);

/* ---- 5. 自动滚动：开始投影不自动滚 + 速度降速 ---- */
// 关闭清屏
await page.click('[data-projection-dock] button:has-text("清屏")', { timeout: 10000 });
await page.waitForTimeout(500);

// 停止投影再重开，验证 autoScroll 初始为 0（不自动滚动）
await page.locator('header').getByRole('button', { name: '退出投影', exact: true }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(900);
const autoScroll0 = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-projection-dock] button')];
  const active = btns.filter((b) => b.getAttribute('data-active') === 'true' || b.className.includes('bg-accent'));
  // 更可靠：读 store
  return (window).__autoScrollProbe ?? null;
});
// 直接从 UI 判断：控件条无任何「自动滚动 N 档」处于激活态 → 用 aria-pressed
const anyAutoActive = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-projection-dock] button[aria-pressed="true"]')];
  return btns.length;
});
pass('开始投影不自动滚动（默认自动滚动已移除）', anyAutoActive === 0, `激活档位按钮数=${anyAutoActive}`);

/* ---- 6. 高亮面板隔离：切到新面板后原面板高亮不跟随 ---- */
// 注意：上方刷新已清空高亮（不持久化），这里需重新加一个高亮再测隔离
await page.getByRole('button', { name: '投影', exact: true }).click().catch(() => {});
await page.waitForTimeout(600);
await page.click('[data-verse="3"]', { timeout: 10000 });
await page.waitForTimeout(600);
await page.click('button[aria-label="高亮-琥珀"]', { timeout: 10000 });
await page.waitForTimeout(700);
const hlBefore = await page.evaluate(() => document.querySelectorAll('[data-panel-canvas] mark').length);
pass('面板内可加高亮（刷新后重加）', hlBefore >= 1, `mark数=${hlBefore}`);

// 再加一个面板 → 激活它（同一选区，但属另一个面板桶）
await page.click('button[aria-label="添加当前选区为面板"]', { timeout: 10000 });
await page.waitForTimeout(800);
const ids = await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('bible-panels'))?.state?.panels ?? []).map((p) => p.id),
);
const panelCount2 = await page.evaluate(() => document.querySelectorAll('[data-panel-bar] button[aria-label^="删除面板"]').length);
pass('新增第二个面板', panelCount2 === 2, `面板数=${panelCount2}`);

const hlNewPanel = await page.evaluate(() => document.querySelectorAll('[data-panel-canvas] mark').length);
pass('切到新面板：原面板高亮不跟随（面板隔离）', hlNewPanel === 0, `新面板mark数=${hlNewPanel}`);

// 切回原面板 → 原高亮仍在（按面板隔离保存，未被误清）
await page.locator(`[data-panel-bar] button`).filter({ hasText: '创世记' }).first().click();
await page.waitForTimeout(800);
const hlBack = await page.evaluate(() => document.querySelectorAll('[data-panel-canvas] mark').length);
pass('切回原面板后其高亮仍在（按面板隔离保存）', hlBack >= 1, `mark数=${hlBack}`);

/* ---- 7. 高亮不持久化：刷新后清空 ---- */
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-passage-title]', { timeout: 20000 });
await page.waitForTimeout(1500);
const afterReload = await page.evaluate(() => document.querySelectorAll('[data-panel-canvas] mark').length);
pass('高亮不永久保存（刷新后清空）', afterReload === 0, `刷新后mark数=${afterReload}`);

/* ---- 8. 自动滚动速度已降速（每帧像素显著变小） ---- */
const speedProbe = await page.evaluate(async () => {
  // 直接读模块常量不可行，改为实测：开启档位 3，观察 1 秒滚动位移
  return null;
});
// 用源码常量断言更稳定：读取 SCROLL_SPEED 定义
const src = await (await import('node:fs/promises')).readFile(
  'E:/workspace/bible_screening/src/components/reader/passage-view.tsx',
  'utf8',
);
const m = src.match(/SCROLL_SPEED\s*=\s*\[([^\]]+)\]/);
const speeds = m ? m[1].split(',').map((s) => parseFloat(s.trim())) : [];
pass('自动滚动速度已降速（最高档 ≤0.5px/帧）', speeds.length === 6 && Math.max(...speeds) <= 0.5,
  `SCROLL_SPEED=[${speeds.join(', ')}]`);
pass('自动滚动速度单调递增且最低档>0', speeds.length === 6 && speeds[1] > 0 && speeds.every((v, i) => i === 0 || v >= speeds[i - 1]),
  `SCROLL_SPEED=[${speeds.join(', ')}]`);
// 关键回归点：降速后 step<1px/帧，必须有亚像素累加器，否则浏览器把 scrollTop
// 吸附到整数像素 → 自动滚动完全不动（本次实测踩过）
pass('低档位有亚像素累加器（避免降速后不动）', /acc/.test(src) && /Math\.floor\(acc\)/.test(src));

/* ---- 9. 关闭投影窗 ---- */
await out.close();
await browser.close();

console.log('\n===== 本轮六项反馈验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);