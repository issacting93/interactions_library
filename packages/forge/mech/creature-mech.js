/*
 * Forge — creature mech. Arranges kit parts into a machine seen from the front (it walks in 3D in
 * the Walker Bestiary, via Compose's "Walk in 3D"): a hull
 * with a lit visor over a turret and base ring, side pods, an antenna, and four legs (a near pair
 * planted wide, a far pair with knees raised behind). Two ways to place the same parts:
 *
 *   free   each piece where it looks right: hand angles and lengths
 *   hex    the same body plan on a flat-top hex lattice of cell size s: body pieces sit on cell
 *          centres, every leg segment runs along a lattice ray (multiples of 30°) and spans a whole
 *          number of cell steps, so all four legs share one rhythm
 *
 *   CreatureMech.PICKS                       default part ids for each role
 *   CreatureMech.along(part, A, B, flip) -> { x, y, scale, rot }: a part laid along the segment A->B
 *   CreatureMech.build(byId, { mode, s, picks, cells }) -> { placements, lattice }
 *       cells (hex mode): lengths in cell steps { hull, thigh, shin, farThigh, farShin }
 *       placements  CreatureCells-style (each tagged with its slot: hull, visor, turret, base, pod,
 *                   antenna, tip, thigh, shin, farThigh, farShin, foot, hip)
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

  // a part's long axis in its own drawing: the two outline points furthest apart (a blade drawn
  // on a slant runs along its slant, not its box), their angle, length and midpoint
  const axisCache = new Map();
  function axisInfo(p) {
    if (axisCache.has(p.id)) return axisCache.get(p.id);
    const pts = [];
    for (const pl of (window.CreatureArch ? window.CreatureArch.partPolys(p) : [])) for (const q of pl) pts.push(q);
    const step = Math.max(1, Math.floor(pts.length / 160)), sm = pts.filter((_, i) => i % step === 0);
    let a = null, b = null, best = -1;
    for (let i = 0; i < sm.length; i++) for (let j = i + 1; j < sm.length; j++) { const d = (sm[i][0] - sm[j][0]) ** 2 + (sm[i][1] - sm[j][1]) ** 2; if (d > best) { best = d; a = sm[i]; b = sm[j]; } }
    const info = a ? { ang: Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG, len: Math.sqrt(best), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }
      : { ang: p.w >= p.h ? 0 : 90, len: Math.max(p.w, p.h), mid: [0, 0] };
    axisCache.set(p.id, info);
    return info;
  }
  const axisOf = (p) => axisInfo(p).ang;
  const longOf = (p) => axisInfo(p).len;
  // place part p along the segment A->B: its axis on the segment, its axis midpoint on the middle
  function along(p, A, B, flip, k) {
    const I = axisInfo(p), ang = Math.atan2(B[1] - A[1], B[0] - A[0]) / DEG, L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const scale = (k || (L * 1.08) / I.len), pa = flip ? 180 - I.ang : I.ang, mid = flip ? [-I.mid[0], I.mid[1]] : I.mid;
    const rot = ang - pa, r = rot * DEG, mx = mid[0] * scale, my = mid[1] * scale;
    return { x: (A[0] + B[0]) / 2 - (Math.cos(r) * mx - Math.sin(r) * my), y: (A[1] + B[1]) / 2 - (Math.sin(r) * mx + Math.cos(r) * my), scale, rot };
  }

  // a leg: from the hip, segments [{ part, ang, len }] -> placements + joints
  function chain(byId, hip, segs, opts) {
    const out = [];
    let at = hip.slice();
    segs.forEach((g, i) => {
      const p = byId[g.part]; if (!p) return;
      const end = [at[0] + Math.cos(g.ang * DEG) * g.len, at[1] + Math.sin(g.ang * DEG) * g.len];
      out.push({ part: p.id, ...along(p, at, end, false), side: "l", role: "cell",
        cell: opts.cell + i, joint: at.slice(), strut: i === 0 && !!opts.strut, len: g.len, ang: g.ang, slot: g.slot });
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
    const hull = put(P.hull, AXIS, 110, fit(P.hull, hex ? C.hull * step : 150), { slot: "hull" });
    put(P.visor, AXIS, hull[1] + (hex ? step * 0.5 : 18), fit(P.visor, hex ? 2 * step : 66), { glow: true, free: true, slot: "visor" });
    const tur = put(P.turret, AXIS, hull[1] + (hex ? 1.5 * step : 52), fit(P.turret, hex ? 1.6 * step : 52), { slot: "turret" });
    const base = put(P.base, AXIS, tur[1] + (hex ? step : 34), fit(P.base, hex ? 1.4 * step : 46), { slot: "base" });
    // side pods beside the hull, antenna off the left shoulder (no mirror)
    const pod = snap(AXIS - (hex ? 3 * 1.5 * s : 78), hull[1] + (hex ? 0 : 6));
    if (byId[P.pod]) out.push({ part: P.pod, x: pod[0], y: pod[1], scale: fit(P.pod, hex ? 1.4 * step : 46), rot: 0, side: "l", role: "cell", cell: "pod", strut: false, slot: "pod" });
    if (byId[P.antenna]) {
      const a0 = snap(AXIS - (hex ? 2 * 1.5 * s : 48), hull[1] - (hex ? 1.5 * step : 52));
      out.push({ part: P.antenna, x: a0[0], y: a0[1], scale: fit(P.antenna, hex ? 2 * step : 66), rot: 0, side: "c", role: "cell", cell: "antenna", free: true, slot: "antenna" });
      if (byId[P.tip]) out.push({ part: P.tip, x: a0[0], y: a0[1] - (hex ? step : 33), scale: fit(P.tip, hex ? 0.5 * step : 14), rot: 0, side: "c", role: "cell", cell: "tip", free: true, glow: true, slot: "tip" });
    }

    // legs: the far pair first (behind), knees up; then the near pair, planted wide
    const hipFar = snap(AXIS - (hex ? 2 * 1.5 * s : 46), tur[1] - (hex ? step * 0.5 : 14));
    const hipNear = snap(AXIS - (hex ? 1.5 * s : 30), base[1]);
    const far = chain(byId, hipFar, [
      { part: P.farThigh, ang: ang(hex ? 210 : 203), len: len(C.farThigh, 70), slot: "farThigh" },
      { part: P.farShin, ang: ang(hex ? 120 : 112), len: len(C.farShin, 104), slot: "farShin" },
    ], { cell: "far", strut: true });
    const near = chain(byId, hipNear, [
      { part: P.thigh, ang: ang(hex ? 150 : 145), len: len(C.thigh, 74), slot: "thigh" },
      { part: P.shin, ang: ang(hex ? 90 : 98), len: len(C.shin, 108), slot: "shin" },
    ], { cell: "near", strut: true });
    const foot = (end, k, cell) => byId[P.foot] && out.push({ part: P.foot, x: end[0], y: end[1] + 4, scale: fit(P.foot, (hex ? 1.2 * step : 40) * k), rot: 0, side: "l", role: "cell", cell, strut: false, joint: end.slice(), slot: "foot" });
    const hips = [hipFar, hipNear].map((h) => ({ part: P.hip, x: h[0], y: h[1], scale: fit(P.hip, hex ? 1.1 * step : 36), rot: 0, side: "l", role: "cell", cell: "hip" + h[1], strut: false, joint: h.slice(), slot: "hip" }));
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

  window.CreatureMech = { PICKS, build, along };
})();
