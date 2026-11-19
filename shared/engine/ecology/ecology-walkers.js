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
    const host = { sim: opts.sim, parts: opts.parts, KitLook: opts.KitLook, ks: opts.ks || 0.027, cast: opts.cast || CAST, crew: [], W: null, thin: opts.thin ?? 0.025,   // thin: the shortest line kept as its own segment, in walker units. 0.025 suits the tank's distance; a close view passes less
     
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
  function addGuest(host, c) { c.guest = window.EcologySim.add(host.sim, c.guestKey); if (c.guest) { c.guest.hidden = true; c.guest.crew = c; } c.skyBy = null; }   // .crew: it is a walker of the floor crew (the Maw may eat it)

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
    W.sky = {
      nearest(x, y, z, R, maxLen, airOnly) { let best = null, bd = R; for (const f of sim.fish) { if (f.dead || f.guest || f.caught || f.fade < 0.9 || (airOnly && f.z > 0.88) || window.EcologySim.bodyLen(sim, f) * ks > maxLen) continue; fishPos(host, f, _s); const d = Math.hypot(_s.x - x, _s.y - y, _s.z - z); if (d < bd) { bd = d; best = f; } } return best; },
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
      const c = { key, name: label + " " + (i + 1), color, guestKey, body, brain, look, guest: null, skyBy: null }; brain.member = c; host.crew.push(c); addGuest(host, c);
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
        window.WorldBrain.respawn(c.brain, null); c.brain.state = "wander"; c.brain.path = []; addGuest(host, c); continue; }
      const by = g.caught || null;
      if (by && !c.skyBy) { t.caught++; ev("caught", c.name, sim.speciesRT[by.sp].name); }
      if (!by && c.skyBy) { t.escaped++; ev("escaped", c.name, sim.speciesRT[c.skyBy.sp].name); }
      c.skyBy = by; c.brain.skyHeld = !!by; }
  }
  // a tick of the walkers is two halves round the tank's step: before (their brains decide, their bodies move) and after (the guests are pinned
  // to the bodies, the tank's meetings are read back, the drawings follow). step() runs both round stepSim(); a schedule runs them as systems.
  function before(host, dt) {
    if (!host.W || !host.crew.length) return;
    const brains = host.crew.map((c) => c.brain);
    window.WorldBrain.step(brains, dt, host.tally);
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
      const start = o / 4, L = c.look;
      for (let gi = 0; gi < L.groups.length; gi++) { const m = L.groups[gi].matrix.elements, P = L.thin[gi];
        for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; put(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); } }
      const P = L.pos, cnt = Math.min(L.limbs.geometry.drawRange.count, P.length / 3); for (let i = 0; i < cnt * 3; i += 3) put(P[i], P[i + 1], P[i + 2]);
      const last = host.batches[host.batches.length - 1];
      if (last && last.color === c.color) last.count = o / 4 - last.start; else host.batches.push({ start, count: o / 4 - start, color: c.color });
    }
    return { data: B, verts: o / 4, batches: host.batches };
  }

  window.EcologyWalkers = { create, layout, step, before, after, lines, ground, clear, CAST, kit: { T, NOWHERE, thin } };
})();
