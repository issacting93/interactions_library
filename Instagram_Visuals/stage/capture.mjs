// Render a stage loop to frames and an MP4 (or a single PNG for SPEC).
//
//   npm i -D puppeteer-core            (once, in Instagram_Visuals/)
//   python3 -m http.server 8765        (from the repo root)
//   node stage/capture.mjs geared-reticle story 4x5 [fps] [motion] [tag]
//     fps     defaults to 60
//     motion  MOTION overrides as a query string, e.g. 'stagger=center&enter=outElastic(1,.6)&loop=12'
//             (defaults: 18 s STORY, 15 s EXPLODED loop, enter outBack(1.7), exit inBack(1.7); see MOTION in stage.html)
//     tag     appended to the file name, so variants don't overwrite the main export
//
// Output: Instagram_Visuals/pieces/<piece>/exports/<mode>-<format>[-tag].mp4 (or .png)
// Env: STAGE_URL (default http://localhost:8765/Instagram_Visuals/stage/stage.html)
//      CHROME     (default the macOS Google Chrome app)

import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [piece = 'rosette', mode = 'story', format = '4x5', fpsArg = '60', motion = '', tag = ''] = process.argv.slice(2);
const suffix = tag ? `-${tag}` : '';
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'pieces', piece, 'exports');
const base = process.env.STAGE_URL || 'http://localhost:8765/Instagram_Visuals/stage/stage.html';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [W, H] = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] }[format];

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`${base}?piece=${piece}&mode=${mode}&format=${format}&capture=1&t=0&fps=${fpsArg}${motion ? '&' + motion : ''}`, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.stage && window.stage.ready');
const { dur, fps } = await page.evaluate(() => ({ dur: window.stage.duration, fps: window.stage.fps }));
const art = await page.$('#art');

if (mode === 'spec') {
  const file = join(outDir, `${mode}-${format}${suffix}.png`);
  await art.screenshot({ path: file });
  console.log(file);
} else {
  const frames = join(outDir, `.frames-${mode}-${format}${suffix}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const n = Math.round(dur * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.stage.seek(t), i / fps);
    await art.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`) });
    if (i % 30 === 0) process.stdout.write(`\r${i}/${n}`);
  }
  const file = join(outDir, `${mode}-${format}${suffix}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', file]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`\r${file}`);
}
await browser.close();
