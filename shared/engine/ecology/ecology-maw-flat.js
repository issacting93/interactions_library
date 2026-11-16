/* ecology-maw.js: the Maw, the creature a person plays in the ecology tank.

   A mouth on a neck. It has one ability, the lunge: hold to coil (it stops, the mouth opens, the legs stop
   stepping), release and the neck throws the head at what is in front of it, then draws it back. The body
   stays where it stands. It only eats in a lunge. What it eats it wears.

   The body is built the way Compose builds a creature: a column of flat-top hex cells, one spine cell per
   row and side cells mirrored across the spine, each cell a kit part. The base is the qilin's plan: a head
   on a neck, shoulders and a haunch with a leg pair each, a tail. A meal becomes cells:
     a flier (wing)        reach   a new neck row with the donor's largest side part; a longer neck strikes further
     a walker (leg, claw)  bulk    a new body row with the donor's parts and one more leg pair
     anything else         wide    four tusks on the mouth ring from the donor's blades; the mouth opens wider
   Three of each; after that the oldest row of that kind is re-dressed from the new donor.

   In the tank the Maw rides a host creature of the simulation (a Pincer Crawler by default), which is hidden.
   The host carries the rules: it is steered, hunted, fed and starved by EcologySim and EcologyDiet as any
   creature is, except that it does not bite: the module strikes with the head, and what the open mouth
   meets is eaten (through the tank's own onCatch and onMeal). It also gates what the mouth can take in.

     const maw = EcologyMaw.create({ parts, sheetOf, colorOf })   parts: the kit; sheetOf(speciesName) -> kit sheet key or null;
                                                                  colorOf(sp) -> css colour of a species
     EcologyMaw.attach(maw, sim, diet, f)      f: the host. Wraps sim.hooks.eats and onMeal; detach(maw) undoes it
     EcologyMaw.input(maw, { hold, aim })      hold: the lunge key is down; aim: [x, y] a heading in the tank, or null
     EcologyMaw.step(maw, dt)                  after EcologySim.step and EcologyDiet.step
     EcologyMaw.draw(maw, ctx, { project, dpr, ink, depth })   project(x, y, z) -> { x, y } on screen (css px); depth: the tank's depth
     EcologyMaw.feed(maw, sp)                  as if it had eaten one of species sp (the workbench, tests)
     maw.state   walk | coil | lunge | chew | miss      maw.charge 0..1      maw.lv { reach, bulk, wide }
     maw.free    true when the host may be steered (walk)

   Lengths inside are in the Maw's own design units (a hex cell is 13); maw.sc is tank units per design unit.
   Its feet step by the shared gait rules (window.Gaits, shared/engine/motion/gaits.js), as the other walkers' do:
   on demand in two alternating sets at a walk, on the qilin's clock (trot, gallop) when it runs.
   Classic script -> window.EcologyMaw. Needs a canvas 2D context to draw; Gaits is optional. */
