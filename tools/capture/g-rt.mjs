import { openRec, closeRec } from './cap.mjs';
// Real-time video capture for pages too slow to drive on a fake clock (World Scene, the tank,
// terrain prototypes) — Playwright records what's on screen as it actually renders.
// node g-rt.mjs <url> <out.mp4> [clicks 'A|B'] [warm ms] [record ms] [w] [h]
const [url, out, clicks='', warm='3000', recordMs='8000', w='1280', h='800'] = process.argv.slice(2);
const { browser, ctx, page, errs } = await openRec(url, { w:+w, h:+h });
await page.waitForTimeout(+warm);
for (const t of clicks.split('|').filter(Boolean)) {
  const ok = await page.evaluate(t=>{ const els=[...document.querySelectorAll('button,[role=tab],[data-walker],.tile,li,a,div')]; const b=els.find(b=>b.children.length<3 && b.textContent.trim().toLowerCase()===t.toLowerCase()); if(b){b.click();return true;} return false; }, t);
  console.log('click', t, ok);
  await page.waitForTimeout(600);
}
await page.waitForTimeout(+recordMs);
const size = await closeRec(ctx, browser, out);
console.log(out, (size/1e6).toFixed(2)+'MB', errs.join(';')||'no errors');
