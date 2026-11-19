/*
 * Forge — the Maw as cells. Compose's hex grid (creature-cells.js: a spine column, side cells mirrored
 * across it, kit parts in the cells) laid out for the Maw's body plan (ecology-maw.js: head, neck,
 * shoulders with a leg pair, back, haunch with a leg pair, tail; a meal grows a collar or a body row with
 * legs, or tusks). Three sizes of shape, as the specimens themselves are drawn:
 *
 *   anchors  one large plate a zone, the biggest centre pieces in the kit (a carapace, a crest, a ring),
 *            each covering a cluster of cells and snapped to the lattice
 *   legs     two pieces a leg, a knuckled thigh and a barbed sickle for the shin, so the knee is a joint
 *            between two drawings (LimbArt.segmentArt), never a cut through one
 *   fills    small pieces in the cells the anchors leave open along the flanks; riders on the anchors
 *
 *   grid     lattice rows down a hatchling (7 ... 20). Anchors keep their size; a finer grid snaps them
 *            more closely and makes the fills smaller and more numerous.
 *   density  "sparse" anchors and legs only; "even" plus fills on most open flank cells; "packed" every
 *            open cell filled, pieces grown past their cells, and riders on the anchors
 *
 *   MawCells.compose(byId, { grid, density, seed, grow: { reach, bulk, wide } }) ->
 *       { placements, legs, lattice: [{ x, y, col, row, used }], s, pitch, rows, lanes, cells, pieces }
 *       placements  CreatureCells-shaped ({ part, x, y, scale, rot, side, role: anchor | cell | detail }) on the
 *                   400-wide plan, plus col (the lane it sits in) and teeth: true for tusks
 *       legs        [{ kind, hip, knee, foot: [x, y], parts: [thigh, shin], fracs, len }] on the left; mirror for the right
 *
 * Pure: no DOM. Classic script -> window.MawCells.
 */
