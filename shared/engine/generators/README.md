# Forge generator registry

One contract every generator implements, so Bench, the Forge Graph and later the
city and lineage engine can drive any of them the same way.

```
kit-utils.js            ForgeKit: rng, rolesOf, pools (unchanged)
spire-generator.js      SpireGenerator (unchanged)
sigil-generator.js      SigilGenerator (unchanged)
forge-registry.js       ForgeRegistry: the contract, run(), refs, Bench + graph adapters   NEW
forge-generators.js     the registrations: thin wrappers around the modules above          NEW
```

`forge-generators.js` also wraps `../creature-arch.js` and `../creature-classical.js`
when a page loads them. Nothing in the wrapped modules was changed.

## Registered generators

| id | type | from | output |
|---|---|---|---|
| `building.spire` | building | SpireGenerator | 2D elevation, 3 sockets |
| `seal.sigil` | seal | SigilGenerator | 2D seal; input `alphabet` (accepts `script`) |
| `script.alphabet` | script | SigilGenerator | 2D glyph sheet; saved recipe includes the glyphs |
| `building.arch` | building | CreatureArch.buildTemplate | 2D elevation + 3D lines (includes gothic) |
| `building.classical` | building | CreatureClassical | 3D lines, shown as a 3/4 projection |

## Adding a generator

Register it in `forge-generators.js`. It then appears in Bench with its controls,
input pickers, sockets and save, and in the graph as a node, with no other changes.

```js
ForgeRegistry.register({
  id: "species.bestiary", type: "species", label: "Species", newLabel: "New species", bench: true,
  inputs: [{ name: "refs", accepts: "species", label: "Reference" }],
  params: [{ id: "variants", label: "Variants", type: "range", path: "variants", min: 1, max: 3, step: 1, v: 2 }],
  defaults: (seed, kit, overrides) => ({ seed, variants: 2 }),     // deterministic in seed
  mutate: (recipe, R, kit) => ({ ...recipe, seed: Math.floor(R() * 1e9) }),
  generate: (recipe, ctx) => ({ svg: "...", metrics: {} }),       // pure: no DOM, no fetch
});
```

Rules that keep the system working:
- `generate` must be pure. The same recipe + seed must give the same SVG; re-forging and lineage depend on it.
- Part ids (`P123`) anywhere in the recipe are collected into `refs[]` automatically, along with the refs of any world objects passed in as inputs.
- If downstream generators need more than the recipe, return it as `data` and save it with `persist` (see `script.alphabet`), since `world.put` keeps only the standard fields.
- A `regen: true` param rebuilds the recipe through `defaults()` (template / type pickers).

## In the Forge Graph

```html
<script src="https://cdn.jsdelivr.net/npm/litegraph.js/build/litegraph.js"></script>
<script src="../rng.js"></script>
<script src="../node-graph-engine.js"></script>
<script src="kit-utils.js"></script>
<script src="spire-generator.js"></script>
<script src="sigil-generator.js"></script>
<script src="forge-registry.js"></script>
<script src="forge-generators.js"></script>
<script>
  let kit = null;
  ForgeRegistry.loadKit("../../data/creature-parts.json").then(async (k) => { await ForgeRegistry.prepareAll(k); kit = k; });
  ForgeRegistry.registerInGraph(ForgeGraph, () => kit);   // nodes appear under forge/building, forge/seal, forge/script
</script>
```

Each node's output is `{ kind: "svg", value, data }`. `ForgeGraph.toCanvas()` and the
Composite node read it as-is, and a Script node wired into a Seal's `alphabet` slot
inscribes the seal in that alphabet. Slots are typed by object type, so a script
output only connects to inputs that accept `script`.

## World features (Species → Bench → City → Ecology)

Each feature is a pure engine here plus a page in `world/forge/web/`. Every page reads and writes the
same world file (`forge-world.js`), so what one stage saves, the next one picks up.

| Engine | Page | Saves (world type) | What it does |
|---|---|---|---|
| `attach-points.js` | `attach.html` | `attach` (one record holding every edit) | Joint, mount, rim and hang points per part, suggested from each part's outline and editable by dragging. |
| `creature-rig.js` | `rig.html` | `rig` | Builds a spine / wing / pendulum rig from a species' parts and attach points, then poses it with motion clips driven by the ecology swim parameters. Lists which parameters Ecology may drift. |
| `rule-sets.js` | `rules.html` | `ruleset` | Pins a Tower's bay rules (by role, by part, or off) and tests them on six seeds, with checks and per-template reach. The Tower generator takes a rule set as its optional "Rule set" input in Bench and the graph. |
| `terrain.js` + `city-placement.js` | `city.html` | `city` (recipe holds the placements) | Seeded height field (relief, sea level, coast tilt, city mound) that biases the round-city WFC solve; then fits prefabs from the world into landmark plots by district, drawing width and ground, with per-plot overrides. |
| `ecology-loop.js` | `ecology.html` | `species` (captured variants) | Runs `EcologySim` over a saved city. Landmarks pull in the species their prefab attracts (species-filtered `sim.vortices`), rigs set each species' base swim, and time near a building drifts the allowed swim parameters toward that building's character. A drifted species can be captured with refs to the city, building and rig. |

| `creature-sprites.js` | `ecology.html` | — | Draws each creature from its own kit parts along its live spine: spine bones follow the swimming chain, wings and pendulums beat from the rig's swim. Sheet frame boxes are left out; parts are tinted by the species colour by luminance, so dark occluding fills stay dark. "Draw creatures" switches back to plain spine lines. |

**Closing the loop.** A captured variant (`species` record: `recipe.base` = root ecology key,
`parent`, `generation`, drifted `swim`) is released into the next Ecology run as a species of its
own (slot key `base~variantId`): it eats and flees like its base, and whatever ate the base eats
it too. Untick it under "Variants in the water" to hold it back. It also appears in Rig under
"Variants from Ecology", where a rig saved for it (`recipe.variant`) drives that slot. Capturing
a drifted variant again makes generation 2, with a ref to its parent.

**World files.** `ForgeWorld.exportWorld(id)` / `downloadWorld(id)` write a whole world as one
JSON document (`format: "forge-world"`); `importWorld(data)` always opens it as a new world and
keeps every object's id and version, so refs between objects still resolve. The Shelf has
Export world / Import, and the Worlds page has Export per world and an Import tile.

Scale between drawings and the city: a drawing's width in px divided by the city's
"Drawing px per city unit" is its width in city units. Plots are measured in the same units
(the round city's radius is 15.3).

## Overrides and lineage

- `forge-overrides.js`: `{ $base, $overrides }` recipes (a base plus only what changed), with
  `diff`, `apply`, `resolve` (follows `$base` chains through registered schemes) and helpers for
  revert. Ecology variants, City plot tweaks and Style Lab styles use it.
- `ForgeWorld.graph(records)` (in `world/forge/web/forge-world.js`): the dependency graph from `refs[]`.
  A ref's `@version` is what the object was built against; an input ref behind its target's
  current version makes the object stale. `world/forge/web/lineage.html` shows and recooks.
