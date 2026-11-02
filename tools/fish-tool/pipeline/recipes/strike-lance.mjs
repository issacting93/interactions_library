// Strike Lance: mantis shrimp x Blade Hunter cross. All parts from Blade Hunter's own rig --
// its eye-ring crown, its two curling head horns reread as stalked eyes, its folded claw pair,
// and its rear fin pair reread as a bracing tail.
export default {
  key: 'strike-lance',
  name: 'Strike Lance',
  blurb: "Stalked eyes under a cracked-open crown, two folded raptorial claws cocked at the shoulder, a plated tail built to brace a strike.",
  weight: 1,
  partsManifest: [
    { id: 'head', role: 'head', side: 0, source: 'Blade Hunter.svg', pathIndex: 9 },
    { id: 'crest', role: 'plate', side: 0, source: 'Blade Hunter.svg', pathIndex: 4 },
    { id: 'plate-1', role: 'plate', side: 0, source: 'Blade Hunter.svg', pathIndex: 7 },
    { id: 'plate-2', role: 'plate', side: 0, source: 'Blade Hunter.svg', pathIndex: 5 },
    { id: 'plate-3', role: 'plate', side: 0, source: 'Blade Hunter.svg', pathIndex: 6 },
    { id: 'eye-l', role: 'eye', side: -1, source: 'Blade Hunter.svg', pathIndex: 10 },
    { id: 'eye-r', role: 'eye', side: 1, source: 'Blade Hunter.svg', pathIndex: 11 },
    { id: 'claw-l', role: 'leg', side: -1, source: 'Blade Hunter.svg', pathIndex: 2, phaseSlot: 0 },
    { id: 'claw-r', role: 'leg', side: 1, source: 'Blade Hunter.svg', pathIndex: 1, phaseSlot: 0 },
    { id: 'tailfin-l', role: 'fin', side: -1, source: 'Blade Hunter.svg', pathIndex: 0, phaseSlot: 1 },
    { id: 'tailfin-r', role: 'fin', side: 1, source: 'Blade Hunter.svg', pathIndex: 3, phaseSlot: 1 },
  ],
  ecology: {
    beh: {
      mood: 'Striker', text: 'Hangs still with its claws folded, then uncoils the fastest strike on this page.',
      school: 0, sepMul: 1.3, wander: 0.2, turn: 260, vortex: 0.3, z: [0.3, 0.7], minSp: 0.1,
      prey: ['wisp'], sight: 5, dash: { mode: 'chase', range: 2, mult: 3.2, dur: 0.25, cool: 3 },
    },
    eco: { pop: 3, eats: ['wisp'], catch: 0.4, rest: 3, flee: 'none' },
  },
};
