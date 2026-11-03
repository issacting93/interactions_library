/* INTERACTIONS — Ecology WebGL2 renderer.
   Extracted 2026-11-03 from "tools/fish-tool/Cybernetic Ecology.html" so Forge's Ecology screen
   (forge/web/ecology.html) can draw creatures with the real spine-rigged, iridescent-shaded,
   bloom-lit look instead of the flat 2D-canvas stand-in (shared/generators/creature-sprites.js,
   which stays — this is a third draw mode, not a replacement).

   Full-fidelity on the part that defines the look: the GLSL shaders (spine rig, thin-film iris
   shading, bloom blur/composite), the per-species VAO/texture upload, and the spine-texture write
   are copied verbatim/near-verbatim from the original. Species geometry (fillV/lineV/partTex/
   bounds) needs no separate porting — it already lives in shared/ecology/ecology-species.js
   (window.EcologySpecies), which shared/ecology/ecology-sim.js also already depends on.

   Deliberately NOT ported (scope cuts, not oversights):
     - The original's tilted/orbiting/follow tank camera (updateCamera, pickFollow, dock/drawer
       cover) and its pointer-drag/scroll-zoom controls. Forge's Ecology screen is a top-down city
       scene, not a free-standing tank viewer, so `frame()` here takes a flat `camera` config
       (worldW/worldH/tilt/yaw/zoom) and builds a near-top-down camera from it every call — same
       M4 perspective/look math as the original, just always near tilt=0 rather than following a
       UI's view-mode radios. A caller that wants the original's full tilt/orbit/follow experience
       back would need to port updateCamera separately; the camera math here is intentionally the
       simplified half.
     - Cloud mode (CLOUD_VS/CLOUD_FS, the point-formula alternate species rendering). This was the
       original's own default-off mode (S.mode starts 'sigil') — this module always renders the
       mesh/rig mode (sigil), the original's default look, so nothing the original shows by default
       is missing.
     - Seabed terrain relief (regenTerrain/marching-squares contour lines, SNOW_VS's uFloor===1
       branch). The marine-snow particle field (uFloor===0) is kept; it's the ambient depth cue,
       terrain is a separate background feature Forge's city scene already draws its own way.
     - The original's own on-screen threat HUD (hudBoxEl/hudProject/hudRect/hudPairs/hudUpdate).

   API (mirrors ecology-sim.js's create/resize/step shape on purpose):
     EcologyRender.create(canvas, ES, opts?) -> r
       canvas: an HTMLCanvasElement with no existing context on it (getContext('webgl2') is called
         here). ES: window.EcologySpecies-shaped object ({SPECIES, HUE, DEFAULT_COL_HI, ...}).
         opts.maxFish (default 600, must be >= the sim's own population cap) sizes the spine texture.
         opts.getColor(key) -> {hi:[r,g,b], lo?:[r,g,b], glow?:number} | null, called once per
         species at create() time, lets a caller's own per-species color overrides (e.g. Forge's
         Species Style Lab data via shared/generators/forge-overrides.js) replace the HUE table;
         returning null/undefined for a key falls back to ES.HUE exactly as the original did.
       Throws if WebGL2 is unavailable, same as the original (check before calling, or try/catch).
     EcologyRender.resize(r, pxW, pxH) — sets canvas.width/height to pxW/pxH (device pixels — the
       caller does its own devicePixelRatio math, this module does none) and (re)allocates the glow
       and trail framebuffers at that size. Call once up front and again whenever the canvas's
       device-pixel size should change; cheap compared to frame() but not free, don't call per-frame.
     EcologyRender.frame(r, { sim, time, worldW, worldH, camera, render }) — draws one frame to
       canvas's default framebuffer (transparent background — alpha:true, unlike the original's
       opaque alpha:false — so Forge can stack this canvas over its own 2D city-plan canvas).
       sim: an shared/ecology/ecology-sim.js EcologySim instance (same sim the caller is step()ing).
       time: seconds, matching the `t` the original's draw(t) received (iris shift, blink, etc).
       worldW/worldH: the world-unit size to frame (pass sim.bounds.w/h for "frame the whole tank").
       camera: optional {tilt=10, yaw=0, zoom=1} in degrees/degrees/scale. tilt=0 is a dead-flat
         top-down view; a few degrees keeps a trace of the original's dimensionality without
         fighting a top-down composite.
       render: optional per-call overrides, all matching the original S.* fields of the same name:
         {glow=1.2, iris=0.95, shimmer=0.1, trail=0, dark=0.3, wings=1, snow=true, carcasses=true}.
         dark/glow/iris/shimmer/trail/density were page-UI fields on the original's S object
         alongside the sim-contract fields (size/speed/beh/...) but were never read by
         shared/ecology/ecology-sim.js — they're pure rendering knobs, which is why they're passed
         here instead of expected on sim.cfg.
   Known pinned constant, duplicated with ecology-sim.js on purpose (see that file's own header for
   why): K = 20 spine points per fish.
*/
(function () {
  'use strict';

  const K = 20;
  const TEX_W = 24;
  const DEG = Math.PI / 180;

  function b64(s, Type) { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Type(u8.buffer); }

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

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
  const FISH_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location=0) in vec2 aPos;
layout(location=1) in float aPart;
layout(location=2) in vec2 aNorm;
uniform sampler2D uSpine, uParts;
uniform vec2 uRes;
uniform float uBY0, uLEN, uLineW, uZScale, uLayer, uTime, uPtSize;
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
  vec2 p = aPos + aNorm * (uLineW / sc);
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
  vDim = prm.w; vAng = ang; vS = (aPos.y - uBY0) / uLEN; vAlert = mood.w;
  vG = clamp((aPos.y - B.x) / max(1.0, B.y - B.x), 0.0, 1.0);
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
  const FILL_FS = `#version 300 es
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; uniform vec3 uColHi; out vec4 o;
${IRIS}
void main() { vec3 c = mix(vec3(0.169, 0.161, 0.165), vec3(0.051), vG) * (0.5 + 0.5 * vDim);
  c = mix(c, uColHi * 0.78, 0.52);
  c = mix(c, iris(c * 2.2, vAng, vS, 0.0) * 0.45, uIris * 0.35);
  c = mix(c, vec3(0.3, 0.06, 0.05), vAlert * 0.5); o = vec4(c * (0.8 + 0.4 * vFace), 1.0); }`;
  const LINE_FS = `#version 300 es
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; uniform float uAlpha; uniform vec3 uColLo, uColHi; out vec4 o;
${IRIS}
void main() {
  vec3 c = mix(uColHi, uColLo, smoothstep(0.0, 0.55, vG));
  c = iris(c, vAng, vS, 0.0);
  c = mix(c, vec3(0.25, 0.42, 0.75), (1.0 - vDim) * 0.7);
  c = mix(c, vec3(1.0, 0.36, 0.3), vAlert * 0.75);
  o = vec4(c * uAlpha * vDim * (0.45 + 0.65 * vFace), 1.0); }`;
  const PT_FS = `#version 300 es
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; uniform float uAlpha; uniform vec3 uColHi; out vec4 o;
${IRIS}
void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
  vec3 c = mix(iris(uColHi, vAng, vS, 0.0), vec3(1.0, 0.5, 0.4), vAlert * 0.7);
  o = vec4(c * a * vBright * uAlpha * 0.6 * vDim, 1.0); }`;
  const QUAD_VS = `#version 300 es
out vec2 vUv; void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const BLUR_FS = `#version 300 es
precision mediump float; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.227;
  c += (texture(uTex, vUv + uDir * 1.385).rgb + texture(uTex, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture(uTex, vUv + uDir * 3.231).rgb + texture(uTex, vUv - uDir * 3.231).rgb) * 0.070;
  o = vec4(c, 1.0);
}`;
  const COMP_FS = `#version 300 es
precision mediump float; in vec2 vUv; uniform sampler2D uTex; uniform float uGain; out vec4 o;
void main() { o = vec4(texture(uTex, vUv).rgb * uGain, texture(uTex, vUv).a); }`;
  const GLOW_COMP_FS = `#version 300 es
precision mediump float; in vec2 vUv; uniform sampler2D uTex; uniform float uGain; out vec4 o;
void main() { vec3 c = texture(uTex, vUv).rgb * uGain; o = vec4(c / (1.0 + c), 1.0); }`;
  const FADE_FS = `#version 300 es
precision mediump float; uniform vec4 uColor; out vec4 o;
void main() { o = uColor; }`;

  const SNOW_N = 2200, FLOOR_C = 56, FLOOR_R = 36;
  const SNOW_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform mat4 uVP; uniform float uShift, uShiftX, uRefDist, uTime, uPx, uRelief; uniform vec3 uTank; uniform int uFloor;
uniform sampler2D uHeight;
out float vA;
float h(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  float id = float(gl_VertexID); vec3 p;
  if (uFloor == 1) {
    float cx = mod(id, ${FLOOR_C}.0), cy = floor(id / ${FLOOR_C}.0);
    float hgt = texelFetch(uHeight, ivec2(int(cx), int(cy)), 0).r;
    p = vec3((cx + 0.5) / ${FLOOR_C}.0 * uTank.x, (cy + 0.5) / ${FLOOR_R}.0 * uTank.y, uTank.z * (1.0 - hgt * uRelief));
    vA = 0.16 * (0.6 + 0.4 * h(id)) + 0.22 * hgt;
  } else {
    p = vec3(h(id) * uTank.x, h(id + 1.31) * uTank.y, mod(h(id + 2.71) * uTank.z + uTime * (4.0 + 6.0 * h(id + 7.0)), uTank.z));
    p.xy += vec2(sin(uTime * 0.13 + id), cos(uTime * 0.11 + id * 1.7)) * 18.0;
    vA = (0.08 + 0.22 * h(id + 5.0)) * (1.0 - 0.6 * p.z / uTank.z);
  }
  vec4 c = uVP * vec4(p, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w;
  gl_Position = c;
  gl_PointSize = uPx * (uFloor == 1 ? 1.6 : 1.0 + 1.4 * h(id + 9.0)) * uRefDist / max(1.0, c.w);
}`;
  const SNOW_FS = `#version 300 es
precision mediump float; in float vA; out vec4 o;
void main() { float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)); vec3 col = vec3(0.45, 0.85, 0.78); o = vec4(col * vA * a, vA * a); }`;

  const CARCASS_VS = `#version 300 es
uniform mat4 uVP; uniform float uShift, uShiftX, uRefDist, uPx, uLife; uniform vec3 uPos;
out float vA;
void main() {
  vec4 c = uVP * vec4(uPos, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w;
  gl_Position = c;
  gl_PointSize = uPx * (1.0 + 0.25 * sin(uLife * 3.0)) * uRefDist / max(1.0, c.w);
  vA = clamp(uLife / 3.0, 0.0, 1.0);
}`;
  const CARCASS_FS = `#version 300 es
precision mediump float; in float vA; out vec4 o;
void main() { float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
  vec3 col = vec3(0.58, 0.24, 0.17);
  o = vec4(col * vA * a, vA * a); }`;

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
  function makeVAO(gl, verts, stride, hasNorm, indices) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const F = 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride * F, 0);
    if (hasNorm) {
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride * F, 2 * F);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride * F, 4 * F);
    } else {
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride * F, 2 * F);
      gl.disableVertexAttribArray(2); gl.vertexAttrib2f(2, 0, 0);
    }
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: indices.length };
  }
  function target(gl, w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  const M4 = {
    persp(fy, a, n, f) { const t = 1 / Math.tan(fy / 2), r = 1 / (n - f); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + f) * r, -1, 0, 0, 2 * n * f * r, 0]; },
    look(e, c, up) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
    },
    mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = v; } return o; },
  };

  function buildSpeciesEntry(gl, sp, ES, opts) {
    const fillV = b64(sp.fillV, Float32Array), fillI = b64(sp.fillI, Uint16Array);
    let lineV = b64(sp.lineV, Float32Array), lineI = b64(sp.lineI, Uint16Array);
    if (lineV.length === 0) { const outline = buildOutline(fillV, fillI); lineV = outline.v; lineI = outline.i; }
    const ptsI = []; for (let i = 0; i < lineV.length / 5; i += 26) ptsI.push(i);
    const fillVAO = makeVAO(gl, fillV, 3, false, fillI);
    const lineVAO = makeVAO(gl, lineV, 5, true, lineI);
    const ptsVAO = makeVAO(gl, lineV, 5, true, new Uint16Array(ptsI));
    const BY0 = sp.bounds[1], LEN = sp.bounds[3] - sp.bounds[1];
    const partTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, partTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, sp.parts, 0, gl.RGBA, gl.FLOAT, new Float32Array(sp.partTex));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const keyT = new Float32Array(4); keyT.set(sp.keyT || []); const keyN = (sp.keyT || []).length;
    const override = opts.getColor ? opts.getColor(sp.key) : null;
    const hue = ES.HUE[sp.key];
    const colHi = (override && override.hi) || (hue ? hue.hi : ES.DEFAULT_COL_HI);
    const colLo = (override && override.lo) || (hue && hue.lo) || colHi.map((v) => v * 0.556);
    const glow = (override && override.glow != null ? override.glow : (hue && hue.glow)) || 0;
    return { key: sp.key, fillVAO, lineVAO, ptsVAO, BY0, LEN, keyT, keyN, partTex, colHi, colLo, glow, wing: (ES.WING && ES.WING[sp.key]) || 0.25 };
  }

  // ES.SPECIES grows at runtime in Forge (bred/captured variants are pushed on after create()),
  // so species GPU resources are built lazily here rather than only once at create time.
  function syncSpecies(r) {
    while (r.species.length < r.ES.SPECIES.length) r.species.push(buildSpeciesEntry(r.gl, r.ES.SPECIES[r.species.length], r.ES, r.opts));
  }

  function create(canvas, ES, opts) {
    opts = opts || {};
    const maxFish = opts.maxFish || 600;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, depth: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 unavailable');

    const snowProg = program(gl, SNOW_VS, SNOW_FS);
    const carcassProg = program(gl, CARCASS_VS, CARCASS_FS);
    const fillProg = program(gl, FISH_VS, FILL_FS);
    const lineProg = program(gl, FISH_VS, LINE_FS);
    const ptProg = program(gl, FISH_VS, PT_FS);
    const blurProg = program(gl, QUAD_VS, BLUR_FS);
    const compProg = program(gl, QUAD_VS, COMP_FS);
    const glowCompProg = program(gl, QUAD_VS, GLOW_COMP_FS);
    const fadeProg = program(gl, QUAD_VS, FADE_FS);
    const quadVAO = gl.createVertexArray();

    const species = ES.SPECIES.map((sp) => buildSpeciesEntry(gl, sp, ES, opts));

    const spineData = new Float32Array(TEX_W * maxFish * 4);
    const spineTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, spineTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEX_W, maxFish, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    return {
      gl, canvas, ES, opts, species, maxFish, spineData, spineTex, quadVAO,
      snowProg, carcassProg, fillProg, lineProg, ptProg, blurProg, compProg, glowCompProg, fadeProg,
      glowA: null, glowB: null, trailBuf: null, dummyHeight: null,
    };
  }

  function resize(r, pxW, pxH) {
    const gl = r.gl;
    r.canvas.width = Math.max(1, Math.round(pxW)); r.canvas.height = Math.max(1, Math.round(pxH));
    for (const t of [r.glowA, r.glowB, r.trailBuf]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); if (t.depth) gl.deleteRenderbuffer(t.depth); }
    const gw = Math.max(1, Math.round(r.canvas.width / 4)), gh = Math.max(1, Math.round(r.canvas.height / 4));
    r.glowA = target(gl, gw, gh); r.glowB = target(gl, gw, gh);
    r.trailBuf = target(gl, r.canvas.width, r.canvas.height);
    r.trailBuf.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, r.trailBuf.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, r.canvas.width, r.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.trailBuf.fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, r.trailBuf.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!r.dummyHeight) {
      r.dummyHeight = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, r.dummyHeight);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
  }

  function writeSpines(r, sim, time, opt) {
    syncSpecies(r);
    const { ES } = r, SPECIES = ES.SPECIES;
    for (const f of sim.fish) f.band = Math.floor(f.z * 8);
    sim.fish.sort((a, b) => (b.band - a.band) || (a.sp - b.sp) || (b.z - a.z));
    const runs = [];
    for (let i = 0; i < sim.fish.length; i++) {
      const last = runs[runs.length - 1];
      if (last && last.sp === sim.fish[i].sp) last.n++; else runs.push({ sp: sim.fish[i].sp, row0: i, n: 1 });
    }
    const n = Math.min(sim.fish.length, r.maxFish);
    for (let i = 0; i < n; i++) {
      const f = sim.fish[i], c = f.chain, row = i * TEX_W * 4;
      const sw = SPECIES[f.sp].swim, bl = window.EcologySim.bodyLen(sim, f), A = opt.wiggle * bl * sw.amp;
      for (let k = 0; k < K; k++) {
        const s = k / (K - 1);
        const k0 = Math.max(0, k - 1), k1 = Math.min(K - 1, k + 1);
        let tx = c[k1 * 2] - c[k0 * 2], ty = c[k1 * 2 + 1] - c[k0 * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const off = A * (0.12 + 0.88 * Math.pow(s, sw.ampPow)) * Math.sin(f.phase - s * Math.PI * 2 * sw.waves);
        r.spineData[row + k * 4] = c[k * 2] + ty * off;
        r.spineData[row + k * 4 + 1] = c[k * 2 + 1] - tx * off;
        r.spineData[row + k * 4 + 2] = f.cz[k];
        r.spineData[row + k * 4 + 3] = f.croll[k];
      }
      const rsp = r.species[f.sp];
      r.spineData[row + K * 4] = f.phase;
      r.spineData[row + K * 4 + 1] = f.seed;
      r.spineData[row + K * 4 + 2] = bl / rsp.LEN;
      { const lit = Math.max(rsp.glow, 1 - 0.8 * f.z);
        const beh = sim.speciesRT[f.sp].beh;
        const bk = opt.beh === 'on' && beh && beh.blink ? 0.35 + 0.9 * Math.pow(0.5 + 0.5 * Math.sin(time * beh.blink + f.seed * 3), 3) : 1;
        r.spineData[row + K * 4 + 3] = lit * lit * (f.darkRoll < opt.dark ? 0.09 : 1) * (1 - 0.85 * f.cloak) * bk * f.fade * (1 + 0.8 * f.gulp); }
      r.spineData[row + (K + 1) * 4] = f.tuck; r.spineData[row + (K + 1) * 4 + 1] = f.turnS;
      r.spineData[row + (K + 1) * 4 + 2] = f.puff; r.spineData[row + (K + 1) * 4 + 3] = f.alert;
      r.spineData[row + (K + 2) * 4] = f.glide; r.spineData[row + (K + 2) * 4 + 1] = f.flap;
    }
    const gl = r.gl;
    gl.bindTexture(gl.TEXTURE_2D, r.spineTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, Math.max(1, n), gl.RGBA, gl.FLOAT, r.spineData, 0);
    return runs;
  }

  function buildCamera(worldW, worldH, worldD, pxW, pxH, cfg) {
    const tilt = (cfg.tilt ?? 10) * DEG, yaw = (cfg.yaw ?? 0) * DEG, zoom = cfg.zoom || 1;
    const fov = 40 * DEG, aspect = pxW / Math.max(1, pxH);
    const frameDist = Math.max((worldH / 2) / Math.tan(fov / 2), (worldW / 2) / (Math.tan(fov / 2) * aspect)) * 1.08;
    const dist = frameDist / zoom;
    const c = [worldW / 2, worldH / 2, worldD * 0.45];
    const eye = [c[0] + Math.sin(yaw) * Math.sin(tilt) * dist, c[1] + Math.cos(yaw) * Math.sin(tilt) * dist, c[2] - Math.cos(tilt) * dist];
    const view = M4.look(eye, c, [-Math.sin(yaw), -Math.cos(yaw), -0.25]);
    const proj = M4.persp(fov, aspect, dist * 0.1, Math.max(dist, frameDist) * 4 + worldD * 2);
    return { vp: M4.mul(proj, view), eye, shift: 0, shiftX: 0, refDist: frameDist };
  }

  function camUniforms(gl, u, cam, irisMode) {
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uCam, cam.eye);
    gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX); gl.uniform1f(u.uRefDist, cam.refDist);
    if (u.uIrisMode) gl.uniform1f(u.uIrisMode, irisMode || 0);
  }

  function frame(r, opt) {
    const gl = r.gl, sim = opt.sim, t = opt.time;
    const render = Object.assign({ glow: 1.2, iris: 0.95, shimmer: 0.1, trail: 0, dark: 0.3, wings: 1, snow: true, carcasses: true, irisMode: 0 }, opt.render || {});
    const camCfg = opt.camera || {};
    const worldD = Math.max(60, Math.min(opt.worldW, opt.worldH) * 0.9 * (sim.cfg.dz ?? 0.8));
    const cam = buildCamera(opt.worldW, opt.worldH, worldD, r.canvas.width, r.canvas.height, camCfg);
    const dpr = opt.dpr || 1;

    const runs = writeSpines(r, sim, t, { wiggle: sim.cfg.wiggle ?? 0.03, beh: sim.cfg.beh ?? 'on', dark: render.dark });

    const common = (prog, lineW, layer) => {
      gl.useProgram(prog.p);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, r.spineTex); gl.uniform1i(prog.u.uSpine, 1);
      gl.uniform2f(prog.u.uRes, r.canvas.width, r.canvas.height); camUniforms(gl, prog.u, cam, render.irisMode);
      gl.uniform1f(prog.u.uLineW, lineW); gl.uniform1f(prog.u.uLayer, layer);
      gl.uniform1f(prog.u.uZScale, 1 / (r.maxFish * 256 + 4));
      gl.uniform1f(prog.u.uTime, t);
      if (prog.u.uIris) { gl.uniform1f(prog.u.uIris, render.iris); gl.uniform1f(prog.u.uTimeF, t); }
      if (prog.u.uPtSize) gl.uniform1f(prog.u.uPtSize, Math.max(1.5, (sim.cfg.size || 70) / 45) * dpr);
    };
    const fishPass = (prog, which, mode, filter) => {
      for (const run of runs) {
        const sp = r.species[run.sp], vao = sp[which];
        if (!vao.count || (filter && !filter(sp))) continue;
        gl.uniform1f(prog.u.uBY0, sp.BY0); gl.uniform1f(prog.u.uLEN, sp.LEN);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sp.partTex); gl.uniform1i(prog.u.uParts, 2);
        gl.uniform4fv(prog.u.uKeyT, sp.keyT); gl.uniform1i(prog.u.uKeyN, sp.keyN);
        gl.uniform1i(prog.u.uRow0, run.row0); gl.uniform1f(prog.u.uWing, sp.wing * render.wings);
        if (prog.u.uColLo) gl.uniform3fv(prog.u.uColLo, sp.colLo);
        if (prog.u.uColHi) gl.uniform3fv(prog.u.uColHi, sp.colHi);
        gl.bindVertexArray(vao.vao);
        gl.drawElementsInstanced(mode, vao.count, gl.UNSIGNED_SHORT, 0, run.n);
      }
    };

    if (render.glow > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, r.glowA.fb); gl.viewport(0, 0, r.glowA.w, r.glowA.h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.blendEquation(gl.MAX);
      common(r.lineProg, 1.3, 1); gl.uniform1f(r.lineProg.u.uAlpha, 0.22);
      fishPass(r.lineProg, 'lineVAO', gl.TRIANGLES);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
      gl.useProgram(r.blurProg.p); gl.bindVertexArray(r.quadVAO); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(r.blurProg.u.uTex, 0);
      for (let pass = 0; pass < 2; pass++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, r.glowB.fb); gl.bindTexture(gl.TEXTURE_2D, r.glowA.tex);
        gl.uniform2f(r.blurProg.u.uDir, (1 + pass) / r.glowA.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, r.glowA.fb); gl.bindTexture(gl.TEXTURE_2D, r.glowB.tex);
        gl.uniform2f(r.blurProg.u.uDir, 0, (1 + pass) / r.glowA.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, r.trailBuf.fb); gl.viewport(0, 0, r.canvas.width, r.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    if (render.trail <= 0) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(r.fadeProg.p); gl.bindVertexArray(r.quadVAO);
      gl.uniform4f(r.fadeProg.u.uColor, 0, 0, 0, Math.max(0.02, 1 - render.trail));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
    common(r.lineProg, Math.max(0.35, Math.min(0.8, (sim.cfg.size || 70) / 220)), 1); gl.uniform1f(r.lineProg.u.uAlpha, 0.9);
    fishPass(r.lineProg, 'lineVAO', gl.TRIANGLES);
    common(r.fillProg, 0, 0);
    fishPass(r.fillProg, 'fillVAO', gl.TRIANGLES, (sp) => sp.lineVAO.count === 0);

    if (render.snow) {
      const u = r.snowProg.u;
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(r.snowProg.p); gl.bindVertexArray(r.quadVAO);
      gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX); gl.uniform1f(u.uRefDist, cam.refDist);
      gl.uniform1f(u.uTime, t); gl.uniform1f(u.uPx, 1.6 * dpr); gl.uniform3f(u.uTank, opt.worldW, opt.worldH, worldD); gl.uniform1f(u.uRelief, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, r.dummyHeight); gl.uniform1i(u.uHeight, 0);
      gl.uniform1i(u.uFloor, 0); gl.drawArrays(gl.POINTS, 0, SNOW_N);
      gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
    }
    if (render.carcasses && sim.carcasses.length) {
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(r.carcassProg.p); gl.bindVertexArray(r.quadVAO);
      const cu = r.carcassProg.u;
      gl.uniformMatrix4fv(cu.uVP, false, cam.vp); gl.uniform1f(cu.uShift, cam.shift); gl.uniform1f(cu.uShiftX, cam.shiftX); gl.uniform1f(cu.uRefDist, cam.refDist);
      gl.uniform1f(cu.uPx, 9 * dpr);
      for (const c of sim.carcasses) { gl.uniform3f(cu.uPos, c.x, c.y, c.z * worldD); gl.uniform1f(cu.uLife, c.life); gl.drawArrays(gl.POINTS, 0, 1); }
      gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
    }
    if (render.shimmer > 0) {
      gl.depthMask(false); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      common(r.ptProg, 0, 1); gl.uniform1f(r.ptProg.u.uAlpha, render.shimmer);
      fishPass(r.ptProg, 'ptsVAO', gl.POINTS);
    }
    if (render.glow > 0) {
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(r.glowCompProg.p); gl.bindVertexArray(r.quadVAO);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, r.glowA.tex);
      gl.uniform1i(r.glowCompProg.u.uTex, 0); gl.uniform1f(r.glowCompProg.u.uGain, render.glow * 1.1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND); gl.depthMask(true);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, r.canvas.width, r.canvas.height);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(r.compProg.p); gl.bindVertexArray(r.quadVAO);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, r.trailBuf.tex);
    gl.uniform1i(r.compProg.u.uTex, 0); gl.uniform1f(r.compProg.u.uGain, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  window.EcologyRender = { create, resize, frame };
})();
