# Forge — integration gaps

> **Ecology is the 3D world, 2026-11-11.** `ecology.html` now hosts the same World Scene as City
> (`?forge=1`), opened on a saved city: the scene's own camera (drag to turn and tilt, shift-drag to
> pan, scroll to zoom) and City's floor. Swimmers, walkers and their homes, drift, captures and the
> camera moved there from City's Ecology tab; City keeps City, Route and Camera. The shared panels are
> `forge-scene.js`. What Ecology tunes is written to the city record. The flat top view, its three draw
> modes and its plot-map landmarks are gone. Still open: releasing a captured variant into the water
> (World Scene builds its species set once). Check: `ecology-stage`.

> **2026-11-10 update.** Several of the findings below are fixed and kept only as history: the Species
> rail goes to `species.html`, Bestiary Forge saves to the world through `forge-bridge.js`, and
> `editorsFor` links point at `world/forges/` again (they still said `tools/` after the reorganisation,
> so every "Edit in …" link to a standalone forge was broken). Creatures from the Walker Bestiary now
> save to the world too (`shared/engine/creature-record.js`). Ecology, Rig and the scenes
> still draw flat (their renderers are 2D), but they now step and run by the same rulebook as the 3D
> walker: `shared/engine/motion/gaits.js`. New pages: `import.html` (the Blender import dock) and
> `motion.html` (the motion rack).
>
> **Ecology gap, closed for the Forge Ecology page.** Saved kit mechs, Blender solids and Bestiary
> walkers now walk the city there (`shared/engine/ecology/ground-walkers.js`), drawn from the top view
> each record carries (`recipe.flat`, baked by the 3D Bestiary; a record without one is baked in a
> hidden Bestiary frame). Still open: World Scene and Route Scene (raw WebGL2) don't draw them, they
> don't take part in drift/evolution, and buildings don't attract them by species yet.

Audit (2026-11-03) of what Forge actually reaches from each standalone tool it's
supposed to unify, vs. what those tools really have. Read-only findings, not yet fixed.

> **Streets, lighter towers, undo, 2026-11-10 (fourth pass).** Walkers route over
> `CityGrammar.walkGraph` (open lots, ring roads, stairs) and can keep to a building
> (`recipe.grammar.homes`); towers draw from a simplified drawing far away (`creature-spire.js`
> `opts.detail`) and one site can be stood again alone (`restandTower`); the City stage has undo, redo
> and a kept draft. See `docs/forge-review.md` for what is left.
>
> **One 3D world, 2026-11-10 (third pass).** In the City stage's 3D view:
> - *Forge buildings stand as the towers, as designed.* `creature-spire.js` now builds every form the
>   2D generator draws (shaft wall, lancets / arcade, stepped buttresses, pinnacles, eaved roofs, dome,
>   needle, gate), and World Scene stands a spec's embedded design (`spec.spire`) through it instead of
>   the Tower-engine shell. The world's building records are the tower pool; click a tower for a bloom
>   of them (`recipe.grammar.sites`).
> - *Ecology.* Saved walking creatures (records with `recipe.flat`) walk the 3D city between the
>   towers (`GroundWalkers.segments`, standing lines); the inspector's Ecology tab keeps their counts
>   (the same ones the top view keeps) and the swimmers' shares, and pauses the world.
> - *Route.* The road leaves the first avenue's gate with poles and wire (`route-atmo-gl2.js`) and the
>   pilgrims walk it in; the Route tab switches the road, pilgrims, hills, pines, moon and street
>   walkers (`recipe.grammar.route`).
> Still open: the Ecology top view (`ecology.html`: variants, drift, what each building attracts,
> captures) and Route Scene (`route-scene.html`: Forge props along the road, the five-act myth) are
> still their own pages on their own data; the Plots view is still the older flat solve; the
> Tower Forge panel inside World Scene edits a Forge building's shell, not its design.
>
> **City stage is World Scene, 2026-11-10 (later the same day).** The stage's main view is now
> `world/scenes/world-scene/World Scene.html?forge=1` in a frame: the terraced city grammar with its
> towers and creatures. Click a block for a hex bloom (district, street front, build, clear); a pick is
> a pin in `recipe.grammar.pins` (`CityGrammar.build`'s `opts.pins`) and the grammar's socket solve
> reworks the neighbours. `recipe.grammar` also keeps the tower count and the drawing style. A saved
> city opens in World Scene on its own with `?world=&city=`. The flat plot map below is the second
> view ("Plots"). Still open: the two views are different generators on one seed, so a pin in one
> does not show in the other; Forge buildings do not stand in the 3D city yet (the grammar's `part`
> column is the hook); Ecology and Route Scene still read the plot map / an unpinned grammar city.
>
> **City stage, 2026-11-10.** It still solves the flat radial plot map (`city-wfc.js`), but speaks this
> world's words now (`CityPlacement.VOCAB`: the Tower, University, Markets, housing tiers, shrines,
> canals) instead of the old desert-city names. Click any cell for a hex bloom of what may stand
> there; a pick is a pin (`recipe.pins`) and the solver rebuilds the city round it. "Forge buildings
> for the empty plots" makes one fitting building per kind of plot. The building generator gained a
> shaft wall and four templates (pagoda, gothic, hall, gate). Still two city generators: World Scene
> and Route Scene show the terraced city grammar, not this map.

