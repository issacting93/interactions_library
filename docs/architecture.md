# The creature engine: a map

How a flat drawing becomes a creature that walks, hunts and is drawn solid, and which file does each step. This covers the creature and
ecology side of `shared/engine/`. Forge (the world file, the generators, the city) has its own document: [`forge-system.md`](forge-system.md).

Everything is a classic script that sets one global (`window.PartSolid`, `window.CreatureBody`...). There is no bundler. A page loads the
scripts it needs, in order, by relative path from `shared/`.

## The layers

Each layer only knows the ones above it in this table. That is what lets any body wear any look, and any page host any creature.

| Layer | Question it answers | Files (in `shared/`) | Global |
|---|---|---|---|
| **1. The kit** | What was drawn? | `data/creature-parts.json` (every part, by id `P123`), `data/creature-catalog.json` (sheets, families), `engine/mech/part-lib.js` | `PartLib` |
| **2. Drawings to bones** | Which piece of a drawing rides which bone? | `engine/motion/limb-art.js` | `LimbArt` |
| **3. The plan** | Which parts make this creature, and where? | Sheet walkers: `engine/motion/species-rig.js`. Built creatures: `engine/creatures/` | `SpeciesRig`, `Creatures`, `CreatureKit` |
| **4. The body** | How does it stand, step, run and climb? | `engine/motion/creature-body.js` (physics, after Rain World), `gaits.js`, `ik.js`, `surface.js`, `skeleton.js` | `CreatureBody`, `Gaits`, `IK`, `Surface`, `Skeleton` |
| **5. The brain** | Where does it want to go? | `engine/motion/world-brain.js` (hunt, flee, graze), `world-gen.js` (the place) | `WorldBrain`, `WorldGen` |
| **6. The look** | How is it drawn? | Lines: `engine/motion/looks.js` (KitLook). Solids: `engine/generators/part-solid.js`, `engine/motion/skin-leg.js`, `appendage-solid.js`, `solid-look.js`. Colours: `data/creature-looks.js` | `PartSolid`, `SkinLeg`, `AppendageSolid` |
| **7. The host** | Where does it live? | `engine/ecology/ecology-walkers.js` (walkers on the tank floor), `ecology-sim.js` (the tank), `ecology-maw.js` (the Maw) | `EcologyWalkers`, `EcologySim`, `EcologyMaw` |
| **8. The renderer** | What reaches the screen? | `engine/ecology/ecology-render.js` (raw WebGL2: lines, solids, film, bloom) | `EcologyRender` |
| **9. The pages** | What does a person open? | `world/forges/fish-tool/` (Cybernetic Ecology, Specimen, Maw Forge), `world/forges/walker-bestiary/`, `world/forges/kit-3d/`, `games/the-maw/` | |

## One creature, start to finish

The Stag, as an example:

1. **Kit.** Its parts are ids in `creature-parts.json`: the serpent's head `P276`, the spine piece `P280`, the Blender leg `P723`.
2. **Plan.** `engine/creatures/beasts.js` holds its spec (which part on which row, how high). `CreatureKit.chain` turns the spec into a
   *def*: a list of rows (`segs`), each with its parts, legs and wings. `LimbArt.sliceSpine` cuts the leg drawing into thigh, shin and foot.
3. **Body.** `new CreatureBody(def, ...)` makes one mass per row joined by springs. Feet plant and step by the gait rules; `def.carry`
   holds the rows without legs at their height.
4. **Brain.** `WorldBrain.create(body, "stag", ...)` gives it the stag's rules (from its spec): it grazes, and bolts from what could eat it.
5. **Look.** KitLook places each part's line art on its row every frame. With solids on, `PartSolid` makes each part a solid once, and
   `SkinLeg` makes each leg one solid that bends at the knee.
6. **Host.** `EcologyWalkers` steps bodies and brains with the tank, and hands lines and solids to the renderer.
7. **Page.** Specimen lists `Creatures.list()`, so the Stag is there with its text.

## Where things are defined once

| Thing | The one place |
|---|---|
| A kit part's drawing | `packages/kit/data/creature-parts.json` (built by `packages/kit/catalog/`) |
| A sheet walker | `PLANS` in `species-rig.js` |
| A built creature (its parts, text, colour, brain, switches) | its spec in `shared/engine/creatures/` |
| A tank species (swimmers) | `packages/kit/ecology-species.js` |
| A species' look (material, pattern, five colours) | `packages/kit/data/creature-looks.json` |
| A species' shape (how its drawing is made solid: method, amounts, single parts' own settings) | `packages/kit/data/creature-shapes.json` |
| A run gait | `RUN` in `gaits.js` |
| The Maw's bodies and legs | `BODIES`, `LEG_PLANS` in `ecology-maw.js` |
| Which parts fit which mech slot | `packages/kit/data/mech-slots.json` |

## Conventions

- **One global per file**, set at the end: `window.X = { ... }`. A file's header comment says what it is, what it needs, and its API.
- **Mechanism and look are separate.** Nothing in layers 2 to 5 draws. A look reads the skeleton and draws it.
- **Everything new goes behind a switch**, off by default if it changes how an existing creature looks or moves (`ld.upright`,
  `def.carry`, `on.bend`).
- **Built or generated files say so** in their first line (`eco-core.js`, `maw-run.js` are built from `games/the-maw/src/`: do not edit them).
- **A page is served from the repo root** (`python3 -m http.server 8731`), because scripts load by relative path.
- **Published copies are built, not hand-copied**: `tools/publish/`.

## Checks

`tools/check/` (see its README). The ones for this engine:

| Check | Proves |
|---|---|
| `node tools/check/creature-defs.mjs` | Every built creature builds from the kit |
| `specimen-creatures` | Each built creature stands, steps and does not bounce in Specimen |
| `specimen-cores` | Every tank species builds its solid core |
| `bestiary-walkers`, `body-looks`, `solid-look` | Walkers spawn and walk; the body page; the Solid Creature page |
| `node tools/check/body-climb.mjs` | The physics body climbs and comes down |
| `node tools/check/part-solid.mjs` | Every kit drawing can be made solid |

## Known rough edges

- **File names lag behind what they hold.** `world/forges/fish-tool/` is the ecology's home (Cybernetic Ecology, Specimen, the Maw
  pages), not a fish tool. It was not renamed: its path is in the published builds, the dev logs and the checks.
- **Scripts sit among pages** in `world/forges/fish-tool/` (the SVG export and tracing scripts). They belong under `tools/`.
- **Lines are long.** Most engine files are written one statement group to a line. They read, but diffs are wide.
- **`AppendageSolid` can carry kit parts on a head, neck or tail** (`o.parts`); nothing uses it since the Mystic Qilin became a chain.
