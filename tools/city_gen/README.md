# tools/city_gen/

A toolkit of five generators that used to live scattered across `tools/`, each having
independently reimplemented or copy-pasted the same underlying math. They're consolidated here,
and the three duplicated engines now live once each in `shared/`, loaded the same way every other
`tools/*` file loads `shared/tokens.css` — a plain `<script src="../../shared/<name>.js">`,
global-namespace, no build step.

## What's here

| File | What it is |
|---|---|
| `Round City Generator.html` | Radial Wave-Function-Collapse desert city — plazas, bazaars, courtyard houses, minarets, stacked into storeys. Includes a Patterns tab that textures any surface with the Naqsh ornament generators via a polar warp. |
| `Sigil City.html` | Same city engine, reskinned as glowing wireframe linework + bloom + particle trails instead of literal textured buildings. |
| `Naqsh Pattern Workbench.html` | Five Persian/Islamic ornament generators — girih/Hankin, banna'i, eslimi, tongbori, facade — with construction playback and a JSON recipe format. Keeps its own distinct light/serif theme. |
| `Naqsh Forge.html` | Node-graph compositor — wire any of the five ornament generators, the karbandi lattice, or a rosette into Radial Scatter / Region Fill / Layer / Mirror nodes to build combinations none of the standalone tools can make alone. |
| `Karbandi Generator.html` | Parametric Persian karbandi lattice — divides a circle into *n* points, connects every point *k* steps away, with a live shamseh-medallion readout. |

| Shared module | What it holds |
|---|---|
| `../../shared/city-wfc.js` (`window.CityWFC`) | The WFC solver: grid/tile construction, seeded constraint propagation with backtracking, connectivity pruning, vertical storey-stacking. |
| `../../shared/naqsh-pattern-engine.js` (`window.NAQSH`) | The five ornament generators, their shared palette (`PAL`), seeded RNG/hash, and the `PB` canvas+SVG path-builder. |
| `../../shared/radial-lattice.js` (`window.RadialLattice`) | Karbandi point/chord geometry and shamseh sizing, palette-agnostic. |

## Architecture — who depends on what

```
shared/city-wfc.js  ──┬── Round City Generator.html (+ Patterns tab, below)
                       └── Sigil City.html

shared/naqsh-pattern-engine.js ──┬── Naqsh Pattern Workbench.html (origin)
                                  ├── Naqsh Forge.html
                                  └── Round City Generator.html  (Patterns tab)

shared/radial-lattice.js ──┬── Karbandi Generator.html (origin)
                            └── Naqsh Forge.html  (karbandi node)
```

Each tool still owns everything that makes it distinct: Round City Generator's and Sigil City's
renderers, Sigil City's `bazaarWeight` tile-pick bias and filtered tile set (handled via optional
`opts` on `CityWFC.generate`, not a forked copy of the solver), Naqsh Forge's node-graph system
(`NT` registry, `drawNode`, composite nodes, the `{seed, pal, nodes, edges}` recipe format), and
Karbandi Generator's free-hex-color UI.

## Reuse recipes

**Generate a different kind of radial layout, not just a desert city.** `CityWFC.generate(seed,
opts)` takes `opts.tiles`/`opts.cells` to override the default `TILE_DEFS`/ring grid, and
`opts.weight` to bias tile selection (this is exactly how Sigil City's bazaar weighting works —
see its call site for the pattern). Write a new tile-adjacency grammar — a space-station ring, a
dungeon, a mandala garden — and point the same solver at it. The constraint-propagation/
backtracking core doesn't change.

**Texture any canvas or SVG surface with parametric Islamic ornament, outside this toolkit
entirely.** `NAQSH.drawGirih`/`drawBannai`/`drawEslimi`/`drawTongbori`/`drawFacade` all share the
signature `(ctx, params, palette, seed, buildFraction) -> statusString`; `NAQSH.MODES` is the
registry that ties each mode to its declared `params[]`. The `{mode, seed, palette, params}` JSON
shape (already used by Naqsh Pattern Workbench's recipe export) is the save/replay format — drop
it into any new tool that wants a "paste this look back in" feature.

**Use a star/rosette lattice motif anywhere, independent of Karbandi Generator's own UI.**
`RadialLattice.points`/`.chords` return raw geometry (not a finished SVG string), specifically so
a canvas consumer can stroke/fill it directly — that's how Naqsh Forge's karbandi node works.
`RadialLattice.shamsehRadius` derives a medallion radius from the same chord geometry.

**Combine generators without writing code.** Naqsh Forge's node graph is the no-code compositor
layer: wire a generator into Radial Scatter to make it a "species" filling precincts around a hub,
or into Region Fill / Layer / Mirror for other combinations. Its `{seed, pal, nodes, edges}` recipe
JSON is portable — export it, replay it later, or feed it into another tool that wants to drive the
same graph.

**Build a different visual skin on the same generated city.** Sigil City is a worked example: same
`CityWFC.generate()` output, completely different renderer (wireframe + bloom instead of textured
geometry). Forking its renderer — not its engine — is the template for a third skin.

## Known gaps, not tackled in this pass

- Naqsh Forge's rosette-tracery code (`rpt`/`rosetteGeom`/`drawRosette`/`rosetteSVG`) is still a
  ported-verbatim copy of `tools/rosette-generator`'s math, not a shared module. Left alone because
  `tools/rosette-generator` wasn't part of this consolidation — a future pass could add
  `shared/rosette-engine.js` the same way the other three were extracted.
- Sigil City doesn't have a Patterns tab. Its abstract wireframe renderer doesn't obviously benefit
  from textured surfaces, but if that changes, the Patterns-tab glue code in Round City Generator
  (the `SLOTS`/`SLOT_DEFS` surface mapping and `radialWarp()`) is the thing to port over — it
  already calls through `NAQSH.*`, so no new duplication would be needed.
- Naqsh Pattern Workbench keeps its own light/Marcellus-serif visual theme rather than
  `shared/tokens.css`, by explicit choice — this consolidation only moved its generation code.
