/* ecology-maw.js: the Maw, the creature a person plays in the ecology tank.

   A mouth on a neck. It has one ability, the lunge: hold to coil (it stops, rears its head and opens its mouth),
   release and the neck throws the head at what is in front of it, then draws it back. The body stays where it
   stands. It only eats in a lunge. What it eats it wears.

   It is one of the tank's walkers. Nothing here moves or draws a creature on its own:
     the body    a CreatureBody (shared/engine/motion/creature-body.js) in the walkers' world (EcologyWalkers' host.W):
                 it stands on the tank's terrain on its own feet, is carried by them, steps by the shared gait rules,
                 and climbs the towers. The person is its brain: a heading to walk, or nowhere.
     the look    KitLook (shared/engine/motion/looks.js) draws the kit's parts on the body's pieces and its leg blades
                 on the bones; lines() gives it as 3D line segments in tank space for the tank's own renderer.
     the rules   a hidden creature of the tank stands where its head is (as each walker has), but inside the diet
                 rules: it is hunted, held, fed and starved like any creature.
   What this module adds: the def (the body plan as a walker def), the neck (the head and neck chunks are held up and
   aimed by pushes, and thrown along the strike), the mouth (drawn each frame, since it opens), the lunge, what a meal
   gives, and the gates on what it may eat.

   The body plan is the qilin's, built as Compose builds a creature: rows down a spine, one centre part per row and
   side parts mirrored. Head, two neck rows, shoulders with a leg pair, back, haunch with a leg pair, tail. Each row is
   one piece of the walker (one chunk), so the body bends between rows. A meal becomes rows or teeth:
     a flier (wing)        reach   a new neck row with the donor's largest side part; a longer neck strikes further
     a walker (leg, claw)  bulk    a new body row with the donor's parts and one more leg pair
     anything else         wide    four tusks on the mouth from the donor's blades; the mouth opens wider
   Three of each; after that the oldest of that kind is re-dressed from the new donor. The parts come from the
   donor's own kit sheet, chosen by shape.

     const maw = EcologyMaw.create({ parts, KitLook, sheetOf, colorOf })
        parts: PartLib.load() result. sheetOf(speciesName) -> kit sheet key or null. colorOf(sp) -> [r, g, b] of a species
     EcologyMaw.attach(maw, { sim, diet, walkers }) -> its creature in the tank (make it diet.mine), or null without a walkers' world
     EcologyMaw.detach(maw)
     EcologyMaw.input(maw, { move, aim, hold })   move, aim: [x, y] headings in the tank, or null; hold: the lunge key is down
     EcologyMaw.step(maw, dt)                     after the tank's and the diet's steps
     EcologyMaw.lines(maw) -> { data: x, y, z, 1 per vertex (tank space), verts, batches: [{ start, count, color }] }
     EcologyMaw.view(maw) -> { x, y, z, len, aim, coil }   where a camera should look: the body's middle, in tank space
     EcologyMaw.relayout(maw)                     after the walkers' world was rebuilt (EcologyWalkers.layout)
     EcologyMaw.edible(maw, creature)             may it eat that one
     EcologyMaw.feed(maw, sp)                     as if it had eaten one of species sp (the workbench, tests)
     maw.state   walk | coil | lunge | chew | miss      maw.charge 0..1      maw.lv { reach, bulk, wide }

   Sizes of parts are in the kit's own drawing units ("design units": a row is 22.5 apart); maw.U is walker units per
   design unit. Classic script -> window.EcologyMaw. Needs EcologyWalkers (and what it needs), PartLib, LimbArt. */
