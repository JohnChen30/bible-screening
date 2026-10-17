import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/console', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('[data-passage-title]', { timeout: 20000 });
await p.waitForTimeout(1200);

const measure = (pg) => pg.evaluate(() => {
  const c = document.querySelector('[data-panel-canvas]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const sc = c.querySelector('.overflow-y-auto');
  const verses = [...c.querySelectorAll('[data-verse]')].map(v => ({
    n: Number(v.getAttribute('data-verse')),
    top: v.getBoundingClientRect().top, bottom: v.getBoundingClientRect().bottom,
  })).filter(v => Number.isFinite(v.n));
  const scr = sc.getBoundingClientRect();
  const vis = verses.filter(v => v.bottom > scr.top + 2 && v.top < scr.bottom - 2).map(v => v.n);
  return {
    ratioAttr: c.getAttribute('data-panel-canvas'),
    w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3),
    fontSize: getComputedStyle(c.querySelector('.verse-line') || c).fontSize,
    scrollH: sc?.scrollHeight, clientH: sc?.clientHeight,
    visibleVerses: vis.length ? `${vis[0]}~${vis[vis.length-1]} (${vis.length}节)` : '无',
  };
});

const setRatio = async (label) => {
  await p.click('button[aria-label="排版设置"]');
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: label, exact: true }).click();
  await p.waitForTimeout(500);
  await p.click('button[aria-label="关闭设置"]');
  await p.waitForTimeout(600);
};

for (const label of ['4:3', '16:9', '16:10']) {
  await setRatio(label);
  const prev = await measure(p);
  console.log(`[设置=${label}] 预览画布 ${prev.w}x${prev.h} 实际比例=${prev.ratio} 字号=${prev.fontSize} 可见=${prev.visibleVerses} 内容高=${prev.scrollH}/${prev.clientH}`);
}

// 投影窗
await p.getByRole('button', { name: '投影', exact: true }).click();
await p.waitForTimeout(600);
const out = await ctx.newPage();
await out.setViewportSize({ width: 1600, height: 900 });
await out.goto('http://localhost:5173/output', { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(1500);
const o = await measure(out);
const pv = await measure(p);
console.log(`[投影窗] 画布 ${o.w}x${o.h} 实际比例=${o.ratio} 字号=${o.fontSize} 可见=${o.visibleVerses} 内容高=${o.scrollH}/${o.clientH}`);
console.log(`[预览  ] 画布 ${pv.w}x${pv.h} 实际比例=${pv.ratio} 字号=${pv.fontSize} 可见=${pv.visibleVerses} 内容高=${pv.scrollH}/${pv.clientH}`);
await b.close();
