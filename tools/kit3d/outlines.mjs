// Kit to 3D: the tank's open outlines. A part of a species can only be made solid (a core, ecology-render's render.cores) if its drawing
// has a closed outline. This finds every part that has none, closes the ones it can close with confidence, and puts them all on one sheet.
//
//   node tools/kit3d/kit3d.mjs outlines                          find them, close what can be closed, write the sheet and shared/data/core-outlines.js
//   node tools/kit3d/kit3d.mjs import-outlines closed.svg        read a sheet closed by hand back (dry run)
//   node tools/kit3d/kit3d.mjs import-outlines closed.svg --write
//
// Nothing here touches the species' line art (shared/engine/ecology/ecology-species.js). A closed outline is kept beside it, in
// shared/data/core-outlines.json (who closed it and how) and core-outlines.js (what the page loads: window.CoreOutlines[species][part]).
//
// How a part is closed here, and when that counts as confident (green on the sheet; applied at once):
//   joined    a few strokes whose ends are bridged, nearest ends first. Confident when the bridges are at most 30% of the outline's length
//             and the shape they close fills at least 15% of the part's box (so a long arc is not shut into a sliver).
//   wrapped   a drawing of many strokes (5 or more) is shrink-wrapped: its strokes are drawn thick on a grid, the outside is flooded,
//             and the edge of what is left is the outline. The silhouette of dense line work is not in doubt.
// Everything else stays open (red on the sheet) for a person to close.
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// kit3d.mjs hands its helpers in (use), since it is the one that loads this file: redraw (path data through a transform), readSheet, apply, esc
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."); let redraw, readSheet, apply, esc;
export function use(lib) { ({ redraw, readSheet, apply, esc } = lib); }

const DATA = path.join(ROOT, "shared/data/core-outlines.json"), JS = path.join(ROOT, "shared/data/core-outlines.js");
const SHEET = path.join(ROOT, "shared/data/kit-sources/outlines-to-close.svg"), SHEET_JSON = path.join(ROOT, "shared/data/kit-sources/outlines-to-close.json");
const r1 = (v) => Math.round(v * 10) / 10;
const area = (f) => { let a = 0; for (let i = 0, n = f.length / 2, j = n - 1; i < n; j = i++) a += (f[j * 2] + f[i * 2]) * (f[j * 2 + 1] - f[i * 2 + 1]); return a / 2; };
const lenOf = (f) => { let L = 0; for (let i = 2; i < f.length; i += 2) L += Math.hypot(f[i] - f[i - 2], f[i + 1] - f[i - 1]); return L; };
const boxOf = (polys) => { let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18; for (const f of polys) for (let i = 0; i < f.length; i += 2) { if (f[i] < x0) x0 = f[i]; if (f[i] > x1) x1 = f[i]; if (f[i + 1] < y0) y0 = f[i + 1]; if (f[i + 1] > y1) y1 = f[i + 1]; } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; };
const dOf = (f, close) => { let d = "M" + r1(f[0]) + " " + r1(f[1]) + " L"; for (let i = 2; i < f.length; i += 2) d += (i > 2 ? " " : "") + r1(f[i]) + " " + r1(f[i + 1]); return d + (close ? " Z" : ""); };

function tank(withFixes) {
  const req = createRequire(path.join(ROOT, "tools/check/")); let D; try { D = req("delaunator"); } catch (e) { throw new Error("needs delaunator: cd tools/check && npm install"); }
  const w = { Delaunator: D.default || D }, g = { window: w, performance, console, atob: (x) => Buffer.from(x, "base64").toString("binary") }; vm.createContext(g);
  for (const f of ["shared/engine/generators/part-solid.js", "shared/engine/ecology/ecology-species.js", ...(withFixes ? ["shared/data/core-outlines.js"] : []), "shared/engine/ecology/ecology-render.js"]) if (fs.existsSync(path.join(ROOT, f))) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), g);
  return { S: w.PartSolid, species: w.EcologySpecies.SPECIES, R: w.EcologyRender, gl: new Proxy({}, { get: () => () => ({}) }) };
}

