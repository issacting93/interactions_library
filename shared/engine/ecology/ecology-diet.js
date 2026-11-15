/* ecology-diet.js: the diet game's rules on top of the ecology tank. "You are what you ate."

   Every creature keeps a record of its body:
     gut     the last 12 meals (species)
     mass    every meal adds the prey's size; mass sets the tier (small, mid, large) and the tier sets its scale
     frame   how it moves: shoal, wing, leg, claw. Five of the twelve meals moving one way offer that frame
     traits  at most two abilities. Three of the twelve meals carrying one trait offer it; a trait is shed when
             its prey is gone from the gut
   Size is a bet: a hunter's energy drains with its tier, frame and traits, and a starved one shrinks a tier.
   A creature eats at or below its tier, and ignores prey two tiers down unless that prey schools.
   Rivals play by the same rules: they take what they are offered after a moment, and a new arrival inherits a
   varied copy of a survivor's record, so the population drifts. The atlas keeps the fittest record seen for each
   frame and tier (a MAP-Elites archive over creatures).

   A frame or trait acts through the tank's own behaviours: the creature gets f.beh, a copy-on-write of its
   species' behaviour with the frame's and traits' changes (see FRAME_BEH and TRAIT_BEH), plus the hooks in
   EcologySim (canEat, onCatch, onMeal, onSpawn, lurers). The harpoon and the hitch are run here, after the tank's step.

     const diet = EcologyDiet.create(sim, { species: EcologySpecies })
     EcologyDiet.step(diet, dt)                        after EcologySim.step
     EcologyDiet.describe(diet, f) -> the record, read for a panel: { gut, mass, tier, tierName, energy, upkeep, frame, traits, offers: { frames, traits }, counts }
     EcologyDiet.take(diet, f, "frame" | "trait", key, replace?)   EcologyDiet.drop(diet, f, trait)   EcologyDiet.pass(diet, f)
     diet.mine     the creature whose offers wait for a person (not taken automatically). It hunts whatever its species: it eats by
                   the rules alone (hooks.eats). EcologyDiet.hunt(diet, creature) -> true | reason   sends it after one creature
     EcologyDiet.setOn(diet, bool); diet.adapt   the rules as a whole; rivals taking offers and inheriting
     diet.events   [{ kind: graft | cocoon | molt | swarm | shed | sting | harpoon | miss, f, text, t }]   diet.tethers [{ a, b }] harpoon lines now
     EcologyDiet.stats(diet) -> { frames: { key: n }, traits: { key: n }, tiers: [n, n, n] }   diet.atlas  Map "frame|tier" -> { score, name, traits, f }

   Classic script -> window.EcologyDiet. */
