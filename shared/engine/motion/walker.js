/* INTERACTIONS — the walker: one mechanism for everything that walks.
   Moved out of the Walker Bestiary page so any page with a three.js scene can stand a creature up
   and walk it. A creature is data (a "def": body segments, legs, arms, and optionally how it runs
   and what rides along); this file is the mechanism that moves it.

     import { createWalker, RUN, APPENDAGES } from ".../shared/engine/motion/walker.js";
     const { Walker, machineLeg } = createWalker(env);
     const w = new Walker(def, { start, yaw });
     // each frame: w.locomote(dt); w.posture(dt); w.place(); w.gaitStep(dt); w.place(); w.solve(); w.updateAppendages(dt);

   env is what the page lends the walker:
     scene, skinMat          where to add things, and the stroke material
     H(x, z)                 ground height
     S                       live settings { speed, stride, lift, height, gait }
     time()                  seconds since start
     lineSeg, partLines      sheet parts -> line geometry (the page's art pipeline)
     legArtFor(legDef)       a leg's drawing, cut into bones (sliceLimb(id, fracs) does the same for an arm)
     glbStrokes(geo)         a solid's strokes
     makeExtras, spawnDust   optional: export extras (veil, silk, halo, lantern) and footfall dust
     SIM                     the simulation overlay colour

   Needs window.IK (twoBone, fabrik) from shared/engine/motion/ik.js and window.Gaits from
   shared/engine/motion/gaits.js (classic scripts, loaded before this module).

   Motion as data:
     def.stance = "machine"  hips at the corners, each leg in its own upright plane (see machineLeg)
     def.run = RUN.horse     running gaits by speed (trot, then gallop), bounding, rearing when idle
     def.appendages = APPENDAGES.qilin   a neck and/or tail that ride along (see below)            */
import * as THREE from "three";

/* Running gaits live in shared/engine/motion/gaits.js (window.Gaits), shared with the flat sheet
   walker that Rig and Ecology use, so a trot is the same trot in 2D and 3D. */
export const RUN = window.Gaits.RUN;

/* Appendages: a neck off the front of the body and a tail off the back, drawn like the rest of the
   walker in strokes (a hexagonal ring every so often along a curve, joined by lines). Sizes are in
   body lengths, so the same preset fits a small mech and a big one.
     neck  { reach, rise, arch, rings, r0, r1, mane, horns }   forward, up, an S-bend, thickness
     tail  { length, start, turn, rings, r0, r1, tuft, sting } start = angle above straight back,
           turn = how far it bends along its length, in degrees: negative droops, positive curls up
           and over the back
     motion { nod, look, sway, trail, lift }                   which of the walk's cues it follows */
export const APPENDAGES = {
  qilin: { name: "Qilin", neck: { reach: 0.24, rise: 0.5, arch: 0, rings: 8, r0: 0.08, r1: 0.052, mane: true, horns: true },
    tail: { length: 0.62, start: 32, turn: -62, rings: 12, r0: 0.062, r1: 0.01, tuft: 7 } },
  dragon: { name: "Dragon", neck: { reach: 0.52, rise: 0.38, arch: 0.06, rings: 12, r0: 0.09, r1: 0.05, mane: true, horns: true },
    tail: { length: 1.25, start: 14, turn: -26, rings: 18, r0: 0.085, r1: 0.008, tuft: 0, wave: 1.6 } },
  // a big cat: a short thick neck carried low, a long heavy tail hanging and curling up at the tip
  tiger: { name: "Tiger", neck: { reach: 0.2, rise: 0.04, arch: -0.02, rings: 6, r0: 0.12, r1: 0.1, mane: false, horns: false },
    tail: { length: 0.85, start: -10, turn: 30, rings: 14, r0: 0.055, r1: 0.03, tuft: 0 } },
  scorpion: { name: "Scorpion", neck: null,
    tail: { length: 1.05, start: 48, turn: 172, rings: 11, r0: 0.07, r1: 0.03, tuft: 0, sting: true } },
  swan: { name: "Swan", neck: { reach: 0.3, rise: 0.82, arch: -0.16, rings: 14, r0: 0.06, r1: 0.036, mane: false, horns: false },
    tail: { length: 0.2, start: 38, turn: 0, rings: 4, r0: 0.05, r1: 0.012, tuft: 5 } },
};
const MOTION_ALL = { nod: true, look: true, sway: true, trail: true, lift: true };

