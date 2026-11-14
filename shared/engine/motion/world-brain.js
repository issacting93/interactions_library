/* INTERACTIONS — what a creature wants in a generated place: hunt, flee, perch, eat.

   A brain gives a physics body (creature-body.js) its only handles, a target and a mode, and nothing else.
   It sees only what it could see: a tower or a wall between two creatures hides them from each other, and a
   flyer sees over them. What it does with that:

     strider   grazes and wanders. Runs from anything that has seen it, round the walls by the gates (it cannot
               climb), and is easier to lose behind one.
     pincer    wanders, climbs towers for the view, hunts striders and any lancer that has come down. It goes
               straight at its prey, over a wall if the wall is in the way, and cannot touch what is flying.
     lancer    walks, perches on roofs, and takes off to hunt striders (a stoop at the end) or to get away from
               a pincer. It lands again when it is calm.

   A catch is a hold: the prey struggles and may break free (more likely if it is bold, and early on), and the
   hunter leaves that one alone for a while. Held long enough, it is eaten: the prey reappears elsewhere.

     const brain = WorldBrain.create(body, "lancer", { W, rand, name });
     WorldBrain.step(brains, dt)      // all of them, so each can see the others
     brain.state, brain.mode          // for a readout

   Classic script -> window.WorldBrain. Needs the world from world-gen.js. */
