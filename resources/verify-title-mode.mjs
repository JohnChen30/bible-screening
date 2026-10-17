/**
 * 验证脚本：标题显示方式（常驻顶部 / 随文滚动 / 不显示）+ 「标题一片空白」回归
 *
 * 用户反馈：
 *   1) 标题不要一直常驻在画面上面 → 默认「随文」，并提供 pin / 不 pin 按钮；
 *   2) 标题依旧一片空白 → 校验标题实际可见（opacity=1、颜色与背景不同、非 0 尺寸）。
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'E:/workspace/bible_screening/resources';
const errors = [];
const results = [];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
// 视口偏小：保证经文内容明显溢出滚动区（否则滚不动，无法校验标题滚出）
const ctx = await browser.newContext({ viewport: { width: 1180, height: 660 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`[console] PAGEERROR: ${e.message.slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] CONSOLE: ${m.text().slice(0, 200)}`);
});
const out = await ctx.newPage();
out.on('pageerror', (e) => errors.push(`[output] PAGEERROR: ${e.message.slice(0, 200)}`));

const pass = (label, ok, detail = '') =>
  results.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);

/** 读取画布内标题与滚动容器的几何 / 样式 */
const probe = (p) =>
  p.evaluate(() => {
    const canvas = document.querySelector('[data-panel-canvas]');
    if (!canvas) return null;
    const sc = canvas.querySelector('.overflow-y-auto');
    const titleEl = canvas.querySelector('[data-passage-title]');
    const h2 = canvas.querySelector('h2');
    const cr = canvas.getBoundingClientRect();
    const scr = sc.getBoundingClientRect();
    const tr = titleEl?.getBoundingClientRect();
    const cs = h2 ? getComputedStyle(h2) : null;
    const titleWrap = titleEl?.parentElement;
    const wrapCs = titleWrap ? getComputedStyle(titleWrap) : null;
    return {
      hasTitle: !!titleEl,
      mode: titleEl?.getAttribute('data-title-mode') ?? null,
      text: h2?.textContent?.trim() ?? '',
      // 标题是否位于滚动容器内部（inline）而非其外（pinned）
      insideScroll: !!titleEl && !!sc && sc.contains(titleEl),
      titleRect: tr ? { top: tr.top, bottom: tr.bottom, h: tr.height, w: tr.width } : null,
      scrollRect: { top: scr.top, bottom: scr.bottom },
      canvasRect: { top: cr.top, bottom: cr.bottom },
      // 「一片空白」排查：透明度 / 颜色 / 尺寸
      opacity: wrapCs ? Number(wrapCs.opacity) : null,
      color: cs?.color ?? null,
      bg: getComputedStyle(canvas).backgroundColor,
      fontSize: cs ? parseFloat(cs.fontSize) : 0,
      scrollTop: sc?.scrollTop ?? 0,
      scrollable: !!sc && sc.scrollHeight - sc.clientHeight > 40,
    };
  });

/**
 * 滚动容器可见高度内是否真的有经文（防虚拟化错位留白）。
 * 用「逐像素覆盖 + 最大空白跨度」判定，而非 elementFromPoint：
 * 每行经文被虚拟列表包在 position:absolute 的 wrapper 里，节与节之间
 * 有正常的 ~18px 行距间隙，落在间隙上的 elementFromPoint 会命中空 wrapper
 * （无 data-verse 祖先）而误报「留白」。覆盖法只看「视口内是否存在一段
 * 过大的空白」——这正是对「虚拟化偏移错位」的准确判定。
 */
const versesVisible = (p) =>
  p.evaluate(() => {
    const canvas = document.querySelector('[data-panel-canvas]');
    const sc = canvas.querySelector('.overflow-y-auto');
    const r = sc.getBoundingClientRect();
    const verseEls = [...sc.querySelectorAll('[data-verse]')]
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom };
      })
      .filter((b) => b.bottom > r.top && b.top < r.bottom);
    // 沿视口高度逐 4px 步长检查是否被某个 verse 块覆盖；记录最大连续空白跨度
    let maxGap = 0;
    let cur = 0;
    for (let y = r.top + 1; y < r.bottom; y += 4) {
      const covered = verseEls.some((b) => y >= b.top && y <= b.bottom);
      if (covered) {
        if (cur > maxGap) maxGap = cur;
        cur = 0;
      } else {
        cur += 4;
      }
    }
    if (cur > maxGap) maxGap = cur;
    // 正常节间距约 18px；>40px 才视为「虚拟化错位留白」
    return { maxGap, ok: maxGap < 40 };
  });

/** 滚到指定位置，返回实际 scrollTop（内容不足时会被夹到最大值） */
const setScroll = (p, top) =>
  p.evaluate((t) => {
    const sc = document.querySelector('[data-panel-canvas] .overflow-y-auto');
    sc.scrollTop = t;
    return { actual: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight };
  }, top);

/** 滚到最底部（用于「标题随文滚出画面」校验） */
const scrollToBottom = (p) =>
  p.evaluate(() => {
    const sc = document.querySelector('[data-panel-canvas] .overflow-y-auto');
    sc.scrollTop = sc.scrollHeight;
    return { actual: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight };
  });

await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=创世记 第1章', { timeout: 20000 });
await page.waitForTimeout(1200);

/* ================= 1. 默认「随文滚动」 ================= */
const a0 = await probe(page);
pass('默认标题显示方式为「随文」', a0?.mode === 'inline', `mode=${a0?.mode}`);
pass('标题实际可见（非空白）：opacity=1 且尺寸>0', a0?.opacity === 1 && (a0?.titleRect?.h ?? 0) > 10,
  `opacity=${a0?.opacity}，高=${Math.round(a0?.titleRect?.h ?? 0)}px`);
