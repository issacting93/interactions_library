# Workshop slide assets — Design and Research in the Age of AI

Teenage Engineering–style line drawings for the deck. Inter 200–400, hairlines, square corners, one amber accent (#f0a800).

## slides/png
Ten slide assets at 1792×828 (2× resolution, 3584×1656), each in `-dark` (#0f0e12) and `-light` (#f6f8f7).
Drop them into the slide's content area (128px margins on a 1920×1080 slide).

01 toolbox · 02 craft shifts · 03 a design, or a tool? · 04 floor and ceiling ·
05 making vs discovering · 06 a bible, not a conversation · 07 renaissance chain ·
08 computers as social actors · 09 uncanny valley · 10 what we already know

- `01b-the-missing-four` — companion to 01: pays off the toolbox's dashed/ghost
  compartments (simulation · statistics · evals · social science) with simplified
  line-icon instruments inspired by four `Instagram_Visuals/pieces` generative
  pieces (compass → simulation, signal-wheel → statistics, geared-reticle →
  evals, rosette → social science). Slide 01 itself is left untouched — the
  "missing" framing there is the hook; this is the reveal, meant to slot in
  wherever the talk pays it off (not necessarily right after 01).

## print
- `11-question-sheet-a4` — A4 interview sheet (PDF for printing, PNG for slides)
- `12-wall-plot-poster-a3` — A3 landscape wall plot (PDF + PNG)

## source
- `canvas/` — the editable artboards (.dc.html) and canvas layout, as on the Design canvas
- `scripts/` — the Python generators; `iso.py` is the isometric line-drawing kit used for the toolbox.
  `build_missing_four.py` generates `01b-the-missing-four-{dark,light}.html` directly (no Board/dc.py
  dependency, since its icons aren't isometric).
- To re-render any `.dc.html`/generated `.html` into the shipped PNGs without the Design canvas app:
  resolve each `{{token}}` color placeholder for the theme (see the dict in `dc.py`'s `renderVals`),
  then screenshot at `--force-device-scale-factor=2 --window-size=1792,828` with headless Chrome.

## references collected
- TE guides and press kits (hardware overviews, assembly guides): https://teenage.engineering/llms.txt
- TE writes in lowercase — Jesper Kouthoofd, SFMOMA: https://www.sfmoma.org/read/stay-curious-stay-naive-an-interview-with-teenage-engineering-jesper-kouthoofd/
- TE design-system breakdown: https://blakecrosley.com/ja/guides/design/teenage-engineering
- build123d technical drawings (hidden lines, dimensions): https://build123d.readthedocs.io/en/latest/tech_drawing_tutorial.html
- three-svg-renderer (3D scene → SVG line art): https://www.npmjs.org/package/three-svg-renderer
- vsketch / vpype (plotter-style line art): https://vsketch.readthedocs.io/
- hatched (line hatching): https://github.com/plottertools/hatched/
- Zdog (flat pseudo-3D): https://zzz.dog/
- Maker.js (precise 2D geometry): https://maker.js.org/
- Visual directions discussed: exploded CAD enclosure, exploded stack with callouts, isometric process map with figures, instrument-panel / HUD
