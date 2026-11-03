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
<script src="../../shared/rng.js"></script>
<script src="../../shared/node-graph-engine.js"></script>
<script src="../../shared/generators/kit-utils.js"></script>
<script src="../../shared/generators/spire-generator.js"></script>
<script src="../../shared/generators/sigil-generator.js"></script>
<script src="../../shared/generators/forge-registry.js"></script>
<script src="../../shared/generators/forge-generators.js"></script>
<script>
  let kit = null;
  ForgeRegistry.loadKit("../../shared/creature-parts.json").then(async (k) => { await ForgeRegistry.prepareAll(k); kit = k; });
  ForgeRegistry.registerInGraph(ForgeGraph, () => kit);   // nodes appear under forge/building, forge/seal, forge/script
</script>
```

Each node's output is `{ kind: "svg", value, data }`. `ForgeGraph.toCanvas()` and the
Composite node read it as-is, and a Script node wired into a Seal's `alphabet` slot
inscribes the seal in that alphabet. Slots are typed by object type, so a script
output only connects to inputs that accept `script`.
