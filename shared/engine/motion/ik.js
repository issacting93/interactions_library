/* shared/engine/motion/ik.js — inverse kinematics for limbs.
   A mechanism, not a look: it moves joints and draws nothing, so any skin can ride the bones it solves.

     IK.twoBone(root, target, l1, l2, pole, outKnee, outEnd)
         two bones of length l1, l2 from root toward target. The middle joint bends toward `pole`
         (a direction: up for a spider's knee, forward for a person's). Out of reach, the chain
         straightens and points at the target. Writes outKnee and outEnd.
     IK.fabrik(J, lens, root, target, pole, bias)
         any number of bones. J is the joint list (lens.length + 1 points), updated in place.
         Each call first nudges the joints toward `pole` by bias x bone length, so long chains
         (tentacles, long legs) keep an arch instead of folding flat; 0 turns that off.

   Works on THREE.Vector3, or anything with the same methods (copy, clone, subVectors,
   addScaledVector, dot, length, lengthSq, normalize, divideScalar, distanceTo, set).
   Used by world/forges/walker-bestiary and world/forges/townsfolk.
   Classic script, no dependencies: load it before the page's module. */
(function () {
  "use strict";
  let _a = null, _b = null;
  // scratch vectors, made from the first vector we are given so no THREE import is needed
  const tmp = (v) => { if (!_a) { _a = v.clone(); _b = v.clone(); } };

  // two bones, knee bends toward `pole`
  function twoBone(root, target, l1, l2, pole, outKnee, outEnd) {
    tmp(root);
    _a.subVectors(target, root); let D = _a.length(); _a.divideScalar(D || 1);
    const maxD = (l1 + l2) * 0.999; if (D > maxD) D = maxD; if (D < Math.abs(l1 - l2) + 1e-3) D = Math.abs(l1 - l2) + 1e-3;
    const ang = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D))));
    _b.copy(pole).addScaledVector(_a, -pole.dot(_a)); if (_b.lengthSq() < 1e-8) _b.set(0, 1, 0); _b.normalize();
    outKnee.copy(root).addScaledVector(_a, l1 * Math.cos(ang)).addScaledVector(_b, l1 * Math.sin(ang));
    outEnd.copy(root).addScaledVector(_a, D);
  }
  // FABRIK on joints J[0..n], biased toward `pole` each frame so long chains keep their arch
  function fabrik(J, lens, root, target, pole, bias) {
    tmp(root);
    const n = lens.length; let total = 0; for (const l of lens) total += l;
    for (let i = 1; i < n; i++) J[i].addScaledVector(pole, bias * lens[i - 1]);
    J[0].copy(root);
    if (root.distanceTo(target) >= total * 0.999) {
      _a.subVectors(target, root).normalize();
      for (let i = 0; i < n; i++) J[i + 1].copy(J[i]).addScaledVector(_a, lens[i]);
      return;
    }
    for (let it = 0; it < 12; it++) {
      J[n].copy(target);
      for (let i = n - 1; i >= 0; i--) { _a.subVectors(J[i], J[i + 1]); const l = _a.length() || 1; J[i].copy(J[i + 1]).addScaledVector(_a, lens[i] / l); }
      J[0].copy(root);
      for (let i = 0; i < n; i++) { _a.subVectors(J[i + 1], J[i]); const l = _a.length() || 1; J[i + 1].copy(J[i]).addScaledVector(_a, lens[i] / l); }
      if (J[n].distanceToSquared(target) < 1e-6) break;
    }
  }

  window.IK = { twoBone, fabrik };
})();
