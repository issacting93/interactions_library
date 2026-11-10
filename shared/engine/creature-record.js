/* INTERACTIONS — the creature record: one shape for everything that walks.
   Every kind of creature is saved to the world file (world/forge/web/forge-world.js) as a "species"
   object whose recipe says what kind it is, how to rebuild it, how it moves and where it came from:

     recipe.kind      which kind (KINDS below)
     recipe.motion    { appendage, run }: the neck and tail that ride along (an APPENDAGES id or "none")
                      and how it runs (a RUN id or "none"); see shared/engine/motion/walker.js
     refs[]           its parents, so Lineage can draw where it came from

   The rest of the recipe is the kind's own:
     walker     { walker, param, group }    a Bestiary creature by its key, with its slider value and its row
     kit-mech   { seed, picks, cells }      one kit part per slot; breedable on the bloom of blooms
     glb-mech   { glb }                     a Blender model (base64 .glb), from the Forge Mech template or not
     composed, composed-mech, composed-blade   designs from Compose (their own recipes)
     bred       Bestiary Forge's layout recipe

   This file reads records; it draws nothing and moves nothing. Classic script -> window.CreatureRecord. */
(function () {
  "use strict";
  // group: the row a kind sits in on the Species page; legs: how its legs are solved; walks: can the
  // 3D Bestiary open it; breeds: can the bloom of blooms mutate it
  const KINDS = {
    "walker": { label: "Bestiary walker", group: "sheet", legs: "By creature", walks: true },
    "bred": { label: "Bred in Bestiary Forge", group: "forge", legs: "Spider stance, or tentacles", walks: false },
    "composed": { label: "Composed on the grid", group: "sheet", legs: "Spider stance", walks: false },
    "composed-mech": { label: "Kit mech from Compose", group: "kit", legs: "Machine stance", walks: true },
    "composed-blade": { label: "Blade mech from Compose", group: "kit", legs: "Machine stance", walks: true },
    "kit-mech": { label: "Kit mech", group: "kit", legs: "Machine stance", walks: true, breeds: true },
    "glb-mech": { label: "Blender solid", group: "solid", legs: "Rigid thigh and shin, at your knee", walks: true },
  };
  const GROUPS = [
    { id: "sheet", label: "Sheet walkers", sub: "parts sliced into bones" },
    { id: "forge", label: "Forge exports", sub: "bred in Bestiary Forge, or drifted in Ecology" },
    { id: "kit", label: "Kit mechs", sub: "hand-drawn kit, one part per slot" },
    { id: "solid", label: "Blender solids", sub: ".glb, from the template or any model" },
  ];
  const APPENDAGE_NAMES = { none: "Plain", qilin: "Qilin", dragon: "Dragon", scorpion: "Scorpion", swan: "Swan" };
  const RUN_NAMES = { none: "Walks", horse: "Trot · gallop", strider: "Pace · bound" };

  function kindOf(record) {
    const r = (record && record.recipe) || {};
    // a Bestiary walker says which row it belongs in (recipe.group): the qilin is a Blender solid, the Quad Mech a kit mech
    if (KINDS[r.kind]) return { id: r.kind, ...KINDS[r.kind], ...(r.group && GROUPS.some((g) => g.id === r.group) ? { group: r.group } : {}) };
    // a drifted variant from Ecology keeps its base species' recipe under r.base
    if (r.base) return { id: "variant", label: "Variant · gen " + (r.generation || 1), group: "forge", legs: "Spider stance, or tentacles", walks: false };
    return { id: r.kind || "species", label: r.kind || "Species", group: "forge", legs: "", walks: false };
  }
  const motionOf = (record) => ({ appendage: "none", run: "none", ...(((record && record.recipe) || {}).motion || {}) });
  function motionLabel(record) {
    const m = motionOf(record);
    return [m.appendage !== "none" ? (APPENDAGE_NAMES[m.appendage] || m.appendage) + " neck and tail" : null, m.run !== "none" ? RUN_NAMES[m.run] || m.run : null].filter(Boolean).join(" · ") || "Walks, plain";
  }
  // the 3D Bestiary opened on this record, or null if this kind can't walk there yet
  function walkUrl(record, opts) {
    opts = opts || {};
    if (!kindOf(record).walks) return null;
    const q = new URLSearchParams({ world: opts.worldId || "", object: record.id });
    if (opts.returnTo) q.set("return", opts.returnTo);
    return (opts.root || "../../../") + "world/forges/walker-bestiary/index.html?" + q.toString();
  }
  // the object to hand to world.put(): type species, with the kind's recipe, its motion and its parents
  function make(o) {
    return { ...(o.id ? { id: o.id } : {}), type: "species", name: o.name, recipe: { ...o.recipe, kind: o.kind, motion: { appendage: "none", run: "none", ...(o.motion || {}) } },
      refs: (o.parents || []).filter(Boolean), thumb: o.thumb || null, svg: o.svg || null, source: o.source || null };
  }
  window.CreatureRecord = { KINDS, GROUPS, APPENDAGE_NAMES, RUN_NAMES, kindOf, motionOf, motionLabel, walkUrl, make };
})();
