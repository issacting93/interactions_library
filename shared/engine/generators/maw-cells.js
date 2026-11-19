/*
 * Forge — the Maw as cells. Compose's hex grid (creature-cells.js: a spine column, side cells mirrored
 * across it, kit parts in the cells) laid out for the Maw's body plan (ecology-maw.js: head, neck,
 * shoulders with a leg pair, back, haunch with a leg pair, tail; a meal grows a collar or a body row with
 * legs, or tusks). Three sizes of shape, as the specimens themselves are drawn:
 *
 *   anchors  one large plate a zone, the biggest centre pieces in the kit (a carapace, a crest, a ring),
 *            each covering a cluster of cells and snapped to the lattice
 *   legs     three pieces a leg (upper, lower, hand), so it bends between drawings (LimbArt.segmentArt),
 *            never through one; eight designs to pick from (LEGS)
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
 *       legs        [{ kind, J: [hip, knee, ankle, foot] as [x, y], parts, fracs, len }] on the left; mirror for the right
 *   opts.legs: a key of MawCells.LEGS (the leg design)
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
  // the legs: three drawings a leg (upper, lower, hand or foot), one a bone, so it bends at two joints between pieces (LimbArt.segmentArt).
  //   parts: kit ids; fracs: each bone's share of the length; len: the whole leg in rows of the 7-row Maw
  const LEGS = {
    // the qilin's (the Kit Quad Mech, SpeciesRig.quad): plain tapered blades, a different pair fore and aft, and a small round foot
    qilin:   { name: "Qilin", note: "plain blades, a round foot", parts: { front: ["P128", "P183", "P444"], extra: ["P128", "P187", "P444"], hind: ["P245", "P187", "P444"] }, fracs: [0.42, 0.4, 0.18], len: 4.6 },
    stalker: { name: "Stalker", note: "long and thin, a small claw", parts: ["P396", "P187", "P424"], fracs: [0.38, 0.4, 0.22], len: 4.4 },
    raptor:  { name: "Raptor", note: "knuckled thigh, a spread talon", parts: ["P395", "P183", "P518"], fracs: [0.32, 0.34, 0.34], len: 4.2 },
    reaper:  { name: "Reaper", note: "a great clawed arm", parts: ["P430", "P396", "P171"], fracs: [0.26, 0.28, 0.46], len: 4.6 },
    sickle:  { name: "Sickle", note: "barbed crescents", parts: ["P395", "P557", "P079"], fracs: [0.32, 0.3, 0.38], len: 3.8 },
    hook:    { name: "Hook", note: "a claw thigh, a hooked foot", parts: ["P258", "P187", "P260"], fracs: [0.4, 0.34, 0.26], len: 4.0 },
    stilt:   { name: "Stilt", note: "needles, a dagger point", parts: ["P183", "P187", "P080"], fracs: [0.3, 0.3, 0.4], len: 4.8 },
    grasper: { name: "Grasper", note: "knobbed, a pincer hand", parts: ["P430", "P432", "P429"], fracs: [0.36, 0.32, 0.32], len: 3.8 },
    crawler: { name: "Crawler", note: "the pincer's own, short", parts: ["P245", "P252", "P254"], fracs: [0.34, 0.34, 0.32], len: 2.8 },
  };
  // the stance is the qilin's: legs splayed on the diagonals (52 degrees off forward in front, 128 behind, as the Quad Mech's), hips tucked
  // under the plate, and the foot resting at 0.6 of the leg's length so the knee always stands up. Seen from above the bones are foreshortened.
  const ANG = { front: 52, extra: 90, hind: 128 }, REACH = 0.6, TOP = [0.26, 0.5, REACH];
  const TUSK = "P026", FILL = ["P281", "P282", "P283", "P284", "P275", "P273"], RIDER = ["P024", "P247", "P248"];
  const DENSITY = { sparse: { fill: 0, fit: 1, riders: 0 }, even: { fill: 0.7, fit: 1, riders: 0 }, packed: { fill: 1, fit: 1.3, riders: 0.6 } };

  function compose(byId, o) {
    o = o || {};
    const G = o.grid || 7, seed = o.seed || 1, g = Object.assign({ reach: 0, bulk: 0, wide: 0 }, o.grow || {}), D = DENSITY[o.density] || DENSITY.even;
    const pitch = (7 * U) / G, s = pitch / S3, colW = 1.5 * s, y0 = 60;
    const order = ["head", "neck"]; for (let i = 0; i < g.reach; i++) order.push("neck+"); order.push("shoulders", "back"); for (let i = 0; i < g.bulk; i++) order.push("row+"); order.push("haunch", "tail", "sting");
    const out = [], legs = [], boxes = [], LS = LEGS[o.legs] || LEGS.qilin; let cur = y0;
    // the anchors: stacked head to tail, each tucked under the one before, its centre snapped to a lattice row
    for (const key of order) { const Z = PLAN[key], p = byId[Z.id]; if (!p) continue;
      const k = ((Z.w + (key === "head" ? 0.22 * g.wide : 0)) * U) / p.w, h = p.h * k, w = p.w * k, y = y0 + round((cur + h / 2 - y0) / pitch) * pitch;
      out.push({ part: Z.id, x: AXIS, y, scale: k, rot: 0, side: "c", role: "anchor", cell: key + out.length, col: 0, zone: key }); boxes.push({ y, h, w, key }); cur += h * Z.lap;
      if (key === "head") for (let i = 0; i < g.wide; i++) { const t = byId[TUSK]; if (t) { const kt = (1.15 * U) / t.h; out.push({ part: TUSK, x: AXIS - w * 0.42 - (i + 0.5) * t.w * kt * 0.7, y: y - h * 0.05 + i * pitch * 0.4, scale: kt, rot: 0, side: "l", role: "cell", cell: "tusk" + i, col: 1 + i, teeth: true }); } }
      if (Z.leg) { const len = LS.len * U, hip = [AXIS - w * 0.3, y], a = (ANG[Z.leg] * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a);
        legs.push({ kind: Z.leg, ang: ANG[Z.leg], reach: REACH, J: [hip].concat(TOP.map((t) => [hip[0] - ux * t * len, hip[1] + uy * t * len])), parts: LS.parts[Z.leg] || LS.parts, fracs: LS.fracs, len }); }
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
  window.MawCells = { compose, PLAN, LEGS, DENSITY };
})();
