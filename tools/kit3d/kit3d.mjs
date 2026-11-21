// Kit to 3D: the pipeline. Repeats, in order, what turning the kit's flat drawings into solid creatures needs:
//
//   node tools/kit3d/kit3d.mjs audit            which drawings can be made solid, which have an outline left open; writes the sheet to close by hand
//   node tools/kit3d/kit3d.mjs import <svg>     reads a closed sheet back (dry run: says what would change)
//   node tools/kit3d/kit3d.mjs import <svg> --write     ... and writes shared/data/creature-parts.json
//   node tools/kit3d/kit3d.mjs cores            a solid core for every species of the tank (no browser): what became of each part
//   node tools/kit3d/kit3d.mjs check            the whole kit made solid (no browser), then the solid creatures and the tank's cores in a browser
//   node tools/kit3d/kit3d.mjs copy             builds the self-contained copy of the Solid Creature page (out/solid-creature) for publishing
//   node tools/kit3d/kit3d.mjs all              audit, check, copy
//
// No dependencies of its own. `check` runs tools/check (npm install there once). See README.md beside this file.
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "../.."), OUT = path.join(HERE, "out");
const PARTS = path.join(ROOT, "shared/data/creature-parts.json"), CAT = path.join(ROOT, "shared/data/creature-catalog.json");
const SHEET = path.join(ROOT, "shared/data/kit-sources/parts-to-close.svg"), SHEET_JSON = path.join(ROOT, "shared/data/kit-sources/parts-to-close.json");
const FLAT = new Set(["glyph", "dial"]);   // these stay flat by design: an open stroke in one is not a fault

