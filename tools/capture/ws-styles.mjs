import { open } from './cap.mjs';
const { browser, page, errs } = await open('/world/scenes/world-scene/World Scene.html',{w:1280,h:800});
await page.waitForTimeout(35000);
const info = await page.evaluate(()=>{ const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>/paper/i.test(o.text))); const b=[...document.querySelectorAll('button')].find(b=>/hide panels/i.test(b.textContent)); if(b) b.click(); window.__sty=s; return s?[...s.options].map(o=>o.value+':'+o.text):null; });
console.log('styles', JSON.stringify(info));
for (const o of (info||[])) { const v=o.split(':')[0]; await page.evaluate(v=>{ const s=window.__sty; s.value=v; s.dispatchEvent(new Event('change',{bubbles:true})); s.dispatchEvent(new Event('input',{bubbles:true})); }, v); await page.waitForTimeout(9000); await page.screenshot({path:`out/ws-${v||'x'}.png`,timeout:120000}); console.log('shot', v); }
console.log(errs.slice(0,3).join(';')||'ok'); await browser.close();
