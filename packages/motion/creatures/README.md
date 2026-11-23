# shared/engine/creatures

The built creatures: the ones assembled from parts of many kit sheets. One spec each, listed by `window.Creatures`.
**How to add one: [`docs/creatures.md`](../../../docs/creatures.md).**

| File | What it holds |
|---|---|
| `registry.js` | `window.Creatures`: `register`, `get`, `list`, `build`. Load it first. No dependencies. |
| `chain.js` | `window.CreatureKit`: the shared pieces (centre and side parts, upright and kit legs, wings) and `chain(parts, spec)`, the Maw-style body of rows |
| `beasts.js` | Dragon, Lizard, Stag, Cat: a table of chain specs. Add a beast here. |
| `mystic-qilin.js` | The Mystic Qilin: a chain spec with switches (crown, flames, tail) |
| `blender-qilin.js` | The Qilin traced from Zac's Blender mock: one rigid piece, neck and tail from `AppendageSolid` |
| `quad-mech.js` | The Kit Quad Mech (built by `SpeciesRig.quad`) |

Load order on a page: `registry.js`, `chain.js`, then the creature files. They need `LimbArt`, `PartLib` (and `SpeciesRig` for the quad)
only when a creature is built, so they can load before those.
