/* creature-city.js — the radial WFC city, built Block Forge style from the creature parts.
   Depends on: shared/city-wfc.js, shared/creature-arch.js (loaded), shared/creature-spire.js.

   The WFC stays the plan: rings, zones, which piece sits in each cell, which sides open onto a
   street, and how many storeys the stacking pass put on top. This file only decides what gets
   built there:

     courtyard buildings, corner lots, wall  -> Block Forge blocks: bays x floors + cornice,
                                                street faces fully dressed (door, accents, pilasters),
                                                back faces kept quiet (pilaster lines, sparse bays)
     storeys / roof / dome / windcatcher     -> extra floors, set-backs and a Block Forge crown
     minaret, bastion, gate, pavilion,
     cistern, masjid minaret                 -> small Spire Forge towers (creature-spire.js)
     streets, arcades, canals                -> kerb lines; arcades get a row of standing arches
     fountains, gardens                      -> rings of beads, part "trees"
     walls/corners/gates around a boundary   -> perimeterWall(): a MODULAR grammar (wall-run +
                                                corner-post + gate-opening pieces walked around an
                                                arbitrary closed loop), not a whole-cell block -- used
                                                for the outer city wall, landmark-tower defensive
                                                rings (opts.towerClusters), and institutional
                                                buildings' courtyard precinct walls (2026-11-03)

   Every district (zone) gets ONE style: bay width, cornice, massing rule and a parts kit, so a
   quarter reads as one place. Facades, crowns and towers are built once per distinct variant and
   instanced; ring cells are all the same size, so variants repeat a lot.

   CreatureCity.build(wfc, seed, opts) -> {
     groups:   [{ key, geom:{positions, colors}, matrices:[Float32Array(16)], ranks:[] }]  city-local
     occluder: { positions, normals, uv, color, indices, mode:'triangles', materialTag:'body' }  city-local
     stats }
   City-local = the WFC's own frame (x/z ground, y up, RADII units). Multiply by your city model.
   opts.zoneColor(zone) -> [r,g,b]   opts.storeyPx (default 46: px of a Block Forge floor = STOREY_H)
   A host that wants its own landmark towers at specific cells doesn't need an option here at all
   (2026-11-02) -- pin those cells to shared/city-wfc.js's zero-weight 'belvedere' tile (housing
   zone, all-'b' sockets, see city-wfc.js's TILE_DEFS) before calling CityWFC.generate(), and this
   file naturally builds nothing there: 'belvedere' isn't handled by any case in the per-cell
   switch below, and its closed sockets mean it also never emits a street/kerb line.
*/
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  // ---------- small mat4 helpers (column-major, like WebGL) ----------
  function trsY(x, y, z, ry, s) { s = s == null ? 1 : s; const c = Math.cos(ry), n = Math.sin(ry); return new Float32Array([c * s, 0, -n * s, 0, 0, s, 0, 0, n * s, 0, c * s, 0, x, y, z, 1]); }
  function mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = v; } return o; }
  function apply(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }

  // ---------- cell frame (same as city-mesh-engine: +x radial out, +z increasing angle) ----------
  function frameOf(cell) {
    if (cell.ring === 0) return { rm: 0, am: 0, depth: cell.r1 * 2, width: cell.r1 * 2, da: TAU };
    const rm = (cell.r0 + cell.r1) / 2, am = (cell.a0 + cell.a1) / 2;
    return { rm, am, depth: cell.r1 - cell.r0, width: rm * (cell.a1 - cell.a0), da: cell.a1 - cell.a0 };
  }
  const cellMatrix = (f, y) => trsY(f.rm * Math.cos(f.am), y || 0, f.rm * Math.sin(f.am), -f.am);
  function Lp(f, r, a) { // world polar -> cell-local [x, z]
    const dx = r * Math.cos(a) - f.rm * Math.cos(f.am), dz = r * Math.sin(a) - f.rm * Math.sin(f.am);
    return [dx * Math.cos(f.am) + dz * Math.sin(f.am), -dx * Math.sin(f.am) + dz * Math.cos(f.am)];
  }
  function armPath(cell, side, RINGS) {
    const f = cell.f, arc = (r, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) p.push(Lp(f, r, a0 + (a1 - a0) * i / n)); return p; };
    if (side === 'in') return [[[0, 0], Lp(f, cell.r0, f.am)]];
    if (side === 'cw') return [arc(f.rm, f.am, cell.a1, 6)];
    if (side === 'ccw') return [arc(f.rm, f.am, cell.a0, 6)];
    const out = [[[0, 0], Lp(f, cell.r1, f.am)]];
    if (cell.ring < RINGS.length - 1 && RINGS[cell.ring + 1] > RINGS[cell.ring]) out.push(arc(cell.r1, f.am - f.da / 4, f.am + f.da / 4, 4));
    return out;
  }

  // ---------- geometry sink ----------
  function Geo(rgb) { this.p = []; this.c = []; this.rgb = rgb; }
  Geo.prototype.seg = function (a, b, w) {
    const r = this.rgb, k = w == null ? 1 : w;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const cr = Math.min(1, r[0] * k), cg = Math.min(1, r[1] * k), cb = Math.min(1, r[2] * k);
    this.c.push(cr, cg, cb, cr, cg, cb);
  };
  Geo.prototype.done = function () { return { positions: new Float32Array(this.p), colors: new Float32Array(this.c) }; };
  // a part's polylines through map(lx, lyDown) — lx/lyDown already scaled, rotated and flipped
  // Points closer than TOL (city units) to the last kept point are dropped: parts drawn this small
  // don't need every Bezier sample, and this is most of the line budget.
  let TOL = 0.02;
  function emit(G, p, s, rot, flip, map, w) {
    const r = (rot || 0) * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r), fx = flip ? -1 : 1, t2 = TOL * TOL;
    for (const pl of p.polys) {
      let prev = null;
      const last = pl.length - 1;
      for (let i = 0; i <= last; i++) {
        const px = pl[i][0], py = pl[i][1];
        const v = map(fx * (px * cr - py * sr) * s, (px * sr + py * cr) * s);
        if (!prev) { prev = v; continue; }
        const d2 = (v[0] - prev[0]) ** 2 + (v[1] - prev[1]) ** 2 + (v[2] - prev[2]) ** 2;
        if (d2 < t2 && i !== last) continue;
        if (d2 > 1e-12) G.seg(prev, v, w);
        prev = v;
      }
    }
  }
  // flat on a facade plane (z = 0), centred at (cx, cy) with y up
  const flat = (G, p, cx, cy, s, o) => emit(G, p, s, o && o.rot, o && o.flip, (lx, ly) => [cx + lx, cy - ly, 0.004], o && o.w);
  // standing, crossed: K vertical planes through the origin
  function crossed(G, p, x, y, s, K, o) {
    o = o || {};
    for (let q = 0; q < K; q++) {
      const phi = q / K * Math.PI + (o.phase || 0), c = Math.cos(phi), n = Math.sin(phi);
      emit(G, p, s, o.rot, o.flip, (lx, ly) => { const X = x + lx; return [X * c, y - ly, X * n]; }, o.w);
    }
  }

  // ---------- district styles (Block Forge genome per zone) ----------
  function pools(CA) {
    const by = (r) => CA.byRole[r] || [];
    const open = [...by('bead'), ...by('lamp'), ...by('segment')].filter((p) => p.side === 'center' && Math.max(p.w, p.h) <= 130);
    return { open, bead: by('bead'), lamp: by('lamp').filter((p) => p.side === 'center'), segment: by('segment'), frieze: by('frieze'), hook: by('hook'),
      blade: by('blade'), spire: by('spire'), halo: by('halo'), buttress: by('buttress') };
  }
  function makeStyle(zone, seed, P) {
    const R = rng(hash(zone + '|' + seed)), pick = (a) => a.length ? a[Math.floor(R() * a.length)] : null;
    const kit = () => ({ bay: pick(R() < 0.5 ? P.bead : R() < 0.5 ? P.lamp : P.segment) || pick(P.open), accent: pick(P.lamp), door: pick(P.lamp),
      pil: R() < 0.8 ? pick(P.segment) : null, frieze: pick(P.frieze), hook: pick(P.hook) });
    const massing = { bazaar: 'podium', housing: R() < 0.5 ? 'stepped' : 'stack', sanctum: 'stack', wall: 'stack', garden: 'stack', core: 'stack' }[zone] || 'stack';
    return { zone, bwPx: 30 + Math.floor(R() * 13), open: 0.72, cornice: 0.24 + R() * 0.12, every: 2 + Math.floor(R() * 3), massing,
      A: kit(), B: kit(), blade: pick(P.blade), spire: pick(P.spire), lamp: pick(P.lamp), bead: pick(P.bead), halo: pick(P.halo), seg: pick(P.segment),
      butt: pick(P.buttress) };
  }

  // ---------- one facade (port of Block Forge drawBlock, one side of a box) ----------
  // Local frame: x across the face (centred), y up from the block's base, facing +z.
  function facade(rgb, st, kit, n, bw, floors, fh, ch, o) {
    const G = new Geo(rgb), Wd = n * bw, x0 = -Wd / 2, Hd = floors * fh + ch, mid = (n - 1) / 2;
    const line = (x1, y1, x2, y2, w) => G.seg([x1, y1, 0.004], [x2, y2, 0.004], w);
    line(x0, Hd, x0 + Wd, Hd, 0.9); line(x0, 0, x0 + Wd, 0, 0.9);
    line(x0, 0, x0, Hd, 0.8); line(x0 + Wd, 0, x0 + Wd, Hd, 0.8);
    for (let f = 1; f < floors; f++) line(x0, f * fh, x0 + Wd, f * fh, 0.5);
    if (ch) {
      line(x0, floors * fh, x0 + Wd, floors * fh, 0.6);
      const fr = kit.frieze;
      if (fr) {
        const s = Math.min(ch * 0.78 / fr.h, bw * 0.96 / fr.w), per = Math.max(1, Math.floor(bw / (fr.w * s * 1.04)));
        for (let c = 0; c < n; c++) for (let t = 0; t < per; t++) flat(G, fr, x0 + c * bw + (t + 0.5) * bw / per, floors * fh + ch / 2, s, { w: 0.8 });
      }
    }
    if (o.merlons && st.bead) { const s = Math.min(fh * 0.3 / st.bead.h, bw * 0.4 / st.bead.w); for (let c = 0; c < n; c++) flat(G, st.bead, x0 + (c + 0.5) * bw, Hd + st.bead.h * s * 0.5, s, { w: 0.8 }); }
    for (let f = 0; f < floors; f++) {
      const cy = f * fh + fh * 0.5;
      for (let c = 0; c < n; c++) {
        const dc = Math.abs(c - mid);
        let p = kit.bay, sc = 1, door = false;
        if (o.street) {
          if (Number.isInteger(dc) && dc % Math.max(1, st.every) === 0) { p = kit.accent; sc = 1.08; }
          if (o.ground && f === 0 && dc < 0.6) { p = kit.door; sc = 1.25; door = true; }
        } else if ((c + f) % 2) continue; // back faces: half the openings, no accents
        if (!p) continue;
        const s = Math.min(bw * 0.84 / p.w, fh * 0.84 / p.h) * st.open * sc * (o.street ? 1 : 0.8);
        flat(G, p, x0 + (c + 0.5) * bw, cy - (door ? fh * 0.04 : 0), s, { flip: c > mid && p.side !== 'center', w: o.street ? 1 : 0.75 });
      }
      for (let c = 1; c < n; c++) {
        const x = x0 + c * bw;
        if (o.street && kit.pil) flat(G, kit.pil, x, cy, Math.min(fh * 0.9 / kit.pil.h, bw * 0.22 / kit.pil.w), { w: 0.8 });
        else line(x, f * fh, x, (f + 1) * fh, 0.4);
      }
    }
    // flying buttresses (added 2026-11-02, architecture-research follow-up): the 'buttress' role
    // was parsed/classified by creature-arch.js but never placed anywhere in the city -- real tall
    // facades (madrasa/caravanserai/bayt-al-hikma/bimaristan/hammam at 2+ floors) read flatter than
    // their real-world references without a projecting silhouette element breaking the wall plane.
    // Placed only on street-facing facades of 2+ floor buildings, straddling every other internal
    // bay boundary, angled outward (rot ±) so the pair reads as a strut flying out to a pier
    // rather than a flat wall ornament.
    if (o.street && st.butt && floors >= 2) {
      const butt = st.butt, bs = Math.min(fh * 0.85 / butt.h, bw * 0.5 / butt.w), by = fh * 0.55;
      for (let c = 1; c < n; c += 2) {
        const x = x0 + c * bw;
        flat(G, butt, x - bw * 0.18, by, bs, { rot: -12, w: 0.85 });
        flat(G, butt, x + bw * 0.18, by, bs, { rot: 12, flip: true, w: 0.85 });
      }
    }
    if (o.street && kit.hook) {
      const s = Math.min(fh * 0.32 / kit.hook.w, fh * 0.32 / kit.hook.h);
      flat(G, kit.hook, x0 - fh * 0.1, Hd + fh * 0.05, s, { rot: -20 });
      flat(G, kit.hook, x0 + Wd + fh * 0.1, Hd + fh * 0.05, s, { rot: 20, flip: true });
    }
    return G.done();
  }

  // Block Forge crown on a roof, standing as two crossed planes. size = half the roof's short side.
  function crown(rgb, st, kind, size, u) {
    const G = new Geo(rgb), k = Math.min(1, size / (48 * u));
    const lp = st.lamp, ls = lp ? Math.min(40 / lp.w, 44 / lp.h) * u * k : 0, lh = lp ? lp.h * ls : 0;
    if (kind === 'dome') {
      if (lp) crossed(G, lp, 0, lh / 2 + 0.01, ls, 2, { w: 1.15 });
      const bp = st.blade;
      if (bp) { // Block Forge fan: blades on an arc over the lamp, mirrored, spun into 3 planes
        const s = 34 / Math.max(bp.w, bp.h) * u * k, r = 40 * u * k, n = 5, cy = lh / 2 + 2 * u;
        for (let i = 0; i < n; i++) {
          const th = (-160 + 140 * i / (n - 1)) * Math.PI / 180, deg = th * 180 / Math.PI - 25, x = r * Math.sin(th), y = cy - r * Math.cos(th);
          crossed(G, bp, x, y, s, 3, { rot: deg, w: 1.05 });
          crossed(G, bp, -x, y, s, 3, { rot: -deg, flip: true, w: 1.05 });
        }
      }
      if (st.spire) { const s = Math.min(70 / st.spire.h, 1.4) * u * k; crossed(G, st.spire, 0, lh + st.spire.h * s / 2, s, 2, { w: 1.1 }); }
    } else if (kind === 'talar') {
      if (lp) crossed(G, lp, 0, lh / 2, ls * 0.8, 2, { w: 1.1 });
    } else if (kind === 'badgir') {
      const sp = st.spire || st.seg;
      if (sp) { const s = Math.min(46 / sp.h, 1) * u * k; crossed(G, sp, 0, sp.h * s / 2, s, 2, { w: 1.05 }); }
    } else if (kind === 'tree') {
      const sp = st.spire || st.seg;
      if (sp) { const s = size / sp.h; crossed(G, sp, 0, sp.h * s / 2, s, 2, { w: 0.9 }); }
    }
    return G.done();
  }

  // a ring of beads + rails (fountain basin, pool), local, centred on origin
  function basin(rgb, st, r, u) {
    const G = new Geo(rgb), N = 48;
    for (const [rr, y, w] of [[r, 0.02, 0.9], [r * 0.85, 0.12, 0.7], [r, 0.12, 0.9]]) for (let i = 0; i < N; i++) {
      const a0 = i / N * TAU, a1 = (i + 1) / N * TAU; G.seg([rr * Math.sin(a0), y, rr * Math.cos(a0)], [rr * Math.sin(a1), y, rr * Math.cos(a1)], w);
    }
    const b = st.bead;
    if (b) {
      const s = 0.12 / Math.max(b.w, b.h), n = Math.max(6, Math.floor(TAU * r / 0.2));
      for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU; emit(G, b, s, 0, false, (lx, ly) => { const aa = a + lx / r; return [r * Math.sin(aa), 0.07 - ly, r * Math.cos(aa)]; }, 0.85); }
    }
    if (st.lamp) crossed(G, st.lamp, 0, 0.25, 0.4 / Math.max(st.lamp.h, 1), 2, { w: 1.1 });
    return G.done();
  }

  // ---------- small Spire Forge towers in the city's units ----------
  function miniGenome(st, o) {
    const id = (p) => p ? p.id : null;
    return { tpl: 'mini', seed: 0,
      base: { n: o.baseN == null ? 1 : o.baseN, half: o.half, h: o.baseH || 30, step: 0.82, frieze: [id(st.A.frieze)], hook: id(st.A.hook) },
      shaft: { h: o.shaftPx, core: null, segs: [id(st.seg)], ribs: false, rib: null, ribHook: null },
      balc: { n: o.balc || 0, half: o.half * 0.95, taper: 0.2, frieze: id(st.A.frieze), bead: id(st.bead), hook: id(st.A.hook) },
      drums: { n: o.drums || 0, half: o.half * 1.15, h: 40, frieze: id(st.B.frieze) }, neck: [id(st.lamp)],
      crown: { R: o.R || 0, halo: id(st.halo), bead: id(st.bead), beads: 6, lamp: id(st.lamp), n: o.blades == null ? 4 : o.blades,
        fans: [{ part: id(st.blade), n: 4, r: 0.62, from: -165, to: -25, spin: -20, scale: 0.9 }], spire: o.spire !== false, spirePart: id(st.spire), beams: false },
      butt: { on: false }, bays: { on: false } };
  }

  // ---------- the city ----------
  function build(wfc, seed, opts) {
    opts = opts || {};
    const CW = window.CityWFC, CA = window.CreatureArch, CS = window.CreatureSpire;
    TOL = opts.detail || 0.02;
    if (!CA || !CA.ready) return null;
    const RINGS = CW.RINGS, FH = CW.STOREY_H, u = FH / (opts.storeyPx || 46);
    const zoneColor = opts.zoneColor || (() => [0.37, 0.83, 0.55]);
    const P = pools(CA), styles = {};
    const styleOf = (z) => styles[z] || (styles[z] = makeStyle(z, seed, P));

    const lib = new Map();          // key -> { geom, matrices, ranks }
    const place = (key, make, m, rank) => {
      let e = lib.get(key);
      if (!e) { const geom = make(); e = { key, geom, matrices: [], ranks: [] }; lib.set(key, e); }
      if (e.geom && e.geom.positions.length) { e.matrices.push(m); e.ranks.push(rank); }
    };
    const occ = { P: [], N: [], I: [] };
    const occBox = (m, cx, y0, cz, sx, sy, sz) => {
      const b = occ.P.length / 3, hx = sx / 2 * 0.97, hz = sz / 2 * 0.97, y1 = y0 + sy * 0.98;
      const faces = [[[1, 0, 0], [[hx, y0, -hz], [hx, y1, -hz], [hx, y1, hz], [hx, y0, hz]]], [[-1, 0, 0], [[-hx, y0, hz], [-hx, y1, hz], [-hx, y1, -hz], [-hx, y0, -hz]]],
        [[0, 0, 1], [[hx, y0, hz], [hx, y1, hz], [-hx, y1, hz], [-hx, y0, hz]]], [[0, 0, -1], [[-hx, y0, -hz], [-hx, y1, -hz], [hx, y1, -hz], [hx, y0, -hz]]],
        [[0, 1, 0], [[-hx, y1, -hz], [-hx, y1, hz], [hx, y1, hz], [hx, y1, -hz]]]];
      let k = b;
      for (const [nrm, q] of faces) {
        for (const v of q) { const w = apply(m, cx + v[0], v[1], cz + v[2]); occ.P.push(w[0], w[1], w[2]); const nn = apply(m, nrm[0], nrm[1], nrm[2]); occ.N.push(nn[0] - m[12], nn[1] - m[13], nn[2] - m[14]); }
        occ.I.push(k, k + 1, k + 2, k, k + 2, k + 3); k += 4;
      }
    };
    const occMesh = (m, mesh) => {
      const b = occ.P.length / 3, Pm = mesh.positions;
      for (let i = 0; i < Pm.length; i += 3) { const w = apply(m, Pm[i], Pm[i + 1], Pm[i + 2]); occ.P.push(w[0], w[1], w[2]); occ.N.push(0, 1, 0); }
      for (const i of mesh.indices) occ.I.push(b + i);
    };

    // a Block Forge box: four facades (+ crown), all in cell-local coords, carried by cellM
    const SIDES = { in: [-1, 0], out: [1, 0], ccw: [0, -1], cw: [0, 1] };
    const block = (cellM, rank, st, kitKey, b) => {
      const kit = st[kitKey], rgb = zoneColor(st.zone), ch = st.cornice * FH, bwT = st.bwPx * u;
      for (const side in SIDES) {
        if (b.hide && b.hide[side]) continue;
        const [nx, nz] = SIDES[side], width = nx ? b.sz : b.sx, n = Math.max(1, Math.round(width / bwT)), bw = width / n;
        const street = !!(b.street && b.street[side]), ground = !!b.ground && street;
        const key = ['f', st.zone, kitKey, n, bw.toFixed(3), b.floors, street ? 1 : 0, ground ? 1 : 0, b.merlons ? 1 : 0].join('|');
        const m = mul(cellM, trsY(b.cx + nx * b.sx / 2, b.y0, b.cz + nz * b.sz / 2, Math.atan2(nx, nz)));
        place(key, () => facade(rgb, st, kit, n, bw, b.floors, FH, ch, { street, ground, merlons: b.merlons }), m, rank);
      }
      // roof outline
      const H = b.floors * FH + ch;
      const rk = ['r', st.zone, b.sx.toFixed(2), b.sz.toFixed(2)].join('|');
      place(rk, () => { const G = new Geo(rgb), hx = b.sx / 2, hz = b.sz / 2, i = Math.min(hx, hz) * 0.25; const q = [[-hx + i, -hz + i], [hx - i, -hz + i], [hx - i, hz - i], [-hx + i, hz - i]]; for (let k = 0; k < 4; k++) G.seg([q[k][0], 0, q[k][1]], [q[(k + 1) % 4][0], 0, q[(k + 1) % 4][1]], 0.45); return G.done(); }, mul(cellM, trsY(b.cx, b.y0 + H, b.cz, 0)), rank);
      occBox(cellM, b.cx, b.y0, b.cz, b.sx, H, b.sz);
      if (b.crown && b.crown !== 'roof') {
        const size = Math.min(b.sx, b.sz) / 2;
        place(['c', st.zone, b.crown, size.toFixed(2)].join('|'), () => crown(rgb, st, b.crown, size, u), mul(cellM, trsY(b.cx, b.y0 + H, b.cz, 0)), rank);
      }
      return H;
    };
    // stack a building from a footprint: massing rule decides set-backs; returns top height
    const building = (cellM, rank, st, fp, floors, roof, street, opts2) => {
      opts2 = opts2 || {};
      const bwT = st.bwPx * u, y = opts2.y0 || 0;
      const lv = [];
      if (st.massing === 'stepped' && floors > 1) for (let f = 0; f < floors; f++) lv.push({ floors: 1, inset: f * bwT });
      else if (st.massing === 'podium' && floors > 1) { lv.push({ floors: 1, inset: 0 }); lv.push({ floors: floors - 1, inset: 2 * bwT }); }
      else lv.push({ floors, inset: 0 });
      let yy = y;
      lv.forEach((l, i) => {
        const sx = Math.max(bwT, fp.sx - 2 * l.inset), sz = Math.max(bwT, fp.sz - 2 * l.inset);
        yy += block(cellM, rank, st, i === 0 ? 'A' : 'B', { cx: fp.x, cz: fp.z, sx, sz, y0: yy, floors: l.floors, ground: i === 0 && !opts2.noDoor, street,
          crown: i === lv.length - 1 ? roof : null, hide: opts2.hide, merlons: opts2.merlons && i === lv.length - 1 });
      });
      return yy;
    };
    const tower = (cellM, rank, st, x, z, o, key) => {
      const g = miniGenome(st, o);
      const k = ['t', st.zone, key].join('|');
      let built = null;
      place(k, () => { built = CS.buildSpireGL2(g, { unit: u, color: zoneColor(st.zone), forceColor: true, tol: TOL / u }); return built.lines; }, mul(cellM, trsY(x, 0, z, 0)), rank);
      if (!built) built = CS.buildSpireGL2(g, { unit: u, color: zoneColor(st.zone), forceColor: true, tol: TOL / u }); // occluder per instance (cheap)
      occMesh(mul(cellM, trsY(x, 0, z, 0)), built.occluder);
    };
    const IDENTITY = trsY(0, 0, 0, 0);   // for perimeterWall loops computed directly in city-global coords (no single cell's own frame applies -- see its callers below)

    // ---------- perimeter walls: wall/corner/gate pieces walked around an arbitrary closed loop
    // (2026-11-03, "structures around structures" follow-up -- the WFC grammar only ever arranged
    // whole pre-made blocks per cell; this is the first piece of a MODULAR grammar, composing a
    // wall from reusable wall-run + corner-post + gate-opening pieces around whatever boundary a
    // caller hands it, the same way a real wall/courtyard/defensive ring is built). `loop` is an
    // ordered array of city-GLOBAL [x,z] points (closed -- loop[n-1] implicitly connects back to
    // loop[0]). opts:
    //   cellM (default IDENTITY): placement matrix -- pass a cell's own cellMatrix() only when
    //     `loop` was computed in THAT cell's own local frame (true for a single-cell courtyard;
    //     a multi-cell boundary has no single cell's frame to use, so it's built in city-global
    //     coords and this stays IDENTITY).
    //   h (wall height), bw (target bay width before the per-edge segment count is derived), y0.
    //   gateEdges: Set<edgeIndex> -- these edges get NO wall run; their two endpoints still get
    //     corner-post accents (reads as a flanked opening) via the isGateEnd check below.
    //   forceTowers: [[x,z],...] extra bastion positions independent of actual corners (used by
    //     the outer-wall rebuild to drop a real bastion at each WFC 'tower' cell's centre, even
    //     though the wall there isn't geometrically turning).
    //   cornerThreshold (default 24deg): turn angle below which a vertex is treated as a smooth
    //     continuation (no post) rather than a real corner -- keeps a gently-curved ring (the
    //     outer wall) from getting a post at every single subdivision vertex.
    const perimeterWall = (rank, st, zone, loop, opts) => {
      opts = opts || {};
      const cellM = opts.cellM || IDENTITY;
      const rgb = zoneColor(zone);
      const h = opts.h != null ? opts.h : FH * 1.4;
      const y0 = opts.y0 || 0;
      const bwT = (opts.bw || st.bwPx * 0.8) * u;
      const thick = opts.thick || 0.12;
      const fh = h * 0.88, ch = h * 0.12;
      const n = loop.length;
      const gateEdges = opts.gateEdges || new Set();
      const cornerThreshold = opts.cornerThreshold != null ? opts.cornerThreshold : 24 * Math.PI / 180;
      const postAt = (x, z, big) => tower(cellM, rank, st, x, z, { half: big ? 34 : 18, baseN: 0, shaftPx: big ? 92 : 40, balc: big ? 1 : 0, R: 0, blades: 0, spire: false }, big ? 'wall-bastion' : 'wall-post');
      for (let i = 0; i < n; i++) {
        if (gateEdges.has(i)) continue;   // no wall run -- an opening, flanked by posts (below)
        const a = loop[i], b = loop[(i + 1) % n];
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        if (len < 0.02) continue;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ry = Math.atan2(dz, dx);
        const segN = Math.max(1, Math.round(len / bwT)), bw = len / segN;
        const key = ['w', zone, segN, bw.toFixed(3), h.toFixed(2)].join('|');
        const m = mul(cellM, trsY(mx, y0, mz, ry));
        place(key, () => facade(rgb, st, st.A, segN, bw, 1, fh, ch, { street: false, ground: false, merlons: true }), m, rank);
        occBox(m, 0, 0, 0, len, h, thick);
      }
      for (let i = 0; i < n; i++) {
        const prev = loop[(i - 1 + n) % n], cur = loop[i], next = loop[(i + 1) % n];
        const a1 = Math.atan2(cur[1] - prev[1], cur[0] - prev[0]), a2 = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
        const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
        const isGateEnd = gateEdges.has(i) || gateEdges.has((i - 1 + n) % n);
        if (isGateEnd || turn > cornerThreshold) postAt(cur[0], cur[1], turn > cornerThreshold && !isGateEnd);
      }
      for (const [x, z] of opts.forceTowers || []) postAt(x, z, true);
    };

    // ---------- causeway: a colonnaded processional path connecting the hub to a landmark, along
    // a constant-angle ray (a true straight line in Cartesian space, since both endpoints share
    // the same angle) -- the direct answer to "we don't have ... grammar to create structures
    // around structures" / the user's own red-line sketch connecting the hub to each tower
    // (2026-11-03). Purely a geometric overlay, same as perimeterWall: a thin glowing spine line
    // plus evenly-spaced small posts along it, not solver-aware (it doesn't know or care what
    // street cells it crosses -- same simplification perimeterWall already makes).
    const causeway = (rank, st, zone, fromR, toR, angle, spacing) => {
      const ca = Math.cos(angle), sa = Math.sin(angle), rgb = zoneColor(zone);
      place(['causeway', zone, fromR.toFixed(2), toR.toFixed(2), angle.toFixed(3)].join('|'), () => {
        const G = new Geo(rgb), steps = Math.max(8, Math.round(Math.abs(toR - fromR) / 0.08));
        let prev = [fromR * ca, 0, fromR * sa];
        for (let i = 1; i <= steps; i++) {
          const r = fromR + (toR - fromR) * i / steps, cur = [r * ca, 0, r * sa];
          G.seg(prev, cur, 1.6); prev = cur;   // bumped (2026-11-03, legibility follow-up) -- was 0.9, lost against city density
        }
        return G.done();
      }, IDENTITY, rank);
      const n = Math.max(2, Math.round(Math.abs(toR - fromR) / (spacing || 0.35)));
      for (let i = 1; i < n; i++) {
        const r = fromR + (toR - fromR) * i / n;
        tower(IDENTITY, rank, st, r * ca, r * sa, { half: 22, baseN: 0, shaftPx: 56, balc: 0, R: 0, blades: 0, spire: false }, 'causeway-post');   // bumped (half/shaftPx were 14/36)
      }
    };

    // stacking pass: modules per cell column
    const upper = CW.stack(wfc, seed);
    const N = wfc.cells.length, mods = (cell) => {
      const out = [];
      if (!upper) return out;
      for (let k = 1; k <= CW.LAYERS; k++) { const r = upper.result[(k - 1) * N + cell.id]; if (r != null && r >= 0) out.push(upper.mods[r].id); }
      return out;
    };
    const rankOf = new Map(); (wfc.order || []).forEach((id, k) => rankOf.set(id, k));
    // footprint insets tightened 2026-11-03 ("connected buildings" follow-up -- neighbouring lots
    // previously left a ~40% combined gap between full-size buildings with nothing between them;
    // now ~20%, so adjacent buildings read as abutting a shared street/party line instead of each
    // sitting alone in the middle of its own cell).
    const FRAC = { house: 0.9, caravanserai: 0.9, madrasa: 0.88, 'bayt-al-hikma': 0.84, bimaristan: 0.86, hammam: 0.82 };
    const ROOFS = new Set(['roof', 'dome', 'badgir', 'talar']);

    // footprint merging across same-kind neighbours (2026-11-03, same follow-up -- Townscaper-
    // inspired idea #1 from the earlier design discussion): when two angularly-adjacent same-ring
    // cells resolve to the same mergeable building kind, SOMETIMES build ONE wider box spanning
    // both instead of two separate ones -- real footprint-size variation, and buildings that
    // occasionally read as sharing a party wall rather than every lot being an identical isolated
    // box. Purely a rendering-time decision over the already-solved WFC result, reusing building()'s
    // own box/facade/crown machinery via a SYNTHETIC frame centred on the merged pair's own
    // midpoint (the same "frame not tied to one real cell" trick perimeterWall/causeway use).
    // mergedCellIds marks the SECOND cell of each merged pair so the main loop below skips it.
    const MERGE_KINDS = new Set(['house', 'caravanserai', 'madrasa', 'bayt-al-hikma', 'bimaristan', 'hammam']);
    const mergedCellIds = new Set();
    {
      const mergeRnd = rng(hash('merge|' + seed));
      const byRing = new Map();
      for (const cell of wfc.cells) { if (!byRing.has(cell.ring)) byRing.set(cell.ring, []); byRing.get(cell.ring).push(cell); }
      for (const cells of byRing.values()) {
        cells.sort((a, b) => a.a0 - b.a0);
        for (let i = 0; i < cells.length - 1; i++) {
          const a = cells[i], b = cells[i + 1];
          if (mergedCellIds.has(a.id) || mergedCellIds.has(b.id)) continue;
          const ta = wfc.tiles[wfc.result[a.id]], tb = wfc.tiles[wfc.result[b.id]];
          const ka = ta ? (ta.base || ta.id) : null, kb = tb ? (tb.base || tb.id) : null;
          if (!ka || ka !== kb || !MERGE_KINDS.has(ka) || mergeRnd() >= 0.45) continue;
          mergedCellIds.add(a.id); mergedCellIds.add(b.id);
          const st = styleOf(a.zone), rm = (a.r0 + a.r1) / 2, am = (a.a0 + b.a1) / 2;
          const mergedCellM = cellMatrix({ rm, am }, 0);
          const mergedRank = Math.min(rankOf.has(a.id) ? rankOf.get(a.id) : 0, rankOf.has(b.id) ? rankOf.get(b.id) : 0);
          const D = a.r1 - a.r0, Wd = rm * (b.a1 - a.a0), k = FRAC[ka] * 1.05;
          const fixed = { madrasa: 2, 'bayt-al-hikma': 2, bimaristan: 1, hammam: 1 }[ka];
          const ms = mods(a), storeys = ms.filter((m) => m === 'storey' || m === 'sabat').length, roof = ms.find((m) => ROOFS.has(m)) || 'roof';
          const floors = fixed || 1 + storeys, rf = { madrasa: 'dome', 'bayt-al-hikma': 'dome', hammam: 'dome' }[ka] || roof;
          const sidesA = { in: ta.in === 'S' || ta.in === 'M', out: ta.out === 'S' || ta.out === 'M', cw: ta.cw === 'S' || ta.cw === 'M', ccw: ta.ccw === 'S' || ta.ccw === 'M' };
          const streetO = ka === 'house' || ka === 'caravanserai' ? { ...sidesA, out: true } : { ...sidesA, in: true };
          building(mergedCellM, mergedRank, st, { x: 0, z: 0, sx: D * k, sz: Wd * k }, floors, rf, streetO);
        }
      }
    }

    for (const cell of wfc.cells) {
      if (cell.ring === 0 && opts.skipCore !== false) continue;
      const f = cell.f = cell.f || frameOf(cell), tile = wfc.tiles[wfc.result[cell.id]];
      if (!tile) continue;
      const kind = tile.base || tile.id, st = styleOf(cell.zone), rgb = zoneColor(cell.zone);
      const cellM = cellMatrix(f), rank = rankOf.has(cell.id) ? rankOf.get(cell.id) : 0;
      const ms = mods(cell), storeys = ms.filter((m) => m === 'storey' || m === 'sabat').length, roof = ms.find((m) => ROOFS.has(m)) || 'roof';
      const shafts = ms.filter((m) => m === 'shaft').length;
      const sides = ['in', 'out', 'cw', 'ccw'], streetSides = {};
      for (const s of sides) streetSides[s] = tile[s] === 'S' || tile[s] === 'M';
      const D = f.depth, Wd = f.width;

      // streets, arcades, canals: kerb lines (+ standing arches on arcades)
      const arms = sides.filter((s) => tile[s] === 'S' || tile[s] === 'M' || tile[s] === 'c');
      if (arms.length) {
        const av = CW.isAvenueCell(cell);
        place(['s', cell.ring, tile.id, av ? 1 : 0, cell.zone].join('|'), () => {
          const G = new Geo(rgb);
          for (const s of arms) {
            const lab = tile[s], w = lab === 'c' ? 0.16 : lab === 'M' ? 0.56 : (av && (s === 'in' || s === 'out') ? 0.7 : 0.5);
            for (const path of armPath(cell, s, RINGS)) {
              for (const off of lab === 'c' ? [-w / 2, w / 2] : [-w / 2 - 0.1, w / 2 + 0.1]) {
                for (let i = 1; i < path.length; i++) {
                  const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, ox = -dz / l * off, oz = dx / l * off;
                  G.seg([a[0] + ox, 0.01, a[1] + oz], [b[0] + ox, 0.01, b[1] + oz], lab === 'c' ? 0.7 : 0.45);
                }
              }
              if (lab === 'M' && st.A.bay) { // arcade: a row of standing arches along the street
                const pts = path, n = Math.max(1, Math.round(Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) / 0.42));
                const p = st.A.bay, s = 0.36 / Math.max(p.w, p.h);
                for (let k = 0; k < n; k++) {
                  const t = (k + 0.5) / n, a = pts[0], b = pts[pts.length - 1], x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
                  const ca = Math.cos(ang), sa = Math.sin(ang);
                  emit(G, p, s, 0, false, (lx, ly) => [x - sa * lx, 0.2 - ly, z + ca * lx], 0.9);
                }
              }
            }
          }
          return G.done();
        }, cellM, rank);
      }

      if (CW.STREET_KINDS.includes(kind)) {
        // corner lots beside the street become small Block Forge buildings
        const h = CW.isAvenueCell(cell) ? 0.47 : 0.37;
        const ld = Math.max(0, D / 2 - h - 0.02), lw = Math.max(0, Wd / 2 - h - 0.02);
        if (ld < 0.12 || lw < 0.12) continue;
        for (const [su, sv] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const fp = { x: su * (D / 2 - 0.02 - ld / 2), z: sv * (Wd / 2 - 0.02 - lw / 2), sx: ld, sz: lw };
          const street = { [su < 0 ? 'out' : 'in']: true, [sv < 0 ? 'cw' : 'ccw']: true };
          building(cellM, rank, st, fp, 1 + storeys, roof, street);
        }
        continue;
      }
      switch (kind) {
        case 'house': case 'caravanserai': case 'madrasa': case 'bayt-al-hikma': case 'bimaristan': case 'hammam': {
          if (mergedCellIds.has(cell.id)) break;   // already built wider, as part of a merged pair -- see the pre-pass above
          const k = FRAC[kind], fixed = { madrasa: 2, 'bayt-al-hikma': 2, bimaristan: 1, hammam: 1 }[kind];
          const floors = fixed || 1 + storeys, rf = { madrasa: 'dome', 'bayt-al-hikma': 'dome', hammam: 'dome' }[kind] || roof;
          const fp = { x: kind === 'madrasa' ? 0.04 : 0, z: 0, sx: D * k, sz: Wd * k };
          const streetO = kind === 'house' || kind === 'caravanserai' ? { ...streetSides, out: true } : { ...streetSides, in: true };
          building(cellM, rank, st, fp, floors, rf, streetO);
          // courtyard precinct wall (2026-11-03, "structures around structures" follow-up):
          // madrasa/caravanserai/bayt-al-hikma are institutional, courtyard-centric building types
          // historically -- wrap a modular wall+corner ring 30% larger than the building's own
          // footprint around it (an outer precinct wall, not a redundant second facade sitting on
          // top of the building's own), with a gate opening on whichever side the building's own
          // street-facing door already is.
          if (kind === 'madrasa' || kind === 'caravanserai' || kind === 'bayt-al-hikma') {
            const gx = fp.sx * 0.65, gz = fp.sz * 0.65;
            const loop = [[fp.x - gx, fp.z - gz], [fp.x + gx, fp.z - gz], [fp.x + gx, fp.z + gz], [fp.x - gx, fp.z + gz]];
            perimeterWall(rank, st, cell.zone, loop, { cellM, h: FH * 1.1, bw: st.bwPx * 0.6, gateEdges: new Set([streetO.out ? 1 : 3]) });
          }
          break;
        }
        case 'masjid':
          building(cellM, rank, st, { x: D * 0.12, z: 0, sx: D * 0.55, sz: Wd * 0.62 }, 1, 'dome', { in: true });
          // twin flanking minarets (2026-11-02): extends the gate case's twin-pylon pattern below
          // to masjid -- real mosque facades read far more as a mosque with two minarets framing
          // the entrance than with one off to a side. Same instancing trick as gate: one geometry
          // key ('masjid-minaret'), two placement matrices.
          for (const s of [-1, 1]) tower(cellM, rank, st, -D * 0.12, s * Wd * 0.27, { half: 16, shaftPx: 110, balc: 1, R: 0, blades: 0 }, 'masjid-minaret');
          break;
        case 'iwan':
          building(cellM, rank, st, { x: D * 0.3, z: 0, sx: 0.3, sz: Math.min(1.2, Wd * 0.45) }, 2, 'dome', { out: true, in: true });
          break;
        case 'fountain':
          place(['b', cell.zone, 'fountain'].join('|'), () => basin(rgb, st, 0.55, u), cellM, rank);
          break;
        case 'minaret':
          tower(cellM, rank, st, 0, 0, { half: 24, shaftPx: 46 * (1 + shafts), balc: Math.max(1, shafts), R: 30, blades: 4 }, 'minaret|' + shafts);
          break;
        case 'ab-anbar':
          tower(cellM, rank, st, -D * 0.08, 0, { half: 34, shaftPx: 46 * (1 + shafts), drums: 2, R: 0, blades: 0, spire: false }, 'cistern|' + shafts);
          break;
        case 'orchard': {
          for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) place(['tree', cell.zone].join('|'), () => crown(rgb, st, 'tree', 0.7, u), mul(cellM, trsY((i - 0.5) * D * 0.5, 0, (k - 1) * Wd * 0.3, (i + k) * 0.7)), rank);
          break;
        }
        case 'pool-garden':
          place(['b', cell.zone, 'pool'].join('|'), () => basin(rgb, st, 0.26, u), cellM, rank);
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) place(['tree', cell.zone].join('|'), () => crown(rgb, st, 'tree', 0.7, u), mul(cellM, trsY(sx * D * 0.25, 0, sz * Wd * 0.25, 0)), rank);
          break;
        case 'pavilion':
          tower(cellM, rank, st, 0, 0, { half: 30, baseH: 12, shaftPx: 40, R: 34, blades: 5 }, 'pavilion');
          break;
        // 'wall'/'tower'/'gate'/'inlet': handled once, after this loop, by one continuous
        // perimeterWall pass around the whole outer ring instead of N independent per-cell boxes
        // -- see "city wall rebuild" below.
      }
    }

    // city wall rebuild (2026-11-03, "structures around structures" follow-up): previously each
    // ring-8 cell independently built its OWN thick wall box, sized to overshoot its neighbours by
    // 4% so they'd visually nearly touch -- replaced with one continuous perimeterWall loop around
    // the whole outer ring, assembled from the same modular wall-run/corner-post/gate-opening
    // pieces every other perimeter in this file now uses. 'gate' cells become real gate openings
    // (no wall run there, flanking posts instead of the old twin-pylon-towers-plus-roof); 'tower'
    // cells force a bastion at their span's centre (forceTowers), in addition to the wall
    // continuing behind it; 'inlet' (a wall cell with a water channel through it, handled
    // separately by the kerb-line/arm pass above) falls through to a plain wall run like 'wall'.
    {
      const outerRing = RINGS.length - 1;
      const ring8 = wfc.cells.filter((c) => c.ring === outerRing).sort((a, b) => a.a0 - b.a0);
      if (ring8.length) {
        const r1 = CW.RADII[CW.RADII.length - 1], zone = ring8[0].zone, st = styleOf(zone);
        const loop = [], gateEdges = new Set(), forceTowers = [];
        const SUB = 3;
        for (const cell of ring8) {
          const tile = wfc.tiles[wfc.result[cell.id]], kind = tile ? (tile.base || tile.id) : null;
          for (let s = 0; s < SUB; s++) {
            const a = cell.a0 + (cell.a1 - cell.a0) * s / SUB, idx = loop.length;
            loop.push([r1 * Math.cos(a), r1 * Math.sin(a)]);
            if (kind === 'gate') gateEdges.add(idx);
          }
          if (kind === 'tower') { const am = (cell.a0 + cell.a1) / 2; forceTowers.push([r1 * Math.cos(am), r1 * Math.sin(am)]); }
        }
        const rank = Math.min(...ring8.map((c) => (rankOf.has(c.id) ? rankOf.get(c.id) : 0)));
        perimeterWall(rank, st, zone, loop, { h: FH * 2, bw: st.bwPx * 1.1, gateEdges, forceTowers, cornerThreshold: Math.PI });
      }
    }

    // landmark tower defensive rings (2026-11-03, same follow-up): a host that reserved a cluster
    // of LANDMARK_RING cells for a tower (shared/city-wfc.js's zero-weight 'belvedere' tile, see
    // World Scene Next's buildPlacedCity) can pass those cell ids here via opts.towerClusters:
    // [[cellId,...], ...], one array per tower. A cluster is always a run of ANGULARLY-ADJACENT
    // same-ring cells (buildPlacedCity reserves them that way), so its boundary is just the union
    // wedge spanning the cluster's full angular range -- no general cell-by-cell boundary tracing
    // needed. The gate sits on the middle of the 'in' edge (facing the hub).
    for (const ids of opts.towerClusters || []) {
      const cells = ids.map((id) => wfc.cells.find((c) => c.id === id)).filter(Boolean);
      if (!cells.length) continue;
      const r0 = cells[0].r0, r1 = cells[0].r1;
      const a0 = Math.min(...cells.map((c) => c.a0)), a1 = Math.max(...cells.map((c) => c.a1));
      const zone = cells[0].zone, st = styleOf(zone);
      const rank = Math.min(...cells.map((c) => (rankOf.has(c.id) ? rankOf.get(c.id) : 0)));
      const SUB = Math.max(2, Math.round((a1 - a0) / 0.12));
      const loop = [];
      for (let s = 0; s <= SUB; s++) { const a = a0 + (a1 - a0) * s / SUB; loop.push([r0 * Math.cos(a), r0 * Math.sin(a)]); }   // 'in' edge (toward the hub) -- carries the gate
      loop.push([r1 * Math.cos(a1), r1 * Math.sin(a1)]);   // cw end-cap corner
      for (let s = SUB; s >= 0; s--) { const a = a0 + (a1 - a0) * s / SUB; loop.push([r1 * Math.cos(a), r1 * Math.sin(a)]); }   // 'out' edge (away from the hub)
      // h/thick bumped (2026-11-03, legibility follow-up): the ring was geometrically correct and
      // positioned clear of the tower's own footprint, but at the SAME height/weight as an
      // ordinary 1-2 floor house it never read as "a wall" against the surrounding city density --
      // confirmed by direct data inspection (the groups were really there), not a build bug.
      // Taller than anything else nearby + a chunkier wall thickness makes it legible by sheer
      // silhouette, without needing a special colour (every city line still shares one uniform
      // dim tint, see CREATURE_CITY_FAINT_WHITE's own note in World Scene Next.html).
      perimeterWall(rank, st, zone, loop, { h: FH * 2.8, thick: 0.22, bw: st.bwPx * 0.9, gateEdges: new Set([Math.floor(SUB / 2)]) });
      // processional causeway from the hub's own edge straight out to this ring's gate (same angle
      // as the gate above, so it arrives exactly there) -- see causeway()'s own note. Tighter post
      // spacing + a bigger post size, same legibility reasoning as the ring above.
      causeway(rank, st, zone, CW.RADII[1], r0, (a0 + a1) / 2, 0.22);
    }

    const groups = [];
    let segs = 0, drawn = 0;
    for (const e of lib.values()) {
      if (!e.geom || !e.geom.positions.length || !e.matrices.length) continue;
      const order = e.matrices.map((_, i) => i).sort((a, b) => e.ranks[a] - e.ranks[b]);
      groups.push({ key: e.key, geom: e.geom, matrices: order.map((i) => e.matrices[i]), ranks: order.map((i) => e.ranks[i]) });
      segs += e.geom.positions.length / 6; drawn += e.geom.positions.length / 6 * e.matrices.length;
    }
    const nv = occ.P.length / 3;
    const occluder = { positions: new Float32Array(occ.P), normals: new Float32Array(occ.N), uv: new Float32Array(nv * 2), color: new Float32Array(nv * 4).fill(1),
      indices: new Uint32Array(occ.I), mode: 'triangles', materialTag: 'body' };
    return { groups, occluder, styles, stats: { variants: groups.length, uniqueSegments: segs, drawnSegments: drawn, occluderTris: occ.I.length / 3 } };
  }

  window.CreatureCity = { build, frameOf };
})();
