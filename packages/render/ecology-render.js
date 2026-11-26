/* INTERACTIONS — Ecology WebGL2 renderer.
   Extracted 2026-11-03 from "world/forges/fish-tool/Cybernetic Ecology.html" so Forge's Ecology screen
   (world/forge/web/ecology.html) can draw creatures with the real spine-rigged, iridescent-shaded,
   bloom-lit look instead of the flat 2D-canvas stand-in (packages/motion/creature-sprites.js,
   which stays — this is a third draw mode, not a replacement).

   Full-fidelity on the part that defines the look: the GLSL shaders (spine rig, thin-film iris
   shading, bloom blur/composite), the per-species VAO/texture upload, and the spine-texture write
   are copied verbatim/near-verbatim from the original. Species geometry (fillV/lineV/partTex/
   bounds) needs no separate porting — it already lives in packages/kit/ecology-species.js
   (window.EcologySpecies), which packages/ecology/ecology-sim.js also already depends on.

   Deliberately NOT ported (scope cuts, not oversights):
     - The original's free-orbiting tank camera (updateCamera's dock/drawer cover math, its own
       pointer-drag-to-rotate) and the tower-focus/scene-focus framing. Forge's Ecology screen is a
       top-down city scene, not a free-standing tank viewer, so `frame()` here takes a flat `camera`
       config (worldW/worldH/tilt/yaw/zoom/panX/panY) and builds a near-top-down camera from it
       every call — same M4 perspective/look math as the original, just always near tilt=0 rather
       than following a UI's view-mode radios. Drag-to-pan and Follow-a-creature (2026-11-04,
       ecology.html) are ported at the caller level: they just drive panX/panY (and the existing
       tilt/yaw/zoom) every frame, reusing this module's camera math as-is rather than duplicating
       it. A caller that wants the original's full drag-to-orbit experience back would need to port
       updateCamera's tilt/yaw-from-drag handling separately.
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
         Species Style Lab data via packages/forge/forge-overrides.js) replace the HUE table;
         returning null/undefined for a key falls back to ES.HUE exactly as the original did.
       Throws if WebGL2 is unavailable, same as the original (check before calling, or try/catch).
     EcologyRender.resize(r, pxW, pxH) — sets canvas.width/height to pxW/pxH (device pixels — the
       caller does its own devicePixelRatio math, this module does none) and (re)allocates the glow
       and trail framebuffers at that size. Call once up front and again whenever the canvas's
       device-pixel size should change; cheap compared to frame() but not free, don't call per-frame.
     EcologyRender.frame(r, { sim, time, worldW, worldH, camera, render }) — draws one frame to
       canvas's default framebuffer (transparent background — alpha:true, unlike the original's
       opaque alpha:false — so Forge can stack this canvas over its own 2D city-plan canvas).
       sim: an packages/ecology/ecology-sim.js EcologySim instance (same sim the caller is step()ing).
       time: seconds, matching the `t` the original's draw(t) received (iris shift, blink, etc).
       worldW/worldH: the world-unit size to frame (pass sim.bounds.w/h for "frame the whole tank").
       camera: optional {tilt=10, yaw=0, zoom=1, panX=0, panY=0} in degrees/degrees/scale/world
         units/world units. tilt=0 is a dead-flat top-down view; a few degrees keeps a trace of the
         original's dimensionality without fighting a top-down composite. panX/panY shift the
         look-at point off the tank centre — how the caller's own drag-to-pan or Follow-a-creature
         controls (not part of this module, see ecology.html) move the camera.
       render: optional per-call overrides, all matching the original S.* fields of the same name:
         {glow=1.2, iris=0.95, shimmer=0.1, trail=0, dark=0.3, wings=1, snow=true, carcasses=true},
         cores (0, off; up to 1: how bright) draws each species' thick spine parts solid and dark under its lines (needs PartSolid and Delaunator loaded),
         plus waterAlpha=0.82 (Forge-only, no original equivalent): the composite's background
         alpha where nothing bright is rendered — the original drew to an opaque canvas so this
         never mattered; Forge stacks this canvas over its own 2D city-plan canvas, so the empty
         "water" needs a deliberate translucent tint rather than reading whatever alpha the glow/
         snow/shimmer passes happened to leave behind (they're additive full-coverage passes not
         meant to carry alpha). The final composite shader derives alpha from a mix(waterAlpha, 1.0,
         luminance) instead of passing the render target's own alpha through.
         dark/glow/iris/shimmer/trail/density were page-UI fields on the original's S object
         alongside the sim-contract fields (size/speed/beh/...) but were never read by
         packages/ecology/ecology-sim.js — they're pure rendering knobs, which is why they're passed
         here instead of expected on sim.cfg.
   Known pinned constant, duplicated with ecology-sim.js on purpose (see that file's own header for
   why): K = 20 spine points per fish.
*/
(function () {
  'use strict';

  const K = 20;
  // spine row: K spine texels + 4 params; walking legs add their band transforms (ecology-walk.js)
  const WALK = () => window.EcologyWalk && window.CreatureWalk ? window.EcologyWalk : null;
  const TEX_W = 24 + (WALK() ? WALK().TEX_EXTRA : 0);
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
// a host's ground under the tank floor (drawInto's terrain): near the floor a vertex is raised by the height stored for its place
uniform sampler2D uTerr; uniform vec4 uTerrA;   // tank w, tank h, tank depth, grid size (0: no terrain)
vec4 project(vec3 w) {
  if (uTerrA.w > 1.5) {
    float g = smoothstep(0.78, 0.95, w.z / uTerrA.z);
    if (g > 0.0) {
      int n = int(uTerrA.w) - 1; vec2 q = clamp(w.xy / uTerrA.xy, 0.0, 1.0) * float(n); ivec2 i = min(ivec2(floor(q)), ivec2(n)), j = min(i + 1, ivec2(n)); vec2 f = q - vec2(i);
      float h = mix(mix(texelFetch(uTerr, i, 0).r, texelFetch(uTerr, ivec2(j.x, i.y), 0).r, f.x), mix(texelFetch(uTerr, ivec2(i.x, j.y), 0).r, texelFetch(uTerr, j, 0).r, f.x), f.y);
      w.z -= g * h;
    }
  }
  vec4 c = uVP * vec4(w, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w; return c; }
`;
  const FISH_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location=0) in vec2 aPos;
layout(location=1) in float aPart;
layout(location=2) in vec2 aNorm;
uniform sampler2D uSpine, uParts;
uniform vec2 uRes;
uniform float uBY0, uLEN, uLineW, uZScale, uLayer, uTime, uPtSize, uRaise;
uniform float uFlat, uPick;   // an editor's: uFlat 1 lays a core flat (its height times 1 - uFlat); uPick is the picked part's number + 1 (0: none)
/*CORE_IN*/
uniform int uRow0, uKeyN;
uniform vec4 uKeyT;
out float vG; out float vBright; out float vDim; out float vAng; out float vS; out float vAlert; out float vFace; out float vX; out float vPick;
const int K = ${K};
int row() { return gl_InstanceID + uRow0; }
vec4 PT(int i, int c) { return texelFetch(uParts, ivec2(c, i), 0); }
${WALK() ? WALK().LEG_GLSL : ""}
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
  ${WALK() ? `vec2 pl = p;
  if (legPose(pi, aPos, pl, row())) {
    vec3 P, T, L, U; frame3((R.w - uBY0) / uLEN, P, T, L, U);
    w = P + L * (pl.x * sc) + T * (pl.y - R.w) * sc; Uf = U;
  } else` : ""}
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
    /*CORE_RIGID*/
  } else {
    vec3 P, T, L, U; frame3((p.y - uBY0) / uLEN, P, T, L, U);
    w = P + L * p.x * sc; Uf = U;
    /*CORE_BODY*/
  }
  w += normalize(uCam - w) * uRaise * sc;
  /*CORE_OUT*/
  gl_Position = project(w);
  gl_Position.z -= (aPart * 2.0 + uLayer) * 1.5e-6 * gl_Position.w;
  vFace = abs(dot(Uf, normalize(uCam - w)));
  vPick = (uPick > 0.5 && abs(aPart - (uPick - 1.0)) < 0.5) ? 1.0 : 0.0;
  vDim = prm.w; vAng = ang; vS = (aPos.y - uBY0) / uLEN; vAlert = mood.w; vX = aPos.x / uLEN;
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
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; in float vPick; uniform float uAlpha; uniform vec3 uColLo, uColHi; out vec4 o;
${IRIS}
void main() {
  vec3 c = mix(uColHi, uColLo, smoothstep(0.0, 0.55, vG));
  c = iris(c, vAng, vS, 0.0);
  c = mix(c, vec3(0.25, 0.42, 0.75), (1.0 - vDim) * 0.7);
  c = mix(c, vec3(1.0, 0.36, 0.3), vAlert * 0.75);
  o = vec4(mix(c * uAlpha * vDim * (0.45 + 0.65 * vFace), vec3(1.0, 0.72, 0.25), vPick), 1.0); }`;
  const PT_FS = `#version 300 es
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; uniform float uAlpha; uniform vec3 uColHi; out vec4 o;
${IRIS}
void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
  vec3 c = mix(iris(uColHi, vAng, vS, 0.0), vec3(1.0, 0.5, 0.4), vAlert * 0.7);
  o = vec4(c * a * vBright * uAlpha * 0.6 * vDim, 1.0); }`;
  // a core: the thick parts that ride the spine (head, vertebrae, plates) made solid by PartSolid, dark under the lines so the body has mass
  // and a far wing passes behind it. Same rig as the lines; a vertex also stands off the body's plane by aH along the spine frame's up
  // ---- a look: a material and a noise pattern in five colours (packages/kit/data/creature-looks.js) ----
  // uPal: body, shade, glow, line, accent. uMat: 0 plain, 1 skin, 2 glass, 3 ember, 4 shell, 5 golem. uPat: 0 none, 1 spots, 2 bands, 3 veins.
  // q is where on the body: (how far from the spine, how far along it), in body lengths. Across is |x|, so a pattern is the same on both sides.
  // stone and its lumps, shared by the vertex shaders (lumps) and LOOK (colour and bump) so the two line up
  const STONE_GL = `
// ---- stone (Golem) and overgrowth: 3D noise in highp, the same text in the vertex shader (lumps) and the fragment shader (colour, bump),
// so a lump and the stone drawn on it line up. p is where on the body at rest, in stone sizes; sd a seed ----
highp float gh3(highp vec3 p, highp float sd) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)) + sd * 17.0) * 43758.5453); }
highp float gn3(highp vec3 p, highp float sd) { highp vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh3(i, sd), gh3(i + vec3(1.0, 0.0, 0.0), sd), f.x), mix(gh3(i + vec3(0.0, 1.0, 0.0), sd), gh3(i + vec3(1.0, 1.0, 0.0), sd), f.x), f.y),
             mix(mix(gh3(i + vec3(0.0, 0.0, 1.0), sd), gh3(i + vec3(1.0, 0.0, 1.0), sd), f.x), mix(gh3(i + vec3(0.0, 1.0, 1.0), sd), gh3(i + vec3(1.0, 1.0, 1.0), sd), f.x), f.y), f.z); }
highp float gf3(highp vec3 p, highp float sd) { return gn3(p, sd) * 0.55 + gn3(p * 2.1 + 3.7, sd) * 0.3 + gn3(p * 4.3 + 9.1, sd) * 0.15; }
// stones: x how far into its stone from the seam (0 in the seam), y which stone (0 to 1), z how far from the stone's own middle
highp vec3 stones(highp vec3 p, highp float sd) { highp vec3 c = floor(p); highp float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { highp vec3 o = c + vec3(float(i), float(j), float(k));
    highp vec3 pt = o + 0.15 + 0.7 * vec3(gh3(o, sd), gh3(o + 7.3, sd), gh3(o + 3.1, sd)); highp float d = length(p - pt);
    if (d < d1) { d2 = d1; d1 = d; id = gh3(o + 2.1, sd); } else if (d < d2) d2 = d; }
  return vec3(d2 - d1, id, d1); }
// how high a stone stands (0 in a seam, 1 on its crown), its edge chipped
highp float stoneH(highp vec3 st, highp vec3 p, highp float sd) { return smoothstep(0.0, 0.45, st.x + (gn3(p * 3.0, sd) - 0.5) * 0.14); }`;
  const LUMP_GL = STONE_GL + `
uniform float uLump, uLGrain, uLSeed, uLRough;   // the Golem's lumps: how much (0 to 2), the stones' size, the seed, how rough
float lumpOf(vec3 p3) { if (uLump < 0.001) return 0.0; highp vec3 p = p3 * 9.0 * uLGrain; highp vec3 st = stones(p, uLSeed);
  return (stoneH(st, p, uLSeed) * 0.75 + (gf3(p * 2.0, uLSeed) - 0.5) * 0.4 * uLRough - 0.4) * uLump * 0.3 / (9.0 * uLGrain); }   // in body lengths, along the normal`;
  const LOOK = `
uniform vec3 uPal[5]; uniform float uMat, uPat, uSeedL, uTimeL, uVein, uFres, uOpac, uEmis, uVSize, uGrain, uRough, uGrow, uGrowA, uGrowP; uniform vec3 uGrowC[2]; uniform highp float uSeedG; uniform float uPaint, uPaintS, uPaintB, uPaintW, uPaintT, uPaintD, uPaintO;   // golem: uGrain the stones' size (1 as designed), uRough how rough. Overgrowth on any material: uGrow 0 none, 1 moss, 2 frost, 3 rust, 4 fungus; uGrowA how much, uGrowP how clumped; uGrowC its colour and its tip's
// set by the caller before look(): where on the body at rest (across, signed; along; height off the body; in body lengths), the body's own up (1 on its back) and the point in the world
vec3 lkP = vec3(0.0); float lkUp = 0.0, lkEdge = 0.0; highp vec3 lkW = vec3(0.0);   // lkEdge: 1 at the rim of a part (a core knows it from its height; a walker's solid does not, and gives 0)
${STONE_GL}
float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeedL * 17.0) * 43758.5453); }
float ln2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lh(i), lh(i + vec2(1.0, 0.0)), f.x), mix(lh(i + vec2(0.0, 1.0)), lh(i + vec2(1.0, 1.0)), f.x), f.y); }
float lfbm(vec2 p) { return ln2(p) * 0.55 + ln2(p * 2.1 + 3.7) * 0.3 + ln2(p * 4.3 + 9.1) * 0.15; }
float ridge(vec2 p) { return abs(lfbm(p) * 2.0 - 1.0); }
float pattern(vec2 q) {
  if (uPat < 0.5) return 0.0;
  if (uPat < 1.5) {   // spots: one in about every other cell of a grid, each its own size
    vec2 g = q * 20.0, c = floor(g); float best = 1.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = c + vec2(float(i), float(j)), pt = o + vec2(lh(o), lh(o + 7.3)); best = min(best, mix(1.0, length(g - pt) / (0.22 + 0.3 * lh(o + 1.7)), step(0.5, lh(o + 3.1)))); }
    return 1.0 - smoothstep(0.7, 1.0, best); }
  if (uPat < 2.5) return smoothstep(0.5, 0.72, 0.5 + 0.5 * sin(q.y * 30.0 + lfbm(q * vec2(7.0, 3.0)) * 4.0 + q.x * 5.0));   // bands across the body, wavering
  vec2 v = q / max(0.15, uVSize);
  return 1.0 - smoothstep(0.0, 0.03 + 0.14 * uVein, min(ridge(v * 13.0), ridge(v * 29.0 + 4.2) * 1.7));                                   // veins: the creases of a noise
}
vec4 look(vec3 n, vec3 V, vec2 q, float dim) {
  vec3 Ld = normalize(vec3(-0.3, -0.42, -0.86)); float pat0 = pattern(q) * min(1.0, uVein * 1.7);
  // stone and growth come first: their height tilts the surface before it is lit
  bool golem = uMat > 4.5; highp vec3 P = lkP * 9.0 * uGrain, st = vec3(1.0, 0.0, 0.5); float crack = 0.0, hs = 1.0, rgh = 0.5, H = 0.0;
  if (golem) { st = stones(P, uSeedG); crack = (1.0 - smoothstep(0.0, 0.04 + 0.22 * uVein, st.x)) * min(1.0, 0.3 + uVein * 2.0); hs = stoneH(st, P, uSeedG); rgh = gf3(P * 2.0, uSeedG);
    H = hs * 0.7 + (rgh - 0.5) * 0.5 * uRough + (gn3(P * 9.0, uSeedG) - 0.5) * 0.08 * uRough; }
  float up = clamp(lkUp, 0.0, 1.0), crev = golem ? crack : pat0, m = 0.0, gfz = 0.5, cap = 0.0;
  if (uGrow > 0.5 && uGrowA > 0.001) {
    float clump = gf3(P * 0.7 + 11.0, uSeedG), field; gfz = gn3(P * 7.0 + 5.0, uSeedG);
    if (uGrow < 1.5) field = up * 0.6 + crev * 0.45 + (clump - 0.5) * (0.3 + 0.9 * uGrowP) + (gfz - 0.5) * 0.14;                                   // moss: on its back and in the cracks, a fuzzy edge
    else if (uGrow < 2.5) field = lkEdge * 0.55 + crev * 0.5 + up * 0.2 + (clump - 0.5) * (0.35 + 0.9 * uGrowP) + (gfz - 0.5) * 0.04;          // frost: from the edges in, and in the cracks
    else if (uGrow < 3.5) field = crev * 0.7 + lkEdge * 0.45 + 0.1 + (gf3(P * vec3(1.6, 1.6, 0.3) + 2.0, uSeedG) - 0.5) * (0.4 + 0.8 * uGrowP);      // rust: out of the seams and edges, in streaks
    else { highp vec3 fs = stones(P * 0.8 + 17.0, uSeedG + 3.0); cap = 1.0 - smoothstep(0.18, 0.42, fs.z); field = cap * 0.55 + up * 0.2 + crev * 0.3 + (clump - 0.5) * (0.4 + 0.9 * uGrowP); }   // fungus: caps in clusters
    float t = 1.3 - uGrowA * 1.55, soft = uGrow < 1.5 ? 0.16 : uGrow < 2.5 ? 0.05 : 0.1;
    m = smoothstep(t, t + soft, field) * smoothstep(0.0, 0.04, uGrowA);
    H += m * (uGrow < 1.5 ? 0.3 + gfz * 0.4 : uGrow < 2.5 ? 0.15 + 0.3 * step(0.55, gn3(P * 14.0, uSeedG)) : uGrow < 3.5 ? 0.1 * gfz : 0.5 * cap); }
  if (golem || m > 0.0) {   // the bump: the height above tilts the normal (the surface gradient, from screen-space derivatives), scaled to the stones' size in the world
    highp vec3 dpx = dFdx(lkW), dpy = dFdy(lkW); float wpp = (length(dpx) + length(dpy)) / max(1e-6, length(dFdx(P)) + length(dFdy(P)));
    float Hw = H * wpp * (golem ? 0.16 : 0.1), hx = dFdx(Hw), hy = dFdy(Hw); vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
    vec3 nb = normalize(abs(det) * n - sign(det) * (hx * r1 + hy * r2)); if (abs(det) > 1e-12) n = nb; }
  float d = max(0.0, dot(n, Ld)), ndv = max(0.0, dot(n, V)), fr = pow(1.0 - ndv, 2.6), wrap = d * 0.75 + 0.25 * (0.5 - 0.5 * n.z);
  float pat = pat0, rim = pow(1.0 - ndv, 3.0) * uFres, spec = pow(max(0.0, dot(reflect(-Ld, n), V)), 26.0), a = 1.0; vec3 body = mix(uPal[0], uPal[4], pat * (uMat > 0.5 && uMat < 1.5 ? 0.55 : 0.8)), c;
  if (uMat < 0.5) { float w = dot(n, Ld) * 0.5 + 0.5; c = mix(uPal[1], body, smoothstep(0.1, 0.95, w)) + uPal[2] * pow(1.0 - ndv, 1.6) * 0.55; }   // plain: matte, no highlight; a soft sheen of the glow colour toward the edge, like velvet
  else if (uMat < 1.5) {   // skin: one soft mass. Light wraps round it, turns warm where it goes to shade, and pores show only in strong light
    float w = dot(n, Ld) * 0.5 + 0.5, lit = smoothstep(0.6, 0.95, w); vec3 fl = mix(body, body * 0.78 + uPal[2] * 0.22, lfbm(q * 9.0));
    c = mix(uPal[1], fl, smoothstep(0.15, 1.0, w)); c += mix(uPal[4], vec3(0.6, 0.1, 0.06), 0.55) * smoothstep(0.2, 0.46, w) * (1.0 - smoothstep(0.46, 0.8, w)) * 0.4;
    c *= 1.0 - 0.2 * ln2(q * 240.0) * lit; c += spec * 0.1 * lit + uPal[2] * fr * 0.22; }
  else if (uMat < 2.5) {   // glass: clear face-on, bright at the rim; the pattern and a slow noise are where it is denser
    a = clamp((0.08 + 0.5 * pat + 0.22 * lfbm(q * 5.0)) * 0.7 + fr * 0.95, 0.0, 1.0);
    c = mix(body * 0.7, uPal[2], fr) + spec * 0.7 + uPal[2] * fr * fr * 0.6; }
  else if (uMat < 3.5) {   // ember: dark, and lit from inside along the pattern (or along veins of its own), a pulse running down the body
    float pulse = 0.5 + 0.5 * sin(q.y * 9.0 - uTimeL * 1.6), vein = uPat > 0.5 ? pat : 1.0 - smoothstep(0.0, 0.12, ridge(q * 12.0));
    c = mix(uPal[1] * 0.5, uPal[1] * 1.7 + uPal[0] * 0.14, wrap) + uPal[2] * vein * (0.5 + 1.0 * pulse * pulse) + uPal[4] * fr * 0.5; }
  else if (uMat < 4.5) {   // shell: a beetle's back. Dark face-on, and the colour it shows turns with the angle of view: body, then accent, then glow at the edge
    float th = ndv * 1.6 + lfbm(q * 6.0) * 0.5; vec3 film = mix(body, uPal[4], smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(th * 6.2831))); film = mix(film, uPal[2], pow(1.0 - ndv, 1.5));
    c = mix(uPal[1], film, 0.3 + 0.7 * wrap) * (0.55 + 0.75 * fr) + pow(spec, 3.0) * 0.5; }
  else {   // golem: stones, each its own tone between body and accent and rough within, sunk at the seams. Shade is the crevice; glow is what lights the cracks (Emissive)
    vec3 rock = mix(uPal[0], uPal[4], clamp(st.y * 0.7 + (rgh - 0.5) * 0.5 * uRough, 0.0, 1.0)); rock *= 1.0 + (gn3(P * 9.0, uSeedG) - 0.5) * 0.35 * uRough;
    float w = dot(n, Ld) * 0.5 + 0.5; c = mix(uPal[1], rock, smoothstep(0.08, 0.95, w)) * mix(0.5, 1.0, hs);   // the low edge of a stone darker, as if shadowed by the next
    c = mix(c, uPal[1] * 0.6, crack * 0.8) + spec * 0.12 * (1.0 - uRough) * hs; }
  if (m > 0.0) {   // overgrowth, over whatever the material is
    float w = dot(n, Ld) * 0.5 + 0.5; vec3 gc;
    if (uGrow < 1.5) { gc = mix(uGrowC[0], uGrowC[1], clamp(gfz * 0.9 + up * 0.35 - 0.25, 0.0, 1.0)) * mix(0.42, 1.0, smoothstep(0.0, 0.85, w)); gc += uGrowC[1] * pow(1.0 - ndv, 2.0) * 0.22; }   // moss: light wraps it, a velvet sheen of the tip colour
    else if (uGrow < 2.5) { gc = mix(uGrowC[0], uGrowC[1], gfz) * mix(0.5, 1.0, w); gc += vec3(1.0) * step(0.93, gh3(floor(P * 24.0), uSeedG)) * pow(max(0.0, dot(reflect(-Ld, n), V)), 6.0) * 0.8 + uGrowC[1] * fr * 0.3; }   // frost: glints
    else if (uGrow < 3.5) { gc = mix(uGrowC[0], uGrowC[1], gf3(P * 3.0 + 1.0, uSeedG)) * mix(0.35, 1.0, w); }   // rust: matte
    else { gc = mix(uGrowC[0], uGrowC[1], cap) * mix(0.45, 1.0, w) + uGrowC[1] * (fr * 0.25 + uEmis * 0.6 * cap); }   // fungus: pale caps, lit from inside by Emissive
    c = mix(c, gc, m); a = mix(a, 1.0, m); }
  float ink = 0.0;
  if (uPaint > 0.001) {   // painted: the light broken into a few flat steps whose edges follow brush strokes; warm where it is lit and cool in shade, across one hard line; dabs and scratches inside a step; a rim of light on the lit side and an ink line on the other; the strokes are dealt again eight times a second (uPaintW)
    highp vec3 Q = lkP * (26.0 / max(0.2, uPaintB)); float tk = floor(uTimeL * 8.0) * 1.7 * uPaintW;
    float s1 = gf3(Q * vec3(1.0, 0.22, 1.0) + tk, uSeedG + 5.0), s2 = gn3(Q * vec3(0.35, 1.4, 0.35) * 2.0 + 7.0 - tk, uSeedG + 9.0);   // long strokes along the body, short ones across
    float lum = max(1e-4, dot(c, vec3(0.299, 0.587, 0.114))), f = sqrt(lum) * uPaintS + (s1 - 0.5) * 1.1 + (s2 - 0.5) * 0.4, aa = clamp(fwidth(f) * 1.5, 0.01, 0.5);
    float ql = (floor(f) + smoothstep(0.5 - aa, 0.5 + aa, fract(f))) / uPaintS; ql = max(0.02, ql * ql);
    vec3 cp = c * (ql / lum); cp = mix(vec3(dot(cp, vec3(0.299, 0.587, 0.114))), cp, 1.25) * (1.0 + (s2 - 0.5) * 0.22);   // a little more colour, each stroke its own value
    float litW = smoothstep(0.47, 0.53, dot(n, Ld) * 0.5 + 0.5 + (s1 - 0.5) * 0.3);                                        // the line between light and shade, its edge a brush's
    cp *= mix(vec3(1.0), mix(vec3(0.7, 0.9, 1.32), vec3(1.22, 1.04, 0.78), litW), uPaintT);                               // warm light, cool shade
    float d1 = gn3(Q * vec3(2.6, 0.6, 2.6) + 13.0 + tk, uSeedG + 2.0), d2 = gn3(Q * vec3(7.0, 0.35, 7.0) + 3.0 - tk, uSeedG + 4.0);
    cp *= 1.0 + (smoothstep(0.62, 0.66, d1) - (1.0 - smoothstep(0.32, 0.36, d1))) * 0.18 * uPaintD;                        // dabs: a lighter or darker touch inside a step
    cp += cp * (1.0 - smoothstep(0.0, 0.035, abs(d2 - 0.5))) * 0.4 * uPaintD * (0.3 + 0.7 * litW);                         // scratches: thin dry strokes along the body
    cp = mix(cp, uPal[1] * 0.5, smoothstep(0.42, 0.16, ndv + (s1 - 0.5) * 0.25) * 0.8 * (1.0 - litW));                    // the edge turning away in shade, painted dark
    cp += mix(vec3(1.0), uPal[0], 0.4) * step(0.55, spec + (s1 - 0.5) * 0.35) * 0.3 * (1.0 - m);                           // a highlight laid on in one stroke
    c = mix(c, max(cp, 0.0), uPaint);
    rim = mix(rim, smoothstep(0.34, 0.4, pow(1.0 - ndv, 3.0) + (s1 - 0.5) * 0.22) * litW * uFres * 0.9, uPaint);           // the rim light: one hard band, on the lit side only
    float eT = 1.0 - 0.8 * uPaintO, nT = 0.08 + 0.3 * uPaintO;                                                             // the ink line: at a part's rim (a core knows it) and where the surface turns from the eye; the lit side keeps its rim light instead
    ink = max(smoothstep(eT, eT + 0.15, lkEdge + (s1 - 0.5) * 0.2), 1.0 - smoothstep(nT - 0.05, nT, ndv + (s2 - 0.5) * 0.1)) * (1.0 - 0.85 * litW) * step(0.001, uPaintO) * uPaint; }
  c += (golem ? uPal[0] * 0.9 : mix(uPal[2], vec3(1.0), 0.25)) * rim * 1.5 * (1.0 - 0.8 * m); a = min(1.0, a + rim * 0.6);   // a golem's rim is lit stone, not its crack glow; growth takes little rim
  if (golem) { float pulse = 0.5 + 0.5 * sin(lkP.y * 9.0 - uTimeL * 1.6); c += uPal[2] * crack * (1.0 - m) * uEmis * (1.0 + 1.4 * pulse * pulse) + mix(body, uPal[2], 0.55) * uEmis * 0.12; }   // a golem glows in its cracks, a pulse running down them
  else c += mix(body, uPal[2], 0.55) * uEmis * 1.3 * (1.0 - m); a *= uOpac;   // growth covers the glow under it   // emissive: its own light, the same in shade as in light; opacity last   // Fresnel: the edge turning away from the eye takes the glow colour
  c = mix(c, uPal[1] * 0.3, ink); a = max(a, ink * uOpac);   // the ink line lies over everything, glass too
  return vec4(c * (0.55 + 0.45 * dim), a);
}`;
  const CORE_VS = FISH_VS.replace("layout(location=2) in vec2 aNorm;", "const vec2 aNorm = vec2(0.0);")
    .replace("/*CORE_IN*/", "layout(location=3) in float aH; layout(location=4) in vec3 aN; out vec3 vW; out vec3 vNw; out vec3 vP3; out float vUpB; out float vEdge;" + LUMP_GL)
    .replace("/*CORE_BODY*/", "w += U * aH * (1.0 - uFlat) * sc; vNw = normalize(L * aN.x + T * aN.y + U * aN.z); w += vNw * lumpOf(vec3(aPos.x, aPos.y - uBY0, aH) / uLEN) * smoothstep(0.0, 0.012, abs(aH) / uLEN) * (1.0 - uFlat) * uLEN * sc;")
    .replace("/*CORE_RIGID*/", "{ vec3 Lr = normalize(L * cos(lift) + U * sign(dx) * sin(lift)); vec2 nr = rot(aN.xy, vec2(0.0), ang * (1.0 - 0.55 * uWing)); w += Uf * aH * (1.0 - uFlat) * sc; vNw = normalize(Lr * nr.x + T * nr.y + Uf * aN.z); w += vNw * lumpOf(vec3(aPos.x, aPos.y - uBY0, aH) / uLEN) * 0.4 * smoothstep(0.0, 0.012, abs(aH) / uLEN) * (1.0 - uFlat) * uLEN * sc; }")   // a wing or fin: its thickness along its own up as it flaps
    .replace("/*CORE_OUT*/", "vW = w; vP3 = vec3(aPos.x, aPos.y - uBY0, aH) / uLEN; vUpB = aN.z; vEdge = 1.0 - smoothstep(0.0, 0.012, abs(aH) / uLEN);");   // vP3: where on the body at rest (it does not swim as the body bends); vUpB: the body's own up (the spine frame's up is the tank's up)
  const CORE_FS = `#version 300 es
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; in float vX; in highp vec3 vW; in vec3 vNw; in vec3 vP3; in float vUpB; in float vEdge; in float vPick;
uniform vec3 uColHi; uniform highp vec3 uCam; uniform float uCore, uLook, uFade, uWire; out vec4 o;   // uWire: this pass draws the mesh's edges (render.edit.wire), in one flat colour
${IRIS}
${LOOK}
void main() {
  if (uWire > 0.0) { o = vec4(mix(vec3(0.62, 0.6, 0.56), vec3(1.0, 0.72, 0.25), vPick) * uWire, 1.0); return; }
  vec3 n = normalize(vNw), V = normalize(uCam - vW); if (dot(n, V) < 0.0) n = -n;
  if (uLook > 0.5) { lkP = vP3; lkUp = vUpB; lkW = vW; lkEdge = vEdge; vec4 L = look(n, V, vec2(abs(vX), vS), vDim); L.rgb = mix(L.rgb, vec3(0.3, 0.06, 0.05), vAlert * 0.4); L.rgb = mix(L.rgb, vec3(1.0, 0.72, 0.25), vPick * 0.3); o = vec4(L.rgb * uCore, L.a * uFade); return; }
  float ndv = dot(n, V), d = max(0.0, dot(n, normalize(vec3(-0.3, -0.42, -0.86))));   // lit from above (the tank's up is -z) and a little to one side
  // a lit body in the species' own colour: dark where it turns from the light, the colour where it faces it, a soft sheen. It has to read
  // as a solid against black water, so it is not a silhouette: the darkest it goes is still a deep tint of the colour
  float wrap = d * 0.75 + 0.25 * (0.5 + 0.5 * n.z * -1.0);
  vec3 c = mix(uColHi * 0.07 + vec3(0.012, 0.012, 0.02), uColHi * 0.62 + 0.05, wrap * wrap);
  c += iris(uColHi, vAng, vS, 0.0) * pow(1.0 - ndv, 2.4) * 0.45;                        // the iris colour where the skin turns away
  c += pow(max(0.0, dot(reflect(-normalize(vec3(-0.3, -0.42, -0.86)), n), V)), 26.0) * 0.3;
  c = mix(c, vec3(0.3, 0.06, 0.05), vAlert * 0.4);
  c = mix(c, vec3(1.0, 0.72, 0.25), vPick * 0.3);
  o = vec4(c * uCore * (0.55 + 0.45 * vDim), uFade); }`;
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
precision mediump float; in vec2 vUv; uniform sampler2D uTex; uniform float uGain, uBaseAlpha; out vec4 o;
void main() {
  vec3 c = texture(uTex, vUv).rgb * uGain;
  float lum = max(max(c.r, c.g), c.b);
  o = vec4(c, clamp(mix(uBaseAlpha, 1.0, lum), 0.0, 1.0));
}`;
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
    let { V: lineV, I: lineI } = lineArrays(sp);
    if (lineV.length === 0) { const outline = buildOutline(fillV, fillI); lineV = outline.v; lineI = outline.i; }
    const ptsI = []; for (let i = 0; i < lineV.length / 5; i += 26) ptsI.push(i);
    const fillVAO = makeVAO(gl, fillV, 3, false, fillI);
    const lineVAO = makeVAO(gl, lineV, 5, true, lineI);
    const ptsVAO = makeVAO(gl, lineV, 5, true, new Uint16Array(ptsI));
    const BY0 = sp.bounds[1], LEN = sp.bounds[3] - sp.bounds[1];
    const partTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, partTex);
    if (WALK()) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 5, sp.parts, 0, gl.RGBA, gl.FLOAT, WALK().partTex(sp));
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, sp.parts, 0, gl.RGBA, gl.FLOAT, new Float32Array(sp.partTex));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const keyT = new Float32Array(4); keyT.set(sp.keyT || []); const keyN = (sp.keyT || []).length;
    const override = opts.getColor ? opts.getColor(sp.key) : null;
    const hue = ES.HUE[sp.key];
    const colHi = (override && override.hi) || (hue ? hue.hi : ES.DEFAULT_COL_HI);
    const colLo = (override && override.lo) || (hue && hue.lo) || colHi.map((v) => v * 0.556);
    const glow = (override && override.glow != null ? override.glow : (hue && hue.glow)) || 0;
    return { key: sp.key, fillVAO, lineVAO, ptsVAO, BY0, LEN, keyT, keyN, partTex, colHi, colLo, glow, wing: (ES.WING && ES.WING[sp.key]) || 0.25 };
  }

  // the drawing itself, per part, as strokes: flat [x, y, ...] polylines, a closed one ending where it starts
  // a species' line ribbons as arrays: straight from its strokes when the species file keeps them so (EcologySpecies.lines), else decoded
  const lineArrays = (sp) => { if (sp.__lines) return sp.__lines; const L = window.EcologySpecies && window.EcologySpecies.lines && window.EcologySpecies.lines(sp); return L || { V: b64(sp.lineV, Float32Array), I: b64(sp.lineI, Uint16Array) }; };
  const strokeMemo = new WeakMap();   // a species' strokes do not change while a page runs; read once
  function strokesOf(sp) { let m = strokeMemo.get(sp); if (!m) strokeMemo.set(sp, (m = readStrokes(sp))); return m; }
  function readStrokes(sp) {
    const { V: lineV, I: lineI } = lineArrays(sp), strokes = new Map();
    { const kq = (i) => Math.round(lineV[i * 5] * 4) + "," + Math.round(lineV[i * 5 + 1] * 4), segs = new Map();
      for (let t = 0; t + 2 < lineI.length; t += 3) for (let e = 0; e < 3; e++) { const a = lineI[t + e], b = lineI[t + (e + 1) % 3], ka = kq(a), kb = kq(b); if (ka === kb) continue;
        const pi = Math.round(lineV[a * 5 + 4]); let m = segs.get(pi); if (!m) segs.set(pi, (m = new Map())); const key = ka < kb ? ka + "|" + kb : kb + "|" + ka; if (!m.has(key)) m.set(key, { ka, kb, a, b }); }
      for (const [pi, m] of segs) { const nx = new Map(); for (const e of m.values()) { (nx.get(e.ka) || nx.set(e.ka, []).get(e.ka)).push(e); (nx.get(e.kb) || nx.set(e.kb, []).get(e.kb)).push(e); }
        const used = new Set(), polys = [], walk = (e0, from) => { const startK = from; let at = from === e0.ka ? e0.kb : e0.ka, vi = from === e0.ka ? e0.b : e0.a; const v0 = from === e0.ka ? e0.a : e0.b, pts = [lineV[v0 * 5], lineV[v0 * 5 + 1]]; used.add(e0);
          for (let guard = 0; guard < 40000; guard++) { pts.push(lineV[vi * 5], lineV[vi * 5 + 1]); if (at === startK) break; const nxt = (nx.get(at) || []).find((q) => !used.has(q)); if (!nxt) break; used.add(nxt); if (nxt.ka === at) { at = nxt.kb; vi = nxt.b; } else { at = nxt.ka; vi = nxt.a; } }
          if (at === startK && pts.length >= 8) { pts[pts.length - 2] = pts[0]; pts[pts.length - 1] = pts[1]; }   // back where it began: closed, to the letter
          polys.push(pts); };
        for (const e of m.values()) { if (used.has(e)) continue; if ((nx.get(e.ka) || []).length === 1) walk(e, e.ka); else if ((nx.get(e.kb) || []).length === 1) walk(e, e.kb); }   // open strokes, from their loose ends
        for (const e of m.values()) if (!used.has(e)) walk(e, e.ka);                                                                                                      // what is left is loops
        strokes.set(pi, polys); } }
    return strokes;
  }
  // the core of a species, built the first time it is drawn with render.cores on (needs window.PartSolid and Delaunator; without them, no cores).
  // Each part that rides the spine (not a rigid fin or wing) gives its outline (the rim of its fill), PartSolid rounds it (belly), and the result
  // goes up as (x, y, part, height, normal). H: the deepest it stands, which the lines are raised by so they lie on it
  // what a core is built from besides the species and the options: its part table (as walking draws it) and the outlines closed for it
  const coreEnv = (sp) => ({ pt: WALK() ? WALK().partTex(sp) : sp.partTex, W: WALK() ? 20 : 16, fixed: (window.CoreOutlines && window.CoreOutlines[sp.key]) || {} });
  function buildCore(gl, sp, opts) { const c = computeCore(sp, opts || {}, coreEnv(sp)); return c && uploadCore(gl, c); }
  // the core as arrays, touching no GL: what a worker can build (coreWorker below); null without PartSolid and Delaunator
  function computeCore(sp, opts, env) {
    const PS = window.PartSolid; if (!PS || !window.Delaunator) return null;
    const fillV = b64(sp.fillV, Float32Array), fillI = b64(sp.fillI, Uint16Array), LEN = sp.bounds[3] - sp.bounds[1], W = env.W;
    const pt = env.pt, tris = new Map();
    for (let t = 0; t < fillI.length; t += 3) { const pi = Math.round(fillV[fillI[t] * 3 + 2]); let a = tris.get(pi); if (!a) tris.set(pi, (a = [])); a.push(fillI[t], fillI[t + 1], fillI[t + 2]); }
    // the drawing itself, per part, from the line ribbons (x, y, nx, ny, part; two vertices a point): every triangle spans two points of a stroke.
    // The newer species have no fill at all, only this; where both exist the lines are tried first (they carry the inner lines too)
    const strokes = strokesOf(sp), fixed = env.fixed;   // fixed: outlines closed for a part whose drawing leaves it open (packages/kit/data/core-outlines.js)
    const out = [], idx = [], tally = { parts: sp.parts, cored: 0, reused: 0, rigid: 0, thin: 0, frame: 0, open: 0, failed: 0, lines: 0, fromLines: 0, openParts: [] }, bakes = new Map(), SPAN = sp.bounds[2] - sp.bounds[0];
    // how this species is made solid (opts.shape[key], packages/kit/data/creature-shapes.js; every field optional): mode (belly, blade, plate), thick, inner, crease, edge,
    // cap (deepest, of the body's length), wingThick, wings, res (mesh detail, 1 as built). parts[name]: the same for one part, and `as`: solid, tube or lines
    const SH = (opts.shape && opts.shape[sp.key]) || {}, PP = SH.parts || {}, CAP = (SH.cap ?? 0.07) * LEN; let H = 0, nv = 0;   // tally: what became of each part
    for (let pi = 0; pi < sp.parts; pi++) {
      const ps = PP[sp.ids ? sp.ids[pi] : pi] || PP[pi] || {}; if (ps.as === 'lines') { tally.lines++; continue; }   // left as its drawing
      const g = pt[pi * W], isRigid = (g > 1.5 && g < 2.5) || g > 3.5; if (isRigid) { tally.rigid++; if ((SH.wings ?? opts.wings) === false && ps.as !== 'solid') continue; }   // rigid: a fin, a wing. Solid too, but thin (opts.wingThick of a body's depth; opts.wings false: they stay lines)
      const T = tris.get(pi) || [], loops = [];
      // the rim of the fill: edges used by one triangle, by position (the fill repeats vertices), chained into loops
      { const key = (i) => Math.round(fillV[i * 3] * 4) + "," + Math.round(fillV[i * 3 + 1] * 4), E = new Map();
        for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) { const a = T[t + e], b = T[t + (e + 1) % 3], ka = key(a), kb = key(b); if (ka === kb) continue; const k = ka < kb ? ka + "|" + kb : kb + "|" + ka; const h = E.get(k); if (h) h.n++; else E.set(k, { n: 1, a, b, ka, kb }); }
        const nx = new Map(); for (const e of E.values()) if (e.n === 1) { (nx.get(e.ka) || nx.set(e.ka, []).get(e.ka)).push(e); (nx.get(e.kb) || nx.set(e.kb, []).get(e.kb)).push(e); }
        const used = new Set();
        for (const e0 of E.values()) { if (e0.n !== 1 || used.has(e0)) continue; const pts = [fillV[e0.a * 3], fillV[e0.a * 3 + 1]]; let at = e0.kb, vi = e0.b; used.add(e0);
          for (let guard = 0; guard < 20000; guard++) { pts.push(fillV[vi * 3], fillV[vi * 3 + 1]); if (at === e0.ka) break; const nxt = (nx.get(at) || []).find((q) => !used.has(q)); if (!nxt) break; used.add(nxt); if (nxt.ka === at) { at = nxt.kb; vi = nxt.b; } else { at = nxt.ka; vi = nxt.a; } }
          if (pts.length >= 8) loops.push(pts); } }
      const own = strokes.get(pi) || [], drawn = fixed[pi] ? fixed[pi].concat(own) : own, tries = [drawn, loops].filter((q) => q.length);
      if (!tries.length) { tally.open++; continue; }
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const l of tries[0]) for (let i = 0; i < l.length; i += 2) { x0 = Math.min(x0, l[i]); x1 = Math.max(x1, l[i]); y0 = Math.min(y0, l[i + 1]); y1 = Math.max(y1, l[i + 1]); }
      if (ps.as !== 'solid' && (ps.as === 'tube' || Math.min(x1 - x0, y1 - y0) < 0.012 * LEN)) {   // a thread (a barbel, a tendril): too thin to round from its outline, so a thin tube is run along each of its strokes
        const r = Math.max(0.003 * LEN, Math.min(0.008 * LEN, Math.min(x1 - x0, y1 - y0) * 0.5)) * (ps.thick ?? 1), SIDES = 6; let made = 0;
        for (const pl of tries[0]) { const m = pl.length / 2, st = Math.max(1, Math.ceil(m / 48)), pts = []; for (let i = 0; i < m; i += st) pts.push([pl[i * 2], pl[i * 2 + 1]]); const last = [pl[m * 2 - 2], pl[m * 2 - 1]]; if (pts[pts.length - 1][0] !== last[0] || pts[pts.length - 1][1] !== last[1]) pts.push(last);
          if (pts.length < 2) continue; const base = nv;
          for (let q = 0; q < pts.length; q++) { const a = pts[Math.max(0, q - 1)], b = pts[Math.min(pts.length - 1, q + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl; const taper = q === 0 || q === pts.length - 1 ? 0.35 : 1;
            for (let k2 = 0; k2 < SIDES; k2++) { const an = (k2 / SIDES) * Math.PI * 2, c = Math.cos(an), sn = Math.sin(an); out.push(pts[q][0] - ty * c * r * taper, pts[q][1] + tx * c * r * taper, pi, sn * r * taper, -ty * c, tx * c, sn); } nv += SIDES; }
          for (let q = 0; q + 1 < pts.length; q++) for (let k2 = 0; k2 < SIDES; k2++) { const a = base + q * SIDES + k2, b = base + q * SIDES + (k2 + 1) % SIDES, c = a + SIDES, d = b + SIDES; idx.push(a, b, c, b, d, c); }
          made++; H = Math.max(H, r); }
        if (made) tally.thin++; else tally.open++; continue; }
      if (x1 - x0 > 0.9 * SPAN && y1 - y0 > 0.9 * LEN) { tally.frame++; continue; }   // as big as the whole creature: a frame round it (some species carry one as their first part), not a body
      // the same drawing again in this species (a repeated segment or stud), or its mirror (the other side's part): its solid is reused, moved, or flipped
      const key = (fx) => tries[0].map((f) => { let q = ""; for (let i = 0; i < f.length; i += 2) q += Math.round(fx ? x1 - f[i] : f[i] - x0) + "," + Math.round(f[i + 1] - y0) + ";"; return q; }).sort().join("|");
      // what PartSolid is asked for: the part's own setting, else the species', else the tank's
      const bp = { mode: ps.mode || SH.mode || "belly", thick: ps.thick ?? SH.thick ?? opts.thick ?? 0.7, inner: ps.inner ?? SH.inner ?? 0.2, crease: ps.crease ?? SH.crease ?? 0.3, edge: ps.edge ?? SH.edge ?? 0.05 }, rk = ps.res ?? SH.res ?? 1, bk = "#" + JSON.stringify(bp) + rk;
      const kA = key(false) + bk, seen = bakes.get(kA) || bakes.get(key(true) + bk), flip = !!seen && !bakes.has(kA);
      if (seen) { tally.cored++; tally.reused++; const { P, I, N, bx, by } = seen, n = P.length / 3;
        for (let i = 0; i < n; i++) { const u = P[i * 3] - bx; out.push(flip ? x1 - u : x0 + u, y0 + P[i * 3 + 1] - by, pi, P[i * 3 + 2], flip ? -N[i * 3] : N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); H = Math.max(H, Math.abs(P[i * 3 + 2])); }
        for (let t = 0; t < I.length; t++) idx.push(I[t] + nv); nv += n; continue; }
      let so = null, hadOutline = false;
      for (const polys of tries) { try { const part = PS.read(polys, { join: polys.length <= 240 });   // joining loose strokes into an outline costs the square of their number: not for a drawing of a thousand strokes
          if (part.outer.length) { hadOutline = true; so = PS.build(part, { mode: bp.mode, thick: bp.thick, inner: bp.inner, crease: bp.crease, edge: bp.edge, res: Math.max(8, Math.round(rk * (opts.res ?? (opts.light ? Math.max(14, Math.min(40, 40 * Math.sqrt(Math.max(x1 - x0, y1 - y0) / (0.25 * LEN)))) : 40)))), grid: opts.grid ?? 224 * Math.sqrt(Math.max(x1 - x0, y1 - y0) / (0.25 * LEN)) }); } } catch (e) { so = null; }   // grid: a part a quarter of the body long or more gets the full 224 cells; smaller ones fewer (the solve costs the square)
        if (so) { if (polys === drawn) tally.fromLines++; break; } }
      if (!so && !hadOutline) { tally.open++; tally.openParts.push(pi); continue; }
      if (!so) { tally.failed++; continue; }
      tally.cored++;
      const P = so.positions, I = so.indices, n = P.length / 3, N = new Float32Array(n * 3);
      // no deeper than CAP (7% of the body's length): a wide plate would otherwise swell into a slab as deep as it is wide
      { let zm = 0; for (let i = 2; i < P.length; i += 3) zm = Math.max(zm, Math.abs(P[i])); if (zm > CAP) { const zk = CAP / zm; for (let i = 2; i < P.length; i += 3) P[i] *= zk; } }
      if (isRigid) { const wk = SH.wingThick ?? opts.wingThick ?? 0.3; for (let i = 2; i < P.length; i += 3) P[i] *= wk; }   // a wing or fin is a membrane, not a body
      for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;   // normals in (sheet x, sheet y, height): sheet y is cy - Y
        const ux = P[b] - P[a], uy = -(P[b + 1] - P[a + 1]), uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = -(P[c + 1] - P[a + 1]), vz = P[c + 2] - P[a + 2];
        const qx = uy * vz - uz * vy, qy = uz * vx - ux * vz, qz = ux * vy - uy * vx; for (const i of [a, b, c]) { N[i] += qx; N[i + 1] += qy; N[i + 2] += qz; } }
      for (let i = 0; i < n; i++) { let ax = N[i * 3], ay = N[i * 3 + 1], az = N[i * 3 + 2]; const l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l; if (az * P[i * 3 + 2] < 0) { ax = -ax; ay = -ay; az = -az; }   // outward: away from the plane
        out.push(so.cx + P[i * 3], so.cy - P[i * 3 + 1], pi, P[i * 3 + 2], ax, ay, az); H = Math.max(H, Math.abs(P[i * 3 + 2])); }
      { const Q = new Float32Array(n * 3), M = new Float32Array(n * 3);   // kept for a repeat: each point's (x, y, height) and normal, as placed here
        for (let i = 0; i < n; i++) { const o7 = (nv + i) * 7; Q[i * 3] = out[o7]; Q[i * 3 + 1] = out[o7 + 1]; Q[i * 3 + 2] = out[o7 + 3]; M[i * 3] = out[o7 + 4]; M[i * 3 + 1] = out[o7 + 5]; M[i * 3 + 2] = out[o7 + 6]; }
        bakes.set(kA, { P: Q, I, N: M, bx: x0, by: y0 }); }
      for (let t = 0; t < I.length; t++) idx.push(I[t] + nv); nv += n;
    }
    // for an editor (opts.wire): how many triangles each part came to, and the mesh's edges are uploaded too (uploadCore)
    if (opts.wire) { const pt3 = new Uint32Array(sp.parts); for (let t = 0; t < idx.length; t += 3) pt3[Math.round(out[idx[t] * 7 + 2])]++; tally.partTris = pt3; }
    return { data: new Float32Array(out), idx: new Uint32Array(idx), H, verts: nv, tally, wire: !!opts.wire };
  }
  function uploadCore(gl, c) {
    const { H, verts: nv, tally } = c; if (!nv) return { count: 0, H: 0, verts: 0, tally };
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const F = 4, st = 7 * F;
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, c.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, st, 2 * F);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 3 * F); gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, st, 4 * F);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, c.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const core = { vao, bufs: [vb, ib], count: c.idx.length, H, verts: nv, tally };
    if (c.wire) {   // the same vertices, an index of every triangle's three edges: drawn as lines over the solid (render.edit.wire)
      const E = new Uint32Array(c.idx.length * 2); for (let t = 0, k = 0; t < c.idx.length; t += 3) { const a = c.idx[t], b = c.idx[t + 1], d = c.idx[t + 2]; E[k++] = a; E[k++] = b; E[k++] = b; E[k++] = d; E[k++] = d; E[k++] = a; }
      const wv = gl.createVertexArray(); gl.bindVertexArray(wv); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, st, 2 * F);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 3 * F); gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, st, 4 * F);
      const wb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, E, gl.STATIC_DRAW); gl.bindVertexArray(null);
      core.wire = { vao: wv, count: E.length }; core.bufs.push(wb); core.vaos = [wv]; }
    return core;
  }

  // ---- cores built off the page's thread ----
  // Building a core takes up to a second (more on a phone), and on the page's own thread that freezes it. A worker made from this
  // file, PartSolid and Delaunator (found by their script tags) runs computeCore and hands back the arrays; the page uploads them.
  // Until then the species is drawn in lines. Where a worker cannot be made (no script tags to find, a page that forbids workers),
  // or it fails, cores are built on the page's thread as before. render.coreWorker: false asks for that.
  const SELF_SRC = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;
  function coreWorker(r) {
    if (r.coreW !== undefined) return r.coreW;
    r.coreW = null; if (typeof Worker === 'undefined' || typeof document === 'undefined' || !SELF_SRC) return null;
    const src = (re) => { const el = [...document.querySelectorAll('script[src]')].find((s) => re.test(s.src)); return el && el.src; }, ps = src(/part-solid\.js/), dl = src(/delaunator/);
    if (!ps || !dl) return null;
    const code = `self.window = self; importScripts(${JSON.stringify(dl)}, ${JSON.stringify(ps)}, ${JSON.stringify(SELF_SRC)});
      onmessage = (e) => { const { id, sp, opts, env } = e.data; let c = null, err = null; try { c = self.EcologyRender.computeCore(sp, opts, env); } catch (x) { err = String(x && x.message || x); }
        postMessage({ id, c, err }, c && c.data ? [c.data.buffer, c.idx.buffer] : []); };`;
    try { const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), w = new Worker(url);
      const jobs = new Map(); let n = 0;
      w.onmessage = (e) => { const j = jobs.get(e.data.id); jobs.delete(e.data.id); if (j) j(e.data); };
      w.onerror = (e) => { e.preventDefault && e.preventDefault(); r.coreW = null; for (const j of jobs.values()) j({ c: null, err: 'worker failed' }); jobs.clear(); };
      r.coreW = { run: (sp, opts, env, done) => { const id = ++n; jobs.set(id, done);
        const L = lineArrays(sp), lite = { key: sp.key, parts: sp.parts, ids: sp.ids, bounds: sp.bounds, fillV: sp.fillV, fillI: sp.fillI, __lines: { V: L.V.slice(), I: L.I.slice() } };   // copies: the page keeps its own
        w.postMessage({ id, sp: lite, opts, env }, [lite.__lines.V.buffer, lite.__lines.I.buffer]); } };
    } catch (e) { r.coreW = null; }
    return r.coreW;
  }
  // a species' core: from the worker when there is one (sp.core stays undefined until it arrives, and the species is drawn in lines),
  // else built here and now
  const freeCore = (gl, c) => { if (!c || !c.vao) return; gl.deleteVertexArray(c.vao); for (const v of c.vaos || []) gl.deleteVertexArray(v); for (const b of c.bufs || []) gl.deleteBuffer(b); };
  // the cores are built for one set of options (render.core); a change builds them again. The old one is drawn until the new one is ready,
  // so a dial turned in an editor does not blink the creature back to lines
  function staleCores(r, gl, render) { const ck = JSON.stringify(render.core || {});
    if (r.coreKey !== undefined && r.coreKey !== ck) for (const sp of r.species) { if (sp.core && sp.core.vao) { freeCore(gl, sp.coreOld); sp.coreOld = sp.core; } else if (sp.core !== undefined && !sp.coreOld) sp.coreVAO = undefined; sp.core = undefined; }   // one still being built is left to finish: its result is dropped (needCore's done) and the next is asked for then, so only one is ever in flight
    r.coreKey = ck; }
  function needCore(r, gl, i, opts, render) {
    const sp = r.species[i]; if (sp.core !== undefined || sp.corePending) return;
    const W = render.coreWorker === false ? null : coreWorker(r), key = r.coreKey;
    const done = (c) => { sp.corePending = false; if (r.coreKey !== key) return; const had = !!sp.coreOld; freeCore(gl, sp.coreOld); sp.coreOld = null; sp.core = c ? uploadCore(gl, c) : null; sp.coreT0 = had ? { x: 1, last: performance.now() } : undefined;   // one that replaces another does not fade in again
      sp.wireVAO = sp.core && sp.core.wire ? sp.core.wire : undefined; sp.coreVAO = sp.core && sp.core.count ? sp.core : { count: 0 }; };
    if (!W) { done(computeCore(r.ES.SPECIES[i], opts, coreEnv(r.ES.SPECIES[i]))); return; }
    sp.corePending = true; const S = r.ES.SPECIES[i];
    W.run(S, opts, coreEnv(S), (m) => { if (m.err === 'worker failed') { sp.corePending = false; return; } done(m.c); });   // failed: next frame builds it here (the worker is gone)
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
    const coreProg = program(gl, CORE_VS, CORE_FS);
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
      snowProg, carcassProg, fillProg, lineProg, coreProg, ptProg, blurProg, compProg, glowCompProg, fadeProg,
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
    const dt = r.lastT == null ? 0 : Math.max(0, Math.min(0.05, time - r.lastT)); r.lastT = time;
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
      const sw = SPECIES[f.sp].swim, bl = window.EcologySim.bodyLen(sim, f), A = opt.wiggle * bl * sw.amp * (1 - 0.8 * (f.ground || 0));   // walking: the body is carried, not waved
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
      r.spineData[row + K * 4 + 2] = f.hidden ? 0 : bl / rsp.LEN;   // hidden: a host's guest it draws itself
      { const lit = opt.lit != null ? Math.max(opt.lit, rsp.glow) : Math.max(rsp.glow, 1 - 0.8 * f.z);   // opt.lit: a host with no depth gloom (creatures in open air) lights them evenly
        const beh = sim.speciesRT[f.sp].beh;
        const bk = opt.beh === 'on' && beh && beh.blink ? 0.35 + 0.9 * Math.pow(0.5 + 0.5 * Math.sin(time * beh.blink + f.seed * 3), 3) : 1;
        r.spineData[row + K * 4 + 3] = lit * lit * (f.darkRoll < opt.dark ? 0.09 : 1) * (1 - 0.85 * f.cloak) * bk * f.fade * (1 + 0.8 * f.gulp); }
      r.spineData[row + (K + 1) * 4] = f.tuck; r.spineData[row + (K + 1) * 4 + 1] = f.turnS;
      r.spineData[row + (K + 1) * 4 + 2] = f.puff; r.spineData[row + (K + 1) * 4 + 3] = f.alert;
      r.spineData[row + (K + 2) * 4] = f.glide; r.spineData[row + (K + 2) * 4 + 1] = f.flap;
      // walking legs: feet planted on the tank plane, posed on the spine as just written
      if (WALK()) WALK().write(r.spineData, row, f, SPECIES[f.sp], (k) => [r.spineData[row + k * 4], r.spineData[row + k * 4 + 1]],
        bl / rsp.LEN, dt, opt.walk, K, rsp.BY0, rsp.LEN);
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
    // panX/panY (world units, default 0) shift the look-at point off the tank's centre — the drag-to-pan
    // and Follow-a-creature controls on the Ecology page both work by setting these every frame.
    const c = [worldW / 2 + (cfg.panX || 0), worldH / 2 + (cfg.panY || 0), cfg.z != null ? cfg.z : worldD * 0.45];   // cfg.z: the depth to look at (a camera following one creature looks at its depth)
    const eye = [c[0] + Math.sin(yaw) * Math.sin(tilt) * dist, c[1] + Math.cos(yaw) * Math.sin(tilt) * dist, c[2] - Math.cos(tilt) * dist];
    const view = M4.look(eye, c, [-Math.sin(yaw), -Math.cos(yaw), -0.25]);
    const proj = M4.persp(fov, aspect, dist * 0.1, Math.max(dist, frameDist) * 4 + worldD * 2);
    return { vp: M4.mul(proj, view), eye, shift: 0, shiftX: 0, refDist: cfg.refDist || frameDist,
      px: Math.tan(fov / 2) * dist / (pxH / 2) };   // px: one device pixel in tank units, at the depth the camera looks at   // cfg.refDist: the distance at which points (snow, shimmer) are their set size; a camera zoomed far in on one creature gives its own, or they swell with the zoom
  }

  // a creature's line is one CSS pixel wide at the depth the camera looks at: the half-width in tank units (never under 1.25 device pixels
  // across, or a ribbon thinner than the pixel grid breaks into dashes)
  const onePx = (cam, dpr) => (cam.px || 1) * Math.max(1, dpr || 1) * 0.5;   // half a line's width: one CSS pixel wide (was at least 1.25 device pixels)
  function camUniforms(gl, u, cam, irisMode) {
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uCam, cam.eye);
    gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX); gl.uniform1f(u.uRefDist, cam.refDist);
    if (u.uIrisMode) gl.uniform1f(u.uIrisMode, irisMode || 0);
    if (u.uTerrA) { const T = cam.terrain; gl.uniform4f(u.uTerrA, T ? T.w : 0, T ? T.h : 0, T ? T.d : 1, T ? T.n : 0); gl.uniform1i(u.uTerr, 3); if (T) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.tex); } }
  }
  // A ground for the tank floor to follow (drawInto only). heights: Float32Array n*n, row v then column u over the tank's
  // x, y; each value is how far the floor is raised there, in tank depth units. Creatures near the floor ride it.
  function terrain(r, n, heights, tank) {
    const gl = r.gl; if (!r.terr) r.terr = { tex: gl.createTexture() };
    gl.bindTexture(gl.TEXTURE_2D, r.terr.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, n, n, 0, gl.RED, gl.FLOAT, heights);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    Object.assign(r.terr, { n, w: tank.w, h: tank.h, d: tank.d });
  }

  function frame(r, opt) {
    const gl = r.gl, sim = opt.sim, t = opt.time;
    const render = Object.assign({ glow: 1.2, iris: 0.95, shimmer: 0.1, trail: 0, dark: 0.3, wings: 1, snow: true, carcasses: true, irisMode: 0, waterAlpha: 0.82 }, opt.render || {});
    // render.edit, an editor's view of the solids (Specimen's Shape tab): rise (0 flat to 1 as built), pick (a part's number, lit amber), wire (0..1, the mesh's edges),
    // plain (no look on the solids), lines (how strong the drawing is, 0..1)
    const ED = render.edit || null;
    const camCfg = opt.camera || {};
    const worldD = Math.max(60, Math.min(opt.worldW, opt.worldH) * 0.9 * (sim.cfg.dz ?? 0.8));
    const cam = buildCamera(opt.worldW, opt.worldH, worldD, r.canvas.width, r.canvas.height, camCfg);
    const dpr = opt.dpr || 1;

    const runs = writeSpines(r, sim, t, { wiggle: sim.cfg.wiggle ?? 0.03, beh: sim.cfg.beh ?? 'on', dark: render.dark, walk: opt.walk, lit: render.lit });

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
        if (!vao || !vao.count || (filter && !filter(sp))) continue;
        gl.uniform1f(prog.u.uBY0, sp.BY0); gl.uniform1f(prog.u.uLEN, sp.LEN);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sp.partTex); gl.uniform1i(prog.u.uParts, 2);
        gl.uniform4fv(prog.u.uKeyT, sp.keyT); gl.uniform1i(prog.u.uKeyN, sp.keyN);
        gl.uniform1i(prog.u.uRow0, run.row0); gl.uniform1f(prog.u.uWing, sp.wing * render.wings);
        if (prog.u.uColLo) gl.uniform3fv(prog.u.uColLo, sp.colLo);
        if (prog.u.uColHi) gl.uniform3fv(prog.u.uColHi, sp.colHi);
        if (prog.u.uIris) gl.uniform1f(prog.u.uIris, render.iris * (sp.look ? (render.lookIris ?? 0.16) : 1));   // a species wearing a look keeps to its colours: only a little of the rainbow film is left on its lines
        if (prog.u.uFlat) gl.uniform1f(prog.u.uFlat, ED ? 1 - (ED.rise ?? 1) : 0); if (prog.u.uPick) gl.uniform1f(prog.u.uPick, ED && ED.pick >= 0 ? ED.pick + 1 : 0);
        if (which === 'coreVAO') { const L = ED && ED.plain ? null : sp.look; gl.uniform1f(prog.u.uLook, L ? 1 : 0); if (!L) gl.uniform1f(prog.u.uLump, 0); const fade = fadeOf(sp, 'coreT0'); gl.uniform1f(prog.u.uFade, fade);
          if (L) { lookUniforms(gl, prog.u, L, t); if (sp.growOver != null) gl.uniform1f(prog.u.uGrowA, sp.growOver); }
          if (fade < 1 || (L && (L.mat === 2 || L.opac < 1))) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); } }
        { const co = sp.core || sp.coreOld; if (prog.u.uRaise) gl.uniform1f(prog.u.uRaise, coresOn && co && which !== 'coreVAO' && which !== 'wireVAO' ? co.H * 1.05 * (ED ? ED.rise ?? 1 : 1) : 0); }
        gl.bindVertexArray(vao.vao);
        gl.drawElementsInstanced(mode, vao.count, which === 'coreVAO' || which === 'wireVAO' ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0, run.n);
      }
    };
    // render.cores (0..1, how bright): the thick parts solid under the lines. Built per species the first time it is in view
    const coresOn = render.cores > 0 && !!window.PartSolid;
    staleCores(r, gl, render);
    if (coresOn) for (const run of runs) needCore(r, gl, run.sp, render.core || {}, render);

    if (render.glow > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, r.glowA.fb); gl.viewport(0, 0, r.glowA.w, r.glowA.h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.blendEquation(gl.MAX);
      common(r.lineProg, onePx(cam, dpr) * 6, 1); gl.uniform1f(r.lineProg.u.uAlpha, 0.22);
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
    common(r.lineProg, onePx(cam, dpr), 1); gl.uniform1f(r.lineProg.u.uAlpha, 0.9 * (ED ? ED.lines ?? 1 : 1));
    fishPass(r.lineProg, 'lineVAO', gl.TRIANGLES);
    if (coresOn) { common(r.coreProg, 0, 0); gl.uniform1f(r.coreProg.u.uCore, render.cores); gl.uniform1f(r.coreProg.u.uWire, 0); fishPass(r.coreProg, 'coreVAO', gl.TRIANGLES, (sp) => !!sp.coreVAO); gl.disable(gl.BLEND); gl.depthMask(true);
      // an editor's wireframe: every triangle's edges over the solid (cores built with render.core.wire carry them)
      if (ED && ED.wire > 0) { gl.depthFunc(gl.LEQUAL); gl.uniform1f(r.coreProg.u.uWire, ED.wire); fishPass(r.coreProg, 'wireVAO', gl.LINES); gl.uniform1f(r.coreProg.u.uWire, 0); gl.depthFunc(gl.LESS); } }
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
    gl.uniform1f(r.compProg.u.uBaseAlpha, render.waterAlpha);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // Draw the creatures into whatever framebuffer is bound, with the caller's own camera, depth-tested against what is
  // already there. For a 3D host that shares this GL context (a three.js scene): no glow, trail or composite passes,
  // only the rigged line and fill passes (and the shimmer points), so a tower in front of a creature hides it.
  //   drawInto(r, { sim, time, vp (Float32Array 16, tank space -> clip), eye ([x, y, z] in tank space), refDist, dpr?, lineW?, render? (iris, shimmer, dark, wings, irisMode, lit: light every creature evenly at this level, 0..1) })
  // After EcologyRender.terrain(r, n, heights, { w, h, d }) the creatures near the tank floor follow that ground.
  // The host restores its own GL state afterwards (three.js: renderer.resetState()).
  function drawInto(r, opt) {
    const gl = r.gl, sim = opt.sim, t = opt.time, render = Object.assign({ iris: 0.95, shimmer: 0.1, dark: 0.3, wings: 1, irisMode: 0 }, opt.render || {});
    const cam = { vp: opt.vp, eye: opt.eye, shift: opt.shift || 0, shiftX: opt.shiftX || 0, refDist: opt.refDist || 1, terrain: r.terr || null }, dpr = opt.dpr || 1;   // shift, shiftX: a host that moves its picture on screen (clip-space offsets, as camUniforms gives)
    // opt.spine { tex, runs }: a host that writes the spines itself (the same layout as writeSpines: the Maw game, with its own lighting) lends its texture
    const runs = opt.spine ? opt.spine.runs : writeSpines(r, sim, t, { wiggle: sim.cfg.wiggle ?? 0.03, beh: sim.cfg.beh ?? 'on', dark: render.dark, walk: opt.walk, lit: render.lit }), spineTex = opt.spine ? opt.spine.tex : r.spineTex;
    syncSpecies(r);
    // render.cores (0..1, how bright): solid cores, as frame() draws them; the lines are lifted onto them
    const coresOn = render.cores > 0 && !!window.PartSolid;
    staleCores(r, gl, render);
    if (coresOn) for (const run of runs) if (r.species[run.sp]) needCore(r, gl, run.sp, render.core || {}, render);
    const common = (prog, lineW, layer) => {
      gl.useProgram(prog.p);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, spineTex); gl.uniform1i(prog.u.uSpine, 1);
      gl.uniform2f(prog.u.uRes, r.canvas.width, r.canvas.height); camUniforms(gl, prog.u, cam, render.irisMode);
      gl.uniform1f(prog.u.uLineW, lineW); gl.uniform1f(prog.u.uLayer, layer);
      gl.uniform1f(prog.u.uZScale, 1 / (r.maxFish * 256 + 4)); gl.uniform1f(prog.u.uTime, t);
      if (prog.u.uIris) { gl.uniform1f(prog.u.uIris, render.iris); gl.uniform1f(prog.u.uTimeF, t); }
      if (prog.u.uPtSize) gl.uniform1f(prog.u.uPtSize, Math.max(1.5, (sim.cfg.size || 70) / 45) * dpr);
    };
    const fishPass = (prog, which, mode, filter) => {
      for (const run of runs) {
        const sp = r.species[run.sp], vao = sp && sp[which];
        if (!vao || !vao.count || (filter && !filter(sp))) continue;
        gl.uniform1f(prog.u.uBY0, sp.BY0); gl.uniform1f(prog.u.uLEN, sp.LEN);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sp.partTex); gl.uniform1i(prog.u.uParts, 2);
        gl.uniform4fv(prog.u.uKeyT, sp.keyT); gl.uniform1i(prog.u.uKeyN, sp.keyN);
        gl.uniform1i(prog.u.uRow0, run.row0); gl.uniform1f(prog.u.uWing, sp.wing * render.wings);
        if (prog.u.uColLo) gl.uniform3fv(prog.u.uColLo, sp.colLo);
        if (prog.u.uColHi) gl.uniform3fv(prog.u.uColHi, sp.colHi);
        if (prog.u.uIris) gl.uniform1f(prog.u.uIris, render.iris * (sp.look ? (render.lookIris ?? 0.16) : 1));
        if (which === 'coreVAO') { const L = sp.look; gl.uniform1f(prog.u.uLook, L ? 1 : 0); if (!L) gl.uniform1f(prog.u.uLump, 0); const fade = fadeOf(sp, 'coreT0'); gl.uniform1f(prog.u.uFade, fade); if (L) { lookUniforms(gl, prog.u, L, t); if (sp.growOver != null) gl.uniform1f(prog.u.uGrowA, sp.growOver); }
          if (fade < 1 || (L && (L.mat === 2 || L.opac < 1))) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); } }
        { const co = sp.core || sp.coreOld; if (prog.u.uRaise) gl.uniform1f(prog.u.uRaise, coresOn && co && which !== 'coreVAO' ? co.H * 1.05 : 0); }
        gl.bindVertexArray(vao.vao);
        gl.drawElementsInstanced(mode, vao.count, which === 'coreVAO' ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0, run.n);
      }
    };
    gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
    common(r.lineProg, opt.lineW || (opt.px ? opt.px * Math.max(1.25, dpr) * 0.5 : Math.max(0.35, Math.min(0.8, (sim.cfg.size || 70) / 220))), 1);   // opt.px: one device pixel in the host's tank units, for a 1 px line
    gl.uniform1f(r.lineProg.u.uAlpha, opt.alpha || 0.9);
    fishPass(r.lineProg, 'lineVAO', gl.TRIANGLES);
    if (coresOn) { common(r.coreProg, 0, 0); gl.uniform1f(r.coreProg.u.uCore, render.cores); fishPass(r.coreProg, 'coreVAO', gl.TRIANGLES, (sp) => !!sp.coreVAO); gl.disable(gl.BLEND); gl.depthMask(true); }
    common(r.fillProg, 0, 0);
    fishPass(r.fillProg, 'fillVAO', gl.TRIANGLES, (sp) => sp.lineVAO.count === 0);
    if (render.shimmer > 0) {
      gl.depthMask(false); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      common(r.ptProg, 0, 1); gl.uniform1f(r.ptProg.u.uAlpha, render.shimmer);
      fishPass(r.ptProg, 'ptsVAO', gl.POINTS);
      gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
    }
    gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
  }


  // Line art over the frame just drawn (a host's own creatures that are not spine-rigged meshes: the floor walkers, the Maw).
  //   lines(r, { sim, worldW, worldH, camera }, { data: Float32Array of x, y, z, 1 per vertex in tank space, verts, batches: [{ start, count, color: [r, g, b] }] }, alpha?)
  // The same camera as frame() is built from the same options, so call it straight after frame() with them.
  const LINES_VS = `#version 300 es
precision highp float; layout(location=0) in vec4 aPos; uniform mat4 uVP; out float vA; void main() { vA = aPos.w; gl_Position = uVP * vec4(aPos.xyz, 1.0); }`;   // a point's fourth number: how bright (1 unless the caller fades by depth, as EcologyFlora does)
  const LINES_FS = `#version 300 es
precision mediump float; uniform vec4 uCol; in float vA; out vec4 o; void main() { o = vec4(uCol.rgb, uCol.a * vA); }`;
  // solid meshes in a host's own space (the walkers' bodies, EcologyWalkers.solids): lit like a core, in the walker's colour, drawn over the tank
  // with a depth of their own. Line art drawn after this (lines) lies over them. Each mesh is uploaded once.
  const SOLID_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; layout(location=1) in vec3 aN; uniform mat4 uVP, uM; uniform vec4 uHost; uniform float uQk, uShift, uShiftX; out vec3 vW; out vec3 vN; out vec2 vQ; out vec3 vP3; out float vUpB;
${LUMP_GL}
void main() { vQ = vec2(abs(aPos.x), aPos.z) * uQk; vP3 = vec3(aPos.x, aPos.z, aPos.y) * uQk; vUpB = aN.y; vec4 w = uM * vec4(aPos + aN * lumpOf(vP3) / max(1e-6, uQk), 1.0); vec3 t = vec3(w.x / uHost.x + uHost.y, w.z / uHost.x + uHost.z, uHost.w - w.y / uHost.x); vec3 n = mat3(uM) * aN; vN = vec3(n.x, n.z, -n.y); vW = t; gl_Position = uVP * vec4(t, 1.0); gl_Position.y += uShift * gl_Position.w; gl_Position.x += uShiftX * gl_Position.w; }`;
  const SOLID_FS = `#version 300 es
precision mediump float; uniform vec3 uCol; uniform highp vec3 uCam; uniform float uLook, uFade; in highp vec3 vW; in vec3 vN; in vec2 vQ; in vec3 vP3; in float vUpB; out vec4 o;
${LOOK}
void main() { vec3 n = normalize(vN), V = normalize(uCam - vW); if (dot(n, V) < 0.0) n = -n; if (uLook > 0.5) { lkP = vP3; lkUp = vUpB; lkW = vW; o = look(n, V, vQ, 1.0); o.a *= uFade; return; } vec3 Ld = normalize(vec3(-0.3, -0.42, -0.86));
  float d = max(0.0, dot(n, Ld)), ndv = dot(n, V), wrap = d * 0.75 + 0.25 * (0.5 - 0.5 * n.z);
  vec3 c = mix(uCol * 0.07 + vec3(0.012, 0.012, 0.02), uCol * 0.62 + 0.05, wrap * wrap);
  c += uCol * pow(1.0 - ndv, 2.4) * 0.35 + pow(max(0.0, dot(reflect(-Ld, n), V)), 26.0) * 0.3; o = vec4(c, uFade); }`;
  // a soft fade-in: 0 to 1 over FADE_MS from the moment a core or solid is first ready (window.EcologyRender.FADE_MS = 0 turns it off)
  const FADE = { ms: 900 };
  // starts at the first frame the thing is actually drawn, and a long hitch (the upload itself) counts for at most 50 ms, so the fade is seen
  const fadeOf = (o, k) => { if (!FADE.ms) return 1; const now = performance.now(), st = o[k] || (o[k] = { x: 0, last: now }), dt = now - st.last;
    if (dt > 4) { st.x = Math.min(1, st.x + Math.min(dt, 50) / FADE.ms); st.last = now; } const x = st.x; return x * x * (3 - 2 * x); };
  function solids(r, opt, S) {
    if (!S || !S.list || !S.list.length) return; const gl = r.gl;
    if (!r.solidProg) { r.solidProg = program(gl, SOLID_VS, SOLID_FS); r.solidVAOs = new Map(); }
    const cam = opt.vp ? { vp: opt.vp, eye: opt.eye } : buildCamera(opt.worldW, opt.worldH, Math.max(60, Math.min(opt.worldW, opt.worldH) * 0.9 * (opt.sim.cfg.dz ?? 0.8)), r.canvas.width, r.canvas.height, opt.camera || {}), P = r.solidProg;   // opt.vp, opt.eye: a host's own camera (drawInto's)
    if (!opt.keepDepth) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, r.canvas.width, r.canvas.height); gl.clearDepth(1); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); }   // keepDepth: into the bound framebuffer, against what is already drawn there
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.BLEND);
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, cam.vp); gl.uniform3fv(P.u.uCam, cam.eye); gl.uniform4f(P.u.uHost, S.ks, S.tw2, S.th2, S.fz); gl.uniform1f(P.u.uShift, opt.shift || 0); gl.uniform1f(P.u.uShiftX, opt.shiftX || 0);
    // S.look: the look of every solid here (the walkers shown are one species); an item's own look (it.look) wins, so the Maw can wear its own beside the crew.
    // S.qk / it.qk: 1 / body length, for the pattern
    let cur;
    const wearL = (L, qk) => { if (L === cur && qk === wearL.qk) return; cur = L; wearL.qk = qk; gl.disable(gl.BLEND); gl.depthMask(true); gl.uniform1f(P.u.uLook, L ? 1 : 0); gl.uniform1f(P.u.uQk, qk || 1);
      if (L) { lookUniforms(gl, P.u, L, opt.time || 0); if (S.grow != null) gl.uniform1f(P.u.uGrowA, S.grow); if (L.mat === 2 || L.opac < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } } else gl.uniform1f(P.u.uLump, 0); };   // S.grow: growth from outside, as setGrowth

    const frameN = (r.solidFrame = (r.solidFrame || 0) + 1);
    for (const it of S.list) { let v = r.solidVAOs.get(it.mesh);
      if (!v) { const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, it.mesh.pos, it.mesh.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, it.mesh.nrm, it.mesh.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, it.mesh.idx, gl.STATIC_DRAW); gl.bindVertexArray(null);
        r.solidVAOs.set(it.mesh, (v = { vao, count: it.mesh.idx.length, bufs: [pb, nb, ib], ver: it.mesh.ver })); it.mesh.fresh = false; }
      else if (it.mesh.dynamic && it.mesh.fresh) { it.mesh.fresh = false; v.count = it.mesh.idx.length; v.ver = it.mesh.ver; gl.bindBuffer(gl.ARRAY_BUFFER, v.bufs[0]); gl.bufferData(gl.ARRAY_BUFFER, it.mesh.pos, gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, v.bufs[1]); gl.bufferData(gl.ARRAY_BUFFER, it.mesh.nrm, gl.DYNAMIC_DRAW); gl.bindVertexArray(v.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, v.bufs[2]); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, it.mesh.idx, gl.DYNAMIC_DRAW); gl.bindVertexArray(null); }   // a dynamic mesh that changed size
      else if (it.mesh.dynamic && v.ver !== it.mesh.ver) { v.ver = it.mesh.ver; gl.bindBuffer(gl.ARRAY_BUFFER, v.bufs[0]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, it.mesh.pos); gl.bindBuffer(gl.ARRAY_BUFFER, v.bufs[1]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, it.mesh.nrm); }   // a posed leg (SkinLeg): new points every frame
      v.seen = frameN; const fade = fadeOf(v, 't0');
      wearL(it.look !== undefined ? it.look : (S.look || null), it.qk || S.qk);
      gl.uniform1f(P.u.uFade, fade); if (fade < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      gl.uniformMatrix4fv(P.u.uM, false, it.matrix); gl.uniform3f(P.u.uCol, it.color[0], it.color[1], it.color[2]);
      gl.bindVertexArray(v.vao); gl.drawElements(gl.TRIANGLES, v.count, gl.UNSIGNED_INT, 0); if (fade < 1) { cur = undefined; gl.disable(gl.BLEND); gl.depthMask(true); } }
    gl.bindVertexArray(null); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    if (frameN % 120 === 0) for (const [m, v] of r.solidVAOs) if (frameN - v.seen > 600) { gl.deleteVertexArray(v.vao); for (const b of v.bufs) gl.deleteBuffer(b); r.solidVAOs.delete(m); }   // not drawn for 600 frames: freed
  }
  // a look's uniforms (the LOOK block), for a species' core and for a solid alike
  function lookUniforms(gl, u, L, t) { gl.uniform3fv(u.uPal, L.pal); gl.uniform1f(u.uMat, L.mat); gl.uniform1f(u.uPat, L.pat); gl.uniform1f(u.uSeedL, L.seed); gl.uniform1f(u.uVein, L.vein); gl.uniform1f(u.uFres, L.fres);
    gl.uniform1f(u.uOpac, L.opac); gl.uniform1f(u.uVSize, L.vsize); gl.uniform1f(u.uEmis, L.emis); gl.uniform1f(u.uTimeL, t);
    gl.uniform1f(u.uGrain, L.grain); gl.uniform1f(u.uRough, L.rough); gl.uniform1f(u.uSeedG, L.seed); gl.uniform1f(u.uGrow, L.grow); gl.uniform1f(u.uGrowA, L.growA); gl.uniform1f(u.uGrowP, L.growP); gl.uniform3fv(u.uGrowC, L.growC);
    gl.uniform1f(u.uPaint, L.paint); gl.uniform1f(u.uPaintS, L.paintS); gl.uniform1f(u.uPaintB, L.paintB); gl.uniform1f(u.uPaintW, L.paintW); gl.uniform1f(u.uPaintT, L.paintT); gl.uniform1f(u.uPaintD, L.paintD); gl.uniform1f(u.uPaintO, L.paintO);   // the painted layer, over any material
    gl.uniform1f(u.uLump, L.lump); gl.uniform1f(u.uLGrain, L.grain); gl.uniform1f(u.uLSeed, L.seed); gl.uniform1f(u.uLRough, L.rough); }   // the lumps (vertex shader) take the same stones
  // a species' look: { material, pattern, colors: ["#rrggbb" x5] } (or null: back to its own colour). Its lines take the fourth colour
  const MATS = { plain: 0, skin: 1, glass: 2, ember: 3, shell: 4, golem: 5 }, PATS = { none: 0, spots: 1, bands: 2, veins: 3 };
  // overgrowth, over any material: what grows and its two colours (the growth, its tip). A golem with none said grows moss
  const GROWS = { none: 0, moss: 1, frost: 2, rust: 3, fungus: 4 }, GROW_COLORS = { moss: ['#34521f', '#8fae4a'], frost: ['#8fb4cc', '#f4fbff'], rust: ['#5e2a12', '#d0773a'], fungus: ['#8a7d66', '#f1e6cc'] };
  const rgb = (h) => { const v = parseInt(String(h).replace('#', ''), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
  const lookMemo = new WeakMap();
  function lookOf(look, seed) { if (!look || !look.colors || look.colors.length < 5) return null; const m = lookMemo.get(look); if (m && m.seedIn === (seed || 0)) return m.L; const L = makeLook(look, seed); lookMemo.set(look, { seedIn: seed || 0, L }); return L; }   // the same look object gives the same result (a changed look is a new object)
  function makeLook(look, seed) { const pal = new Float32Array(15); look.colors.slice(0, 5).forEach((c, i) => pal.set(rgb(c), i * 3)); return { pal, mat: MATS[look.material] ?? 0, pat: PATS[look.pattern] ?? 0, seed: look.veinSeed ?? (seed || 0), vsize: look.veinSize ?? 1, vein: look.vein ?? 0.6, fres: look.fresnel ?? 0.5, opac: look.opacity ?? 1, emis: look.emissive ?? 0,
    grain: look.grain ?? 1, rough: look.roughness ?? 0.6, lump: look.material === 'golem' ? (look.lumps ?? 0.6) : 0, grow: GROWS[look.grow ?? (look.material === 'golem' ? 'moss' : 'none')] ?? 0,
    growA: look.growAmount ?? 0.5, growP: look.growClump ?? 0.5, growC: growColors(look),
    paint: look.paint ?? 0, paintS: Math.max(2, look.paintSteps ?? 4), paintB: look.paintBrush ?? 1, paintW: look.paintWobble ?? 0.3, paintT: look.paintTemp ?? 0.6, paintD: look.paintDetail ?? 0.5, paintO: look.paintOutline ?? 0.5 }; }
  function growColors(look) { const kind = look.grow ?? (look.material === 'golem' ? 'moss' : 'none'), c = look.growColors && look.growColors.length === 2 ? look.growColors : GROW_COLORS[kind] || GROW_COLORS.moss, out = new Float32Array(6); out.set(rgb(c[0]), 0); out.set(rgb(c[1]), 3); return out; }
  // growth from outside (a game's own reason: a creature at rest grows mossy, one that fights scrapes it off): the amount for a species, or null to use its look's
  function setGrowth(r, i, amount) { const sp = r.species[i]; if (sp) sp.growOver = amount == null ? null : Math.max(0, Math.min(1, amount)); }
  function setLook(r, i, look) { const sp = r.species[i]; if (!sp) return; if (!sp.own) sp.own = { hi: sp.colHi, lo: sp.colLo };
    sp.look = lookOf(look, i + 1); if (sp.look) { const c = Array.from(sp.look.pal.subarray(9, 12)); sp.colHi = c; sp.colLo = c.map((v) => v * 0.556); } else { sp.colHi = sp.own.hi; sp.colLo = sp.own.lo; } }
  function lines(r, opt, L, alpha) {
    if (!L || !L.verts) return; const gl = r.gl;
    if (!r.linesProg) { r.linesProg = program(gl, LINES_VS, LINES_FS); r.linesVAO = gl.createVertexArray(); r.linesVBO = gl.createBuffer();
      gl.bindVertexArray(r.linesVAO); gl.bindBuffer(gl.ARRAY_BUFFER, r.linesVBO); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.bindVertexArray(null); }
    const worldD = Math.max(60, Math.min(opt.worldW, opt.worldH) * 0.9 * (opt.sim.cfg.dz ?? 0.8)), cam = buildCamera(opt.worldW, opt.worldH, worldD, r.canvas.width, r.canvas.height, opt.camera || {});
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, r.canvas.width, r.canvas.height); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (opt.linesBehind) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); }   // linesBehind: lines are hidden by the solids drawn just before them (a forest: near trunks cover far boughs)
    gl.useProgram(r.linesProg.p); gl.uniformMatrix4fv(r.linesProg.u.uVP, false, cam.vp);
    gl.bindVertexArray(r.linesVAO); gl.bindBuffer(gl.ARRAY_BUFFER, r.linesVBO); gl.bufferData(gl.ARRAY_BUFFER, L.data.subarray(0, L.verts * 4), gl.DYNAMIC_DRAW);
    for (const b of L.batches) { gl.uniform4f(r.linesProg.u.uCol, b.color[0], b.color[1], b.color[2], alpha == null ? 0.95 : alpha); gl.drawArrays(gl.LINES, b.start, b.count); }
    gl.bindVertexArray(null); gl.disable(gl.BLEND); if (opt.linesBehind) { gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LESS); }
  }

  window.EcologyRender = { FADE, buildCore, computeCore, uploadCore, strokesOf, solids, setLook, lookOf, setGrowth, MATS, PATS, GROWS, GROW_COLORS, create, resize, frame, drawInto, terrain, lines,
    camera: (r, opt) => buildCamera(opt.worldW, opt.worldH, Math.max(60, Math.min(opt.worldW, opt.worldH) * 0.9 * (opt.sim.cfg.dz ?? 0.8)), r.canvas.width, r.canvas.height, opt.camera || {}) };   // camera: the view a frame is drawn with (vp, eye), for a pass of a page's own (FloraGPU)
})();