function load() {
  const g = { window: {}, performance }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, "shared/engine/generators/part-solid.js"), "utf8"), g);
  const parts = JSON.parse(fs.readFileSync(PARTS, "utf8")), cat = JSON.parse(fs.readFileSync(CAT, "utf8"));
  const rep = {}; for (const [k, v] of Object.entries(cat.drawings || {})) for (const id of v.parts) rep[id] = k;
  return { S: g.window.PartSolid, parts, cat, rep };
}
const area = (p) => { let a = 0; for (let i = 0, n = p.length, j = n - 1; i < n; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return a / 2; };
const inside = (p, x, y) => { let c = false; for (let i = 0, n = p.length, j = n - 1; i < n; j = i++) { const a = p[i], b = p[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const lenOf = (p, closed) => { let L = 0; for (let i = 0; i + 1 < p.length; i++) L += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); if (closed && p.length > 1) L += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]); return L; };
const pathEls = (svg) => [...String(svg).matchAll(/<path\b([^>]*?)\sd="([^"]+)"([^>]*?)\/?>/g)];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/* ---------- one drawing: what is closed, what is open, what needs closing ---------- */
// An open stroke is an edge left open when most of it lies outside every closed shape (inside one it is an inner line: a crease, fine as it is).
// A drawing needs closing when it has open strokes and no closed shape of any size, or when open edges are more than 6% of its line work.
function study(S, svg) {
  const els = pathEls(svg), subs = [];
  els.forEach((m, ei) => { for (const s of S.paths(m[2])) { const pts = s.pts; if (pts.length < 2) continue; let closed = s.closed; const a = pts[0], b = pts[pts.length - 1];
    if (!closed && pts.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) closed = true; subs.push({ ei, pts, closed, L: lenOf(pts, closed) }); } });
  if (!subs.length) return null;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const s of subs) for (const q of s.pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const w = x1 - x0, h = y1 - y0, size = Math.max(w, h, 1e-6), closed = subs.filter((s) => s.closed && Math.abs(area(s.pts)) > 1e-6 * size * size), open = subs.filter((s) => !s.closed);
  const bigA = closed.reduce((m, s) => Math.max(m, Math.abs(area(s.pts))), 0), total = subs.reduce((n, s) => n + s.L, 0);
  for (const s of open) { let o = 0; for (const q of s.pts) if (!closed.some((cl) => inside(cl.pts, q[0], q[1]))) o++; s.edge = o / s.pts.length > 0.5 && s.L > 0.02 * size; }
  const edges = open.filter((s) => s.edge), edgeL = edges.reduce((n, s) => n + s.L, 0);
  const need = open.length > 0 && bigA < 0.05 * w * h ? "no closed outline" : edgeL > 0.06 * total ? "open strokes outside the outline" : null;
  let outer = 0, joined = 0; try { const r = S.read(svg); outer = r.outer.length; joined = r.joined; } catch (e) {}
  return { els, subs, x0, y0, x1, y1, w, h, need, edges: edges.length, open: open.length, closed: closed.length, solid: outer > 0, joined };
}

/* ---------- audit ---------- */
function audit(opts = {}) {
  const { S, parts, cat, rep } = load(), rows = [], none = [];
  let shown = 0, solid = 0, joined = 0;
  for (const p of parts) {
    if ((rep[p.id] || p.id) !== p.id) continue;                       // a repeat of another drawing: studied once, under its first id
    const c = (cat.parts || {})[p.id] || {}; if (c.hidden) continue;   // hidden in the catalogue (empty, or a repeat)
    const st = study(S, p.svg); if (!st) continue; shown++;
    if (st.solid) { solid++; if (st.joined) joined++; } else none.push(p.id + " " + (c.feature || "?"));
    if (st.need && !FLAT.has(c.feature)) rows.push({ p, c, st });
  }
  const flatOpen = parts.filter((p) => (rep[p.id] || p.id) === p.id && !((cat.parts || {})[p.id] || {}).hidden && FLAT.has(((cat.parts || {})[p.id] || {}).feature)).filter((p) => { const st = study(S, p.svg); return st && st.need; }).length;
  const sheet = drawSheet(rows, cat);
  if (!opts.quiet) {
    console.log(`kit: ${parts.length} part ids, ${shown} shown drawings`);
    console.log(`  made solid: ${solid} (${joined} after joining loose strokes)   not solid: ${none.length}`);
    console.log(`  need closing by hand: ${rows.length}   (left alone: ${flatOpen} glyphs and dials with open strokes, flat by design)`);
    for (const r of sheet.rows) console.log(`    ${r.id}  ${r.name.padEnd(34)} ${String(r.openStrokes).padStart(3)} open strokes  ${String(r.joins).padStart(3)} likely joins`);
  }
  if (opts.write !== false) {
    fs.mkdirSync(path.dirname(SHEET), { recursive: true }); fs.writeFileSync(SHEET, sheet.svg);
    fs.writeFileSync(SHEET_JSON, JSON.stringify({ about: "The layout of parts-to-close.svg, so a closed copy can be read back (kit3d.mjs import) even if an editor bakes the group transforms into the paths.", made: new Date().toISOString().slice(0, 10), parts: sheet.rows }, null, 1) + "\n");
    if (!opts.quiet) console.log(`  wrote ${path.relative(ROOT, SHEET)} and ${path.relative(ROOT, SHEET_JSON)}`);
  }
  return { shown, solid, none, close: sheet.rows };
}

// the sheet: every part in a cell, its own paths with their own coordinates inside a group that is only moved and scaled; red is what to close
function drawSheet(rows, cat) {
  const COLS = 4, CW = 440, CH = 500, PADX = 40, TOP = 150, FIT = 330, n = rows.length, W = PADX * 2 + COLS * CW, H = TOP + Math.max(1, Math.ceil(n / COLS)) * CH + 40;
  let partsG = "", marks = "", labels = ""; const out = [];
  rows.forEach(({ p, c, st }, k) => {
    const cx = PADX + (k % COLS) * CW + CW / 2, cy = TOP + Math.floor(k / COLS) * CH + 60 + FIT / 2, s = +Math.min(6, FIT / Math.max(st.w, st.h)).toFixed(4), mx = +((st.x0 + st.x1) / 2).toFixed(2), my = +((st.y0 + st.y1) / 2).toFixed(2);
    const tf = `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${s}) translate(${-mx} ${-my})`;
    const kind = st.els.map((_, ei) => { const ss = st.subs.filter((q) => q.ei === ei); return ss.some((q) => q.edge) ? "edge" : ss.some((q) => !q.closed) ? "inner" : "closed"; });
    partsG += `  <g id="${p.id}" data-name="${esc(c.name || p.id)}" data-sheet="${esc(p.species)}" transform="${tf}">\n` + st.els.map((m, ei) => `    <path data-i="${ei}" d="${m[2]}" fill="none" stroke="${kind[ei] === "edge" ? "#FF4D5E" : kind[ei] === "inner" ? "#5A5852" : "#8C8981"}" stroke-width="${kind[ei] === "edge" ? 1.6 : 1}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join("\n") + `\n  </g>\n`;
    const E = []; for (const q of st.subs) if (q.edge) { E.push(q.pts[0]); E.push(q.pts[q.pts.length - 1]); }
    const size = Math.max(st.w, st.h), r = 3.2 / s, seen = new Set(); let g = `  <g id="marks-${p.id}" transform="${tf}">\n`, joins = 0;
    E.forEach((a, i) => { let best = -1, bd = 0.14 * size; E.forEach((b, j) => { if (i === j) return; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < bd) { bd = d; best = j; } });
      if (best >= 0 && bd > 1e-3) { const key = Math.min(i, best) + "-" + Math.max(i, best); if (!seen.has(key)) { seen.add(key); joins++; const b = E[best]; g += `    <line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="#E8B04A" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>\n`; } }
      g += `    <circle cx="${a[0].toFixed(2)}" cy="${a[1].toFixed(2)}" r="${r.toFixed(3)}" fill="none" stroke="#E8B04A" stroke-width="1" vector-effect="non-scaling-stroke"/>\n`; });
    marks += g + `  </g>\n`;
    const lx = PADX + (k % COLS) * CW + 20, ly = TOP + Math.floor(k / COLS) * CH + 26, sh = ((cat.sheets || {})[p.species] || {}).name || p.species;
    labels += `  <text x="${lx}" y="${ly}" font-size="26" font-weight="300" fill="#E8B04A">${p.id}</text>\n  <text x="${lx + 96}" y="${ly - 9}" font-size="12" letter-spacing="1.2" fill="#ECE8DE">${esc((c.name || p.id).toUpperCase())}</text>\n  <text x="${lx + 96}" y="${ly + 7}" font-size="10" letter-spacing="2" fill="#8C8981">${esc(sh.toUpperCase())} · ${esc((c.feature || "?").toUpperCase())}</text>\n`
      + `  <text x="${lx}" y="${ly + FIT + 72}" font-size="10" letter-spacing="2" fill="#8C8981">${st.need.toUpperCase()} · ${st.edges} OPEN STROKE${st.edges === 1 ? "" : "S"} · ${joins} LIKELY JOIN${joins === 1 ? "" : "S"}</text>\n`
      + `  <line x1="${lx}" y1="${ly + FIT + 90}" x2="${lx + CW - 40}" y2="${ly + FIT + 90}" stroke="#ECE8DE" stroke-opacity="0.1"/>\n`;
    out.push({ id: p.id, name: c.name || p.id, sheet: p.species, why: st.need, openStrokes: st.edges, joins, paths: st.els.length, layout: { cx: +cx.toFixed(1), cy: +cy.toFixed(1), s, mx, my } });
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'IBM Plex Mono', ui-monospace, Menlo, monospace">
  <title>Forge kit: parts that need closing</title>
  <desc>Each part is a group whose id is its part id. Close the red strokes into closed outlines, keep the group ids, and read the file back with: node tools/kit3d/kit3d.mjs import this-file.svg. The marks layer can be deleted.</desc>
  <rect id="ground" width="${W}" height="${H}" fill="#161618"/>
  <g id="header">
    <text x="${PADX + 20}" y="46" font-size="11" letter-spacing="3" fill="#8C8981">FORGE · KIT TO 3D</text>
    <text x="${PADX + 20}" y="78" font-size="24" font-weight="300" fill="#ECE8DE">${n} part${n === 1 ? "" : "s"} that need${n === 1 ? "s" : ""} closing</text>
    <text x="${PADX + 20}" y="104" font-size="11" fill="#8C8981">Close the red strokes so each part has a closed outline. Keep each group's id (the part id). Paths keep their own coordinates; only the group is moved and scaled.</text>
    <g font-size="10" letter-spacing="2" fill="#8C8981">
      <line x1="${PADX + 20}" y1="126" x2="${PADX + 50}" y2="126" stroke="#FF4D5E" stroke-width="1.6"/><text x="${PADX + 58}" y="130">OPEN EDGE: CLOSE THIS</text>
      <line x1="${PADX + 260}" y1="126" x2="${PADX + 290}" y2="126" stroke="#8C8981"/><text x="${PADX + 298}" y="130">ALREADY CLOSED</text>
      <line x1="${PADX + 450}" y1="126" x2="${PADX + 480}" y2="126" stroke="#5A5852"/><text x="${PADX + 488}" y="130">INNER LINE: LEAVE OPEN</text>
      <circle cx="${PADX + 706}" cy="126" r="4" fill="none" stroke="#E8B04A"/><text x="${PADX + 718}" y="130">LOOSE END</text>
      <line x1="${PADX + 830}" y1="126" x2="${PADX + 860}" y2="126" stroke="#E8B04A" stroke-dasharray="3 3"/><text x="${PADX + 868}" y="130">LIKELY JOIN</text>
    </g>
  </g>
  <g id="labels">
${labels}  </g>
  <g id="parts">
${partsG}  </g>
  <g id="marks">
${marks}  </g>
</svg>
`;
  return { svg, rows: out };
}

/* ---------- reading a closed sheet back ---------- */
const I = [1, 0, 0, 1, 0, 0], mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function matrixOf(t) {
  let m = I; if (!t) return m;
  for (const [, fn, args] of String(t).matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) { const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === "matrix") m = mul(m, a);
    else if (fn === "translate") m = mul(m, [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
    else if (fn === "scale") m = mul(m, [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0]);
    else if (fn === "rotate") { const r = a[0] * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), R = [c, s, -s, c, 0, 0]; m = a.length > 2 ? mul(mul(mul(m, [1, 0, 0, 1, a[1], a[2]]), R), [1, 0, 0, 1, -a[1], -a[2]]) : mul(m, R); } }
  return m;
}
// path data as absolute M, L, C, Q and Z, every point passed through f. Arcs are not handled (the kit has none): they throw
function redraw(d, f) {
  const tok = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []; let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, last = "", out = "", lastOut = "";
  const num = () => Number(tok[i++]), more = () => i < tok.length && !/^[a-zA-Z]$/.test(tok[i]), fmt = (p) => { const q = f(p[0], p[1]); return (Math.round(q[0] * 10) / 10) + " " + (Math.round(q[1] * 10) / 10); };
  const emit = (c, pts) => { out += (out ? " " : "") + (c === lastOut && c !== "M" ? "" : c) + pts.map(fmt).join(" "); lastOut = c; };
  while (i < tok.length) {
    if (/^[a-zA-Z]$/.test(tok[i])) cmd = tok[i++]; else if (cmd === "M") cmd = "L"; else if (cmd === "m") cmd = "l";
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "Z") { out += " Z"; lastOut = "Z"; x = sx; y = sy; last = "Z"; continue; }
    if (!more()) throw new Error("path data ends early after " + cmd);
    if (C === "M") { x = ox + num(); y = oy + num(); sx = x; sy = y; emit("M", [[x, y]]); }
    else if (C === "L") { x = ox + num(); y = oy + num(); emit("L", [[x, y]]); }
    else if (C === "H") { x = ox + num(); emit("L", [[x, y]]); }
    else if (C === "V") { y = oy + num(); emit("L", [[x, y]]); }
    else if (C === "C") { const a = [ox + num(), oy + num()], b = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); emit("C", [a, b, [x, y]]); px = b[0]; py = b[1]; }
    else if (C === "S") { const a = last === "C" ? [2 * x - px, 2 * y - py] : [x, y], b = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); emit("C", [a, b, [x, y]]); px = b[0]; py = b[1]; last = "C"; continue; }
    else if (C === "Q") { const a = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); emit("Q", [a, [x, y]]); px = a[0]; py = a[1]; }
    else if (C === "T") { const a = last === "Q" ? [2 * x - px, 2 * y - py] : [x, y]; x = ox + num(); y = oy + num(); emit("Q", [a, [x, y]]); px = a[0]; py = a[1]; last = "Q"; continue; }
    else throw new Error("path command " + cmd + " is not handled (arcs: draw them as curves)");
    last = C;
  }
  return out.replace(/ Z/g, " Z").trim();
}
// the same drawing, give or take the rounding an editor adds when it bakes a transform into the points (a path left alone must not be rewritten)
function sameShape(a, b) { if (a === b) return true; const la = a.replace(/[-\d.eE+]+/g, "#"), lb = b.replace(/[-\d.eE+]+/g, "#"); if (la !== lb) return false;
  const na = a.match(/-?\d+\.?\d*/g) || [], nb = b.match(/-?\d+\.?\d*/g) || []; if (na.length !== nb.length) return false; for (let i = 0; i < na.length; i++) if (Math.abs(na[i] - nb[i]) > 0.151) return false; return true; }
