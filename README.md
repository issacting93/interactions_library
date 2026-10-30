# Interactions Exploration

A library of interface studies — dials, sequencers, HUDs, generative systems — built as self-contained HTML files, browsable from `index.html`. Most pieces lean on a shared sci-fi/instrument-panel visual language (mono/condensed type, hairline strokes, a dark ground with one accent colour).

## Layout

```
index.html            the gallery — browse every component/tool by category, tag, search
components/           the library: reusable, finished pieces
  generative/            procedural systems (terrain, noise fields, glyph generators)
  interaction/            dials, sequencers, radial menus, HUD instruments — the bulk of the library
  layout/                 structural/sectioning pieces
  motion/                  ambient motion, parallax, signal displays
  physics/                 spring/goo/particle pieces
interface-studies/    the numbered sketchbook (01–07) that many components/interaction/
                       pieces are drawn from — e.g. 01-ophanim.html → components/interaction/ophanim/,
                       04-compass-studies.html (panels I–IV) → reliquary-compass, datamatic-tape,
                       heaven-plate, volumetric-bearing. Kept deliberately separate from components/:
                       the study is the raw sketch, the component is the refined extraction.
tools/                 standalone generator apps (asset-foundry, xenoglyph, patch, rosette-generator, …) —
                       full tools in their own right, not meant to be embedded like components/
neurosymbolic-ui/      research track on hybrid neural+symbolic generative UI, pulled from a research-
                       pitch deck ("GenUI with Constraints"): an LLM scores options, a grammar/WFC
                       solver guarantees validity and picks what regenerates when one thing changes.
                       Four standalone prototypes in prototypes/, from a scripted chat-reply demo to a
                       landing-page generator grounded in real SaaS-structure research. See its own
                       README.md. Folder name is provisional.
Instagram_Visuals/     the social-posting pipeline: stage/ (capture → MP4/PNG/Figma SVG),
                       pieces/<id>/ (one adapter per posted piece). See its own README.md and PLAN.md
                       for the series/designation system (e.g. DTM-17).
shared/                design tokens, component layers, and small utilities (tokens.css, chrome.css,
                       tape08-tokens.css, hardware-ui.css/.js, t8-ui.css/.js, svg-utils.js)
                       referenced by components and Instagram_Visuals pieces alike — see "Design
                       systems" below
assets/                fonts, media, reference images used across the library
demos/                 a few standalone demo pages (TAPE 08 Design Language, cryptex, ui-kit)
sketches/              older one-off CodePen-style experiments (ball, map) — not part of the library
docs/                  misc project docs (transmute.md)
workshop-slide-assets/ Teenage Engineering–style line-drawing assets for a "Design and Research in
                       the Age of AI" talk — slide PNGs (dark/light), print handouts, and the Python/
                       canvas sources that generate them. See its own README.md.
archive/               retired/superseded work: an old portfolio (portfolio2020), a dead sweep of
                       in-progress files (_sweep), and loose-exports/ (superseded duplicates of files
                       that now live properly under components/ or Instagram_Visuals/)
```

## Design systems

`shared/tokens.css` is the one file: every token this repo uses lives there, as a default theme
plus `data-theme` variants selected on `<html>` (same mechanism as any per-file dark/light switch).
Pick one when starting something new:

- **No `data-theme`** — the default: portfolio-orange instrument-panel look (`--bg/--panel/--ink/
  --accent`). Used by most of `tools/*` and `Instagram_Visuals/pieces/*`.