(function () {
  "use strict";
  const RULES = { gut: 12, frameAt: 5, traitAt: 3, slots: 2, tiers: [[0, "Small", 2], [10, "Mid", 5], [25, "Large", 12]], starve: 6, massCap: 45,
    drain: 0.25, mealEnergy: 3, energyCap: 12, scaleStep: 0.2,
    // the tank's hunters eat rarely, so for the rules to show: a meal is digested sooner, hunters look further, and a creature starts with a gut it has already been filling
    digest: 0.4, sight: 1.5, startGut: [5, 10] };
  const FRAMES = { shoal: { name: "Shoal", up: 0.6 }, wing: { name: "Wing", up: 1.6 }, leg: { name: "Leg", up: 0.8 }, claw: { name: "Claw", up: 0.7 } };
  const TRAITS = {
    harpoon: { name: "Harpoon", up: 1, not: ["shoal"], from: ["strike-lance", "abyssal-lance-swift", "ringed-lance-swift", "ringed-lance-swift-mk2", "crowned-sickle-lancer", "ringed-lance-monarch"] },
    plate: { name: "Plate", up: 1.2, not: ["shoal"], from: ["plated-scavenger", "carapace-strider", "pearl-clawed-hundred-worm", "puffer-plated-angler-25d9"] },
    puff: { name: "Puff", up: 1, from: ["puffer", "fin-puffer"] },
    sting: { name: "Sting", up: 1, from: ["siphon", "chain-colony", "jelly"] },
    lure: { name: "Lure", up: 1, from: ["angler", "moth"] },
    cloak: { name: "Cloak", up: 1, from: ["frond-serpent", "rogue"] },
    leap: { name: "Leap", up: 1, only: ["leg", "claw"], from: ["pearl-chasing-centiwyrm", "pincer"] },
    hitch: { name: "Hitch", up: 1, maxTier: 0, from: ["leech"] },
    shoal: { name: "Shoal", up: 1.3, maxTier: 1, from: ["koi", "swift"] },
  };
  // how each species moves, for the frame a meal counts toward (anything not listed: shoal)
  const MOVE = { wing: ["swift", "moth", "dragon", "eye-wing", "black-monarch", "worm", "ophan-halo-monarch", "halo-eyed-seraph", "ringed-lance-monarch", "koi-winged-dragon-6cce", "dragon-winged-worm-ed95", "dragon-winged-stub-worm-7390"],
    leg: ["plated-scavenger", "carapace-strider", "puffer", "fin-puffer"], claw: ["pincer", "pearl-chasing-centiwyrm", "pearl-clawed-hundred-worm"] };
  const LEAP_DASH = { mode: "chase", range: 2.2, mult: 2.8, dur: 0.45, cool: 3 };
  // what a frame changes in a creature's behaviour (o: its own copy, base: its species')
  const FRAME_BEH = {
    shoal: (o, base) => { o.school = Math.max(base.school || 0, 1); },
    wing: (o, base) => { o.z = [0.03, 0.4]; o.speedMul = (o.speedMul || 1) * 1.15; o.glide = Math.max(base.glide || 0, 0.5); },
    leg: (o) => { o.amphi = { home: "ground" }; o.z = [0.7, 1]; o.stopgo = 1.3; },
    claw: (o, base) => { o.z = [0.6, 0.97]; o.wander = 0.08; o.minSp = 0.03; if (!base.dash) o.dash = LEAP_DASH; },
  };
  const TRAIT_BEH = {
    harpoon: (o) => { o.speedMul = (o.speedMul || 1) * 0.85; },
    plate: (o, f) => { o.speedMul = (o.speedMul || 1) * 0.8; f.escMul = 2; },
    puff: (o) => { o.puff = true; },
    sting: (o) => { o.speedMul = (o.speedMul || 1) * 0.75; },
    lure: () => {}, cloak: (o) => { o.cloak = true; },
    leap: (o) => { o.dash = LEAP_DASH; },
    hitch: () => {}, shoal: (o, f, base) => { o.school = Math.max(base.school || 0, 1); },
  };

  function create(sim, opts) {
    const ES = opts.species, SP = sim.speciesRT, keyIdx = new Map(SP.map((s, i) => [s.key, i]));
    const tierOf = (k) => (ES.TIER3_KEYS.includes(k) ? 2 : ES.TIER2_KEYS.includes(k) ? 1 : 0);
    const tag = SP.map((s) => { const move = MOVE.wing.includes(s.key) ? "wing" : MOVE.leg.includes(s.key) ? "leg" : MOVE.claw.includes(s.key) ? "claw" : "shoal";
      let trait = null; for (const t in TRAITS) if (TRAITS[t].from.includes(s.key)) trait = t;
      return { move, trait, size: tierOf(s.key) + 1, tier: tierOf(s.key), name: s.name }; });
    const diet = { sim, ES, tag, keyIdx, on: true, adapt: true, mine: null, events: [], tethers: [], atlas: new Map(), t: 0, harps: new Set(), hitchers: new Set() };
    sim.hooks.onSpawn = (f) => { init(diet, f); if (diet.on && diet.adapt) inherit(diet, f); else settle(diet, f); };
    sim.hooks.onMeal = (pred, prey) => { if (diet.on) meal(diet, pred, prey); };
    sim.hooks.canEat = (f, o) => !diet.on || canEat(diet, f, o);
    // yours eats by the rules alone, whatever its species' menu: anything at or below its tier that is not its own kind and under 2.6 times its length
    sim.hooks.eats = (f, o) => (diet.on && f === diet.mine ? o.sp !== f.sp && !o.guest && !!o.diet && canEat(diet, f, o) && window.EcologySim.bodyLen(sim, o) <= window.EcologySim.bodyLen(sim, f) * 2.6 : undefined);
    sim.hooks.onCatch = (f, o) => { if (!diet.on || !o.diet || !o.diet.traits.includes("sting")) return true;
      f.full = Math.max(f.full, 2); f.ignore = o; f.ignoreT = 4; o.alarm = 1; note(diet, "sting", o, SP[o.sp].name + " stung " + SP[f.sp].name); return false; };
    for (const f of sim.fish) { init(diet, f); settle(diet, f); }
    return diet;
  }
  const tierFor = (mass) => { let t = 0; RULES.tiers.forEach((x, k) => { if (mass >= x[0]) t = k; }); return t; };
  function init(diet, f) {
    const g = diet.tag[f.sp];
    f.diet = { gut: [], mass: [2, 14, 30][g.tier], tier: g.tier, native: g.tier, frame: g.move, nativeFrame: g.move, traits: [], energy: 6 + Math.random() * 4, meals: 0, scale0: f.scale, sp: f.sp,
      offers: null, wait: 0, passed: "", fx: null, hCool: 0, aim: 0, teth: null, host: null, hostT: 0 };
    f.beh = null; f.escMul = 1;
    // it has been living already: a hunter starts with meals from its own menu, and sees a little further
    const sp = diet.sim.speciesRT[f.sp];
    if (sp.preySet && sp.preySet.size && !f.guest) { const menu = [...sp.preySet], n = RULES.startGut[0] + Math.floor(Math.random() * (RULES.startGut[1] - RULES.startGut[0] + 1)), fav = menu[Math.floor(Math.random() * menu.length)];
      for (let i = 0; i < n; i++) f.diet.gut.push(Math.random() < 0.45 ? fav : menu[Math.floor(Math.random() * menu.length)]);
      if (!f.diet.sighted) { f.sightMul = (f.sightMul || 1) * RULES.sight; f.diet.sighted = true; } }
  }
  function note(diet, kind, f, text) { diet.events.push({ kind, f, text, t: diet.t }); if (diet.events.length > 40) diet.events.shift(); }
  const fits = (d, t) => { const T = TRAITS[t]; return !(T.not && T.not.includes(d.frame)) && !(T.only && !T.only.includes(d.frame)) && !(T.maxTier != null && d.tier > T.maxTier); };
  // what the gut offers and what it no longer supports (the same reading as the rules page)
  function read(diet, d) {
    const frames = {}, traits = {};
    for (const sp of d.gut) { const g = diet.tag[sp]; frames[g.move] = (frames[g.move] || 0) + 1; if (g.trait) traits[g.trait] = (traits[g.trait] || 0) + 1; }
    return { frames, traits,
      offerFrames: Object.keys(frames).filter((k) => frames[k] >= RULES.frameAt && k !== d.frame).sort((a, b) => frames[b] - frames[a]),
      offerTraits: Object.keys(traits).filter((k) => traits[k] >= RULES.traitAt && !d.traits.includes(k) && fits(d, k)).sort((a, b) => traits[b] - traits[a]),
      shed: d.traits.filter((k) => !traits[k] || !fits(d, k)) };
  }
  const upkeep = (d) => RULES.tiers[d.tier][2] * FRAMES[d.frame].up * d.traits.reduce((m, t) => m * TRAITS[t].up, 1);
  // the creature's own behaviour: its species' with its frame and traits laid over
  function rebuild(diet, f) {
    const d = f.diet, base = diet.sim.speciesRT[f.sp].beh; f.escMul = 1;
    if (d.frame === d.nativeFrame && !d.traits.length && f !== diet.mine) f.beh = null;
    else { const o = Object.create(base); if (d.frame !== d.nativeFrame) FRAME_BEH[d.frame](o, base); for (const t of d.traits) TRAIT_BEH[t](o, f, base); f.beh = o; }
    // yours is a hunter whatever it was born: it chases, sees and rushes at least as well as a plain hunter
    f.hunter = f === diet.mine;
    if (f.hunter) { const o = f.beh || (f.beh = Object.create(base)); if (!(o.chase > 0.5)) o.chase = 0.6; if (!(o.sight > 5)) o.sight = 5; if (!o.dash || o.dash.mode !== "chase" || o.dash.wait) o.dash = { mode: "chase", range: 3, mult: 2.6, dur: 0.5, cool: 1.5 }; if (o.stalk) o.stalk = 0; if (o.graze) o.graze = 0; if (o.spinCatch) o.spinCatch = 0; o.speedMul = (o.speedMul || 1) * 1.35; o.catch = Math.max(o.catch || 0.3, 0.5); }
    diet.harps[d.traits.includes("harpoon") ? "add" : "delete"](f); diet.hitchers[d.traits.includes("hitch") ? "add" : "delete"](f);
    const L = diet.sim.hooks.lurers, i = L.indexOf(f), has = d.traits.includes("lure"); if (has && i < 0) L.push(f); else if (!has && i >= 0) L.splice(i, 1);
  }
  function setTier(diet, f, why) {
    const d = f.diet, t = tierFor(d.mass); if (t === d.tier) return;
    const up = t > d.tier; d.tier = t; d.fx = { kind: up ? "molt" : "swarm", t: 0, dur: 1.2 }; if (!up) f.fade = 0.15; else f.gulp = 1;
    note(diet, up ? "molt" : "swarm", f, diet.sim.speciesRT[f.sp].name + (up ? " grew to " : " shrank to ") + RULES.tiers[t][1].toLowerCase() + (why ? " (" + why + ")" : ""));
    settle(diet, f);
  }
  // shed what the gut or the body no longer supports, refresh the offers
  function settle(diet, f) {
    const d = f.diet; let r = read(diet, d);
    if (r.shed.length) { for (const k of r.shed) note(diet, "shed", f, diet.sim.speciesRT[f.sp].name + " shed " + TRAITS[k].name.toLowerCase()); d.traits = d.traits.filter((k) => !r.shed.includes(k)); rebuild(diet, f); r = read(diet, d); }
    d.offers = r.offerFrames.length || r.offerTraits.length ? r : null; d.counts = r;
    if (d.offers && !d.wait) d.wait = 2 + Math.random() * 4;
  }
  function meal(diet, pred, prey) {
    const d = pred.diet; if (!d) return; const g = diet.tag[prey.sp];
    d.gut.push(prey.sp); if (d.gut.length > RULES.gut) d.gut.shift();
    pred.full *= RULES.digest;
    d.mass = Math.min(RULES.massCap, d.mass + g.size); d.energy = Math.min(RULES.energyCap, d.energy + RULES.mealEnergy * g.size); d.meals++;
    setTier(diet, pred); settle(diet, pred);
    // the atlas: the fittest record seen for each frame and tier
    const key = d.frame + "|" + d.tier, e = diet.atlas.get(key);
    if (!e || d.meals > e.score || e.f === pred) diet.atlas.set(key, { score: d.meals, name: diet.sim.speciesRT[pred.sp].name, traits: d.traits.slice(), f: pred });
    // a shoal carries on as the next: what one knew passes to the nearest of its kind
    const pd = prey.diet;
    if (pd && pd.traits.includes("shoal") && (pd.traits.length > 1 || pd.gut.length)) {
      let best = null, bd = 1e9; for (const o of diet.sim.fish) { if (o === prey || o.dead || o.sp !== prey.sp || !o.diet) continue; const dd = Math.hypot(o.x - prey.x, o.y - prey.y); if (dd < bd) { bd = dd; best = o; } }
      if (best) { best.diet.gut = pd.gut.slice(); best.diet.traits = pd.traits.slice(); if (diet.mine === prey) diet.mine = best; rebuild(diet, best); settle(diet, best); }
    }
  }
  function canEat(diet, f, o) {
    const a = f.diet, b = o.diet; if (!a || !b) return true;
    if (b.tier > a.tier) return false;                                                   // at or below its tier
    if (a.frame === "leg" && a.nativeFrame !== "leg" && o.z < 0.6 && !a.traits.includes("harpoon")) return false;   // a leg frame is bound to the floor: it eats what is down there, unless it can reach
    const fb = f.beh || diet.sim.speciesRT[f.sp].beh, ob = o.beh || diet.sim.speciesRT[o.sp].beh;
    if (a.tier - b.tier >= 2 && !fb.graze && !fb.spinCatch && !((ob.school || 0) >= 0.9)) return false;   // not worth the chase, unless it schools
    if (b.traits.includes("cloak") && Math.hypot(o.vx, o.vy) < diet.sim.cfg.size * 0.45) return false;      // unseen while still
    if ((o.puff || 0) > 0.5 && window.EcologySim.bodyLen(diet.sim, f) < 2 * window.EcologySim.bodyLen(diet.sim, o)) return false;   // too big to swallow
    return true;
  }
  // a new arrival takes after one that is still alive, a little changed
  function inherit(diet, f) {
    const fish = diet.sim.fish; if (!fish.length) return;
    for (let k = 0; k < 24; k++) { const o = fish[Math.floor(Math.random() * fish.length)]; if (!o || o.dead || o.sp !== f.sp || !o.diet || o.guest) continue;
      const d = f.diet, s = o.diet; d.gut = s.gut.slice(); d.frame = s.frame; d.traits = s.traits.filter(() => Math.random() < 0.85);
      if (Math.random() < 0.15 && d.gut.length) d.gut.splice(Math.floor(Math.random() * d.gut.length), 1);
      rebuild(diet, f); settle(diet, f); return; }
  }
  function take(diet, f, kind, key, replace) {
    const d = f.diet; if (!d) return false; const name = diet.sim.speciesRT[f.sp].name;
    if (kind === "frame") { if (!FRAMES[key] || key === d.frame) return false; d.frame = key; d.fx = { kind: "cocoon", t: 0, dur: 1.6 }; note(diet, "cocoon", f, name + " took the " + FRAMES[key].name.toLowerCase() + " frame"); }
    else { if (!TRAITS[key] || d.traits.includes(key) || !fits(d, key)) return false;
      if (d.traits.length >= RULES.slots) { if (!replace || !d.traits.includes(replace)) return false; d.traits = d.traits.filter((t) => t !== replace); }
      d.traits.push(key); d.fx = { kind: "graft", t: 0, dur: 0.9 }; f.gulp = 1; note(diet, "graft", f, name + " took " + TRAITS[key].name.toLowerCase()); }
    d.wait = 0; rebuild(diet, f); settle(diet, f); return true;
  }
  function drop(diet, f, key) { const d = f.diet; if (!d || !d.traits.includes(key)) return; d.traits = d.traits.filter((t) => t !== key); rebuild(diet, f); settle(diet, f); }
  // send yours after one creature: true if it may eat it (then it drops what it was doing and goes), else why not
  function hunt(diet, o) {
    const f = diet.mine; if (!f || !o || o === f || o.dead) return "nothing";
    if (!diet.sim.hooks.eats(f, o)) { const a = f.diet, b = o.diet; return !b || o.guest ? "not prey" : o.sp === f.sp ? "its own kind" : b.tier > a.tier ? "too big: a tier above yours" : window.EcologySim.bodyLen(diet.sim, o) > window.EcologySim.bodyLen(diet.sim, f) * 2.6 ? "too long to swallow" : "it will not take that"; }
    f.target = o; f.full = 0; f.ignore = null; f.cool = 0; f.chaseT = 0; return true;
  }
  function pass(diet, f) { const d = f.diet; if (d && d.offers) { d.passed = d.gut.join(); d.wait = 0; } }
  const offered = (d) => (d.offers && d.passed !== d.gut.join() ? d.offers : null);

  function step(diet, dt) {
    if (!diet.on) return;
    const sim = diet.sim, SP = sim.speciesRT, ES = window.EcologySim, maxSp = sim.cfg.size * 1.6 * sim.cfg.speed; diet.t += dt; diet.tethers.length = 0;
    if (diet.mine !== diet.was) { const was = diet.was; diet.was = diet.mine; if (was && was.diet && !was.dead) rebuild(diet, was); if (diet.mine && diet.mine.diet) { rebuild(diet, diet.mine); diet.mine.full = 0; } }   // yours changed hands
    for (const f of sim.fish) {
      const d = f.diet; if (!d || f.dead) continue;
      if (f.guest) { if (d.gut.length || d.traits.length || f.beh) { d.gut = []; d.traits = []; d.frame = d.nativeFrame; d.offers = null; f.beh = null; f.escMul = 1; } continue; }   // a walker's stand-in is outside the rules
      if (d.sp !== f.sp) { const g = diet.tag[f.sp]; d.sp = f.sp; d.native = g.tier; d.nativeFrame = g.move; d.scale0 = f.scale / (1 + RULES.scaleStep * (d.tier - d.native)); rebuild(diet, f); }   // it evolved along its chain
      // size shows: the body eases to its tier's scale
      const want = d.scale0 * (1 + RULES.scaleStep * (d.tier - d.native)); if (Math.abs(f.scale - want) > 0.002) f.scale += (want - f.scale) * Math.min(1, dt * 1.5);
      // upkeep: only what hunts pays; a starved hunter shrinks a step
      if ((sim.isPredator[f.sp] || f.hunter) && !f.caught) { d.energy -= upkeep(d) / 60 * RULES.drain * dt * ((f.puff || 0) > 0.5 && d.traits.includes("puff") ? 3 : 1);   // puffed up burns three times as fast
        if (d.energy <= 0) { d.energy = 5; if (d.mass > 0) { d.mass = Math.max(0, d.mass - RULES.starve); setTier(diet, f, "starved"); } } }
      // rivals take what they are offered, after a moment; yours waits for you
      if (d.wait > 0 && f !== diet.mine && diet.adapt) { d.wait -= dt; if (d.wait <= 0) { d.wait = 0; const r = offered(d);
        if (r) { if (r.offerTraits.length && (d.traits.length < RULES.slots || Math.random() < 0.25)) take(diet, f, "trait", r.offerTraits[0], d.traits[0]);
          else if (r.offerFrames.length && Math.random() < 0.5) take(diet, f, "frame", r.offerFrames[0]); else pass(diet, f); } } }
      // the change shows on the body (Metamorphosis' four: graft, cocoon, molt, swarm)
      if (d.fx) { const x = d.fx; x.t += dt; const u = x.t / x.dur, env = Math.sin(Math.min(1, u) * Math.PI);
        if (x.kind === "cocoon") { f.tuckGoal = 1; f.puff = Math.max(f.puff || 0, env); f.vx *= 1 - Math.min(1, dt * 3) * env; f.vy *= 1 - Math.min(1, dt * 3) * env; }
        else if (x.kind === "molt") f.puff = Math.max(f.puff || 0, env * 0.6);
        else if (x.kind === "graft") f.puff = Math.max(f.puff || 0, env * 0.35);
        if (u >= 1) { if (x.kind === "cocoon") f.tuckGoal = 0; d.fx = null; } }
    }
    // the harpoon: aim standing still, then a line that pulls the lighter of the two toward the heavier
    for (const f of diet.harps) {
      const d = f.diet; if (f.dead || !d) { diet.harps.delete(f); continue; }
      if (d.hCool > 0) d.hCool -= dt;
      const bl = ES.bodyLen(sim, f);
      if (d.teth) { const o = d.teth.o; d.teth.t -= dt;
        if (o.dead || o.caught || f.caught || !sim.fish.includes(o) || d.teth.t <= 0) { d.teth = null; d.hCool = 4; continue; }
        if (o.diet && o.diet.traits.includes("plate")) { d.teth = null; d.hCool = 4; note(diet, "miss", f, SP[o.sp].name + "'s plate snapped the line"); continue; }
        const dx = o.x - f.x, dy = o.y - f.y, dist = Math.hypot(dx, dy) || 1, v = maxSp * 2.2 * dt;
        const heavier = ES.bodyLen(sim, o) > bl;
        if (dist < bl * 0.3 && !heavier) { d.teth = null; d.hCool = 4; continue; }
        if (!heavier) { o.x -= dx / dist * v; o.y -= dy / dist * v; o.vx *= 0.5; o.vy *= 0.5; o.z += (f.z - o.z) * Math.min(1, dt * 2); o.alarm = 1; }   // lighter: it comes to you
        else { if (dist > bl * 1.2) { f.x += dx / dist * v; f.y += dy / dist * v; } f.vx = o.vx; f.vy = o.vy;   // towed behind it, a body length back
          f.z += (o.z - f.z) * Math.min(1, dt * 2); }                                              // heavier: it pulls you
        diet.tethers.push({ a: f, b: o }); continue; }
      // what to shoot at: what it is already after, or the nearest thing it could eat; now and then something much heavier, to be towed
      if (f.holding || f.caught) { d.aim = 0; d.aimAt = null; continue; }
      let o = d.aim > 0 ? d.aimAt : null;
      if (!o && d.hCool <= 0) {
        o = f.target && !f.target.dead ? f.target : null;
        if (!o && (d.seekT = (d.seekT || 0) - dt) <= 0) { d.seekT = 0.4; const sp = SP[f.sp];
          o = ES.nearestFish(sim, f.x, f.y, bl * 4.5, (c) => c && c !== f && !c.dead && !c.caught && !c.guest && Math.abs(c.z - f.z) * sim.cfg.dz < 0.3 &&
            ((sp.preySet.has(c.sp) && canEat(diet, f, c)) || (ES.bodyLen(sim, c) > bl * 1.6 && Math.random() < 0.03))); }
      }
      if (!o || o.dead || o.caught) { d.aim = 0; d.aimAt = null; continue; }
      const dist = Math.hypot(o.x - f.x, o.y - f.y);
      if (d.aim > 0) { d.aim -= dt; f.vx *= 0.8; f.vy *= 0.8;
        if (d.aim <= 0) { d.aim = 0; d.aimAt = null;
          if (dist < bl * 5.5 && Math.random() < 0.75) { d.teth = { o, t: ES.bodyLen(sim, o) > bl ? 4 : 1.5 }; if (SP[f.sp].preySet.has(o.sp) && ES.bodyLen(sim, o) <= bl) f.target = o; note(diet, "harpoon", f, SP[f.sp].name + " harpooned " + SP[o.sp].name + (ES.bodyLen(sim, o) > bl ? " and is towed" : "")); }
          else { d.hCool = 2; note(diet, "miss", f, SP[f.sp].name + " missed its shot"); } }
        else diet.tethers.push({ a: f, b: o, aim: true }); }
      else if (d.hCool <= 0 && dist > bl * 0.6 && dist < bl * 4.5) { d.aim = 0.6; d.aimAt = o; }
    }
    // the hitch: ride alongside something much larger
    for (const f of diet.hitchers) {
      const d = f.diet; if (f.dead || !d) { diet.hitchers.delete(f); continue; }
      d.hostT -= dt; const bl = ES.bodyLen(sim, f);
      if (d.hostT <= 0 || !d.host || d.host.dead) { d.hostT = 0.6; d.host = ES.nearestFish(sim, f.x, f.y, bl * 8, (o) => o && o !== f && !o.dead && ES.bodyLen(sim, o) > bl * 2); }
      const h = d.host; if (!h || f.caught) continue;
      const hl = ES.bodyLen(sim, h), tx = h.x - Math.sin(h.ang) * hl * 0.2, ty = h.y + Math.cos(h.ang) * hl * 0.2, k = Math.min(1, dt * 3);
      f.x += (tx - f.x) * k * 0.8; f.y += (ty - f.y) * k * 0.8; f.vx += (h.vx - f.vx) * k; f.vy += (h.vy - f.vy) * k; f.z += (h.z - f.z) * k * 0.5;
    }
  }
  function describe(diet, f) {
    const d = f && f.diet; if (!d) return null; const r = d.counts || read(diet, d), o = offered(d);
    return { gut: d.gut.map((sp) => diet.tag[sp]), mass: d.mass, tier: d.tier, tierName: RULES.tiers[d.tier][1], energy: d.energy / RULES.energyCap, upkeep: upkeep(d), frame: d.frame, nativeFrame: d.nativeFrame,
      traits: d.traits.slice(), offers: { frames: o ? o.offerFrames : [], traits: o ? o.offerTraits : [] }, counts: r, meals: d.meals, fx: d.fx ? d.fx.kind : null, hunts: !!diet.sim.isPredator[f.sp] || !!f.hunter };
  }
  function stats(diet) {
    const s = { frames: {}, traits: {}, tiers: [0, 0, 0], changed: 0, n: 0 };
    for (const f of diet.sim.fish) { const d = f.diet; if (!d || f.dead || f.guest) continue; s.n++; s.frames[d.frame] = (s.frames[d.frame] || 0) + 1; s.tiers[d.tier]++; for (const t of d.traits) s.traits[t] = (s.traits[t] || 0) + 1; if (d.frame !== d.nativeFrame || d.traits.length || d.tier !== d.native) s.changed++; }
    return s;
  }
  // the rules on or off as a whole: off, every creature behaves as its species does; on again, their records act as before
  function setOn(diet, on) {
    diet.on = !!on; diet.tethers.length = 0;
    for (const f of diet.sim.fish) { if (!f.diet) continue; if (on) rebuild(diet, f); else { f.beh = null; f.escMul = 1; } }
    if (!on) diet.sim.hooks.lurers.length = 0;
  }
  window.EcologyDiet = { RULES, FRAMES, TRAITS, create, step, describe, take, drop, pass, hunt, stats, read, setOn };
})();
