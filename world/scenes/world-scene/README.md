# world/scenes/world-scene/

City + towers + a real creature simulation, one scene: `World Scene.html`, a from-scratch
raw-WebGL2 build unifying Cybernetic Ecology's own fish renderer with the city and towers in a
single pipeline instead of mixing in a second rendering engine.

This directory used to hold two builds — `World Scene.html`, a one-off Three.js scene this file
superseded in every respect, and this rebuild. `World Scene.html` was deleted 2026-11-02 once it
had nothing left that this build didn't already do better (it was never committed to git, so there's
no history to recover it from if that turns out to matter later).

## What's here

| File | What it is |
|---|---|
| `route-scene.html` | The same world as World Scene Next, re-staged flat in three.js after Kentucky Route Zero. Builds the identical city + towers for a seed through `shared/engine/world/world-layout.js` (a renderer-free copy of World Scene Next's `buildPlacedCity`/`placeTowersForCity`/tower creature lines; **keep the two in step**); "Stage view" in World Scene Next and "Glow view" here flip between them. Adds outskirts, a road with pilgrims, Forge props (active Forge world via `world/forge/web/forge-world.js`, else forged fresh through `ForgeRegistry`), and Forge Ecology's movement (its sim settings + `shared/engine/generators/ecology-loop.js`, landmarks = towers/lit windows/props). Creatures are their ecology-species line/fill meshes bent on the GPU from a per-creature spine texture. Looks: Route Zero, Glow, Engraving, Relief. "Play the myth" runs five acts. `?seed=`, `?lines=1` (no line thinning), `?size=` (creature size). |
| `World Scene.html` | No Three.js anywhere. Cybernetic Ecology's own dock/sim/species UI reused verbatim. City and towers placed directly in tank-space coordinates (the tank IS the world) rather than through a remap. Their real visible identity is glowing wireframe architecture grown from the creature-parts sheet, not literal textured geometry — see "Rendering: two layers per object" below. Full City and Tower authoring panels, a click-to-select Inspector. |

## Hosted by Forge

Forge's City stage (`world/forge/web/city.html`) shows this page in a frame as its city generator.

- `?forge=1` hides the rail, dock, inspector and HUD and frames the city. A click on a block posts `{ forgeCity: "pick", x, y, tile, choices }` to the host page instead of selecting it.
- `window.ForgeCityHost` is what the host calls: `setCity({ seed, pins, towers })`, `summary()`, `plan()`, `highlight(tileKey)`, `frame()`, `styles()` / `setStyle(id)`, `sleep(on)`.
- `?world=<id>&city=<id>` (no `forge=1`) opens a city saved in Forge on its own: its seed, pins, tower count and style.

Pins go to `CityGrammar.build` (see `shared/engine/city/grammar/README.md`).

The host also hands over the rest of the world:

- `setCity({ buildings, sites })`: the Forge world's building records (`{ id, version, name, districts, spec }`). They replace the presets as what stands on the tower sites. A spec that carries its Spire design (`spec.spire`) is built from that design by `shared/engine/tower/creature-spire.js` (`buildPlacedSpire`), so it stands as it was drawn. `sites` maps a site (0 = the main tower) to a building id. A click on a tower posts `{ forgeCity: "tower", site, key }`.
- `setCreatures([{ id, name, flat, motion, count, color }])`: saved walking creatures. They walk between the towers (`shared/engine/ecology/ground-walkers.js`) and are drawn standing, as lines. `ecology()`, `setPop(key, n)` and `play(on)` are the swimmers' side.
- `route()` / `setRoute({ road, pilgrims, ridges, pines, moon, walkers })` and `viewRoad()`: the layers round the city. The road is built in `shared/engine/world/route-atmo-gl2.js` from the first avenue's angle (`CityGrammar.spokesOf`).

## Shared modules

| Module | What it holds | Used by |
|---|---|---|
| `../../../shared/engine/ecology/ecology-sim.js` (`window.EcologySim`) / `ecology-species.js` (`window.EcologySpecies`) | The real creature simulation — species behavior, boid steering, predation, carcasses, vortex/pointer interaction. | Both builds, Cybernetic Ecology itself |
| `../../../shared/engine/city/city-wfc.js` (`window.CityWFC`) | Radial WFC solver: grid/tile construction, constraint propagation, storey-stacking. `generate()`'s `order` (solve sequence) drives World Scene Next's Growth reveal; `LABEL` (socket legend) backs its Rules tab. | World Scene Next, `world/legacy/city-gen/` |
| `../../../shared/engine/city/city-mesh-engine.js` (`window.CityMesh`) | City piece/module geometry, Three.js `THREE.Group`s. | `world/legacy/city-gen/Round City Generator.html` (not used by World Scene Next) |
| `../../../shared/engine/city/city-mesh-gl2.js` (`window.CityMeshGL2`) | The GL2 twin of the above. No longer used by World Scene Next's own city (see `creature-city.js` below, 2026-11-02) — the script still loads but nothing calls into it; kept for `world/legacy/city-gen/Round City Generator.html`, which still uses it directly. | `world/legacy/city-gen/` only, now |
| `../../../shared/engine/city/creature-city.js` (`window.CreatureCity`) | Builds World Scene Next's whole city — both the glowing "Block Forge" wireframe identity AND its matching depth occluder, from ONE call — see "Rendering: two layers per object" below. | World Scene Next only |
| `../../../shared/engine/tower/creature-spire.js` (`window.CreatureSpire`) | Stands a Spire Forge genome up as real GL2 geometry (terraces/drums wrapped on their true cylinder, true circles for level lines, swept crown blade fans) — a more complete, more faithful port than `creature-arch.js`'s own `buildTemplate()`. `creature-city.js` uses it for every round building (minarets, bastions, gate pylons, cisterns, pavilions, masjid minarets). | World Scene Next only |
| `../../../shared/engine/tower/tower-engine.js` (`window.TowerEngine`) / `tower-engine-gl2.js` (`window.TowerEngineGL2`) | Tower geometry — Three.js `THREE.Group`s vs. raw typed-array buffers. World Scene Next aliases `window.TowerEngine = window.TowerEngineGL2` at load so `tower-presets.js`/`tower-forge-ui.js` work against either engine unmodified. | `world/forges/tower-forge/Tower Forge.html` / World Scene.html respectively |
| `../../../shared/engine/tower/tower-presets.js` (`window.TowerPresets`) | 11 named, hand-tuned tower specs. | Both builds, `world/forges/tower-forge/` |
| `../../../shared/engine/tower/tower-forge-ui.js` (`window.TowerForgeUI`) | Tower Forge's schema-driven editing UI, profile canvas, spec normalize/Code-dialog helpers, and the mutate/crossover/MAP-Elites variation math. | World Scene Next's Tower panel, `world/forges/tower-forge/` |
| `../../../shared/engine/city/city-gen-ui.js` (`window.CityGenUI`) | Round City Generator's piece-sprite sheet, Rules/grammar explainer, and a Naqsh pattern editor (reusing `tower-forge-ui.js`'s form builder). | World Scene Next's City panel only (not yet wired back into Round City Generator) |
| `../../../shared/engine/creature-arch.js` (`window.CreatureArch`) | The creature-parts-sheet architecture generator — see below. | World Scene Next only |
| `../../../shared/engine/naqsh-pattern-engine.js` (`window.NAQSH`) | Parametric Islamic ornament generators, for the City Patterns tab and tower tier surface patterns. | Both builds |
| `../../../shared/engine/rng.js` (`window.RNG`) | `mulberry32`/`xmur3` seeded RNG. | World Scene Next |
| `../../../shared/data/creature-parts.json` | 394 hand-drawn SVG parts across 31 species (upgraded 2026-11-01 from a 347-part strict subset, to match `Spire Forge (2)`'s set — see "Spire Forge ornament import" below), each tagged `{id, species, side, w, h, ox, oy, bw, tw, defs, svg}` plus an architectural role. | `creature-arch.js` |

## Architecture — who depends on what (World Scene Next)

```
shared/engine/ecology/ecology-sim.js + ecology-species.js ── the fish, unmodified, driving its own WebGL2 render
                                                (Cybernetic Ecology's own shaders, copied in)

shared/engine/city/city-wfc.js ── buildPlacedCity() ── rebuildCityCreatureGeometry() ── shared/engine/city/creature-city.js
                                              (CreatureCity.build() → BOTH the depth occluder AND
                                               the glowing Block Forge wireframe, from one call;
                                               creature-city.js itself calls creature-spire.js for
                                               every round building and creature-arch.js for parts)

shared/engine/tower/tower-presets.js ── buildPlacedTower() ──┬── shared/engine/tower/tower-engine-gl2.js (invisible occluder)
                                                  └── shared/engine/creature-arch.js (glowing body + per-tier
                                                                               ornament bands)

shared/engine/tower/tower-forge-ui.js ── Tower panel (Edit/Variations/Atlas)
shared/engine/city/city-gen-ui.js     ── City panel (Pieces/Rules/Patterns) — still reads shared/engine/city/city-wfc.js's
                                                                   wfc result directly, unaffected
                                                                   by the city-mesh-gl2.js → 
                                                                   creature-city.js swap above

EcologySim.setVortices() ←── refreshVortices() ←── placedTowers (real simulation coupling, not a
                                                     rendering-only nudge)
```

## Rendering: two layers per object

Both city buildings and placed towers are built twice: a "real" geometry pass that exists purely to
write correct depth (drawn with one fixed near-black tint, `TOWER_OCCLUDER_TINT` / `CITY_OCCLUDER_MAT`,
never lit, so a fish or a nearer building's wireframe correctly disappears behind one that's actually
in front of it), and a glowing `gl.LINES` pass that's the thing actually visible.

For towers, that's still `tower-engine-gl2.js` (occluder) + `creature-arch.js`'s `standElevation()`/
`wrapOnSurface()` (glowing body + per-tier ornament bands), unchanged. For the city, both passes now
come from ONE call to `creature-city.js`'s `CreatureCity.build(wfc, seed, opts)` (2026-11-02,
replacing `city-mesh-gl2.js` for the occluder and this file's own since-removed
`buildCreatureCityLines()` for the wireframe) — its `occluder` field is the depth-only mesh, its
`groups` field is the instanced wireframe, and because both come from the exact same Block Forge
block/tower placements, they're guaranteed to line up (a building's hidden silhouette is built from
its own blocks, not a separately-sized generic shape). See `rebuildCityCreatureGeometry()`.

