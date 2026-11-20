/* INTERACTIONS — looks: ways to draw a creature from its skeleton (shared/engine/motion/skeleton.js).

   A look gets the creature's def once (for its art: the kit's parts and leg blades) and the skeleton
   every frame, and draws. It never moves the creature and never reads the motion layer's own state, so
   any look can be put on any body: a physics body (creature-body.js), the Bestiary's IK walker, or a
   swimmer, and two looks can draw the same moving creature side by side.

     import { KitLook, SoftLook, BonesLook } from ".../shared/engine/motion/looks.js";
     const look = new KitLook(THREE, scene, def, skel, { color });
     each frame: look.update(skel);   look.dispose() when done

   KitLook   the species as drawn: each body piece's kit parts in the piece's frame, each leg's own blade
             cut into bones and laid along them (the Walker Bestiary's drawing, read from the skeleton)
   SoftLook  Rain World's way: a soft body round the chunks (a dark filled tube with a lit rim), tapered
             tubes for the legs. Nothing of the drawing, only mass and pose
   BonesLook the skeleton itself: chunks as rings, the spine, the bones, which feet are planted

   ES module; THREE is passed in so this file has no import of its own. Needs window.Skeleton, and for
   KitLook window.LimbArt (to cut a wing's drawing). */

const SK = () => window.Skeleton;

/* ---------- the kit's drawing ---------- */
// a point of a part, drawn on the 400 x 400 sheet, in its body piece's own frame (x side, y up, z forward);
// the same mapping the Walker Bestiary uses, so a def drawn there is drawn the same here
function mapPart(e, sx, sy, mirror) {
  const k = e.k * (e.s || 1), cx = e.cx || 200;
  const x = (cx - sx) * k * (mirror ? -1 : 1);
  if (e.upright) return [x, (e.y || 0) + (e.cy - sy) * k, e.z || 0];
  const z = (e.z || 0) + (e.cy - sy) * k;
  let y = e.y || 0;
  if (e.dome) { const R = e.dome.R, r = Math.hypot(sx - e.dome.c[0], sy - e.dome.c[1]) / R; y += r < 1 ? R * k * e.dome.hf * Math.sqrt(1 - r * r) : (r - 1) * R * k * 0.55; }
  else if (e.lift) y += e.lift(sx, sy);
  else if (e.arch) { const u = (sx - cx) / e.arch.hw; y += e.arch.h * Math.max(0, 1 - u * u); }
  return [x, y, z];
}
function partLines(entries, parts) {
  const out = [];
  for (const e of entries) {
    const P = e.polys ? null : parts && parts[e.id]; if (!e.polys && !P) continue;
    const polys = e.polys || P.polys, mir = e.polys ? !!e.mirror : P.side === "left";
    for (const m of mir ? [false, true] : [false]) for (const pl of polys)
      for (let i = 0; i + 3 < pl.length; i += 2) out.push(...mapPart(e, pl[i], pl[i + 1], m), ...mapPart(e, pl[i + 2], pl[i + 3], m));
  }
  return out;
}

