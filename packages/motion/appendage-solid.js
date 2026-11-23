/* INTERACTIONS: AppendageSolid. A walker's neck and tail as solids: the Walker Bestiary's appendages (walker.js APPENDAGES: the qilin's
   neck with its mane and horns, its tufted tail) rebuilt for the tank renderer, in the body piece's own frame (x across, y up, z forward).

   Each is a six-sided tube along a curve, as walker.js draws it with a hexagonal ring every so often, thick at the root and thin at the tip.
   The neck carries a head (a rounded block, or a kit drawing made solid: o.head), two horns and a mane of thin fins down its back; the tail ends in a tuft of tapered spikes.
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

  // o.head: a kit drawing for the head in place of the block and horns, { polys, k, cx, cy, h } (the drawing seen from the front, k: piece
  // units per drawing unit). Made solid once (PartSolid, rounded as a belly, thin front to back) and carried on the neck's tip, upright
  function headSolid(H) {
    const PS = window.PartSolid; if (!PS || !window.Delaunator || !H || !H.polys) return null;
    let so; try { const part = PS.read(H.polys, { join: H.polys.length <= 240 }); if (!part.outer.length) return null; so = PS.build(part, { mode: "belly", thick: 0.35, inner: 0.25, crease: 0.3, edge: 0.06, res: 48 }); } catch (e) { return null; }
    const P = so.positions, I = so.indices, n = P.length / 3, k = H.k, lift = H.h * k * 0.32, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (so.cx + P[i * 3] - H.cx) * k; pos[i * 3 + 1] = (H.cy - (so.cy - P[i * 3 + 1])) * k + lift; pos[i * 3 + 2] = P[i * 3 + 2] * k; }
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3, ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[d] - pos[a], vy = pos[d + 1] - pos[a + 1], vz = pos[d + 2] - pos[a + 2];
      const qx = uy * vz - uz * vy, qy = uz * vx - ux * vz, qz = ux * vy - uy * vx; for (const i of [a, b, d]) { nrm[i] += qx; nrm[i + 1] += qy; nrm[i + 2] += qz; } }
    for (let i = 0; i < n; i++) { let x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2]; const l = Math.hypot(x, y, z) || 1; if (z * P[i * 3 + 2] < 0) { x = -x; y = -y; z = -z; } nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l; }
    return { pos, nrm, idx: I };
  }
  // o.parts: kit drawings made solid and carried on the creature (the mystic qilin's horn, antlers, whiskers, flames, scales, tail plume).
  //   { polys, k, cx, cy, solid: PartSolid build options, at: "body" | "head" | "neck" | "tail", q (along the neck, 0..1), pos: [x, y, z],
  //     plane: "side" (stands along the body, as seen from the side) | "top" (lies flat, its drawing's up forward) | "front" (faces forward),
  //     rot (degrees, turned in its own plane first), flip (its drawing mirrored), pair (a twin at -x), flicker (a flame's sway, 0..1) }
  //   Made solid once (in the drawing's own frame), placed every frame: on the body as it stands, at the head on the neck's tip, along
  //   the neck in its frame, at the tail's tip turned with the tail.
  function partSolid(D) {
    const PS = window.PartSolid; if (!PS || !window.Delaunator || !D || !D.polys) return null;
    let so; try { const part = PS.read(D.polys, { join: D.polys.length <= 240 }); if (!part.outer.length) return null; so = PS.build(part, Object.assign({ mode: "belly", thick: 0.4, inner: 0.25, crease: 0.3, edge: 0.06, res: 40 }, D.solid || {})); } catch (e) { return null; }
    const P = so.positions, I = so.indices, n = P.length / 3, k = D.k, c = Math.cos((D.rot || 0) * DEG), sn = Math.sin((D.rot || 0) * DEG), fx = D.flip ? -1 : 1;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const x = (so.cx + P[i * 3] - D.cx) * k * fx, y = (D.cy - (so.cy - P[i * 3 + 1])) * k;
      pos[i * 3] = x * c - y * sn; pos[i * 3 + 1] = x * sn + y * c; pos[i * 3 + 2] = P[i * 3 + 2] * k; }
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3, ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[d] - pos[a], vy = pos[d + 1] - pos[a + 1], vz = pos[d + 2] - pos[a + 2];
      const qx = uy * vz - uz * vy, qy = uz * vx - ux * vz, qz = ux * vy - uy * vx; for (const i of [a, b, d]) { nrm[i] += qx; nrm[i + 1] += qy; nrm[i + 2] += qz; } }
    for (let i = 0; i < n; i++) { let x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2]; const l = Math.hypot(x, y, z) || 1; if (z * P[i * 3 + 2] < 0) { x = -x; y = -y; z = -z; } nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l; }
    return { pos, nrm, idx: I, D };
  }
  // drawing frame (x right, y up, z out of the drawing) -> a basis of three vectors in the piece: the drawing's x, y and z go along X, Y, Z
  const PLANES = { side: [[0, 0, 1], [0, 1, 0], [1, 0, 0]], top: [[1, 0, 0], [0, 0, 1], [0, 1, 0]], front: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  function place(G, S, o, X, Y, Z, sy, mx) {   // o: origin; X, Y, Z: where the drawing's axes go; sy: a stretch along the drawing's y; mx: -1 mirrors across x
    const b = G.pos.length / 3, P = S.pos, N = S.nrm;
    for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1] * sy, z = P[i + 2];
      G.pos.push((o[0] + X[0] * x + Y[0] * y + Z[0] * z) * mx, o[1] + X[1] * x + Y[1] * y + Z[1] * z, o[2] + X[2] * x + Y[2] * y + Z[2] * z);
      const nx = N[i], ny = N[i + 1] / (sy || 1), nz = N[i + 2]; let ax = (X[0] * nx + Y[0] * ny + Z[0] * nz) * mx, ay = X[1] * nx + Y[1] * ny + Z[1] * nz, az = X[2] * nx + Y[2] * ny + Z[2] * nz; const l = Math.hypot(ax, ay, az) || 1; G.nrm.push(ax / l, ay / l, az / l); }
    for (let i = 0; i < S.idx.length; i++) G.idx.push(S.idx[i] + b);
  }
  function make(preset, o) { const A = { pre: preset || QILIN, o: Object.assign({ BL: 1, front: 0.42, back: -0.42, lift: 0.12 }, o || {}), mesh: { pos: new Float32Array(0), nrm: new Float32Array(0), idx: new Uint32Array(0), ver: 0, dynamic: true } };
    if (A.o.neck && A.pre.neck) A.pre = Object.assign({}, A.pre, { neck: Object.assign({}, A.pre.neck, A.o.neck) });   // o.neck: the preset's neck with some numbers changed
    if (A.o.tail && A.pre.tail) A.pre = Object.assign({}, A.pre, { tail: Object.assign({}, A.pre.tail, A.o.tail) });
    A.src = preset || QILIN; A.head = A.o.head ? headSolid(A.o.head) : null; A.parts = (A.o.parts || []).map(partSolid).filter(Boolean); return A; }

  function pose(A, t, speed) {
    const { pre, o } = A, BL = o.BL, G = { pos: [], nrm: [], idx: [] }, v = Math.min(1, speed || 0), step = Math.sin(t * (4 + 4 * v));
    if (pre.neck) { const N = pre.neck, nod = 0.05 * step * BL, sway = 0.03 * Math.sin(t * 1.3) * BL, P = [], R = [], m = Math.max(4, N.rings * 2);
      const r0 = [0, o.lift * BL, o.front * BL];
      for (let i = 0; i <= m; i++) { const q = i / m, ease = q * q;
        P.push([r0[0] + sway * ease, r0[1] + N.rise * BL * q + nod * ease + N.arch * BL * Math.sin(q * Math.PI), r0[2] + N.reach * BL * (q * 0.4 + 0.6 * Math.sqrt(q))]); R.push(lerp(N.r0, N.r1, q) * BL); }
      tube(G, P, R);
      const top = P[m], hd = [top[0], top[1] + 0.02 * BL, top[2] + 0.07 * BL]; A.neckAt = { P: P.map((p) => p.slice()), F: framesOf(P), top };   // the head: a short thick tube, snout forward
      if (A.head) { const H = A.head, b = G.pos.length / 3; for (let i = 0; i < H.pos.length; i += 3) { G.pos.push(H.pos[i] + top[0], H.pos[i + 1] + top[1], H.pos[i + 2] + top[2]); G.nrm.push(H.nrm[i], H.nrm[i + 1], H.nrm[i + 2]); } for (let i = 0; i < H.idx.length; i++) G.idx.push(H.idx[i] + b); }
      else if (!A.o.noHead) tube(G, [[hd[0], hd[1], hd[2] - 0.06 * BL], [hd[0], hd[1] + 0.005 * BL, hd[2] + 0.02 * BL], [hd[0], hd[1] - 0.01 * BL, hd[2] + 0.1 * BL], [hd[0], hd[1] - 0.025 * BL, hd[2] + 0.15 * BL]], [0.07 * BL, 0.08 * BL, 0.06 * BL, 0.035 * BL], Math.PI / 6);
      if (N.horns && !A.head) for (const sx of [-1, 1]) { const HP = [], HR = []; for (let i = 0; i <= 5; i++) { const q = i / 5; HP.push([hd[0] + sx * (0.035 + 0.06 * q) * BL, hd[1] + (0.05 + 0.16 * q) * BL, hd[2] - (0.03 + 0.12 * q * q) * BL]); HR.push(lerp(0.016, 0.002, q) * BL); } tube(G, HP, HR); }
      if (N.mane) { const F = framesOf(P); for (let i = 1; i < m; i++) { const f = F[i], back = [-f.t[0] * 0.6 + f.u[0] * 0.4, -f.t[1] * 0.6 + f.u[1] * 0.4, -f.t[2] * 0.6 + f.u[2] * 0.4], bl = Math.hypot(...back) || 1;
        fin(G, [P[i][0] + f.u[0] * R[i] * 0.8, P[i][1] + f.u[1] * R[i] * 0.8, P[i][2] + f.u[2] * R[i] * 0.8], back.map((x) => x / bl), f.s, (0.05 + 0.03 * Math.sin(i * 1.7)) * BL, 0.012 * BL); } }
    }
    if (pre.tail) { const T = pre.tail, P = [], R = [], m = Math.max(4, T.rings), L = T.length * BL, sw = 0.25 * Math.sin(t * 2.1) + 0.1 * step;
      let p = [0, o.lift * BL * 0.8, o.back * BL], pitch = T.start * DEG, yaw = 0; const seg = L / m;
      for (let i = 0; i <= m; i++) { const q = i / m; P.push(p.slice()); R.push(lerp(T.r0, T.r1, Math.pow(q, 0.8)) * BL);
        pitch += (T.turn * DEG) / m; yaw = sw * q * (1 + v);
        p = [p[0] + Math.sin(yaw) * Math.cos(pitch) * seg, p[1] + Math.sin(pitch) * seg, p[2] - Math.cos(yaw) * Math.cos(pitch) * seg]; }
      tube(G, P, R); A.tailAt = { tip: P[m], f: framesOf(P)[m] };
      if (T.tuft && !A.o.noTuft) { const tip = P[m], F = framesOf(P), f = F[m]; for (let k = 0; k < T.tuft; k++) { const a = (k / T.tuft) * Math.PI * 2, c = Math.cos(a) * 0.55, s = Math.sin(a) * 0.55;
        const d = [f.t[0] + f.s[0] * c + f.u[0] * s, f.t[1] + f.s[1] * c + f.u[1] * s, f.t[2] + f.s[2] * c + f.u[2] * s], dl = Math.hypot(...d) || 1, TP = [], TR = [];
        for (let i = 0; i <= 3; i++) { const q = i / 3; TP.push([tip[0] + d[0] / dl * 0.12 * BL * q, tip[1] + d[1] / dl * 0.12 * BL * q - 0.02 * BL * q * q, tip[2] + d[2] / dl * 0.12 * BL * q]); TR.push(lerp(0.014, 0.001, q) * BL); } tube(G, TP, TR); } }
    }
    for (const S of A.parts || []) { const D = S.D, pl = PLANES[D.plane || "side"], p = D.pos || [0, 0, 0], sy = 1 + (D.flicker || 0) * 0.12 * Math.sin(t * 7 + (p[0] + p[2]) * 9);
      let o = p, X = pl[0], Y = pl[1], Z = pl[2];
      if (D.at === "head" && A.neckAt) { const tp = A.neckAt.top; o = [tp[0] + p[0], tp[1] + p[1], tp[2] + p[2]]; }
      else if (D.at === "neck" && A.neckAt) { const n = A.neckAt.P.length - 1, i = Math.round((D.q || 0) * n), f = A.neckAt.F[i], c = A.neckAt.P[i];   // in the neck's frame: the drawing's up along the neck
        o = [c[0] + f.u[0] * p[1], c[1] + f.u[1] * p[1], c[2] + f.u[2] * p[1]]; X = f.s; Y = f.t; Z = f.u; }
      else if (D.at === "tail" && A.tailAt) { const f = A.tailAt.f, tp = A.tailAt.tip; o = [tp[0] + p[0], tp[1] + p[1], tp[2] + p[2]]; const fw = [-f.t[0], -f.t[1], -f.t[2]];   // its drawing's x points back along the tail
        X = D.plane === "side" ? [-fw[0], -fw[1], -fw[2]] : f.s; Y = D.plane === "side" ? f.u : [-fw[0], -fw[1], -fw[2]]; Z = D.plane === "side" ? f.s : f.u; }
      place(G, S, o, X, Y, Z, sy, 1); if (D.pair) place(G, S, o, X, Y, Z, sy, -1); }
    const M = A.mesh; if (M.pos.length !== G.pos.length) { M.pos = new Float32Array(G.pos.length); M.nrm = new Float32Array(G.nrm.length); M.idx = new Uint32Array(G.idx); M.fresh = true; }
    M.pos.set(G.pos); M.nrm.set(G.nrm); M.ver++;
    return M;
  }
  window.AppendageSolid = { make, pose, QILIN, partSolid, PLANES };
})();
