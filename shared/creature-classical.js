/* creature-classical.js — Block Forge's classical facades, built in the round.
   Depends on shared/creature-arch.js (CreatureArch.load() resolved).

   Reads the same design data as Block Forge's Classical mode ({ kind:'classical', bayW, floorH, open,
   kits, crown, cl:{ type, bays, pav, floors, base, order, front, frame, pediment, pitch, attic, balus,
   quoins, steps, dome, text, parts } }) and builds:

     plan        a box of bays x depth-bays; temples are deep, palazzos shallow
     facades     every wall gets the facade grammar, richest at the front: door, inscription and the
                 piano nobile's creature eyes on the front only; sides and back keep windows, frames,
                 rustication and the order as corner pilasters
     bands       architrave, frieze, cornice with dentils, attic and balustrade run round all four
                 walls at one height, so they turn the corners
     columns     real round columns: tapering 8-flute shafts, ringed bases, square abacus; capitals from
                 your parts on their faces (Ionic hook volutes front and back, Corinthian blade leaves on
                 all four sides, a Doric bead)
     roof        a temple gets a true gable roof (pediment front and back, ridge, eaves); other types a
                 front pediment or a flat roof with a balustrade
     stairs      stepped slabs with cheek walls and lamp standards
     dome        drum with round windows, meridian ribs, lantern and spire
     occluder    boxes, cylinders, prisms and a lathed dome from the same plan, for depth only

   Local frame: x across the front, y up, z towards the viewer (the front faces +z). Units: Block
   Forge px times opts.unit (default 1/16 m, the same scale as creature-spire.js).

   CreatureClassical.newClassical(type, seed, opts) -> design   (type: temple | palazzo | giant | library)
   CreatureClassical.build(design, opts) -> { lines:{positions, colors}, occluder, top, reach, stats }
*/
(function () {
  'use strict';
  const TAU = Math.PI * 2, XENO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const ORDERS = { tuscan: 7, doric: 8, ionic: 9, corinthian: 10 };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const CA = () => window.CreatureArch;
  const roleList = (role) => (CA().byRole[role] || []).filter((p) => p.species !== 'sheet-xenoglyph');
  function part(id, role) {
    if (id && CA().byId[id]) return CA().byId[id];
    const list = role ? roleList(role) : [];
    return list.length ? list[hash(String(id || role)) % list.length] : null;
  }
  const pickId = (R, role) => { const a = roleList(role); return a.length ? a[Math.floor(R() * a.length)].id : null; };

  // ---------- design (same shape as Block Forge's newClassical) ----------
  function makeKit(R) {
    const open = () => pickId(R, R() < 0.5 ? 'bead' : R() < 0.5 ? 'lamp' : 'segment');
    return { bay: open(), accent: pickId(R, 'lamp'), door: pickId(R, 'lamp'), pil: R() < 0.8 ? pickId(R, 'segment') : null, frieze: pickId(R, 'frieze'), hook: pickId(R, 'hook') };
  }
  function newClassical(type, seed, o) {
    o = o || {};
    const R = rng(seed), int = (a, b) => a + Math.floor(R() * (b - a + 1)), odd = (n) => n % 2 ? n : n + 1, one = (a) => a[Math.floor(R() * a.length)];
    const parts = { volute: pickId(R, 'hook'), leaf: pickId(R, 'blade'), echinus: pickId(R, 'bead'), oculus: pickId(R, 'bead'), acro: pickId(R, 'lamp'), spire: pickId(R, 'spire') };
    const T = {
      temple: { bays: 3, pav: 3, depth: 6, floors: 2, base: 0.55, order: one(['doric', 'ionic', 'ionic']), front: 'portico', frame: 'plain', pediment: true, pitch: 15, attic: false, balus: false, quoins: true, steps: int(9, 14), dome: { on: R() < 0.75, w: 0.95, drum: 0.75, oculi: int(3, 5) }, text: 'SIGIL HALL' },
      palazzo: { bays: odd(int(9, 13)), pav: 3, depth: 5, floors: 3, base: 0.9, order: 'ionic', front: 'aedicule', frame: 'gibbs', pediment: R() < 0.35, pitch: 13, attic: false, balus: R() < 0.5, quoins: true, steps: 3, dome: { on: false, w: 0.5, drum: 0.6, oculi: 4 }, text: '' },
      giant: { bays: odd(int(7, 11)), pav: odd(int(3, 5)), depth: 5, floors: 2, base: 1.25, order: one(['ionic', 'corinthian']), front: 'pilasters', frame: 'plain', pediment: false, pitch: 14, attic: true, balus: true, quoins: false, steps: 0, dome: { on: false, w: 0.5, drum: 0.6, oculi: 4 }, text: '' },
      library: { bays: odd(int(11, 15)), pav: odd(int(5, 9)), depth: 9, floors: 2, base: 0.9, order: 'ionic', front: 'portico', frame: 'plain', pediment: false, pitch: 14, attic: true, balus: false, quoins: false, steps: int(10, 16), dome: { on: true, w: 0.42, drum: 0.65, oculi: 4 }, text: 'LIBRARY OF SIGIL CITY' },
    };
    const cl = { type, ...(T[type] || T.temple), parts };
    if (o.bays) cl.bays = Math.max(1, o.bays | 1);
    if (o.depth) cl.depth = o.depth;
    if (cl.pav > cl.bays) cl.pav = cl.bays;
    if (o.text != null) cl.text = o.text;
    return { kind: 'classical', seed, bayW: o.bayW || int(30, 40), floorH: o.floorH || int(44, 54), open: 0.72, cornice: 0.32, every: 2,
      kits: o.kits || { A: makeKit(R), B: makeKit(R) }, crown: { kind: 'none', blade: pickId(R, 'blade'), spire: pickId(R, 'spire'), lamp: pickId(R, 'lamp'), n: 5 }, cl };
  }

  // ---------- builder ----------
  function build(g, opts) {
    opts = opts || {};
    const u = opts.unit || 1 / 16, tol2 = (opts.tol == null ? 0.7 : opts.tol) ** 2, base = opts.color || [0.5, 0.95, 0.7];
    const c = g.cl, bw = g.bayW, fh = g.floorH, n = clamp(c.bays | 0, 1, 25), W = n * bw;
    const depthBays = c.depth || { temple: n + 3, palazzo: Math.max(4, Math.round(n * 0.45)), giant: Math.max(4, Math.round(n * 0.55)), library: Math.max(6, Math.round(n * 0.7)) }[c.type] || 5;
    const D = depthBays * bw;
    const P = (id, role) => part(id, role), kA = g.kits.A, kB = g.kits.B;
    const pos = [], col = [], occ = { P: [], I: [] };
    const tint = (w) => [Math.min(1, base[0] * w), Math.min(1, base[1] * w), Math.min(1, base[2] * w)];
    const seg = (a, b, w) => { const t = tint(w == null ? 1 : w); pos.push(a[0] * u, a[1] * u, a[2] * u, b[0] * u, b[1] * u, b[2] * u); col.push(t[0], t[1], t[2], t[0], t[1], t[2]); };
    const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
    // a part's polylines through map(lx, lyDown); samples closer than tol (px) are dropped
    const emit = (p, s, rot, flip, map, w) => {
      if (!p) return;
      const r = (rot || 0) * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r), fx = flip ? -1 : 1;
      for (const pl of p.polys) {
        let prev = null; const last = pl.length - 1;
        for (let i = 0; i <= last; i++) {
          const px = pl[i][0], py = pl[i][1], v = map(fx * (px * cr - py * sr) * s, (px * sr + py * cr) * s);
          if (!prev) { prev = v; continue; }
          const d2 = (v[0] - prev[0]) ** 2 + (v[1] - prev[1]) ** 2 + (v[2] - prev[2]) ** 2;
          if (d2 < tol2 && i !== last) continue;
          seg(prev, v, w); prev = v;
        }
      }
    };
    const fit = (p, bx, by) => p ? Math.min(bx / p.w, by / p.h) : 0;
    // a plane frame: origin O, across T, outward N (up is +y). Points sit 0.6 px proud of the plane.
    const frame = (O, T, N) => ({ O, T, N, at: (x, y, e = 0.6) => [O[0] + T[0] * x + N[0] * e, O[1] + y, O[2] + T[2] * x + N[2] * e] });
    const L = (F, x1, y1, x2, y2, w) => seg(F.at(x1, y1), F.at(x2, y2), w);
    const rectF = (F, x1, y1, x2, y2, w) => { L(F, x1, y1, x2, y1, w); L(F, x2, y1, x2, y2, w); L(F, x2, y2, x1, y2, w); L(F, x1, y2, x1, y1, w); };
    const putF = (F, p, x, y, s, o) => { o = o || {}; emit(p, s, o.rot, o.flip, (lx, ly) => F.at(x + lx, y - ly, o.e == null ? 0.8 : o.e), o.w); };
    const crossed = (p, X, Y, Z, s, K, o) => {
      o = o || {};
      for (let q = 0; q < K; q++) { const a = q / K * Math.PI + (o.phase || 0), ca = Math.cos(a), sa = Math.sin(a); emit(p, s, o.rot, o.flip, (lx, ly) => [X + lx * ca, Y - ly, Z + lx * sa], o.w); }
    };
    const circ = (cx, cz, y, r, w, m) => { m = m || Math.max(12, Math.min(64, Math.round(TAU * r / 8))); for (let i = 0; i < m; i++) { const a0 = i / m * TAU, a1 = (i + 1) / m * TAU; seg([cx + r * Math.sin(a0), y, cz + r * Math.cos(a0)], [cx + r * Math.sin(a1), y, cz + r * Math.cos(a1)], w); } };
    // occluder pieces
    const quad = (a, b, c2, d) => { const k = occ.P.length / 3; occ.P.push(...a, ...b, ...c2, ...d); occ.I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
    const oBox = (x0, x1, y0, y1, z0, z1) => {
      const e = 1; x0 += e; x1 -= e; z0 += e; z1 -= e; y1 -= e * 0.5;
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    };
    const oCyl = (cx, cz, r0, r1, y0, y1, m = 12) => { for (let i = 0; i < m; i++) { const a0 = i / m * TAU, a1 = (i + 1) / m * TAU; quad([cx + r0 * Math.sin(a0), y0, cz + r0 * Math.cos(a0)], [cx + r0 * Math.sin(a1), y0, cz + r0 * Math.cos(a1)], [cx + r1 * Math.sin(a1), y1, cz + r1 * Math.cos(a1)], [cx + r1 * Math.sin(a0), y1, cz + r1 * Math.cos(a0)]); } };

    // ---- heights (y up) ----
    const pv = clamp(c.pav % 2 ? c.pav : c.pav + 1, 1, n), pv0 = -pv * bw / 2, pv1 = pv * bw / 2;
    const hb = fh * c.base, Hb = c.floors * fh, ybody = hb + Hb;
    const Dm = ORDERS[c.order] || 9, giant = c.front === 'portico' || c.front === 'pilasters';
    const E = giant ? clamp(Hb * 0.22, fh * 0.4, fh * 0.9) : fh * 0.45, yE = ybody + E;
    const ha = c.attic ? fh * 0.55 : 0, ytop = yE + ha, hbal = c.balus ? fh * 0.32 : 0;
    const portico = c.front === 'portico', colD = Math.min(Hb / Dm, bw * 0.4), pd = portico ? bw * 0.95 + colD / 2 : 0;
    const zWall = D / 2, zFront = zWall + pd;   // portico front line
    const gable = c.pediment && (c.type === 'temple' || pv >= n);

    // ---- columns ----
    const capital = (cx, cz, yc, d) => {
      const h = d * 0.66;
      for (const yy of [yc, yc - d * 0.08]) { const k = yy === yc ? h : h * 0.92; seg([cx - k, yy, cz - k], [cx + k, yy, cz - k], 1.1); seg([cx + k, yy, cz - k], [cx + k, yy, cz + k], 1.1); seg([cx + k, yy, cz + k], [cx - k, yy, cz + k], 1.1); seg([cx - k, yy, cz + k], [cx - k, yy, cz - k], 1.1); }
      if (c.order === 'doric') { const p = P(c.parts.echinus, 'bead'); if (p) crossed(p, cx, yc - d * 0.2, cz, fit(p, d * 0.9, d * 0.36), 2, { w: 0.9 }); }
      if (c.order === 'ionic') { const p = P(c.parts.volute, 'hook'), s = fit(p, d * 0.55, d * 0.55); for (const sz of [1, -1]) { const F = frame([cx, 0, cz + sz * d * 0.5], [sz, 0, 0], [0, 0, sz]); putF(F, p, -d * 0.42, yc - d * 0.2, s, { w: 0.9 }); putF(F, p, d * 0.42, yc - d * 0.2, s, { w: 0.9, flip: true }); } }
      if (c.order === 'corinthian') { const p = P(c.parts.leaf, 'blade'), s = fit(p, d * 0.5, d * 0.5); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2, N = [Math.sin(a), 0, Math.cos(a)], F = frame([cx + N[0] * d * 0.45, 0, cz + N[2] * d * 0.45], [N[2], 0, -N[0]], N); for (const r of [-30, 0, 30]) putF(F, p, Math.sin(r * Math.PI / 180) * d * 0.25, yc - d * 0.35, s, { rot: r, flip: r > 0, w: 0.85 }); } }
      if (c.order === 'tuscan') circ(cx, cz, yc - d * 0.16, d * 0.55, 0.7, 12);
    };
    const column = (cx, cz, y0, y1, d) => {
      const bh = d * 0.3, ys = y0 + bh, yc = y1 - d * 0.42, k = d * 0.66;
      seg([cx - k, y0, cz - k], [cx + k, y0, cz - k], 0.9); seg([cx + k, y0, cz - k], [cx + k, y0, cz + k], 0.9); seg([cx + k, y0, cz + k], [cx - k, y0, cz + k], 0.9); seg([cx - k, y0, cz + k], [cx - k, y0, cz - k], 0.9);
      circ(cx, cz, y0 + bh * 0.5, d * 0.58, 0.7, 14); circ(cx, cz, ys, d * 0.5, 0.8, 14); circ(cx, cz, yc, d * 0.42, 0.8, 14);
      const fl = c.order === 'tuscan' ? 6 : 10;
      for (let i = 0; i < fl; i++) { const a = i / fl * TAU; seg([cx + d * 0.5 * Math.sin(a), ys, cz + d * 0.5 * Math.cos(a)], [cx + d * 0.42 * Math.sin(a), yc, cz + d * 0.42 * Math.cos(a)], i % 2 ? 0.55 : 0.9); }
      capital(cx, cz, y1, d);
      oCyl(cx, cz, d * 0.46, d * 0.39, y0, y1 - d * 0.1);
    };

    // ---- one wall's facade ----
    const faces = [
      { name: 'front', F: frame([0, 0, zWall], [1, 0, 0], [0, 0, 1]), w: W },
      { name: 'back', F: frame([0, 0, -zWall], [-1, 0, 0], [0, 0, -1]), w: W },
      { name: 'right', F: frame([W / 2, 0, 0], [0, 0, -1], [1, 0, 0]), w: D },
      { name: 'left', F: frame([-W / 2, 0, 0], [0, 0, 1], [-1, 0, 0]), w: D },
    ];
    const stairW = c.steps > 0 ? (portico ? pv * bw : bw * 1.6) / 2 + c.steps * 4 + 4 : 0;
    for (const f of faces) {
      const F = f.F, fw = f.w, nb = Math.max(1, Math.round(fw / bw)), bwf = fw / nb, x0 = -fw / 2, x1 = fw / 2, front = f.name === 'front';
      // base with rustication and basement grilles
      rectF(F, x0, 0, x1, hb, 1.1); L(F, x0 - 4, hb, x1 + 4, hb, 1.2);
      for (let y = 9, r = 0; y < hb - 4; y += 9, r++) L(F, x0, y, x1, y, 0.35);
      for (let i = 0; i < nb; i++) {
        const cx = x0 + (i + 0.5) * bwf; if (front && Math.abs(cx) < stairW + 4) continue;
        const s = Math.min(bwf * 0.42, hb * 0.5), cy = hb * 0.45; rectF(F, cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2, 0.7);
        L(F, cx, cy - s / 2, cx, cy + s / 2, 0.45); L(F, cx - s / 2, cy, cx + s / 2, cy, 0.45);
      }
      // body
      L(F, x0, hb, x0, ybody, 1); L(F, x1, hb, x1, ybody, 1);
      if (front && pv < n) for (const ex of [pv0, pv1]) { L(F, ex, hb, ex, ybody, 1); L(F, ex + (ex < 0 ? -3 : 3), hb, ex + (ex < 0 ? -3 : 3), ybody, 0.45); }
      if (c.quoins) for (const [ex, dir] of [[x0, 1], [x1, -1]]) for (let y = hb, k = 0; y + 8 < ybody; y += 9, k++) rectF(F, ex, y, ex + dir * (k % 2 ? 9 : 15), y + 8, 0.55);
      for (let fl = 0; fl < c.floors; fl++) {
        const yf = hb + fl * fh; if (fl) L(F, x0, yf, x1, yf, 0.4);
        for (let i = 0; i < nb; i++) {
          const cx = x0 + (i + 0.5) * bwf, door = front && fl === 0 && i === (nb - 1) / 2;
          if (front && portico && fl === 0 && Math.abs(cx) < pv * bw / 2 && !door) { /* the portico shades the ground floor: keep its windows */ }
          const ww = bwf * 0.44 * (g.open / 0.72), wh = door ? fh * 0.82 : fh * (fl === 1 ? 0.62 : 0.54), yb = yf + (door ? 0 : fh * 0.2), yt = yb + wh;
          rectF(F, cx - ww / 2, yb, cx + ww / 2, yt, 0.85);
          if (door) { const dp = P(kA.door, 'lamp'); L(F, cx, yb, cx, yt - wh * 0.3, 0.5); L(F, cx - ww / 2, yt - wh * 0.3, cx + ww / 2, yt - wh * 0.3, 0.5); if (dp) putF(F, dp, cx, yt - wh * 0.15, fit(dp, ww * 0.8, wh * 0.26), { w: 0.9 }); }
          else { L(F, cx, yb, cx, yt, 0.35); L(F, cx - ww / 2, yb + wh * 0.58, cx + ww / 2, yb + wh * 0.58, 0.35); L(F, cx - ww / 2 - 3, yb - 2, cx + ww / 2 + 3, yb - 2, 0.8); }
          if (c.frame === 'gibbs') {
            for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const by = yb + (k + 0.5) * wh / 3, w2 = k % 2 ? 4 : 7; rectF(F, cx + s * ww / 2, by - wh / 7, cx + s * (ww / 2 + w2), by + wh / 7, 0.5); }
            const kp = P(kA.bay, 'bead'); if (kp && front) putF(F, kp, cx, yt + 5, fit(kp, 11, 13), { w: 0.9 });
          } else if (c.frame === 'pediments' && fl === Math.min(1, c.floors - 1) && !door) {
            const ph = ww * 0.22; L(F, cx - ww / 2 - 4, yt + 3, cx, yt + 3 + ph, 0.85); L(F, cx, yt + 3 + ph, cx + ww / 2 + 4, yt + 3, 0.85); L(F, cx - ww / 2 - 4, yt + 3, cx + ww / 2 + 4, yt + 3, 0.85);
          } else L(F, cx - ww / 2 - 2, yt + 3, cx + ww / 2 + 2, yt + 3, 0.7);
          if (front && fl === Math.min(1, c.floors - 1) && !door && Math.abs(cx) < pv * bw / 2) { const ap = P(kB.accent, 'lamp'); if (ap) putF(F, ap, cx, yb + wh * 0.38, fit(ap, ww * 0.62, wh * 0.4), { w: 0.85 }); }
        }
      }
      // the order on the wall: giant pilasters everywhere, or corner pilasters that carry the portico's order round the building
      const pil = (x, d) => { const w2 = d * 0.42; L(F, x - w2, hb, x - w2, ybody - d * 0.35, 0.85); L(F, x + w2, hb, x + w2, ybody - d * 0.35, 0.85); L(F, x - w2 * 1.3, ybody - d * 0.08, x + w2 * 1.3, ybody - d * 0.08, 1); L(F, x - w2 * 1.3, ybody, x + w2 * 1.3, ybody, 1);
        if (c.order === 'ionic') { const p = P(c.parts.volute, 'hook'), s = fit(p, d * 0.45, d * 0.45); if (p) { putF(F, p, x - d * 0.36, ybody - d * 0.2, s, { w: 0.85 }); putF(F, p, x + d * 0.36, ybody - d * 0.2, s, { w: 0.85, flip: true }); } }
        if (c.order === 'corinthian') { const p = P(c.parts.leaf, 'blade'), s = fit(p, d * 0.42, d * 0.42); if (p) for (const r of [-30, 0, 30]) putF(F, p, x + Math.sin(r * Math.PI / 180) * d * 0.25, ybody - d * 0.32, s, { rot: r, flip: r > 0, w: 0.8 }); }
      };
      if (c.front === 'pilasters') { const d = Math.min(Hb / Dm, bwf * 0.34); for (let k = 0; k <= nb; k++) if (k === 0 || k === nb || k % 2 === 0 || (front && x0 + k * bwf >= pv0 - 1 && x0 + k * bwf <= pv1 + 1)) pil(x0 + k * bwf, d); }
      else if (giant) { const d = Math.min(Hb / Dm, bwf * 0.34); pil(x0 + d * 0.5, d); pil(x1 - d * 0.5, d); }
      // entablature (same heights on every wall, so it turns the corners)
      L(F, x0 - 2, ybody, x1 + 2, ybody, 1); L(F, x0 - 2, ybody + E * 0.14, x1 + 2, ybody + E * 0.14, 0.55); L(F, x0 - 2, ybody + E * 0.3, x1 + 2, ybody + E * 0.3, 0.85);
      const fy0 = ybody + E * 0.3, fy1 = ybody + E * 0.66, fcy = (fy0 + fy1) / 2; L(F, x0 - 2, fy1, x1 + 2, fy1, 0.85);
      const text = front && !portico ? (c.text || '') : '', inscW = text ? Math.min(fw * 0.8, Math.max(pv * bw, fw * 0.5)) : 0;
      if (text) inscribe(F, text, 0, fcy, (fy1 - fy0) * 0.62, inscW);
      if (c.order === 'doric' && P(kA.pil, 'segment')) { const tg = P(kA.pil, 'segment'); for (let k = 0; k <= nb; k++) { const x = x0 + k * bwf; if (text && Math.abs(x) < inscW / 2 + 8) continue; putF(F, tg, x, fcy, fit(tg, bwf * 0.3, (fy1 - fy0) * 0.85), { w: 0.8 }); } }
      else { const fr = P(kA.frieze, 'frieze'); if (fr) { const s = fit(fr, bwf * 0.9, (fy1 - fy0) * 0.7); for (let k = 0; k < nb; k++) { const x = x0 + (k + 0.5) * bwf; if (text && Math.abs(x) < inscW / 2 + bwf * 0.3) continue; putF(F, fr, x, fcy, s, { w: 0.8 }); } } }
      L(F, x0 - 10, yE, x1 + 10, yE, 1.3); L(F, x0 - 6, yE - 4, x1 + 6, yE - 4, 0.6);
      for (let x = x0 - 4; x <= x1 + 4; x += 6) L(F, x, fy1, x, fy1 + (yE - 4 - fy1) * 0.55, 0.4);
      if (c.attic) { rectF(F, x0 + 4, yE, x1 - 4, ytop, 0.85); L(F, x0 - 2, ytop, x1 + 2, ytop, 1); for (let i = 0; i < nb; i++) { const cx = x0 + (i + 0.5) * bwf, s = Math.min(bwf * 0.3, ha * 0.45); rectF(F, cx - s / 2, yE + ha * 0.28, cx + s / 2, yE + ha * 0.28 + s, 0.55); } }
      if (c.balus) {
        const sg = P(kB.pil || kA.pil, 'segment'); L(F, x0, ytop + hbal, x1, ytop + hbal, 0.95); L(F, x0, ytop + hbal + 3, x1, ytop + hbal + 3, 0.55);
        for (let k = 0; k <= nb; k++) rectF(F, x0 + k * bwf - 4, ytop, x0 + k * bwf + 4, ytop + hbal + 3, 0.6);
        for (let x = x0 + 8; x < x1 - 4; x += 8) { const m = (x - x0) % bwf; if (m < 6 || bwf - m < 6) continue; sg ? putF(F, sg, x, ytop + hbal / 2, fit(sg, 5, hbal * 0.85), { w: 0.6 }) : L(F, x, ytop, x, ytop + hbal, 0.5); }
      }
    }
    // inscription in xenoglyphs on a frame, centred at x
    function inscribe(F, text, cx, cy, h, maxW) {
      const t = text.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim(); if (!t) return;
      let adv = h * 0.92; const tot = () => [...t].reduce((a, ch) => a + (ch === ' ' ? adv * 0.6 : adv), 0);
      if (tot() > maxW) adv *= maxW / tot();
      let x = cx - tot() / 2;
      for (const ch of t) { if (ch !== ' ') { const p = CA().byId['P' + String(359 + XENO.indexOf(ch)).padStart(3, '0')]; if (p) putF(F, p, x + adv / 2, cy, (adv / 0.92) / 26, { w: 1 }); } x += ch === ' ' ? adv * 0.6 : adv; }
    }
    // body, entablature and attic as solids
    oBox(-W / 2, W / 2, 0, ytop, -D / 2, D / 2);

    // ---- portico: columns standing free, its own entablature, a podium under it ----
    if (portico) {
      const zc = zWall + bw * 0.95, xa = pv0 - colD, xb = pv1 + colD;
      for (let k = 0; k <= pv; k++) for (const z of [zc, ...(c.type === 'temple' ? [zc - bw * 0.95] : [])]) if (!(z < zc && k > 0 && k < pv)) column(pv0 + k * bw, z, hb, ybody, colD);
      // portico entablature: front and two short sides
      const Fp = frame([0, 0, zFront], [1, 0, 0], [0, 0, 1]);
      L(Fp, xa, ybody, xb, ybody, 1); L(Fp, xa, ybody + E * 0.3, xb, ybody + E * 0.3, 0.85); L(Fp, xa, ybody + E * 0.66, xb, ybody + E * 0.66, 0.85); L(Fp, xa - 10, yE, xb + 10, yE, 1.3);
      for (let x = xa; x <= xb; x += 6) L(Fp, x, ybody + E * 0.66, x, ybody + E * 0.66 + (yE - 4 - ybody - E * 0.66) * 0.55, 0.4);
      if (c.text) inscribe(Fp, c.text, 0, ybody + E * 0.48, E * 0.36 * 0.62, Math.max(pv * bw * 0.85, bw));
      for (const sx of [xa, xb]) { const Fs = frame([sx, 0, (zWall + zFront) / 2], [0, 0, sx < 0 ? 1 : -1], [sx < 0 ? -1 : 1, 0, 0]); const hw = (zFront - zWall) / 2; L(Fs, -hw, ybody, hw, ybody, 1); L(Fs, -hw, ybody + E * 0.66, hw, ybody + E * 0.66, 0.85); L(Fs, -hw - 6, yE, hw + 6, yE, 1.2); L(Fs, hw, ybody, hw, yE, 0.8); }
      if (!gable) { seg([xa - 10, yE, zFront], [xa - 10, yE, zWall], 1); seg([xb + 10, yE, zFront], [xb + 10, yE, zWall], 1); if (c.attic) { const Fa = frame([0, 0, zFront - 4], [1, 0, 0], [0, 0, 1]); rectF(Fa, xa, yE, xb, ytop, 0.8); } }
      oBox(xa, xb, ybody, gable ? yE : ytop, zWall, zFront);
      oBox(xa - 6, xb + 6, 0, hb, zWall, zFront + colD);
      const Fs2 = frame([0, 0, zFront + colD], [1, 0, 0], [0, 0, 1]); rectF(Fs2, xa - 6, 0, xb + 6, hb, 0.9);
    }
    // ---- entrance porch with a balcony (palazzo) ----
    if (c.front === 'aedicule') {
      const d = bw * 0.2, hh = fh * 0.95, zc = zWall + bw * 0.35, ya = hb + hh;
      for (const x of [-bw * 0.62, bw * 0.62]) column(x, zc, hb, ya - d * 0.4, d);
      const x0 = -bw * 0.62 - d * 1.3, x1 = bw * 0.62 + d * 1.3, z1 = zc + d * 0.9;
      for (const y of [ya, ya + fh * 0.12]) { seg([x0, y, zWall], [x0, y, z1], 0.9); seg([x0, y, z1], [x1, y, z1], 0.9); seg([x1, y, z1], [x1, y, zWall], 0.9); }
      const Fb = frame([0, 0, z1], [1, 0, 0], [0, 0, 1]), bh = fh * 0.28, yb = ya + fh * 0.12, sg = P(kA.pil, 'segment');
      L(Fb, x0, yb + bh, x1, yb + bh, 1); for (let x = x0 + 4; x <= x1 - 4; x += 7) sg ? putF(Fb, sg, x, yb + bh / 2, fit(sg, 5, bh * 0.9), { w: 0.7 }) : L(Fb, x, yb, x, yb + bh, 0.5);
      oBox(x0, x1, ya, yb, zWall, z1);
    }

    // ---- roof: a true gable for temples, a front pediment or a flat balustraded roof otherwise ----
    const yr = c.attic ? ytop : yE;
    let roofTop = yr + hbal;
    const tymp = (F, half, ph, y0) => {
      const lp = P(kB.accent, 'lamp'), bl = P(g.crown.blade, 'blade'), th = ph * 0.62, cy = y0 + ph * 0.36;
      if (lp) putF(F, lp, 0, cy, fit(lp, th * 0.9, th * 0.85), { w: 0.9 });
      if (bl) { const s = fit(bl, th * 0.55, th * 0.55); for (const a of [-70, -45]) { const r = th * 0.75, rx = Math.sin(a * Math.PI / 180) * r * 1.5, ry = Math.cos(a * Math.PI / 180) * r * 0.5; putF(F, bl, rx, cy + ry - th * 0.2, s, { rot: a, w: 0.85 }); putF(F, bl, -rx, cy + ry - th * 0.2, s, { rot: -a, flip: true, w: 0.85 }); } }
      void half;
    };
    if (gable) {
      const half = W / 2 + 8, ph = half * Math.tan(clamp(c.pitch, 8, 30) * Math.PI / 180), zf = portico ? zFront + 4 : zWall + 4, zb = -zWall - 4;
      for (const [z, sgn] of [[zf, 1], [zb, -1]]) {
        const F = frame([0, 0, z], [sgn, 0, 0], [0, 0, sgn]);
        L(F, -half, yr, 0, yr + ph, 1.35); L(F, 0, yr + ph, half, yr, 1.35); L(F, -half, yr, half, yr, 1);
        L(F, -half + 10, yr + 3, 0, yr + ph - 7, 0.55); L(F, 0, yr + ph - 7, half - 10, yr + 3, 0.55);
        if (sgn > 0) tymp(F, half, ph, yr);
      }
      seg([0, yr + ph, zf], [0, yr + ph, zb], 1.1); seg([-half, yr, zf], [-half, yr, zb], 0.9); seg([half, yr, zf], [half, yr, zb], 0.9);
      for (let z = zb + 14; z < zf - 6; z += 14) { seg([-half, yr, z], [0, yr + ph, z], 0.3); seg([0, yr + ph, z], [half, yr, z], 0.3); }
      const ac = P(c.parts.acro, 'lamp'), hk = P(kA.hook, 'hook');
      if (ac) crossed(ac, 0, yr + ph + 10, zf, fit(ac, 26, 22), 2, { w: 1 });
      if (hk) { const s = fit(hk, 18, 18); crossed(hk, -half + 4, yr + 10, zf, s, 1, { rot: -15 }); crossed(hk, half - 4, yr + 10, zf, s, 1, { rot: 15, flip: true }); }
      quad([-half, yr, zf], [0, yr + ph, zf], [0, yr + ph, zb], [-half, yr, zb]); quad([0, yr + ph, zf], [half, yr, zf], [half, yr, zb], [0, yr + ph, zb]);
      quad([-half, yr, zf], [half, yr, zf], [0, yr + ph, zf], [0, yr + ph, zf]); quad([half, yr, zb], [-half, yr, zb], [0, yr + ph, zb], [0, yr + ph, zb]);
      roofTop = yr + ph;
    } else {
      seg([-W / 2, yr, -D / 2], [W / 2, yr, -D / 2], 0.6); seg([-W / 2, yr, D / 2], [-W / 2, yr, -D / 2], 0.6); seg([W / 2, yr, D / 2], [W / 2, yr, -D / 2], 0.6);
      if (c.pediment) {
        const half = (portico ? pv * bw / 2 + colD : pv * bw / 2) + 8, ph = half * Math.tan(clamp(c.pitch, 8, 30) * Math.PI / 180), zf = (portico ? zFront : zWall) + 2;
        const F = frame([0, 0, zf], [1, 0, 0], [0, 0, 1]);
        L(F, -half, yr, 0, yr + ph, 1.35); L(F, 0, yr + ph, half, yr, 1.35); L(F, -half, yr, half, yr, 1); tymp(F, half, ph, yr);
        const ac = P(c.parts.acro, 'lamp'); if (ac) crossed(ac, 0, yr + ph + 10, zf, fit(ac, 26, 22), 2, { w: 1 });
        seg([0, yr + ph, zf], [0, yr + ph, zf - bw * 0.8], 0.9);
        quad([-half, yr, zf], [half, yr, zf], [0, yr + ph, zf], [0, yr + ph, zf]);
        roofTop = Math.max(roofTop, yr + ph);
      } else { const hk = P(kA.hook, 'hook'); if (hk) { const s = fit(hk, 16, 16); for (const [x, z] of [[-W / 2, D / 2], [W / 2, D / 2], [-W / 2, -D / 2], [W / 2, -D / 2]]) crossed(hk, x, yr + hbal + 9, z, s, 1, { phase: Math.atan2(z, x) + Math.PI / 4, flip: x > 0 }); } }
    }

    // ---- stairs, cheek walls, lamp standards ----
    let zStair = portico ? zFront + colD : zWall;
    if (c.steps > 0) {
      const sh = hb / c.steps, run = 9, sw0 = (portico ? pv * bw : bw * 1.6) / 2 + 6;
      for (let k = 0; k < c.steps; k++) {
        const w = sw0 + (k + 1) * 4, ztop = zStair + (c.steps - 1 - k) * run, zEdge = ztop + run, y = hb - k * sh;
        // each step: its nosing, the foot of its riser, and the riser ends
        seg([-w, y, zEdge], [w, y, zEdge], 0.95); seg([-w, y - sh, zEdge], [w, y - sh, zEdge], 0.45);
        seg([-w, y, zEdge], [-w, y - sh, zEdge], 0.5); seg([w, y, zEdge], [w, y - sh, zEdge], 0.5); seg([-w, y, zEdge], [-w, y, zEdge - run], 0.5); seg([w, y, zEdge], [w, y, zEdge - run], 0.5);
        oBox(-w, w, 0, y - sh * 0.1, zStair - 2, zEdge);
      }
      const zEnd = zStair + c.steps * run, cw = sw0 + c.steps * 4 + 2, lp = P(kA.accent, 'lamp');
      for (const s of [-1, 1]) {
        const xa = s * cw, xb = s * (cw + 12), xl = Math.min(xa, xb), xh = Math.max(xa, xb);
        for (const z of [zStair, zEnd]) { seg([xl, 0, z], [xl, hb + 4, z], 0.8); seg([xh, 0, z], [xh, hb + 4, z], 0.8); seg([xl, hb + 4, z], [xh, hb + 4, z], 0.8); }
        seg([xl, hb + 4, zStair], [xl, hb + 4, zEnd], 0.8); seg([xh, hb + 4, zStair], [xh, hb + 4, zEnd], 0.8);
        oBox(xl, xh, 0, hb + 4, zStair, zEnd);
        if (lp) { const ls = fit(lp, 18, 22), xm = (xl + xh) / 2, py = hb + 4 + fh * 0.5; seg([xm, hb + 4, zEnd - 6], [xm, py, zEnd - 6], 1); crossed(lp, xm, py + lp.h * ls / 2, zEnd - 6, ls, 2, { w: 1 }); }
      }
      zStair = zEnd;
    }

    // ---- dome: drum with round windows, ribs, lantern ----
    let top = roofTop;
    if (c.dome && c.dome.on) {
      const rd = Math.min(Math.max(bw * 1.2, W * c.dome.w / 2), Math.min(W, D) / 2 * 0.95);
      const y0 = yr + hbal, dh = fh * c.dome.drum + (gable ? (roofTop - yr) * 0.9 : 0), y1 = y0 + dh;
      circ(0, 0, y0, rd, 1); circ(0, 0, y1, rd, 1); circ(0, 0, y1 + 3, rd + 6, 1.2);
      const k = Math.max(6, (c.dome.oculi || 4) * 3), oc = P(c.parts.oculus, 'bead');
      for (let i = 0; i < k; i++) {
        const a = i / k * TAU, a2 = (i + 0.5) / k * TAU;
        seg([rd * Math.sin(a), y0, rd * Math.cos(a)], [rd * Math.sin(a), y1, rd * Math.cos(a)], 0.5);
        if (oc) { const F = frame([rd * Math.sin(a2), 0, rd * Math.cos(a2)], [Math.cos(a2), 0, -Math.sin(a2)], [Math.sin(a2), 0, Math.cos(a2)]); putF(F, oc, 0, y1 - fh * c.dome.drum * 0.5, fit(oc, fh * c.dome.drum * 0.42, fh * c.dome.drum * 0.42), { w: 0.9 }); }
      }
      const R = rd * 0.98, Hd = R * 0.72, yb = y1 + 3, M = 16, T = 10;
      for (let m = 0; m < M; m++) { const a = m / M * TAU; let prev = null; for (let t = 0; t <= T; t++) { const th = t / T * Math.PI / 2, v = [R * Math.cos(th) * Math.sin(a), yb + Hd * Math.sin(th), R * Math.cos(th) * Math.cos(a)]; if (prev) seg(prev, v, m % 2 ? 0.55 : 0.95); prev = v; } }
      for (const th of [0.45, 0.9]) circ(0, 0, yb + Hd * Math.sin(th), R * Math.cos(th), 0.5);
      oCyl(0, 0, rd - 1, rd - 1, y0, y1, 24);
      for (let s = 0; s < 6; s++) { const t0 = s / 6 * Math.PI / 2, t1 = (s + 1) / 6 * Math.PI / 2; oCyl(0, 0, (R - 1) * Math.cos(t0), Math.max(1, (R - 1) * Math.cos(t1)), yb + Hd * Math.sin(t0), yb + Hd * Math.sin(t1), 24); }
      const lw = R * 0.16, lh = R * 0.3, yl = yb + Hd - 2, sg = P(kB.pil || kA.pil, 'segment');
      circ(0, 0, yl, lw, 0.9, 16); circ(0, 0, yl + lh, lw, 0.9, 16);
      if (sg) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, F = frame([lw * Math.sin(a), 0, lw * Math.cos(a)], [Math.cos(a), 0, -Math.sin(a)], [Math.sin(a), 0, Math.cos(a)]); putF(F, sg, 0, yl + lh / 2, fit(sg, lw * 0.5, lh * 0.9), { w: 0.9 }); }
      for (let m = 0; m < 8; m++) { const a = m / 8 * TAU; let prev = null; for (let t = 0; t <= 5; t++) { const th = t / 5 * Math.PI / 2, v = [lw * 1.1 * Math.cos(th) * Math.sin(a), yl + lh + lw * 0.8 * Math.sin(th), lw * 1.1 * Math.cos(th) * Math.cos(a)]; if (prev) seg(prev, v, 0.8); prev = v; } }
      oCyl(0, 0, lw - 1, lw - 1, yl, yl + lh, 12);
      const sp = P(c.parts.spire, 'spire'); let st = yl + lh + lw * 0.8;
      if (sp) { const s = fit(sp, lw * 1.4, lh * 1.6); crossed(sp, 0, st + sp.h * s / 2 - 2, 0, s, 2, { w: 1 }); st += sp.h * s; }
      top = Math.max(top, st);
    }

    const nv = occ.P.length / 3, P3 = new Float32Array(occ.P.map((v) => v * u));
    const normals = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) normals[i * 3 + 1] = 1;
    const occluder = { positions: P3, normals, uv: new Float32Array(nv * 2), color: new Float32Array(nv * 4).fill(1), indices: new Uint32Array(occ.I), mode: 'triangles', materialTag: 'body' };
    const positions = new Float32Array(pos), colors = new Float32Array(col);
    return { lines: { positions, colors }, occluder, top: top * u, reach: Math.hypot(W / 2 + 12, Math.max(D / 2, zStair)) * u, footprint: { w: W * u, d: (D / 2 + zStair) * u, zFront: zStair * u },
      stats: { segments: positions.length / 6, occluderTris: occ.I.length / 3, bays: n, depthBays } };
  }

  window.CreatureClassical = { newClassical, build, TYPES: ['temple', 'palazzo', 'giant', 'library'] };
})();