/* ---------- closing ---------- */
// a few strokes: bridge nearest ends until they close
function joined(S, polys, size) {
  const before = polys.reduce((n, f) => n + lenOf(f), 0), list = polys.map((f) => { const pts = []; for (let i = 0; i < f.length; i += 2) pts.push([f[i], f[i + 1]]); return { pts, closed: false }; });
  const r = S.join(list, 0.6 * size), closed = r.polys.filter((p) => p.closed && p.pts.length > 2); if (!closed.length) return null;
  const big = closed.map((p) => { const f = []; for (const q of p.pts) f.push(q[0], q[1]); f.push(p.pts[0][0], p.pts[0][1]); return f; }).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  const per = lenOf(big), b = boxOf([big]), bridged = Math.max(0, per - before) / per, fill = Math.abs(area(big)) / Math.max(1e-9, b.w * b.h), left = r.polys.filter((p) => !p.closed).length;
  return { outline: big.map(r1), bridged, fill, confident: bridged <= 0.3 && fill >= 0.15 && left === 0, how: `joined: ${r.joined} bridge${r.joined === 1 ? "" : "s"}, ${Math.round(bridged * 100)}% of the outline` };
}
// many strokes: the edge of the drawing, shrink-wrapped
function wrapped(polys) {
  const b = boxOf(polys), size = Math.max(b.w, b.h), N = 180, cs = size / N, pad = 8, W = Math.ceil(b.w / cs) + 2 * pad, H = Math.ceil(b.h / cs) + 2 * pad, x0 = b.x0 - pad * cs, y0 = b.y0 - pad * cs, rad = 4, m = new Uint8Array(W * H);
  const stamp = (x, y) => { const cx = Math.round((x - x0) / cs), cy = Math.round((y - y0) / cs); for (let v = -rad; v <= rad; v++) for (let u = -rad; u <= rad; u++) if (u * u + v * v <= rad * rad) { const X = cx + u, Y = cy + v; if (X >= 0 && Y >= 0 && X < W && Y < H) m[Y * W + X] = 1; } };
  for (const f of polys) for (let i = 2; i < f.length; i += 2) { const ax = f[i - 2], ay = f[i - 1], bx = f[i], by = f[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cs * 0.7))); for (let q = 0; q <= n; q++) stamp(ax + (bx - ax) * q / n, ay + (by - ay) * q / n); }
  // the outside: everything the border reaches without crossing a stroke
  const out = new Uint8Array(W * H), st = [0]; out[0] = 1;
  while (st.length) { const c = st.pop(), x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const k = Y * W + X; if (!out[k] && !m[k]) { out[k] = 1; st.push(k); } } }
  // the inside, drawn back in by the thickness the strokes were given, so the outline sits on the drawing's own edge
  const er = rad - 1, ins = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (out[y * W + x]) continue; let ok = true; for (let v = -er; v <= er && ok; v++) for (let u = -er; u <= er; u++) { if (u * u + v * v > er * er) continue; const X = x + u, Y = y + v; if (X < 0 || Y < 0 || X >= W || Y >= H || out[Y * W + X]) { ok = false; break; } } ins[y * W + x] = ok ? 1 : 0; }
  // its edge: the cell sides between inside and outside, chained into loops; the longest is the outline
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? ins[y * W + x] : 0), nx = new Map(), key = (x, y) => x + "," + y, add = (a, b) => { (nx.get(a) || nx.set(a, []).get(a)).push(b); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!ins[y * W + x]) continue;
    if (!at(x, y - 1)) add(key(x, y), key(x + 1, y)); if (!at(x + 1, y)) add(key(x + 1, y), key(x + 1, y + 1)); if (!at(x, y + 1)) add(key(x + 1, y + 1), key(x, y + 1)); if (!at(x - 1, y)) add(key(x, y + 1), key(x, y)); }
  let best = null; const used = new Set();
  for (const start of nx.keys()) { if (used.has(start)) continue; const loop = []; let k = start;
    for (let guard = 0; guard < 200000; guard++) { used.add(k); loop.push(k); const nn = nx.get(k); if (!nn || !nn.length) break; const to = nn.find((q) => !used.has(q)) ?? nn[0]; if (to === start) break; if (used.has(to)) break; k = to; }
    if (!best || loop.length > best.length) best = loop; }
  if (!best || best.length < 12) return null;
  // off the staircase: every other corner, then two rounds of corner cutting
  let pts = best.filter((_, i) => i % 2 === 0).map((k) => { const [x, y] = k.split(",").map(Number); return [x0 + (x - 0.5) * cs, y0 + (y - 0.5) * cs]; });
  for (let pass = 0; pass < 2; pass++) { const q = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; q.push([a[0] * 0.75 + c[0] * 0.25, a[1] * 0.75 + c[1] * 0.25], [a[0] * 0.25 + c[0] * 0.75, a[1] * 0.25 + c[1] * 0.75]); } pts = q.filter((_, i) => i % 2 === 0); }
  const f = []; for (const q of pts) f.push(r1(q[0]), r1(q[1])); f.push(f[0], f[1]);
  return { outline: f, confident: true, how: `wrapped round ${polys.length} strokes` };
}

