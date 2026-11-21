// The swimmer simulation (ecology-sim.js) run in Node twice from a seed, with the Rust engine off and on: every number of every creature
// (position, motion, body state, spine) must come out the same, and the random stream must stand at the same draw. The reference run
// also has steering weigh every hunter (EcologySim.CULL = false), so the distance cull is checked against the way it used to be.
//   node games/the-maw/tests/engine-sim.mjs      (part of `npm run test:engine`)
// Timings here are not the browser's: Node runs the scripts in a sandbox that is several times slower.
import fs from 'node:fs'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../..', import.meta.url));
function run(engine, seed, steps, withSolids, cull = true) {
  const win = { ECO_ENGINE: engine, performance, console }; win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  for (const f of ['shared/engine/ecology/eco-core.js', 'shared/engine/ecology/eco-engine.js', 'shared/engine/ecology/ecology-species.js', 'shared/engine/ecology/ecology-sim.js'])
    vm.runInContext(fs.readFileSync(root + '/' + f, 'utf8'), ctx, { filename: f });
  const cfg = { size: 40, speed: 1, beh: 'on', sep: 1, align: 1, coh: 1, flow: 'free', vradius: 0.3, swirl: 1, ptr: 'ignore', dz: 1, wiggle: 1, flex: 1, bank: 1, species: 'mixed', count: 220 };
  win.EcoCore.reseed(seed);
  const ES = win.EcologySim, sim = ES.create(cfg); ES.CULL = cull; ES.resize(sim, 900, 600); ES.setSpecies(sim, 'mixed');
  if (withSolids) ES.setSolids(sim, [{ x: 1500, y: 1100, r: 180, zTop: 0.6 }, { x0: 600, y0: 400, x1: 2400, y1: 700, r: 90, zTop: 0.35 }]);
  const t0 = performance.now(); let tMove = 0;
  for (let i = 0; i < steps; i++) { const dt = [1 / 60, 1 / 120, 1 / 48][i % 3]; ES.phase(sim, 'sense', dt); ES.phase(sim, 'steer', dt); const a = performance.now(); ES.phase(sim, 'move', dt); tMove += performance.now() - a; ES.phase(sim, 'upkeep', dt); }
  const out = []; const KEYS = ['x', 'y', 'z', 'vx', 'vy', 'ang', 'sp', 'turnS', 'tuck', 'puff', 'alert', 'cloak', 'glide', 'flap', 'phase', 'fade', 'scale'];
  for (const f of sim.fish) { for (const k of KEYS) out.push(f[k]); out.push(...f.chain, ...f.cz, ...f.croll); }
  const eaten = sim.tally.reduce((t, x) => t + x.eaten + x.lost + x.escaped, 0);
  return { eaten, on: win.EcoEngine.on, n: sim.fish.length, out, draw: win.EcoCore.random(), ms: (performance.now() - t0) / steps, move: tMove / steps };
}
let bad = 0;
for (const [seed, solids, steps] of [[1, false, 1500], [7, true, 1500], [4242, true, 1500], [31, false, 9000]]) {
  const a = run('js', seed, steps, solids, false), b = run('rust', seed, steps, solids), c = run('js', seed, steps, solids);   // a: JavaScript weighing every hunter (the reference); b: the engine; c: JavaScript with the cull
  let diff = a.out.length === b.out.length ? 0 : -1; if (!diff) for (let i = 0; i < a.out.length; i++) if (!Object.is(a.out[i], b.out[i])) diff++;
  if (!diff) for (let i = 0; i < a.out.length; i++) if (!Object.is(a.out[i], c.out[i])) diff++;
  const ok = diff === 0 && a.draw === b.draw && a.draw === c.draw && !a.on && b.on; bad += !ok;
  console.log(ok ? 'PASS' : 'FAIL', 'seed', seed, solids ? 'with solids' : 'open water', '·', a.n, 'creatures,', steps, 'steps ·', a.out.length, 'numbers ·', diff, 'differ ·', b.eaten, 'eaten, lost or escaped', a.eaten === b.eaten ? '' : '(js ' + a.eaten + ')');
}
process.exit(bad ? 1 : 0);