pass('标题颜色与画布底色不同（非隐形）', !!a0 && a0.color !== a0.bg, `标题=${a0?.color} / 底色=${a0?.bg}`);
pass('随文模式：标题位于滚动容器内部', a0?.insideScroll === true);
pass('滚动容器可滚动（用于滚出校验）', a0?.scrollable === true, `可滚动=${a0?.scrollable}`);

const s1 = await scrollToBottom(page);
await page.waitForTimeout(500);
const a1 = await probe(page);
pass('滚动量足够覆盖标题高度', !!a1 && s1.actual > (a0?.titleRect?.h ?? 0) + 20,
  `实际滚动=${Math.round(s1.actual)}px，标题高=${Math.round(a0?.titleRect?.h ?? 0)}px`);
pass('随文模式：滚动后标题随经文滚出画面', !!a1?.titleRect && a1.titleRect.bottom <= a1.scrollRect.top + 2,
  `标题bottom=${Math.round(a1?.titleRect?.bottom ?? 0)} / 滚动区top=${Math.round(a1?.scrollRect?.top ?? 0)}`);
const v1 = await versesVisible(page);
pass('随文模式滚动后无留白（虚拟列表偏移正确）', v1.ok, `最大空白跨度=${v1.maxGap}px`);
await page.screenshot({ path: `${OUT}/title-mode-1-inline-scrolled.png` });

await setScroll(page, 0);
await page.waitForTimeout(400);
const a2 = await probe(page);
pass('滚回顶部标题回到首位', !!a2?.titleRect && Math.abs(a2.titleRect.top - a0.titleRect.top) < 3,
  `${Math.round(a2?.titleRect?.top ?? 0)} vs ${Math.round(a0?.titleRect?.top ?? 0)}`);

/* ================= 2. 切「常驻顶部」（pin） ================= */
await page.click('button[aria-label="标题-常驻"]');
await page.waitForTimeout(600);
const b0 = await probe(page);
pass('点「常驻」后标题显示方式=pinned', b0?.mode === 'pinned', `mode=${b0?.mode}`);
pass('常驻模式：标题在滚动容器之外', b0?.insideScroll === false);
const pinnedTop = b0?.titleRect?.top ?? 0;
await scrollToBottom(page);
await page.waitForTimeout(500);
const b1 = await probe(page);
pass('常驻模式：滚动后标题仍固定在画面上方', !!b1?.titleRect && Math.abs(b1.titleRect.top - pinnedTop) < 3 &&
  b1.titleRect.top >= b1.canvasRect.top - 2,
  `top ${Math.round(pinnedTop)} → ${Math.round(b1?.titleRect?.top ?? 0)}`);
const v2 = await versesVisible(page);
pass('常驻模式滚动后无留白', v2.ok, `最大空白跨度=${v2.maxGap}px`);
await page.screenshot({ path: `${OUT}/title-mode-2-pinned-scrolled.png` });

/* ================= 3. 切「不显示」（不 pin） ================= */
await page.click('button[aria-label="标题-不显示"]');
await page.waitForTimeout(600);
const c0 = await probe(page);
pass('点「不显示」后画布内无标题', c0?.hasTitle === false && (c0?.text ?? '') === '',
  `hasTitle=${c0?.hasTitle}`);
await page.screenshot({ path: `${OUT}/title-mode-3-hidden.png` });

/* ================= 4. 三屏一致：投影窗跟随 ================= */
await page.click('button[aria-label="标题-随文"]');
await page.waitForTimeout(500);
await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(700);
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1500);
const o1 = await probe(out);
const p1 = await probe(page);
pass('投影窗标题模式与主控台一致（随文）', o1?.mode === 'inline' && p1?.mode === 'inline',
  `主控台=${p1?.mode} / 投影窗=${o1?.mode}`);
pass('投影窗标题文本与主控台一致', o1?.text === p1?.text, `"${p1?.text}" / "${o1?.text}"`);
pass('投影窗标题可见（非空白）', o1?.opacity === 1 && (o1?.titleRect?.h ?? 0) > 10 && o1.color !== o1.bg,
  `opacity=${o1?.opacity}，高=${Math.round(o1?.titleRect?.h ?? 0)}px，色=${o1?.color}`);

await page.click('button[aria-label="标题-常驻"]');
await page.waitForTimeout(900);
const o2 = await probe(out);
pass('主控台切常驻 → 投影窗同步为常驻', o2?.mode === 'pinned', `投影窗=${o2?.mode}`);
await out.screenshot({ path: `${OUT}/title-mode-4-output-pinned.png` });

await page.click('button[aria-label="标题-随文"]');
await page.waitForTimeout(600);

/* ================= 5. 换章后标题仍可见（动画不卡 opacity:0） ================= */
await page.getByRole('button', { name: '投影', exact: true }).click().catch(() => {});
await page.waitForTimeout(400);
const afterSwitch = await page.evaluate(() => {
  const h2 = document.querySelector('[data-panel-canvas] h2');
  const wrap = document.querySelector('[data-panel-canvas] [data-passage-title]');
  return { text: h2?.textContent?.trim() ?? '', opacity: wrap ? Number(getComputedStyle(wrap).opacity) : null };
});
pass('切换后标题 opacity 仍为 1（无动画卡死）', afterSwitch.opacity === 1,
  `opacity=${afterSwitch.opacity}，文本="${afterSwitch.text}"`);

await browser.close();

console.log('\n===== 标题显示方式（常驻 / 随文 / 不显示）验收 =====');
for (const r of results) console.log(r);
console.log(`\n合计: ${results.filter((r) => r.includes('PASS')).length}/${results.length} PASS`);
if (errors.length) {
  console.log('\n--- 页面错误 ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
if (results.some((r) => r.includes('FAIL'))) process.exit(1);
