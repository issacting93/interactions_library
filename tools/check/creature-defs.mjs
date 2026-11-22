// Every registered creature builds from the kit, outside a browser: its def has rows, parts with outlines, legs with art, and finite numbers.
// With OLD=<path to an older species-rig.js that still holds the builders> it also checks the registry's defs equal the old ones (a refactor guard).
//   node tools/check/creature-defs.mjs
import fs from "fs"; import vm from "vm";
const load = (ctx, f) => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
const world = (files) => { const window = {}; const ctx = vm.createContext({ window, console, Math }); for (const f of files) load(ctx, f); return window; };
const E = "shared/engine/", base = [E + "motion/limb-art.js", E + "mech/part-lib.js"];
const parts = JSON.parse(fs.readFileSync("shared/data/creature-parts.json", "utf8"));
const W = world([...base, E + "motion/species-rig.js", E + "creatures/registry.js", E + "creatures/chain.js", E + "creatures/quad-mech.js", E + "creatures/blender-qilin.js", E + "creatures/mystic-qilin.js", E + "creatures/beasts.js"]);
// a def as plain data: functions (a side part's lift) sampled at a point, so two builds can be compared
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => typeof x === "function" ? "fn:" + (+x(210, 310)).toFixed(6) : typeof x === "number" ? +x.toFixed(9) : x));
let bad = 0; const fail = (m) => { bad++; console.log("FAIL " + m); };
for (const c of W.Creatures.list()) {
  let def; try { def = W.Creatures.build(c.key, parts); } catch (e) { fail(`${c.key}: build threw ${e.message}`); continue; }
  const segs = def && def.segs || [], np = segs.reduce((a, s) => a + s.parts.length, 0), legs = segs.reduce((a, s) => a + s.legs.length, 0);
  if (!segs.length || !np) fail(`${c.key}: no rows or no parts`);
  if (!legs) fail(`${c.key}: no legs`);
  for (const s of segs) { if (!Number.isFinite(s.h)) fail(`${c.key}: a row has no height`); for (const p of s.parts) if (!p.polys || !p.polys.length || !Number.isFinite(p.k)) fail(`${c.key}: part ${p.id} has no outline or scale`); for (const l of s.legs) if (!l.artObj || !Number.isFinite(l.len)) fail(`${c.key}: a leg has no art`); }
  if (!c.brain) fail(`${c.key}: no brain rules`); if (!c.text) fail(`${c.key}: no text`);
  console.log(`ok   ${c.key.padEnd(8)} ${String(segs.length).padStart(2)} rows  ${String(np).padStart(2)} parts  ${legs * 2} legs` + (c.switches.length ? `  switches: ${c.switches.map((s) => s.key).join(", ")}` : ""));
}
if (process.env.OLD) {
  const O = world([...base, process.env.OLD]).SpeciesRig, same = (k, a, b) => { if (JSON.stringify(plain(a)) !== JSON.stringify(plain(b))) fail(`${k}: differs from the old builder`); else console.log(`same ${k}`); };
  const strip = (d) => { const o = { ...d }; delete o.beast; delete o.mystic; return o; };
  same("qilin", strip(O.qilin(parts)), strip(W.Creatures.build("qilin", parts)));
  for (const p of ["jade", "antlered", "celestial"]) same("mqilin " + p, strip(O.mysticQilin(parts, O.MYSTIC[p])), strip(W.Creatures.build("mqilin", parts, W.Creatures.get("mqilin").presets[p])));
  for (const k of Object.keys(O.BEASTS)) same(k, strip(O.beast(parts, k)), strip(W.Creatures.build(k, parts)));
}
console.log(bad ? `creature-defs: ${bad} failed` : "creature-defs: all creatures build"); process.exit(bad ? 1 : 0);
