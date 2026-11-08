// Capture gear-lock-autoplay.html itself for the STORY export — not the stage's piece.js redraw —
// same idea as pieces/parallax/capture-live.mjs: PLX-12's STORY comes from the real live component,
// SPEC/EXPLODED still come from stage/capture.mjs + piece.js, since those need the per-layer
// separation the live page doesn't have. LCK-14's EXPLODED stays on piece.js too (its pulled-apart-
// layers view has no equivalent in the autoplay file) — only STORY moves to this file.
//
// Unlike capture-live.mjs, this one IS deterministic: gear-lock-autoplay.html's ?driven=1 (added
// alongside pieces/gear-lock/reveal.html, see that file's and the autoplay file's own comments)
// lets it be stepped frame-by-frame via window.gearLockStep(virtualMs) instead of free-running on
// real wall time, so this captures at a clean fixed fps rather than racing screenshot latency.
// ?seed=1 makes the shuffled lock order (and so the exact run length) reproducible.
//
// Captures from a cold start through RELEASE (all 6 locked, field blooms) plus holdSeconds of the
// released field, then stops — no manufactured fade-to-black, same as capture-live.mjs: this is a
// raw window onto the live component, not a stage production.
//
//   npm i -D puppeteer-core            (once, in Instagram_Visuals/ — already present for capture.mjs)
//   node stage/serve-range.mjs 8766    (plain python3 -m http.server also works for this one — no
//                                       <video> here — but serve-range.mjs is already the house
//                                       default for this piece's exports, so keep using it)
//   node pieces/gear-lock/capture-story.mjs [format] [fps] [holdSeconds]
//     format      4x5 | 9x16 | 1x1 (default 4x5)
//     fps         default 60
//     holdSeconds how long to keep capturing the released field before stopping (default 4.5)
//
// Output: pieces/gear-lock/exports/story-<format>.mp4
// Env: STAGE_URL_BASE (default http://localhost:8766)
//      CHROME         (default the macOS Google Chrome app)

import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [format = '4x5', fpsArg = '60', holdArg = '4.5'] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'exports');
const base = process.env.STAGE_URL_BASE || 'http://localhost:8766';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [W, H] = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] }[format];
const fps = +fpsArg, holdSec = +holdArg;
const MAX_SEC = 40;   // safety cap in case RELEASE never fires

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.setDefaultNavigationTimeout(60000);
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`${base}/Instagram_Visuals/pieces/gear-lock/gear-lock-autoplay.html?seed=1&driven=1`, { waitUntil: 'load' });
await page.waitForFunction('window.gearLockStep && window.gearLockState', { timeout: 30000 });

const frames = join(outDir, `.frames-story-${format}`);
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

let i = 0, triggered = false, triggerAtSec = 0;
for (;;) {
  const t = i / fps;
  await page.evaluate(ms => window.gearLockStep(ms), t * 1000);
  await page.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`) });
  if (i % 60 === 0) process.stdout.write(`\r${i} frames · t=${t.toFixed(1)}s${triggered ? ' · released' : ''}`);
  if (!triggered) {
    const st = await page.evaluate(() => { const s = window.gearLockState; return { lockedCount: s.lockedCount, N: s.N }; });
    if (st.lockedCount === st.N) { triggered = true; triggerAtSec = t; }
  }
  i++;
  if (triggered && t >= triggerAtSec + holdSec) break;
  if (t >= MAX_SEC) { process.stdout.write('\nRELEASE never fired within MAX_SEC — stopping anyway.\n'); break; }
}
const n = i;
const file = join(outDir, `story-${format}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', file]);
rmSync(frames, { recursive: true, force: true });
console.log(`\r${n} frames @ ${fps}fps → ${file}`);
await browser.close();
