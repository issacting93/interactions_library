/* INTERACTIONS — the skeleton: what a moving creature is, each frame, for anything that draws it.

   The split Rain World makes: the motion layer moves a creature and draws nothing; a look reads where the
   creature is and draws it. This file is the seam between them. Every motion source writes the same
   skeleton, and every look reads only the skeleton (plus the creature's own art, which it gets once):

     motion                                   skeleton                    looks
     CreatureBody (physics chunks, legs)  ─┐                           ┌─ KitLook   the kit's SVG parts on the bones
     Walker (the Bestiary's IK walker)    ─┼─► { segs, chunks, limbs } ─┼─ SoftLook  a soft body over the chunks
     (a swimmer is a body with no legs)   ─┘                           └─ BonesLook the skeleton itself

   Format, version 1. All points are { x, y, z } in world units, y up. Arrays keep their objects from frame
   to frame (a look can hold on to them).

     skel.v        1
     skel.t        seconds of simulated time
     skel.mode     "walk" | "swim" | "fly"
     skel.segs[i]  one rigid piece of body, in the order of def.segs (head first):
                     o  origin              where the piece's drawing is centred (the def's seg origin)
                     x  side axis           unit, toward the creature's left (the side legs called "L" hang on)
                     y  up axis             unit
                     z  forward axis        unit, toward the head
                   A look puts the piece's drawing in this frame: world = o + x*lx + y*ly + z*lz.
     skel.chunks[] the body as a chain of round masses, head first: { p, r }. A physics body has these as
                   its own state; a walker reports one per piece. A look may draw a soft outline round them.
     skel.limbs[]  { kind: "leg" | "arm" | "wing", seg, side (1 left, -1 right), i (pair index, front first),
                     src (which of def.segs[seg].legs, or .arms for an arm or wing, it was built from: a look
                     finds the limb's drawing there),
                     joints: [hip, knee, ..., foot] (bone count + 1 points),
                     plane: unit hinge axis (a bone's drawing is laid across it),
                     planted: the foot is on the ground and holding }
     skel.feel     { pace 0..1, grip 0..1 (share of feet planted), air 0..1 (how far off the ground) }:
                   what a look may want for secondary motion (a sway, a dust puff), never needed to draw

   Classic script, no dependencies -> window.Skeleton. */
(function () {
  "use strict";
  const V = () => ({ x: 0, y: 0, z: 0 });

  /** An empty skeleton with room for `segs` pieces, `chunks` chunks and the limbs listed by bone count. */
  function create(segs, chunks, limbs) {
    return {
      v: 1, t: 0, mode: "walk",
      segs: Array.from({ length: segs }, () => ({ o: V(), x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } })),
      chunks: Array.from({ length: chunks }, () => ({ p: V(), r: 0.1 })),
      limbs: limbs.map((L) => ({ kind: L.kind || "leg", seg: L.seg, side: L.side, i: L.i || 0, src: L.src || 0, joints: Array.from({ length: L.bones + 1 }, V), plane: { x: 1, y: 0, z: 0 }, planted: false })),
      feel: { pace: 0, grip: 1, air: 0 },
    };
  }

  /** The piece's frame as a column-major 4x4 (three.js Matrix4.fromArray reads this). */
  function matrix(seg, out = new Array(16)) {
    const { o, x, y, z } = seg;
    out[0] = x.x; out[1] = x.y; out[2] = x.z; out[3] = 0;
    out[4] = y.x; out[5] = y.y; out[6] = y.z; out[7] = 0;
    out[8] = z.x; out[9] = z.y; out[10] = z.z; out[11] = 0;
    out[12] = o.x; out[13] = o.y; out[14] = o.z; out[15] = 1;
    return out;
  }
  /** A point given in the piece's own frame, in the world. */
  function toWorld(seg, lx, ly, lz, out = V()) {
    const { o, x, y, z } = seg;
    out.x = o.x + x.x * lx + y.x * ly + z.x * lz;
    out.y = o.y + x.y * lx + y.y * ly + z.y * lz;
    out.z = o.z + x.z * lx + y.z * ly + z.z * lz;
    return out;
  }

  /** Problems with a skeleton, as strings (none when it is sound): used by the checks. */
  function check(s) {
    const bad = [], fin = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    if (s.v !== 1) bad.push("version " + s.v);
    s.segs.forEach((g, i) => {
      if (![g.o, g.x, g.y, g.z].every(fin)) bad.push(`seg ${i} not finite`);
      const n = (a) => Math.hypot(a.x, a.y, a.z), d = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
      if ([g.x, g.y, g.z].some((a) => Math.abs(n(a) - 1) > 1e-3)) bad.push(`seg ${i} axes not unit`);
      if (Math.abs(d(g.x, g.y)) > 1e-3 || Math.abs(d(g.y, g.z)) > 1e-3 || Math.abs(d(g.x, g.z)) > 1e-3) bad.push(`seg ${i} axes not square`);
    });
    s.chunks.forEach((c, i) => { if (!fin(c.p) || !(c.r > 0)) bad.push(`chunk ${i}`); });
    s.limbs.forEach((L, i) => { if (!L.joints.every(fin) || !fin(L.plane)) bad.push(`limb ${i} not finite`); });
    return bad;
  }

  window.Skeleton = { create, matrix, toWorld, check, V };
})();
