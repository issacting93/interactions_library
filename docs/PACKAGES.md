# Packages

The reusable code is in `packages/`, one package a layer. Pages, games and tools load it; nothing in `packages/` loads a page.

| Package | Holds | Needs |
|---|---|---|
| core | seeded random, the simulation core (World, Clock, Schedule), the walking surface, helpers, the creature registry, watch, the triangulator | nothing |
| ui | tokens and themes, the Forge design system, hardware and TAPE 08 controls, Bloom | nothing |
| kit | the kit as data (parts, outlines, looks, taxonomy), its catalogue tools, creature-arch, the tank's species | core |
| parts | kit parts loaded, drawn and made solid | nothing |
| glyph | glyph system, xenoglyphs, sigils | core |
| city | city grammar, WFC, placement, terrain, towers, spires, patterns | core, kit |
| motion | IK, gaits, skeleton, physics body, walkers, rigs, solid limbs, the built creatures | core, kit, parts |
| ecology | simulation, diet, director, habitat, floor walkers, the Rust engine as a script | core, kit, parts, motion |
| render | ecology renderer, style recipes, Route scenery, creature looks, skins | kit, parts, motion, ecology |
| flora | plants grown by rule, stood on the graphics card, laid out as forests; plants in the tank | core, kit, ecology, render |
| maw | the Maw, its autopilot, stages, the run, its game UI | core, parts, motion, ecology |
| forge | the Forge workbench's generators, evolution, mechs, node graph, effects | core, kit, city, glyph, render, ui |

**The one rule: a package uses only the packages in its Needs.** A script that reaches up a layer (motion reading the ecology renderer, say) is
how the old folders got tangled. The map that set these lines was taken file by file on 22 Nov 2026 (who reads whose `window` name); with two
files moved (`bloom.js` to ui, `tower-forge-ui.js` to forge) nothing reached up.

## How they load today
Every file is still a classic script: a page loads it with `<script src="../../../packages/<package>/<file>.js">` and it puts its name on
`window`. A page lists every script it needs, in order, as before. Each package has a `package.json` (its name and what it needs) and the
repo root is an npm workspace over `packages/*`, so a tool can resolve `@forge/<name>`; nothing is imported that way yet.

Generated files: `core/eco-core.js` and `maw/maw-run.js` are built from `games/the-maw/src` (`npm run build` there), `ecology/eco-engine.js`
from `games/the-maw/engine` (`npm run build:engine`). Edit the sources, not these.

## Next
1. Each package gets an ES module entry, bottom up (core first). It still builds the classic script, so pages keep working.
2. A first app outside this repo imports packages directly.
3. The ecology renderer reads the simulation (render needs ecology); split it if an app wants to draw creatures without the sim.

Moving a branch made before the move: `tools/packages/README.md`.
