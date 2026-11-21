import { open, run, gif, video } from './cap.mjs';
// node g-any.mjs <url> <out.gif|out.mp4|out.png> <clicks 'A|B'> <warm ms> <frames> <clipSel|x,y,w,h|-> [width] [step]
const [url, out, clicks='', warm='3000', frames='66', clipArg='-', width='480', step='40'] = process.argv.slice(2);
const { browser, page, errs } = await open(url, { clock:true });
for (let i=0;i<6;i++){ await new Promise(r=>setTimeout(r,500)); await run(page, 300, 100); }
for (const t of clicks.split('|').filter(Boolean)) {
  const ok = await page.evaluate(t=>{ const els=[...document.querySelectorAll('button,[role=tab],[data-walker],.tile,li,a,div')]; const b=els.find(b=>b.children.length<3 && b.textContent.trim().toLowerCase()===t.toLowerCase()); if(b){b.click();return true;} return false; }, t);
  console.log('click', t, ok); await run(page, 600, 100);
}
await run(page, +warm, 60);
let clip=null;
if (/^\d+,/.test(clipArg)) { const [x,y,w,h]=clipArg.split(',').map(Number); clip={x,y,width:w,height:h}; }
else if (clipArg!=='-') clip = await page.evaluate(s=>{ const r=document.querySelector(s).getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}; }, clipArg);
if (out.endsWith('.png')) { await page.screenshot({ path:out, ...(clip?{clip}:{}) }); console.log('still', out); }
else if (out.endsWith('.mp4')) { await page.screenshot({ path: out.replace('.mp4','-still.png'), ...(clip?{clip}:{}) }); const size = await video(page, out, { frames:+frames, step:+step, clip, width:+width, fps:Math.round(1000/+step) }); console.log(out, (size/1e6).toFixed(2)+'MB'); }
else { await page.screenshot({ path: out.replace('.gif','-still.png'), ...(clip?{clip}:{}) }); const size = await gif(page, out, { frames:+frames, step:+step, clip, width:+width, fps:Math.round(1000/+step), colors:24 }); console.log(out, (size/1e6).toFixed(2)+'MB'); }
console.log(errs.join(';')||'no errors');
await browser.close();
