# Interactions Exploration

Two things live here, side by side, sharing one engine:

- **The library**: interface studies and components (dials, sequencers, HUDs, generative pieces) in a sci-fi instrument-panel language: mono/condensed type, hairline strokes, a dark ground, one accent colour. Browse it from `index.html`.
- **The world**: the gothic pipeline behind *The Old Ones*. Creature parts → forges (towers, seals, species, glyphs) → a saved world file (Forge) → the city grammar → the ecology → the scenes (World Scene, Route Scene).

Every page is a self-contained HTML file that loads what it needs from `shared/` by relative path. Serve from this folder (`python3 -m http.server 8731`) and open a page by its path.

## Layout

```
index.html                  the catalogue: browse every study, component and tool (library/components/catalog.js)

library/                    THE LIBRARY: sci-fi instrument UI
  components/                 finished, reusable pieces (generative, interaction, layout, motion, physics, rigged)
    catalog.js                  the one list of studies, components and tools; check it: node library/components/check-catalog.cjs
  interface-studies/          the numbered sketchbook (01–08) the components were extracted from
  gallery/                    the Sci-fi Gallery: compose components into whole screens
  tools/                      library-side generators and labs: asset-foundry, interface-forge, patch, patch-bay,
                              generative-forge, image-fx-lab, mandala-studio, nine-li-lab, radial-goo-bloom,
                              radial-masterplan, transmutation-engine
  demos/  sketches/  neurosymbolic-ui/

world/                      THE WORLD: the gothic Old Ones pipeline
  forge/                      Forge: web/ is the world-file app (Kit, Bench, City, Species, Ecology, Style);
                              the Rust crates are the Tower Forge desktop app (see world/forge/README.md)
  scenes/                     where the world is seen
    world-scene/                World Scene.html (raw WebGL2): the city, its towers, the creatures and the road,
                                one world. Forge's City stage hosts it.
    city-grammar/               the city grammar viewer: terraces, districts, modules, sockets
    mural/                      The Tower of the Old Ones
  forges/                     the standalone generators that feed Forge: spire-forge, sigil-forge, bestiary-forge,
                              tower-forge (Shrine Lathe), rose-window-forge, rosette-generator, vessel-generator,
                              wing-rig, parts-sheet, chimera, fish-tool (Cybernetic Ecology parts),
                              walker-bestiary (creatures walking on IK), townsfolk (procedural people)
  glyphs/                     alien writing: xenoglyph, xenomandala, scriptorium, glyph-garden, glyph-editor.html
  creature-architecture-system/  architecture grown from creature parts (previews + tools)

shared/                     the engine, split by job
  engine/                     how things work, with no look of their own: rng, radial lattice, node graph,
                              generators (ForgeRegistry), city (city grammar + sheets, WFC), ecology, world
                              (world layout, route atmosphere), tower, glyph, evolve (MAP-Elites, chimera),
                              mechanisms (watch, gaze), motion (IK, limb art), creature-arch + creature-parts.json,
                              xenoglyph-engine
  look/                       how things look: style (style recipes), skins (holy light), forge-ds (Forge design
                              system), tokens.css, tape08-tokens.css, theme-*.css, ui, forge-anim.js

docs/                       plans, drafts, world/ (the world bible), forge-ui-explorations/ (the Forge UI spec canvas)
assets/                     fonts, media, references
archive/                    retired work: old exports, the Nov 2026 workshop deck, the Instagram pipeline
```

The split is deliberate. **Mechanism lives in `shared/engine/`, looks live in `shared/look/`**, so any piece can pair any engine with any look. A style recipe can redraw the city, and a skin can gild a creature. **Library and world share the engine but not the look.**

## Older notes

The sections below predate the 2026-11-08 reorganisation. Their paths have been updated, but some descriptions still talk about the old flat layout.

**Removed 2026-11-10** (duplicates of what World Scene and the city grammar now do; they are in git history before that date): `world/legacy/city-gen/` (Round City Generator, Sigil City, Naqsh Forge, Naqsh Pattern Workbench, Karbandi Generator), `world/scenes/world-scene/route-scene.html`, `world/scenes/route/`, and the modules only they used: `shared/engine/city/city-mesh-engine.js`, `city-mesh-gl2.js`, `city-gen-ui.js`, `creature-city.js` and `shared/engine/world/world-layout.js`. Notes below that mention them describe how things were.

