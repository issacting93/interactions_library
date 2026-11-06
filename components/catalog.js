/* components/catalog.js — the library's catalogue: every interface study, component and tool, and
   where each component came from (a study panel, another component, or the tool it was made in).

   One list, read by index.html (the gallery) and interface-studies/index.html. It is a script, not a .json,
   so both pages still work opened straight from disk (file://), where fetch() is blocked.
   Check it against the files on disk:   node components/check-catalog.cjs

   Ids are stable: link and refer by id. Names, tags and descriptions can change freely. */
window.LIBRARY_CATALOG = {
 "version": 1,
 "about": "The one list of what is in the library: studies, components and tools, and where each component came from. index.html (the gallery) and interface-studies/index.html read it; components/check-catalog.cjs checks it against the files on disk. Ids never change; names, tags and descriptions can.",
 "categories": [
  "physics",
  "motion",
  "interaction",
  "layout",
  "generative",
  "rigged"
 ],
 "studies": [
  {
   "id": "01-ophanim",
   "n": 1,
   "name": "Ophanim",
   "file": "interface-studies/01-ophanim.html"
  },
  {
   "id": "02-ophanim-iris",
   "n": 2,
   "name": "Ophanim Iris",
   "file": "interface-studies/02-ophanim-iris.html"
  },
  {
   "id": "03-reliquary",
   "n": 3,
   "name": "Reliquary",
   "file": "interface-studies/03-reliquary.html"
  },
  {
   "id": "04-compass-studies",
   "n": 4,
   "name": "Compass Studies",
   "file": "interface-studies/04-compass-studies.html",
   "panels": [
    "I",
    "II",
    "III",
    "IV"
   ]
  },
  {
   "id": "05-signal-and-mass",
   "n": 5,
   "name": "Signal and Mass",
   "file": "interface-studies/05-signal-and-mass.html"
  },
  {
   "id": "06-rain-vortex",
   "n": 6,
   "name": "Rain Vortex",
   "file": "interface-studies/06-rain-vortex.html"
  },
  {
   "id": "07-rain-vortex-rev-b",
   "n": 7,
   "name": "Rain Vortex Rev B",
   "file": "interface-studies/07-rain-vortex-rev-b.html"
  },
  {
   "id": "08-ophanim-wheels",
   "n": 8,
   "name": "Ophanim Wheels",
   "file": "interface-studies/08-ophanim-wheels.html"
  }
 ],
 "extras": [
  {
   "file": "interface-studies/board/index.html",
   "name": "Board",
   "description": "Every idea on one canvas"
  }
 ],
 "ignore": [
  {
   "file": "components/generative/graphite-halo/graphite-halo-draft.html",
   "why": "earlier draft of graphite-halo, kept for reference"
  }
 ],
 "components": [
  {
   "id": "blob",
   "name": "Blob",
   "file": "components/physics/blob/blob.html",
   "category": "physics",
   "tags": [
    "canvas",
    "pointer",
    "organic"
   ],
   "description": "Physics-driven fluid blob that follows the cursor"
  },
  {
   "id": "gooey-node-bloom",
   "name": "Gooey Node Bloom",
   "file": "components/physics/goo-bloom/gooey-node-bloom.html",
   "category": "physics",
   "tags": [
    "svg",
    "goo",
    "graph"
   ],
   "description": "Spring-physics node graph with metaball goo filter"
  },
  {
   "id": "polar-dial",
   "name": "Polar Dial",
   "file": "components/physics/polar-dial/polar_dial_v8.html",
   "category": "physics",
   "tags": [
    "svg",
    "spring",
    "goo",
    "polar",
    "selector"
   ],
   "description": "Spring-orbit satellite dial with goo filter, caret reader, and parametric chrome bands"
  },
  {
   "id": "parallax",
   "name": "Parallax Rings",
   "file": "components/motion/parallax/parallax.html",
   "category": "motion",
   "tags": [
    "parallax",
    "svg",
    "mouse"
   ],
   "description": "Mouse-tracking parallax with rotating SVG rings"
  },
  {
   "id": "svg-grid",
   "name": "SVG Grid",
   "file": "components/motion/svg-grid/svg-grid.html",
   "category": "motion",
   "tags": [
    "svg",
    "animation",
    "vivus"
   ],
   "description": "Vivus-animated SVG grid with draw-on animation"
  },
  {
   "id": "scifi-frame",
   "name": "Sci-Fi Frame",
   "file": "components/motion/scifi-frame/scifi-frame.html",
   "category": "motion",
   "tags": [
    "svg",
    "frame",
    "glow"
   ],
   "description": "Four-corner sci-fi frame with pulsing glow filter"
  },
  {
   "id": "radial-interface",
   "name": "Radial Interface",
   "file": "components/motion/radial-interface/radial-interface.html",
   "category": "motion",
   "tags": [
    "svg",
    "radial",
    "scifi"
   ],
   "description": "Rotating radial UI with sci-fi badge glyphs"
  },
  {
   "id": "map-indicator",
   "name": "Map Indicator",
   "file": "components/interaction/map-indicator/map-indicator.html",
   "category": "interaction",
   "tags": [
    "button",
    "ripple",
    "pulse",
    "css"
   ],
   "description": "Map-style pulse ripple button with hover/click states"
  },
  {
   "id": "spine-section",
   "name": "Spine Section",
   "file": "components/interaction/spine-section/spine-section.html",
   "category": "interaction",
   "tags": [
    "hover",
    "slideshow",
    "nav"
   ],
   "description": "Collapsible spine navigation with project slideshow"
  },
  {
   "id": "spine-polar",
   "name": "Spine / Polar",
   "file": "components/interaction/spine-polar/spine_polar.html",
   "category": "interaction",
   "tags": [
    "hover",
    "nav",
    "goo",
    "spring"
   ],
   "description": "Spine navigation unrolled into a polar rotor/stator design"
  },
  {
   "id": "spine-lock",
   "name": "Spine Lock",
   "file": "components/interaction/spine-lock/spine-lock.html",
   "category": "interaction",
   "tags": [
    "svg",
    "hud",
    "key",
    "lock",
    "click"
   ],
   "description": "Vertebra spine that locks outward from the centre in four stages on a press of the key"
  },
  {
   "id": "spine-lock-alert",
   "name": "Spine Lock — Alert",
   "file": "components/interaction/spine-lock-alert/spine-lock-alert.html",
   "category": "interaction",
   "tags": [
    "svg",
    "hud",
    "key",
    "lock",
    "click",
    "bilingual"
   ],
   "description": "Hazard-striped spine lock variant with a bilingual HUD, segment spec table, and live oscillograph",
   "from": [
    {
     "kind": "component",
     "id": "spine-lock",
     "note": "variant of"
    }
   ]
  },
  {
   "id": "keyboard-hud",
   "name": "Keyboard HUD",
   "file": "components/interaction/keyboard-hud/keyboard-hud.html",
   "category": "interaction",
   "tags": [
    "keyboard",
    "hud",
    "dial",
    "menu",
    "glassmorphism"
   ],
   "description": "Interactive modifiers panel showing dynamic media sliders, rotary scroll, and symbol overlays"
  },
  {
   "id": "section02",
   "name": "Terrain Section",
   "file": "components/layout/terrain-section/section02.html",
   "category": "layout",
   "tags": [
    "terrain",
    "svg",
    "full-page"
   ],
   "description": "Full-page terrain SVG with animated grid and map markers"
  },
  {
   "id": "range-region",
   "name": "Range Region",
   "file": "components/motion/range-region/range-region.html",
   "category": "motion",
   "tags": [
    "conic-gradient",
    "hud",
    "static"
   ],
   "description": "Sci-fi HUD with conic-gradient loading ring and region readout"
  },
  {
   "id": "radar-display",
   "name": "Radar Display",
   "file": "components/motion/radar-display/radar-display.html",
   "category": "motion",
   "tags": [
    "canvas",
    "radar",
    "sweep",
    "tracking"
   ],
   "description": "Auto-rotating canvas radar with sweep trail and blip targets"
  },
  {
   "id": "cyberpunk-dial",
   "name": "Cyberpunk Dial",
   "file": "components/interaction/cyberpunk-dial/cyberpunk-dial.html",
   "category": "interaction",
   "tags": [
    "svg",
    "dial",
    "rotating",
    "scifi",
    "slider"
   ],
   "description": "Multi-ring cyberpunk dial with auto-rotation, slider override, and glitch effect"
  },
  {
   "id": "geared-reticle",
   "name": "Geared Reticle",
   "file": "components/interaction/geared-reticle/geared-reticle.html",
   "category": "interaction",
   "tags": [
    "svg",
    "dial",
    "patch",
    "gears",
    "noise",
    "tape08",
    "anime"
   ],
   "description": "Cyberpunk Dial rev B: the counter-geared rings driven by a patchable gear train (Patch knobs, jacks and cords), a Graphite Halo interference band the sweep morphs, lock freezes it, and a loop in the train jams it",
   "from": [
    {
     "kind": "component",
     "id": "cyberpunk-dial",
     "note": "rev B of"
    }
   ]
  },
  {
   "id": "signal-wheel",
   "name": "Signal Wheel",
   "file": "components/interaction/signal-wheel/signal-wheel.html",
   "category": "interaction",
   "tags": [
    "svg",
    "drag",
    "polarity",
    "likelihood"
   ],
   "description": "Draggable SVG wheel for polarity and likelihood input with animated dial"
  },
  {
   "id": "helm-dial",
   "name": "Helm Dial",
   "file": "components/interaction/helm-dial/helm-dial.html",
   "category": "interaction",
   "tags": [
    "svg",
    "drag",
    "gradient",
    "radar",
    "lock-on"
   ],
   "description": "Deconstructed from pieces/steampunk.svg’s cockpit console: an outer bezel with a smaller ring+glow “aim” assembly deliberately offset toward the bottom, draggable within the bezel, glass-marble nucleus turns green on lock"
  },
  {
   "id": "gear-lock",
   "name": "Gear Lock",
   "file": "components/interaction/gear-lock/gear-lock.html",
   "category": "interaction",
   "tags": [
    "svg",
    "drag",
    "gear-train",
    "lock-on",
    "sequencer",
    "keyboard"
   ],
   "description": "A targeting sequencer synthesised from four pieces: cyberpunk-dial’s counter-rotating gear train positions helm-dial’s offset aim point onto radial-depth-style target zones; locking flashes green and commits a chip to a dyad-style sequence strip with undo"
  },
  {
   "id": "reliquary",
   "name": "Reliquary",
   "file": "components/interaction/reliquary/reliquary.html",
   "category": "interaction",
   "tags": [
    "svg",
    "lock-on",
    "sequencer",
    "ambient",
    "autoplay"
   ],
   "description": "Lock dial reassembles a six-fragment emblem one seal at a time, ambient/autoplaying — rubric-red cyber-reliquary vitrine, no user input",
   "from": [
    {
     "kind": "study",
     "id": "03-reliquary"
    }
   ]
  },
  {
   "id": "boids",
   "name": "Boids",
   "file": "components/interaction/boids/boids.html",
   "category": "interaction",
   "tags": [
    "three.js",
    "webgl",
    "3d",
    "flocking",
    "click",
    "constellation"
   ],
   "description": "Click anywhere to call a 3D flock (separation/alignment/cohesion) to that point; white point boids thread faint constellation lines only when genuinely close, release back to ambient after a few seconds idle",
   "from": [
    {
     "kind": "component",
     "id": "murmuration-rosette",
     "note": "engine extracted from"
    }
   ]
  },
  {
   "id": "murmuration-rosette",
   "name": "Murmuration Rosette",
   "file": "components/interaction/murmuration-rosette/murmuration-rosette.html",
   "category": "interaction",
   "tags": [
    "three.js",
    "webgl",
    "3d",
    "svg",
    "flocking",
    "radial-menu",
    "patch"
   ],
   "description": "Rosette’s 8-node radial dial (decor rings, Graphite Halo isolines, 50-tick spring ring, Stray Robotalk glyphs) layered over a live boid flock in 3D — selecting a node calls the flock to it; fresnel core sphere behind the centre button"
  },
  {
   "id": "datamatics",
   "name": "Datamatics",
   "file": "components/interaction/datamatics/datamatics.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "flocking",
    "barcode",
    "data",
    "monochrome",
    "click"
   ],
   "description": "Boids reconstructed in an Ikeda register: the flock is plotted as a stark dot-matrix (no glow), called to one of 8 ring addresses, and read back as a live barcode + bin/hex tape keyed to its real thread-count and distance-to-target"
  },
  {
   "id": "terrain-grid",
   "name": "Terrain Grid",
   "file": "components/generative/terrain-grid/terrain-grid.html",
   "category": "generative",
   "tags": [
    "svg",
    "procedural",
    "simplex",
    "marching-squares",
    "terrain",
    "ripple",
    "coordinate-grid"
   ],
   "description": "Procedural contour terrain (simplex fbm + marching squares, stitched into flowing lines) that draws on over hover, with ripple markers at the field’s local peaks and a coordinate-grid reference frame — ported from components/layout/terrain-section",
   "from": [
    {
     "kind": "component",
     "id": "section02",
     "note": "reference frame ported from"
    }
   ]
  },
  {
   "id": "terrain-displacement",
   "name": "Terrain Displacement",
   "file": "components/generative/terrain-displacement/terrain-displacement.html",
   "category": "generative",
   "tags": [
    "three.js",
    "webgl",
    "3d",
    "simplex",
    "marching-squares",
    "terrain",
    "displacement",
    "chromatic-aberration"
   ],
   "description": "The same noise contours as Terrain Grid, draped onto a real displaced 3D surface and viewed in perspective, with an RGB-shift post pass (white lines read green with red/blue fringing) and glow beacons tethered to the field’s peaks"
  },
  {
   "id": "terrain-isometric",
   "name": "Terrain Isometric",
   "file": "components/generative/terrain-isometric/terrain-isometric.html",
   "category": "generative",
   "tags": [
    "three.js",
    "webgl",
    "3d",
    "isometric",
    "orthographic",
    "terrain",
    "markers",
    "compass"
   ],
   "description": "Terrain Displacement’s field under a true isometric orthographic camera in a wireframe vitrine — click the terrain to tag it, dropping a tethered flag marker in the “TRN ###” readout style from pieces/compass/terrain-concept"
  },
  {
   "id": "particle-constellation",
   "name": "Particle Constellation",
   "file": "components/generative/particle-constellation/particle-constellation.html",
   "category": "generative",
   "tags": [
    "canvas",
    "particles",
    "network",
    "glitch"
   ],
   "description": "Floating particle network with proximity connections, grid underlay, and random glitch bursts"
  },
  {
   "id": "boid-field",
   "name": "Boid Field",
   "file": "components/generative/boid-field/boid-field.html",
   "category": "generative",
   "tags": [
    "three.js",
    "webgl",
    "3d",
    "flocking",
    "ambient",
    "background"
   ],
   "description": "A 3D flock of instanced boids (separation/alignment/cohesion) drifting through a foggy volume, slow orbiting camera, amber lead boids — ambient background layer, house ink/accent palette"
  },
  {
   "id": "karbandi",
   "name": "Karbandi Lattice",
   "file": "components/generative/karbandi/karbandi.html",
   "category": "generative",
   "tags": [
    "svg",
    "procedural",
    "radial",
    "islamic-geometry",
    "ambient",
    "pointer"
   ],
   "description": "Persian karbandi circle-division geometry — chords connect every point to the one k steps away, opening a glowing shamseh medallion at centre; pointer x tunes the step live, division count drifts on its own, lattice turns slowly"
  },
  {
   "id": "graphite-halo",
   "name": "Graphite Halo",
   "file": "components/generative/graphite-halo/graphite-halo.html",
   "category": "generative",
   "tags": [
    "canvas",
    "noise",
    "contour",
    "hand-drawn"
   ],
   "description": "Concentric rings plus contour lines traced through a domain-warped noise field masked to the ring band; “boil” re-jitters line pressure like frames of a hand-drawn loop"
  },
  {
   "id": "tracking-iris",
   "name": "Tracking Iris",
   "file": "components/interaction/tracking-iris/tracking-iris.html",
   "category": "interaction",
   "tags": [
    "mouse",
    "tracking",
    "eye",
    "css"
   ],
   "description": "CSS iris and pupil that follow the cursor via clamped CSS custom properties"
  },
  {
   "id": "rosette",
   "name": "Rosette",
   "file": "components/interaction/rosette/rosette.html",
   "category": "interaction",
   "tags": [
    "dial",
    "radial",
    "narrative",
    "state-machine"
   ],
   "description": "3-state radial menu — crosshair center button, 8 SVG-icon nodes, tick ring rotates on selection"
  },
  {
   "id": "hex-workspace",
   "name": "Hex Workspace",
   "file": "components/interaction/hex-workspace/hex-workspace.html",
   "category": "interaction",
   "tags": [
    "hex",
    "graph",
    "trace",
    "drag",
    "selection"
   ],
   "description": "6-node hexagonal workspace with SVG connection graph and pointer-trace multi-selection"
  },
  {
   "id": "dyad",
   "name": "Motif",
   "file": "components/interaction/dyad/dyad.html",
   "category": "interaction",
   "tags": [
    "svg",
    "spring",
    "dual",
    "ring",
    "sequencer",
    "music",
    "synth"
   ],
   "description": "Synth phrase composer — spin inner ring for pitch (C–A), outer ring for duration (○ ♩ ♪ ♫), commit note pairs to strip"
  },
  {
   "id": "sweep-path",
   "name": "Sweep Path",
   "file": "components/physics/sweep-path/sweep-path.html",
   "category": "physics",
   "tags": [
    "canvas",
    "sequencer",
    "sweep",
    "audio",
    "polar"
   ],
   "description": "Spatial step sequencer — arm hex nodes, sweep arm fires them in angular order at BPM tempo"
  },
  {
   "id": "radial-depth",
   "name": "Radial Depth",
   "file": "components/interaction/radial-depth/radial-depth.html",
   "category": "interaction",
   "tags": [
    "svg",
    "spring",
    "goo",
    "polar",
    "selector"
   ],
   "description": "Two-level radial selector — annular bloom with spring-physics nodes and goo filter merge"
  },
  {
   "id": "spine-unit",
   "name": "Spine Unit",
   "file": "components/interaction/spine-unit/spine-unit.html",
   "category": "interaction",
   "tags": [
    "svg",
    "spring",
    "toggle",
    "portfolio2020"
   ],
   "description": "Mirrored spine bracket pair that locks together with a spring-driven seam glow on click"
  },
  {
   "id": "daisy-wheel",
   "name": "Daisy Wheel",
   "file": "components/interaction/daisy-wheel/daisy.html",
   "category": "interaction",
   "tags": [
    "svg",
    "spring",
    "sequencer",
    "degree-scale",
    "portfolio2020"
   ],
   "description": "Degree-scale reticle and knob-styled strike pad that write a struck phrase to a vertebra spine, borrowing Spine Section’s bracket language; auto-strike rings the dial after each hit"
  },
  {
   "id": "draw-arrow",
   "name": "Draw Arrow",
   "file": "components/interaction/draw-arrow/draw-arrow.html",
   "category": "interaction",
   "tags": [
    "svg",
    "hover",
    "vivus",
    "nav",
    "portfolio2020"
   ],
   "description": "Directional nav arrow that traces its own outline on hover, mirrored for prev/next"
  },
  {
   "id": "scifi-badge",
   "name": "Sci-Fi Badge",
   "file": "components/motion/scifi-badge/scifi-badge.html",
   "category": "motion",
   "tags": [
    "svg",
    "glow",
    "crossfade",
    "schematic",
    "portfolio2020"
   ],
   "description": "Ambient-pulsing sci-fi badge that crossfades into its exploded schematic view on click"
  },
  {
   "id": "ophanim",
   "name": "Ophanim",
   "file": "components/interaction/ophanim/ophanim.html",
   "category": "interaction",
   "tags": [
    "svg",
    "webcam",
    "mediapipe",
    "gaze",
    "hud",
    "ambient"
   ],
   "description": "Gothic wheel-within-a-wheel mechanism that releases outward when its gaze sensor meets your eyes via live webcam face tracking",
   "from": [
    {
     "kind": "study",
     "id": "01-ophanim"
    }
   ]
  },
  {
   "id": "ophanim-iris",
   "name": "Ophanim Iris",
   "file": "components/interaction/ophanim-iris/ophanim-iris.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "iris",
    "diaphragm",
    "hud",
    "parametric"
   ],
   "description": "Ophanim’s wheels of eyes reimagined as mechanical lens diaphragms that stop down when looked at, with a four-parameter control deck",
   "from": [
    {
     "kind": "study",
     "id": "02-ophanim-iris"
    }
   ]
  },
  {
   "id": "signal-and-mass",
   "name": "Signal and Mass",
   "file": "components/interaction/signal-and-mass/signal-and-mass.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "compass",
    "drag",
    "data-tape",
    "dual-register"
   ],
   "description": "One instrument sliced in two registers — a grained physical dial that lags, cut by a raw data tape that reads instantly",
   "from": [
    {
     "kind": "study",
     "id": "05-signal-and-mass"
    }
   ]
  },
  {
   "id": "rain-vortex",
   "name": "Rain Vortex",
   "file": "components/interaction/rain-vortex/rain-vortex.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "3d",
    "orbit",
    "line-drawing",
    "params",
    "architecture"
   ],
   "description": "Line-drawing study of the Jewel Changi oculus and waterfall, orbitable by drag, with a four-knob control deck and a cascade/trickle flow cycle",
   "from": [
    {
     "kind": "study",
     "id": "06-rain-vortex"
    }
   ]
  },
  {
   "id": "rain-vortex-rev-b",
   "name": "Rain Vortex Rev B",
   "file": "components/interaction/rain-vortex-rev-b/rain-vortex-rev-b.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "3d",
    "orbit",
    "line-drawing",
    "valve-sequencer",
    "exploded-view",
    "pointer"
   ],
   "description": "Rain Vortex rev B: hovering the water parts it, a gear-lock-style valve sequencer choreographs the six-valve cascade, and an exploded view and Ikeda-style data raster slice the curtain apart",
   "from": [
    {
     "kind": "study",
     "id": "07-rain-vortex-rev-b"
    }
   ]
  },
  {
   "id": "reliquary-compass",
   "name": "Reliquary Instrument",
   "file": "components/interaction/reliquary-compass/reliquary-compass.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "compass",
    "drag",
    "spring",
    "grain",
    "hardware"
   ],
   "description": "Deconstructed from Compass Studies, panel I — monochrome hardware compass with one red index, heavy bezel, and a damped needle card that overshoots and settles like a physical object",
   "from": [
    {
     "kind": "study",
     "id": "04-compass-studies",
     "panel": "I"
    }
   ]
  },
  {
   "id": "datamatic-tape",
   "name": "Datamatic Tape",
   "file": "components/interaction/datamatic-tape/datamatic-tape.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "compass",
    "drag",
    "barcode",
    "data",
    "monochrome"
   ],
   "description": "Deconstructed from Compass Studies, panel II — dial-less heading tape whose barcode band is generated live from the heading itself, no easing, raw value only",
   "from": [
    {
     "kind": "study",
     "id": "04-compass-studies",
     "panel": "II"
    }
   ]
  },
  {
   "id": "heaven-plate",
   "name": "Heaven Plate",
   "file": "components/interaction/heaven-plate/heaven-plate.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "compass",
    "drag",
    "luopan",
    "chinese-cosmology",
    "terminal"
   ],
   "description": "Deconstructed from Compass Studies, panel III — a working luopan behind a warning-orange terminal, Later Heaven trigrams, 24 mountains, and a live sitting/facing (坐/向) reading",
   "from": [
    {
     "kind": "study",
     "id": "04-compass-studies",
     "panel": "III"
    }
   ]
  },
  {
   "id": "volumetric-bearing",
   "name": "Volumetric Bearing",
   "file": "components/interaction/volumetric-bearing/volumetric-bearing.html",
   "category": "interaction",
   "tags": [
    "canvas",
    "compass",
    "drag",
    "3d",
    "geodesy",
    "exhibition"
   ],
   "description": "Deconstructed from Compass Studies, panel IV — a stack of light rings in perspective with real geodesy: magnetic/true heading via declination, great-circle bearing and distance to a waypoint",
   "from": [
    {
     "kind": "study",
     "id": "04-compass-studies",
     "panel": "IV"
    }
   ]
  },
  {
   "id": "wings",
   "name": "Wings",
   "file": "components/rigged/wings/wings.html",
   "category": "rigged",
   "tags": [
    "svg",
    "fk",
    "bone-rig",
    "flap",
    "gothic"
   ],
   "description": "22-bone forward-kinematic wing rig — paired feather/wing/claw bones flap on a sine wave with per-bone lag, composed through a parent chain for a gargoyle-wing flutter",
   "from": [
    {
     "kind": "tool",
     "id": "wing-rig",
     "note": "rigged in"
    }
   ]
  },
  {
   "id": "spine",
   "name": "Spine",
   "file": "components/rigged/spine/spine.html",
   "category": "rigged",
   "tags": [
    "svg",
    "fk",
    "bone-rig",
    "vertebra"
   ],
   "description": "Spine rig player: the Spine Lock Alert vertebrae as seven mirrored bone pairs on Wing Rig's FK pivot/wave engine, the chain running outward from the centre vertebra",
   "from": [
    {
     "kind": "component",
     "id": "spine-lock-alert",
     "note": "vertebrae from"
    },
    {
     "kind": "tool",
     "id": "wing-rig",
     "note": "rigged in"
    }
   ]
  },
  {
   "id": "weeping-seraph",
   "name": "Weeping Seraph",
   "file": "components/rigged/weeping-seraph/weeping-seraph.html",
   "category": "rigged",
   "tags": [
    "webgl2",
    "rig",
    "gaze",
    "stop-motion",
    "eldritch",
    "gothic"
   ],
   "description": "Two of Cybernetic Ecology's creatures (Halo-eyed seraph before Ophan halo monarch) drawn by its WebGL2 renderer, with spine rigs, iridescent shading, bloom and marine snow, ringed by a wheel of Kit eye rings. It holds perfectly still while you look at it, and glides into new poses when you look away; the whole frame, snow included, stops while watched. Six designs from different Ecology creatures (Seraph, Throne, Dominion, Moth, Watcher, Drowned). Its halo is a Sigil Forge seal spelling the design's name, one more letter and a small mutation each time you look away. Skins: holy (gold-leaf light shader on off-white, the default), bone, ember, phosphor",
   "look": "gothic",
   "mechanism": "watch",
   "from": [
    { "kind": "tool", "id": "forge", "note": "creatures and renderer from" },
    { "kind": "study", "id": "01-ophanim", "note": "wheel of eyes after" },
    { "kind": "tool", "id": "sigil-forge", "note": "halo seal from" }
   ]
  },
  {
   "id": "reliquary-specimen",
   "name": "Reliquary Specimen",
   "file": "components/generative/reliquary-specimen/reliquary-specimen.html",
   "category": "generative",
   "tags": [
    "svg",
    "bestiary",
    "creature",
    "static"
   ],
   "description": "A round, radiating-limbed creature shuffled from the bestiary's ring, halo and eye-crown parts — a real forged specimen standing in for the reliquary's catalogued relic",
   "from": [
    {
     "kind": "tool",
     "id": "bestiary-forge",
     "note": "forged in"
    }
   ]
  },
  {
   "id": "spine-creature",
   "name": "Spine Creature",
   "file": "components/generative/spine-creature/spine-creature.html",
   "category": "generative",
   "tags": [
    "svg",
    "bestiary",
    "creature",
    "static"
   ],
   "description": "A tall, segmented-column creature shuffled from the bestiary's limb and spine-segment parts — a real forged body standing in for the vertebra rig beside it",
   "from": [
    {
     "kind": "tool",
     "id": "bestiary-forge",
     "note": "forged in"
    }
   ]
  },
  {
   "id": "reliquary-ophanim",
   "name": "Reliquary Ophanim",
   "file": "components/generative/reliquary-ophanim/reliquary-ophanim.html",
   "category": "generative",
   "tags": [
    "webgl",
    "bestiary",
    "creature",
    "bloom",
    "3d",
    "pointer",
    "autoplay"
   ],
   "description": "A real merge, not a layout: a forged reliquary specimen billboarded in true 3D (a perspective camera, same math as shared/ecology/ecology-render.js) over a floor disc skinned with Graphite Halo's own noise-contour rings, with real two-pass bloom like Cybernetic Ecology's fish. Ophanim Iris's own mechanical lens and aperture state machine sits in front as the one thing you touch — gazing at the specimen stops the lens down and dims its glow in the WebGL layer below, so the mechanism and the specimen are wired together rather than stacked in boxes",
   "from": [
    {
     "kind": "component",
     "id": "ophanim-iris",
     "note": "iris mechanism from"
    },
    {
     "kind": "component",
     "id": "graphite-halo",
     "note": "ring/contour field from"
    },
    {
     "kind": "component",
     "id": "reliquary-specimen",
     "note": "specimen art from"
    },
    {
     "kind": "tool",
     "id": "bestiary-forge",
     "note": "specimen forged in"
    }
   ]
  }
 ],
 "tools": [
  {
   "id": "transmutation-engine",
   "name": "Transmutation Engine",
   "file": "tools/transmutation-engine/transmutation-engine.html",
   "tags": [
    "generative",
    "llm",
    "grammar",
    "instrument"
   ],
   "description": "Generative design instrument — encodes the interaction grammar and fuses components via LLM-driven transmutation"
  },
  {
   "id": "xenoglyph",
   "name": "Xenoglyph",
   "file": "tools/xenoglyph/xenoglyph.html",
   "tags": [
    "procedural",
    "writing",
    "generative",
    "svg-export"
   ],
   "description": "Procedural writing system generator with 8 glyph engines, seeded PRNG, and SVG export"
  },
  {
   "id": "xenomandala",
   "name": "Xenomandala",
   "file": "tools/xenomandala/xenomandala.html",
   "tags": [
    "procedural",
    "radial",
    "generative",
    "mandala"
   ],
   "description": "Radial alien language generator — xenoglyph glyphs arranged in animated concentric rings"
  },
  {
   "id": "radial-goo-bloom",
   "name": "Radial Goo Bloom",
   "file": "tools/radial-goo-bloom/radial-goo-bloom.html",
   "tags": [
    "dial",
    "goo",
    "physics",
    "interaction"
   ],
   "description": "Radial interface + spring-physics goo bloom with live parameter controls"
  },
  {
   "id": "glyph-editor",
   "name": "Glyph Editor",
   "file": "tools/glyph-editor.html",
   "tags": [
    "editor",
    "glyphs",
    "drawing",
    "skeleton"
   ],
   "description": "8×12 skeleton glyph drawing tool with variant system for hand-crafting xenoglyph characters"
  },
  {
   "id": "asset-foundry",
   "name": "Asset Foundry",
   "file": "tools/asset-foundry/asset-foundry.html",
   "tags": [
    "generative",
    "svg",
    "procedural",
    "export",
    "vector"
   ],
   "description": "Procedural sci-fi vector asset generator — 12 families, 6 palettes, seeded PRNG, SVG export"
  },
  {
   "id": "image-fx-lab",
   "name": "Image FX Lab",
   "file": "tools/image-fx-lab/image-fx-lab.html",
   "tags": [
    "image",
    "effects",
    "layers",
    "glitch",
    "recipes",
    "export",
    "motion"
   ],
   "description": "v2 image processor — 17 stackable FX with per-layer mask/opacity/blend, recipe presets with PNG provenance, palette extraction, contact sheet variants, A/B compare, WebM temporal export"
  },
  {
   "id": "tape08-patch",
   "name": "TAPE 08 Patch",
   "file": "tools/patch-bay/patch.html",
   "tags": [
    "audio",
    "web-audio",
    "node-graph",
    "modular",
    "tape08",
    "sidechain"
   ],
   "description": "Modular FX patcher in the TAPE 08 language — live Web Audio graph, sidechain compressor, legal-loop checking, latency compensation, SAVE AS FX turns a patch into a reusable node"
  },
  {
   "id": "tape08-patch-bay",
   "name": "TAPE 08 Patch Bay (v0)",
   "file": "tools/patch-bay/patch-bay.html",
   "tags": [
    "audio",
    "web-audio",
    "node-graph",
    "modular",
    "tape08"
   ],
   "description": "First engine sketch — pan/zoom canvas, on-card knobs and meters, orthogonal cables, loops without a DELAY refused at patch time"
  },
  {
   "id": "wing-rig",
   "name": "Wing Rig",
   "file": "tools/wing-rig/wing-rig.html",
   "tags": [
    "svg",
    "fk",
    "bone-rig",
    "editor",
    "export",
    "gothic"
   ],
   "description": "FK wing-rig editor — parts list, stage, and inspector for setting per-bone pivot/amplitude/lag and keyframe poses, with a timeline strip and wings/pivot export that feeds the Wings component"
  },
  {
   "id": "species-codex",
   "name": "Species Codex",
   "file": "tools/fish-tool/Species Codex.html",
   "tags": [
    "svg",
    "rig",
    "bestiary",
    "gallery",
    "reference"
   ],
   "description": "All sigil-species rigs side by side — Sigil Koi, Ribbon Serpent, Lattice Eel, Cloak Rogue, Blade Hunter, Glass Manta, Bell Jelly, Blade Puffer, Lantern Angler, and Winged Dragon, each with its one-line species note"
  },
  {
   "id": "rosette-generator",
   "name": "Rosette Generator",
   "file": "tools/rosette-generator/rosette-generator.html",
   "tags": [
    "generative",
    "svg",
    "procedural",
    "export",
    "vector",
    "gothic",
    "tracery"
   ],
   "description": "Parametric Gothic rose-window generator — radial lancets cusped into trefoil/quatrefoil foils around a scalloped oculus, line or solid-stone render, SVG export"
  },
  {
   "id": "karbandi-generator",
   "name": "Karbandi Generator",
   "file": "tools/city-gen/Karbandi Generator.html",
   "tags": [
    "generative",
    "svg",
    "procedural",
    "export",
    "vector",
    "islamic-geometry",
    "radial"
   ],
   "description": "Parametric Persian karbandi lattice — divides a circle into n points and connects every point k steps away, with a live shamseh medallion readout, presets, and SVG/PNG export"
  },
  {
   "id": "vessel-generator",
   "name": "Vessel Generator",
   "file": "tools/vessel-generator/vessel-generator.html",
   "tags": [
    "generative",
    "svg",
    "procedural",
    "export",
    "vector",
    "islamic-geometry",
    "gothic"
   ],
   "description": "Faceted gem-cut flask with a carved boteh medallion — a two-centre compass arch for the pointed crown, a bezier bulge for the foot, and a mirrored vine scroll with cusped-circle leaf/flower terminals (rosette-generator’s foil math reused at vine scale); relief or line render, SVG/PNG export"
  },
  {
   "id": "radial-masterplan",
   "name": "Masterplan Generator",
   "file": "tools/radial-masterplan/radial-masterplan.html",
   "tags": [
    "generative",
    "svg",
    "procedural",
    "export",
    "vector",
    "radial",
    "worldbuilding"
   ],
   "description": "Seeded radial site-plan generator built from the repo's own geometry — karbandi lattice hub and spokes, rosette-foil and ring-medallion precincts, a goo-bloom patch, a branching root channel, and a tiltable camera; SVG/PNG export"
  },
  {
   "id": "naqsh-workbench",
   "name": "Naqsh Pattern Workbench",
   "file": "tools/city-gen/Naqsh Pattern Workbench.html",
   "tags": [
    "generative",
    "canvas",
    "procedural",
    "export",
    "islamic-geometry",
    "persian",
    "tracery"
   ],
   "description": "Five documented/interpretive Persian and Islamic ornament generators — Girih polygon-in-contact tiling, Banna'i brick and Kufic-maze glazing, Eslimi spiral scrollwork, Tongbori cut-vessel vaults, and a Facade compositor that layers them onto a dome or minaret — with construction playback, palettes, and PNG/cutting-file SVG export"
  },
  {
   "id": "naqsh-forge",
   "name": "Naqsh Forge",
   "file": "tools/city-gen/Naqsh Forge.html",
   "tags": [
    "generative",
    "node-graph",
    "canvas",
    "procedural",
    "export",
    "islamic-geometry",
    "compositor"
   ],
   "description": "Node-based compositor unifying Naqsh Pattern Workbench's five ornament generators with Karbandi Lattice and Rosette tracery — wire any generator into a Radial Scatter (hub + precinct species), Region Fill, Layer, or Repeat/Mirror node to build combinations none of the standalone tools can make alone; seeded, with construction playback and PNG/SVG export"
  },
  {
   "id": "round-city-generator",
   "name": "Round City Generator",
   "file": "tools/city-gen/Round City Generator.html",
   "tags": [
    "generative",
    "wfc",
    "procedural",
    "worldbuilding",
    "islamic-geometry",
    "radial"
   ],
   "description": "Radial Wave-Function-Collapse desert city — rings/sectors of plazas, bazaars, courtyard houses, and minarets collapse under seeded constraint propagation with full backtracking, then stack vertically into storeys; a Patterns tab textures any surface (walls, domes, plaza floor) with the Naqsh ornament generators via radial warp; mashrabiya lattice screens and landmark tiles included"
  },
  {
   "id": "sigil-city",
   "name": "Sigil City",
   "file": "tools/city-gen/Sigil City.html",
   "tags": [
    "generative",
    "wfc",
    "procedural",
    "worldbuilding",
    "3d",
    "bloom"
   ],
   "description": "Same radial WFC city engine as Round City Generator, reskinned as glowing wireframe linework and additive point clouds with bloom, walker trails, and snow — Sigil/Both/Cloud draw modes, Top/Angled/Street camera presets"
  },
  {
   "id": "mandala-studio",
   "name": "Mandala Studio",
   "file": "tools/mandala-studio/mandala-studio.html",
   "tags": [
    "generative",
    "svg",
    "drawing",
    "symmetry",
    "mandala",
    "export"
   ],
   "description": "Flat, focused live radial-symmetry drawing tool — draw or stamp inside one wedge of a ring and it mirrors instantly N-fold (2–24) with an optional reflected axis; stack multiple independently-tuned rings into a mandala, each with its own fold count, radius, colour and stamp shape; PNG/SVG export"
  },
  {
   "id": "generative-forge",
   "name": "Generative Forge",
   "file": "tools/generative-forge/Generative Forge.html",
   "tags": [
    "generative",
    "node-graph",
    "canvas",
    "procedural",
    "export",
    "compositor",
    "worldbuilding"
   ],
   "description": "Repo-wide node-graph compositor — the city-gen compositor idea opened up to every generator family instead of one. Wire City Layout, the 5 Naqsh ornament generators, Karbandi, 2 Xenoglyph engines, and Pixel FX post-processing into a graph; hand-curated presets (\"palettes\") sit alongside raw procedural params. PNG/recipe export"
  },
  {
   "id": "interface-forge",
   "name": "Interface Forge",
   "file": "tools/interface-forge/Interface Forge.html",
   "tags": [
    "generative",
    "svg",
    "map-elites",
    "breeding",
    "instrument-panel",
    "export"
   ],
   "description": "MAP-Elites breeding adopted from the fish-tool's Species Forge, for a world with no shared part rig — the genome is a small vocabulary of radial instrument primitives (five fixed ring bands, a centre motif, a frame bezel) drawn fresh in code and composed per genome, instead of recombining pre-drawn parts"
  },
  {
   "id": "route-scene",
   "name": "Route Scene",
   "file": "tools/world-scene/route-scene.html",
   "tags": [
    "three.js",
    "3d",
    "flat-shading",
    "ecology",
    "city"
   ],
   "description": "World Scene's world staged the Kentucky Route Zero way in three.js: the radial WFC city (CreatureCity's depth occluder as a flat fill, its creature-parts wireframe as thin lines), Spire Forge towers, and the live Cybernetic Ecology sim flying over as paper cut-outs. Orthographic camera that only turns the set a little; unlit fills coloured by stepped depth bands; one amber lantern lit by distance, not angle, in hard steps; cut-out ridges, pines and a moon on a painted backdrop. Four palettes (Sage, Route Zero blue/amber, Ash, Paper), line/fill toggles, move the light."
  },
  {
   "id": "night-route",
   "name": "Night Route",
   "file": "tools/route/index.html",
   "tags": [
    "canvas",
    "generative",
    "wallpaper",
    "theatre",
    "narrative"
   ],
   "description": "Three canvas studies after Kentucky Route Zero: flat planes stacked by depth, one pale moon, one warm light. A still tableau (a Spire Forge tower with one lit window, a flat-cut Old One crossing the moon, a truck on the road), a desktop wallpaper seeded by the date with the real moon phase and a live clock, and a stage whose flats fly in and out on wires under spotlights. Forge towers, halls and creatures are cut down to silhouettes (tools/route/route.js)."
  },
  {
   "id": "sowers-mural",
   "name": "The Sowers and the Hollow",
   "file": "tools/mural/sowers.html",
   "tags": [
    "mural",
    "canvas",
    "generative",
    "black-and-white",
    "narrative"
   ],
   "description": "A second mythos, engraved in black and white with the mural's tools: an original myth on precursor themes (after Alien's Engineers and Halo's Forerunners, none of their creatures drawn). A hooded Sower kneels at a black sea beneath a seed-wheel and unravels into it as the first creatures rise; a pale root, grown like space colonisation, climbs through the tower city and hollows its creatures; the last Sowers light the Wheel, a great seal ringed by twelve lesser seals, and the ruins fall to ash before a Sower seated in stone. Engraved sky hatching, sea wave lines, stipple light"
  },
  {
   "id": "mural",
   "name": "The Tower of the Old Ones",
   "file": "tools/mural/index.html",
   "tags": [
    "mural",
    "canvas",
    "generative",
    "gothic",
    "narrative"
   ],
   "description": "A creation-myth mural painted in canvas from every Forge, after the murals of Journey, read left to right in three chapters: the Old Ones pour out of a sun-seal (Sigil Forge), circle a great tower's beam (Spire Forge, Cybernetic Ecology creatures trailing cloth), and the city sleeps under the dunes (Creature Arch and Classical ruins, columns as tombstones, red-robed pilgrims). Friezes of Scriptorium glyphs, chapter names as composed logograms, plaster grain, cracks and gold. ?seed= paints another myth"
  },
  {
   "id": "parts-sheet",
   "name": "Parts by Shape",
   "file": "tools/parts-sheet/index.html",
   "tags": [
    "parts",
    "curation",
    "reference"
   ],
   "description": "Every Species Forge part (shared/creature-parts.json, 649 parts from 40 species) laid out by shape: the kit's own shape tags (halos, cores, spires, segments, lamps, beads, ribs, blades, buttresses, hooks, friezes), then untagged parts by proportion, similar silhouettes side by side. Tick parts to pick the ones the glyph system may draw from; picks are saved and can be copied as a list"
  },
  {
   "id": "scriptorium",
   "name": "Scriptorium",
   "file": "tools/scriptorium/index.html",
   "tags": [
    "generative",
    "glyphs",
    "map-elites",
    "breeding",
    "writing-system"
   ],
   "description": "Breeds whole alien scripts on top of the Xenoglyph engines (shared/glyph/glyph-system.js). A script has a hand (one of the eight Xenoglyph engines and its stroke), a 20-concept lexicon in five categories, a grammar that composes several concepts into one glyph (Hangul blocks, Heptapod rings, linked graphs), frames and Egyptian-style determinatives, and a figurative level that turns signs into heads and full figures made of creature parts, after Maya script. MAP-Elites over scripts, judged by legibility (how distinct the signs are), figurativeness, density, symmetry and a steady hand; read a script's dictionary and write phrases in it"
  },
  {
   "id": "chimera",
   "name": "Chimera",
   "file": "tools/chimera/index.html",
   "tags": [
    "generative",
    "map-elites",
    "breeding",
    "quality-diversity",
    "procedural"
   ],
   "description": "Breeds new pieces out of the library's own code. A chimera is a body (every Forge generator that draws a figure, or a pair of Cybernetic Ecology creatures), a skin (glow, gilt via the holy light shader, blueprint, ink) and a mechanism (watch, drift, breathe); mutation tweaks a layer through its own tool's mutate() or swaps the piece, crossover trades layers. One shared MAP-Elites engine (shared/evolve/map-elites.js) files them by traits measured from the render (sci-fi to gothic, density, mass, symmetry, intricacy, restlessness), scored for coherence and steered by the ones you pin"
  },
  {
   "id": "tower-forge",
   "name": "Tower Forge",
   "file": "tools/tower-forge/Tower Forge.html",
   "tags": [
    "generative",
    "3d",
    "procedural",
    "map-elites",
    "breeding",
    "worldbuilding",
    "export"
   ],
   "description": "Drag-to-shape procedural tower builder (tiers, crown, foot, aura) with Naqsh ornament bands on its tiers; every tower is one JSON spec, mutated/crossed over gene-by-gene. Switch the gallery to Atlas · MAP-Elites to breed a grid of towers across trait pairs (height, slenderness, ornament, aura, habitat), scored by structural coherence and steered by the towers you pin. Three.js view, code export"
  },
  {
   "id": "world-scene",
   "name": "World Scene",
   "file": "tools/world-scene/World Scene Next.html",
   "tags": [
    "generative",
    "3d",
    "procedural",
    "worldbuilding",
    "city",
    "ecology"
   ],
   "description": "A from-scratch raw-WebGL2 scene unifying Cybernetic Ecology’s real fish sim, a Block Forge-style WFC city, and Spire Forge towers in one pipeline. Every building and tower is glowing wireframe architecture grown from a shared creature-parts sheet, not literal textured geometry; towers double as real local whirlpools the fish actually swim in. Full City/Tower authoring panels (Variations · Atlas · MAP-Elites breeding, Naqsh pattern editor, growth/replay-collapse reveal), and a click-to-select Inspector"
  },
  {
   "id": "bestiary-forge",
   "name": "Bestiary Forge",
   "file": "tools/bestiary-forge/index.html",
   "tags": [
    "generative",
    "svg",
    "bestiary",
    "map-elites",
    "breeding",
    "export"
   ],
   "description": "The species-sheet side of the creature-parts pipeline: pick up to six reference species, then assemble new creatures from their cut-out limbs, plates and spine segments — by instant Shuffle or by writing a brief for Claude to compose from, every result mirrored across its spine. A Towers mode reuses the same parts and MAP-Elites evolution loop as Spire Forge/Tower Forge to breed building massing instead of creatures"
  },
  {
   "id": "spire-forge",
   "name": "Spire Forge",
   "file": "tools/spire-forge/index.html",
   "tags": [
    "generative",
    "svg",
    "procedural",
    "worldbuilding",
    "export"
   ],
   "description": "Alien buildings drawn from creature parts: base terraces, a ribbed shaft, tapering balconies, upper drums and a domed or spired crown, each dressed in parts at their native size — friezes in rows, beads on rails, blades fanned around the axis. Six building types (Lighthouse/Spire/Hive/Shrine/Rotunda), with a one-click \"To Tower Forge\" spec export that hands the elevation off as a real 3D tower"
  },
  {
   "id": "sigil-forge",
   "name": "Sigil Forge",
   "file": "tools/sigil-forge/index.html",
   "tags": [
    "generative",
    "svg",
    "procedural",
    "typography",
    "export"
   ],
   "description": "Seals, glyph alphabets and icon sets cut from creature parts. A word becomes a traced path through a letter wheel, kamea magic square or monogram, set inside a rosette of mirrored parts woven over/under one another (boolean cut-with-a-gap, not just overlap) and framed with a star border"
  },
  {
   "id": "rose-window-forge",
   "name": "Rose Window Forge",
   "file": "tools/rose-window-forge/index.html",
   "tags": [
    "generative",
    "svg",
    "procedural",
    "export",
    "gothic",
    "tracery"
   ],
   "description": "Takes a Sigil Forge seal and sets it as the oculus glass inside true compass-and-straightedge Gothic tracery — lancets struck from their own two-circle springing points, capped with cutting-foil crowns, in Classic/Wheel/Flamboyant styles. Paste a Sigil Forge export or forge a new hub sigil in place, then tune the stonework independently"
  },
  {
   "id": "nine-li-lab",
   "name": "Nine Li Lab",
   "file": "tools/nine-li-lab/Nine Li Lab.html",
   "tags": [
    "generative",
    "3d",
    "procedural",
    "wfc",
    "worldbuilding",
    "city"
   ],
   "description": "A second WFC city solver proving the same wave-function-collapse pipeline against a different urban grammar: a walled, gridded Chinese ward-city (九里城) of courtyard houses, shop-and-teahouses, mansions and shrines solved onto a 49×49 plan instead of a radial one. City/Search/Rules/Patterns panels, access-depth scoring, and a growth replay of the solve order"
  },
  {
   "id": "glyph-garden",
   "name": "Glyph Garden",
   "file": "tools/glyph-garden/glyph-garden.html",
   "tags": [
    "generative",
    "canvas",
    "interaction",
    "webcam",
    "typography"
   ],
   "description": "A living print of tiles, dots, rings, lattices and stripes that blooms, erases or scrambles under the pointer — or under tracked hand gestures from a webcam (open palm to bloom, fist to erase), nothing leaving the device. Eight curated palettes, editable swatches, shuffleable draw order"
  },
  {
   "id": "forge",
   "name": "Forge",
   "file": "forge/web/index.html",
   "tags": [
    "generative",
    "library",
    "prefab",
    "pipeline",
    "worldbuilding"
   ],
   "description": "The missing middle layer tying the category generators together: one shared world file (IndexedDB) that Bestiary Forge, Sigil Forge, Spire Forge and the city generators all save into, read through a Kit screen that groups shared/creature-parts.json's 649 parts by role and flags thin ones. Phase 1 of a longer plan — Spire Forge can already save a building straight into the world file"
  },
  {
   "id": "scifi-gallery",
   "name": "Sci-fi Gallery",
   "file": "gallery/index.html",
   "tags": [
    "gallery",
    "composer",
    "prefab",
    "hud",
    "library"
   ],
   "description": "Forge's approach applied to this library: components are the parts kit, a Bench places them on a grid frame (by hand or with a seeded Compose/Reroll), and saved designs keep which parts and studies they came from"
  }
 ]
};
