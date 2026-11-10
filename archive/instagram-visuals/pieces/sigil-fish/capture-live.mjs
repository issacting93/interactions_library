// Capture the ACTUAL live component (pieces/sigil-fish/source/Sigil Fish (1).html, canvas 2D, its
// own rAF loop) for the STORY export — not the stage's hand-redrawn SVG piece. Deliberate, same
// split as pieces/parallax/capture-live.mjs: this piece's STORY skips the house style and the
// stage entirely; SPEC and EXPLODED still come from stage/capture.mjs + pieces/sigil-fish/piece.js,
// since those need the per-layer separation the live canvas doesn't have. The two are expected to
// look different from each other — that's the point, not a bug.
//
// Real wall-clock capture (no seek() on a live canvas): each frame is captured after waiting out
// real elapsed time, so the output plays at the speed a visitor would actually see. Instead of a
// synthetic mouse sweep (parallax), this drives the page's own BODY WAVE / SPEED / IRIS range
// inputs directly — the exact sliders piece.js's stage version also exposes as controls — ramped
// on the same three-slot TWEAK choreography authored in piece.js's story.tweaks (wave loosens,
// then a speed burst, then iris catches late), so the live capture tells the same beat-for-beat
// story as the stage version, just rendered with the source's real bezier body, gradient fill and
// shimmer/glow shaders.
//
//   python3 -m http.server 8765        (from the repo root, same server stage/capture.mjs uses)
//   node pieces/sigil-fish/capture-live.mjs [format] [seconds] [fps]
//     format   4x5 | 9x16 | 1x1 (default 4x5)
//     seconds  clip length (default 18, matching this piece's STORY dur) — the capture takes at
//              least this long in wall time
//     fps      default 30 (real-time capture; 60 roughly doubles render time for little gain here)
//
// Output: pieces/sigil-fish/exports/story-<format>.mp4
// Env: STAGE_URL_BASE (default http://localhost:8765)
//      CHROME         (default the macOS Google Chrome app)

import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [format = '4x5', secArg = '18', fpsArg = '30'] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'exports');
const base = process.env.STAGE_URL_BASE || 'http://localhost:8765';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [W, H] = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] }[format];
const seconds = +secArg, fps = +fpsArg, n = Math.round(seconds * fps);

// mirrors piece.js's story.tweaks: REVEAL/CONTROLS-IN ~0–4, TWEAK 4–11.2 split into three equal
// 2.4 s slots (wave, then speed, then iris), HOLD 12.5–15.6, FADE 15.6–end — scaled to `seconds`
// if a non-18 s duration is passed, same spirit as the stage's timeWarp.
const SCALE = seconds / 18;
const win = (t, a, b) => Math.min(1, Math.max(0, (t - a * SCALE) / ((b - a) * SCALE)));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = k => k * k * (3 - 2 * k);
function poseAt(t) {
  const wave = lerp(220, 460, smooth(win(t, 4.0, 6.4)));
  const speed = lerp(1, 2.6, smooth(win(t, 6.4, 8.8)));
  const iris = lerp(0, 1, smooth(win(t, 8.8, 11.2)));
  return { wave, speed, iris };
}

mkdirSync(outDir, { recursive: true });
const frames = join(outDir, '.frames-story-live');
mkdirSync(frames, { recursive: true });

// This machine's headless Chrome has crashed the renderer outright mid-capture twice (silent
// "Target closed", no JS error — a process-level crash, not a script bug; this host also runs a
// heavy regular Chrome session plus several other apps, so it reads as memory/resource pressure,
// not something a launch flag reliably fixes). Rather than chase that, the loop below is resilient
// to it: each (re)launch starts a fresh page and fast-forwards through any frames already written
// to disk (so a crash loses only the in-flight frame, not the whole run), then keeps capturing from
// where it left off. Because the live page's own travelling-wave phase is driven by time-since-
// load, a relaunch does cause a visible phase jump in the body wave at that exact frame (amplitude/
// speed/iris stay correct, scheduled by frame index) — a minor seam, not a dropped shot.
async function launchPage() {
  // these three flags stop macOS/Chrome from throttling an unfocused/background automated window
  // (App-Nap-style backgrounding) — the erratic hang point (frame 22 one run, frame 163 the next,
  // always a multi-minute freeze inside a single Page.captureScreenshot call) matches this exactly
  // better than a leak in the page itself, since a leak would fail at a consistent frame count
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: 'new', protocolTimeout: 120000,
    args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('\n[pageerror]', e));
  page.on('console', m => { if (m.type() === 'error') console.error('\n[console.error]', m.text()); });
  // block the page's one external request (Google Fonts) — this sandbox's headless Chrome has no
  // outbound network, so waiting on it (via networkidle0) hangs until the nav timeout; the page
  // renders fine on fallback fonts, so aborting it outright is both faster and correct here
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().includes('fonts.googleapis.com')) req.abort();
    else req.continue();
  });
  await page.goto(`${base}/Instagram_Visuals/pieces/sigil-fish/source/Sigil%20Fish%20(1).html`, { waitUntil: 'load', timeout: 60000 });
  // hide the tool's own title card and slider drawer for a clean hero capture — this is a capture-
  // time style override (like the stage's body.capture rule), never a change to the source file
  await page.addStyleTag({ content: '.mark{display:none!important}.drawer{display:none!important}' });
  return { browser, page };
}

let { browser, page } = await launchPage();
let launchT0 = Date.now();   // time-since-this-page's-load, for the live rAF phase to catch up against
let i = 0;
let crashes = 0;
const MAX_CRASHES = 12;
while (i < n) {
  try {
    const target = launchT0 + (i / fps) * 1000;
    const wait = target - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const t = i / fps;
    const { wave, speed, iris } = poseAt(t);
    await page.evaluate((wave, speed, iris) => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        el.value = String(v);
        el.dispatchEvent(new Event('input'));   // the source's slider loop listens for 'input', not 'change'
      };
      set('wave', wave); set('speed', speed); set('iris', iris);
    }, wave, speed, iris);
    await page.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`) });
    if (i % 30 === 0) process.stdout.write(`\r${i}/${n}`);
    i++;
  } catch (e) {
    crashes++;
    console.error(`\n[relaunch] frame ${i} (${e.message}) — restart ${crashes}/${MAX_CRASHES}`);
    if (crashes > MAX_CRASHES) throw new Error(`too many renderer crashes (${crashes}) — giving up at frame ${i}/${n}`);
    try { await browser.close(); } catch {}
    ({ browser, page } = await launchPage());
    launchT0 = Date.now();
    // don't advance i: retry this same frame index fresh after the relaunch's own warm-up wait
  }
}
const file = join(outDir, `story-${format}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', file]);
rmSync(frames, { recursive: true, force: true });
console.log(`\r${file} (${crashes} renderer restart${crashes === 1 ? '' : 's'})`);
await browser.close();
