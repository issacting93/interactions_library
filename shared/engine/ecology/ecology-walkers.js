/* ecology-walkers.js: the walker engine's creatures living on an ecology tank's floor.

   The tank (EcologySim) and the walkers (CreatureBody + WorldBrain) are two engines. This puts a crew of walkers on the
   tank floor and joins the two:
     - the tank's towers and walls (sim.solids) become the walkers' world: they path round the walls, climb the towers,
       and a leaper waits up one and jumps at what swims past;
     - each walker stands in the tank as a hidden guest of an ecology species (EcologySim.add), so the tank's hunters
       hunt it, hold it (it is carried in their jaws) and eat it, by the tank's own rules;
     - a walker that catches a tank creature holds it through its guest (EcologySim.grab), so the tank runs the struggle.
   The host page draws them: lines(host) gives every walker as line segments in tank space.

     const host = EcologyWalkers.create({ sim, parts, KitLook, ks?, cast? })
        parts: PartLib.load() result. KitLook: the class from motion/looks.js. ks: walker units per tank unit (0.027).
        cast: [[planKey, count, label, [r, g, b], guestSpeciesKey], ...]
     EcologyWalkers.layout(host, { tw, th, td, seed })   after the tank's size or its solids change: rebuilds the world and the crew
     EcologyWalkers.step(host, dt, stepSim)              one tick; stepSim() runs the tank's own step in the middle
     EcologyWalkers.lines(host) -> { data: Float32Array of x, y, z, 1 per vertex (tank space), batches: [{ start, count, color }] }
     EcologyWalkers.clear(host)                          takes the crew out of the tank
     host.crew [{ key, name, body, brain, guest }], host.tally { caught, eaten, escaped, events }

   Classic script -> window.EcologyWalkers. Needs SpeciesRig, CreatureBody, WorldGen, WorldBrain, Surface, Skeleton, EcologySim. */
