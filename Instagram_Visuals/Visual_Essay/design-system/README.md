# Design system: Design Research in the Age of AI (16:9)

The style guide and component library extracted from `Visual_Essay/Design Research in the Age of
AI (2).pdf` (39 content slides + appendix, by Issac Ting, 2026) — pure black ground, a single
monospace face throughout, letter-spaced micro-labels, hairline rules, a three-colour "part"
system for the deck's three acts (look back / what AI changed / what we need), and an eight-colour
categorical palette carried across every network and legend diagram.

This is the **source-deck** system, native 16:9. It's a different thing from `../templates/` next
door, which *ports* four of this deck's diagrams to a fixed 9:16 canvas for Instagram video export.
Reach for this folder when building new 16:9 slides, static graphics, or web pages in the deck's own
language; reach for `../templates/` when you need a vertical, puppeteer-capturable animated loop.

## Layout

```
design-system/
  README.md
  tokens.css        colour, type, spacing variables
  components.css    every reusable class, grouped: stage/chrome, text/list patterns,
                     stat/comparison patterns, diagram primitives, special slides
  gallery.html       the style guide itself — foundations (colour/type/motif) followed by a
                      worked specimen of every slide pattern, each citing its source page
```

## Using it

1. Load `tokens.css` then `components.css` (in that order — components depend on the tokens).
2. Build a slide inside `<div class="ds-stage">…</div>` — a fixed 1280×720 canvas, near-black
   ground, monospace ink.
3. Compose from the classes in `components.css`. Most patterns are generic (`.ds-rowlist`,
   `.ds-cols`, `.ds-stats`, `.ds-cardgrid`, `.ds-index`, `.ds-matrix`, `.ds-pullquote`,
   `.ds-prompt`); the five diagram types (network, timeline, flow, cycle, relation) ship only
   *primitives* (`.ds-node`, `.ds-edge`, `.ds-swimlane`) because the source deck hand-places every
   one of those per diagram rather than auto-laying them out. Copy the closest specimen in
   `gallery.html` and edit its coordinates/content rather than building a diagram from scratch.
4. `.ds-cover` handles both the title slide and every section divider (same Venn-motif-on-a-dot-grid
   layout, different body content).
5. `.ds-closing` inverts the palette (amber ground, near-black ink) for the one full-bleed
   pull-quote slide at the end of a deck — use sparingly, it's a single closing beat, not a general
   "emphasis" background.

## Preview

```sh
# from the repo root
python3 -m http.server 8765
open http://localhost:8765/Instagram_Visuals/Visual_Essay/design-system/gallery.html
```

No build step — `gallery.html` just links the two CSS files next to it.

## Extending

Adding a new slide pattern: find the closest existing specimen in `gallery.html`, copy its markup,
and either reuse an existing class from `components.css` or add a new one in the matching section
(text/list, stat/comparison, diagram primitive, or special). Keep new colours inside the existing
token roles (`--ds-part1/2/3` for act identity, `--ds-emphasis` for pull-quotes/highlights, the
`--ds-cat-*` eight for categorical/role coding) rather than introducing ad hoc hex values — the
deck never does, and it's what keeps 39 slides reading as one system.

## Borrowed motifs

`components.css` section 5 and `gallery.html`'s "Borrowed motifs" block (after the main catalog,
before the colophon) are the one place this library steps outside the source deck: `.ds-dial` (a
radial address index), `.ds-chipstrip` (a captured-sequence strip), and `.ds-readout` (a measured-
data band) are structurally adapted from `Instagram_Visuals/pieces/datamatics` and `pieces/gear-lock`
— both monochrome instrument-panel pieces with their own distinct visual language — then re-skinned
in this system's tokens rather than copied wholesale. Each specimen cites its real source (a
`pieces/` path, not a deck page number) and each footer reads `FROM PIECES/…` instead of a page
count, so neither looks like it came from the PDF. If you add a fourth borrowed motif, hold it to
the same bar: cite the real source, re-skin in `--ds-*` tokens, and don't let it crowd out an
existing deck-native pattern that already covers the same job.
