// The walking body (creature-body.js) run in Node twice, with the Rust engine's body physics off and on: every number of every
// body (chunks, their last positions, feet, joints, the gait clock, the skeleton) must come out the same.
//   node games/the-maw/tests/engine-body.mjs      (part of `npm run test:engine`)
// The bodies are made to reach every branch: a jointed walker on three-bone and four-bone legs, one rigid piece, a legless slitherer,
// a climber on a world with a tower, swimming and flying, a hand on it, a running gait, pokes and a drop.
import fs from 'node:fs'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const leg = (z, len, fracs, ang = 70, pole) => ({ ang, hip: [0.14, 0, z], len, reach: 0.8, fracs, pole });
const seg = (h, gap, legs, extra = {}) => ({ h, gap, legs, parts: [], ...extra });
const DEFS = {
  walker: { speed: 1.1, stride: 0.42, lift: 0.12, turn: 1.6, segs: [seg(0.34, 0, [leg(0, 0.5, [0.45, 0.45, 0.1])]), seg(0.33, 0.42, [leg(0, 0.52, [0.3, 0.3, 0.3, 0.1], 80, [0.4, 1])]), seg(0.32, 0.42, [leg(0, 0.5, [0.45, 0.45, 0.1], 100)]), seg(0.3, 0.42, [])],
    float: { rise: 0.7, swim: { waves: 1.1, amp: 0.8 } } },
  rigid: { speed: 0.9, stride: 0.4, lift: 0.1, segs: [seg(0.4, 0, [leg(0.3, 0.55, [0.45, 0.45, 0.1]), leg(-0.3, 0.55, [0.45, 0.45, 0.1], 110)], { zF: 0.6, zB: -0.6,
    arms: [{ flap: { rate: 5, amps: [30, 20], lags: [0, 0.15] }, len: 0.7, fracs: [0.5, 0.5], mount: [0.1, 0.15, 0.1], rest: [0.7, 0.2, 0.1] }] })] },
  slither: { speed: 0.8, stride: 0.35, lift: 0, segs: [seg(0.12, 0, []), seg(0.12, 0.3, []), seg(0.12, 0.3, []), seg(0.11, 0.3, []), seg(0.1, 0.3, [])] },
  climber: { speed: 1, stride: 0.4, lift: 0.1, climb: true, segs: [seg(0.25, 0, [leg(0, 0.45, [0.45, 0.45, 0.1])]), seg(0.25, 0.35, [leg(0, 0.45, [0.45, 0.45, 0.1])]), seg(0.24, 0.35, [leg(0, 0.45, [0.45, 0.45, 0.1])])] },
};
function run(engine, key, frames) {
  const win = { ECO_ENGINE: engine, performance, console }; win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  for (const f of ['packages/core/eco-core.js', 'packages/ecology/eco-engine.js', 'packages/motion/ik.js', 'packages/motion/gaits.js', 'packages/motion/skeleton.js', 'packages/core/surface.js', 'packages/motion/world-gen.js', 'packages/motion/creature-body.js'])
    vm.runInContext(fs.readFileSync(root + f, 'utf8'), ctx, { filename: f });
  // tank: the climber on the tank's own kind of world, a flat floor (read by the engine as a constant) with towers and a wall laid out by WorldGen
  const tank = key === 'tank', W = tank ? win.WorldGen.generate(2, { layout: { towers: [{ x: 4, z: 0, r: 1.1, h: 3.5 }, { x: -3, z: 3, r: 0.9, h: 2.5 }], walls: [{ x0: -2, z0: -3, x1: 3, z1: -3.5, t: 0.3, h: 1.6 }], half: [8, 8] } }) : null;
  const def = JSON.parse(JSON.stringify(DEFS[tank ? 'climber' : key])), H = tank ? W.H : (x, z) => 0.2 * Math.sin(x * 0.7) + 0.15 * Math.cos(z * 0.5);
  const surface = tank ? W.surface : key === 'climber' ? win.Surface.world(H, [{ x: 4, z: 0, profile: [[1.2, -1], [1.1, 2], [0.9, 3.5]] }]) : undefined;
  const S = { speed: 1, stride: 1, lift: 1, height: 1, gait: key === 'walker' ? 'wave' : 'alt' };
  const body = new win.CreatureBody(def, { H, S, surface, start: { x: 0, z: 0 }, yaw: 0.3, belly: key === 'climber' || tank, ceil: (x, z) => H(x, z) + 0.4 });
  let calls = 0, sensed = 0; if (win.EcoEngine.on) { const B = win.EcoEngine.Body, it = B.integrate, ig = B.integrateGround, se = B.sense; B.integrate = function (n) { calls++; return it.call(this, n); }; B.integrateGround = function (...a) { calls++; return ig.apply(this, a); }; B.sense = function (...a) { sensed++; return se.apply(this, a); }; }
  const out = [], marks = []; let cling = 0, ran = 0;
  const put = (v) => out.push(v.x, v.y, v.z);
  for (let i = 0; i < frames; i++) {
    const a = i * 0.004, r = i > 1800 && i < 2300 ? 9 : 3;
    const climbs = key === 'climber' || tank;
    body.target.set(climbs && i > 600 ? 4.2 : Math.cos(a) * r, 0, climbs && i > 600 ? 0.3 : Math.sin(a) * r);
    if (i === 400) body.poke(1, { x: 3, y: 2, z: -1 });
    if (!climbs) { if (i === 800) body.setMode('swim'); if (i === 1150) body.setMode('fly'); if (i === 1450) body.setMode('walk'); }
    if (i === 1600) body.steer = { x: 0.8, z: -0.6, k: [1, 0.7, 0.4, 0, 0.5], grip: 0.4 };
    if (i === 1750) body.steer = null;
    if (i === 1800 && key !== 'slither') body.run = { set: win.Gaits.RUN.cat };
    if (i === 2300) body.run = null;
    if (i === 2400) body.lift(1.2);
    body.step([1 / 60, 1 / 120, 1 / 48, 0.2][i % 4]);
    if (i % 100 === 0) marks.push(body.chunks[0].p.x);
    cling = Math.max(cling, body.cling || 0); if (body.run && body.run.gait) ran++;
  }
  for (const c of body.chunks) { put(c.p); put(c.prev); put(c.n); put(c.f); out.push(c.d, c.sup, c.grip); }
  for (const L of body.legs) { put(L.foot); for (const j of L.J) put(j); put(L.plane); out.push(L.u, L.err, L.extra, L.planted ? 1 : 0, L.stepping ? 1 : 0); }
  for (const A of body.arms) for (const j of A.J) put(j);
  put(body.hdir); out.push(body.t, body.acc, body.pace, body.wavePh, body.vWant, body.cling, body.grip, ...body.slope);
  const sk = body.skel; for (const g of sk.segs) { put(g.o); put(g.x); put(g.y); put(g.z); } out.push(sk.feel.pace, sk.feel.grip, sk.feel.air);
  return { on: win.EcoEngine.on, out, marks, calls, sensed, cling, ran };
}
let bad = 0;
for (const key of [...Object.keys(DEFS), 'tank']) {
  const a = run('js', key, 2600), b = run('rust', key, 2600);
  let diff = a.out.length === b.out.length ? 0 : -1, first = -1;
  if (!diff) for (let i = 0; i < a.out.length; i++) if (!Object.is(a.out[i], b.out[i])) { diff++; if (first < 0) first = i; }
  const markDiff = a.marks.findIndex((m, i) => !Object.is(m, b.marks[i]));
  const fin = b.out.every(Number.isFinite);
  const ok = diff === 0 && !a.on && b.on && b.calls > 0 && b.sensed > 0 && fin; bad += !ok;
  console.log(ok ? 'PASS' : 'FAIL', key, '· 2600 frames ·', a.out.length, 'numbers ·', diff, 'differ' + (first >= 0 ? ` (first at ${first}; paths part at mark ${markDiff})` : ''), '· all finite', fin, '· substeps in the engine', b.calls, '· sensed there', b.sensed, '· most of it on a wall', b.cling.toFixed(2), '· frames running', b.ran);
}
process.exit(bad ? 1 : 0);
