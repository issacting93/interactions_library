// Plated Scavenger: giant isopod. Koi supplies the main body -- its head medallion, one of its
// head-ornament swirls (scaled up for an oversized eye), three of its repeating rib/vertebra
// plates. Blade Hunter supplies the antennae (its two curling head horns) and legs (its folded
// claw pair), repositioned onto koi's canvas via HUNTER_ON_KOI so they sit at koi's own head/
// shoulder instead of floating at Blade Hunter's own origin.

// Centers Blade Hunter's antenna pair (native center x~97.5) on koi's head center (world x~1627 =
// koi head's local x-center 118 * koi's 13.79 scale) -- dx = 1627 - 97.5*15.60 = 106. dy sits the
// antenna base (native y=0) a bit above koi's own topmost point (world y=0) at world y=-200, so
// Hunter's claws (native y 92-203) land lower, around koi's own rib band. (An earlier version of
// this transform placed Hunter's local ORIGIN, not its part center, at koi's head point -- that
// put the whole antenna pair off to one side instead of straddling the head; caught by an in-sim
// visual check, not by the mesh/rig validator, which has no notion of "looks right".)
const HUNTER_ON_KOI = { dx: 106, dy: -200, scale: 15.60 };

export default {
  key: 'plated-scavenger',
  name: 'Plated Scavenger',
  blurb: 'Short legs under overlapping armor plates, two long curling antennae, eyes too large for its blunt head.',
  weight: 1,
  partsManifest: [
    { id: 'head', role: 'head', side: 0, source: 'koi.svg', pathIndex: 0 },
    { id: 'eye', role: 'eye', side: 0, source: 'koi.svg', pathIndex: 13, transform: { dx: -2099.2, dy: -1179.1, scale: 34.475 } },
    { id: 'antenna-l', role: 'whisker', side: -1, source: 'Blade Hunter.svg', pathIndex: 10, transform: HUNTER_ON_KOI },
    { id: 'antenna-r', role: 'whisker', side: 1, source: 'Blade Hunter.svg', pathIndex: 11, transform: HUNTER_ON_KOI },
    { id: 'leg-l', role: 'leg', side: -1, source: 'Blade Hunter.svg', pathIndex: 2, transform: HUNTER_ON_KOI, phaseSlot: 0 },
    { id: 'leg-r', role: 'leg', side: 1, source: 'Blade Hunter.svg', pathIndex: 1, transform: HUNTER_ON_KOI, phaseSlot: 0 },
    { id: 'plate-1', role: 'plate', side: 0, source: 'koi.svg', pathIndex: 3 },
    { id: 'plate-2', role: 'plate', side: 0, source: 'koi.svg', pathIndex: 6 },
    { id: 'plate-3', role: 'plate', side: 0, source: 'koi.svg', pathIndex: 9 },
  ],
  ecology: {
    beh: {
      mood: 'Scavenger', text: 'Works the bottom in slow stop-start steps, armored and unbothered.',
      school: 0, sepMul: 1.1, wander: 0.3, wanderRate: 1, turn: 130, vortex: 0.2, z: [0.75, 1], minSp: 0.03, stopgo: 1.1,
    },
    eco: { pop: 4, eats: [], flee: 'none' },
  },
};
