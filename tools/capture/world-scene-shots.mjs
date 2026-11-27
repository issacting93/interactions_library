// tools/capture/world-scene-shots.mjs -- stills of a World Scene place at given times, for looking at before publishing.
//
//   node world-scene-shots.mjs hunt 6,18,29        -> out/ws/hunt-6.png ...
//   node world-scene-shots.mjs seasons             -> a still at each quarter of the loop
//   node world-scene-shots.mjs seasons 8 --style=none   -> with a page style set before the shot (none: the glass towers)
//   node world-scene-shots.mjs vigil 5 --follow=moth:3   -> a close follow shot of one species (zoom after the colon)
//   node world-scene-shots.mjs all                 -> a contact sheet: one still per place, at a third of its loop
//
// Headless, seeded, stepped by hand (ENVX.manual): the frame is read back from the canvas after ENVX.step, so no rAF is needed.
// The tank is built over a few seconds of stepping first (solid cores and plants), then the camera settles for 60 frames.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/capture/out/ws');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const [id = 'all', at = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FOLLOW = (process.argv.find((a) => a.startsWith('--follow=')) || '').slice(9);   // species[:zoom]: a close follow shot of it
const STYLE = (process.argv.find((a) => a.startsWith('--style=')) || '').slice(8);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.addInitScript(() => {
  let s = 20261127;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  window.requestAnimationFrame = () => 0;
});
await page.route('http://repo.local/**', (r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
  r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
});
await page.goto('http://repo.local/world/scenes/world-scene/World%20Scene.html');
await page.waitForFunction(() => window.ENVX && typeof sim !== 'undefined', null, { timeout: 180000 });
await page.waitForTimeout(1500);
const ids = id === 'all' ? await page.evaluate(() => Object.keys(ENVX.places)) : [id];
for (const p of ids) {
  const times = await page.evaluate(
    ([p, at, STYLE, FOLLOW]) => {
      ENVX.manual(true);
      ENVX.set(p);
      if (FOLLOW) { const [sp, z] = FOLLOW.split(':'); ENVX.P.shots = [{ kind: 'follow', len: 40, target: sp, zoom: +(z || 3) }]; }
      if (STYLE) { S.style = STYLE; curStyle = StyleRecipes.get(S.style); }
      const total = ENVX.total();
      return at ? at.split(',').map(Number) : p === 'seasons' || (ENVX.P && ENVX.P.setting && ENVX.P.setting.growth && ENVX.P.setting.growth.seasons) ? [0.1, 0.35, 0.6, 0.85].map((u) => +(u * total).toFixed(1)) : [+(total / 3).toFixed(1)];
    },
    [p, at, STYLE, FOLLOW]
  );
  for (const t of times) {
    const url = await page.evaluate(
      async (t) => {
        ENVX.shotT = Math.max(0, t - 3);
        for (let i = 0; i < 45; i++) ENVX.step(1 / 15);
        return document.getElementById('c').toDataURL('image/png');
      },
      t
    );
    const f = path.join(OUT, `${p}-${t}.png`);
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log(f);
  }
}
await browser.close();
