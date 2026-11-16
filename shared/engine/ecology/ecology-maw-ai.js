/* ecology-maw-ai.js: a brain for the Maw. It drives it the way a person does, through EcologyMaw.input: a heading to walk,
   a heading to face, and whether the lunge key is held. Nothing here moves the body; the walker engine does that.

   What it does, in order each tick:
     flee     something is hunting it: walk away from the hunter, faster
     wait     it is mid-lunge or chewing: it keeps still
     strike   anything it may eat is already in the neck's reach: face it, coil, let go at the charge the distance needs
     stalk    a creature it can catch (slow, low, near): walk at it, round the walls. A chase that is not closing is dropped
     roam     nothing to eat in sight: walk to where creatures are (or anywhere) and wait there
   It is an ambusher. It does not chase what swims faster than it walks; it goes where prey will pass and strikes what comes.

     const ai = EcologyMawAI.create({ seed? })
     EcologyMawAI.step(ai, maw, dt)       before EcologyMaw.step(maw, dt), once a tick: it calls EcologyMaw.input
     EcologyMawAI.stats(ai)               { t, strikes, hits, misses, flee, meals, firstMeal, modes, log: [{ t, charge, d, hit }] }
     EcologyMawAI.reset(ai)

   Classic script -> window.EcologyMawAI. Needs EcologyMaw (and what it needs), EcologySim. */