export class KitLook {
  /** opts: { color, parts (id -> { side, polys }) for defs that name parts by id, legArt(ld) for a leg's cut drawing } */
  constructor(THREE, scene, def, skel, opts = {}) {
    this.T = THREE; this.scene = scene; this.def = def; this.objs = [];
    const mat = (this.mat = new THREE.LineBasicMaterial({ color: opts.color ?? 0x5be39a }));
    this.groups = def.segs.map((sd) => {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(partLines(sd.parts || [], opts.parts), 3));
      const grp = new THREE.Group(); grp.add(new THREE.LineSegments(g, mat)); grp.matrixAutoUpdate = false; scene.add(grp); this.objs.push(grp);
      return grp;
    });
    // each limb's drawing, cut into its bones (art = { bones: [[s, v, ...] per bone], L })
    const LA = window.LimbArt;
    this.limbArt = skel.limbs.map((L) => {
      const sd = def.segs[L.seg];
      if (L.kind === "leg") { const ld = sd.legs[L.src] || sd.legs[0]; return { art: opts.legArt ? opts.legArt(ld) : ld.artObj, len: ld.len, lens: ld.fracs.map((f) => f * ld.len) }; }
      const ad = (sd.arms || [])[L.src]; if (!ad) return null;
      const polys = ad.artPolys || (opts.parts && opts.parts[ad.art] && opts.parts[ad.art].polys); if (!polys || !LA) return null;
      const { J, T } = LA.jointAndTip(polys);
      return { art: LA.sliceSpine(polys, [J, T], ad.fracs), len: ad.len, lens: ad.fracs.map((f) => f * ad.len) };
    });
    let n = 0; for (const a of this.limbArt) if (a && a.art) for (const b of a.art.bones) n += b.length / 2;
    this.pos = new Float32Array(Math.max(2, n) * 3);
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.limbs = new THREE.LineSegments(lg, mat); this.limbs.frustumCulled = false; scene.add(this.limbs); this.objs.push(this.limbs);
    this.m = new Array(16);
  }
  update(skel) {
    const S = SK();
    skel.segs.forEach((sg, i) => { const grp = this.groups[i]; grp.matrix.fromArray(S.matrix(sg, this.m)); grp.matrixWorldNeedsUpdate = true; });
    // a leg's blade lies along each bone, nearly flat (the sheet is a top view), tilted to read from the side
    const P = this.pos; let o = 0;
    const d = { x: 0, y: 0, z: 0 }, vp = { x: 0, y: 0, z: 0 }, pv = { x: 0, y: 0, z: 0 };
    skel.limbs.forEach((L, li) => {
      const A = this.limbArt[li]; if (!A || !A.art) return;
      const J = L.joints, art = A.art, k = A.len / art.L, pl = L.plane, side = L.side;
      for (let bi = 0; bi < A.lens.length; bi++) {
        const a = J[bi], b = J[bi + 1];
        d.x = b.x - a.x; d.y = b.y - a.y; d.z = b.z - a.z; const l = Math.hypot(d.x, d.y, d.z) || 1; d.x /= l; d.y /= l; d.z /= l;
        vp.x = pl.y * d.z - pl.z * d.y; vp.y = pl.z * d.x - pl.x * d.z; vp.z = pl.x * d.y - pl.y * d.x;
        const vl = Math.hypot(vp.x, vp.y, vp.z) || 1; vp.x /= vl; vp.y /= vl; vp.z /= vl;
        pv.x = pl.x * side * 0.906 + vp.x * 0.423; pv.y = pl.y * side * 0.906 + vp.y * 0.423; pv.z = pl.z * side * 0.906 + vp.z * 0.423;
        const pl2 = Math.hypot(pv.x, pv.y, pv.z) || 1; pv.x /= pl2; pv.y /= pl2; pv.z /= pl2;
        const ks = (l / A.lens[bi]) * k, sg = art.bones[bi];
        for (let i = 0; i < sg.length; i += 2) {
          const s = sg[i] * ks, v = sg[i + 1] * k;
          P[o++] = a.x + d.x * s + pv.x * v; P[o++] = a.y + d.y * s + pv.y * v; P[o++] = a.z + d.z * s + pv.z * v;
        }
      }
    });
    const g = this.limbs.geometry; g.setDrawRange(0, o / 3); g.attributes.position.needsUpdate = true;
  }
  /** line vertices drawn this frame (body pieces and limbs): what a check can count */
  count() { return this.groups.reduce((n, grp) => n + grp.children[0].geometry.attributes.position.count, 0) + this.limbs.geometry.drawRange.count; }
  dispose() { for (const o of this.objs) { this.scene.remove(o); o.traverse((c) => c.geometry && c.geometry.dispose()); } this.mat.dispose(); }
}

/* ---------- a soft body ---------- */
// a tube through points with radii: `rings` rings of `sides` vertices; the ends close to a point
function tubeGeo(THREE, rings, sides) {
  const g = new THREE.BufferGeometry(), idx = [];
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rings * sides * 3), 3));
  for (let r = 0; r + 1 < rings; r++) for (let s = 0; s < sides; s++) {
    const a = r * sides + s, b = r * sides + ((s + 1) % sides), c = a + sides, d = b + sides;
    idx.push(a, b, c, b, d, c);   // wound so the outside faces out
  }
  g.setIndex(idx); return g;
}
// lay a tube along pts (with radii rad and a reference up) into geometry g; flat = height/width of the section
function layTube(g, pts, rad, sides, up, grow, flat) {
  const P = g.attributes.position.array, n = pts.length; let o = 0;
  const t = { x: 0, y: 0, z: 0 }, s = { x: 0, y: 0, z: 0 }, u = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    t.x = b.x - a.x; t.y = b.y - a.y; t.z = b.z - a.z; const tl = Math.hypot(t.x, t.y, t.z) || 1; t.x /= tl; t.y /= tl; t.z /= tl;
    s.x = up.y * t.z - up.z * t.y; s.y = up.z * t.x - up.x * t.z; s.z = up.x * t.y - up.y * t.x;
    let sl = Math.hypot(s.x, s.y, s.z); if (sl < 1e-6) { s.x = 1; s.y = 0; s.z = 0; sl = 1; } s.x /= sl; s.y /= sl; s.z /= sl;
    u.x = t.y * s.z - t.z * s.y; u.y = t.z * s.x - t.x * s.z; u.z = t.x * s.y - t.y * s.x;
    const r = rad[i] + grow, rv = rad[i] * flat + grow;
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * Math.PI * 2, c = Math.cos(ang) * r, sn = Math.sin(ang) * rv;
      P[o++] = pts[i].x + s.x * c + u.x * sn; P[o++] = pts[i].y + s.y * c + u.y * sn; P[o++] = pts[i].z + s.z * c + u.z * sn;
    }
  }
  g.attributes.position.needsUpdate = true; g.computeBoundingSphere();
}
// Catmull-Rom through the chunks, `per` points per gap, with the radius following (and closing at the ends)
function spine(chunks, per, out, rad, endTaper) {
  const n = chunks.length; let m = 0;
  const at = (i) => chunks[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1 || (n === 1 && i === 0); i++) {
    const p0 = at(i - 1).p, p1 = at(i).p, p2 = at(i + 1).p, p3 = at(i + 2).p;
    const steps = n === 1 ? 1 : per;
    for (let k = 0; k < steps; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const q = out[m] || (out[m] = { x: 0, y: 0, z: 0 });
      q.x = f(p0.x, p1.x, p2.x, p3.x); q.y = f(p0.y, p1.y, p2.y, p3.y); q.z = f(p0.z, p1.z, p2.z, p3.z);
      rad[m] = at(i).r + (at(i + 1).r - at(i).r) * t; m++;
    }
  }
  const last = at(n - 1); const q = out[m] || (out[m] = { x: 0, y: 0, z: 0 }); q.x = last.p.x; q.y = last.p.y; q.z = last.p.z; rad[m] = last.r; m++;
  return m;
}

