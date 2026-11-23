/* The Kit Quad Mech: a hull, turret, side pods and visor over four legs, one part to a bone. The plan the Maw hatches on.
   Built by SpeciesRig.quad (species-rig.js), which the Walker Bestiary shares. Needs species-rig.js when it is built. */
(function () {
  "use strict";
  window.Creatures.register({
    key: "quad", name: "Quad Mech", tier: "Mech", color: [0.36, 0.89, 0.6], mood: "The kit's quad mech",
    text: "The Kit Quad Mech, the plan the Maw hatches on: a hull and turret over side pods, a visor at the front, and four legs drawn one part to a bone. It walks the small floor, grazing and turning, and wanders off when the floor gets crowded.",
    brain: { medium: "land", hunts: [], sense: 9, fearR: 5, calmR: 2.5, speed: 0.85, run: 1.7, bold: 0.3, hungerRate: 0.02, hungry: 0.5 },
    build: (parts) => window.SpeciesRig.quad(parts, { segmented: true }),
  });
})();