## Design systems

`shared/look/tokens.css` is the one file: every token this repo uses lives there, as a default theme
plus `data-theme` variants selected on `<html>` (same mechanism as any per-file dark/light switch).
Pick one when starting something new:

- **No `data-theme`** — the default: portfolio-orange instrument-panel look (`--bg/--panel/--ink/
  --accent`). Used by most of `tools/*` and `Instagram_Visuals/pieces/*`.
- **`data-theme="t8"`** — TAPE 08 hardware/DAW instrument look (`--t8-*`: amber transport, red/
  green/cyan signals with one meaning each, 8 track hues, Martian Mono displays). Also still
  available as a standalone `shared/look/tape08-tokens.css` (byte-identical values) for the ~20 existing
  files — `library/tools/patch/`'s component kit among them — written against that file directly; both are
  valid, interchangeable sources for the same tokens. `shared/look/ui/hardware-ui.css` + `shared/
  hardware-ui.js` (`window.HWUI`) are a second, decoupled source for five of `library/tools/patch/`'s
  components — knob, cable, port, LED bypass, param-control — ported verbatim so any tool can use
  hardware-style controls without the patch-bay app's node-graph data model; `library/tools/patch/` itself
  is untouched and keeps using its own `window.Patch`. See `shared/look/ui/hardware-ui-gallery.html` for a
  live specimen of all five. `library/tools/patch/`'s other components (node-card, inspector, legend,
  top-strip, node-library, patch-canvas, transport-bar) are the patch-bay app's own screens, not
  generic widgets, and weren't extracted; `library/tools/patch-bay/` is an older, superseded single-file
  version of `library/tools/patch/` with nothing beyond what the current modular version already has.
  `shared/look/ui/t8-ui.css` + `shared/look/ui/t8-ui.js` are a third, *new* (not ported) component set in this
  same visual language, covering the general app-UI vocabulary library/tools/patch never needed — the
  shape of catalog shadcn/ui is known for: button, input, select, checkbox, switch, slider, card,
  alert, table, breadcrumb, pagination, accordion (native `<details>`), tabs, dialog (native
  `<dialog>`), popover/dropdown menu (native `[popover]`, JS only positions it under its trigger),
  tooltip (pure CSS), toast. `.t8-` prefixed classes, opt-in, no bare element selectors. See
  `shared/look/ui/t8-ui-gallery.html` for a live, interactive specimen of every component.
