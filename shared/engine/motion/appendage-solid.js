/* INTERACTIONS: AppendageSolid. A walker's neck and tail as solids: the Walker Bestiary's appendages (walker.js APPENDAGES: the qilin's
   neck with its mane and horns, its tufted tail) rebuilt for the tank renderer, in the body piece's own frame (x across, y up, z forward).

   Each is a six-sided tube along a curve, as walker.js draws it with a hexagonal ring every so often, thick at the root and thin at the tip.
   The neck carries a head (a rounded block), two horns and a mane of thin fins down its back; the tail ends in a tuft of tapered spikes.
   They move with the walk: the neck nods with the step and the tail sways and trails, from a clock and the walker's speed.

     const A = AppendageSolid.make(preset, { BL, front, back, lift })   preset = walker.js APPENDAGES.qilin; BL: a body length in the piece's units
     AppendageSolid.pose(A, t, speed)                                    every frame: { pos, nrm, idx, ver, dynamic } in A.mesh                */
(function () {
  "use strict";
  const QILIN = { neck: { reach: 0.24, rise: 0.5, arch: 0, rings: 8, r0: 0.08, r1: 0.052, mane: true, horns: true }, tail: { length: 0.62, start: 32, turn: -62, rings: 12, r0: 0.062, r1: 0.01, tuft: 7 } };
  const SIDES = 6, DEG = Math.PI / 180;

  // a curve as points; frames along it (tangent, a side, an up) by parallel transport
  function framesOf(P) {
    const F = [], n = P.length; let up = [0, 1, 0];
    for (let i = 0; i < n; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(...t) || 1; t = t.map((v) => v / tl);
      let s = [up[1] * t[2] - up[2] * t[1], up[2] * t[0] - up[0] * t[2], up[0] * t[1] - up[1] * t[0]]; let sl = Math.hypot(...s); if (sl < 1e-6) { s = [1, 0, 0]; sl = 1; } s = s.map((v) => v / sl);
      up = [t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]]; F.push({ t, s, u: up.slice() }); }
    return F;
  }
  // a closed tube of SIDES round a curve, radius per point, capped at both ends
  function tube(G, P, R, flat) {
    const F = framesOf(P), base = G.pos.length / 3, n = P.length;
    for (let i = 0; i < n; i++) for (let k = 0; k < SIDES; k++) { const a = (k / SIDES) * Math.PI * 2 + (flat || 0), c = Math.cos(a), s = Math.sin(a), f = F[i];
      const nx = f.s[0] * c + f.u[0] * s, ny = f.s[1] * c + f.u[1] * s, nz = f.s[2] * c + f.u[2] * s; G.pos.push(P[i][0] + nx * R[i], P[i][1] + ny * R[i], P[i][2] + nz * R[i]); G.nrm.push(nx, ny, nz); }
    for (let i = 0; i + 1 < n; i++) for (let k = 0; k < SIDES; k++) { const a = base + i * SIDES + k, b = base + i * SIDES + (k + 1) % SIDES, c = a + SIDES, d = b + SIDES; G.idx.push(a, c, b, b, c, d); }
    for (const [i, sg] of [[0, -1], [n - 1, 1]]) { const ci = G.pos.length / 3, f = F[i]; G.pos.push(...P[i]); G.nrm.push(f.t[0] * sg, f.t[1] * sg, f.t[2] * sg);
      for (let k = 0; k < SIDES; k++) { const a = base + i * SIDES + k, b = base + i * SIDES + (k + 1) % SIDES; if (sg < 0) G.idx.push(ci, b, a); else G.idx.push(ci, a, b); } }
  }
  // a thin fin: a triangle standing off a point, both faces
  function fin(G, at, dir, side, h, w) {
    const b = G.pos.length / 3, tip = [at[0] + dir[0] * h, at[1] + dir[1] * h, at[2] + dir[2] * h], a = [at[0] - side[0] * w, at[1] - side[1] * w, at[2] - side[2] * w], c = [at[0] + side[0] * w, at[1] + side[1] * w, at[2] + side[2] * w];
    const nx = dir[1] * side[2] - dir[2] * side[1], ny = dir[2] * side[0] - dir[0] * side[2], nz = dir[0] * side[1] - dir[1] * side[0];
    for (const [p, q] of [[a, 1], [c, 1], [tip, 1], [a, -1], [c, -1], [tip, -1]]) { G.pos.push(...p); G.nrm.push(nx * q, ny * q, nz * q); }
    G.idx.push(b, b + 1, b + 2, b + 3, b + 5, b + 4);
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  function make(preset, o) { return { pre: preset || QILIN, o: Object.assign({ BL: 1, front: 0.42, back: -0.42, lift: 0.12 }, o || {}), mesh: { pos: new Float32Array(0), nrm: new Float32Array(0), idx: new Uint32Array(0), ver: 0, dynamic: true } }; }

  function pose(A, t, speed) {
    const { pre, o } = A, BL = o.BL, G = { pos: [], nrm: [], idx: [] }, v = Math.min(1, speed || 0), step = Math.sin(t * (4 + 4 * v));
    if (pre.neck) { const N = pre.neck, nod = 0.05 * step * BL, sway = 0.03 * Math.sin(t * 1.3) * BL, P = [], R = [], m = Math.max(4, N.rings * 2);
      const r0 = [0, o.lift * BL, o.front * BL];
      for (let i = 0; i <= m; i++) { const q = i / m, ease = q * q;
        P.push([r0[0] + sway * ease, r0[1] + N.rise * BL * q + nod * ease + N.arch * BL * Math.sin(q * Math.PI), r0[2] + N.reach * BL * (q * 0.4 + 0.6 * Math.sqrt(q))]); R.push(lerp(N.r0, N.r1, q) * BL); }
      tube(G, P, R);
      const top = P[m], hd = [top[0], top[1] + 0.02 * BL, top[2] + 0.07 * BL];   // the head: a short thick tube, snout forward
      tube(G, [[hd[0], hd[1], hd[2] - 0.06 * BL], [hd[0], hd[1] + 0.005 * BL, hd[2] + 0.02 * BL], [hd[0], hd[1] - 0.01 * BL, hd[2] + 0.1 * BL], [hd[0], hd[1] - 0.025 * BL, hd[2] + 0.15 * BL]], [0.07 * BL, 0.08 * BL, 0.06 * BL, 0.035 * BL], Math.PI / 6);
      if (N.horns) for (const sx of [-1, 1]) { const HP = [], HR = []; for (let i = 0; i <= 5; i++) { const q = i / 5; HP.push([hd[0] + sx * (0.035 + 0.06 * q) * BL, hd[1] + (0.05 + 0.16 * q) * BL, hd[2] - (0.03 + 0.12 * q * q) * BL]); HR.push(lerp(0.016, 0.002, q) * BL); } tube(G, HP, HR); }
      if (N.mane) { const F = framesOf(P); for (let i = 1; i < m; i++) { const f = F[i], back = [-f.t[0] * 0.6 + f.u[0] * 0.4, -f.t[1] * 0.6 + f.u[1] * 0.4, -f.t[2] * 0.6 + f.u[2] * 0.4], bl = Math.hypot(...back) || 1;
        fin(G, [P[i][0] + f.u[0] * R[i] * 0.8, P[i][1] + f.u[1] * R[i] * 0.8, P[i][2] + f.u[2] * R[i] * 0.8], back.map((x) => x / bl), f.s, (0.05 + 0.03 * Math.sin(i * 1.7)) * BL, 0.012 * BL); } }
    }
    if (pre.tail) { const T = pre.tail, P = [], R = [], m = Math.max(4, T.rings), L = T.length * BL, sw = 0.25 * Math.sin(t * 2.1) + 0.1 * step;
      let p = [0, o.lift * BL * 0.8, o.back * BL], pitch = T.start * DEG, yaw = 0; const seg = L / m;
      for (let i = 0; i <= m; i++) { const q = i / m; P.push(p.slice()); R.push(lerp(T.r0, T.r1, Math.pow(q, 0.8)) * BL);
        pitch += (T.turn * DEG) / m; yaw = sw * q * (1 + v);
        p = [p[0] + Math.sin(yaw) * Math.cos(pitch) * seg, p[1] + Math.sin(pitch) * seg, p[2] - Math.cos(yaw) * Math.cos(pitch) * seg]; }
      tube(G, P, R);
      if (T.tuft) { const tip = P[m], F = framesOf(P), f = F[m]; for (let k = 0; k < T.tuft; k++) { const a = (k / T.tuft) * Math.PI * 2, c = Math.cos(a) * 0.55, s = Math.sin(a) * 0.55;
        const d = [f.t[0] + f.s[0] * c + f.u[0] * s, f.t[1] + f.s[1] * c + f.u[1] * s, f.t[2] + f.s[2] * c + f.u[2] * s], dl = Math.hypot(...d) || 1, TP = [], TR = [];
        for (let i = 0; i <= 3; i++) { const q = i / 3; TP.push([tip[0] + d[0] / dl * 0.12 * BL * q, tip[1] + d[1] / dl * 0.12 * BL * q - 0.02 * BL * q * q, tip[2] + d[2] / dl * 0.12 * BL * q]); TR.push(lerp(0.014, 0.001, q) * BL); } tube(G, TP, TR); } }
    }
    const M = A.mesh; if (M.pos.length !== G.pos.length) { M.pos = new Float32Array(G.pos.length); M.nrm = new Float32Array(G.nrm.length); M.idx = new Uint32Array(G.idx); M.fresh = true; }
    M.pos.set(G.pos); M.nrm.set(G.nrm); M.ver++;
    return M;
  }
  window.AppendageSolid = { make, pose, QILIN };
})();