(function () {
  "use strict";
  const { min, max, hypot, abs } = Math, clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const FLOOR = 0.97;
  // tune here: sight in tank units; the fastest prey it will walk after, in walker units a second; how high and how far it will strike
  const P = { sight: 900, catchSp: 1.1, lead: 0.5, giveUp: 2.5, ignore: 8, holdMax: 1.5, strikeFrac: 0.92, stalkSpeed: 1.5, roamSpeed: 1.3, fleeSpeed: 2.2, maxUp: 4.5 };

  function create(opts) { const ai = Object.assign({ P: Object.assign({}, P, (opts && opts.P) || {}) }, opts || {}); reset(ai); return ai; }
  function reset(ai) {
    Object.assign(ai, { mode: "roam", target: null, t: 0, wp: null, hold: 0, gap: 0, gapT: 0, ignore: new Map(), dist: null, was: "walk", slog: null, want: 0,
      stat: { t: 0, strikes: 0, hits: 0, misses: 0, flee: 0, meals: 0, firstMeal: null, modes: {}, log: [] } });
  }
  const fishPos = (h, f) => ({ x: (f.x - h.tw / 2) * h.ks, y: (FLOOR - f.z) * h.td * h.ks, z: (f.y - h.th / 2) * h.ks });

  function step(ai, maw, dt) {
    if (!maw || !maw.guest || !maw.body || dt <= 0) return;
    const out = think(ai, maw, dt); window.EcologyMaw.input(maw, { move: out.move, aim: out.aim, hold: out.hold });
    // what it did, for the simulations: a strike is a coil let go; a hit is a meal; a miss is a lunge that caught nothing
    const S = ai.stat, st = maw.state; S.t += dt; S.modes[ai.mode] = (S.modes[ai.mode] || 0) + dt;
    if (ai.was === "coil" && st === "lunge") { S.strikes++; ai.slog = { t: S.t, charge: maw.charge, d: ai.dist, hit: false }; }
    if (ai.was !== "chew" && st === "chew") { S.hits++; S.meals++; if (S.firstMeal == null) S.firstMeal = S.t; if (ai.slog) { ai.slog.hit = true; S.log.push(ai.slog); ai.slog = null; } }
    if (ai.was === "lunge" && st === "miss") { S.misses++; if (ai.slog) { S.log.push(ai.slog); ai.slog = null; } }
    ai.was = st;
  }

  function think(ai, maw, dt) {
    const p = ai.P, g = maw.guest, h = maw.host, sim = maw.sim, ks = h.ks, W = h.W, b = maw.body, E = window.EcologyMaw, out = { move: null, aim: null, hold: false };
    ai.t += dt; for (const [o, t] of ai.ignore) { if (t - dt <= 0) ai.ignore.delete(o); else ai.ignore.set(o, t - dt); }
    const sh = b.chunks[maw.ia].p, hd = b.chunks[0].p, set = (v) => { b.S.speed = v; };
    // a heading in the tank from the head to a place in the tank, round the walls when it cannot see the way
    const headTo = (tx, ty) => {
      let wx = (tx - h.tw / 2) * ks, wz = (ty - h.th / 2) * ks;
      if (W && W.nav && !W.nav.see(hd.x, hd.z, wx, wz)) { const q = W.nav.path(hd.x, hd.z, wx, wz); if (q && q.length > 1) { wx = q[1][0]; wz = q[1][1]; } }
      const dx = wx - hd.x, dz = wz - hd.z, l = hypot(dx, dz) || 1; return [dx / l, dz / l];
    };
    // 1. flee what hunts it
    let threat = null, td = 1e9;
    for (const q of window.EcologySim.hunts(sim)) if (q.prey === g && q.hunter !== g) { const d = hypot(q.hunter.x - g.x, q.hunter.y - g.y); if (d < td) { td = d; threat = q.hunter; } }
    if (threat && !g.caught && maw.state === "walk") { ai.mode = "flee"; set(p.fleeSpeed); const dx = g.x - threat.x, dy = g.y - threat.y, l = hypot(dx, dy) || 1; out.move = [dx / l, dy / l]; ai.stat.flee += dt; return out; }
    // 2. mid-lunge or chewing: it keeps still
    if (maw.state === "lunge" || maw.state === "chew" || maw.state === "miss") { set(1); ai.mode = maw.state; return out; }
    // 3. what it can see: how far, how high, how fast
    const R = maw.Rmax * maw.U, L = maw.neckLen || 1, S0 = 1.2, S1 = 1.6, minCh = 0.2;       // the module's strike: reach from the shoulders = neck + neck * (S0 + S1 * charge) + the mouth
    const full = L * (1 + S0 + S1) + R, cands = [];   // the module accepts prey up to neckLen + reach + the mouth from the shoulders
    for (const o of sim.fish) {
      if (!E.edible(maw, o) || ai.ignore.has(o)) continue;
      const lx = o.x + (o.vx || 0) * p.lead, ly = o.y + (o.vy || 0) * p.lead; if (hypot(lx - g.x, ly - g.y) > p.sight) continue;
      const w = fishPos(h, o), up = w.y - sh.y, dh = hypot((lx - h.tw / 2) * ks - sh.x, (ly - h.th / 2) * ks - sh.z), d3 = hypot(dh, up), sp = hypot(o.vx || 0, o.vy || 0) * ks;
      if (w.y > p.maxUp + 1) continue;
      cands.push({ o, lx, ly, up, dh, d3, sp, a: w.y });
    }
    const inReach = cands.filter((c) => c.d3 <= full * p.strikeFrac && abs(c.up) <= L * 2.2).sort((x, y) => x.d3 - y.d3)[0];
    const stalkable = cands.filter((c) => c.sp < p.catchSp && c.a <= p.maxUp).sort((x, y) => (x.dh + 3 * x.a + 4 * x.sp) - (y.dh + 3 * y.a + 4 * y.sp))[0];
    let c = null;
    if (maw.state === "coil" && ai.target) c = cands.find((q) => q.o === ai.target) || null;   // it keeps to the one it is coiled on while it is there
    if (!c) c = inReach || stalkable || null;
    if (c) {
      if (ai.target !== c.o) { ai.target = c.o; ai.t = 0; ai.hold = 0; ai.gap = c.dh; ai.gapT = 0; }
      ai.dist = c.d3;
      const dx = c.lx - g.x, dy = c.ly - g.y, dl = hypot(dx, dy) || 1; out.aim = [dx / dl, dy / dl];
      // the charge that reaches it: the neck's own reach is L + L * (S0 + S1 * charge) + the mouth
      const want = clamp(((c.d3 - R) / L - 1 - S0) / S1 + 0.06, minCh + 0.04, 1); ai.want = want;
      if (maw.state === "coil") {
        ai.hold += dt; set(1); ai.mode = "strike";
        out.hold = maw.charge < want && c.d3 < full * 1.1 && ai.hold < p.holdMax;
        if (!out.hold && maw.charge < want) ai.ignore.set(c.o, 3);   // it ran out of reach while it coiled
        return out;
      }
      if (c.d3 <= full * p.strikeFrac && abs(c.up) <= L * 2.2) { set(1); ai.mode = "strike"; if (maw.cool <= 0) { out.hold = true; ai.hold = 0; } return out; }
      // closing in: a gap that is not shrinking is a chase it cannot win
      ai.gapT += dt; if (ai.gapT > p.giveUp) { if (c.dh > ai.gap - 0.6) { ai.ignore.set(c.o, p.ignore); ai.target = null; return out; } ai.gap = c.dh; ai.gapT = 0; }
      ai.mode = "stalk"; set(p.stalkSpeed); out.move = headTo(c.lx, c.ly); return out;
    }
    ai.target = null;
    // 4. nothing to eat in reach: go where creatures are, slowly, and wait there
    ai.mode = "roam"; set(p.roamSpeed);
    const hx = hd.x / ks + h.tw / 2, hy = hd.z / ks + h.th / 2;
    if (!ai.wp || ai.t > 8 || hypot(ai.wp[0] - hx, ai.wp[1] - hy) * ks < 0.8) {
      ai.t = 0; let wp = null;
      const pool = sim.fish.filter((o) => E.edible(maw, o)); if (pool.length && Math.random() < 0.7) { const o = pool[(Math.random() * pool.length) | 0]; wp = [o.x, o.y]; }
      if (!wp) { const w = W && W.nav ? W.nav.random(Math.random) : null; wp = w ? [w[0] / ks + h.tw / 2, w[1] / ks + h.th / 2] : [hx + 200, hy]; }
      ai.wp = wp;
    }
    out.move = headTo(ai.wp[0], ai.wp[1]); return out;
  }

  function stats(ai) {
    const s = ai.stat, L = s.log, hit = L.filter((x) => x.hit), mis = L.filter((x) => !x.hit), avg = (a, k) => (a.length ? a.reduce((q, x) => q + (x[k] || 0), 0) / a.length : null);
    return Object.assign({}, s, { hitRate: s.strikes ? s.hits / s.strikes : 0, charge: { hit: avg(hit, "charge"), miss: avg(mis, "charge") }, dist: { hit: avg(hit, "d"), miss: avg(mis, "d") } });
  }
  window.EcologyMawAI = { create, step, stats, reset, P };
})();