- **`data-theme="t8"`** — TAPE 08 hardware/DAW instrument look (`--t8-*`: amber transport, red/
  green/cyan signals with one meaning each, 8 track hues, Martian Mono displays). Also still
  available as a standalone `shared/tape08-tokens.css` (byte-identical values) for the ~20 existing
  files — `tools/patch/`'s component kit among them — written against that file directly; both are
  valid, interchangeable sources for the same tokens. `shared/hardware-ui.css` + `shared/
  hardware-ui.js` (`window.HWUI`) are a second, decoupled source for five of `tools/patch/`'s
  components — knob, cable, port, LED bypass, param-control — ported verbatim so any tool can use
  hardware-style controls without the patch-bay app's node-graph data model; `tools/patch/` itself
  is untouched and keeps using its own `window.Patch`. See `shared/hardware-ui-gallery.html` for a
  live specimen of all five. `tools/patch/`'s other components (node-card, inspector, legend,
  top-strip, node-library, patch-canvas, transport-bar) are the patch-bay app's own screens, not
  generic widgets, and weren't extracted; `tools/patch-bay/` is an older, superseded single-file
  version of `tools/patch/` with nothing beyond what the current modular version already has.
  `shared/t8-ui.css` + `shared/t8-ui.js` are a third, *new* (not ported) component set in this
  same visual language, covering the general app-UI vocabulary tools/patch never needed — the
  shape of catalog shadcn/ui is known for: button, input, select, checkbox, switch, slider, card,
  alert, table, breadcrumb, pagination, accordion (native `<details>`), tabs, dialog (native
  `<dialog>`), popover/dropdown menu (native `[popover]`, JS only positions it under its trigger),
  tooltip (pure CSS), toast. `.t8-` prefixed classes, opt-in, no bare element selectors. See
  `shared/t8-ui-gallery.html` for a live, interactive specimen of every component.
- **`data-theme="fish"`** — the fish-tool bestiary's dark/serif look (`--void/--surface/--sock/
  --root-c/--derived-c`, Fraunces display face). Extracted 2026-10-30 from three files that had
  copy-pasted this exact block with no shared source of truth; now canonical here.

`shared/chrome.css` is the component layer `tokens.css` never had — buttons, panels, badges, tiles,
nav, form fields, rowlists, stats — built against the default theme's names, opt-in (link it
alongside `tokens.css` only where you want it; nothing auto-applies). Every selector is a `.ui-`
prefixed class, never a bare element, so it can't change rendering on files that don't link it. See
`shared/chrome-gallery.html` for a live specimen of every class. Extracted 2026-10-30 from
`tools/fish-tool/Support Ecology Quiz.html`, filled out against a gap list (badge, nav, tile,
divider, footer — none of which existed in this theme) pulled from an external reference token spec
(teenage.engineering's marketing site, via shadcn.io/design) — its hairline-only/zero-shadow
elevation principle was already true of this repo's own look; its component checklist is what
exposed the gaps. Its literal zero-radius rectangles and monochrome palette were not adopted — this
theme keeps its own chamfered-corner shape language and accent colour.

`Instagram_Visuals/Visual_Essay/design-system/` (`--ds-*`) is the one deliberate exception, kept
separate rather than folded in as a fourth theme: it targets a different medium entirely — fixed
1280×720 (and a 1080×1920 port in `../templates/`, `--rt-*`, same values) slide/video canvases for
export, not responsive interactive UI. See that folder's own README for its component vocabulary
and the `../templates/` vs `../genui-ep1/` relationship.

## A note on near-duplicate names

Several `components/interaction/` folders look like duplicates but aren't — they're deliberate revisions, kept side by side rather than overwritten:

- `rain-vortex` / `rain-vortex-rev-b` — the second pass adds a valve sequencer, exploded view and an Ikeda-style data raster.
- `reliquary` / `reliquary-compass` — different pieces: Reliquary is a lock-dial vitrine, Reliquary Instrument is a compass study (Compass Studies panel I).
- `ophanim` / `ophanim-iris` — the original gaze-reactive wheel mechanism, and a reimagining of its eyes as mechanical lens diaphragms.
- `spine-section` / `spine-polar` / `spine-lock` / `spine-lock-alert` / `spine-unit` — a family of pieces sharing the spine/vertebra bracket language, each a different mechanic.

If you're extending one of these, check which one `index.html`'s entry points at before assuming it's the canonical copy.

## Running it

Everything is a static file — serve the repo root and open `index.html`:

```sh
python3 -m http.server 8765
open http://localhost:8765/index.html
```

`Instagram_Visuals/` has its own run/export instructions in `Instagram_Visuals/README.md`.