This two-layer split is why the Patterns tab's chosen Naqsh pattern can't just paint a building
surface the way it does in Round City Generator — there's no textured, lit surface left to paint.
It instead gets its own dedicated flat ground disc (`buildCityGroundDisc()`), the one real textured
draw call in the scene, built once per city and re-textured whenever the Patterns editor changes.

**Towers' occluder shell is now a light green glass shader, not invisible (2026-11-01).** It was
originally drawn fully opaque near-black (`TOWER_OCCLUDER_TINT`, `towerProg`/`TOWER_FS` — still used
unchanged by city buildings and the Tower panel's thumbnail renderer) purely so fish/nearer buildings
got correct depth occlusion, with the creature-line wireframe doing all the visible work.
`drawTowers()` now draws it through a dedicated `towerGlassProg` (`TOWER_GLASS_FS`, reusing
`TOWER_VS`'s vertex stage/attribute layout so the same VAOs work with either program) instead — a
translucent `TOWER_GLASS_TINT`/`TOWER_GLASS_ALPHA` green fill, bright at grazing angles via a fresnel
term (`pow(1-dot(N,V), 4.0)`) and broken up by a slow-drifting value-noise sampled in world space
(`noise3()`, driven by `uTime`) so it reads as an uneven, faintly foggy glass volume instead of a
flat tint — under the wireframe, while still writing full opaque depth (`gl.depthMask` stays true;
blending only changes the colour channel), so occlusion is unaffected. Fresnel deliberately only
brightens colour, never alpha: an earlier version added it to alpha too, and overlapping thin shells
(tiers, ribs, crown lattice) compounded that into a near-opaque white "frosted bulb" through plain
alpha-blend overdraw — tuning note for next time this gets touched. `TOWER_GLASS_TINT`'s green
channel is pushed above 1.0 deliberately: the shader multiplies `uTint` by each part's own baked
material colour, and the Spire Forge presets' shared `look` palette (body/dark are already
near-black teal) would otherwise stay dark instead of reading as light green. City buildings keep
the original near-black `towerProg` occluder unchanged — this only applies to towers.

## Coordinate conventions

Column-major 4×4 matrices throughout (`M4.*`, matches `gl.uniformMatrix4fv`'s own expectation).
Tank space uses X/Y as the horizontal plane and Z as *depth toward the camera* — smaller Z is
closer/higher, not Three.js's Y-up. City and tower local geometry (Y-up, built by their respective
engines) gets remapped into this convention by each object's own `model` matrix: local Y (height)
maps to a *decreasing* world Z. `buildPlacedTower()`'s and `buildPlacedCity()`'s model-matrix
comments spell out the exact column layout if you need to invert one (the selection picker's cell
lookup does exactly this — see below).

## Selection & picking

No raycasting engine. Towers and fish use screen-space-nearest tests against points already
projected by `hudProject()` (the same projection the threat HUD uses) — a tower is a line segment
from its projected base to its projected tip, a fish is `hudRect()`'s existing on-screen bounding
box. City cells use an exact closed-form lookup instead: unproject the click to the city's ground
plane (`screenToTank()`), invert the city's `model` matrix algebraically (it's a fixed
scale+axis-swap+translate, not a general matrix, so this is a few divisions, not a real 4×4
inverse) to get local polar coordinates, then linear-scan `wfc.cells` for the one whose `r0/r1/a0/
a1` wedge contains that point — cells already carry these bounds for the WFC solver itself, so no
new spatial index was needed. Selection highlight reuses the same glowing-line draw path as
everything else (a ring for a tower, a sector outline for a cell); a selected fish reuses the
existing `.hud-box` threat-HUD element instead, styled differently, independent of the HUD's own
on/off toggle since it's deliberate selection feedback, not ambient debug info.