/* ---------- find, close, write ---------- */
export function outlines(opts = {}) {
  const { S, species, R, gl } = tank(false), kept = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : {}, data = {}, rows = [];
  let empty = 0;
  for (const sp of species) { const c = R.buildCore(gl, sp, {}), strokes = R.strokesOf(sp); empty += c.tally.open - c.tally.openParts.length;
    for (const pi of c.tally.openParts) { const polys = strokes.get(pi) || []; if (!polys.length) continue; const b = boxOf(polys), size = Math.max(b.w, b.h);
      const mine = (kept[sp.key] || {})[pi], byHand = mine && mine.by === "zac" ? mine : null;
      const fix = byHand ? { outline: byHand.outline, confident: true, how: byHand.how } : polys.length >= 5 ? wrapped(polys) : joined(S, polys, size);
      const ok = !!(fix && fix.confident);
      if (ok) (data[sp.key] || (data[sp.key] = {}))[pi] = { outline: fix.outline, by: byHand ? "zac" : "claude", how: fix.how };
      rows.push({ id: `o-${sp.key}-${pi}`, key: sp.key, species: sp.name, part: pi, name: (sp.ids && sp.ids[pi]) || String(pi), polys, box: b, fix, ok, by: byHand ? "zac" : ok ? "claude" : null }); } }
  // an outline closed by hand for a part that no longer shows up open is kept as it is
  for (const k of Object.keys(kept)) for (const pi of Object.keys(kept[k])) if (kept[k][pi].by === "zac" && !(data[k] && data[k][pi])) (data[k] || (data[k] = {}))[pi] = kept[k][pi];
  const sheet = draw(rows), done = rows.filter((r) => r.ok).length;
  if (opts.write !== false) { save(data); fs.mkdirSync(path.dirname(SHEET), { recursive: true }); fs.writeFileSync(SHEET, sheet.svg);
    fs.writeFileSync(SHEET_JSON, JSON.stringify({ about: "The layout of outlines-to-close.svg, so a closed copy can be read back (kit3d.mjs import-outlines).", made: new Date().toISOString().slice(0, 10), parts: sheet.rows }, null, 1) + "\n"); }
  if (!opts.quiet) {
    console.log(`open outlines in the tank's species: ${rows.length} parts with strokes and no closed outline (${empty} more have nothing drawn at all)`);
    console.log(`  closed here and applied: ${done}   (${rows.filter((r) => r.ok && r.fix.how.startsWith("wrapped")).length} wrapped, ${rows.filter((r) => r.ok && r.fix.how.startsWith("joined")).length} joined, ${rows.filter((r) => r.by === "zac").length} by hand)`);
    console.log(`  left for a person: ${rows.length - done}`);
    const bySp = {}; for (const r of rows) { const q = bySp[r.species] || (bySp[r.species] = [0, 0]); q[r.ok ? 0 : 1]++; }
    for (const [name, [a, b]] of Object.entries(bySp)) console.log(`    ${name.padEnd(24)} closed ${String(a).padStart(2)}   left ${String(b).padStart(2)}`);
    if (opts.write !== false) console.log(`  wrote ${path.relative(ROOT, SHEET)}, ${path.relative(ROOT, JS)}`);
  }
  return { rows, done, left: rows.length - done, empty };
}
function save(data) {
  fs.writeFileSync(DATA, JSON.stringify(data, null, 1) + "\n");
  const flat = {}; for (const k of Object.keys(data)) { flat[k] = {}; for (const pi of Object.keys(data[k])) flat[k][pi] = [data[k][pi].outline]; }
  fs.writeFileSync(JS, "// Closed outlines for parts whose drawing leaves the outline open, so the tank can make them solid (ecology-render's render.cores).\n// Written by tools/kit3d/outlines.mjs from core-outlines.json (which says who closed each and how). Not line art: nothing here is drawn.\nwindow.CoreOutlines = " + JSON.stringify(flat) + ";\n");
}

