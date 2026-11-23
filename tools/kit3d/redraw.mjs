// Kit to 3D: give a tank species a new drawing, from an SVG cut out of the creatures sheet (kit-sources/creatures-all.svg) and edited.
//
//   node tools/kit3d/kit3d.mjs redraw <species-key> <file.svg>           what would change (nothing written)
//   node tools/kit3d/kit3d.mjs redraw <species-key> <file.svg> --write   save it into shared/engine/ecology/ecology-species.js
//
// How the file is read:
//   - A group whose data-part names one of the species' parts and whose paths are that part's strokes, point for point, is a part KEPT: its
//     stored strokes and rig row stay exactly as they were. Kept parts are also how the drawing is placed back in the species' own units
//     (the editor moves and scales the page, so each axis is fitted from the kept points: stored = a * drawn + b).
//   - Any part of the species with no group in the file is DROPPED (from the lines and from the fill mesh, if the species has one).
//   - Any path outside a known part (Illustrator puts newly drawn art at the top level) is NEW: it becomes one new part, centred on the
//     spine, that bends with the body (rig group 0), named <key>-NN-body-C. A group with a data-part the species does not have becomes a
//     new part of that name the same way. Curves are flattened into points.
// Every stroke of the new drawing must be closed (a Z), or it cannot be made solid; the command says which are not.
import fs from "node:fs"; import { readSpecies, writeSpecies } from "./tank.mjs";

const b64 = (s, T) => { const b = Buffer.from(s, "base64"); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const toB64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");

// an SVG path's subpaths as point lists (absolute and relative M L H V C S Q Z; curves sampled), each with whether it was closed
export function subpaths(d) {
  const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [], out = []; let i = 0, cmd = "", x = 0, y = 0, cur = null, sx = 0, sy = 0, lc = null;
  const num = () => +tok[i++], add = (px, py) => { cur.pts.push([px, py]); x = px; y = py; };
  const cubic = (x1, y1, x2, y2, ex, ey) => { const x0 = x, y0 = y; for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; add(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey); } lc = [x2, y2]; };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++]; else if (cmd === "M") cmd = "L"; else if (cmd === "m") cmd = "l";
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "Z") { if (cur) { cur.closed = true; x = sx; y = sy; } cur = null; lc = null; continue; }
    if (C === "M") { const px = num() + ox, py = num() + oy; cur = { pts: [], closed: false }; out.push(cur); add(px, py); sx = px; sy = py; lc = null; continue; }
    if (!cur) { cur = { pts: [[x, y]], closed: false }; out.push(cur); }
    if (C === "L") { add(num() + ox, num() + oy); lc = null; }
    else if (C === "H") { add(num() + ox, y); lc = null; }
    else if (C === "V") { add(x, num() + oy); lc = null; }
    else if (C === "C") { const a = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy]; cubic(...a); }
    else if (C === "S") { const r1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y], a = [num() + ox, num() + oy, num() + ox, num() + oy]; cubic(r1[0], r1[1], ...a); }
    else if (C === "Q") { const qx = num() + ox, qy = num() + oy, ex = num() + ox, ey = num() + oy; cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey); }
    else { i++; }   // an arc or anything else: skip its numbers one at a time (none in these sheets)
  }
  for (const s of out) { const p = s.pts; if (p.length > 2 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-6) p.pop(); }   // a loop is stored without its first point again
  return out.filter((s) => s.pts.length >= 2);
}

