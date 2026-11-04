---
name: forge
description: Architecture reference for the Forge web app (forge/web/ + shared/generators/, shared/city/, shared/ecology/) — world/prefab data model, generator registry contract, script load order, how to run it, and known gotchas. Load before running, debugging, or extending any Forge page or shared generator lib.
---

# Forge

Forge is a pipeline for building a game world: parts library → generators (towers,
seals, species, cities) → a saved "world" file → a city laid out from saved prefabs →
an ecology sim that drifts creatures around it. The spec-of-record for the UI is the
**"Forge UI Explorations" Artifact canvas** — code comments cite its board names
(`E0`–`E9`, `E6Prefab.dc.html`, etc.) directly; when an implementation is scoped down
from the mockup, a comment usually says why.

**Two unrelated trees share the name — don't conflate them:**

| | What it is | Where |
|---|---|---|
| **Tower Forge (Rust)** | From-scratch Bevy/egui desktop reimplementation of just the Tower generator. Its own `forge/README.md` documents it fully — read that, not this file, for `forge-core`/`forge-search`/`forge-gltf`/`forge-cli`/`forge-app`. | `forge/` crates |
| **Forge (this skill)** | The world/registry/bridge system: worlds, prefabs, the generator registry, the City/Ecology pipeline. | `forge/web/` + `shared/generators/`, `shared/city/`, `shared/ecology/` |

`forge-world-features/` (and the sibling `.zip`/`.patch` files at the repo root) is
**stale merge debris, not live code** — an older/parallel snapshot missing
`forge-bridge.js`/`lineage.html`/`species.html`. Never edit under it.

## Running it

