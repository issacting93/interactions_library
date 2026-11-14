/* INTERACTIONS — what a creature wants in a generated place: hunt, flee, perch, eat.

   A brain gives a physics body (creature-body.js) its only handles, a target and a mode, and nothing else.
   It sees only what it could see: a tower or a wall between two creatures hides them from each other, and a
   flyer sees over them. What it does with that:

     leech     swims about a lake and dives when something is after it.
     puffer    swims; hunts leeches; dives from a lancer.
     centiwyrm walks and swims: hunts leeches and puffers, goes into the water to get away from a pincer.
     strider   grazes and wanders. Runs from anything that has seen it, round the walls by the gates (it cannot
               climb), and is easier to lose behind one.
     pincer    wanders, climbs towers for the view, hunts striders, centiwyrms on land and any lancer that has come down. It goes
               straight at its prey, over a wall if the wall is in the way, and cannot touch what is flying.
     lancer    walks, perches on roofs, and takes off to hunt striders, and leeches and puffers near the surface (a stoop at the end), or to get away from
               a pincer. It lands again when it is calm.

   A catch is a hold: the prey struggles and may break free (more likely if it is bold, and early on), and the
   hunter leaves that one alone for a while. Held long enough, it is eaten: the prey reappears elsewhere.

     const brain = WorldBrain.create(body, "lancer", { W, rand, name });
     WorldBrain.step(brains, dt)      // all of them, so each can see the others
     brain.state, brain.mode          // for a readout

   Classic script -> window.WorldBrain. Needs the world from world-gen.js. */
