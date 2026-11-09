/*
 * Forge — creature mech. Arranges kit parts into a walking machine seen from the front: a hull
 * with a lit visor over a turret and base ring, side pods, an antenna, and four legs (a near pair
 * planted wide, a far pair with knees raised behind). Two ways to place the same parts:
 *
 *   free   each piece where it looks right: hand angles and lengths
 *   hex    the same body plan on a flat-top hex lattice of cell size s: body pieces sit on cell
 *          centres, every leg segment runs along a lattice ray (multiples of 30°) and spans a whole
 *          number of cell steps, so all four legs share one rhythm
 *
 *   CreatureMech.PICKS                       default part ids for each role
 *   CreatureMech.build(byId, { mode, s, picks, cells }) -> { placements, lattice }
 *       cells (hex mode): lengths in cell steps { hull, thigh, shin, farThigh, farShin }
 *       placements  CreatureCells-style ({ part, x, y, scale, rot, side, role, cell, joint, ... });
 *                   draw with CreatureCells.svg or CreatureLook.svg
 *       lattice     hex mode: { s, cells: [[x, y]], used: [[x, y]] } for drawing the grid behind
 *
 * Pure: no DOM. Classic script.
 */
(function () {
  "use strict";
  const AXIS = 200, DEG = Math.PI / 180;
  const PICKS = {
    hull: "P619", visor: "P355", turret: "P353", base: "P024", pod: "P523", hip: "P099",
    thigh: "P396", shin: "P183", farThigh: "P245", farShin: "P187", foot: "P444", antenna: "P187", tip: "P598",
  };

  // a part's long axis in its own drawing (0° = along x)
  const axisOf = (p) => (p.w >= p.h ? 0 : 90);
  const longOf = (p) => Math.max(p.w, p.h);

  // a leg: from the hip, segments [{ part, ang, len }] -> placements + joints
  function chain(byId, hip, segs, opts) {
    const out = [];
    let at = hip.slice();
    segs.forEach((g, i) => {
      const p = byId[g.part]; if (!p) return;
      const end = [at[0] + Math.cos(g.ang * DEG) * g.len, at[1] + Math.sin(g.ang * DEG) * g.len];
      const mid = [(at[0] + end[0]) / 2, (at[1] + end[1]) / 2];
      out.push({ part: p.id, x: mid[0], y: mid[1], scale: (g.len * 1.08) / longOf(p), rot: g.ang - axisOf(p), side: "l", role: "cell",
        cell: opts.cell + i, joint: at.slice(), strut: i === 0 && !!opts.strut });
      at = end;
    });
    return { placements: out, end: at };
  }

  function build(byId, opts) {
    opts = opts || {};
    const P = { ...PICKS, ...(opts.picks || {}) }, hex = opts.mode === "hex", s = opts.s || 22;
    // hex mode proportions, in cell steps: hull width, near thigh/shin, far thigh/shin
    const C = { hull: 4, thigh: 2, shin: 3, farThigh: 2, farShin: 3, ...(opts.cells || {}) };
    const out = [], lattice = hex ? { s, cells: [], used: [] } : null;
    const step = Math.sqrt(3) * s;                     // centre-to-centre along a lattice ray
    // flat-top hex centres: columns 1.5 s apart, every other column shifted half a row
    const snap = (x, y) => {
      if (!hex) return [x, y];
      const c = Math.round((x - AXIS) / (1.5 * s)), off = (c & 1) ? step / 2 : 0;
      const r = Math.round((y - off) / step);
      return [AXIS + c * 1.5 * s, r * step + off];
    };
    const ang = (a) => (hex ? Math.round(a / 30) * 30 : a);
    const len = (cells, free) => (hex ? cells * step : free);
    const fit = (id, size) => { const p = byId[id]; return p ? size / longOf(p) : 1; };
    const put = (id, x, y, scale, extra) => { if (byId[id]) { const [sx, sy] = snap(x, y); out.push({ part: id, x: sx, y: sy, scale, rot: 0, side: "c", role: "cell", cell: id + out.length, ...extra }); if (lattice) lattice.used.push([sx, sy]); return [sx, sy]; } return [x, y]; };

    // body, top to bottom: hull, visor in its jaw, turret, base ring
    const unit = hex ? step : 34;
    const hull = put(P.hull, AXIS, 110, fit(P.hull, hex ? C.hull * step : 150));
    put(P.visor, AXIS, hull[1] + (hex ? step * 0.5 : 18), fit(P.visor, hex ? 2 * step : 66), { glow: true, free: true });
    const tur = put(P.turret, AXIS, hull[1] + (hex ? 1.5 * step : 52), fit(P.turret, hex ? 1.6 * step : 52));
    const base = put(P.base, AXIS, tur[1] + (hex ? step : 34), fit(P.base, hex ? 1.4 * step : 46));
    // side pods beside the hull, antenna off the left shoulder (no mirror)
    const pod = snap(AXIS - (hex ? 3 * 1.5 * s : 78), hull[1] + (hex ? 0 : 6));
    if (byId[P.pod]) out.push({ part: P.pod, x: pod[0], y: pod[1], scale: fit(P.pod, hex ? 1.4 * step : 46), rot: 0, side: "l", role: "cell", cell: "pod", strut: false });
    if (byId[P.antenna]) {
      const a0 = snap(AXIS - (hex ? 2 * 1.5 * s : 48), hull[1] - (hex ? 1.5 * step : 52));
      out.push({ part: P.antenna, x: a0[0], y: a0[1], scale: fit(P.antenna, hex ? 2 * step : 66), rot: 0, side: "c", role: "cell", cell: "antenna", free: true });
      if (byId[P.tip]) out.push({ part: P.tip, x: a0[0], y: a0[1] - (hex ? step : 33), scale: fit(P.tip, hex ? 0.5 * step : 14), rot: 0, side: "c", role: "cell", cell: "tip", free: true, glow: true });
    }

    // legs: the far pair first (behind), knees up; then the near pair, planted wide
    const hipFar = snap(AXIS - (hex ? 2 * 1.5 * s : 46), tur[1] - (hex ? step * 0.5 : 14));
    const hipNear = snap(AXIS - (hex ? 1.5 * s : 30), base[1]);
    const far = chain(byId, hipFar, [
      { part: P.farThigh, ang: ang(hex ? 210 : 203), len: len(C.farThigh, 70) },
      { part: P.farShin, ang: ang(hex ? 120 : 112), len: len(C.farShin, 104) },
    ], { cell: "far", strut: true });
    const near = chain(byId, hipNear, [
      { part: P.thigh, ang: ang(hex ? 150 : 145), len: len(C.thigh, 74) },
      { part: P.shin, ang: ang(hex ? 90 : 98), len: len(C.shin, 108) },
    ], { cell: "near", strut: true });
    for (const q of far.placements) q.scale *= 0.92;
    const foot = (end, k, cell) => byId[P.foot] && out.push({ part: P.foot, x: end[0], y: end[1] + 4, scale: fit(P.foot, (hex ? 1.2 * step : 40) * k), rot: 0, side: "l", role: "cell", cell, strut: false, joint: end.slice() });
    const hips = [hipFar, hipNear].map((h) => ({ part: P.hip, x: h[0], y: h[1], scale: fit(P.hip, hex ? 1.1 * step : 36), rot: 0, side: "l", role: "cell", cell: "hip" + h[1], strut: false, joint: h.slice() }));
    // paint order: far legs, far foot, body, near legs, near foot, hips
    const body = out.splice(0);
    out.push(...far.placements); foot(far.end, 0.85, "farFoot");
    out.push(...body, ...near.placements); foot(near.end, 1, "nearFoot");
    if (byId[P.hip]) out.push(...hips);

    if (lattice) {
      for (let c = -7; c <= 7; c++) for (let r = 0; r < 14; r++) {
        const off = (c & 1) ? step / 2 : 0; lattice.cells.push([AXIS + c * 1.5 * s, r * step + off]);
      }
      for (const q of [...far.placements, ...near.placements]) lattice.used.push(q.joint);
      lattice.used.push(far.end, near.end);
    }
    return { placements: out, lattice };
  }

  window.CreatureMech = { PICKS, build };
})();
