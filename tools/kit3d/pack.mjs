// Kit to 3D: the tank's line art stored as strokes, not as GPU ribbons.
//
//   node tools/kit3d/kit3d.mjs pack            what it would save, species by species, and that every species comes back the same (nothing written)
//   node tools/kit3d/kit3d.mjs pack --write    store them as strokes in shared/engine/ecology/ecology-species.js
//
// A species' lines used to be stored as the ribbons the renderer draws (lineV: every point twice, x, y, a normal and the part, five floats
// each; lineI: six indices a segment), which was 86% of a 15 MB file. Stored as strokes instead (strokes.pts: x, y once a point; strokes.runs:
// part, points, closed for each stroke), the ribbons are built again when a page first reads lineV or lineI (ecology-species.js does it, with
// the same builder as the pipeline's, svg-extract.mjs ribbon). A species is only packed if its ribbons come back the same: the same points,
// the same triangles, normals within 0.001. Species the pipeline adds later arrive as ribbons and work as they are; pack them again.
import { readSpecies, writeSpecies, ribbonsOf, ROOT } from "./tank.mjs"; import path from "node:path"; import { pathToFileURL } from "node:url";

export async function pack(opts = {}) {
  const { toB64 } = await import(pathToFileURL(path.join(ROOT, "world/forges/fish-tool/pipeline/lib/svg-extract.mjs")).href);
  const file = readSpecies(); let before = 0, after = 0, packed = 0; const rows = [], kept = [];
  for (const sp of file.S) {
    if (sp.strokes || !sp.lineV) continue; const r = ribbonsOf(sp); if (!r) { kept.push(sp.key + " (not in ribbon layout)"); continue; }
    const pts = [], runs = []; for (const rb of r.ribbons) { for (const p of rb.pts) pts.push(p[0], p[1]); runs.push(rb.part, rb.pts.length, rb.loop ? 1 : 0); }
    const strokes = { pts: toB64(new Float32Array(pts)), runs: toB64(new Uint32Array(runs)) };
    // the same again, stroke by stroke: every stored point is in a stroke, and each point's two vertices come back where they were, with
    // their normals (the stored ribbon's own, against the same builder run on the stroke)
    const { ribbon } = await import(pathToFileURL(path.join(ROOT, "world/forges/fish-tool/pipeline/lib/svg-extract.mjs")).href), V = r.V;
    let ok = r.ribbons.reduce((n, rb) => n + rb.idx.length * 2, 0) === V.length / 5, worstN = 0, worstP = 0;
    for (const rb of r.ribbons) { const v = [], ix = []; ribbon(rb.pts, rb.loop, rb.part, v, ix);
      rb.idx.forEach((vi, j) => { for (const side of [0, 1]) { const a = (vi + side) * 5, b = (j * 2 + side) * 5; worstP = Math.max(worstP, Math.hypot(V[a] - v[b], V[a + 1] - v[b + 1])); worstN = Math.max(worstN, Math.hypot(V[a + 2] - v[b + 2], V[a + 3] - v[b + 3])); } }); }
    ok = ok && worstP === 0 && worstN <= 1e-3;
    const b0 = sp.lineV.length + sp.lineI.length, b1 = strokes.pts.length + strokes.runs.length;
    rows.push(`${sp.name.padEnd(24)} ${String(r.ribbons.length).padStart(5)} strokes  ${(b0 / 1e3).toFixed(0).padStart(6)} KB -> ${(b1 / 1e3).toFixed(0).padStart(5)} KB  normals within ${worstN.toFixed(4)}${ok ? "" : worstP ? "  POINTS MOVED: left as ribbons" : "  normals differ: left as ribbons"}`);
    if (!ok) { kept.push(sp.key); continue; }
    before += b0; after += b1; packed++;
    if (opts.write) { delete sp.lineV; delete sp.lineI; sp.strokes = strokes; } }
  if (!opts.quiet) { console.log(rows.join("\n")); console.log(`pack: ${packed} species, line art ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB${kept.length ? "; left as ribbons: " + kept.join(", ") : ""}${opts.write ? "" : "  (dry run: add --write)"}`); }
  if (opts.write && packed) writeSpecies(file);
  return { packed, before, after, kept };
}
