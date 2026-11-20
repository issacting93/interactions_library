import { open, BASE } from './cap.mjs';
const [src,out,w='1600']=process.argv.slice(2);
const { browser, page } = await open('/README.md',{w:+w,h:900});
await page.setContent(`<body style="margin:0;background:#fff"><img src="${BASE}${src}" style="width:${w}px;display:block"></body>`);
await page.waitForFunction(()=>document.images[0].complete && document.images[0].naturalWidth>0);
await page.screenshot({path:out, fullPage:true}); await browser.close();