export class SoftLook {
  /** opts: { color (rim), fill, rim (rim width, world units), flat (body section height/width) } */
  constructor(THREE, scene, def, skel, opts = {}) {
    this.T = THREE; this.scene = scene; this.objs = []; this.opts = { rim: 0.018, flat: 0.62, ...opts };
    const fill = (this.fill = new THREE.MeshBasicMaterial({ color: opts.fill ?? 0x121a16 }));
    const rim = (this.rim = new THREE.MeshBasicMaterial({ color: opts.color ?? 0x5be39a, side: THREE.BackSide }));
    this.SIDES = 14; this.PER = skel.chunks.length > 4 ? 4 : 8;
    // the chain is the chunks with one more point past each end (see update), PER rings between each pair
    const nc = skel.chunks.length, ringsBody = nc > 1 ? (nc + 1) * this.PER + 1 : 2;
    // the body, and the same body a little larger seen from inside: its outline
    const mk = (rings, sides) => { const a = tubeGeo(THREE, rings, sides), b = tubeGeo(THREE, rings, sides); const ma = new THREE.Mesh(a, fill), mb = new THREE.Mesh(b, rim); ma.frustumCulled = mb.frustumCulled = false; scene.add(mb, ma); this.objs.push(ma, mb); return [a, b]; };
    this.body = mk(ringsBody, this.SIDES);
    this.limbRings = skel.limbs.map((L) => (L.joints.length - 1) * 3 + 1);
    this.limbs = skel.limbs.map((L, i) => mk(this.limbRings[i], 8));
    this.pts = []; this.rad = []; this.lp = []; this.lr = [];
    this.up = { x: 0, y: 1, z: 0 };
  }
  update(skel) {
    const C = skel.chunks, n = C.length, o = this.opts;
    // the chain, extended a little past head and tail so the ends round off
    const ext = (a, b, r) => ({ p: { x: a.p.x + (a.p.x - b.p.x) * 0.35, y: a.p.y + (a.p.y - b.p.y) * 0.35, z: a.p.z + (a.p.z - b.p.z) * 0.35 }, r });
    const chain = n > 1 ? [ext(C[0], C[1], C[0].r * 0.25), ...C, ext(C[n - 1], C[n - 2], C[n - 1].r * 0.2)] : C;
    const m = spine(chain, this.PER, this.pts, this.rad);
    // fill to the geometry's ring count (the last ring repeats)
    const rings = this.body[0].attributes.position.count / this.SIDES;
    for (let i = m; i < rings; i++) { this.pts[i] = this.pts[m - 1]; this.rad[i] = 0; }
    // up: the head piece's up, so the body stays flat to it
    const up = skel.segs[0].y;
    layTube(this.body[0], this.pts.slice(0, rings), this.rad, this.SIDES, up, 0, o.flat);
    layTube(this.body[1], this.pts.slice(0, rings), this.rad, this.SIDES, up, o.rim, o.flat);
    // legs: tapered tubes along the bones, thick at the hip
    skel.limbs.forEach((L, li) => {
      const J = L.joints, nb = J.length - 1, pts = this.lp[li] || (this.lp[li] = []), rad = this.lr[li] || (this.lr[li] = []);
      let len = 0; for (let i = 0; i < nb; i++) len += Math.hypot(J[i + 1].x - J[i].x, J[i + 1].y - J[i].y, J[i + 1].z - J[i].z);
      let m2 = 0;
      for (let i = 0; i < nb; i++) for (let k = 0; k < 3; k++) {
        const t = k / 3, a = J[i], b = J[i + 1], q = pts[m2] || (pts[m2] = { x: 0, y: 0, z: 0 });
        q.x = a.x + (b.x - a.x) * t; q.y = a.y + (b.y - a.y) * t; q.z = a.z + (b.z - a.z) * t;
        const u = (i + t) / nb; rad[m2++] = len * (L.kind === "leg" ? 0.034 : 0.026) * (1 - 0.7 * u);
      }
      const e = pts[m2] || (pts[m2] = { x: 0, y: 0, z: 0 }); e.x = J[nb].x; e.y = J[nb].y; e.z = J[nb].z; rad[m2++] = len * 0.006;
      const pl = L.plane;
      layTube(this.limbs[li][0], pts, rad, 8, pl, 0, 1);
      layTube(this.limbs[li][1], pts, rad, 8, pl, o.rim * 0.8, 1);
    });
  }
  count() { return this.objs.length; }
  dispose() { for (const ob of this.objs) { this.scene.remove(ob); ob.geometry.dispose(); } this.fill.dispose(); this.rim.dispose(); }
}

