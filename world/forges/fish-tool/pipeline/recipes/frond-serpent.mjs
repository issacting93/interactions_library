// Frond Serpent: leafy seadragon. Butterfly Worm supplies the leaf-fringed wing-fans -- three
// mirrored layers of its own butterfly wings, plus its own paired eye-marks. Koi supplies the
// head and two spine plates, repositioned onto worm's canvas via KOI_ON_WORM so they sit right
// below worm's wing cluster instead of at koi's own native origin.
// Centers koi's head (native center ~(118,118)) under worm's wing-cluster convergence point
// (world ~(3751,2000)), not koi's local origin -- dx = 3751 - 118*13.79 = 2124, dy = 2000 -
// 118*13.79 = 373 (same origin-vs-center fix as Plated Scavenger's HUNTER_ON_KOI).
const KOI_ON_WORM = { dx: 2124, dy: 373, scale: 13.79 };

// The old wing-1/wing-3/eye indices (9/13, 53/17, 1/5) all turned out to be bare 5-point hit-target
// quads (fill="white", same Figma idiom caught elsewhere this session), not real art -- confirmed by
// point-counting every drawable in butterfly-worm.svg. This file triples every REAL shape too: each
// one shows up three times at the same bbox (a gradient-fill copy, a fill:none "mask helper" copy
// classify() already correctly treats as 'skip', and a stroke-only copy) -- wing-2 (8/12) happened to
// land on a real gradient-fill copy already, which is why it was the only layer that ever rendered.
// Repointed wing-1/wing-3/eye at real mirrored pairs found the same way (16/52, 24/56, 160/180) --
// no forceBucket needed, they classify as 'fill' correctly on their own.

export default {
  key: 'frond-serpent',
  name: 'Frond Serpent',
  blurb: 'One head, a short plated spine, and a spread of leaf-fringed fronds -- camouflage through ornament, not speed.',
  weight: 1,
  partsManifest: [
    { id: 'wing-1l', role: 'fin', side: -1, source: 'butterfly-worm.svg', pathIndex: 52, phaseSlot: 0 },
    { id: 'wing-1r', role: 'fin', side: 1, source: 'butterfly-worm.svg', pathIndex: 16, phaseSlot: 0 },
    { id: 'wing-2l', role: 'fin', side: -1, source: 'butterfly-worm.svg', pathIndex: 8, phaseSlot: 1 },
    { id: 'wing-2r', role: 'fin', side: 1, source: 'butterfly-worm.svg', pathIndex: 12, phaseSlot: 1 },
    { id: 'wing-3l', role: 'fin', side: -1, source: 'butterfly-worm.svg', pathIndex: 56, phaseSlot: 2 },
    { id: 'wing-3r', role: 'fin', side: 1, source: 'butterfly-worm.svg', pathIndex: 24, phaseSlot: 2 },
    { id: 'eye-l', role: 'eye', side: -1, source: 'butterfly-worm.svg', pathIndex: 160 },
    { id: 'eye-r', role: 'eye', side: 1, source: 'butterfly-worm.svg', pathIndex: 180 },
    { id: 'head', role: 'head', side: 0, source: 'koi.svg', pathIndex: 0, transform: KOI_ON_WORM },
    { id: 'plate-1', role: 'plate', side: 0, source: 'koi.svg', pathIndex: 3, transform: KOI_ON_WORM },
    { id: 'plate-2', role: 'plate', side: 0, source: 'koi.svg', pathIndex: 6, transform: KOI_ON_WORM },
  ],
  ecology: {
    beh: {
      mood: 'Camouflaged', text: 'Drifts in loose fronds, relying on camouflage through ornament rather than speed.',
      school: 0.3, sepMul: 0.8, wander: 0.3, wanderRate: 1.2, turn: 90, vortex: 0.6, z: [0.1, 0.5], minSp: 0.1,
    },
    eco: { pop: 4, eats: [], flee: 'scatter' },
  },
};
