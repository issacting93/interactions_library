// tools/capture/world-scene-shake.mjs -- how steady is a place's shot camera? Steps the place at 60 fps and reports, per shot, the
// frame-to-frame jitter of the camera centre (world units), yaw (degrees) and distance (% of it): the part of the motion that is not
// a smooth drift (the second difference). Smooth is below the limits printed with each row.
//   node world-scene-shake.mjs crossing --uneven   (frames of unequal length, as on a phone)
//   node world-scene-shake.mjs crossing        (a place; or no argument for every place)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const JIT = process.argv.includes('--uneven'),
  only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 400, height: 260 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.addInitScript(() => {
  let s = 20261127;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  window.requestAnimationFrame = () => 0;
});
await page.route('http://repo.local/**', (r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
  r.fulfill({
    status: 200,
    body: fs.readFileSync(f),
    contentType: TYPES[path.extname(f)] || 'application/octet-stream',
  });
});
await page.goto('http://repo.local/world/scenes/world-scene/World%20Scene.html');
await page.waitForFunction(() => window.ENVX && typeof sim !== 'undefined', null, { timeout: 180000 });
await page.waitForTimeout(1000);
const ids = only.length ? only : await page.evaluate(() => Object.keys(ENVX.places));
let bad = 0;
for (const p of ids) {
  const rows = await page.evaluate(
    ([p, JIT]) => {
      ENVX.manual(true);
      ENVX.set(p);
      const out = [];
      const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length));
      ENVX.P.shots.forEach((sh, k) => {
        const t0 = ENVX.P.shots.slice(0, k).reduce((a, s) => a + s.len, 0);
        ENVX.shotT = t0;
        for (let i = 0; i < 60; i++) ENVX.step(1 / 60);
        const C = [],
          D = [];
        const n = Math.min(240, Math.round(sh.len * 60 - 130));
        for (let i = 0; i < n; i++) {
          const dt = JIT ? [1 / 30, 1 / 90, 1 / 60, 1 / 45, 1 / 120][i % 5] : 1 / 60;
          ENVX.step(dt);
          const c = ENVX.camera(dt);
          if (c) {
            C.push([c.c[0], c.c[1], c.c[2], (c.yaw * 180) / Math.PI, c.dist]);
            D.push(dt);
          }
        }
        // change of velocity (per second, so frames of unequal length compare fairly), per frame, in units a second a second
        const d2 = (j) => {
          const v = C.slice(1).map((_, i) => (C[i + 1][j] - C[i][j]) / D[i + 1]);
          return v.slice(1).map((x, i) => (x - v[i]) * 0.0167);
        };
        const dist = C.length ? C[0][4] : 1;
        out.push({
          shot: sh.kind + ':' + (sh.target || 'center'),
          n: C.length,
          pos: +rms([...d2(0), ...d2(1)]).toFixed(4),
          yaw: +rms(d2(3)).toFixed(4),
          dist: +((rms(d2(4)) / dist) * 100).toFixed(3),
          step: +rms(C.slice(1).map((_, i) => Math.hypot(C[i + 1][0] - C[i][0], C[i + 1][1] - C[i][1]))).toFixed(3),
          scale: dist,
        });
      });
      return out;
    },
    [p, JIT]
  );
  for (const r of rows) {
    // jitter relative to the view: position as a share of the distance, yaw in degrees a frame
    const pos = (r.pos / r.scale) * 1000,
      bad1 = pos > 0.6 || r.yaw > 0.05 || r.dist > 0.05;
    if (bad1) bad++;
    console.log(
      `${bad1 ? 'SHAKY' : 'ok   '} ${p.padEnd(10)} ${r.shot.padEnd(18)} pos ${pos.toFixed(2)}‰ yaw ${r.yaw}°  dist ${r.dist}%`
    );
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