/* ---------- the skeleton itself ---------- */
export class BonesLook {
  constructor(THREE, scene, def, skel, opts = {}) {
    this.T = THREE; this.scene = scene;
    const RING = 16; this.RING = RING;
    let n = skel.chunks.length * RING + skel.chunks.length + skel.segs.length * 3 + 8;
    for (const L of skel.limbs) n += L.joints.length + 4;
    this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: opts.overlay ? false : true, transparent: true, opacity: opts.overlay ? 0.85 : 1 });
    this.lines = new THREE.LineSegments(g, this.mat); this.lines.frustumCulled = false; this.lines.renderOrder = opts.overlay ? 5 : 0; scene.add(this.lines);
    this.c = { chunk: [0.36, 0.78, 0.88], bone: [0.91, 0.69, 0.29], planted: [0.36, 0.89, 0.6], air: [0.55, 0.53, 0.49], axis: [0.92, 0.91, 0.87] };
  }
  update(skel) {
    const P = this.pos, Cc = this.col; let o = 0;
    const seg = (a, b, c) => { P[o] = a.x; P[o + 1] = a.y; P[o + 2] = a.z; Cc[o] = c[0]; Cc[o + 1] = c[1]; Cc[o + 2] = c[2]; o += 3; P[o] = b.x; P[o + 1] = b.y; P[o + 2] = b.z; Cc[o] = c[0]; Cc[o + 1] = c[1]; Cc[o + 2] = c[2]; o += 3; };
    const R = this.RING, A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 };
    // chunks: a ring each, level, and the spine between them
    skel.chunks.forEach((ch, i) => {
      for (let k = 0; k < R; k++) {
        const a0 = (k / R) * Math.PI * 2, a1 = ((k + 1) / R) * Math.PI * 2;
        A.x = ch.p.x + Math.cos(a0) * ch.r; A.y = ch.p.y; A.z = ch.p.z + Math.sin(a0) * ch.r;
        B.x = ch.p.x + Math.cos(a1) * ch.r; B.y = ch.p.y; B.z = ch.p.z + Math.sin(a1) * ch.r;
        seg(A, B, this.c.chunk);
      }
      if (i) seg(skel.chunks[i - 1].p, ch.p, this.c.chunk);
    });
    // each piece's frame: side, up, forward
    for (const sg of skel.segs) {
      const s = 0.18;
      for (const ax of [sg.x, sg.y, sg.z]) { B.x = sg.o.x + ax.x * s; B.y = sg.o.y + ax.y * s; B.z = sg.o.z + ax.z * s; seg(sg.o, B, this.c.axis); }
    }
    // bones; a planted foot gets a cross on the ground
    for (const L of skel.limbs) {
      for (let i = 0; i + 1 < L.joints.length; i++) seg(L.joints[i], L.joints[i + 1], L.planted ? this.c.planted : this.c.bone);
      const f = L.joints[L.joints.length - 1], c = 0.04;
      if (L.planted) { A.x = f.x - c; A.y = f.y + 0.005; A.z = f.z; B.x = f.x + c; B.y = f.y + 0.005; B.z = f.z; seg(A, B, this.c.planted); A.x = f.x; A.z = f.z - c; B.x = f.x; B.z = f.z + c; seg(A, B, this.c.planted); }
    }
    const g = this.lines.geometry; g.setDrawRange(0, o / 3); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
  count() { return this.lines.geometry.drawRange.count; }
  dispose() { this.scene.remove(this.lines); this.lines.geometry.dispose(); this.mat.dispose(); }
}

export const LOOKS = { kit: KitLook, soft: SoftLook, bones: BonesLook };
