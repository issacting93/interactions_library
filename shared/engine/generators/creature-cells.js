/*
 * Forge — creature cells. Splits a sheet species into the parts you swap ("cells", laid on a hex
 * grid: a spine column, side cells mirrored across it) and the parts that ride along ("details",
 * each kept with its nearest cell, at the spot it was drawn). Swap a cell and its details stay.
 *
 *   CreatureCells.plan(parts, catalog) -> { spine: [id], sides: [[id, j]], det: { cellId: [id] }, halo: [id] }
 *       parts    the species' kit parts ({ id, side, ox, oy, w, h })
 *       catalog  CreatureCatalog-shaped: part(id) -> { feature, hidden } (optional)
 *       sides[n][1] = j: the side cell sits between spine cells j and j+1 (-1: above the head)
 *   CreatureCells.cells(plan, opts) -> [{ key, id, side, row, label, gx, gy, mirror }]
 *       hex grid positions for drawing the grid; opts.segs adds (+) or removes (-) body rows
 *   CreatureCells.compose(plan, byId, edits) -> [{ part, x, y, scale, side, role, cell }]
 *       edits = { swap: { cellKey: partId }, off: { cellKey: true }, details: bool, segs: int }
 *       placements in the 400-wide sheet plan, cells first then details; side parts mirror at 400 - x
 *   CreatureCells.svg(placements, byId, opts) -> SVG markup (opts.focus: a cell key to keep lit)
 *       a placement may also carry rot (degrees), and for CreatureLook: joint [x, y] (where its
 *       bolt sits), strut: false (no core strut to the body), free: true (not part of the spine),
 *       glow: true (its linework in the glow colour)
 *   CreatureCells.layout(placements) -> Bestiary layout ({ part, x, y, scale }), mirrors implied
 *
 * Ported from the canvas study (Beast-9 "Swap on the grid, keep the details"). Pure: no DOM.
 * Classic script.
 */
