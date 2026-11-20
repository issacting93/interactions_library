/* INTERACTIONS: SolidLook. A creature drawn as solid pieces, each made from its own kit drawing (PartSolid), riding the skeleton.

   A look like KitLook, SoftLook and BonesLook (looks.js): it gets the def once and the skeleton every frame, and never moves the creature.

   How it is built (once, in the rest pose):
     body pieces  each kit part on a body piece is baked solid (plate, blade or belly, by its catalogue feature) and laid where KitLook
                  lays its lines: the top view on the piece's frame, its thickness standing up. A side part is baked once and mirrored.
                  All of a piece's parts are one mesh, carried rigidly by the piece's frame.
     legs         a leg's own blade is baked once; every vertex is projected onto the leg's spine (as LimbArt.sliceSpine does its lines)
                  and belongs to one bone, so the leg bends between bones. The two legs of a pair share it.
     wrap         a piece's parts are bent round a cylinder along the spine, so side blades curve down round the body
     noise        two scales of seeded noise push the surface along its normal: broad dents, and fine chips that bite the rim most.
                  It is read at |x|, so left and right match, and in the rest pose, so it never crawls as the creature moves
     creases      PartSolid's crease shading, and contact shading where one part lies against another
     blend        near where parts meet, a vertex's normal leans toward a smooth shared normal (an ellipsoid round the piece; for a leg,
                  near the hip). Light then reads the parts as one skin, as INSIDE's Huddle hid its seams. Lines fade there too
   How it is drawn (every frame, in the shader):
     matcap       a carved, lit-from-the-viewer look with a rim, no scene lights needed (off: one fixed light)
     depth        where a leg sinks into the body, both are darkened by how near their depths are (two depth passes: call prepass())
     thin         light through thin parts, most at their edges
     lag          the hindmost and outermost parts trail the piece's motion on a spring
     detail       fine relief from noise, as a bump on the normal, read in the rest pose

     import { SolidLook } from ".../shared/engine/motion/solid-look.js";
     const look = new SolidLook(THREE, scene, def, skel, { mode: (id) => "belly" | "blade" | "plate", seed: 7, on: { wrap: true, ... } });
     each frame: look.update(skel, dt); look.prepass(renderer, scene, camera) before rendering (only does anything with on.depth)
     look.set({ noise: false, ... })   switches; wrap, noise, seed and shape rebuild the geometry, the rest are uniforms
     look.dispose()

   Needs window.PartSolid (and Delaunator), window.Skeleton. ES module; THREE is passed in. */

const ON = { wrap: true, noise: true, crease: true, blend: true, matcap: true, depth: true, thin: true, lag: true, detail: true, lines: true };
const SHAPE = { thick: 1, wrap: 0.75, noise: 1, res: 56 };
const TC = 1.05;   // how far round the body (radians) a part is wrapped before it carries on straight

/* ---------- seeded noise ---------- */
function hash3(seed) {
  return (x, y, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
function valueNoise(seed) {
  const H = hash3(seed), f = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = f(x - xi), v = f(y - yi), w = f(z - zi);
    const l = (a, b, t) => a + (b - a) * t, c = (i, j, k) => H(xi + i, yi + j, zi + k);
    return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1; };
}
const fbm = (N) => (x, y, z) => N(x, y, z) * 0.6 + N(x * 2.1 + 7.3, y * 2.1, z * 2.1) * 0.28 + N(x * 4.3, y * 4.3 + 3.1, z * 4.3) * 0.12;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- a spatial hash for nearest-point questions ---------- */
function grid(cell) {
  const m = new Map(), key = (x, y, z) => Math.floor(x / cell) + "," + Math.floor(y / cell) + "," + Math.floor(z / cell);
  return {
    add(x, y, z, v) { const k = key(x, y, z); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(x, y, z, v); },
    near(x, y, z, skip) { let best = Infinity, bv = null; const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const a = m.get((cx + i) + "," + (cy + j) + "," + (cz + k)); if (!a) continue;
        for (let q = 0; q < a.length; q += 4) { if (skip !== undefined && a[q + 3] === skip) continue; const d = (a[q] - x) ** 2 + (a[q + 1] - y) ** 2 + (a[q + 2] - z) ** 2; if (d < best) { best = d; bv = a[q + 3]; } } }
      return [Math.sqrt(best), bv]; },
  };
}
// smooth vertex normals of an indexed triangle list
function normals(P, I, out) {
  out = out || new Float32Array(P.length); out.fill(0);
  for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { out[i] += nx; out[i + 1] += ny; out[i + 2] += nz; } }
  for (let i = 0; i < out.length; i += 3) { const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1; out[i] /= l; out[i + 1] /= l; out[i + 2] /= l; }
  return out;
}

