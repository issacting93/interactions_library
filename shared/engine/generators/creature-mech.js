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
        cell: opts.cell + i, joint: at.slice(), strut: i === 0 && !!opts.strut, len: g.len, ang: g.ang });
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

  /* ---------- walking ----------
     rig(byId, opts): the same machine split into a body (everything but the legs) and four legs,
     each a hip, two segments (part, length, scale) and a foot, left and right as their own legs.
     walker(rig) -> W; step(W, dt, P) moves the body sideways (P.speed px/s) and steps the feet:
     a foot stays planted on the ground until it trails its home by P.stride of the leg's reach,
     then swings ahead on an arc P.lift high; diagonal pairs take turns (trot), or one at a time
     (crawl). Each leg is solved by two-bone IK, the far knees up, the near knees out.
     pose(W) -> placements around the body for CreatureCells.svg / CreatureLook.svg. */
  const DEFAULT_WALK = { gait: "trot", speed: 60, stride: 0.34, lift: 0.22, bob: 2.2 };
  function rig(byId, opts) {
    const { placements } = build(byId, opts);
    const isLeg = (p) => /^(far|near)[01]$|Foot$|^hip/.test(p.cell);
    const body = placements.filter((p) => !isLeg(p)), legs = [];
    for (const kind of ["far", "near"]) {
      const segs = [0, 1].map((i) => placements.find((p) => p.cell === kind + i)).filter(Boolean);
      if (segs.length < 2) continue;
      const foot = placements.find((p) => p.cell === kind + "Foot"), hip = segs[0].joint;
      const hipPart = placements.find((p) => p.cell === "hip" + hip[1]);
      const end = [segs[1].joint[0] + Math.cos(segs[1].ang * DEG) * segs[1].len, segs[1].joint[1] + Math.sin(segs[1].ang * DEG) * segs[1].len];
      for (const side of [0, 1]) {
        const mx = (p) => (side ? [2 * AXIS - p[0], p[1]] : p.slice());
        legs.push({ kind, side, name: (side ? "R" : "L") + "-" + kind, hip: mx(hip), rest: mx(end),
          segs: segs.map((q) => ({ part: q.part, len: q.len, scale: q.scale, axis: axisOf(byId[q.part]) })),
          footPart: foot && { part: foot.part, scale: foot.scale }, hipPart: hipPart && { part: hipPart.part, scale: hipPart.scale } });
      }
    }
    const ground = Math.max(...legs.map((l) => l.rest[1]));
    return { byId, body, legs, ground };
  }
  function walker(R) {
    return { R, x: 0, t: 0, steps: 0, legs: R.legs.map((l) => ({ ...l, foot: l.rest.slice(), from: null, u: 0, stepping: false, hist: [] })) };
  }
  // diagonal pairs: L-near with R-far, R-near with L-far
  const pairOf = (L) => ((L.kind === "near") === !L.side ? 0 : 1);
  function step(W, dt, params) {
    const P = { ...DEFAULT_WALK, ...(params || {}) }, T = 0.3;
    W.t += dt; W.x += P.speed * dt;
    const reach = (L) => L.segs[0].len + L.segs[1].len;
    const home = (L) => L.rest[0] + W.x;
    const busy = (L) => W.legs.some((o) => o !== L && o.stepping && (P.gait === "crawl" || pairOf(o) !== pairOf(L)));
    const want = W.legs.filter((L) => !L.stepping && home(L) - L.foot[0] > P.stride * reach(L)).sort((a, b) => (home(b) - b.foot[0]) - (home(a) - a.foot[0]));
    for (const L of want) if (!L.stepping && (!busy(L) || home(L) - L.foot[0] > 2.2 * P.stride * reach(L))) {
      L.stepping = true; L.u = 0; L.from = L.foot.slice();
      if (P.gait === "trot") for (const o of W.legs) if (o !== L && !o.stepping && pairOf(o) === pairOf(L)) { o.stepping = true; o.u = 0; o.from = o.foot.slice(); }
    }
    for (const L of W.legs) {
      if (L.stepping) {
        L.u = Math.min(1, L.u + dt / T);
        const e = L.u * L.u * (3 - 2 * L.u), to = home(L) + P.speed * T * 0.9;
        L.foot = [L.from[0] + (to - L.from[0]) * e, L.rest[1] - Math.sin(Math.PI * L.u) * P.lift * reach(L)];   // each pair on its own ground line: the far one higher, further back
        if (L.u >= 1) { L.stepping = false; W.steps++; L.foot[1] = L.rest[1]; }
      }
      L.hist.push(L.stepping ? 0 : 1); if (L.hist.length > 160) L.hist.shift();
    }
    // the body dips as feet land and lifts mid-stride
    const air = W.legs.filter((L) => L.stepping);
    W.bob = air.length ? -Math.sin(Math.PI * Math.max(...air.map((L) => L.u))) * P.bob : 0;
  }
  // two-bone IK: hip H to foot F, knee on the side `dir` points to
  function ik(H, F, a, b, dir) {
    let dx = F[0] - H[0], dy = F[1] - H[1], d = Math.hypot(dx, dy) || 1;
    const dd = Math.max(Math.abs(a - b) + 0.5, Math.min(a + b - 0.01, d));
    const base = Math.atan2(dy, dx), k = Math.acos(Math.max(-1, Math.min(1, (a * a + dd * dd - b * b) / (2 * a * dd))));
    const c1 = [H[0] + a * Math.cos(base + k), H[1] + a * Math.sin(base + k)], c2 = [H[0] + a * Math.cos(base - k), H[1] + a * Math.sin(base - k)];
    const s = (c) => (c[0] - H[0]) * dir[0] + (c[1] - H[1]) * dir[1];
    const knee = s(c1) >= s(c2) ? c1 : c2;
    const reachF = [H[0] + dx / d * dd, H[1] + dy / d * dd];
    return { knee, foot: d > dd ? reachF : F };
  }
  function pose(W) {
    const R = W.R, out = [], by = W.bob || 0;
    const rel = (p) => [p[0] - W.x, p[1]];                     // world -> around the body
    const legsOf = (kind) => W.legs.filter((L) => L.kind === kind);
    const drawLeg = (L) => {
      const H = [L.hip[0], L.hip[1] + by], F = rel(L.foot);
      const out2 = (L.side ? 1 : -1), dir = L.kind === "far" ? [out2 * 0.3, -1] : [out2, -0.25];
      const { knee, foot } = ik(H, F, L.segs[0].len, L.segs[1].len, dir);
      [[H, knee], [knee, foot]].forEach(([A, B], i) => {
        const g = L.segs[i];
        out.push({ part: g.part, ...along(R.byId[g.part], A, B, !!L.side, g.scale), flip: !!L.side,
          side: "c", role: "cell", cell: L.name + i, free: true, joint: A, bolt: true });
      });
      if (L.footPart) out.push({ part: L.footPart.part, x: foot[0], y: foot[1] + 4, scale: L.footPart.scale, rot: 0, flip: !!L.side, side: "c", role: "cell", cell: L.name + "Foot", free: true, joint: foot, bolt: true });
      if (L.hipPart) out.push({ part: L.hipPart.part, x: H[0], y: H[1], scale: L.hipPart.scale, rot: 0, flip: !!L.side, side: "c", role: "cell", cell: L.name + "Hip", free: true });
    };
    legsOf("far").forEach(drawLeg);
    for (const p of R.body) out.push({ ...p, y: p.y + by, joint: p.joint && [p.joint[0], p.joint[1] + by] });
    legsOf("near").forEach(drawLeg);
    return out;
  }

  window.CreatureMech = { PICKS, build, rig, walker, step, pose, DEFAULT_WALK };
})();
