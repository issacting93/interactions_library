// Kit to 3D: each species' shape, how its drawing is made solid in the tank (EcologyRender.computeCore reads it as render.core.shape[key]).
//
//   node tools/kit3d/kit3d.mjs shapes          check packages/kit/data/creature-shapes.json and write creature-shapes.js from it
//
// A shape is a set of optional settings; what is left out falls back to the tank's defaults (in brackets):
//
//   mode       how a shape rises from its outline: belly (round), blade (a ridge down the middle), plate (a flat top)   [belly]
//   thick      how deep, as a share of what the method gives   [0.7]
//   inner      closed shapes inside the outline: sunk (below 0) to raised (above 0)   [0.2]
//   crease     how deep the inner lines are pressed in   [0.3]
//   edge       the rim's width   [0.05]
//   wingThick  a wing or fin, as a share of a body's depth   [0.3]
//   cap        the deepest any part stands, as a share of the body's length   [0.07]
//   res        mesh detail, 1 as built   [1]
//   wings      false leaves wings and fins as lines   [solid]
//   parts      { "<part name>": { as, mode, thick, inner, crease, edge, res } }: one part's own. `as` is solid, tube or lines
//
// Shapes are made in Specimen's Shape tab: Copy all there gives this file's text, the ones changed by hand marked by: "zac".
// `name` and `by` are for people reading the json; the .js leaves them out.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { tank } from "./tank.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), DATA = path.join(ROOT, "packages/kit/data/creature-shapes.json"), JS = path.join(ROOT, "packages/kit/data/creature-shapes.js");
const NUM = { thick: [0.05, 3], inner: [-1, 1], crease: [0, 1], edge: [0, 0.5], wingThick: [0.02, 1.5], cap: [0.01, 0.3], res: [0.2, 2] }, MODES = ["belly", "blade", "plate"], AS = ["solid", "tube", "lines"];
export function shapes({ write = true, quiet = false } = {}) {
  const all = JSON.parse(fs.readFileSync(DATA, "utf8")), S = tank().S, out = {}, bad = [];
  const check = (where, o, part) => { const r = {};
    for (const k in o) { const v = o[k];
      if (k === "name" || k === "by") continue;
      if (k === "mode") { if (MODES.includes(v)) r.mode = v; else bad.push(`${where}: mode "${v}"`); }
      else if (k in NUM && !(part && (k === "wingThick" || k === "cap"))) { if (typeof v === "number" && v >= NUM[k][0] && v <= NUM[k][1]) r[k] = v; else bad.push(`${where}: ${k} ${v} is outside ${NUM[k][0]} to ${NUM[k][1]}`); }
      else if (k === "as" && part) { if (AS.includes(v)) r.as = v; else bad.push(`${where}: as "${v}"`); }
      else if (k === "wings" && !part) { if (v === false) r.wings = false; }
      else if (k === "parts" && !part) continue;
      else bad.push(`${where}: no setting called ${k}`); }
    return r; };
  for (const key in all) { const sp = S.find((s) => s.key === key); if (!sp) { bad.push(`${key}: no such species in the tank`); continue; }
    const r = check(key, all[key], false), parts = {};
    for (const n in all[key].parts || {}) { if (!(sp.ids || []).includes(n)) { bad.push(`${key}: no part called ${n}`); continue; } const p = check(key + " " + n, all[key].parts[n], true); if (Object.keys(p).length) parts[n] = p; }
    if (Object.keys(parts).length) r.parts = parts; if (Object.keys(r).length) out[key] = r; }
  if (bad.length) { console.log("shapes: " + bad.length + " to fix\n  " + bad.join("\n  ")); process.exitCode = 1; return { out, bad }; }
  if (write) fs.writeFileSync(JS, "// Each species' shape: how its drawing is made solid in the tank (method, thickness, inner shapes, creases, rim, and single parts' own settings).\n// Written by tools/kit3d/shapes.mjs from creature-shapes.json, which Specimen's Shape tab gives (Copy all). A species not named here is built\n// with the tank's defaults.\nwindow.CreatureShapes = " + JSON.stringify(out) + ";\n");
  const n = Object.keys(out).length, np = Object.values(out).reduce((a, s) => a + Object.keys(s.parts || {}).length, 0);
  if (!quiet) console.log(`shapes: ${n} species with a shape of their own, ${np} parts with settings of their own` + (write ? " → packages/kit/data/creature-shapes.js" : ""));
  return { out, bad };
}
