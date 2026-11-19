/*
 * Forge — the Maw as cells. Compose's hex grid (creature-cells.js: a spine column, side cells mirrored
 * across it, one kit part to a cell) laid out for the Maw's body plan (ecology-maw.js: head, neck,
 * shoulders with a leg pair, back, haunch with a leg pair, tail; a meal grows a bladed neck row or a body
 * row with legs). The pieces are the Maw's own kit parts and its donors'. Two dials:
 *
 *   grid     how many spine cells a hatchling is long (7 is the game's Maw today: one cell a row).
 *            The body stays the same size, so a finer grid means smaller cells and smaller pieces.
 *   density  "sparse" (the spine, the legs and some of the side cells, each piece smaller than its cell),
 *            "even" (every cell, each piece fitted to its cell), "packed" (every cell, pieces grown past
 *            their cells so they overlap, and a small piece riding every spine cell)
 *
 *   MawCells.compose(byId, { grid, density, seed, grow: { reach, bulk, wide } }) ->
 *       { placements, lattice: [{ x, y, col, row, used }], s, cells, pieces, rows, lanes }
 *       placements  CreatureCells-shaped ({ part, x, y, scale, rot, side, role, cell }) on the 400-wide plan,
 *                   plus col, row (the cell) and teeth: true for the mouth's tusks; draw with CreatureCells.svg
 *
 * Pure: no DOM. Classic script -> window.MawCells.
 */
