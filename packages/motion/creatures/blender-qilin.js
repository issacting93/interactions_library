/* The Qilin: Zac's Blender Qilin (the Walker Bestiary's GLB mock, packages/kit/data/mechs/blender-mech.glb) put through Kit to 3D.
   Its pieces were traced flat into the kit by tools/kit3d/glb-to-kit.mjs (sheet "sheet-blender-qilin"): the two body plates from above
   (P721 lower, P722 upper), the leg from the side (P723; the mock's legs are all one mesh) and the head from the front (P724). From there
   they go the way every kit part does: the plates made solid as thin flat cores, the leg drawing cut along its spine and skinned
   (SkinLeg), the head made solid on the neck's tip (AppendageSolid). The plates sit where the mock has them (heights and fore-aft offsets
   from the GLB, at 0.26 walker units to its unit); the legs are drawn longer, as the Bestiary stands them. One rigid piece (not a chain):
   its neck and tail are AppendageSolid's. It runs as a horse (Gaits.RUN.horse).
   Needs registry.js and chain.js (CreatureKit); LimbArt and PartLib when built. */
(function () {
  "use strict";
  function build(parts) {
    const K = window.CreatureKit, polysOf = K.index(parts);
    const at = (id, w, q) => { const polys = polysOf(id); if (!polys) return null; const b = K.box(polys);
      return { polys, mirror: false, cx: b.cx || 1e-6, cy: b.cy, k: w / b.w, y: q.y || 0, z: q.z || 0, solid: q.solid }; };
    const M = 0.26, FLAT = { mode: "plate", thick: 0.1, inner: 0.25, edge: 0.04 };   // M: walker units to one of the mock's. The mock's plates are thin flat sheets: a low bevel to a flat top, not a rounded belly
    const body = [at("P721", 5.76 * M, { y: 0, z: 0.16, solid: FLAT }), at("P722", 6.53 * M, { y: 0.71 * M, z: -0.02, solid: FLAT })].filter(Boolean);
    // the leg is drawn from the side, so it stands in its own plane under the body (upright), its knee pointing back the way the drawing's bulges (pole)
    const LP0 = polysOf("P723"), LP = LP0 && K.fine(LP0, 4), fr = K.BLENDER_FRACS; let legs = [];
    if (LP) { const leg = (ang, r, len) => { const a = ang * Math.PI / 180; return { keepOwn: true, artObj: window.LimbArt.sliceSpine(LP, K.BLENDER_LEG, fr), ang, len, fracs: fr, reach: 0.12, upright: 1, pole: [-1, 0.35], hip: [Math.sin(a) * r, 0.0, Math.cos(a) * r] }; };
      legs = [leg(44, 0.47, 1.6), leg(143, 0.55, 1.55)]; }
    const hp = polysOf("P724"), hb = hp && K.box(hp);
    return { segs: [{ h: 1.35, parts: body, arms: [], legs }], frame: true, speed: 0.6, stride: 0.5, lift: 0.3, turn: 1.3, Lm: 1.6, appendages: "qilin", bl: 1.2, run: "horse",   // h: hips high, so the long legs stand near straight
      neck: { rise: 0.14, reach: 0.46, arch: 0.04, rings: 9, mane: true },   // as the Bestiary carries it: the neck reaching forward and low, the head out ahead of the plates
      head: hp ? { polys: hp, k: (2.9 * M) / hb.w, cx: hb.cx, cy: hb.cy, h: hb.h } : null };   // the head, 2.9 of the mock's units across, made solid on the neck
  }
  window.Creatures.register({
    key: "qilin", name: "Qilin", tier: "Qilin", color: [0.91, 0.69, 0.29], mood: "Rebuilt from the kit, in 3D",
    text: "Zac's Blender Qilin, traced flat into the kit and rebuilt the way every kit part is: its two body plates seen from above, its leg from the side and its head from the front, each made solid. The plates stay thin and flat, the legs stand upright under them like a horse's, cut along their own thigh and shin and bending at the knee, and the head reaches out ahead on a low neck, a tufted tail behind. It trots, and gallops when it is pushed.",
    brain: { medium: "land", hunts: [], sense: 11, fearR: 6, calmR: 2.5, speed: 0.9, run: 2.2, bold: 0.35, hungerRate: 0.02, hungry: 0.5 },   // grazes, and gallops off when startled
    build,
  });
})();