(function () {
  "use strict";
  const FLOOR = 0.97;
  const CAST = [["strider", 6, "Strider", [0.93, 0.91, 0.87], "carapace-strider"], ["pincer", 3, "Pincer", [1, 0.54, 0.24], "pincer"],
    ["lancer", 2, "Lancer", [0.66, 0.55, 1], "strike-lance"], ["centiwyrm", 2, "Centiwyrm", [0.36, 0.89, 0.6], "pearl-chasing-centiwyrm"]];
  // KitLook only needs somewhere to keep its vertex arrays and matrices: these stand in for three.js, and nothing is rendered by it
  class Attr { constructor(a, n) { this.array = a instanceof Float32Array ? a : new Float32Array(a); this.itemSize = n; this.count = this.array.length / n; this.needsUpdate = false; } }
  const T = {
    LineBasicMaterial: class { constructor(o) { Object.assign(this, o); } dispose() {} },
    BufferGeometry: class { constructor() { this.attributes = {}; this.drawRange = { start: 0, count: Infinity }; } setAttribute(n, a) { this.attributes[n] = a; return this; } setDrawRange(s, c) { this.drawRange = { start: s, count: c }; } dispose() {} },
    Float32BufferAttribute: Attr, BufferAttribute: Attr,
    Group: class { constructor() { this.children = []; this.matrix = { elements: new Float32Array(16), fromArray(a) { this.elements.set(a); return this; } }; } add(c) { this.children.push(c); } traverse(f) { f(this); for (const c of this.children) f(c); } },
    LineSegments: class { constructor(g, m) { this.geometry = g; this.material = m; } traverse(f) { f(this); } },
  };
  const NOWHERE = { add() {}, remove() {} };
  // a body piece's drawing is far finer than a tank pixel: runs of joined segments are merged until each is at least `min` long.
  // A closed shape smaller than `min` across collapses to nothing, so a view closer than the tank's must pass a smaller `min` (host.thin, maw.thin)
  function thin(P, min) {
    const out = []; let i = 0;
    while (i < P.length) {
      const ax = P[i], ay = P[i + 1], az = P[i + 2]; let bx = P[i + 3], by = P[i + 4], bz = P[i + 5]; i += 6;
      // the point of the run farthest from its start: a small closed shape (a dot, a bolt) ends where it began, so its chord would be nothing;
      // it is drawn as a stroke across itself instead, and stays a mark
      let fx = bx, fy = by, fz = bz, fd = Math.hypot(bx - ax, by - ay, bz - az);
      while (i < P.length && P[i] === bx && P[i + 1] === by && P[i + 2] === bz && Math.hypot(bx - ax, by - ay, bz - az) < min) { bx = P[i + 3]; by = P[i + 4]; bz = P[i + 5]; i += 6;
        const d = Math.hypot(bx - ax, by - ay, bz - az); if (d > fd) { fd = d; fx = bx; fy = by; fz = bz; } }
      if (Math.hypot(bx - ax, by - ay, bz - az) < fd * 0.5) out.push(ax, ay, az, fx, fy, fz); else out.push(ax, ay, az, bx, by, bz);
    }
    return new Float32Array(out);
  }

  function create(opts) {
    const host = { sim: opts.sim, parts: opts.parts, KitLook: opts.KitLook, steer: opts.steer !== false /* body first on level ground (see intend) */, ks: opts.ks || 0.027, cast: opts.cast || CAST, crew: [], W: null, regrow: opts.regrow || 0, thin: opts.thin ?? 0.025,   // thin: the shortest line kept as its own segment, in walker units. 0.025 suits the tank's distance; a close view passes less
     
      tally: { caught: 0, eaten: 0, escaped: 0, events: [] }, tw: 0, th: 0, td: 0, buf: new Float32Array(4096), batches: [], on: true };
    return host;
  }
  // tank <-> walker space. Walker x, z lie on the tank floor; walker y is height off it (tank depth runs the other way).
  const toTank = (h, x, y, z, out) => { out.x = x / h.ks + h.tw / 2; out.y = z / h.ks + h.th / 2; out.z = FLOOR * h.td - y / h.ks; return out; };
  const fishPos = (h, f, out) => { out.x = (f.x - h.tw / 2) * h.ks; out.y = (FLOOR - f.z) * h.td * h.ks; out.z = (f.y - h.th / 2) * h.ks; return out; };

  function clear(host) {
    for (const c of host.crew) { if (c.guest && !c.guest.dead) { c.guest.dead = true; c.guest.noRespawn = true; if (c.guest.caught) { c.guest.caught.holding = null; c.guest.caught = null; } if (c.guest.holding) { c.guest.holding.caught = null; c.guest.holding = null; } } c.look.dispose(); }
    host.crew = []; host.batches = [];
  }
  // a walker's place in the food web is the body it walks on: its guest carries that length (f.len), not its species' drawn one
  function spineLen(host, c) { const b = c.body; let L = 0; for (let i = 1; i < b.chunks.length; i++) { const a = b.chunks[i - 1].p, q = b.chunks[i].p; L += Math.hypot(a.x - q.x, a.y - q.y, a.z - q.z); } return L / host.ks / (host.sim.cfg.size || 75); }
  function addGuest(host, c) { c.guest = window.EcologySim.add(host.sim, c.guestKey); if (c.guest) { c.guest.hidden = true; c.guest.crew = c; if (c.len == null) c.len = spineLen(host, c); if (c.len > 0) c.guest.len = c.len; } c.skyBy = null; }   // .crew: it is a walker of the floor crew (the Maw may eat it)

  function layout(host, o) {
    clear(host);
    host.tw = o.tw; host.th = o.th; host.td = o.td;
    const ks = host.ks, sim = host.sim, hgt = (zTop) => Math.max(0.6, (FLOOR - zTop) * o.td * ks);
    const towers = [], walls = [];
    for (const so of sim.solids) {
      if (so.x1 == null) towers.push({ x: (so.x - o.tw / 2) * ks, z: (so.y - o.th / 2) * ks, r: so.r * ks, h: hgt(so.zTop) });
      else walls.push({ x0: (so.x0 - o.tw / 2) * ks, z0: (so.y0 - o.th / 2) * ks, x1: (so.x1 - o.tw / 2) * ks, z1: (so.y1 - o.th / 2) * ks, t: so.r * ks, h: hgt(so.zTop) });
    }
    const W = (host.W = window.WorldGen.generate(o.seed || 1, { layout: { towers, walls, half: [o.tw / 2 * ks, o.th / 2 * ks] }, cell: 1 }));
    const _o = { x: 0, y: 0, z: 0 }, _s = { x: 0, y: 0, z: 0 };
    // what a walker's brain sees of the tank: prey it can fly down or leap at, held through its guest
    // the food web, for the brains: is that walker food for this one, by the bodies they walk on (EcoCore.Web through the diet)
    W.web = { eats: (a, o) => { const fa = a.member && a.member.guest, fo = o.member && o.member.guest; return !!(fa && fo && sim.web && sim.web.eats(fa, fo)); } };
    W.sky = {
      // by: the brain asking. With the web on, what it takes from the sky is what its body can eat; without, anything up to maxLen long
      nearest(x, y, z, R, maxLen, airOnly, by) { const me = by && by.member && by.member.guest, web = me && sim.web ? sim.web : null; let best = null, bd = R; for (const f of sim.fish) { if (f.dead || f.guest || f.caught || f.fade < 0.9 || (airOnly && f.z > 0.88) || (web && web.on() ? !web.eats(me, f) : window.EcologySim.bodyLen(sim, f) * ks > maxLen)) continue; fishPos(host, f, _s); const d = Math.hypot(_s.x - x, _s.y - y, _s.z - z); if (d < bd) { bd = d; best = f; } } return best; },
      alive: (f) => !f.dead && !f.caught && sim.fish.includes(f), pos: (f) => fishPos(host, f, _o), name: (f) => sim.speciesRT[f.sp].name,
      take: (f, b) => { const g = b.member && b.member.guest; return !!g && window.EcologySim.grab(sim, g, f); },
      held: (f, b) => { const g = b.member && b.member.guest; return g && f.caught === g ? "held" : f.dead || !sim.fish.includes(f) ? "eaten" : "escaped"; },
    };
    if (!host.on) return;
    const rand = window.WorldGen.rng((o.seed || 1) * 77 + 5);
    for (const [key, n, label, color, guestKey] of host.cast) for (let i = 0; i < n; i++) {
      const def = key === "quad" ? window.SpeciesRig.quad(host.parts, { segmented: true }) : window.SpeciesRig.def(window.SpeciesRig.PLANS[key], host.parts), S = { speed: 1, stride: 1, lift: 1, height: 1, gait: "alt" };
      let at = W.nav.random(rand);
      if (key === "centiwyrm" && W.towers.length) { const dT = (q) => Math.min(...W.towers.map((t) => Math.hypot(q[0] - t.x, q[1] - t.z))); for (let k = 0; k < 30; k++) { const q = W.nav.random(rand); if (dT(q) < dT(at)) at = q; } }
      const climbs = key !== "strider" && key !== "quad", body = new window.CreatureBody(def, { H: W.H, S, surface: W.surface, ceil: W.ceil, climb: climbs, belly: key === "centiwyrm", start: { x: at[0], z: at[1] }, yaw: rand() * 6.28 });
      const look = new host.KitLook(T, NOWHERE, def, body.skel, {}); look.update(body.skel);
      look.thin = look.groups.map((grp) => thin(grp.children[0].geometry.attributes.position.array, host.thin));   // fine enough that the drawings keep their curves (0.09 turned them into polygons)
      const brain = window.WorldBrain.create(body, key, { W, rand, name: label + " " + (i + 1) }); brain.baseS = key === "centiwyrm" ? 2 : 1.4;
      const c = { key, name: label + " " + (i + 1), color, guestKey, body, brain, look, def, guest: null, skyBy: null }; brain.member = c; host.crew.push(c); addGuest(host, c);
    }
  }

  const _q = { x: 0, y: 0, z: 0 };
  function pin(host, dt) {
    const K = window.EcologySim.K;
    for (const c of host.crew) { const g = c.guest; if (!g) continue; const h = c.body.head().p;
      if (g.caught) {   // a tank hunter has it: the walker goes where its jaws go, lifted toward the hunter's depth
        g.z += (g.caught.z - g.z) * Math.min(1, dt * 1.5); fishPos(host, g, _q); const dx = _q.x - h.x, dy = _q.y - h.y, dz = _q.z - h.z;
        for (const ch of c.body.chunks) { ch.p.x += dx; ch.p.y += dy; ch.p.z += dz; ch.prev.x += dx; ch.prev.y += dy; ch.prev.z += dz; }
        continue; }
      toTank(host, h.x, h.y, h.z, _q); g.x = _q.x; g.y = _q.y; g.z = Math.max(0.02, Math.min(FLOOR, _q.z / host.td)); g.vx = g.vy = 0; g.fade = 1;
      if (g.chain) for (let k = 0; k < K; k++) { g.chain[k * 2] = g.x; g.chain[k * 2 + 1] = g.y; if (g.cz) g.cz[k] = g.z * host.td; }   // so the tank's HUD boxes it where the walker is
      if (g.holding) g.holding.z = g.z; else { g.full = 5; g.target = null; }   // it hunts only when its walker does
    }
  }
  function meet(host) {
    const sim = host.sim, t = host.tally, ev = (kind, a, b) => { t.events.push({ kind, a, b, t: performance.now() }); if (t.events.length > 40) t.events.shift(); };
    for (const c of host.crew) { const g = c.guest; if (!g) continue;
      if (g.dead || !sim.fish.includes(g)) {   // the tank ate it
        t.eaten++; ev("eaten", c.name, c.skyBy ? sim.speciesRT[c.skyBy.sp].name : "the tank"); c.brain.skyHeld = false;
        if (host.regrow > 0) { c.guest = null; c.away = host.regrow; continue; }   // gone for a while: an eaten walker is not food again at once
        window.WorldBrain.respawn(c.brain, null); c.brain.state = "wander"; c.brain.path = []; addGuest(host, c); continue; }
      const by = g.caught || null;
      if (by && !c.skyBy) { t.caught++; ev("caught", c.name, sim.speciesRT[by.sp].name); }
      if (!by && c.skyBy) { t.escaped++; ev("escaped", c.name, sim.speciesRT[c.skyBy.sp].name); }
      c.skyBy = by; c.brain.skyHeld = !!by; }
  }
  // a tick of the walkers is two halves round the tank's step: before (their brains decide, their bodies move) and after (the guests are pinned
  // to the bodies, the tank's meetings are read back, the drawings follow). step() runs both round stepSim(); a schedule runs them as systems.
  // Intent: what a walker's mind wants of its body this step, as a velocity (the same record the Maw's hand or autopilot writes: guest.intent,
  // { x, z, act }). On level ground the body is sent at it first and the feet step after (CreatureBody.steer), as the Maw is: STEER.hand is how
  // much of each piece's drive that takes from head to tail, STEER.grip the least a piece counts as gripping while its feet are in the air.
  // Climbing, flying, swimming or held, the body keeps its own way of getting to its target, and the intent is only recorded.
  const STEER = { hand: [1, 0.6], grip: 0.7 };
  function intend(host, c) {
    const b = c.body, hc = b.chunks[0], t = b.target, D = b.def, S = b.S, it = c.intent || (c.intent = { x: 0, z: 0, act: "" });
    const dx = t.x - hc.p.x, dz = t.z - hc.p.z, dist = Math.hypot(dx, dz), v = dist > D.stride * 0.9 ? D.speed * S.speed * Math.min(1, dist / (D.stride * 3)) : 0;
    it.x = dist > 1e-6 ? dx / dist * v : 0; it.z = dist > 1e-6 ? dz / dist * v : 0; it.act = c.brain.state; if (c.guest) c.guest.intent = it;
    const br = c.brain, level = b.mode === "walk" && hc.n.y > 0.8 && Math.abs(t.y - hc.p.y) < 1.2 * (b.len0 || 1) && !br.holder && !br.held && !br.skyHeld && !br.skyHold && br.state !== "leap" && br.state !== "caught";
    if (!host.steer || !level) { b.steer = null; return; }
    const st = c._steer || (c._steer = { x: 0, y: 0, z: 0, k: [], grip: STEER.grip }), N = b.chunks.length; st.x = it.x; st.z = it.z;
    for (let i = 0; i < N; i++) st.k[i] = STEER.hand[0] + (STEER.hand[1] - STEER.hand[0]) * i / Math.max(1, N - 1); st.k.length = N; b.steer = st;
  }
  function before(host, dt) {
    if (!host.W || !host.crew.length) return;
    for (const c of host.crew) if (c.away > 0 && (c.away -= dt) <= 0) { c.away = 0; window.WorldBrain.respawn(c.brain, null); c.brain.state = "wander"; c.brain.path = []; addGuest(host, c); }
    const brains = host.crew.map((c) => c.brain);
    window.WorldBrain.step(brains, dt, host.tally);
    for (const c of host.crew) intend(host, c);
    for (const c of host.crew) c.body.step(dt);
    window.WorldBrain.after(brains, dt, host.tally);
    pin(host, dt);
  }
  function after(host, dt) {
    if (!host.W || !host.crew.length) return;
    meet(host); pin(host, 0);
    for (const c of host.crew) c.look.update(c.body.skel);
  }
  function step(host, dt, stepSim) { before(host, dt); stepSim(); after(host, dt); }

  // the ground as a grid of lines in tank space, following the terrain's height (square cells, `cells` across the short side); built once a layout
  function ground(host, cells, color) {
    const W = host.W; if (!W) return null; if (host.grid && host.grid.W === W && host.grid.cells === cells) return host.grid.L;
    const ks = host.ks, tw2 = host.tw / 2, th2 = host.th / 2, fz = FLOOR * host.td, X = tw2 * ks, Z = th2 * ks, step = (2 * Math.min(X, Z)) / (cells || 16), sub = step / 4, out = [];
    const put = (x, z) => out.push(x / ks + tw2, z / ks + th2, fz - W.H(x, z) / ks, 1);
    const nx = Math.floor(X / step), nz = Math.floor(Z / step);
    for (let i = -nx; i <= nx; i++) for (let z = -nz * step; z < nz * step - 1e-6; z += sub) { put(i * step, z); put(i * step, z + sub); }
    for (let j = -nz; j <= nz; j++) for (let x = -nx * step; x < nx * step - 1e-6; x += sub) { put(x, j * step); put(x + sub, j * step); }
    const L = { data: new Float32Array(out), verts: out.length / 4, batches: [{ start: 0, count: out.length / 4, color: color || [0.93, 0.91, 0.87] }] };
    host.grid = { W, cells, L }; return L;
  }
  // every walker as line segments in tank space, one batch per colour
  function lines(host) {
    let n = 0; for (const c of host.crew) { for (const a of c.look.thin) n += a.length / 3; n += Math.min(c.look.limbs.geometry.drawRange.count, c.look.pos.length / 3); }
    if (host.buf.length < n * 4) host.buf = new Float32Array(Math.ceil(n * 4 * 1.3));
    const B = host.buf, ks = host.ks, tw2 = host.tw / 2, th2 = host.th / 2, fz = FLOOR * host.td; let o = 0; host.batches.length = 0;
    const put = (x, y, z) => { B[o++] = x / ks + tw2; B[o++] = z / ks + th2; B[o++] = fz - y / ks; B[o++] = 1; };
    for (const c of host.crew) {
      if (c.away > 0) continue;   // eaten, not back yet
      const start = o / 4, L = c.look;
      for (let gi = 0; gi < L.groups.length; gi++) { const m = L.groups[gi].matrix.elements, P = L.thin[gi];
        for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; put(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); } }
      const P = L.pos, cnt = Math.min(L.limbs.geometry.drawRange.count, P.length / 3); for (let i = 0; i < cnt * 3; i += 3) put(P[i], P[i + 1], P[i + 2]);
      const last = host.batches[host.batches.length - 1];
      if (last && last.color === c.color) last.count = o / 4 - last.start; else host.batches.push({ start, count: o / 4 - start, color: c.color });
    }
    return { data: B, verts: o / 4, batches: host.batches };
  }

  // ---- a body made solid: a walker's, or the Maw's ----
  // Each body piece's parts are made solid once (PartSolid, rounded as a belly), in the piece's own frame, and placed point by point
  // the way its line art is (KitLook's mapPart: the same sheet-to-piece mapping, with the arch over a centre part, a dome, or the rise of
  // a side part toward its tip). A part drawn on one side and mirrored is solid on both sides. Upright parts and legs stay line art.
  // Needs window.PartSolid and Delaunator; without them there is no solid. def: { segs: [{ parts, h }] }
  function mapPt(e, sx, sy, mirror) {   // looks.js mapPart, kept the same
    const k = e.k * (e.s || 1), cx = e.cx || 200, x = (cx - sx) * k * (mirror ? -1 : 1), z = (e.z || 0) + (e.cy - sy) * k; let y = e.y || 0;
    if (e.dome) { const R = e.dome.R, r = Math.hypot(sx - e.dome.c[0], sy - e.dome.c[1]) / R; y += r < 1 ? R * k * e.dome.hf * Math.sqrt(1 - r * r) : (r - 1) * R * k * 0.55; }
    else if (e.lift) y += e.lift(sx, sy);
    else if (e.arch) { const u = (sx - cx) / e.arch.hw; y += e.arch.h * Math.max(0, 1 - u * u); }
    return [x, y, z];
  }
  function solidDef(def, opts = {}) {
    const PS = window.PartSolid; if (!PS || !window.Delaunator || !def) return null;
    let parts = 0, made = 0; const cap = (opts.cap ?? 0.45) * ((def.segs[0] && def.segs[0].h) || 0.4), cache = new Map();   // no piece stands taller off its plane than cap: a wide shell would dome as high as it is wide
    const segs = def.segs.map((sd) => { const pos = [], nrm = [], idx = [];
      for (const e of sd.parts || []) { if (!e.polys || e.upright) continue; parts++;
        let so = cache.get(e.polys); if (so === undefined) { so = null; try { const part = PS.read(e.polys, { join: e.polys.length <= 240 }); if (part.outer.length) so = PS.build(part, { mode: "belly", thick: 0.6, inner: 0.2, crease: 0.3, edge: 0.05, res: 40 }); } catch (err) { so = null; } cache.set(e.polys, so); }
        if (!so) continue; made++;
        const k = e.k * (e.s || 1), P = so.positions, I = so.indices, n = P.length / 3;
        let zm = 0; for (let i = 2; i < P.length; i += 3) zm = Math.max(zm, Math.abs(P[i])); const zk = zm * k > cap ? cap / (zm * k) : 1;
        for (const m of e.mirror ? [false, true] : [false]) { const base = pos.length / 3, L = new Float32Array(n * 3), N = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { const q = mapPt(e, so.cx + P[i * 3], so.cy - P[i * 3 + 1], m); L[i * 3] = q[0]; L[i * 3 + 1] = q[1] + P[i * 3 + 2] * k * zk; L[i * 3 + 2] = q[2]; }
          for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3, ux = L[b] - L[a], uy = L[b + 1] - L[a + 1], uz = L[b + 2] - L[a + 2], vx = L[d] - L[a], vy = L[d + 1] - L[a + 1], vz = L[d + 2] - L[a + 2];
            const qx = uy * vz - uz * vy, qy = uz * vx - ux * vz, qz = ux * vy - uy * vx; for (const i of [a, b, d]) { N[i] += qx; N[i + 1] += qy; N[i + 2] += qz; } }
          for (let i = 0; i < n; i++) { let ax = N[i * 3], ay = N[i * 3 + 1], az = N[i * 3 + 2]; const l = Math.hypot(ax, ay, az) || 1; if (ay * P[i * 3 + 2] < 0) { ax = -ax; ay = -ay; az = -az; } nrm.push(ax / l, ay / l, az / l); pos.push(L[i * 3], L[i * 3 + 1], L[i * 3 + 2]); }
          for (let t = 0; t < I.length; t++) idx.push(I[t] + base); } }
      return pos.length ? { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) } : null; });
    return { segs, parts, made, tris: segs.reduce((n, m) => n + (m ? m.idx.length / 3 : 0), 0) };
  }
  function solidOf(c) { if (c.solid !== undefined) return c.solid; return (c.solid = c.def ? solidDef(c.def) : null); }
  /** what EcologyRender.solids draws: each live walker's body pieces with where they stand, and how walker space maps into the tank */
  function solids(host) {
    const list = []; for (const c of host.crew) { if (c.away > 0) continue; const S = solidOf(c); if (!S) continue; S.segs.forEach((m, gi) => { if (m && c.look.groups[gi]) list.push({ mesh: m, matrix: c.look.groups[gi].matrix.elements, color: c.color }); }); }
    return { list, ks: host.ks, tw2: host.tw / 2, th2: host.th / 2, fz: FLOOR * host.td };
  }
  window.EcologyWalkers = { create, layout, step, before, after, lines, solids, solidOf, solidDef, ground, clear, CAST, kit: { T, NOWHERE, thin } };
})();