The Inspector panel lives outside `.dock` on purpose — `.dock` is mode-switched (Eco/City/Tower),
so anything inside it would disappear the moment the rail mode changes, which is wrong for a
cross-cutting "what did I just click" panel.

## Growth reveal

`CityWFC.generate()`'s `order` array (solve sequence) is used directly: each creature-line instance
group's matrices are sorted by its cell's rank in that order at build time, so "how many of this
group are revealed by now" is a prefix count against a per-frame elapsed-cells number — no shader
changes, no per-frame buffer rebuild, just a smaller `instCount` passed to
`gl.drawArraysInstanced()`. `cityRevealStart`/`cityRevealSpeed` drive the elapsed calculation.
Defaults to "already finished" on first page load (so there's no surprise slow build-in the first
time you open the tool); "New World" and "Replay collapse" explicitly start it.

## Terrain/city coordination

The seabed relief (`regenTerrain()`) is seeded noise with no inherent awareness of the city, so an
early version could place a terrain peak directly under it, reading as poking up through the
buildings. `terrainRadialMask()` flattens the normalized height field toward 0 (the lowest contour
level) within the city's actual footprint radius — always exactly `0.4 × tankW()`, derived from how
`placeTowersForCity()` scales `CityWFC`'s own outer ring radius — with a smoothstep transition band
before full relief resumes outside it.

## Spire Forge ornament import (2026-11-01)