- **`data-theme="fish"`** — the fish-tool bestiary's dark/serif look (`--void/--surface/--sock/
  --root-c/--derived-c`, Fraunces display face). Extracted 2026-10-30 from three files that had
  copy-pasted this exact block with no shared source of truth; now canonical here.

`shared/look/ui/chrome.css` is the component layer `tokens.css` never had — buttons, panels, badges, tiles,
nav, form fields, rowlists, stats — built against the default theme's names, opt-in (link it
alongside `tokens.css` only where you want it; nothing auto-applies). Every selector is a `.ui-`
prefixed class, never a bare element, so it can't change rendering on files that don't link it. See
`shared/look/ui/chrome-gallery.html` for a live specimen of every class. Extracted 2026-10-30 from
`world/forges/fish-tool/Support Ecology Quiz.html`, filled out against a gap list (badge, nav, tile,
divider, footer — none of which existed in this theme) pulled from an external reference token spec
(teenage.engineering's marketing site, via shadcn.io/design) — its hairline-only/zero-shadow
elevation principle was already true of this repo's own look; its component checklist is what
exposed the gaps. Its literal zero-radius rectangles and monochrome palette were not adopted — this
theme keeps its own chamfered-corner shape language and accent colour.

`shared/engine/city/city-wfc.js` (`window.CityWFC`) is the radial Wave-Function-Collapse solver behind
`world/legacy/city-gen/`'s two city generators — ring/sector grid construction, seeded constraint
propagation with backtracking, and a second pass that stacks storeys vertically. Extracted
2026-10-31 from `world/legacy/city-gen/Round City Generator.html`, byte-identical at the time to `Sigil
City.html`'s own copy; `TILE_DEFS`/`RINGS` and an optional `opts.tiles/cells/weight` are exposed so
a different tile grammar — not just a desert city — can reuse the same solver. It doesn't touch
rendering; each tool still owns its own renderer on top of the solved grid. `generate()`'s result
also carries `order` (the solver's own cell-by-cell solve sequence) — `world-scene/World Scene
Next.html`'s Growth control replays it as a staged reveal, no separate instrumentation needed.
`LABEL` (the socket-letter legend) was added 2026-11-01, lifted out of Round City Generator.html's
own copy so a second reader of this module's tile data (World Scene Next's Rules tab) doesn't
duplicate it. See `world/legacy/city-gen/README.md` for reuse recipes.

`shared/engine/naqsh-pattern-engine.js` (`window.NAQSH`) is five Persian/Islamic ornament generators —
girih/Hankin tiling, banna'i, eslimi, tongbori, facade — plus their shared palette, seeded-RNG, and
SVG-path-builder utilities. Extracted 2026-10-31 from `world/legacy/city-gen/Naqsh Pattern Workbench.html`,
which both `Naqsh Forge.html` and an unintegrated city-generator variant had separately ported
verbatim. Naqsh Pattern Workbench's own light/Marcellus-serif theme was left untouched — this
extraction is engine-only, no `tokens.css` adoption.

`shared/engine/radial-lattice.js` (`window.RadialLattice`) is the karbandi star-lattice math — point/chord
geometry on a circle and shamseh-medallion sizing — kept palette-agnostic (explicit colors in, not a
named palette) so both an SVG consumer (`Karbandi Generator.html`) and a canvas consumer (`Naqsh
Forge.html`'s karbandi node, previously an independent reimplementation of the same math) draw from
the same geometry. Extracted 2026-10-31.

`shared/engine/rng.js` (`window.RNG`) is the one canonical `mulberry32`/`xmur3` seeded-RNG pair. Extracted
2026-10-31 from the mutually-identical copies in Asset Foundry, Rosette, Vessel, Masterplan,
Xenomandala, Xenoglyph, Mandala Studio, and Image FX Lab — those eight files were left untouched
(not rewired), this extraction is for new tools going forward, starting with
`library/tools/generative-forge/`.

`shared/engine/node-graph-engine.js` (`window.ForgeGraph`) is a thin adapter binding this repo's own
node-type contract (`{inputs, outputs, params, palette, generate, renderInto}`) to `litegraph.js`
(vendored via CDN, not bundled) — litegraph owns graph topology/pan-zoom/wiring/serialization, this
module only adds output-kind normalization (`toCanvas`, so SVG- and canvas-output nodes composite
uniformly) and per-node seed derivation. Built 2026-10-31 for `library/tools/generative-forge/`; see that
tool's `DESIGN.md` for the full node-type contract and a documented async-rasterization limitation.

`shared/engine/xenoglyph-engine.js` (`window.Xenoglyph`) is the 8 glyph-generation engines (script, pills,
pixel, sigil, circuit, cluster, radical, blob) and their skeleton/stroke helpers, extracted
2026-10-31 from `world/glyphs/xenoglyph/xenoglyph.html`, which was rewired to consume it. The glyph-
assembly layer that reads the tool's own live UI state stayed in the HTML file, same split as
`naqsh-pattern-engine.js`/Naqsh Pattern Workbench.

`shared/engine/pixel-fx-engine.js` (`window.PixelFX`) is Image FX Lab's pure per-pixel and canvas-to-canvas
effect functions (duotone, dither, posterize, halftone, pixel-sort, and others) plus their effect
registry, extracted 2026-10-31 from `library/tools/image-fx-lab/image-fx-lab.html`, which was rewired to
consume it. The layer stack, mask/opacity/blend compositing, recipe provenance, and export UI all
stayed local — only the pure effect functions moved.

`shared/engine/city/city-mesh-engine.js` (`window.CityMesh`) is Round City Generator's palette, materials,
mashrabiya-lattice screens, and the `buildPiece()`/`buildModule()` geometry switches that turn one
solved WFC cell into a `THREE.Group`, extracted 2026-10-31 so `world/scenes/world-scene/` could place the
same city without dragging along Round City Generator's own renderer/camera/DOM status text, which
stayed local along with the Naqsh ornament-overlay UI feature layered on top. `buildPiece`/`arms`/
`armPaths`/`footprint` close over `RINGS`/`isAvenueCell` as bare globals rather than reading them off
`CityWFC` — any consumer must destructure those from `window.CityWFC` into its own top-level scope
before calling into this module (both Round City Generator and World Scene do); `world/legacy/city-gen/
Sigil City.html` still carries its own separate, byte-identical copy of this same geometry block,
not yet rewired to this module.

`shared/engine/city/city-mesh-gl2.js` (`window.CityMeshGL2`) is a THREE-free port of `city-mesh-engine.js`'s
geometry — the same `buildPieceGL2()`/`buildModuleGL2()` per-tile-kind switch, pushing into plain
typed-array buffers (`positions`/`normals`/`uv`/`indices`/`materialTag`) instead of
`group.add(new THREE.Mesh(...))`, with the handful of repeated base shapes (box/cylinder/octagon/
hemisphere/sphere/cone) factored out for instanced drawing rather than rebuilt per piece. Built
2026-11-01 for `world-scene/World Scene.html`'s raw-WebGL2 pipeline, which loads no Three.js
at all. `sectorSlabGL2()`/`frameOf()`/`W()` are exported but ground-plane/sector-slab dressing
itself is left to the integration — page-specific set-dressing, not an engine concern, the same
split `city-mesh-engine.js` already draws.

`shared/engine/tower/tower-engine.js` (`window.TowerEngine`) is Tower Forge's `buildTower(spec)` — already a pure
function returning a standalone `THREE.Group`, decoupled from Tower Forge's own render loop — and its
full geometry dependency chain, extracted 2026-10-31. Tower Forge's MAP-Elites/mutation/crossover
code and the `spec()`/preset machinery stayed local; only the geometry builder moved.

`shared/engine/tower/tower-engine-gl2.js` (`window.TowerEngineGL2`) is the same THREE-free treatment for
`tower-engine.js` — `buildTowerGL2(spec, rnd) -> {parts, info, reach, top}`, mirroring
`buildTower()`'s own geometry 1:1 (`latheGL2`, `twistBuffer`, `buildBodyGL2`, `addCrownGL2`,
`buildAuraGL2`, …) but returning raw buffers instead of a `THREE.Group`. Built 2026-11-01 alongside
`city-mesh-gl2.js`, for the same reason. World Scene Next aliases `window.TowerEngine =
window.TowerEngineGL2` at load time so `tower-presets.js`'s `TIER_DEF` reference and
`tower-forge-ui.js`'s `TW_SKIES`/`rAt` lookups work unmodified against either engine — Three.js or
raw-WebGL2 — without either file needing to know which one is actually loaded.

`shared/engine/tower/tower-presets.js` (`window.TowerPresets`) is Tower Forge's 11 named, hand-tuned tower specs
(the `T()`/`H()`/`spec()` builder helpers plus the presets themselves), extracted 2026-10-31 so
`world/scenes/world-scene/` can place real towers without copy-pasting preset JSON. The exported surface is
plain data — no functions attached — even though the helpers that assemble it stay private to the
file. `HALO_DEF`/`AURA_DEF`/`LOOK_DEF` are duplicated here rather than shared with Tower Forge.html,
since those three are also used there for unrelated things (normalizing a loaded spec, new-halo
defaults) and rightly stay defined in both places.

`shared/engine/tower/tower-forge-ui.js` (`window.TowerForgeUI`) is Tower Forge's schema-driven editing UI —
`TIER_SCHEMA`/`CROWN_SCHEMA`/`BASE_SCHEMA`/`HALO_SCHEMA`/`AURA_SCHEMA`/`LOOK_SCHEMA`, the generic
`renderForm()`/`sel()`/`optsOf()` form builder, and the drag-to-shape profile canvas
(`drawProfile()`/`attachProfileHandlers()`) — extracted 2026-11-01 from `world/forges/tower-forge/Tower
Forge.html` so World Scene Next's own tower editor (several placed towers, not one) could reuse the
exact same editing surface instead of a parallel reimplementation. Later extended with
spec-normalization (`normalize()`/`specCode()`/`parseSpecCode()`, for a Code dialog), the full
`mutate()`/`crossover()`/`surprise()` variation math, and the MAP-Elites fitness/trait functions
(`ATLAS_AXES`, `coherence()`, `fitnessOf()`) plus a `createAtlas()` grid factory — all pure
spec-object arithmetic with no rendering dependency, so both tools' Variations/Atlas features now
share one algorithm. Thumbnail rendering itself stays host-specific (one tool renders through
THREE.js, the other through a raw-WebGL2 offscreen framebuffer) and isn't in this module. Tower
Forge.html was refactored to source all of the above from here instead of its own inline copies;
its own behavior/output is unchanged.

`shared/engine/city/city-gen-ui.js` (`window.CityGenUI`) is Round City Generator's piece-sprite browser and
Rules/grammar explainer, ported to pure canvas-2D + DOM — `drawTileSprite()`/`drawModuleSprite()`/
`drawOrientKey()`, `buildPieceSheet()`, `buildRulesPanel()`, `buildDistrictsLegend()`, and a
`buildPatternEditor()` that reuses `tower-forge-ui.js`'s `renderForm()` for its generator-parameter
forms rather than a second form builder. Built 2026-11-01 for World Scene Next's City panel. Not
yet wired back into Round City Generator.html itself (which still owns its original, THREE.js-
coupled versions of the same features) — a natural follow-up, same anti-drift reasoning as
`tower-forge-ui.js`, just not done in this pass.

`shared/engine/creature-arch.js` (`window.CreatureArch`) turns the 394-piece `creature-parts.json` sigil
sheet (29 species' worth of hand-drawn SVG parts, each tagged with an architectural role — frieze,
bead, segment, lamp, blade, spire, rib, hook, core, halo, buttress) into glowing `gl.LINES`
elevations: a band/bay placement grammar ported from a standalone Spire Forge prototype
(`makeBandGrammar()`/`composeBand()`, position-aware rules with tied end/side randomization),
`elevTower()`/`elevHall()` for simple single-silhouette buildings, and `buildTemplate()` for four
full multi-section compositions (lighthouse/spire/hive/shrine — base terraces, shaft, balconies,
drums, neck, crown). `standElevation()` stands one elevation up as several radially-mirrored planes
around a vertical axis (a generalization of the "Spire Stack" sprite-stacking technique — slice a
drawn elevation, spin copies of it around the spine); `wrapOnSurface()` instead wraps it around a
curved surface as a decorative band. Built 2026-11-01 for World Scene Next, which uses it for both
city buildings (replacing `city-mesh-gl2.js`'s geometry as the real visible identity; that mesh
geometry is kept only as an invisible depth occluder) and placed towers (an added glowing body
layered over `tower-engine-gl2.js`'s own shell, which is likewise demoted to a depth occluder).

**Adopted the Spire Forge ornament bridge (2026-11-01)**: the `creature-parts.json` sheet grew from
347 to **394 parts / 31 species** — swapped for `Spire Forge (2)`'s copy, a confirmed strict
superset (identical schema, zero mismatches on the shared 347). `Spire Forge (2)/index.html` (a
Spire Forge prototype, additive-only vs. the original) has a "To Tower Forge" button
(`toTowerForge()`) that exports a hand-authored 2D tower design as a full Tower Forge spec whose
tiers carry a new `orn` field — the *exact* part id, repeat count, and pixel size it placed for that
tier's bays/front-window/pilasters/frieze (base/drum tiers), or ribs+frieze (shaft tiers) — plus a
`spire` passthrough of the full 2D genome, commented "World Scene builds this exact tower in 3D".
`CreatureArch.elevFromOrn(orn, H)` is the new consumer: given that `orn`, it resolves each id via
`CreatureArch.byId` and lays out real part copies directly (no grammar, no randomness) in the same
`{E, top}` shape every other elevation builder returns, so `wrapOnSurface()` wraps it onto a tier's
curved surface exactly like the generic path. World Scene Next's `buildTowerCreatureOrnament()` uses
`elevFromOrn()` for any tier whose spec carries `orn` (i.e. imported via the bridge) and falls back
to the original `elevHall()`+grammar path otherwise (presets, mutations, Atlas evolution — nothing
about this is required of a spec). `TowerForgeUI.normalize()` was extended to keep `orn`/`spire`/
`source` on round-trip through the Code dialog's `parseSpecCode()` (they already survived per-tier
via `Object.assign`; only the three top-level fields needed an explicit copy). Verified end-to-end
in-browser with two different Spire Forge templates (lighthouse, shrine) pasted through the Tower
Code dialog: zero console errors, visibly distinct repeating bay/rib ornament per tier.

**The city's towers were then switched over to this set.** `shared/engine/tower/tower-presets.js` now ships 8
pregenerated Spire Forge exports (2 seeds × each of the 4 templates — `spireLighthouse1/2`,
`spireSpire1/2`, `spireHive1/2`, `spireShrine1/2`), normalized and tagged `source.from === 'Spire
Forge'`. World Scene Next's `placeTowersForCity()` restricts its roster to that tag (falling back to
every preset if the subset is ever empty), so a freshly generated city's hub landmark and ring
towers always render through `elevFromOrn()`'s exact-fidelity path now, not the older generic band.
The original 14 hand-tuned presets are untouched and still reachable from the Tower panel's "Load
preset..." dropdown and from standalone `world/forges/tower-forge/Tower Forge.html` — just no longer
auto-picked for a generated city. Verified in-browser across 6 reseeds: all 4 templates appear with
correct variety, zero console errors, hub landmark consistently the highest-`habitatScore` preset
(by design, unrelated to this change).

