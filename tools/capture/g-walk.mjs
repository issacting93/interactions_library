import { open, run, gif, video } from './cap.mjs';
const [tile, out, frames='105', warm='2500'] = process.argv.slice(2);
const { browser, page, errs } = await open('/world/forges/walker-bestiary/walk.html', { clock:true });
for (let i=0;i<80;i++){ await new Promise(r=>setTimeout(r,400)); await run(page, 200, 100); if (await page.evaluate(t=>!!document.querySelector('[data-walker="'+t+'"]'), tile)) break; }
const ok = await page.evaluate(t=>{ const b=document.querySelector('[data-walker="'+t+'"]'); if(b){b.click();return true;} return 'none'; }, tile);
if (ok!==true) console.log('NOT FOUND', ok);
await run(page, +warm, 50);
const box = await page.evaluate(()=>{ const r=document.getElementById('wkStage').getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}; });
const still = out.endsWith('.mp4') ? out.replace('.mp4','-still.png') : out.replace('.gif','-still.png');
await page.screenshot({ path: still, clip: box });
const size = out.endsWith('.mp4')
  ? await video(page, out, { frames:+frames, step:40, clip:box, width:960, fps:25 })
  : await gif(page, out, { frames:+frames, step:60, clip:box, width:480, fps:16, colors:24 });
console.log(tile, JSON.stringify(box), (size/1e6).toFixed(2)+'MB', errs.join(';')||'no errors');
await browser.close();
