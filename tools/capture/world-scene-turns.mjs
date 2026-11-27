// tools/capture/world-scene-turns.mjs -- how fast does a species turn, and does it turn while barely moving?
//   node world-scene-turns.mjs crossing manta        prints the 95th percentile turn rate (rad/s), the share of time turning faster than
//                                                    0.5 rad/s while slower than half its usual speed, and the median speed
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const [id = 'crossing', sp = 'manta'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
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
  r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
});
await page.goto('http://repo.local/world/scenes/world-scene/World%20Scene.html');
await page.waitForFunction(() => window.ENVX && typeof sim !== 'undefined', null, { timeout: 180000 });
await page.waitForTimeout(1000);
const r = await page.evaluate(
  ([id, sp, TRACE]) => {
    ENVX.manual(true);
    ENVX.set(id);
    const dt = 1 / 30,
      fish = () => sim.fish.filter((f) => !f.dead && EcologySpecies.SPECIES[f.sp].key === sp);
    for (let i = 0; i < 240; i++) ENVX.step(dt);
    const prev = new Map(),
      rates = [],
      speeds = [];
    let still = 0,
      n = 0;
    for (let i = 0; i < 900; i++) {
      ENVX.step(dt);
      if (i % 15 === 0 && TRACE) (window.__tr = window.__tr || []).push(fish().map((f) => [+f.ang.toFixed(2), +Math.hypot(f.vx, f.vy).toFixed(0), +(Math.atan2(f.vy, f.vx)).toFixed(2), f.role ? +Math.atan2(f.role.hy, f.role.hx).toFixed(2) : null]));
      for (const f of fish()) {
        const sped = Math.hypot(f.vx || 0, f.vy || 0),
          p = prev.get(f);
        if (p) {
          const d = Math.atan2(Math.sin(f.ang - p.ang), Math.cos(f.ang - p.ang)),
            rate = Math.abs(d) / dt;
          rates.push(rate);
          speeds.push(sped);
          n++;
          prev.set(f, { ang: f.ang, sped });
        } else prev.set(f, { ang: f.ang, sped });
      }
    }
    const med = speeds.slice().sort((a, b) => a - b)[speeds.length >> 1] || 1;
    let slowTurn = 0;
    rates.forEach((v, i) => {
      if (speeds[i] < med * 0.5 && v > 0.5) slowTurn++;
    });
    const q = rates.slice().sort((a, b) => a - b);
    if (window.__trace) return window.__trace;
    if (TRACE) return window.__tr.slice(0, 40);
    return { n: rates.length, turn95: +q[Math.floor(q.length * 0.95)].toFixed(2), turnMax: +q[q.length - 1].toFixed(2), medSpeed: +med.toFixed(2), slowTurnShare: +(slowTurn / rates.length).toFixed(3) };
  },
  [id, sp, process.argv.includes('--trace')]
);
console.log(JSON.stringify(r));
await browser.close();
