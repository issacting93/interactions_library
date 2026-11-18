/* The Maw's seven stages: one tank, seven places in it. Each is a slice of the ecology (its creatures, its light,
   its ground and its walkers), the Maw it starts as, and the change that clears it. Plan: Forge project doc
   claude/forge-maw-stages.md. Data only, plus progress and the goal check; the tank page applies a stage.

     MawStages.LIST                 the stages, in order
     MawStages.get(id)              one stage
     MawStages.done() / markDone(id)  which are cleared (localStorage "maw-stages")
     MawStages.next(id)             the stage after
     MawStages.check(stage, s)      s = { meals, eaten: { key: n }, eyes, sonar, form, tier, parts }
                                    -> { ok, rows: [{ label, have, need, ok }] } for the goal line

   A stage:
     roster  species key -> how many in the tank (the tank's population is set to these and nothing else)
     crew    walker key (strider, pincer, lancer, centiwyrm) -> how many walk the floor and the towers
     env     dark (share of creatures unlit, 0..1), ruins (towers on), day (Route render)
     props   landmarks on the floor: boulder, weed, carcass, vent -> how many
     kit     what the Maw starts with: eyes (pairs), sonar (0/1), form ("walk" | "swim"), mass (2 small, 14 mid)
     goal    all must hold: meals, eat [{ keys, n, label }] (the keys count together), eyes, sonar, form, tier, parts */
