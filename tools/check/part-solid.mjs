// PartSolid over the whole kit (no browser): every shown, unique drawing is read and made solid three ways.
//   cd tools/check && npm install && node part-solid.mjs [P001 P129 ...]
// Fails if a part that has an outline gives a solid with a NaN, no triangles, or a rim that is not the drawing's outline.
// Prints how many parts can be made solid today and which cannot (no closed outline).
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { fileURLToPath } from "node:url";
import Delaunator from "delaunator";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), g = { window: { Delaunator }, performance };
vm.runInNewContext(fs.readFileSync(path.join(root, "packages/parts/part-solid.js"), "utf8"), g); const S = g.window.PartSolid;
const parts = JSON.parse(fs.readFileSync(path.join(root, "packages/kit/data/creature-parts.json"), "utf8")), cat = JSON.parse(fs.readFileSync(path.join(root, "packages/kit/data/creature-catalog.json"), "utf8"));
const rep = {}; for (const [k, v] of Object.entries(cat.drawings)) for (const id of v.parts) rep[id] = k;
const want = process.argv.slice(2), todo = parts.filter((p) => (want.length ? want.includes(p.id) : (rep[p.id] || p.id) === p.id && !cat.parts[p.id].hidden));
let ok = 0, joined = 0, tris = 0, ms = 0; const none = [], bad = [];
for (const p of todo) { const part = S.read(p.svg); if (!part.outer.length) { none.push(p.id + " " + cat.parts[p.id].feature); continue; } if (part.joined) joined++;
  for (const mode of ["plate", "blade", "belly"]) { const t = Date.now(), m = S.build(part, { mode, edge: 0.04 }); ms += Date.now() - t; tris += m.tris;
    let nan = 0; for (const v of m.positions) if (!Number.isFinite(v)) nan++;
    // the rim: the first outline point must be a vertex of the solid, at the rim's height
    const b = part.box, q = part.outer[0].pts[0], x = q[0] - (b.x + b.w / 2), y = -(q[1] - (b.y + b.h / 2)); let rim = false;
    let low = Infinity; for (let i = 2; i < m.positions.length; i += 3) low = Math.min(low, Math.abs(m.positions[i]));   // the rim is the lowest any vertex sits (half the edge's thickness)
    for (let i = 0; i < m.positions.length; i += 3) if (Math.abs(m.positions[i] - x) < 1e-3 * m.size && Math.abs(m.positions[i + 1] - y) < 1e-3 * m.size && Math.abs(Math.abs(m.positions[i + 2]) - low) < 1e-6 * m.size) { rim = true; break; }
    if (nan || !m.tris || !rim || !(m.height > 0)) bad.push(`${p.id} ${mode}: nan ${nan} tris ${m.tris} rim ${rim} height ${m.height}`); }
  ok++; }
console.log(`${todo.length} drawings: ${ok} made solid (${joined} after joining loose strokes), ${none.length} have no closed outline`);
console.log(`mean ${(tris / Math.max(1, ok * 3)).toFixed(0)} triangles and ${(ms / Math.max(1, ok * 3)).toFixed(0)} ms a solid`);
if (none.length) console.log("no outline: " + none.join(", "));
if (bad.length) { console.log("FAILED\n" + bad.join("\n")); process.exit(1); }
console.log("part-solid: all passed");
