// The walking body's surface: the page's (shared/engine/motion/surface.js) against the Rust engine's copy (engine/src/surface.rs), point by
// point. sample (distance and normal) and project (nearest point) must give the same numbers, bit for bit, everywhere a body can be: over
// generated worlds (hills, towers, walls, a lake), the tank's flat layout, and single towers and walls, with the world's ground-only view too.
//   node games/the-maw/tests/engine-surface.mjs      (part of `npm run test:engine`)
import fs from 'node:fs'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const win = { ECO_ENGINE: 'rust', performance, console }; win.window = win; win.globalThis = win;
const ctx = vm.createContext(win);
for (const f of ['shared/engine/ecology/eco-core.js', 'shared/engine/ecology/eco-engine.js', 'shared/engine/motion/surface.js', 'shared/engine/motion/world-gen.js'])
  vm.runInContext(fs.readFileSync(root + f, 'utf8'), ctx, { filename: f });
const E = win.EcoEngine, S = win.Surface, G = win.WorldGen;
if (!E.on || !E.Surface) { console.log('FAIL the engine did not start:', E.why); process.exit(1); }
let s = 7; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const cases = [];
for (const seed of [1, 5, 9]) { const W = G.generate(seed, {}); cases.push([`world ${seed}`, W.surface, W.size || 12]); cases.push([`world ${seed}, ground only`, W.surface.groundOnly(), 12]); }
{ const W = G.generate(3, { lake: true, towerScale: 1.6 }); cases.push(['world with a lake, tall towers', W.surface, 14]); }
{ const W = G.generate(2, { layout: { towers: [{ x: 2, z: -1, r: 0.9, h: 4 }, { x: -3, z: 2, r: 1.3, h: 6 }], walls: [{ x0: -4, z0: -4, x1: 3, z1: -3.5, t: 0.3, h: 1.8 }], half: [8, 6] } }); cases.push(['the tank: flat ground, towers, a wall', W.surface, 8]); }
cases.push(['a hill field', S.heightfield((x, z) => 0.2 * Math.sin(x * 0.7) + 0.15 * Math.cos(z * 0.5)), 10]);
cases.push(['one tower', S.tower({ x: 1, z: -2, profile: [[1.2, -1], [1.1, 2], [1.4, 2.2], [0.9, 3.5]] }), 4]);
cases.push(['one wall', S.wall({ x0: -2, z0: 0.5, x1: 3, z1: -1, t: 0.25, y0: -0.8, y1: 1.6 }), 4]);
let bad = 0;
for (const [name, surf, span] of cases) {
  const id = E.Surface.of(surf); if (id < 0) { console.log('FAIL', name, ': the engine does not hold it'); bad++; continue; }
  const a = { d: 0, nx: 0, ny: 0, nz: 0 }, b = { d: 0, nx: 0, ny: 0, nz: 0 }, p = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0 };
  let diff = 0, N = 60000, first = '';
  for (let i = 0; i < N; i++) {
    // mostly near the ground and the solids, some far off, a few exactly on an axis or an edge
    const x = i % 997 === 0 ? 0 : (rnd() * 2 - 1) * span, z = i % 991 === 0 ? 0 : (rnd() * 2 - 1) * span, y = i % 13 === 0 ? (rnd() * 2 - 1) * 20 : rnd() * 8 - 1.5;
    surf.sample(x, y, z, a); E.Surface.sample(id, x, y, z, b); surf.project(x, y, z, p); E.Surface.project(id, x, y, z, q);
    const same = Object.is(a.d, b.d) && Object.is(a.nx, b.nx) && Object.is(a.ny, b.ny) && Object.is(a.nz, b.nz) && Object.is(p.x, q.x) && Object.is(p.y, q.y) && Object.is(p.z, q.z);
    if (!same) { diff++; if (!first) first = JSON.stringify({ x, y, z, page: [a, p], engine: [b, q] }); }
  }
  bad += diff > 0; console.log(diff ? 'FAIL' : 'PASS', name, '·', surf.parts.length, 'parts ·', N, 'points ·', diff, 'differ', first);
}
process.exit(bad ? 1 : 0);
