// The swimmer simulation (ecology-sim.js) run in Node twice from a seed, with the Rust engine off and on: every number of every creature
// (position, motion, body state, spine) must come out the same, and the random stream must stand at the same draw. The reference run
// also has steering weigh every hunter (EcologySim.CULL = false), so the distance cull is checked against the way it used to be. A fourth run
// keeps the creatures in the engine but steers them in JavaScript, which reads targets and the rest through the creatures' accessors.
//   node games/the-maw/tests/engine-sim.mjs      (part of `npm run test:engine`)
// Timings here are not the browser's: Node runs the scripts in a sandbox that is several times slower.
import fs from 'node:fs'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../..', import.meta.url));
function run(engine, seed, steps, withSolids, cull = true, extras = false, diet = false) {
  const win = { ECO_ENGINE: engine, performance, console }; win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  for (const f of ['shared/engine/ecology/eco-core.js', 'shared/engine/ecology/eco-engine.js', 'shared/engine/ecology/ecology-species.js', 'shared/engine/ecology/ecology-sim.js', ...(diet ? ['shared/engine/ecology/ecology-diet.js'] : [])])
    vm.runInContext(fs.readFileSync(root + '/' + f, 'utf8'), ctx, { filename: f });
  const cfg = { size: 40, speed: 1, beh: 'on', sep: 1, align: 1, coh: 1, flow: 'free', vradius: 0.3, swirl: 1, ptr: 'ignore', dz: 1, wiggle: 1, flex: 1, bank: 1, species: 'mixed', count: 220 };
  if (extras) Object.assign(cfg, { flow: 'vortex', ptr: 'scatter' });
  win.EcoCore.reseed(seed);
  const ES = win.EcologySim, sim = ES.create(cfg); ES.CULL = cull; ES.resize(sim, 900, 600); ES.setSpecies(sim, 'mixed');
  let calls = 0;
  if (extras) {   // everything else steering can be asked: a pointer, whirlpools (one for some species only), a host's say on fear, lures, a hand on one, a host's hunter, a share kept low
    ES.setPointer(sim, 1400, 900, true); ES.setVortexAnchor(sim, 1700, 1100);
    ES.setVortices(sim, [{ x: 900, y: 700, radius: 400, strength: 1.2 }, { x: 2600, y: 1500, radius: 500, strength: -0.8, species: new Set([0, 2, 4, 6]) }]);
    sim.hooks.fears = (f, h) => (f.sp * 7 + h.sp * 3) % 5 === 0; sim.hooks.lowland = 0.15;
    sim.hooks.lurers.push(sim.fish[5], sim.fish[40]); sim.fish[9].steer = { x: 0.6, y: -0.8, keep: false }; sim.fish[12].steer = { x: -1, y: 0, keep: true }; sim.fish[17].hunter = true; sim.fish[22].guest = true;
    for (const f of sim.fish) f.escMul = 8;   // so held prey twist free, and the escape is checked too
  }
  // the diet's rules (ecology-diet.js), which the engine answers from data (eat.rs): one played by hand, who is feared too
  const dt0 = diet ? win.EcologyDiet.create(sim, { species: win.EcologySpecies }) : null;
  let asked = 0;   // how often the page is still asked who is food or feared (the engine answers itself: none)
  if (dt0) { dt0.mine = sim.fish[30]; dt0.fearMine = true; const H = sim.hooks, D = H.dataOf;
    for (const k of ['eats', 'canEat', 'fears']) { const fn = H[k]; H[k] = D[k] = (...a) => { asked++; return fn(...a); }; } }
  if (win.EcoEngine.on) { const w = win.EcoEngine.World.prototype, st = w.steerAll; w.steerAll = function (...a) { calls++; return st.apply(this, a); }; }
  let evs = 0;   // what the engine did itself (eat.rs events: bites, catches, escapes, meals)
  if (win.EcoEngine.on) { const w = win.EcoEngine.World.prototype, ev = w.events; w.events = function () { const E = ev.call(this); evs += E.length / 3; return E; }; }   // steps steered by the engine
  if (withSolids) ES.setSolids(sim, [{ x: 1500, y: 1100, r: 180, zTop: 0.6 }, { x0: 600, y0: 400, x1: 2400, y1: 700, r: 90, zTop: 0.35 }]);
  const t0 = performance.now(); let tMove = 0; const held = [], seen = [], lost = [];
  for (let i = 0; i < steps; i++) { const dt = [1 / 60, 1 / 120, 1 / 48][i % 3]; ES.phase(sim, 'sense', dt); ES.phase(sim, 'steer', dt); const a = performance.now(); ES.phase(sim, 'move', dt); if (dt0) win.EcologyDiet.step(dt0, dt); tMove += performance.now() - a; ES.phase(sim, 'upkeep', dt);
    // what hosts do to the list between steps: the renderer sorts it every frame; the director cuts creatures out; one cut out may be put back
    sim.fish.sort((p, q) => (q.band - p.band) || (p.sp - q.sp) || (q.z - p.z));
    if (i % 97 === 50 && sim.fish.length > 20) { const out = sim.fish.splice(7, 2); held.push(out[0]); }
    if (i % 97 === 80 && held.length) { const f = held.shift(); f.x += 3; if (!f.dead) sim.fish.push(f); }
    if (i % 211 === 100) { const f = sim.fish[3], t = sim.fish[11]; if (f && t) { seen.push(t); } }
  }
  for (const t of seen) lost.push(t.x, t.y, t.z, t.sp, t.chain[4], t.alarm);   // creatures someone kept hold of, some long gone from the list: they still say what they left with
  const out = []; const KEYS = ['x', 'y', 'z', 'vx', 'vy', 'ang', 'sp', 'turnS', 'tuck', 'puff', 'alert', 'cloak', 'glide', 'flap', 'phase', 'fade', 'scale', 'alarm', 'fleeX', 'fleeY', 'dashT', 'spinT', 'ground', 'cool', 'nextDash', 'full', 'gulp', 'pulseT', 'nextSpin', 'settleT', 'wanderA', 'zGoal'];
  for (const f of sim.fish) { for (const k of KEYS) out.push(f[k]); out.push(sim.fish.indexOf(f.target), f.hide || 0, f.zGoalHost ?? -1, f.dashAng ?? -9); out.push(...f.chain, ...f.cz, ...f.croll); }
  out.push(...lost);
  const eaten = sim.tally.reduce((t, x) => t + x.eaten + x.lost + x.escaped, 0), escaped = sim.tally.reduce((t, x) => t + x.escaped, 0);
  return { eaten, escaped, calls, asked, evs, on: win.EcoEngine.on, n: sim.fish.length, out, draw: win.EcoCore.random(), ms: (performance.now() - t0) / steps, move: tMove / steps };
}
let bad = 0;
const only = process.argv[2] ? +process.argv[2] : null;
for (const [seed, solids, steps, extras, diet] of [[1, false, 1500], [7, true, 1500], [4242, true, 1500], [31, false, 9000], [77, true, 3000, true], [55, true, 3000, false, true]].filter(([sd]) => only == null || sd === only)) {
  const a = run('js', seed, steps, solids, false, extras, diet), b = run('rust', seed, steps, solids, true, extras, diet), c = run('js', seed, steps, solids, true, extras, diet), e = run('rust', seed, steps, solids, false, extras, diet);   // e: the engine holding the creatures, steering left to JavaScript   // a: JavaScript weighing every hunter (the reference); b: the engine; c: JavaScript with the cull
  let diff = a.out.length === b.out.length ? 0 : -1; if (!diff) for (let i = 0; i < a.out.length; i++) if (!Object.is(a.out[i], b.out[i])) diff++;
  if (!diff) for (let i = 0; i < a.out.length; i++) if (!Object.is(a.out[i], c.out[i]) || !Object.is(a.out[i], e.out[i])) diff++;
  const ok = diff === 0 && a.draw === b.draw && a.draw === c.draw && a.draw === e.draw && e.calls === 0 && !a.on && b.on && b.calls > 0 && (!diet || (b.asked === 0 && a.asked > 0)); bad += !ok;
  console.log(ok ? 'PASS' : 'FAIL', 'seed', seed, diet ? '(diet, asked js ' + a.asked + ' rust ' + b.asked + ')' : '', 'engine events', b.evs, (solids ? 'with solids' : 'open water') + (extras ? ', a whirling tank, pointer, whirlpools, lures, hands, hunters' : ''), '·', a.n, 'creatures,', steps, 'steps ·', a.out.length, 'numbers ·', diff, 'differ ·', b.eaten, 'eaten, lost or escaped (', b.escaped, 'escaped) · steps steered by the engine', b.calls, a.eaten === b.eaten ? '' : '(js ' + a.eaten + ')');
}
process.exit(bad ? 1 : 0);
