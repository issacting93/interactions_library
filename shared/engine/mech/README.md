# Mech engine

Everything that builds a mech, in one folder. Classic scripts (each sets one `window` global), no DOM
except where noted.

| File | Global | What it does |
|---|---|---|
| `part-lib.js` | `PartLib` | Fetches the parts library once (`shared/data/creature-parts.json`) and turns a part into outlines, the same way for every page |
| `mech-slots.js` | `MechSlots` | Which parts may go in which slot: your curated lists (`shared/data/mech-slots.json`), else shape rules |
| `hex-mech.js` | `HexMech` | Generates hex-block parts by seed and style, with tiered detail |
| `creature-mech.js` | `CreatureMech` | The quad mech: places kit or hex parts on a hex lattice; `along()` lays a part along a segment |
| `blade-mech.js` | `BladeMech` | The blade mech: reads a hand-built mech SVG (`shared/data/mechs/`) into four slots and places swaps |

Load order on a page: `limb-art.js` (for `PartLib.lines` and `BladeMech.parse`), then `part-lib.js`,
`mech-slots.js`, and the generators you need. `blade-mech.js` needs `mech-slots.js` first.

Who uses them: Forge Compose (`world/forge/web/compose.html`, the Quad and Blade mech templates) and the
Walker Bestiary (`world/forges/walker-bestiary/`, which walks them in 3D). `tools/check` covers both.