(function () {
  "use strict";
  const RULES = {
    strider: { prey: true, hunts: [], fears: ["pincer", "lancer"], sense: 7, fearR: 6.5, calmR: 3.2, speed: 0.85, run: 1.9, bold: 0.12 },
    pincer:  { hunts: ["strider", "lancer"], fears: [], sense: 9, speed: 0.9, rush: 1.7, bold: 0.5, climbs: true, hungerRate: 0.025, hungry: 0.5 },
    lancer:  { hunts: ["strider"], fears: ["pincer"], sense: 12, fearR: 6, speed: 0.8, rush: 1.4, bold: 0.2, flies: true, hungerRate: 0.02, hungry: 0.55 },
  };
  const hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const list = [];
  function create(body, kind, ctx) {
    const R = RULES[kind], h = body.head().p;
    const b = { body, kind, R, W: ctx.W, rand: ctx.rand || Math.random, name: ctx.name || kind, state: "wander", mode: "walk", t: 0, hunger: 0.15 + Math.random() * 0.6,
      meals: 0, path: [], pathT: 0, held: null, holder: null, holdT: 0, ignore: new Map(), cool: 0, lastSeen: null, lastSeenT: 0, goalT: 0, perch: null, flyT: 0, startle: 0, baseS: body.S.speed };
    b.pos = () => body.head().p;
    return b;
  }
  const dist2 = (a, c) => hyp(a.pos().x - c.pos().x, a.pos().z - c.pos().z);
  const flying = (o) => o.body.mode === "fly";
  const sees = (a, c, R) => { if (dist2(a, c) > R) return false; if (flying(a)) return true; const p = a.pos(), q = c.pos(); return a.W.nav.see(p.x, p.z, q.x, q.z); };
  const rise = (b) => ((b.body.def.float && b.body.def.float.rise != null ? b.body.def.float.rise : 0.9) * b.body.len0);
  function setFly(b, on, heightAbove) { const bd = b.body; if (on) { if (bd.mode !== "fly") bd.setMode("fly"); bd.alt = heightAbove - rise(b); } else if (bd.mode !== "walk") bd.setMode("walk"); b.mode = bd.mode; }
  const groundAt = (b, x, z) => b.W.H(x, z);
  function goTo(b, x, z, y) { b.body.target.set(x, y != null ? y : groundAt(b, x, z), z); }
  // follow a path round the walls: the next point to head for
  function follow(b, tx, tz, dt, replan) {
    const p = b.pos(); b.pathT -= dt;
    if (replan || b.pathT <= 0 || !b.path.length) { b.path = b.W.nav.path(p.x, p.z, tx, tz); b.pathT = 1.1; }
    while (b.path.length > 1 && hyp(b.path[0][0] - p.x, b.path[0][1] - p.z) < 0.9) b.path.shift();
    const q = b.path[0] || [tx, tz]; goTo(b, q[0], q[1]);
  }
  function pickGoal(b) {
    const R = b.R, W = b.W, p = b.pos();
    b.goalT = 0; b.perch = null;
    if (R.climbs && b.rand() < 0.4) {   // up a tower for the view: a point on its wall or its roof
      const t = W.towers[Math.floor(b.rand() * W.towers.length)], roof = b.rand() < 0.45, a = b.rand() * Math.PI * 2, y = roof ? t.top : 0.8 + b.rand() * (t.top - 1.6), r = roof ? b.rand() * t.r * 0.6 : t.r;
      b.goal = [t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, y]; return;
    }
    if (R.flies && b.rand() < 0.35) { const t = W.towers[Math.floor(b.rand() * W.towers.length)], a = b.rand() * Math.PI * 2; b.perch = t; b.goal = [t.x + Math.cos(a) * t.r * 0.4, t.z + Math.sin(a) * t.r * 0.4, t.top]; return; }
    const g = W.nav.random(b.rand, [p.x, p.z]); b.goal = [g[0], g[1], null];
  }
  function leave(b) { b.held = null; b.holder = null; }
  function step(brains, dt, tally) {
    for (const b of brains) {
      const R = b.R, W = b.W, bd = b.body, p = b.pos();
      b.t += dt; b.cool = Math.max(0, b.cool - dt); b.hunger = Math.min(1, b.hunger + (R.hungerRate || 0) * dt);
      for (const [k, v] of [...b.ignore]) { if (v - dt <= 0) b.ignore.delete(k); else b.ignore.set(k, v - dt); }
      // ---- held: it does not choose anything ----
      if (b.holder) {
        const h = b.holder; b.state = "caught"; b.holdT += dt; goTo(b, p.x, p.z, p.y); bd.S.speed = 0.0001;
        if (!b.nextTry || b.holdT > b.nextTry) { b.nextTry = b.holdT + 0.3; bd.poke(Math.floor(b.rand() * bd.chunks.length), { x: (b.rand() - 0.5) * 6, y: 1.5, z: (b.rand() - 0.5) * 6 });
          const fresh = 1 - b.holdT / b.holdFor; if (b.rand() < 0.22 * (0.4 + R.bold * 2) * (0.4 + 0.6 * fresh)) { tally.escaped++; h.cool = 2.5; h.ignore.set(b, 4); h.held = null; h.state = "wander"; b.holder = null; b.state = "flee"; b.fleeFrom = h; b.t = 0; b.S0 = 1; bd.S.speed = b.baseS * (R.run || 1.5); continue; } }
        if (b.holdT > b.holdFor) {   // eaten: it is somewhere else, and the hunter is fed
          tally.eaten++; h.meals++; h.hunger = 0; h.cool = Math.max(h.cool, 6); h.held = null; h.state = "eat"; h.t = 0; b.holder = null; b.holdT = 0;
          const at = W.nav.random(b.rand, [h.pos().x, h.pos().z]); bd.setMode("walk"); b.mode = "walk"; bd.teleport(at[0], at[1]); b.state = "wander"; b.path = []; b.hunger = 0.2; bd.S.speed = b.baseS;
        }
        continue;
      }
      if (b.state === "eat") { goTo(b, p.x, p.z, p.y); bd.S.speed = b.baseS * 0.4; if (b.t > 2.6) { b.state = "wander"; b.t = 0; } continue; }
      if (b.held) { goTo(b, p.x, p.z, p.y); bd.S.speed = 0.0001; b.state = "hold"; continue; }
      // ---- what it can see ----
      let threat = null, prey = null, td = 1e9, pd = 1e9;
      for (const o of brains) {
        if (o === b || o.holder) continue;
        if (R.fears.includes(o.kind) && !(o.kind === "pincer" && flying(b)) && sees(o, b, o.R.sense) && dist2(b, o) < (o.state === "hunt" ? (R.fearR || 6) : (R.calmR || 0)) && dist2(b, o) < td) { threat = o; td = dist2(b, o); }
        if (R.hunts.includes(o.kind) && !b.ignore.has(o) && b.cool <= 0 && !(b.kind === "pincer" && flying(o)) && sees(b, o, R.sense) && dist2(b, o) < pd) { prey = o; pd = dist2(b, o); }
      }
      if (prey && b.hunger < R.hungry) prey = null;
      if (threat) { b.lastSeen = [threat.pos().x, threat.pos().z]; b.lastSeenT = 4; b.startle += dt; } else { b.startle = 0; b.lastSeenT -= dt; }
      // ---- decide ----
      if (threat && b.startle > 0.25) {
        // flee: away from it; a flyer goes up, a walker goes round the walls
        b.state = "flee"; b.t = 0;
        let ax = p.x - threat.pos().x, az = p.z - threat.pos().z; const l = hyp(ax, az) || 1; ax /= l; az /= l;
        const away = 7 + b.rand() * 2, tx = clamp(p.x + ax * away, -W.size * 0.8, W.size * 0.8), tz = clamp(p.z + az * away, -W.size * 0.8, W.size * 0.8);
        bd.S.speed = b.baseS * (R.run || R.rush || 1.4);
        if (R.flies) { setFly(b, true, 2.4); goTo(b, tx, tz, W.ceil(tx, tz) + 2.4); } else { const g = W.nav.near(tx, tz); follow(b, g[0], g[1], dt, false); }
        continue;
      }
      if (b.state === "flee" && b.lastSeenT > 0 && !threat) {   // out of sight: keep going a little
        bd.S.speed = b.baseS * (R.run || 1.2) * 0.8; if (b.t > 3) { b.state = "wander"; b.t = 0; } if (!R.flies) { /* keep the path */ } 
      }
      if (prey) {
        const q = prey.pos(); b.state = "hunt"; b.target = prey; b.goalT = 0;
        bd.S.speed = b.baseS * (R.rush || 1.5) * (pd < 4 ? 1.15 : 1);
        if (R.flies) { setFly(b, true, pd < 3.5 ? 0.55 : 2.0); goTo(b, q.x, q.z, flying(b) ? W.ceil(q.x, q.z) + 0.5 : q.y); }
        else goTo(b, q.x, q.z, q.y);
        const reach = Math.max(0.95, (bd.len0 + prey.body.len0) * 0.32);
        if (pd < reach && Math.abs(p.y - q.y) < 1.6 + (flying(b) ? 1.2 : 0) && !prey.holder && !flying(prey)) {
          prey.holder = b; prey.holdT = 0; prey.holdFor = 1.6 + b.rand() * 1.0; b.held = prey; b.state = "hold"; b.t = 0; tally.caught++; if (flying(b)) setFly(b, false);
        }
        continue;
      }
      if (b.state === "hunt" || b.state === "flee") { b.state = "wander"; b.t = 0; b.goal = null; }
      // ---- calm: wander, graze, perch ----
      bd.S.speed = b.baseS * (R.speed || 1);
      if (R.flies && flying(b)) {
        // coming down to a perch, or settling after a flight
        if (!b.goal) pickGoal(b);
        const g = b.goal, d = hyp(g[0] - p.x, g[1] - p.z);
        setFly(b, true, d < 3 ? clamp(d * 0.5, 0.35, 2.0) : 2.0); goTo(b, g[0], g[1], (g[2] != null ? g[2] : W.ceil(g[0], g[1])) + (d < 3 ? 0.1 : 2.0));
        if (d < 1.1) { setFly(b, false); b.state = "graze"; b.t = 0; b.goal = null; }
        else b.state = "fly";
        continue;
      }
      if (b.state === "graze") { goTo(b, p.x, p.z, p.y); if (b.t > 1.4 + b.rand() * 2.2) { b.state = "wander"; b.goal = null; } continue; }
      if (!b.goal) { pickGoal(b); b.state = "wander"; b.t = 0; }
      const g = b.goal, d = hyp(g[0] - p.x, g[1] - p.z) + (g[2] != null ? Math.abs(g[2] - p.y) * 0.5 : 0);
      if (R.flies && (b.perch || d > 6) && b.hunger < 0.9 && b.rand() < dt * 0.35 && b.t > 3) { setFly(b, true, 2.0); b.state = "fly"; continue; }   // fly there instead of walking
      if (R.climbs || g[2] != null && !R.flies) goTo(b, g[0], g[1], g[2]); else follow(b, g[0], g[1], dt, false);
      if (d < bd.def.stride * 1.4 || b.t > 25) { b.state = "graze"; b.t = 0; b.goal = null; }
    }
  }
  // after the bodies have moved: walkers that cannot climb are kept out of the walls, and a stray one is put back
  function after(brains, tally) {
    for (const b of brains) {
      const bd = b.body; if (b.R.climbs || b.R.flies) continue;
      for (const c of bd.chunks) b.W.push(c.p, c.prev, 0.3);
      const h = bd.head().p; if (h.y - b.W.H(h.x, h.z) > 3 && bd.mode === "walk") { const at = b.W.nav.random(b.rand); bd.teleport(at[0], at[1]); b.path = []; if (tally) tally.reset = (tally.reset || 0) + 1; }
    }
  }
  window.WorldBrain = { create, step, after, RULES };
})();