`Spire Forge (2)/index.html` (a Spire Forge prototype build, additive-only vs. the original — a "To
Tower Forge" button and nothing else) can export a hand-authored 2D tower design as a full Tower
Forge spec. Its bridge function computes, per tier, the *exact* part id and placement count/size it
used for that tier's bays/front-window/pilasters/cornice frieze (base and drum tiers) or ribs+frieze
(shaft tiers), stored on `tier.orn`. `CreatureArch.elevFromOrn(orn, H)` consumes this directly —
resolving each id through `CreatureArch.byId` and placing real copies by the given count/pixel size,
no grammar or randomness involved — returning the same `{E, top}` shape `elevHall()`/`elevTower()`
do, so `wrapOnSurface()` treats it identically. `buildTowerCreatureOrnament()` picks `elevFromOrn()`
over the generic grammar-driven `elevHall()` path for any tier whose spec carries `orn`; towers from
presets, mutations, or Atlas evolution have no `orn` and keep using the generic path unchanged.
`TowerForgeUI.normalize()` preserves `orn`/`spire`/`source` through the Code dialog round-trip so a
pasted bridge spec doesn't lose this on "Rebuild from this".

**The city's own towers now come from this set.** `shared/engine/tower/tower-presets.js` ships 8 pregenerated
Spire Forge exports (2 seeds × lighthouse/spire/hive/shrine — `spireLighthouse1/2`, `spireSpire1/2`,
`spireHive1/2`, `spireShrine1/2`), each already normalized and carrying real per-tier `orn`.
`placeTowersForCity()` restricts its roster to `TowerPresets` entries whose spec has
`source.from === 'Spire Forge'` (falling back to every preset if that subset is ever empty) — so
"New World" always builds the hub landmark and ring towers from the exact-fidelity path, not the
generic grammar band. The original 14 hand-tuned presets stay in `TowerPresets` unchanged (still
reachable from the Tower panel's "Load preset..." dropdown for manual editing, and still what
standalone `world/forges/tower-forge/Tower Forge.html` uses) — they're just no longer auto-selected for a
generated city.

**Towers are scaled to a fraction of city size, not a flat multiplier (2026-11-01).** The 8 imports
vary hugely in local tier-height sum (a `spire` preset vs. a squat `hive`), so a single scale
constant made some read far taller than the city itself. `placeTowersForCity()` now builds each
chosen spec once just to read `built.top` (`towerScaleForHeight()`), then derives a scale so its
real world height lands at a fraction of the city's footprint diameter
(`2 * CITY_FOOTPRINT_FRAC * tankW()`) — the hub landmark capped at exactly 25% of that diameter,
ring towers at 50–85% of the hub's height for some variety.

## Camera: rotate vs. pan (2026-11-01)

Plain drag on the canvas turns the Camera tab's Tilt/Turn sliders (rotate around the tank centre).
Shift-drag instead offsets `camPan` — a persistent tank-space `[x, y, z]` added to
`updateCamera()`'s default view centre — without touching those sliders: horizontal drag moves
sideways along the camera's current "right" vector (so it stays lateral at any yaw), vertical drag
moves along tank Z directly (real vertical movement, not ground-plane forward/back — tank Z *is*
the vertical axis in this build's convention, smaller Z higher/closer to camera). Both read screen
pixels against the camera's actual current distance and half-FOV, so a pixel of drag always moves
the same amount regardless of zoom. The "Top" view preset and a new "Re-centre" button
(Camera tab) reset `camPan` to `[0,0,0]`; nothing else does, so a pan persists across rotates/zooms
until explicitly cleared. Only active in Top/Angled (shift-drag clears `sceneFocus` first, since a
locked Fit-view/Frame target would otherwise keep overriding the view centre every frame).

## Block Forge city rebuild (2026-11-02)

The city's visible identity and occluder both switched from `city-mesh-gl2.js` + this file's own
`buildCreatureCityLines()` to `shared/engine/city/creature-city.js`'s `CreatureCity.build(wfc, seed, opts)` —
built in a separate session/context (not this one) and handed off as `creature-city.js` plus a
dependency, `shared/engine/tower/creature-spire.js`; both files, and the module header comments inside them,
are the authoritative description of what they do. In short: the WFC still decides layout (rings,
zones, per-cell piece, street-facing sides, stacked storeys); `creature-city.js` only decides what
gets built there — Block Forge blocks (bays × floors + cornice) for courtyard buildings/corner
lots/the wall, with street faces fully dressed and back faces kept quiet; a Block Forge crown for
roofs/domes/windcatchers; small `creature-spire.js` towers for every round building (minarets,
bastions, gate pylons, cisterns, pavilions, masjid minarets); kerb lines for streets/canals, standing
arches for arcades, bead rings for fountains, spire-part "trees" for orchards. Every district (zone)
gets one consistent style (bay width, cornice, parts kit, massing rule), built once per distinct
variant and instanced — same instancing idea `buildCreatureCityLines()` already used, just with a
richer, more specific vocabulary per building kind instead of one generic `elevTower`/`elevHall` per
WFC tile kind. `CreatureCity.build()`'s own `occluder` and `groups` outputs are both in **city-local**
space (the WFC's own frame); `rebuildCityCreatureGeometry()` is the one place that multiplies both by
`lastCityModel`, matching the contract `creature-city.js`'s header comment spells out.

**Files moved, one real bug fixed along the way.** `creature-city.js` and `creature-spire.js` arrived
as loose files (one at the repo root, one only in Downloads — see memory for the full provenance
trail); both now live in `shared/`, matching every other reusable module in this repo, and are loaded
right after `creature-arch.js` (`creature-spire.js` needs it ready; `creature-city.js` needs both it
and `city-wfc.js`). While wiring this in, `uploadLinePart()`/`uploadLineInstanceGroup()` turned out to
read `part.color` (singular) while `creature-arch.js`'s `standElevation()`/`wrapOnSurface()` — and
`creature-city.js`'s own `Geo.done()` — have always returned `.colors` (plural): a real, pre-existing
`GL_INVALID_VALUE` on every city-building color-buffer upload (confirmed with an isolated
`gl.getError()` check), silently leaving every city building's line color unset. Both functions now
accept `.colors || .color`. This was the pre-existing OLD Persian city's bug too, not something this
rebuild introduced — it was just never visually obvious enough to notice before (the near-black
occluder still gave buildings *some* silhouette), and became impossible to miss once fixed (city
buildings went from a flat pale grid to genuinely glowing, habitat-tinted wireframe overnight).

**Performance**: a full city builds in ~150ms here (`rebuildCityCreatureGeometry()` timed directly)
and draws smoothly (~39fps with the full scene — ecology sim, bloom, towers, city all active). The
module's own header mentions `opts.detail` (default `0.02`, city units) as the knob to raise if a
machine needs to thin the line count further — not currently wired to any UI control, passed through
`rebuildCityCreatureGeometry()`'s `opts` object if ever needed.

**City lines dimmed to faint white (2026-11-02, same day).** Once the color-buffer bug above was
fixed, the colorful per-district `CREATURE_ZONE_GLOW` hues — hundreds of overlapping, additively-
blended line segments per building, stacked city-wide — read as busy/overexposed rather than
architectural (the same overdraw lesson as `TOWER_GLASS_FS`'s fresnel/alpha tuning note). `zoneColor`
in `rebuildCityCreatureGeometry()` now always returns one dim, desaturated white
(`CREATURE_CITY_FAINT_WHITE`) regardless of zone or the "Habitat tint" toggle's state — that toggle
is currently inert (still clickable, no visible effect) rather than removed.

**City mesh removed entirely — wireframe only (2026-11-02, same day).** User asked to "remove the
meshes for the city, just show the svg." `rebuildCityCreatureGeometry()` no longer uploads
`CreatureCity.build()`'s `occluder` field at all — `cityOccluderPart` stays permanently `null`, and
`drawCity()` (which already guarded on it) becomes a no-op. The city now has **no solid geometry
whatsoever**, only the glowing wireframe `cityCreatureLineGroups` — a see-through blueprint look.
**Trade-off, not fixed**: nothing writes real depth for the city any more, so fish can now be seen
swimming through building volumes instead of correctly disappearing behind them (the whole reason the
occluder existed in the first place). Towers keep their own solid glass-shader mesh
(`TOWER_GLASS_FS`) untouched — this change is city-only.

**City color/opacity tuned twice more (2026-11-02, same day).** `drawCreatureLines()`'s city-group
draw used a flat `uAlpha` of `1.0` outside the glow pass; first set to `CITY_LINE_OPACITY = 0.6`
(a dedicated constant, city-only — towers' own creature-line draw stays at `1.0`), then to `0.3`
along with `CREATURE_CITY_FAINT_WHITE` becoming pure white (`[1,1,1]`, was a desaturated grey-blue)
— "make the city svg white 0.3". Both constants are the single place to retune this again.

**Known limitation carried over from the handoff notes** (not fixed in this pass): buildings sit as
plain rectangles inside their wedge-shaped WFC cells, so there are small gaps between neighbours —
intentional/acceptable for the Block Forge look per the original notes, flagged here in case a
future pass wants blocks that fill the wedge instead. Also: the centre tower is still a
`TowerPresets` entry (now one of the Spire Forge imports — see above), not built through
`creature-spire.js`/the city's own much-smaller unit scale; matching those two scales is unstarted.

## City gen responds to tower placement (2026-11-02)

Ring towers used to sit at a free-floating `(radius, random angle)` with zero awareness of the WFC
cell layout underneath — a landmark tower could stand in the middle of a Block Forge building's
footprint. `placeTowersForCity()` now snaps each ring tower to the centre of a real WFC cell at
`LANDMARK_RING` (ring 4, the housing district — chosen to match the old fixed radius), and adds that
cell's id to `reservedCityCellIds`. `rebuildCityCreatureGeometry()` passes that set to
`CreatureCity.build()` as `opts.skipCells` (a small, additive one-line change in `creature-city.js`
itself — `if (opts.skipCells && opts.skipCells.has(cell.id)) continue;`), so the city generator
leaves those cells completely unbuilt instead of also placing a Block Forge structure where a tower
already stands. The hub landmark needs no such reservation — it sits on the ring-0 core cell, which
`CreatureCity.build()` already always skips (`skipCore`), the original "the hub stands a real tower
instead" design from the start of this build.

Ordering matters here: `buildPlacedCity()` now places towers (setting `reservedCityCellIds` as a
side effect) BEFORE calling `rebuildCityCreatureGeometry()`, and the two previously-separate calls
(`placeTowersForCity()` then `buildPlacedCity()`) were merged into one — `buildPlacedCity(seed,
ringCount)` now owns the whole sequence (generate WFC once, place towers against it, build city
geometry against the same WFC + the towers' reserved cells). Both call sites (boot, "New World")
simplified to a single call. Verified in-browser: a visible gap in the building ring exactly where
each tower stands, at both the default and max tower counts (6), zero cell-id collisions, zero
console errors across regenerations.

## Towers are WFC-native, not post-hoc reserved (2026-11-02, later same day)

The previous pass ("City gen responds to tower placement") snapped ring towers to a real WFC cell
but still only reserved it *after* the WFC had already solved (`opts.skipCells`, telling
`creature-city.js` to build nothing there). The user's own framing for the proper fix: "towers
should be treated as occupying tiles that WFC has to build around." Implemented:

- `shared/engine/city/city-wfc.js` gained a new tile, `'belvedere'` (housing zone, `['b','b','b','b']` sockets
  — identical profile to `'house'`, so it slots into the fabric exactly as safely — weight `0`, so
  the solver never picks it on its own, only when a cell's domain is explicitly pinned to it).
- `solve()` already supported a custom `opts.domain` (used internally by `prune()`'s second pass);
  `generate()` now forwards it too (`domain: opts.domain`), a one-line addition, so a caller can pin
  specific cells before the FIRST solve pass, not just the rescue pass.
- World Scene Next's `buildPlacedCity()` now picks `ringCount` cells on `LANDMARK_RING` and builds a
  `domain` function — pinned cells get `[belvedereIdx]`, everything else falls through to
  `CityWFC.initialDomain()` (now also exported) unchanged — **before** calling `CityWFC.generate()`.
  The solver then collapses every neighbouring street/building around a real, grammar-legal "closed"
  tile, the same way it already handles an ordinary house, instead of a tower landing on whatever a
  normal solve happened to produce there.
- `creature-city.js`'s `opts.skipCells` was removed — redundant now, since `'belvedere'` simply
  isn't handled by any case in its per-cell switch and has no passable socket, so it renders nothing
  on its own with zero special-casing needed.

Verified in-browser: reserved cells resolve to `belvedere` every time (checked directly against
`lastWfc.result`), five consecutive "New World" regenerations at the max tower count (6) all solved
in a single attempt with zero contradictions from the pinning, and `world/legacy/city-gen/Round City
Generator.html` (the other consumer of this shared solver) is unaffected — `belvedere`'s zero weight
means it's invisible to any caller that doesn't explicitly pin a cell to it.

## Architecture-research pass: muqarnas alternation, taper tuning, Gothic template, buttresses, twin minarets (2026-11-02, later same day)

Two background research forks (general city/tower design improvements, and a Gothic/cathedral-
focused follow-up) reported back; the user picked "implement all of it" for that research menu
specifically, as distinct from the larger City-Generator/Tower-Forge-parity plan also pending for
this tool (disambiguated via `AskUserQuestion` since one "implement all of it" genuinely fit both).
All six landed in `shared/engine/creature-arch.js` and `shared/engine/city/creature-city.js`:

- **Muqarnas-style bay-kit alternation**: `composeBand`'s per-position rule (center/end/side) used
  to be ONE rule shared by every bay in that position class across a whole band-grammar's lifetime —
  every "side" bay in a row looked identical. `makeBandGrammar` now builds each non-pilaster
  `BAND_RULE_KEYS` entry as an array of `BAY_KIT_COUNT = 3` independently-rolled variants
  (`bandRuleVariants()`); `composeBand`'s `ruleFor(pos, i)` cycles through the array by bay index.
  `mutateBandGrammar`'s reroll operator and the end-tied-to-side "control grammar" pass both updated
  to produce/consume the same array shape.
- **Historically-tuned taper ratios**: `templateParams()`'s base-terrace `step` (how much each
  terrace narrows) tightened for lighthouse/spire/shrine — real stepped minarets/ziggurats taper in
  sharper, more deliberate stages than a smooth gradual narrowing. `balc.taper` widened slightly for
  lighthouse/spire to match. Pure constant retuning.
- **Per-balcony frieze/bead alternation**: `buildTemplate`'s ring-balcony loop (up to 6 balconies on
  'spire'/'gothic') now cycles 3 looks by `i % 3` — frieze density/scale and bead count both vary —
  instead of stamping the exact same balcony ring at every height.
- **Gothic spire, a 5th `templateParams()` entry**: `CreatureArch.TEMPLATE_NAMES` is now
  `['lighthouse', 'spire', 'hive', 'shrine', 'gothic']`. Steepest base taper and the tallest/thinnest
  always-ribbed shaft of the five (ribs read as blind arcading/tracery, reusing `elevTower`'s
  existing shaft-rib mechanism unchanged); crown `R: 0` — no halo/bead ring at all, the silhouette is
  carried entirely by the spire plus new "crocket" accents (reuses the `hook` role) marching up both
  of the spire's edges in `buildTemplate`'s crown section. World Scene Next's `pickCreatureTemplate()`
  now does a 3-way lighthouse/spire/gothic pick for every tall-kind crown — city buildings AND the
  main placed towers (via `buildTowerCreatureBody`) both pick up Gothic crowns automatically.
- **Flying buttresses on tall city walls**: the `buttress` role (classified by `creature-arch.js`'s
  `archRoles()` since its original port but never actually placed by anything) is now picked per
  zone style in `creature-city.js` (`pools()`/`makeStyle()` gained a `butt` pick) and drawn as an
  outward-angled pair at every other internal bay boundary, on street-facing facades of 2+ floor hall
  buildings only (`facade()`'s new block) — madrasa/caravanserai/bayt-al-hikma/bimaristan/hammam get
  the silhouette break, single-floor masjid prayer halls don't.
- **Twin flanking minarets for masjid**: the `gate` case already placed two tower instances flanking
  the opening (`for (const s of [-1, 1]) tower(...)`); the same pattern now applies to `masjid`
  (previously a single off-center minaret) — one geometry key (`'masjid-minaret'`), two matrices.

Verified: `node --check` on both shared files and the extracted inline script; a direct test built
all 5 templates with no exceptions; `CreatureCity.build()` on a live WFC confirmed the masjid tower
group resolves to exactly 2 instance matrices and at least one zone style picked a `butt` part;
re-verified visually through the normal "New World" UI flow (city + towers render, zero console
errors). One verification-only gotcha surfaced, not a code bug: calling `CreatureCity.build()` /
`buildPlacedCity()` directly via injected JS, bypassing the page's own boot sequence, left the main
canvas rendering solid black afterward even though the returned data was correct — a reload (or
driving the same action through the real "New World" button) rendered normally, so this is an
artifact of skipping init order during ad-hoc testing, not a regression.

## Parity-plan follow-through: audit + remaining gaps closed (2026-11-03)

User said "do all of it" against a 4-item list: (1) the City-Generator/Tower-Forge parity plan,
(2) an Atlas bug hit during the previous pass's verification, (3) one lower-priority research item
("module-derived proportions"), (4) the README's own "known gaps" list below. Before writing code,
a read-only audit fork confirmed most of item 1 was **already built earlier in this same long
session, outside this conversation's visible context** — Tower Edit/Variations/Atlas mode-switch,
Code dialog, Fit view, and City City/Pieces/Rules/Patterns sub-tabs (Growth/Layers/Districts live
*inside* the City sub-tab, not as separate top-level tabs) were all real and working. That narrowed
the actual remaining work to items 2-4 plus one real bug the audit traced precisely:

- **Atlas/Variations crash, root cause fixed**: `seedAtlas`/`makeVariations`/the profile editor's
  `getSpec` hook all read `placedTowers[curTowerIdx].spec` unconditionally, called eagerly at boot.
  `buildPlacedCity()` silently left `placedTowers` empty whenever `CityWFC.generate()` failed (the
  reserved-cell belvedere pinning, see above, can make the WFC unsolvable) — the audit *measured*
  this directly against the live solver: ringCount=3 (boot default) ~28.5% failure, ringCount=6
  (max) ~48.5%, so this wasn't rare. Root-cause fix: `buildPlacedCity` now retries up to
  `RESERVE_ATTEMPTS = 6` times, re-rolling WHICH cells get reserved each attempt (not just the
  solver's own internal seed, which `CityWFC.generate()` already retried 20× without ever escaping
  an unsolvable reservation) — drops the failure rate to roughly `0.285^6`. Defensive `placedTowers[curTowerIdx] && ...` guards were also added at all three call sites as a second line of defense
  in case every attempt still fails.
- **Module-derived proportions**: `creature-arch.js`'s `composeBand()` used to size its cornice
  height (`H * 0.24`, flat) and pilaster width (purely `zoneH`-driven) independently of the bay
  module — a classical order expresses entablature height and column diameter as fractions of the
  intercolumniation instead. Bay-splitting (`bw`, the module width) now happens before cornice
  sizing; cornice height is clamped into `[bw*0.3, bw*0.95]`, pilaster scale additionally capped to
  `(bw*0.26)/pilaster.w` — a band with wide bays now reads a proportionally taller/stouter
  cornice/pilaster, a narrow-bay band a shorter/slenderer one.
- **`mutateBandGrammar` wired to UI**: new "Mutate style" button in the Tower Edit tab. Nudges the
  selected tower's ornament/body band-grammars to a "nearby variant" (reroll one bay rule, or nudge
  bay width) WITHOUT touching the tower's shape/tiers/crown, unlike mutating the whole spec
  (Variations tab). Required `buildTowerCreatureOrnament`/`buildTowerCreatureBody` to accept an
  optional `grammarOverride` and stash whichever grammar they used as `.grammar` on the returned
  part (so a later mutate can read it back); the resulting override persists on the tower entry
  (`styleOverride`) so subsequent field edits (`rebuildPlacedTowerAt`) don't revert the look.
- **Walkers layer, implemented**: new City tab > Layers > "Walkers" toggle. Small agents glide along
  the WFC's real street/avenue cells (`buildCityWalkerGraph`: cells grouped by ring, angularly
  sorted), stepping to the next street cell on reaching an edge, occasionally hopping to a
  radially-adjacent ring's street cell at a similar angle ("avenue crossing"). Drawn as tiny
  tangential tick marks, colored by the district they're currently passing through when Habitat
  tint is on. CPU-recomputed every frame into one small persistent `DYNAMIC_DRAW` buffer
  (`gl.bufferSubData`), not a VAO rebuilt per frame. (Amusing footnote: the standalone
  `world/legacy/city-gen/Round City Generator.html` already has its own, independently-built "Walkers"
  layer toggle with nearly the same one-line description — convergent design on the same WFC city
  system, not a conflict; the two are separate, unrelated implementations.)
- **Growth reveal extended to towers** (was city-buildings-only). `placeTowersForCity` now assigns
  each tower a `revealRank`: the hub gets `0` (appears first — "solved outward from the Great
  Mosque," matching Growth's own framing), ring towers get their reserved cell's real WFC
  solve-order rank (via `wfc.order`). `drawCreatureLines`'s tower loop gates on the same
  `cityRevealStart`/`cityRevealSpeed` clock `cityRevealCount` already uses for buildings.
  `rebuildPlacedTowerAt` and `mutateTowerStyle` (above) both carry `revealRank` forward across edits.
- **`city-gen-ui.js` wired back into `world/legacy/city-gen/Round City Generator.html`**: scoped to the
  three PURE canvas-drawing primitives it duplicated (`drawSprite`/`drawModule`/`drawOrient`, now
  one-line wrappers calling `CityGenUI.drawTileSprite`/`drawModuleSprite`/`drawOrientKey`) after
  confirming every value these depend on (`GROUND`, `ZONE_COL`, `STREETISH`, `VLABEL`, `hexCss`,
  `cssVar`) is byte-identical between the two files. Deliberately did NOT touch `buildSheet`/
  `buildStatic`/`highlightKind`: `buildStatic` populates this tool's own pre-existing `#legend`/
  `#labels`/`#heights` DOM (flat children), while `CityGenUI.buildDistrictsLegend`/`buildRulesPanel`
  build a different DOM shape (`.legend-row`-wrapped, single-container) for a host with no prior
  layout of its own — swapping those would have required changing this tool's CSS/layout, which
  wasn't asked for. `highlightKind`'s own toggle-off-on-second-click aria-pressed semantics also
  don't match `CityGenUI.buildPieceSheet`'s simpler always-select-on-click handler, so `buildSheet`
  stays local too. Verified: sprite sheet renders identically (15 DOM children incl. zone headers),
  orientation key draws real pixels, clicking a sprite still correctly isolates that piece in the
  live 3D city, zero console errors.
- **City-cell picking, ring-bucket index**: `pickCellAt` used to linearly scan all ~280 `wfc.cells`
  per click. New `cellsByRing` (`Map<ringIndex, cell[]>`, built once per city regen) +
  `ringIndexForRadius()` (linear scan over the ~9 `CityWFC.RADII` boundaries) narrow the scan to
  just the one ring a click's radius falls in. Verified byte-for-byte equivalent to the old
  brute-force scan across 2000 random points (0 mismatches) before considering it done.

Hit one real bug while implementing this batch, since fixed: `cellsByRing`/`buildCellsByRing`/
`ringIndexForRadius` were first written right next to `pickCellAt` itself, which lives much later in
the script than `buildPlacedCity`'s own boot-time call — a `let`-declared binding referenced before
its declaration executes throws `ReferenceError: Cannot access 'X' before initialization` (the TDZ),
not a silent `undefined`. Moved the whole block up next to `buildCityWalkerGraph` (also called from
`buildPlacedCity`), well before the boot call. Also caught in the same testing pass: `mutateTowerStyle`
didn't carry `revealRank` forward across a style mutation the way `rebuildPlacedTowerAt` does — fixed
to match.

## Ring towers overlapping their neighbours, fixed (2026-11-03, later same day)

User flagged a screenshot: a ring tower's dome had small boxy shapes evenly spaced around its
equator, each connected by a thin stalk — "the wfc doesnt build around the other towers." Traced,
not guessed: directly measured a ring tower's real rendered footprint DIAMETER against its single
reserved `LANDMARK_RING` cell's own size on the live scene — **667 tank units across vs. the cell's
own ~300×289** — more than double. The boxy shapes were ordinary neighbouring buildings' roofs/
corners, built flush to the (far too small) reservation boundary as always, visibly poking into a
tower more than twice that reservation's size. Root cause: ring towers are picked from 8 very
differently-proportioned Spire Forge presets (lighthouse/spire/hive/shrine × 2), each scaled to hit
the SAME target height (`towerScaleForHeight`) — a 'shrine'/'hive' preset (explicitly "widest
base"/"single squat wide terrace" per `creature-arch.js`'s own template docs, see the
muqarnas/taper/Gothic pass above) scaled to a tall target height comes out dramatically WIDER than a
thin 'spire' preset at the same height, and the reservation was always exactly one cell regardless.

Fixed in `buildPlacedCity`: ring tower preset/seed/scale are now precomputed BEFORE any cell gets
reserved (previously this picking happened in `placeTowersForCity`, after the WFC had already
solved — too late to size the reservation by it). Each tower's scale is now capped by a RADIAL
footprint budget (`cellDTank * 0.48`, roughly half one `LANDMARK_RING` cell's own depth) in addition
to the height target — reserving more cells WIDE can't help the radial direction (a ring's depth is
fixed), so this is the hard guarantee against radial overlap into the ring inside/outside it. The
reservation itself can also widen to up to `MAX_TOWER_CELLS = 3` angularly-adjacent cells (still
pinned to `belvedere`, still pre-solve) when even the now-capped footprint's angular extent needs
more than one cell's width — in the current city proportions the radial cap alone already keeps
every footprint under a single cell's width too, so this branch is a correctness safety net rather
than something that currently fires, kept for when ring-cell proportions or the budget constant
change. `placeTowersForCity` now reads the precomputed `reservedTowerClusters` (`{ids, plan}` per
tower) instead of re-deriving picks, and positions each tower at its cluster's mean angle (handles
the 0/2π wraparound correctly via a summed unit vector) rather than a single cell's centre.

Verified: direct footprint-vs-budget check across 10 random (seed, ringCount) trials, zero
violations (footprint always ≤ budget, by construction); 20 trials at max tower count (6) with the
now-larger reservations, zero WFC generation failures (the `RESERVE_ATTEMPTS` retry from the earlier
pass still covers this comfortably); re-verified visually — a ring tower's dome no longer shows
neighbouring buildings' corners poking into it; zero console errors throughout.

## Modular wall grammar: "structures around structures" (2026-11-03, later still)

User's critique, after a Townscaper/Bad North design discussion: our WFC grammar never actually
composed a STRUCTURE from modular pieces — every cell just resolved to one whole pre-made block
(`house`, `madrasa`, `wall`, `gate`...). "We don't have walls and corners to form barriers, we
don't have grammar to create structures around structures." Correct: the existing outer city wall
was a fixed ring of whole-cell wall tiles, not an assemblable wall that could wrap around anything
else, and there was no courtyard or tower-perimeter concept at all.

Added `shared/engine/city/creature-city.js`'s `perimeterWall(rank, st, zone, loop, opts)`: given an arbitrary
closed loop of city-local `[x,z]` points, it walks the loop and places a **wall-run facade per
edge** (reusing `facade()`, so it reads as the same creature-parts architecture as every other
building, not a bare box outline), a **corner-post bastion** wherever the loop's direction turns
past `cornerThreshold` (default 24°, so a gently-curved ring doesn't get a post at every
subdivision vertex), and **gate openings** (`opts.gateEdges`: a Set of edge indices that skip the
wall run entirely, their two endpoints flanked by posts instead). This is the actual modular
grammar — wall-run + corner-post + gate-opening as independently reusable pieces — not a whole-cell
block. Wired into all three structures in one pass:

- **Outer city wall rebuild**: previously each ring-8 cell independently built its own thick wall
  box, overshooting its neighbours by 4% so they'd visually nearly touch. Now one continuous
  `perimeterWall` loop around the whole ring (subdivided 3x per cell for a smooth curve); 'gate'
  cells become real openings (flanking posts, no twin-pylon-plus-roof structure any more); 'tower'
  cells force a bastion at their span's centre via `opts.forceTowers` in addition to the wall
  continuing behind it.
- **Landmark tower defensive rings**: a host passes the same reserved cell-id clusters from the
  footprint-overlap fix (`reservedTowerClusters`) as `opts.towerClusters`; since a cluster is
  always angularly-adjacent same-ring cells, its boundary is just the union wedge's own outline (no
  general cell-by-cell boundary tracing needed) — a smooth ring with one gate facing the hub.
  Verified the ring sits at ~205-215 tank units from the tower centre, clear of the tower's own
  ~139-unit footprint radius (the radial cap from the earlier overlap fix).
- **Courtyard precinct walls**: madrasa/caravanserai/bayt-al-hikma (institutional, historically
  courtyard-centric building types) get a simple 4-corner rectangular wall 30% larger than the
  building's own footprint, gate on the street-facing side — an outer precinct wall, not a
  redundant second facade sitting on the building itself.

Verified: 12 random (seed, ringCount) trials building the full city + all three wall types with
zero exceptions; direct geometry-group inspection confirmed wall/post/bastion instance groups for
all three zones (bazaar-zone courtyards, wall-zone outer ring, housing-zone tower rings); visually
re-checked — the outer wall now reads as a continuous varied silhouette with regularly-spaced
bastion accents instead of a uniform repeated-box look; zero console errors throughout.

**Known limitation, not addressed**: `perimeterWall`'s wall-run orientation (`ry =
Math.atan2(dz, dx)`) isn't guaranteed to face its decorative front consistently outward vs. inward
across all three use sites (depends on each loop's winding order, not explicitly normalized) —
mostly invisible since walls are crenellated/near-symmetric, but worth checking if an obviously
one-sided wall-run glyph gets added later.

## Causeways + merged footprints: "connected buildings" (2026-11-03, later still)

User pushed back on the wall work with two annotated screenshots: one asked "does this look like
the WFC is working?" (plain, unannotated), the other had the same screenshot hand-marked with red
lines connecting the hub to each tower and small enclosures around them — pointing at two gaps the
wall work hadn't touched: **no distinct route from the hub to a landmark** (towers just sit among
ordinary houses with ordinary lanes, no privileged connection back to the centre), and **buildings
never actually touch their neighbours** (every lot isolated in the middle of its own cell).

- **Causeway**: `creature-city.js`'s new `causeway(rank, st, zone, fromR, toR, angle, spacing)` —
  a colonnaded processional path along a constant-angle ray from the hub's own edge
  (`CW.RADII[1]`) straight out to a landmark tower's defensive-ring gate, at the SAME angle the
  gate already sits at (so it arrives exactly there). Since both endpoints share one angle, this
  is a true straight line in Cartesian space even though it's expressed in polar terms. A thin
  glowing spine line plus evenly-spaced small posts, built the same "geometric overlay, not
  solver-aware" way `perimeterWall` already is — it doesn't know or care what street cells it
  crosses underneath. Called once per tower cluster, right after that cluster's own
  `perimeterWall`.
- **Footprint merging**: the Townscaper-inspired idea proposed earlier (session's design
  discussion) and left unbuilt until now. A new pre-pass, before the main per-cell loop: cells are
  grouped by ring, sorted by angle, and any angularly-adjacent pair resolving to the SAME
  mergeable building kind (house/caravanserai/madrasa/bayt-al-hikma/bimaristan/hammam) gets merged
  ~45% of the time into ONE wider box spanning both cells, via a synthetic frame centred on the
  pair's own midpoint (same "frame not tied to one real cell" trick as the outer-wall/tower-
  cluster/causeway passes) — reuses `building()`'s own box/facade/crown machinery unchanged, so a
  merged building looks exactly as dressed as a normal one, just wider. The main loop's own
  per-cell case checks `mergedCellIds` and skips a cell that was already consumed by a merge.
- **Tighter insets**: `FRAC` (how much of its own cell footprint a building fills) raised across
  the board (house/caravanserai 0.8→0.9, madrasa 0.78→0.88, bayt-al-hikma 0.74→0.84, bimaristan
  0.76→0.86, hammam 0.7→0.82) — roughly halves the gap between full-size neighbouring buildings
  (was ~40% combined margin, now ~20%), so buildings read as abutting a shared line instead of
  each floating alone in its own cell.

Verified: 12 random (seed, ringCount) trials building the full city with causeways + merging +
tighter insets, zero exceptions; causeway geometry groups confirmed present (44 across the 12
trials, consistent with ~1 per tower); merge-pair eligibility independently re-derived outside the
module (177 eligible same-kind adjacent pairs across 6 trial cities, ~30/city) confirming the 45%
merge rate has real opportunities to fire every city, not just occasionally; visual re-check showed
a faint spine line running from the hub toward a tower and some visibly wider merged footprints
among the regular ones, though at full city density individual causeways/merges are hard to pick
out by eye with certainty — the numeric checks are the reliable signal here, consistent with every
other geometry addition this session. Zero console errors throughout.

## Tower wall/causeway legibility pass (2026-11-03, later still)

User asked "can we build a wall around the towers" right after the above — a reasonable question,
since from a normal view the defensive ring/causeway genuinely don't read as a wall. Investigated
before changing anything: the geometry WAS already there and correctly positioned (`w|housing|...`,
`t|housing|wall-bastion`/`wall-post`, `causeway|housing|...` groups all confirmed present via direct
build-output inspection) — the issue was legibility, not a missing feature or a bug. Every city line
shares one uniform dim tint (`CREATURE_CITY_FAINT_WHITE`), so at the SAME height/weight as an
ordinary 1-2 floor house, a tower's defensive ring had nothing to make it read as a wall against the
surrounding density.

Fixed by leaning on silhouette instead of colour (colour isn't available without reopening the
overdraw-blowout problem the uniform-tint decision exists to avoid): tower defensive ring height
raised `FH*1.6` → `FH*2.8` (taller than anything else nearby) with `thick` bumped `0.12` → `0.22`;
causeway spine line weight `0.9` → `1.6` and its posts enlarged (`half`/`shaftPx` `14`/`36` →
`22`/`56`). Verified the new height value is actually live (rebuilt and measured the wall group's
geometry directly: key's embedded height field reads `1.40` = `FH*2.8`, max Y extent `1.52` after
the merlon crenellation strip, consistent). Zero console errors.

## Known gaps, not tackled in this pass

All five gaps previously logged here (`mutateBandGrammar` unwired, Walkers missing, Growth
reveal city-only, `city-gen-ui.js` not ported back, linear-scan picking) were closed in the
2026-11-03 pass above — see that section for what each fix actually did and its scope.
Remaining, genuinely still open:

- The Growth reveal still doesn't cover terrain/ambient layers (just city buildings + towers now)
  — no particular reason beyond not being asked for yet.
- `city-gen-ui.js`'s `buildSheet`/`buildStatic`/`highlightKind`-equivalent orchestration (as
  opposed to the pure drawing primitives, now shared) still isn't ported back into Round City
  Generator.html — would need either changing that tool's DOM/CSS to match `CityGenUI`'s
  `.legend-row` shape, or adding an alternate "flat children" mode to `buildDistrictsLegend`, and
  reconciling `highlightKind`'s toggle-off-on-second-click behavior with `buildPieceSheet`'s
  simpler handler. Out of scope for a behavior-preserving port.

## Walking creatures (2026-11-08)

Both scenes load `shared/engine/generators/creature-walk.js` and `shared/engine/ecology/ecology-walk.js`.
Species whose baked drawing has `…-leg-L/R` parts and that are walkers (`EcologyWalk.walkers`: the
crawlers by default, plus any species whose Forge rig has legs) plant their feet on the tank floor
and step as they move. The CPU keeps one `CreatureWalk` walker per creature; the vertex shader poses
each leg vertex by its femur/tibia/tarsus band.

- `World Scene.html`: spine rows are `24 + EcologyWalk.TEX_EXTRA` texels wide, the part texture has a
  fifth (leg) column, and `EcologyWalk.LEG_GLSL` runs before the rigid-part branch — the same wiring
  as `shared/engine/ecology/ecology-render.js` (Forge Ecology's WebGL mode).
- `route-scene.html`: a leg part's header is `2`, its three ops are the band transforms and the
  fourth holds the hip and leg axis; walk settings come from each species' Forge rig.
