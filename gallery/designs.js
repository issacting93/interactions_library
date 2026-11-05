/* gallery/designs.js — the starter designs: parts from components/catalog.js placed on a grid frame.
   Read-only in the gallery; editing one in the Bench saves a copy that points back here.
   To add one: build it in gallery/bench.html, Export, and paste the object into this list.
   Slot fields: part (a component id), x y w h in grid cells, zoom (null = fit automatically), label (optional).
   Check it: node components/check-catalog.cjs */
window.SCIFI_DESIGNS = [
  {
    id: "navigator", name: "Navigator", cols: 16, rows: 10, gap: 6, labels: true, version: 1,
    about: "The four Compass Studies panels as one bridge: the hardware compass as the main instrument, the heading tape across the top, the luopan and the bearing rings beside it.",
    slots: [
      { id: "s1", part: "reliquary-compass", x: 0, y: 0, w: 8, h: 10, zoom: null },
      { id: "s2", part: "datamatic-tape", x: 8, y: 0, w: 8, h: 4, zoom: null },
      { id: "s3", part: "heaven-plate", x: 8, y: 4, w: 4, h: 6, zoom: null },
      { id: "s4", part: "volumetric-bearing", x: 12, y: 4, w: 4, h: 6, zoom: null },
    ],
  },
  {
    id: "survey-deck", name: "Survey Deck", cols: 16, rows: 10, gap: 6, labels: true, version: 1,
    about: "A terrain survey station: the isometric terrain as the map, radar and range rings for what moves over it, a contour field underneath.",
    slots: [
      { id: "s1", part: "terrain-isometric", x: 0, y: 0, w: 10, h: 7, zoom: null },
      { id: "s2", part: "radar-display", x: 10, y: 0, w: 6, h: 5, zoom: null },
      { id: "s3", part: "range-region", x: 10, y: 5, w: 6, h: 5, zoom: null },
      { id: "s4", part: "terrain-grid", x: 0, y: 7, w: 10, h: 3, zoom: null },
    ],
  },
  {
    id: "spine-bay", name: "Spine Bay", cols: 16, rows: 10, gap: 6, labels: true, version: 1,
    about: "The vertebra family in one bay: the hazard-striped lock, the rigged spine it became, and the modifier keys that drive them.",
    slots: [
      { id: "s1", part: "spine-lock-alert", x: 0, y: 0, w: 6, h: 10, zoom: null },
      { id: "s2", part: "spine", x: 6, y: 0, w: 10, h: 6, zoom: null },
      { id: "s3", part: "keyboard-hud", x: 6, y: 6, w: 10, h: 4, zoom: null },
    ],
  },
  {
    id: "swarm-ops", name: "Swarm Ops", cols: 16, rows: 10, gap: 6, labels: true, version: 1,
    about: "One flock read three ways: the 3D swarm, the same boids as an Ikeda dot-matrix, and the rosette dial that calls them.",
    slots: [
      { id: "s1", part: "boid-field", x: 0, y: 0, w: 10, h: 10, zoom: null },
      { id: "s2", part: "datamatics", x: 10, y: 0, w: 6, h: 6, zoom: null },
      { id: "s3", part: "murmuration-rosette", x: 10, y: 6, w: 6, h: 4, zoom: null },
    ],
  },
  {
    id: "vortex-control", name: "Vortex Control", cols: 16, rows: 10, gap: 6, labels: true, version: 1,
    about: "The Rain Vortex rev B as the plant, with the instruments that run it: the dual-register dial and the targeting sequencer.",
    slots: [
      { id: "s1", part: "rain-vortex-rev-b", x: 0, y: 0, w: 11, h: 10, zoom: null },
      { id: "s2", part: "signal-and-mass", x: 11, y: 0, w: 5, h: 5, zoom: null },
      { id: "s3", part: "gear-lock", x: 11, y: 5, w: 5, h: 5, zoom: null },
    ],
  },
  {
    id: "reliquary-chapel", name: "Reliquary Chapel", cols: 16, rows: 10, gap: 6, labels: true, version: 1,
    about: "The gothic register: the wheels of eyes, the lock-dial vitrine, and two pieces of sacred geometry as side windows.",
    slots: [
      { id: "s1", part: "ophanim-iris", x: 0, y: 0, w: 6, h: 10, zoom: null },
      { id: "s2", part: "reliquary", x: 6, y: 0, w: 5, h: 10, zoom: null },
      { id: "s3", part: "graphite-halo", x: 11, y: 0, w: 5, h: 5, zoom: null },
      { id: "s4", part: "karbandi", x: 11, y: 5, w: 5, h: 5, zoom: null },
    ],
  },
  {
    id: "targeting", name: "Targeting", cols: 16, rows: 10, gap: 6, labels: true, version: 1,
    about: "A fire-control panel: the geared reticle with the dial it was revised from, a helm dial, and the sweep sequencer below.",
    slots: [
      { id: "s1", part: "geared-reticle", x: 0, y: 0, w: 8, h: 10, zoom: null },
      { id: "s2", part: "cyberpunk-dial", x: 8, y: 0, w: 4, h: 5, zoom: null },
      { id: "s3", part: "helm-dial", x: 12, y: 0, w: 4, h: 5, zoom: null },
      { id: "s4", part: "sweep-path", x: 8, y: 5, w: 8, h: 5, zoom: null },
    ],
  },
  {
    id: "specimen-vault", name: "Specimen Vault", cols: 16, rows: 10, gap: 6, labels: true, version: 1,
    about: "Reliquary Ophanim as the vault door, with the two pieces it was merged from beside it: the iris that gates it and the halo it floats over.",
    slots: [
      { id: "s1", part: "reliquary-ophanim", x: 0, y: 0, w: 11, h: 10, zoom: null },
      { id: "s2", part: "ophanim-iris", x: 11, y: 0, w: 5, h: 5, zoom: null },
      { id: "s3", part: "graphite-halo", x: 11, y: 5, w: 5, h: 5, zoom: null },
    ],
  },
];
