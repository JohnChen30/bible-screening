import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const p = await (await b.newContext({viewport:{width:1440,height:820}})).newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,300)));
p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text().slice(0,300)); });
await p.goto('http://localhost:5173/console', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
const info = await p.evaluate(() => {
  const canvas = document.querySelector('[data-panel-canvas]');
  const t = document.querySelector('[data-passage-title]');
  return {
    canvas: !!canvas,
    title: !!t,
    mode: t?.getAttribute('data-title-mode'),
    text: t?.textContent?.trim()?.slice(0,60),
    h2s: [...document.querySelectorAll('h2')].map(h=>h.textContent?.trim()),
    bodyText: document.body.innerText.slice(0, 300),
  };
});
console.log(JSON.stringify(info, null, 2));
console.log('ERRORS:', errs.slice(0,8));
await b.close();
