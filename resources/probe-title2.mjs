/** 探针：标题当前渲染状态（文本/颜色/几何/是否空白） */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-panel-canvas] h2', { timeout: 20000 }).catch(() => console.log('console: 无 h2'));
await page.waitForTimeout(1500);

const dump = async (p, tag) => {
  const r = await p.evaluate(() => {
    const canvas = document.querySelector('[data-panel-canvas]');
    if (!canvas) return { err: '无画布' };
    const h2 = canvas.querySelector('h2');
    const cr = canvas.getBoundingClientRect();
    if (!h2) return { err: '画布内无 h2', canvas: [cr.width, cr.height] };
    const hr = h2.getBoundingClientRect();
    const cs = getComputedStyle(h2);
    const sub = h2.parentElement?.querySelector('p');
    return {
      text: JSON.stringify(h2.textContent),
      rect: [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)],
      color: cs.color,
      fontSize: cs.fontSize,
      subText: sub ? JSON.stringify(sub.textContent) : null,
      subColor: sub ? getComputedStyle(sub).color : null,
      canvas: [Math.round(cr.width), Math.round(cr.height)],
    };
  });
  console.log(tag, JSON.stringify(r));
};

await dump(page, 'console:');
await page.screenshot({ path: `${process.env.OUT || 'resources'}/probe-t-console.png` });

await page.getByRole('button', { name: '投影', exact: true }).click();
await page.waitForTimeout(800);
const out = await ctx.newPage();
await out.goto(`${BASE}/output`, { waitUntil: 'domcontentloaded' });
await out.waitForSelector('[data-verse]', { timeout: 15000 });
await out.waitForTimeout(2000);
await dump(out, 'output:');
await out.screenshot({ path: `${process.env.OUT || 'resources'}/probe-t-output.png` });

await browser.close();
