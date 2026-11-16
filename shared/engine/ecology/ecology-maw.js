/* ecology-maw.js: the Maw, one of the tank's walkers that somebody (or something) drives.

   A mouth on a neck. A qilin's plan cut from kit parts: head, two neck rows, shoulders, back, haunch, tail, front and hind legs.
   It is the walker engine's creature, not a drawing of one:
     - CreatureBody moves it: chunk physics, feet stepped and solved by IK, standing on the tank floor and its towers
     - KitLook draws it: 3D line segments in the tank's own renderer (EcologyWalkers.lines), so depth, glow and Day and Night are the tank's
     - a guest creature of the tank (the diet's own) is pinned to it, so every rule of the tank applies to it
   The Maw adds one ability, the strike: hold to coil (the neck draws back, it turns on the spot to face the aim), let go and the
   neck stretches and throws the head. A mouth that touches prey takes hold through the guest (EcologySim.grab) and the tank runs the
   struggle and the meal. What it eats it wears: the donor's parts on new rows, tusks on the mouth.

   It is driven by commands, from a person (keys, a drag, a held button) or from its own brain (maw.auto = true): the same three
   things either way: a direction to walk, whether the strike is held, and where it is aimed.

     const maw = EcologyMaw.create({ parts, sheetOf, colorOf })
     EcologyMaw.attach(maw, sim, diet, hostCreature, walkersHost)    stands it in the tank (the host is its guest)
     EcologyMaw.input(maw, { hold, aim })   a person: hold the strike, aim [x, y] in tank space. The host's steer is the direction.
     EcologyMaw.step(maw, dt)               after EcologyWalkers.step
     EcologyMaw.detach(maw)
     EcologyMaw.stats(maw)                  what the brain and the body have done, for the simulations
     maw.auto = true                        its own brain drives (EcologyMaw.think)

   Classic script -> window.EcologyMaw. Needs EcologyWalkers, EcologySim, PartLib, LimbArt, CreatureBody. */
