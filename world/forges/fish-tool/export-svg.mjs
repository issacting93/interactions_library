#!/usr/bin/env node
// Every species of the tank as a clean SVG line drawing, 1 px wide.
//   node world/forges/fish-tool/export-svg.mjs [out-dir]        (default: world/forges/fish-tool/exports/creatures-svg)
// The tank holds each species as ribbons for the GPU (lineV: a centre point twice, with a normal either side, and the part it belongs
// to). This reads the centre lines back, joins the pieces that touch into whole paths, drops doubles and specks, simplifies the points
// (within a third of a pixel), and writes one file a species, the longest side 1024 px, grouped by part. Plus sheet.svg with all of them.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { strokesToMesh } from "./pipeline/lib/svg-extract.mjs"; 
const here = path.dirname(fileURLToPath(import.meta.url)), out = path.resolve(process.argv[2] || path.join(here, "exports/creatures-svg"));
const f1 = (v) => (Math.round(v * 10) / 10).toString();
// The Glass Manta's tail (the Lattice Eel wears the same one) is kept in the tank as hundreds of small cells: the drawing program's outside
// stroke, cut into pieces. The shapes that stroke was drawn round are still in the species' own source file, so a part made of cells is
// written from those shapes instead, fitted to where the part sits.
const TAIL = (() => { try { const s = fs.readFileSync(path.join(here, "sigil-species-rig-svgs/Glass Manta.svg"), "utf8"), side = (a, b, cells) => {
      const ds = []; for (let i = a; i <= b; i++) { const m = s.match(new RegExp('<path d="([^"]+)" id="stroke' + i + '_172_857"')) || s.match(new RegExp('id="stroke' + i + '_172_857"[^>]* d="([^"]+)"')); if (m) ds.push(m[1]); }
      const c = s.match(new RegExp('<path d="([^"]+)" fill="#61E5BF" mask="url\\(#stroke' + cells + '_172_857\\)"')); return ds.length && c ? { ds, box: boxOf(c[1]) } : null; };
    return { R: side(0, 7, 8), L: side(9, 16, 17) }; } catch (e) { return {}; } })();
function tokens(d) { const out = []; for (const m of d.matchAll(/([MLHVCZ])([^MLHVCZ]*)/gi)) out.push([m[1], (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number)]); return out; }
function boxOf(d) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, x = 0, y = 0; for (const [c, n] of tokens(d)) { if (c === "H") { for (const v of n) { x = v; x0 = Math.min(x0, x); x1 = Math.max(x1, x); } continue; } if (c === "V") { for (const v of n) { y = v; y0 = Math.min(y0, y); y1 = Math.max(y1, y); } continue; }
    for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } } return [x0, y0, x1, y1]; }
function place(d, fx, fy) { let x = 0, y = 0, out = ""; for (const [c, n] of tokens(d)) { if (c === "Z" || c === "z") { out += "Z"; continue; }
    if (c === "H") { for (const v of n) { x = v; out += "L" + f1(fx(x)) + " " + f1(fy(y)); } continue; } if (c === "V") { for (const v of n) { y = v; out += "L" + f1(fx(x)) + " " + f1(fy(y)); } continue; }
    const per = c === "C" ? 6 : 2; for (let i = 0; i + per <= n.length; i += per) { const q = []; for (let k = 0; k < per; k += 2) q.push(f1(fx(n[i + k])) + " " + f1(fy(n[i + k + 1]))); x = n[i + per - 2]; y = n[i + per - 1]; out += (c === "M" && i > 0 ? "L" : c) + q.join(" "); } } return out; }
