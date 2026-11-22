/* CreatureKit: what a built creature is made from, and the chain builder most of them use.

   A chain creature is built the way the Maw is (ecology-maw.js buildDef): a chain of rows, one kit part each on its own piece of spine, so
   the whole body bends. Head first, crowned with side parts (fins for horns or ears); a neck of one spine piece repeated; the body of a
   bigger creature, row by row, some rows carrying legs, flames or wings; a tail of one spine piece repeated, shrinking. Every row stands at
   its own height (h), held there by def.carry (CreatureBody), so a neck rises and a tail is carried.

     CreatureKit.chain(parts, spec) -> a CreatureBody def
       spec: {
         head: { id, long | wide, h, solid, crown: [[id, len, half, rise, back], ...] },
         neck: { n, id, long: [a, b], h: [a, b], gap },                       // a..b: from the head end to the body end
         body: [{ id, wide, h, gap, legs: "front" | "hind", hip, flames: [id, len, half, rise, back], wing: [id, len] }, ...],
         tail: { n, id, long: [a, b], h: [a, b] | (q) => h, gap: [a, b], tip: [id, long, solid] },
         legs: { kind: "upright", len, slim, fore: "mirror" | "same" }        // the Blender qilin's leg, drawn from the side, standing
               | { kind: "kit", len, bones: [thigh, shin, foot], fracs, reach, wide },   // kit parts laid flat, one to a bone, sprawled
         carry, speed, stride, lift, turn, run                                // run: a Gaits.RUN set ("horse", "cat")
       }
     A side part is [id, len, half, rise, back]: the kit part, its length, how far out from the spine its root sits, how steeply it rises
     toward its tip, and how far back along the row it sits.

   Also: CreatureKit.index(parts) -> polysOf(id); box(polys); fine(polys, step); BLENDER_LEG (the Blender leg's spine on its drawing).
   Needs window.LimbArt and window.PartLib when a creature is built (not when this file loads). */
