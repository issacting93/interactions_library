/* INTERACTIONS — a creature's body as physics, after Rain World.

   Rain World's creatures are a few round masses (chunks) joined by springs. Nothing poses the body: the
   AI pushes on the chunks, the legs hold them up where they stand on the ground, and everything else is
   gravity, momentum and the joints between them. The drawing comes after, from wherever the chunks
   ended up. Joar Jakobsson's early lizards were moved by pathing alone and looked like "limp socks being
   pulled around by the head"; giving the body its own physics is what made them read as animals.

   This is that motion layer for Forge's walkers. It takes the same def a Walker takes (a species rig from
   shared/engine/motion/species-rig.js, or any def with segs, legs and gaps) and moves it as:

     chunks   one round mass per body piece; a body drawn in one piece gets three (head, middle, tail
              end) held nearly straight, so it can still pitch, yaw, sag and be knocked about
     legs     each foot plants and holds; while a chunk's feet are down they carry it at standing height
              and grip the ground, so it is pushed along; lift too many and it sags, knock it off its feet
              and it falls until they find the ground again. Feet step on the shared gait rules
              (shared/engine/motion/gaits.js) and are solved with shared/engine/motion/ik.js
     steering the AI's only handle: a heading and a speed. It pulls the head chunk; the rest follows
              through the joints. Turning in place twists the body about its middle
     water    swim mode: no gravity, the body floats at its cruising height, water drags across the body
              far more than along it, a wave runs down the chunks and the legs fold back and paddle

   It draws nothing. Each step it writes a skeleton (shared/engine/motion/skeleton.js) and any look draws
   that: the kit's own parts on the bones, a soft body, or the bones themselves.

     const body = new CreatureBody(def, { H, S, start: { x, z }, yaw });
     body.target.set(x, y, z); body.setMode("walk" | "swim");
     body.step(dt);                       // fixed substeps inside; then read body.skel
     body.poke(chunkIndex, { x, y, z });  // an impulse, in world units a second
     body.lift(dy);                       // pick it up and let it drop

   H(x, z) is the ground height. opts.surface (shared/engine/motion/surface.js) is the world it stands on: the
   ground, and towers it may climb. A creature with def.climb (or opts.climb) grips whatever surface is under
   its feet: its heading lives in the surface's tangent plane, planted feet hold it at standing height along
   the normal and carry its weight wherever the normal points, so a wall is a floor turned on its side.
   Without a surface it stands on H alone, as before. S is the live settings object the walker uses ({ speed, stride, lift,
   height, gait }). Needs window.IK, window.Gaits, window.Skeleton and window.Surface. Classic script -> window.CreatureBody. */
