# Creatures: how they are built, and how to add one

There are two kinds of land creature, and each has one place it is defined.

| Kind | What it is | Where it is defined | Examples |
|---|---|---|---|
| **Sheet walker** | A kit sheet stood up as it was drawn: its centre parts become the body, its side blades become legs and wings | `PLANS` in `packages/motion/species-rig.js`, one line each | Strider, Pincer, Centiwyrm, Lancer |
| **Built creature** | A creature assembled from parts of many sheets | One spec in `shared/engine/creatures/`, listed by `window.Creatures` | Quad Mech, Qilin, Mystic Qilin, Dragon, Lizard, Stag, Cat |

A built creature is registered once and every page reads the list. The walker host builds it, the brain takes its rules, and Specimen
shows it with its text and switches. **Adding one does not touch those files.**

## Add a four-legged beast (the short way)

Most built creatures are *chain* creatures, built the way the Maw is: a chain of rows, one kit part on each piece of spine, so the whole
body bends. A beast is a short spec saying which part goes where and how high it stands.

1. Open `packages/motion/creatures/beasts.js` and copy an entry in `BEASTS`. The stag is the plainest.
2. Change the `key`, `name`, `mood`, `text` and `color`, then the `spec` (fields below).
3. Run the checks (below). That is all: it is in Specimen as the next number, at `#c=<key>`.

Pick parts by looking at the kit: `world/forges/parts-sheet/` shows every part with its id (`P277`), or see the family sheet
`creatures-by-family.svg`.

### The spec

All sizes are in walker units; the Blender leg at `len: 1.6` is about a horse.

```js
spec: {
  head: { id: "P276", long: 0.62, h: 2.05,              // the part, its length along the spine (or wide: across), its height off the ground
          crown: [["P579", 0.36, 0.07, 0.95, 0.02]] },  // side parts on the head: horns, antlers, ears
  neck: { n: 4, id: "P280", long: [0.32, 0.4], h: [1.9, 1.35], gap: 0.17 },   // one spine piece, n times; [head end, body end]
  body: [                                               // the body, front to back, one part a row
    { id: "P075", wide: 0.6, h: 1.22, gap: 0.22, legs: "front" },
    { id: "P562", wide: 0.54, h: 1.24, gap: 0.24, wing: ["P549", 1.5] },      // wing: a blade that beats, [part, length]
    { id: "P456", wide: 0.58, h: 1.22, gap: 0.24, legs: "hind", flames: ["P291", 0.4, 0.28, 0.9, -0.05] },
  ],
  tail: { n: 3, id: "P280", long: [0.18, 0.1], h: [1.3, 1.22], gap: [0.12, 0.1], tip: ["P094", 0.3] },   // shrinking; an optional tip part
  legs: { kind: "upright", len: 1.6, slim: 0.5 },       // or { kind: "kit", len, bones: [thigh, shin, foot], fracs, reach, wide }
  carry: 0.97, speed: 0.6, stride: 0.5, lift: 0.34, turn: 1.3, run: "horse",
}
```

- **A side part** (`crown`, `flames`) is `[part, length, out, rise, back]`: how far out from the spine its root sits, how steeply it
  rises toward its tip, and how far back along the row it sits. It is mirrored to both sides.
- **`h`** is each row's height. Rows without legs are held at their height by `carry` (below), so a neck rises and a tail is carried.
- **`gap`** is the distance to the row in front. Bigger parts need a bigger gap or they overlap.
- **Legs.** `upright` is the Blender qilin's leg (P723), drawn from the side and standing in its own plane like a horse's; the front pair
  is mirrored so the knees bend forward (`fore: "same"` keeps all four alike). `kit` lays kit parts flat, one to a bone, sprawled like a
  lizard's. `len` should let the feet reach the ground from the body's `h`: if the legs dangle, lower `h` or lengthen the legs.
- **`run`** names a set in `packages/motion/gaits.js` (`horse`, `cat`). Leave it out and it only walks.

### Two rules that were learned the hard way

- **`carry` must be set** (about 0.9 to 0.97) on any creature with a long neck or tail. The walking code only holds up rows that have
  legs. Without `carry` the neck and tail drag on the ground; holding them by passing the feet's support along the spine made the whole
  body drop with every step and bounce by a body height (22 Nov). `carry` holds every row at its own height all the time.
- **The body must stand where the legs reach.** If `h` on the legged rows is more than the legs can span, the feet never plant and the
  creature floats. The `specimen-creatures` check fails when fewer than 1.5 feet are down on average.

## Add a creature that is not a chain

Write a new file in `shared/engine/creatures/` that calls `Creatures.register({...})` with its own `build(parts, options)`, returning a
`CreatureBody` def (`{ segs: [{ h, gap, parts, legs, arms }], ... }`). `blender-qilin.js` is the example: one rigid piece with a neck and
tail from `AppendageSolid`. `CreatureKit` (chain.js) has the pieces to reuse: `index`, `box`, `centre`, `side`, `uprightLegs`, `kitLegs`,
`wing`. Then add its `<script>` tag after `chain.js` on the pages that should have it (Specimen today).

## Give a creature switches

A spec may carry `defaults`, `presets` and `switches`; `build(parts, options)` gets the options. Specimen draws the switches when the
creature is picked and rebuilds it when one is flipped. `mystic-qilin.js` is the example (Crown, Flames, Tail).

```js
defaults: { crown: "horn", flames: 0.7 },
presets: { antlered: { crown: "antlers", flames: 1.3 } },      // Specimen: #c=mqilin&mq=antlered
switches: [{ key: "crown", label: "Crown", options: [["horn", "Horn"], ["antlers", "Antlers"]] }],
```

## Put a built creature in the tank

Pages that use the walker host (`EcologyWalkers.create`) take a cast: `[key, count, label, colour, guest species]`. Load the creature
scripts on the page (as Specimen does), then add `["stag", 2, "Stag", [0.81, 0.78, 0.72], "carapace-strider"]` to its cast. Options go in
`host.options[key]`.

## Add a sheet walker

Add one line to `PLANS` in `species-rig.js` naming the sheet, and its rules to `RULES` in `world-brain.js`. See the comments above each.

## Bring a 3D model into the kit

`tools/kit3d/glb-to-kit.mjs` traces a GLB's pieces flat (plates from above, legs from the side, the head from the front) and
`glb-sheet.py` lays them out as a kit source sheet for `packages/kit/catalog/add_sheets.py`. This is how the Blender qilin's
parts P721 to P724 were made. See `tools/kit3d/README.md`.

## Check it

```sh
node tools/check/creature-defs.mjs                 # every creature builds from the kit (no browser, a second)
cd tools/check && npm test -- specimen-creatures   # each one stands, steps, does not bounce; its switches work
```

Both cover a new creature without being edited: they read the registry.

## Publish it

`python3 tools/publish/specimen.py <out>` builds the self-contained Specimen; see `tools/publish/README.md`.
