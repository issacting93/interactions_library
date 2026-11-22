/* Creatures: the one list of built creatures (the ones that are not a kit sheet walked as drawn: see species-rig.js PLANS for those).
   A creature is one spec, registered once, and every page reads the list: the tank's walker host (ecology-walkers.js) builds it, the brain
   (world-brain.js) takes its rules, Specimen lists it with its text and draws its switches. Adding a creature never touches those files.

     Creatures.register({
       key: "stag",                        // its id: the walker host's cast key, Specimen's #c=stag
       name: "Stag", tier: "Beast",        // shown on Specimen
       mood: "...", text: "...",           // one line, and a paragraph on how it is built
       color: [r, g, b],                   // its line colour, 0..1
       guest: "carapace-strider",          // the tank species whose body stands in for it in the food web (default)
       brain: { medium: "land", hunts: [], sense, fearR, calmR, speed, run, bold, hungerRate, hungry },   // WorldBrain's rules for it
       climbs: false,                      // may it climb towers
       defaults: { ... },                  // its switches' starting values (the options build() gets)
       presets: { name: { ... } },         // named sets of options (Specimen: #mq=<name>)
       switches: [{ key, label, options: [[value, "Label"], ...] }],   // drawn by Specimen when it is picked
       build(parts, options) { return def; }   // parts: the kit (creature-parts.json); returns a CreatureBody def ({ segs: [...] })
     });
     Creatures.get(key) | Creatures.list() | Creatures.build(key, parts, options)

   No load-time dependencies: load it before any creature file. Creature files only need what their build() uses, at build time. */
(function () {
  "use strict";
  const byKey = new Map(), order = [];
  function register(spec) {
    if (!spec || !spec.key || typeof spec.build !== "function") throw new Error("Creatures.register: a creature needs a key and a build(parts, options)");
    const c = Object.assign({ name: spec.key, tier: "Beast", mood: "", text: "", color: [0.93, 0.91, 0.87], guest: "carapace-strider", climbs: false, defaults: {}, presets: {}, switches: [] }, spec);
    if (!byKey.has(c.key)) order.push(c.key); byKey.set(c.key, c); return c;
  }
  const get = (key) => byKey.get(key) || null, list = () => order.map((k) => byKey.get(k));
  function build(key, parts, options) { const c = get(key); return c ? c.build(parts, Object.assign({}, c.defaults, options || {})) : null; }
  window.Creatures = { register, get, list, build };
})();
