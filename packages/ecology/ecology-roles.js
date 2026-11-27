// packages/ecology/ecology-roles.js -- window.EcologyRoles: directing an EcologySim's creatures. A role sets each creature's f.steer
// (a heading whose length is its speed; keep: true holds it against the sim's own wandering) and its depth. Shared by World Scene's
// places (world/scenes/world-scene/places/engine.js: the cast) and Forge Scenes (world/forges/scenes: the koi pond's schools).
//
// Steering gives a heading, not a point to reach: a point a creature can arrive at makes it turn back and forth over it (a wriggle on
// the spot). head() eases a heading in over a few tenths of a second; toward() turns a heading toward a point by how far off it is.
//
//   EcologyRoles.loop(cx, cy, ra, rb, ang, sq)      a closed path: { at(s), tan(s), near(x, y, s0) }, s 0..1 round it
//   EcologyRoles.paths(defs, C, TW, TH)            a place's named paths (fractions of the tank) as loops
//   EcologyRoles.run(ctx, cast, dt, states)        every row of a cast. ctx: { sim, rnd(a, b), keyOf(f), bl(f), tankW, tankDepth, center, paths,
//                                                  setZ(f, z, k) }; a row: { species, n, role, layer | z, path, lead, speed, ... }
//   EcologyRoles.rows(ctx, cast)                   each row's creatures (a species in two rows is split between them, in order)
//   EcologyRoles.school(koi, holder, o, dt)        Forge Scenes' koi brain: schools with leaders going place to place, followers in
//                                                  their slots, food, the shallows, a startle now and then (o: below)
//   EcologyRoles.LAYERS, ROLES, head, toward, circle
(function () {
  'use strict';
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;

  // ------------------------------------------------------------------ steering
  // the heading eases toward the wanted one, and never turns faster than TURN radians a second: a koi glides round, it does not snap
  const TURN = 1.3;
  function head(f, hx, hy, spd, dt, ease, turn) {
    const l = Math.hypot(hx, hy) || 1; hx /= l; hy /= l;
    if (f._hx == null) { f._hx = Math.cos(f.ang || 0); f._hy = Math.sin(f.ang || 0); }
    const a0 = Math.atan2(f._hy, f._hx), k = Math.min(1, dt * (ease || 2.2)); let a1 = Math.atan2(f._hy + (hy - f._hy) * k, f._hx + (hx - f._hx) * k);
    const mx = (turn || TURN) * dt, d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)); a1 = a0 + clamp(d, -mx, mx);
    f._hx = Math.cos(a1); f._hy = Math.sin(a1); f.steer = { x: f._hx * spd, y: f._hy * spd, keep: true };
  }
  // along a heading (tx, ty), turned toward a point by how far off it the creature is (in body lengths b; k: how gently)
  function toward(f, tx, ty, px, py, b, k) {
    const dx = px - f.x, dy = py - f.y, d = Math.hypot(dx, dy) || 1, w = clamp(d / (b * (k || 4)), 0, 0.55);   // at most a broad slant back, never side-on
    return [tx * (1 - w) + dx / d * w, ty * (1 - w) + dy / d * w];
  }
  // round a middle c: the way round at its own radius rr, turned in or out toward that radius (sq squashes the circle; wsgn the way round)
  function circle(f, c, rr, sq, wsgn) {
    const ex = f.x - c[0], ey = (f.y - c[1]) / (sq || 1), d = Math.hypot(ex, ey) || 1, ux = ex / d, uy = ey / d;
    const tx = -uy * wsgn, ty = ux * wsgn * (sq || 1), e = clamp((rr - d) / Math.max(rr * 0.25, 1), -0.8, 0.8);
    return [tx + ux * e, ty + uy * e * (sq || 1)];
  }

  // ------------------------------------------------------------------ paths
  // a closed loop round (cx, cy): ra along, rb across, turned by ang; sq 2 an ellipse, higher a rounder box
  function loop(cx, cy, ra, rb, ang, sq) {
    const ca = Math.cos(ang), sa = Math.sin(ang), e = 2 / (sq || 2);
    const at = (s) => { const u = s * TAU, cu = Math.cos(u), su = Math.sin(u), x = Math.sign(cu) * Math.pow(Math.abs(cu), e) * ra, y = Math.sign(su) * Math.pow(Math.abs(su), e) * rb; return [cx + x * ca - y * sa, cy + x * sa + y * ca]; };
    const near = (x, y, s0) => { let bs = s0, bd = 1e18; const N = s0 == null ? 96 : 16, span = s0 == null ? 1 : 0.12;
      for (let i = 0; i <= N; i++) { const s = s0 == null ? i / N : s0 - span / 2 + span * i / N, p = at(s), d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; bs = s; } }
      return ((bs % 1) + 1) % 1; };
    const tan = (s) => { const a = at(s - 0.002), b = at(s + 0.002), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    return { at, near, tan };
  }
  // a place's paths: { name: { x | 'center', y, through: [fx, fy], along, across (fractions of TW), angle (deg), square } }
  function paths(defs, C, TW, TH) {
    const out = {};
    for (const [name, p] of Object.entries(defs || {})) {
      const ang = (p.angle || 0) * Math.PI / 180, ra = p.along * TW, rb = p.across * TW; let cx, cy;
      if (p.through) { const tx = p.through[0] * TW, ty = p.through[1] * TH; cx = tx - Math.sin(ang) * rb; cy = ty + Math.cos(ang) * rb; }   // slid so its near side passes through the point
      else { cx = p.x === 'center' || p.x == null ? C[0] : p.x * TW; cy = p.y === 'center' || p.y == null ? C[1] : p.y * TH; }
      out[name] = loop(cx, cy, ra, rb, ang, p.square || 2);
    }
    return out;
  }

  // ------------------------------------------------------------------ the cast's roles
  // depth bands, as fractions of the tank's depth (0 the top, 1 the floor)
  const LAYERS = { high: [0.01, 0.04], air: [0.04, 0.14], surface: [0.2, 0.3], mid: [0.36, 0.5], deep: [0.55, 0.85], bed: [0.94, 0.94] };
  const zOf = (r) => r.z || LAYERS[r.layer] || LAYERS.mid;
  const setZ = (ctx, f, z, k) => (ctx.setZ ? ctx.setZ(f, z, k) : (f.z += (z - f.z) * k));
  const live = (ctx, keys) => ctx.sim.fish.filter((f) => !f.dead && keys.includes(ctx.keyOf(f)));

  // (a creature's place along its path is f._ps: f._s is the sim's own slot in the engine, and writing it broke the creature's motion)
  // along a path, in schools: the row splits into flocks of about r.group (8), each keeping together, aligned and spaced (each creature holds a
  // slot in its school, about 1.6 bodies from its neighbours), the schools at their own lanes and pace along the path, so they pass and drift
  // apart rather than travel as one band. r.group: 1 (or a row under 6) swims as before, one loose band in lanes.
  const pathLen = (L) => L._len || (L._len = (() => { let s = 0, p = L.at(0); for (let i = 1; i <= 200; i++) { const q = L.at(i / 200); s += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; } return s; })());
  const SLOTS = [[0, 0], [-1.1, 1], [-1.1, -1], [-2.2, 0], [-2.2, 2], [-2.2, -2], [-3.3, 1], [-3.3, -1], [-4.4, 0], [-1, 2.6], [-1, -2.6], [-3.4, 3]];
  function stream(list, r, ctx, dt, st) {
    const L = ctx.paths[r.path] || Object.values(ctx.paths)[0]; if (!L) return drift(list, r, ctx, dt);
    const z = zOf(r), spd = r.speed || 0.5, dir = r.reverse ? -1 : 1, b0 = list.length ? ctx.bl(list[0]) : 20, len = pathLen(L), size = r.group || 8;
    const width = Math.max((r.width || 0.05) * ctx.tankW(), b0 * Math.sqrt(list.length) * 0.5), t = ctx.sim.time;
    for (const f of list) { f._ps = L.near(f.x, f.y, f._ps); if (f._pace == null) { f._pace = ctx.rnd(0.9, 1.1); f._zl = ctx.rnd(); } }
    if (size <= 1 || list.length < 6) {   // one loose band
      for (const f of list) { if (f._lane == null) f._lane = ctx.rnd(-1, 1) * Math.pow(ctx.rnd(), 0.6);
        const b = ctx.bl(f), s2 = f._ps + dir * 0.004, p = L.at(s2), tg = L.tan(s2), w = width * (0.75 + 0.35 * Math.sin(s2 * TAU * 3 + 1.3));
        const h = toward(f, tg[0] * dir, tg[1] * dir, p[0] - tg[1] * f._lane * w, p[1] + tg[0] * f._lane * w, b, 8);
        head(f, h[0], h[1], spd * f._pace, dt); setZ(ctx, f, lerp(z[0], z[1], f._zl), Math.min(1, dt * 0.8)); }
      return; }
    // schools: made once from who is next to whom along the path; a newcomer joins the school nearest it
    const nG = Math.max(1, Math.round(list.length / size)), G = st.schools || (st.schools = []);
    while (G.length < nG) G.push({ lane: (G.length % 2 ? 1 : -1) * ctx.rnd(0.3, 1), pace: ctx.rnd(0.95, 1.05), ph: ctx.rnd(0, TAU), zl: ctx.rnd(), n: 0 });
    const ds = (a, c) => { const d = a - c; return d - Math.round(d); };   // along-path difference, wrapped to -0.5..0.5
    if (!st.made || list.some((f) => f._g == null || f._g >= nG)) {
      if (!st.made) { const srt = list.slice().sort((a, c) => a._ps - c._ps), per = Math.ceil(list.length / nG); srt.forEach((f, i) => { f._g = Math.min(nG - 1, (i / per) | 0); }); st.made = true; }
      for (const f of list) if (f._g == null || f._g >= nG) { let best = 0, bd = 9; G.forEach((g, gi) => { if (g.s != null) { const d = Math.abs(ds(f._ps, g.s)); if (d < bd) { bd = d; best = gi; } } }); f._g = best; }
    }
    // each school's middle along the path (a circular mean) and its members in order, the slot each holds
    const mem = G.map(() => []); for (const f of list) mem[f._g].push(f);
    G.forEach((g, gi) => { const M = mem[gi]; g.n = M.length; if (!M.length) return; let cx = 0, cy = 0; for (const f of M) { cx += Math.cos(f._ps * TAU); cy += Math.sin(f._ps * TAU); }
      g.s = ((Math.atan2(cy, cx) / TAU) % 1 + 1) % 1; });
    // schools keep their distance along the path: one closer behind the next than an even share of the loop eases off, one further back catches up
    const live = G.filter((g) => g.n), ideal = 1 / Math.max(1, live.length);
    for (const g of live) { let gap = 1; for (const o of live) if (o !== g) { const d = ((dir * (o.s - g.s)) % 1 + 1) % 1; if (d > 1e-4 && d < gap) gap = d; }
      g.keep = live.length > 1 ? clamp(1 + (gap - ideal) / ideal * 0.5, 0.7, 1.25) : 1; }
    for (let gi = 0; gi < G.length; gi++) { const g = G[gi], M = mem[gi]; if (!M.length) continue;
      M.sort((a, c) => dir * ds(c._ps, a._ps));   // the one furthest along leads (slot 0)
      const lane = (g.lane + 0.25 * Math.sin(t * 0.07 + g.ph)) * width;   // the school's lane wanders slowly across the path
      M.forEach((f, k) => { const b = ctx.bl(f), sl = SLOTS[k % SLOTS.length], back = Math.floor(k / SLOTS.length) * 4.4;
        if (f._jx == null) { f._jx = ctx.rnd(-0.3, 0.3); f._jy = ctx.rnd(-0.3, 0.3); }
        const along = (sl[0] - back + f._jx) * 1.7 * b, across = (sl[1] + f._jy) * 0.95 * b;
        const ss = g.s + dir * along / len, p = L.at(ss), tg = L.tan(ss), tx = p[0] - tg[1] * (lane + across), ty = p[1] + tg[0] * (lane + across);
        // along the path always; the slot only leans it sideways (a koi past its slot eases off, it never turns back)
        const ex = tx - f.x, ey = ty - f.y, ahead = (ex * tg[0] + ey * tg[1]) * dir, side = clamp((ey * tg[0] - ex * tg[1]) / (b * 6), -0.4, 0.4);
        head(f, tg[0] * dir - tg[1] * side, tg[1] * dir + tg[0] * side, clamp(spd * g.pace * (g.keep || 1) * (1 + ahead / (b * 4)), spd * 0.55, spd * 1.4), dt, 1.6);
        setZ(ctx, f, lerp(z[0], z[1], clamp(g.zl + (f._zl - 0.5) * 0.3, 0, 1)), Math.min(1, dt * 0.6)); }); }
  }
  // the first leads along a path; the rest in an echelon behind it, faster when behind their place
  function formation(list, r, ctx, dt, st) {
    const L = ctx.paths[r.path] || Object.values(ctx.paths)[0]; if (!L || !list.length) return;
    const ld = list[0], spd = r.speed || 0.42, z = zOf(r)[0];
    st.s = L.near(ld.x, ld.y, st.s); const p = L.at(st.s + 0.004), tg = L.tan(st.s + 0.004), b = ctx.bl(ld), hl = toward(ld, tg[0], tg[1], p[0], p[1], b, 6);
    head(ld, hl[0], hl[1], spd, dt, 1.5); setZ(ctx, ld, z, Math.min(1, dt * 0.6));
    const h = [Math.cos(ld.ang), Math.sin(ld.ang)];
    list.slice(1).forEach((f, i) => {
      const rank = (i >> 1) + 1, side = i % 2 ? 1 : -1, tx = ld.x - h[0] * 1.25 * rank * b - h[1] * side * 1.05 * rank * b, ty = ld.y - h[1] * 1.25 * rank * b + h[0] * side * 1.05 * rank * b;
      const ahead = (tx - f.x) * h[0] + (ty - f.y) * h[1], hh = toward(f, h[0], h[1], tx, ty, b, 3);
      head(f, hh[0], hh[1], clamp(spd * (1 + ahead / (b * 3)), spd * 0.6, spd * 1.5), dt, 1.5); setZ(ctx, f, z + 0.02 * rank, Math.min(1, dt * 0.6));
    });
  }
  // behind and beside another species' first creature, matching its speed
  function escort(list, r, ctx, dt) {
    const ld = live(ctx, [r.lead])[0]; if (!ld) return drift(list, r, ctx, dt);
    const h = [Math.cos(ld.ang), Math.sin(ld.ang)], b = ctx.bl(ld), z = zOf(r), t = ctx.sim.time;
    for (const f of list) {
      if (f._ph == null) { f._ph = ctx.rnd(0, TAU); f._bk = ctx.rnd(1.5, r.back || 4); f._sd = ctx.rnd(-1, 1) * (r.side || 1.5); f._zz = ctx.rnd(z[0], z[1]); }
      const sd = f._sd + 0.25 * Math.sin(t * 0.7 + f._ph), tx = ld.x - h[0] * f._bk * b - h[1] * sd * b, ty = ld.y - h[1] * f._bk * b + h[0] * sd * b;
      const ahead = (tx - f.x) * h[0] + (ty - f.y) * h[1], hh = toward(f, h[0], h[1], tx, ty, b, 3);
      head(f, hh[0], hh[1], clamp(0.55 + ahead / (b * 4), 0.35, 1.3), dt, 1.8); setZ(ctx, f, f._zz, Math.min(1, dt * 0.5));
    }
  }
  // round the middle, each at its own radius and depth
  function drift(list, r, ctx, dt) {
    const c = ctx.center, z = zOf(r), rad = (r.radius || 0.3) * ctx.tankW(), inner = (r.inner || 0) * ctx.tankW(), t = ctx.sim.time;
    for (const f of list) {
      if (f._ph == null) { f._ph = ctx.rnd(0, TAU); f._r = inner + Math.sqrt(ctx.rnd()) * (rad - inner); f._zz = ctx.rnd(z[0], z[1]); f._w = ctx.rnd() < 0.5 ? -1 : 1; }
      const hh = circle(f, c, Math.max(f._r, ctx.bl(f) * 3), r.squash || 1, f._w * (r.turn || 1) >= 0 ? 1 : -1); head(f, hh[0], hh[1], r.speed || 0.3, dt, 1.2);
      setZ(ctx, f, clamp(f._zz + (r.bob || 0) * Math.sin(t * (r.bobSpeed || 0.5) + f._ph * 3), 0, 1), Math.min(1, dt * 0.4));
    }
  }
  // on the floor: crawl round the middle, stopping now and then
  function bed(list, r, ctx, dt) {
    const c = ctx.center, rad = (r.radius || 0.3) * ctx.tankW(), t = ctx.sim.time;
    for (const f of list) {
      if (f._ph == null) { f._ph = ctx.rnd(0, TAU); f._r = Math.sqrt(ctx.rnd()) * rad; f._w = ctx.rnd() < 0.5 ? -1 : 1; }
      if (Math.sin(t * 0.2 + f._ph * 5) > -0.3) { const hh = circle(f, c, Math.max(f._r, ctx.bl(f) * 3), 1, f._w); head(f, hh[0], hh[1], r.speed || 0.2, dt, 1); }
      else { f.steer = { x: 0, y: 0, keep: true }; f._hx = null; }
      setZ(ctx, f, zOf(r)[0] || 0.94, Math.min(1, dt * 0.5));
    }
  }
  // Forge Scenes' koi schools, in the tank: the school's region is the drift radius round the middle
  function schoolRow(list, r, ctx, dt, st) {
    const c = ctx.center, rad = (r.radius || 0.3) * ctx.tankW(), z = zOf(r), b = list.length ? ctx.bl(list[0]) : 20;
    const inside = (x, y) => Math.hypot(x - c[0], y - c[1]) < rad;
    school(list, st, { rnd: ctx.rnd, bl: b, pos: (f) => [f.x, f.y], region: { x: c[0], z: c[1], r: rad / 0.82, random: (R) => { const a = R() * TAU, d = Math.sqrt(R()) * rad * 0.8; return [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d]; } },
      depth: (x, y) => (inside(x, y) ? 1 : -1), zr: z, setZ: (f, zz, k) => setZ(ctx, f, zz, k), ease: 2.2, speed: r.speed || 1 }, dt);
  }
  const wild = (list) => { for (const f of list) f.steer = null; };   // wild: no steering, the ecosystem (hunting, fleeing, schooling) runs these
  const ROLES = { stream, formation, escort, drift, bed, school: schoolRow, wild };

  function rows(ctx, cast) {
    const taken = new Set(), out = [];
    for (const r of cast || []) { const all = live(ctx, [r.species]).filter((f) => !taken.has(f)), mine = all.slice(0, r.n || 0); mine.forEach((f) => taken.add(f)); out.push(mine); }
    return out;
  }
  function run(ctx, cast, dt, states) {
    if (!cast) return; const lists = rows(ctx, cast);
    cast.forEach((r, i) => { (ROLES[r.role] || drift)(lists[i], r, ctx, dt, states[i] || (states[i] = {})); });
  }

  // ------------------------------------------------------------------ schools (Forge Scenes' koi brain)
  // koi: the creatures; holder.brain keeps the schools between ticks. In o's own units (Forge Scenes: world units):
  //   o: { rnd(a, b), bl (a body length), pos(f) -> [x, z], region: { x, z, r, random(rnd) -> [x, z] } (the water),
  //        depth(x, z) (water above the ground there; > 0.5 is deep enough), food: [{ x, z, y }], foodLevel, zr: [a, b] (depth band),
  //        setZ(f, z, k), ease (smooth the heading, as head(); else set at once), speed (1), onStartle(f) }
  const PICK = 5;
  function school(koi, holder, o, dt) {
    const rnd = o.rnd, bl = o.bl || 0.8, w = o.region, B = holder.brain || (holder.brain = { schools: [], t: 0, mix: 25 + rnd(0, 25), startle: 12 + rnd(0, 14) });
    B.t += dt; if (!koi.length) return;
    const nS = Math.max(2, Math.round(koi.length / 9)), dep = o.depth, pos = o.pos, gain = o.speed || 1;
    const heading = (f) => { const a = f.ang || 0; return [Math.cos(a), Math.sin(a)]; };
    const wet = (x, z, d) => Math.hypot(x - w.x, z - w.z) < w.r * 0.82 && dep(x, z) > d;
    for (const f of koi) if (f.sch == null || f.sch >= nS) { f.sch = rnd() < 0.07 ? -1 : (rnd() * nS) | 0; f.slot = [rnd(1.4, 3.4), (rnd() < 0.5 ? -1 : 1) * rnd(0.4, 1.6)]; f.pace = rnd(0.85, 1.12); f.lag = rnd(0, 1); }
    if ((B.mix -= dt) < 0) { B.mix = 25 + rnd(0, 35); for (let i = 0; i < Math.max(1, koi.length / 12) | 0; i++) { const f = koi[(rnd() * koi.length) | 0]; f.sch = (rnd() * nS) | 0; } }   // fission and fusion: a few change school
    // a place to go: ahead of it on a gentle turn, in the water, near its school's own part of the pond (which turns slowly)
    const pick = (x, z, h, far, ai) => {
      let best = null, bs = -1e9; const ang = ai == null ? null : ai / nS * TAU + B.t * 0.02, ax = w.x + Math.cos(ang) * w.r * 0.5, az = w.z + Math.sin(ang) * w.r * 0.5;
      for (let k = 0; k < PICK + 3; k++) {
        const a = Math.atan2(h[1], h[0]) + rnd(-1.7, 1.7), d = rnd(0.55, 1.0) * far, tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d;
        if (!wet(tx, tz, 0.5)) continue;
        const sc = -Math.abs(Math.atan2(Math.sin(a - Math.atan2(h[1], h[0])), Math.cos(a - Math.atan2(h[1], h[0])))) * 0.35 + rnd(0, 1) - (ang == null ? 0 : Math.hypot(tx - ax, tz - az) * 0.16);
        if (sc > bs) { bs = sc; best = [tx, tz]; }
      }
      if (!best) best = w.random(rnd); return best;
    };
    const sch = [], lead = [];
    for (let i = 0; i < nS; i++) { const sc = B.schools[i] || (B.schools[i] = { wp: null, rest: 0 }); sch.push(sc); lead.push(null); }
    for (const f of koi) if (f.sch >= 0 && !lead[f.sch]) lead[f.sch] = f;
    const lookahead = bl * 3.2, ahead = (x, z, hx, hz) => dep(x + hx * lookahead, z + hz * lookahead);
    for (const f of koi) {
      if (f.alarm > 0.25 || f.dashT > 0 || f.riseT > 0) { f.steer = null; f._hx = null; continue; }
      const [x, z] = pos(f), h = heading(f); let tx, tz, spd = 0.7 * f.pace;
      const lf = f.sch >= 0 ? lead[f.sch] : f, sc = f.sch >= 0 ? sch[f.sch] : (f.solo || (f.solo = { wp: null, rest: 0 }));
      if (lf === f) {   // a leader (or a koi on its own): go to a place, ease in, rest, choose the next on a gentle turn
        if (sc.rest > 0) { sc.rest -= dt; tx = x + h[0] * 2; tz = z + h[1] * 2; spd = 0.22; }
        else {
          if (!sc.wp || Math.hypot(sc.wp[0] - x, sc.wp[1] - z) < bl * 2.2 || (sc.age = (sc.age || 0) + dt) > 22) { if (sc.wp && rnd() < 0.4) sc.rest = rnd(2.5, 6); sc.wp = pick(x, z, h, w.r * (f.sch >= 0 ? 0.9 : 0.6), f.sch >= 0 ? f.sch : null); sc.age = 0; }
          tx = sc.wp[0]; tz = sc.wp[1]; const d = Math.hypot(tx - x, tz - z); spd = clamp(d / (bl * 5), 0.4, 0.78) * f.pace * (0.9 + 0.1 * Math.sin(B.t * 0.7 + f.lag * 6));
        }
      } else {   // a follower: its place behind and beside the leader, and the leader's speed (a little faster when behind it)
        const lh = heading(lf), [lx, lz] = pos(lf), back = f.slot[0] * bl, side = f.slot[1] * bl * (1 + 0.25 * Math.sin(B.t * 0.5 + f.lag * 6));
        tx = lx - lh[0] * back - lh[1] * side; tz = lz - lh[1] * back + lh[0] * side; const d = Math.hypot(tx - x, tz - z); spd = clamp(0.5 + d / (bl * 3.5), 0.35, 1.05) * f.pace;
      }
      // food: a koi near some of it goes for the nearest piece, and slows to feed
      if (o.food && o.food.length) { let bd = bl * 9, bq = null; for (const q of o.food) { if (q.y > (o.foodLevel ?? 0) + 0.05) continue; const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; bq = q; } } if (bq) { tx = bq.x; tz = bq.z; spd = bd < bl * 1.2 ? 0.3 : 1.0; } }
      let dx = tx - x, dz = tz - z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      // the shallows ahead: turn to the deepest way out, harder the shallower it gets
      const dA = ahead(x, z, h[0], h[1]), need = clamp((0.5 - dA) / 0.4, 0, 1) + (wet(x + h[0] * lookahead, z + h[1] * lookahead, 0.3) ? 0 : 0.6);
      if (need > 0) {
        let bx = 0, bz = 0, bdp = -1e9;
        for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, cx = Math.cos(a), cz = Math.sin(a), dd = dep(x + cx * lookahead, z + cz * lookahead) + (cx * h[0] + cz * h[1]) * 0.15; if (dd > bdp) { bdp = dd; bx = cx; bz = cz; } }
        dx = dx * (1 - Math.min(1, need)) + bx * Math.min(1, need) * 1.4; dz = dz * (1 - Math.min(1, need)) + bz * Math.min(1, need) * 1.4;
        const l2 = Math.hypot(dx, dz) || 1; dx /= l2; dz /= l2; spd = Math.max(spd, 0.5);
      }
      if (o.ease) head(f, dx, dz, spd * gain, dt, o.ease); else f.steer = { x: dx * spd * gain, y: dz * spd * gain, keep: true };
      // depth: each koi drifts to its own layer, slowly (a rise or a dive in progress is left alone)
      if (!(f.riseT > 0) && o.zr) { const zt = 0.28 + 0.22 * Math.sin(B.t * 0.09 + f.lag * 20) + (f.sch === 0 ? 0.08 : 0), zz = clamp(zt, o.zr[0], o.zr[1]), k = Math.min(1, dt * 0.25);
        if (o.setZ) o.setZ(f, zz, k); else f.z += (zz - f.z) * k; }
    }
    // a startle: one koi bolts, and the school round it takes the fright
    if ((B.startle -= dt) < 0) {
      B.startle = 14 + rnd(0, 24); const f = koi[(rnd() * koi.length) | 0], a = rnd(0, TAU), p = pos(f);
      f.alarm = 1; f.fleeX = Math.cos(a); f.fleeY = Math.sin(a); f.dashT = 0.5; f.dashAng = a; f.cool = 2;
      for (const g of koi) { if (g === f) continue; const q = pos(g); if (Math.hypot(q[0] - p[0], q[1] - p[1]) < bl * 7) { g.alarm = Math.max(g.alarm, 0.7); g.fleeX = Math.cos(a + rnd(-0.6, 0.6)); g.fleeY = Math.sin(a + rnd(-0.6, 0.6)); } }
      if (o.onStartle) o.onStartle(f);
    }
  }

  window.EcologyRoles = { loop, paths, run, rows, school, ROLES, LAYERS, zOf, head, toward, circle };
})();
