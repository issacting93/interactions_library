/* Plants in the tank: line art standing on the floor, on the food chain.

   A plant is one of the kit plants (packages/kit/data/kit-plants-lines.js, window.KitPlants: its lines and its numbers, eco).
   Three kinds:
     food     grazers near its head take a bite (eco.bites of them); it grows them back one every eco.regrow seconds
     trapper  what comes within eco.reach of its head it shuts on. What it can hold is the tank's own weight rule
              (EcoCore.Web): its body is eco.size long (or its height), with eco.jaw. It holds for eco.hold seconds, then
              digests for eco.digest. Too heavy: the creature breaks free. Too light: it stays open.
     chain    does nothing until its trigger happens within eco.near: a carcass, a meal eaten, eco.count meals, a creature
              passing low under it (a walker), a trapper that has fed. Then it blooms for eco.bloom seconds and bears
              things to eat, which whatever does not hunt takes from it.

     const flora = EcologyFlora.create(sim)                     sim: an EcologySim. Chains itself onto sim.hooks.onMeal
     const p = EcologyFlora.plant(flora, "cone-snare", x, y)    stands one at a place on the floor (tank space)
     EcologyFlora.step(flora, dt)                               after the sim's own step
     EcologyFlora.signal(flora, kind, x, y)                     something happened there: carcass | meal | walker | trapper
     EcologyFlora.lines(flora, time) -> { art, marks }          two line sets for EcologyRender.lines: the plants; their reach rings
     EcologyFlora.head(flora, p) -> { x, y, z, zf }             where it feeds or bites: tank space, and z as the sim's 0..1 depth
     EcologyFlora.verdict(flora, def, f) -> "" | "too big" | "too small"     could this trapper hold that creature
     EcologyFlora.clear(flora)
     flora.events  [{ kind, p, f, text, t }]   the last 30 things that happened
   Lengths in eco are in the tank's units: one is sim.cfg.size pixels, a plain creature's length. */
