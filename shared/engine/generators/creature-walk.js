/*
 * Forge — creature walk. Legs that plant their feet and step, for any species whose side
 * parts are marked as limbs (attach-points.js, kind "limb"). Ported from the Carapace Strider
 * IK study: the same three ideas, flattened to the sheet's top-down view so it runs on the
 * Rig page beside the swim clips.
 *
 *   1. Slice a drawn leg into bones. The limb point is the joint; the tip is the outline point
 *      furthest along the limb's angle. The part is cut across that axis into three bands,
 *      femur 40%, tibia 36%, tarsus 24% (FRACS), and each band rides its own bone.
 *   2. Solve each leg every frame. The tarsus lies along the hip-to-foot line; femur and
 *      tibia are found by the law of cosines with the knee bent away from the body.
 *   3. Step. The body walks up the sheet, so planted feet slide back relative to it. A foot
 *      that drifts more than `stride` from its home steps to a new spot ahead, and the gait
 *      decides which feet may be in the air together:
 *        tetrapod  two alternating sets (L1 R2 L3 R4 / the rest), like spiders; trot for 4 legs
 *        ripple    a foot waits for its neighbours and the foot opposite: a wave down a centipede
 *        wave      one foot at a time
 *        free      no coordination (shows why coordination matters)
 *
 * Mechanism only: no drawing. CreatureRig.svg draws the leg bands; a page sets each band's
 * transform from bandMatrix().
 *
 *   CreatureWalk.slice(part, limb) -> { joint, tip, L, u, cuts, bands }     (sheet px)
 *   CreatureWalk.create(rig, opts) -> walker                                (needs rig bones of kind "leg")
 *   CreatureWalk.step(walker, dt, params)                                   (params: gait, speed, stride, lift)
 *   CreatureWalk.bandMatrix(walker, leg, k) -> [a,b,c,d,e,f]                (SVG matrix for band k of a leg)
 *   CreatureWalk.GAITS, CreatureWalk.DEFAULT_WALK, CreatureWalk.FRACS
 *
 * Pure: no DOM. Classic script.
 */