`shared/engine/tower/creature-spire.js` (`window.CreatureSpire`) and `shared/engine/city/creature-city.js` (`window.CreatureCity`,
2026-11-02) replaced World Scene Next's old Persian-styled city with a "Block Forge" one, built in a
separate session/context and handed off as loose files (see each module's own header comment for the
full design — `CreatureSpire.buildSpireGL2()` stands a Spire Forge genome up as true GL2 geometry,
more faithful than `creature-arch.js`'s own `buildTemplate()`: terraces/drums wrapped on their real
cylinder, true circles for level lines, swept crown blade fans; `CreatureCity.build(wfc, seed, opts)`
reuses the existing WFC layout but rebuilds every piece as Block Forge blocks/crowns/`CreatureSpire`
towers, returning both the glowing wireframe AND its matching depth occluder from one call). Moved
into `shared/` to match every other reusable module (arrived as a root-level file and a Downloads-only
file respectively). Wiring this in surfaced a real, pre-existing bug: `uploadLinePart()`/
`uploadLineInstanceGroup()` in World Scene Next read `part.color` (singular) while `creature-arch.js`
has always returned `.colors` (plural) — a silent `GL_INVALID_VALUE` on every city building's color
buffer, present since the original creature-line city work and never visually obvious enough to
notice (the near-black occluder still gave buildings *some* silhouette). Both functions now accept
`.colors || .color`; city buildings went from a flat pale grid to genuinely glowing, habitat-tinted
wireframe the moment it was fixed. Full detail, including the performance numbers and known
limitations carried over from the handoff, in `world/scenes/world-scene/README.md`'s "Block Forge city
rebuild" section.

