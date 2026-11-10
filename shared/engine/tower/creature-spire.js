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
     shaft wall        -> a tapering cone: its edge spun round, lancets / an arcade wrapped on it,
                          stepped buttresses and pinnacles spun as fins
     eaved roofs       -> the eave's curve spun round its ring (a pagoda's tiers, a hall's one roof)
     dome, needle      -> meridians spun round the axis
     gate              -> the one form that is not round: two posts and beams, stood as a flat
                          frame with a little depth

   Scale is fixed: 1 px of the Spire Forge sheet = 1/16 m (opts.unit), so a tower is as tall
   in World Scene as it is in Spire Forge and its parts keep their native size.

   API
     (a genome comes from shared/engine/generators/spire-generator.js; this file only stands one up)
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

  // ---------- layout (port of Spire Forge draw(), recorded as data) ----------
  // Coordinates: x across from the axis (left negative), y UP from the ground, in sheet px.
  // items:  { p, x, y, s, rot, flipY, mirror, sec }  — sec decides how the item is stood in 3D
  // bands:  terrace / drum bay zones, laid out again per-circumference at stand time
  // rails:  level lines -> circles      solids: occluder pieces {y0, y1, r0, r1}
  function layout(g) {
    const L = { items: [], bands: [], rails: [], wraps: [], drops: [], solids: [], profiles: [], arches: [], planes: [], boxes: [], top: 0, reach: 0 };
    const Y = (ys) => GROUND - ys;
    // a curve in the elevation, x out from the axis: spun round it as k planes (both sides, so 2k around)
    const profile = (pts, k, w) => { L.profiles.push({ pts: pts.map(([x, ys]) => [x, Y(ys)]), k, w: w || 1 }); for (const [x, ys] of pts) { L.top = Math.max(L.top, Y(ys)); L.reach = Math.max(L.reach, Math.abs(x)); } };
    const quad = (p0, c, p1, n) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), d = t * t; o.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]); } return o; };
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
    // the shaft's body (Spire generator: shaft.wall / taper / steps / lancets / arcade / pinnacles)
    let wallFoot = 0, wallTop = 0; const y0w = y;
    const wallAt = (yy) => wallFoot + (wallTop - wallFoot) * clamp((y0w - yy) / Math.max(shaftH, 1), 0, 1);
    if (shaftH > 10 && g.shaft.wall) {
      wallFoot = clamp(half * g.shaft.wall / (g.base.n ? g.base.step : 1), 22, 260); wallTop = wallFoot * clamp(g.shaft.taper == null ? 0.8 : g.shaft.taper, 0.3, 1);
      profile([[wallFoot, y], [wallTop, shaftTop]], 4, 1.1);
      ring(y, wallFoot, 1.1); ring(shaftTop, wallTop + 5, 1.3); ring(shaftTop + 5, wallTop, 0.7);
      solid(y, shaftTop, wallFoot, wallTop);
      const steps = clamp(g.shaft.steps || 0, 0, 4);
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps * 0.72, t1 = (k + 1) / steps * 0.72, ya = y - shaftH * t0, yb = y - shaftH * t1, out = (steps - k) * 9;
        profile([[wallAt(ya), ya], [wallAt(ya) + out, ya], [wallAt(yb) + out, yb + 10], [wallAt(yb) + out - 9, yb], [wallAt(yb), yb]], 3, 0.9);
      }
      const rows = clamp(g.shaft.lancets || 0, 0, 6);
      for (let r = 0; r < rows; r++) {
        const yb = y - shaftH * (r + (g.shaft.arcade ? 0.06 : 0.16)) / rows, hh = shaftH / rows * (g.shaft.arcade ? 0.72 : 0.6), wAt = wallAt(yb - hh / 2) - 8;
        const n = g.shaft.arcade ? clamp(g.shaft.arcade, 1, 13) : Math.max(1, Math.min(3, Math.floor(wAt / 20))), bw = 2 * wAt / n, aw = Math.min(bw * 0.62, hh * 0.5);
        const ys = yb - hh + aw * 0.9, rw = wallAt(yb - hh / 2) + 0.5;
        const arch = [[-aw / 2, Y(yb)], [-aw / 2, Y(ys)], ...quad([-aw / 2, Y(ys)], [-aw / 2, Y(yb - hh + aw * 0.25)], [0, Y(yb - hh)], 4).slice(1), ...quad([0, Y(yb - hh)], [aw / 2, Y(yb - hh + aw * 0.25)], [aw / 2, Y(ys)], 4).slice(1), [aw / 2, Y(yb)]];
        const around = Math.max(3, Math.round(TAU * rw / bw));
        L.arches.push({ pts: arch, r: rw, n: around, w: 1 });
        if (!g.shaft.arcade) L.arches.push({ pts: [[0, Y(yb)], [0, Y(yb - hh * 0.72)]], r: rw, n: around, w: 0.7 });
        if (r < rows - 1) { const yr = y - shaftH * (r + 1) / rows; ring(yr, wallAt(yr) + 3, 0.7); }
      }
      if (g.shaft.pinnacles) { const px = wallTop + 2, ph = clamp(shaftH * 0.14, 30, 70);
        profile([[px - 7, shaftTop], [px - 7, shaftTop - ph * 0.35], [px, shaftTop - ph], [px + 7, shaftTop - ph * 0.35], [px + 7, shaftTop]], 3, 1);
        profile([[px - 7, shaftTop - ph * 0.35], [px + 7, shaftTop - ph * 0.35]], 3, 0.8); }
      coreHalf = Math.max(coreHalf, wallTop);
    }
    // a gate: two posts on the terrace and beams across them. Not a round thing: a flat frame with depth.
    let gateTop = null;
    if (g.gate && g.gate.on) {
      const G2 = g.gate, gs = clamp(half * G2.span, 50, 240), gh = clamp(G2.h, 120, 520), pw = clamp(G2.post, 8, 34), top = y - gh, dz = pw * 0.8;
      const flat = (pts, w) => { for (const z of [-dz, dz]) L.planes.push({ pts: pts.map(([x, ys]) => [x, Y(ys)]), z, w: w || 1 }); for (const [x, ys] of pts) { L.top = Math.max(L.top, Y(ys)); L.reach = Math.max(L.reach, Math.abs(x)); } };
      const tie = (x, ys) => L.planes.push({ tie: [x, Y(ys)], z: dz, w: 0.8 });
      for (const sx of [-1, 1]) { const x = sx * gs;
        flat([[x - pw / 2 - 3, y], [x - pw / 2, top]]); flat([[x + pw / 2 + 3, y], [x + pw / 2, top]]); flat([[x - pw / 2 - 6, y - 10], [x + pw / 2 + 6, y - 10]], 0.8);
        tie(x - pw / 2 - 3, y); tie(x + pw / 2 + 3, y); tie(x - pw / 2, top); tie(x + pw / 2, top);
        L.boxes.push({ x0: x - pw / 2, x1: x + pw / 2, y0: Y(y), y1: Y(top), z0: -dz, z1: dz }); }
      const beam = (yy, over, th, lift) => { const x = gs + over;
        const up = [...quad([-x, yy - lift], [-x * 0.5, yy + 3], [0, yy], 6), ...quad([0, yy], [x * 0.5, yy + 3], [x, yy - lift], 6).slice(1)];
        const dn = [...quad([x - 4, yy - lift + th], [x * 0.5, yy + th + 3], [0, yy + th], 6), ...quad([0, yy + th], [-x * 0.5, yy + th + 3], [-x + 4, yy - lift + th], 6).slice(1)];
        flat([...up, ...dn, up[0]], 1.1); tie(-x, yy - lift); tie(x, yy - lift); tie(0, yy);
        L.boxes.push({ x0: -x * 0.86, x1: x * 0.86, y0: Y(yy + th), y1: Y(yy), z0: -dz, z1: dz }); };
      beam(top - 14, gs * 0.34, 14, 16);
      if ((G2.beams == null ? 2 : G2.beams) > 1) { const yb = top + gh * 0.2;
        flat([[-gs - pw, yb], [gs + pw, yb], [gs + pw, yb + 12], [-gs - pw, yb + 12], [-gs - pw, yb]]); tie(-gs - pw, yb); tie(gs + pw, yb);
        L.boxes.push({ x0: -gs - pw, x1: gs + pw, y0: Y(yb + 12), y1: Y(yb), z0: -dz * 0.8, z1: dz * 0.8 }); }
      flat([[-6, top - 2], [-6, top + gh * 0.2]], 0.8); flat([[6, top - 2], [6, top + gh * 0.2]], 0.8);
      gateTop = top - 26;
    }
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
      if (!g.shaft.wall) solid(y, shaftTop, coreHalf);
      const rb = g.shaft.ribs ? part(g.shaft.rib, 'rib') : null;
      if (rb) {
        const s = clamp(44 / rb.h, 0.4, 1.1), step = rb.h * s * 0.85, hk = part(g.shaft.ribHook, 'hook');
        for (let yy = y - step / 2; yy > shaftTop + step / 3; yy -= step) {
          put('fin', rb, AX - coreHalf - 12, yy, s, -6);
          if (hk) put('fin', hk, AX - coreHalf - 2, yy + step * 0.3, clamp(14 / Math.max(hk.w, 1), 0.3, 0.8), 15);
        }
      }
    }
    y = gateTop != null ? gateTop : shaftTop;   // a gate's crown sits on its top beam
    // ring balconies
    for (let i = 0; i < g.balc.n; i++) {
      const t = (i + 1) / (g.balc.n + 1), by = topOfBase - shaftH * t;
      const bh = g.balc.half * (1 - g.balc.taper * t);
      if (g.balc.roof) {
        // an eaved roof: from the wall above it sweeps down and out, and turns up at the tip
        const yy = g.balc.top ? shaftTop : by, wIn = (g.shaft.wall ? wallAt(yy - 28) : coreHalf) + 4, rise = clamp(bh * 0.2, 16, 44);
        profile([...quad([wIn, yy - rise], [bh * 0.62, yy - rise * 0.25], [bh + 10, yy - rise * 0.5], 7), [bh + 2, yy + 1]], 6, 1.1);
        ring(yy - rise, wIn, 1.1); ring(yy - rise * 0.5, bh + 10, 1.3); ring(yy + 1, bh + 2, 1.2); ring(yy + 6, bh - 8, 0.7);
        solid(yy + 1, yy - rise, bh + 2, wIn);
        frieze('parapet', part(g.balc.frieze, 'frieze'), yy + 14, Math.min(bh - 12, (g.shaft.wall ? wallAt(yy + 14) : bh) - 4), 12);
        if (g.balc.top) y = Math.min(y, shaftTop - rise);
        continue;
      }
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
    // a dome on the last drum (or balcony, or the shaft)
    if (g.dome && g.dome.on) {
      const lastHalf = g.drums.n ? dh / 0.8 : g.balc.n ? g.balc.half * (1 - g.balc.taper) : coreHalf + 24;
      const Rd = lastHalf * 0.98, Hd = Rd * clamp(g.dome.rise, 0.3, 1.4), y0d = y - 5;
      ring(y, Rd + 8, 1.4); ring(y0d, Rd + 2, 0.7);
      const mer = (f) => { const o = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; o.push([Rd * f * Math.cos(a), y0d - Hd * f * Math.sin(a)]); } return o; };
      profile(mer(1), 6, 1.2);
      if ((g.dome.shells == null ? 2 : g.dome.shells) > 0) profile(mer(0.83), 3, 0.6);
      for (let i = 0; i < 5; i++) { const a0 = (i / 5) * Math.PI / 2, a1 = ((i + 1) / 5) * Math.PI / 2; solid(y0d - Hd * Math.sin(a0), y0d - Hd * Math.sin(a1), Rd * Math.cos(a0), Math.max(0.5, Rd * Math.cos(a1))); if (i && i < 4) ring(y0d - Hd * Math.sin(a0), Rd * Math.cos(a0), 0.6); }
      y -= Hd + 1;
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
    if (c.needle) {
      // a needle: a tall plain pyramid on the wall's top, the kit spire part on its tip
      const nh = clamp(shaftH * 0.3 * c.needle, 60, 240), nw = Math.max(coreHalf * 0.86, 18), yb = y;
      profile([[nw, yb], [0, yb - nh]], 4, 1.1); ring(yb, nw, 1.1); ring(yb - nh * 0.5, nw * 0.5, 0.7);
      solid(yb, yb - nh, nw, 0.5);
      const sp = part(c.spirePart, 'spire'); if (sp) { const s = clamp(46 / sp.h, 0.3, 1); put('spire', sp, AX, yb - nh - sp.h * s / 2 + 6, s, 0); }
    } else if (c.spire) {
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

    for (const pf of L.profiles) {
      const rgb = tint(null, pf.w);
      for (let q = 0; q < pf.k; q++) { const phi = (q / pf.k) * Math.PI + (opts.phase || 0), cp = Math.cos(phi), sp = Math.sin(phi);
        for (const sd of [1, -1]) for (let i = 1; i < pf.pts.length; i++) { const a = pf.pts[i - 1], b = pf.pts[i]; seg([sd * a[0] * cp, a[1], sd * a[0] * sp], [sd * b[0] * cp, b[1], sd * b[0] * sp], rgb); } }
    }
    for (const ar of L.arches) {
      const rgb = tint(null, ar.w);
      for (let i = 0; i < ar.n; i++) { const a0 = ((i + 0.5) / ar.n) * TAU; let prev = null;
        for (const [dx, yy] of ar.pts) { const a = a0 + dx / ar.r, v = [ar.r * Math.sin(a), yy, ar.r * Math.cos(a)]; if (prev) seg(prev, v, rgb); prev = v; } }
    }
    for (const pl of L.planes) {
      const rgb = tint(null, pl.w);
      if (pl.tie) { seg([pl.tie[0], pl.tie[1], -pl.z], [pl.tie[0], pl.tie[1], pl.z], rgb); continue; }
      for (let i = 1; i < pl.pts.length; i++) seg([pl.pts[i - 1][0], pl.pts[i - 1][1], pl.z], [pl.pts[i][0], pl.pts[i][1], pl.z], rgb);
    }
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

    const occluder = lathe(L.solids, opts.inset == null ? 0.96 : opts.inset, u, opts.occluderSegments || 40, L.boxes);
    const positions = new Float32Array(pos), colors = new Float32Array(col);
    return { lines: { positions, colors }, occluder, top: L.top * u, reach: L.reach * u, crownY: L.crownY * u,
      stats: { segments: positions.length / 6, items: L.items.length, bands: L.bands.length, rails: L.rails.length } };
  }

  // ---------- occluder: lathed solids (frusta with caps), for depth only ----------
  function lathe(solids, inset, u, n, boxes) {
    const P = [], N = [], I = [];
    for (const b of boxes || []) {   // a gate's posts and beams: plain boxes
      const X = [b.x0, b.x1], Yv = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)], Z = [b.z0, b.z1];
      const face = (pts, nrm) => { const base = P.length / 3; for (const q of pts) { P.push(q[0] * u, q[1] * u, q[2] * u); N.push(nrm[0], nrm[1], nrm[2]); } I.push(base, base + 1, base + 2, base, base + 2, base + 3); };
      face([[X[0], Yv[0], Z[1]], [X[1], Yv[0], Z[1]], [X[1], Yv[1], Z[1]], [X[0], Yv[1], Z[1]]], [0, 0, 1]);
      face([[X[1], Yv[0], Z[0]], [X[0], Yv[0], Z[0]], [X[0], Yv[1], Z[0]], [X[1], Yv[1], Z[0]]], [0, 0, -1]);
      face([[X[1], Yv[0], Z[1]], [X[1], Yv[0], Z[0]], [X[1], Yv[1], Z[0]], [X[1], Yv[1], Z[1]]], [1, 0, 0]);
      face([[X[0], Yv[0], Z[0]], [X[0], Yv[0], Z[1]], [X[0], Yv[1], Z[1]], [X[0], Yv[1], Z[0]]], [-1, 0, 0]);
      face([[X[0], Yv[1], Z[1]], [X[1], Yv[1], Z[1]], [X[1], Yv[1], Z[0]], [X[0], Yv[1], Z[0]]], [0, 1, 0]);
    }
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

  window.CreatureSpire = { layout, buildSpireGL2 };
})();