(function () {
  "use strict";
  const { min, max, abs, sin, cos, atan2, hypot, PI, sqrt, exp, random, floor } = Math, TAU = PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => (x < a ? a : x > b ? b : x), ease = (t) => t * t * (3 - 2 * t);
  const backOut = (t) => { const c = 1.9; t = clamp(t, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const wrap = (a) => ((a + PI) % TAU + TAU) % TAU - PI;
  const angTo = (a, b, step) => a + clamp(wrap(b - a), -step, step);
  const rgba = (col, a) => { if (col[0] !== "#") return col; const n = parseInt(col.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; };

  const S = 13, STEP = sqrt(3) * S, SIDE = 1.5 * S;       // flat-top hex: cell size, row step, column step
  const LEN0 = 6 * STEP;                                  // head to tail as built, for scaling to the host
  const LEG = { front: ["P396", "P183", 42, 52, 22], hind: ["P245", "P187", 40, 54, -22], extra: ["P245", "P187", 38, 50, 0] };   // thigh, shin, their lengths, how far forward the foot rests
  // strike: how far the neck throws the head, in neck lengths, at no charge and added at full charge; out, back: seconds to throw and to draw back
  const RULES = { coil: 0.85, minCharge: 0.16, strike: [1.3, 1.7], out: 0.13, hold: 0.05, back: 0.3, cone: 0.6, assist: 0.35, miss: 0.5, cost: [0.6, 0.8], gate: 1.6, upkeep: 0.1, max: 3 };

  // ---- kit parts: a Path2D, and the long axis with the thick end (the root) first ----
  function prep(p) {
    const path = new Path2D(), pts = [], ox = +p.ox, oy = +p.oy;
    for (const m of String(p.svg).matchAll(/\sd="([^"]+)"/g)) {
      try { path.addPath(new Path2D(m[1])); } catch (e) { continue; }
      const n = m[1].replace(/[Aa][^A-Za-z]*/g, " ").match(/-?\d*\.?\d+(?:e-?\d+)?/g) || [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([+n[i] - ox, +n[i + 1] - oy]);
    }
    const st = max(1, floor(pts.length / 200)), sm = pts.filter((_, i) => i % st === 0);
    let a = [0, -p.h / 2], b = [0, p.h / 2], best = -1;
    for (let i = 0; i < sm.length; i++) for (let j = i + 1; j < sm.length; j++) { const d = (sm[i][0] - sm[j][0]) ** 2 + (sm[i][1] - sm[j][1]) ** 2; if (d > best) { best = d; a = sm[i]; b = sm[j]; } }
    const L = hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const width = (e0, e1) => { let w = 0; for (const q of pts) { const t = ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy) / L; if (t >= e0 && t <= e1) w = max(w, abs(-(q[0] - a[0]) * uy + (q[1] - a[1]) * ux)); } return w; };
    if (width(0.7, 1) > width(0, 0.3)) { const t = a; a = b; b = t; }
    return { id: p.id, path, ox, oy, w: +p.w, h: +p.h, rx: a[0], ry: a[1], tx: b[0], ty: b[1], len: L };
  }

  const row = (id, o) => Object.assign({ id, long: 0, wide: 0, r: 10, up: 16, own: null, g: 1, sides: [], legs: null }, o);
  const chunk = (r, x, y) => ({ row: r, x, y, vx: 0, vy: 0, pulse: 0, sw: 0 });

  function create(opts) {
    opts = opts || {};
    const byId = Array.isArray(opts.parts) ? Object.fromEntries(opts.parts.map((p) => [p.id, p])) : (opts.parts || {});
    const bySheet = {}; for (const id in byId) { const p = byId[id]; (bySheet[p.species] || (bySheet[p.species] = [])).push(p); }
    const maw = { byId, bySheet, cache: new Map(), sheetOf: opts.sheetOf || (() => null), colorOf: opts.colorOf || (() => "#5BE39A"),
      lattice: opts.lattice !== false, rootToTip: opts.rootToTip !== false, host: null, sim: null, diet: null, hold: false, aim: null };
    reset(maw);
    return maw;
  }
  const part = (maw, id) => { let q = maw.cache.get(id); if (!q && maw.byId[id]) { q = prep(maw.byId[id]); maw.cache.set(id, q); } return q; };

  function reset(maw) {
    const rows = [row("P277", { long: 36, r: 15, up: 27, head: true }), row("P280", { long: 27, r: 8, up: 24, neck: true }), row("P280", { long: 27, r: 8, up: 20, neck: true }),
      row("P246", { wide: 64, r: 16, legs: "front" }), row("P253", { wide: 46, r: 13 }), row("P251", { wide: 52, r: 13, legs: "hind" }), row("P276", { long: 46, r: 7, up: 9, tail: true })];
    Object.assign(maw, { ch: rows.map((r, i) => chunk(r, -i * STEP, 0)), heading: 0, m: 0.08, state: "walk", st: 0, t: 0, charge: 0, cool: 0, ext: 0, reachMax: 1, aimA: 0, pin: null, target: null, lift: 0, anchor: null, pace: 0, phase: 0, gait: null, landing: false,
      lv: { wide: 0, bulk: 0, reach: 0 }, grown: { wide: [], bulk: [], reach: [] }, teeth: [], legs: [], bolus: [], fx: [], Rmax: 50, RmaxT: 50, sc: 1, free: true, tier: null, placed: false });
    // twelve teeth, one on every 30 degree ray of the lattice
    for (let i = 0; i < 12; i++) { const big = i % 2 === 0; maw.teeth.push({ a: i / 12 * TAU + PI / 12, id: big ? (i % 4 === 0 ? "P258" : "P032") : "P244", len: big ? (i % 4 === 0 ? 32 : 28) : 16, own: null, grow: 1, flip: i >= 6 }); }
    for (const c of maw.ch) if (c.row.legs) addLegs(maw, c, true);
  }
  const rad = (c) => c.row.r * c.row.g * (1 + 0.07 * c.pulse) + (c.sw || 0);
  function cellFrame(maw, i) {
    const c = maw.ch, q = c[i]; let fx, fy;
    if (i === 0) { fx = cos(maw.heading); fy = sin(maw.heading); }
    else { fx = c[i - 1].x - q.x; fy = c[i - 1].y - q.y; const d = hypot(fx, fy) || 1; fx /= d; fy /= d; }
    return { x: q.x, y: q.y, fx, fy, rx: -fy, ry: fx, a: atan2(fy, fx), g: q.row.g };
  }
  function addLegs(maw, c, full) {
    for (const s of [-1, 1]) maw.legs.push({ ch: c, s, kind: c.row.legs, fx: 0, fy: 0, step: -1, lift: 0, fromx: 0, fromy: 0, init: false, grow: full ? 1 : 0 });
    maw.legs.sort((a, b) => maw.ch.indexOf(a.ch) - maw.ch.indexOf(b.ch)); maw.legs.forEach((l, k) => { l.j = k >> 1; });
  }
  function legRest(maw, l) {
    const f = cellFrame(maw, maw.ch.indexOf(l.ch)), K = LEG[l.kind], reach = 60;
    return { hx: f.x + f.rx * l.s * SIDE * 0.8 - f.fx * STEP * 0.2, hy: f.y + f.ry * l.s * SIDE * 0.8 - f.fy * STEP * 0.2,
      x: f.x + f.rx * l.s * (SIDE + reach) + f.fx * K[4], y: f.y + f.ry * l.s * (SIDE + reach) + f.fy * K[4], f };
  }
  function insertRow(maw, at, r) {
    const c = maw.ch, a = c[at - 1], b = c[at] || a; r.g = 0.05;
    const q = chunk(r, (a.x + b.x) / 2, (a.y + b.y) / 2); c.splice(at, 0, q); if (r.legs) addLegs(maw, q, false); return q;
  }
  function removeRow(maw, q) { const i = maw.ch.indexOf(q); if (i > 0) { maw.ch.splice(i, 1); maw.legs = maw.legs.filter((l) => l.ch !== q); maw.legs.forEach((l, k) => { l.j = k >> 1; }); } }
  function mouthGeo(maw) {
    const h = maw.ch[0], e = ease(clamp(maw.m, 0, 1)), R = lerp(rad(h) * 0.8, maw.Rmax, e), Ra = R * lerp(0.1, 0.66, e);
    const fx = cos(maw.heading), fy = sin(maw.heading), d = rad(h) * 1.05 + Ra * 0.9;
    return { x: h.x + fx * d, y: h.y + fy * d, R, Ra, fx, fy, rx: -fy, ry: fx, e };
  }

  // ---- what a meal gives: the donor's own parts, chosen by shape ----
  // from one kit sheet: a mid-sized centre part for a spine cell, the longest side part for the side cells, the slimmest long ones for teeth
  function donorParts(maw, sheet) {
    const list = (sheet && maw.bySheet[sheet] || []).filter((p) => String(p.svg).length < 12000 && min(+p.w, +p.h) > 4 && max(+p.w, +p.h) > 14);
    const isC = (p) => p.side === "center" || p.side === "c", centre = list.filter(isC), side = list.filter((p) => !isC(p));
    const spine = centre.slice().sort((a, b) => abs(max(+a.w, +a.h) - 46) - abs(max(+b.w, +b.h) - 46))[0];
    const long = side.map((p) => part(maw, p.id)).filter(Boolean).sort((a, b) => b.len - a.len);
    const slim = long.slice().sort((a, b) => (b.len * b.len) / (b.w * b.h) - (a.len * a.len) / (a.w * a.h));
    return { spine: spine ? spine.id : null, side: long[0] ? long[0].id : null, side2: long[1] ? long[1].id : null, tooth: slim[0] ? slim[0].id : null };
  }
  const kindOf = (move) => (move === "wing" ? "reach" : move === "leg" || move === "claw" ? "bulk" : "wide");
  const LABEL = { reach: "a longer neck", bulk: "a body row and two legs", wide: "tusks" };
  function give(maw, kind, don) {
    const lv = maw.lv, c = maw.ch, col = don.col, name = don.name || "its meal";
    const side = (id, len, ang) => ({ id, len, ang, own: col, g: 0 });
    const P = donorParts(maw, don.sheet);
    const spineId = P.spine || { reach: "P594", bulk: "P259", wide: null }[kind], sideId = P.side || { reach: "P578", bulk: "P261", wide: "P028" }[kind], toothId = P.tooth || P.side || "P026";
    note(maw, "graft", "The Maw grew " + LABEL[kind] + " from " + name);
    c.forEach((q) => { q.pulse = 1; });
    if (lv[kind] >= RULES.max) {          // full: the oldest of this kind is re-dressed from the new donor
      const old = maw.grown[kind].shift(); maw.grown[kind].push(old);
      if (kind === "wide") { for (const t of old) { t.id = toothId; t.own = col; t.grow = 0.4; } }
      else { if (spineId) old.row.id = spineId; old.row.own = col; old.row.sides = sideId ? [side(sideId, old.row.sides[0] ? old.row.sides[0].len : 70, old.row.sides[0] ? old.row.sides[0].ang : 2.3)] : []; }
      return;
    }
    const n = ++lv[kind];
    if (kind === "reach") {               // a longer neck, with the donor's blades on the new row
      const at = c.findIndex((q) => q.row.legs === "front");
      const q = insertRow(maw, at, row(spineId, { wide: 38, r: 9, up: 21, own: col, neck: true, sides: sideId ? [side(sideId, [88, 66, 74][n - 1], [2.3, 1.9, 2.55][n - 1])] : [] }));
      maw.grown.reach.push(q);
    } else if (kind === "bulk") {         // one more body row: a plate, its blades, and a leg pair
      const at = c.findIndex((q) => q.row.legs === "hind");
      const q = insertRow(maw, at, row(spineId, { long: 40, r: 15, own: col, legs: "extra", sides: sideId ? [side(sideId, [66, 58, 62][n - 1], [2.5, 2.3, 2.65][n - 1])] : [] }));
      maw.grown.bulk.push(q);
    } else {                              // tusks on the odd rays of the mouth, and a wider mouth
      const set = []; for (let i = 0; i < 4; i++) { const t = { a: i / 4 * TAU + n * PI / 6 + PI / 4, id: toothId, len: 38 + 4 * n, own: col, grow: 0, flip: i >= 2 }; maw.teeth.push(t); set.push(t); }
      maw.RmaxT = 50 + 9 * n; maw.grown.wide.push(set);
      if (n === 1 && P.side2) c[0].row.sides.push(side(P.side2, 54, 1.15));
    }
  }
  // starved a tier: the newest thing it grew goes
  function shed(maw) {
    const order = ["reach", "bulk", "wide"].filter((k) => maw.lv[k] > 0); if (!order.length) return;
    const kind = order.sort((a, b) => maw.lv[b] - maw.lv[a])[0], last = maw.grown[kind].pop(); maw.lv[kind]--;
    if (kind === "wide") { maw.teeth = maw.teeth.filter((t) => !last.includes(t)); maw.RmaxT = 50 + 9 * maw.lv.wide; if (!maw.lv.wide) maw.ch[0].row.sides.length = 0; }
    else last.row.gone = true;
    note(maw, "shed", "The Maw shed " + LABEL[kind]);
  }
  function note(maw, kind, text) { const d = maw.diet; if (d && d.events) { d.events.push({ kind, f: maw.host, text, t: d.t }); if (d.events.length > 40) d.events.shift(); } }

  // ---- the host ----
  function attach(maw, sim, diet, f) {
    detach(maw); reset(maw);
    Object.assign(maw, { sim, diet, host: f, tier: f.diet ? f.diet.tier : null });
    f.hidden = true; f.maw = true;
    if (f.diet) { f.diet.gut = []; f.diet.traits = []; f.diet.offers = null; f.diet.wait = 0; }   // it starts empty: nothing eaten, nothing offered
    const H = sim.hooks, was = { eats: H.eats, onMeal: H.onMeal }; maw.was = was;
    H.eats = (a, o) => (a === maw.host ? false : was.eats ? was.eats(a, o) : undefined);   // the host does not bite: the head does (strike)
    H.onMeal = (pred, prey) => { if (was.onMeal) was.onMeal(pred, prey); if (pred === maw.host) ate(maw, prey); };
  }
  function detach(maw) {
    if (!maw.host) return; const H = maw.sim.hooks;
    if (maw.was) { H.eats = maw.was.eats; H.onMeal = maw.was.onMeal; }
    maw.host.hidden = false; maw.host.maw = false; maw.host = null; maw.was = null;
  }
  const bodyLen = (maw, f) => window.EcologySim.bodyLen(maw.sim, f);
  const fits = (maw, o) => bodyLen(maw, o) <= 2 * maw.Rmax * maw.sc * RULES.gate;
  // may the Maw eat o: the diet's rules for a creature played by hand, its host's own kind included, and only what the mouth takes in
  function edible(maw, o) {
    const f = maw.host, H = maw.sim.hooks; if (!o || o === f || o.dead || o.caught || o.guest || !o.diet) return false;
    const r = maw.was && maw.was.eats ? maw.was.eats(f, o) : true;
    if (r === false && !(o.sp === f.sp && (!H.canEat || H.canEat(f, o)))) return false;
    return fits(maw, o);
  }
  const neckLen = (maw) => STEP * maw.ch.filter((q) => q.row.neck).length;
  const reachOf = (maw, ch) => neckLen(maw) * (RULES.strike[0] + RULES.strike[1] * ch);
  // how far apart in depth two things are, in tank units (maw.TD is the tank's depth, known once it has been drawn)
  const dzOf = (maw, a, b) => abs(a - b) * (maw.TD || 0);
  function swallow(maw, o) {
    const f = maw.host, sim = maw.sim, H = sim.hooks;
    if (H.onCatch && H.onCatch(f, o) === false) return false;        // stung
    o.dead = true; if (o.holding) { o.holding.caught = null; o.holding = null; }
    f.gulp = 1; f.full = 0; f.meals = (f.meals || 0) + 1; if (sim.tally) { sim.tally[f.sp].eaten++; sim.tally[o.sp].lost++; }
    if (H.onMeal) H.onMeal(f, o);                                    // the diet's meal, then ate() below
    return true;
  }
  function ate(maw, prey) {
    const sim = maw.sim, tag = maw.diet && maw.diet.tag ? maw.diet.tag[prey.sp] : { move: "shoal" }, name = sim.speciesRT[prey.sp].name;
    maw.bolus.push({ t: 0, kind: kindOf(tag.move), don: { sheet: maw.sheetOf(name), col: maw.colorOf(prey.sp), name } });
    maw.state = "chew"; maw.st = 0;
  }
  function feed(maw, sp) { const sim = maw.sim; if (!sim) return; const tag = maw.diet && maw.diet.tag ? maw.diet.tag[sp] : { move: "shoal" }, name = sim.speciesRT[sp].name;
    maw.bolus.push({ t: 0, kind: kindOf(tag.move), don: { sheet: maw.sheetOf(name), col: maw.colorOf(sp), name } }); }
  function input(maw, i) { if (i.hold != null) maw.hold = !!i.hold; if ("aim" in i) maw.aim = i.aim && (i.aim[0] || i.aim[1]) ? i.aim : null; }

  function step(maw, dt) {
    const f = maw.host; if (!f || dt <= 0) return;
    const sim = maw.sim, diet = maw.diet, d = f.diet, c = maw.ch, h = c[0];
    if (f.dead || !sim.fish.includes(f)) { detach(maw); return; }
    maw.t += dt; if (maw.cool > 0) maw.cool -= dt;
    const maxSp = sim.cfg.size * 1.6 * sim.cfg.speed, aimA = maw.aim ? atan2(maw.aim[1], maw.aim[0]) : f.ang;
    maw.sc = bodyLen(maw, f) * 1.8 / LEN0;
    // ---- the lunge: the body holds, the neck throws the head ----
    const still = (k) => { const e = exp(-k * dt); f.vx *= e; f.vy *= e; };
    // Unless it is being sent somewhere it holds its ground exactly: the tank keeps every creature drifting, and a Maw that
    // creeps while you aim cannot be aimed. Coiled, it turns on the spot to face the aim.
    if ((maw.state === "walk" && f.steer) || f.caught) maw.anchor = null;
    else { const A = maw.anchor || (maw.anchor = { x: f.x, y: f.y, a: f.ang }); if (maw.state === "coil") A.a = angTo(A.a, aimA, 7 * dt);
      f.x = A.x; f.y = A.y; f.ang = A.a; f.vx = cos(A.a) * maxSp * 1e-3; f.vy = sin(A.a) * maxSp * 1e-3; }
    if (maw.state === "walk") {
      maw.free = true;
      let near = 1e9; const o = window.EcologySim.nearestFish(sim, f.x, f.y, bodyLen(maw, f) * 2.2, (q) => edible(maw, q)); if (o) near = hypot(o.x - f.x, o.y - f.y) / (bodyLen(maw, f) * 2.2);
      const want = 0.07 + 0.03 * sin(maw.t * 1.7) + (near < 1 ? 0.16 * (1 - near) : 0); maw.m += (want - maw.m) * min(1, 5 * dt);
      if (maw.hold && maw.cool <= 0 && !f.caught) { maw.state = "coil"; maw.charge = 0; }
    } else if (maw.state === "coil") {
      maw.free = false; f.steer = null;
      maw.charge = min(1, maw.charge + dt / RULES.coil);
      maw.m += ((0.22 + 0.5 * maw.charge) - maw.m) * min(1, 9 * dt);
      if (f.caught) maw.state = "walk";
      else if (!maw.hold) {
        if (maw.charge < RULES.minCharge) maw.state = "walk";
        else { const ch = maw.charge, reach = reachOf(maw, ch), R = (reach + maw.Rmax) * maw.sc;
          // what it goes for: the nearest thing it may eat in front of it and within reach, up or down as far as the neck goes
          let best = null, bd = 1e9;
          for (const o of sim.fish) { if (!edible(maw, o)) continue; const dx = o.x - f.x, dy = o.y - f.y, dist = hypot(dx, dy); if (dist > R || dist >= bd) continue;
            if (abs(wrap(atan2(dy, dx) - aimA)) > RULES.cone || dzOf(maw, o.z, f.z) > reach * maw.sc) continue; bd = dist; best = o; }
          maw.target = best; maw.aimA = best ? angTo(aimA, atan2(best.y - f.y, best.x - f.x), RULES.assist) : aimA; maw.reachMax = reach;
          const ia = c.findIndex((q) => q.row.legs === "front"); maw.pinAt = ia; maw.pin = c.slice(ia).map((q) => [q.x, q.y]);
          const E = window.EcologyDiet; if (d && E) d.energy -= E.RULES.dash.cost * (RULES.cost[0] + RULES.cost[1] * ch);
          maw.cool = E ? E.RULES.dash.cool : 2.5; if (diet) diet.dashCool = maw.cool;
          maw.state = "lunge"; maw.st = 0; maw.ext = 0; }
      }
    } else if (maw.state === "lunge") {
      maw.free = false; f.steer = null; still(10); maw.st += dt; maw.m += (1 - maw.m) * min(1, 30 * dt);
      const u = min(1, maw.st / RULES.out); maw.ext = maw.reachMax * (1 - (1 - u) * (1 - u));
      // whatever the open mouth meets
      const X = f.x + cos(maw.aimA) * maw.ext * maw.sc, Y = f.y + sin(maw.aimA) * maw.ext * maw.sc, k = maw.ext / maw.reachMax, hz = maw.target ? f.z + (maw.target.z - f.z) * k : f.z;
      let got = null;
      for (const o of sim.fish) { if (!edible(maw, o)) continue; if (hypot(o.x - X, o.y - Y) > maw.Rmax * 0.9 * maw.sc + bodyLen(maw, o) * 0.25) continue;
        if (o !== maw.target && dzOf(maw, o.z, hz) > maw.Rmax * maw.sc) continue; got = o; break; }
      if (got) { if (!swallow(maw, got)) { maw.state = "miss"; maw.st = 0; } }                   // swallow() ends in ate(), which sets chew
      else if (maw.st > RULES.out + RULES.hold) { maw.state = "miss"; maw.st = 0; }
    } else if (maw.state === "chew") {
      maw.free = false; f.steer = null; still(8); maw.st += dt;
      const t = maw.st; maw.m = t < 0.07 ? lerp(maw.m, 0, 0.6) : 0.02 + 0.16 * max(0, sin((t - 0.1) * 17)) * max(0, 1 - t / 0.75);
      if (t > 0.8) maw.state = "walk";
    } else if (maw.state === "miss") {
      maw.free = false; f.steer = null; still(8); maw.st += dt; maw.m += (0 - maw.m) * min(1, 30 * dt);
      if (maw.st > RULES.back + RULES.miss) maw.state = "walk";
    }
    if (maw.state === "chew" || maw.state === "miss" || maw.state === "walk") { maw.ext = max(0, maw.ext - maw.reachMax * dt / RULES.back); if (maw.ext <= 0) { maw.pin = null; maw.target = null; } }
    // it stands on the floor: the sim's own walking depth, so a Maw is never a swimmer hanging in the water. A lunge at prey above the
    // floor still rises through maw.lift, which is drawn, and the host eases back down when the neck returns.
    if (!f.caught) { f.ground = 1; f.zGoal = 0.97; f.z += (0.97 - f.z) * min(1, dt * 2.4); }
    maw.lift = maw.target && maw.ext > 0 ? (f.z - maw.target.z) * (maw.TD || 0) / maw.sc * (maw.ext / maw.reachMax) : maw.lift * exp(-10 * dt);
    const coiling = maw.state === "coil";
    // ---- the body: the head is the host; the rows follow it ----
    const hx = f.x / maw.sc, hy = f.y / maw.sc;
    if (!maw.placed) { maw.placed = true; maw.heading = f.ang; c.forEach((q, i) => { q.x = hx - cos(f.ang) * i * STEP; q.y = hy - sin(f.ang) * i * STEP; }); }
    const out = maw.ext > 0, sx = hx + cos(maw.aimA) * maw.ext, sy = hy + sin(maw.aimA) * maw.ext;
    h.vx = (sx - h.x) / dt; h.vy = (sy - h.y) / dt; h.x = sx; h.y = sy;
    maw.heading = out ? angTo(maw.heading, maw.aimA, 20 * dt) : angTo(maw.heading, coiling ? aimA : f.ang, 8 * dt);
    const fxh = cos(maw.heading), fyh = sin(maw.heading), comp = coiling ? 1 - 0.42 * maw.charge : 1;
    const pin = out && maw.pin && maw.pin.length === c.length - maw.pinAt ? maw.pin : null;
    if (pin) {   // struck out: shoulders to tail hold their ground (leaning in a little), the neck spans from them to the head
      const n = pin.length, ia = maw.pinAt;
      for (let i = 0; i < n; i++) { const lean = maw.ext * 0.12 * (1 - i / n); c[ia + i].x = pin[i][0] + cos(maw.aimA) * lean; c[ia + i].y = pin[i][1] + sin(maw.aimA) * lean; }
      for (let i = 1; i < ia; i++) { const t = i / ia; c[i].x = lerp(h.x, c[ia].x, t); c[i].y = lerp(h.y, c[ia].y, t); }
    } else for (let i = 1; i < c.length; i++) { const a = c[i - 1], b = c[i];
      const L = STEP * max(0.12, b.row.g) * comp; let ex = b.x - a.x, ey = b.y - a.y; const dd = hypot(ex, ey) || 1;
      const k = 1 - Math.pow(0.5, dt * 60), corr = (dd - L) * k; b.x -= ex / dd * corr; b.y -= ey / dd * corr;
      if (dd > L * 2.4) { b.x = a.x + ex / dd * L * 2.4; b.y = a.y + ey / dd * L * 2.4; }
      let px, py; if (i === 1) { px = -fxh; py = -fyh; } else { const z = c[i - 2]; px = a.x - z.x; py = a.y - z.y; const e = hypot(px, py) || 1; px /= e; py /= e; }
      const s = min(1, (coiling ? 0.5 : 0.1) * dt * 30) * 0.35; b.x += (a.x + px * L - b.x) * s; b.y += (a.y + py * L - b.y) * s; }
    for (const q of c.slice()) { const r = q.row; if (r.gone) { r.g -= dt / 0.6; if (r.g <= 0.05) removeRow(maw, q); } else r.g = min(1, r.g + dt / 1.1);
      q.pulse = max(0, q.pulse - dt * 5); q.sw = 0; for (const sd of r.sides) sd.g = min(1, sd.g + dt / 1.15); }
    maw.Rmax += (maw.RmaxT - maw.Rmax) * min(1, 2.2 * dt);
    for (const b of maw.bolus) { b.t += dt; const s = b.t / 0.85 * (c.length - 1); c.forEach((q, i) => { const z = i - s; q.sw += 7 * exp(-z * z * 1.6) * (1 - b.t / 1.1); }); if (!b.done && b.t > 0.5) { b.done = true; give(maw, b.kind, b.don); } }
    maw.bolus = maw.bolus.filter((b) => b.t < 1.1);
    for (const t of maw.teeth) t.grow = min(1, t.grow + dt);
    // legs: stepped by the shared gait rules, as the city's walkers are: on demand in two alternating sets at a walk,
    // on a clock when it runs (four legs trot and gallop as the qilin does; more pace and bound)
    { const G = window.Gaits, L = maw.legs, pairs = L.length >> 1, rows = max(1, pairs - 1), legLen = 94, STEP_T = 0.26, stride = 20;
      const bvx = maw.anchor ? 0 : f.vx / maw.sc, bvy = maw.anchor ? 0 : f.vy / maw.sc, bv = hypot(bvx, bvy), top = maxSp * 3.1 / maw.sc;   // so that sent at full speed it trots, and only a faster body would gallop
      const run = G ? (pairs === 2 ? G.RUN.horse : G.auto(pairs)) : null, busy = coiling || out;
      maw.pace += (bv / top - maw.pace) * min(1, dt * 3);
      const pick = !run || busy || maw.pace < run.walkBelow ? null : maw.pace > run.fastAbove ? run.fast : run.slow;
      if (pick && !(maw.gait == null && L.some((l) => l.step >= 0))) { maw.gait = pick; maw.landing = false; } else if (maw.gait && !pick) maw.landing = true;
      const rest = L.map((l) => legRest(maw, l)), land = (l) => { l.step = -1; l.lift = 0; maw.fx.push({ x: l.fx, y: l.fy, t: 0, d: 0.4 }); l.ch.pulse = 1; };
      L.forEach((l, i) => { if (!l.init) { l.fx = rest[i].x; l.fy = rest[i].y; l.init = true; } l.grow = min(1, l.grow + dt / 1.2); });
      if (maw.gait) {
        const g = maw.gait, fq = clamp(bv / (legLen * g.reach), 0.7, 3); maw.phase += fq * dt; let air = 0;
        L.forEach((l, i) => { const u = G.swing(g, maw.phase, l.j, l.s, rows);
          if (u < 0 || (maw.landing && l.step < 0)) { if (l.step >= 0) land(l); return; }
          air++; if (l.step < 0) { l.fromx = l.fx; l.fromy = l.fy; } l.step = u;
          const lead = (1 - u) * (1 - g.duty) / fq + g.duty / fq * 0.5, e = ease(u);
          l.fx = lerp(l.fromx, rest[i].x + bvx * lead, e); l.fy = lerp(l.fromy, rest[i].y + bvy * lead, e); l.lift = sin(PI * u); });
        if (maw.landing && !air) { maw.gait = null; maw.landing = false; }
      } else {
        const view = L.map((l) => ({ i: l.j, side: l.s, group: (l.j + (l.s > 0 ? 0 : 1)) % 2, stepping: l.step >= 0 }));
        if (!busy) L.map((l, i) => [l, i, hypot(l.fx - rest[i].x, l.fy - rest[i].y)]).filter((q) => q[0].step < 0 && q[2] > stride).sort((p, q) => q[2] - p[2]).forEach(([l, i, err]) => {
          if (err > stride * 2.6 || !G || G.mayStep("alt", view[i], view)) { l.step = 0; l.fromx = l.fx; l.fromy = l.fy; view[i].stepping = true; } });
        L.forEach((l, i) => { if (l.step < 0) return; l.step = min(1, l.step + dt / STEP_T); const e = ease(l.step);
          l.fx = lerp(l.fromx, rest[i].x + bvx * STEP_T * 0.6, e); l.fy = lerp(l.fromy, rest[i].y + bvy * STEP_T * 0.6, e); l.lift = sin(PI * l.step); if (l.step >= 1) land(l); });
      }
      L.forEach((l, i) => { const r = rest[i], LMAX = LEG[l.kind][2] + LEG[l.kind][3] - 1, ex = l.fx - r.hx, ey = l.fy - r.hy, ed = hypot(ex, ey);
        if (ed > LMAX) { l.fx = r.hx + ex / ed * LMAX; l.fy = r.hy + ey / ed * LMAX; if (l.step >= 0) { l.fromx = l.fx; l.fromy = l.fy; } } }); }
    for (const e of maw.fx) e.t += dt; maw.fx = maw.fx.filter((e) => e.t < e.d);
    // ---- the cost of a big body, and losing it ----
    if (d) {
      const grown = maw.lv.reach + maw.lv.bulk + maw.lv.wide, E = window.EcologyDiet;
      if (grown && E && !f.caught) { const rec = E.describe(diet, f); if (rec) d.energy -= rec.upkeep / 60 * E.RULES.drain * dt * RULES.upkeep * grown; }
      if (maw.tier != null && d.tier < maw.tier) shed(maw);
      maw.tier = d.tier;
    }
  }

  // ---- drawing ----
  // One kit part, placed by its root, pointed along ang, len long from root to tip.
  function drawPart(maw, cx, V, id, x, y, ang, len, flip, own, alpha, fat) {
    const p = part(maw, id); if (!p || len < 1) return;
    const vx = (p.tx - p.rx) * (flip ? -1 : 1), vy = p.ty - p.ry, s = len / (hypot(vx, vy) || 1), ink = V.ink; own = own || ink;
    cx.save(); cx.translate(x, y); cx.rotate(ang - atan2(vy, vx)); cx.scale(flip ? -s : s, s); cx.translate(-p.rx - p.ox, -p.ry - p.oy);
    const x0 = p.ox + p.rx, y0 = p.oy + p.ry, x1 = p.ox + p.tx, y1 = p.oy + p.ty; cx.lineJoin = "round"; cx.lineCap = "round";
    if (maw.rootToTip && own !== ink) {
      if (fat > 0) { const g = cx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(ink, 0.85 * alpha * fat)); g.addColorStop(0.5, rgba(ink, 0)); cx.strokeStyle = g; cx.lineWidth = 3.4 * V.px / s; cx.stroke(p.path); }
      const g = cx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(ink, alpha)); g.addColorStop(0.3, rgba(ink, alpha)); g.addColorStop(0.75, rgba(own, alpha)); g.addColorStop(1, rgba(own, alpha)); cx.strokeStyle = g;
    } else cx.strokeStyle = rgba(own, alpha);
    cx.lineWidth = 1.3 * V.px / s; cx.stroke(p.path); cx.restore();
  }
  function hex(cx, x, y, a, r) { cx.beginPath(); for (let k = 0; k < 6; k++) { const t = a + k * PI / 3; if (k) cx.lineTo(x + cos(t) * r, y + sin(t) * r); else cx.moveTo(x + cos(t) * r, y + sin(t) * r); } cx.closePath(); }

  function draw(maw, cx, view) {
    const f = maw.host; if (!f || !maw.placed) return;
    const P = view.project, dpr = view.dpr || 1, z = f.cz ? f.cz[0] : f.z * (view.depth || 1), c = maw.ch, h = c[0];
    const o = P(f.x, f.y, z), a = P(f.x + 1, f.y, z), b = P(f.x, f.y + 1, z), u = P(f.x, f.y, z - 1); if (!o || !a || !b || !u) return;
    const Ax = (a.x - o.x) * maw.sc, Ay = (a.y - o.y) * maw.sc, Bx = (b.x - o.x) * maw.sc, By = (b.y - o.y) * maw.sc, det = Ax * By - Bx * Ay; if (abs(det) < 1e-9) return;
    // height lifts toward the surface: one design unit of height, as an offset on the plane
    const Ux = (u.x - o.x) * maw.sc, Uy = (u.y - o.y) * maw.sc, LX = (Ux * By - Bx * Uy) / det, LY = (Ax * Uy - Ux * Ay) / det;
    const ink = view.ink || "#ECE8DE", ground = view.ground || "rgba(13,16,16,.84)", V = { ink, px: 1 / sqrt(abs(det)) }, px = V.px;
    cx.save();
    cx.setTransform(dpr * Ax, dpr * Ay, dpr * Bx, dpr * By, dpr * (o.x - Ax * h.x - Bx * h.y), dpr * (o.y - Ay * h.x - By * h.y));
    // lift the body off the ground for drawing: each cell rides at its own height, feet stay down
    maw.TD = view.depth || 0;
    const bob = maw.gait ? maw.gait.bounce * 94 * sin(maw.phase * maw.gait.beats * TAU) : maw.legs.reduce((a, l) => a + l.lift, 0) / max(1, maw.legs.length) * 3;
    const coil = maw.state === "coil" ? maw.charge : 0, ia = max(1, c.findIndex((q) => q.row.legs === "front"));
    c.forEach((q, i) => { q.wx = q.x; q.wy = q.y; const up = (q.row.up + (q.row.head ? 12 * coil : q.row.neck ? 6 * coil : -3 * coil) + (i >= ia ? bob : bob * 0.5)) * q.row.g + (i < ia ? maw.lift * (1 - i / ia) : 0); q.x += up * LX; q.y += up * LY; });
    const g = mouthGeo(maw), F = c.map((q, i) => cellFrame(maw, i));
    cx.lineCap = "round"; cx.lineJoin = "round";
    // the ground it stands on: a hex patch that fades with distance, a lit hex under each foot, and a shadow under every cell
    // (the shadow stays on the floor while the cell rides above it, so the gap between them is the height)
    { const Rg = S * 1.15, cw = 1.5 * Rg, rh = sqrt(3) * Rg, R2 = 7, i0 = Math.round(h.x / cw), j0 = Math.round(h.y / rh), sh = view.shadow || "rgba(0,0,0,.42)";
      cx.lineWidth = px;
      for (let di = -R2; di <= R2; di++) for (let dj = -R2 - 1; dj <= R2 + 1; dj++) { const i = i0 + di, j = j0 + dj, x = i * cw, y = j * rh + (i & 1 ? rh / 2 : 0), d = hypot(x - h.x, y - h.y) / (R2 * cw * 0.95); if (d >= 1) continue;
        let lit = 0; for (const l of maw.legs) if (l.step < 0 && hypot(l.fx - x, l.fy - y) < Rg * 0.9) lit = 1;
        hex(cx, x, y, 0, Rg * 0.94); if (lit) { cx.fillStyle = rgba(ink, 0.09 * (1 - d)); cx.fill(); } cx.strokeStyle = rgba(ink, (lit ? 0.3 : 0.11) * (1 - d) * (1 - d * 0.5)); cx.stroke(); }
      const cell = (q, i, m) => { const r = q.row, k = min(1, r.g * 1.4), rr = S * (r.head ? 1.5 : r.neck ? 0.8 : 1.35) * k * m; if (rr < 1) return false; cx.beginPath(); cx.ellipse(q.wx, q.wy, rr * 1.05, rr * 0.8, F[i].a, 0, TAU); return true; };
      // on a dark ground a shadow cannot be darker than the ground, so a dark look gets a faint pool of light for the shadow to sit in
      if (view.pool) { cx.fillStyle = view.pool; c.forEach((q, i) => { if (cell(q, i, 1.9)) cx.fill(); }); }
      cx.fillStyle = sh; c.forEach((q, i) => { if (cell(q, i, 1)) cx.fill(); });
      cx.strokeStyle = rgba(ink, 0.3); cx.setLineDash([3 * px, 4 * px]); c.forEach((q, i) => { if (cell(q, i, 1)) cx.stroke(); }); cx.setLineDash([]);
      for (const l of maw.legs) { const r = legRest(maw, l); cx.beginPath(); cx.ellipse(l.fx, l.fy, 4.2 * backOut(l.grow), 3 * backOut(l.grow), 0, 0, TAU); cx.fill(); } }
    // legs: a kit part along each bone, a small hex at the knee
    for (const l of maw.legs) { const r = legRest(maw, l), K = LEG[l.kind], l1 = K[2], l2 = K[3]; const lf = l.lift * 20; let ex = l.fx + lf * LX - r.hx, ey = l.fy + lf * LY - r.hy; const e0 = hypot(ex, ey) || 1, d = min(e0, l1 + l2 - 0.5); ex /= e0; ey /= e0;
      const aa = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = sqrt(max(0, l1 * l1 - aa * aa));
      const k1x = r.hx + ex * aa - ey * hh, k1y = r.hy + ey * aa + ex * hh, k2x = r.hx + ex * aa + ey * hh, k2y = r.hy + ey * aa - ex * hh;
      const f1 = (k1x - r.hx) * r.f.fx + (k1y - r.hy) * r.f.fy, f2 = (k2x - r.hx) * r.f.fx + (k2y - r.hy) * r.f.fy, kx = f1 > f2 ? k1x : k2x, ky = f1 > f2 ? k1y : k2y;
      const fx = r.hx + ex * d, fy = r.hy + ey * d, al = l.grow, gk = backOut(l.grow), ta = atan2(fy - ky, fx - kx);
      drawPart(maw, cx, V, K[0], r.hx, r.hy, atan2(ky - r.hy, kx - r.hx), l1 * 1.04 * gk, l.s > 0, null, al, 0);
      drawPart(maw, cx, V, K[1], kx, ky, ta, l2 * 1.04 * gk, l.s > 0, null, al, 0);
      drawPart(maw, cx, V, "P244", fx, fy, ta + l.s * 0.5, 11 * gk, l.s > 0, null, al, 0);
      cx.fillStyle = ground; cx.strokeStyle = rgba(ink, al); cx.lineWidth = px; hex(cx, kx, ky, ta, 3.2 * gk); cx.fill(); cx.stroke(); }
    // the lattice: one hex per cell, riding the body
    if (maw.lattice) { cx.lineWidth = px;
      c.forEach((q, i) => { const fr = F[i], r = q.row, k = min(1, r.g * 1.4), own = r.own;
        cx.fillStyle = ground;
        if (r.sides.length || r.legs) for (const sd of [-1, 1]) { hex(cx, fr.x + fr.rx * sd * SIDE * k - fr.fx * STEP * 0.5 * k, fr.y + fr.ry * sd * SIDE * k - fr.fy * STEP * 0.5 * k, fr.a + PI / 2, S * k); cx.fill();
          const so = r.sides.length ? r.sides[0].own : null; cx.strokeStyle = so ? rgba(so, 0.6) : rgba(ink, 0.3); cx.stroke(); }
        hex(cx, fr.x, fr.y, fr.a + PI / 2, S * k); cx.fill(); cx.strokeStyle = own ? rgba(own, 0.6) : rgba(ink, 0.3); cx.stroke(); }); }
    // the cord the cells hang on
    cx.strokeStyle = rgba(ink, 0.4); cx.lineWidth = px; cx.beginPath(); c.forEach((q, i) => (i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y))); cx.stroke();
    // side cells: parts taken from prey, mirrored across the spine
    c.forEach((q, i) => { const fr = F[i]; for (const sd of q.row.sides) for (const side of [-1, 1]) drawPart(maw, cx, V, sd.id, fr.x + fr.rx * side * SIDE * 0.5 - fr.fx * STEP * 0.2, fr.y + fr.ry * side * SIDE * 0.5 - fr.fy * STEP * 0.2, fr.a + side * sd.ang, sd.len * backOut(sd.g), side > 0, sd.own, min(1, sd.g * 3), 1); });
    // spine cells, tail first so the head sits on top
    for (let i = c.length - 1; i >= 0; i--) { const r = c[i].row, p = part(maw, r.id), fr = F[i]; if (!p) continue; const s = (r.long ? r.long / p.h : r.wide / p.w) * backOut(r.g); if (s < 0.03) continue;
      cx.save(); cx.translate(fr.x, fr.y); cx.rotate(fr.a + PI / 2); cx.scale(s, s); cx.translate(-p.ox, -p.oy); cx.strokeStyle = r.own || ink; cx.lineWidth = 1.25 * px / s; cx.stroke(p.path); cx.restore(); }
    // the mouth
    cx.save(); cx.translate(g.x, g.y); cx.rotate(maw.heading);
    cx.fillStyle = view.throat || "#070708"; cx.beginPath(); cx.ellipse(0, 0, g.Ra, g.R, 0, 0, TAU); cx.fill();
    cx.strokeStyle = rgba("#FF4D5E", 0.34 * g.e); cx.lineWidth = px; cx.beginPath(); cx.ellipse(-g.Ra * 0.12, 0, g.Ra * 0.6, g.R * 0.6, 0, 0, TAU); cx.stroke();
    cx.strokeStyle = rgba("#FF4D5E", 0.2 * g.e); cx.beginPath(); cx.ellipse(-g.Ra * 0.22, 0, g.Ra * 0.3, g.R * 0.3, 0, 0, TAU); cx.stroke();
    cx.strokeStyle = ink; cx.lineWidth = 1.5 * px; cx.beginPath(); cx.ellipse(0, 0, g.Ra, g.R, 0, 0, TAU); cx.stroke(); cx.restore();
    const chat = maw.state === "coil" && maw.charge >= 1 ? 0.05 : 0;
    for (const t of maw.teeth.slice().sort((p, q) => sin(p.a) - sin(q.a))) { const ca = cos(t.a), sa = sin(t.a), x = g.x + g.rx * ca * g.R + g.fx * sa * g.Ra, y = g.y + g.ry * ca * g.R + g.fy * sa * g.Ra;
      drawPart(maw, cx, V, t.id, x, y, atan2(g.y - y, g.x - x) + (random() - 0.5) * chat + (1 - g.e) * sa * 0.5, min(t.len * backOut(t.grow) * lerp(0.38, 1, g.e), g.R * 0.98), t.flip, t.own, min(1, t.grow * 3) * lerp(0.6, 1, g.e), g.e * 0.6); }
    // where the lunge will carry it, while coiled
    if (maw.state === "coil" && maw.charge > RULES.minCharge) { const reach = reachOf(maw, maw.charge) + g.Ra * 2;
      const ex = h.x + g.fx * reach, ey = h.y + g.fy * reach, gold = view.accent || "#E8B04A";
      cx.strokeStyle = rgba(gold, 0.6); cx.lineWidth = 1.2 * px; cx.setLineDash([2 * px * 2, 7 * px * 2]); cx.beginPath(); cx.moveTo(g.x + g.fx * g.Ra, g.y + g.fy * g.Ra); cx.lineTo(ex, ey); cx.stroke(); cx.setLineDash([]);
      cx.strokeStyle = gold; cx.lineWidth = 1.6 * px; cx.beginPath(); cx.moveTo(ex - g.rx * maw.Rmax * 0.7, ey - g.ry * maw.Rmax * 0.7); cx.lineTo(ex + g.rx * maw.Rmax * 0.7, ey + g.ry * maw.Rmax * 0.7); cx.stroke(); }
    // a foot coming down
    for (const e of maw.fx) { const t = e.t / e.d; cx.strokeStyle = rgba(ink, 0.28 * (1 - t)); cx.lineWidth = px; hex(cx, e.x, e.y, 0, 2 + 8 * t); cx.stroke(); }
    for (const q of c) { q.x = q.wx; q.y = q.wy; }
    cx.restore();
  }

  window.EcologyMaw = { create, attach, detach, input, step, draw, feed, reset, RULES, LEG, S };
})();
