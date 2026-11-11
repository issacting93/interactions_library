// Drape Vampire: a horned skull on a string of hooked vertebrae, four pairs of drapes hung off the
// spine, a lance tail. The swimmer is the kit sheet itself (sheet-drape-vampire): the four drapes are
// the sheet's original parts, the head, mantle and tail were drawn for it
// (shared/data/kit-sources/drape-vampire-body.svg).
//
// An earlier draft of this recipe borrowed Cloak Rogue's head and cloak and never went into the water;
// it did not match the kit sheet of the same name, so it was replaced by this one.
import { fromKit } from '../lib/from-kit.mjs';

export default {
  key: 'drape-vampire',
  name: 'Drape Vampire',
  blurb: 'A horned skull on a hooked spine, four pairs of drapes spread like a cloak, a lance for a tail.',
  weight: 1,
  swim: { len: 1.5, waves: 0.6, amp: 0.5, ampPow: 1.8, bend: 0.8, fin: 0.3, lag: 0, sep: 1.0, speed: 0.8 },
  partsManifest: fromKit('sheet-drape-vampire', { scale: 20, parts: {
    P152: { role: 'fin', phaseSlot: 0 }, P153: { role: 'fin', phaseSlot: 1 }, P154: { role: 'fin', phaseSlot: 2 }, P155: { role: 'fin', phaseSlot: 3 },
    P751: { role: 'plate' }, P752: { role: 'plate' }, P753: { role: 'plate' }, P754: { role: 'plate' }, P755: { role: 'plate' },
    P756: { role: 'tail' },
    P748: { role: 'head' }, P749: { role: 'eye' }, P750: { role: 'whisker' },
  } }),
  ecology: {
    beh: {
      mood: 'Drifter', text: 'Reads as a predator and is not one: hangs in the mid-water with its drapes spread, sieving what drifts past.',
      school: 0, sepMul: 1, wander: 0.3, wanderRate: 0.8, turn: 90, vortex: 0.5, z: [0.4, 0.9], minSp: 0.08,
    },
    eco: { pop: 3, eats: [], flee: 'bolt' },
  },
};
