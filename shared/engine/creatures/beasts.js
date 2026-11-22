/* The beasts: four-legged chain creatures (chain.js), each one a short spec of which kit part goes where and how high it stands.
   To add one, add an entry here (see docs/creatures.md) and it appears in the tank's walker host, the brain and Specimen.
   Needs registry.js and chain.js. */
(function () {
  "use strict";
  const grazer = (o) => Object.assign({ medium: "land", hunts: [], hungerRate: 0.02, hungry: 0.5 }, o);   // WorldBrain rules: the beasts graze and wander
  const BEASTS = [
    { key: "dragon", name: "Dragon", color: [0.91, 0.69, 0.29], mood: "A serpent that learned to walk",
      text: "Built the way the Maw is: a chain of kit parts, each on its own piece of spine. The serpent's head crowned with lance swift fins for horns, a neck and a long tail of the serpent's spine piece repeated, the Maw's wraith body, wings from the Crowned lancer that beat as it walks, and four kit legs laid out flat, one part to a bone, sprawled as a lizard's are.",
      brain: grazer({ sense: 12, fearR: 4, calmR: 2, speed: 0.9, run: 2.2, bold: 0.7 }),
      spec: { head: { id: "P277", long: 0.52, h: 1.05, crown: [["P579", 0.36, 0.07, 0.95, 0.02], ["P606", 0.28, 0.05, 0.7, -0.04]] },
        neck: { n: 5, id: "P280", long: [0.3, 0.42], h: [0.98, 0.6], gap: 0.17 },
        body: [{ id: "P075", wide: 0.9, h: 0.52, gap: 0.22, legs: "front" }, { id: "P562", wide: 0.8, h: 0.55, gap: 0.24, wing: ["P549", 1.5] }, { id: "P456", wide: 0.84, h: 0.52, gap: 0.24, legs: "hind" }],
        tail: { n: 12, id: "P280", long: [0.38, 0.12], h: [0.52, 0.3], gap: [0.18, 0.1], tip: ["P080", 0.36] },
        legs: { kind: "kit", len: 0.9, bones: ["P396", "P187", "P424"], fracs: [0.38, 0.4, 0.22], reach: 0.6 }, carry: 0.97, speed: 0.7, stride: 0.5, lift: 0.3, turn: 1.4 } },
    { key: "lizard", name: "Lizard", color: [0.36, 0.89, 0.6], mood: "Low, quick, all tail",
      text: "The kit's home ground: the Maw's serpent body (the Pincer crawler's plates) on a short neck, a long tapering tail of the serpent's spine piece, and four sprawled kit legs, one part to a bone, quick and wide.",
      brain: grazer({ sense: 8, fearR: 5, calmR: 2, speed: 1, run: 2.6, bold: 0.3 }),
      spec: { head: { id: "P277", long: 0.36, h: 0.22 },
        neck: { n: 2, id: "P280", long: [0.26, 0.3], h: [0.22, 0.22], gap: 0.15 },
        body: [{ id: "P246", wide: 0.56, h: 0.22, gap: 0.2, legs: "front" }, { id: "P253", wide: 0.44, h: 0.23, gap: 0.2 }, { id: "P251", wide: 0.5, h: 0.22, gap: 0.2, legs: "hind" }],
        tail: { n: 10, id: "P280", long: [0.3, 0.08], h: [0.21, 0.1], gap: [0.17, 0.09], tip: null },
        legs: { kind: "kit", len: 0.44, bones: ["P396", "P187", "P424"], fracs: [0.38, 0.4, 0.22], reach: 0.75, wide: true }, carry: 0.9, speed: 0.8, stride: 0.22, lift: 0.1, turn: 2.2 } },
    { key: "stag", name: "Stag", color: [0.81, 0.78, 0.72], mood: "Antlers high, ready to bolt",
      text: "The qilin's cousin: the serpent's antlered head held high on a neck of repeated spine pieces, a slender body, a short tail, and the Blender qilin's legs slimmed and standing upright, the front pair drawn mirrored so their knees bend forward as a deer's do. It trots and gallops.",
      brain: grazer({ sense: 12, fearR: 7, calmR: 3, speed: 0.9, run: 2.4, bold: 0.25 }),
      spec: { head: { id: "P276", long: 0.62, h: 2.05 },
        neck: { n: 4, id: "P280", long: [0.32, 0.4], h: [1.9, 1.35], gap: 0.17 },
        body: [{ id: "P075", wide: 0.6, h: 1.22, gap: 0.22, legs: "front" }, { id: "P562", wide: 0.54, h: 1.24, gap: 0.24 }, { id: "P456", wide: 0.58, h: 1.22, gap: 0.24, legs: "hind" }],
        tail: { n: 3, id: "P280", long: [0.18, 0.1], h: [1.3, 1.22], gap: [0.12, 0.1], tip: null },
        legs: { kind: "upright", len: 1.6, slim: 0.5 }, carry: 0.97, speed: 0.6, stride: 0.5, lift: 0.34, turn: 1.3, run: "horse" } },
    { key: "cat", name: "Cat", color: [0.36, 0.78, 0.88], mood: "Long, low and watchful",
      text: "A long body of four plates (the Carapace strider's chest, the Pincer crawler's back, the centiwyrm's haunch), the Sickle swift's crowned head with small fins for ears, a tail that curves up as it walks, and short upright legs, the front knees forward. It runs with the cat's gait.",
      brain: grazer({ sense: 11, fearR: 4, calmR: 2, speed: 0.9, run: 2.4, bold: 0.6 }),
      spec: { head: { id: "P294", wide: 0.5, h: 0.98, crown: [["P605", 0.2, 0.1, 1.4, -0.02]] },
        neck: { n: 2, id: "P280", long: [0.28, 0.32], h: [0.95, 0.92], gap: 0.14 },
        body: [{ id: "P075", wide: 0.62, h: 0.88, gap: 0.2, legs: "front" }, { id: "P257", wide: 0.56, h: 0.9, gap: 0.2 }, { id: "P255", wide: 0.52, h: 0.9, gap: 0.2 }, { id: "P456", wide: 0.62, h: 0.88, gap: 0.2, legs: "hind" }],
        tail: { n: 11, id: "P280", long: [0.26, 0.12], h: [0.95, 1.35], gap: [0.15, 0.12], tip: null },
        legs: { kind: "upright", len: 1.12, slim: 0.45 }, carry: 0.97, speed: 0.75, stride: 0.42, lift: 0.26, turn: 1.8, run: "cat" } },
  ];
  for (const b of BEASTS) window.Creatures.register({ key: b.key, name: b.name, tier: "Beast", color: b.color, mood: b.mood, text: b.text, brain: b.brain, spec: b.spec,
    build: (parts) => Object.assign(window.CreatureKit.chain(parts, b.spec), { beast: b.key }) });
})();