(function () {
  "use strict";
  const AXIS = 200, DEG = Math.PI / 180;
  const FRACS = [0.4, 0.36, 0.24];
  const DEFAULT_WALK = { gait: "tetrapod", speed: 60, stride: 0.42, lift: 0.12 };
  const GAITS = {
    tetrapod: { label: "Tetrapod", note: "Two sets take turns: L1 R2 L3 R4, then the rest. A set lifts only while the other is planted." },
    ripple: { label: "Ripple", note: "A foot lifts only when its neighbours and the foot opposite are down, so a wave runs head to tail." },
    wave: { label: "Wave", note: "One foot at a time, the furthest from home first. Very steady, falls behind at speed." },
    free: { label: "Free", note: "Every foot steps when it likes. The pattern falls apart." },
  };
  const STEP_T = 0.24;
  const ease = (u) => u * u * (3 - 2 * u);

  // 2D affine [a,b,c,d,e,f], same layout as SVG matrix() and CreatureRig.mat
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const T = (x, y) => [1, 0, 0, 1, x, y];
  const R = (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
  const MIRROR = [-1, 0, 0, 1, 2 * AXIS, 0];

  /* ---------- 1. slice ---------- */
  // limb = { x, y, angle } in SHEET coords (AttachPoints.sheetPoint(part, store, "limb"))
  function slice(part, limb) {
    const polys = window.AttachPoints ? window.AttachPoints.polysOf(part) : [];
    const ox = part.ox || 0, oy = part.oy || 0;
    const u = [Math.cos(limb.angle * DEG), Math.sin(limb.angle * DEG)];
    let best = null, bd = -Infinity;
    for (const pl of polys) for (const [x, y] of pl) {
      const d = (x + ox - limb.x) * u[0] + (y + oy - limb.y) * u[1];
      if (d > bd) { bd = d; best = [x + ox, y + oy]; }
    }
    const L = Math.max(8, bd > 0 ? bd : Math.max(part.w, part.h) * 0.8);
    const tip = best || [limb.x + u[0] * L, limb.y + u[1] * L];
    const cuts = [0]; FRACS.reduce((acc, f) => (cuts.push((acc + f) * L), acc + f), 0);
    // band k: the strip between cut k and cut k+1, endless across the axis; the first and last
    // bands run on past the joint and the tip so no stroke is clipped off either end
    const n = [-u[1], u[0]], BIG = 2000;
    const bands = FRACS.map((_, k) => {
      const a = k === 0 ? -BIG : cuts[k], b = k === FRACS.length - 1 ? BIG : cuts[k + 1];
      const P = (t, s) => [limb.x + u[0] * t + n[0] * s, limb.y + u[1] * t + n[1] * s];
      return [P(a, -BIG), P(b, -BIG), P(b, BIG), P(a, BIG)];
    });
    return { joint: [limb.x, limb.y], tip, L, u, cuts, bands, lens: FRACS.map((f) => f * L) };
  }

  /* ---------- 2. walker ---------- */
  // Each leg bone becomes two legs, the drawn left one and its mirror. Positions are in the
  // body's frame (sheet px); the body walks toward -y, so the ground slides toward +y.
  function create(rig, opts) {
    const legs = [];
    const legBones = rig.bones.filter((b) => b.kind === "leg").sort((a, b) => a.limb.joint[1] - b.limb.joint[1]);
    legBones.forEach((b, i) => {
      for (const side of [0, 1]) {
        const s = b.limb, mx = (p) => (side ? [2 * AXIS - p[0], p[1]] : p.slice());
        const hip = mx(s.joint), tip = mx(s.tip);
        legs.push({
          bone: b.id, i, side, name: (side ? "R" : "L") + (i + 1), lens: s.lens.slice(),
          hip, home: tip.slice(), foot: tip.slice(), from: tip.slice(), to: tip.slice(),
          stepping: false, u: 0, joints: [hip, hip, tip, tip], group: (i + side) % 2,
          restAngles: null, hist: [],
        });
      }
    });
    const W = { rig, legs, t: 0, scroll: 0, steps: 0, n: legBones.length };
    // rest pose: the leg as drawn, straight along its axis
    for (const L of W.legs) {
      const b = rig.bones[L.bone], u = L.side ? [-b.limb.u[0], b.limb.u[1]] : b.limb.u;
      const c = b.limb.cuts;
      L.rest = c.map((t) => [L.hip[0] + u[0] * t, L.hip[1] + u[1] * t]);
      L.restU = u;
      solve(L);
    }
    return W;
  }

  /* ---------- 3. step + solve ---------- */
  function step(W, dt, params) {
    const P = { ...DEFAULT_WALK, ...(params || {}) };
    W.t += dt;
    const move = P.speed * dt;
    W.scroll = (W.scroll + move) % 1e6;
    for (const L of W.legs) if (!L.stepping) L.foot[1] += move;            // planted feet slide back
    const err = (L) => Math.hypot(L.foot[0] - L.home[0], L.foot[1] - L.home[1]);
    const reach = (L) => L.lens[0] + L.lens[1] + L.lens[2];
    const thr = (L) => P.stride * reach(L);
    const busy = (L) => W.legs.some((o) => o.stepping && o !== L && (
      P.gait === "free" ? false :
      P.gait === "wave" ? true :
      P.gait === "ripple" ? ((o.side === L.side && Math.abs(o.i - L.i) === 1) || (o.i === L.i && o.side !== L.side)) :
      o.group !== L.group));
    const start = (L) => {
      L.stepping = true; L.u = 0; L.from = L.foot.slice();
      L.to = [L.home[0], L.home[1] - P.speed * STEP_T * 0.9];                // land a little ahead of home
    };
    const want = W.legs.filter((L) => !L.stepping && err(L) > thr(L)).sort((a, b) => err(b) - err(a));
    for (const L of want) {
      if (L.stepping) continue;
      if (err(L) > thr(L) * 2.4 || !busy(L)) {                               // a foot never tears off
        start(L);
        if (P.gait === "tetrapod") for (const o of W.legs) if (!o.stepping && o.group === L.group && err(o) > thr(o) * 0.35) start(o);
      }
    }
    for (const L of W.legs) {
      if (L.stepping) {
        L.u = Math.min(1, L.u + dt / STEP_T);
        const e = ease(L.u);
        L.foot = [L.from[0] + (L.to[0] - L.from[0]) * e, L.from[1] + (L.to[1] - L.from[1]) * e];
        if (L.u >= 1) { L.stepping = false; W.steps++; }
      }
      L.lifted = L.stepping ? Math.sin(Math.PI * L.u) * P.lift : 0;
      L.hist.push(L.stepping ? 0 : 1); if (L.hist.length > 180) L.hist.shift();
      solve(L);
    }
  }

  // tarsus along hip->foot, then femur + tibia by the law of cosines, knee away from the body
  function solve(L) {
    const [Lf, Lb, Lt] = L.lens, H = L.hip, F = L.foot;
    let dx = F[0] - H[0], dy = F[1] - H[1], d = Math.hypot(dx, dy) || 1;
    const dir = [dx / d, dy / d];
    let Wp = [F[0] - dir[0] * Lt, F[1] - dir[1] * Lt];
    let ex = Wp[0] - H[0], ey = Wp[1] - H[1], D = Math.hypot(ex, ey) || 1;
    const maxD = (Lf + Lb) * 0.999, minD = Math.abs(Lf - Lb) + 0.5;
    if (D > maxD) { Wp = [H[0] + ex / D * maxD, H[1] + ey / D * maxD]; D = maxD; }
    if (D < minD) D = minD;
    const e = [ex / (Math.hypot(ex, ey) || 1), ey / (Math.hypot(ex, ey) || 1)];
    const a = Math.acos(Math.max(-1, Math.min(1, (Lf * Lf + D * D - Lb * Lb) / (2 * Lf * D))));
    // the perpendicular that points away from the body's axis
    let p = [-e[1], e[0]];
    if ((H[0] + p[0] - AXIS) * (H[0] - AXIS) < (H[0] - AXIS) * (H[0] - AXIS)) p = [-p[0], -p[1]];
    const knee = [H[0] + e[0] * Lf * Math.cos(a) + p[0] * Lf * Math.sin(a), H[1] + e[1] * Lf * Math.cos(a) + p[1] * Lf * Math.sin(a)];
    L.joints = [H.slice(), knee, Wp, [Wp[0] + dir[0] * Lt, Wp[1] + dir[1] * Lt]];
  }

  // band k drawn at rest from rest[k] along restU; posed from joints[k] to joints[k+1].
  // Left legs: T(j) R(dθ) T(-rest). Right legs draw the left part through MIRROR first.
  function bandMatrix(W, L, k) {
    const A = L.joints[k], B = L.joints[k + 1], r = L.rest[k];
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) - Math.atan2(L.restU[1], L.restU[0]);
    const m = mul(mul(T(A[0], A[1]), R(ang)), T(-r[0], -r[1]));
    return L.side ? mul(m, MIRROR) : m;
  }

  window.CreatureWalk = { slice, create, step, solve, bandMatrix, GAITS, DEFAULT_WALK, FRACS };
})();
