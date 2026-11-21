// Kit to 3D: give back the closing side every closed shape lost when the tank's species were built.
//
//   node tools/kit3d/kit3d.mjs close-loops            what it would close, species by species (nothing written)
//   node tools/kit3d/kit3d.mjs close-loops --write    close them in shared/engine/ecology/ecology-species.js
//
// Why they were open: the pipeline's buildLineMesh (world/forges/fish-tool/pipeline/lib/svg-extract.mjs) ran dedupe before asking
// whether a line was a loop. dedupe drops a last point that sits on the first, so the loop it then looked at ended one point short of
// where it began and was stored as an open line: every closed shape in a pipeline-built species lost its last side. A shape drawn
// with many short curve steps still passed (its last step was short enough to count as closed); a shape of a few long straight
// sides (a 32-sided circle, a six-point plate) did not. The kit's own drawings (creature-parts.json, the 1px kit SVGs) were never
// affected: they keep their Z. buildLineMesh is fixed (2026-11-20); this repairs what was stored before.
//
// Which lines are closed here: a stored line of 3 or more points (a triangle lost a side too) whose two ends are no further apart than 4 times its longest side.
// That covers the missing side of every shape found: most are about one side long; the straight back of a crescent or a blade is
// up to about 3.5 times its other steps. Every drawing these species were built from is closed (each path ends in Z), except Zac's
// Drape Vampire, which is left alone (KEEP).
// Each closed line is rebuilt as a loop by the same buildLineMesh; every other line keeps its stored vertices exactly.
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { readSpecies, writeSpecies, ribbonsOf } from "./tank.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), WORLD = path.join(ROOT, "shared/engine/ecology/ecology-species.js");
const RATIO = 4, MIN_PTS = 3;
// built from a finished drawing with open strokes in it on purpose (Zac's Drape Vampire, sheet-drape-vampire-ii: 177 of its 341 paths are open)
const KEEP = new Set(["drape-vampire"]);

export async function closeLoops(opts = {}) {
  const { buildLineMesh, toB64 } = await import(pathToFileURL(path.join(ROOT, "world/forges/fish-tool/pipeline/lib/svg-extract.mjs")).href);
  const file = readSpecies(), S = file.S;
  const report = []; let total = 0, species = 0, skipped = [];
  for (const sp of S) {
    if ((!sp.lineI && !sp.strokes) || KEEP.has(sp.key)) continue; const r = ribbonsOf(sp); if (!r) { skipped.push(sp.key); continue; }
    const closing = new Set(), parts = new Set();
    for (const rb of r.ribbons) { if (rb.loop || rb.pts.length < MIN_PTS) continue; let longest = 0; for (let i = 1; i < rb.pts.length; i++) longest = Math.max(longest, Math.hypot(rb.pts[i][0] - rb.pts[i - 1][0], rb.pts[i][1] - rb.pts[i - 1][1]));
      const a = rb.pts[0], z = rb.pts[rb.pts.length - 1], gap = Math.hypot(a[0] - z[0], a[1] - z[1]); rb.gap = gap / Math.max(1e-9, longest);
      if (gap > 1e-6 && gap <= RATIO * longest) { closing.add(rb); parts.add(rb.part); } }
    if (!closing.size) continue;
    if (sp.strokes) {   // stored as strokes: closing a stroke is setting its flag (the ribbons are built from it when a page loads)
      species++; total += closing.size; report.push(`${sp.name.padEnd(24)} ${String(closing.size).padStart(4)} line${closing.size === 1 ? " " : "s"} closed in ${parts.size} part${parts.size === 1 ? "" : "s"}`);
      if (opts.write) { const R = []; for (const rb of r.ribbons) R.push(rb.part, rb.pts.length, rb.loop || closing.has(rb) ? 1 : 0); sp.strokes.runs = toB64(new Uint32Array(R)); if (sp.counts) sp.counts.lineVerts = r.ribbons.reduce((n, rb) => n + rb.pts.length * 2, 0); }
      continue; }
    // rebuilt: closed ones as loops by buildLineMesh, the rest copied as stored
    const V = [], I = [];
    for (const rb of r.ribbons) { const base = V.length / 5;
      if (closing.has(rb)) { const m = buildLineMesh([[...rb.pts, rb.pts[0]]], rb.part); for (const x of m.verts) V.push(x); for (const ix of m.indices) I.push(ix + base); continue; }
      const map = new Map(); rb.idx.forEach((vi, j) => { map.set(vi, base + 2 * j); for (let c = 0; c < 10; c++) V.push(r.V[vi * 5 + c]); });   // both vertices of the point, as stored
      const segs = rb.loop ? rb.idx.length : rb.idx.length - 1; for (let j = 0; j < segs; j++) { const p = base + 2 * j, q = base + 2 * ((j + 1) % rb.idx.length); I.push(p, p + 1, q, q, p + 1, q + 1); } }
    if (V.length / 5 > 65535) { skipped.push(sp.key + " (too many points)"); continue; }
    species++; total += closing.size;
    report.push(`${sp.name.padEnd(24)} ${String(closing.size).padStart(4)} line${closing.size === 1 ? " " : "s"} closed in ${parts.size} part${parts.size === 1 ? "" : "s"}`);
    if (opts.write) { sp.lineV = toB64(new Float32Array(V)); sp.lineI = toB64(new Uint16Array(I)); if (sp.counts) sp.counts.lineVerts = V.length / 5; } }
  if (!opts.quiet) { console.log(report.join("\n")); console.log(`close-loops: ${total} lines closed in ${species} species${skipped.length ? "; not in ribbon layout, left alone: " + skipped.join(", ") : ""}${opts.write ? "" : "  (dry run: add --write)"}`); }
  if (opts.write && species) { writeSpecies(file); console.log("  wrote " + path.relative(ROOT, WORLD)); }
  return { total, species, report, skipped };
}