/* ---------- the shader ---------- */
const VERT = `
attribute vec3 aBlendN; attribute vec3 aRest; attribute float aW; attribute float aAO; attribute float aThin; attribute float aTrail;
uniform vec3 uLag; uniform float uLagOn;
varying vec3 vN; varying vec3 vBN; varying vec3 vView; varying vec3 vRest; varying float vW; varying float vAO; varying float vThin;
void main() {
  vec3 p = position + uLag * (aTrail * aTrail) * uLagOn;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vBN = normalize(normalMatrix * aBlendN);
  vView = mv.xyz; vRest = aRest; vW = aW; vAO = aAO; vThin = aThin;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform vec3 uBase; uniform vec3 uShadow; uniform vec3 uRim; uniform vec3 uGlow; uniform vec3 uLight;
uniform float uMatcap; uniform float uAO; uniform float uBlend; uniform float uThin; uniform float uThinK; uniform float uDetail; uniform float uDetailF; uniform float uDetailA;
uniform float uDepth; uniform sampler2D uOther; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uDepthEps; uniform float uSeed;
varying vec3 vN; varying vec3 vBN; varying vec3 vView; varying vec3 vRest; varying float vW; varying float vAO; varying float vThin;
float h3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419) + uSeed * 0.013); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  vec3 n = normalize(mix(normalize(vN), normalize(vBN), clamp(vW * uBlend, 0.0, 1.0)));
  if (!gl_FrontFacing) n = -n;
  if (uDetail > 0.5) {   // fine relief as a bump: the surface gradient of a noise height (Mikkelsen), read in the rest pose
    vec3 q = vRest * uDetailF; float h = vn(q) * 0.65 + vn(q * 2.3 + 4.1) * 0.35;
    vec3 dpx = dFdx(vView), dpy = dFdy(vView); float dhx = dFdx(h), dhy = dFdy(h);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
    vec3 g = sign(det) * (dhx * r1 + dhy * r2); n = normalize(abs(det) * n - uDetailA * g);
  }
  vec3 V = normalize(-vView), c;
  if (uMatcap > 0.5) {   // a carved look, lit from over the viewer's shoulder
    vec3 L = normalize(vec3(-0.45, 0.7, 0.55)); float w = dot(n, L) * 0.5 + 0.5;
    c = mix(uShadow, uBase, smoothstep(0.08, 0.92, w));
    c += pow(max(0.0, dot(reflect(-L, n), V)), 22.0) * 0.28;
    c = mix(c, uRim, pow(1.0 - max(0.0, dot(n, V)), 2.6) * 0.6);
  } else {
    float d = max(0.0, dot(n, uLight)); c = uShadow + (uBase - uShadow) * (0.25 + 0.75 * d);
  }
  c *= mix(1.0, vAO, uAO);
  if (uThin > 0.5) {   // light through thin parts: back-lit, and at the edges
    float t = exp(-vThin * uThinK), back = max(0.0, dot(-n, uLight)) * 0.6 + pow(1.0 - abs(dot(n, V)), 3.0) * 0.4;
    c += uGlow * t * t * back * 0.55;
  }
  if (uDepth > 0.5) {   // where this surface meets the other group's (a leg in the body), darken by how near their depths are
    float o = texture2D(uOther, gl_FragCoord.xy / uRes).r;
    if (o < 1.0) { float dz = abs(lin(o) - lin(gl_FragCoord.z)); c *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, uDepthEps, dz)); }
  }
  gl_FragColor = vec4(c, 1.0);
}`;
const LVERT = `attribute float aW; attribute float aTrail; uniform vec3 uLag; uniform float uLagOn; varying float vW;
void main() { vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + uLag * (aTrail * aTrail) * uLagOn, 1.0); }`;
const LFRAG = `uniform vec3 uInk; uniform float uBlend; varying float vW; void main() { float a = 1.0 - clamp(vW * uBlend * 1.3, 0.0, 0.95); if (a < 0.02) discard; gl_FragColor = vec4(uInk, a); }`;