(function () {
  "use strict";
  const AXIS = 200;
  const S = (p) => (p.side === "center" || p.side === "c" ? "c" : "l");
  const inside = (a, b) => Math.abs(a.ox - b.ox) <= b.w / 2 && Math.abs(a.oy - b.oy) <= b.h / 2;
  const tiny = (p) => Math.max(p.w, p.h) < 22 || p.w * p.h < 300;

  function plan(parts, catalog) {
    const cat = (id) => (catalog && catalog.part ? catalog.part(id) : null) || {};
    const empty = (p) => cat(p.id).hidden === "empty";
    const isHalo = (p) => {
      const f = cat(p.id).feature, m = Math.max(p.w, p.h);
      return S(p) === "c" && (((f === "halo" || f === "ring") && m >= 50) || (m >= 90 && Math.abs(p.w - p.h) < 0.2 * m));
    };
    const P = parts.filter((p) => !empty(p));
    const ids = P.slice().sort((a, b) => b.w * b.h - a.w * a.h || (a.id < b.id ? -1 : 1));
    const owner = new Map();
    // a part inside a bigger one on the same side rides it (a halo rings the body; it doesn't swallow it)
    ids.forEach((k, i) => {
      for (const b of ids.slice(0, i)) {
        if (owner.has(b.id) || S(b) !== S(k) || !inside(k, b)) continue;
        if (isHalo(b) && !tiny(k) && !isHalo(k)) continue;
        owner.set(k.id, b); break;
      }
    });
    const prim = () => ids.filter((k) => !owner.has(k.id));
    // tiny bits are never cells: they ride the nearest real cell
    for (const k of prim()) {
      if (!tiny(k)) continue;
      const c = prim().filter((c) => c !== k && !tiny(c) && (S(c) === S(k) || S(k) === "l"));
      if (c.length) owner.set(k.id, c.reduce((b, c2) => (Math.abs(c2.ox - k.ox) + Math.abs(c2.oy - k.oy) < Math.abs(b.ox - k.ox) + Math.abs(b.oy - k.oy) ? c2 : b)));
    }
    // small side bits hugging the spine belong to the spine cell at their height
    const cp = prim().filter((k) => S(k) === "c" && !isHalo(k)).sort((a, b) => a.oy - b.oy);
    for (const k of prim()) if (cp.length && S(k) === "l" && k.w * k.h < 500 && k.ox >= 178)
      owner.set(k.id, cp.reduce((b, c) => (Math.abs(c.oy - k.oy) < Math.abs(b.oy - k.oy) ? c : b)));
    const root = (k) => { const seen = new Set(); let r = k; while (owner.has(r.id) && !seen.has(r.id)) { seen.add(r.id); r = owner.get(r.id); } return r; };
    const pr = prim(), det = {};
    for (const k of pr) det[k.id] = [];
    for (const [id] of owner) det[root({ id }).id].push(id);
    // empty drawings still ride along; a legacy part (kept only for saved designs, kit_repairs.py) is no longer part of the creature
    for (const p of parts) if (empty(p) && !p.legacy && pr.length) {
      const c = pr.reduce((b, c2) => (Math.abs(c2.ox - p.ox) + Math.abs(c2.oy - p.oy) < Math.abs(b.ox - p.ox) + Math.abs(b.oy - p.oy) ? c2 : b));
      det[c.id].push(p.id);
    }
    const spine = pr.filter((k) => S(k) === "c").sort((a, b) => a.oy - b.oy);
    const body = spine.filter((k) => !isHalo(k)), ys = (body.length ? body : spine).map((k) => k.oy);
    const sides = [];
    for (const k of pr.filter((k) => S(k) === "l").sort((a, b) => a.oy - b.oy)) {
      let j = -1;
      ys.forEach((y, i) => { if (k.oy >= y) j = i; });
      if (ys.length && j === ys.length - 1 && !(k.oy > ys[ys.length - 1] + 5)) j = ys.length - 2;
      if (!ys.length) j = sides.length - 1;
      sides.push([k.id, j]);
    }
    return { spine: spine.map((k) => k.id), sides, det, halo: spine.filter(isHalo).map((k) => k.id), body: body.map((k) => k.id) };
  }

  // body rows: the spine cells that aren't halos, in order; segments repeat (or drop) the row
  // before the tail, carrying its side cells and details
  function rows(pl) { return pl.body && pl.body.length ? pl.body : pl.spine; }
  function repeatRow(pl) { const n = rows(pl).length; return n >= 3 ? n - 2 : n - 1; }
  const segRange = (pl) => [-(Math.max(0, repeatRow(pl) - 1)), 8];

  function cells(pl, opts) {
    opts = opts || {};
    const R = rows(pl), segs = clampSegs(pl, opts.segs || 0), r = repeatRow(pl), out = [];
    // spine column: halos first, then each body row; extra rows repeat row r
    const order = [];
    pl.spine.filter((id) => !R.includes(id)).forEach((id) => order.push({ id, row: -1, copy: 0, halo: true }));
    R.forEach((id, i) => {
      if (segs < 0 && i <= r && i > r + segs) return;
      order.push({ id, row: i, copy: 0 });
      if (i === r) for (let c = 1; c <= segs; c++) order.push({ id, row: i, copy: c });
    });
    const sideRows = (row) => pl.sides.filter(([, j]) => j === row);
    let gy = 72;
    const last = order.length - 1;
    order.forEach((o, n) => {
      const label = o.halo ? "HALO" : o.row === 0 ? "HEAD" : n === last ? "TAIL" : "S" + String(n).padStart(2, "0");
      out.push({ key: "s" + pl.spine.indexOf(o.id), id: o.id, side: "c", row: o.row, copy: o.copy, label, gx: 230, gy });
      // side cells below this row (above the head for row -1 handled with the first row)
      const list = o.halo ? [] : sideRows(o.row).concat(o.row === 0 && o.copy === 0 ? sideRows(-1) : []);
      list.forEach(([id], lane) => {
        const k = pl.sides.findIndex((s) => s[0] === id), ii = lane % 4, extra = Math.floor(lane / 4);
        out.push({ key: "l" + k, id, side: "l", row: o.row, copy: o.copy, label: pl.sides[k][1] < 0 ? "CREST" : "J" + String(n).padStart(2, "0"),
          gx: 188 - 42 * ii, gy: gy + 24 - 24 * (ii % 2) + 48 * extra, mirror: true });
      });
      gy += 48;
    });
    return out;
  }
  function clampSegs(pl, s) { const [lo, hi] = segRange(pl); return Math.max(lo, Math.min(hi, s | 0)); }

  function compose(pl, byId, edits) {
    edits = edits || {};
    const swap = edits.swap || {}, off = edits.off || {}, showDet = edits.details !== false;
    const R = rows(pl), r = repeatRow(pl), segs = clampSegs(pl, edits.segs || 0);
    const y = (i) => byId[R[Math.max(0, Math.min(R.length - 1, i))]].oy;
    // one body row's height: the step from the row above to the repeated row
    const rowGap = Math.max(8, R.length > 1 ? Math.abs(y(r) - y(r > 0 ? r - 1 : 1)) : (byId[R[0]] ? byId[R[0]].h * 0.8 : 40));
    // which body row a cell belongs to, and the shift for everything below the repeated row
    const rowOf = (key) => {
      if (key[0] === "s") { const id = pl.spine[+key.slice(1)]; const i = R.indexOf(id); return i < 0 ? -1 : i; }
      const j = pl.sides[+key.slice(1)][1]; return j < 0 ? 0 : j;
    };
    const removed = (row) => segs < 0 && row <= r && row > r + segs;
    const shift = (row) => (row > r ? segs * rowGap : 0);
    const out = [];
    const cellKeys = pl.spine.map((_, i) => "s" + i).concat(pl.sides.map((_, i) => "l" + i));
    for (const key of cellKeys) {
      const origId = key[0] === "s" ? pl.spine[+key.slice(1)] : pl.sides[+key.slice(1)][0];
      const o = byId[origId], row = rowOf(key);
      if (!o || (pl.halo.includes(origId) ? false : removed(row))) continue;
      const copies = row === r && segs > 0 ? segs + 1 : 1;
      for (let c = 0; c < copies; c++) {
        const dy = shift(row) + c * rowGap;
        const p = byId[swap[key] || origId] || o;
        const s = p.id === o.id ? 1 : Math.max(0.4, Math.min(2.5, Math.max(o.w, o.h) / Math.max(p.w, p.h)));
        out.push({ part: p.id, x: S(o) === "c" ? AXIS : o.ox, y: o.oy + dy, scale: s, side: S(o), role: "cell", cell: key });
        if (showDet && !off[key]) for (const d of pl.det[origId] || []) {
          const q = byId[d]; if (!q) continue;
          out.push({ part: d, x: S(q) === "c" ? AXIS : q.ox, y: q.oy + dy, scale: 1, side: S(q), role: "detail", cell: key });
        }
      }
    }
    // cells paint first, details on top; within each, the sheet's order
    const rank = new Map(Object.keys(byId).map((k, i) => [k, i]));
    return out.sort((a, b) => (a.role === b.role ? 0 : a.role === "cell" ? -1 : 1) || (rank.get(a.part) - rank.get(b.part)));
  }

  function bounds(placements, byId) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const pl of placements) {
      const p = byId[pl.part]; if (!p) continue;
      const r = (pl.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
      const w0 = p.w * pl.scale / 2, h0 = p.h * pl.scale / 2, hw = c * w0 + s * h0, hh = s * w0 + c * h0;
      for (const x of pl.side === "l" ? [pl.x, 2 * AXIS - pl.x] : [pl.x]) { x0 = Math.min(x0, x - hw); x1 = Math.max(x1, x + hw); }
      y0 = Math.min(y0, pl.y - hh); y1 = Math.max(y1, pl.y + hh);
    }
    return [x0, y0, x1, y1];
  }

  // a placement's transform: at (x, y), turned by rot degrees, scaled
  // (flip: drawn mirrored, for one-off right-hand parts that move on their own)
  const place = (pl, k) => `translate(${pl.x.toFixed(1)} ${pl.y.toFixed(1)})${pl.rot ? ` rotate(${(+pl.rot).toFixed(1)})` : ""} scale(${pl.flip ? "-" : ""}${(pl.scale * (k || 1)).toFixed(3)} ${(pl.scale * (k || 1)).toFixed(3)})`;

  function svg(placements, byId, opts) {
    opts = opts || {};
    const defs = new Map();
    let body = "";
    for (const pl of placements) {
      const p = byId[pl.part]; if (!p) continue;
      if (p.defs) defs.set(p.id, p.defs);
      const cls = `cc-${pl.role}${opts.focus ? (pl.cell === opts.focus ? " is-focus" : " is-dim") : ""}`;
      const sw = (1 / pl.scale).toFixed(3);
      const g = `<g transform="${place(pl)}" stroke-width="${sw}">${p.svg}</g>`;
      body += `<g class="${cls}" data-cell="${pl.cell}">${g}${pl.side === "l" ? `<g transform="matrix(-1 0 0 1 ${2 * AXIS} 0)">${g}</g>` : ""}</g>`;
    }
    const [x0, y0, x1, y1] = bounds(placements, byId), pad = 12;
    // opts.minSpan: frame at least this many sheet units each way, so a small creature is not blown up
    // (and its lines thickened) to fill the view
    const ms = opts.minSpan || 0, w = Math.max(x1 - x0 + 2 * pad, ms), h = Math.max(y1 - y0 + 2 * pad, ms);
    const vb = opts.vb || [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h].map((v) => +v.toFixed(1));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}">${defs.size ? `<defs>${[...defs.values()].join("")}</defs>` : ""}${opts.under || ""}${body}</svg>`;
  }

  // Bestiary Forge's layout: one entry per placement, left parts mirrored by the Bestiary itself
  const layout = (placements) => placements.map((p) => ({ part: p.part, x: +p.x.toFixed(2), y: +p.y.toFixed(2), scale: +p.scale.toFixed(3) }));

  window.CreatureCells = { plan, cells, compose, svg, bounds, layout, place, segRange, repeatRow };
})();
