/** 验证脚本 v5：反馈3 — 三屏一致 / 控件嵌入布局 / 高亮交互 / 视觉风格 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'E:/workspace/bible_screening/resources';
const errors = [];
const results = [];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
for (const [name, p] of [['console', page]]) {
  p.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR: ${e.message.slice(0, 200)}`));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${name}] CONSOLE: ${m.text().slice(0, 200)}`);
  });
}

const pass = (label, ok, detail = '') => results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 第1章', { timeout: 20000 });
await page.waitForTimeout(1200);

/* ---- 画布存在 + 默认 16:9 + 固定底色 ---- */
const canvas = () => page.evaluate(() => {
  const el = document.querySelector('[data-panel-canvas]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), ratio: r.width / r.height, bg: getComputedStyle(el).backgroundColor };
});
const c0 = await canvas();
pass('面板画布存在', !!c0, c0 ? `${c0.w}x${c0.h}` : 'not found');
pass('面板比例默认 16:9', !!c0 && Math.abs(c0.ratio - 16 / 9) < 0.06, c0 ? `ratio=${c0.ratio.toFixed(3)}` : '');
pass('面板独立固定底色 #121212', !!c0 && c0.bg === 'rgb(18, 18, 18)', c0 ? `bg=${c0.bg}` : '');

/* ---- 反馈3-三.1：单击单节经文 → 呼出高亮控件（dock 高亮组） ---- */
await page.click('text=神说：要有光', { timeout: 10000 });
await page.waitForTimeout(900);
const clickState = await page.evaluate(() => {
  const dock = document.querySelector('[data-projection-dock]');
  const hl = document.querySelector('[aria-label="高亮工具"]');
  return {
    dockVisible: !!dock && dock.getBoundingClientRect().height > 20,
    hasClearBtn: !!hl?.querySelector('[aria-label="清除格式"]'),
    hasDots: (hl?.querySelectorAll('button[aria-label^="高亮-"]').length ?? 0) >= 5,
    verseRef: hl?.textContent ?? '',
    projecting: !!document.querySelector('button .lucide-square') || [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '退出投影'),
  };
});
pass('单击经文呼出高亮控件', clickState.dockVisible && clickState.hasClearBtn && clickState.hasDots,
  `dock:${clickState.dockVisible} 清除格式:${clickState.hasClearBtn} 五色:${clickState.hasDots}`);
pass('单击不触发投影', !clickState.projecting, `投影中=${clickState.projecting}`);
const cAfterClick = await canvas();
pass('呼出控件后画布比例不变', !!cAfterClick && Math.abs(cAfterClick.ratio - 16 / 9) < 0.06, `ratio=${cAfterClick?.ratio.toFixed(3)}`);

/* ---- 逐节上下对照 ---- */
await page.click('text=逐节对照');
await page.waitForTimeout(1200);
const stacked = await page.evaluate(() => {
  const block = document.querySelector('[data-verse="1"]');
  if (!block) return { ok: false, reason: 'no [data-verse="1"]' };
  const cells = [...block.querySelectorAll(':scope > div > div')];
  if (cells.length < 2) return { ok: false, reason: `cells=${cells.length}` };
  const r1 = cells[0].getBoundingClientRect();
  const r2 = cells[1].getBoundingClientRect();
  return { ok: r2.top >= r1.bottom - 2 && Math.abs(r1.left - r2.left) < 60, dy: Math.round(r2.top - r1.top) };
});
pass('逐节上下对照', stacked.ok, `垂直偏移 ${stacked.dy ?? '-'}px${stacked.reason ? `, ${stacked.reason}` : ''}`);
await page.screenshot({ path: `${OUT}/v5-1-compare.png` });

/* ---- 标题带选区范围（三屏顶部标题） ---- */
const title = await page.evaluate(() => document.querySelector('[data-panel-canvas] h2')?.textContent?.trim() ?? '');
pass('面板首行标题', title.includes('创世记') && title.includes('1'), `"${title}"`);

/* ---- Miller 章节列无重复数字 ---- */
await page.click('button:has-text("以弗所书")', { timeout: 10000 });
await page.waitForTimeout(1500);
const dup = await page.evaluate(() => {
  const cols = [...document.querySelectorAll('[aria-label="经文选择器"] > div')];
  const chapterCol = cols[1];
  if (!chapterCol) return { ok: false, reason: 'no chapter col' };
  const rows = [...chapterCol.querySelectorAll('button')];
  const dupRows = rows.filter((r) => r.textContent.replace(/\s/g, '') !== '1' && r.textContent.replace(/\s/g, '').length > 1 && /^1+$/.test(r.textContent.replace(/\s/g, '')) === false && r.textContent.trim().match(/^\d+$/));
  return { ok: dupRows.length === 0, rows: rows.length, sample: rows[0]?.textContent };
});
pass('章节列无重复数字', dup.ok, `${dup.rows} 行, 首行"${dup.sample}"`);

/* ---- 切换书卷后游标重置（dock 高亮组不再显示 :N） ---- */
const cursorReset = await page.evaluate(() => {
  const hl = document.querySelector('[aria-label="高亮工具"]');
  return !hl || !/:\s*\d/.test(hl.textContent ?? '');
});
pass('切换书卷后游标重置', cursorReset);

/* ---- 经文块无重叠 ---- */
const overlap = await page.evaluate(() => {
  const blocks = [...document.querySelectorAll('[data-verse]')].map((b) => b.getBoundingClientRect());
  let worst = 0;
  for (let i = 0; i < blocks.length - 1; i++) {
    const gap = blocks[i + 1].top - blocks[i].bottom;
    if (gap < worst) worst = gap;
  }
  return { worstGap: Math.round(worst), count: blocks.length };
});
pass('经文块无重叠', overlap.worstGap >= -1, `最小间隙 ${overlap.worstGap}px, ${overlap.count} 块`);
await page.screenshot({ path: `${OUT}/v5-2-ephesians.png` });

/* ---- 投影：整页照搬 ---- */
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(600);

/* 反馈3-二.2：投影控件中不含「下一节」按钮 */
const noNextBtn = (await page.locator('button:has-text("下一节")').count()) === 0;
pass('投影控件无「下一节」按钮', noNextBtn);

/* 关键回归：投影之后才打开投影窗口（BroadcastChannel 不重放历史，靠握手拉取） */
const out2 = await ctx.newPage();
out2.on('pageerror', (e) => errors.push(`[output2] PAGEERROR: ${e.message.slice(0, 200)}`));
await out2.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out2.waitForSelector('[data-verse]', { timeout: 15000 });
await out2.waitForTimeout(1200);

const parity = await page.evaluate(() => {
  const block = document.querySelector('[data-verse="1"]');
  const scroll = document.querySelector('[data-panel-canvas] .overflow-y-auto');
  const text = document.querySelector('[data-panel-canvas] .reader-text');
  const ts = text ? getComputedStyle(text) : null;
  return {
    title: document.querySelector('[data-panel-canvas] h2')?.textContent?.trim() ?? '',
    cells: block ? block.querySelectorAll(':scope > div > div').length : 0,
    verses: document.querySelectorAll('[data-verse]').length,
    fontSize: ts?.fontSize ?? '',
    lineHeight: ts?.lineHeight ?? '',
    pad: scroll ? getComputedStyle(scroll).paddingLeft : '',
    bg: getComputedStyle(document.querySelector('[data-panel-canvas]')).backgroundColor,
    canvasW: document.querySelector('[data-panel-canvas]').getBoundingClientRect().width,
  };
});
const outInfo = await out2.evaluate(() => {
  const block = document.querySelector('[data-verse="1"]');
  const scroll = document.querySelector('[data-panel-canvas] .overflow-y-auto');
  const text = document.querySelector('[data-panel-canvas] .reader-text');
  const ts = text ? getComputedStyle(text) : null;
  return {
    title: document.querySelector('[data-panel-canvas] h2')?.textContent?.trim() ?? '',
    cells: block ? block.querySelectorAll(':scope > div > div').length : 0,
    verses: document.querySelectorAll('[data-verse]').length,
    fontSize: ts?.fontSize ?? '',
    lineHeight: ts?.lineHeight ?? '',
    pad: scroll ? getComputedStyle(scroll).paddingLeft : '',
    bg: getComputedStyle(document.querySelector('[data-panel-canvas]')).backgroundColor,
    canvasW: document.querySelector('[data-panel-canvas]').getBoundingClientRect().width,
    text: document.body.innerText.slice(0, 60).replace(/\n/g, ' '),
  };
});
pass('握手：投影后开新窗口有内容', outInfo.verses > 1, `${outInfo.verses} 块`);
pass('投影与预览内容一致', parity.title === outInfo.title && parity.cells === outInfo.cells && parity.cells >= 2,
  `标题"${parity.title}" vs "${outInfo.title}"；每节译本 ${parity.cells} vs ${outInfo.cells}`);
/* 反馈3-一 + 等比缩放：三屏排版逐项一致。
   投影画面是预览画面的等比放大，故绝对像素不再相等，
   判据改为「相对量一致」：行距/字号、边距/字号、字号/画布宽 三项比值相同，底色相同。 */
const fsP = parseFloat(parity.fontSize);
const fsO = parseFloat(outInfo.fontSize);
const sameRel =
  !!fsP && !!fsO &&
  Math.abs(parseFloat(parity.lineHeight) / fsP - parseFloat(outInfo.lineHeight) / fsO) < 0.02 &&
  Math.abs(parseFloat(parity.pad) / fsP - parseFloat(outInfo.pad) / fsO) < 0.02 &&
  Math.abs(fsP / parity.canvasW - fsO / outInfo.canvasW) < 0.002 &&
  parity.bg === outInfo.bg;
pass('三屏排版等比一致（行距/边距/字号相对量 + 底色）', sameRel,
  `字号 ${parity.fontSize}/${outInfo.fontSize}（画布宽 ${Math.round(parity.canvasW)}/${Math.round(outInfo.canvasW)}），` +
  `行距比 ${(parseFloat(parity.lineHeight) / fsP).toFixed(2)}/${(parseFloat(outInfo.lineHeight) / fsO).toFixed(2)}，` +
  `边距比 ${(parseFloat(parity.pad) / fsP).toFixed(2)}/${(parseFloat(outInfo.pad) / fsO).toFixed(2)}，底色 ${parity.bg}/${outInfo.bg}`);
await page.screenshot({ path: `${OUT}/v5-3-projection.png` });
await out2.screenshot({ path: `${OUT}/v5-4-output.png` });

/* ---- 反馈3-二.1：控件嵌入布局流，不遮挡经文（dock 在画布下方，无交集） ---- */
const noOcclusion = await page.evaluate(() => {
  const dock = document.querySelector('[data-projection-dock]');
  const cv = document.querySelector('[data-panel-canvas]');
  if (!dock || !cv) return { ok: false, reason: 'missing' };
  const d = dock.getBoundingClientRect();
  const c = cv.getBoundingClientRect();
  return { ok: d.top >= c.bottom - 2, gap: Math.round(d.top - c.bottom), dockPos: getComputedStyle(dock).position };
});
pass('控件嵌入布局不遮挡经文', noOcclusion.ok, `dock 距画布底 ${noOcclusion.gap}px, position=${noOcclusion.dockPos}`);

/* ---- 反馈3-三：高亮 + 取消高亮（三屏同步） ---- */
await page.click('[data-verse="3"]', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(800);
const cursorAt3 = await page.evaluate(() => {
  const hl = document.querySelector('[aria-label="高亮工具"]');
  return /:\s*3/.test(hl?.textContent ?? '');
});
pass('点击第 3 节选中', cursorAt3);

await page.click('button[aria-label="高亮-琥珀"]');
await page.waitForTimeout(900);
const hlState = await page.evaluate(() => ({
  consoleMarks: document.querySelectorAll('[data-panel-canvas] mark').length,
  outMarks: 0,
}));
const outMarks = await out2.evaluate(() => document.querySelectorAll('[data-panel-canvas] mark').length);
pass('高亮应用到三屏', hlState.consoleMarks > 0 && outMarks > 0, `阅读区 ${hlState.consoleMarks} 处 / 投影 ${outMarks} 处`);
await page.screenshot({ path: `${OUT}/v5-5-highlight.png` });

await page.click('button[aria-label="清除格式"]');
await page.waitForTimeout(900);
const clearedMarks = await page.evaluate(() => document.querySelectorAll('[data-panel-canvas] mark').length);
const outClearedMarks = await out2.evaluate(() => document.querySelectorAll('[data-panel-canvas] mark').length);
pass('清除格式一键还原（三屏）', clearedMarks === 0 && outClearedMarks === 0, `阅读区 ${clearedMarks} / 投影 ${outClearedMarks}`);

/* ---- 切换书卷后游标重置（回归防护） ---- */
await page.click('button:has-text("罗马书")', { timeout: 10000 });
await page.waitForTimeout(1200);
const cursorReset2 = await page.evaluate(() => {
  const hl = document.querySelector('[aria-label="高亮工具"]');
  return !!hl && !/:\s*\d/.test(hl.textContent ?? '');
});
pass('切换书卷后游标重置', cursorReset2);

/* ---- 跟读：上一节按钮 + 键盘 → ---- */
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1000);
const cursorAt2 = await page.evaluate(() => {
  const hl = document.querySelector('[aria-label="高亮工具"]');
  return /:\s*2/.test(hl?.textContent ?? '');
});
const outScrolled = await out2.evaluate(() => {
  const el = document.querySelector('[data-verse="2"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top >= -60 && r.bottom <= window.innerHeight + 60;
});
pass('跟读 下一节（键盘）', cursorAt2 && outScrolled, `游标=2:${cursorAt2}, 投影页可见:${outScrolled}`);

/* ---- 设置 Popover（单面板：排版，无「投影」分区） ---- */
await page.click('button[aria-label="排版设置"]');
await page.waitForTimeout(600);
await page.waitForTimeout(400);
const pop = await page.evaluate(() => {
  const body = document.body.innerText;
  return {
 hasTitle: body.includes('排版设置'),
    hasRatio: body.includes('面板比例'),
    hasReset: body.includes('恢复默认排版'),
    hasPanelStartup: body.includes('启动时'),
    // 用户反馈：去掉「投影」分区与「默认自动滚动速度」
  noProjectionTab: !body.includes('默认自动滚动'),
  };
});
pass('设置弹出小窗', pop.hasTitle && pop.hasRatio, JSON.stringify(pop));
pass('面板比例选项', pop.hasRatio);
pass('设置含面板启动行为（打开新面板/保留原面板）', pop.hasPanelStartup);
pass('已去掉「默认自动滚动速度」与投影分区', pop.noProjectionTab);
const anchor = await page.evaluate(() => {
  const trigger = document.querySelector('button[aria-label="排版设置"]');
  const dialog = document.querySelector('[role="dialog"]');
  if (!trigger || !dialog) return null;
  const t = trigger.getBoundingClientRect();
  const d = dialog.getBoundingClientRect();
  return { below: d.top >= t.bottom - 2, dx: Math.round(d.right - t.right) };
});
pass('小窗锚定在按钮下方', !!anchor && anchor.below, anchor ? `右缘差 ${anchor.dx}px` : 'not found');
await page.screenshot({ path: `${OUT}/v5-6-settings.png` });
// 点外部关闭
await page.mouse.click(40, 500);
await page.waitForTimeout(400);
const popClosed = await page.evaluate(() => !document.body.innerText.includes('恢复默认排版'));
pass('点外部关闭小窗', popClosed);

/* ---- 侧栏收起 ---- */
await page.click('button[aria-label="切换侧栏"]').catch(() => {});
await page.waitForTimeout(700);
const sidebarClosed = await page.evaluate(() => {
  const aside = document.querySelector('main')?.previousElementSibling;
  return aside ? aside.getBoundingClientRect().width < 10 : false;
});
pass('侧栏收起', sidebarClosed);
await page.click('button[aria-label="切换侧栏"]').catch(() => {});
await page.waitForTimeout(500);

/* ---- 深色模式：面板底色仍固定 ---- */
await page.click('button[aria-label="切换主题"]');
await page.waitForTimeout(800);
const dark = await page.evaluate(() => ({
  isDark: document.documentElement.classList.contains('dark'),
  appBg: getComputedStyle(document.body).backgroundColor,
  canvasBg: document.querySelector('[data-panel-canvas]') ? getComputedStyle(document.querySelector('[data-panel-canvas]')).backgroundColor : '',
}));
pass('深色模式切换', dark.isDark, `app=${dark.appBg}`);
pass('深色下面板底色不被覆盖', dark.canvasBg === 'rgb(18, 18, 18)', `canvas=${dark.canvasBg}`);
await page.screenshot({ path: `${OUT}/v5-7-dark.png` });

/* ---- 退出投影 ---- */
await page.getByRole('button', { name: '退出投影', exact: true }).click().catch(() => {});
await page.waitForTimeout(600);

console.log(results.join('\n'));
console.log('RUNTIME ERRORS:', errors.length ? '\n' + errors.join('\n') : '（无）');
await browser.close();
process.exit(errors.length || results.some((r) => r.includes('FAIL')) ? 1 : 0);