// the file's paths, each with the data-part of the group it sits in (or null). A small reader for what editors write: no transforms allowed
function readDrawing(svg) {
  if (/transform\s*=/.test(svg)) throw new Error("the file has transforms: expand them first (Illustrator: Object > Expand / save without them)");
  const out = [], stack = []; const re = /<(\/?)(g|path)\b([^>]*?)(\/?)>/g; let m;
  while ((m = re.exec(svg))) { const [, close, tag, attrs, self] = m;
    if (tag === "g") { if (close) stack.pop(); else if (!self) stack.push((attrs.match(/data-part="([^"]*)"/) || [])[1] || null); continue; }
    const d = (attrs.match(/\sd="([^"]*)"/) || [])[1]; if (!d) continue; const part = [...stack].reverse().find((p) => p) || null; out.push({ part, subs: subpaths(d) }); }
  return out;
}

export function redraw(key, file, opts = {}) {
  if (!key || !file) throw new Error("usage: kit3d.mjs redraw <species-key> <file.svg> [--write]");
  const sf = readSpecies(), sp = sf.S.find((s) => s.key === key || s.name === key); if (!sp) throw new Error("no species " + key);
  if (!sp.strokes) throw new Error(sp.key + " is not stored as strokes: run kit3d.mjs pack --write first");
  const P = b64(sp.strokes.pts, Float32Array), R = b64(sp.strokes.runs, Uint32Array), runs = [];
  for (let r = 0, o = 0; r < R.length; r += 3) { const n = R[r + 1], pts = []; for (let k = 0; k < n; k++) pts.push([P[(o + k) * 2], P[(o + k) * 2 + 1]]); runs.push({ part: R[r], pts, closed: !!R[r + 2] }); o += n; }
  const ids = sp.ids || [], byName = new Map(ids.map((n, i) => [n, i])), drawn = readDrawing(fs.readFileSync(file, "utf8"));

  // kept parts: a group named after a part, with that part's strokes point for point
  const groups = new Map(); for (const p of drawn) { const k = p.part && byName.has(p.part) ? p.part : null; if (k) (groups.get(k) || groups.set(k, []).get(k)).push(...p.subs); }
  const kept = new Map(), pairs = [];
  for (const [name, subs] of groups) { const pi = byName.get(name), mine = runs.filter((r) => r.part === pi);
    if (mine.length !== subs.length || mine.some((r, j) => r.pts.length !== subs[j].pts.length)) { console.log(`  ${name}: drawn differently from the stored part (${subs.length} strokes vs ${mine.length}): it is taken as new art`); continue; }
    kept.set(pi, mine); mine.forEach((r, j) => r.pts.forEach((q, k) => pairs.push([subs[j].pts[k], q]))); }
  if (pairs.length < 3) throw new Error("no part of the file matches a stored part point for point, so there is nothing to place the new art by");
  // each axis fitted on its own: stored = a * drawn + b
  const fit = (ax) => { let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [d, s] of pairs) { n++; sx += d[ax]; sy += s[ax]; sxx += d[ax] * d[ax]; sxy += d[ax] * s[ax]; } const a = (n * sxy - sx * sy) / (n * sxx - sx * sx); return [a, (sy - a * sx) / n]; };
  const [ax, bx] = fit(0), [ay, by] = fit(1); let err = 0; for (const [d, s] of pairs) err = Math.max(err, Math.hypot(ax * d[0] + bx - s[0], ay * d[1] + by - s[1]));
  const place = (q) => [ax * q[0] + bx, ay * q[1] + by];

  // the new parts: anything outside a kept part, grouped by its data-part (an unknown name) or else one new body part
  const fresh = new Map(); for (const p of drawn) { if (p.part && kept.has(byName.get(p.part))) continue; const k = p.part && !byName.has(p.part) ? p.part : null;
    const name = k || `${sp.key}-NN-body-C`; (fresh.get(name) || fresh.set(name, []).get(name)).push(...p.subs.map((s) => ({ pts: s.pts.map(place), closed: s.closed }))); }

  // the new species: kept parts in their order, then the new ones, renumbered
  const keptIx = [...kept.keys()].sort((a, b) => a - b), newIds = [], partTex = [], pts = [], runOut = [], dropped = ids.filter((_, i) => !kept.has(i));
  const pad = (i) => String(i).padStart(2, "0");
  keptIx.forEach((pi, ni) => { newIds.push(ids[pi].replace(/-\d\d-/, `-${pad(ni)}-`)); const row = sp.partTex.slice(pi * 16, pi * 16 + 16); if (row[10] >= 0) row[10] = keptIx.indexOf(row[10]); partTex.push(...row);
    for (const r of kept.get(pi)) { for (const q of r.pts) pts.push(q[0], q[1]); runOut.push(ni, r.pts.length, r.closed ? 1 : 0); } });
  const open = [];
  for (const [name, strokes] of fresh) { const ni = newIds.length; newIds.push(name.replace("-NN-", `-${pad(ni)}-`).replace(/-\d\d-/, `-${pad(ni)}-`));
    let y0 = Infinity, y1 = -Infinity; for (const s of strokes) { for (const q of s.pts) { pts.push(q[0], q[1]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); } runOut.push(ni, s.pts.length, s.closed ? 1 : 0); if (!s.closed) open.push(name); }
    const cy = (y0 + y1) / 2; partTex.push(0, 0, 0, cy, y0, y1, 0, 0, 0, 0, -1, cy, 0, 0, 0, 0); }
  // keep a kept part's range inside the new body: nothing to do (its own range is its own extent). Bounds from every point
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity; for (let i = 0; i < pts.length; i += 2) { X0 = Math.min(X0, pts[i]); X1 = Math.max(X1, pts[i]); Y0 = Math.min(Y0, pts[i + 1]); Y1 = Math.max(Y1, pts[i + 1]); }
  const nPts = pts.length / 2;
  console.log(`${sp.name}: placed by ${pairs.length} points of ${kept.size} kept part${kept.size === 1 ? "" : "s"} (x ${ax.toFixed(3)}, y ${ay.toFixed(3)}; worst ${err.toFixed(3)} units)`);
  console.log(`  kept:    ${keptIx.map((i) => ids[i]).join(", ") || "none"}`);
  console.log(`  dropped: ${dropped.join(", ") || "none"}`);
  for (const [name, s] of fresh) console.log(`  new:     ${name} (${s.length} strokes, ${s.reduce((n, q) => n + q.pts.length, 0)} points)`);
  console.log(`  ${sp.parts} parts -> ${newIds.length}; ${runs.length} strokes -> ${runOut.length / 3}; bounds ${sp.bounds.map((v) => Math.round(v)).join(" ")} -> ${[X0, Y0, X1, Y1].map(Math.round).join(" ")}`);
  if (open.length) console.log(`  OPEN strokes (no Z) in: ${[...new Set(open)].join(", ")}: they stay lines, not solid`);
  if (!opts.write) { console.log("  (dry run: add --write)"); return { ok: true }; }
  // the fill mesh (x, y, part per vertex), where a species has one: a dropped part's triangles go, and a kept part takes its new number
  const fill = {};
  if (sp.fillV && sp.fillI) { const FV = b64(sp.fillV, Float32Array), FI = b64(sp.fillI, Uint16Array), to = new Int32Array(FV.length / 3).fill(-1), v = [], ix = [];
    for (let i = 0; i < to.length; i++) { const ni = keptIx.indexOf(Math.round(FV[i * 3 + 2])); if (ni < 0) continue; to[i] = v.length / 3; v.push(FV[i * 3], FV[i * 3 + 1], ni); }
    for (let t = 0; t + 2 < FI.length; t += 3) { const a = to[FI[t]], b = to[FI[t + 1]], c = to[FI[t + 2]]; if (a >= 0 && b >= 0 && c >= 0) ix.push(a, b, c); }
    Object.assign(fill, { fillV: toB64(new Float32Array(v)), fillI: toB64(new Uint16Array(ix)) }); fill.fillVerts = v.length / 3; }
  Object.assign(sp, { parts: newIds.length, ids: newIds, partTex, bounds: [X0, Y0, X1, Y1], strokes: { pts: toB64(new Float32Array(pts)), runs: toB64(new Uint32Array(runOut)) }, counts: Object.assign({}, sp.counts, { lineVerts: nPts * 2 }, "fillVerts" in fill ? { fillVerts: fill.fillVerts } : {}) });
  if (fill.fillV != null) { sp.fillV = fill.fillV; sp.fillI = fill.fillI; }
  writeSpecies(sf); console.log(`  saved. Then: kit3d.mjs creatures (the sheet) and cores (that it makes a solid)`);
  return { ok: true };
}
