# Generative Forge — a repo-wide node-graph compositor

`tools/city-gen/Naqsh Forge.html` proved a node graph dramatically expands what's possible for
*one* generator family (Islamic ornament + karbandi + city layout): wiring generators into
Scatter/Region/Layer/Mirror nodes makes combinations none of the standalone tools can make alone.
Generative Forge is the same idea opened up to *every* generator family in the repo.

## Survey this was built from

**Generator families already in `tools/`** (excluding `tools/city-gen/`, which is its own
compositor): seeded-RNG SVG/canvas generators (Asset Foundry, Rosette, Vessel, Masterplan,
Xenomandala, Xenoglyph, Interface Forge, Mandala Studio); rig/bone posers (Wing Rig, Metamorphosis
— their `evalRig()`/`evalPieceRig()` are byte-identical, copy-pasted); noise-field → outline
extraction (Field Scan, Cybernetic Ecology, Species Style Lab — three forks of one engine, the
single biggest duplication cluster in the repo); genetic/grid recombination (Species Forge);
branching-tree DOM generator (Radial Goo Bloom); raster pixel-FX pipeline (Image FX Lab — every
effect was already a pure `fx(d,W,H,p)` function, the cleanest extraction target found);
non-geometric grammar/LLM mixer (Transmutation Engine).

**`components/generative/`** has three more duplication clusters: `terrain-displacement`/
`terrain-grid`/`terrain-isometric` share one noise+marching-squares engine; `boid-field`/
`components/interaction/boids`/`murmuration-rosette` share one flocking engine; `graphite-halo`'s
noise/contour field is also duplicated into `murmuration-rosette`. None of these are wired into
Generative Forge yet — see "Known gaps" below.

**`shared/`** splits into three kinds: pure generative math (`city-wfc.js`, `naqsh-pattern-engine.js`,
`radial-lattice.js`, now also `xenoglyph-engine.js`, `pixel-fx-engine.js`, `rng.js`), UI widget
kits (`hardware-ui.js`, `t8-ui.js`), and DOM/SVG authoring helpers (`svg-utils.js`, an ES module).
The cheapest universal win was `mulberry32`/`xmur3` seeded-RNG boilerplate, copy-pasted verbatim
into 10+ files — now `shared/rng.js`.

## Why litegraph.js instead of a third hand-rolled node graph

Naqsh Forge's hand-rolled canvas node graph works, but a node's output only ever exists as a paint
side effect — nothing independent of the draw call. Building a second one from scratch for this
tool would repeat that limitation. `litegraph.js` (MIT, single-file, zero deps, canvas-based,
supports fully custom node body rendering) is what **ComfyUI** — the dominant real-world "wire
generative building blocks together" tool — is built on. That's strong validating precedent for
this exact use case, so Generative Forge vendors it via one CDN `<script>` tag
(`cdn.jsdelivr.net/npm/litegraph.js`) rather than extending Naqsh Forge's engine. This repo already
has in-repo precedent for a CDN dependency of this kind — `tools/city-gen/Sigil City.html` loads
Three.js the same way.

Litegraph owns graph topology, pan/zoom, wiring, cycle-safety, and serialization.
`shared/node-graph-engine.js` (`window.ForgeGraph`) is a thin adapter on top, not a
reimplementation — it only adds the three things litegraph doesn't know about: turning this
repo's own node-type contract into a real `LiteGraph.registerNodeType` class, normalizing
heterogeneous outputs (`canvas` vs `svg`) into a composable `HTMLCanvasElement` via
`ForgeGraph.toCanvas()`, and deriving a per-node seed from one graph-level seed via `shared/rng.js`.

## Node-type contract

```js
{
  id, category, label,
  inputs: [{name, kind}],          // kind: 'canvas' | 'svg'
  outputs: [{name, kind}],
  params: [...],                    // declarative schema, same shape as NAQSH.MODES
  palette: [{label, params, seed?}],  // OPTIONAL — hand-curated presets, see below
  generate(resolvedInputs, params, seedNum) -> {kind, value},  // pure — fixes the gap above
  alwaysRegenerate: true,           // OPTIONAL — see "known limitation" below
}
```

`generate()` must be side-effect-free from the graph's point of view: it returns a value rather
than painting onto a shared canvas, so a node's output can be consumed, cached, or composited
independent of when/whether it was drawn on screen.

**Known limitation**, documented in `shared/node-graph-engine.js`'s header: a node immediately
downstream of an SVG-output node can't tell when that SVG's async rasterization finishes, since the
upstream output object's identity doesn't change once the rasterized canvas lands in the cache —
only its contents do. Any node consuming canvas-kind input that might be SVG-sourced sets
`alwaysRegenerate: true` so it re-pulls fresh pixels every tick instead of trusting the cache key.
Cheap for the handful of small canvases this tool composites; a much larger graph would want real
invalidation.