The city and its towers were two systems that didn't know about each other — a landmark tower could
stand in the middle of a Block Forge building. `creature-city.js` gained a small, additive
`opts.skipCells` (a Set of WFC cell ids to leave completely unbuilt); World Scene Next's
`placeTowersForCity()` now snaps each ring tower to a real WFC cell instead of a free-floating angle
and reserves that cell, so the city generator actually responds to where the towers are. See
`world/scenes/world-scene/README.md`'s "City gen responds to tower placement" section.

`shared/engine/ecology/ecology-species.js` (`window.EcologySpecies`) and `shared/engine/ecology/ecology-sim.js` (`window.EcologySim`)
are `world/forges/fish-tool/Cybernetic Ecology.html`'s full creature simulation — species behavior
derivation, boid steering, predation, carcasses, pressure-based respawn timing, vortex/pointer
interaction — extracted 2026-10-31 as an instance-based API (`create`/`resize`/`step`/`setSpecies`/
`setCount`/`setPointer`, full list in the module's own header) so it can run headless, independent of
Cybernetic Ecology's WebGL2 renderer and DOM UI. An earlier narrower attempt (fish array + step
function only, nothing else) correctly bailed: the species-behavior/predation/carcass code isn't page
glue, it's simulation behavior, so a full-fidelity relocation had to move all of it together. Only the
WebGL2 shaders, DOM UI, and camera stayed in Cybernetic Ecology.html, now driven by the shared module
instead of a private copy.