(function () {
  "use strict";
  // medium: where it lives. land walks (climbs: also up walls); water swims and never leaves the lake; both walks and swims.
  // hunts: who it eats (the ecology's own lists, where the species is in it); who it fears is worked out from everyone's hunts.
  // run: how hard it bolts (ecology: bolt 2.4, school 1.6, scatter 1.9); school: flees and wanders with its own kind; still: does not flee
  const RULES = {
    strider:   { medium: "land", prey: true, hunts: [], sense: 7, fearR: 6.5, calmR: 3.2, speed: 0.85, run: 1.9, bold: 0.12 },
    wisp:      { medium: "water", prey: true, hunts: [], sense: 5, fearR: 4, calmR: 1.8, speed: 0.7, run: 1.9, bold: 0.05 },
    leech:     { medium: "water", prey: true, hunts: [], sense: 6, fearR: 4.5, calmR: 2.2, speed: 0.7, run: 1.7, bold: 0.15 },
    koi:       { medium: "water", hunts: ["wisp"], sense: 7, fearR: 5.5, calmR: 2.4, speed: 0.8, rush: 1.4, run: 1.6, bold: 0.2, school: true, hungerRate: 0.03, hungry: 0.35 },
    serpent:   { medium: "water", hunts: ["wisp"], sense: 7, fearR: 5.5, calmR: 2.4, speed: 0.9, rush: 1.6, run: 2.4, bold: 0.25, hungerRate: 0.025, hungry: 0.35 },
    jelly:     { medium: "water", hunts: ["wisp"], sense: 5, speed: 0.5, rush: 1.2, bold: 0.6, still: true, hungerRate: 0.03, hungry: 0.3 },
    puffer:    { medium: "water", hunts: ["wisp"], sense: 8, fearR: 6, speed: 0.8, rush: 1.7, run: 1.7, bold: 0.3, hungerRate: 0.02, hungry: 0.4 },
    manta:     { medium: "water", hunts: ["wisp", "jelly", "serpent"], sense: 10, fearR: 6, speed: 0.8, rush: 1.5, run: 2.0, bold: 0.5, hungerRate: 0.02, hungry: 0.45 },
    centiwyrm: { medium: "both", hunts: ["leech", "puffer", "wisp"], sense: 8, fearR: 6, speed: 0.85, rush: 1.5, run: 1.6, bold: 0.45, hungerRate: 0.03, hungry: 0.45 },
    pincer:    { medium: "land", hunts: ["strider", "lancer", "centiwyrm"], sense: 9, speed: 0.9, rush: 1.7, bold: 0.5, climbs: true, hungerRate: 0.025, hungry: 0.5 },
    lancer:    { medium: "land", hunts: ["strider", "leech", "koi"], sense: 12, fearR: 6, speed: 0.8, rush: 1.4, bold: 0.2, flies: true, hungerRate: 0.02, hungry: 0.55 },
  };
  for (const k in RULES) RULES[k].fears = [];
  for (const k in RULES) for (const t of RULES[k].hunts) if (RULES[t] && !RULES[t].still) RULES[t].fears.push(k);
  const hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function create(body, kind, ctx) {
    const R = RULES[kind];
    const b = { body, kind, R, W: ctx.W, rand: ctx.rand || Math.random, name: ctx.name || kind, state: "wander", mode: "walk", t: 0, hunger: 0.15 + Math.random() * 0.6,
      meals: 0, path: [], pathT: 0, held: null, holder: null, holdT: 0, ignore: new Map(), cool: 0, lastSeen: null, lastSeenT: 0, goalT: 0, perch: null, flyT: 0, startle: 0, baseS: body.S.speed, dive: 0, dry: 0 };
    b.pos = () => body.head().p;
    return b;
  }
  const dist2 = (a, c) => hyp(a.pos().x - c.pos().x, a.pos().z - c.pos().z);
  const flying = (o) => o.body.mode === "fly";
  const wetAt = (W, x, z) => !!(W.water && W.water.wet(x, z));
  const wet = (o) => wetAt(o.W, o.pos().x, o.pos().z);
  const sees = (a, c, R) => { if (dist2(a, c) > R) return false; if (flying(a)) return true; const p = a.pos(), q = c.pos(); return a.W.nav.see(p.x, p.z, q.x, q.z); };
  const rise = (b) => ((b.body.def.float && b.body.def.float.rise != null ? b.body.def.float.rise : 0.9) * b.body.len0);
  function setFly(b, on, heightAbove) { const bd = b.body; if (on) { if (bd.mode !== "fly") bd.setMode("fly"); bd.alt = heightAbove - rise(b); } else if (bd.mode !== "walk") { bd.setMode("walk"); bd.alt = 0; } b.mode = bd.mode; }
  const groundAt = (b, x, z) => b.W.H(x, z);
  function goTo(b, x, z, y) { b.body.target.set(x, y != null ? y : groundAt(b, x, z), z); }
  // in the water: swim to a point; a swimmer that cannot leave the lake is kept inside it, and `dive` takes it deeper
  function swimTo(b, x, z, keep) {
    const bd = b.body, Wt = b.W.water, p = b.pos();
    if (keep) { const q = Wt.inside(x, z); x = q[0]; z = q[1]; }
    if (bd.mode !== "swim") bd.setMode("swim"); b.mode = "swim";
    const floor = b.W.H(p.x, p.z), ty = Math.max(floor + 0.28, Wt.level - 0.5 - b.dive);
    bd.alt = ty - floor - rise(b); bd.target.set(x, ty, z);
  }
  // follow a path round the walls: the next point to head for
  function follow(b, tx, tz, dt, replan) {   // false when there is no way there
    const p = b.pos(); b.pathT -= dt;
    if (replan || b.pathT <= 0 || !b.path.length) { const pth = b.W.nav.path(p.x, p.z, tx, tz); b.pathT = 1.1; if (!pth) { b.path = []; goTo(b, p.x, p.z, p.y); return false; } b.path = pth; }
    while (b.path.length > 1 && hyp(b.path[0][0] - p.x, b.path[0][1] - p.z) < 0.9) b.path.shift();
    const q = b.path[0] || [tx, tz]; goTo(b, q[0], q[1]); return true;
  }
  // an amphibian: on land it walks the paths, in the water it swims, and it crosses the shore by itself
  function moveBoth(b, gx, gz, dt) {
    const bd = b.body, W = b.W, p = b.pos(), deep = W.water.deep(p.x, p.z);
    if (bd.mode === "swim" && deep < 0.15) { bd.setMode("walk"); bd.alt = 0; b.mode = "walk"; }
    else if (bd.mode === "walk" && deep > 0.3) { bd.setMode("swim"); b.mode = "swim"; b.path = []; }
    if (bd.mode === "swim") { b.dive = 0; swimTo(b, gx, gz, false); return; }
    if (wetAt(W, gx, gz)) {                       // the goal is in the water: walk to the shore, then straight in
      follow(b, gx, gz, dt, false);
      const last = b.path[b.path.length - 1];
      if (!last || hyp(last[0] - p.x, last[1] - p.z) < 1.4) goTo(b, gx, gz);
    } else follow(b, gx, gz, dt, false);
  }
  function pickGoal(b) {
    const R = b.R, W = b.W, p = b.pos();
    b.goalT = 0; b.perch = null;
    if (R.medium === "water" && R.school) { const m = b.all && b.all.filter((o) => o !== b && o.kind === b.kind && o.goal && o.state !== "caught"); if (m && m.length && b.rand() < 0.85) { const o = m[Math.floor(b.rand() * m.length)], q = W.water.inside(o.goal[0] + (b.rand() - 0.5) * 2.4, o.goal[1] + (b.rand() - 0.5) * 2.4); b.goal = [q[0], q[1], null]; return; } }
    if (R.medium === "water") { const g = W.water.random(b.rand, [p.x, p.z]); b.goal = [g[0], g[1], null]; return; }
    if (R.medium === "both" && b.rand() < 0.7) { const g = W.water.random(b.rand, [p.x, p.z]); b.goal = [g[0], g[1], null]; return; }
    if (R.climbs && b.rand() < 0.4) {   // up a tower for the view: a point on its wall or its roof
      const t = W.towers[Math.floor(b.rand() * W.towers.length)], roof = b.rand() < 0.45, a = b.rand() * Math.PI * 2, y = roof ? t.top : 0.8 + b.rand() * (t.top - 1.6), r = roof ? b.rand() * t.r * 0.6 : t.r;
      b.goal = [t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, y]; return;
    }
    if (R.flies && b.rand() < 0.35) { const t = W.towers[Math.floor(b.rand() * W.towers.length)], a = b.rand() * Math.PI * 2; b.perch = t; b.goal = [t.x + Math.cos(a) * t.r * 0.4, t.z + Math.sin(a) * t.r * 0.4, t.top]; return; }
    const g = W.nav.random(b.rand, [p.x, p.z]); b.goal = [g[0], g[1], null];
  }
  // can this hunter get at that one right now
  function reach(h, o) {
    if (flying(o)) return false;
    const ow = wet(o), k = h.kind;
    if (k === "pincer") return !ow;
    if (h.R.medium === "water") return ow;
    if (k === "lancer") return !(o.dive > 0.6);
    return true;
  }
  // does that one scare this one right now: a pincer is no danger to something in the water or in the air
  const scares = (b, o) => !(o.kind === "pincer" && (flying(b) || wet(b)));
  function log(tally, kind, a, c) { if (tally && tally.events) { tally.events.push({ kind, a: a.name, b: c.name, t: performance.now() }); if (tally.events.length > 40) tally.events.shift(); } }
  function respawn(b, h) {
    const W = b.W, bd = b.body, at = b.R.medium === "water" ? W.water.random(b.rand, [h.pos().x, h.pos().z]) : W.nav.random(b.rand, [h.pos().x, h.pos().z]);
    bd.setMode(b.R.medium === "water" ? "swim" : "walk"); b.mode = bd.mode; bd.alt = 0; b.dive = 0; bd.teleport(at[0], at[1]);
  }
  function step(brains, dt, tally) {
    for (const b of brains) {
      b.all = brains;
      const R = b.R, W = b.W, bd = b.body, p = b.pos();
      b.t += dt; b.cool = Math.max(0, b.cool - dt); b.hunger = Math.min(1, b.hunger + (R.hungerRate || 0) * dt);
      b.dive = Math.max(0, b.dive - dt * 0.5);
      for (const [k, v] of [...b.ignore]) { if (v - dt <= 0) b.ignore.delete(k); else b.ignore.set(k, v - dt); }
      // ---- held: it does not choose anything ----
      if (b.holder) {
        const h = b.holder; b.state = "caught"; b.holdT += dt; goTo(b, p.x, p.z, p.y); bd.S.speed = 0.0001;
        if (!b.nextTry || b.holdT > b.nextTry) { b.nextTry = b.holdT + 0.3; bd.poke(Math.floor(b.rand() * bd.chunks.length), { x: (b.rand() - 0.5) * 6, y: 1.5, z: (b.rand() - 0.5) * 6 });
          const fresh = 1 - b.holdT / b.holdFor; if (b.rand() < 0.22 * (0.4 + R.bold * 2) * (0.4 + 0.6 * fresh)) { tally.escaped++; log(tally, "escaped", b, h); h.cool = 2.5; h.ignore.set(b, 4); h.held = null; h.state = "wander"; b.holder = null; b.state = "flee"; b.fleeFrom = h; b.t = 0; b.S0 = 1; b.dive = 1.2; bd.S.speed = b.baseS * (R.run || 1.5); continue; } }
        if (b.holdT > b.holdFor) {   // eaten: it is somewhere else, and the hunter is fed
          tally.eaten++; log(tally, "eaten", b, h); h.meals++; h.hunger = 0; h.cool = Math.max(h.cool, 6); h.held = null; h.state = "eat"; h.t = 0; b.holder = null; b.holdT = 0;
          respawn(b, h); b.state = "wander"; b.path = []; b.hunger = 0.2; bd.S.speed = b.baseS;
        }
        continue;
      }
      if (b.state === "eat") { goTo(b, p.x, p.z, p.y); bd.S.speed = b.baseS * 0.4; if (b.t > 2.6) { b.state = "wander"; b.t = 0; } continue; }
      if (b.held) { goTo(b, p.x, p.z, p.y); bd.S.speed = 0.0001; b.state = "hold"; continue; }
      // ---- what it can see ----
      let threat = null, prey = null, td = 1e9, pd = 1e9;
      for (const o of brains) {
        if (o === b || o.holder) continue;
        if (R.fears.includes(o.kind) && scares(b, o) && sees(o, b, o.R.sense) && dist2(b, o) < (o.state === "hunt" ? (R.fearR || 6) : (R.calmR || 0)) && dist2(b, o) < td) { threat = o; td = dist2(b, o); }
        if (R.hunts.includes(o.kind) && !b.ignore.has(o) && b.cool <= 0 && reach(b, o) && sees(b, o, R.sense) && dist2(b, o) < pd) { prey = o; pd = dist2(b, o); }
      }
      if (!threat && R.school) for (const o of brains) if (o !== b && o.kind === b.kind && o.state === "flee" && o.fleeFromObj && dist2(b, o) < 5.5) { threat = o.fleeFromObj; td = dist2(b, threat); break; }   // a school bolts together
      if (prey && b.hunger < R.hungry) prey = null;
      if (threat) { b.lastSeen = [threat.pos().x, threat.pos().z]; b.lastSeenT = 4; b.startle += dt; } else { b.startle = 0; b.lastSeenT -= dt; }
      // ---- decide ----
      if (threat && b.startle > 0.25) {
        // flee: away from it; a flyer goes up, a swimmer dives and goes across the lake, an amphibian makes for the water, a walker goes round the walls
        b.state = "flee"; b.t = 0; b.fleeFromObj = threat;
        let ax = p.x - threat.pos().x, az = p.z - threat.pos().z; const l = hyp(ax, az) || 1; ax /= l; az /= l;
        const away = 7 + b.rand() * 2, tx = clamp(p.x + ax * away, -W.size * 0.8, W.size * 0.8), tz = clamp(p.z + az * away, -W.size * 0.8, W.size * 0.8);
        bd.S.speed = b.baseS * (R.run || R.rush || 1.4);
        if (R.flies) { setFly(b, true, 2.4); goTo(b, tx, tz, W.ceil(tx, tz) + 2.4); }
        else if (R.medium === "water") { b.dive = threat.kind === "lancer" ? 1.3 : 0.4; swimTo(b, p.x + ax * 3, p.z + az * 3, true); }
        else if (R.medium === "both" && W.water) { const q = W.water.inside(W.water.x + (p.x - W.water.x) * 0.5, W.water.z + (p.z - W.water.z) * 0.5); moveBoth(b, q[0], q[1], dt); }
        else {   // round the walls; if there is no way that way, turn and try the others
          for (let k = 0; k < 5; k++) { const ang = [0, 0.9, -0.9, 1.8, -1.8][k], c = Math.cos(ang), sn = Math.sin(ang), rx = ax * c - az * sn, rz = ax * sn + az * c;
            const g = W.nav.near(clamp(p.x + rx * away, -W.size * 0.8, W.size * 0.8), clamp(p.z + rz * away, -W.size * 0.8, W.size * 0.8)); if (follow(b, g[0], g[1], k ? 0 : dt, k > 0)) break; }
        }
        continue;
      }
      if (b.state === "flee" && b.lastSeenT > 0 && !threat) {   // out of sight: keep going a little
        bd.S.speed = b.baseS * (R.run || 1.2) * 0.8; if (b.t > 3) { b.state = "wander"; b.t = 0; }
      }
      if (prey) {
        const q = prey.pos(); b.state = "hunt"; b.target = prey; b.goalT = 0;
        bd.S.speed = b.baseS * (R.rush || 1.5) * (pd < 4 ? 1.15 : 1);
        if (R.flies) { setFly(b, true, pd < 3.5 ? 0.55 : 2.0); goTo(b, q.x, q.z, flying(b) ? W.ceil(q.x, q.z) + 0.5 : q.y); }
        else if (R.medium === "water") { b.dive = 0; swimTo(b, q.x, q.z, true); }
        else if (R.medium === "both") moveBoth(b, q.x, q.z, dt);
        else goTo(b, q.x, q.z, q.y);
        const reachD = Math.max(0.95, (bd.len0 + prey.body.len0) * 0.32);
        if (pd < reachD && Math.abs(p.y - q.y) < 1.6 + (flying(b) ? 1.2 : 0) && !prey.holder && !flying(prey)) {
          prey.holder = b; prey.holdT = 0; prey.holdFor = 1.6 + b.rand() * 1.0; b.held = prey; b.state = "hold"; b.t = 0; tally.caught++; log(tally, "caught", prey, b); if (flying(b) && !wet(prey)) setFly(b, false);   // over the water it hovers while it holds
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
      if (b.state === "graze") {
        if (bd.mode === "swim") swimTo(b, p.x, p.z, false); else goTo(b, p.x, p.z, p.y);
        if (b.t > 1.4 + b.rand() * 2.2) { b.state = "wander"; b.goal = null; } continue;
      }
      if (!b.goal) { pickGoal(b); b.state = "wander"; b.t = 0; }
      const g = b.goal, d = hyp(g[0] - p.x, g[1] - p.z) + (g[2] != null ? Math.abs(g[2] - p.y) * 0.5 : 0);
      if (R.flies && (b.perch || d > 6) && b.hunger < 0.9 && b.rand() < dt * 0.35 && b.t > 3) { setFly(b, true, 2.0); b.state = "fly"; continue; }   // fly there instead of walking
      if (R.medium === "water") swimTo(b, g[0], g[1], true);
      else if (R.medium === "both") moveBoth(b, g[0], g[1], dt);
      else if (R.climbs || g[2] != null && !R.flies) goTo(b, g[0], g[1], g[2]); else if (!follow(b, g[0], g[1], dt, false)) { b.goal = null; b.t = 0; }
      if (d < bd.def.stride * 1.4 || b.t > 60) { b.state = "graze"; b.t = 0; b.goal = null; }
    }
  }
  // after the bodies have moved: walkers that cannot climb are kept out of the walls and a stray one is put back; a swimmer that has beached is put back in the water
  function after(brains, dt, tally) {
    for (const b of brains) {
      const bd = b.body, W = b.W, h = bd.head().p;
      if (W.water && b.R.medium === "land" && bd.mode === "walk") for (const c of bd.chunks) W.water.push(c.p, c.prev);
      if (b.R.climbs || b.R.flies) continue;
      if (b.R.medium === "water") {
        b.dry = wet(b) ? 0 : b.dry + dt;
        if (b.dry > 1.2) { const at = W.water.random(b.rand); bd.teleport(at[0], at[1]); b.path = []; b.dry = 0; if (tally) tally.reset = (tally.reset || 0) + 1; }
        continue;
      }
      if (bd.mode === "walk") for (const c of bd.chunks) W.push(c.p, c.prev, 0.3);
      if (h.y - W.H(h.x, h.z) > 3 && bd.mode === "walk") { const at = W.nav.random(b.rand); bd.teleport(at[0], at[1]); b.path = []; if (tally) tally.reset = (tally.reset || 0) + 1; }
    }
  }
  window.WorldBrain = { create, step, after, RULES };
})();