// every <path> under a group whose id is a part id, with the transforms above it multiplied in
function readSheet(text, pick = (id) => { const m = id.match(/^(P\d{3,})/); return m ? m[1] : null; }) {   // pick: a group's id -> the part it holds, or null
  const groups = new Map(), stack = [{ m: I, id: null, skip: false }];
  for (const t of text.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)\b([^>]*?)(\/?)>/g)) {
    const [, close, tag, attrs, self] = t, top = stack[stack.length - 1];
    if (close) { if (tag === "g" || tag === "svg") stack.length > 1 && stack.pop(); continue; }
    const at = (n) => { const m = attrs.match(new RegExp("(?:^|\\s)" + n + '\\s*=\\s*"([^"]*)"')); return m ? m[1] : null; };
    if (tag === "g") { const id = at("id") || "", isMarks = /^marks/i.test(id) || /^(labels|header|ground)$/i.test(id), pm = isMarks ? null : pick(id);
      const fr = { m: mul(top.m, matrixOf(at("transform"))), id: pm || top.id, skip: top.skip || isMarks };
      if (!self) stack.push(fr); continue; }
    if (tag === "path" && top.id && !top.skip) { const d = at("d"); if (!d) continue; const m = mul(top.m, matrixOf(at("transform"))), di = at("data-i");
      (groups.get(top.id) || groups.set(top.id, []).get(top.id)).push({ d, m, i: di == null ? null : +di, role: at("data-role") }); }
  }
  return groups;
}
function importSheet(file, opts = {}) {
  if (!file || !fs.existsSync(file)) throw new Error("import needs the closed svg: node tools/kit3d/kit3d.mjs import path/to/closed.svg");
  if (!fs.existsSync(SHEET_JSON)) throw new Error("no " + path.relative(ROOT, SHEET_JSON) + ": run audit first (it records the sheet's layout)");
  const { S, parts } = load(), layout = Object.fromEntries(JSON.parse(fs.readFileSync(SHEET_JSON, "utf8")).parts.map((r) => [r.id, r])), groups = readSheet(fs.readFileSync(file, "utf8"));
  const norm = (d) => String(d).replace(/\s+/g, " ").trim(); let changed = 0; const report = [];
  for (const [id, got] of groups) {
    const p = parts.find((q) => q.id === id), L = layout[id]; if (!p) { report.push(`${id}: not a part in the kit, skipped`); continue; }
    if (!L) { report.push(`${id}: was not on the sheet audit made, skipped`); continue; }
    const before = study(S, p.svg), els = pathEls(p.svg), lay = L.layout;
    // file coordinates -> the part's own: undo the cell's move and scale. A path left as it was comes back to itself
    const back = (m) => (x, y) => { const q = apply(m, x, y); return [(q[0] - lay.cx) / lay.s + lay.mx, (q[1] - lay.cy) / lay.s + lay.my]; };
    const byIndex = got.every((g) => g.i != null), sameCount = got.length === els.length, keep = new Map(), extra = [];
    let err = null;
    got.forEach((g, k) => { let d; try { d = redraw(g.d, back(g.m)); } catch (e) { err = e.message; return; }
      const at = byIndex ? g.i : sameCount ? k : null;
      if (at != null && at < els.length && !keep.has(at)) { const same = (() => { try { return sameShape(redraw(els[at][2], (x, y) => [x, y]), d); } catch (e) { return false; } })(); keep.set(at, same ? els[at][2] : d); } else extra.push(d); });
    if (err) { report.push(`${id}: ${err}. Not changed`); continue; }
    let k = 0, svg = String(p.svg).replace(/<path\b([^>]*?)\sd="([^"]+)"([^>]*?)\/?>\s*/g, (all, a, d, b) => { const at = k++; if (!keep.has(at)) return ""; return all.replace(`d="${d}"`, `d="${keep.get(at)}"`); });
    if (extra.length) { const add = extra.map((d) => `<path d="${d}" fill="none" stroke="#61e5bf" stroke-linejoin="round" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join("\n"); const at = svg.lastIndexOf("</g>"); svg = at < 0 ? svg + add : svg.slice(0, at) + add + "\n" + svg.slice(at); }
    const after = study(S, svg), same = norm(svg) === norm(p.svg);
    const how = byIndex ? "paths matched by their index" : sameCount ? "paths matched by order (the editor dropped the index)" : "paths could not be matched: all replaced as plain strokes";
    report.push(`${id}  ${(L.name || "").padEnd(34)} ${same ? "unchanged" : `open strokes ${before.edges} -> ${after ? after.edges : "?"}, ${after && after.solid ? "now has a closed outline" : "still no closed outline"}${after && after.need ? " (still needs closing: " + after.need + ")" : ""}`}${same ? "" : `   [${how}; ${els.length - keep.size} removed, ${extra.length} added]`}`);
    if (!same) { changed++; if (opts.write) p.svg = svg; }
  }
  for (const id of Object.keys(layout)) if (!groups.has(id)) report.push(`${id}: not found in the file (its group id was lost?)`);
  console.log(report.join("\n"));
  if (opts.write && changed) { fs.writeFileSync(PARTS, JSON.stringify(parts)); console.log(`wrote ${changed} part${changed === 1 ? "" : "s"} to ${path.relative(ROOT, PARTS)}. Run: node tools/kit3d/kit3d.mjs audit`); }
  else console.log(changed ? `${changed} part${changed === 1 ? "" : "s"} would change. Add --write to save.` : "nothing to change");
  return { changed, report };
}

/* ---------- cores: every species of the tank ---------- */
// The tank's renderer can put a dark solid under a species' lines (ecology-render's render.cores). This builds that core for every species,
// with no browser, and says what became of each part: cored, rigid (a fin or wing: stays lines), thin (a thread), frame (a box round the whole creature), open (no closed outline).
async function cores(opts = {}) {
  let w, gl; try { ({ w, gl } = (await import("./tank.mjs")).tank({ outlines: true })); } catch (e) { console.log("cores " + e.message); return null; }   // nothing is drawn: the upload calls go nowhere
  const rows = []; let bad = 0;
  for (const sp of w.EcologySpecies.SPECIES) { const t = Date.now(); let c = null, err = ""; try { c = w.EcologyRender.buildCore(gl, sp, {}); } catch (e) { err = String(e.message).slice(0, 120); }
    const T = (c && c.tally) || {}, row = { key: sp.key, name: sp.name, parts: sp.parts, cored: T.cored || 0, rigid: T.rigid || 0, thin: T.thin || 0, frame: T.frame || 0, open: T.open || 0, failed: T.failed || 0, tris: c ? c.count / 3 : 0, ms: Date.now() - t, error: err || undefined };
    if (err || row.failed || !row.cored) bad++; rows.push(row); }
  if (!opts.quiet) { console.log(`cores: ${rows.length} species`); console.log("  " + "species".padEnd(24) + " parts cored rigid  thin frame  open  fail     tris     ms");
    for (const r of rows) console.log("  " + r.name.slice(0, 24).padEnd(24) + [r.parts, r.cored, r.rigid, r.thin, r.frame, r.open, r.failed].map((v) => String(v).padStart(6)).join("") + String(r.tris).padStart(9) + String(r.ms).padStart(7) + (r.error ? "  " + r.error : !r.cored ? "  NO CORE" : ""));
    const sum = (k) => rows.reduce((n, r) => n + r[k], 0); console.log(`  all: ${sum("parts")} parts, ${sum("cored")} cored, ${sum("rigid")} rigid, ${sum("thin")} thin, ${sum("frame")} frames, ${sum("open")} open, ${sum("failed")} failed; slowest ${Math.max(...rows.map((r) => r.ms))} ms`);
    console.log(bad ? `  ${bad} species with no core or a failure` : "  every species has a core"); }
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "cores.json"), JSON.stringify(rows, null, 1) + "\n");
  return { rows, ok: !bad };
}

/* ---------- check ---------- */
function check() {
  const dir = path.join(ROOT, "tools/check");
  if (!fs.existsSync(path.join(dir, "node_modules"))) { console.log("tools/check has no node_modules. Once: cd tools/check && npm install && npx playwright install chromium"); return false; }
  let ok = true;
  { console.log("== the pipeline's own test =="); const r = spawnSync(process.execPath, [path.join(HERE, "test.mjs")], { stdio: "inherit" }); if (r.status !== 0) ok = false; }
  { console.log("\n== a core for every species of the tank =="); const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "cores"], { stdio: "inherit" }); if (r.status !== 0) ok = false; }
  for (const [label, args] of [["the whole kit made solid", ["part-solid.mjs"]], ["solid creatures", ["run.mjs", "solid-look"]], ["the tank's solid cores", ["run.mjs", "specimen-cores"]]]) {
    console.log(`\n== ${label} ==`); const r = spawnSync(process.execPath, args, { cwd: dir, stdio: "inherit" }); if (r.status !== 0) ok = false;
  }
  return ok;
}

/* ---------- the self-contained copy of the Solid Creature page ---------- */
// The page reads the whole kit (2.9 MB) and the Maw needs the game's scripts, so a copy to publish carries only the species that fit: each one's
// parts under `budget` bytes, no Maw. It is the repo page with its script paths turned to a local js/ folder and its roster cut down.
function copy(opts = {}) {
  const budget = opts.budget || 150000, src = fs.readFileSync(path.join(ROOT, "world/forges/kit-3d/creature.html"), "utf8"), parts = JSON.parse(fs.readFileSync(PARTS, "utf8")), cat = JSON.parse(fs.readFileSync(CAT, "utf8"));
  const plans = fs.readFileSync(path.join(ROOT, "shared/engine/motion/species-rig.js"), "utf8"), sheetOf = (key) => { const m = plans.match(new RegExp("\\b" + key + ":\\s*\\{\\s*sheet:\\s*\"([^\"]+)\"")); return m ? m[1] : null; };
  const roster = JSON.parse(src.match(/const ROSTER = (\[.*?\]\]);/)[1]), keepR = [], left = [], sheets = new Set();
  for (const [key, name] of roster) { const sh = sheetOf(key); if (!sh) { left.push(name); continue; } const bytes = parts.filter((p) => p.species === sh).reduce((n, p) => n + JSON.stringify(p).length, 0); if (bytes > budget) { left.push(name); continue; } keepR.push([key, name]); sheets.add(sh); }
  const dir = path.join(OUT, "solid-creature"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, "js"), { recursive: true });
  const sub = parts.filter((p) => sheets.has(p.species)).map((p) => ({ id: p.id, species: p.species, side: p.side, w: p.w, h: p.h, svg: p.svg })), ids = new Set(sub.map((p) => p.id));
  fs.writeFileSync(path.join(dir, "parts.json"), JSON.stringify(sub));
  fs.writeFileSync(path.join(dir, "catalogue.json"), JSON.stringify({ parts: Object.fromEntries(Object.entries(cat.parts).filter(([id]) => ids.has(id)).map(([id, v]) => [id, { feature: v.feature }])) }));
  let s = src.replace(/<script src="\.\.\/\.\.\/\.\.\/shared\/(?:engine\/ecology|look\/game)\/[^"]+"><\/script>\n/g, "");
  for (const m of s.matchAll(/(?:src|from)\s*=?\s*"(\.\.\/\.\.\/\.\.\/shared\/engine\/(?:generators|motion|mech)\/([^"]+))"/g)) fs.copyFileSync(path.join(ROOT, "world/forges/kit-3d", m[1]), path.join(dir, "js", m[2]));
  s = s.replace(/src="\.\.\/\.\.\/\.\.\/shared\/engine\/(?:generators|motion|mech)\/([^"]+)"/g, 'src="js/$1"').replace(/from "\.\.\/\.\.\/\.\.\/shared\/engine\/motion\//g, 'from "./js/');
  s = s.replace('<script src="https://cdn.jsdelivr.net/npm/delaunator', '<script>window.KIT_PARTS = "parts.json"; window.KIT_CATALOGUE = "catalogue.json";</script>\n<script src="https://cdn.jsdelivr.net/npm/delaunator');
  const first = keepR[0];
  s = s.replace(/const ROSTER = \[.*?\]\];/, "const ROSTER = " + JSON.stringify(keepR) + ";").replace(/key: "[a-z]+", look/, `key: "${first[0]}", look`).replace(/\? want : "[a-z]+"/, `? want : "${first[0]}"`).replace(/<b id="name">[^<]*<\/b>/, `<b id="name">${first[1]}</b>`);
  if (left.length) s = s.replace("</aside>", `<p class="note">This copy carries ${keepR.length} creatures. Left out for size or because they need the game's scripts: ${left.join(", ")}. They are on the page in the repo (world/forges/kit-3d/creature.html).</p>\n  </aside>`);
  if (/\.\.\/\.\.\/\.\.\/shared\/(?!data)/.test(s)) throw new Error("the copy still points into the repo: " + s.match(/\.\.\/\.\.\/\.\.\/shared\/[^"]+/)[0]);
  fs.writeFileSync(path.join(dir, "index.html"), s);
  let bytes = 0; const walk = (d) => { for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) walk(q); else bytes += fs.statSync(q).size; } }; walk(dir);
  console.log(`copy: ${keepR.length} creatures (${keepR.map((r) => r[1]).join(", ")})`); if (left.length) console.log(`  left out: ${left.join(", ")}`);
  console.log(`  ${path.relative(ROOT, dir)}  ${(bytes / 1024).toFixed(0)} KB. Serve that folder, or publish its files.`);
  return { dir, creatures: keepR, left, bytes };
}

/* ---------- command line ---------- */
const [cmd, ...rest] = process.argv.slice(2), flag = (f) => rest.includes(f), arg = rest.find((a) => !a.startsWith("--"));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  if (cmd === "audit") audit({ write: !flag("--dry") });
  else if (cmd === "import") importSheet(arg, { write: flag("--write") });
  else if (cmd === "check") process.exit(check() ? 0 : 1);
  else if (cmd === "copy") copy();
  else if (cmd === "cores") { const r = await cores(); process.exit(r && r.ok ? 0 : 1); }
  else if (cmd === "looks") { const m = await import("./looks.mjs"); m.looks({}); }
  else if (cmd === "pack") { const m = await import("./pack.mjs"); await m.pack({ write: flag("--write") }); }
  else if (cmd === "close-loops") { const m = await import("./close-loops.mjs"); await m.closeLoops({ write: flag("--write") }); }
  else if (cmd === "creatures") { const m = await import("./outlines.mjs"); m.use({ redraw, readSheet, apply, esc }); m.creatures({}); }
  else if (cmd === "outlines") { const m = await import("./outlines.mjs"); m.use({ redraw, readSheet, apply, esc }); m.outlines({}); }
  else if (cmd === "import-outlines") { const m = await import("./outlines.mjs"); m.use({ redraw, readSheet, apply, esc }); m.importOutlines(arg, { write: flag("--write") }); }
  else if (cmd === "all") { audit({}); const ok = check(); copy(); process.exit(ok ? 0 : 1); }
  else if (cmd) { console.log("unknown: " + cmd); process.exit(2); }
  else console.log("kit3d: audit | import <closed.svg> [--write] | looks | pack [--write] | close-loops [--write] | creatures | outlines | import-outlines <closed.svg> [--write] | cores | check | copy | all     (see tools/kit3d/README.md)");
} catch (e) { console.error("kit3d: " + e.message); process.exit(1); }

export { audit, importSheet, copy, cores, apply, mul, matrixOf, esc, OUT, study, redraw, readSheet, SHEET, SHEET_JSON, ROOT };
