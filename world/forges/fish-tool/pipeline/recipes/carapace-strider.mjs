// Carapace Strider: horseshoe-crab-inspired. Shell + legs + tail spike from Blade Puffer's own
// rings/radiating blades/lower blade; compound-eye motif borrowed from koi's head ornaments.
// Same parts already proven out visually as the Species Codex's static reference sigil -- this
// recipe re-derives the rig from the same source paths instead of the pre-baked green-stroke copy,
// so mesh extraction sees real fill/stroke geometry (the green-stroke mono/ files are fill:none
// everywhere, which would misclassify every shape as linework -- see svg-extract.mjs's classify()).

// koi eye-pair-center (117.5,57 in koi's own units) -> near the top inside Blade Puffer's shell
// ring (target ~(1590.6,1092.0) in Blade Puffer's world-scaled space, i.e. puffer-local (134,92) *
// its SOURCE_SCALE 11.87). scale 26.67 (~2x koi's own default 13.79) so the borrowed motif reads
// at a size proportionate to the shell, not koi-face-sized.
const EYE_TRANSFORM = { dx: -1542.7, dy: -428.2, scale: 26.67 };

export default {
  key: 'carapace-strider',
  name: 'Carapace Strider',
  blurb: 'A low domed shell ringed by six short jointed legs and swept back into one long spiked tail, with compound eyes set into the carapace ridge instead of a face.',
  weight: 1,
  partsManifest: [
    { id: 'shell-outer', role: 'plate', side: 0, source: 'Blade Puffer.svg', pathIndex: 0 },
    { id: 'shell-inner', role: 'plate', side: 0, source: 'Blade Puffer.svg', pathIndex: 1 },
    { id: 'leg-bl', role: 'leg', side: -1, source: 'Blade Puffer.svg', pathIndex: 4, phaseSlot: 0 },
    { id: 'leg-br', role: 'leg', side: 1, source: 'Blade Puffer.svg', pathIndex: 5, phaseSlot: 0 },
    { id: 'leg-l', role: 'leg', side: -1, source: 'Blade Puffer.svg', pathIndex: 6, phaseSlot: 1 },
    { id: 'leg-r', role: 'leg', side: 1, source: 'Blade Puffer.svg', pathIndex: 7, phaseSlot: 1 },
    { id: 'leg-fl', role: 'leg', side: -1, source: 'Blade Puffer.svg', pathIndex: 8, phaseSlot: 2 },
    { id: 'leg-fr', role: 'leg', side: 1, source: 'Blade Puffer.svg', pathIndex: 9, phaseSlot: 2 },
    { id: 'tail', role: 'tail', side: 0, source: 'Blade Puffer.svg', pathIndex: 14 },
    { id: 'eye-l', role: 'eye', side: -1, source: 'koi.svg', pathIndex: 13, transform: EYE_TRANSFORM },
    { id: 'eye-r', role: 'eye', side: 1, source: 'koi.svg', pathIndex: 14, transform: EYE_TRANSFORM },
  ],
  ecology: {
    beh: {
      mood: 'Scavenger', text: 'Works the bottom in slow stop-start steps on six legs, armored and unhurried.',
      school: 0, sepMul: 1.2, wander: 0.3, wanderRate: 1.2, turn: 140, vortex: 0.2, z: [0.7, 1], minSp: 0.02, stopgo: 1.3, sight: 3,
    },
    eco: { pop: 5, eats: [], flee: 'none' },
  },
};