## The "human + code" principle, and where it's actually demonstrated

Three converging precedents, same shape: Wave Function Collapse's own authoring model (hand-drawn
tiles + adjacency, the algorithm only arranges — this repo's own `shared/city/city-wfc.js` already works
this way), Tracery (hand-written word lists, the grammar only recombines — Kate Compton's
"10,000 Bowls of Oatmeal" argument that pure randomness without a curated vocabulary is
meaningless), and Spelunky (hand-authored room chunks, procedural assembly). All three: **a human
curates a small vocabulary of good pieces; the code handles combination/arrangement/variation.**

This repo already has two live implementations of the *mixed-initiative* version of this idea (a
human steers mid-generation, not just authors upfront) —
`neurosymbolic-ui/prototypes/wfc-component-layout.html` and `wfc-patch-regen.html`, both doing
"swap one piece, locally re-collapse only invalidated neighbors" over real repo content. Their
documented gotcha — rule contrapositives must be explicit, or collapse order silently breaks
symmetry — is a concrete caution for anyone building that feature here later, not a new concept to
introduce. Generative Forge doesn't implement local invalidation (see "Known gaps"); it implements
the simpler, upfront-curation half of the same principle.

**Concretely**: the node-type contract's `palette[]` field is a short, hand-picked list of good
`{params}` (or `{seed, params}`) combos a node ships with, surfaced as a "preset" dropdown.
This is demonstrated for real in the **Karbandi** node — its three presets (Classic `n:16,k:6`,
Dense `n:24,k:9`, Star `n:12,k:5`) are not invented for this doc; they're the exact hand-tuned
values from `tools/city-gen/Karbandi Generator.html`'s own preset buttons. The algorithm can reach
any `{n,k}` pair, most of which look inert or chaotic — the curated shortlist is what makes the
node immediately useful instead of requiring everyone to rediscover good values by trial. The other
11 node types don't have a palette yet; adding one is just populating the array with values a human
found and liked, the mechanism is already there for any future node.

## Node types shipped in this pass

| Node | Wraps | Output | Notes |
|---|---|---|---|
| City Layout | `shared/city/city-wfc.js` | canvas | Flat 2D ring/sector plan, colored by zone — **not** the live Three.js scene `Round City Generator.html` renders (see Known gaps) |
| Girih / Banna'i / Eslimi / Tongbori / Facade | `shared/naqsh-pattern-engine.js` | canvas | Thin wraps of `NAQSH.renderTo`, params from `NAQSH.MODES` |
| Karbandi | `shared/radial-lattice.js` | canvas | Has a `palette[]` — see above |
| Sigil / Circuit | `shared/xenoglyph-engine.js` | svg | 2 of Xenoglyph's 8 engines, picked for visual diversity |
| Duotone / Posterize | `shared/pixel-fx-engine.js` | canvas (takes canvas in) | The cross-family "universal post-process" — accepts any other node's output |
| Composite / Output | — | canvas | Alpha-over up to 4 canvas inputs, PNG export source |

Try it: Naqsh Girih → Duotone → Composite/Output. The header has New seed / Export PNG / Export
recipe / Import recipe (recipe = `graph.serialize()`, litegraph's own format, plus the graph seed).

## Known gaps — not tackled in this pass

- **Field Scan / Cybernetic Ecology / Species Style Lab**'s shared noise-outline engine — the
  biggest duplication cluster in the repo, deliberately deferred (a large extraction on its own).
- **Wing Rig / Metamorphosis**'s identical `evalRig()` — a clean future `shared/rig-pose-engine.js`.
- **Radial Goo Bloom, Species Forge** (genetic recombination), **Transmutation Engine**'s
  slot-mixing UI — not wired in as node types yet.
- **`components/generative`**'s `terrain-*` and `boid-*`/`murmuration-rosette` duplication
  clusters — not extracted or wired in.
- **City Layout is 2D-only.** Embedding a live Three.js scene as a composable node-graph output is
  a real feature, just out of scope for this pass — it needs its own normalization story (snapshot
  to canvas each tick? keep it as a non-composable "sink" node type?) that a 2D plan view sidesteps.
- **Mixed-initiative local invalidation** ("swap one node, only re-collapse affected downstream
  nodes," proven twice in `neurosymbolic-ui/`) is a natural next step for this tool but isn't built.
- **9 of 12 node types have no `palette[]` yet.** The mechanism is proven on Karbandi; populating
  it for the others is mostly a curation task (play with a node, save the combos that look good),
  not an engineering one.
- **CDN dependency on `litegraph.js`** is a real, precedented (see Three.js above) deviation from
  the repo's otherwise fully-offline convention — stated plainly here, not hidden.