const src = fs.readFileSync(path.resolve(here, "../../../packages/kit/ecology-species.js"), "utf8").split("\n"), li = src.findIndex((l) => l.startsWith("const SPECIES = ["));
const SPECIES = JSON.parse(src[li].slice(16).replace(/;\s*$/, ""));
const b64 = (s, T) => { const b = Buffer.from(s, "base64"); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const SIZE = 1024, PAD = 16, TOL = 0.3, SPECK = 1.5, SNAP = 0.35, fitted = [], odd = [];   // px at the written size

function rdp(P, tol, closed) {
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let m = -1, md = tol; const ax = P[a][0], ay = P[a][1], dx = P[b][0] - ax, dy = P[b][1] - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = L > 1e-9 && (dx || dy) ? Math.abs((P[i][0] - ax) * dy - (P[i][1] - ay) * dx) / L : Math.hypot(P[i][0] - ax, P[i][1] - ay); if (d > md) { md = d; m = i; } }
    if (m > 0) { keep[m] = 1; st.push([a, m], [m, b]); } }
  return P.filter((_, i) => keep[i]);
}
function paths(sp) {
  let V, I; if (sp.strokes) ({ lineV: V, lineI: I } = strokesToMesh(sp.strokes)); else { V = b64(sp.lineV, Float32Array); I = b64(sp.lineI, Uint16Array); }   // stored as strokes: the ribbons built from them
  let n = V.length / 5;
  if (!n) {   // a species kept as filled shapes only: its outline is every edge of the fill that one triangle alone owns (as the tank draws it)
    const F = b64(sp.fillV, Float32Array), FI = b64(sp.fillI, Uint16Array), m = F.length / 3; if (!m) return null;
    const cnt = new Map(), ek = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
    for (let t = 0; t < FI.length; t += 3) for (const [a, b] of [[FI[t], FI[t + 1]], [FI[t + 1], FI[t + 2]], [FI[t + 2], FI[t]]]) cnt.set(ek(a, b), (cnt.get(ek(a, b)) || 0) + 1);
    V = new Float32Array(m * 5); for (let i = 0; i < m; i++) { V[i * 5] = F[i * 3]; V[i * 5 + 1] = F[i * 3 + 1]; V[i * 5 + 4] = F[i * 3 + 2]; }
    const E = []; for (const [k, c] of cnt) if (c === 1) { const a = Math.floor(k / 65536), b = k % 65536; E.push(a, b, b); } I = new Uint32Array(E); n = m; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < n; i++) { const x = V[i * 5], y = V[i * 5 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const k = (SIZE - 2 * PAD) / Math.max(x1 - x0, y1 - y0), W = (x1 - x0) * k + 2 * PAD, H = (y1 - y0) * k + 2 * PAD;
  const byPart = new Map();   // part -> { nodes: Map(key -> id), pts: [], adj: [] }
  const node = (g, v) => { const x = (V[v * 5] - x0) * k + PAD, y = (V[v * 5 + 1] - y0) * k + PAD, key = Math.round(x / SNAP) + "," + Math.round(y / SNAP); let id = g.nodes.get(key);
    if (id == null) { id = g.pts.length; g.nodes.set(key, id); g.pts.push([x, y]); g.adj.push(new Set()); } return id; };
  for (let t = 0; t < I.length; t += 3) { const part = V[I[t] * 5 + 4]; let g = byPart.get(part); if (!g) byPart.set(part, g = { nodes: new Map(), pts: [], adj: [] });
    const ids = [...new Set([node(g, I[t]), node(g, I[t + 1]), node(g, I[t + 2])])]; if (ids.length === 2) { g.adj[ids[0]].add(ids[1]); g.adj[ids[1]].add(ids[0]); } }
  const groups = []; let nPaths = 0, nPts = 0, raw = 0;
  for (const [part, g] of [...byPart].sort((a, b) => a[0] - b[0])) {
    const used = new Set(), ek = (a, b) => (a < b ? a + "_" + b : b + "_" + a), P = [];
    const walk = (a, b) => { const line = [a, b]; used.add(ek(a, b)); let prev = a, cur = b;
      while (g.adj[cur].size === 2) { const nx = [...g.adj[cur]].find((q) => q !== prev && !used.has(ek(cur, q))); if (nx == null) break; used.add(ek(cur, nx)); line.push(nx); prev = cur; cur = nx; }
      return line; };
    for (let a = 0; a < g.pts.length; a++) if (g.adj[a].size !== 2) for (const b of g.adj[a]) if (!used.has(ek(a, b))) P.push(walk(a, b));   // from every end and fork
    for (let a = 0; a < g.pts.length; a++) for (const b of g.adj[a]) if (!used.has(ek(a, b))) P.push(walk(a, b));                          // what is left is rings
    const ds = [];
    if (P.length > 100 && (TAIL.L || TAIL.R)) {   // a part made of cells: the source shapes, fitted to the part's box
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9; for (const p of g.pts) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); }
      const T = (bx0 + bx1) / 2 > W / 2 ? TAIL.R || TAIL.L : TAIL.L || TAIL.R, B = T.box, sx = (bx1 - bx0) / (B[2] - B[0]), sy = (by1 - by0) / (B[3] - B[1]);
      if (Math.abs(sx / sy - 1) < 0.08) { for (const d of T.ds) { ds.push(place(d, (x) => bx0 + (x - B[0]) * sx, (y) => by0 + (y - B[1]) * sy)); nPaths++; }
        groups.push({ id: (sp.ids && sp.ids[part]) || sp.key + "-" + part, d: ds }); fitted.push(sp.key + " " + ((sp.ids && sp.ids[part]) || part)); continue; }
      odd.push(sp.key + " " + ((sp.ids && sp.ids[part]) || part) + " (" + P.length + " pieces, left as they are)"); }
    for (const line of P) { let pts = line.map((i) => g.pts[i]); raw += pts.length; const closed = line.length > 3 && line[0] === line[line.length - 1];
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (len < SPECK) continue;
      if (closed) { pts = pts.slice(0, -1); let far = 0, fd = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
        const A = rdp(pts.slice(0, far + 1), TOL), B = rdp(pts.slice(far).concat([pts[0]]), TOL); pts = A.concat(B.slice(1, -1)); } else pts = rdp(pts, TOL);
      if (pts.length < 2) continue; nPaths++; nPts += pts.length;
      ds.push("M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L") + (closed ? "Z" : "")); }
    if (ds.length) groups.push({ id: (sp.ids && sp.ids[part]) || sp.key + "-" + part, d: ds });
  }
  return { W, H, groups, nPaths, nPts, raw };
}
const STYLE = 'fill="none" stroke="#000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
const body = (R) => R.groups.map((g) => `  <g id="${g.id}">${g.d.map((d) => `<path vector-effect="non-scaling-stroke" d="${d}"/>`).join("")}</g>`).join("\n");
fs.mkdirSync(out, { recursive: true }); const done = [];
for (const sp of SPECIES) { const R = paths(sp); if (!R) { console.log(sp.key, "no line drawing, skipped"); continue; }
  fs.writeFileSync(path.join(out, sp.key + ".svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f1(R.W)} ${f1(R.H)}" width="${f1(R.W)}" height="${f1(R.H)}">\n<title>${sp.name}</title>\n<g ${STYLE}>\n${body(R)}\n</g>\n</svg>\n`);
  done.push({ sp, R }); console.log(sp.key.padEnd(34), String(R.groups.length).padStart(3), "parts", String(R.nPaths).padStart(5), "paths", String(R.raw).padStart(6), "->", String(R.nPts).padStart(6), "points"); }
// the sheet: every species in a grid, each in a 320 px cell with its name; lines stay 1 px
const C = 320, COLS = 7, rows = Math.ceil(done.length / COLS), LAB = 22;
const cells = done.map(({ sp, R }, i) => { const s = (C - 24) / Math.max(R.W, R.H), x = (i % COLS) * C + (C - R.W * s) / 2, y = Math.floor(i / COLS) * (C + LAB) + (C - R.H * s) / 2;
  return `<g id="${sp.key}" transform="translate(${f1(x)} ${f1(y)}) scale(${s.toFixed(4)})">\n${body(R)}\n</g>\n<text x="${(i % COLS) * C + C / 2}" y="${Math.floor(i / COLS) * (C + LAB) + C + 12}" text-anchor="middle" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="10" fill="#000" stroke="none">${sp.name}</text>`; });
fs.writeFileSync(path.join(out, "sheet.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLS * C} ${rows * (C + LAB)}" width="${COLS * C}" height="${rows * (C + LAB)}">\n<rect width="100%" height="100%" fill="#fff"/>\n<g ${STYLE}>\n${cells.join("\n")}\n</g>\n</svg>\n`);
console.log(done.length, "species written to", out);
if (fitted.length) console.log("written from the source shapes:", fitted.join(", "));
if (odd.length) console.log("NOT CLEAN:", odd.join("; "));
