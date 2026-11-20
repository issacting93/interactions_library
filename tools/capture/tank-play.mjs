import { open } from './cap.mjs';
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const { browser, page, errs } = await open('/world/forges/fish-tool/Cybernetic Ecology.html#autopilot',{w:1100,h:700});
await page.waitForTimeout(45000);
const ok = await page.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()==='begin'); if(b){b.click();return true;} return false; });
console.log('begin', ok);
await page.waitForTimeout(25000);
await page.screenshot({path:'out/tank-play.png',timeout:120000});
const dir='/tmp/tankf'; fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir);
const t0=Date.now();
for (let i=0;i<30;i++){ await page.screenshot({path:`${dir}/f${String(i).padStart(4,'0')}.png`,timeout:120000}); }
console.log('30 frames in', Date.now()-t0, 'ms');
execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','6','-i',`${dir}/f%04d.png`,'-vf','scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=none','out/tank-play.gif']);
console.log('gif', fs.statSync('out/tank-play.gif').size, errs.slice(0,3).join(';')||'ok');
await browser.close();
