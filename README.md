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
Instagram_Visuals/     the social-posting pipeline: stage/ (capture → MP4/PNG/Figma SVG),
                       pieces/<id>/ (one adapter per posted piece). See its own README.md and PLAN.md
                       for the series/designation system (e.g. DTM-17).
shared/                design tokens and small utilities (tape08-tokens.css, tokens.css, svg-utils.js)
                       referenced by components and Instagram_Visuals pieces alike
assets/                fonts, media, reference images used across the library
demos/                 a few standalone demo pages (TAPE 08 Design Language, cryptex, ui-kit)
sketches/              older one-off CodePen-style experiments (ball, map) — not part of the library
docs/                  misc project docs (transmute.md)
archive/               retired/superseded work: an old portfolio (portfolio2020), a dead sweep of
                       in-progress files (_sweep), and loose-exports/ (superseded duplicates of files
                       that now live properly under components/ or Instagram_Visuals/)
```

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