(function () {
  "use strict";
  const LIST = [
    { id: "floor", n: 1, name: "The Floor", place: "Open floor, dim", verb: "Lunge",
      brief: "Where it hatched. Slow things graze the ground, and one hunter the Maw's own size walks among them. Hold to coil, let go to lunge.",
      trick: "Studded Leeches ride bigger creatures. Pincers hunt what you hunt.",
      roster: { worm: 8, leech: 6, "plated-scavenger": 6, "comb-drifter": 6, "glass-star": 5, pincer: 3, wisp: 18 },
      crew: { strider: 4, pincer: 2 },
      props: { boulder: 14, carcass: 3, weed: 4 },
      env: { dark: 0.15, ruins: false },
      kit: {},
      goal: { meals: 5 } },
    { id: "frond", n: 2, name: "Frond Forest", place: "Weed, darker", verb: "See",
      brief: "The weed hides things that stay still. Frond Serpents are unseen until they move. Eat what hides and the Maw grows eyes.",
      trick: "Frond Serpents and Cloak Rogues vanish while still. Watch for movement.",
      roster: { "frond-serpent": 9, "black-monarch": 5, worm: 6, serpent: 4, rogue: 2, wisp: 26 },
      crew: { strider: 3 },
      props: { weed: 34, boulder: 6 },
      env: { dark: 0.35, ruins: false },
      kit: {},
      goal: { eyes: 1 } },
    { id: "shoals", n: 3, name: "The Shoals", place: "Open water, light", verb: "Swim",
      brief: "Schools turn above the floor. Eat three of what swims in shoals and the Maw cocoons, then swims.",
      trick: "A school is hard to pick one out of, and it scatters when you charge. Ribbon Serpents and Glass Mantas hunt the edges.",
      roster: { swift: 26, koi: 16, "ringed-lance-swift": 6, serpent: 3, manta: 2, wisp: 16 },
      crew: { strider: 3 },
      props: { boulder: 8, weed: 10, carcass: 1 },
      env: { dark: 0.1, ruins: false },
      kit: { eyes: 1 },
      goal: { form: "swim" } },
    { id: "deep", n: 4, name: "The Lantern Deep", place: "Near black", verb: "Sense",
      brief: "Almost nothing here gives off light. Jellies sting, and what stings gives Sonar. The anglers' lures are easy to find and hard to reach.",
      trick: "Bell Jellies stun the biter. Lantern Anglers draw the smallest prey to them.",
      roster: { moth: 6, jelly: 6, "angler-tailed-jelly-af60": 4, angler: 4, eel: 2, wisp: 34 },
      crew: {},
      props: { vent: 12, boulder: 6 },
      env: { dark: 0.85, ruins: false },
      kit: { eyes: 1, form: "swim" },
      goal: { sonar: 1, eat: [{ keys: ["angler"], n: 2 }] } },
    { id: "spires", n: 5, name: "The Spires", place: "Towers", verb: "Climb",
      brief: "Centiwyrms and lancers live on the towers and leap for what passes. Climb after them.",
      trick: "Climbers strike from a perch. Eye Wings hunt the open air between the towers.",
      roster: { "crowned-sickle-lancer": 4, "dragon-winged-stub-worm-7390": 4, swift: 14, "eye-wing": 3, wisp: 16 },
      crew: { centiwyrm: 3, lancer: 3, strider: 2 },
      props: { boulder: 10, carcass: 2 },
      env: { dark: 0.25, ruins: true },
      kit: { eyes: 1, sonar: 1 },
      goal: { eat: [{ keys: ["pearl-chasing-centiwyrm", "strike-lance"], n: 2, label: "Climbers" }], tier: 1 } },
    { id: "colony", n: 6, name: "The Colony", place: "Dim, crowded", verb: "Patience",
      brief: "Everything here bites back or swells. A puffed puffer cannot be swallowed: wait for it to go down. Chain colonies sting.",
      trick: "Puffers swell when threatened. Chain Colonies and Bead Siphons sting.",
      roster: { "chain-colony": 4, siphon: 4, puffer: 6, "fin-puffer": 5, "glass-star": 6, jelly: 3, wisp: 20 },
      crew: { pincer: 2 },
      props: { vent: 7, boulder: 8, weed: 8 },
      env: { dark: 0.45, ruins: false },
      kit: { eyes: 1, sonar: 1 },
      goal: { eat: [{ keys: ["chain-colony"], n: 2 }, { keys: ["puffer", "fin-puffer"], n: 2, label: "Puffers" }] } },
    { id: "apex", n: 7, name: "The Apex", place: "The whole tank", verb: "Become",
      brief: "Everything you learned, against everything that hunts. Grow to Large with four parts.",
      trick: "Blade Hunters, dragons and seraphs eat anything smaller. Grow faster than they find you.",
      roster: { hunter: 4, dragon: 3, "koi-winged-dragon-6cce": 3, "halo-eyed-seraph": 2, "ophan-halo-monarch": 2, manta: 2, koi: 16, swift: 16, puffer: 3, wisp: 20 },
      crew: { strider: 3, pincer: 2, lancer: 2, centiwyrm: 2 },
      props: { carcass: 6, boulder: 10, weed: 8 },
      env: { dark: 0.3, ruins: true },
      kit: { eyes: 1, sonar: 1, mass: 14 },
      goal: { tier: 2, parts: 4 } },
  ];
  const BY = Object.fromEntries(LIST.map((s) => [s.id, s]));
  const KEY = "maw-stages";
  function done() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function markDone(id) { try { const d = done(); d[id] = (d[id] || 0) + 1; localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function next(id) { const i = LIST.findIndex((s) => s.id === id); return i >= 0 && i < LIST.length - 1 ? LIST[i + 1] : null; }
  const TIER = ["Small", "Mid", "Large"];
  // the goal as rows: what is needed, what you have. names: species key -> display name (from the tank)
  function check(st, s, names) {
    const G = st.goal, rows = [], nm = (k) => (names && names[k]) || k, cnt = (keys) => keys.reduce((a, k) => a + ((s.eaten && s.eaten[k]) || 0), 0);
    if (G.meals) rows.push({ label: "Meals", have: s.meals || 0, need: G.meals, ok: (s.meals || 0) >= G.meals });
    for (const e of G.eat || []) { const have = cnt(e.keys); rows.push({ label: e.label || e.keys.map(nm).join(" or "), have, need: e.n, ok: have >= e.n }); }
    if (G.eyes) rows.push({ label: "Eyes", have: s.eyes || 0, need: G.eyes, ok: (s.eyes || 0) >= G.eyes, flag: true });
    if (G.sonar) rows.push({ label: "Sonar", have: s.sonar || 0, need: G.sonar, ok: (s.sonar || 0) >= G.sonar, flag: true });
    if (G.form) rows.push({ label: G.form === "swim" ? "Swimmer" : "Walker", have: s.form === G.form ? 1 : 0, need: 1, ok: s.form === G.form, flag: true });
    if (G.tier != null) rows.push({ label: TIER[G.tier], have: s.tier || 0, need: G.tier, ok: (s.tier || 0) >= G.tier, flag: true });
    if (G.parts) rows.push({ label: "Parts", have: s.parts || 0, need: G.parts, ok: (s.parts || 0) >= G.parts });
    return { ok: rows.length > 0 && rows.every((r) => r.ok), rows };
  }
  // one line for the menu: what clears it
  const plural = (w) => /s$/.test(w) ? w : /y$/.test(w) ? w.slice(0, -1) + "ies" : w + "s";
  function goalText(st, names) {
    return check(st, {}, names).rows.map((r) => r.label === "Swimmer" ? "become a Swimmer" : r.label === "Mid" || r.label === "Large" ? "reach " + r.label
      : r.flag ? "grow " + r.label : r.label === "Parts" ? "grow " + r.need + " parts" : r.label === "Meals" ? "eat " + r.need + " creatures"
      : "eat " + r.need + " " + (r.need > 1 ? r.label.split(" or ").map(plural).join(" or ") : r.label)).join(", ").replace(/^./, (c) => c.toUpperCase()); }
  window.MawStages = { LIST, get: (id) => BY[id] || null, done, markDone, next, check, goalText, TIER };
})();
