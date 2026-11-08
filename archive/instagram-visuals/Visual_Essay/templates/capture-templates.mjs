// Captures one research-language template deterministically: ?driven=1 disables the page's own
// requestAnimationFrame loop, and this script calls window.essayStep(virtualMs) once per frame
// instead — same convention as Visual_Essay/genui-ep1/capture-shots.mjs.
//
//   cd Instagram_Visuals && npm install              (once: puppeteer-core)
//   python3 -m http.server 8765                      (from the repo root)
//   node Visual_Essay/templates/capture-templates.mjs <template> [seconds] [fps]
//     template  timeline | network | flowchart | history
//     seconds   clip length to render (default: that template's own loop length, see LOOP_S below)
//     fps       default 60
//
// Output: exports/<template>-9x16.mp4 (1080×1920 — this library is vertical-only)
// Env: STAGE_URL_BASE (default http://localhost:8765)
//      CHROME         (default the macOS Google Chrome app)

import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOP_S = {
  'timeline': 9.0,
  'network': 9.0,
  'flowchart': 8.5,
  'history': 8.5,
};

const [tmpl, secArg, fpsArg = '60'] = process.argv.slice(2);
if (!tmpl || !LOOP_S[tmpl]) {
  console.error(`Usage: node capture-templates.mjs <template> [seconds] [fps]\nTemplates: ${Object.keys(LOOP_S).join(', ')}`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'exports');
const base = process.env.STAGE_URL_BASE || 'http://localhost:8765';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1080, H = 1920;
const seconds = +(secArg || LOOP_S[tmpl]);
const fps = +fpsArg;
const n = Math.round(seconds * fps);

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`${base}/Instagram_Visuals/Visual_Essay/templates/${tmpl}.html?driven=1`, { waitUntil: 'load' });
await page.waitForFunction('window.essayStep', { timeout: 15000 });

const frames = join(outDir, `.frames-${tmpl}`);
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

for (let i = 0; i < n; i++) {
  await page.evaluate(ms => window.essayStep(ms), (i / fps) * 1000);
  await page.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`) });
  if (i % 60 === 0) process.stdout.write(`\r${tmpl}: ${i}/${n}`);
}

const file = join(outDir, `${tmpl}-9x16.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', file]);
rmSync(frames, { recursive: true, force: true });
console.log(`\r${n} frames @ ${fps}fps → ${file}`);
await browser.close();