`world/scenes/world-scene/World Scene.html` started as a from-scratch rebuild (2026-10-31–2026-11-01)
of an earlier Three.js scene, `World Scene.html` — which combined `city-wfc.js`+`city-mesh-engine.js`
(the city), `tower-engine.js`+`tower-presets.js` (towers placed at real sanctum-ring lots, scaled to
fit), and a real `EcologySim` instance remapped into the scene's world coordinates via its own
`tankToWorld()`, with a rendering-side-only bias nudging each creature toward whichever tower scored
richest on a simple habitat read of its spec. The rebuild gave three things that foundation couldn't:
one raw-WebGL2 pipeline for everything — fish, towers, city, one `gl` context, one camera, additive
shader-glow instead of a post-process bloom pass, no second renderer to keep in sync — with Cybernetic
Ecology's own dock/sim/species UI reused verbatim rather than reimplemented. Towers and city sit
directly in tank-space coordinates rather than a separate world space `tankToWorld()` remaps into
(the tank IS the world here), so each placed tower is a literal `EcologySim.setVortices()` whirlpool,
a real simulation input rather than a rendering-only nudge. And building identity is different: city
buildings and tower bodies are glowing wireframe architecture grown from the same 394-piece
creature-parts vocabulary the fish are drawn from (`creature-arch.js`, and — since 2026-11-02 for the
city specifically — `creature-city.js`'s Block Forge-style rebuild and `creature-spire.js`'s more
faithful Spire Forge port; see `world/scenes/world-scene/README.md`'s "Block Forge city rebuild" section),
not literal textured geometry or a separate visual language sitting next to them. The page carries
full authoring UI for both halves — City (seed/New World, a Growth control that replays the WFC's
own solve order as a staged reveal, Layers toggles, a Districts legend, Pieces/Rules/Patterns tabs
ported from Round City Generator via `city-gen-ui.js`) and Tower (Tiers/Crown/Aura/Look editing via
`tower-forge-ui.js`, plus Variations and a MAP-Elites Atlas, organized as Blender/Unity-style modes
rather than more panels stacked into one view) — plus a click-to-select Inspector: click any placed
tower, city building, or fish in the 3D view for a details card and a camera-frame action, picked
with screen-space-nearest tests for towers/fish and a closed-form polar lookup against the city's
own ring/wedge cell bounds, no raycasting engine required. `World Scene.html` was deleted 2026-11-02
once this rebuild had superseded it in every respect — it was never committed to git, so there's no
history to recover it from. See `world/scenes/world-scene/README.md` for the full architecture.

`archive/instagram-visuals/Visual_Essay/design-system/` (`--ds-*`) is the one deliberate exception, kept
separate rather than folded in as a fourth theme: it targets a different medium entirely — fixed
1280×720 (and a 1080×1920 port in `../templates/`, `--rt-*`, same values) slide/video canvases for
export, not responsive interactive UI. See that folder's own README for its component vocabulary
and the `../templates/` vs `../genui-ep1/` relationship.

## The catalogue

`library/components/catalog.js` is the one list of what is in the library: every interface study, component and
tool, with each component's name, category, tags, description and **lineage** (`from`): the study panel it
was cut from, the component it is a revision or variant of, or the tool it was made in. The gallery
(`index.html`) and the studies index (`library/interface-studies/index.html`) both read it, so a new piece is added
in one place. It is a script, not a `.json`, so both pages still work opened straight from disk.

```js
{ id: "datamatic-tape", name: "Datamatic Tape", file: "library/components/interaction/datamatic-tape/datamatic-tape.html",
  category: "interaction", tags: [...], description: "...",
  from: [{ kind: "study", id: "04-compass-studies", panel: "II" }] }   // kind: study | component | tool, optional note
```

Ids never change; link by id (`index.html#datamatic-tape` opens it in the gallery). After adding or moving a
file, run:

```sh
node library/components/check-catalog.cjs        # fails on a missing file, an unlisted component, a duplicate id or a broken `from`
node library/components/check-catalog.cjs --own  # also lists the components that carry their own colours instead of shared tokens
```

## Sci-fi Gallery

`library/gallery/` applies Forge's approach to the component library. Components are the parts; a **design** is
parts placed on a grid frame, running live, each in its own iframe.

- `library/gallery/index.html`: the designs (and, on the Parts tab, which designs use each component). The picked
  design shows the studies its parts were cut from and what it was edited or branched from.
- `library/gallery/bench.html`: build one. Click or drag parts from the kit onto the frame, drag slots to move them,
  drag the corner to resize, set each slot's zoom (how much of the component's page shows) and label.
  **Compose** lays parts out with a seeded generator (layout, slot count, category mix); **Reroll** (`R`)
  keeps the rules and draws a new seed. Arrange/Interact (`I`) switches between moving slots and using them.
