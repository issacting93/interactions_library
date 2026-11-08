import puppeteer from 'puppeteer-core';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
for (const [piece, mode, t] of JSON.parse(process.argv[2])) {
  await page.goto(`http://localhost:8765/Instagram_Visuals/stage/stage.html?piece=${piece}&mode=${mode}&format=4x5&capture=1&t=${t}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.stage && window.stage.ready');
  await page.evaluate(tt => window.stage.seek(tt), t);
  await page.screenshot({ path: `stage/.review/c-${piece}-${mode}.png` });
}
console.log(errors.length ? 'ERRORS: ' + errors.join('|') : 'no page errors');
await browser.close();
