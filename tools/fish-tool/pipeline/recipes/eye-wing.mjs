// Eye Wing: concept-sketched in sigil-species-rig-svgs/wing-ed.svg (a single hand-drawn Figma
// compound path, 561 subpaths once flattened -- no separable per-limb geometry to extract directly,
// same problem comb-drifter's own concept art (mono/Comb Drifter.svg) already ran into). So, same
// fix as that recipe: re-derive the same silhouette -- two broad glide-wings, a central lidless eye,
// two pairs of jointed claw-legs trailing below -- from real separable parts already proven out in
// other source rigs, instead of fighting the concept art's geometry.
//
// Wings + eye: Glass Manta's own pectoral-wing pair and its own 3-ring eye motif (outer iris, inner
// iris, pupil dot) -- already correctly proportioned to each other because they're copied as-is from
// one creature. Legs: Pincer Crawler's own claw-leg pairs (already centered on x=0 in its own art),
// rescaled from its near-world-scale source family (ratio derived the same way rig.mjs documents the
// others: live pincer bounds height 5151.3 / Pincer Crawler.svg viewBox height 5460.1 = 0.9434) and
// shifted (dx/dy) to hang below the wing/eye cluster instead of sitting at Pincer Crawler's own origin.
//
// Two separate dy's, not one shared offset: leg-inner's dy (1284) already sits it right under the
// wings with a small natural gap (~150 units). leg-outer, though, is Pincer Crawler's own LOWER claw
// segment -- on Pincer Crawler's own body it sits 1011 (scaled) units below leg-inner, a gap that's
// native to that creature's proportions, not a mistake, but on a creature this much smaller it read
// as a floating disconnected foot. LEG_OUTER_TRANSFORM's dy compresses that native gap to ~300 units
// instead, without touching leg-inner/wings (dx/scale stay identical so both leg pairs stay centered
// and correctly proportioned to each other).
const LEG_INNER_TRANSFORM = { scale: 0.9434, dx: 1965, dy: 1284 };
const LEG_OUTER_TRANSFORM = { scale: 0.9434, dx: 1965, dy: 573 };

export default {
  key: 'eye-wing',
  name: 'Eye Wing',
  blurb: 'A pair of broad glider wings flanking one lidless central eye, with two pairs of jointed claw-legs trailing beneath like a dangling afterthought of a body.',
  weight: 1,
  partsManifest: [
    { id: 'wing-l', role: 'fin', side: -1, source: 'Glass Manta.svg', pathIndex: 0, phaseSlot: 2 },
    { id: 'wing-r', role: 'fin', side: 1, source: 'Glass Manta.svg', pathIndex: 1, phaseSlot: 2 },
    { id: 'eye-outer', role: 'plate', side: 0, source: 'Glass Manta.svg', pathIndex: 112 },
    { id: 'eye-mid', role: 'plate', side: 0, source: 'Glass Manta.svg', pathIndex: 113 },
    { id: 'eye-pupil', role: 'eye', side: 0, source: 'Glass Manta.svg', pathIndex: 114 },
    { id: 'leg-inner-l', role: 'leg', side: -1, source: 'Pincer Crawler.svg', pathIndex: 16, phaseSlot: 1, transform: LEG_INNER_TRANSFORM },
    { id: 'leg-inner-r', role: 'leg', side: 1, source: 'Pincer Crawler.svg', pathIndex: 17, phaseSlot: 1, transform: LEG_INNER_TRANSFORM },
    { id: 'leg-outer-l', role: 'leg', side: -1, source: 'Pincer Crawler.svg', pathIndex: 25, phaseSlot: 0, transform: LEG_OUTER_TRANSFORM },
    { id: 'leg-outer-r', role: 'leg', side: 1, source: 'Pincer Crawler.svg', pathIndex: 26, phaseSlot: 0, transform: LEG_OUTER_TRANSFORM },
  ],
  ecology: {
    beh: {
      mood: 'Glider', text: 'Holds a wide, mostly motionless glide on its two wings, claw-legs trailing loose beneath a single watching eye.',
      school: 0, sepMul: 1.3, wander: 0.25, wanderRate: 0.8, turn: 110, vortex: 0.5, z: [0.2, 0.55], minSp: 0.08, sight: 4, chase: 0.4,
    },
    eco: { pop: 3, eats: ['wisp', 'moth'], catch: 0.35, rest: 4, flee: 'none' },
  },
};