(function () {
  "use strict";
  const AXIS = 200, S3 = Math.sqrt(3), U = 46, { max, min, round, floor, ceil, abs } = Math;   // U: sheet units in one row of the 7-row Maw
  const hash = (a, b, c) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  // the anchors, head to tail: the piece, its width in rows, how far the next one tucks under it, and its legs
  const PLAN = {
    head:      { id: "P653", w: 1.55, lap: 0.8 },                       // an open ring: the mouth
    neck:      { id: "P654", w: 1.0, lap: 0.86 },                       // a barbed column
    "neck+":   { id: "P650", w: 2.5, lap: 0.9, grown: true },           // a collar
    shoulders: { id: "P075", w: 3.3, lap: 0.74, leg: "front" },         // the strider's carapace
    back:      { id: "P562", w: 2.0, lap: 0.8 },
    "row+":    { id: "P456", w: 2.8, lap: 0.8, leg: "extra", grown: true },
    haunch:    { id: "P272", w: 2.6, lap: 0.8, leg: "hind" },
    tail:      { id: "P426", w: 1.25, lap: 0.8 },
    sting:     { id: "P080", w: 0.44, lap: 1 },
  };
  // a leg: where the knee and the foot lie from the hip in the top view (x outward, y toward the tail), in leg lengths
  const LEG = { len: 2.9, fracs: [0.44, 0.56], thigh: "P395",
    front: { shin: "P077", knee: [0.36, -0.26], foot: [0.86, 0.02] }, extra: { shin: "P078", knee: [0.42, -0.1], foot: [0.9, 0.2] }, hind: { shin: "P077", knee: [0.36, 0.26], foot: [0.84, 0.5] } };
  const TUSK = "P026", FILL = ["P281", "P282", "P283", "P284", "P275", "P273"], RIDER = ["P024", "P247", "P248"];
  const DENSITY = { sparse: { fill: 0, fit: 1, riders: 0 }, even: { fill: 0.7, fit: 1, riders: 0 }, packed: { fill: 1, fit: 1.3, riders: 0.6 } };

  function compose(byId, o) {
    o = o || {};
    const G = o.grid || 7, seed = o.seed || 1, g = Object.assign({ reach: 0, bulk: 0, wide: 0 }, o.grow || {}), D = DENSITY[o.density] || DENSITY.even;
    const pitch = (7 * U) / G, s = pitch / S3, colW = 1.5 * s, y0 = 60;
    const order = ["head", "neck"]; for (let i = 0; i < g.reach; i++) order.push("neck+"); order.push("shoulders", "back"); for (let i = 0; i < g.bulk; i++) order.push("row+"); order.push("haunch", "tail", "sting");
    const out = [], legs = [], boxes = []; let cur = y0;
    // the anchors: stacked head to tail, each tucked under the one before, its centre snapped to a lattice row
    for (const key of order) { const Z = PLAN[key], p = byId[Z.id]; if (!p) continue;
      const k = ((Z.w + (key === "head" ? 0.22 * g.wide : 0)) * U) / p.w, h = p.h * k, w = p.w * k, y = y0 + round((cur + h / 2 - y0) / pitch) * pitch;
      out.push({ part: Z.id, x: AXIS, y, scale: k, rot: 0, side: "c", role: "anchor", cell: key + out.length, col: 0, zone: key }); boxes.push({ y, h, w, key }); cur += h * Z.lap;
      if (key === "head") for (let i = 0; i < g.wide; i++) { const t = byId[TUSK]; if (t) { const kt = (1.15 * U) / t.h; out.push({ part: TUSK, x: AXIS - w * 0.42 - (i + 0.5) * t.w * kt * 0.7, y: y - h * 0.05 + i * pitch * 0.4, scale: kt, rot: 0, side: "l", role: "cell", cell: "tusk" + i, col: 1 + i, teeth: true }); } }
      if (Z.leg) { const L = LEG[Z.leg], len = LEG.len * U, hip = [AXIS - w * 0.36, y];
        legs.push({ kind: Z.leg, hip, knee: [hip[0] - L.knee[0] * len, hip[1] + L.knee[1] * len], foot: [hip[0] - L.foot[0] * len, hip[1] + L.foot[1] * len], parts: [LEG.thigh, L.shin], fracs: LEG.fracs, len }); }
    }
    // the lattice under them: a cell is taken when it lies under an anchor; the open cells beside the anchors are where fills go
    const rows = ceil((cur - y0) / pitch) + 1, lattice = []; let lanesMax = 0, filled = 0;
    const under = (x, y) => boxes.some((b) => abs(y - b.y) < b.h * 0.4 && abs(x - AXIS) < b.w * 0.4);
    const halfAt = (y) => boxes.reduce((m, b) => (abs(y - b.y) < b.h * 0.5 ? max(m, b.w / 2) : m), 0);
    for (let row = 0; row < rows; row++) for (let col = 0; col <= 12; col++) { const x = AXIS - col * colW, y = y0 + row * pitch + (col & 1 ? pitch / 2 : 0), hw = halfAt(y);
      if (!hw || col * colW > hw + colW * 0.6) break;
      const taken = under(x, y), fill = !taken && col > 0 && hash(col, row, seed + 11) < D.fill; lattice.push({ col, row, x, y, used: taken || fill, anchor: taken }); lanesMax = max(lanesMax, col);
      if (fill) { const id = FILL[floor(hash(row, col, seed) * FILL.length)], p = byId[id]; if (p) { filled++; out.push({ part: id, x, y, scale: D.fit * min((2 * s) / p.w, (pitch * 1.1) / p.h), rot: 0, side: "l", role: "cell", cell: "f" + col + "_" + row, col }); } }
      if (taken && !col && hash(row, 3, seed) < D.riders) { const id = RIDER[floor(hash(row, 9, seed) * RIDER.length)], p = byId[id]; if (p) out.push({ part: id, x, y, scale: (s * 0.9) / max(p.w, p.h), rot: 0, side: "c", role: "detail", cell: "r" + row, col: 0 }); } }
    return { placements: out, legs, lattice, s, pitch, rows, lanes: lanesMax, cells: lattice.filter((c) => c.used).reduce((n, c) => n + (c.col ? 2 : 1), 0), pieces: out.reduce((n, p) => n + (p.side === "l" ? 2 : 1), 0) + legs.length * 4 };
  }
  window.MawCells = { compose, PLAN, LEG, DENSITY };
})();
