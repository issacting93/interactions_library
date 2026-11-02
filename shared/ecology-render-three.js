/* INTERACTIONS — Ecology creature renderer, ported to Three.js.

   Full-fidelity port of tools/fish-tool/Cybernetic Ecology.html's real WebGL2 creature renderer
   (spine-texture-driven body/fin/wing rig, per-species part-rig data, iridescent shading) into
   native Three.js objects (RawShaderMaterial + InstancedMesh), so a Three.js scene (e.g.
   tools/world-scene/World Scene.html) can show the REAL species art — not a color-hashed stand-in —
   correctly depth-composited with its own city/tower geometry in one normal renderer.render() call.

   Cybernetic Ecology.html itself is NOT modified or depended on at runtime; this is new code built
   from its shader source (ported, not reused by reference) plus the shared simulation/species data
   it already draws on: shared/ecology-sim.js (full per-fish animation state: chain/cz/croll, mood
   tuck/turnS/puff/alert, mood2 glide/flap, phase/seed/fade/cloak/gulp/darkRoll — all already computed
   by the sim, nothing new needed there) and shared/ecology-species.js (window.EcologySpecies: the
   real per-species rig data — fillV/fillI/lineV/lineI mesh buffers, partTex rig/socket data, HUE
   colors, WING wingbeat weights).

   What ported, and what deliberately didn't (see tools/world-scene/ merge plan for the reasoning):
     - FISH_VS (spine/rig deformation), FILL_FS, LINE_FS: ported verbatim, including the iris()/
       film() iridescence and all mood-driven fin/wing animation math.
     - Carcasses: kept as real sim state (shared/ecology-sim.js's sim.carcasses), but rendered as a
       plain THREE.InstancedMesh (small sphere, life-based scale/opacity) rather than porting
       CARCASS_VS/CARCASS_FS's point-sprite shader — see "InstancedMesh, not InstancedBufferGeometry"
       below for why a custom-shader instanced Points pass was dropped from this phase.
     - PT_FS (shimmer highlight points), glow/bloom, terrain contours, marine snow, the cloud
       point-swarm alt body: NOT ported here. Glow is consolidated onto the host scene's own Three.js
       bloom pipeline in a later phase; terrain/snow are ecology-specific seabed decoration that
       doesn't fit a scene that already has its own ground; shimmer/cloud are stretch polish.
     - uZScale/uRes (FISH_VS): both declared but never read in the original shader body (confirmed by
       reading the live source) — omitted here, not a behavior change.

   InstancedMesh, not InstancedBufferGeometry: this Three.js build (r128) silently draws ZERO
   instances for a plain THREE.Mesh whose geometry is a THREE.InstancedBufferGeometry with only a
   manually-set `.instanceCount` and no actual InstancedBufferAttribute driving it — confirmed by an
   isolated repro (a hardcoded-NDC, depthTest-off, solid-color RawShaderMaterial triangle: completely
   invisible as InstancedBufferGeometry, immediately visible as THREE.InstancedMesh wrapping a plain
   BufferGeometry). THREE.InstancedMesh is the renderer code path that actually works here, so every
   instanced pass in this module uses it — a plain (non-instanced) BufferGeometry per species, wrapped
   in one InstancedMesh per species per pass, with `mesh.count` (not `geometry.instanceCount`) set
   each frame to that species' current run length. The vertex shader never reads Three's own
   instanceMatrix (ignored, like modelMatrix — see "Coordinate spaces" below); it drives per-instance
   position/pose purely from gl_InstanceID + uRow0 against the spine texture, same as the original.

   Also confirmed in the same repro: a custom RawShaderMaterial's attributes must be bound through a
   geometry attribute literally named "position" — Three's non-indexed draw-count resolution (and
   evidently more than that) keys off geometry.attributes.position specifically, not whatever name a
   shader's own `in` variable uses. The ported FISH_VS below therefore declares `in vec2 position;`
   (not the original's `aPos`) and the geometry attribute is keyed "position" to match; aPart/aNorm
   keep their original names, which bind fine under any name as long as geometry key == GLSL name.

   Coordinate spaces: every fish's spine/mood lives in the SIM's own tank space (same raw units
   shared/ecology-sim.js already works in — x,y across sim.bounds, z/depth via f.cz, already scaled
   by that sim's own private tankDepth()). This module never transforms that data — it writes it into
   the spine texture exactly as the original writeSpines() does, then folds a tank-space -> world-space
   affine transform INTO the camera's view-projection matrix once per frame (see uVP below), so the
   ported FISH_VS's project() function does the remap for free. The affine's parameters (boundR,
   heightMin, heightMax) are supplied by the host scene via opts, matching the spirit of the
   tankToWorld()/worldToTank() helpers a Three.js host (e.g. World Scene.html) already owns for its
   other ecology plumbing (tower vortices, etc).

   API:
     EcologyRenderThree.create(renderer, scene, sim, opts) -> handle
       renderer: the host's THREE.WebGLRenderer (read-only; this module never calls methods on it
         that would fight the host's own render loop, it only needs renderer.getPixelRatio()).
       scene: the host's THREE.Scene — every species' InstancedMesh is added directly to it, so the
         host's own renderer.render(scene, camera) call draws creatures already correctly depth-tested
         against city/tower geometry, no extra render pass needed.
       sim: an EcologySim instance (shared/ecology-sim.js), already created/resized/populated by the
         host (same object the host already steps every frame).
       opts: { maxFish (per-species instance capacity, default 64), boundR (world-space horizontal
         half-extent, required), heightMin/heightMax (world-space Y band fish occupy, default 1.1/9.5) }.
       handle.update(dt, camera, controls) — advances the internal clock, re-sorts/re-packs the spine
         texture from the sim's CURRENT sim.fish (call this after EcologySim.step(), same order the
         original draw()/writeSpines() pair ran in), and updates per-species instance counts/uniforms.
         `controls` is optional (an OrbitControls-like object with `.target`), used only to compute a
         reasonable point-size reference distance; omit it and camera.position.length() is used.
       handle.dispose() — frees all GPU resources and removes every object this module added to scene.
*/
(function () {
  'use strict';

  const TEX_W = 24, K = 20;

  function b64(s, Type) {
    const bin = atob(s), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Type(u8.buffer);
  }

  // Port of Cybernetic Ecology.html's buildOutline(): walks a fill mesh's triangle edges and keeps
  // only edges used by exactly one triangle (the true silhouette boundary), extruding each into a
  // 2-triangle width-ribbon for species that ship no dedicated stroke/outline geometry of their own.
  function buildOutline(fillV, fillI) {
    const edgeCount = new Map(), edgeAB = new Map();
    const addEdge = (a, b) => {
      const k = a < b ? a + ',' + b : b + ',' + a;
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
      if (!edgeAB.has(k)) edgeAB.set(k, [a, b]);
    };
    for (let t = 0; t < fillI.length; t += 3) {
      const a = fillI[t], b = fillI[t + 1], c = fillI[t + 2];
      addEdge(a, b); addEdge(b, c); addEdge(c, a);
    }
    const verts = [], idx = [];
    for (const [k, cnt] of edgeCount) {
      if (cnt !== 1) continue;
      const [ia, ib] = edgeAB.get(k);
      const ax = fillV[ia * 3], ay = fillV[ia * 3 + 1], ap = fillV[ia * 3 + 2];
      const bx = fillV[ib * 3], by = fillV[ib * 3 + 1], bp = fillV[ib * 3 + 2];
      let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const nx = -dy, ny = dx;
      const base = verts.length / 5;
      verts.push(ax, ay, nx, ny, ap, ax, ay, -nx, -ny, ap, bx, by, nx, ny, bp, bx, by, -nx, -ny, bp);
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    return { v: new Float32Array(verts), i: new Uint16Array(idx) };
  }

  // tankDepth(): deliberately duplicated (not imported) from shared/ecology-sim.js's own private
  // tankDepth(), same reasoning its header gives for duplicating K/WORLD_SCALE — a one-line derived
  // quantity, not worth adding a new export to a file this merge otherwise leaves unmodified.
  function tankDepthOf(sim) {
    const b = sim.bounds;
    return Math.max(60, Math.min(b.w, b.h) * 0.9 * sim.cfg.dz);
  }

  // ---------- ported GLSL (verbatim from Cybernetic Ecology.html except: the leading "#version 300
  // es" line is stripped, since THREE.RawShaderMaterial + glslVersion:THREE.GLSL3 prepends its own;
  // the position attribute is renamed aPos -> position (see file header); uZScale/uRes are omitted
  // from FISH_VS, confirmed dead in the original; uShift/uShiftX are always 0 here, no side-dock
  // recentering needed) ----------
  const SP3 = `
uniform mat4 uVP;
uniform vec3 uCam;
uniform float uShift, uShiftX, uRefDist, uWing;
vec4 S4(int i) { return texelFetch(uSpine, ivec2(clamp(i, 0, K - 1), gl_InstanceID + uRow0), 0); }
vec3 S(int i) { return S4(i).xyz; }
vec3 tanAt(int i) { return normalize(S(i + 1) - S(i - 1) + vec3(1e-5, 0.0, 0.0)); }
void frame3(float s, out vec3 P, out vec3 T, out vec3 L, out vec3 U) {
  float f = s * float(K - 1);
  int i0 = clamp(int(floor(f)), 0, K - 2);
  float t = clamp(f - float(i0), 0.0, 1.0);
  vec4 a = S4(i0), b = S4(i0 + 1);
  P = a.xyz + (b.xyz - a.xyz) * t;
  T = normalize(mix(tanAt(i0), tanAt(i0 + 1), t));
  float roll = mix(a.w, b.w, t);
  vec3 L0 = normalize(vec3(T.y, -T.x, 0.0) + vec3(1e-6, 0.0, 0.0));
  vec3 U0 = normalize(cross(T, L0)); if (U0.z > 0.0) U0 = -U0;
  float c = cos(roll), sn = sin(roll);
  L = L0 * c + U0 * sn; U = -L0 * sn + U0 * c;
}
vec4 project(vec3 w) { vec4 c = uVP * vec4(w, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w; return c; }
`;

  const FISH_VS = `
precision highp float;
precision highp sampler2D;
in vec2 position;
in float aPart;
in vec2 aNorm;
uniform sampler2D uSpine, uParts;
uniform float uBY0, uLEN, uLineW, uLayer, uTime, uPtSize;
uniform int uRow0, uKeyN;
uniform vec4 uKeyT;
out float vG; out float vBright; out float vDim; out float vAng; out float vS; out float vAlert; out float vFace;
const int K = ${K};
int row() { return gl_InstanceID + uRow0; }
vec4 PT(int i, int c) { return texelFetch(uParts, ivec2(c, i), 0); }
${SP3}
vec2 rot(vec2 p, vec2 c, float a) { vec2 d = p - c; float cs = cos(a), sn = sin(a); return c + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs); }
bool rigid(float g) { return (g > 1.5 && g < 2.5) || g > 3.5; }
float keyed(vec4 k, float u) {
  if (uKeyN == 0) return 0.0;
  if (uKeyN == 1) return k.x;
  int n = uKeyN, i1 = 0;
  for (int i = 0; i < 4; i++) { if (i < n && uKeyT[i] <= u) i1 = i + 1; }
  int i0 = (i1 + n - 1) % n; i1 = i1 % n;
  float t0 = uKeyT[i0], t1 = uKeyT[i1];
  float span = t1 - t0; if (span <= 0.0) span += 1.0;
  float f = u - t0; if (f < 0.0) f += 1.0;
  float e = 0.5 - 0.5 * cos(3.14159265 * clamp(f / span, 0.0, 1.0));
  return mix(k[i0], k[i1], e);
}
float partAngle(int i, float ph, float d, vec4 mood, vec4 mood2) {
  vec4 A = PT(i, 0), R = PT(i, 2);
  float side = A.y == 0.0 ? 1.0 : A.y, g = A.x;
  float tuck = mood.x, turn = mood.y, puff = mood.z, glide = mood2.x, flap = mood2.y;
  float beat;
  if (g < 2.5) beat = R.x * sin(ph * 0.7 - R.y - d * 0.004) * smoothstep(0.0, 300.0, d);
  else beat = R.x * flap * sin(ph * 0.5 - R.y - d * 0.0009);
  float fold = abs(A.y) * side * (0.65 * tuck + 0.45 * max(0.0, turn * side) - 0.3 * glide - 0.55 * puff);
  float u = fract(ph * 0.5 / 6.2831853);
  return beat + keyed(PT(i, 3), u) + (g < 2.5 ? fold * 0.4 : fold);
}
void main() {
  int pi = int(aPart + 0.5);
  vec4 A = PT(pi, 0), B = PT(pi, 1), R = PT(pi, 2);
  vec4 prm = texelFetch(uSpine, ivec2(K, row()), 0);
  vec4 mood = texelFetch(uSpine, ivec2(K + 1, row()), 0);
  vec4 mood2 = texelFetch(uSpine, ivec2(K + 2, row()), 0);
  float grp = A.x;
  float ph = prm.x, sc = prm.z * (1.0 + 0.45 * mood.z);
  vec2 p = position + aNorm * (uLineW / sc);
  vec3 w, Uf; float ang = 0.0;
  if (rigid(grp)) {
    vec2 anc = A.zw;
    float d = distance(p, anc);
    ang = partAngle(pi, ph, d, mood, mood2);
    float lift = clamp((grp < 2.5 ? 0.5 : 2.2) * abs(R.x) * mood2.y * sin(ph * 0.5 - R.y - d * 0.0009) * (0.25 + 1.2 * uWing)
               + uWing * (0.25 * mood2.x - 0.45 * mood.x), -1.1, 1.1);
    p = rot(p, anc, ang * (1.0 - 0.55 * uWing));
    int j = R.z < -0.5 ? -1 : int(R.z + 0.5);
    for (int n = 0; n < 3; n++) {
      if (j < 0) break;
      vec4 Aj = PT(j, 0), Rj = PT(j, 2);
      float aj = partAngle(j, ph, distance(p, Aj.zw), mood, mood2);
      p = rot(p, Aj.zw, aj); ang += aj;
      j = Rj.z < -0.5 ? -1 : int(Rj.z + 0.5);
    }
    vec3 P, T, L, U; frame3((R.w - uBY0) / uLEN, P, T, L, U);
    float dx = (p.x - anc.x) * sc;
    float liftDisp = clamp(abs(dx) * sin(lift), -uLEN * sc * 0.6, uLEN * sc * 0.6);
    w = P + L * (anc.x * sc + dx * cos(lift)) + U * liftDisp + T * (p.y - R.w) * sc;
    Uf = normalize(U * cos(lift) - L * sign(dx) * sin(lift));
  } else {
    vec3 P, T, L, U; frame3((p.y - uBY0) / uLEN, P, T, L, U);
    w = P + L * p.x * sc; Uf = U;
  }
  gl_Position = project(w);
  gl_Position.z -= (aPart * 2.0 + uLayer) * 1.5e-6 * gl_Position.w;
  vFace = abs(dot(Uf, normalize(uCam - w)));
  vDim = prm.w; vAng = ang; vS = (position.y - uBY0) / uLEN; vAlert = mood.w;
  vG = clamp((position.y - B.x) / max(1.0, B.y - B.x), 0.0, 1.0);
  vBright = pow(max(0.0, sin(float(gl_VertexID) * 0.023 - uTime * 2.6 + prm.y)), 18.0);
  gl_PointSize = max(1.5, uPtSize * (0.6 + 1.4 * vBright) * uRefDist / max(1.0, gl_Position.w));
}`;

  const FILM = `
vec3 film(float t) {
  t = fract(t);
  if (uIrisMode < 0.5) return 0.74 + 0.26 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
  if (uIrisMode < 1.5) {
    vec3 a = vec3(0.35, 0.9, 1.0), b = vec3(0.58, 0.48, 1.0), c = vec3(1.0, 0.5, 0.86), d = vec3(1.0, 0.66, 0.3);
    float s = t * 4.0;
    return s < 1.0 ? mix(a, b, s) : (s < 2.0 ? mix(b, c, s - 1.0) : (s < 3.0 ? mix(c, d, s - 2.0) : mix(d, a, s - 3.0)));
  }
  vec3 a = vec3(0.1, 0.95, 0.95), b = vec3(0.2, 0.35, 1.0), c = vec3(1.0, 0.15, 0.8);
  return t < 0.333 ? mix(a, b, t * 3.0) : (t < 0.666 ? mix(b, c, (t - 0.333) * 3.0) : mix(c, a, (t - 0.666) * 3.0));
}`;
  const IRIS = `
uniform float uIris, uTimeF, uIrisMode;
${FILM}
float irHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float irNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = irHash(i), b = irHash(i + vec2(1.0, 0.0)), c = irHash(i + vec2(0.0, 1.0)), d = irHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float irFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * irNoise(p); p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5; } return s; }
vec3 iris(vec3 c, float ang, float s, float seed) {
  float sp = fract(uTimeF * 0.12 + seed * 0.13) * 1.6 - 0.3;
  float band = exp(-pow((s - sp) * 6.0, 2.0));
  vec2 fq = vec2(ang * 0.8, s * 3.2) + vec2(uTimeF * 0.07, -uTimeF * 0.05) + seed * 5.0;
  float n = irFbm(fq);
  float th = ang * 1.4 + s * 0.9 - uTimeF * 0.05 + seed * 0.07 + band * 0.35 + (n - 0.5) * 0.9;
  vec3 f = film(th) * (0.75 + 0.6 * band);
  vec2 cell = floor(vec2(ang * 30.0, s * 60.0) + seed * 17.0);
  float gseed = irHash(cell);
  float tw = pow(0.5 + 0.5 * sin(uTimeF * (2.0 + gseed * 5.0) + gseed * 60.0), 8.0);
  f += step(0.975, gseed) * tw * 1.6;
  return mix(c, f * max(max(c.r, c.g), c.b) * 1.25, uIris * (0.55 + 0.45 * band));
}`;

  const VARYINGS_IN = `in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace;`;

  const FILL_FS = `
precision mediump float; ${VARYINGS_IN} uniform vec3 uColHi; out vec4 o;
${IRIS}
void main() { vec3 c = mix(vec3(0.169, 0.161, 0.165), vec3(0.051), vG) * (0.5 + 0.5 * vDim);
  c = mix(c, uColHi * 0.78, 0.52);
  c = mix(c, iris(c * 2.2, vAng, vS, 0.0) * 0.45, uIris * 0.35);
  c = mix(c, vec3(0.3, 0.06, 0.05), vAlert * 0.5); o = vec4(c * (0.8 + 0.4 * vFace), 1.0); }`;

  const LINE_FS = `
precision mediump float; ${VARYINGS_IN} uniform float uAlpha; uniform vec3 uColLo, uColHi; out vec4 o;
${IRIS}
void main() {
  vec3 c = mix(uColHi, uColLo, smoothstep(0.0, 0.55, vG));
  c = iris(c, vAng, vS, 0.0);
  c = mix(c, vec3(0.25, 0.42, 0.75), (1.0 - vDim) * 0.7);
  c = mix(c, vec3(1.0, 0.36, 0.3), vAlert * 0.75);
  o = vec4(c * uAlpha * vDim * (0.45 + 0.65 * vFace), 1.0); }`;

  // ---------- per-species geometry/texture setup, ported from Cybernetic Ecology.html's species
  // setup loop (fillVAO/lineVAO/partTex construction) ----------
  function buildSpeciesEntry(sp) {
    const fillV = b64(sp.fillV, Float32Array), fillI = b64(sp.fillI, Uint16Array);
    let lineV = b64(sp.lineV, Float32Array), lineI = b64(sp.lineI, Uint16Array);
    if (lineV.length === 0) { const outline = buildOutline(fillV, fillI); lineV = outline.v; lineI = outline.i; }

    const fillGeo = makeGeometry(fillV, fillI, 3, false);
    const lineGeo = makeGeometry(lineV, lineI, 5, true);

    const BY0 = sp.bounds[1], LEN = sp.bounds[3] - sp.bounds[1];
    const partTex = new THREE.DataTexture(new Float32Array(sp.partTex), 4, sp.parts, THREE.RGBAFormat, THREE.FloatType);
    partTex.minFilter = THREE.NearestFilter; partTex.magFilter = THREE.NearestFilter;
    partTex.generateMipmaps = false; partTex.needsUpdate = true;
    const keyT = new Float32Array(4); keyT.set(sp.keyT || []);
    const keyN = (sp.keyT || []).length;

    const h = window.EcologySpecies.HUE[sp.key];
    const hi = h ? h.hi : window.EcologySpecies.DEFAULT_COL_HI;
    const lo = (h && h.lo) || hi.map(v => v * 0.556);
    const glow = (h && h.glow) || 0;
    const wing = window.EcologySpecies.WING[sp.key] ?? 0.25;

    return {
      key: sp.key, fillGeo, lineGeo, BY0, LEN, partTex, keyT, keyN,
      colHi: new THREE.Color(hi[0], hi[1], hi[2]), colLo: new THREE.Color(lo[0], lo[1], lo[2]),
      glow, wing, fillCount: fillGeo.index.count, lineCount: lineGeo.index.count,
    };
  }

  function makeGeometry(verts, indices, stride, hasNorm) {
    const geo = new THREE.BufferGeometry();
    const ib = new THREE.InterleavedBuffer(verts, stride);
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 2, 0));
    if (hasNorm) {
      geo.setAttribute('aNorm', new THREE.InterleavedBufferAttribute(ib, 2, 2));
      geo.setAttribute('aPart', new THREE.InterleavedBufferAttribute(ib, 1, 4));
    } else {
      geo.setAttribute('aPart', new THREE.InterleavedBufferAttribute(ib, 1, 2));
    }
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6); // positions come from the
    // spine texture in the shader, not this local-space geometry — a real bounding sphere here would
    // be meaningless; a huge fixed one plus frustumCulled=false (set by the caller) keeps Three happy.
    return geo;
  }

  function sharedUniforms(spineTex) {
    return {
      uSpine: { value: spineTex },
      uVP: { value: new THREE.Matrix4() },
      uCam: { value: new THREE.Vector3() },
      uShift: { value: 0 }, uShiftX: { value: 0 }, uRefDist: { value: 1 },
      uTime: { value: 0 }, uTimeF: { value: 0 },
      uIris: { value: 1 }, uIrisMode: { value: 0 },
    };
  }

  function makeFishMaterial(vs, fs, shared, extra) {
    return new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vs, fragmentShader: fs,
      uniforms: Object.assign({}, shared, extra),
      side: THREE.DoubleSide, depthTest: true, depthWrite: true, transparent: false,
    });
  }

  function create(renderer, scene, sim, opts) {
    opts = opts || {};
    const maxFish = opts.maxFish || 64;
    // bl/LEN (the shader's own body-scale ratio) is derived from cfg.size, which ALSO drives the
    // simulation's own spatial scale (separation/sight radii etc, relative to sim.bounds) — so it
    // can't just be cranked up for a bigger-looking fish without also inflating those radii past the
    // tank's own size. visualScale is a render-only multiplier on top of that ratio, left at 1 (no
    // change) unless the host asks for a different creature-to-world scale.
    const visualScale = opts.visualScale ?? 1;
    const boundR = opts.boundR;
    const heightMin = opts.heightMin ?? 1.1, heightMax = opts.heightMax ?? 9.5;
    if (!boundR) throw new Error('EcologyRenderThree.create: opts.boundR is required');

    const SPECIES = window.EcologySpecies.SPECIES;

    const spineData = new Float32Array(TEX_W * maxFish * 4);
    const spineTex = new THREE.DataTexture(spineData, TEX_W, maxFish, THREE.RGBAFormat, THREE.FloatType);
    spineTex.minFilter = THREE.NearestFilter; spineTex.magFilter = THREE.NearestFilter;
    spineTex.generateMipmaps = false;

    const shared = sharedUniforms(spineTex);
    const group = new THREE.Group();
    group.frustumCulled = false;
    scene.add(group);

    const entries = SPECIES.map(sp => {
      const e = buildSpeciesEntry(sp);
      const commonExtra = {
        uParts: { value: e.partTex }, uBY0: { value: e.BY0 }, uLEN: { value: e.LEN },
        uKeyT: { value: new THREE.Vector4(e.keyT[0], e.keyT[1], e.keyT[2], e.keyT[3]) },
        uKeyN: { value: e.keyN }, uRow0: { value: 0 }, uWing: { value: 0 },
        uPtSize: { value: 1 },
      };
      e.lineMat = makeFishMaterial(FISH_VS, LINE_FS, shared, Object.assign({}, commonExtra,
        { uLineW: { value: 0.6 }, uLayer: { value: 1 }, uAlpha: { value: 0.9 },
          uColLo: { value: e.colLo }, uColHi: { value: e.colHi } }));
      e.lineMesh = new THREE.InstancedMesh(e.lineGeo, e.lineMat, maxFish);
      e.lineMesh.frustumCulled = false; e.lineMesh.count = 0;
      group.add(e.lineMesh);

      if (e.fillCount > 0) {
        e.fillMat = makeFishMaterial(FISH_VS, FILL_FS, shared, Object.assign({}, commonExtra,
          { uLineW: { value: 0 }, uLayer: { value: 0 }, uColHi: { value: e.colHi } }));
        e.fillMesh = new THREE.InstancedMesh(e.fillGeo, e.fillMat, maxFish);
        e.fillMesh.frustumCulled = false; e.fillMesh.count = 0;
        group.add(e.fillMesh);
      }

      return e;
    });

    // ---------- carcasses: real sim.carcasses state, rendered as a plain InstancedMesh (small
    // sphere, life-based scale/fade) — see file header for why the shader-based point-sprite look
    // (CARCASS_VS/CARCASS_FS) was dropped from this phase in favor of a known-working Three.js path.
    const MAX_CARCASS = 64;
    const carcassMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.08, 0),
      new THREE.MeshStandardMaterial({ color: 0x5a3828, roughness: 0.9, transparent: true }),
      MAX_CARCASS
    );
    carcassMesh.frustumCulled = false; carcassMesh.count = 0;
    group.add(carcassMesh);
    const carcassDummy = new THREE.Object3D();

    // ---------- tank-space <-> world-space affine, folded into uVP each frame ----------
    const tankToWorldM = new THREE.Matrix4();
    function rebuildTankToWorld() {
      const b = sim.bounds, td = tankDepthOf(sim);
      tankToWorldM.set(
        2 / b.w, 0, 0, -boundR,
        0, 0, (heightMax - heightMin) / td, heightMin,
        0, 2 / b.h, 0, -boundR,
        0, 0, 0, 1
      );
    }
    rebuildTankToWorld();

    let t = 0;
    const vp = new THREE.Matrix4();

    function worldToTank(worldPos) {
      const td = tankDepthOf(sim), b = sim.bounds;
      return {
        x: (worldPos.x / boundR + 1) * b.w / 2,
        y: (worldPos.z / boundR + 1) * b.h / 2,
        z: (worldPos.y - heightMin) / (heightMax - heightMin) * td,
      };
    }

    function update(dt, camera, controls) {
      t += dt;
      rebuildTankToWorld();
      camera.updateMatrixWorld(); // ensure matrixWorldInverse reflects THIS frame, not the last one

      // ---------- re-pack the spine texture, ported from writeSpines() (species-only sort: every
      // species gets exactly one contiguous run/mesh — the original's depth-banded multi-run split
      // was a batching nicety for its own per-run gl.uniform draw loop, not something an opaque,
      // depth-tested InstancedMesh needs; draw order doesn't affect a depth-tested result) ----------
      const fish = sim.fish;
      fish.sort((a, b) => a.sp - b.sp);
      const runs = [];
      for (let i = 0; i < fish.length; i++) {
        const last = runs[runs.length - 1];
        if (last && last.sp === fish[i].sp) last.n++; else runs.push({ sp: fish[i].sp, row0: i, n: 1 });
      }
      const n = Math.min(fish.length, maxFish);
      for (let i = 0; i < n; i++) {
        const f = fish[i], c = f.chain, row = i * TEX_W * 4;
        const e = entries[f.sp], sw = SPECIES[f.sp].swim;
        const bl = EcologySim.bodyLen(sim, f);
        const A = sim.cfg.wiggle * bl * sw.amp;
        for (let k = 0; k < K; k++) {
          const s = k / (K - 1);
          const k0 = Math.max(0, k - 1), k1 = Math.min(K - 1, k + 1);
          let tx = c[k1 * 2] - c[k0 * 2], ty = c[k1 * 2 + 1] - c[k0 * 2 + 1];
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const off = A * (0.12 + 0.88 * Math.pow(s, sw.ampPow)) * Math.sin(f.phase - s * Math.PI * 2 * sw.waves);
          spineData[row + k * 4] = c[k * 2] + ty * off;
          spineData[row + k * 4 + 1] = c[k * 2 + 1] - tx * off;
          spineData[row + k * 4 + 2] = f.cz[k];
          spineData[row + k * 4 + 3] = f.croll[k];
        }
        spineData[row + K * 4] = f.phase;
        spineData[row + K * 4 + 1] = f.seed;
        spineData[row + K * 4 + 2] = (bl / e.LEN) * visualScale;
        const lit = Math.max(e.glow, 1 - 0.8 * f.z);
        const beh = sim.speciesRT[f.sp].beh;
        const bk = (sim.cfg.beh === 'on' && beh.blink)
          ? 0.35 + 0.9 * Math.pow(0.5 + 0.5 * Math.sin(performance.now() * 0.001 * beh.blink + f.seed * 3), 3) : 1;
        const dim = lit * lit * (f.darkRoll < (sim.cfg.dark ?? 0.3) ? 0.09 : 1) * (1 - 0.85 * f.cloak) * bk * f.fade * (1 + 0.8 * f.gulp);
        // the original relies on its own dedicated glow pipeline (dim 0.22-alpha glow source, 2-pass
        // blur, soft-rolloff additive composite) to bring this same depth/shadow-darkened value back
        // up to a readable brightness — not ported here (glow is consolidated onto the host's shared
        // Tower Forge-style bloom instead, see world-scene merge plan). Without that compensation,
        // vDim this dim renders fish as nearly black. A floor keeps them visibly colored on their own,
        // not solely dependent on whatever the host's bloom pass happens to add back.
        spineData[row + K * 4 + 3] = Math.max(0.75, dim);
        spineData[row + (K + 1) * 4] = f.tuck; spineData[row + (K + 1) * 4 + 1] = f.turnS;
        spineData[row + (K + 1) * 4 + 2] = f.puff; spineData[row + (K + 1) * 4 + 3] = f.alert;
        spineData[row + (K + 2) * 4] = f.glide; spineData[row + (K + 2) * 4 + 1] = f.flap;
      }
      spineTex.needsUpdate = true;

      // ---------- camera uniforms (shared across every species material by reference) ----------
      vp.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(tankToWorldM);
      shared.uVP.value.copy(vp);
      const tc = worldToTank(camera.position);
      shared.uCam.value.set(tc.x, tc.y, tc.z);
      shared.uTime.value = t; shared.uTimeF.value = t;
      shared.uIris.value = sim.cfg.iris ?? 1; shared.uIrisMode.value = sim.cfg.irisMode ?? 0;
      shared.uRefDist.value = controls && controls.target ? camera.position.distanceTo(controls.target) : camera.position.length();

      // ---------- per-species instance counts + per-run uniforms ----------
      for (const e of entries) { e.lineMesh.count = 0; if (e.fillMesh) e.fillMesh.count = 0; }
      const sizeUnit = sim.cfg.size || 46;
      for (const r of runs) {
        const e = entries[r.sp];
        const wing = (e.wing || 0) * (sim.cfg.wings ?? 1);
        e.lineMat.uniforms.uRow0.value = r.row0; e.lineMat.uniforms.uWing.value = wing;
        // uLineW ends up scale-invariant against sc inside FISH_VS (the /sc and *sc cancel), i.e. it's
        // an absolute tank-space width — so it needs the same visualScale compensation prm.z got
        // above, or the stroke width shrinks to sub-pixel once the tank->world affine applies.
        e.lineMat.uniforms.uLineW.value = Math.max(0.35, Math.min(0.8, sizeUnit / 220)) * visualScale;
        e.lineMesh.count = Math.min(r.n, maxFish);

        if (e.fillMesh) {
          e.fillMat.uniforms.uRow0.value = r.row0; e.fillMat.uniforms.uWing.value = wing;
          // the original only falls back to the fill plate for species whose (post-synthesis) stroke
          // mesh ends up with zero vertices — a fully closed/sealed body with no silhouette boundary
          e.fillMesh.count = e.lineCount === 0 ? Math.min(r.n, maxFish) : 0;
        }
      }

      // ---------- carcasses ----------
      const carcasses = sim.carcasses, cn = Math.min(carcasses.length, MAX_CARCASS);
      const td = tankDepthOf(sim);
      for (let i = 0; i < cn; i++) {
        const c = carcasses[i];
        const w4 = new THREE.Vector4(c.x, c.y, c.z * td, 1).applyMatrix4(tankToWorldM);
        carcassDummy.position.set(w4.x, w4.y, w4.z);
        const fade = Math.min(1, c.life / 3);
        carcassDummy.scale.setScalar(0.6 + 0.4 * fade);
        carcassDummy.updateMatrix();
        carcassMesh.setMatrixAt(i, carcassDummy.matrix);
      }
      carcassMesh.count = cn;
      if (cn > 0) carcassMesh.instanceMatrix.needsUpdate = true;
    }

    function dispose() {
      scene.remove(group);
      for (const e of entries) {
        e.lineGeo.dispose(); e.lineMat.dispose();
        e.fillGeo.dispose(); if (e.fillMat) e.fillMat.dispose();
        e.partTex.dispose();
      }
      carcassMesh.geometry.dispose(); carcassMesh.material.dispose();
      spineTex.dispose();
    }

    return { update, dispose, group };
  }

  window.EcologyRenderThree = { create };
})();