export function createWalker(env) {
const { scene, skinMat, H, S, lineSeg, partLines, legArtFor, sliceLimb, glbStrokes, SIM } = env;
const makeExtras = env.makeExtras || (() => null), spawnDust = env.spawnDust || (() => {});
const DEG = Math.PI / 180, { twoBone, fabrik } = window.IK;

/* ================= solvers (mechanism) ================= */
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _r = new THREE.Vector3(), _f = new THREE.Vector3(), _pole = new THREE.Vector3();
/* machine stance: hips at the body's corners, feet planted under them, each leg swinging front to
   back in its own upright plane (not fanned out like a spider's), knees set per leg so they never
   flip: front knees forward, back knees back. A leg def gets this from machineLeg(). */
const machineLeg = (front, len, extra) => ({ len, reach: 0.18, keepOwn: true, knee: front ? 1 : -1,
  ang: front ? 78 : 102, hip: [0.34, 0.02, front ? 0.3 : -0.3], ...extra });
/* ================= walker (mechanism) ================= */
const ease = (u) => u * u * (3 - 2 * u);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _e = new THREE.Euler(0, 0, 0, "YXZ");
class Walker {
  constructor(def, opts) {
    this.def = def; this.segs = []; this.legs = []; this.arms = [];
    this.target = new THREE.Vector3(); this.shake = 0; this.huntPause = 0; this.idle = 0;
    const start = opts.start || new THREE.Vector3(), yaw = opts.yaw || 0;
    let back = 0;
    def.segs.forEach((sd, si) => {
      back += sd.gap || 0;
      const g = lineSeg(partLines(sd.parts), skinMat); const grp = new THREE.Group(); grp.add(g); scene.add(grp);
      // a GLB body: the solids, with their outline edges in the walker's line colour
      // a GLB body drawn in strokes, like the other walkers: the outline of each piece
      if (def.glb && si === 0) for (const geo of def.appendages && def.appendages.neck ? def.glb.body : def.glb.body.concat(def.glb.head || [])) grp.add(new THREE.LineSegments(geo.strokes = geo.strokes || glbStrokes(geo), skinMat));
      const pos = new THREE.Vector3(start.x - Math.sin(yaw) * back, 0, start.z - Math.cos(yaw) * back);
      this.segs.push({ sd, grp, pos, prev: pos.clone(), vel: new THREE.Vector3(), yaw, y: H(pos.x, pos.z) + sd.h, pitch: 0, roll: 0, up: new THREE.Vector3(0, 1, 0), legs: [] });
    });
    // legs: mirrored pairs ordered front to back, or radial rings
    const sideCount = { 1: 0, "-1": 0 };
    def.segs.forEach((sd, si) => {
      sd.legs.forEach((ld) => {
        const sides = ld.radial ? [0] : [1, -1];
        for (const side of sides) {
          const a = ld.ang * DEG, sx = side || 1;
          const hip = new THREE.Vector3(ld.hip[0] * sx, ld.hip[1], ld.hip[2]);
          const dir = new THREE.Vector3(Math.sin(a) * sx, 0, Math.cos(a));
          const rest = hip.clone().addScaledVector(dir, ld.len * ld.reach);
          const i = ld.radial ? this.legs.length : sideCount[side]++;
          const L = {
            seg: si, side: ld.radial ? (Math.sin(a) >= 0 ? 1 : -1) : side, radial: !!ld.radial, i,
            name: ld.radial ? "A" + (i + 1) : (side > 0 ? "L" : "R") + (i + 1),
            hipLocal: hip, restLocal: rest, lens: ld.fracs.map((f) => f * ld.len), art: legArtFor(ld), len: ld.len,
            tentacle: !!ld.tentacle, ph: Math.random() * Math.PI * 2, knee: ld.knee || 0, wk: ld.wk || 1,
            J: ld.fracs.map(() => new THREE.Vector3()).concat([new THREE.Vector3()]),
            foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), home: new THREE.Vector3(), plane: new THREE.Vector3(),
            stepping: false, u: 0, extra: 0, err: 0,
          };
          this.legs.push(L); this.segs[si].legs.push(L);
        }
      });
      sd.arms.forEach((ad) => {
        for (const side of [1, -1]) {
          const A = {
            seg: si, side, mountLocal: new THREE.Vector3(ad.mount[0] * side, ad.mount[1], ad.mount[2]),
            restLocal: new THREE.Vector3(ad.rest[0] * side, ad.rest[1], ad.rest[2]),
            lens: ad.fracs.map((f) => f * ad.len), len: ad.len, art: sliceLimb(ad.art, ad.fracs), flap: ad.flap || null,
            J: ad.fracs.map(() => new THREE.Vector3()).concat([new THREE.Vector3()]), plane: new THREE.Vector3(), tgt: new THREE.Vector3(),
          };
          this.arms.push(A);
        }
      });
    });
    const nRadial = this.legs.filter((L) => L.radial).length;
    for (const L of this.legs) {
      L.group = L.radial ? L.i % 2 : (L.i + (L.side > 0 ? 0 : 1)) % 2;
      L.nbrs = L.radial
        ? this.legs.filter((o) => o.radial && (o.i === (L.i + 1) % nRadial || o.i === (L.i + nRadial - 1) % nRadial))
        : this.legs.filter((o) => !o.radial && ((o.side === L.side && Math.abs(o.i - L.i) === 1) || (o.side !== L.side && o.i === L.i)));
    }
    this.place();
    for (const L of this.legs) { this.homeOf(L, L.foot); this.initChain(L.J, L.lens, L.foot); }
    for (const A of this.arms) this.initChain(A.J, A.lens, null);
    if (def.prey) {
      const pg = new THREE.Group(); pg.add(lineSeg(partLines([{ id: def.prey.id, cy: 35.2, k: def.prey.k }]), new THREE.LineBasicMaterial({ color: SIM })));
      scene.add(pg);
      this.prey = { grp: pg, pos: start.clone().add(new THREE.Vector3(Math.sin(yaw) * 2, 0.4, Math.cos(yaw) * 2)), from: new THREE.Vector3(), to: new THREE.Vector3(), hop: 1, strike: 0, cool: 1, lunge: 0, lungeClock: 0 };
      this.prey.pos.y = H(this.prey.pos.x, this.prey.pos.z) + 0.35;
    }
    if (def.extras) this.extras = makeExtras(this, def.extras);
    this.bodyBox = bodyBoxOf(def, this.segs[0].grp);
    if (def.appendages) this.app = makeAppendages(this, def.appendages);
  }
  initChain(J, lens, end) {
    const root = this.segs[0].pos; let total = 0; for (const l of lens) total += l;
    J.forEach((v, i) => v.set(root.x, this.segs[0].y + Math.sin((i / (J.length - 1)) * Math.PI) * total * 0.3, root.z));
    if (end) J[J.length - 1].copy(end);
  }
  dispose() {
    for (const s of this.segs) { scene.remove(s.grp); s.grp.children[0].geometry.dispose(); }
    if (this.prey) { scene.remove(this.prey.grp); this.prey.grp.children[0].geometry.dispose(); }
    if (this.extras) for (const o of this.extras.world) { scene.remove(o); o.geometry && o.geometry.dispose(); }
  }
  place() {
    for (const s of this.segs) {
      s.grp.position.set(s.pos.x, s.y, s.pos.z);
      _e.set(s.pitch, s.yaw, s.roll); s.grp.quaternion.setFromEuler(_e); s.grp.updateMatrixWorld(true);
      s.up.set(0, 1, 0).applyQuaternion(s.grp.quaternion);
    }
  }
  homeOf(L, out, lead = 0) {
    const s = this.segs[L.seg], c = Math.cos(s.yaw), sn = Math.sin(s.yaw), r = L.restLocal;
    out.set(s.pos.x + r.x * c + r.z * sn + s.vel.x * lead, 0, s.pos.z - r.x * sn + r.z * c + s.vel.z * lead);
    out.y = H(out.x, out.z); return out;
  }
  head() { return this.segs[0]; }

  locomote(dt, others) {
    const D = this.def, h = this.head();
    const tgt = this.target;
    _c.subVectors(tgt, h.pos); _c.y = 0;
    const dist = _c.length();
    // brood: push away from siblings
    if (others) for (const o of others) if (o !== this) {
      _d.subVectors(h.pos, o.head().pos); _d.y = 0; const dd = _d.length(), R = D.stride * 9;
      if (dd < R && dd > 1e-3) _c.addScaledVector(_d, ((R - dd) / R) * 2.2 * Math.max(1, dist) / dd);
    }
    const arrive = D.stride * 0.9;
    let v = dist > arrive ? D.speed * S.speed * Math.min(1, dist / (D.stride * 3)) : 0;
    if (D.steer === false) {
      h.yaw += D.spin * dt;
      if (_c.lengthSq() > 1e-8) _c.normalize();
      h.vel.set(_c.x * v, 0, _c.z * v);
    } else {
      const want = Math.atan2(_c.x, _c.z), err = wrap(want - h.yaw);
      if (v > 0 || others) h.yaw += Math.sign(err) * Math.min(Math.abs(err), D.turn * dt * (0.4 + S.speed));
      v *= 0.25 + 0.75 * Math.max(0, Math.cos(err));
      h.vel.set(Math.sin(h.yaw) * v, 0, Math.cos(h.yaw) * v);
    }
    h.pos.addScaledVector(h.vel, dt);
    const yr = wrap(h.yaw - (this.lastYaw ?? h.yaw)) / Math.max(dt, 1e-3); this.lastYaw = h.yaw;
    this.yawRate = (this.yawRate || 0) + (yr - (this.yawRate || 0)) * Math.min(1, dt * 4);
    // chain: each segment trails the one ahead at its gap
    for (let i = 1; i < this.segs.length; i++) {
      const s = this.segs[i], p = this.segs[i - 1];
      _d.subVectors(p.pos, s.pos); _d.y = 0; const l = _d.length() || 1;
      s.pos.copy(p.pos).addScaledVector(_d, -s.sd.gap / l);
      s.yaw = Math.atan2(_d.x, _d.z);
      s.vel.subVectors(s.pos, s.prev).divideScalar(dt || 1); s.prev.copy(s.pos);
    }
    return dist;
  }

  posture(dt) {
    this.rearK = this.rearStep(dt);
    let air = 0; for (const L of this.legs) if (L.stepping) air++;
    const sagK = S.gait === "free" ? 0.07 : 0.025;
    const n = this.segs.length;
    this.segs.forEach((s, i) => {
      let gy, a = 0, b = 0;
      if (s.legs.length) {
        // least-squares tilt from the feet, in the segment's own frame
        const c = Math.cos(s.yaw), sn = Math.sin(s.yaw); let mx = 0, mz = 0, my = 0;
        const P = s.legs.map((L) => { const dx = L.foot.x - s.pos.x, dz = L.foot.z - s.pos.z; return [dx * c - dz * sn, dx * sn + dz * c, H(L.foot.x, L.foot.z)]; });
        for (const p of P) { mx += p[0]; mz += p[1]; my += p[2]; } mx /= P.length; mz /= P.length; my /= P.length;
        let vx = 0, vz = 0, cx = 0, cz = 0;
        for (const p of P) { vx += (p[0] - mx) ** 2; vz += (p[1] - mz) ** 2; cx += (p[0] - mx) * (p[2] - my); cz += (p[1] - mz) * (p[2] - my); }
        a = vx > 1e-4 ? cx / vx : 0; b = vz > 1e-4 ? cz / vz : 0;
        gy = my - a * mx - b * mz;
      } else gy = H(s.pos.x, s.pos.z);
      const sag = (air / Math.max(1, this.legs.length)) * sagK * s.sd.h * 4 + (this.drop || 0);
      const ty = gy + s.sd.h * S.height - sag + (this.def.bob ? Math.sin(env.time() * 1.1) * this.def.bob : 0);
      s.base = s.base ?? s.y; s.base += (ty - s.base) * Math.min(1, dt * 6);
      // a running horse bounds: twice a stride at the trot, once with a rocking pitch at the gallop
      const RS = this.runState, hz = RS && RS.gait, hp = hz ? RS.phase * Math.PI * 2 : 0, ha = hz ? Math.min(1, RS.pace) : 0, rk = this.rearK || 0;
      s.y = s.base + (hz ? s.sd.h * hz.bounce * (hz.beats === 2 ? Math.cos(2 * hp) : Math.sin(hp)) * ha : 0) + rk * s.sd.h * 0.2;
      let pitch;
      if (n > 1) { const yp = this.segs[Math.max(0, i - 1)].y, yn = this.segs[Math.min(n - 1, i + 1)].y, span = (s.sd.gap || 0.4) * 2; pitch = -Math.atan2(yp - yn, span); }
      else pitch = -Math.atan(b);
      if (hz) pitch += hz.rock * (hz.beats === 2 ? Math.sin(2 * hp) : Math.cos(hp)) * ha;
      pitch -= rk * 0.6;
      s.pitch += (pitch - s.pitch) * Math.min(1, dt * (hz || rk ? 12 : 5));
      // lean into the turn, more the faster it is going
      const lean = i === 0 ? THREE.MathUtils.clamp(-(this.yawRate || 0) * Math.hypot(s.vel.x, s.vel.z) * 0.09, -0.16, 0.16) : 0;
      s.roll += (Math.atan(a) + lean - s.roll) * Math.min(1, dt * 5);
    });
    this.drop = Math.max(0, (this.drop || 0) - dt * 2 * this.def.stride);
  }

  /* Running gaits, for a walker with def.run (a RUN entry): once it is moving fast enough the feet
     stop stepping on demand and run on a clock instead. Each leg has a phase offset in the cycle;
     for the first part of the cycle (the duty) its foot is planted, for the rest it swings, tucking
     the foot up and back before reaching forward to land ahead of the hip. Slow down and it hands
     back to the ordinary step-when-needed walk. */
  runStep(dt) {
    const D = this.def, R = D.run, s = this.segs[0], v = Math.hypot(s.vel.x, s.vel.z), Hs = this.runState || (this.runState = { phase: 0, mode: null, pace: 0, wait: 0 });
    Hs.pace += (v / Math.max(1e-3, D.speed * S.speed) - Hs.pace) * Math.min(1, dt * 3);
    const stop = Hs.pace < R.walkBelow || this.rearT != null;
    if (!Hs.mode) {
      if (stop) return false;
      // breaking into a run: let feet that are mid-step land first (not for long), so nothing jumps
      Hs.wait += dt; if (this.legs.some((L) => L.stepping) && Hs.wait < 0.3) return false;
      Hs.wait = 0;
    }
    // slowing to a walk: no new strides, but feet in the air finish theirs before stepping takes over
    Hs.landing = stop;
    const G = stop ? Hs.gait : Hs.pace > R.fastAbove ? R.fast : R.slow, rows = Math.max(1, this.legs.reduce((m, L) => Math.max(m, L.i), 0));
    const len = this.legs[0].len, f = THREE.MathUtils.clamp(Math.max(v, 0.2 * D.speed) / (len * G.reach), 0.7, 3);
    Hs.phase += f * dt; Hs.mode = G.name; Hs.gait = G;
    const swingT = (1 - G.duty) / f, stanceT = G.duty / f, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    let air = 0;
    for (const L of this.legs) {
      const u = window.Gaits.swing(G, Hs.phase, L.i, L.side, rows);
      if (u < 0 || (Hs.landing && !L.stepping)) {
        if (L.stepping) { L.stepping = false; L.foot.copy(L.to); L.foot.y = H(L.foot.x, L.foot.z); if (D.dust) spawnDust(L.foot, L.len); }
        continue;
      }
      air++;
      if (!L.stepping) { L.stepping = true; L.from.copy(L.foot); }
      L.u = u; this.homeOf(L, L.to, (1 - u) * swingT + stanceT * 0.5);
      L.foot.lerpVectors(L.from, L.to, ease(u));
      const fold = Math.sin(Math.PI * u) * (1 - u) * len * 0.35;      // the foot tucks up and back first
      L.foot.x -= fx * fold; L.foot.z -= fz * fold;
      L.foot.y = H(L.foot.x, L.foot.z) + len * G.lift * Math.pow(Math.sin(Math.PI * u), 0.7);
    }
    if (Hs.landing && !air) { Hs.mode = null; Hs.gait = null; Hs.landing = false; return false; }
    return true;
  }
  /* Rearing: now and then, standing still, a runner goes up on its hind legs and paws the air. The
     body pitches back about its middle and lifts, the hind feet stay planted, and the front feet
     leave the ground; when it comes down they step back to their places. */
  startRear() { if (this.def.run && this.rearT == null && this.segs.length === 1) this.rearT = 0; }
  rearStep(dt) {
    if (this.rearT == null) return 0;
    this.rearT += dt / 1.9;
    const u = this.rearT, s = this.segs[0], k = Math.sin(Math.PI * Math.min(1, u)) ** 0.8;
    if (u >= 1) { this.rearT = null; for (const L of this.legs) if (L.rearing) { L.rearing = false; L.stepping = false; L.foot.y = H(L.foot.x, L.foot.z); } return 0; }
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    for (const L of this.legs) if (L.restLocal.z > 0) {
      L.rearing = true; L.stepping = true; L.u = 0.5;
      const hip = _a.copy(L.hipLocal).applyMatrix4(s.grp.matrixWorld), paw = Math.sin(env.time() * 9 + L.side) * 0.12 * L.len;
      _b.set(hip.x + fx * (0.42 * L.len + paw), hip.y - L.len * (0.62 - 0.1 * Math.cos(env.time() * 9 + L.side)), hip.z + fz * (0.42 * L.len + paw));
      this.homeOf(L, L.home); L.home.y = H(L.home.x, L.home.z);
      L.foot.lerpVectors(L.home, _b, k);
    }
    return k;
  }

  gaitStep(dt) {
    if (this.def.run && (this.rearK > 0 || this.runStep(dt))) return;
    const D = this.def, thr = D.stride * S.stride * 0.5, stepT = 0.24 * Math.pow(D.stride / 0.4, 0.45);
    for (const L of this.legs) { this.homeOf(L, L.home); L.err = Math.hypot(L.foot.x - L.home.x, L.foot.z - L.home.z); }
    const any = () => this.legs.some((o) => o.stepping);
    const canStart = (L) => L.err > thr * 2.6 || window.Gaits.mayStep(S.gait, L, this.legs);   // a foot never tears off
    const want = this.legs.filter((L) => !L.stepping && L.err > thr).sort((a, b) => b.err - a.err);
    const start = (L) => {
      L.stepping = true; L.u = 0; L.from.copy(L.foot); this.homeOf(L, L.to, stepT * 0.6);
      let top = Math.max(L.from.y, L.to.y), base = top;
      for (let k = 1; k < 6; k++) { const t = k / 6; top = Math.max(top, H(L.from.x + (L.to.x - L.from.x) * t, L.from.z + (L.to.z - L.from.z) * t)); }
      L.extra = top - base;
    };
    for (const L of want) {
      if (S.gait === "wave" && any()) break;
      if (!canStart(L)) continue;
      start(L);
      if (S.gait === "alt") for (const o of this.legs) if (!o.stepping && o.group === L.group && o.err > thr * 0.35) start(o);
    }
    for (const L of this.legs) if (L.stepping) {
      L.u = Math.min(1, L.u + dt / stepT);
      this.homeOf(L, L.to, stepT * 0.6);
      L.foot.lerpVectors(L.from, L.to, ease(L.u));
      L.foot.y = H(L.foot.x, L.foot.z) + (D.lift * S.lift + L.extra * 1.15) * Math.sin(Math.PI * L.u);
      if (L.u >= 1) {
        L.stepping = false; L.foot.y = H(L.foot.x, L.foot.z);
        if (D.dust) { spawnDust(L.foot, L.len); this.shake = Math.min(0.5, this.shake + D.shake); this.drop = Math.min(D.stride * 0.12, (this.drop || 0) + D.stride * 0.03); }
      }
    }
  }

  solve() {
    for (const L of this.legs) {
      const s = this.segs[L.seg], up = s.up, n = L.lens.length;
      const root = _c.copy(L.hipLocal).applyMatrix4(s.grp.matrixWorld);
      _d.subVectors(L.foot, root); _d.addScaledVector(up, -_d.dot(up));
      if (_d.lengthSq() < 1e-8) _d.set(L.side, 0, 0).applyQuaternion(s.grp.quaternion);
      _d.normalize();
      L.plane.crossVectors(_d, up).normalize();
      if (L.tentacle) {
        // every bone free: FABRIK toward the foot, the pole swaying so the chain curls
        const sw = Math.sin(env.time() * 1.3 + L.ph), pole = new THREE.Vector3().copy(up).multiplyScalar(0.45).addScaledVector(_d, 0.9).addScaledVector(L.plane, sw * 0.7).normalize();
        fabrik(L.J, L.lens, root, L.foot, pole, 0.16);
        continue;
      }
      const Lt = L.lens[n - 1];
      if (this.def.stance === "machine") {
        // the swing plane is the body's own forward-up plane through the hip; the knee bends toward
        // its set side; the last bone stands nearly upright under the knee
        _r.set(1, 0, 0).applyQuaternion(s.grp.quaternion); _f.set(0, 0, 1).applyQuaternion(s.grp.quaternion);
        L.plane.copy(_r);
        const kn = L.knee || 1;
        _pole.copy(_f).multiplyScalar(kn).addScaledVector(up, 0.5).normalize();
        const tarsM = new THREE.Vector3().copy(up).multiplyScalar(-1).addScaledVector(_f, -kn * 0.12).normalize();
        const wristM = new THREE.Vector3().copy(L.foot).addScaledVector(tarsM, -Lt);
        L.J[0].copy(root);
        if (n === 3) twoBone(root, wristM, L.lens[0], L.lens[1], _pole, L.J[1], L.J[2]);
        else fabrik(L.J, L.lens.slice(0, n - 1), root, wristM, _pole, 0.12);
        L.J[n].copy(L.J[n - 1]).addScaledVector(tarsM, Lt);
        continue;
      }
      const tars = new THREE.Vector3().copy(_d).multiplyScalar(0.28).addScaledVector(up, -1).normalize();
      const wrist = new THREE.Vector3().copy(L.foot).addScaledVector(tars, -Lt);
      if (n === 3) {
        L.J[0].copy(root);
        twoBone(root, wrist, L.lens[0], L.lens[1], up, L.J[1], L.J[2]);
      } else {
        const pole = new THREE.Vector3().copy(up).addScaledVector(_d, 0.25).normalize();
        fabrik(L.J, L.lens.slice(0, n - 1), root, wrist, pole, 0.12);
      }
      L.J[n].copy(L.J[n - 1]).addScaledVector(tars, Lt);
    }
    const P = this.prey;
    for (const A of this.arms) {
      const s = this.segs[A.seg];
      const root = new THREE.Vector3().copy(A.mountLocal).applyMatrix4(s.grp.matrixWorld);
      A.tgt.copy(A.restLocal).applyMatrix4(s.grp.matrixWorld);
      if (A.flap) {
        /* A wing beats like the wing rig (library/components/rigged/wings) and the ecology clips: a chain of hinges,
           both wings together, each bone beating a little after the one inside it so the tip trails the shoulder
           (lags of ~0.1 and ~0.22 of a cycle), gentle at rest and bigger and quicker with speed. Forward kinematics
           about the body's own forward axis, from the rest direction as the middle of the beat. */
        const F = A.flap, s0 = this.segs[0], sp = Math.min(1, Math.hypot(s0.vel.x, s0.vel.z) / Math.max(1e-3, this.def.speed * S.speed));
        const ph = env.time() * F.rate * (0.5 + 1.0 * sp) + (F.phase || 0), k = 0.3 + 0.7 * sp, amps = F.amps || [26, 20, 16], lags = F.lags || [0, 0.1, 0.22];
        _r.copy(A.restLocal).sub(A.mountLocal).normalize();
        A.J[0].copy(A.mountLocal);
        let cum = 0;
        for (let i = 0; i < A.lens.length; i++) {
          cum += (amps[i] ?? 12) * k * Math.sin(ph - (lags[i] ?? 0.2) * Math.PI * 2) * DEG * A.side;
          const c = Math.cos(cum), sn = Math.sin(cum);
          A.J[i + 1].set(A.J[i].x + A.lens[i] * (_r.x * c - _r.y * sn), A.J[i].y + A.lens[i] * (_r.x * sn + _r.y * c), A.J[i].z + A.lens[i] * _r.z);
        }
        for (const j of A.J) j.applyMatrix4(s.grp.matrixWorld);
        A.plane.set(0, 0, 1).transformDirection(s.grp.matrixWorld);   // the drawn wing is a flat sheet: it widens fore and aft
        continue;
      }
      if (P) {
        const reach = this.def.prey.kind === "pearl" ? P.lunge : P.strike;
        if (reach > 0) A.tgt.lerp(P.pos, Math.sin(Math.PI * Math.min(1, reach)));
      }
      const pole = new THREE.Vector3().copy(s.up).multiplyScalar(0.7).add(new THREE.Vector3(A.side, 0, 0).applyQuaternion(s.grp.quaternion)).normalize();
      fabrik(A.J, A.lens, root, A.tgt, pole, 0.08);
      _d.subVectors(A.tgt, root); A.plane.crossVectors(_d, s.up).normalize();
      if (A.plane.lengthSq() < 1e-6) A.plane.set(1, 0, 0);
    }
  }

  preyStep(dt, t) {
    const P = this.prey; if (!P) return;
    const h = this.head();
    if (this.def.prey.kind === "pearl") {
      // hovers ahead of the mouth; every so often the claws lunge and it darts a little further
      P.lungeClock += dt;
      if (P.lungeClock > 1.7) { P.lunge = Math.min(1, P.lunge + dt / 0.45); if (P.lunge >= 1) { P.lunge = 0; P.lungeClock = Math.random() * 0.6; } }
      const ahead = 1.0 + 0.32 * Math.sin(Math.PI * P.lunge) + 0.08 * Math.sin(t * 2.3);
      const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
      const goal = new THREE.Vector3(h.pos.x + fx * ahead + Math.cos(t * 1.7) * 0.12, h.y + 0.12 + 0.07 * Math.sin(t * 3.1), h.pos.z + fz * ahead + Math.sin(t * 1.3) * 0.12);
      P.pos.lerp(goal, Math.min(1, dt * 7));
    } else {
      P.cool = Math.max(0, P.cool - dt);
      if (P.hop < 1) {
        P.hop = Math.min(1, P.hop + dt / 0.7);
        P.pos.lerpVectors(P.from, P.to, ease(P.hop));
        P.pos.y = H(P.pos.x, P.pos.z) + 0.35 + Math.sin(Math.PI * P.hop) * 1.1;
      } else {
        P.pos.x += Math.sin(t * 0.9) * dt * 0.25; P.pos.z += Math.cos(t * 0.7) * dt * 0.25;
        P.pos.y = H(P.pos.x, P.pos.z) + 0.35 + Math.sin(t * 2.4) * 0.06;
      }
      const mouth = new THREE.Vector3(0, 0.1, 0.62).applyMatrix4(h.grp.matrixWorld);
      if (P.strike > 0) {
        P.strike += dt / 0.32;
        if (P.strike >= 1) {
          P.strike = 0; P.cool = 1.6; P.hop = 0; P.from.copy(P.pos);
          const a = Math.random() * Math.PI * 2, d = 2.5 + Math.random() * 3;
          P.to.set(THREE.MathUtils.clamp(P.pos.x + Math.cos(a) * d, -11, 11), 0, THREE.MathUtils.clamp(P.pos.z + Math.sin(a) * d, -11, 11));
        }
      } else if (P.hop >= 1 && P.cool === 0 && mouth.distanceTo(P.pos) < 1.15) P.strike = 0.001;
      if (this.huntPause <= 0) this.target.copy(P.pos);
    }
    P.grp.position.copy(P.pos); P.grp.rotation.y = t * 0.8;
  }
}