- `library/gallery/view.html`: one design full window; `←` `→` step through designs, `F` hides the strip.
- `library/gallery/designs.js`: the starter designs (read-only; editing one saves a copy that points back).
  Designs you save live in the browser's localStorage. Export one from the Bench and paste it here to ship it.
- `library/gallery/thumbs/`: one picture per component, used by lists so they don't load 50 live pages. After adding
  a component, serve the repo and run `node library/gallery/make-thumbs.cjs <id>`. `check-catalog.cjs` flags a
  missing thumbnail and any starter design that uses an unknown part.

## A note on near-duplicate names

Several `library/components/interaction/` folders look like duplicates but aren't — they're deliberate revisions, kept side by side rather than overwritten:

- `rain-vortex` / `rain-vortex-rev-b` — the second pass adds a valve sequencer, exploded view and an Ikeda-style data raster.
- `reliquary` / `reliquary-compass` — different pieces: Reliquary is a lock-dial vitrine, Reliquary Instrument is a compass study (Compass Studies panel I).
- `ophanim` / `ophanim-iris` — the original gaze-reactive wheel mechanism, and a reimagining of its eyes as mechanical lens diaphragms.
- `spine-section` / `spine-polar` / `spine-lock` / `spine-lock-alert` / `spine-unit` — a family of pieces sharing the spine/vertebra bracket language, each a different mechanic.