Every shared-lib `<script>` tag in `forge/web/*.html` uses `../../shared/...`
relative paths, so **the app must be served from the repo root**, not from
`forge/web/`. Serving from the wrong root doesn't 404 visibly on the page — it
throws cryptic runtime errors instead (`ReferenceError: CityPlacement is not
defined` on City, a JSON-parse-of-HTML error on Kit's part-library fetch).

```sh
cd /Users/zac/Documents/Projects/Interactions_Exploration   # repo root
python3 -m http.server 8731
# open http://localhost:8731/forge/web/index.html
```

The landing page (`index.html`) lists saved worlds; opening one goes to
`workspace.html?world=<id>&stage=<kit|species|bench|city|ecology>`, which mounts an
iframe per stage rather than navigating away.

## File manifest (`forge/web/`)

| File | Purpose | Shell stage |
|---|---|---|
| `index.html` | "Worlds" landing page: list/create/import worlds, migrates old per-tool localStorage settings | — (pre-shell) |
| `workspace.html` | Shell-only page; mounts `ForgeShell.mountWorkspace()`, swaps an iframe `src` per stage | container |
| `kit.html` | Parts browser, search, role-gap meter, "breed for thin roles" | Kit |
| `species.html` | Hub: Breed / Attach / Rig / Ecology links, lists every species + where to edit it | Species |
| `bench.html` | Generator workbench — tabs Tower/Seal/Alphabet/Arch Tower/Classical routed through `ForgeRegistry`; inspector, "Open in [standalone tool]", "Save as prefab" | Bench |
| `city.html` | Seeded radial city: terrain + placement sliders, prefab/district rules, plot picker | City |
| `ecology.html` | WebGL creature sim over a saved city: draw-mode picker, drift controls, landmark/species panels | Ecology |
| `rig.html` | Builds spine/wing/pendulum rig + motion clips; lists swim params Ecology may drift | via Species hub |
| `attach.html` | Per-part joint/mount/rim/hang point editor | via Species hub |
| `rules.html` | Pins a Tower's bay rules, tests on 6 seeds; feeds Bench's Tower "Rule set" | via Bench |
| `lineage.html` | What an object was built from + everything downstream; flags stale objects, recooks | via Shelf cards |
| `workbench.html` | **Superseded** prototype (drag-seal-onto-socket). Orphaned, not shell-linked, still works standalone | none |
| `forge-shell.js` | Left rail (5 `STAGES`) + persistent bottom Shelf, `mount()` / `mountWorkspace()` | shell chrome |
| `forge-world.js` | World file / persistence layer (see Data model) | infra |
| `forge-bridge.js` | Round-trip glue a *standalone* tool (Spire Forge, Sigil Forge, Bestiary Forge) loads to open/save a world object via `?world=&object=&return=` | infra |
| `forge-prefab.js` | "Save as prefab" dialog — attaches a `prefab` block to a saved object | infra |
| `forge-pages.css` | Shared chrome CSS for `owned: true` Forge screens | infra |

## Data model

- **Storage**: one IndexedDB database per world (`forge-world:<worldId>`, store
  `objects`, keyPath `id`). World index (id/name/timestamps) lives in `localStorage`
  (`forge:worlds-index`); active world id in `localStorage` (`forge:active-world`).
- **One record shape for everything** — species/parts/scripts/seals/buildings/
  prefabs/cities all share:
  `{ id, type, version, name, recipe, seed, refs[], sockets[], prefab, svg, thumb, approved, source, createdAt, updatedAt }`.
  `World.put()` auto-bumps `version` and fills unset fields from the existing record.
- **A "prefab" is not a separate type** — it's a `prefab` block
  (`{footprint, height, facing, districts, attracts[], pinned}`) attached to any
  object by `forge-prefab.js`'s dialog.
- **`forge-bridge.js`** lets a standalone tool outside `forge/web/` (e.g.
  `tools/spire-forge/`) load/save a world object, broadcasting changes via
  `BroadcastChannel("forge-world")` so other open tabs refresh live.
- **Export/import**: `ForgeWorld.exportWorld`/`downloadWorld` serialize a whole world
  to one JSON doc (`format: "forge-world"`); `importWorld` always creates a new world
  but preserves every object's id/version so `refs[]` still resolve.
- **Dependency graph** (`ForgeWorld.graph(records)`): reads `refs[]`
  (`"type:id@version"` strings), classified `input` (makes the referencing object
  stale when the target moves past the captured version) vs provenance, per a fixed
  `INPUT_TYPES` map (`building←ruleset/seal/script/icon-set`, `rig←attach/species`,
  `city←building`, `species←species`). Gives `usedBy`, `impact`, `stale`/`staleAll`.

## Generator registry (`shared/generators/`)

Full contract documented in `shared/generators/README.md`. Register with:

```js
ForgeRegistry.register({
  id, type, label, bench: true, inputs: [...], params: [...],
  defaults(seed, kit, overrides) { ... },
  mutate(recipe, R, kit) { ... },
  generate(recipe, ctx) { ... },
});
```

- `generate` **must be pure** — same recipe+seed → same output; re-forge and
  Lineage recook depend on this.
- Part ids (`P123`) found anywhere in the recipe are auto-collected into `refs[]`.
- A `regen: true` param rebuilds the recipe through `defaults()` (template/type
  pickers).
- Registered today: `building.spire` (SpireGenerator), `seal.sigil` +
  `script.alphabet` (SigilGenerator), `building.arch` (CreatureArch),
  `building.classical` (CreatureClassical).
- **Bench** routes its tabs (Tower/Seal/Alphabet/Arch Tower/Classical) straight
  through the registry — no tab-specific logic, just which generator id is active.
- **Promoted controls** (Houdini-HDA pattern): a generator declares
  `promote: [...]` + `tool: {id, label}`; Bench shows only promoted params, folds
  the rest under "More controls", and links to the full standalone tool ("Open in
  Spire Forge"). Graph nodes expose only promoted params too.
- **City consumption**: `city-placement.js` exports
  `window.CityPlacement = { solve, candidates, assign, matchesZone, frameOf, PLOT_TILES, ZONE_KEYS, DEFAULTS }`.
  `solve(recipe)` runs `terrain.js`'s seeded height field biasing
  `shared/city/city-wfc.js`'s round-city WFC → `{wfc, terrain, cells, plots}`.
  `candidates(plot, prefabs, recipe)` scores saved prefabs against a plot by
  footprint/district fit; `assign()` places them deterministically, respecting pins.

## Script load order

Every page loads `forge-world.js` then `forge-shell.js` first, then page-specific
generator deps in dependency order (e.g. `city.html`: kit-utils → spire-generator →
forge-registry → forge-building → forge-generators → city-wfc → terrain →
city-placement → forge-overrides). This order is consistent across
kit/species/bench/city/ecology/rig/attach/rules/lineage — if you add a page, follow
the same order and remember the repo-root serving requirement above.

## Ecology's three draw modes

Ecology has three draw modes, not one: plain spine lines, `creature-sprites.js`
(2D canvas, Forge-native — draws each creature from its own kit parts along the
live rig spine), and `shared/ecology/ecology-render.js` ("Cybernetic Ecology
(WebGL)") — extracted near-verbatim from `tools/fish-tool/Cybernetic Ecology.html`
(spine-rig GLSL, thin-film iris shading, bloom) as a third mode alongside the
sprite renderer, not a replacement. It deliberately drops that tool's
orbiting/follow camera and pointer controls (Forge's Ecology is fixed top-down)
and its "cloud mode". Species geometry/behavior (`ecology-species.js`,
`ecology-sim.js`) is shared unmodified between the two.

Known gap: **Species Style Lab's color/shader tuning is an island** — it saves
only to its own localStorage and never writes back to `ecology-species.js`.

## Conventions

- **IIFE + `window.X` export** throughout — classic scripts, no modules, no
  bundler: `(function(){ "use strict"; ...; window.ForgeWorld = ...; })();`
- **Overrides** (`forge-overrides.js`): `{ $base: "<scheme>:<id>", $overrides: {path: value} }`,
  resolved through `$base` chains. Used by Ecology variants (store only changed
  swim values), Rig variants (revert / "apply to base"), City
  `recipe.plotOverrides[cell]` ("tweak on this plot"), and Style Lab.
- **Lineage/staleness** (`lineage.html` + `ForgeWorld.graph`): Houdini-PDG style —
  a ref's `@version` is what it was cooked against; recook order is towers
  (current rule set) → rigs (current attach points) → cities/species (record
  current versions).

## Known gaps / open issues (as of 2026-11-03, see `forge/web/TODO.md` for the live list)

- **Bestiary Forge never writes to the world file** — species bred there never
  reach the Shelf/prefab system. Needs the same "Save as prefab" pattern Spire/Sigil
  Forge already have.
- Bench's Tower exposes ~9 of Spire Forge's 20+ controls (missing dome, crown
  beads/spire toggle/light beams/buttresses, balcony width/taper, base stepping,
  per-part ornament swap, kit-species filters, brief→building, direct export).
- Bench's Seal/Alphabet are missing several controls each; **Icon mode doesn't
  exist in Bench at all**. No SVG/PNG/JSON export from Bench.
- City reuses `city-wfc.js` but omits `city-mesh-engine.js` and
  `naqsh-pattern-engine.js` — flat 2D plot map only, no 3D, no mashrabiya screens
  (those live only in the standalone Round City Generator).
- `forge-shell.js`'s `STAGES` array already routes Species → `species.html`
  correctly — TODO.md's note about Species being misrouted to `attach.html` looks
  stale, verify before acting on it.

**Current integration direction**: stop porting every standalone tool's full
control set into Bench. The world file is the contract; standalone tools stay the
full editors, Bench is the quick editor/graph. Already built: one building recipe
format, the world bridge, promoted controls, overrides, used-by/stale tracking via
Lineage. Next: attach points driving sockets, Shelf drag-onto-City-plots, bake/
flatten so World Scene Next can open a saved city in 3D.