(function () {
  "use strict";
  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new V3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    divideScalar(s) { return this.multiplyScalar(1 / s); }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() { const l = this.length(); if (l > 1e-12) this.divideScalar(l); return this; }
    distanceToSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
    distanceTo(v) { return Math.sqrt(this.distanceToSquared(v)); }
    crossVectors(a, b) { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; this.x = x; this.y = y; this.z = z; return this; }
    lerpVectors(a, b, t) { this.x = a.x + (b.x - a.x) * t; this.y = a.y + (b.y - a.y) * t; this.z = a.z + (b.z - a.z) * t; return this; }
    lerp(v, t) { return this.lerpVectors(this, v, t); }
  }
  const DEG = Math.PI / 180, UP = new V3(0, 1, 0), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), ease = (u) => u * u * (3 - 2 * u);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _f = new V3(), _g = new V3(), _P = { x: 0, y: 0, z: 0 }, _S = { d: 0, nx: 0, ny: 1, nz: 0 };

  // how the body is tuned; per unit of mass (every chunk weighs the same)
  const K = {
    hz: 120,          // substeps a second
    g: 9.8,           // gravity
    hold: 260, holdD: 34,       // a planted foot's push toward standing height, and its damping
    drive: 9,         // how hard gripping feet push the body toward the speed it wants
    climb: 1.5,       // more of it, in proportion, while any part of the body is tilted off level (a wall, a ledge's edge)
    turn: 26,         // the twist about the middle when turning in place
    air: 0.25,        // drag in the air
    water: { along: 0.9, across: 6, up: 3, float: 9, floatD: 6, thrust: 7, wave: 7 },
    bend: { stiff: 1, soft: 0.12 },
  };

  class CreatureBody {
    constructor(def, opts = {}) {
      const { IK, Gaits, Skeleton } = window;
      this.IK = IK; this.Gaits = Gaits;
      this.def = def; this.H = opts.H || (() => 0);
      // what it stands on: the world's surface, or only its ground when the creature cannot climb
      this.world = opts.surface || window.Surface.heightfield(this.H);
      this.climb = !!(opts.climb ?? def.climb);
      this.surf = this.climb ? this.world : this.world.groundOnly();
      this.S = opts.S || { speed: 1, stride: 1, lift: 1, height: 1, gait: "alt" };
      this.mode = "walk"; this.t = 0; this.acc = 0;
      this.target = new V3(); this.hdir = new V3(0, 0, 1); this.heading = opts.yaw || 0; this.vWant = 0; this.pace = 0; this.wavePh = 0;
      const start = opts.start || { x: 0, z: 0 }, yaw = this.heading, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const segs = def.segs, rigid = segs.length === 1;
      this.rigid = rigid;

      // ---- the pieces, where they stand along the body (z forward from the head piece's origin) ----
      let back = 0;
      this.segZ = segs.map((sd, i) => (back -= i ? sd.gap || 0 : 0));
      // half the body's width at a point along a piece, from its centre parts as drawn
      const widthAt = (sd, z) => {
        let m = 0;
        for (const e of sd.parts || []) {
          if (!e.polys || e.mirror) continue;
          const k = e.k * (e.s || 1);
          for (const pl of e.polys) for (let j = 0; j < pl.length; j += 2) {
            const lz = (e.cy - pl[j + 1]) * k; if (Math.abs(lz - z) < 0.12) m = Math.max(m, Math.abs((e.cx || 200) - pl[j]) * k);
          }
        }
        return m;
      };
      const extent = (sd) => {
        if (sd.zF != null) return [sd.zB, sd.zF];
        let lo = 1e9, hi = -1e9;
        for (const e of sd.parts || []) if (e.polys) { const k = e.k * (e.s || 1); for (const pl of e.polys) for (let j = 1; j < pl.length; j += 2) { const lz = (e.cy - pl[j]) * k; lo = Math.min(lo, lz); hi = Math.max(hi, lz); } }
        return lo < hi ? [lo, hi] : [-0.4, 0.4];
      };
      const legLen = segs.flatMap((sd) => sd.legs.map((l) => l.len));
      this.len0 = legLen.length ? legLen.slice().sort((a, b) => a - b)[legLen.length >> 1] : 1;

      // ---- chunks ----
      const C = [];
      const chunk = (seg, lz) => {
        const z = this.segZ[seg] + lz, sd = segs[seg];
        const p = new V3(start.x + fx * z, 0, start.z + fz * z); p.y = this.H(p.x, p.z) + sd.h * this.S.height;
        const r = clamp(widthAt(sd, lz) || 0.12 * this.len0, 0.05 * this.len0, 0.6 * this.len0);
        C.push({ seg, lz, p, prev: p.clone(), f: new V3(fx, 0, fz), sup: 0, legW: 0, r, n: new V3(0, 1, 0), d: sd.h * this.S.height });
      };
      if (rigid) { const [zB, zF] = extent(segs[0]); chunk(0, zF * 0.55); chunk(0, 0); chunk(0, zB * 0.55); }
      else segs.forEach((_, i) => chunk(i, 0));
      this.chunks = C;
      this.segChunk = rigid ? [1] : segs.map((_, i) => i);
      this.rest = C.slice(1).map((c, i) => C[i].p.distanceTo(c.p));

      // ---- legs: mirrored pairs, front to back, as the Walker builds them ----
      this.legs = [];
      const sideCount = { 1: 0, "-1": 0 };
      segs.forEach((sd, si) => sd.legs.forEach((ld, src) => {
        for (const side of [1, -1]) {
          const a = ld.ang * DEG, hip = new V3(ld.hip[0] * side, ld.hip[1], ld.hip[2]);
          const rest = hip.clone().add(new V3(Math.sin(a) * side, 0, Math.cos(a)).multiplyScalar(ld.len * ld.reach));
          const i = sideCount[side]++;
          const L = { seg: si, side, i, src, ld, hipLocal: hip, restLocal: rest, len: ld.len, lens: ld.fracs.map((f) => f * ld.len),
            J: ld.fracs.map(() => new V3()).concat([new V3()]), foot: new V3(), from: new V3(), to: new V3(), home: new V3(), plane: new V3(1, 0, 0),
            stepping: false, u: 0, extra: 0, err: 0, planted: true, w: null };
          // which chunks this leg holds up: its own piece's chunk, or (one rigid piece) the chunks either side of its hip
          if (rigid) {
            const zs = C.map((c) => c.lz), z = hip.z; let w = C.map(() => 0);
            if (z >= zs[0]) w[0] = 1; else if (z <= zs[zs.length - 1]) w[zs.length - 1] = 1;
            else for (let k = 0; k + 1 < zs.length; k++) if (z <= zs[k] && z >= zs[k + 1]) { const t = (zs[k] - z) / (zs[k] - zs[k + 1] || 1); w[k] = 1 - t; w[k + 1] = t; }
            L.w = w;
          } else L.w = C.map((_, k) => (k === si ? 1 : 0));
          L.w.forEach((wk, k) => (C[k].legW += wk));
          this.legs.push(L);
        }
      }));
      for (const L of this.legs) {
        L.group = (L.i + (L.side > 0 ? 0 : 1)) % 2;
        L.nbrs = this.legs.filter((o) => (o.side === L.side && Math.abs(o.i - L.i) === 1) || (o.side !== L.side && o.i === L.i));
      }
      // wings beat on the same clock as the walker's (forward kinematics, no physics)
      this.arms = [];
      segs.forEach((sd, si) => (sd.arms || []).forEach((ad, src) => {
        if (!ad.flap) return;
        for (const side of [1, -1]) this.arms.push({ seg: si, side, src, ad, lens: ad.fracs.map((f) => f * ad.len), J: ad.fracs.map(() => new V3()).concat([new V3()]),
          mount: new V3(ad.mount[0] * side, ad.mount[1], ad.mount[2]), restDir: new V3((ad.rest[0] - ad.mount[0]) * side, ad.rest[1] - ad.mount[1], ad.rest[2] - ad.mount[2]).normalize() });
      }));

      this.skel = Skeleton.create(segs.length, C.length, [
        ...this.legs.map((L) => ({ kind: "leg", seg: L.seg, side: L.side, i: L.i, src: L.src, bones: L.lens.length })),
        ...this.arms.map((A, i) => ({ kind: "wing", seg: A.seg, side: A.side, i: i >> 1, src: A.src, bones: A.lens.length })),
      ]);
      this.slope = segs.map(() => 0);
      this.frames();
      for (const L of this.legs) { this.homeOf(L, L.foot, 0); this.solveLeg(L); }
      this.write();
    }

    // the heading, as a yaw: only meaningful on level ground (the real heading is the tangent vector hdir)
    get heading() { return Math.atan2(this.hdir.x, this.hdir.z); }
    set heading(a) { this.hdir.set(Math.sin(a), 0, Math.cos(a)); }

    // how far each chunk is from the surface, and which way is out of it (smoothed, so a corner turns the body over time)
    sense(h) {
      const swim = this.mode === "swim", k = Math.min(1, h * 12);
      for (const c of this.chunks) {
        if (swim) { c.d = c.p.y - this.H(c.p.x, c.p.z); c.n.set(0, 1, 0); continue; }
        this.surf.sample(c.p.x, c.p.y, c.p.z, _S); c.d = _S.d;
        c.n.x += (_S.nx - c.n.x) * k; c.n.y += (_S.ny - c.n.y) * k; c.n.z += (_S.nz - c.n.z) * k; c.n.normalize();
      }
      // how much of the body is off level: 0 on the ground, 1 once a piece of it is on a wall
      let low = 1; for (const c of this.chunks) low = Math.min(low, c.n.y);
      this.cling = Math.max(0, 1 - low);
    }

    setMode(m) { this.mode = m; }
    poke(ci, imp) { const c = this.chunks[clamp(ci | 0, 0, this.chunks.length - 1)], h = 1 / K.hz; c.prev.x -= imp.x * h; c.prev.y -= imp.y * h; c.prev.z -= imp.z * h; }
    lift(dy) { for (const c of this.chunks) { c.p.y += dy; c.prev.y += dy; } }
    head() { return this.chunks[0]; }

    // the frame of each body piece, from its chunks; tilted sideways by the ground its feet stand on
    frames() {
      const C = this.chunks, segs = this.def.segs, sk = this.skel;
      if (!sk) return;
      for (let i = 0; i < segs.length; i++) {
        const g = sk.segs[i], c = C[this.segChunk[i]];
        let a, b;
        if (this.rigid) { a = C[0]; b = C[C.length - 1]; }
        else { a = C[Math.max(0, i - 1)]; b = C[Math.min(C.length - 1, i + 1)]; }
        _f.subVectors(a.p, b.p); if (_f.lengthSq() < 1e-10) _f.copy(this.hdir); _f.normalize();
        // up: the surface's under the piece, leaned across the slope under its feet, then squared to forward
        const nm = c.n;
        _c.crossVectors(nm, _f); if (_c.lengthSq() < 1e-8) _c.crossVectors(UP, _f); if (_c.lengthSq() < 1e-8) _c.set(1, 0, 0); _c.normalize();   // side
        _a.copy(nm).addScaledVector(_c, -this.slope[i]).normalize();
        _b.crossVectors(_a, _f).normalize();                         // x = y cross z
        _a.crossVectors(_f, _b).normalize();                         // y = z cross x
        g.x.x = _b.x; g.x.y = _b.y; g.x.z = _b.z; g.y.x = _a.x; g.y.y = _a.y; g.y.z = _a.z; g.z.x = _f.x; g.z.y = _f.y; g.z.z = _f.z;
        // the piece's origin: its chunk, or for one rigid piece the line through its chunks at z = 0
        if (this.rigid) { const m = C[1].p; g.o.x = m.x; g.o.y = m.y; g.o.z = m.z; } else { g.o.x = c.p.x; g.o.y = c.p.y; g.o.z = c.p.z; }
      }
      // each chunk's own forward, level: toward the chunk ahead of it (the head: away from the one behind)
      for (let i = 0; i < C.length; i++) {
        if (C.length < 2) { C[i].f.copy(this.hdir); continue; }
        _f.subVectors(i ? C[i - 1].p : C[0].p, i ? C[i].p : C[1].p); _f.addScaledVector(C[i].n, -_f.dot(C[i].n));
        if (_f.lengthSq() > 1e-10) C[i].f.copy(_f.normalize());
      }
    }
    local(seg, v, out) { return out.copy(window.Skeleton.toWorld(this.skel.segs[seg], v.x, v.y, v.z, out)); }
    homeOf(L, out, lead) {
      const g = this.skel.segs[L.seg], r = L.restLocal, h0 = this.chunks[this.segChunk[L.seg]], nm = h0.n;
      // the rest point, level: along the piece's forward and side, flattened into the tangent plane...
      let fx = g.z.x, fy = g.z.y, fz = g.z.z; const k = fx * nm.x + fy * nm.y + fz * nm.z; fx -= nm.x * k; fy -= nm.y * k; fz -= nm.z * k;
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      const sx = nm.y * fz - nm.z * fy, sy = nm.z * fx - nm.x * fz, sz = nm.x * fy - nm.y * fx;     // side = normal x forward
      out.set(g.o.x + sx * r.x + fx * r.z, g.o.y + sy * r.x + fy * r.z, g.o.z + sz * r.x + fz * r.z);
      if (lead) { const v = this.vel(h0); const vn = v.x * nm.x + v.y * nm.y + v.z * nm.z; out.x += (v.x - nm.x * vn) * lead; out.y += (v.y - nm.y * vn) * lead; out.z += (v.z - nm.z * vn) * lead; }
      // ...then onto the surface nearest it: the ground, or a wall the foot has reached
      this.surf.project(out.x, out.y, out.z, _P); out.set(_P.x, _P.y, _P.z); return out;
    }
    dist(p) { this.surf.sample(p.x, p.y, p.z, _S); return _S.d; }
    vel(c, out = _d) { return out.subVectors(c.p, c.prev).multiplyScalar(K.hz); }

    step(dt) {
      dt = Math.min(dt, 0.1); this.acc += dt;
      const h = 1 / K.hz;
      while (this.acc >= h) { this.acc -= h; this.t += h; this.tick(h); }
      this.write();
    }

    tick(h) {
      const C = this.chunks, D = this.def, S = this.S, swim = this.mode === "swim", hc = C[0];
      this.sense(h);
      // ---- the AI's handle: a heading and a speed, in the tangent plane of the surface under the head ----
      const n0 = hc.n, hd = this.hdir;
      hd.addScaledVector(n0, -hd.dot(n0)); if (hd.lengthSq() < 1e-8) hd.crossVectors(n0, _g.set(1, 0, 0)); hd.normalize();   // keep it tangent as the surface turns under it
      _c.subVectors(this.target, hc.p); _c.addScaledVector(n0, -_c.dot(n0));
      const tdist = _c.length();
      // how far it has to go: along the surface for a creature on the ground; for a climber the whole way to the target,
      // measured from the surface under its head (a target on a roof is behind the wall it is climbing: nearly all of it is "out")
      let dist = tdist;
      if (this.climb && !swim) { this.surf.project(hc.p.x, hc.p.y, hc.p.z, _P); dist = Math.hypot(this.target.x - _P.x, this.target.y - _P.y, this.target.z - _P.z); }
      _a.crossVectors(hd, _c); let err = tdist > 1e-9 ? Math.atan2(n0.x * _a.x + n0.y * _a.y + n0.z * _a.z, hd.dot(_c)) : 0;
      const turnRate = (D.turn || 1.4) * (0.4 + S.speed) * (swim ? 1.2 : 1);
      if (dist > D.stride * 0.9 || Math.abs(err) > 0.3) {
        const rot = Math.sign(err) * Math.min(Math.abs(err), turnRate * h), cs = Math.cos(rot), sn = Math.sin(rot);
        _a.crossVectors(n0, hd); hd.multiplyScalar(cs).addScaledVector(_a, sn).normalize();
      }
      let v = dist > D.stride * 0.9 ? D.speed * S.speed * Math.min(1, dist / (D.stride * 3)) * (swim ? 1.3 : 1) : 0;
      v *= 0.25 + 0.75 * Math.max(0, tdist > 1e-9 ? hd.dot(_c) / tdist : 1);
      this.vWant = v;

      // ---- support: how much of each chunk is held by planted feet ----
      for (const c of C) c.sup = 0;
      let planted = 0;
      for (const L of this.legs) if (L.planted) { planted++; L.w.forEach((w, k) => (C[k].sup += w)); }
      for (const c of C) c.sup = c.legW > 0 ? Math.min(1, c.sup / c.legW) : 0;
      // what grips the ground: planted feet, or (a body with no legs) the belly where it lies on it
      for (const c of C) c.grip = this.legs.length ? c.sup : c.d < c.r * 0.6 ? 0.7 : 0;
      this.grip = this.legs.length ? planted / this.legs.length : 0;
      // a legless piece between legged ones is carried by its neighbours through the spine
      for (let i = 0; i < C.length; i++) if (!C[i].legW) { const a = C[i - 1], b = C[i + 1]; C[i].sup = ((a ? a.sup : 0) + (b ? b.sup : 0)) / ((a ? 1 : 0) + (b ? 1 : 0) || 1) * (this.legs.length ? 0.85 : 0); }

      // ---- forces, then Verlet ----
      const swimW = { waves: 0.9, amp: 1, ampPow: 1.6, bend: 1, speed: 1, ...((D.float && D.float.swim) || {}) };
      if (swim || !this.legs.length) this.wavePh += h * (3 + 6 * Math.min(1, this.pace)) * Math.sqrt(swimW.speed);
      const n = C.length;
      for (let i = 0; i < n; i++) {
        const c = C[i], sd = D.segs[c.seg], vel = this.vel(c, _a), nm = c.n;
        let ax = 0, ay = 0, az = 0;
        const fwd = i === 0 ? _b.copy(hd) : _b.copy(c.f);
        if (!swim) {
          ay -= K.g;
          // planted feet carry the chunk's weight (wherever the normal points: a wall is a floor on its side), push it
          // toward standing height along the normal, and damp it
          const ty = sd.h * S.height, s = c.sup;
          if (s > 0) {
            const vn = vel.x * nm.x + vel.y * nm.y + vel.z * nm.z, push = s * (K.hold * (ty - c.d) - K.holdD * vn);
            ay += s * K.g; ax += push * nm.x; ay += push * nm.y; az += push * nm.z;
          }
          if (c.grip > 0) {   // gripping: its velocity along the surface goes toward the one it wants
            const vn = vel.x * nm.x + vel.y * nm.y + vel.z * nm.z, kg = c.grip * K.drive * (1 + K.climb * this.cling);
            ax += kg * (fwd.x * v - (vel.x - nm.x * vn)); ay += kg * (fwd.y * v - (vel.y - nm.y * vn)); az += kg * (fwd.z * v - (vel.z - nm.z * vn));
          }
          if (!this.legs.length && n > 1) {   // no legs: it slithers, a wave running down it as it goes
            const t = i / (n - 1), lat = 0.5 * K.water.wave * swimW.amp * (0.2 + 0.8 * t) * this.len0 * Math.sin(this.wavePh - Math.PI * 2 * swimW.waves * t) * Math.min(1, this.pace + 0.3);
            ax -= (nm.y * c.f.z - nm.z * c.f.y) * lat; ay -= (nm.z * c.f.x - nm.x * c.f.z) * lat; az -= (nm.x * c.f.y - nm.y * c.f.x) * lat;
          }
          ax -= vel.x * K.air; ay -= vel.y * K.air; az -= vel.z * K.air;
        } else {
          // water: the body floats at its cruising height; drag is far stronger across the body than along it
          const W = K.water, rise = (D.float && D.float.rise != null ? D.float.rise : 0.9) * this.len0, ground = this.H(c.p.x, c.p.z);
          const ty = ground + sd.h + rise + 0.05 * this.len0 * Math.sin(this.wavePh * 0.5 - i * 0.6);
          ay += W.float * (ty - c.p.y) - W.floatD * vel.y;
          const along = vel.x * c.f.x + vel.z * c.f.z, ax0 = vel.x - c.f.x * along, az0 = vel.z - c.f.z * along;
          ax -= c.f.x * along * W.along + ax0 * W.across; az -= c.f.z * along * W.along + az0 * W.across;
          // the wave: a sideways push down the body, bigger toward the tail (the ecology's swim numbers)
          const t = n > 1 ? i / (n - 1) : 0, A = W.wave * swimW.amp * swimW.bend * (0.12 + 0.88 * Math.pow(t, swimW.ampPow)) * this.len0;
          const lat = A * Math.sin(this.wavePh - Math.PI * 2 * swimW.waves * t);
          ax += -c.f.z * lat; az += c.f.x * lat;
          // the head pulls toward the heading at the speed it wants
          if (i === 0) { const along0 = vel.x * hd.x + vel.z * hd.z; ax += hd.x * W.thrust * (v - along0); az += hd.z * W.thrust * (v - along0); }
        }
        // turning in place: the head is pushed round toward the heading, the tail the other way. A turn of
        // positive yaw is toward the body's left, which is (f.z, 0, -f.x) for a forward f
        if (n > 1 && (i === 0 || i === n - 1)) {
          const f0 = _c.subVectors(C[0].p, C[n - 1].p); f0.addScaledVector(nm, -f0.dot(nm)); f0.normalize();
          _g.crossVectors(f0, hd); const tw = nm.x * _g.x + nm.y * _g.y + nm.z * _g.z;      // sin of the angle from the body's line to the heading
          const k = K.turn * (swim ? 0.6 : 0.3 + 0.7 * (C[0].grip + C[n - 1].grip) / 2) * (i === 0 ? 1 : -1);
          _g.crossVectors(nm, f0); ax += _g.x * tw * k; ay += _g.y * tw * k; az += _g.z * tw * k;   // the side the body turns toward
        }
        // Verlet
        const nx = c.p.x + (c.p.x - c.prev.x) + ax * h * h, ny = c.p.y + (c.p.y - c.prev.y) + ay * h * h, nz = c.p.z + (c.p.z - c.prev.z) + az * h * h;
        c.prev.copy(c.p); c.p.set(nx, ny, nz);
      }

      // ---- joints between chunks ----
      for (let it = 0; it < 6; it++) {
        for (let i = 0; i + 1 < n; i++) this.keep(C[i], C[i + 1], this.rest[i], 1);
        if (this.rigid && n === 3) this.keep(C[0], C[2], this.rest[0] + this.rest[1], 1);
        else for (let i = 1; i + 1 < n; i++) {
          // a spine resists sagging between its legs (height only), and folding back on itself
          const a = C[i - 1], b = C[i + 1], c = C[i], k = swim ? 0.02 : K.bend.soft;
          const sg = k * (((a.p.x + b.p.x) / 2 - c.p.x) * c.n.x + ((a.p.y + b.p.y) / 2 - c.p.y) * c.n.y + ((a.p.z + b.p.z) / 2 - c.p.z) * c.n.z);
          c.p.x += sg * c.n.x; c.p.y += sg * c.n.y; c.p.z += sg * c.n.z;
          const d = a.p.distanceTo(b.p), min = 0.75 * (this.rest[i - 1] + this.rest[i]);
          if (d < min) this.keep(a, b, min, 0.5);
        }
      }
      // ---- the ground ----
      for (const c of C) {
        this.surf.sample(c.p.x, c.p.y, c.p.z, _S);
        const lo = c.r * 0.35;
        if (!swim && _S.d < lo) {
          // pushed back out along the normal; what ran along the surface drags
          const push = lo - _S.d; c.p.x += _S.nx * push; c.p.y += _S.ny * push; c.p.z += _S.nz * push;
          const vx = c.p.x - c.prev.x, vy = c.p.y - c.prev.y, vz = c.p.z - c.prev.z, vn = vx * _S.nx + vy * _S.ny + vz * _S.nz, keep = Math.min(0, vn);   // as it always was: motion out of the surface stops, motion into it carries on
          c.prev.x = c.p.x - ((vx - _S.nx * vn) * 0.6 + _S.nx * keep); c.prev.y = c.p.y - ((vy - _S.ny * vn) * 0.6 + _S.ny * keep); c.prev.z = c.p.z - ((vz - _S.nz * vn) * 0.6 + _S.nz * keep);
        } else if (swim) { const g = this.H(c.p.x, c.p.z) + c.r * 0.35; if (c.p.y < g) { c.p.y = g; if (c.prev.y < g) c.prev.y = g; const vx = c.p.x - c.prev.x, vz = c.p.z - c.prev.z; c.prev.x = c.p.x - vx * 0.6; c.prev.z = c.p.z - vz * 0.6; } }
      }
      this.frames();
      this.feet(h);
      const hv = this.vel(C[0]); this.pace += (Math.min(1.5, Math.hypot(hv.x, hv.z) / Math.max(1e-3, D.speed * S.speed)) - this.pace) * Math.min(1, h * 4);
    }

    keep(a, b, len, stiff) {
      _f.subVectors(b.p, a.p); const d = _f.length() || 1e-6, k = ((d - len) / d) * 0.5 * stiff;
      a.p.addScaledVector(_f, k); b.p.addScaledVector(_f, -k);
    }

    feet(h) {
      const D = this.def, S = this.S, swim = this.mode === "swim", legs = this.legs;
      const thr = D.stride * S.stride * 0.5, stepT = 0.24 * Math.pow(D.stride / 0.4, 0.45);
      for (const L of legs) {
        const hip = this.local(L.seg, L.hipLocal, _a), fd = swim ? 0 : this.dist(L.foot);     // how far the foot is from the surface
        if (swim) {
          // paddle: folded back from where it stood, beating, the pairs one after another
          const g = this.skel.segs[L.seg], FL = D.float || {}, ox = L.restLocal.x - L.hipLocal.x, oz = L.restLocal.z - L.hipLocal.z;
          const a0 = Math.abs(Math.atan2(ox, oz)), back = a0 + (Math.PI - a0) * (FL.fold ?? 0.45);
          const ph = this.wavePh * 1.6, beat = 0.42 * Math.sin(ph - L.i * (FL.lag ?? 0.9)), th = Math.min(Math.PI * 0.97, back + beat);
          _f.set(Math.sin(th) * L.side, -0.12 + 0.1 * Math.cos(ph - L.i * 0.9), Math.cos(th)).normalize().multiplyScalar(L.len * 0.94);
          _b.copy(hip).addScaledVector(g.x, _f.x).addScaledVector(g.y, _f.y).addScaledVector(g.z, _f.z);
          L.foot.lerp(_b, Math.min(1, h * 7)); L.stepping = false; L.planted = false;
          continue;
        }
        this.homeOf(L, L.home, 0);
        { const nm = this.chunks[this.segChunk[L.seg]].n; _f.subVectors(L.foot, L.home); _f.addScaledVector(nm, -_f.dot(nm)); L.err = _f.length(); }   // how far it is behind its home, along the surface
        const reach = hip.distanceTo(L.foot), stretched = reach > L.len * 0.99;
        // off its feet (knocked over, dropped, or just out of the water): feet hang, then reach for the surface
        const high = this.dist(hip) > L.len * 0.98;
        if (!L.stepping && (fd > 0.02 * L.len || high)) {
          if (high) { _b.copy(L.home); _b.y = hip.y - L.len * 0.85; L.foot.lerp(_b, Math.min(1, h * 6)); L.planted = false; continue; }
          L.foot.lerp(_b.copy(L.home), Math.min(1, h * 10));
          if (Math.abs(this.dist(L.foot)) < 0.03 * L.len) { this.surf.project(L.foot.x, L.foot.y, L.foot.z, _P); L.foot.set(_P.x, _P.y, _P.z); }
        }
        if (!L.stepping) {
          const may = this.Gaits.mayStep(S.gait || "alt", L, legs);
          if ((L.err > thr && may) || L.err > thr * 2.6 || (stretched && L.err > thr * 0.4)) {
            L.stepping = true; L.u = 0; L.from.copy(L.foot); this.homeOf(L, L.to, stepT * 0.6);
            // how far a bump between the two places rises above both, along the surface's normal
            const nm = this.chunks[this.segChunk[L.seg]].n, hgt = (v) => v.x * nm.x + v.y * nm.y + v.z * nm.z;
            let top = Math.max(hgt(L.from), hgt(L.to)); const base = top;
            for (let k = 1; k < 6; k++) { const t = k / 6; this.surf.project(L.from.x + (L.to.x - L.from.x) * t, L.from.y + (L.to.y - L.from.y) * t, L.from.z + (L.to.z - L.from.z) * t, _P); top = Math.max(top, hgt(_P)); }
            L.extra = top - base;
          }
        }
        if (L.stepping) {
          L.u = Math.min(1, L.u + h / stepT);
          this.homeOf(L, L.to, stepT * 0.6);
          L.foot.lerpVectors(L.from, L.to, ease(L.u));
          // onto the surface under the swing, then lifted off it along its normal
          this.surf.project(L.foot.x, L.foot.y, L.foot.z, _P); this.surf.sample(_P.x, _P.y, _P.z, _S);
          const lift = (D.lift * S.lift + L.extra * 1.15) * Math.sin(Math.PI * L.u);
          L.foot.set(_P.x + _S.nx * lift, _P.y + _S.ny * lift, _P.z + _S.nz * lift);
          if (L.u >= 1) { L.stepping = false; L.foot.set(_P.x, _P.y, _P.z); }
        }
        L.planted = !L.stepping && Math.abs(this.dist(L.foot)) < 0.03 * L.len && hip.distanceTo(L.foot) < L.len * 1.02;
      }
      // the slope under each piece's feet, across it (for the frame's roll)
      for (let s = 0; s < D.segs.length; s++) {
        let l = 0, r = 0, nl = 0, nr = 0; const nm = this.chunks[this.segChunk[s]].n, o = this.skel.segs[s].o;
        const hgt = (p) => (p.x - o.x) * nm.x + (p.y - o.y) * nm.y + (p.z - o.z) * nm.z;       // height above the piece's own plane
        for (const L of legs) if (L.seg === s && L.planted) { if (L.side > 0) { l += hgt(L.foot); nl++; } else { r += hgt(L.foot); nr++; } }
        let want = 0;
        if (nl && nr) { const w = Math.max(0.2, 2 * Math.abs(legs.find((L) => L.seg === s).restLocal.x)); want = clamp((l / nl - r / nr) / w, -0.5, 0.5); }
        this.slope[s] += (want - this.slope[s]) * Math.min(1, h * 5);
      }
      for (const L of legs) this.solveLeg(L);
      for (const A of this.arms) this.solveWing(A);
    }

    // a leg's joints from hip to foot: the knee bends up, the last bone stands nearly upright
    solveLeg(L) {
      const g = this.skel.segs[L.seg], up = _c.copy(g.y), n = L.lens.length, IK = this.IK;
      const root = this.local(L.seg, L.hipLocal, new V3());
      const d = new V3().subVectors(L.foot, root); d.addScaledVector(up, -d.dot(up));
      if (d.lengthSq() < 1e-8) d.copy(g.x).multiplyScalar(L.side);
      d.normalize();
      L.plane.crossVectors(d, up).normalize();
      const Lt = L.lens[n - 1], tars = d.clone().multiplyScalar(0.28).addScaledVector(up, -1).normalize();
      const wrist = L.foot.clone().addScaledVector(tars, -Lt);
      if (n === 3) { L.J[0].copy(root); IK.twoBone(root, wrist, L.lens[0], L.lens[1], up.clone(), L.J[1], L.J[2]); }
      else IK.fabrik(L.J, L.lens.slice(0, n - 1), root, wrist, up.clone().addScaledVector(d, 0.25).normalize(), 0.12);
      L.J[n].copy(L.J[n - 1]).addScaledVector(tars, Lt);
    }
    // a wing beats about the body's forward axis, each bone a little after the one inside it (as the walker's)
    solveWing(A) {
      const F = A.ad.flap, g = this.skel.segs[A.seg], swim = this.mode !== "walk";
      const ph = this.t * F.rate * (0.5 + Math.min(1, this.pace)) + (F.phase || 0), k = (0.3 + 0.7 * Math.min(1, this.pace)) * (F.ground ?? 1) * (swim ? 0 : 1) + (swim ? 1.25 : 0);
      const amps = F.amps || [26, 20, 16], lags = F.lags || [0, 0.1, 0.22];
      const loc = A.J.map(() => new V3()); loc[0].copy(A.mount); let cum = 0;
      for (let i = 0; i < A.lens.length; i++) {
        cum += (amps[i] ?? 12) * k * Math.sin(ph - (lags[i] ?? 0.2) * Math.PI * 2) * DEG * A.side;
        const c = Math.cos(cum), s = Math.sin(cum), r = A.restDir;
        loc[i + 1].set(loc[i].x + A.lens[i] * (r.x * c - r.y * s), loc[i].y + A.lens[i] * (r.x * s + r.y * c), loc[i].z + A.lens[i] * r.z);
      }
      loc.forEach((p, i) => this.local(A.seg, p, A.J[i]));
      A.plane = A.plane || new V3(); A.plane.copy(g.z);
    }

    // ---- the skeleton, for the looks ----
    write() {
      const sk = this.skel, C = this.chunks;
      sk.t = this.t; sk.mode = this.mode;
      C.forEach((c, i) => { const o = sk.chunks[i]; o.p.x = c.p.x; o.p.y = c.p.y; o.p.z = c.p.z; o.r = c.r; });
      let li = 0;
      for (const L of this.legs) { const o = sk.limbs[li++]; L.J.forEach((j, k) => { o.joints[k].x = j.x; o.joints[k].y = j.y; o.joints[k].z = j.z; }); o.plane.x = L.plane.x; o.plane.y = L.plane.y; o.plane.z = L.plane.z; o.planted = L.planted; }
      for (const A of this.arms) { const o = sk.limbs[li++]; A.J.forEach((j, k) => { o.joints[k].x = j.x; o.joints[k].y = j.y; o.joints[k].z = j.z; }); o.plane.x = A.plane.x; o.plane.y = A.plane.y; o.plane.z = A.plane.z; o.planted = false; }
      const hc = C[0], sd = this.def.segs[0];
      sk.feel.pace = Math.min(1, this.pace); sk.feel.grip = this.grip ?? 1;
      sk.feel.air = clamp((hc.d - sd.h) / Math.max(0.2, this.len0), 0, 1);
    }
  }
  window.CreatureBody = CreatureBody;
  window.CreatureBody.V3 = V3;
  window.CreatureBody.K = K;
})();
