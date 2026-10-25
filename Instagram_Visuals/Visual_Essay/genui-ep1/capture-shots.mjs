// Captures one genui-ep1 shot deterministically: ?driven=1 disables the page's own
// requestAnimationFrame loop, and this script calls window.essayStep(virtualMs) once per frame
// instead — same idea as pieces/gear-lock/capture-story.mjs. Every shot is a pure function of
// time, so the output is frame-exact and reproducible.
//
//   cd Instagram_Visuals && npm install              (once: puppeteer-core)
//   python3 -m http.server 8765                      (from the repo root)
//   node Visual_Essay/genui-ep1/capture-shots.mjs <shot> [seconds] [fps]
//     shot      intro-title | chat-canvas | feed-placeholder | origin-supple | shelf-grid |
//               frozen-app | seesaw | genui-vs-genai | wrapped-cards | vibe-code | endcard
//     seconds   clip length to render (default: that shot's own loop length, see LOOP_S below)
//     fps       default 60
//
// Output: exports/<shot>-9x16.mp4 (always 1080×1920 — this essay is vertical-only)
// Env: STAGE_URL_BASE (default http://localhost:8765)
//      CHROME         (default the macOS Google Chrome app)

import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOP_S = {
  'intro-title': 9.0,
  'chat-canvas': 6.2,
  'feed-placeholder': 4.0,
  'origin-supple': 9.0,
  'shelf-grid': 8.0,
  'frozen-app': 8.0,
  'seesaw': 7.2,
  'genui-vs-genai': 8.0,
  'wrapped-cards': 8.0,
  'vibe-code': 6.6,
  'endcard': 5.0,
};

const [shot, secArg, fpsArg = '60'] = process.argv.slice(2);
if (!shot || !LOOP_S[shot]) {
  console.error(`Usage: node capture-shots.mjs <shot> [seconds] [fps]\nShots: ${Object.keys(LOOP_S).join(', ')}`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'exports');
const base = process.env.STAGE_URL_BASE || 'http://localhost:8765';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1080, H = 1920;
const seconds = +(secArg || LOOP_S[shot]);
const fps = +fpsArg;
const n = Math.round(seconds * fps);

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`${base}/Instagram_Visuals/Visual_Essay/genui-ep1/shots/${shot}.html?driven=1`, { waitUntil: 'load' });
await page.waitForFunction('window.essayStep', { timeout: 15000 });

const frames = join(outDir, `.frames-${shot}`);
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

for (let i = 0; i < n; i++) {
  await page.evaluate(ms => window.essayStep(ms), (i / fps) * 1000);
  await page.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`) });
  if (i % 60 === 0) process.stdout.write(`\r${shot}: ${i}/${n}`);
}

const file = join(outDir, `${shot}-9x16.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', file]);
rmSync(frames, { recursive: true, force: true });
console.log(`\r${n} frames @ ${fps}fps → ${file}`);
await browser.close();
