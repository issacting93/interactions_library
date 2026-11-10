// Chain Colony: siphonophore. Nearly a direct remix of Bead Siphon's own rig, which is already a
// bead-chain of zooids -- its gas-float head marker, eight of its round beads strung down the
// spine, and its small hooked-arm pairs reread as swimming-bell rows.
//
// The old version used only ONE hooked-arm pair (pathIndex 5/6), so seven of the eight beads had
// nothing flanking them at all -- a bare string of plain circles with one decorated spot in the
// middle, which is exactly what looked unfinished. Bead Siphon's own rig has six such arm pairs
// running the length of its spine (5/6, 12/13, 19/20, 26/27, 33/34, 40/41); spreading three of them
// across the chain instead of one gives every couple of beads some real zooid detail, matching how
// the live Bead Siphon species itself actually reads.
export default {
  key: 'chain-colony',
  name: 'Chain Colony',
  blurb: 'A gas-float head towing a long bead-chain of specialised zooids -- each a different shape doing a different job for one shared animal.',
  weight: 1,
  partsManifest: [
    { id: 'float', role: 'head', side: 0, source: 'Bead Siphon.svg', pathIndex: 0 },
    { id: 'bead-1', role: 'plate', side: 0, source: 'Bead Siphon.svg', pathIndex: 3 },
    { id: 'bead-2', role: 'plate', side: 0, source: 'Bead Siphon.svg', pathIndex: 4 },
    { id: 'bead-3', role: 'plate', side: 0, source: 'Bead Siphon.svg', pathIndex: 7 },
    { id: 'bead-4', role: 'plate', side: 0, source: 'Bead Siphon.svg', pathIndex: 10 },
    { id: 'bead-5', role: 'plate', side: 0, source: 'Bead Siphon.svg', pathIndex: 11 },
    { id: 'bead-6', role: 'plate', side: 0, source: 'Bead Siphon.svg', pathIndex: 14 },
    { id: 'bead-7', role: 'plate', side: 0, source: 'Bead Siphon.svg', pathIndex: 17 },
    { id: 'bead-8', role: 'plate', side: 0, source: 'Bead Siphon.svg', pathIndex: 18 },
    { id: 'bell-a-l', role: 'fin', side: -1, source: 'Bead Siphon.svg', pathIndex: 5, phaseSlot: 0 },
    { id: 'bell-a-r', role: 'fin', side: 1, source: 'Bead Siphon.svg', pathIndex: 6, phaseSlot: 0 },
    { id: 'bell-b-l', role: 'fin', side: -1, source: 'Bead Siphon.svg', pathIndex: 12, phaseSlot: 1 },
    { id: 'bell-b-r', role: 'fin', side: 1, source: 'Bead Siphon.svg', pathIndex: 13, phaseSlot: 1 },
    { id: 'bell-c-l', role: 'fin', side: -1, source: 'Bead Siphon.svg', pathIndex: 19, phaseSlot: 2 },
    { id: 'bell-c-r', role: 'fin', side: 1, source: 'Bead Siphon.svg', pathIndex: 20, phaseSlot: 2 },
  ],
  ecology: {
    beh: {
      mood: 'Colony', text: 'A bead-chain of specialised zooids, more polymorphic than Bead Siphon already is.',
      school: 0, sepMul: 0.9, wander: 0.25, wanderRate: 0.6, turn: 65, vortex: 0.7, z: [0.3, 0.85], minSp: 0.1, sting: 1,
    },
    eco: { pop: 2, eats: ['wisp'], graze: true, catch: 0.3, rest: 1, flee: 'none' },
  },
};
