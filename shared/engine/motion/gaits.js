/* INTERACTIONS — gaits: one set of rules for which feet may be in the air, in 2D and 3D.
   The 3D walker (shared/engine/motion/walker.js) and the flat sheet walker that Rig, Ecology and the
   scenes use (shared/engine/generators/creature-walk.js) both step from here, so a gait means the
   same thing everywhere.

   Stepping gaits (a foot steps when it has fallen too far behind, if the gait lets it):
     Gaits.mayStep(gait, leg, legs)   may this leg lift now? legs are { i, side, group, stepping }
       alt / tetrapod   two sets take turns        ripple   wait for neighbours and the foot opposite
       wave             one foot at a time         free     no coordination

   Running gaits (feet on a clock; see RUN): { slow, fast } and when each takes over.
     in 3D by pace (share of top speed): walkBelow, fastAbove
     in 2D by speed in leg lengths per second: slowAt, fastAt
     a gait: duty = share of the cycle a foot is planted; offset(row, side, rows) = the leg's place in
     the cycle (row 0 is the front pair, rows = last row's index); reach = leg lengths travelled per
     cycle; lift = swing height in leg lengths; bounce, rock = how much the body bounds and pitches;
     beats = times per stride (2 for a trot, 1 for a gallop)

     Gaits.pick(run, legLengthsPerSecond)       -> the gait to run at that speed, or null to walk
     Gaits.auto(pairs)                          -> the RUN set that suits a body with that many leg pairs
     Gaits.swing(gait, phase, row, side, rows)  -> -1 while the foot is planted, else 0..1 through its swing

   Mechanism only. Classic script -> window.Gaits. */
(function () {
  "use strict";
  const RUN = {
    horse: {
      walkBelow: 0.3, fastAbove: 0.72, slowAt: 2.2, fastAt: 3.6,
      slow: { name: "trot", duty: 0.46, reach: 1.3, lift: 0.22, bounce: 0.045, rock: 0.015, beats: 2,
        offset: (row, side) => ((row + (side > 0 ? 0 : 1)) % 2) * 0.5 },              // diagonal pairs together
      fast: { name: "gallop", duty: 0.38, reach: 1.9, lift: 0.3, bounce: 0.08, rock: 0.1, beats: 1,
        offset: (row, side, rows) => (1 - row / rows) * 0.55 + (side > 0 ? 0 : 0.1) }, // hind pair, then fore, each foot a beat after its partner
    },
    // a heavier machine: a pace (same-side legs together) and then a bound (front pair, back pair)
    strider: {
      walkBelow: 0.35, fastAbove: 0.8, slowAt: 2.4, fastAt: 4,
      slow: { name: "pace", duty: 0.5, reach: 1.1, lift: 0.16, bounce: 0.02, rock: 0.0, beats: 2, offset: (row, side) => (side > 0 ? 0 : 0.5) },
      fast: { name: "bound", duty: 0.4, reach: 1.6, lift: 0.24, bounce: 0.07, rock: 0.12, beats: 1, offset: (row, side, rows) => (1 - row / rows) * 0.5 },
    },
  };
  function mayStep(gait, L, legs) {
    if (gait === "free") return true;
    for (const o of legs) {
      if (!o.stepping || o === L) continue;
      if (gait === "wave") return false;
      if (gait === "ripple") { if ((o.side === L.side && Math.abs(o.i - L.i) === 1) || (o.i === L.i && o.side !== L.side)) return false; }
      else if (o.group !== L.group) return false;                                   // alt, tetrapod
    }
    return true;
  }
  const pick = (run, v) => (!run ? null : v > run.fastAt ? run.fast : v > run.slowAt ? run.slow : null);
  // four legs trot and gallop; six or eight pace and bound; a centipede never runs, it ripples faster
  const auto = (pairs) => (pairs === 2 ? RUN.horse : pairs === 3 || pairs === 4 ? RUN.strider : null);
  function swing(gait, phase, row, side, rows) {
    const ph = (((phase + gait.offset(row, side, Math.max(1, rows))) % 1) + 1) % 1;
    return ph < gait.duty ? -1 : (ph - gait.duty) / (1 - gait.duty);
  }
  window.Gaits = { RUN, mayStep, pick, auto, swing };
})();
