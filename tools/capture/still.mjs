import { open } from './cap.mjs';
const [url,out,w='1400',h='1000',wait='1500']=process.argv.slice(2);
const { browser, page, errs } = await open(url,{w:+w,h:+h});
await page.waitForTimeout(+wait); await page.screenshot({path:out, fullPage:false}); console.log(out, errs.join(';')||'ok'); await browser.close();
