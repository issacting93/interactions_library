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
     env     dark (share of creatures unlit, 0..1), ruins (towers on), day (Route render), forest ({ kind, trees, under, scale, low }: a wood grown
             on the floor by FloraForest, trees and plants beneath per million tank units squared; the trees count as weed for the habitat)
     props   landmarks on the floor: boulder, weed, carcass, vent -> how many
     kit     what the Maw starts with: eyes (pairs), sonar (0/1), form ("walk" | "swim"), mass (2 small, 14 mid)
     goal    all must hold: meals, eat [{ keys, n, label }] (the keys count together), eyes, sonar, form, tier, parts
     press   the pressure, both 1 when unset: upkeep (how fast the Maw's energy drains, x), prey (how much food the director keeps about, x)

   Editing (the tank's Rings tab): a stage in LIST is changed in place, so everything that reads it sees the change.
     MawStages.save(id)             keep this stage's settings on this device (localStorage "maw-stage-edits"); they are laid over LIST at load
     MawStages.reset(id)            back to the stage as shipped;  MawStages.edited(id) -> bool
     MawStages.exportText(all?)     the edited stages' settings as JSON, to paste back into this file

   More places (the level editor, games/the-maw/editor; docs/LEVELS.md): stages beyond the seven, kept on this device.
     MawStages.EXTRA                them, in the order they were added; never part of LIST, so a run and Endless are still the seven
     MawStages.add(stage)           add or replace one by id, and keep it (localStorage "maw-stages-extra"); remove(id) takes it away
     MawStages.fromLevel(level, id) a stage level as a stage (with stage.layout.towers when it places its own)
     get(id) finds these too. "draft" is the level the editor is playing now (read from its draft, never kept here) */
(function () {
  "use strict";
  const LIST = [
    { id: "floor", n: 1, name: "The Floor", place: "Open floor, dim", verb: "Lunge",
      brief: "Where it hatched. Slow things graze the ground, and one hunter the Maw's own size walks among them. Hold to coil, let go to lunge.",
      trick: "Studded Leeches ride bigger creatures: eat one and the Maw can Hitch. Pincers hunt what you hunt.",
      roster: { worm: 8, leech: 6, "plated-scavenger": 6, "comb-drifter": 6, "glass-star": 5, pincer: 3, wisp: 18 },
      crew: { strider: 4, pincer: 2 },
      props: { boulder: 14, carcass: 3, weed: 4 },
      env: { dark: 0.15, ruins: false },
      kit: {},
      goal: { meals: 12 }, press: { upkeep: 12, prey: 1, regrow: 45 } },
    { id: "frond", n: 2, name: "Frond Forest", place: "Weed, darker", verb: "See",
      brief: "The weed hides things that stay still. Frond Wings are unseen until they move. Eat what hides and the Maw grows eyes.",
      trick: "Frond Wings and Cloak Rogues vanish while still. Watch for movement. What hides can teach the Maw to hide (Cloak).",
      roster: { "frond-serpent": 9, "black-monarch": 5, worm: 6, serpent: 4, rogue: 2, wisp: 26 },
      crew: { strider: 3 },
      props: { weed: 10, boulder: 6 },
      env: { dark: 0.35, ruins: false, forest: { kind: "wood", trees: 60, under: 150, litter: 0.8, scale: 0.42, low: 0.7 } },
      kit: {},
      goal: { eyes: 1, meals: 10 }, press: { upkeep: 12, prey: 1, regrow: 45 } },
    { id: "shoals", n: 3, name: "The Shoals", place: "Open water, light", verb: "Swim",
      brief: "Schools turn above the floor. Eat three of what swims in shoals and the Maw cocoons, then swims.",
      trick: "A school is hard to pick one out of, and it scatters when you charge. Eat three of one kind and it takes you for one of its own (Mimic). Finned Serpents spit; eat one and so can you.",
      roster: { swift: 26, koi: 16, "ringed-lance-swift": 6, serpent: 3, manta: 2, wisp: 16 },
      crew: { strider: 3 },
      props: { boulder: 8, weed: 10, carcass: 1 },
      env: { dark: 0.1, ruins: false },
      kit: { eyes: 1 },
      goal: { form: "swim" }, press: { upkeep: 8, prey: 1, regrow: 45 } },
    { id: "deep", n: 4, name: "The Lantern Deep", place: "Near black", verb: "Sense",
      brief: "Almost nothing here gives off light. Jellies sting, and what stings gives Sonar. The anglers' lures are easy to find and hard to reach.",
      trick: "Bell Jellies stun the biter. Lantern Anglers draw the smallest prey to them. Eat one and the Maw can lure too.",
      roster: { moth: 6, jelly: 6, "angler-tailed-jelly-af60": 4, angler: 4, eel: 2, wisp: 34 },
      crew: {},
      props: { vent: 12, boulder: 6 },
      env: { dark: 0.85, ruins: false },
      kit: { eyes: 1, form: "swim", mass: 12 },
      goal: { sonar: 1, eat: [{ keys: ["angler"], n: 2 }] }, press: { upkeep: 3, prey: 1, regrow: 45 } },
    { id: "spires", n: 5, name: "The Spires", place: "Towers", verb: "Climb",
      brief: "Centiwyrms and lancers live on the towers and leap for what passes. Climb after them.",
      trick: "Climbers strike from a perch. Eye Wings hunt the open air between the towers. Eat a climber and the Maw can Leap.",
      roster: { "crowned-sickle-lancer": 4, "dragon-winged-stub-worm-7390": 4, swift: 14, "eye-wing": 3, wisp: 16 },
      crew: { centiwyrm: 3, lancer: 3, strider: 2 },
      props: { boulder: 10, carcass: 2 },
      env: { dark: 0.25, ruins: true },
      kit: { eyes: 1, sonar: 1 },
      goal: { eat: [{ keys: ["pearl-chasing-centiwyrm", "strike-lance"], n: 4, label: "Climbers" }], tier: 1 }, press: { upkeep: 8, prey: 1, regrow: 45 } },
    { id: "colony", n: 6, name: "The Colony", place: "Dim, crowded", verb: "Patience",
      brief: "Everything here bites back or swells. A puffed puffer cannot be swallowed: wait for it to go down. Chain colonies sting.",
      trick: "Puffers swell when threatened. Bramble Wyrms and Rosary Eels sting. Eat them and the Maw learns to Puff, to Sting, and to lay in what it bites (Infect).",
      roster: { "chain-colony": 4, siphon: 4, puffer: 6, "fin-puffer": 5, "glass-star": 6, jelly: 3, wisp: 20 },
      crew: { pincer: 2 },
      props: { vent: 7, boulder: 8, weed: 8 },
      env: { dark: 0.45, ruins: false },
      kit: { eyes: 1, sonar: 1 },
      goal: { eat: [{ keys: ["chain-colony"], n: 2 }, { keys: ["puffer", "fin-puffer"], n: 2, label: "Puffers" }] }, press: { upkeep: 6, prey: 1, regrow: 45 } },
    { id: "apex", n: 7, name: "The Apex", place: "The whole tank", verb: "Become",
      brief: "Everything you learned, against everything that hunts. Grow to Large with four parts.",
      trick: "Blade Hunters, dragons and seraphs eat anything smaller. Grow faster than they find you. At Large the Maw is a queen and can Brood.",
      roster: { hunter: 4, dragon: 3, "koi-winged-dragon-6cce": 3, "halo-eyed-seraph": 2, "ophan-halo-monarch": 2, manta: 2, koi: 16, swift: 16, puffer: 3, wisp: 20 },
      crew: { strider: 3, pincer: 2, lancer: 2, centiwyrm: 2 },
      props: { carcass: 6, boulder: 10, weed: 8 },
      env: { dark: 0.3, ruins: true },
      kit: { eyes: 1, sonar: 1, mass: 14 },
      goal: { tier: 2, parts: 4 }, press: { upkeep: 4, prey: 1, regrow: 60 } },
  ];
  const BY = Object.fromEntries(LIST.map((s) => [s.id, s]));
  // edits: the settings a person tuned, kept on this device and laid over the shipped stages
  const FIELDS = ["roster", "crew", "env", "kit", "goal", "press"], EKEY = "maw-stage-edits", copy = (o) => JSON.parse(JSON.stringify(o)), BASE = copy(LIST);
  const pickOf = (st) => { const o = {}; for (const f of FIELDS) if (st[f] !== undefined) o[f] = copy(st[f]); return o; };
  function edits() { try { return JSON.parse(localStorage.getItem(EKEY) || "{}") || {}; } catch (e) { return {}; } }
  function save(id) { const st = BY[id]; if (!st) return false; try { const e = edits(); e[id] = pickOf(st); localStorage.setItem(EKEY, JSON.stringify(e)); return true; } catch (e) { return false; } }
  function reset(id) { const st = BY[id], b = BASE.find((s) => s.id === id); if (!st || !b) return; for (const f of FIELDS) { if (b[f] === undefined) delete st[f]; else st[f] = copy(b[f]); }
    try { const e = edits(); delete e[id]; localStorage.setItem(EKEY, JSON.stringify(e)); } catch (e) {} }
  const edited = (id) => { const b = BASE.find((s) => s.id === id); return !!b && JSON.stringify(pickOf(BY[id])) !== JSON.stringify(pickOf(b)); };
  const exportText = (all) => JSON.stringify(Object.fromEntries(LIST.filter((s) => all || edited(s.id)).map((s) => [s.id, pickOf(s)])), null, 1);
  { const e = edits(); for (const id in e) if (BY[id]) for (const f of FIELDS) if (e[id][f] !== undefined) BY[id][f] = copy(e[id][f]); }
  // more places: made in the level editor, kept on this device, listed after the seven
  const XKEY = "maw-stages-extra", EXTRA = [];
  // their words go into the menu as markup, so anything that could be markup is taken out here
  const plain = (t) => String(t == null ? "" : t).replace(/[<>&"']/g, "").slice(0, 400);
  const norm = (st, id) => { const o = Object.assign({ roster: {}, crew: {}, props: {}, env: {}, kit: {}, goal: {}, press: {} }, copy(st), { id, extra: true }); for (const k of ["place", "verb", "brief", "trick"]) o[k] = plain(o[k]); o.name = plain(st.name || id).slice(0, 60) || id;
    for (const e of (o.goal && o.goal.eat) || []) if (e.label) e.label = plain(e.label); return o; };
  const renum = () => EXTRA.forEach((st, i) => { st.n = LIST.length + 1 + i; });
  function keep() { try { localStorage.setItem(XKEY, JSON.stringify(Object.fromEntries(EXTRA.filter((s) => s.id !== "draft").map((s) => [s.id, s])))); return true; } catch (e) { return false; } }
  function add(st, o) { if (!st || !/^[\w-]{1,60}$/.test(st.id || "") || BY[st.id]) return null; const n = norm(st, st.id), i = EXTRA.findIndex((s) => s.id === st.id); if (i >= 0) EXTRA[i] = n; else EXTRA.push(n); renum(); if (!(o && o.keep === false)) keep(); return n; }
  function remove(id) { const i = EXTRA.findIndex((s) => s.id === id); if (i < 0) return false; EXTRA.splice(i, 1); renum(); keep(); return true; }
  try { const m = JSON.parse(localStorage.getItem(XKEY) || "{}") || {}; for (const id in m) add(m[id], { keep: false }); } catch (e) {}
  // a stage level (docs/LEVELS.md) as a stage: its settings, its name, and any towers it places (only when its towers are on)
  function fromLevel(lv, id) { if (!lv || lv.format !== "forge-level" || lv.kind !== "stage" || !lv.stage) return null; const st = Object.assign({ id, name: lv.name }, lv.stage);
    const tw = (lv.entities || []).filter((e) => e.type === "tower").map((e) => ({ x: +e.x, y: +e.y, r: +e.r, height: +e.height })).filter((t) => [t.x, t.y, t.r, t.height].every(Number.isFinite));
    if (tw.length && st.env && st.env.ruins) st.layout = { towers: tw }; else delete st.layout; return st; }
  try { const st = fromLevel(JSON.parse(localStorage.getItem("forge-level-draft") || "null"), "draft"); if (st) add(st, { keep: false }); } catch (e) {}
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
  window.MawStages = { save, reset, edited, exportText, LIST, EXTRA, add, remove, fromLevel, get: (id) => BY[id] || EXTRA.find((s) => s.id === id) || null, done, markDone, next, check, goalText, TIER };
})();
