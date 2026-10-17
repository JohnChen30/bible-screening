import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const p = await (await b.newContext({viewport:{width:1440,height:820}, deviceScaleFactor:2})).newPage();
await p.goto('http://localhost:5173/console', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('[data-passage-title]', { timeout: 20000 });
await p.waitForTimeout(1500);
const box = await p.locator('header').boundingBox();
await p.screenshot({ path: 'E:/workspace/bible_screening/resources/ui-toolbar.png', clip: { x: 0, y: 0, width: 1440, height: Math.max(56, box.height + 8) } });
const info = await p.evaluate(() => {
  const h = document.querySelector('header');
  const btns = [...document.querySelectorAll('button[aria-label^="标题-"]')];
  return { headerH: h.getBoundingClientRect().height, headerScrollW: h.scrollWidth, headerClientW: h.clientWidth,
    groups: btns.map(x=>({l:x.getAttribute('aria-label'), h:Math.round(x.getBoundingClientRect().height), w:Math.round(x.getBoundingClientRect().width)})) };
});
console.log(JSON.stringify(info));
await b.close();
