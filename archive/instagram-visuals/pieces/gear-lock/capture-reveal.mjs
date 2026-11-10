// Capture pieces/gear-lock/reveal.html — gear-lock-autoplay.html?driven=1 stepped frame-by-frame
// (via window.reveal.seek(t), see reveal.html's own comment) composited over the real parallax
// clip, which the dial shrinks to 0.05 and dissolves into the instant RELEASE fires (all 6 locked).
//
// This is a deterministic, seek(t)-per-frame capture — same shape as stage/capture.mjs — now that
// gear-lock-autoplay.html's flourishes are clock-driven (DRIVEN mode) instead of real wall time, so
// it doesn't need the real-time wall-clock pacing an earlier revision of this script used (that one
// topped out around 10 fps on screenshot latency alone and had to measure its own achieved rate to
// get the duration right at all — this version always renders at a clean, fixed FPS).
//
// The stop point is still event-driven, not a fixed duration: reveal.html's RELEASE trigger fires
// whenever gearLockState.lockedCount first hits N, which depends on the shuffled lock order —
// reproducible run to run only because gear-lock-autoplay.html is seeded (?seed=1, set in
// reveal.html). This script keeps seeking TAIL_SEC past the shrink+dissolve finishing, then stops.
//
//   npm i -D puppeteer-core            (once, in Instagram_Visuals/ — already present for capture.mjs)
//   node stage/serve-range.mjs 8766    (the parallax <video> layer needs real Range support to
//                                       seek(); see serve-range.mjs for why python3 -m http.server won't do)
//   node pieces/gear-lock/capture-reveal.mjs [format] [fps] [tailSeconds]
//     format      4x5 | 9x16 | 1x1 (default 4x5 — reveal.html's own layout is only wired for 4x5)
//     fps         default 60
//     tailSeconds how long to keep capturing after RELEASE + the shrink/dissolve finish (default 5.5)
//
// Output: pieces/gear-lock/exports/reveal-<format>.mp4
// Env: STAGE_URL_BASE (default http://localhost:8766 — serve-range.mjs's default port)
//      CHROME         (default the macOS Google Chrome app)

import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [format = '4x5', fpsArg = '60', tailArg = '5.5'] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'exports');
const base = process.env.STAGE_URL_BASE || 'http://localhost:8766';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [W, H] = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] }[format];
const fps = +fpsArg, tailSec = +tailArg;
const SHRINK_DUR = 1.0, FADE_DUR = 0.3;   // must match reveal.html's own constants
const MAX_SEC = 40;                        // safety cap in case RELEASE never fires

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.setDefaultNavigationTimeout(60000);
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`${base}/Instagram_Visuals/pieces/gear-lock/reveal.html`, { waitUntil: 'load' });
await page.waitForFunction('window.reveal && window.reveal.ready', { timeout: 30000 });
const stageEl = await page.$('#stage');

const frames = join(outDir, `.frames-reveal-${format}`);
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

let i = 0;
for (;;) {
  const t = i / fps;
  await page.evaluate(tt => window.reveal.seek(tt), t);
  await stageEl.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`) });
  if (i % 60 === 0) process.stdout.write(`\r${i} frames · t=${t.toFixed(1)}s`);
  const { triggered, triggerAtSec } = await page.evaluate(() => ({ triggered: window.reveal.triggered, triggerAtSec: window.reveal.triggerAtSec }));
  i++;
  if (triggered && t >= triggerAtSec + SHRINK_DUR + FADE_DUR + tailSec) break;
  if (t >= MAX_SEC) { process.stdout.write('\nRELEASE never fired within MAX_SEC — stopping anyway.\n'); break; }
}
const n = i;
const file = join(outDir, `reveal-${format}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', file]);
rmSync(frames, { recursive: true, force: true });
console.log(`\r${n} frames @ ${fps}fps → ${file}`);
await browser.close();
