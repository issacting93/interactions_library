// Drape Vampire: vampire squid. All parts from Cloak Rogue's own rig -- its head, the small
// mirrored "globe" shapes above its head reread as two huge eyes, its literal draped cloak-wing
// pair right below the head, and two pairs of its repeating spine studs reread as photophores.
//
// None of these parts had a dy offset originally -- each just rendered at its own native position on
// Rogue's ~11,000-unit-long body, so head/eyes/cloak/photophore-1/photophore-2 ended up as five
// isolated floating clusters hundreds to thousands of units apart, with the eyes sitting entirely
// ABOVE the head instead of on it. The dy's below pull each group down (or up) onto the one before
// it: eyes drop onto the head's own crown instead of floating free above it, photophore-1 closes to
// just under the cloak, and photophore-2 closes most of the way to photophore-1 (kept at a visible
// ~180-unit gap on purpose -- "a string of studs" reads better spaced than stacked solid). dx/scale
// are left alone -- each pair is already close enough to mirror-symmetric in Rogue's own art.
const EYE_TRANSFORM = { dy: 1190 };
const PHOTO1_TRANSFORM = { dy: -1336 };
const PHOTO2_TRANSFORM = { dy: -3666 };

export default {
  key: 'drape-vampire',
  name: 'Drape Vampire',
  blurb: 'Webbed wing-arms draped like a cloak around two huge globed eyes, a string of photophore studs down each spine.',
  weight: 1,
  partsManifest: [
    { id: 'head', role: 'head', side: 0, source: 'rogue-rig.svg', pathIndex: 1 },
    { id: 'eye-l', role: 'eye', side: -1, source: 'rogue-rig.svg', pathIndex: 19, transform: EYE_TRANSFORM },
    { id: 'eye-r', role: 'eye', side: 1, source: 'rogue-rig.svg', pathIndex: 20, transform: EYE_TRANSFORM },
    { id: 'cloak-l', role: 'fin', side: -1, source: 'rogue-rig.svg', pathIndex: 2, phaseSlot: 0 },
    { id: 'cloak-r', role: 'fin', side: 1, source: 'rogue-rig.svg', pathIndex: 3, phaseSlot: 0 },
    { id: 'photophore-1l', role: 'plate', side: -1, source: 'rogue-rig.svg', pathIndex: 5, transform: PHOTO1_TRANSFORM },
    { id: 'photophore-1r', role: 'plate', side: 1, source: 'rogue-rig.svg', pathIndex: 6, transform: PHOTO1_TRANSFORM },
    { id: 'photophore-2l', role: 'plate', side: -1, source: 'rogue-rig.svg', pathIndex: 11, transform: PHOTO2_TRANSFORM },
    { id: 'photophore-2r', role: 'plate', side: 1, source: 'rogue-rig.svg', pathIndex: 12, transform: PHOTO2_TRANSFORM },
  ],
  ecology: {
    beh: {
      mood: 'Drifter', text: 'Reads as a predator and isn’t one -- a passive filter-feeder drifting with its cloak spread.',
      school: 0, sepMul: 1, wander: 0.3, wanderRate: 0.8, turn: 90, vortex: 0.5, z: [0.4, 0.9], minSp: 0.08,
    },
    eco: { pop: 3, eats: [], flee: 'bolt' },
  },
};
