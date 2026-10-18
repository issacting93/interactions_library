# Instagram Visuals

Posts for the account, built from the interaction library. The strategy is in [PLAN.md](PLAN.md).

## Layout

```
Instagram_Visuals/
  PLAN.md               strategy: series, formats, launch grid, cadence
  contact-sheet.png     every piece × assembly / exploded / spec at a glance (re-compose after a redesign)
  references/           moodboard pulls (Pinterest board, reticle GIF)
  stage/
    stage.html          the post stage: renders a piece in STORY / SPEC / EXPLODED
    capture.mjs         renders a piece to MP4 (or PNG for SPEC) via headless Chrome + ffmpeg
    export-figma.mjs    flattens stage renders into Figma-importable SVG (see Figma export)
  figma/                <CODE>-<mode>.svg, ready to drag into Figma
  pieces/<id>/
    piece.js            the stage adapter: layered redraw, scripted performance, spec text
    source/             a copy of the original component it was drawn from (runs on its own)
    exports/            the renders: story-4x5.mp4, exploded-4x5.mp4, spec-4x5.png
```

`source/` holds copies, so the posts stay reproducible even if the library version changes.
The originals still live in `components/` and `tools/`.

| Code | Piece | Original | Design (rev B) |
|---|---|---|---|
| RST-03 | Rosette (+ Graphite Halo layer) | `components/interaction/rosette/`, `components/Graphite Halo (1).html` | — |
| CYB-04 | Cyberpunk Dial | `components/interaction/cyberpunk-dial/` | instrument panel · readout strip · bezel ports · centre knob · LED cluster |
| SGW-05 | Signal Wheel | `components/interaction/signal-wheel/` | HUD dial · chrome rings · boundary LEDs · zone brackets |
| BLM-06 | Radial Goo Bloom | `tools/radial-goo-bloom/` | — (the source of the goo language) |
| HEX-07 | Hex Workspace | `components/interaction/hex-workspace/` | goo ink trail · corner brackets · order badges |
| SPN-08 | Spine Section | `components/interaction/spine-section/` | port index · SC ports · vertebra badges · slide brackets |
| DSY-09 | Daisy Wheel | `components/interaction/daisy-wheel/` | degree-scale reticle · centre readout · knob-styled strike pad · vertebra spine (rev SPINE, borrows SPN-08's bracket language) |
| GRT-10 | Geared Reticle (Cyberpunk Dial rev B, dial only) | `components/interaction/geared-reticle/geared-reticle.html` | — |
| GRT-11 | Geared Reticle · Patch (dial + Patch-style gear-train rack) | same source, rebuilt with Patch knob / jack / cord parts | — (the prototype for rev B) |
| PLX-12 | Parallax Rings | `components/motion/parallax/` | — (ambient depth field, no knob to convert; plays the legacy ASSEMBLY loop in STORY) |
| LCK-14 | Gear Lock | `components/interaction/gear-lock/` | rebuilt on parallax (PLX-12): all six of its rings, literal markup, monochrome — closed to a near-invisible hint while a target is locked, blooms open to parallax's own scale the instant nothing is held; aim is parallax's own Reticle shape; daisy-wheel-style glyph-coded sequence strip + undo |
| RLQ-15 | Reliquary | `components/interaction/reliquary/` | — |
| SLA-16 | Spine Lock · Alert | `components/interaction/spine-lock-alert/` | — (Alert skin of the Spine Lock mechanic: hazard bars, hex field, bilingual HUD, spec table, oscillograph) |
| DTM-17 | Datamatics | `components/interaction/datamatics/` | — (reconstructed from boids / murmuration-rosette's flock, rain-vortex-rev-b's valve ring and datamatic-tape's barcode readout; pure black/white in every mode, no WebGL — the flock is plotted straight into SVG) |

### Visual language (rev B, Oct 2026)

Five of the B-series dials (CYB · DSY · HEX · SGW · SPN) were redesigned to borrow the visual languages of two tools, so the grid varies between pieces while the house palettes stay fixed:

- **`Patch/`** — 270° knob readouts, port jacks (round; SC = square), patch cords with dash-kinds (ghost `6 5` · flow `14 8` · solid), LED dots, node-card order badges, micro labels.
- **`tools/radial-goo-bloom/`** — the goo filter (`feGaussianBlur` + `feColorMatrix` alpha threshold), rotating chrome rings, corner brackets, breathing focus rings, HUD readout stacks.

Rules that keep the modes coherent:

- Every new element uses the stage's palette classes (`.ink .mid .minor .acc .accf .disc .icondot …`), so one drawing reads in all three modes.
- **Rev C — colour is identity.** Each piece owns a hue that replaces the mode accents and selected fills in every mode (dial red · daisy amber · hex orange · signal green · spine violet, matching the live components where they have one). The pieces inject a small style override in `build()`; amber stays the stage's focus colour (finger, panel, selection).
- New elements get `assembly.draw(t)` windows (or `reg()` windows in the pieces that use them), so they draw on and off with the rest of the piece.
- Ambient motion must loop seamlessly: 1 s flow-dash cycles, one full turn per loop for the chrome rings, 0.5 s blinks. SPEC gets no clock (`p.t` is absent), so everything reads static there.

The live components in `components/interaction/<name>/` carry the same language (each keeps its own accent colour), and the `pieces/<id>/source/` copies are refreshed to match. The gallery (`index.html`) links the components by path, so it picks up the new visuals automatically.

## Run

```sh
# from the repo root
python3 -m http.server 8765
open http://localhost:8765/Instagram_Visuals/stage/stage.html
```

Keys: Space play/pause · 1 2 3 mode · ← → step a frame · G grid-crop guides · S cycle stagger order.
URL: `?piece=rosette&mode=exploded&format=4x5&t=3.2`. The footer names the current STORY beat.

## The story (every reel)

Every UI reel tells the same story, 15–20 s (18 by default):

| Beat | Time at 18 s | What happens |
|---|---|---|
| REVEAL | 0 – 2.6 | The interface draws itself on from points |
| CONTROLS IN | 2.4 – 3.8 | The interface lifts and shrinks; the control panel draws on below it |
| TWEAK | 4.0 – 11.2 | The finger works each control in turn and the interface answers (one equal slot per tweak) |
| CONTROLS OUT | 11.2 – 12.5 | The panel undraws; the interface settles back to centre |
| HOLD | 12.5 – 15.6 | Hands off: the interface runs in its new state |
| FADE | 15.6 – 18 | It undraws to black, so the loop restarts cleanly |

The stage owns the timing, the control panel (knob, slider, toggle, one style for every piece) and the finger.
A piece declares `controls` and `story.tweaks`, and its `pose(u, ctl)` reads the values (see the contract in `stage/stage.html`; `pieces/geared-reticle/piece.js` is the reference).
Pieces without `controls` still play the old ASSEMBLY loop in STORY until they are converted.
Converted: all pieces but PLX-12 (Parallax Rings) — an ambient depth field has no discrete knob to
invent controls around, so the stage plays the legacy ASSEMBLY loop for its STORY. The *exported*
STORY file skips the stage altogether for this one piece; see "STORY is a different pipeline" under
Export. GRT-11 (Geared Reticle · Patch) still plays its own 15 s loop.

| Piece | Controls | Tweaks (in order) |
|---|---|---|
| RST-03 Rosette | NODE · DENSITY · WARP · MORPH | node → 06 SIGNAL (tick ring winds −225°) · density .25 · warp .23 · morph ×2.6 |
| CYB-04 Cyberpunk Dial | SWEEP RATE · MIDDLE RATIO · LOCK | lock · unlock · rate +26°/s · middle ×+1.20 (ends spinning) |
| SGW-05 Signal Wheel | SIGNAL · POLARITY · NOISE | signal → POSSIBLE · polarity → NEG · noise ±14° (needle trembles) |
| BLM-06 Radial Goo Bloom | BLOOM · STIFFNESS · DAMPING · SPREAD | collapse to seed · damping 5 · re-bloom (bouncy) · spread R122 (fused goo) |
| HEX-07 Hex Workspace | TRACE · SPREAD · CLOSE | trace all 6 nodes · spread ×1.15 · close the loop |
| SPN-08 Spine Section | SECTION · SPACING · FRAME | section → 05 · spacing 38 px · frame off |
| DSY-09 Daisy Wheel | STRIKE · AIM · DAMP | auto-strike on · aim 120° · damp 4 (rings after strikes) · aim 240° |
| GRT-10 Geared Reticle | SWEEP RATE · MIDDLE / INNER RATIO · FIELD WARP | rate +24 · middle ×+1.2 · warp .22 |
| PLX-12 Parallax Rings | — (legacy ASSEMBLY) | pointer sweeps right · left · down · up · settles diagonal |
| DTM-17 Datamatics | NODE · DENSITY · CLOCK | node → 6/8 (snaps, no spring) · density .26 (fewer threads) · clock ×1.55 (sweep + tape only, not the sim) |

Several pieces (Signal Wheel, Radial Goo Bloom, Rosette, Daisy Wheel, Cyberpunk Dial) read the control *history*
(when a toggle flipped, what a knob passed through) by passing a recorder to `ctl.integ`, which today calls it
once per 1/120 s sample in time order. If `integ` ever changes how it samples, update those pieces too.

## Motion

The second strip (MOTION) sets the choreography. Every setting is also a URL parameter, and the URL only shows values that differ from the defaults.

| Param | Default | What it does |
|---|---|---|
| `story` | `18` | STORY length in seconds (15 / 18 / 20). TWEAK gets 70 % of the time the fixed beats leave; HOLD gets the rest. |
| `loop` | `15` | EXPLODED (and legacy loop) length in seconds (8 / 12 / 15). Pieces stay authored on their 8 s (ASSEMBLY) and 10 s (EXPLODED) clocks. The stage time-warps those clocks: the build and fold phases stretch, the performance runs at `rate`, and the time left over becomes a held beat. |
| `enter` | `outBack(1.7)` | Ease for things that move or scale in: layer bloom, seed dots, the exploded stack flying apart, labels sliding in. Back overshoots, then settles. |
| `exit` | `inBack(1.7)` | Ease for things leaving: layers swell a little, then collapse, and the stack parts, then slams shut. |
| `draw` | `inOutSine` | Ease for strokes drawing on and off and for fades. These values are clamped to 0–1, so Back easing is lost here; use enter/exit for overshoot. |
| `stagger` | `first` | Order elements start in: `first`, `last`, `center` (middle out), `edges` (outside in), `random` (seeded, so the same order every render). |
| `spread` | `linear` | How start times spread over that order. `inQuad` bunches the early ones; `outQuad` the late ones. The total spread stays as authored. |
| `bloom` | `.16` | How far each layer scales in and out during ASSEMBLY (0 = off). |
| `rate` | `.75` | Performance speed (finger taps and drags). 1 is the original speed. |

Every value is any anime.js ease string (`outElastic(1,.6)`, `inOutExpo`…); the curve previews next to ENTER and EXIT show the overshoot.
Pieces use `dOn` / `dOff` for draw windows and `stag(i, n, step)` for stagger offsets (see MOTION in `stage/stage.html`).

## Export

```sh
cd Instagram_Visuals
npm install                                   # once: puppeteer-core
node stage/capture.mjs geared-reticle story 4x5   # → pieces/geared-reticle/exports/story-4x5.mp4
node stage/capture.mjs rosette spec 4x5           # → pieces/rosette/exports/spec-4x5.png
npm run export:all                                # every piece, every mode, 4:5
```

Arguments: `piece mode format [fps] [motion] [tag]`, fps defaults to 60. Needs Google Chrome and `ffmpeg`.
`motion` is a query string of MOTION overrides; `tag` is added to the file name so variants sit beside the main export:

```sh
node stage/capture.mjs geared-reticle story 4x5 60 'story=15&stagger=center' short
# → pieces/geared-reticle/exports/story-4x5-short.mp4
```

### PLX-12 Parallax Rings: STORY is a different pipeline

Every other piece's three exports come from the same stage redraw. PLX-12 is the one exception:
its STORY is a direct capture of the live component (`components/motion/parallax/parallax.html`)
— real parallax.js, real CSS keyframes, no house style, no stage — while SPEC and EXPLODED still
come from `stage/capture.mjs` + `pieces/parallax/piece.js` as usual, since those two need the
per-layer separation the live page doesn't have. The two are expected to look different from each
other; that's the point, not a bug.

```sh
python3 -m http.server 8765                        # from the repo root, as above
node pieces/parallax/capture-live.mjs 4x5 16 30    # → pieces/parallax/exports/story-4x5.mp4
node stage/capture.mjs parallax spec 4x5           # → pieces/parallax/exports/spec-4x5.png
node stage/capture.mjs parallax exploded 4x5       # → pieces/parallax/exports/exploded-4x5.mp4
```

`capture-live.mjs` drives a synthetic mouse sweep over real wall-clock time (there's no `seek()`
for a live page), so the capture takes at least as long as the clip itself: `[format] [seconds]
[fps]`, defaulting to `4x5 16 30`. `npm run export:all` does not know about this piece's split —
run its three lines by hand after any change to the live component or to `piece.js`.

## Figma export

```sh
npm run export:figma                     # every piece → figma/<CODE>-<mode>.svg
node stage/export-figma.mjs hex-workspace signal-wheel   # or pick pieces
```

Renders each piece on the stage (STORY at t = 8.5 · SPEC · EXPLODED at t = 8.5, 4:5) and flattens the
SVG for Figma's importer: CSS classes become inline presentation attributes, `<pattern>` fills expand
into explicit shapes, `textPath` becomes rotated text, `<tspan>`s split into separate texts,
`dominant-baseline` becomes a y-offset, and invisible elements are dropped. Type stays editable —
Figma has Martian Mono and IBM Plex Mono.

What Figma cannot read, and what the export does about it:

- SVG filters (the goo blur) → dropped; the pieces' halo + core strokes already fake the look without the blur.
- `clip-path` (the daisy wheel's crop) → kept; modern Figma applies clip-paths on import. If your
  Figma version ignores it, the wheel imports uncropped.
- Dash flow offsets and breathing animations → frozen at the exported moment.

Import: in Figma, drag one or more `figma/*.svg` files onto the canvas (or File → Place image, then
right-click → Outline stroke, or use File → Import). Every file is a single 1080 × 1350 frame with
layers and editable text.

## Adding a piece

1. `pieces/<id>/source/`: copy the component in.
2. `pieces/<id>/piece.js`: write the adapter (the contract is at the top of `stage/stage.html`; `pieces/rosette/piece.js` is the reference).
3. Add `<script src="../pieces/<id>/piece.js"></script>` to the list at the bottom of `stage/stage.html`.
4. Give it `controls` and `story.tweaks` so it plays the story.
5. Export, then add it to the table above.
