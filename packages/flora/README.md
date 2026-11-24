# @forge/flora

Plants and forests, drawn with the kit.

| Script | Puts on window | What it does |
|---|---|---|
| `flora-grow.js` | `FloraGrow` | Grows a plant from a recipe: L-systems, space colonisation, phyllotaxis, branching by level (after ez-tree: gnarl, force, trellis), and tufts of one drawn shape repeated. Stems and leaves are kit parts (`kit/data/kit-plant-parts.js`). 22 presets, from grass to redwoods and the autumn wood. |
| `flora-gpu.js` | `FloraGPU` | Stands grown plants on the graphics card: each recipe uploaded once at three levels of detail, each plant one small record, sway in the vertex shader, culled by view, fog and screen size. Draws on its own or inside a host's frame (`inPlace`), plain or in a style recipe's look. |
| `flora-forest.js` | `FloraForest` | Lays out a wood (`wood`: forked trunks, saplings, litter; `redwood`: rings of redwoods, ferns, grass; `clump`: one mound of understory, ferns over round leaves, clover, flowers and berries) for `FloraGPU.set`. The Maw's Frond Forest and the Flora Grow page both use it. |
| `ecology-flora.js` | `EcologyFlora` | Hand-composed plants in the tank, bent on the CPU: the ones something happens to (a trap closing, a frond grazed). |

Needs: @forge/core, @forge/kit (the plant parts), @forge/ecology (`ecology-flora` reads the sim), @forge/render (the style recipes, when a look is asked for).

Load order on a page: `kit/data/kit-plant-parts.js`, then `flora-grow.js`, `render/style-recipes.js` (for looks), `flora-gpu.js`, `flora-forest.js`.

Pages: `world/forges/fish-tool/Flora Grow.html` (every method, the scenes, the looks); the Maw's stage 02 (`maw/maw-stages.js`, `env.forest`). Docs in the Forge project: forge-flora-grow, forge-flora-gpu, forge-flora-route-look, forge-maw-frond-forest.