## Bugs (not scope gaps — these are wrong)

- **Species rail stage is misrouted.** `forge-shell.js`'s `STAGES` array points
  "Species" at `./attach.html`, not at Bestiary Forge. Inside an open world there is
  currently no way to reach Bestiary Forge at all — it's only reachable from the
  Worlds landing page's "Breed a species" card. Fix: restore the Species stage to
  link to `world/forges/bestiary-forge/`, and give Attach Points its own rail slot (or reach
  it only from Kit/Species, like `rig.html` already does via "Edit this species'
  attach points").
- **Bestiary Forge never writes to the world file.** Unlike Spire Forge and Sigil
  Forge (both got a "Save as prefab" button this session), `world/forges/bestiary-forge/`
  has zero `forge-world.js`/`ForgePrefab` references. Species bred there never reach
  the Shelf or the prefab system. Needs the same additive button/handler pattern
  used in `world/forges/spire-forge/index.html` and `world/forges/sigil-forge/index.html`.

## Spire Forge (Tower) — partially wired

Bench's Tower preset exposes ~9 of the original's 20+ controls. Missing:
- Upper Drums section
- Dome section (toggle / rise / shells)
- Crown beads, spire toggle, light beams, buttresses
- Balcony width/taper, base stepping
- Per-part "swap ornament" buttons
- Kit-species filter chips
- The "Design it" (brief → building) feature
- Direct SVG/PNG/JSON export

## Sigil Forge (Seal / Alphabet / Icon) — partially wired

- Seal is missing ~8 controls: inner/outer ring radius+size, spin, contours, star
  step, line weight, mono-color toggle, weave, part-swap button.
- Alphabet is missing glyph stroke-count min/max and crossing/distinct controls,
  plus the hook/bead swap button.
- **Icon mode doesn't exist in Bench at all** — not just the weave feature. The whole
  Icon tab (part/glyph mark, badge, accent, icon-set export) is unported.
- No SVG/PNG/JSON export from Bench for either preset.

## Round City Generator — partially wired

`world/forge/web/city.html` genuinely reuses the real `shared/engine/city/city-wfc.js` (WFC
placement + landmark tiles) — confirmed real reuse, not a reimplementation. But it
omits `shared/engine/city/city-mesh-engine.js` and `naqsh-pattern-engine.js` entirely, so
Forge's City screen is a flat 2D plot map — no 3D rendering, no mashrabiya
window-screen generation that the standalone tool has.

## Cybernetic Ecology — mostly wired

`world/forge/web/ecology.html` loads the real `shared/engine/ecology/ecology-species.js` +
`ecology-sim.js` at runtime — full species roster and behavior data, not a stand-in.
`creature-sprites.js` is a new renderer (draw-from-rigged-parts) rather than reused
original draw code, so its visual fidelity against the original isn't independently
verified. One real gap: **Species Style Lab's per-species color/shader tuning is an
island** — it saves only to its own `localStorage` and never writes back to
`ecology-species.js`, so it's unreachable from Forge. This predates Forge and isn't
fixable by wiring alone; Style Lab would need to write into the shared species data.

## Integration direction (2026-11-03)

Stop porting each tool's controls into Bench. The world file is the contract; the standalone
tools are the full editors, Bench is the quick editor and graph, and every tool can open a world
object and save it back onto the same id.

Done:
- **One building recipe.** `shared/engine/generators/forge-building.js`: a saved building's recipe is a
  Tower Forge spec carrying the Spire design as `spec.spire` (Spire Forge's existing export
  format). `SpireGenerator.toTowerSpec()` is a copy of Spire Forge's `toTowerForge()` (checked
  identical on 15 genomes); Bench's Tower now saves this format (`persist`) and reopens it
  (`restore`), so Bench, Spire Forge, the prefab dialog and later Tower Forge / World Scene all
  read the same object. Older saves (a bare genome, or a spec) still open.