(function () {
  "use strict";
  const AXIS = 200, S3 = Math.sqrt(3), U = 46, { max, min, round, floor } = Math;   // U: sheet units in one row of the 7-cell Maw
  const hash = (a, b, c) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  // the body plan, head to tail: share of a hatchling's 7 rows, half-width in rows, and which pieces fill its cells
  //   spine: the first cell's piece, then the pool for the rest; side: lane 1, then the outer lanes; leg: the piece beyond the last lane
  const ZONES = {
    head:      { n: 1, hw: 0.42, spine: ["P277"], more: ["P274"], side: [["P273"], ["P275"]] },
    neck:      { n: 2, hw: 0.2, spine: ["P280"], more: ["P280", "P274"], side: [["P283"], ["P275"]] },
    "neck+":   { n: 1, hw: 0.95, spine: ["P594"], more: ["P594"], side: [["P578"], ["P281", "P282"]], grown: true },
    shoulders: { n: 1, hw: 1.2, spine: ["P246"], more: ["P253", "P255"], side: [["P284", "P281"], ["P282", "P261"]], leg: "P252" },
    back:      { n: 1, hw: 0.5, spine: ["P253"], more: ["P255", "P257"], side: [["P283"], ["P282"]] },
    "row+":    { n: 1, hw: 1.15, spine: ["P259"], more: ["P259", "P255"], side: [["P261"], ["P281", "P028"]], leg: "P254", grown: true },
    haunch:    { n: 1, hw: 1.05, spine: ["P251"], more: ["P257", "P255"], side: [["P281", "P284"], ["P282"]], leg: "P256" },
    tail:      { n: 1, hw: 0.3, spine: ["P257"], more: ["P257"], last: "P276", side: [["P278"], ["P279"]] },
  };
  const TUSK = "P026", RIDER = ["P024", "P247", "P248", "P444"];
  const DENSITY = { sparse: { fill: 0.45, fit: 0.82, riders: false }, even: { fill: 1, fit: 1.02, riders: false }, packed: { fill: 1, fit: 1.38, riders: true } };

  function compose(byId, o) {
    o = o || {};
    const G = o.grid || 7, seed = o.seed || 1, g = Object.assign({ reach: 0, bulk: 0, wide: 0 }, o.grow || {}), D = DENSITY[o.density] || DENSITY.even;
    const pitch = (7 * U) / G, s = pitch / S3, colW = 1.5 * s, per = G / 7;   // row pitch, hex radius, column pitch (flat-top cells), cells per original row
    const order = ["head", "neck"]; for (let i = 0; i < g.reach; i++) order.push("neck+"); order.push("shoulders", "back"); for (let i = 0; i < g.bulk; i++) order.push("row+"); order.push("haunch", "tail");
    // spine rows: each zone gets its share of cells; a zone of several cells puts its named piece first (the tail: last)
    const rows = []; let carry = 0;
    order.forEach((key, zi) => { const Z = ZONES[key], want = Z.n * per + carry, n = max(1, round(want)); carry = want - n;
      for (let i = 0; i < n; i++) rows.push({ key, Z, zi, i, n, u: (i + 0.5) / n }); });
    const out = [], lattice = [], y0 = 60;
    const fitTo = (p, k) => k * min((2 * s) / p.w, (pitch * 1.12) / p.h);
    const pick = (pool, a, b) => pool[floor(hash(a, b, seed) * pool.length) % pool.length];
    const put = (id, col, row, extra) => { const p = byId[id]; if (!p) return;
      const x = AXIS - col * colW, y = y0 + row * pitch + (col & 1 ? pitch / 2 : 0);
      out.push(Object.assign({ part: id, x, y, scale: fitTo(p, D.fit), rot: 0, side: col ? "l" : "c", role: "cell", cell: (col ? "l" : "s") + col + "_" + row, col, row }, extra || {})); };
    let lanesMax = 0;
    rows.forEach((R, row) => { const Z = R.Z, lanes = floor((Z.hw * U * (0.75 + 0.25 * Math.sin(Math.PI * R.u))) / colW + 0.35); lanesMax = max(lanesMax, lanes);
      const first = R.key === "tail" ? R.i === R.n - 1 : R.i === 0, id = first ? (Z.last || Z.spine[0]) : pick(Z.more, row, 1);
      put(id, 0, row); lattice.push({ col: 0, row, used: true });
      if (D.riders && !first) { const r = byId[pick(RIDER, row, 5)]; if (r) out.push({ part: r.id, x: AXIS, y: y0 + row * pitch, scale: (s * 0.7) / max(r.w, r.h), rot: 0, side: "c", role: "detail", cell: "s0_" + row, col: 0, row }); }
      const legRow = Z.leg && R.i === (R.n >> 1);
      for (let col = 1; col <= lanes; col++) { const tusk = R.key === "head" && col <= g.wide, used = tusk || hash(col, row, seed + 11) < D.fill; lattice.push({ col, row, used });
        if (used) put(tusk ? TUSK : pick(Z.side[col === 1 ? 0 : 1], row, col), col, row, tusk ? { teeth: true } : null); }
      if (R.key === "head") for (let col = lanes + 1; col <= g.wide; col++) { put(TUSK, col, row, { teeth: true }); lattice.push({ col, row, used: true }); lanesMax = max(lanesMax, col); }
      if (legRow) { const col = lanes + 1; lanesMax = max(lanesMax, col); lattice.push({ col, row, used: true, leg: true });
        const p = byId[Z.leg]; if (p) { const k = max(1.1, D.fit) * (2.6 * s) / p.w; out.push({ part: Z.leg, x: AXIS - (lanes + 0.5) * colW - (p.w * k) / 2, y: y0 + row * pitch + (col & 1 ? pitch / 2 : 0), scale: k, rot: 0, side: "l", role: "cell", cell: "l" + col + "_" + row, col, row, leg: true }); } }
    });
    for (const c of lattice) { c.x = AXIS - c.col * colW; c.y = y0 + c.row * pitch + (c.col & 1 ? pitch / 2 : 0); }
    return { placements: out, lattice, s, pitch, rows: rows.length, lanes: lanesMax, cells: lattice.filter((c) => c.used).reduce((n, c) => n + (c.col ? 2 : 1), 0), pieces: out.reduce((n, p) => n + (p.side === "l" ? 2 : 1), 0) };
  }
  window.MawCells = { compose, ZONES, DENSITY };
})();
