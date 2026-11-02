// Black Monarch: the creature that now lives in the mono sheet's old Frond Serpent slot -- redrawn
// from scratch in Figma (not recombined from other species' parts like every other recipe here) and
// exported flat as mono/Black MOnarch.svg. Unlike the rest of sigil-species-rig-svgs/mono (green
// stroke, fill:none everywhere -- see carapace-strider.mjs's note on why that misclassifies), this
// export carries real fill+stroke per path (fill #5fd38d, stroke #61e56a), so classify() reads every
// shape correctly as 'line' on its own -- no forceBucket needed except for path 7 (see below).
//
// Only 8 real paths, point-counted directly off the file -- a left/right wing-lobe pair, one wide
// top band spanning both lobes, a left/right pair of small dots, and three on-centerline pieces
// stacked top to bottom (thorax, abdomen-1, abdomen-2):
//   0 right wing lobe (center x=1186, right of the x=1122 centerline)
//   1 left wing lobe  (center x=1058, mirrors 0 exactly: 1186-1122 == 1122-1058)
//   2 wide top band, spans both lobes (362 wide -- the whole creature's own width)
//   3 small left dot (x=1109)      4 small right dot (x=1134, mirrors 3)
//   5 thorax, on centerline (y=1238, topmost of the three on-axis pieces)
//   6 abdomen tip, on centerline (y=1279, lowest point in the whole file -- posterior)
//   7 center column (y=1177, between the top band and the thorax) -- the one path with no stroke
//     (fill #61e56a only). classify() reads a strokeless bright fill as a Figma hit-target marker
//     and drops it to 'skip' -- wrong here, this file has no markers at all (it's hand-authored,
//     not a Figma export with leftover guides), so it's forced to 'line' like everything else.
//
// No SOURCE_SCALE entry exists for mono/Black MOnarch.svg (new file, not in rig.mjs's table), so
// every part carries an explicit transform.scale instead of relying on the lookup. 13 matches the
// ratio already used for similarly small reference viewBoxes (koi.svg 13.79, butterfly-worm.svg
// 12.63) -- a starting point, not hand-tuned (same honesty rig.mjs's own header asks for).
const T = { scale: 13 };

export default {
  key: 'black-monarch',
  name: 'Black Monarch',
  blurb: 'A small, flat moth-shape -- one wide wing band over a mirrored pair of lobes, three plain segments stacked down its own centerline.',
  weight: 1,
  partsManifest: [
    { id: 'wing-l', role: 'fin', side: -1, source: 'mono/Black MOnarch.svg', pathIndex: 1, transform: T, phaseSlot: 0 },
    { id: 'wing-r', role: 'fin', side: 1, source: 'mono/Black MOnarch.svg', pathIndex: 0, transform: T, phaseSlot: 0 },
    { id: 'band', role: 'plate', side: 0, source: 'mono/Black MOnarch.svg', pathIndex: 2, transform: T },
    { id: 'eye-l', role: 'eye', side: -1, source: 'mono/Black MOnarch.svg', pathIndex: 3, transform: T },
    { id: 'eye-r', role: 'eye', side: 1, source: 'mono/Black MOnarch.svg', pathIndex: 4, transform: T },
    { id: 'thorax', role: 'head', side: 0, source: 'mono/Black MOnarch.svg', pathIndex: 5, transform: T },
    { id: 'abdomen', role: 'tail', side: 0, source: 'mono/Black MOnarch.svg', pathIndex: 6, transform: T },
    { id: 'column', role: 'plate', side: 0, source: 'mono/Black MOnarch.svg', pathIndex: 7, transform: T, forceBucket: 'line' },
  ],
  ecology: {
    beh: {
      mood: 'Moth', text: 'Flutters in short glides near the surface, wings catching the light instead of driving much speed.',
      school: 0.2, sepMul: 0.9, wander: 0.4, wanderRate: 1.4, turn: 110, vortex: 0.4, z: [0.05, 0.4], minSp: 0.08,
    },
    eco: { pop: 4, eats: [], flee: 'scatter' },
  },
};
