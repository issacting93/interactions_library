// Capture the ACTUAL live component (components/motion/parallax/parallax.html) for the STORY
// export — not the stage's hand-redrawn SVG piece. Deliberate: this one piece skips the house
// style and the stage entirely for STORY; SPEC and EXPLODED still come from stage/capture.mjs +
// pieces/parallax/piece.js, since those need the per-layer separation the live page doesn't have.
// The two exports are allowed to look different from each other — that's the point.
//
// A synthetic mouse sweep drives parallax.js's own pointer-depth tilt in real time; the ring
// rotation is the page's own CSS keyframes, also running in real time (there's no seek() here,
// unlike the stage — each frame is captured after waiting out real elapsed time, so the output
// plays at the same speed a visitor would see).
//
//   python3 -m http.server 8765        (from the repo root, same server stage/capture.mjs uses)
//   node pieces/parallax/capture-live.mjs [format] [seconds] [fps]
//     format   4x5 | 9x16 | 1x1 (default 4x5)
//     seconds  clip length (default 16) — the capture takes at least this long in wall time
//     fps      default 30 (real-time capture; 60 roughly doubles render time for little gain here)
//
// Output: pieces/parallax/exports/story-<format>.mp4
// Env: STAGE_URL_BASE (default http://localhost:8765)
//      CHROME         (default the macOS Google Chrome app)

import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [format = '4x5', secArg = '16', fpsArg = '30'] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'exports');
const base = process.env.STAGE_URL_BASE || 'http://localhost:8765';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [W, H] = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] }[format];
const seconds = +secArg, fps = +fpsArg, n = Math.round(seconds * fps);

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`${base}/components/motion/parallax/parallax.html`, { waitUntil: 'networkidle0' });

const frames = join(outDir, '.frames-story-live');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

// a slow Lissajous sweep across the window so the pointer-driven depth plays throughout the clip
const cx = W / 2, cy = H / 2, ax = W * 0.32, ay = H * 0.22;
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const target = t0 + (i / fps) * 1000;
  const wait = target - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  const t = i / fps;
  await page.mouse.move(cx + ax * Math.sin(t * 0.7), cy + ay * Math.sin(t * 0.5 + 1.3));
  await page.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`) });
  if (i % 30 === 0) process.stdout.write(`\r${i}/${n}`);
}
const file = join(outDir, `story-${format}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', file]);
rmSync(frames, { recursive: true, force: true });
console.log(`\r${file}`);
await browser.close();