(function () {
  "use strict";
  const { min, max, abs, sin, cos, atan2, acos, hypot, PI, sqrt, floor, round } = Math, TAU = PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => (x < a ? a : x > b ? b : x), ease = (t) => t * t * (3 - 2 * t);
  const wrap = (a) => ((a + PI) % TAU + TAU) % TAU - PI;

  const FLOOR = 0.97;                                     // the tank floor, as a share of its depth (as EcologyWalkers has it)
  const STEP = sqrt(3) * 13, U0 = 0.0165;                 // a row's length in design units; walker units per design unit at the smallest size
  const INK = [0.925, 0.91, 0.87], GOLD = [0.91, 0.69, 0.29], THROAT = [0.62, 0.19, 0.24];
  const LEG = { front: { id: "P396", ang: 60, len: 96 }, hind: { id: "P183", ang: 118, len: 100 }, extra: { id: "P245", ang: 90, len: 92 } };
  // strike: how far the neck throws the head, in neck lengths, at no charge and added at full charge; out, back: seconds to throw and draw back
  const RULES = { coil: 0.85, minCharge: 0.16, strike: [1.2, 1.6], out: 0.13, hold: 0.05, back: 0.3, cone: 0.7, miss: 0.5, cost: [0.6, 0.8], gate: 1.6, upkeep: 0.1, max: 3, grow: 0.15,
    neck: { k: 180, d: 24, rear: 0.38, coilRear: 0.3 },
    // a level: eat toward a threshold, then choose exactly one part. Meals needed = base + grow x levels reached; a level not yet spent is banked (open: whether it should reset or grow)
    level: { base: 2, grow: 1, stock: 8 },
    // soft lock-on: the nearest edible thing within this cone of the aim is marked, and the neck leans toward it as the coil charges
    lock: { cone: 0.5, assist: 0.7 },
    // the shot: tilt comes down as the body leans onto a wall; at a summit the camera swings out on its own, then gives itself back
    shot: { tilt: 40, climbTilt: 62, revTilt: 80, steep: 0.8, flat: 0.25, settle: 0.35, climbT: 0.6, gain: 0.5, cool: 30, dur: 4.6, in: 1.5, out: 1.5, dist: 0.55, rise: 0.6 } };   // the push that holds the head and neck up and aims them; how high the head rides, in neck lengths

  const row = (id, o) => Object.assign({ id, long: 0, wide: 0, own: null, sides: [], legs: null }, o);

  function create(opts) {
    opts = opts || {};
    const byId = Array.isArray(opts.parts) ? Object.fromEntries(opts.parts.map((p) => [p.id, p])) : (opts.parts || {});
    const bySheet = {}; for (const id in byId) { const p = byId[id]; (bySheet[p.species] || (bySheet[p.species] = [])).push(p); }
    const maw = { byId, bySheet, KitLook: opts.KitLook, sheetOf: opts.sheetOf || (() => null), colorOf: opts.colorOf || (() => [0.36, 0.89, 0.6]),
      sim: null, diet: null, host: null, guest: null, body: null, look: null, def: null, was: null, buf: new Float32Array(8192), batches: [], tooth: new Map(), in: { move: null, aim: null, hold: false } };
    reset(maw);
    return maw;
  }
  function reset(maw) {
    Object.assign(maw, { rows: [row("P277", { long: 36, head: true }), row("P280", { long: 27, neck: true }), row("P280", { long: 27, neck: true }),
        row("P246", { wide: 64, legs: "front" }), row("P253", { wide: 46 }), row("P251", { wide: 52, legs: "hind" }), row("P276", { long: 46, tail: true })],
      teeth: [], lv: { wide: 0, bulk: 0, reach: 0 }, grown: { wide: [], bulk: [], reach: [] }, Rmax: 50, RmaxT: 50, m: 0.08,
      state: "walk", st: 0, t: 0, charge: 0, cool: 0, ext: 0, reachMax: 1, strikeTo: null, target: null, bolus: [], tier: null, U: U0,
      xp: 0, lvls: 0, owed: 0, stock: [], offer: null, lock: null, lean: 0, rev: { on: false, t: 0, up: 0, flat: 0, low: null, cool: 0, dyaw: 0 } });
    // twelve teeth, one on every 30 degree ray
    for (let i = 0; i < 12; i++) { const big = i % 2 === 0; maw.teeth.push({ a: i / 12 * TAU + PI / 12, id: big ? (i % 4 === 0 ? "P258" : "P032") : "P244", len: big ? (i % 4 === 0 ? 32 : 28) : 16, own: null, grow: 1 }); }
  }
  const lines = (maw, id) => (maw.byId[id] ? window.PartLib.lines(maw.byId[id]) : []);

  // ---- the def: the rows as a walker's pieces ----
  function buildDef(maw) {
    const LA = window.LimbArt, U = maw.U, fr = [0.3, 0.4, 0.3], gap = STEP * U, legLens = [];
    const segs = maw.rows.map((r, i) => {
      const p = maw.byId[r.id], polys = lines(maw, r.id), k = (r.long ? r.long / +p.h : r.wide / +p.w) * U, half = +p.w * k / 2;
      // the centre part lies on the spine as drawn, arched a little across its width so it has a back to it
      const parts = [{ polys, cx: +p.ox, cy: +p.oy, k, arch: { hw: +p.w / 2, h: half * 0.5 } }];
      // side parts hang from where they met the donor's body, mirrored, raised toward their tips
      for (const sd of r.sides) { const q = lines(maw, sd.id); if (!q.length) continue; const jt = LA.jointAndTip(q), ks = sd.len * U / (jt.L || 1), J = jt.J, rise = sd.rise ?? 0.32;
        parts.push({ polys: q, cx: J[0] + half * 0.55 / ks, cy: J[1] + gap * 0.15 / ks, k: ks, mirror: true, lift: (sx, sy) => rise * hypot(sx - J[0], sy - J[1]) * ks }); }
      const legs = [];
      if (r.legs) { const sp = LEG[r.legs], q = lines(maw, sp.id), jt = LA.jointAndTip(q), len = sp.len * U; legLens.push(len);
        legs.push({ keepOwn: true, artObj: LA.sliceSpine(q, LA.medialSpine(q, jt.J, jt.T, 8), fr), ang: sp.ang, len, fracs: fr, reach: 0.8, hip: [max(half * 0.8, 0.06), 0.02, 0] }); }
      return { h: 0, gap: i ? gap : 0, parts, legs, arms: [], zF: gap / 2, zB: -gap / 2, row: r, half };
    });
    const Lm = legLens.length ? legLens.slice().sort((a, b) => a - b)[legLens.length >> 1] : 1;
    for (const sg of segs) sg.h = 0.5 * Lm;
    return { segs, smooth: false, flatLimbs: true, Lm, speed: 0.85 * Math.pow(Lm, 0.6), stride: 0.45 * Lm, lift: 0.3 * Lm, turn: 1.8, bob: 0, climb: true };
  }
  // a new body for the def, standing where the old one stood (rows that were there keep their place)
  function build(maw, at) {
    const W = maw.host.W, kit = window.EcologyWalkers.kit, old = maw.body, def = (maw.def = buildDef(maw));
    const start = old ? { x: old.chunks[0].p.x, z: old.chunks[0].p.z } : at, yaw = old ? old.heading : (at.yaw || 0);
    const body = new window.CreatureBody(def, { H: W.H, S: { speed: 1, stride: 1, lift: 1, height: 1, gait: "alt" }, surface: W.surface, ceil: W.ceil, climb: true, start, yaw });
    if (old) {
      const was = new Map(old.def.segs.map((sg, i) => [sg.row, old.chunks[i]])), C = body.chunks;
      C.forEach((c, i) => { const o = was.get(def.segs[i].row); if (o) { c.p.copy(o.p); c.prev.copy(o.prev); c.had = true; } });
      C.forEach((c, i) => { if (c.had) return; const a = C[i - 1], b = C[i + 1]; if (a && a.had && b && b.had) c.p.lerpVectors(a.p, b.p, 0.5); else if (a && a.had) c.p.copy(a.p).addScaledVector(old.hdir, -body.rest[i - 1]); c.prev.copy(c.p); });
      body.hdir.copy(old.hdir); body.frames(); for (const L of body.legs) { body.homeOf(L, L.foot, 0); body.solveLeg(L); } body.write();
    }
    body.rest0 = body.rest.slice();
    if (maw.look) maw.look.dispose();
    const look = new maw.KitLook(kit.T, kit.NOWHERE, def, body.skel, {}); look.update(body.skel);
    look.thin = look.groups.map((g) => kit.thin(g.children[0].geometry.attributes.position.array, 0.02));   // it is seen close: thinned far less than the crew
    maw.body = body; maw.look = look; maw.ia = max(1, def.segs.findIndex((sg) => sg.row.legs));
  }

  // ---- tank <-> walker space (as EcologyWalkers has it) ----
  const toTank = (h, p, out) => { out.x = p.x / h.ks + h.tw / 2; out.y = p.z / h.ks + h.th / 2; out.z = FLOOR * h.td - p.y / h.ks; return out; };
  const fishPos = (h, f, out) => { out.x = (f.x - h.tw / 2) * h.ks; out.y = (FLOOR - f.z) * h.td * h.ks; out.z = (f.y - h.th / 2) * h.ks; return out; };
  const _u = { x: 0, y: 0, z: 0 }, _t = { x: 0, y: 0, z: 0 }, _w = { x: 0, y: 0, z: 0 }, _m = { x: 0, y: 0, z: 0 };

  // ---- what a meal gives: the donor's own parts, chosen by shape ----
  function donorParts(maw, sheet) {
    const LA = window.LimbArt, list = (sheet && maw.bySheet[sheet] || []).filter((p) => String(p.svg).length < 12000 && min(+p.w, +p.h) > 4 && max(+p.w, +p.h) > 14);
    const isC = (p) => p.side === "center" || p.side === "c", centre = list.filter(isC), side = list.filter((p) => !isC(p));
    const spine = centre.slice().sort((a, b) => abs(max(+a.w, +a.h) - 46) - abs(max(+b.w, +b.h) - 46))[0];
    const long = side.map((p) => ({ p, L: LA.jointAndTip(lines(maw, p.id)).L })).filter((q) => q.L > 0).sort((a, b) => b.L - a.L);
    const slim = long.slice().sort((a, b) => (b.L * b.L) / (b.p.w * b.p.h) - (a.L * a.L) / (a.p.w * a.p.h));
    return { spine: spine ? spine.id : null, side: long[0] ? long[0].p.id : null, side2: long[1] ? long[1].p.id : null, tooth: slim[0] ? slim[0].p.id : null };
  }
  const kindOf = (move) => (move === "wing" ? "reach" : move === "leg" || move === "claw" ? "bulk" : "wide");
  const LABEL = { reach: "a longer neck", bulk: "a body row and two legs", wide: "tusks" };
  function give(maw, kind, don) {
    const lv = maw.lv, R = maw.rows, col = don.col, P = donorParts(maw, don.sheet);
    const spineId = P.spine || { reach: "P594", bulk: "P259", wide: null }[kind], sideId = P.side || { reach: "P578", bulk: "P261", wide: "P028" }[kind], toothId = P.tooth || P.side || "P026";
    note(maw, "graft", "The Maw grew " + LABEL[kind] + " from " + (don.name || "its meal"));
    if (lv[kind] >= RULES.max) {          // full: the oldest of this kind is re-dressed from the new donor
      const old = maw.grown[kind].shift(); maw.grown[kind].push(old);
      if (kind === "wide") { for (const t of old) { t.id = toothId; t.own = col; t.grow = 0.4; } return; }
      if (spineId) old.id = spineId; old.own = col; if (sideId && old.sides[0]) old.sides[0].id = sideId;
    } else {
      const n = ++lv[kind];
      if (kind === "reach") {             // a longer neck, with the donor's blades on the new row
        const r = row(spineId, { wide: 38, own: col, neck: true, sides: sideId ? [{ id: sideId, len: [88, 66, 74][n - 1] }] : [] });
        R.splice(R.findIndex((q) => q.legs === "front"), 0, r); maw.grown.reach.push(r);
      } else if (kind === "bulk") {       // one more body row: a plate, its blades, and a leg pair
        const r = row(spineId, { long: 40, own: col, legs: "extra", sides: sideId ? [{ id: sideId, len: [66, 58, 62][n - 1] }] : [] });
        R.splice(R.findIndex((q) => q.legs === "hind"), 0, r); maw.grown.bulk.push(r);
      } else {                            // tusks on the odd rays of the mouth, and a wider mouth
        const set = []; for (let i = 0; i < 4; i++) { const t = { a: i / 4 * TAU + n * PI / 6 + PI / 4, id: toothId, len: 38 + 4 * n, own: col, grow: 0 }; maw.teeth.push(t); set.push(t); }
        maw.RmaxT = 50 + 9 * n; maw.grown.wide.push(set);
        if (n === 1 && P.side2) R[0].sides.push({ id: P.side2, len: 54, rise: 0.5 });
        if (n !== 1) return;
      }
    }
    if (maw.body) build(maw);
  }
  // ---- levels: a meal is stored, the threshold lets the person pick one part from what it has eaten ----
  const need = (maw) => RULES.level.base + RULES.level.grow * maw.lvls;   // meals to the next level
  function refreshOffer(maw) {
    if (!maw.owed) { maw.offer = null; return; }
    const seen = {}, out = [];
    for (let i = maw.stock.length - 1; i >= 0; i--) { const q = maw.stock[i]; if (seen[q.kind]) continue; seen[q.kind] = 1; out.push({ kind: q.kind, don: q.don, label: LABEL[q.kind], redress: maw.lv[q.kind] >= RULES.max }); }
    maw.offer = out.length ? out : null;
  }
  function eaten(maw, kind, don) {
    maw.stock.push({ kind, don }); while (maw.stock.length > RULES.level.stock) maw.stock.shift();
    maw.xp++;
    if (maw.xp >= need(maw)) { maw.xp -= need(maw); maw.lvls++; maw.owed++; note(maw, "level", "The Maw can mutate: choose one part"); }
    refreshOffer(maw);
    if (maw.autoPick && maw.offer) choose(maw, maw.offer[0].kind);
  }
  // the person's pick: one of the kinds on offer; the donor is spent, the level with it
  function choose(maw, kind) {
    const o = maw.offer && maw.offer.find((q) => q.kind === kind); if (!o || !maw.owed) return false;
    maw.owed--; maw.stock = maw.stock.filter((q) => q.don !== o.don); give(maw, o.kind, o.don); refreshOffer(maw); return true;
  }
  // starved a tier: the newest thing it grew goes
  function shed(maw) {
    const order = ["reach", "bulk", "wide"].filter((k) => maw.lv[k] > 0); if (!order.length) return;
    const kind = order.sort((a, b) => maw.lv[b] - maw.lv[a])[0], last = maw.grown[kind].pop(); maw.lv[kind]--;
    if (kind === "wide") { maw.teeth = maw.teeth.filter((t) => !last.includes(t)); maw.RmaxT = 50 + 9 * maw.lv.wide; if (!maw.lv.wide) maw.rows[0].sides.length = 0; }
    else maw.rows.splice(maw.rows.indexOf(last), 1);
    note(maw, "shed", "The Maw shed " + LABEL[kind]);
    if (maw.body) build(maw);
  }
  function note(maw, kind, text) { const d = maw.diet; if (d && d.events) { d.events.push({ kind, f: maw.guest, text, t: d.t }); if (d.events.length > 40) d.events.shift(); } }

  // ---- its creature in the tank ----
  function attach(maw, o) {
    detach(maw); reset(maw);
    const host = o.walkers, sim = o.sim; if (!host || !host.W || !maw.KitLook) return null;
    const g = window.EcologySim.add(sim, "pincer") || window.EcologySim.add(sim, sim.speciesRT[0].key); if (!g) return null;
    g.guest = false; g.hidden = true; g.maw = true; g.fade = 1; g.darkRoll = 1;      // not a guest: the diet's rules are for it too
    if (!g.diet && sim.hooks.onSpawn) sim.hooks.onSpawn(g);
    if (g.diet) { g.diet.gut = []; g.diet.traits = []; g.diet.offers = null; g.diet.wait = 0; }   // it starts empty
    Object.assign(maw, { sim, diet: o.diet, host, guest: g, tier: g.diet ? g.diet.tier : null, U: U0 * (1 + RULES.grow * (g.diet ? g.diet.tier : 0)) });
    const rnd = window.WorldGen.rng(((sim.cfg && sim.cfg.seed) | 0) * 13 + 7), at = host.W.nav.random(rnd);
    build(maw, { x: at[0], z: at[1], yaw: rnd() * TAU });
    const H = sim.hooks, was = (maw.was = { eats: H.eats, onMeal: H.onMeal });
    H.eats = (a, q) => (a === maw.guest ? false : was.eats ? was.eats(a, q) : undefined);   // its creature does not bite: the head does (strike)
    H.onMeal = (pred, prey) => { if (was.onMeal) was.onMeal(pred, prey); if (pred === maw.guest) ate(maw, prey); };
    pin(maw, 0);
    return g;
  }
  function detach(maw) {
    if (!maw.guest) return; const H = maw.sim.hooks, g = maw.guest;
    if (maw.was) { H.eats = maw.was.eats; H.onMeal = maw.was.onMeal; }
    if (!g.dead) { g.dead = true; g.noRespawn = true; if (g.caught) { g.caught.holding = null; g.caught = null; } }
    if (maw.look) maw.look.dispose();
    Object.assign(maw, { guest: null, body: null, look: null, def: null, was: null });
  }
  function relayout(maw) { if (!maw.guest || !maw.host.W) return; const g = maw.guest, h = maw.host; fishPos(h, g, _w); maw.body = null; build(maw, { x: _w.x, z: _w.z, yaw: 0 }); }

  const bodyLen = (maw, f) => window.EcologySim.bodyLen(maw.sim, f);
  const mouthR = (maw) => maw.Rmax * maw.U / maw.host.ks;                         // the open mouth's radius, in tank units
  // the nearest thing it may eat in front of it, within a cone of an aim and a reach of the shoulders (up or down)
  function pickTarget(maw, aimA, reach, cone) {
    const h = maw.host, sh = maw.body.chunks[maw.ia].p; let best = null, bd = 1e9;
    for (const q of maw.sim.fish) { if (!edible(maw, q)) continue; fishPos(h, q, _w); const dist = hypot(_w.x - sh.x, _w.y - sh.y, _w.z - sh.z); if (dist > maw.neckLen + reach + maw.Rmax * maw.U || dist >= bd) continue;
      if (abs(wrap(atan2(_w.z - sh.z, _w.x - sh.x) - aimA)) > cone) continue; bd = dist; best = q; }
    return best;
  }
  const fits = (maw, o) => bodyLen(maw, o) <= 2 * mouthR(maw) * RULES.gate;
  // may the Maw eat o: the diet's rules for a creature played by hand, its own creature's kind included, and only what the mouth takes in
  function edible(maw, o) {
    const f = maw.guest; if (!f || !o || o === f || o.dead || o.caught || o.guest || !o.diet) return false;
    const H = maw.sim.hooks, r = maw.was && maw.was.eats ? maw.was.eats(f, o) : true;
    if (r === false && !(o.sp === f.sp && (!H.canEat || H.canEat(f, o)))) return false;
    return fits(maw, o);
  }
  function swallow(maw, o) {
    const f = maw.guest, sim = maw.sim, H = sim.hooks;
    if (H.onCatch && H.onCatch(f, o) === false) return false;        // stung
    o.dead = true; if (o.holding) { o.holding.caught = null; o.holding = null; }
    f.gulp = 1; f.full = 0; f.meals = (f.meals || 0) + 1; if (sim.tally) { sim.tally[f.sp].eaten++; sim.tally[o.sp].lost++; }
    if (H.onMeal) H.onMeal(f, o);                                    // the diet's meal, then ate() below
    return true;
  }
  const donOf = (maw, sp) => { const name = maw.sim.speciesRT[sp].name, tag = maw.diet && maw.diet.tag ? maw.diet.tag[sp] : { move: "shoal" }; return { kind: kindOf(tag.move), don: { sheet: maw.sheetOf(name), col: maw.colorOf(sp), name } }; };
  function ate(maw, prey) { maw.bolus.push({ t: 0, ...donOf(maw, prey.sp) }); maw.state = "chew"; maw.st = 0; }
  function feed(maw, sp) { if (maw.sim) maw.bolus.push({ t: 0, ...donOf(maw, sp) }); }
  function input(maw, i) { const I = maw.in; if (i.hold != null) I.hold = !!i.hold; for (const k of ["move", "aim"]) if (k in i) { const v = i[k], l = v ? hypot(v[0], v[1]) : 0; I[k] = l > 1e-9 ? [v[0] / l, v[1] / l] : null; } }

  // its creature stands where the head is, so the tank's rules meet it there
  function pin(maw, dt) {
    const g = maw.guest, h = maw.host, body = maw.body, K = window.EcologySim.K, hd = body.chunks[0].p;
    if (g.caught) {   // a hunter has it: the body goes where its jaws go
      g.z += (g.caught.z - g.z) * min(1, dt * 1.5); fishPos(h, g, _w); const dx = _w.x - hd.x, dy = _w.y - hd.y, dz = _w.z - hd.z;
      for (const c of body.chunks) { c.p.x += dx; c.p.y += dy; c.p.z += dz; c.prev.x += dx; c.prev.y += dy; c.prev.z += dz; }
      return; }
    toTank(h, hd, _t); g.x = _t.x; g.y = _t.y; g.z = clamp(_t.z / h.td, 0.02, FLOOR); g.vx = g.vy = 0; g.fade = 1; g.full = 5; g.target = null; g.steer = null;
    g.ang = atan2(body.hdir.z, body.hdir.x);
    if (g.chain) for (let k = 0; k < K; k++) { g.chain[k * 2] = g.x; g.chain[k * 2 + 1] = g.y; if (g.cz) g.cz[k] = g.z * h.td; }
  }

  // ---- the neck: the head and neck chunks have no feet under them. They are held up and aimed by pushes, and thrown along the strike ----
  // where the head rests: out from the shoulders along dir (a unit vector), raised
  function restHead(maw, dir, out) {
    const b = maw.body, sh = b.chunks[maw.ia], n = sh.n, L = maw.neckLen, N = RULES.neck, up = L * (N.rear + N.coilRear * (maw.state === "coil" ? maw.charge : 0));
    out.x = sh.p.x + dir.x * L * 0.94 + n.x * up; out.y = sh.p.y + dir.y * L * 0.94 + n.y * up; out.z = sh.p.z + dir.z * L * 0.94 + n.z * up; return out;
  }
  const _P = { x: 0, y: 0, z: 0 }, _sum = { x: 0, y: 0, z: 0 }, _dir = { x: 0, y: 0, z: 1 }, _rh = { x: 0, y: 0, z: 0 }, _hp = { x: 0, y: 0, z: 0 }, _imp = { x: 0, y: 0, z: 0 };
  function neck(maw, h) {
    const b = maw.body, C = b.chunks, ia = maw.ia, sh = C[ia], n = sh.n, L = maw.neckLen;
    // which way the neck points: the body's own line, or the aim while coiled and striking (kept in the surface it stands on)
    const back = C[min(C.length - 1, ia + 1)]; let dx = sh.p.x - back.p.x, dy = sh.p.y - back.p.y, dz = sh.p.z - back.p.z;
    if (maw.aimW && (maw.state === "coil" || maw.ext > 0)) { const a = maw.aimW, dn = a.x * n.x + a.z * n.z; const ax = a.x - n.x * dn, ay = -n.y * dn, az = a.z - n.z * dn; if (hypot(ax, ay, az) > 0.2) { dx = ax; dy = ay; dz = az; } }
    const dl = hypot(dx, dy, dz) || 1; _dir.x = dx / dl; _dir.y = dy / dl; _dir.z = dz / dl;
    restHead(maw, _dir, _rh);
    // the neck is a limb of the body that the person aims, not a thing the body's legs must hold up: its pieces stand flat in the shoulders' surface,
    // so the body's own frames (which tell it where it climbs) do not tilt; the lift that raises the head is added to what is drawn afterwards (see lift)
    const lift = maw.lift || (maw.lift = []);
    const put = (i, x, y, z) => { const c = C[i], dx = x - sh.p.x, dy = y - sh.p.y, dz = z - sh.p.z, up = dx * n.x + dy * n.y + dz * n.z;
      c.p.set(x - n.x * up, y - n.y * up, z - n.z * up); c.prev.set(c.p.x - (sh.p.x - sh.prev.x), c.p.y - (sh.p.y - sh.prev.y), c.p.z - (sh.p.z - sh.prev.z)); lift[i] = up; };   // it travels as the shoulders do
    if (maw.ext > 0 && maw.strikeTo) {   // struck out: the head is carried along the line to where it strikes, the neck spans from it to the shoulders
      const k = maw.ext / maw.reachMax, T = maw.strikeTo; _hp.x = lerp(_rh.x, T.x, k); _hp.y = lerp(_rh.y, T.y, k); _hp.z = lerp(_rh.z, T.z, k);
      for (let i = 0; i < ia; i++) { const t = i / ia; put(i, lerp(_hp.x, sh.p.x, t), lerp(_hp.y, sh.p.y, t), lerp(_hp.z, sh.p.z, t)); }
      for (let i = 0; i < ia; i++) b.rest[i] = hypot(C[i].p.x - C[i + 1].p.x, C[i].p.y - C[i + 1].p.y, C[i].p.z - C[i + 1].p.z);
      maw.nd = null; return;
    }
    // at rest it is set out along a direction that eases toward where it should point (its own rest lengths, a little arch)
    let tx = _rh.x - sh.p.x, ty = _rh.y - sh.p.y, tz = _rh.z - sh.p.z; const tl = hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const nd = maw.nd || (maw.nd = { x: tx, y: ty, z: tz }), k = min(1, h * (maw.state === "coil" ? 7 : 4.5));
    nd.x += (tx - nd.x) * k; nd.y += (ty - nd.y) * k; nd.z += (tz - nd.z) * k; const nl = hypot(nd.x, nd.y, nd.z) || 1; nd.x /= nl; nd.y /= nl; nd.z /= nl;
    { const up = nd.x * n.x + nd.y * n.y + nd.z * n.z, hor = sqrt(max(0.04, 1 - up * up)); for (let i = 0; i < ia; i++) b.rest[i] = b.rest0[i] * hor; }   // flat in the shoulders' surface the pieces lie closer: the body's own rest lengths follow
    let dist = 0; const D = []; for (let i = ia - 1; i >= 0; i--) { dist += b.rest0[i]; D[i] = dist; }
    for (let i = 0; i < ia; i++) { const arch = sin(PI * D[i] / L) * 0.08 * L; put(i, sh.p.x + nd.x * D[i] + n.x * arch, sh.p.y + nd.y * D[i] + n.y * arch, sh.p.z + nd.z * D[i] + n.z * arch); }
  }
  // after the body's step: raise the neck's pieces by their lift for the drawing, then put them back
  function showLift(maw) {
    const b = maw.body, C = b.chunks, ia = maw.ia, n = C[ia].n, lift = maw.lift || [], was = [];
    for (let i = 0; i < ia; i++) { const c = C[i], u = lift[i] || 0; was.push(c.p.x, c.p.y, c.p.z); c.p.x += n.x * u; c.p.y += n.y * u; c.p.z += n.z * u; }
    b.frames(); b.write(); maw.look.update(b.skel);
    for (let i = 0; i < ia; i++) C[i].p.set(was[i * 3], was[i * 3 + 1], was[i * 3 + 2]);
  }
  // the mouth's centre in walker space: just ahead of the head piece
  function mouthAt(maw, out) { const sg = maw.body.skel.segs[0], zf = maw.def.segs[0].half * 1.3; out.x = sg.o.x + sg.z.x * zf; out.y = sg.o.y + sg.z.y * zf; out.z = sg.o.z + sg.z.z * zf; return out; }

  function step(maw, dt) {
    const g = maw.guest; if (!g || !maw.body || dt <= 0) return;
    const sim = maw.sim, diet = maw.diet, h = maw.host, d = g.diet, I = maw.in;
    if (g.dead || !sim.fish.includes(g)) { detach(maw); return; }
    if (d && maw.tier != null && d.tier !== maw.tier) {   // it grew or starved a tier: a bigger or smaller body, and the newest growth is lost with a tier
      if (d.tier < maw.tier) shed(maw); maw.tier = d.tier; maw.U = U0 * (1 + RULES.grow * d.tier); build(maw); }
    maw.t += dt; if (maw.cool > 0) maw.cool -= dt;
    const b = maw.body, C = b.chunks, ia = maw.ia, hd = C[0].p;
    maw.neckLen = 0; for (let i = 0; i < ia; i++) maw.neckLen += b.rest0[i];
    const aimT = I.aim || I.move, fwdA = atan2(b.hdir.z, b.hdir.x), aimRaw = aimT ? atan2(aimT[1], aimT[0]) : fwdA;
    // soft lock-on: mark the nearest edible thing near the aim; while it coils, the aim leans toward it more the longer it holds
    let aimA = aimRaw; maw.lock = null;
    if ((maw.state === "walk" || maw.state === "coil") && !g.caught) {
      const sp = C[ia].p, lk = pickTarget(maw, aimRaw, maw.neckLen * (RULES.strike[0] + RULES.strike[1]), RULES.lock.cone);
      if (lk) { maw.lock = lk; if (maw.state === "coil") { fishPos(h, lk, _w); aimA = aimRaw + wrap(atan2(_w.z - sp.z, _w.x - sp.x) - aimRaw) * RULES.lock.assist * maw.charge; } } }
    maw.aimW = { x: cos(aimA), y: 0, z: sin(aimA) };
    // ---- the lunge: the body holds, the neck throws the head ----
    let move = null;
    if (maw.state === "walk") {
      move = g.caught ? null : I.move;
      let near = 1e9; const o = window.EcologySim.nearestFish(sim, g.x, g.y, mouthR(maw) * 6, (q) => edible(maw, q)); if (o) near = hypot(o.x - g.x, o.y - g.y) / (mouthR(maw) * 6);
      const want = 0.07 + 0.03 * sin(maw.t * 1.7) + (near < 1 ? 0.16 * (1 - near) : 0); maw.m += (want - maw.m) * min(1, 5 * dt);
      if (I.hold && maw.cool <= 0 && !g.caught) { maw.state = "coil"; maw.charge = 0; }
    } else if (maw.state === "coil") {
      maw.charge = min(1, maw.charge + dt / RULES.coil); maw.m += ((0.22 + 0.5 * maw.charge) - maw.m) * min(1, 9 * dt);
      if (g.caught) maw.state = "walk";
      else if (!I.hold) {
        if (maw.charge < RULES.minCharge) maw.state = "walk";
        else { const ch = maw.charge, reach = maw.neckLen * (RULES.strike[0] + RULES.strike[1] * ch), sh = C[ia].p;
          // what it goes for: the nearest thing it may eat in front of it that the neck can reach, up or down
          let best = maw.lock && edible(maw, maw.lock) ? maw.lock : null;    // the marked one, if the neck can still reach it at this charge
          if (best) { fishPos(h, best, _w); if (hypot(_w.x - sh.x, _w.y - sh.y, _w.z - sh.z) > maw.neckLen + reach + maw.Rmax * maw.U) best = null; }
          if (!best) best = pickTarget(maw, aimA, reach, RULES.cone);
          restHead(maw, maw.aimW, _rh);
          if (best) { fishPos(h, best, _w); const dx = _w.x - _rh.x, dy = _w.y - _rh.y, dz = _w.z - _rh.z, dl = hypot(dx, dy, dz) || 1, k = min(1, reach / dl); maw.strikeTo = { x: _rh.x + dx * k, y: _rh.y + dy * k, z: _rh.z + dz * k }; }
          else maw.strikeTo = { x: _rh.x + maw.aimW.x * reach, y: _rh.y - maw.neckLen * 0.15, z: _rh.z + maw.aimW.z * reach };
          maw.target = best; maw.reachMax = reach;
          const E = window.EcologyDiet; if (d && E) d.energy -= E.RULES.dash.cost * (RULES.cost[0] + RULES.cost[1] * ch);
          maw.cool = E ? E.RULES.dash.cool : 2.5; if (diet) diet.dashCool = maw.cool;
          maw.state = "lunge"; maw.st = 0; maw.ext = 1e-4; }
      }
    } else if (maw.state === "lunge") {
      maw.st += dt; maw.m += (1 - maw.m) * min(1, 30 * dt);
      const u = min(1, maw.st / RULES.out); maw.ext = max(1e-4, maw.reachMax * (1 - (1 - u) * (1 - u)));
      if (maw.st > RULES.out + RULES.hold) { maw.state = "miss"; maw.st = 0; }
    } else if (maw.state === "chew") {
      maw.st += dt; const t = maw.st; maw.m = t < 0.07 ? lerp(maw.m, 0, 0.6) : 0.02 + 0.16 * max(0, sin((t - 0.1) * 17)) * max(0, 1 - t / 0.75);
      if (t > 0.8) maw.state = "walk";
    } else if (maw.state === "miss") {
      maw.st += dt; maw.m += (0 - maw.m) * min(1, 30 * dt);
      if (maw.st > RULES.back + RULES.miss) maw.state = "walk";
    }
    if (maw.state !== "lunge" && maw.state !== "coil" && maw.ext > 0) { maw.ext = max(0, maw.ext - maw.reachMax * dt / RULES.back); if (maw.ext <= 0) { maw.strikeTo = null; maw.target = null; } }
    // ---- the person is its brain: somewhere to walk, or nowhere; coiled, it turns to face the aim where it stands ----
    // the target is on the surface under the head, so "close" means close along it (a head up in the air is not far from it)
    b.surf.project(hd.x, hd.y, hd.z, _P); const sx = _P.x, sy = _P.y, sz = _P.z;
    if (move) b.target.set(sx + move[0] * 40, sy, sz + move[1] * 40);
    else if (maw.state === "coil") b.target.set(sx + maw.aimW.x * b.def.stride * 0.5, sy, sz + maw.aimW.z * b.def.stride * 0.5);
    else b.target.set(sx + b.hdir.x * b.def.stride * 0.3, sy + b.hdir.y * b.def.stride * 0.3, sz + b.hdir.z * b.def.stride * 0.3);   // somewhere it is already facing, and close: it stands
    // ---- the body, a tick at a time, with the neck's pushes between ----
    const n = clamp(round(dt * 120), 1, 12), hs = dt / n;
    for (let i = 0; i < n; i++) { neck(maw, hs); b.step(hs); }
    showLift(maw);
    { const nn = C[ia].n; maw.lean += (acos(clamp(nn.y, -1, 1)) - maw.lean) * min(1, 6 * dt); }   // how far the body leans onto what it stands on: 0 flat, about 1.5 a wall
    // ---- whatever the open mouth meets, while it is thrown ----
    if (maw.state === "lunge") { mouthAt(maw, _m); const R = maw.Rmax * maw.U; let got = null;
      for (const q of sim.fish) { if (!edible(maw, q)) continue; fishPos(h, q, _w); if (hypot(_w.x - _m.x, _w.y - _m.y, _w.z - _m.z) < R * 0.95 + bodyLen(maw, q) * h.ks * 0.25) { got = q; break; } }
      if (got && !swallow(maw, got)) { maw.state = "miss"; maw.st = 0; } }
    // ---- a meal travels down, then shows ----
    maw.Rmax += (maw.RmaxT - maw.Rmax) * min(1, 2.2 * dt);
    for (const t of maw.teeth) t.grow = min(1, t.grow + dt);
    for (const bo of maw.bolus) { bo.t += dt; if (!bo.done && bo.t > 0.5) { bo.done = true; eaten(maw, bo.kind, bo.don); } }
    maw.bolus = maw.bolus.filter((bo) => bo.t < 1.1);
    // ---- the cost of a big body ----
    if (d) { const grown = maw.lv.reach + maw.lv.bulk + maw.lv.wide, E = window.EcologyDiet;
      if (grown && E && !g.caught) { const rec = E.describe(diet, g); if (rec) d.energy -= rec.upkeep / 60 * E.RULES.drain * dt * RULES.upkeep * grown; } }
    pin(maw, dt);
  }

  // ---- drawing: every line of it as segments in tank space ----
  // a tooth's drawing along its own long axis: [s, v, s, v, ...] pairs of segment ends, s 0..1 from root to tip, v across
  function toothArt(maw, id) {
    let A = maw.tooth.get(id); if (A) return A;
    const polys = lines(maw, id), pts = []; for (const pl of polys) for (let i = 0; i < pl.length; i += 2) pts.push([pl[i], pl[i + 1]]);
    const st = max(1, floor(pts.length / 160)), sm = pts.filter((_, i) => i % st === 0); let a = [0, 0], b = [0, 1], best = -1;
    for (let i = 0; i < sm.length; i++) for (let j = i + 1; j < sm.length; j++) { const dd = (sm[i][0] - sm[j][0]) ** 2 + (sm[i][1] - sm[j][1]) ** 2; if (dd > best) { best = dd; a = sm[i]; b = sm[j]; } }
    const L = sqrt(max(best, 1e-6)), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, wide = (e0, e1) => { let w = 0; for (const q of pts) { const t = ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy) / L; if (t >= e0 && t <= e1) w = max(w, abs(-(q[0] - a[0]) * uy + (q[1] - a[1]) * ux)); } return w; };
    const flip = wide(0.7, 1) > wide(0, 0.3), out = [];   // the thick end is the root
    const sv = (x, y) => { const s = ((x - a[0]) * ux + (y - a[1]) * uy) / L, v = (-(x - a[0]) * uy + (y - a[1]) * ux) / L; return flip ? [1 - s, -v] : [s, v]; };
    for (const pl of polys) for (let i = 0; i + 3 < pl.length; i += 2) out.push(...sv(pl[i], pl[i + 1]), ...sv(pl[i + 2], pl[i + 3]));
    A = new Float32Array(out); maw.tooth.set(id, A); return A;
  }
  function linesOf(maw) {
    const h = maw.host, b = maw.body, L = maw.look; if (!b || !L) return { data: maw.buf, verts: 0, batches: [] };
    let B = maw.buf, o = 0; const batches = (maw.batches.length = 0, maw.batches), ks = h.ks, tw2 = h.tw / 2, th2 = h.th / 2, fz = FLOOR * h.td;
    const room = (n) => { if (B.length < o + n * 4) { const nb = new Float32Array(Math.ceil((o + n * 4) * 1.5)); nb.set(B.subarray(0, o)); B = maw.buf = nb; } };
    const put = (x, y, z) => { B[o++] = x / ks + tw2; B[o++] = z / ks + th2; B[o++] = fz - y / ks; B[o++] = 1; };
    const batch = (color, start) => { const last = batches[batches.length - 1]; if (last && last.color === color) last.count = o / 4 - last.start; else batches.push({ start, count: o / 4 - start, color }); };
    // the body's pieces, each in its row's colour
    for (let gi = 0; gi < L.groups.length; gi++) { const m = L.groups[gi].matrix.elements, P = L.thin[gi], start = o / 4; room(P.length / 3);
      for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; put(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); }
      batch(maw.def.segs[gi].row.own || INK, start); }
    // the legs
    { const P = L.pos, cnt = min(L.limbs.geometry.drawRange.count, P.length / 3), start = o / 4; room(cnt); for (let i = 0; i < cnt * 3; i += 3) put(P[i], P[i + 1], P[i + 2]); batch(INK, start); }
    // the mouth: a ring standing on the front of the head, a throat behind it, the teeth round it
    const sg = b.skel.segs[0], hf = maw.def.segs[0].half, e = ease(clamp(maw.m, 0, 1)), U = maw.U, R = lerp(hf * 0.8, maw.Rmax * U, e), Ry = R * lerp(0.1, 0.85, e), zf = hf * 1.3;
    const at = (lx, ly, lz) => put(sg.o.x + sg.x.x * lx + sg.y.x * ly + sg.z.x * lz, sg.o.y + sg.x.y * lx + sg.y.y * ly + sg.z.y * lz, sg.o.z + sg.x.z * lx + sg.y.z * ly + sg.z.z * lz);
    const ring = (k, z, N) => { for (let i = 0; i < N; i++) { const a0 = i / N * TAU, a1 = (i + 1) / N * TAU; at(cos(a0) * R * k, sin(a0) * Ry * k, z); at(cos(a1) * R * k, sin(a1) * Ry * k, z); } };
    { const start = o / 4; room(28 * 2 + 12); ring(1, zf, 28); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + PI / 6; at(cos(a) * R, sin(a) * Ry, zf); at(cos(a) * R * 0.55, sin(a) * Ry * 0.55, zf - R * 0.6); } batch(INK, start); }
    if (e > 0.15) { const start = o / 4; room(40 * 2); ring(0.55, zf - R * 0.6, 20); ring(0.25, zf - R * 1.1, 14); batch(THROAT, start); }
    // teeth: rooted on the ring; shut they lie forward as a beak, open they point in across the mouth
    const tilt = (1 - e) * 1.25, ct = cos(tilt), stl = sin(tilt), byCol = new Map();
    for (const t of maw.teeth) { const k = t.own || INK; (byCol.get(k) || byCol.set(k, []).get(k)).push(t); }
    for (const [col, list] of byCol) { const start = o / 4;
      for (const t of list) { const A = toothArt(maw, t.id), ca = cos(t.a), sa = sin(t.a), len = min(t.len * U * min(1, t.grow) * lerp(0.5, 1, e), max(R, hf) * 0.98); room(A.length / 2);
        const rx = ca * R, ry = sa * Ry;            // root; in: toward the middle, tilted forward when shut; across: along the ring
        const ix = -ca * ct, iy = -sa * ct, iz = stl, cxx = -sa, cyy = ca;
        for (let i = 0; i < A.length; i += 2) { const s = A[i] * len, v = A[i + 1] * len; at(rx + ix * s + cxx * v, ry + iy * s + cyy * v, zf + iz * s); } }
      batch(col, start); }
    // coiled: where the strike will carry the mouth
    if (maw.state === "coil" && maw.charge > RULES.minCharge && maw.aimW) { const start = o / 4, reach = maw.neckLen * (RULES.strike[0] + RULES.strike[1] * maw.charge), a = maw.aimW, Rm = maw.Rmax * U; room(24);
      restHead(maw, a, _rh); const y = _rh.y - maw.neckLen * 0.1;
      for (let i = 0; i < 8; i++) { const s0 = (i + 0.2) / 8 * reach, s1 = (i + 0.7) / 8 * reach; put(_rh.x + a.x * s0, y, _rh.z + a.z * s0); put(_rh.x + a.x * s1, y, _rh.z + a.z * s1); }
      put(_rh.x + a.x * reach - a.z * Rm, y, _rh.z + a.z * reach + a.x * Rm); put(_rh.x + a.x * reach + a.z * Rm, y, _rh.z + a.z * reach - a.x * Rm); batch(GOLD, start); }
    return { data: B, verts: o / 4, batches };
  }
  // where a camera should look: the middle of the body on the ground, how long it is, which way it aims
  function view(maw) {
    const b = maw.body, h = maw.host; if (!b) return null; const C = b.chunks, sh = C[maw.ia], nx = C[min(C.length - 1, maw.ia + 1)], tl = C[C.length - 1];
    _w.x = (sh.p.x + nx.p.x) / 2; _w.y = (sh.p.y + tl.p.y) / 2; _w.z = (sh.p.z + nx.p.z) / 2; toTank(h, _w, _t);
    let len = 0; for (const r of b.rest0) len += r;
    const hx = b.hdir.x, hz = b.hdir.z; _w.x += hx * 10; _w.z += hz * 10; toTank(h, _w, _u);
    return { x: _t.x, y: _t.y, z: _t.z, len: len / h.ks, aim: maw.aimW ? [maw.aimW.x, maw.aimW.z] : [0, 0], coil: maw.state === "coil" ? maw.charge : 0, out: maw.ext > 0,
      hd: [_u.x - _t.x, _u.y - _t.y], lean: maw.lean, lock: maw.lock };
  }
  // the camera's wish for this moment, and the summit reveal. yawNow: the camera's heading now (rad, as the tank's orbit has it), so the swing can be a turn from it.
  // Returns { tilt (rad), dist (a multiple), rise (body lengths), dyaw (rad to add to the heading), hold (the swing is on: the player's controls stay as they were) }
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function shot(maw, dt, yawNow) {
    const S = RULES.shot, r = maw.rev, DEG = PI / 180; if (!maw.body) return { tilt: S.tilt * DEG, dist: 1, rise: 0, dyaw: 0, hold: false };
    const y = maw.body.chunks[maw.ia].p.y; let Lb = 0; for (const q of maw.body.rest0) Lb += q;
    if (r.cool > 0) r.cool -= dt;
    if (!r.on) {
      if (maw.lean > S.steep) { r.up += dt; r.flat = 0; if (r.low == null) r.low = y; }
      else if (maw.lean < S.flat) { r.flat += dt; if (r.up === 0) r.low = y;
        else if (r.flat > S.settle) {                        // back on the level after a climb: is this a summit?
          if (r.up >= S.climbT && r.low != null && y - r.low > S.gain * Lb && r.cool <= 0) {
            const v = view(maw), hx = v ? v.hd[0] : 0, hy = v ? v.hd[1] : 1;
            r.on = true; r.t = 0; r.cool = S.cool; r.dyaw = wrap(atan2(hx, hy) - yawNow); }   // looking back the way it came: the view runs against its heading
          r.up = 0; r.low = y; } }
    } else { r.t += dt; if (r.t >= S.dur) r.on = false; }
    const env = r.on ? sm(r.t / S.in) * (1 - sm((r.t - (S.dur - S.out)) / S.out)) : 0, c = sm((maw.lean - 0.35) / 0.75);
    const tilt = (S.tilt + (S.climbTilt - S.tilt) * c) * DEG * (1 - env) + S.revTilt * DEG * env;
    return { tilt, dist: 1 + S.dist * env, rise: S.rise * env, dyaw: r.on ? r.dyaw * env : 0, hold: r.on };
  }

  window.EcologyMaw = { create, attach, detach, relayout, input, step, lines: linesOf, view, shot, choose, need, edible, feed, reset, RULES, LEG };
})();
