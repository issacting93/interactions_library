# Patch: component breakdown

The source is the "Patch — node graph effect builder" mockup (`../Patch — node graph effect builder-html/Patch.dc.html`). It was one React/dc-runtime template and is now twelve standalone components with no build step. They share a core, and anime.js handles motion.

Open `index.html` for the list, `patch.html` for the reassembled view, or any `components/<name>/<name>.html` for that part alone.

## Layout

```
Patch/
  PLAN.md
  index.html                 component index
  patch.html                 full view: every component wired to one store
  vendor/anime.umd.min.js    anime.js v4.5.0 (MIT), vendored so file:// works offline
  shared/
    patch-core.js            data model, maths, graph analysis, store, actions, h(), motion helpers
    patch.css                base styles + demo-page chrome
  components/<name>/
    <name>.js                the component: P.ui.<name>(…) → { el, update(…) }
    <name>.css               its styles
    <name>.html              standalone demo + API table
```

Tokens come from `../../shared/tape08-tokens.css`.

## Inventory

| Code | Component | Built from | What it is |
|---|---|---|---|
| KNB-01 | `knob` | — | 270° rotary readout, mini (30 px) or full (46 px). Optional drag and keyboard input. |
| PRM-02 | `param-control` | knob | Inspector row: knob, label, value and slider, kept in sync. |
| PRT-03 | `port` | — | Jack and label. States: open, connected, armed, pending; SC is square. |
| LED-04 | `led-bypass` | — | ON / BYP toggle with an LED in the module colour. |
| CBL-05 | `cable` | — | Bezier cord. Kinds: audio, sc, feedback, illegal, ghost. |
| NOD-06 | `node-card` | knob, port | One module: header, jacks, mini knobs. `nodeCard.view()` maps state to props. |
| LIB-07 | `node-library` | — | Grouped palette; tap to add. |
| CNV-08 | `patch-canvas` | node-card, cable | Header, hint and grid. Handles drag, patching and the ghost cable, with nodes and cables keyed by id. |
| INS-09 | `inspector` | param-control, led-bypass | Node or cable detail, processing order, rules. |
| LEG-10 | `legend` | — | Key to cable kinds. |
| TRN-11 | `transport-bar` | legend | AUDITION, SAVE AS FX, RESET and the toast. |
| TOP-12 | `top-strip` | — | Brand, tabs, audition status, CPU. |

## How the parts talk

- `P.createStore(P.initialState())` holds the whole patch: nodes, edges, selection, the pending output, audition and toast.
- `P.createActions(store)` holds every intent, ported 1:1 from the mockup's logic: `clickOut`, `clickIn`, `addNode`, `moveNode`, `setParam`, `toggleNode`, `removeNode`, `removeEdge`, `select`, `toggleAudition`, `saveFx`, `reset`.
- Components read state through `update(state)` and write through actions. Only the atoms (knob, port, cable, LED, param-control) take plain props, so they can be reused outside the patch.
- `P.analyse(nodes, edges)` classifies every cable as audio, sc, feedback or illegal. It then topo-sorts with feedback cut at each DELAY to get processing order and PDC.

## Motion (anime.js)

Everything goes through `P.animate()`. If anime.js is missing or the viewer prefers reduced motion, the end state is applied at once.

| Where | Motion |
|---|---|
| Canvas, first load | Cards spring in one by one (55 ms stagger), then cables draw on from their outputs |
| Canvas, RESET / external move | Nodes spring to their new positions and cables follow every frame |
| Canvas, drag | Card lifts (scale 1.03, deeper shadow) and settles on a spring when dropped |
| Canvas, patching | A ghost cable trails the pointer (160 ms ease); armed inputs breathe |
| New / removed cable | Stroke draws on (outQuart, 620 ms) / fades out |
| Knobs | Values tween (outExpo, 460 ms); direct drags stay instant |
| Order badge, status pill, port, swatch, LED | Spring pop on change or press |
| Inspector | Panel and its rows stagger in when the selection changes; the processing order list cascades |
| Toast, hint, CPU, PDC | Slide or fade in; numbers count to their new value |

## Changes from the mockup

- Knobs in the inspector can be dragged as well as set with the slider.
- The ghost cable while patching is new. In the mockup only the port lit up.
- Esc cancels an armed output.
- The view tabs are plain labels, because ARRANGE, MIX and EXPORT pages don't exist here.
- There is no audio. The mockup had none either. `tools/patch-bay/patch.html` is the sounding version, and its engine could later be wired to `store.subscribe`.
