# Kit to 3D: the pipeline

One script that repeats, in order, what turning the kit's flat drawings into solid creatures takes. Run it from the repo root.

```sh
node tools/kit3d/kit3d.mjs audit                    # what can be made solid, what has an outline left open
node tools/kit3d/kit3d.mjs import closed.svg        # read a closed sheet back: says what would change
node tools/kit3d/kit3d.mjs import closed.svg --write   # ... and save it into the kit
node tools/kit3d/kit3d.mjs outlines                 # the tank's open outlines: close what can be closed, write the sheet for the rest
node tools/kit3d/kit3d.mjs import-outlines closed.svg [--write]   # read that sheet back
node tools/kit3d/kit3d.mjs cores                    # a solid core for every species of the tank, and what became of each part
node tools/kit3d/kit3d.mjs check                    # every check for this work
node tools/kit3d/kit3d.mjs copy                     # build the copy of the Solid Creature page to publish
node tools/kit3d/kit3d.mjs all                      # audit, check, copy
```

## The loop

1. **`audit`** reads every shown drawing in `shared/data/creature-parts.json` and reports how many can be made solid and which have an outline
   left open. It writes two files:
   - `shared/data/kit-sources/parts-to-close.svg`: the parts to close by hand. Red strokes are open edges to close, grey is already closed,
     dark grey is an inner line to leave open, amber rings are loose ends, dashed amber is a likely join. Each part is a group whose id is the
     part id. The `marks` layer can be deleted.
   - `shared/data/kit-sources/parts-to-close.json`: where each part sits on that sheet, so it can be read back.
2. **Close the red strokes** in any editor. Keep the group ids. Editors may bake the groups' move and scale into the points and drop the
   `data-i` attributes; both are handled.
3. **`import closed.svg`** reads it back and prints, per part, how many open strokes it had and has. Nothing is saved without `--write`.
   A path that was not changed is left exactly as it was.
4. **`audit`** again: the list gets shorter. When it is empty, nothing in the kit needs closing.
5. **`check`**, then **`copy`** and publish the folder it names.

## Two kinds of data, two sheets

The kit (`creature-parts.json`) and the tank's species (`ecology-species.js`) are separate data, so each has its own sheet.

| | Kit parts | Tank species |
|---|---|---|
| Find and write the sheet | `audit` | `outlines` |
| The sheet | `kit-sources/parts-to-close.svg` | `kit-sources/outlines-to-close.svg` |
| Read it back | `import` | `import-outlines` |
| Where a closed outline goes | into the part's own drawing | beside the species, in `shared/data/core-outlines.json` and `.js`; the line art is not touched |

`outlines` closes what it can by rule and applies it at once (green on its sheet): a few strokes are **joined** when the bridges are at most
30% of the outline and the shape fills at least 15% of its box; a drawing of five strokes or more is **wrapped** (its silhouette). The rest is
red, for a person. An outline closed by hand is never overwritten by a rule.

## What becomes solid in the tank

| A part that | becomes |
|---|---|
| rides the spine and has a closed outline (its own, or one from `core-outlines`) | a rounded solid, no deeper than 7% of the body's length |
| is a thread (thinner than 1.2% of the body's length) | a thin tube along each stroke |
| is rigid (a fin, a wing) | stays line art |
| is a box round the whole creature | skipped |
| has no closed outline | stays line art, and is on the outline sheet |

A species shown walking (Pincer Crawler, Carapace Strider, Pearl Centiwyrm, Crowned Lancer) gets its solid from the walker engine instead
(`EcologyWalkers.solidOf`): each body piece's centre parts, with legs and side parts as lines.

## What needs closing, and what does not

A drawing needs closing when it has open strokes that should be its outline: most of the stroke lies outside every closed shape. An open
stroke inside a closed shape is an inner line (a crease) and is fine. Glyphs and dials stay flat by design, so their open strokes are left
alone. A drawing made of many small closed shapes with no single outline needs nothing: the solid is their union.

## `check`

| Step | What it proves | Needs |
|---|---|---|
| `tools/kit3d/test.mjs` | A sheet comes back right: untouched, baked by an editor with a part closed, and kept as written with a part closed | nothing |
| `kit3d.mjs cores` | Every species of the tank gets a solid core; no part fails to bake. Writes `out/cores.json` | `tools/check` installed |
| `tools/check/part-solid.mjs` | Every drawing with an outline bakes three ways with no NaN and its outline as the rim | `tools/check` installed |
| `run.mjs solid-look` | All thirteen creatures bake, walk and take a shove in the solid look; every switch toggles | a browser |
| `run.mjs specimen-cores` | Specimen builds and draws a core for every species in turn with no script or shader error | a browser |

Once: `cd tools/check && npm install && npx playwright install chromium`. Offline, or to use an installed Chrome:
`CHROME=/path/to/chrome THREE_DIR=/path/to/node_modules/three node tools/kit3d/kit3d.mjs check`.

## `copy`

Builds `tools/kit3d/out/solid-creature/` (not committed): the Solid Creature page with its scripts beside it and only the creatures whose
parts fit (each under 150 KB; the Maw is left out because it needs the game's scripts). Serve the folder to look at it, or publish its files.
Publishing itself is not scripted.

## Where the work lives

| What | File |
|---|---|
| A drawing made solid | `shared/engine/generators/part-solid.js` |
| A creature in solid parts, with every look and motion switch | `shared/engine/motion/solid-look.js` |
| The page | `world/forges/kit-3d/creature.html` |
| Solid cores in the tank's renderer | `shared/engine/ecology/ecology-render.js` (`render.cores`), switch on `world/forges/fish-tool/Specimen.html` |
