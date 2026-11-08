/* creature-spire.js — Spire Forge designs, stood up in 3D for raw WebGL2.
   Depends on shared/engine/creature-arch.js (CreatureArch.load() must have resolved).

   Spire Forge draws a tower from a "genome" (terraces, shaft, balconies, drums, neck, crown,
   buttresses, bay rules). This module reads the SAME genome and builds the SAME composition,
   but treats each section the way it reads in the round instead of standing the whole flat
   picture up as one set of crossed planes:

     terraces + drums  -> wrapped on their cylinder; bays re-counted for the full circumference
     cornice / friezes -> repeated all the way round
     level lines       -> true circles
     shaft core/segs   -> wrapped round the shaft (a few copies cover the circumference)
     ribs, hooks,
     buttresses        -> radial fins (spun planes, mirrored, so 2K around)
     crown blade fans  -> swept round the axis (K=6 -> 12 blades per fan)
     halo, lamp, spire -> crossed planes (K=2)

   Scale is fixed: 1 px of the Spire Forge sheet = 1/16 m (opts.unit), so a tower is as tall
   in World Scene as it is in Spire Forge and its parts keep their native size.

   API
     CreatureSpire.newGenome(tpl, seed, opts)  -> genome  (port of Spire Forge newGenome)
     CreatureSpire.layout(genome)              -> flat placements + bands + rails + solids
     CreatureSpire.buildSpireGL2(genome, opts) -> { lines:{positions,colors}, occluder, top, reach, stats }
       lines:    GL_LINES pairs, local tower space (x, y=up, z), metres
       occluder: { positions, normals, uv, color, indices(Uint32), mode:'triangles', materialTag:'body' }
                 — the lathed silhouette of the same layout, slightly inset, for depth only.
*/
(function () {
  'use strict';
  const TAU = Math.PI * 2, AX = 300, GROUND = 836;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const A = () => window.CreatureArch;

  // A genome names parts by id. If an id is missing from this kit (or was skipped because it uses
  // a mask), fall back to a deterministic part of the same role so the tower never loses a section.
  function part(id, role) {
    const CA = A();
    if (id && CA.byId[id]) return CA.byId[id];
    const list = role && CA.byRole[role];
    if (!list || !list.length) return null;
    return list[hash(String(id || role)) % list.length];
  }

  // ---------- genome (port of Spire Forge newGenome / makeBays) ----------
  function pools(species) {
    const CA = A(), on = species && species.length ? new Set(species) : null, P = {};
    for (const r of CA.ROLE_NAMES) {
      const all = CA.byRole[r] || [];
      const f = on ? all.filter((p) => on.has(p.species)) : all;
      P[r] = f.length ? f : all;
    }
    return P;
  }
  const BAY_KEYS = ['base.ground.center', 'base.ground.end', 'base.ground.side', 'base.center', 'base.end', 'base.side',
    'drum.center', 'drum.end', 'drum.side', 'base.pilaster', 'drum.pilaster'];
  function makeBays(R, P, on) {
    const open = [...new Set([...P.lamp, ...P.bead, ...P.segment])].filter((p) => p.side === 'center' && Math.max(p.w, p.h) <= 130);
    const pil = [...new Set([...P.segment, ...P.spire])].filter((p) => p.side === 'center');
    const O = open.length ? open : P.bead, pick = (a) => a.length ? a[Math.floor(R() * a.length)].id : null;
    const rules = {};
    for (const k of BAY_KEYS) {
      if (k.endsWith('pilaster')) { rules[k] = { part: R() < 0.75 ? pick(pil) : null }; continue; }
      const big = k.endsWith('center') ? 1.15 : k.endsWith('end') ? 1.0 : 0.85;
      rules[k] = { part: pick(O), scale: +(big * (0.9 + R() * 0.2)).toFixed(2) };
    }
    for (const f of ['base.ground', 'base', 'drum']) if (R() < 0.5) rules[f + '.end'] = { ...rules[f + '.side'], scale: rules[f + '.side'].scale * 1.1 };
    return { on, width: Math.round(26 + R() * 22), size: +(0.7 + R() * 0.2).toFixed(2), rules };
  }
  function newGenome(tpl, seed, opts) {
    tpl = tpl || 'lighthouse'; opts = opts || {};
    const R = rng(seed), P = pools(opts.species), pk = (r) => P[r] && P[r].length ? P[r][Math.floor(R() * P[r].length)].id : null;
    const between = (a, b) => a + R() * (b - a), int = (a, b) => Math.floor(between(a, b + 1));
    const fans = (n) => [{ part: pk('blade'), n, r: 0.62, from: -165, to: -25, spin: between(-50, 10), scale: between(0.8, 1.1) },
      { part: pk('blade'), n: Math.max(2, n - 2), r: 0.95, from: -150, to: -35, spin: between(-45, -10), scale: between(0.7, 1) }];
    const segs = [pk('segment'), R() < 0.5 ? pk('segment') : null].filter(Boolean);
    const base = { frieze: [pk('frieze'), pk('frieze'), pk('frieze')], hook: pk('hook') };
    const T = {
      lighthouse: () => ({ base: { n: 3, half: between(150, 190), h: between(34, 46), step: between(0.76, 0.84), ...base },
        shaft: { h: between(330, 420), core: R() < 0.7 ? pk('core') : null, segs, ribs: true, rib: pk('rib'), ribHook: pk('hook') },
        balc: { n: 3, half: between(95, 125), taper: between(0.15, 0.3), frieze: pk('frieze'), bead: pk('bead'), hook: pk('hook') },
        drums: { n: 0, half: 70, h: 40, frieze: pk('frieze') }, neck: [pk('lamp'), pk('frieze')],
        crown: { R: between(95, 125), halo: pk('halo'), bead: pk('bead'), beads: int(7, 11), lamp: pk('lamp'), n: int(5, 7), fans: fans(int(5, 7)), spire: true, spirePart: pk('spire'), beams: true },
        butt: { on: true, part: pk('buttress'), scale: between(0.65, 0.85) } }),
      spire: () => ({ base: { n: 2, half: between(80, 120), h: between(26, 36), step: between(0.78, 0.9), ...base },
        shaft: { h: between(480, 600), core: null, segs, ribs: R() < 0.6, rib: pk('rib'), ribHook: pk('hook') },
        balc: { n: int(4, 6), half: between(60, 90), taper: between(0.3, 0.5), frieze: pk('frieze'), bead: pk('bead'), hook: pk('hook') },
        drums: { n: 0, half: 50, h: 30, frieze: pk('frieze') }, neck: [pk('lamp')],
        crown: { R: R() < 0.4 ? between(50, 70) : 0, halo: pk('halo'), bead: pk('bead'), beads: int(0, 6), lamp: pk('lamp'), n: int(3, 5), fans: fans(int(3, 5)), spire: true, spirePart: pk('spire'), beams: false },
        butt: { on: R() < 0.5, part: pk('buttress'), scale: between(0.55, 0.75) } }),
      hive: () => ({ base: { n: 1, half: between(160, 200), h: between(30, 40), step: 0.8, ...base },
        shaft: { h: between(60, 120), core: null, segs, ribs: false, rib: pk('rib'), ribHook: pk('hook') },
        balc: { n: 0, half: 100, taper: 0.2, frieze: pk('frieze'), bead: pk('bead'), hook: pk('hook') },
        drums: { n: int(3, 5), half: between(120, 160), h: between(55, 75), frieze: pk('frieze') }, neck: [pk('segment')],
        crown: { R: between(55, 85), halo: pk('halo'), bead: pk('bead'), beads: int(6, 10), lamp: pk('lamp'), n: int(4, 6), fans: fans(int(4, 6)), spire: R() < 0.6, spirePart: pk('spire'), beams: false },
        butt: { on: R() < 0.7, part: pk('buttress'), scale: between(0.6, 0.85) } }),
      shrine: () => ({ base: { n: int(3, 4), half: between(200, 240), h: between(22, 30), step: between(0.84, 0.9), ...base },
        shaft: { h: between(90, 170), core: null, segs, ribs: true, rib: pk('rib'), ribHook: pk('hook') },
        balc: { n: 1, half: between(110, 140), taper: 0, frieze: pk('frieze'), bead: pk('bead'), hook: pk('hook') },
        drums: { n: 0, half: 60, h: 30, frieze: pk('frieze') }, neck: [pk('lamp'), pk('segment')],
        crown: { R: between(160, 200), halo: pk('halo'), bead: pk('bead'), beads: int(10, 16), lamp: pk('lamp'), n: int(7, 10), fans: fans(int(7, 10)), spire: R() < 0.5, spirePart: pk('spire'), beams: R() < 0.5 },
        butt: { on: true, part: pk('buttress'), scale: between(0.7, 0.95) } }),
    };
    if (!T[tpl]) tpl = 'lighthouse';
    return { tpl, seed, ...T[tpl](), bays: makeBays(R, P, tpl !== 'spire') };
  }

  // ---------- layout (port of Spire Forge draw(), recorded as data) ----------
  // Coordinates: x across from the axis (left negative), y UP from the ground, in sheet px.
  // items:  { p, x, y, s, rot, flipY, mirror, sec }  — sec decides how the item is stood in 3D
  // bands:  terrace / drum bay zones, laid out again per-circumference at stand time
  // rails:  level lines -> circles      solids: occluder pieces {y0, y1, r0, r1}
  function layout(g) {
    const L = { items: [], bands: [], rails: [], wraps: [], drops: [], solids: [], top: 0, reach: 0 };
    const put = (sec, p, xs, ys, s, rot, o) => {
      if (!p) return null; o = o || {};
      const center = p.side === 'center' && !o.free;
      if (center) xs = AX;
      const x = xs - AX, y = GROUND - ys;
      L.items.push({ p, x, y, s, rot: rot || 0, flipY: !!o.flipY, mirror: !center && x < -0.5 && o.mirror !== false, sec, op: o.op || 1 });
      const ext = Math.max(p.w, p.h) * s / 2;
      L.top = Math.max(L.top, y + ext); L.reach = Math.max(L.reach, Math.abs(x) + ext);
      return p;
    };
    const ring = (ys, half, w) => { L.rails.push({ y: GROUND - ys, r: half, w: w || 1.1 }); L.reach = Math.max(L.reach, half); };
    // a frieze row repeated round a circle of radius r at height ys (Spire Forge frieze(), closed)
    const frieze = (sec, p, ys, r, targetH) => { if (p && r >= 12) L.wraps.push({ sec, p, y: GROUND - ys, r, s: clamp(targetH / p.h, 0.45, 1.15) }); };
    const fan = (sec, p, cx, cy, n, r, a0, a1, s, spin, o) => {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1), th = a0 + (a1 - a0) * t, rad = th * Math.PI / 180;
        put(sec, p, cx + r * Math.sin(rad), cy - r * Math.cos(rad), s, th + (spin || 0), { free: true, ...o });
      }
    };
    const solid = (ys0, ys1, r0, r1) => L.solids.push({ y0: GROUND - ys0, y1: GROUND - ys1, r0, r1: r1 == null ? r0 : r1 });

    let y = GROUND;
    // base terraces
    let half = g.base.half;
    for (let i = 0; i < g.base.n; i++) {
      const h = g.base.h, cy = y - h / 2, fr = part(g.base.frieze[i % g.base.frieze.length], 'frieze');
      ring(y - h, half); ring(y, half, 1.3); ring(y - h + 4, half - 4, 0.6);
      solid(y, y - h, half);
      if (g.bays && g.bays.on) L.bands.push({ fam: 'base', lvl: i === 0 ? 'ground' : 'upper', yTop: GROUND - (y - h), yBot: GROUND - y, half, cornice: fr });
      else frieze('frieze', fr, cy + h * 0.06, half, h * 0.62);
      // the corner hook: four corners round the terrace instead of two
      put('corner', part(g.base.hook, 'hook'), AX - half - 8, y - h - 2, clamp(h / 50, 0.5, 1), -20);
      y -= h; half *= g.base.step;
    }
    const topOfBase = y;
    if (g.butt && g.butt.on && g.base.n) {
      const b = part(g.butt.part, 'buttress');
      if (b) { const s = clamp(g.butt.scale, 0.3, 1.2); put('butt', b, AX - g.base.half * 0.92, GROUND - b.h * s * 0.5 - 4, s, -4); }
    }
    // shaft
    const shaftH = g.shaft.h, shaftTop = y - shaftH;
    let coreHalf = 26;
    if (shaftH > 10) {
      const core = g.shaft.core ? part(g.shaft.core, 'core') : null;
      if (core && shaftH / core.h > 0.55 && shaftH / core.h < 1.6) {
        const s = shaftH / core.h; coreHalf = Math.min(core.w * s / 2, 70);
        put('core', core, AX, y - shaftH / 2, s, 0);
      } else {
        const segs = (g.shaft.segs || []).map((id) => part(id, 'segment')).filter(Boolean);
        if (segs.length) {
          let yy = y, i = 0, guard = 0;
          while (yy > shaftTop + 4 && guard++ < 60) {
            const sp = segs[i++ % segs.length], s = clamp(34 / sp.w, 0.8, 1.6), hh = sp.h * s;
            put('core', sp, AX, yy - hh / 2, s, 0); coreHalf = Math.max(coreHalf, sp.w * s / 2);
            yy -= hh * 0.92;
          }
        }
      }
      solid(y, shaftTop, coreHalf);
      const rb = g.shaft.ribs ? part(g.shaft.rib, 'rib') : null;
      if (rb) {
        const s = clamp(44 / rb.h, 0.4, 1.1), step = rb.h * s * 0.85, hk = part(g.shaft.ribHook, 'hook');
        for (let yy = y - step / 2; yy > shaftTop + step / 3; yy -= step) {
          put('fin', rb, AX - coreHalf - 12, yy, s, -6);
          if (hk) put('fin', hk, AX - coreHalf - 2, yy + step * 0.3, clamp(14 / Math.max(hk.w, 1), 0.3, 0.8), 15);
        }
      }
    }
    y = shaftTop;
    // ring balconies
    for (let i = 0; i < g.balc.n; i++) {
      const t = (i + 1) / (g.balc.n + 1), by = topOfBase - shaftH * t;
      const bh = g.balc.half * (1 - g.balc.taper * t);
      ring(by, bh, 1.4); ring(by + 7, bh - 6, 0.8);
      solid(by + 7, by, bh - 2);
      frieze('parapet', part(g.balc.frieze, 'frieze'), by - 13, bh - 10, 20);
      const bead = part(g.balc.bead, 'bead');
      if (bead) L.drops.push({ y: GROUND - (by + 7), r: bh - 8, n: 38, len: 6, bead, s: clamp(14 / bead.w, 0.2, 0.6) });
      put('corner', part(g.balc.hook, 'hook'), AX - bh - 6, by - 6, 0.75, -10);
    }
    // upper drums
    let dh = g.drums.half;
    for (let i = 0; i < g.drums.n; i++) {
      const h = g.drums.h * (1 - i * 0.08), fr = part(g.drums.frieze, 'frieze');
      ring(y - h, dh); ring(y, dh, 1.3); ring(y - h / 2, dh * 1.06, 0.6); // the drum's bulge, as a girdle
      solid(y, y - h * 0.5, dh, dh * 1.04); solid(y - h * 0.5, y - h, dh * 1.04, dh);
      if (g.bays && g.bays.on) L.bands.push({ fam: 'drum', lvl: 'any', yTop: GROUND - (y - h), yBot: GROUND - y, half: dh * 0.97, cornice: fr, rOut: dh * 1.02 });
      else frieze('frieze', fr, y - h / 2, dh, h * 0.5);
      y -= h * 0.96; dh *= 0.8;
    }
    // neck
    for (const id of g.neck || []) {
      const p = part(id, 'lamp'); if (!p) continue;
      const s = clamp(40 / Math.max(p.w, 1), 0.6, 1.2), hh = p.h * s;
      put('neck', p, AX, y - hh / 2 + 4, s, 0);
      solid(y + 4, y + 4 - hh * 0.85, p.w * s / 2 * 0.8);
      y -= hh * 0.85;
    }
    // crown
    const c = g.crown, R = c.R, lampP = part(c.lamp, 'lamp');
    const lampS = lampP ? clamp(Math.min(Math.max(R, 45) * 0.85, 105) / Math.max(lampP.h, lampP.w * 0.8), 0.5, 1.4) : 1;
    const cy = y - Math.max(R * 0.85, lampP ? lampP.h * lampS * 0.5 : 30);
    const hp = R > 20 ? part(c.halo, 'halo') : null;
    if (hp) {
      put('halo', hp, AX, cy, 2 * R / hp.w, 0);
      put('halo', hp, AX, cy, 1.45 * R / hp.w, 0, { op: 0.6 });
      const bead = part(c.bead, 'bead');
      if (bead && c.beads > 0) {
        const bs = clamp(12 / bead.w, 0.15, 0.6);
        fan('haloBead', bead, AX, cy, c.beads, R, -172, -8, bs, 0);
        put('haloBead', bead, AX, cy - R, bs * 1.3, 0);
      }
    }
    (c.fans || []).forEach((f, i) => {
      const n = i === 0 ? c.n : Math.max(0, c.n - 2), bp = part(f.part, 'blade');
      if (!n || !bp) return;
      const s = clamp(f.scale * Math.max(R, 50) * 0.42 / Math.max(bp.w, bp.h), 0.35, 1.3);
      fan('fan', bp, AX, cy + 4, n, Math.max(R, 50) * f.r, f.from, f.to, s, f.spin);
    });
    if (lampP) put('lamp', lampP, AX, cy, lampS, 0);
    if (c.spire) {
      const sp = part(c.spirePart, 'spire');
      if (sp) { const s = clamp(Math.max(R, 60) * 0.75 / sp.h, 0.5, 1.4), top = cy - Math.max(R, lampP ? lampP.h * lampS / 2 : 30); put('spire', sp, AX, top - sp.h * s / 2 + 8, s, 0); }
    }
    L.crownY = GROUND - cy; L.coreHalf = coreHalf;
    return L;
  }

  // ---------- bays, laid out for a closed ring (port of dressBand) ----------
  // Same split as Spire Forge — cornice strip, then bays — but the bay count comes from the full
  // circumference. Rule positions read as they do from the front: the bay facing you (and the one
  // facing away) is the centre bay, the bays at the silhouette edges are the end bays.
  function ringBays(g, b, push) {
    const B = g.bays, hgt = b.yTop - b.yBot, margin = 5, r = b.rOut || b.half;
    let zoneTop = b.yTop; // y up: top is the larger number
    if (hgt >= 28) {
      const ch = hgt * 0.24;
      if (b.cornice) push.wrap({ sec: 'cornice', p: b.cornice, y: b.yTop - (ch / 2 + 1), r, s: clamp(ch * 0.8 / b.cornice.h, 0.45, 1.15) });
      push.rail({ y: b.yTop - (ch + 1), r, w: 0.7 });
      zoneTop = b.yTop - (ch + 1);
    }
    const zoneH = zoneTop - b.yBot, circ = TAU * Math.max(4, b.half - margin);
    const n = Math.max(3, Math.round(circ / clamp(B.width, 12, 120))), bw = circ / n;
    const q1 = Math.round(n / 4), q3 = Math.round(3 * n / 4), back = n % 2 ? -1 : n / 2;
    const rule = (pos) => B.rules[`${b.fam}.${b.lvl}.${pos}`] || B.rules[`${b.fam}.${pos}`] || B.rules[`base.${pos}`];
    const cache = {};
    for (let i = 0; i < n; i++) {
      const pos = i === 0 || i === back ? 'center' : i === q1 || i === q3 ? 'end' : 'side';
      const rl = rule(pos);
      if (!rl || !rl.part) continue;
      const p = cache[rl.part] || (cache[rl.part] = part(rl.part, 'bead'));
      if (!p) continue;
      const box = Math.min(bw * 0.86, zoneH * 0.86) * clamp(B.size, 0.3, 1.2) * (rl.scale || 1);
      push.tan({ sec: 'bay', p, a: (i / n) * TAU, r, y: b.yBot + zoneH * 0.5, s: clamp(box / Math.max(p.w, p.h), 0.12, 1.8) });
    }
    const pr = B.rules[`${b.fam}.pilaster`], pp = pr && pr.part ? part(pr.part, 'segment') : null;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU;
      if (pp) push.tan({ sec: 'pilaster', p: pp, a, r, y: b.yBot + zoneH * 0.5, s: clamp(zoneH * 0.92 / pp.h, 0.12, 1.4) });
      else push.line(a, r, b.yBot, zoneTop, 'pilaster');
    }
  }

  // ---------- standing it up ----------
  const WEIGHT = { rail: 0.7, bay: 0.95, pilaster: 0.7, cornice: 0.8, frieze: 0.8, parapet: 0.85, drop: 0.6, core: 1.0, neck: 1.0,
    fin: 0.9, corner: 0.9, butt: 0.85, fan: 1.1, halo: 0.75, haloBead: 0.8, lamp: 1.25, spire: 1.1 };
  const SPUN = { fin: 4, corner: 2, butt: 3, fan: 6, halo: 2, haloBead: 2, lamp: 2, spire: 2 };

  function buildSpireGL2(g, opts) {
    opts = opts || {};
    const u = opts.unit || 1 / 16, K = { ...SPUN, ...(opts.K || {}) }, W = { ...WEIGHT, ...(opts.weight || {}) };
    const def = opts.color || [0.5, 0.95, 0.7], forceColor = !!opts.forceColor;
    const L = layout(g);
    const pos = [], col = [];
    const seg = (a, b, rgb) => { pos.push(a[0] * u, a[1] * u, a[2] * u, b[0] * u, b[1] * u, b[2] * u); col.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]); };
    const tint = (hex, w) => { const c = (!forceColor && hexRGB(hex)) || def; return [Math.min(1, c[0] * w), Math.min(1, c[1] * w), Math.min(1, c[2] * w)]; };
    // emit a part's polylines through map(lx, lyDown) where (lx, lyDown) is the part-local point
    // already scaled/rotated/flipped (lyDown follows SVG: positive is downward)
    const emit = (p, s, rot, flipY, sx, map, w) => {
      const r = rot * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r), fy = flipY ? -1 : 1;
      for (const pl of p.polys) {
        const rgb = tint(pl.color, w);
        let prev = null;
        for (let i = 0; i < pl.length; i++) {
          const px = pl[i][0], py = pl[i][1] * fy;
          const v = map(sx * (px * cr - py * sr) * s, (px * sr + py * cr) * s);
          if (prev) seg(prev, v, rgb);
          prev = v;
        }
      }
    };
    // radial fin: the flat elevation spun into K planes through the axis (mirrored twin = opposite side)
    const spun = (it, k) => {
      const sides = it.mirror ? [1, -1] : [1], w = (W[it.sec] || 1) * it.op;
      for (let q = 0; q < k; q++) {
        const phi = (q / k) * Math.PI + (opts.phase || 0), cp = Math.cos(phi), sp = Math.sin(phi);
        for (const sd of sides) emit(it.p, it.s, it.rot, it.flipY, sd, (lx, ly) => { const X = sd * it.x + lx; return [X * cp, it.y - ly, X * sp]; }, w);
      }
    };
    // tangent: the part bent onto a cylinder of radius r, centred at angle a
    const tan = (t) => {
      const w = W[t.sec] || 1;
      emit(t.p, t.s, t.rot || 0, false, 1, (lx, ly) => { const a = t.a + lx / t.r; return [t.r * Math.sin(a), t.y - ly, t.r * Math.cos(a)]; }, w);
    };
    const circle = (y, r, w, n) => {
      n = n || Math.max(24, Math.min(160, Math.round(TAU * r / 10)));
      const rgb = tint(null, w);
      for (let i = 0; i < n; i++) { const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU; seg([r * Math.sin(a0), y, r * Math.cos(a0)], [r * Math.sin(a1), y, r * Math.cos(a1)], rgb); }
    };
    const wrapRow = (wr) => {
      const step = wr.p.w * wr.s * 1.08, n = Math.max(3, Math.floor(TAU * wr.r / step));
      for (let i = 0; i < n; i++) tan({ sec: wr.sec, p: wr.p, a: ((i + 0.5) / n) * TAU, r: wr.r, y: wr.y, s: wr.s });
    };
    const push = {
      wrap: wrapRow, tan,
      rail: (rl) => circle(rl.y, rl.r, W.rail * rl.w),
      line: (a, r, y0, y1, sec) => { const rgb = tint(null, W[sec] || 0.7); seg([r * Math.sin(a), y0, r * Math.cos(a)], [r * Math.sin(a), y1, r * Math.cos(a)], rgb); },
    };

    for (const rl of L.rails) push.rail(rl);
    for (const b of L.bands) ringBays(g, b, push);
    for (const wr of L.wraps) wrapRow(wr);
    for (const d of L.drops) {
      for (let i = 0; i < d.n; i++) {
        const a = ((i + 0.5) / d.n) * TAU;
        push.line(a, d.r, d.y, d.y - d.len, 'drop');
        tan({ sec: 'drop', p: d.bead, a, r: d.r, y: d.y - 13, s: d.s });
      }
    }
    for (const it of L.items) {
      if (it.sec === 'core' || it.sec === 'neck') {
        // wrap the axis part round its own drum: enough copies to close the circle
        // radius follows the part's own width, but never wider than the shaft the occluder gives it
        const pw = it.p.w * it.s, r = Math.max(6, Math.min(pw / 2, it.sec === 'core' ? L.coreHalf : pw / 2));
        const n = Math.max(2, Math.round(TAU * r / pw));
        for (let i = 0; i < n; i++) tan({ sec: it.sec, p: it.p, a: (i / n) * TAU, r, y: it.y, s: it.s });
      } else spun(it, K[it.sec] || 2);
    }

    const occluder = lathe(L.solids, opts.inset == null ? 0.96 : opts.inset, u, opts.occluderSegments || 40);
    const positions = new Float32Array(pos), colors = new Float32Array(col);
    return { lines: { positions, colors }, occluder, top: L.top * u, reach: L.reach * u, crownY: L.crownY * u,
      stats: { segments: positions.length / 6, items: L.items.length, bands: L.bands.length, rails: L.rails.length } };
  }

  // ---------- occluder: lathed solids (frusta with caps), for depth only ----------
  function lathe(solids, inset, u, n) {
    const P = [], N = [], I = [];
    const ringV = (y, r, ny) => { const base = P.length / 3; for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, s = Math.sin(a), c = Math.cos(a); P.push(r * s * u, y * u, r * c * u); N.push(ny ? 0 : s, ny || 0, ny ? 0 : c); } return base; };
    for (const sd of solids) {
      const r0 = sd.r0 * inset, r1 = sd.r1 * inset, ya = Math.min(sd.y0, sd.y1), yb = Math.max(sd.y0, sd.y1);
      const ra = sd.y0 <= sd.y1 ? r0 : r1, rb = sd.y0 <= sd.y1 ? r1 : r0;
      const a = ringV(ya, ra), b = ringV(yb, rb);
      for (let i = 0; i < n; i++) I.push(a + i, b + i, a + i + 1, a + i + 1, b + i, b + i + 1);
      for (const [y, r, ny] of [[yb, rb, 1], [ya, ra, -1]]) { // caps
        const ctr = P.length / 3; P.push(0, y * u, 0); N.push(0, ny, 0);
        const rim = ringV(y, r, ny);
        for (let i = 0; i < n; i++) I.push(ctr, rim + i, rim + i + 1);
      }
    }
    const positions = new Float32Array(P), normals = new Float32Array(N);
    const color = new Float32Array((P.length / 3) * 4).fill(1);
    return { positions, normals, uv: new Float32Array((P.length / 3) * 2), color, indices: new Uint32Array(I), mode: 'triangles', materialTag: 'body' };
  }

  function hexRGB(hex) {
    if (!hex) return null;
    let s = hex.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (s.length !== 6) return null;
    const v = parseInt(s, 16);
    return Number.isNaN(v) ? null : [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }

  window.CreatureSpire = { newGenome, layout, buildSpireGL2, TEMPLATES: ['lighthouse', 'spire', 'hive', 'shrine'] };
})();
