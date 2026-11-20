/* ecology-diet.js: the diet game's rules on top of the ecology tank. "You are what you ate."

   Every creature keeps a record of its body:
     gut     the last 12 meals (species)
     mass    every meal adds the prey's size; mass sets the tier (small, mid, large) and the tier sets its scale
     frame   how it moves: shoal, wing, leg, claw. Five of the twelve meals moving one way offer that frame
     traits  at most two abilities. Three of the twelve meals carrying one trait offer it; a trait is shed when
             its prey is gone from the gut
   Size is a bet: a hunter's energy drains with its tier, frame and traits, and a starved one shrinks a tier.
   A creature eats at or below its tier, and ignores prey two tiers down unless that prey schools.
   Who eats whom comes from bodies (RULES.web): a hunter takes what is between 2 and 100 times lighter than itself (weight goes as length
   cubed, so 1.26 to 4.6 times shorter), the range in which real food webs hold together (Brose, Williams and Martinez 2006). A plated
   prey needs a hunter twice as heavy again; claws take on prey 0.6 times as heavy. A species' hand-written menu still holds on top of
   this (it is how a jelly takes a moth its own size), and a species that only grazes wisps never hunts. Prey run from whatever could
   eat them by the same measure. diet.web = "lists" goes back to the hand-written menus alone.
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
  // everything that simulates draws its randomness here: the seeded stream when the core is loaded (a seed replays), Math.random when it is not
  const RND = () => (window.EcoCore ? window.EcoCore.random() : Math.random());
  const RULES = { gut: 12, frameAt: 5, traitAt: 3, slots: 2, tiers: [[0, "Small", 2], [10, "Mid", 5], [25, "Large", 12]], starve: 6, massCap: 45,
    drain: 0.25, mealEnergy: 3, energyCap: 12, scaleStep: 0.2,
    // who eats whom, from bodies: band is the hunter's weight over the prey's (lightest prey it bothers with is band[1] times lighter, heaviest band[0]);
    // plate: a plated prey counts this much heavier; claw: a claw-framed hunter takes prey this much nearer its own weight
    web: { band: [2, 100], plate: 2, claw: 0.6 },
    // the tank's hunters eat rarely, so for the rules to show: a meal is digested sooner, hunters look further, and a creature starts with a gut it has already been filling
    digest: 0.4, sight: 1.5, startGut: [5, 10],
    // the chain: a crawler cracks a sealed pod (works at it for crack seconds), it lets out spores that drift up, and what eats one carries the parasite
    pods: { crack: 1.2, spores: 3, reseal: 22, sporeLife: 16, reach: 1.1, crackEnergy: 2 },
    para: { life: 30, meals: 3, upkeep: 1.5, speed: 1.2, tug: 0.3, slot: 1, maxTier: 1, shake: 3 },
    // by hand: a dash is a burst on a cooldown that costs a little energy; three dashes shake a parasite off
    dash: { dur: 0.55, cool: 2.5, cost: 0.5 },
    // a run: reach the tier and trait count to win; starve at the smallest size, or be eaten, and it is over
    goal: { tier: 2, traits: 2, parts: 4 } };
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
    const wisp = keyIdx.get("wisp"), preyer = SP.map((s) => [...s.preySet].some((i) => i !== wisp));   // a species that hunts (its menu is more than wisps)
    const diet = { sim, ES, tag, keyIdx, web: "body", preyer, wisp, on: true, adapt: true, mine: null, events: [], tethers: [], atlas: new Map(), t: 0, harps: new Set(), hitchers: new Set(), pods: [], spores: [], podsOn: true, run: null, dashCool: 0 };
    sim.hooks.onSpawn = (f) => { init(diet, f); if (diet.on && diet.adapt) inherit(diet, f); else settle(diet, f); };
    sim.hooks.onMeal = (pred, prey) => { if (diet.on) meal(diet, pred, prey); };
    sim.hooks.canEat = (f, o) => !diet.on || canEat(diet, f, o);
    // yours eats by the rules alone, whatever its species' menu: anything at or below its tier that is not its own kind and under 2.6 times its length
    sim.hooks.fears = (f, h) => diet.on && diet.web === "body" && h !== diet.mine && !f.guest && bodyEats(diet, h, f) === true;
    sim.hooks.eats = (f, o) => (diet.on && f !== diet.mine ? bodyEats(diet, f, o) : diet.on && f === diet.mine ? o.sp !== f.sp && !o.guest && !!o.diet && canEat(diet, f, o) && window.EcologySim.bodyLen(sim, o) <= window.EcologySim.bodyLen(sim, f) * 2.6 : undefined);
    sim.hooks.onCatch = (f, o) => { if (!diet.on || !o.diet || !o.diet.traits.includes("sting")) return true;
      f.full = Math.max(f.full, 2); f.ignore = o; f.ignoreT = 4; o.alarm = 1; note(diet, "sting", o, SP[o.sp].name + " stung " + SP[f.sp].name); return false; };
    for (const f of sim.fish) { init(diet, f); settle(diet, f); }
    return diet;
  }
  const tierFor = (mass) => { let t = 0; RULES.tiers.forEach((x, k) => { if (mass >= x[0]) t = k; }); return t; };
  function init(diet, f) {
    const g = diet.tag[f.sp];
    f.diet = { gut: [], mass: [2, 14, 30][g.tier], tier: g.tier, native: g.tier, frame: g.move, nativeFrame: g.move, traits: [], energy: 6 + RND() * 4, meals: 0, scale0: f.scale, sp: f.sp,
      offers: null, wait: 0, passed: "", fx: null, hCool: 0, aim: 0, teth: null, host: null, hostT: 0 };
    f.beh = null; f.escMul = 1;
    // it has been living already: a hunter starts with meals from its own menu, and sees a little further
    const sp = diet.sim.speciesRT[f.sp];
    if (sp.preySet && sp.preySet.size && !f.guest) { const menu = [...sp.preySet], n = RULES.startGut[0] + Math.floor(RND() * (RULES.startGut[1] - RULES.startGut[0] + 1)), fav = menu[Math.floor(RND() * menu.length)];
      for (let i = 0; i < n; i++) f.diet.gut.push(RND() < 0.45 ? fav : menu[Math.floor(RND() * menu.length)]);
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
  const upkeep = (d) => RULES.tiers[d.tier][2] * FRAMES[d.frame].up * d.traits.reduce((m, t) => m * TRAITS[t].up, 1) * (d.para ? RULES.para.upkeep : 1);
  const slotsOf = (d) => RULES.slots - (d.para ? RULES.para.slot : 0);   // a parasite takes a slot until it goes
  // the creature's own behaviour: its species' with its frame and traits laid over
  function rebuild(diet, f) {
    const d = f.diet, base = diet.sim.speciesRT[f.sp].beh; f.escMul = 1;
    if (d.frame === d.nativeFrame && !d.traits.length && !d.para && f !== diet.mine) f.beh = null;
    else { const o = Object.create(base); if (d.frame !== d.nativeFrame) FRAME_BEH[d.frame](o, base); for (const t of d.traits) TRAIT_BEH[t](o, f, base); if (d.para) o.speedMul = (o.speedMul || 1) * RULES.para.speed; f.beh = o; }
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
    if (d.offers && !d.wait) d.wait = 2 + RND() * 4;
  }
  function meal(diet, pred, prey) {
    const d = pred.diet; if (!d) return; const g = diet.tag[prey.sp];
    d.gut.push(prey.sp); if (d.gut.length > RULES.gut) d.gut.shift();
    pred.full *= RULES.digest;
    if (d.para) d.para.meals++;
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
  // a creature's weight, in the units of a plain creature one length long: its drawn length cubed (so it follows its tier, as its scale does)
  const weight = (diet, f) => { const l = f.scale * diet.sim.speciesRT[f.sp].swim.len; return l * l * l; };
  // how many times heavier the hunter is than the prey, as the band reads it: plate and claws shift it
  function ratio(diet, f, o) {
    const W = RULES.web, a = f.diet, b = o.diet; let r = weight(diet, f) / weight(diet, o);
    if (b && b.traits.includes("plate")) r /= W.plate; if (a && a.frame === "claw") r /= W.claw; return r;
  }
  // is o food for f by their bodies: true | false, or undefined to leave it to the species' own menu (the hand-written list, then canEat).
  // The list comes first, so what a species was written to eat it still eats; only a species that hunts gets a menu from its body.
  function bodyEats(diet, f, o) {
    if (diet.web !== "body" || !f.diet || !o.diet || o.guest) return undefined;
    const sp = diet.sim.speciesRT[f.sp];
    if (sp.preySet.has(o.sp) || !(diet.preyer[f.sp] || f.hunter) || o.sp === diet.wisp) return undefined;
    if (o.sp === f.sp) return false;
    const r = ratio(diet, f, o), W = RULES.web;
    if (r < W.band[0]) return false;                                                     // too near its own weight to bring down
    if (r > W.band[1]) { const fb = f.beh || sp.beh, ob = o.beh || diet.sim.speciesRT[o.sp].beh; if (!fb.graze && !fb.spinCatch && !((ob.school || 0) >= 0.9)) return false; }   // too small to be worth it, unless it schools
    return canEat(diet, f, o);
  }
  // a new arrival takes after one that is still alive, a little changed
  function inherit(diet, f) {
    const fish = diet.sim.fish; if (!fish.length) return;
    for (let k = 0; k < 24; k++) { const o = fish[Math.floor(RND() * fish.length)]; if (!o || o.dead || o.sp !== f.sp || !o.diet || o.guest) continue;
      const d = f.diet, s = o.diet; d.gut = s.gut.slice(); d.frame = s.frame; d.traits = s.traits.filter(() => RND() < 0.85);
      if (RND() < 0.15 && d.gut.length) d.gut.splice(Math.floor(RND() * d.gut.length), 1);
      rebuild(diet, f); settle(diet, f); return; }
  }
  function take(diet, f, kind, key, replace) {
    const d = f.diet; if (!d) return false; const name = diet.sim.speciesRT[f.sp].name;
    if (kind === "frame") { if (!FRAMES[key] || key === d.frame) return false; d.frame = key; d.fx = { kind: "cocoon", t: 0, dur: 1.6 }; note(diet, "cocoon", f, name + " took the " + FRAMES[key].name.toLowerCase() + " frame"); }
    else { if (!TRAITS[key] || d.traits.includes(key) || !fits(d, key)) return false;
      if (d.traits.length >= slotsOf(d)) { if (!replace || !d.traits.includes(replace)) return false; d.traits = d.traits.filter((t) => t !== replace); }
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
    if (diet.mine !== diet.was) { const was = diet.was; diet.was = diet.mine; if (was && was.diet && !was.dead) rebuild(diet, was); if (was) was.steer = null; if (diet.mine && diet.mine.diet) { rebuild(diet, diet.mine); diet.mine.full = 0; diet.mine.diet.passed = ""; settle(diet, diet.mine); } }   // what it passed up as a rival is offered again   // yours changed hands
    if (diet.dashCool > 0) diet.dashCool -= dt;
    if (diet.run && diet.run.state === "play") { const R = diet.run, m = diet.mine; R.t += dt;
      if (R.f && (R.f.dead || !sim.fish.includes(R.f))) endRun(diet, "lost", "eaten");
      else if (m && m.diet && (diet.goalFn ? diet.goalFn(m, R) : m.diet.tier >= RULES.goal.tier && (m.maw && diet.partsOf ? diet.partsOf(m) >= RULES.goal.parts : m.diet.traits.length >= RULES.goal.traits))) endRun(diet, "won", ""); }   /* a stage can set diet.goalFn (maw-stages.js) */   /* the Maw grows parts, not traits */
    for (const f of sim.fish) {
      const d = f.diet; if (!d || f.dead) continue;
      if (f.guest) { if (d.gut.length || d.traits.length || f.beh) { d.gut = []; d.traits = []; d.frame = d.nativeFrame; d.offers = null; f.beh = null; f.escMul = 1; } continue; }   // a walker's stand-in is outside the rules
      if (d.sp !== f.sp) { const g = diet.tag[f.sp]; d.sp = f.sp; d.native = g.tier; d.nativeFrame = g.move; d.scale0 = f.scale / (1 + RULES.scaleStep * (d.tier - d.native)); rebuild(diet, f); }   // it evolved along its chain
      // size shows: the body eases to its tier's scale
      const want = d.scale0 * (1 + RULES.scaleStep * (d.tier - d.native)); if (Math.abs(f.scale - want) > 0.002) f.scale += (want - f.scale) * Math.min(1, dt * 1.5);
      // upkeep: only what hunts pays; a starved hunter shrinks a step
      if ((sim.isPredator[f.sp] || f.hunter) && !f.caught) { d.energy -= upkeep(d) / 60 * RULES.drain * (f === diet.mine ? (diet.drainMul ?? 1) : 1) * dt * ((f.puff || 0) > 0.5 && d.traits.includes("puff") ? 3 : 1);   // puffed up burns three times as fast
        if (d.energy <= 0) { if (f === diet.mine && diet.run && diet.run.state === "play" && d.mass <= 0) { endRun(diet, "lost", "starved"); } d.energy = 5; if (d.mass > 0) { d.mass = Math.max(0, d.mass - RULES.starve); setTier(diet, f, "starved"); } } }
      // rivals take what they are offered, after a moment; yours waits for you
      if (d.wait > 0 && f !== diet.mine && diet.adapt) { d.wait -= dt; if (d.wait <= 0) { d.wait = 0; const r = offered(d);
        if (r) { if (r.offerTraits.length && (d.traits.length < slotsOf(d) || RND() < 0.25)) take(diet, f, "trait", r.offerTraits[0], d.traits[0]);
          else if (r.offerFrames.length && RND() < 0.5) take(diet, f, "frame", r.offerFrames[0]); else pass(diet, f); } } }
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
            ((sp.preySet.has(c.sp) && canEat(diet, f, c)) || (ES.bodyLen(sim, c) > bl * 1.6 && RND() < 0.03))); }
      }
      if (!o || o.dead || o.caught) { d.aim = 0; d.aimAt = null; continue; }
      const dist = Math.hypot(o.x - f.x, o.y - f.y);
      if (d.aim > 0) { d.aim -= dt; f.vx *= 0.8; f.vy *= 0.8;
        if (d.aim <= 0) { d.aim = 0; d.aimAt = null;
          if (dist < bl * 5.5 && RND() < 0.75) { d.teth = { o, t: ES.bodyLen(sim, o) > bl ? 4 : 1.5 }; if (SP[f.sp].preySet.has(o.sp) && ES.bodyLen(sim, o) <= bl) f.target = o; note(diet, "harpoon", f, SP[f.sp].name + " harpooned " + SP[o.sp].name + (ES.bodyLen(sim, o) > bl ? " and is towed" : "")); }
          else { d.hCool = 2; note(diet, "miss", f, SP[f.sp].name + " missed its shot"); } }
        else diet.tethers.push({ a: f, b: o, aim: true }); }
      else if (d.hCool <= 0 && dist > bl * 0.6 && dist < bl * 4.5) { d.aim = 0.6; d.aimAt = o; }
    }
    if (diet.podsOn) chain(diet, dt, maxSp);
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
  // ---- by hand: heading, dash, depth; and a run with an end ----
  function steer(diet, x, y, keep) { const f = diet.mine; if (!f) return; const l = Math.hypot(x, y); f.steer = l > 1e-4 ? { x: x / l, y: y / l, keep: !!keep } : null; }
  function dash(diet) { const f = diet.mine; if (!f || !f.diet || diet.dashCool > 0 || f.caught) return false;
    diet.dashCool = RULES.dash.cool; f.dashT = RULES.dash.dur; f.diet.energy -= RULES.dash.cost;
    if (f.steer) { const v = diet.sim.cfg.size * 1.6 * diet.sim.cfg.speed * 2; f.vx = f.steer.x * v; f.vy = f.steer.y * v; }
    if (f.diet.para) { f.diet.para.shake = (f.diet.para.shake || 0) + 1; if (f.diet.para.shake >= RULES.para.shake) clear(diet, f, "shaken off"); }
    return true; }
  function depth(diet, dir) { const f = diet.mine; if (f) f.zPref = Math.max(0, Math.min(1, (f.zPref || 0.5) + dir * 0.25)); }
  function setMass(diet, f, mass) { if (!f || !f.diet) return; f.diet.mass = mass; setTier(diet, f, ""); }   // a stage that starts it bigger
  function startRun(diet, f) { diet.run = { state: "play", t: 0, f, why: "", meals0: f.diet ? f.diet.meals : 0 }; diet.dashCool = 0; if (f.diet) { f.diet.energy = RULES.energyCap * 0.8; f.diet.para = null; } }
  function endRun(diet, state, why) { const R = diet.run; if (!R || R.state !== "play") return; R.state = state; R.why = why; const f = R.f; if (f) f.steer = null;
    note(diet, state, f && !f.dead ? f : null, state === "won" ? "Run won in " + Math.round(R.t) + " s" : "Run over: " + why); }
  // ---- the chain: pod, crawler, spore, parasite ----
  // spots: [{x, y}] on the floor, a few beside each tower; z is the floor in the tank's depth fraction
  function setPods(diet, spots) { diet.pods = spots.map((p) => ({ x: p.x, y: p.y, z: p.z || 0.93, open: false, work: 0, reseal: 0 })); diet.spores.length = 0; }
  const crawler = (f) => !f.dead && !f.caught && !f.guest && f.diet && (f.diet.frame === "claw" || f.diet.frame === "leg") && f.z > 0.75;
  function sporeOut(diet, x, y, z, n) { for (let i = 0; i < n; i++) { const a = RND() * 6.283, v = diet.sim.cfg.size * (0.15 + RND() * 0.25); diet.spores.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: RULES.pods.sporeLife }); } }
  function infest(diet, f, how) { const d = f.diet; d.para = { t: RULES.para.life, meals: 0 }; d.fx = { kind: "graft", t: 0, dur: 0.9 }; f.gulp = 1;
    if (d.traits.length > slotsOf(d)) d.traits.pop(); rebuild(diet, f); settle(diet, f); note(diet, "parasite", f, diet.sim.speciesRT[f.sp].name + " took a parasite" + (how ? " (" + how + ")" : "")); }
  function clear(diet, f, why) { const d = f.diet; d.para = null; rebuild(diet, f); settle(diet, f); sporeOut(diet, f.x, f.y, f.z, 2); note(diet, "parasite-out", f, diet.sim.speciesRT[f.sp].name + " passed the parasite (" + why + ")"); }
  function chain(diet, dt, maxSp) {
    const sim = diet.sim, ES = window.EcologySim, dz = sim.cfg.dz;
    for (const p of diet.pods) {
      if (p.open) { if ((p.reseal -= dt) <= 0) { p.open = false; p.work = 0; } continue; }
      const by = ES.nearestFish(sim, p.x, p.y, sim.cfg.size * 3, (f) => f && crawler(f) && Math.hypot(f.x - p.x, f.y - p.y) < ES.bodyLen(sim, f) * RULES.pods.reach + sim.cfg.size * 0.3);
      if (!by) { p.work = Math.max(0, p.work - dt * 0.5); continue; }
      p.work += dt; p.by = by;
      if (p.work >= RULES.pods.crack) { p.open = true; p.reseal = RULES.pods.reseal; sporeOut(diet, p.x, p.y, p.z, RULES.pods.spores); by.diet.energy = Math.min(RULES.energyCap, by.diet.energy + RULES.pods.crackEnergy);
        note(diet, "crack", by, sim.speciesRT[by.sp].name + " cracked a pod"); }
    }
    for (let i = diet.spores.length - 1; i >= 0; i--) {
      const sp = diet.spores[i]; sp.life -= dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vx *= 1 - Math.min(1, dt * 0.6); sp.vy *= 1 - Math.min(1, dt * 0.6);
      sp.z = Math.max(0.35, sp.z - dt * 0.035);   // it rises
      const host = ES.nearestFish(sim, sp.x, sp.y, sim.cfg.size * 2.5, (f) => { const d = f && f.diet; return !!d && !f.dead && !f.caught && !f.guest && !d.para && d.tier <= RULES.para.maxTier &&
        Math.hypot(f.x - sp.x, f.y - sp.y) < ES.bodyLen(sim, f) * 0.6 + sim.cfg.size * 0.2 && Math.abs(f.z - sp.z) * dz < 0.3 && (d.energy < 9 || f === diet.mine); });
      if (host) infest(diet, host, "a spore");
      if (host || sp.life <= 0) diet.spores.splice(i, 1);
    }
    // the parasite: faster, hungrier, and it tugs its host back toward the pods; it goes after a while or when three meals have gone through
    for (const f of sim.fish) { const d = f.diet; if (!d || !d.para || f.dead) continue;
      d.para.t -= dt;
      if (d.para.t <= 0) { clear(diet, f, "its time"); continue; } if (d.para.meals >= RULES.para.meals) { clear(diet, f, d.para.meals + " meals"); continue; }
      if (f.caught || !diet.pods.length) continue;
      let best = null, bd = 1e12; for (const p of diet.pods) { const dd = (p.x - f.x) ** 2 + (p.y - f.y) ** 2; if (dd < bd) { bd = dd; best = p; } }
      const dist = Math.sqrt(bd) || 1; if (dist > sim.cfg.size) { f.vx += (best.x - f.x) / dist * maxSp * RULES.para.tug * dt * 3; f.vy += (best.y - f.y) / dist * maxSp * RULES.para.tug * dt * 3; }
    }
  }
  function describe(diet, f) {
    const d = f && f.diet; if (!d) return null; const r = d.counts || read(diet, d), o = offered(d);
    return { gut: d.gut.map((sp) => diet.tag[sp]), mass: d.mass, tier: d.tier, tierName: RULES.tiers[d.tier][1], energy: d.energy / RULES.energyCap, upkeep: upkeep(d), frame: d.frame, nativeFrame: d.nativeFrame,
      traits: d.traits.slice(), offers: { frames: o ? o.offerFrames : [], traits: o ? o.offerTraits : [] }, counts: r, meals: d.meals, slots: slotsOf(d), para: d.para ? { t: d.para.t, meals: d.para.meals } : null, fx: d.fx ? d.fx.kind : null, hunts: !!diet.sim.isPredator[f.sp] || !!f.hunter };
  }
  function stats(diet) {
    const s = { frames: {}, traits: {}, tiers: [0, 0, 0], changed: 0, n: 0, pods: diet.pods.length, open: diet.pods.filter((p) => p.open).length, spores: diet.spores.length, para: 0 };
    for (const f of diet.sim.fish) { const d = f.diet; if (!d || f.dead || f.guest) continue; s.n++; if (d.para) s.para++; s.frames[d.frame] = (s.frames[d.frame] || 0) + 1; s.tiers[d.tier]++; for (const t of d.traits) s.traits[t] = (s.traits[t] || 0) + 1; if (d.frame !== d.nativeFrame || d.traits.length || d.tier !== d.native) s.changed++; }
    return s;
  }
  // the rules on or off as a whole: off, every creature behaves as its species does; on again, their records act as before
  function setOn(diet, on) {
    diet.on = !!on; diet.tethers.length = 0;
    for (const f of diet.sim.fish) { if (!f.diet) continue; if (on) rebuild(diet, f); else { f.beh = null; f.escMul = 1; } }
    if (!on) diet.sim.hooks.lurers.length = 0;
  }
  window.EcologyDiet = { RULES, FRAMES, TRAITS, weight, ratio, bodyEats, create, step, describe, take, drop, pass, hunt, stats, read, setOn, setPods, infest, steer, dash, depth, startRun, endRun, setMass };
})();
