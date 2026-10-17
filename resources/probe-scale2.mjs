import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/console', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('[data-passage-title]', { timeout: 20000 });
await p.waitForTimeout(1200);
await p.getByRole('button', { name: '投影', exact: true }).click();
await p.waitForTimeout(600);
const out = await ctx.newPage();
await out.setViewportSize({ width: 1600, height: 900 });
await out.goto('http://localhost:5173/output', { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(2000);

const deep = (pg) => pg.evaluate(() => {
  const c = document.querySelector('[data-panel-canvas]');
  const sc = c.querySelector('.overflow-y-auto');
  const inner = sc.querySelector('div');
  const vt = c.querySelector('.reader-text');
  const rows = [...c.querySelectorAll('[data-verse]')].map(v => ({
    n: Number(v.getAttribute('data-verse')), h: +v.getBoundingClientRect().height.toFixed(1),
  })).filter(r => Number.isFinite(r.n));
  return {
    canvasW: Math.round(c.getBoundingClientRect().width),
    canvasH: Math.round(c.getBoundingClientRect().height),
    scale: Number(c.getAttribute('data-canvas-scale')),
    fontSize: vt ? +parseFloat(getComputedStyle(vt).fontSize).toFixed(2) : 0,
    colW: inner ? Math.round(inner.getBoundingClientRect().width) : 0,
    scrollH: sc.scrollHeight, clientH: sc.clientHeight,
    totalSize: inner ? Math.round(inner.getBoundingClientRect().height) : 0,
    rowH: rows.map(r => r.h),
    pad: getComputedStyle(sc).paddingLeft,
  };
});
const a = await deep(p), o = await deep(out);
console.log('预览:', JSON.stringify(a));
console.log('投影:', JSON.stringify(o));
console.log('宽比 =', (o.canvasW / a.canvasW).toFixed(4), ' 高比 =', (o.canvasH / a.canvasH).toFixed(4));
console.log('列宽比 =', (o.colW / a.colW).toFixed(4), ' 字号比 =', (o.fontSize / a.fontSize).toFixed(4));
console.log('视口高比 =', (o.clientH / a.clientH).toFixed(4));
console.log('内容总高比 =', (o.scrollH / a.scrollH).toFixed(4));
console.log('行高比(前6) =', a.rowH.slice(0,6).map((h,i)=> o.rowH[i] ? (o.rowH[i]/h).toFixed(3) : '-').join(' '));
await b.close();
