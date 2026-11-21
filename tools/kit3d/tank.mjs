// Kit to 3D: the tank's species, for the tools. One place that loads them the way a page does, and one that reads and writes the file.
//
//   tank({ outlines, render })   the browser scripts run in a sandbox: { w, PS (PartSolid), species, R (EcologyRender), gl }
//                                outlines: also load shared/data/core-outlines.js. render: false skips PartSolid and the renderer
//                                (no Delaunator needed). gl is a stand-in: upload calls go nowhere.
//   readSpecies()                the SPECIES array of shared/engine/ecology/ecology-species.js, as data, with how to write it back
//   writeSpecies(file, S)        writes S back in place of that array; everything else in the file is kept
//   ribbonsOf(sp)                a species' lines as ribbons ({ part, pts, loop }), from its strokes or from a stored ribbon mesh
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), SPECIES_FILE = path.join(ROOT, "shared/engine/ecology/ecology-species.js");

export function tank(opts = {}) {
  const render = opts.render !== false, w = {};
  if (render) { const req = createRequire(path.join(ROOT, "tools/check/")); let D; try { D = req("delaunator"); } catch (e) { throw new Error("needs delaunator: cd tools/check && npm install"); } w.Delaunator = D.default || D; }
  const g = { window: w, performance, console, atob: (x) => Buffer.from(x, "base64").toString("binary"), btoa: (x) => Buffer.from(x, "binary").toString("base64") }; vm.createContext(g);
  const files = render ? ["shared/engine/generators/part-solid.js", "shared/engine/ecology/ecology-species.js", ...(opts.outlines ? ["shared/data/core-outlines.js"] : []), "shared/engine/ecology/ecology-render.js"] : ["shared/engine/ecology/ecology-species.js"];
  for (const f of files) if (fs.existsSync(path.join(ROOT, f))) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), g);
  return { w, PS: w.PartSolid, species: w.EcologySpecies.SPECIES, R: w.EcologyRender, gl: new Proxy({}, { get: () => () => ({}) }) };
}

const b64 = (s, T) => { const b = Buffer.from(s, "base64"); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
// a species' stored lines, read back: each ribbon is a run of points (two vertices each) joined p -> p + 2
export function ribbonsOf(sp) {
  if (sp.strokes) {   // stored as strokes already: each run is a ribbon (V and I are then null: there is no stored mesh)
    const P = b64(sp.strokes.pts, Float32Array), R = b64(sp.strokes.runs, Uint32Array), ribbons = [];
    for (let r = 0, o = 0; r < R.length; r += 3) { const n = R[r + 1], pts = []; for (let i = 0; i < n; i++) pts.push([P[(o + i) * 2], P[(o + i) * 2 + 1]]); ribbons.push({ part: R[r], pts, loop: !!R[r + 2], first: o }); o += n; }
    return { V: null, I: null, ribbons };
  }
  if (!sp.lineV || !sp.lineI) return null;
  const V = b64(sp.lineV, Float32Array), I = b64(sp.lineI, Uint16Array), n = V.length / 5, next = new Int32Array(n).fill(-1), into = new Uint8Array(n), segAt = new Map();
  for (let t = 0; t + 5 < I.length; t += 6) { const p = I[t], q = I[t + 2]; if (I[t + 1] !== p + 1 || I[t + 3] !== q || I[t + 4] !== p + 1 || I[t + 5] !== q + 1 || p % 2) return null;   // not the ribbon layout: leave it alone
    next[p] = q; into[q] = 1; segAt.set(p, t); }
  if (I.length % 6) return null;
  const seen = new Uint8Array(n), out = [];
  const walk = (s) => { const idx = [s]; seen[s] = 1; let k = s, loop = false; for (let g = 0; g < 1e6; g++) { const q = next[k]; if (q < 0) break; if (q === s) { loop = true; break; } if (seen[q]) break; seen[q] = 1; idx.push(q); k = q; } return { idx, loop }; };
  for (let v = 0; v < n; v += 2) if (!into[v] && !seen[v]) out.push(walk(v));   // open ribbons start where nothing leads in
  for (let v = 0; v < n; v += 2) if (!seen[v] && next[v] >= 0) out.push(walk(v)); // what is left are loops
  for (const r of out) { r.part = Math.round(V[r.idx[0] * 5 + 4]); r.pts = r.idx.map((i) => [V[i * 5], V[i * 5 + 1]]); r.first = Math.min(...r.idx); }
  out.sort((a, b) => a.first - b.first);   // in stored order
  return { V, I, ribbons: out };
}


export function readSpecies(file = SPECIES_FILE) {
  const lines = fs.readFileSync(file, "utf8").split("\n"), at = lines.findIndex((l) => l.startsWith("const SPECIES = ["));
  if (at < 0) throw new Error("no `const SPECIES = [` line in " + path.relative(ROOT, file));
  return { file, lines, at, S: JSON.parse(lines[at].slice(16).replace(/;\s*$/, "")) };
}
export function writeSpecies(sp) { sp.lines[sp.at] = "const SPECIES = " + JSON.stringify(sp.S) + ";"; fs.writeFileSync(sp.file, sp.lines.join("\n")); }