export class SolidLook {
  constructor(THREE, scene, def, skel, opts = {}) {
    this.T = THREE; this.scene = scene; this.def = def; this.opts = opts;
    this.on = { ...ON, ...(opts.on || {}) }; this.shape = { ...SHAPE, ...(opts.shape || {}) }; this.seed = opts.seed ?? 1;
    const C = (v, d) => new THREE.Color(v ?? d);
    this.uni = {
      uBase: { value: C(opts.base, 0x77736a) }, uShadow: { value: C(opts.shadow, 0x111113) }, uRim: { value: C(opts.rim, 0xc9c2b2) }, uGlow: { value: C(opts.glow, 0xd8cdb4) },
      uLight: { value: new THREE.Vector3(0, 1, 0) }, uMatcap: { value: 1 }, uAO: { value: 1 }, uBlend: { value: 1 }, uThin: { value: 1 }, uThinK: { value: 1 },
      uDetail: { value: 1 }, uDetailF: { value: 1 }, uDetailA: { value: 0.004 }, uDepth: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.05 }, uFar: { value: 200 }, uDepthEps: { value: 0.03 }, uSeed: { value: this.seed },
    };
    this.objs = []; this.cache = new Map();
    this.rts = null; this.depthMat = new THREE.MeshDepthMaterial(); this.depthMat.side = THREE.DoubleSide;
    this.sun = new THREE.Vector3(-0.5, 0.8, 0.35).normalize();
    this.build(skel);
  }
  // the mode a part is made in: the page's say (by the catalogue's feature), else belly on the spine and blade at the sides
  modeOf(e, legs) { const m = this.opts.mode && this.opts.mode(e.id, { legs, centre: !e.mirror }); return m || (legs ? "blade" : e.mirror ? "blade" : "belly"); }
  solid(polys, mode, key, thick) {
    const k = key + "|" + mode + "|" + this.shape.res + "|" + thick;
    if (!this.cache.has(k)) { const part = window.PartSolid.read(polys); this.cache.set(k, part.outer.length ? window.PartSolid.build(part, { mode, thick, res: this.shape.res, edge: 0.06 }) : null); }
    return this.cache.get(k);
  }
  matFor(depthUnit) {
    const T = this.T, u = { ...this.uni, uOther: { value: null }, uLag: { value: new T.Vector3() }, uLagOn: { value: 1 } };
    const m = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    m.userData.unit = depthUnit; return m;
  }
  lineMat(lag) { const T = this.T; return new T.ShaderMaterial({ vertexShader: LVERT, fragmentShader: LFRAG, transparent: true, depthWrite: false,
    uniforms: { uInk: { value: new T.Color(this.opts.ink ?? 0xece8de) }, uBlend: this.uni.uBlend, uLag: lag, uLagOn: { value: 1 } } }); }

  build(skel) {
    for (const o of this.objs) { this.scene.remove(o); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }
    this.objs = []; this.segs = []; this.legs = [];
    const T = this.T, def = this.def, sh = this.shape, on = this.on, N1 = fbm(valueNoise(this.seed * 7 + 1)), N2 = fbm(valueNoise(this.seed * 13 + 5));
    // ---- body pieces ----
    def.segs.forEach((sd, si) => {
      const parts = (sd.parts || []).filter((e) => e.polys && !e.upright);
      let W = 0; for (const e of parts) if (!e.mirror) for (const pl of e.polys) for (let i = 0; i < pl.length; i += 2) W = Math.max(W, Math.abs((e.cx || 200) - pl[i]) * e.k * (e.s || 1));
      W = W || 0.2; const R = W / Math.max(0.05, sh.wrap);
      const pieces = [];   // { P (local positions), I, Z (stand-off), ao, rimness, lines }
      for (const e of parts) {
        const k = e.k * (e.s || 1), so = this.solid(e.polys, this.modeOf(e, false), "s" + si + ":" + parts.indexOf(e), sh.thick * (e.mirror ? 0.8 : 0.6)); if (!so) continue;
        const base = (sx, sy) => { let y = e.y || 0; if (e.lift) y += e.lift(sx, sy); return y; };
        const place = (X, Y, Z, mir, out, o) => {   // a baked point (box-centred, Z the stand-off) into the piece's frame
          const sx = so.cx + X, sy = so.cy - Y; let x = ((e.cx || 200) - sx) * k * (mir ? -1 : 1), y = base(sx, sy) + Z * k, z = (e.cy - sy) * k;
          // wrapped round the body up to a turn's sixth either side; past that a blade carries on straight, along the curve's tangent, so it hangs out and down, never over
          if (on.wrap) { const th = Math.max(-TC, Math.min(TC, x / R)), ex = x - th * R, r = R + y; x = Math.sin(th) * r + Math.cos(th) * ex; y = Math.cos(th) * r - R - Math.sin(th) * ex; }
          out[o] = x; out[o + 1] = y; out[o + 2] = z; };
        for (const mir of e.mirror ? [false, true] : [false]) {
          const n = so.positions.length / 3, P = new Float32Array(n * 3), I = new Uint32Array(so.indices), Zs = new Float32Array(n), rimness = new Float32Array(n);
          let zmax = 0; for (let i = 0; i < n; i++) zmax = Math.max(zmax, Math.abs(so.positions[i * 3 + 2]));
          for (let i = 0; i < n; i++) { const X = so.positions[i * 3], Y = so.positions[i * 3 + 1], Z = so.positions[i * 3 + 2]; place(X, Y, Z, mir, P, i * 3); Zs[i] = Math.abs(Z) * k * 2; rimness[i] = 1 - smooth(0, 0.35 * Math.max(1e-6, zmax - so.edge), Math.abs(Z) - so.edge); }
          if (mir) for (let t = 0; t < I.length; t += 3) { const a = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = a; }
          const L = new Float32Array(so.lines.length); for (let i = 0; i < so.lines.length; i += 3) place(so.lines[i], so.lines[i + 1], so.lines[i + 2], mir, L, i);
          pieces.push({ P, I, Zs, rimness, ao: so.ao, L });
        }
      }
      // noise: along the normal, read at |x| in the rest pose, broad dents and fine chips (more at the rim); the lines move with the nearest vertex
      if (on.noise && sh.noise > 0) for (const pc of pieces) {
        const Nn = normals(pc.P, pc.I), D = new Float32Array(pc.P.length), A1 = 0.05 * W * sh.noise, A2 = 0.02 * W * sh.noise, f1 = 2.2 / W, f2 = 9 / W;
        for (let i = 0; i < pc.P.length; i += 3) { const x = Math.abs(pc.P[i]), y = pc.P[i + 1], z = pc.P[i + 2], d = A1 * N1(x * f1, y * f1, z * f1) + A2 * (0.35 + 0.65 * pc.rimness[i / 3]) * N2(x * f2, y * f2, z * f2);
          D[i] = Nn[i] * d; D[i + 1] = Nn[i + 1] * d; D[i + 2] = Nn[i + 2] * d; }
        const gl = grid(0.04 * W); for (let i = 0; i < pc.P.length; i += 3) gl.add(pc.P[i], pc.P[i + 1], pc.P[i + 2], i);
        for (let i = 0; i < pc.L.length; i += 3) { const [, j] = gl.near(pc.L[i], pc.L[i + 1], pc.L[i + 2]); if (j !== null) { pc.L[i] += D[j]; pc.L[i + 1] += D[j + 1]; pc.L[i + 2] += D[j + 2]; } }
        for (let i = 0; i < D.length; i++) pc.P[i] += D[i];
      }
      // the piece as one mesh: where its parts meet (blend weight, contact shading), the shared ellipsoid normal, what trails
      let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, bz0 = 1e9, bz1 = -1e9;
      for (const pc of pieces) for (let i = 0; i < pc.P.length; i += 3) { bx0 = Math.min(bx0, pc.P[i]); bx1 = Math.max(bx1, pc.P[i]); by0 = Math.min(by0, pc.P[i + 1]); by1 = Math.max(by1, pc.P[i + 1]); bz0 = Math.min(bz0, pc.P[i + 2]); bz1 = Math.max(bz1, pc.P[i + 2]); }
      const ec = [0, (by0 + by1) / 2, (bz0 + bz1) / 2], ea = [Math.max(W, (bx1 - bx0) / 2), Math.max(0.3 * W, (by1 - by0) / 2), Math.max(W, (bz1 - bz0) / 2)];
      const ell = (x, y, z) => { const nx = (x - ec[0]) / (ea[0] * ea[0]), ny = (y - ec[1]) / (ea[1] * ea[1]), nz = (z - ec[2]) / (ea[2] * ea[2]), l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; };
      const BR = 0.14 * W, gp = grid(BR); pieces.forEach((pc, pi) => { for (let i = 0; i < pc.P.length; i += 9) gp.add(pc.P[i], pc.P[i + 1], pc.P[i + 2], pi); });
      let nv = 0, nt = 0, nl = 0; for (const pc of pieces) { nv += pc.P.length / 3; nt += pc.I.length; nl += pc.L.length / 3; }
      const P = new Float32Array(nv * 3), BN = new Float32Array(nv * 3), Wt = new Float32Array(nv), AO = new Float32Array(nv), TH = new Float32Array(nv), TR = new Float32Array(nv), I = new Uint32Array(nt);
      const LP = new Float32Array(nl * 3), LW = new Float32Array(nl), LT = new Float32Array(nl);
      const trail = (x, z) => smooth(ec[2] - 0.1 * ea[2], ec[2] - ea[2] * 1.1, z) * (0.4 + 0.6 * Math.min(1, Math.abs(x) / ea[0])) + smooth(0.6, 1.3, Math.abs(x) / ea[0]) * 0.5;
      let ov = 0, ot = 0, ol = 0;
      pieces.forEach((pc, pi) => {
        const n = pc.P.length / 3;
        for (let t = 0; t < pc.I.length; t++) I[ot + t] = pc.I[t] + ov; ot += pc.I.length;
        for (let i = 0; i < n; i++) { const x = pc.P[i * 3], y = pc.P[i * 3 + 1], z = pc.P[i * 3 + 2], o = (ov + i) * 3;
          P[o] = x; P[o + 1] = y; P[o + 2] = z; const en = ell(x, y, z); BN[o] = en[0]; BN[o + 1] = en[1]; BN[o + 2] = en[2];
          const [d] = gp.near(x, y, z, pi); Wt[ov + i] = 1 - smooth(0, BR, d);
          AO[ov + i] = pc.ao[i] * (1 - 0.45 * (1 - smooth(0, 0.5 * BR, d))); TH[ov + i] = pc.Zs[i]; TR[ov + i] = trail(x, z); }
        for (let i = 0; i < pc.L.length; i += 3) { const x = pc.L[i], y = pc.L[i + 1], z = pc.L[i + 2], o = (ol + i / 3) * 3; LP[o] = x; LP[o + 1] = y; LP[o + 2] = z;
          const [d] = gp.near(x, y, z, pi); LW[ol + i / 3] = 1 - smooth(0, BR, d); LT[ol + i / 3] = trail(x, z); }
        ov += n; ol += pc.L.length / 3;
      });
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(P, 3)); g.setIndex(new T.BufferAttribute(I, 1)); g.computeVertexNormals();
      g.setAttribute("aBlendN", new T.BufferAttribute(BN, 3)); g.setAttribute("aRest", new T.BufferAttribute(P.slice(), 3)); g.setAttribute("aW", new T.BufferAttribute(Wt, 1));
      g.setAttribute("aAO", new T.BufferAttribute(AO, 1)); g.setAttribute("aThin", new T.BufferAttribute(TH, 1)); g.setAttribute("aTrail", new T.BufferAttribute(TR, 1));
      const mat = this.matFor(0), mesh = new T.Mesh(g, mat); mesh.matrixAutoUpdate = false; mesh.layers.enable(1);
      const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.BufferAttribute(LP, 3)); lg.setAttribute("aW", new T.BufferAttribute(LW, 1)); lg.setAttribute("aTrail", new T.BufferAttribute(LT, 1));
      const line = new T.LineSegments(lg, this.lineMat(mat.uniforms.uLag)); line.matrixAutoUpdate = false;
      this.scene.add(mesh, line); this.objs.push(mesh, line);
      this.segs.push({ si, mesh, line, mat, W, ec, ea, ell, lag: new T.Vector3(), lagV: new T.Vector3(), prev: null, verts: nv, tris: nt / 3 });
    });
    // ---- legs: each def leg baked once from its own blade, every vertex on one bone ----
    const legSolids = new Map(), W0 = this.segs.length ? Math.max(...this.segs.map((s) => s.W)) : 0.3;
    skel.limbs.forEach((L, li) => {
      const sd = def.segs[L.seg], ld = L.kind === "leg" ? (sd.legs[L.src] || sd.legs[0]) : null, src = ld && ld.artObj && ld.artObj.src;
      if (!src || !src.polys || !src.spine) { this.legs.push(null); return; }
      const key = L.seg + ":" + (L.kind === "leg" ? L.src : "a" + L.src);
      if (!legSolids.has(key)) legSolids.set(key, this.bakeLimb(ld, src, key, W0, N1, N2));
      const B = legSolids.get(key); if (!B) { this.legs.push(null); return; }
      const nv = B.n, P = new Float32Array(nv * 3), g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(P, 3)); g.setIndex(new T.BufferAttribute(B.I, 1)); g.setAttribute("normal", new T.BufferAttribute(new Float32Array(nv * 3), 3));
      g.setAttribute("aBlendN", new T.BufferAttribute(new Float32Array(nv * 3), 3)); g.setAttribute("aRest", new T.BufferAttribute(B.rest, 3)); g.setAttribute("aW", new T.BufferAttribute(B.w, 1));
      g.setAttribute("aAO", new T.BufferAttribute(B.ao, 1)); g.setAttribute("aThin", new T.BufferAttribute(B.thin, 1)); g.setAttribute("aTrail", new T.BufferAttribute(new Float32Array(nv), 1));
      const mat = this.matFor(1), mesh = new T.Mesh(g, mat); mesh.frustumCulled = false; mesh.layers.enable(2);
      const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.BufferAttribute(new Float32Array(B.nl * 3), 3)); lg.setAttribute("aW", new T.BufferAttribute(B.lw, 1)); lg.setAttribute("aTrail", new T.BufferAttribute(new Float32Array(B.nl), 1));
      const line = new T.LineSegments(lg, this.lineMat(mat.uniforms.uLag)); line.frustumCulled = false;
      this.scene.add(mesh, line); this.objs.push(mesh, line);
      this.legs.push({ L: li, B, mesh, line, mat, art: ld.artObj, len: ld.len, lens: ld.fracs.map((f) => f * ld.len), faceUp: !!ld.faceUp });
    });
    this.uni.uThinK.value = 14 / Math.max(1e-3, W0);
    this.applyOn();
  }
  // a leg's blade, baked in the drawing's plane: (t along the spine, v across it, h off the plane); bone by t
  bakeLimb(ld, src, key, W0, N1, N2) {
    const so = this.solid(src.polys, this.modeOf({ id: ld.id }, true), "leg" + key, this.shape.thick * 0.7); if (!so) return null;
    const spine = src.spine, cum = [0]; for (let i = 0; i + 1 < spine.length; i++) cum.push(cum[i] + Math.hypot(spine[i + 1][0] - spine[i][0], spine[i + 1][1] - spine[i][1]));
    const Ls = cum[cum.length - 1] || 1, last = spine.length - 2, starts = [0]; src.fracs.reduce((a, f) => (starts.push((a + f) * Ls), a + f), 0);
    const proj = (x, y) => { let best = null; for (let i = 0; i <= last; i++) { const a = spine[i], b = spine[i + 1], ax = b[0] - a[0], ay = b[1] - a[1], l = Math.hypot(ax, ay) || 1;
      let u = ((x - a[0]) * ax + (y - a[1]) * ay) / (l * l); if (i > 0) u = Math.max(0, u); if (i < last) u = Math.min(1, u);
      const qx = a[0] + ax * u, qy = a[1] + ay * u, d2 = (x - qx) ** 2 + (y - qy) ** 2; if (!best || d2 < best[2]) best = [cum[i] + u * l, ((x - a[0]) * -ay + (y - a[1]) * ax) / l, d2]; } return best; };
    const boneOf = (t) => { let b = 0; while (b + 1 < src.fracs.length && t >= starts[b + 1]) b++; return b; };
    const n = so.positions.length / 3, rec = new Float32Array(n * 3), bone = new Uint8Array(n), rest = new Float32Array(n * 3), thin = new Float32Array(n), w = new Float32Array(n);
    let zmax = 0; for (let i = 0; i < n; i++) zmax = Math.max(zmax, Math.abs(so.positions[i * 3 + 2]));
    const rimness = new Float32Array(n);
    for (let i = 0; i < n; i++) { const sx = so.cx + so.positions[i * 3], sy = so.cy - so.positions[i * 3 + 1], Z = so.positions[i * 3 + 2], [t, v] = proj(sx, sy);
      rec[i * 3] = t; rec[i * 3 + 1] = v; rec[i * 3 + 2] = Z; bone[i] = boneOf(t); thin[i] = 0; rimness[i] = 1 - smooth(0, 0.35 * Math.max(1e-6, zmax - so.edge), Math.abs(Z) - so.edge); }
    // noise in the leg's own (t, v, h) space, the same for both legs of the pair
    const I = new Uint32Array(so.indices);
    if (this.on.noise && this.shape.noise > 0) { const Nn = normals(rec, I), Lu = Ls * 0.18, A1 = 0.05 * Lu * this.shape.noise, A2 = 0.025 * Lu * this.shape.noise, f1 = 2.2 / Lu, f2 = 9 / Lu;
      for (let i = 0; i < n; i++) { const x = rec[i * 3], y = rec[i * 3 + 1], z = rec[i * 3 + 2], d = A1 * N1(x * f1, y * f1, z * f1) + A2 * (0.35 + 0.65 * rimness[i]) * N2(x * f2, y * f2, z * f2);
        rec[i * 3 + 2] += Nn[i * 3 + 2] * d; rec[i * 3 + 1] += Nn[i * 3 + 1] * d; } }
    for (let i = 0; i < n; i++) { rest[i * 3] = rec[i * 3]; rest[i * 3 + 1] = rec[i * 3 + 1]; rest[i * 3 + 2] = rec[i * 3 + 2]; w[i] = 1 - smooth(0, 0.22 * Ls, rec[i * 3]); }
    const nl = so.lines.length / 3, lrec = new Float32Array(nl * 3), lbone = new Uint8Array(nl), lw = new Float32Array(nl);
    for (let i = 0; i < nl; i++) { const sx = so.cx + so.lines[i * 3], sy = so.cy - so.lines[i * 3 + 1], [t, v] = proj(sx, sy); lrec[i * 3] = t; lrec[i * 3 + 1] = v; lrec[i * 3 + 2] = so.lines[i * 3 + 2] * 1.04; lbone[i] = boneOf(t); lw[i] = 1 - smooth(0, 0.22 * Ls, t); }
    return { n, I, rec, bone, rest, thin, w, ao: so.ao, starts, Ls, nl, lrec, lbone, lw, zmax };
  }
  applyOn() {
    const u = this.uni, on = this.on;
    u.uMatcap.value = on.matcap ? 1 : 0; u.uAO.value = on.crease ? 1 : 0; u.uBlend.value = on.blend ? 1 : 0; u.uThin.value = on.thin ? 1 : 0; u.uDetail.value = on.detail ? 1 : 0; u.uDepth.value = on.depth ? 1 : 0;
    for (const o of this.objs) { if (o.isLineSegments) o.visible = on.lines; if (o.material.uniforms && o.material.uniforms.uLagOn) o.material.uniforms.uLagOn.value = on.lag ? 1 : 0; }
  }
  set(flags, skel) {
    const rebuild = ["wrap", "noise"].some((k) => k in flags && flags[k] !== this.on[k]) || ("seed" in flags && flags.seed !== this.seed) || (flags.shape && JSON.stringify({ ...this.shape, ...flags.shape }) !== JSON.stringify(this.shape));
    Object.assign(this.on, flags); if ("seed" in flags) { this.seed = flags.seed; this.uni.uSeed.value = flags.seed; } if (flags.shape) { this.shape = { ...this.shape, ...flags.shape }; if (flags.shape.res || flags.shape.thick) this.cache.clear(); }
    delete this.on.seed; delete this.on.shape;
    if (rebuild && skel) this.build(skel); else this.applyOn();
  }
  update(skel, dt = 1 / 60) {
    const S = window.Skeleton, m = new Array(16), T = this.T;
    // body pieces: rigid on their frames, the trailing parts on a lag spring
    for (const s of this.segs) {
      const sg = skel.segs[s.si]; s.mesh.matrix.fromArray(S.matrix(sg, m)); s.mesh.matrixWorldNeedsUpdate = true; s.line.matrix.copy(s.mesh.matrix); s.line.matrixWorldNeedsUpdate = true;
      if (s.prev && dt > 0) { const v = { x: (sg.o.x - s.prev.o.x) / dt, y: (sg.o.y - s.prev.o.y) / dt, z: (sg.o.z - s.prev.o.z) / dt };
        const yaw = ((s.prev.z.x * sg.z.z - s.prev.z.z * sg.z.x)) / dt;   // how fast it turns about up
        const tx = -(v.x * sg.x.x + v.y * sg.x.y + v.z * sg.x.z) * 0.05 - yaw * 0.08 * s.ea[2], ty = -(v.x * sg.y.x + v.y * sg.y.y + v.z * sg.y.z) * 0.06, tz = -(v.x * sg.z.x + v.y * sg.z.y + v.z * sg.z.z) * 0.05;
        const k = 60, c = 9, h = Math.min(dt, 0.05);
        s.lagV.x += ((tx - s.lag.x) * k - s.lagV.x * c) * h; s.lagV.y += ((ty - s.lag.y) * k - s.lagV.y * c) * h; s.lagV.z += ((tz - s.lag.z) * k - s.lagV.z * c) * h;
        s.lag.x += s.lagV.x * h; s.lag.y += s.lagV.y * h; s.lag.z += s.lagV.z * h;
        const cap = 0.12 * s.W, l = s.lag.length(); if (l > cap) s.lag.multiplyScalar(cap / l); s.mat.uniforms.uLag.value.copy(s.lag); }
      s.prev = { o: { ...sg.o }, z: { ...sg.z } };
    }
    // legs: every vertex on its bone, as KitLook lays a leg's lines (the drawing in the leg's plane), standing off it along the plane's normal
    const d = { x: 0, y: 0, z: 0 }, pv = { x: 0, y: 0, z: 0 }, vp = { x: 0, y: 0, z: 0 }, nn = { x: 0, y: 0, z: 0 };
    for (const G of this.legs) {
      if (!G) continue;
      const L = skel.limbs[G.L], J = L.joints, B = G.B, k = G.len / G.art.L, frames = [];
      for (let bi = 0; bi < G.lens.length; bi++) {
        const a = J[bi], b = J[bi + 1]; d.x = b.x - a.x; d.y = b.y - a.y; d.z = b.z - a.z; const l = Math.hypot(d.x, d.y, d.z) || 1; d.x /= l; d.y /= l; d.z /= l;
        let qx = L.plane.x, qy = L.plane.y, qz = L.plane.z; if (G.faceUp) { const cl = Math.hypot(d.z, d.x) || 1; qx = d.z / cl; qy = 0; qz = -d.x / cl; }
        vp.x = qy * d.z - qz * d.y; vp.y = qz * d.x - qx * d.z; vp.z = qx * d.y - qy * d.x; const vl = Math.hypot(vp.x, vp.y, vp.z) || 1; vp.x /= vl; vp.y /= vl; vp.z /= vl;
        const s2 = G.faceUp ? 1 : L.side; pv.x = qx * s2 * 0.906 + vp.x * 0.423; pv.y = qy * s2 * 0.906 + vp.y * 0.423; pv.z = qz * s2 * 0.906 + vp.z * 0.423;
        const pl = Math.hypot(pv.x, pv.y, pv.z) || 1; pv.x /= pl; pv.y /= pl; pv.z /= pl;
        nn.x = d.y * pv.z - d.z * pv.y; nn.y = d.z * pv.x - d.x * pv.z; nn.z = d.x * pv.y - d.y * pv.x;
        frames.push({ a: { ...a }, d: { ...d }, pv: { ...pv }, n: { ...nn }, ks: (l / G.lens[bi]) * k });
      }
      const place = (rec, bone, i, out, o, hk) => { const f = frames[bone[i]], s = (rec[i * 3] - B.starts[bone[i]]) * f.ks, v = rec[i * 3 + 1] * k, h = rec[i * 3 + 2] * k * hk;
        out[o] = f.a.x + f.d.x * s + f.pv.x * v + f.n.x * h; out[o + 1] = f.a.y + f.d.y * s + f.pv.y * v + f.n.y * h; out[o + 2] = f.a.z + f.d.z * s + f.pv.z * v + f.n.z * h; };
      const g = G.mesh.geometry, P = g.attributes.position.array, TH = g.attributes.aThin.array;
      for (let i = 0; i < B.n; i++) { place(B.rec, B.bone, i, P, i * 3, 1); TH[i] = Math.abs(B.rec[i * 3 + 2]) * k * 2; }
      normals(P, B.I, g.attributes.normal.array);
      // the shared normal near the hip: the body's ellipsoid, read in the body piece's frame
      const s = this.segs.find((x) => x.si === L.seg), sg = skel.segs[L.seg], BN = g.attributes.aBlendN.array;
      if (s) for (let i = 0; i < B.n; i++) { if (B.w[i] <= 0) { BN[i * 3] = g.attributes.normal.array[i * 3]; BN[i * 3 + 1] = g.attributes.normal.array[i * 3 + 1]; BN[i * 3 + 2] = g.attributes.normal.array[i * 3 + 2]; continue; }
        const rx = P[i * 3] - sg.o.x, ry = P[i * 3 + 1] - sg.o.y, rz = P[i * 3 + 2] - sg.o.z, lx = rx * sg.x.x + ry * sg.x.y + rz * sg.x.z, ly = rx * sg.y.x + ry * sg.y.y + rz * sg.y.z, lz = rx * sg.z.x + ry * sg.z.y + rz * sg.z.z;
        const e = s.ell(lx, ly, lz); BN[i * 3] = sg.x.x * e[0] + sg.y.x * e[1] + sg.z.x * e[2]; BN[i * 3 + 1] = sg.x.y * e[0] + sg.y.y * e[1] + sg.z.y * e[2]; BN[i * 3 + 2] = sg.x.z * e[0] + sg.y.z * e[1] + sg.z.z * e[2]; }
      g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = g.attributes.aBlendN.needsUpdate = g.attributes.aThin.needsUpdate = true; g.computeBoundingSphere();
      const lp = G.line.geometry.attributes.position; for (let i = 0; i < B.nl; i++) place(B.lrec, B.lbone, i, lp.array, i * 3, 1); lp.needsUpdate = true;
    }
  }
  // the two depth passes for on.depth: body pieces (layer 1) and legs (layer 2), each read by the other's material
  prepass(renderer, scene, camera) {
    if (!this.on.depth) return;
    const T = this.T, sz = renderer.getDrawingBufferSize(new T.Vector2());
    if (!this.rts || this.rts[0].width !== sz.x || this.rts[0].height !== sz.y) {
      if (this.rts) for (const r of this.rts) { r.depthTexture.dispose(); r.dispose(); }
      this.rts = [0, 1].map(() => { const r = new T.WebGLRenderTarget(sz.x, sz.y); r.depthTexture = new T.DepthTexture(sz.x, sz.y); return r; });
    }
    const keep = { mask: camera.layers.mask, over: scene.overrideMaterial, rt: renderer.getRenderTarget(), bg: scene.background, vp: new T.Vector4() };
    renderer.getViewport(keep.vp);
    scene.overrideMaterial = this.depthMat;
    [1, 2].forEach((layer, i) => { camera.layers.set(layer); renderer.setRenderTarget(this.rts[i]); renderer.clear(true, true, true); renderer.render(scene, camera); });
    camera.layers.mask = keep.mask; scene.overrideMaterial = keep.over; renderer.setRenderTarget(keep.rt); renderer.setViewport(keep.vp);
    this.uni.uRes.value.set(sz.x, sz.y); this.uni.uNear.value = camera.near; this.uni.uFar.value = camera.far;
    this.uni.uLight.value.copy(this.sun).transformDirection(camera.matrixWorldInverse);
    for (const s of this.segs) s.mat.uniforms.uOther.value = this.rts[1].depthTexture;
    for (const G of this.legs) if (G) G.mat.uniforms.uOther.value = this.rts[0].depthTexture;
  }
  light(camera) { this.uni.uLight.value.copy(this.sun).transformDirection(camera.matrixWorldInverse); }
  stats() { return { pieces: this.segs.length, legs: this.legs.filter(Boolean).length, tris: this.segs.reduce((n, s) => n + s.tris, 0) + this.legs.reduce((n, G) => n + (G ? G.B.I.length / 3 : 0), 0) }; }
  count() { return this.objs.length; }
  dispose() { for (const o of this.objs) { this.scene.remove(o); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); } if (this.rts) for (const r of this.rts) { r.depthTexture.dispose(); r.dispose(); } this.depthMat.dispose(); }
}
