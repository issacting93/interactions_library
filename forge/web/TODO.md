# Forge — integration gaps

Audit (2026-11-03) of what Forge actually reaches from each standalone tool it's
supposed to unify, vs. what those tools really have. Read-only findings, not yet fixed.

## Bugs (not scope gaps — these are wrong)

- **Species rail stage is misrouted.** `forge-shell.js`'s `STAGES` array points
  "Species" at `./attach.html`, not at Bestiary Forge. Inside an open world there is
  currently no way to reach Bestiary Forge at all — it's only reachable from the
  Worlds landing page's "Breed a species" card. Fix: restore the Species stage to
  link to `tools/bestiary-forge/`, and give Attach Points its own rail slot (or reach
  it only from Kit/Species, like `rig.html` already does via "Edit this species'
  attach points").
- **Bestiary Forge never writes to the world file.** Unlike Spire Forge and Sigil
  Forge (both got a "Save as prefab" button this session), `tools/bestiary-forge/`
  has zero `forge-world.js`/`ForgePrefab` references. Species bred there never reach
  the Shelf or the prefab system. Needs the same additive button/handler pattern
  used in `tools/spire-forge/index.html` and `tools/sigil-forge/index.html`.

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

`forge/web/city.html` genuinely reuses the real `shared/city/city-wfc.js` (WFC
placement + landmark tiles) — confirmed real reuse, not a reimplementation. But it
omits `shared/city/city-mesh-engine.js` and `naqsh-pattern-engine.js` entirely, so
Forge's City screen is a flat 2D plot map — no 3D rendering, no mashrabiya
window-screen generation that the standalone tool has.

## Cybernetic Ecology — mostly wired

`forge/web/ecology.html` loads the real `shared/ecology/ecology-species.js` +
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
- **One building recipe.** `shared/generators/forge-building.js`: a saved building's recipe is a
  Tower Forge spec carrying the Spire design as `spec.spire` (Spire Forge's existing export
  format). `SpireGenerator.toTowerSpec()` is a copy of Spire Forge's `toTowerForge()` (checked
  identical on 15 genomes); Bench's Tower now saves this format (`persist`) and reopens it
  (`restore`), so Bench, Spire Forge, the prefab dialog and later Tower Forge / World Scene all
  read the same object. Older saves (a bare genome, or a spec) still open.
- **The world bridge.** `forge/web/forge-bridge.js`, wired into Spire Forge: opened with
  `?world=&object=&return=` it loads that building, "Save to world" updates it (a new version),
  "Save as new" forks it, and a Forge bar links back. Every `world.put` is broadcast
  (`ForgeWorld.onChange`), so the Shelf, Bench and City refresh when a tool saves.
- **Ways in.** `ForgeWorld.editorsFor(record)` lists where an object can be edited. Used by the
  Shelf (links on each card), Bench ("Open in Spire Forge", `?object=` to reopen a saved object)
  and City (a placed building's "Edit in Spire Forge"; coming back reselects the plot).

Next: the same bridge in Sigil Forge (seal / alphabet / icon) and Tower Forge (spec; keep
`spec.spire`, set `source.editedIn`); then the Species hub (Bestiary saving bred layouts, Style
Lab overlays); then World Scene Next reading a saved city.
