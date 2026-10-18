# portfolio2020 — archive & lineage

Raw snapshot of [`issacting93/portfolio2020`](https://github.com/issacting93/portfolio2020)
(Svelte + Rollup, 2020), pulled in whole for reference. This folder is a historical
source snapshot, not an active app — don't `npm install` or build it here. If a piece
of it needs to live in the working library, port it into `components/<category>/` as a
self-contained HTML file (see the conventions in `shared/tokens.css` and any existing
component for the pattern) rather than editing in place.

## Lineage: `src/*.svelte` → component library

| Source (`src/`) | Status | Library path |
|---|---|---|
| `RadialInterface.svelte` | ported | `components/motion/radial-interface/` |
| `SpineSection.svelte` | ported | `components/interaction/spine-section/` |
| `Blob.svelte` | ported | `components/physics/blob/` |
| `mapIndicator.svelte` | ported | `components/interaction/map-indicator/` |
| `ParallaxComponent.svelte` | ported | `components/motion/parallax/` |
| `SVGgridComponent.svelte` | ported | `components/motion/svg-grid/` |
| `SVGscifiFrame.svelte` | ported | `components/motion/scifi-frame/` |
| `terrain.svelte` | ported | `components/layout/terrain-section/` |
| `SVGSpineUnitLeft.svelte` / `SVGSpineUnitRight.svelte` | ported (new) | `components/interaction/spine-unit/` |
| `SVGscifiMod01.svelte` / `SVGscifiMod02.svelte` | ported (new) | `components/motion/scifi-badge/` |
| `arrow.svelte` | ported (new) | `components/interaction/draw-arrow/` |
| `About.svelte`, `Menu.svelte`, `CaseStudy.svelte`, `App.svelte`, `section01.svelte`, `section02.svelte` | not ported | page/layout scaffolding specific to the 2020 portfolio site, not reusable interaction components |

Static assets referenced by the above (`public/images/*.svg`, `src/*.svg`) are kept
alongside the source for context; the ported components inline their own SVG paths
and don't depend on this folder at runtime.