(function () {
  'use strict';
  const FLOOR = 0.97, INK = [0.93, 0.91, 0.87], HUE = { food: [0.36, 0.89, 0.6], trapper: [1, 0.3, 0.37], chain: [0.91, 0.69, 0.29] };
  const depth = (sim) => Math.max(60, Math.min(sim.bounds.w, sim.bounds.h) * 0.9 * (sim.cfg.dz ?? 0.8));

  function create(sim, opt) {
    const data = (opt && opt.plants) || window.KitPlants, defs = {};
    for (const d of data.plants) defs[d.key] = d;
    const flora = { sim, defs, plants: [], events: [], t: 0, buf: new Float32Array(4096), ring: new Float32Array(4096), species: (opt && opt.species) || window.EcologySpecies };
    const was = sim.hooks.onMeal; sim.hooks.onMeal = (f, o) => { if (was) was(f, o); signal(flora, 'meal', f.x, f.y); };
    return flora;
  }
  function plant(flora, key, x, y) {
    const def = flora.defs[key]; if (!def) return null; const e = def.eco;
    const p = { def, x, y, state: def.kind === 'trapper' ? 'open' : def.kind === 'chain' ? 'idle' : 'grown', t: 0, shut: 0, glow: 0, bites: e.bites || 0, grow: 0, held: null, fruit: 0, count: 0, ignore: new Map(), fed: new Map(), meals: 0, bx: 0, by: 0, bvx: 0, bvy: 0, alert: 0, ph: (x * 0.013 + y * 0.007) % 6.283,
      body: def.kind === 'trapper' && window.EcoCore ? window.EcoCore.Web.body({ kind: 'plant:' + key, length: e.size || e.height, jaw: e.jaw, hunts: true, medium: 'ground' }) : null };
    flora.plants.push(p); return p;
  }
  function clear(flora) { for (const p of flora.plants) if (p.held) p.held.heldBy = null; flora.plants.length = 0; flora.events.length = 0; }
  const note = (flora, kind, p, f, text) => { flora.events.push({ kind, p, f, text, t: flora.t }); if (flora.events.length > 30) flora.events.shift(); };
  // where a plant does its work: over its foot, part of the way up it (a flat trap: on the floor)
  function head(flora, p) {
    const e = p.def.eco, U = flora.sim.cfg.size, TD = depth(flora.sim), up = e.flat ? 0.05 : e.height * (e.ground ? 0.25 : e.tree ? 0.6 : 0.85);
    const z = FLOOR * TD - up * U; return { x: p.x, y: p.y, z, zf: z / TD };
  }
  const bodyOf = (flora, f) => { const sp = flora.sim.speciesRT[f.sp]; return window.EcoCore.Web.body({ kind: f.sp, length: f.scale * sp.swim.len, schools: (sp.beh.school || 0) >= 0.9 }); };
  function verdict(flora, def, f) {
    const W = window.EcoCore.Web, b = W.body({ kind: 'plant:' + def.key, length: def.eco.size || def.eco.height, jaw: def.eco.jaw, hunts: true });
    return W.refusal(b, f.sp != null ? bodyOf(flora, f) : W.body({ kind: f.key, length: f.length, schools: f.schools }));
  }
  const name = (flora, f) => flora.sim.speciesRT[f.sp].name;
  // every living creature within r (tank units) of a plant's head, nearest first
  function near(flora, p, r) {
    const h = head(flora, p), U = flora.sim.cfg.size, TD = depth(flora.sim), R = r * U, out = [];
    for (const f of flora.sim.fish) { if (f.dead || f.hidden || f.heldBy) continue; const dx = f.x - h.x, dy = f.y - h.y, dz = f.z * TD - h.z, d = Math.hypot(dx, dy); if (d < R && Math.abs(dz) < Math.max(R, U * 0.8)) out.push({ f, d }); }
    return out.sort((a, b) => a.d - b.d).map((o) => o.f);
  }
  function signal(flora, kind, x, y, from) {
    const U = flora.sim.cfg.size;
    for (const p of flora.plants) { const e = p.def.eco; if (p.def.kind !== 'chain' || p === from || p.state !== 'idle') continue;
      if (!(e.trigger === kind || (e.trigger === 'meals' && kind === 'meal')) || Math.hypot(x - p.x, y - p.y) > e.near * U) continue;
      if (e.trigger === 'meals') { p.count++; if (p.count < e.count) { note(flora, 'rung', p, null, p.count + ' of ' + e.count + ' meals'); continue; } p.count = 0; }
      p.state = 'bloom'; p.t = e.bloom; p.fruit = 6; note(flora, 'bloom', p, null, p.def.name + ' blooms'); }
  }
  function release(p) { if (p.held) p.held.heldBy = null; p.held = null; }
  function step(flora, dt) {
    const sim = flora.sim, U = sim.cfg.size, TD = depth(sim), eco = flora.species.ECO; flora.t += dt;
    for (const p of flora.plants) {
      const e = p.def.eco, h = head(flora, p);
      { const R = Math.max(1, e.flat ? e.size || 1 : e.height) * U; let push = 0, pushY = 0, nearest = 1e9;   // the wash of whatever swims past bends it; it springs back
        for (const f of sim.fish) { if (f.dead || f.hidden || f.heldBy) continue; const dx = f.x - h.x, dy = f.y - h.y, d = Math.hypot(dx, dy); if (d > R) continue; nearest = Math.min(nearest, d);
          const w = (1 - d / R) * Math.min(2, f.scale * sim.speciesRT[f.sp].swim.len); push += Math.max(-3, Math.min(3, (f.vx || 0) / U)) * w; pushY += Math.max(-3, Math.min(3, (f.vy || 0) / U)) * w; }
        p.bvx += (push * 420 - 34 * p.bx - 3.2 * p.bvx) * dt; p.bvy += (pushY * 420 - 34 * p.by - 3.2 * p.bvy) * dt; p.bx += p.bvx * dt; p.by += p.bvy * dt;
        const tense = p.def.kind === 'trapper' && p.state === 'open' && e.reach && nearest < e.reach * U * 2.4 ? 1 : 0; p.alert += (tense - p.alert) * Math.min(1, dt * 5); }
      for (const [f, until] of p.ignore) if (until < flora.t || f.dead) p.ignore.delete(f);
      for (const [f, until] of p.fed) if (until < flora.t || f.dead) p.fed.delete(f);
      if (p.def.kind === 'food') {
        if (p.bites < e.bites && (p.grow += dt) >= e.regrow) { p.grow = 0; p.bites++; }
        if (p.bites > 0) for (const f of near(flora, p, 0.7)) { const k = sim.speciesRT[f.sp].key;
          if (!(eco[k] && eco[k].graze) || p.fed.has(f) || f.full > 0) continue;
          p.bites--; p.meals++; p.bvx += (f.x < p.x ? 1 : -1) * 320; p.fed.set(f, flora.t + 4); f.full = Math.max(f.full || 0, 2.5); f.gulp = 1; f.meals = (f.meals || 0) + 1; note(flora, 'bite', p, f, name(flora, f) + ' takes a bite'); break; }
      } else if (p.def.kind === 'trapper') {
        const f = p.held;
        if (f && f.dead) { release(p); p.state = 'open'; }
        if (p.state === 'open') {
          for (const o of near(flora, p, e.reach)) { if (p.ignore.has(o)) continue;
            const why = window.EcoCore.Web.refusal(p.body, bodyOf(flora, o));
            if (why === 'too small') { p.ignore.set(o, flora.t + 6); note(flora, 'pass', p, o, name(flora, o) + ' is too small to close for'); continue; }
            p.held = o; o.heldBy = p; if (why) { p.state = 'strain'; p.t = 1.1; note(flora, 'strain', p, o, name(flora, o) + ' is too heavy to hold'); }
            else { p.state = 'hold'; p.t = e.hold; p.bvx += 260; note(flora, 'catch', p, o, p.def.name + ' shuts on ' + name(flora, o)); }
            break; }
        } else if (p.state === 'strain') {
          if ((p.t -= dt) <= 0 && f) { const a = Math.atan2(f.y - p.y, f.x - p.x) + 0.6; f.vx = Math.cos(a) * U * 2.2; f.vy = Math.sin(a) * U * 2.2; f.alarm = 1; p.bvx -= 420; p.ignore.set(f, flora.t + 9); note(flora, 'free', p, f, name(flora, f) + ' breaks free'); release(p); p.state = 'open'; }
        } else if (p.state === 'hold') {
          if ((p.t -= dt) <= 0) { p.state = 'digest'; p.t = e.digest; note(flora, 'digest', p, f, p.def.name + ' digests ' + name(flora, f)); }
        } else if (p.state === 'digest') {
          p.t -= dt; if (f) { f.fade = Math.max(0, Math.min(f.fade, 1 - (e.digest - p.t) / Math.min(2, e.digest))); if (f.fade <= 0.02) { release(p); window.EcologySim.kill(sim, f); p.meals++; } }
          if (p.t <= 0) { if (p.held) { const g = p.held; release(p); window.EcologySim.kill(sim, g); p.meals++; } p.state = 'open'; note(flora, 'open', p, null, p.def.name + ' opens again'); signal(flora, 'trapper', p.x, p.y, p); }
        }
        if (p.held) { const g = p.held, j = p.state === 'strain' ? 0.1 : 0.03 * Math.min(1, p.t); g.x = h.x + Math.sin(flora.t * 37) * U * j; g.y = h.y + Math.cos(flora.t * 29) * U * j; g.z = h.zf; g.vx = g.vy = 0; }
        p.shut += ((p.state === 'open' ? 0 : 1) - p.shut) * Math.min(1, dt * 9);
      } else {
        if (p.state === 'idle') {
          if (e.trigger === 'carcass') for (const c of sim.carcasses) if (!c.flora && Math.hypot(c.x - p.x, c.y - p.y) < e.near * U) { c.flora = true; signal(flora, 'carcass', c.x, c.y); break; }
          if (e.trigger === 'walker') for (const f of sim.fish) if (!f.dead && !f.hidden && f.z > FLOOR - 0.08 && Math.hypot(f.x - p.x, f.y - p.y) < e.near * U) { signal(flora, 'walker', f.x, f.y); break; }   // whatever keeps to the floor passes under it
        } else if (p.state === 'bloom') {
          p.t -= dt;
          for (const f of (e.gives === 'litter' ? sim.fish.filter((o) => !o.dead && !o.hidden && !o.heldBy && o.z > FLOOR - 0.08 && Math.hypot(o.x - p.x, o.y - p.y) < e.near * U) : near(flora, p, 0.9))) { const rt = sim.speciesRT[f.sp];   // who takes it: fallen litter, anything small; a carrion bloom, anything; fruit and spores, whatever does not live by hunting
            if (p.fed.has(f) || (e.gives === 'litter' ? f.scale * rt.swim.len > 1 : e.gives !== 'meal' && rt.preySet.size && !(eco[rt.key] || {}).graze)) continue;
            p.fruit--; p.meals++; p.fed.set(f, flora.t + 2.5); f.gulp = 1; f.meals = (f.meals || 0) + 1; note(flora, 'fruit', p, f, name(flora, f) + ' eats the ' + e.gives); break; }
          if (p.t <= 0 || p.fruit <= 0) { p.state = 'spent'; p.t = 3; p.fruit = 0; note(flora, 'spent', p, null, p.def.name + ' is spent'); }
        } else if ((p.t -= dt) <= 0) p.state = 'idle';
        p.glow += ((p.state === 'bloom' ? 1 : 0) - p.glow) * Math.min(1, dt * 4);
      }
    }
  }
  // the plants as line segments in tank space. Upright ones stand in the plane that faces a camera looking along y.
  function lines(flora, time) {
    const sim = flora.sim, U = sim.cfg.size, TD = depth(sim), fz = FLOOR * TD; let need = 0;
    for (const p of flora.plants) need += p.def.segs * 8 + 6 * 8 * 8;
    if (flora.buf.length < need) flora.buf = new Float32Array(Math.ceil(need * 1.2));
    const B = flora.buf, art = [], t = time == null ? flora.t : time; let o = 0;
    for (const p of flora.plants) {
      const d = p.def, e = d.eco, flat = !!e.flat, k = (flat ? (e.size || 1) : e.height) * U / 1000, start = o / 4, lit = Math.max(p.shut, p.glow), hue = HUE[d.kind];
      // a grazed plant has lost its outer lines: the first third (its stem) always stands
      const keep = d.kind === 'food' ? Math.ceil(d.lines.length * (0.34 + 0.66 * p.bites / e.bites)) : d.lines.length;
      // how it moves. A current runs through all of them, gusting, so a field of plants sways as a wave; each bends from its foot (more the
      // higher up), in the plane it is drawn in and out of it; its outer parts lift and fall like fronds; each drawn piece quivers about its
      // own middle; and the wash of a creature swimming past (bx, by) bends it and lets it spring back. A trap breathes while open, trembles
      // when something is nearly in reach, and shudders on what it holds.
      if (!d.mid) { d.mid = new Float32Array(d.lines.length * 3); d.lines.forEach((a, i) => { let cx = 0, cy = 0; for (let j = 0; j < a.length; j += 2) { cx += a[j]; cy += a[j + 1]; } const n = a.length / 2; d.mid[i * 3] = cx / n; d.mid[i * 3 + 1] = cy / n; d.mid[i * 3 + 2] = (i * 2.399963) % 6.2832; }); }
      const gust = 0.6 + 0.4 * Math.sin(t * 0.23 + p.x * 0.004), cur = Math.sin(t * 0.7 + p.ph) + 0.45 * Math.sin(t * 1.63 + p.ph * 2.1), cur2 = Math.sin(t * 0.53 + p.ph + 1.7) + 0.4 * Math.sin(t * 1.31 + p.ph);
      const bendX = cur * gust * (e.tree ? 26 : 44) + p.bx, bendY = cur2 * gust * (e.tree ? 20 : 34) + p.by, half = Math.max(1, d.wide / 2), stir = p.state === 'hold' || p.state === 'strain' ? 1 : 0;
      const breathe = d.kind === 'trapper' ? 0.035 * Math.sin(t * 1.15 + p.ph) * (1 - p.shut) : p.glow * 0.04 * Math.sin(t * 2.4), shake = (p.alert * 3 + stir * 7) * Math.sin(t * 43 + p.ph);
      let mx = 0, my = 0, mp = 0, quiv = 0, cq = 1, sq = 0;
      const piece = (i) => { mx = d.mid[i * 3]; my = d.mid[i * 3 + 1]; mp = d.mid[i * 3 + 2]; quiv = (e.tree ? 0.11 : 0.07) * Math.sin(t * (1.5 + mp * 0.22) + mp * 7) * Math.min(1, my / 500 + (flat ? 0.6 : 0)); cq = Math.cos(quiv); sq = Math.sin(quiv); };
      const put = (x0, y0) => {
        const rx = x0 - mx, ry = y0 - my, x = mx + rx * cq - ry * sq, y = my + rx * sq + ry * cq;   // the piece, turned a little about its own middle
        if (flat) { const rad = Math.hypot(x, y), ang = Math.atan2(y, x), s = (1 - 0.28 * p.shut) * (1 + 0.04 * Math.sin(t * 1.4 - rad * 0.006 + p.ph) * (1 - p.shut)), out = Math.max(0, rad / half - 0.55);
          B[o++] = p.x + (x * s + shake * out * Math.cos(ang)) * k; B[o++] = p.y - (y * s + shake * out * Math.sin(ang)) * k; B[o++] = fz - 2 - out * (14 + 10 * Math.sin(t * 1.4 + ang * 2 + p.ph) + 60 * p.shut) * k; B[o++] = 1; return; }
        const yf = y / 1000, xf = Math.min(1, Math.abs(x) / half), top = Math.max(0, yf - 0.45) / 0.55, s = (1 - 0.5 * p.shut * top) * (1 + breathe * top);
        const flap = Math.sin(t * 1.25 + Math.abs(x) * 0.007 + p.ph) * 22 * xf * yf * (1 - 0.7 * p.shut);
        B[o++] = p.x + (x * s + bendX * yf * yf + shake * top) * k; B[o++] = p.y + (bendY * yf * yf + (x > 0 ? 1 : -1) * flap * 0.6) * k; B[o++] = fz - (y + flap - 0.0006 * (bendX * bendX + bendY * bendY) * yf) * k; B[o++] = 1; };
      for (let i = 0; i < keep; i++) { const a = d.lines[i]; piece(i); for (let j = 0; j + 3 < a.length; j += 2) { put(a[j], a[j + 1]); put(a[j + 2], a[j + 3]); } }
      const h = head(flora, p);
      for (let i = 0; i < p.fruit; i++) { const lit = e.gives === 'litter', an = i * 1.05 + 0.3, r = (lit ? 0.5 + 0.15 * (i % 3) : 0.32 + 0.07 * (i % 3)) * U, cx = h.x + Math.cos(an) * r * (lit ? 1.6 : 1), cz = (lit ? fz - U * 0.08 : h.z + Math.sin(an) * r * 0.6 - 0.1 * U) + Math.sin(t * 1.9 + i * 1.7) * U * 0.03, q = U * 0.05;
        const P = [[cx, cz - q], [cx + q, cz], [cx, cz + q], [cx - q, cz]]; for (let j = 0; j < 4; j++) { const a = P[j], b = P[(j + 1) % 4]; B[o++] = a[0]; B[o++] = p.y - 1; B[o++] = a[1]; B[o++] = 1; B[o++] = b[0]; B[o++] = p.y - 1; B[o++] = b[1]; B[o++] = 1; } }
      art.push({ start, count: o / 4 - start, color: [INK[0] + (hue[0] - INK[0]) * lit, INK[1] + (hue[1] - INK[1]) * lit, INK[2] + (hue[2] - INK[2]) * lit] });
    }
    // reach and range, as dashed rings lying level
    const G = flora.ring, marks = []; let g = 0;
    for (const p of flora.plants) { const e = p.def.eco, r = (e.reach || e.near || 0) * U; if (!r) continue; const h = head(flora, p), z = e.near ? fz - 1 : h.z, start = g / 4, N = 72;
      for (let i = 0; i < N; i += 2) { const a = i / N * 6.2832, b = (i + 1) / N * 6.2832; if (g + 8 > G.length) break; G[g++] = p.x + Math.cos(a) * r; G[g++] = p.y + Math.sin(a) * r; G[g++] = z; G[g++] = 1; G[g++] = p.x + Math.cos(b) * r; G[g++] = p.y + Math.sin(b) * r; G[g++] = z; G[g++] = 1; }
      marks.push({ start, count: g / 4 - start, color: HUE[p.def.kind] }); }
    return { art: { data: B, verts: o / 4, batches: art }, marks: { data: G, verts: g / 4, batches: marks } };
  }
  window.EcologyFlora = { create, plant, clear, step, signal, lines, head, verdict, near, FLOOR, HUE };
})();
