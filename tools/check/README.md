# Checks

Smoke tests for the pages that the mech pipeline runs through. They catch the breaks that matter
most: a page that throws, a walker that goes to NaN, a Compose design that no longer opens in 3D.

```sh
cd tools/check
npm install            # once: installs Playwright
npx playwright install chromium   # once, if you have no Chromium for Playwright yet
npm test               # all checks
npm test -- bestiary   # only checks whose name contains "bestiary"
```

The runner serves the repo root itself on a free port, so nothing else needs to be running.
WebGL runs on SwiftShader, so the 3D checks work without a GPU.

| Check | What it proves |
|---|---|
| `forge-pages` | Every Forge page in `world/forge/web/` loads without a script error |
| `data-paths` | Every page that reads `shared/data/` finds its files (no 404 for a JSON or SVG) |
| `compose-quad` | The Quad mech template renders, in Line and in White mech |
| `compose-blade-to-3d` | A Blade mech swap saves and opens walking in the Walker Bestiary |
| `bestiary-walkers` | Every Walker Bestiary creature spawns and walks for a second with no error and no NaN, and reports a sound skeleton |
| `body-looks` | The body page: one physics body stands, walks, takes a shove and recovers, floats in water, and a legless leech slithers; both halves draw its skeleton |
| `body-climb` (`node tools/check/body-climb.mjs`, no browser) | The physics body climbs: a crawler goes up a tower wall, across ledges, over the rim onto the roof and back down; its body stays at standing height from the surface throughout, and a creature that cannot climb still ignores the tower |
| `part-solid` (`node tools/check/part-solid.mjs`, no browser) | Every shown, unique kit drawing is made solid three ways (plate, blade, belly) with no NaN, and its rim is the drawing's outline; lists the parts with no closed outline |
| `solid-look` | The Solid Creature page (`world/forges/kit-3d/creature.html`): four creatures bake from their kit parts, walk and take a shove with no NaN, legs are drawn solid, and every switch toggles |
| `specimen-cores` | Specimen with solid cores on: every species in turn builds and draws its core with no script or shader error, and no part fails to bake |
| `creature-defs` (`node tools/check/creature-defs.mjs`, no browser) | Every built creature in the registry (`shared/engine/creatures/`) builds from the kit: rows, parts with outlines, legs with art, brain rules and text |
| `specimen-creatures` | Every built creature in Specimen stands, keeps its feet stepping, does not bounce, and each of its switches rebuilds it. A new creature is covered by being registered |
| `bestiary-remix` | The Hand-built Mech remix bloom swaps a slot and shuffles |
| `city-stage` | A click on a city block opens the bloom, a pick pins it, the pin survives a new seed, undo and a reload |
| `city-world` | Forge buildings stand as the towers from their own design, walking creatures keep to the streets, the road exists |
| `city-panels` | The City stage's own panels drive World Scene (swimmer dials and modes, camera), drift runs over the Forge buildings standing as towers, the city's modules are listed, and what was tuned is kept on the city |

Add a check by adding an entry to `CHECKS` in `run.mjs`: a name and an async function that gets
`{ page, ctx, url }` and throws on failure.

Offline, or with an installed Chrome instead of Playwright's own: `CHROME=/path/to/chrome THREE_DIR=/path/to/node_modules/three npm test`. Delaunator is served from `node_modules` when installed.

The kit-to-3D work has one command that runs its checks in order: `node tools/kit3d/kit3d.mjs check` (see `tools/kit3d/README.md`).
