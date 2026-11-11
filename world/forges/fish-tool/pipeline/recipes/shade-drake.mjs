// Shade Drake: the kit sheet first filed as "unnamed no. 30" (its key is still sheet-unnamed-no-30, since
// saved worlds and block sets point at it). A small crowned head set into a wide horned yoke, a dark
// hide behind it, and two pairs of long wisp wings trailing back. The swimmer is the sheet itself.
//
// Each of the sheet's shapes is stored twice (a fill, then a masked outline of the same shape), so only
// the first is taken.
import { fromKit } from '../lib/from-kit.mjs';

export default {
  key: 'shade-drake',
  name: 'Shade Drake',
  blurb: 'A crowned head in a horned yoke, dark wisp wings trailing behind it like smoke.',
  weight: 1,
  swim: { len: 1.6, waves: 0.5, amp: 0.45, ampPow: 2, bend: 0.8, fin: 0.35, lag: 0, sep: 1.0, speed: 1.0 },
  partsManifest: fromKit('sheet-unnamed-no-30', { scale: 20, parts: {
    P344: { role: 'fin', phaseSlot: 0 }, P340: { role: 'fin', phaseSlot: 1 },
    P342: { role: 'plate' }, P346: { role: 'plate', paths: [0] }, P347: { role: 'head', paths: [0] },
  } }),
  ecology: {
    beh: {
      mood: 'Shadow', text: 'Keeps to the dim water under the schools and rises through them in one slow pass, taking the small and the slow.',
      school: 0, sepMul: 1.3, wander: 0.25, wanderRate: 0.7, turn: 120, vortex: 0.4, z: [0.55, 0.95], minSp: 0.08, sight: 5, chase: 0.5,
    },
    eco: { pop: 2, eats: ['wisp', 'leech', 'moth'], catch: 0.3, rest: 6, flee: 'none' },
  },
};
