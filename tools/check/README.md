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
| `bestiary-remix` | The Hand-built Mech remix bloom swaps a slot and shuffles |
| `city-stage` | A click on a city block opens the bloom, a pick pins it, the pin survives a new seed, undo and a reload |
| `city-world` | Forge buildings stand as the towers from their own design, walking creatures keep to the streets, the road exists |
| `city-panels` | The City stage's own panels drive World Scene (swimmer dials and modes, camera), drift runs over the Forge buildings standing as towers, the city's modules are listed, and what was tuned is kept on the city |

Add a check by adding an entry to `CHECKS` in `run.mjs`: a name and an async function that gets
`{ page, ctx, url }` and throws on failure.
