import { open } from './cap.mjs';
// real-time still(s): node rt.mjs <url> <out.png> <waitMs> [w] [h]
const [url,out,wait='15000',w='1280',h='800']=process.argv.slice(2);
const { browser, page, errs } = await open(url,{w:+w,h:+h});
await page.waitForTimeout(+wait); await page.screenshot({path:out,timeout:120000});
console.log(out, errs.slice(0,4).join(';')||'ok');
console.log((await page.evaluate(()=>[...document.querySelectorAll('button,select,[role=tab]')].map(b=>(b.innerText||b.id||'').trim().replace(/\s+/g,' ').slice(0,16)).filter(Boolean).slice(0,60).join(' | '))).slice(0,900));
await browser.close();
