// Fin Puffer: the one species with real artwork (sigil-species-rig-svgs/Fin Puffer.svg) that never
// got a recipe or a SPECIES/BEH/ECO entry -- every other species in the mono sheet already made it
// into the live tank; this was the actual gap. Blade Puffer's own sibling: same family read (round
// body, radiating spines) but spines drawn as fins, and unlike Blade Puffer it has no separate
// shell-ring pair or thin tail spike -- see inspect.mjs dump of Fin Puffer.svg (16 drawables):
//   0  outer body/fin envelope (w=242.7 h=138.9, almost the whole 292x254 canvas) -> plate
//   13 inner body mass, bottom-weighted (y 90.1-242.4, center x~142) -> plate
//   14 centered stroke-only ring (w=h=115.2, no fill) -> eye (single front-facing medallion eye,
//      not an L/R pair -- Blade Puffer's own eye dup (its idx 2/3) is likewise one shape duplicated,
//      here it's drawn once and centered instead)
//   1-12 six mirrored pairs of fin-spines (classify() reads every one as 'line', real stroke
//      #61E5BF on every part) -- side assigned by actual bbox-center vs the viewBox half-width
//      (146), not by index parity: pairs 1-8 happen to go odd=left/even=right, but 9/10 and 11/12
//      are drawn in the opposite order in the source file, confirmed by comparing each bbox center
//      to 146 directly rather than assuming a pattern.
//   15 socket (full-canvas white rect, Figma artboard marker) -- left out of the manifest entirely
// No SOURCE_SCALE entry for this file (new, not in rig.mjs's table): target the same live body
// length as its sibling Blade Puffer (3453.7 world units) off this file's OWN viewBox height (254,
// not Blade Puffer's 291) -- 3453.7/254 = 13.6. A starting point, not hand-tuned, same honesty every
// other new-file recipe here already flags for its own scale choice.
const T = { scale: 13.6 };

export default {
  key: 'fin-puffer',
  name: 'Fin Puffer',
  blurb: 'Blade Puffer’s round-bodied sibling: six mirrored pairs of fins fan out from the shell instead of blade-spines, with one centered medallion eye and no tail spike.',
  weight: 1,
  partsManifest: [
    { id: 'body-outer', role: 'plate', side: 0, source: 'Fin Puffer.svg', pathIndex: 0, transform: T },
    { id: 'body-inner', role: 'plate', side: 0, source: 'Fin Puffer.svg', pathIndex: 13, transform: T },
    { id: 'eye', role: 'eye', side: 0, source: 'Fin Puffer.svg', pathIndex: 14, transform: T },
    { id: 'fin-1l', role: 'fin', side: -1, source: 'Fin Puffer.svg', pathIndex: 1, transform: T, phaseSlot: 0 },
    { id: 'fin-1r', role: 'fin', side: 1, source: 'Fin Puffer.svg', pathIndex: 2, transform: T, phaseSlot: 0 },
    { id: 'fin-2l', role: 'fin', side: -1, source: 'Fin Puffer.svg', pathIndex: 3, transform: T, phaseSlot: 1 },
    { id: 'fin-2r', role: 'fin', side: 1, source: 'Fin Puffer.svg', pathIndex: 4, transform: T, phaseSlot: 1 },
    { id: 'fin-3l', role: 'fin', side: -1, source: 'Fin Puffer.svg', pathIndex: 5, transform: T, phaseSlot: 2 },
    { id: 'fin-3r', role: 'fin', side: 1, source: 'Fin Puffer.svg', pathIndex: 6, transform: T, phaseSlot: 2 },
    { id: 'fin-4l', role: 'fin', side: -1, source: 'Fin Puffer.svg', pathIndex: 7, transform: T, phaseSlot: 3 },
    { id: 'fin-4r', role: 'fin', side: 1, source: 'Fin Puffer.svg', pathIndex: 8, transform: T, phaseSlot: 3 },
    { id: 'fin-5l', role: 'fin', side: -1, source: 'Fin Puffer.svg', pathIndex: 10, transform: T, phaseSlot: 4 },
    { id: 'fin-5r', role: 'fin', side: 1, source: 'Fin Puffer.svg', pathIndex: 9, transform: T, phaseSlot: 4 },
    { id: 'fin-6l', role: 'fin', side: -1, source: 'Fin Puffer.svg', pathIndex: 12, transform: T, phaseSlot: 5 },
    { id: 'fin-6r', role: 'fin', side: 1, source: 'Fin Puffer.svg', pathIndex: 11, transform: T, phaseSlot: 5 },
  ],
  ecology: {
    beh: {
      prey: ['wisp'], mood: 'Nervous',
      text: 'Hovers and jitters. Puffs up and flares its fins when a predator or your pointer comes close.',
      school: 0.3, wander: 0.55, wanderRate: 5, turn: 240, vortex: 0.5, z: [0.2, 0.6], minSp: 0.08, speedMul: 0.8, puff: true,
    },
    eco: { pop: 5, eats: ['wisp'], graze: true, catch: 0.35, rest: 3, flee: 'puff' },
  },
};