(function () {
  "use strict";
  const LA = () => window.LimbArt, lines = (p) => window.PartLib.lines(p);
  const index = (parts) => { const byId = new Map(parts.map((p) => [p.id, p])); return (id) => { const e = byId.get(id); return e ? lines(e) : null; }; };
  const box = (polys) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const pl of polys) for (let i = 0; i + 1 < pl.length; i += 2) { x0 = Math.min(x0, pl[i]); x1 = Math.max(x1, pl[i]); y0 = Math.min(y0, pl[i + 1]); y1 = Math.max(y1, pl[i + 1]); } return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 || 1, h: y1 - y0 || 1 }; };
  // long straight edges cut into short steps, so an edge that runs past a joint bends with it
  const fine = (polys, step) => polys.map((pl) => { const r = [pl[0], pl[1]]; for (let i = 2; i + 1 < pl.length; i += 2) { const ax = pl[i - 2], ay = pl[i - 1], n = Math.max(1, Math.ceil(Math.hypot(pl[i] - ax, pl[i + 1] - ay) / step)); for (let j = 1; j <= n; j++) r.push(ax + (pl[i] - ax) * j / n, ay + (pl[i + 1] - ay) * j / n); } return r; });
  // the Blender qilin's leg (P723) on its drawing: from the hip (the middle of its flat top) down the thigh, which slants back to the knee (the
  // drawing's leftmost bulge), then down the shin to the foot. Hip and foot from packages/kit/data/kit-sources/blender-qilin-joints.json
  const BLENDER_LEG = [[223, 491], [205, 518], [180, 545], [155, 570], [168, 600], [186, 635], [198, 670], [210, 704]], BLENDER_FRACS = [0.42, 0.42, 0.16];
  const spineX = (y) => { const S = BLENDER_LEG; if (y <= S[0][1]) return S[0][0]; for (let i = 1; i < S.length; i++) if (y <= S[i][1]) { const f = (y - S[i - 1][1]) / (S[i][1] - S[i - 1][1]); return S[i - 1][0] + (S[i][0] - S[i - 1][0]) * f; } return S[S.length - 1][0]; };
  // a row's centre part, laid on its spine piece: wide (across) or long (along the spine), arched over its width so it has a back
  const centre = (polysOf, id, q) => { const polys = polysOf(id); if (!polys) return null; const b = box(polys), k = q.wide ? q.wide / b.w : q.long / b.h;
    return { id, polys, cx: b.cx, cy: b.cy, k, arch: { hw: b.w / 2, h: b.w * k * 0.25 }, solid: q.solid || { thick: 0.8 } }; };
  // a side part (a fin, a flame) hung from the rim the way the Maw hangs them: from its root (its drawing's rightmost point), mirrored,
  // rising toward its tip
  const side = (polysOf, s) => { if (!s) return null; const [id, len, half, rise, back] = s, polys = polysOf(id); if (!polys) return null; const jt = LA().jointAndTip(polys), ks = len / (jt.L || 1), J = jt.J;
    return { id, polys, cx: J[0] + half / ks, cy: J[1] + (back || 0) / ks, k: ks, mirror: true, lift: (sx, sy) => rise * Math.hypot(sx - J[0], sy - J[1]) * ks, solid: { mode: "blade", thick: 0.45 } }; };
  // legs: (place, half) -> a leg def for a row, place "front" | "hind", half: the row's half width
  function uprightLegs(polysOf, L) {   // the Blender leg slimmed toward its spine, standing in its own plane; fore "mirror": the front pair drawn mirrored, knees forward
    const LP0 = polysOf("P723"); if (!LP0) return () => null;
    const LP = fine(LP0, 4).map((pl) => pl.map((v, i) => i % 2 ? v : spineX(pl[i + 1]) + (v - spineX(pl[i + 1])) * (L.slim || 0.55))), fr = BLENDER_FRACS;
    const back = LA().sliceSpine(LP, BLENDER_LEG, fr), mirror = L.fore !== "same";
    const fore = mirror ? LA().sliceSpine(LP.map((pl) => pl.map((v, i) => i % 2 ? v : 400 - v)), BLENDER_LEG.map(([x, y]) => [400 - x, y]), fr) : back;
    return (place, half) => { const f = place === "front", m = f && mirror;
      return { keepOwn: true, artObj: f ? fore : back, ang: f ? 22 : 158, len: L.len, fracs: fr, reach: 0.1, upright: m ? -1 : 1, pole: [m ? 1 : -1, 0.35], hip: [half * 0.7, 0.02, 0] }; };
  }
  function kitLegs(polysOf, L) {   // the kit's own, one part to a bone, laid flat and sprawled (the Maw's legs)
    const Q = L.bones.map(polysOf); if (!Q.every(Boolean)) return () => null; const art = LA().segmentArt(Q, L.fracs);
    return (place, half) => ({ keepOwn: true, artObj: art, ang: place === "front" ? (L.wide ? 48 : 56) : (L.wide ? 132 : 124), len: L.len, fracs: L.fracs, reach: L.reach, faceUp: true, pole: [place === "front" ? 0.8 : -0.8, 1], hip: [half * 0.8, 0.02, 0] });
  }
  // a wing: a blade cut into three bones, beating from the row's rim
  function wing(polysOf, w, half) { const polys = polysOf(w[0]); if (!polys) return null; const jt = LA().jointAndTip(polys), len = w[1], mx = half * 0.6, my = 0.08, dx = (jt.J[0] - jt.T[0]) / jt.L, dz = -(jt.T[1] - jt.J[1]) / jt.L;
    return { art: "BEAST-" + w[0], artPolys: polys, mount: [mx, my, 0], len, fracs: [0.4, 0.34, 0.26], rest: [mx + dx * len * 0.86, my + 0.12 * len, dz * len * 0.86], flap: { amps: [26, 18, 14], lags: [0, 0.1, 0.22], rate: 2.6, ground: 0.5 } }; }

  function chain(parts, B) {
    const polysOf = index(parts), L = B.legs, legOf = L.kind === "upright" ? uprightLegs(polysOf, L) : kitLegs(polysOf, L), lerp = (a, b, q) => a + (b - a) * q;
    const rows = [], row = (h, gap, ps, legs, half, arms) => rows.push({ h, gap, parts: ps.filter(Boolean), legs: (legs || []).filter(Boolean), arms: (arms || []).filter(Boolean), zF: gap / 2, zB: -gap / 2, half });
    const H = B.head; row(H.h, 0, [centre(polysOf, H.id, H), ...(H.crown || []).map((s) => side(polysOf, s))], [], 0.12);
    const N = B.neck; for (let i = 0; i < N.n; i++) { const q = N.n > 1 ? i / (N.n - 1) : 1; row(lerp(N.h[0], N.h[1], q), N.gap, [centre(polysOf, N.id, { long: lerp(N.long[0], N.long[1], q) })], [], 0.1); }
    for (const r of B.body) { const half = r.wide / 2;
      row(r.h, r.gap, [centre(polysOf, r.id, { wide: r.wide, solid: { thick: 0.7 } }), side(polysOf, r.flames)], r.legs ? [legOf(r.legs, r.hip ?? half)] : [], half, r.wing ? [wing(polysOf, r.wing, half)] : []); }
    const T = B.tail, th = typeof T.h === "function" ? T.h : (q) => lerp(T.h[0], T.h[1], q);
    for (let i = 0; i < T.n; i++) { const q = T.n > 1 ? i / (T.n - 1) : 1;
      row(th(q), lerp(T.gap[0], T.gap[1], q), [centre(polysOf, T.id, { long: lerp(T.long[0], T.long[1], q) }), i === T.n - 1 && T.tip && centre(polysOf, T.tip[0], { long: T.tip[1], solid: T.tip[2] })], [], 0.06); }
    return { segs: rows, smooth: false, flatLimbs: true, carry: B.carry, Lm: L.len, speed: B.speed, cadence: 1.2, stride: B.stride, lift: B.lift, turn: B.turn, bob: 0.012, ...(B.run ? { run: B.run } : {}) };
  }
  window.CreatureKit = { index, box, fine, centre, side, uprightLegs, kitLegs, wing, chain, BLENDER_LEG, BLENDER_FRACS };
})();
