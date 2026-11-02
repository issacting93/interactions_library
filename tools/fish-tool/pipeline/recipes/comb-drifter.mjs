// Comb Drifter: comb jelly. All parts from Bell Jelly's own rig -- its dome, three mirrored pairs
// of fringe tendrils reread as comb-fin rows, and its two longest trailing tendrils reread as true
// dangling tentacles (whisker group: decaying lag-sway toward the tip, which is exactly how a
// trailing tentacle should move, unlike a rigid flapping fin).
//
// Dropped the old 'arm-l'/'arm-r' pair (BELL JELLY.svg pathIndex 19/6): checked their raw `d` and
// they're bare 4-point quadrilaterals -- a leftover Figma hit-target/selection box, not real art --
// which is exactly why they rendered as two giant crossed squares dominating the whole silhouette
// instead of "flanking oral-arm plates". No real flanking-plate shape exists elsewhere in Bell
// Jelly's own rig to replace them with, and the bell+combs+tentacles alone already read cleanly as
// the blurb describes, so the part is removed rather than swapped for a worse stand-in.
//
// comb-1 (old pathIndex 15/2) and comb-2 (old pathIndex 23/10) turned out to be the SAME kind of
// bare hit-target quad as arm-l/r -- checked every BELL JELLY.svg drawable's real point count and
// only comb-3's original indices (18/5) were genuine detailed linework; comb-1/2 were silently
// rendering as degenerate squares too, same bug, just not named "arm" so it wasn't obvious by eye.
// Repointed comb-1/2 at real small ornament shapes elsewhere in the same rig (pathIndex 14/1 and
// 22/9) -- both genuinely mirrored, and conveniently smaller than comb-3's 5/18, which now gives a
// natural small-to-large taper moving away from the bell instead of three same-size rows.
export default {
  key: 'comb-drifter',
  name: 'Comb Drifter',
  blurb: 'A long translucent oval ringed by close-set rows of tiny comb-fins, two long tentacles trailing behind.',
  weight: 1,
  partsManifest: [
    { id: 'bell', role: 'plate', side: 0, source: 'BELL JELLY.svg', pathIndex: 0 },
    { id: 'comb-1l', role: 'fin', side: -1, source: 'BELL JELLY.svg', pathIndex: 14, phaseSlot: 0 },
    { id: 'comb-1r', role: 'fin', side: 1, source: 'BELL JELLY.svg', pathIndex: 1, phaseSlot: 0 },
    { id: 'comb-2l', role: 'fin', side: -1, source: 'BELL JELLY.svg', pathIndex: 22, phaseSlot: 1 },
    { id: 'comb-2r', role: 'fin', side: 1, source: 'BELL JELLY.svg', pathIndex: 9, phaseSlot: 1 },
    { id: 'comb-3l', role: 'fin', side: -1, source: 'BELL JELLY.svg', pathIndex: 18, phaseSlot: 2 },
    { id: 'comb-3r', role: 'fin', side: 1, source: 'BELL JELLY.svg', pathIndex: 5, phaseSlot: 2 },
    { id: 'tentacle-l', role: 'whisker', side: -1, source: 'BELL JELLY.svg', pathIndex: 26 },
    { id: 'tentacle-r', role: 'whisker', side: 1, source: 'BELL JELLY.svg', pathIndex: 13 },
  ],
  ecology: {
    beh: {
      mood: 'Rower', text: 'Rows on beating comb-fin rows instead of pulsing, a long translucent drift with two trailing tentacles.',
      school: 0.4, sepMul: 0.7, wander: 0.3, wanderRate: 1, turn: 100, vortex: 0.6, z: [0.1, 0.6], minSp: 0.1,
    },
    eco: { pop: 5, eats: [], flee: 'scatter' },
  },
};
