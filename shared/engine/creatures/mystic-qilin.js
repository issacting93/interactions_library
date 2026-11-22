/* The Mystic Qilin: the qilin of the legends, a chain creature (chain.js). A dragon's head (the Finned serpent's) crowned with fins for
   horns (the lance swifts' blades, swept up and back); a neck of the serpent's spine piece repeated, rising; the body of a bigger creature
   (the Carapace strider's chest, the Crowned lancer's back, the Clawed centiwyrm's haunch: the Maw's wraith body) with Sickle swift blades
   at chest and haunch for flames; a long tail of the same spine piece ending in a Comb drifter plume; the Blender qilin's legs, slimmed and
   upright. Options (its switches): crown "horn" | "antlers" | "both", flames 0..2, tail (rows in the tail).
   Needs registry.js and chain.js. */
(function () {
  "use strict";
  const spec = (o) => { const F = o.flames || 0, crown = [];
    if (o.crown === "horn" || o.crown === "both") crown.push(["P579", 0.3, 0.06, 1.0, 0.02]);
    if (o.crown === "antlers" || o.crown === "both") crown.push(["P581", 0.36, 0.08, 0.8, -0.02]);
    return {
      head: { id: "P277", long: 0.46, h: 1.9, solid: { thick: 0.9 }, crown },
      neck: { n: 6, id: "P280", long: [0.34, 0.44], h: [1.8, 1.24], gap: 0.17 },
      body: [{ id: "P075", wide: 0.8, h: 1.2, gap: 0.22, legs: "front", hip: 0.36, flames: F > 0 && ["P290", 0.5 * F, 0.3, 0.9, 0.05] },
        { id: "P562", wide: 0.7, h: 1.22, gap: 0.24 },
        { id: "P456", wide: 0.74, h: 1.2, gap: 0.24, legs: "hind", hip: 0.34, flames: F > 0 && ["P291", 0.44 * F, 0.28, 0.9, -0.05] }],
      tail: { n: Math.max(4, o.tail | 0), id: "P280", long: [0.36, 0.18], h: (q) => 1.26 + 0.14 * Math.sin(q * Math.PI * 0.8) - 0.12 * q, gap: [0.17, 0.11], tip: ["P094", 0.3 + 0.1 * F, { mode: "blade", thick: 0.5 }] },
      legs: { kind: "upright", len: 1.55, slim: 0.55, fore: "same" },
      carry: 0.97, speed: 0.6, stride: 0.5, lift: 0.34, turn: 1.3, run: "horse" }; };
  window.Creatures.register({
    key: "mqilin", name: "Mystic Qilin", tier: "Mystic", color: [0.36, 0.89, 0.6], mood: "Walks without crushing the grass",
    text: "The qilin of the legends, built the way the Maw is: a chain of kit parts, each on its own piece of spine, so the whole of it bends. A dragon's head crowned with fins for horns, a neck of one spine piece repeated and rising, the body of a bigger creature with flames at chest and haunch, slim legs that stand upright, and a long tail of the same spine piece ending in a plume. Its crown, its flames and its tail are switches below.",
    brain: { medium: "land", hunts: [], sense: 11, fearR: 6, calmR: 2.5, speed: 0.9, run: 2.2, bold: 0.35, hungerRate: 0.02, hungry: 0.5 },
    defaults: { crown: "horn", flames: 0.7, tail: 9 },
    presets: { jade: { crown: "horn", flames: 0.7, tail: 9 }, antlered: { crown: "antlers", flames: 1.3, tail: 9 }, celestial: { crown: "both", flames: 1, tail: 12 } },
    switches: [{ key: "crown", label: "Crown", options: [["horn", "Horn"], ["antlers", "Antlers"], ["both", "Both"]] },
      { key: "flames", label: "Flames", options: [[0, "Off"], [0.7, "Low"], [1.3, "High"]] },
      { key: "tail", label: "Tail", options: [[6, "Short"], [9, "Long"], [14, "Longer"]] }],
    build: (parts, o) => Object.assign(window.CreatureKit.chain(parts, spec(o)), { mystic: o }),
  });
})();