- **The world bridge.** `world/forge/web/forge-bridge.js`, wired into Spire Forge: opened with
  `?world=&object=&return=` it loads that building, "Save to world" updates it (a new version),
  "Save as new" forks it, and a Forge bar links back. Every `world.put` is broadcast
  (`ForgeWorld.onChange`), so the Shelf, Bench and City refresh when a tool saves.
- **Ways in.** `ForgeWorld.editorsFor(record)` lists where an object can be edited. Used by the
  Shelf (links on each card), Bench ("Open in Spire Forge", `?object=` to reopen a saved object)
  and City (a placed building's "Edit in Spire Forge"; coming back reselects the plot).

- **Every full tool on the bridge.** Sigil Forge (seals, alphabets, icon sets; opens in the
  matching tab), Tower Forge (the building spec; keeps `spec.spire` and sets
  `source.editedIn: "Tower Forge"`, and Spire Forge and Bench warn that saving there rebuilds it)
  and Bestiary Forge (bred creatures saved as `species` `{kind: "bred", layout, placements}`, and
  Bestiary towers as `building`; both reopen as a result card). Opened on their own, all of them
  behave as before.
- **Promoted controls** (Houdini HDA style). A generator declares `promote: [...]` and
  `tool: {id, label}` in the registry. Bench shows the promoted few, folds the rest under "More
  controls", and links to the full tool; graph nodes expose only promoted params. Tower promotes
  type, base width, shaft height and crown radius; Seal promotes word, frame, fold and detail;
  Alphabet promotes grid, stroke and weight.
- **Species stage fixed.** The rail's Species stage opens `species.html`, a hub with Breed
  (Bestiary Forge, opened inside the world), Attach, Rig and Ecology, plus every species in the
  world with links to where it can be edited.

- **Overrides** (`shared/engine/generators/forge-overrides.js`; Unity prefab variants / USD opinions).
  A recipe can be `{ $base: "<scheme>:<id>", $overrides: { "path": value } }`, resolved through
  `$base` chains. Used by:
  - Ecology variants: a captured species stores only the swim values that changed from its base
    (`eco:<key>`, or `species:<parent>` for later generations). Untouched values follow the base,
    so retuning a root species' rig carries through. Older full-swim captures still read.
  - Rig on a variant: changed sliders are marked, each can revert, "Revert all" and "Apply to
    base" (writes into the root species' rig, or into the parent variant).
  - City plots: "Tweak on this plot" changes a placed tower's promoted controls on that plot
    only (`recipe.plotOverrides[cell]`), drawn as a variant of the base building; "Apply to base"
    writes them into the building for every plot.
  - Species Style Lab: its per-species looks are saved into the world as one `style` object of
    overrides on each species' built-in look; Ecology colours creatures from it.
- **Used by and recook** (Houdini PDG). `ForgeWorld.graph(records)` reads `refs[]`
  ("type:id@version"): `usedBy`, `impact` (everything downstream), and `stale` (an input ref whose
  target has a newer version; provenance refs never go stale). The Shelf shows "used by N" and
  "stale" on cards; tool saves report how many things they reach. `lineage.html` shows what an
  object was made from and everything built on it, lists what's out of date, and recooks in
  order: Bench towers regenerate with their current rule set, rigs rebuild bones from the
  current attach points, cities and species record the versions they now follow.

- **Connected stages** (Blender's active object). One object is selected per world
  (`ForgeWorld.select` / `getSelection` / `onSelect`), shared by every page and every open tab.
  Picking a plot's building in City, a landmark in Ecology, a Shelf card, a Species card, a
  Lineage row, or opening/saving in Bench, Rig or Rules selects it. The selection bar in the
  Shelf head shows it with every place it lives (`ForgeWorld.placesFor`): its editors, the
  cities it stands in, Ecology on those cities, Lineage. City outlines the plots a selected
  building stands on (or dashes the empty plots it would fit); Ecology rings its landmark and
  highlights a selected variant; Lineage opens it. One shell: `workspace.html` now opens the
  stage page, and the rail carries Lineage and links back to the worlds list.

Next: attach points driving sockets, Shelf catalogs and drag onto City plots, and bake /
flatten so World Scene Next can open a saved city in 3D.