(function () {
  "use strict";
  const { abs, min, max, sqrt, hypot, sin, cos, atan2, PI, floor, exp } = Math, TAU = PI * 2;
  const clamp = (v, a, b) => max(a, min(b, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (u) => u * u * (3 - 2 * u);
  const KS = 0.0215, MOUTH = 0.85;                                      // walker units per design unit (the sheet's own scale)
  // strike: ext = how far the neck stretches, as a share of its length, at no charge and added at full charge
  // out, hold, back: seconds to throw, to hold it out and to draw back. cost: the energy a strike takes
  const RULES = { coil: 0.8, minCharge: 0.2, ext: [0.9, 1.3], pull: 0.22, out: 0.12, hold: 0.06, back: 0.34, miss: 0.45, chew: 0.3, cost: [0.4, 0.6], gate: 1.6, upkeep: 0.1, max: 3, thrust: 1.0, grip: 0.5, sight: 620, seeH: 4.5, reachH: 3.0, catchSp: 1.1 };

  // ---- the plan: rows from head to tail, in design units; legs are kit parts per bone ----
  const LEG = { front: { ids: ["P396", "P183", "P244"], ang: 62, len: 1.05 }, hind: { ids: ["P245", "P187", "P244"], ang: 116, len: 1.1 }, extra: { ids: ["P245", "P187", "P244"], ang: 90, len: 1.05 } };
  const row = (id, o) => Object.assign({ id, long: 0, wide: 0, up: 0, own: null, sides: [], legs: null, kind: "body" }, o);
  function plan() {
    return [row("P277", { long: 36, kind: "head" }), row("P280", { long: 27, kind: "neck" }), row("P280", { long: 27, kind: "neck" }),
      row("P246", { wide: 64, legs: "front" }), row("P253", { wide: 46 }), row("P251", { wide: 52, legs: "hind" }), row("P276", { long: 46, kind: "tail" })];
  }

  // ---- kit parts as outlines in the sheet frame ----
  const polysOf = (id) => (window.PartLib && window.PartLib.lines(id)) || [];
  function bbox(P) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const pl of P) for (let j = 0; j < pl.length; j += 2) { x0 = min(x0, pl[j]); x1 = max(x1, pl[j]); y0 = min(y0, pl[j + 1]); y1 = max(y1, pl[j + 1]); } return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; }
  // the long axis of a part, its thicker end first (the root)
  function axis(P) {
    const pts = []; for (const pl of P) for (let j = 0; j < pl.length; j += 2) pts.push([pl[j], pl[j + 1]]);
    const st = max(1, floor(pts.length / 220)), sm = pts.filter((_, i) => i % st === 0); let a = sm[0] || [0, 0], b = sm[1] || [0, 1], best = -1;
    for (let i = 0; i < sm.length; i++) for (let j = i + 1; j < sm.length; j++) { const d = (sm[i][0] - sm[j][0]) ** 2 + (sm[i][1] - sm[j][1]) ** 2; if (d > best) { best = d; a = sm[i]; b = sm[j]; } }
    const L = sqrt(best) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const width = (e0, e1) => { let w = 0; for (const q of pts) { const t = ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy) / L; if (t >= e0 && t <= e1) w = max(w, abs(-(q[0] - a[0]) * uy + (q[1] - a[1]) * ux)); } return w; };
    if (width(0.7, 1) > width(0, 0.3)) { const t = a; a = b; b = t; }
    return { a, b, L };
  }
  // a part laid with its root at `at`, its axis along `dir`, scaled to `len`
  function place(P, at, dir, len) {
    if (!P.length) return []; const A = axis(P), s = len / A.L, turn = atan2(dir[1], dir[0]) - atan2(A.b[1] - A.a[1], A.b[0] - A.a[0]), c = cos(turn), sn = sin(turn);
    return P.map((pl) => { const o = new Array(pl.length); for (let j = 0; j < pl.length; j += 2) { const dx = (pl[j] - A.a[0]) * s, dy = (pl[j + 1] - A.a[1]) * s; o[j] = at[0] + dx * c - dy * sn; o[j + 1] = at[1] + dx * sn + dy * c; } return o; });
  }
  // a centre part scaled to a length or a width and centred on the spine at (200, 0)
  function centred(id, long, wide) {
    const P = polysOf(id); if (!P.length) return null; const e = bbox(P), s = wide ? wide / max(1, e.w) : long / max(1, e.h);
    return { polys: P.map((pl) => { const o = new Array(pl.length); for (let j = 0; j < pl.length; j += 2) { o[j] = 200 + (pl[j] - e.cx) * s; o[j + 1] = (pl[j + 1] - e.cy) * s; } return o; }), w: e.w * s, h: e.h * s, R: max(e.w, e.h) * s / 2 };
  }

  // ---- the walker def, in the form SpeciesRig.def gives and CreatureBody and KitLook take ----
  function buildDef(maw) {
    const LA = window.LimbArt, rows = maw.rows, segs = [], legLens = [];
    rows.forEach((r) => {
      const c = centred(r.id, r.long, r.wide), seg = { h: 0, gap: 0, parts: [], legs: [], arms: [], cy: 0, zF: 0, zB: 0, r };
      segs.push(seg); r.c = c;
      const hl = c ? c.h / 2 : 12;
      seg.zF = hl * KS; seg.zB = -hl * KS; r.len = hl * 2;
      if (c) { const R = c.R; seg.parts.push({ polys: c.polys, cx: 200, cy: 0, k: KS, lift: (sx, sy) => { const q = hypot(sx - 200, sy) / R; return q < 1 ? R * 0.22 * sqrt(1 - q * q) * KS : 0; } }); }
      // side parts: the donor's blades, mirrored, laid from the edge of the plate
      for (const sd of r.sides || []) {
        const hw = c ? c.w / 2 * 0.8 : 10, P = place(polysOf(sd.id), [200 - hw, 0], [-sin(sd.ang), -cos(sd.ang)], sd.len);
        if (P.length) seg.parts.push({ polys: P, cx: 200, cy: 0, k: KS, mirror: true });
      }
      if (r.legs) {
        const K = LEG[r.legs], len = K.len * maw.U, fr = [0.36, 0.42, 0.22];
        seg.legs.push({ keepOwn: true, artObj: LA.segmentArt(K.ids.map((id) => polysOf(id)), fr), ang: K.ang, len, fracs: fr, reach: 0.78, knee: undefined, hip: [((c ? c.w / 2 : 14) * 0.7) * KS, 0.02, 0] });
        legLens.push(len);
      }
    });
    segs.forEach((s, i) => { if (i) s.gap = ((segs[i - 1].r.len + s.r.len) / 2 * 0.82) * KS; });
    const Lm = legLens.length ? legLens.slice().sort((a, b) => a - b)[legLens.length >> 1] : 1;
    segs.forEach((s) => { s.h = (s.r.kind === "head" ? 0.78 : s.r.kind === "neck" ? 0.7 : s.r.kind === "tail" ? 0.46 : 0.6) * Lm; });
    // the mouth: a ring of teeth and a throat, upright, facing forward from the head
    const head = segs[0], Rm = maw.mouthR / KS, zM = head.zF + 0.05 * maw.U;
    const ring = (R, n) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, b = (i + 1) / n * TAU; o.push(200 - R * cos(a), -R * sin(a), 200 - R * cos(b), -R * sin(b)); } return o; };
    head.parts.push({ polys: [ring(Rm, 20), ring(Rm * 0.6, 16), ring(Rm * 0.3, 12)], cx: 200, cy: 0, k: KS, upright: true, y: 0, z: zM });
    for (const t of maw.teeth) {
      const root = [200 - Rm * cos(t.a), -Rm * sin(t.a)], P = place(polysOf(t.id), root, [cos(t.a), sin(t.a)], min(t.len, Rm * 0.98));
      if (P.length) head.parts.push({ polys: P, cx: 200, cy: 0, k: KS, upright: true, y: 0, z: zM, mirror: false });
    }
    const len = segs.reduce((a, s, i) => a + (i ? s.gap : 0), 0) + segs[0].r.len * KS * 0.5 + segs[segs.length - 1].r.len * KS * 0.5;   // head to tail, walker units
    return { len, segs, smooth: true, flatLimbs: true, Lm, speed: 0.86 * Math.pow(Lm, 0.6), stride: 0.46 * Lm, lift: 0.3 * Lm, turn: 1.7, bob: 0.012, climb: true };
  }

  function create(opts) {
    opts = opts || {};
    const byId = Array.isArray(opts.parts) ? Object.fromEntries(opts.parts.map((p) => [p.id, p])) : (opts.parts || {});
    const bySheet = {}; for (const id in byId) { const p = byId[id]; (bySheet[p.species] || (bySheet[p.species] = [])).push(p); }
    const maw = { byId, bySheet, sheetOf: opts.sheetOf || (() => null), colorOf: opts.colorOf || (() => "#5BE39A"), host: null, sim: null, diet: null, hold: false, aim: null, auto: !!opts.auto, U: opts.scale || 0.8 };
    reset(maw); return maw;
  }
  function reset(maw) {
    Object.assign(maw, { rows: plan(), teeth: [], lv: { wide: 0, bulk: 0, reach: 0 }, grown: { wide: [], bulk: [], reach: [] }, mouthR: MOUTH, state: "walk", st: 0, t: 0, charge: 0, cool: 0, ext: 0, extGoal: 0, grab: null, struck: false, bolus: [], dirty: false,
      member: null, walkers: null, brain: { mode: "roam", target: null, t: 0, wp: null, hold: 0, ignore: new Map(), gap: 0, gapT: 0 }, stat: newStat() });
    for (let i = 0; i < 12; i++) { const big = i % 2 === 0; maw.teeth.push({ a: i / 12 * TAU + PI / 12, id: big ? (i % 4 === 0 ? "P258" : "P032") : "P244", len: big ? (i % 4 === 0 ? 32 : 28) : 16, own: null }); }
  }
  function newStat() { return { log: [], t: 0, strikes: 0, hits: 0, misses: 0, meals: 0, escaped: 0, walked: 0, floorErr: 0, floorN: 0, floorMax: 0, flee: 0, firstMeal: null, reachMax: 0 }; }

  // ---- what a meal gives: the donor's own parts, chosen by shape ----
  function donorParts(maw, sheet) {
    const list = (sheet && maw.bySheet[sheet] || []).filter((p) => String(p.svg).length < 12000 && min(+p.w, +p.h) > 4 && max(+p.w, +p.h) > 14);
    const isC = (p) => p.side === "center" || p.side === "c", centre = list.filter(isC), side = list.filter((p) => !isC(p));
    const spine = centre.slice().sort((a, b) => abs(max(+a.w, +a.h) - 46) - abs(max(+b.w, +b.h) - 46))[0];
    const long = side.slice().sort((a, b) => max(+b.w, +b.h) - max(+a.w, +a.h)), slim = long.slice().sort((a, b) => (max(+b.w, +b.h) ** 2) / (+b.w * +b.h) - (max(+a.w, +a.h) ** 2) / (+a.w * +a.h));
    return { spine: spine ? spine.id : null, side: long[0] ? long[0].id : null, side2: long[1] ? long[1].id : null, tooth: slim[0] ? slim[0].id : null };
  }
  const kindOf = (move) => (move === "wing" ? "reach" : move === "leg" || move === "claw" ? "bulk" : "wide");
  const LABEL = { reach: "a longer neck", bulk: "a body row and two legs", wide: "tusks" };
  function give(maw, kind, don) {
    const lv = maw.lv, rows = maw.rows, col = don.col, name = don.name || "its meal", P = donorParts(maw, don.sheet);
    const spineId = P.spine || { reach: "P594", bulk: "P259", wide: null }[kind], sideId = P.side || { reach: "P578", bulk: "P261", wide: "P028" }[kind], toothId = P.tooth || P.side || "P026";
    const side = (id, len, ang) => ({ id, len, ang, own: col });
    note(maw, "graft", "The Maw grew " + LABEL[kind] + " from " + name);
    if (lv[kind] >= RULES.max) {
      const old = maw.grown[kind].shift(); maw.grown[kind].push(old);
      if (kind === "wide") { for (const t of old) { t.id = toothId; t.own = col; } }
      else { if (spineId) old.id = spineId; old.own = col; old.sides = sideId ? [side(sideId, old.sides[0] ? old.sides[0].len : 70, old.sides[0] ? old.sides[0].ang : 2.3)] : []; }
      maw.dirty = true; return;
    }
    const n = ++lv[kind];
    if (kind === "reach") { const at = rows.findIndex((r) => r.legs === "front"), r = row(spineId, { wide: 38, own: col, kind: "neck", sides: sideId ? [side(sideId, [88, 66, 74][n - 1], [2.3, 1.9, 2.55][n - 1])] : [] }); rows.splice(at, 0, r); maw.grown.reach.push(r); }
    else if (kind === "bulk") { const at = rows.findIndex((r) => r.legs === "hind"), r = row(spineId, { long: 40, own: col, legs: "extra", sides: sideId ? [side(sideId, [66, 58, 62][n - 1], [2.5, 2.3, 2.65][n - 1])] : [] }); rows.splice(at, 0, r); maw.grown.bulk.push(r); }
    else { const set = []; for (let i = 0; i < 4; i++) { const t = { a: i / 4 * TAU + n * PI / 6 + PI / 4, id: toothId, len: 38 + 4 * n, own: col }; maw.teeth.push(t); set.push(t); } maw.mouthR = MOUTH * (1 + 0.16 * n); maw.grown.wide.push(set); if (n === 1 && P.side2) rows[0].sides.push(side(P.side2, 54, 1.15)); }
    maw.dirty = true;
  }
  function shed(maw) {
    const order = ["reach", "bulk", "wide"].filter((k) => maw.lv[k] > 0); if (!order.length) return;
    const kind = order.sort((a, b) => maw.lv[b] - maw.lv[a])[0], last = maw.grown[kind].pop(); maw.lv[kind]--;
    if (kind === "wide") { maw.teeth = maw.teeth.filter((t) => !last.includes(t)); maw.mouthR = MOUTH * (1 + 0.16 * maw.lv.wide); if (!maw.lv.wide) maw.rows[0].sides.length = 0; }
    else maw.rows = maw.rows.filter((r) => r !== last);
    maw.dirty = true; note(maw, "shed", "The Maw shed " + LABEL[kind]);
  }
  function note(maw, kind, text) { const d = maw.diet; if (d && d.events) { d.events.push({ kind, f: maw.host, text, t: d.t }); if (d.events.length > 40) d.events.shift(); } }

  // ---- the host: its guest in the tank ----
  const ks = (maw) => maw.walkers.ks;
  function attach(maw, sim, diet, f, walkers) {
    detach(maw); reset(maw);
    Object.assign(maw, { sim, diet, host: f, tier: f.diet ? f.diet.tier : null, walkers });
    f.hidden = true; f.maw = true;
    if (f.diet) { f.diet.gut = []; f.diet.traits = []; f.diet.offers = null; f.diet.wait = 0; }
    const H = sim.hooks, was = { onMeal: H.onMeal }; maw.was = was;
    H.onMeal = (pred, prey) => { if (was.onMeal) was.onMeal(pred, prey); if (pred === maw.host) ate(maw, prey); };
    maw.def = buildDef(maw);
    maw.member = window.EcologyWalkers.addPlayer(walkers, { def: maw.def, guest: f, name: "The Maw", color: [0.93, 0.91, 0.87], yaw: f.ang != null ? PI / 2 - f.ang : 0 });
    maw.member.maw = maw; maw.stat = newStat();
  }
  function detach(maw) {
    if (!maw.host) return; const H = maw.sim.hooks;
    if (maw.was) H.onMeal = maw.was.onMeal;
    if (maw.member && maw.walkers) window.EcologyWalkers.removePlayer(maw.walkers, maw.member);
    maw.host.hidden = false; maw.host.maw = false; maw.host = null; maw.was = null; maw.member = null;
  }
  const bodyLen = (maw, o) => window.EcologySim.bodyLen(maw.sim, o);
  const mouthTank = (maw) => maw.mouthR / ks(maw);
  const fits = (maw, o) => bodyLen(maw, o) <= 2 * mouthTank(maw) * RULES.gate;
  // may the Maw eat o: the diet's rules for a creature played by hand, its host's own kind included, and only what the mouth takes in
  function edible(maw, o) {
    const f = maw.host, H = maw.sim.hooks; if (!o || o === f || o.dead || o.caught || o.guest || !o.diet || o.fade < 0.6) return false;
    const r = H.eats ? H.eats(f, o) : undefined;
    if (r === false && !(o.sp === f.sp && (!H.canEat || H.canEat(f, o)))) return false;
    return fits(maw, o);
  }
  function ate(maw, prey) {
    const sim = maw.sim, tag = maw.diet && maw.diet.tag ? maw.diet.tag[prey.sp] : { move: "shoal" }, name = sim.speciesRT[prey.sp].name;
    maw.bolus.push({ t: 0, kind: kindOf(tag.move), don: { sheet: maw.sheetOf(name), col: maw.colorOf(prey.sp), name } });
    maw.state = "chew"; maw.st = 0; maw.stat.meals++; if (maw.stat.firstMeal == null) maw.stat.firstMeal = maw.stat.t;
  }
  function feed(maw, sp) { const sim = maw.sim; if (!sim) return; const tag = maw.diet && maw.diet.tag ? maw.diet.tag[sp] : { move: "shoal" }, name = sim.speciesRT[sp].name; maw.bolus.push({ t: 0, kind: kindOf(tag.move), don: { sheet: maw.sheetOf(name), col: maw.colorOf(sp), name } }); }
  function input(maw, i) { if (i.hold != null) maw.hold = !!i.hold; if ("aim" in i) maw.aim = i.aim && (i.aim[0] || i.aim[1]) ? i.aim : null; }

  // ---- the strike ----
  const body = (maw) => maw.member.body;
  const neckLinks = (maw) => maw.rows.findIndex((r) => r.legs === "front");   // links head..shoulders: rest[0 .. n-1]
  function baseRest(maw) { const b = body(maw); if (!maw.rest0 || maw.rest0.length !== b.rest.length || maw.restFor !== b) { maw.rest0 = b.rest.slice(); maw.restFor = b; } return maw.rest0; }
  const neckLen = (maw) => { const r = baseRest(maw); let s = 0; for (let i = 0; i < neckLinks(maw); i++) s += r[i]; return s; };
  const reachOf = (maw, ch) => neckLen(maw) * (1 + RULES.ext[0] + RULES.ext[1] * ch);
  function setExt(maw, e) {   // the neck's links stretched (or drawn back) by a share of their length
    const b = body(maw), r0 = baseRest(maw), n = neckLinks(maw); maw.ext = e;
    for (let i = 0; i < n && i < b.rest.length; i++) b.rest[i] = r0[i] * max(0.4, 1 + e);
  }
  const headP = (maw) => body(maw).chunks[0].p;
  const _m = { x: 0, y: 0, z: 0 }, _q = { x: 0, y: 0, z: 0 };
  function mouthPoint(maw, out) { const b = body(maw), h = b.chunks[0].p, d = b.hdir, f = maw.def.segs[0].zF + 0.05 * maw.U; out.x = h.x + d.x * f; out.y = h.y + d.y * f; out.z = h.z + d.z * f; return out; }
  function touch(maw) {
    const sim = maw.sim, wk = maw.walkers, k = ks(maw); mouthPoint(maw, _m); let best = null, bd = 1e9;
    for (const o of sim.fish) { if (!edible(maw, o)) continue;
      window.EcologyWalkers.fishPos(wk, o, _q); const r = maw.mouthR * 1.25 + 0.5 * bodyLen(maw, o) * k * 0.55, d = hypot(_q.x - _m.x, _q.y - _m.y, _q.z - _m.z);
      if (d < r && d < bd) { bd = d; best = o; } }
    return best;
  }
  function takeHold(maw, o) {
    const f = maw.host, H = maw.sim.hooks; if (H.onCatch && H.onCatch(f, o) === false) return false;
    if (!window.EcologySim.grab(maw.sim, f, o)) return false;
    maw.grab = o; o.escMul0 = o.escMul; o.escMul = (o.escMul || 1) * RULES.grip; maw.stat.hits++; return true;   // its teeth have it: it is harder to twist free of
  }

  // ---- commands: from a person or from the brain ----
  function command(maw, dt) {
    if (maw.auto) return think(maw, dt);
    const f = maw.host; let aim = null;
    if (maw.aim) { const l = hypot(maw.aim[0], maw.aim[1]) || 1; aim = [maw.aim[0] / l, maw.aim[1] / l]; }
    return { dir: f.steer ? [f.steer.x, f.steer.y] : null, hold: maw.hold, aim, up: 0 };
  }

  function step(maw, dt) {
    const f = maw.host; if (!f || dt <= 0 || !maw.member) return;
    const sim = maw.sim, st = maw.stat, d = f.diet;
    if (f.dead || !sim.fish.includes(f)) { detach(maw); return; }
    if (dt > 0.1) dt = 0.1;
    maw.t += dt; st.t += dt; if (maw.cool > 0) maw.cool -= dt;
    // a growth or a shed: the same walker with a new plan, where it stands
    if (maw.dirty) { maw.dirty = false; maw.def = buildDef(maw); window.EcologyWalkers.rebuild(maw.walkers, maw.member, maw.def); maw.rest0 = null; return; }
    const b = body(maw), h = b.chunks[0].p; baseRest(maw);
    for (const q of maw.bolus) { q.t += dt; if (!q.done && q.t > 0.6) { q.done = true; give(maw, q.kind, q.don); } } maw.bolus = maw.bolus.filter((q) => !q.done);
    maw.free = maw.state === "walk";
    const cmd = command(maw, dt), aim = cmd.aim || cmd.dir;
    let ax, az; if (aim) { const l = hypot(aim[0], aim[1]) || 1; ax = aim[0] / l; az = aim[1] / l; } else { ax = b.hdir.x; az = b.hdir.z; const l = hypot(ax, az) || 1; ax /= l; az /= l; }
    // a target is a point on the ground: for a climber the engine measures how far it has to go from the surface under its head
    const gnd = (x, z) => maw.walkers.W.H(x, z), target = { set(x, y, z) { b.target.set(x, gnd(x, z), z); }, copy(q) { b.target.set(q.x, gnd(q.x, q.z), q.z); } };
    if (maw.state === "walk") {
      if (maw.ext !== 0) setExt(maw, maw.ext * exp(-8 * dt));
      if (cmd.dir) target.set(h.x + cmd.dir[0] * 4, h.y, h.z + cmd.dir[1] * 4); else target.copy(h);
      if (cmd.hold && maw.cool <= 0 && !f.caught) { maw.state = "coil"; maw.charge = 0; maw.st = 0; }
    } else if (maw.state === "coil") {
      maw.charge = min(1, maw.charge + dt / RULES.coil);
      target.set(h.x + ax * 0.3, h.y, h.z + az * 0.3);      // turns on the spot to face the aim
      setExt(maw, lerp(maw.ext, -RULES.pull * ease(maw.charge), min(1, 10 * dt)));
      if (f.caught) maw.state = "walk";
      else if (!cmd.hold) {
        if (maw.charge >= RULES.minCharge) {
          maw.state = "strike"; maw.st = 0; maw.strikeAim = [ax, az]; maw.strikeUp = clamp(cmd.up || 0, -0.4, 1); maw.extGoal = RULES.ext[0] + RULES.ext[1] * maw.charge; st.strikes++; maw.slog = { t: st.t, charge: maw.charge, d: maw.brain.dist != null ? maw.brain.dist : null, hit: false };
          if (d) d.energy = max(0, d.energy - (RULES.cost[0] + RULES.cost[1] * maw.charge));
        } else { maw.state = "walk"; maw.cool = 0.15; }
      }
    } else if (maw.state === "strike") {
      maw.st += dt; const R = RULES, E = maw.extGoal, [sx, sz] = maw.strikeAim;
      target.copy(h);
      if (maw.st < R.out) { setExt(maw, lerp(maw.ext, E, min(1, dt / (R.out * 0.45)))); b.poke(0, { x: sx * R.thrust * E * 8, y: 0.4 + maw.strikeUp * R.thrust * E * 10, z: sz * R.thrust * E * 8 }); }
      else if (maw.st < R.out + R.hold) setExt(maw, maw.ext);
      else setExt(maw, lerp(maw.ext, 0, min(1, dt / (R.back * 0.4))));
      if (!maw.grab && maw.st < R.out + R.hold + R.back * 0.35) { const o = touch(maw); if (o && takeHold(maw, o)) { maw.state = "chew"; maw.st = 0; if (maw.slog) maw.slog.hit = true; } }
      const mid = b.chunks[b.chunks.length >> 1].p; st.reachMax = max(st.reachMax, hypot(h.x - mid.x, h.z - mid.z));
      if (maw.state === "strike" && maw.st > R.out + R.hold + R.back) { maw.state = "walk"; maw.cool = R.miss; st.misses++; setExt(maw, 0); }
      if (maw.slog && (maw.state !== "strike")) { st.log.push(maw.slog); maw.slog = null; }
    } else if (maw.state === "chew") {
      maw.st += dt; target.copy(h); setExt(maw, maw.ext * exp(-6 * dt));
      const held = f.holding && !f.holding.dead && f.holding.caught === f;
      if (!held && maw.st > RULES.chew) { if (maw.grab && !maw.grab.dead && sim.fish.includes(maw.grab)) st.escaped++; if (maw.grab) maw.grab.escMul = maw.grab.escMul0; maw.grab = null; maw.state = "walk"; maw.cool = 0.25; }
    }
    // what the body is doing, for the simulations
    const v = b.vel ? b.vel(b.chunks[0]) : null; if (v) st.walked += hypot(v.x, v.z) * dt;
    const g = maw.walkers.W.H(h.x, h.z), above = h.y - g - maw.def.segs[0].h; st.floorN++; st.floorErr += abs(above); st.floorMax = max(st.floorMax, abs(above));
  }

  // ---- the brain: it drives the Maw as a person does ----
  // roam, stalk a creature it can eat, coil when it is in reach, let go, recover; run from what hunts it
  function hAbove(maw, o) { window.EcologyWalkers.fishPos(maw.walkers, o, _q); return _q.y; }
  function think(maw, dt) {
    const br = maw.brain, f = maw.host, sim = maw.sim, wk = maw.walkers, k = ks(maw), h = headP(maw), Wd = wk.W, out = { dir: null, hold: false, aim: null }, S = maw.member.S;
    br.t += dt; for (const [o, t] of br.ignore) { if (t - dt <= 0) br.ignore.delete(o); else br.ignore.set(o, t - dt); }
    const hx = h.x / k + wk.tw / 2, hy = h.z / k + wk.th / 2, nl = neckLen(maw), rMax = reachOf(maw, 1) * 0.92;
    const walkTo = (tx, ty) => {   // a direction in tank space, round the walls when it cannot see the way
      let wx = (tx - wk.tw / 2) * k, wz = (ty - wk.th / 2) * k;
      if (Wd && Wd.nav && !Wd.nav.see(h.x, h.z, wx, wz)) { const p = Wd.nav.path(h.x, h.z, wx, wz); if (p && p.length > 1) { wx = p[1][0]; wz = p[1][1]; } }
      const dx = wx - h.x, dz = wz - h.z, l = hypot(dx, dz) || 1; return [dx / l, dz / l];
    };
    const speed = (v) => { S.speed = v; };
    // 1. what hunts it: run
    let threat = null, td = 1e9;
    for (const q of window.EcologySim.hunts(sim)) if (q.prey === f && q.hunter !== f) { const d = hypot(q.hunter.x - hx, q.hunter.y - hy); if (d < td) { td = d; threat = q.hunter; } }
    if (threat && !f.caught && maw.state === "walk") { br.mode = "flee"; speed(2.2); const dx = hx - threat.x, dy = hy - threat.y, l = hypot(dx, dy) || 1; out.dir = [dx / l, dy / l]; maw.stat.flee += dt; return out; }
    if (br.mode === "flee") br.mode = "roam";
    // 2. mid-strike or chewing: it only waits
    if (maw.state === "strike" || maw.state === "chew") { speed(1); return out; }
    // 3. what it can see: how far, how high, how fast. Reach first: anything already in reach is struck at, whatever else it was after
    const lead = 0.5, cands = [];
    for (const o of sim.fish) {
      if (!edible(maw, o) || br.ignore.has(o)) continue;
      const a = hAbove(maw, o); if (a > RULES.seeH || a < -0.4) continue;
      const px = o.x + (o.vx || 0) * lead, py = o.y + (o.vy || 0) * lead, dx = px - hx, dy = py - hy, dl = hypot(dx, dy) || 1, d = dl * k, sp = hypot(o.vx || 0, o.vy || 0) * k;
      if (dl > RULES.sight) continue; cands.push({ o, px, py, dx, dy, dl, d, a, sp });
    }
    const headH = maw.def.segs[0].h; for (const q of cands) { q.up = q.a - headH; q.d3 = hypot(q.d, max(0, q.up)); }
    const inReach = cands.filter((c) => c.d3 <= rMax && c.a <= RULES.reachH).sort((p, q) => p.d3 - q.d3)[0];
    const stalkable = cands.filter((c) => c.sp < RULES.catchSp).sort((p, q) => (p.d + 3 * p.a + 4 * p.sp) - (q.d + 3 * q.a + 4 * q.sp))[0];
    let c = null;
    if (maw.state === "coil" && br.target) c = cands.find((q) => q.o === br.target) || null;   // keeps to the one it is coiled on while it is still there
    if (!c) c = inReach || stalkable || null;
    if (c) {
      if (br.target !== c.o) { br.target = c.o; br.t = 0; br.hold = 0; br.gap = c.d; br.gapT = 0; }
      br.dist = c.d3; out.aim = [c.dx / c.dl, c.dy / c.dl]; out.up = clamp(c.up / max(0.5, c.d3), -0.4, 1);
      if (maw.state === "coil") {   // the charge it wants for this distance; let go when it has it, or the prey has left reach
        const want = clamp((c.d3 - 0.1 - nl * (1 + RULES.ext[0])) / (nl * RULES.ext[1]), RULES.minCharge + 0.04, 1);
        br.hold += dt; speed(1); out.hold = !(maw.charge >= want) && c.d3 < rMax * 1.12 && br.hold < 1.5; if (!out.hold && maw.charge < want) br.ignore.set(c.o, 3); return out;
      }
      if (c.d3 <= rMax && c.a <= RULES.reachH) { speed(1); br.mode = "aim"; if (maw.cool <= 0) { out.hold = true; br.hold = 0; } return out; }   // in reach: coil
      // closing in: if the gap is not shrinking, it is a chase it cannot win
      br.gapT += dt; if (br.gapT > 2.5) { if (c.d > br.gap - 0.6) { br.ignore.set(c.o, 8); br.target = null; return out; } br.gap = c.d; br.gapT = 0; }
      br.mode = "stalk"; speed(1.5); out.dir = walkTo(c.px, c.py); return out;
    }
    br.target = null;
    // 4. nothing to eat in reach: go where prey is, slowly, and wait there. Roam to a point near a creature it could eat, else anywhere
    br.mode = "roam"; speed(0.9);
    if (!br.wp || br.t > 8 || hypot(br.wp[0] - hx, br.wp[1] - hy) * k < 0.8) {
      br.t = 0; let wp = null;
      const pool = sim.fish.filter((o) => edible(maw, o) && hAbove(maw, o) < 2.6); if (pool.length && Math.random() < 0.7) { const o = pool[(Math.random() * pool.length) | 0]; wp = [o.x, o.y]; }
      if (!wp) { const w = Wd && Wd.nav ? Wd.nav.random(Math.random) : null; wp = w ? [w[0] / k + wk.tw / 2, w[1] / k + wk.th / 2] : [hx + 200, hy]; }
      br.wp = wp;
    }
    out.dir = walkTo(br.wp[0], br.wp[1]); return out;
  }

  function stats(maw) { const s = maw.stat, n = max(1, s.floorN); return Object.assign({}, s, { floorErrMean: s.floorErr / n, hitRate: s.strikes ? s.hits / s.strikes : 0 }); }
  function draw() {}   // the tank draws it (EcologyWalkers.lines)

  window.EcologyMaw = { create, attach, detach, input, step, draw, feed, reset, think, stats, edible, reachOf, neckLen, buildDef, RULES, LEG };
})();