If you're extending one of these, check its `from` in `library/components/catalog.js` (or the lineage line in the gallery) before assuming it's the canonical copy.

## Running it

Everything is a static file — serve the repo root and open `index.html`:

```sh
python3 -m http.server 8765
open http://localhost:8765/index.html
```

`archive/instagram-visuals/` has its own run/export instructions in `archive/instagram-visuals/README.md`.

### shared/engine/motion/

How drawn creatures move. Both are classic scripts with no dependencies, loaded before a page's module.

- `ik.js` — `IK.twoBone()` (two bones, the middle joint bent toward a pole) and `IK.fabrik()` (any number of bones, biased toward a pole so long chains keep their arch). Works on `THREE.Vector3` or anything shaped like it.
- `limb-art.js` — `LimbArt`: reads line art into bones. `flattenD()` turns path data into polylines, `sliceSpine()` cuts a drawn limb into one slab per bone along a spine, `guidedSpine()`/`medialSpine()` find that spine (from hand-placed waypoints or the middle of the drawing), and `parseForgeSVG()` reads a Bestiary Forge export back into body, limb chains, veil, accents and halos.

Used by `world/forges/walker-bestiary/` (Bestiary Forge creatures walking, with rig sheets and creature templates) and `world/forges/townsfolk/` (procedural people, with sprite-sheet and character templates). Each folder's README covers its tools.

### shared/engine/world/

- `route-atmo-gl2.js` — the layers round World Scene's city: the hills, pines, moon, and the road out of the gate with its pilgrims.