/* ---------- the sheet ---------- */
function draw(rows) {
  const COLS = 8, CW = 300, CH = 330, PADX = 40, TOP = 150, FIT = 220, n = rows.length, W = PADX * 2 + COLS * CW, H = TOP + Math.max(1, Math.ceil(n / COLS)) * CH + 40;
  let parts = "", marks = "", labels = ""; const out = [];
  rows.forEach((r, k) => {
    const b = r.box, cx = PADX + (k % COLS) * CW + CW / 2, cy = TOP + Math.floor(k / COLS) * CH + 54 + FIT / 2, s = +(FIT / Math.max(b.w, b.h, 1e-6)).toFixed(5), mx = +((b.x0 + b.x1) / 2).toFixed(2), my = +((b.y0 + b.y1) / 2).toFixed(2);
    const tf = `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${s}) translate(${-mx} ${-my})`, busy = r.polys.length >= 5, col = r.ok ? "#8C8981" : "#FF4D5E";
    let g = `  <g id="${r.id}" data-species="${esc(r.key)}" data-part="${r.part}" transform="${tf}">\n`;
    g += r.polys.map((f) => `    <path data-role="stroke" d="${dOf(f, false)}" fill="none" stroke="${col}" stroke-width="${busy ? 0.6 : r.ok ? 1 : 1.6}" stroke-opacity="${busy ? 0.55 : 1}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join("\n") + "\n";
    if (r.fix && r.ok) g += `    <path data-role="outline" d="${dOf(r.fix.outline.slice(0, -2), true)}" fill="#5BE39A" fill-opacity="0.08" stroke="#5BE39A" stroke-width="1.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>\n`;
    parts += g + "  </g>\n";
    if (!r.ok) { const rad = 3.2 / s; let m = `  <g id="marks-${r.id}" transform="${tf}">\n`; for (const f of r.polys) for (const [x, y] of [[f[0], f[1]], [f[f.length - 2], f[f.length - 1]]]) m += `    <circle cx="${r1(x)}" cy="${r1(y)}" r="${rad.toFixed(3)}" fill="none" stroke="#E8B04A" stroke-width="1" vector-effect="non-scaling-stroke"/>\n`; marks += m + "  </g>\n"; }
    const lx = PADX + (k % COLS) * CW + 14, ly = TOP + Math.floor(k / COLS) * CH + 22, why = r.ok ? (r.by === "zac" ? "CLOSED BY HAND" : "CLOSED: " + r.fix.how.toUpperCase()) : r.fix ? "NOT SURE: " + r.fix.how.toUpperCase() + `, FILLS ${Math.round(r.fix.fill * 100)}%` : "OPEN: ENDS TOO FAR APART TO JOIN";
    labels += `  <text x="${lx}" y="${ly}" font-size="11" letter-spacing="1.2" fill="#ECE8DE">${esc(r.species.toUpperCase())}</text>\n  <text x="${lx}" y="${ly + 15}" font-size="9" letter-spacing="1.6" fill="#8C8981">${esc(String(r.name).toUpperCase())}</text>\n`
      + `  <text x="${lx}" y="${ly + FIT + 62}" font-size="8.5" letter-spacing="1.4" fill="${r.ok ? "#5BE39A" : "#FF4D5E"}">${esc(why)}</text>\n  <line x1="${lx}" y1="${ly + FIT + 76}" x2="${lx + CW - 28}" y2="${ly + FIT + 76}" stroke="#ECE8DE" stroke-opacity="0.1"/>\n`;
    out.push({ id: r.id, key: r.key, part: r.part, name: r.name, closed: r.ok, by: r.by, how: r.fix ? r.fix.how : null, layout: { cx: +cx.toFixed(1), cy: +cy.toFixed(1), s, mx, my } });
  });
  const done = rows.filter((r) => r.ok).length;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'IBM Plex Mono', ui-monospace, Menlo, monospace">
  <title>Forge tank: open outlines</title>
  <desc>Every part of a tank species whose drawing has no closed outline. Green outlines were closed by rule and are already in use. Red strokes are left to close by hand: close them, or draw one closed path over them, inside the same group. Keep the group ids. Read the file back with: node tools/kit3d/kit3d.mjs import-outlines this-file.svg. The marks layer can be deleted.</desc>
  <rect id="ground" width="${W}" height="${H}" fill="#161618"/>
  <g id="header">
    <text x="${PADX + 14}" y="46" font-size="11" letter-spacing="3" fill="#8C8981">FORGE · TANK · OPEN OUTLINES</text>
    <text x="${PADX + 14}" y="78" font-size="24" font-weight="300" fill="#ECE8DE">${n} open parts: ${done} closed by rule, ${n - done} for you</text>
    <text x="${PADX + 14}" y="104" font-size="11" fill="#8C8981">Green is closed and already in use: change it if it is wrong. Red is yours: close the strokes, or draw one closed path over them in the same group. Paths keep their own coordinates.</text>
    <g font-size="10" letter-spacing="2" fill="#8C8981">
      <line x1="${PADX + 14}" y1="126" x2="${PADX + 44}" y2="126" stroke="#5BE39A" stroke-width="1.4"/><text x="${PADX + 52}" y="130">CLOSED BY RULE, IN USE</text>
      <line x1="${PADX + 264}" y1="126" x2="${PADX + 294}" y2="126" stroke="#FF4D5E" stroke-width="1.6"/><text x="${PADX + 302}" y="130">OPEN: CLOSE THIS</text>
      <line x1="${PADX + 470}" y1="126" x2="${PADX + 500}" y2="126" stroke="#8C8981"/><text x="${PADX + 508}" y="130">THE DRAWING</text>
      <circle cx="${PADX + 646}" cy="126" r="4" fill="none" stroke="#E8B04A"/><text x="${PADX + 658}" y="130">LOOSE END</text>
    </g>
  </g>
  <g id="labels">
${labels}  </g>
  <g id="parts">
${parts}  </g>
  <g id="marks">
${marks}  </g>
</svg>
`;
  return { svg, rows: out };
}

/* ---------- reading a closed sheet back ---------- */
export function importOutlines(file, opts = {}) {
  if (!file || !fs.existsSync(file)) throw new Error("import-outlines needs the closed svg");
  if (!fs.existsSync(SHEET_JSON)) throw new Error("no " + path.relative(ROOT, SHEET_JSON) + ": run outlines first");
  const { S } = tank(false), layout = Object.fromEntries(JSON.parse(fs.readFileSync(SHEET_JSON, "utf8")).parts.map((r) => [r.id, r])), data = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : {};
  const groups = readSheet(fs.readFileSync(file, "utf8"), (id) => (layout[id] ? id : (Object.keys(layout).find((k) => id.startsWith(k + "_") || id.startsWith(k + " ")) || null)));
  let changed = 0; const report = [];
  for (const [id, got] of groups) { const L = layout[id], lay = L.layout, back = (m) => (x, y) => { const q = apply(m, x, y); return [(q[0] - lay.cx) / lay.s + lay.mx, (q[1] - lay.cy) / lay.s + lay.my]; };
    // every closed shape drawn in the group, in the part's own coordinates; the largest is the outline
    const closed = [], all = [];
    for (const g of got) { let d; try { d = redraw(g.d, back(g.m)); } catch (e) { report.push(`${id}: ${e.message}`); continue; }
      for (const s of S.paths(d)) { if (s.pts.length < 3) continue; const f = []; for (const q of s.pts) f.push(r1(q[0]), r1(q[1])); all.push(f); const a = s.pts[0], z = s.pts[s.pts.length - 1], b = boxOf([f]);
        if (s.closed || Math.hypot(a[0] - z[0], a[1] - z[1]) < 0.01 * Math.max(b.w, b.h)) closed.push(f); } }
    const box = boxOf(all.length ? all : [[0, 0]]), big = closed.filter((f) => Math.abs(area(f)) >= 0.01 * box.w * box.h)   // a person closed it: taken as drawn, unless it encloses next to nothing
      .sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
    const cur = (data[L.key] || {})[L.part];
    if (!big) { if (!L.closed) report.push(`${id}  still open`); continue; }
    const f = big.slice(); if (f[0] !== f[f.length - 2] || f[1] !== f[f.length - 1]) f.push(f[0], f[1]);
    const same = cur && Math.abs(Math.abs(area(cur.outline)) - Math.abs(area(f))) <= 0.01 * Math.abs(area(f)) && Math.abs(cur.outline.length - f.length) <= 4;
    if (same) continue;
    changed++; report.push(`${id}  ${L.closed ? "outline changed by hand" : "closed by hand"} (${f.length / 2 - 1} points)`);
    if (opts.write) (data[L.key] || (data[L.key] = {}))[L.part] = { outline: f, by: "zac", how: "closed by hand" }; }
  for (const id of Object.keys(layout)) if (!groups.has(id)) report.push(`${id}: not found in the file`);
  console.log(report.join("\n") || "no differences");
  if (opts.write && changed) { save(data); console.log(`saved ${changed} outline${changed === 1 ? "" : "s"}. Run: node tools/kit3d/kit3d.mjs outlines   (and cores, to see what they make)`); }
  else console.log(changed ? `${changed} outline${changed === 1 ? "" : "s"} would be saved. Add --write.` : "nothing to save");
  return { changed, report };
}

/* ---------- every creature on one sheet ---------- */
// the outline of each part of a fill-only species: the edges that belong to one triangle, chained into loops (every loop is closed)
function fillEdges(sp) {
  const u8 = (b) => { const bb = Buffer.from(b, "base64"); return bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength); }, V = new Float32Array(u8(sp.fillV)), I = new Uint16Array(u8(sp.fillI)), k = (i) => Math.round(V[i * 3] * 4) + "," + Math.round(V[i * 3 + 1] * 4), byPart = new Map();
  for (let t = 0; t + 2 < I.length; t += 3) { const pi = Math.round(V[I[t] * 3 + 2]); let m = byPart.get(pi); if (!m) byPart.set(pi, (m = new Map()));
    for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], ka = k(a), kb = k(b); if (ka === kb) continue; const key = ka < kb ? ka + "|" + kb : kb + "|" + ka, q = m.get(key); if (q) q.n++; else m.set(key, { a, b, ka, kb, n: 1 }); } }
  const out = new Map();
  for (const [pi, m] of byPart) { const nx = new Map(), edges = [...m.values()].filter((e) => e.n === 1); for (const e of edges) { (nx.get(e.ka) || nx.set(e.ka, []).get(e.ka)).push(e); (nx.get(e.kb) || nx.set(e.kb, []).get(e.kb)).push(e); }
    const used = new Set(), polys = [];
    for (const e0 of edges) { if (used.has(e0)) continue; used.add(e0); const pts = [V[e0.a * 3], V[e0.a * 3 + 1], V[e0.b * 3], V[e0.b * 3 + 1]], start = e0.ka; let at = e0.kb;
      for (let guard = 0; guard < 60000 && at !== start; guard++) { const nxt = (nx.get(at) || []).find((q) => !used.has(q)); if (!nxt) break; used.add(nxt); const far = nxt.ka === at ? nxt.b : nxt.a; at = nxt.ka === at ? nxt.kb : nxt.ka; pts.push(V[far * 3], V[far * 3 + 1]); }
      if (pts.length >= 6) polys.push(pts); }
    out.set(pi, polys); }
  return out;
}
// All the tank's species, every stroke of every part at 1px. A part whose drawing has no closed outline of its own (so it cannot be made
// solid without one being closed for it) is drawn red; the rest in ink. Written to creatures-all.svg, one group a part (id species-part).
export function creatures(opts = {}) {
  const { species, R, gl } = tank(false), COLS = 6, CW = 340, CH = 400, PADX = 36, TOP = 170, FIT = 290, INK = "#ECE8DE", RED = "#FF4D5E";
  const cells = [];
  for (const sp of species) { const c = R.buildCore(gl, sp, {}), strokes = R.strokesOf(sp), open = new Set(c.tally.openParts);
    if (![...strokes.values()].some((q) => q.length)) for (const [pi, polys] of fillEdges(sp)) strokes.set(pi, polys);   // a species with a fill and no line art: the edge of its fill, drawn as strokes
    const parts = []; for (const [pi, polys] of strokes) { if (!polys.length) continue; parts.push({ pi, polys, open: open.has(pi), name: (sp.ids && sp.ids[pi]) || String(pi) }); }
    cells.push({ sp, parts, box: boxOf(parts.flatMap((p) => p.polys).length ? parts.flatMap((p) => p.polys) : [[0, 0, 1, 1]]) }); }
  const n = cells.length, W = PADX * 2 + COLS * CW, H = TOP + Math.ceil(n / COLS) * CH + 40; let body = "", labels = "", totalParts = 0, openParts = 0, openSpecies = 0;
  cells.forEach((cell, k) => { const { sp, parts, box: b } = cell, col = k % COLS, row = Math.floor(k / COLS), cx = PADX + col * CW + CW / 2, cy = TOP + row * CH + 54 + FIT / 2, s = +(FIT / Math.max(b.w, b.h, 1e-6)).toFixed(5);
    const tf = `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${s}) translate(${-r1((b.x0 + b.x1) / 2)} ${-r1((b.y0 + b.y1) / 2)})`, nopen = parts.filter((p) => p.open).length; totalParts += parts.length; openParts += nopen; if (nopen) openSpecies++;
    // the ink first, the red over it: an open part is never hidden by a neighbour
    let g = `  <g id="${esc(sp.key)}" data-species="${esc(sp.name)}" transform="${tf}">\n`;
    for (const p of [...parts.filter((q) => !q.open), ...parts.filter((q) => q.open)]) g += `    <g id="${esc(sp.key)}-${p.pi}" data-part="${esc(p.name)}" data-open="${p.open ? 1 : 0}" fill="none" stroke="${p.open ? RED : INK}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke">\n`
      + p.polys.map((f) => `      <path d="${dOf(f, false)}" vector-effect="non-scaling-stroke"/>`).join("\n") + "\n    </g>\n";
    body += g + "  </g>\n";
    const lx = PADX + col * CW + 14, ly = TOP + row * CH + 22;
    labels += `  <text x="${lx}" y="${ly}" font-size="11" letter-spacing="1.2" fill="${INK}">${esc(sp.name.toUpperCase())}</text>\n  <text x="${lx}" y="${ly + 15}" font-size="9" letter-spacing="1.6" fill="#8C8981">${esc(String(sp.order || "").toUpperCase())} · ${esc(String(sp.family || "").toUpperCase())}</text>\n`
      + `  <text x="${lx}" y="${ly + FIT + 70}" font-size="8.5" letter-spacing="1.4" fill="${nopen ? RED : "#8C8981"}">${parts.length} PARTS${nopen ? " · " + nopen + " OPEN" : " · ALL CLOSED"}</text>\n  <line x1="${lx}" y1="${ly + FIT + 84}" x2="${lx + CW - 28}" y2="${ly + FIT + 84}" stroke="${INK}" stroke-opacity="0.1"/>\n`; });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'IBM Plex Mono', ui-monospace, Menlo, monospace">
  <title>Forge tank: every creature</title>
  <desc>Every species of the tank, every stroke of every part, 1px. Red parts have no closed outline in their drawing. Groups are ids of the form species-part.</desc>
  <rect width="${W}" height="${H}" fill="#161618"/>
  <text x="${PADX + 14}" y="46" font-size="11" letter-spacing="3" fill="#8C8981">FORGE · TANK · EVERY CREATURE</text>
  <text x="${PADX + 14}" y="78" font-size="24" font-weight="300" fill="${INK}">${n} species, ${totalParts} parts: ${openParts} open in ${openSpecies} species</text>
  <text x="${PADX + 14}" y="104" font-size="11" fill="#8C8981">1px lines. Red is a part whose drawing has no closed outline of its own, so it cannot be made solid as drawn.</text>
  <line x1="${PADX + 14}" y1="126" x2="${PADX + 44}" y2="126" stroke="${INK}"/><text x="${PADX + 52}" y="130" font-size="10" letter-spacing="2" fill="#8C8981">CLOSED OR NOT NEEDED</text>
  <line x1="${PADX + 264}" y1="126" x2="${PADX + 294}" y2="126" stroke="${RED}"/><text x="${PADX + 302}" y="130" font-size="10" letter-spacing="2" fill="#8C8981">OPEN</text>
  <g id="labels">
${labels}  </g>
  <g id="creatures">
${body}  </g>
</svg>
`;
  const out = path.join(ROOT, "shared/data/kit-sources/creatures-all.svg"); if (opts.write !== false) fs.writeFileSync(out, svg);
  if (!opts.quiet) console.log(`creatures: ${n} species, ${totalParts} parts, ${openParts} open in ${openSpecies} species, ${(svg.length / 1e6).toFixed(1)} MB → ${path.relative(ROOT, out)}`);
  return { n, totalParts, openParts, openSpecies, bytes: svg.length };
}
