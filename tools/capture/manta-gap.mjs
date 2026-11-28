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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const [id = 'crossing'] = process.argv.slice(2);
const FOLLOW = (process.argv.find((a) => a.startsWith('--follow=')) || '').slice(9);   // species[:zoom]: a close follow shot of it
const WIDE = (process.argv.find((a) => a.startsWith('--wide=')) || '').slice(7);   // a high overview shot, zoom 0.5 by default
const STYLE = (process.argv.find((a) => a.startsWith('--style=')) || '').slice(8);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
page.on('console', (m) => { const t = m.text(); if (/solid tower|\[world-scene\]/.test(t)) console.log('console:', t.slice(0, 200)); });
await page.addInitScript(() => {
  let s = 20261127;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  window.requestAnimationFrame = () => 0;  window.addEventListener('load', () => { if (window.EcologyRender) EcologyRender.FADE.ms = 0; }); if (location.search.includes('nosolid')) window.NOSOLID = 1;
});
await page.route('http://repo.local/**', (r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
  r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
});
await page.goto('http://repo.local/world/scenes/world-scene/World%20Scene.html' + (process.env.NOSOLID ? '?nosolid' : ''));
await page.waitForFunction(() => window.ENVX && typeof sim !== 'undefined', null, { timeout: 180000 });
await page.waitForTimeout(1500);

const r = await page.evaluate(([p]) => {
  ENVX.manual(true); ENVX.set(p); ENVX.shotT = 4;
  const out = [];
  for (let k = 0; k < 40; k++) {
    for (let i = 0; i < 30; i++) ENVX.step(1 / 15);
    const idx = sim.speciesRT.findIndex((q) => q.key === 'manta');
    const m = sim.fish.filter((f) => f.sp === idx && !f.dead);
    if (m.length < 2) continue;
    const b = EcologySim.bodyLen(sim, m[0]);
    let mn = 1e9;
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) mn = Math.min(mn, Math.hypot(m[i].x - m[j].x, m[i].y - m[j].y));
    out.push(+(mn / b).toFixed(2)); if (k % 5 === 0) out.push('[' + m.map((f) => ((f.x - m[0].x) / b).toFixed(1) + ',' + ((f.y - m[0].y) / b).toFixed(1) + ' z' + (f.z).toFixed(2) + ' a' + (f.ang).toFixed(1) + ' b' + b.toFixed(0)).join(' | ') + ']');
  }
  return out;
}, [id]);
console.log(id, 'min manta gap in body lengths, every 2 s:', r.join(' '));
await browser.close();
