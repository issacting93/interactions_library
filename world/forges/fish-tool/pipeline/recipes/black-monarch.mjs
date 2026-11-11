// Black Monarch: solid moth wings round a horned, armoured body. The swimmer is the kit sheet itself
// (sheet-black-monarch), so it follows the kit on the next bake.
//
// Redrawn 2026-11-11 (shared/data/kit-sources/black-monarch.svg): the three plain segments down the
// centreline gave way to horns (P757), a head (P758) and a carapace (P759); the lower wings sit a little
// lower. Before that this recipe read the first flat export of the creature (removed; mono/Black Monarch.svg is now this recipe's own render).
//
// P170 holds both lower wings in one centre part; they are taken apart here so each can beat.
import { fromKit } from '../lib/from-kit.mjs';

export default {
  key: 'black-monarch',
  name: 'Black Monarch',
  blurb: 'Solid moth wings round a horned, armoured body: a crown of two long horns, a small head, a carapace like a seal.',
  weight: 1,
  partsManifest: fromKit('sheet-black-monarch', { scale: 13.6, parts: {
    P171: { role: 'fin', phaseSlot: 0 },
    'P170#1': { role: 'fin', side: -1, phaseSlot: 1 }, 'P170#0': { role: 'fin', side: 1, phaseSlot: 1 },
    P759: { role: 'plate' }, P758: { role: 'head' }, P757: { role: 'plate' },
  } }),
  ecology: {
    beh: {
      mood: 'Moth', text: 'Flutters in short glides near the surface, wings catching the light instead of driving much speed.',
      school: 0.2, sepMul: 0.9, wander: 0.4, wanderRate: 1.4, turn: 110, vortex: 0.4, z: [0.05, 0.4], minSp: 0.08,
    },
    eco: { pop: 4, eats: [], flee: 'scatter' },
  },
};
