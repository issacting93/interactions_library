// Render process.html's 6 carousel slides to PNG.
//   python3 -m http.server 8765   (from the repo root)
//   node pieces/geared-reticle/process/render.mjs
// Output: pieces/geared-reticle/process/01-svg-layers.png … 06-connect-everything.png

import puppeteer from 'puppeteer-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.STAGE_URL || 'http://localhost:8765/Instagram_Visuals/pieces/geared-reticle/process/process.html';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SLIDES = [
  ['s1', '00-intro.png'],
  ['s2', '01-svg-layers.png'],
  ['s3', '02-noise-field.png'],
  ['s4', '03-stack-layers.png'],
  ['s5', '04-animejs-motion.png'],
  ['s6', '05-controls.png'],
];

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
await page.goto(base, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);

for (const [id, file] of SLIDES) {
  const el = await page.$('#' + id);
  await el.screenshot({ path: join(here, file) });
  console.log(file);
}

await browser.close();