/* ---- appendages (neck, tail) ---- */
const RINGS_MAX = 24, qP = [], qR = [], qK = [];
for (let i = 0; i < RINGS_MAX + 4; i++) { qP.push(new THREE.Vector3()); qR.push(Array.from({ length: 6 }, () => new THREE.Vector3())); qK.push(Array.from({ length: 6 }, () => new THREE.Vector3())); }
const qT = new THREE.Vector3(), qS = new THREE.Vector3(), qU = new THREE.Vector3(), qV = new THREE.Vector3(), qW = new THREE.Vector3();
// a damped spring: x follows target with a little overshoot, so things settle instead of snapping
const spring = (st, target, dt, k = 40, c = 7) => { st.v += (k * (target - st.x) - c * st.v) * dt; st.x += st.v * dt; return st.x; };
// the body's own box, in its frame (+z forward): where a neck and tail attach, and where its front,
// back and top are for anything else that wants to point at them
function bodyBoxOf(def, grp) {
  const bb = new THREE.Box3();
  if (def.glb) for (const g of def.glb.body) { g.computeBoundingBox(); bb.union(g.boundingBox); }
  else for (const c of grp.children) if (c.geometry && c.geometry.attributes.position.count) { c.geometry.computeBoundingBox(); bb.union(c.geometry.boundingBox); }
  if (bb.isEmpty()) bb.set(new THREE.Vector3(-0.4, 0, -0.5), new THREE.Vector3(0.4, 0.2, 0.5));
  return bb;
}
function makeAppendages(w, spec) {
  const G = w.def.glb, grp = w.segs[0].grp, bb = w.bodyBox;
  const len = bb.max.z - bb.min.z;
  const Q = { spec, m: { ...MOTION_ALL, ...(spec.motion || {}) }, k: len, front: bb.max.z, back: bb.min.z, top: bb.max.y, nod: 0, pace: 0,
    look: { x: 0, v: 0 }, trail: { x: 0, v: 0 }, hang: { x: 0, v: 0 }, lastY: w.segs[0].y, neckTip: null, tailTip: null };
  const nN = spec.neck ? Math.min(RINGS_MAX, spec.neck.rings) : 0, nT = spec.tail ? Math.min(RINGS_MAX, spec.tail.rings) : 0;
  Q.pos = new Float32Array((nN * 13 + nT * 12 + 9 * 4 + 4) * 6);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(Q.pos, 3));
  Q.lines = new THREE.LineSegments(g, skinMat); Q.lines.frustumCulled = false; grp.add(Q.lines);
  if (spec.neck) {
    // the head rides the end of the neck: the model's own head if it has one, else a small wedge
    Q.head = new THREE.Group(); grp.add(Q.head);
    const heads = G && G.head && G.head.length ? G.head : null;
    if (heads) {
      const hb = new THREE.Box3(); for (const h of heads) { h.computeBoundingBox(); hb.union(h.boundingBox); }
      const hs = hb.getSize(new THREE.Vector3()), at = new THREE.Vector3((hb.min.x + hb.max.x) / 2, hb.min.y + hs.y * 0.3, hb.min.z + hs.z * 0.2);
      for (const h of heads) { h.neckStrokes = h.neckStrokes || glbStrokes(h).clone().translate(-at.x, -at.y, -at.z); Q.head.add(new THREE.LineSegments(h.neckStrokes, skinMat)); }
      Q.head.scale.setScalar(0.95); Q.headSize = Math.max(hs.x, hs.z);
    } else {
      const s = len * 0.2, pts = [], P = [[0, 0.3, -0.2], [0.45, 0.2, 0.1], [0.3, -0.05, 1.3], [-0.3, -0.05, 1.3], [-0.45, 0.2, 0.1], [0, -0.35, 0.2]].map((p) => p.map((v) => v * s));
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 2], [0, 3], [5, 1], [5, 2], [5, 3], [5, 4]]) pts.push(...P[a], ...P[b]);
      Q.head.add(lineSeg(pts, skinMat)); Q.headSize = s * 0.9;
    }
    if (spec.neck.horns) {
      // a pair of branching antlers, swept back
      const s = Q.headSize * 0.55, pts = [];
      for (const sx of [1, -1]) {
        const B = [[0.16 * sx, 0.18, 0.05], [0.26 * sx, 0.55, -0.2], [0.3 * sx, 0.95, -0.55], [0.44 * sx, 0.7, -0.05], [0.2 * sx, 0.85, -0.75]].map((p) => p.map((v) => v * s));
        for (const [a, b] of [[0, 1], [1, 2], [1, 3], [2, 4]]) pts.push(...B[a], ...B[b]);
      }
      Q.head.add(lineSeg(pts, skinMat));
    }
  }
  return Q;
}
function updateAppendages(w, dt) {
  const Q = w.app, spec = Q.spec, M = Q.m, s = w.segs[0], P = Q.pos, k = Q.k, time = env.time(); let o = 0;
  // how it is moving: pace 0..1, turning, a nod each time a front foot lands, and the body's own bounce
  const v = Math.hypot(s.vel.x, s.vel.z) / Math.max(1e-3, w.def.speed * S.speed);
  Q.pace += (Math.min(1, v) - Q.pace) * Math.min(1, dt * 2);
  let nod = 0; for (const L of w.legs) if (L.stepping && L.restLocal.z > 0) nod += Math.sin(Math.PI * L.u);
  Q.nod += ((M.nod ? nod : 0) - Q.nod) * Math.min(1, dt * 8);
  _d.subVectors(w.target, s.pos); const want = M.look && _d.lengthSq() > 0.01 ? THREE.MathUtils.clamp(wrap(Math.atan2(_d.x, _d.z) - s.yaw), -0.6, 0.6) : 0;
  const look = spring(Q.look, want, dt, 30, 7), trail = spring(Q.trail, M.trail ? -(w.yawRate || 0) * 0.22 : 0, dt, 36, 5);
  // the tip hangs back when the body jumps: a spring chasing the body's height
  const vy = (s.y - Q.lastY) / Math.max(dt, 1e-3); Q.lastY = s.y;
  const hang = THREE.MathUtils.clamp(spring(Q.hang, -vy * 0.05, dt, 60, 6), -0.25, 0.25) * k;
  const rear = w.rearK || 0;
  const seg = (a, b) => { P[o++] = a.x; P[o++] = a.y; P[o++] = a.z; P[o++] = b.x; P[o++] = b.y; P[o++] = b.z; };
  // a tube along qP[0..n) with radii rad: a hexagon ring at each point, joined to the next
  const tube = (n, rad, mane) => {
    for (let i = 0; i < n; i++) {
      qT.subVectors(qP[Math.min(n - 1, i + 1)], qP[Math.max(0, i - 1)]).normalize();
      qS.set(1, 0, 0).addScaledVector(qT, -qT.x).normalize(); qU.crossVectors(qT, qS);
      const ring = qR[i];
      for (let j = 0; j < 6; j++) { const a = Math.PI / 2 + (j * Math.PI) / 3; ring[j].copy(qP[i]).addScaledVector(qS, Math.cos(a) * rad(i)).addScaledVector(qU, Math.sin(a) * rad(i)); }
      for (let j = 0; j < 6; j++) seg(ring[j], ring[(j + 1) % 6]);
      if (i) for (let j = 0; j < 6; j++) seg(qK[i - 1][j], ring[j]);
      for (let j = 0; j < 6; j++) qK[i][j].copy(ring[j]);
      // the mane streams back further the faster it goes
      if (mane) { const r = rad(i), m = r * (0.9 + 1.6 * Q.pace); qV.copy(ring[0]).addScaledVector(qU, r * (0.9 - 0.5 * Q.pace)).addScaledVector(qT, -m); seg(ring[0], qV); }
    }
  };
  if (spec.neck) {
    const N = spec.neck, n = Math.min(RINGS_MAX, N.rings), nodY = (-0.035 * Q.nod - 0.02 * (1 - Q.pace)) * k / 1.24 + hang * 0.4;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 1, t2 = t * t;
      qP[i].set(Math.sin(look) * 0.26 * k * t2, Q.top - 0.04 * k + N.rise * k * Math.sin(t * Math.PI * 0.55) + nodY * t2, Q.front - 0.1 * k + N.reach * k * (1.2 * t - 0.2 * t2) + (N.arch || 0) * k * Math.sin(Math.PI * t));
    }
    tube(n, (i) => (N.r0 + (N.r1 - N.r0) * (n > 1 ? i / (n - 1) : 0)) * k, N.mane);
    (Q.neckTip = Q.neckTip || new THREE.Vector3()).copy(qP[n - 1]);
    Q.head.position.copy(qP[n - 1]); Q.head.rotation.set(0.05 * Q.nod - 0.08 * (1 - Q.pace) + rear * 0.35, look * 0.5, -look * 0.15, "YXZ");
  }
  if (spec.tail) {
    const Tl = spec.tail, n = Math.min(RINGS_MAX, Math.max(2, Tl.rings)), step = (Tl.length * k) / (n - 1);
    // walk the curve: start a little above straight back and turn as it goes; it lifts with pace
    let ang = (Tl.start + (M.lift ? 4 * Q.pace : 0) + rear * 20) * DEG; const turn = (Tl.turn + (M.lift && Tl.turn < 0 ? 22 * Q.pace : 0)) * DEG / (n - 1);
    qP[0].set(0, Q.top - 0.1 * k, Q.back + 0.06 * k);
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1), sway = M.sway ? (0.04 + 0.06 * Q.pace) * k * Math.sin(time * (1.6 + 1.6 * Q.pace) * (Tl.wave || 1) - t * 3.2 * (Tl.wave || 1)) * t * t : 0;
      ang += turn;
      qP[i].set(sway + trail * k * t * t, qP[i - 1].y + Math.sin(ang) * step, qP[i - 1].z - Math.cos(ang) * step);
      qP[i].y += hang * (t * t - (t - 1 / (n - 1)) ** 2);
    }
    tube(n, (i) => (Tl.r0 + (Tl.r1 - Tl.r0) * (i / (n - 1))) * k, false);
    const end = qP[n - 1]; qT.subVectors(qP[n - 1], qP[n - 2]).normalize();
    (Q.tailTip = Q.tailTip || new THREE.Vector3()).copy(end);
    // the tuft: strands fanning from the tail's end, each waving a little behind it
    for (let j = 0; j < Math.min(9, Tl.tuft || 0); j++) {
      const a = (j / Math.max(1, Tl.tuft - 1) - 0.5) * 1.6; qV.copy(end);
      for (let q = 1; q <= 4; q++) {
        const u = q / 4; qW.copy(end).addScaledVector(qT, 0.26 * k * u).add(qU.set(Math.sin(a) * 0.13 * k * u + Math.sin(time * 3 + j + u * 3) * 0.016 * k * u, Math.cos(a) * 0.065 * k * u - 0.04 * k * u * u, 0));
        seg(qV, qW); qV.copy(qW);
      }
    }
    if (Tl.sting) { // a barb: a wedge past the last ring, hooked along the curve
      qV.copy(end).addScaledVector(qT, 0.16 * k); qW.copy(qV).addScaledVector(qU.set(0, -1, 0), 0.07 * k).addScaledVector(qT, 0.05 * k);
      seg(qR[n - 1][0], qV); seg(qR[n - 1][3], qV); seg(qV, qW); seg(qR[n - 1][3], qW);
    }
  }
  Q.lines.geometry.setDrawRange(0, o / 3); Q.lines.geometry.attributes.position.needsUpdate = true;
}
Walker.prototype.updateAppendages = function (dt) { if (this.app) updateAppendages(this, dt); };
/* The places on a walker you can point at, in the world: its head (the end of the neck, or the
   front of the body), its tail (the tip, or the back of the body), the middle of its body, and each
   knee and foot. A page uses these to open options on the part that was clicked. */
Walker.prototype.hotspots = function () {
  const s = this.segs[0], bb = this.bodyBox, M = s.grp.matrixWorld, Q = this.app, out = [];
  const at = (part, x, y, z) => out.push({ part, pos: new THREE.Vector3(x, y, z).applyMatrix4(M) });
  if (Q && Q.neckTip) at("head", Q.neckTip.x, Q.neckTip.y, Q.neckTip.z); else at("head", 0, bb.max.y, bb.max.z);
  if (Q && Q.tailTip) { at("tail", Q.tailTip.x, Q.tailTip.y, Q.tailTip.z); at("tail", Q.tailTip.x / 2, (Q.tailTip.y + bb.max.y) / 2, (Q.tailTip.z + bb.min.z) / 2); } else at("tail", 0, bb.max.y, bb.min.z);
  at("body", 0, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
  for (const L of this.legs) { out.push({ part: "leg", pos: L.J[Math.min(1, L.J.length - 1)].clone() }); out.push({ part: "leg", pos: L.foot.clone() }); }
  return out;
};

return { Walker, machineLeg, ease, wrap };
}
