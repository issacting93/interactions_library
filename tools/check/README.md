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
| `bestiary-walkers` | Every Walker Bestiary creature spawns and walks for a second with no error and no NaN |
| `bestiary-remix` | The Hand-built Mech remix bloom swaps a slot and shuffles |

Add a check by adding an entry to `CHECKS` in `run.mjs`: a name and an async function that gets
`{ page, ctx, url }` and throws on failure.
