// The game's data, checked: every name a stage, a rule or a species uses has to mean something. The page skips what it does not know
// (a roster key that is not a species is silently left out), so a typo would change the game without a word. Run: node tests/data-check.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const win = { ECO_ENGINE: 'js', performance, console, localStorage: { getItem: () => null, setItem() {} } }; win.window = win; const ctx = vm.createContext(win);
const PKG = { 'eco-core': 'core', 'ecology-species': 'kit', 'ecology-sim': 'ecology', 'ecology-diet': 'ecology', 'ecology-walkers': 'ecology', 'maw-stages': 'maw', 'ecology-maw': 'maw' };
for (const f of ['eco-core', 'ecology-species', 'ecology-sim', 'ecology-diet', 'ecology-walkers', 'maw-stages', 'ecology-maw']) vm.runInContext(fs.readFileSync(root + `packages/${PKG[f]}/${f}.js`, 'utf8'), ctx, { filename: f + '.js' });
const bad = []; const no = (what) => bad.push(what);
const sim = win.EcologySim.create({ size: 40, speed: 1, beh: 'on', species: 'mixed', count: 10 }), SP = sim.speciesRT, KEYS = new Set(SP.map((s) => s.key));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// species: each has a name, a swim and a behaviour with numbers where numbers go
for (const s of SP) {
  if (!s.name) no(`species ${s.key}: no name`);
  for (const k of ['len', 'speed']) if (!finite(s.swim && s.swim[k]) || s.swim[k] <= 0) no(`species ${s.key}: swim.${k} is ${s.swim && s.swim[k]}`);
  const b = s.beh || {}; for (const k of ['rest', 'school']) if (b[k] != null && !finite(b[k])) no(`species ${s.key}: beh.${k} is ${b[k]}`);
}
// the Maw's prey rules (RULES.prey): every way of escaping a species has is given a way of taking the Maw, and every plated name is a species
const P = win.EcologyMaw.RULES.prey, WAYS = new Set(['calm', 'wary', 'skittish', 'dodge', 'school', 'tough']);
for (const s of SP) { const f = (s.beh && s.beh.flee) || 'none'; if (!(f in P.ways)) no(`RULES.prey.ways has nothing for flee "${f}" (species ${s.key})`); if (s.mawWay && !WAYS.has(s.mawWay)) no(`species ${s.key}: mawWay "${s.mawWay}" is not a way`); }
for (const [f, w] of Object.entries(P.ways)) if (!WAYS.has(w)) no(`RULES.prey.ways.${f} is "${w}", not a way`);
for (const k of P.plated) if (!KEYS.has(k)) no(`RULES.prey.plated names "${k}", not a species`);
for (const k of ['near', 'far', 'dodge', 'confuse', 'confuseMax', 'tough']) if (!finite(P[k]) || P[k] < 0) no(`RULES.prey.${k} is ${P[k]}`);
if (!(P.near < P.far)) no(`RULES.prey: near ${P.near} is not under far ${P.far}`);
// the stages: rosters name species, crews name walkers, numbers are numbers, goals and pressure make sense
const CREW = new Set(win.EcologyWalkers.CAST.map((c) => c[0])), ids = new Set();
for (const st of win.MawStages.LIST) {
  const at = `stage ${st.id}`; if (ids.has(st.id)) no(`${at}: id used twice`); ids.add(st.id);
  for (const k of ['name', 'brief']) if (!st[k]) no(`${at}: no ${k}`);
  for (const [k, n] of Object.entries(st.roster || {})) { if (!KEYS.has(k)) no(`${at}: roster names "${k}", not a species (it would be left out)`); if (!finite(n) || n < 0) no(`${at}: roster ${k} is ${n}`); }
  for (const [k, n] of Object.entries(st.crew || {})) { if (!CREW.has(k)) no(`${at}: crew names "${k}", not a walker`); if (!finite(n) || n < 0) no(`${at}: crew ${k} is ${n}`); }
  for (const [k, v] of Object.entries(st.press || {})) if (!finite(v) || v < 0) no(`${at}: press.${k} is ${v}`);
  if (st.press && st.press.upkeep != null && st.press.upkeep < 1) no(`${at}: press.upkeep ${st.press.upkeep} would slow hunger below normal`);
  if (!st.goal || !Object.keys(st.goal).length) no(`${at}: no goal`);
  for (const [k, v] of Object.entries(st.env || {})) if (k === 'dark' && (!finite(v) || v < 0 || v > 1)) no(`${at}: env.dark is ${v}`);
}
if (bad.length) { console.log(`FAIL ${bad.length} problem(s) in the game's data:\n  ` + bad.join('\n  ')); process.exit(1); }
console.log(`PASS the game's data: ${SP.length} species, ${win.MawStages.LIST.length} stages, the Maw's prey rules`);
