# Video shoot checklist

Compiled 20 Nov 2026 from all four dev logs (Forge, City and World, Walkers, The Maw — 110 entries,
85 of them visual) against the live repo at `979baec`. Goal: one clip per distinct on-screen claim the
logs make. Captures land in `docs/dev-logs/media/video/` as `.mp4` (real motion/interaction) with
`.gif` only where a log entry is already illustrated that way and a drop-in replacement is wanted.

**Status key** — [HAVE]: an existing capture in `media/` already matches. [SHOT]: captured this pass.
[NEEDED]: not shot yet. [GONE]: feature no longer exists on `main`, don't plan around it.
[BRANCH]: exists only on an unmerged branch, needs checkout first.

**Setup key** — A: self-contained page, loads with no saved state. B: needs a saved Forge world
(a Tower/Koi/buildings already made) or specific app state. C: needs a branch checkout or historical
commit. D: needs hardware (webcam) or is otherwise special-cased.

Run the server from repo root first: `python3 -m http.server 8731` (already running, pid noted when
this was written: check `lsof -nP -iTCP:8731`). Capture scripts live in `tools/capture/`; `g-any.mjs`
and `g-walk.mjs` now also accept `.mp4` output, and `g-rt.mjs` is new — real-time recording (via
Playwright's native video capture) for anything too slow to drive on cap.mjs's fake clock.

---

## Forge log (2–8 Nov, container `574d1943…`)

| # | Claim | Page | Setup | Status |
|---|---|---|---|---|
| 2 | Home page (world/kit/lane-per-stage) + Bench building a Tower live | `world/forge/web/index.html`, `bench.html` | A/B | NEEDED |
| 4a | Attach points: drag joint markers onto a part | `world/forge/web/attach.html` | A | HAVE `p-attach.png` (still only — a drag clip is still NEEDED) |
| 4b | Rig: bones + swim/glide/turn/idle/startle clips on the Koi | `world/forge/web/rig.html` | B (saved Koi) | NEEDED |
| 4c | Rule sets: rules tested live across 6 seeds | `world/forge/web/rules.html` | A | HAVE `p-rules.png` (still only — live re-test clip still NEEDED) |
| 5 | Terrain + city placement with real saved buildings | `world/forge/web/city.html` | B (saved buildings) | NEEDED |
| 7 | Ecology tank before/after the water-shader opacity bug | `world/forge/web/ecology.html` | B | NEEDED (historical before state may need an old commit) |
| 8 | Click a building → selection highlights across City/Ecology/Lineage | `city.html`, `ecology.html`, `lineage.html` | B | NEEDED |
| 9 | Three re-skins in one day (Geist Mono → IM Fell/Plex → TAPE 08) | any page | C (checkout `58596d9`/`2ded1ba`/`b4eaa0d`) | NEEDED — low priority, historical |
| 10 | Kit/Bench relaid as track rows + signal chain | `kit.html`, `bench.html` | A/B | NEEDED |
| 11 | Forge Console component set (amber/green/red/cyan) | `shared/look/forge-ds/bloom-gallery.html` | A | SHOT `forge-console-components.mp4` |
| 13 | Ecology camera: drag-pan, scroll-zoom, Follow | `ecology.html` | B | NEEDED |
| 14 | Sci-fi Gallery — animating composites as track rows | `library/gallery/index.html` | A | SHOT `sci-fi-gallery-track-rows.mp4` |
| 15 | Weeping Seraph — freezes while watched, moves when you look away | `library/components/rigged/weeping-seraph/weeping-seraph.html` | A (default) / D (`?camera=1` for live face-tracking) | SHOT `weeping-seraph-watched.mp4` |
| 16 | Seraph — spring motion, WebGL2, gold-leaf skin, 6 designs, seal halo | same page | A/D | SHOT `weeping-seraph-designs.mp4` |
| 17 | Chimera — MAP-Elites atlas filling live | `world/forges/chimera/index.html` | A | SHOT `chimera-atlas-filling.mp4` |
| 18 | Scriptorium — generated scripts + one written phrase | `world/glyphs/scriptorium/index.html` | A | SHOT `scriptorium-generated-scripts.mp4` |
| 19 | Parts by Shape — sheet with show/hide ticks | `world/forges/parts-sheet/index.html` | A | SHOT `parts-by-shape-sheet.mp4` |
| 21 | Relief — tower as raised-relief/carved tablet | `world/forge/web/bench.html` | C (branch `origin/forge-relief` only) | BRANCH |
| 22 | Two murals built from Forge's own generators | `world/scenes/mural/index.html`, `sowers.html` | A | SHOT `forge-mural-index.mp4`, `forge-mural-sowers.mp4` |
| 23 | Style stage — recipes compared side by side | `world/forge/web/style.html` | A | SHOT `style-stage-recipes.mp4` |

Skipped (non-visual): 1, 3, 6, 12, 20, 24, 25.

## City and World log (6–11 Nov, container `89eb3d9c…`)

Structural note: the standalone Route Scene pages (`world/scenes/route/*`,
`world/scenes/world-scene/route-scene.html`) are **deleted from `main`** — confirmed via
`git log --diff-filter=D`. Everything they did now lives as selectable "looks" (Route Zero / Ash /
Paper / Glitch / Engraving / Relief) inside `world/scenes/world-scene/World Scene.html`. Film the
end state there, not the old pages. "Play the myth" (5-act scripted sequence, entry 6) could not be
found anywhere in current code — treat as **[GONE]**.

| # | Claim | Page | Setup | Status |
|---|---|---|---|---|
| 1 | Night Route: still tableau / live-moon wallpaper / flats on wires | GONE — superseded, see note | — | GONE |
| 2 | Route Scene flat staging; creatures bank/tilt into turns | `World Scene.html` (Route Zero look) | A | SHOT `world-scene-route-zero-flats.mp4` |
| 3 | Sparse outskirts: lonely towers, gate road, telegraph wire, pines | `World Scene.html` | A | SHOT `world-scene-sparse-outskirts.mp4` |
| 4 | One world, two renderers — button toggle, same seed | `World Scene.html` | A | SHOT `world-scene-two-renderers-toggle.mp4` |
| 5 | Forge objects as cut-outs; creatures run the real ecology loop | `World Scene.html` | A/B | NEEDED |
| 6 | Four looks; pilgrims walk the road (`#route-atmo-toggle`) | `World Scene.html` | A | SHOT `world-scene-four-looks-pilgrims.mp4` — "Play the myth" sub-claim is GONE |
| 7 | Creature scale drop 115→40→20 | `World Scene.html` | C (3 commits in one day) | NEEDED, low priority |
| 8 | Route Zero rebuilt native WebGL2 — before (wrong) / after (right) | `World Scene.html` | C (before = commit `189bcff`, after = `3b1d669`+) | NEEDED |
| 9 | Panel reorganized 4× in a day | `World Scene.html` | C, low priority (UI chrome) | NEEDED |
| 10 | Six looks side by side | `World Scene.html` | A | HAVE `ws-looks.png` (still only — a switching clip still NEEDED) |
| 11 | Lens toggle; tilt to 90°; contour-line ridges | `World Scene.html` | A | SHOT `world-scene-lens-tilt-contour.mp4` |
| 12 | Creatures in white; real alpha blending (visible overlap artifact) | `World Scene.html` | A | SHOT `world-scene-white-creatures-blend.mp4` |
| 13 | City grammar: 4-terrace viewer + colored district plan | `World Scene.html` (or `world/scenes/city-grammar/index.html` — unresolved which is primary) | A | SHOT `city-grammar-terraces.mp4` |
| 14 | Before/after: new grammar city rendered as a blank frame, then fixed | `World Scene.html` | C (`213dd62` / `596b88a`) | NEEDED |
| 15 | Click a flat-map cell → hex-bloom of building pieces, pin, resolve | `world/forge/web/city.html` (Plots tab) | B | NEEDED |
| 16 | City stage becomes World Scene; click a 3D terrace to open its bloom | `city.html` → iframes `World Scene.html?forge=1#<seed>` | B | NEEDED |
| 17 | One 3D world: every building form, creatures on streets, native road | `World Scene.html` | B | NEEDED |
| 20 | Walkers follow real streets/stairs; tower LOD pop at 30% screen height | `World Scene.html` | B | NEEDED |
| 22 | Full panel set in Forge's inspector (Ecology/Camera/City tabs) | `city.html` / `ecology.html` inspector | B, low priority | NEEDED |
| 23 | Before/after: flat top-down Ecology view → same 3D World Scene as City | `world/forge/web/ecology.html` (uses `CityPlacement.solve()` + `ecology-render.js` directly, not an iframe — note the discrepancy from the log's wording) | B | NEEDED — strong pair, worth the setup |

Skipped (non-visual): 18, 19, 21.

## Walkers log (8–15 Nov, container `bf705166…`)

| # | Claim | Page | Setup | Status |
|---|---|---|---|---|
| 1 | Bloom picker: rosette of part swaps (full ring / half / hex) | `world/forges/walker-bestiary/index.html` | A | SHOT `walker-bloom-picker-rosette.mp4` |
| 2 | Townsfolk + Bestiary share one motion engine | `walker-bestiary/index.html` | A | HAVE `townsfolk.gif` |
| 3 | Rig stage, Carapace Strider "Walk" clip, bones + footfall chart | `world/forge/web/rig.html` | B | NEEDED |
| 4 | Feet plant in world space across Ecology/World Scene/Route styles | `walker-bestiary/index.html`, `ecology.html` | A/B | NEEDED |
| 5 | Bloom picker in Bench/Remix/Compose; Ringed Lance Monarch on the hex grid | `walker-bestiary/index.html` | A | SHOT `walker-bloom-bench-remix-compose.mp4` — mapping uncertain, see Progress log |
| 6 | Material look — plates over glowing core, ribs, struts, bolts | `walker-bestiary/index.html` | A | SHOT `walker-material-look.mp4` — weak, see Progress log |
| 7 | 2D quad mech walking | GONE from `main`; maybe on `origin/quad-walker` or `origin/walker-quad` (unverified which) | C | GONE/BRANCH — unresolved, low priority |
| 8 | Quad Mech in 3D, segmented, skeleton visible | `walker-bestiary/index.html#hexMech`-style hash | A | HAVE `quad-mech.gif` |
| 9 | Hex Mech generated from hexagons | `walker-bestiary/index.html` | A | HAVE `hex-mech.gif` |
| 10 | Kit Mech — 8 designs dealt by number | `walker-bestiary/index.html` | A | SHOT `walker-kit-mech-8-designs.mp4` — partial, see Progress log |
| 11–12 | Hand-built Mech hex-bloom remix; curated Compose template | `walker-bestiary/index.html` | A | SHOT `walker-mech-remix-compose-template.mp4` — remix only, see Progress log |
| 14 | Machine stance — hips at corners, matched leg lengths | `walker-bestiary/index.html` | A | SHOT `walker-machine-stance.mp4` |
| 15 | Blender Mech walk fixes; full roster still | `walker-bestiary/index.html` | A | SHOT `walker-blender-mech-walk.mp4` |
| 17 | Blender Mech → qilin → gallop, led round the Walk page | `world/forges/walker-bestiary/walk.html` | A | HAVE `walk-qilin.gif` |
| 18 | Shared walker engine — same preset across qilin/dragon/scorpion/swan | `walker-bestiary/index.html` | A | SHOT `walker-shared-engine-presets.mp4` |
| 19 | Breeding by clicking — bloom of blooms | `walker-bestiary/index.html` | A | SHOT `walker-breeding-bloom.mp4` |
| 20 | One gait rulebook, 2D and 3D (subtle) | `walker-bestiary/index.html` | A, low priority | SHOT `walker-gait-rulebook-2d-3d.mp4` |
| 21 | Import dock; motion rack; creatures walking the city | `walker-bestiary/index.html`, `ecology.html` | A/B | NEEDED |
| 22 | Family sheet — kit rebuilt across 8 families | `creatures-by-family.svg` (repo root, via `svgshot.mjs`) | A | HAVE `family.png` |
| 23 | Walk page layout itself (tile roster, speed chips, footfall tape) | `world/forges/walker-bestiary/walk.html` | A | SHOT `walk-page-layout.mp4` |
| 24 | Kit Qilin/Tiger/Dragon/Spider | GONE — no trace in repo (grep confirmed absent) | — | GONE |
| 25 | Kit walkers rebuilt as real 2D species, standing sprawled | `walk.html` | A | SHOT `walk-kit-species-2d.mp4` |
| 26 | Centiwyrm cut into rippling segments | `walk.html` | A | HAVE `walk-centiwyrm.gif` |
| 27 | Pincer hunts Puffers — drive-based behavior | `world/forges/walker-bestiary/scene.html` (`#hunt`) | A | HAVE `walk-hunt.gif` |
| 28 | Body page: kit look vs. soft look, same skeleton, after a shove | `world/forges/walker-bestiary/body.html` (`#<creature>`) | A | HAVE `body-shove.gif` |
| 29 | Walkers climb towers via surface-normal foot planting | `body.html#pincer,tower` | A | SHOT `walkers-climb-towers.mp4` — confirms the existing bug, see Progress log |
| 30 | Tank-wide behavior change — hunters search then give up | `world/forges/fish-tool/Cybernetic Ecology.html` | A | SHOT `tank-hunters-give-up.mp4` |
| 31 | Terrain prototype → unified scene, 5 iterations | `world/forges/walker-bestiary/terrain.html` (`#seed=7`) | A | HAVE `terrain.gif` |
| 32 | Walkers and ecology share one tank world | `Cybernetic Ecology.html` | A | SHOT `tank-walkers-ecology-shared.mp4` |

Skipped (non-visual): 13, 16.

## The Maw log (10–19 Nov, container `6980f429…`)

All pages below are under `world/forges/fish-tool/` unless noted.

| # | Claim | Page | Setup | Status |
|---|---|---|---|---|
| 2 | Maw prototype — hold-to-coil lunge, No-Face look | `maw-prototype.html` | A | SHOT `maw-prototype-coil-lunge.mp4` |
| 3 | Into the tank — autopilot, first meal | `Cybernetic Ecology.html#autopilot` | A | HAVE `tank-play.gif` |
| 9 | Mutate — upgrade tags drawn on the Maw's body | `Cybernetic Ecology.html` (confirmed: `Mutate` button, Lv/XP readout, Neck/Rows/Tusks tags) | B (fed Maw) | NEEDED |
| 10 | Descent menu — 7 stages + Endless | `Cybernetic Ecology.html` (`?run`, `?rings=5`) | A | SHOT `maw-descent-menu.mp4` |
| 11 | The Maw wearing other creatures' legs/wings/fins | `Cybernetic Ecology.html` (Specimen mode) or `Specimen.html` | B | NEEDED |
| 13 | From-scratch TS/ECS build, "nest" hub | GONE — `games/the-maw/` has no page left, only the dropped `src/core` library code | — | GONE |
| 17 | Specimen — one species alone (Sigil Koi) | `Specimen.html` (`#c=<species-key>`) | A | HAVE `specimen.gif` |
| 18 | Maw + Kit Quad Mech join Specimen | `Specimen.html#c=maw`, `#c=quad` | A | SHOT `specimen-maw-quad-mech.mp4` |
| 21 | Before/after: fed Maw squashed → 1.7× row spacing fix | `Cybernetic Ecology.html` | B (fed Maw) | NEEDED — only a "before" bug still exists in the doc |
| 22 | Hex-cell Maw — rejected direction | `world/forges/fish-tool/Maw Hex Study.html` — **still exists, contradicting the log's "removed same hour"** | A | SHOT `maw-hex-study-rejected.mp4` — shot anyway since page is self-contained; still worth confirming with Zac whether the dead end belongs in the reel |
| 23 | Hex study redone on the Compose grid, 7–20 spine cells | `Maw Hex Study.html` | A | SHOT `maw-hex-study-compose-grid.mp4` |
| 24 | Wraith body + 3 leg designs | `Specimen.html` / terrain grid context | A | SHOT `specimen-wraith-legs.mp4` |
| 25 | Terrain grid; Lancer's wings as a separate beating pair; hidden-line fix | `Specimen.html` | A | SHOT `specimen-terrain-lancer-wings.mp4` — no dedicated before/after shot in the source doc either |
| 26 | Rings tab — level editor + a played ring | `Cybernetic Ecology.html` (`role=tab id="t-ring"`, "Rings") | A/B | SHOT `maw-rings-tab-editor.mp4` — level editor only, see Progress log |
| 27 | Maw Forge — bench, bloom swap, grid/density matrix, colossus scale | `Maw Forge.html` | A | SHOT `maw-forge-bench-bloom-density.mp4` |
| 28 | Maw Forge design pasted into Specimen/Rings, walks on Stalker legs | `Specimen.html`, `Cybernetic Ecology.html` | A/B | NEEDED |
| 30 | Every species as a clean SVG sheet | `world/forges/fish-tool/exports/creatures-svg/sheet.svg` (regenerate: `node world/forges/fish-tool/export-svg.mjs [out-dir]`) | A | HAVE `sheet.png` |

Skipped (non-visual): 1, 4–8, 12, 14–16, 19, 20, 29.

---

## Priority order for this pass

1. **Tier A, no saved state** — the generator/showcase pages that load complete on their own:
   Forge Console, Gallery, Weeping Seraph, Chimera, Scriptorium, Murals, Style stage,
   Parts-by-Shape, World Scene's own looks/camera/lens, every `walker-bestiary`/`walk.html`/
   `body.html`/`terrain.html`/`scene.html` hash-driven shot, Maw prototype, Specimen, Maw Forge,
   Maw Hex Study, Cybernetic Ecology's descent menu/autopilot/Rings tab.
2. **Tier B, needs a saved Forge world or a fed/leveled Maw** — city/ecology/rig/attach/rules
   pages, Mutate, the squashed-Maw repro. Needs setting up a demo world (or a localStorage/
   IndexedDB seed) before shooting — a separate pass.
3. **Tier C, needs a branch checkout or historical commit** — the three Forge re-skins, Relief,
   the Route Zero before/after, the panel-reorg timeline. Shoot last, on throwaway worktrees so
   `main` is never touched.
4. **GONE** — don't schedule: City/World #1 and the "Play the myth" sub-claim of #6, Walkers #24,
   The Maw #13.

## Progress log

- 2026-11-20: branch `dev-logs` fast-forward-merged into `main` (159 commits, no conflicts — `main`
  was already an ancestor). `tools/capture/` given `.mp4` support: `cap.mjs` gained `video()`
  (stepped-fake-clock → h264) and `openRec()`/`closeRec()` (Playwright's native real-time video
  recording, for pages too slow to drive on a fake clock); `g-any.mjs`/`g-walk.mjs` branch on output
  extension; new `g-rt.mjs` wraps the real-time path. Verified against `walker-bestiary#hexMech`
  (mp4, no errors) and a 2s real-time recording of Forge's home page.
- 2026-11-20: shot 40 of the 41 Tier-A entries queued for this pass (everything in "Priority order for
  this pass" §1 that was NEEDED). `g-any.mjs` with real hash-routing + button-text clicks (grepped out
  of each page's source first) covered almost everything; `g-rt.mjs` was used for World Scene (all 7
  looks/camera/lens entries) and the Cybernetic Ecology tank entries, matching the README's own
  "too slow for the fake clock" guidance. All new files verified non-zero duration/size with `ffprobe`.
  Known gotchas found along the way, for future passes:
  - `walker-bestiary/index.html`'s right rail is a tall `overflow-y:auto` list — the "Hex bloom · remix"
    and "Bloom of blooms · breed" panels sit below the roster and are **off-screen at g-any's default
    1280×800 viewport**, so a plain click-and-screenshot looks like nothing happened even though the
    click registered. Fixed by opening with a much taller viewport (`open(url,{h:1900})`) via a small
    ad-hoc script built only from `cap.mjs`'s own exported `open/run/video` — no repo file was edited to
    do this.
  - Walkers #6 "Material look" and #15 "Blender Mech walk" are weaker than the log's wording promises:
    every creature on this page (including the GLB-based Blender mech, which does load its 406KB
    `shared/data/mechs/blender-mech.glb` fine) renders as thin amber/mint vector line art, never the
    solid-shaded "plates/ribs/struts/bolts" a code comment implies. The Skin/Both/Mechanism toggle is
    real but visually subtle at this zoom — a tighter crop or closer camera would sell it better.
  - Walkers #5's "Bloom picker in Bench/Remix/Compose; Ringed Lance Monarch" doesn't match anything on
    `walker-bestiary/index.html` — no Bench/Remix/Compose tabs exist there, and "Ringed Lance Monarch"
    is a `world/forges/fish-tool` species (Cybernetic Ecology), not a walker. Shot the closest analog
    (Kit Mech's breed-ring) but this row likely belongs on a different, not-yet-identified page —
    flagged for Zac.
  - Walkers #10/#11-12 (Kit Mech "8 designs dealt by number"; "curated Compose template"): both depend
    on state g-any's text-click mechanism can't drive — a `<input type=range>` design slider, and a
    saved `COMPOSED` record from Forge Compose (Tier B). Shot what's reachable (the page itself, and the
    hex-bloom remix panel) but neither sub-claim is fully demonstrated.
  - Maw #26 "Rings tab" shot as the level editor only (self-contained); "a played ring" needs a fed/
    saved run state (Tier B), out of scope for this pass.
  - Walkers #29 "Walkers climb towers" (`body.html#pincer,tower`): earlier attempts in this pass
    (`g-rt.mjs`/`g-any.mjs`, varied warm-up) exited without writing a file; a later attempt (`g-any.mjs`,
    default args) succeeded — `walkers-climb-towers.mp4`, 9.1s at 1024×768. Checked actual frames from
    it (`ffmpeg -vf select=... -vframes 1`, viewed as images): the page loads correctly with `TOWER`
    terrain selected, but the Pincer Crawler's body renders as a tangled, collapsed skeleton rather than
    a clean climb up the tower shaft — this **confirms** the row's existing suspicion that this capture
    is flagged possibly buggy (tumbling, not climbing). Shot as-is since it's a real, representative
    capture of current behavior; still worth a human look / fix on the `body.html` climb logic itself.
  - This pass ran several capture scripts concurrently against the same machine; CPU load briefly spiked
    to ~220 with ~140 Chromium processes alive at once (multiple pages' Playwright instances competing
    for SwiftShader). Nothing corrupted, but a couple of filenames were briefly overwritten mid-pass by
    a second concurrent attempt at the same entry before the final version landed, and the checklist file
    itself was edited concurrently by more than one pass (one edit was rejected with a "file modified
    since read" error and had to be redone against the fresh content) — if this pass is repeated,
    throttling concurrency (or giving each capture job a unique scratch filename until verified, then
    renaming into place, and designating a single writer for this checklist file) would avoid both races.
  - Untouched this pass, per the brief: all Tier B (saved-world/fed-Maw), Tier C (branch/historical) and
    GONE rows. Every Tier-A row is now SHOT or HAVE — none left NEEDED in that tier.
- 2026-11-20 (fps fix): the fake-clock `.mp4` path encoded at whatever rate the clock step implied
  (`fps = 1000/step`), not a chosen rate — `g-any.mjs` defaulted `step=60` (~17fps) and `g-walk.mjs`
  hardcoded `step:60, fps:16`. One entry (`maw-forge-bench-bloom-density.mp4`) had been shot at an
  explicit `step=200` (5fps) to keep a long 15s/4-click sequence's frame count down. Fixed at the
  source: both scripts now default to `step=40` (25fps, matching `g-rt.mjs`'s real-time clips), with
  default `frames` bumped (`g-any.mjs` 44→66, `g-walk.mjs` 70→105) to keep default clip length roughly
  unchanged. Reshot the 19 affected clips at 25fps (all `walker-*`/`walk-*` entries, the 5 ambient
  showcase pages — Forge Console, Gallery, Scriptorium, both Weeping Seraph clips — `walkers-climb-
  towers.mp4`, and Maw Forge): all verified 25fps and non-zero/longer duration via `ffprobe`, several
  spot-checked by pulling frames. `maw-prototype-coil-lunge.mp4` deliberately left at its existing 20fps
  (hybrid manual-pointer capture, physically timed — changing the step risks the interaction itself,
  not just smoothness).
  - Two more checklist/page mismatches found while reshooting (same shape as the existing Walkers #5/
    Ringed Lance Monarch note): Forge #11 "Forge Console component set (amber/green/red/cyan)" points
    at `shared/look/forge-ds/bloom-gallery.html`, but that page is titled "Bloom picker" and is purely
    the hex-bloom-picker demo — no amber/green/red/cyan component gallery exists on it, in this file or
    any other file in that directory. Reshot the page as it actually is (the bloom picker); the claim's
    actual page is still unidentified — flagged for Zac. Separately, `walker-shared-engine-presets.mp4`
    ("same preset across qilin/dragon/scorpion/swan") is really on `walk.html`'s neck/appendage cycle
    control (`[data-step="app"]`), not `index.html` as the row's Page column implies — shot correctly,
    just noting the page column is imprecise.
  - `Maw Forge.html`'s matrix/bench/3D-view (the actual "grid/density matrix, colossus scale" payload)
    sits below the fold at `g-any.mjs`'s default 800px viewport height — the reshot still only shows the
    controls bar and species/legs pickers, same framing gap the original 5fps capture likely had too.
    Tried fixing it with a taller viewport (1900px): a plain full-page screenshot at that height works
    fine, but asking Playwright for a *stepped* screenshot sequence (`page.clock.runFor()` + repeated
    `page.screenshot()`) at that height, after the Shuffle/Fed/Full/Colossus clicks, reproducibly hung
    inside Playwright's own screenshot call (stuck past "waiting for fonts to load", 1100%+ CPU on the
    SwiftShader GPU process, no progress for 15+ minutes) — had to `kill -9` it. Left the existing
    (correctly-framed-but-cropped) capture in place rather than risk another hang; a future pass should
    try a lower `deviceScaleFactor` or clipping to `main` at a shorter viewport instead of going taller.
  - Found a 2nd, unrelated process writing `specimen-live-*.mp4` (9 files: carapace-strider, pincer-
    crawler, bramble-wyrm, fin-dragon-look, glass-star, halo-eyed-seraph, lance-monarch, sigil-koi,
    studded-leech) into this same directory at the same wall-clock time as this fps-fix pass (timestamps
    21:11–21:14), under names that don't match anything in this checklist. Not touched or claimed by
    this pass — flagged since it may explain the Maw Forge hang above (CPU contention) and because its
    origin is unknown to this pass.
