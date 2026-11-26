// world/scenes/world-scene/src/core.js -- World Scene: Loading the kit and the city grammar, the settings (S), WebGL setup (programs, quads, the shared creature spine and its shaders).
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// kicked off immediately so the fetch overlaps with all the WebGL setup below; buildPlacedCity/
// buildPlacedTower check CreatureArch.ready themselves and simply produce no creature-line
// geometry yet if this hasn't resolved by the time the very first world is built (see the
// .then() below, right after that first build, which retries once parts are actually in hand)
let t = 0;   // the scene's clock, in seconds (advanced by the loop in view-hud.js); declared first so any file, or a callback that lands while the page is still loading, can read it
const creatureArchReady = CreatureArch.load().catch(e => console.warn('[world-scene] creature-parts.json failed to load', e));
// the city's buildings come from the city grammar (packages/city/city-grammar.js + its three sheets in
// packages/city/grammar/): terraces, districts, a dual-grid module solve, stitches. The WFC below still
// runs for what leans on its cells (walkers, picking, ring-tower sites), but what you SEE is the grammar.
let grammarSheet = null, grammarCity = null;
const grammarReady = CityGrammar.load().then(sh => { grammarSheet = sh; }).catch(e => console.warn('[world-scene] city grammar sheets failed to load', e));
// the terrace a tank position stands on, as a lift in tank units (towers and walkers stand on it)
function cityLiftAt(tx, ty) {
  const s = (tankW() * 0.4) / 15.3, r = Math.hypot(tx - tankW() / 2, ty - tankH() / 2) / s;
  return CityGrammar.groundY(r) * s;
}

// ---------- settings ----------
const S = { view: 'angle', style: 'route-zero', irisMode: 0, snow: true, tilt: 38, yaw: 0, zoom: 1, bank: 0.6, wings: 1, orbit: false, species: 'mixed', beh: 'on', iris: 0.95, dz: 0.8, dark: 0.3, flow: 'free', swirl: 1.2, vradius: 0.8, mode: 'sigil', density: 0.7, count: 200, size: 75, sep: 2.4, align: 1, coh: 0.8, speed: 1, wiggle: 0.03, flex: 18, glow: 1.2, shimmer: 0.1, trail: 0, ptr: 'scatter', hud: false, portrait: false, habitatTint: true, showGrid: false, showWalkers: false, routeLines: 0.16, routeBright: 1, routeGrain: 1, routeVignette: 1, routeAtmo: true, projection: 'persp' };
// a settings/population snapshot, shared as a link (see "Copy settings link"): parsed this early so the
// seabed below can be built from its seed before anything else in the page reads S
const urlPreset = (() => { try { const h = decodeURIComponent(location.hash.slice(1)); return h ? JSON.parse(atob(h)) : null; } catch { return null; } })();
S.seed = urlPreset?.seed ?? Math.floor(Math.random() * 1e9);
const MAX_FISH = 600;
const K = 20;                 // spine points per fish (long species need the extra joints)
const TEX_W = 24 + EcologyWalk.TEX_EXTRA;   // texels per fish row: K spine points, then params, mood, mood2, then walking-leg bands
const MAX_FANS = 12;
const DEG = Math.PI / 180;
const WORLD_SCALE = 4; // the tank's simulated width/height/depth, in world units, vs. the screen it's framed into
// S is handed to the sim BY REFERENCE: its own cfg object. The slider wiring below still just does
// S[key] = value, same as always -- the sim reads the same live object every step(), so no separate
// sync code is needed. See packages/ecology/ecology-sim.js's header for the full contract.
const sim = EcologySim.create(S);

// ---------- WebGL setup ----------
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: true });
// the render style: a recipe from packages/render/style-recipes.js (built-ins plus any saved in Forge's
// Style page). S.style is its id. A "glow" recipe (Glitch) is drawn by this file's own glowing-line
// renderer; every other kind goes through the shared chunk, the same one Route Scene uses.
if (S.style === 'route') S.style = 'route-zero';
let curStyle = StyleRecipes.get(S.style);
const styled = () => curStyle.kind !== 'glow';
const lightStyle = () => { const f = StyleRecipes.rgb(curStyle.palette.fog); return styled() && f[0] * 0.3 + f[1] * 0.59 + f[2] * 0.11 > 0.55; };
// the line drawing is additive light; on a light recipe it's taken away from the page instead (dark ink)
function lineBlend(on) { gl.blendEquation(on && lightStyle() ? gl.FUNC_REVERSE_SUBTRACT : gl.FUNC_ADD); }
if (!gl) { document.getElementById('nogl').hidden = false; throw new Error('WebGL2 unavailable'); }

function b64(s, Type) { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Type(u8.buffer); }

function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

// Each fish is drawn by laying its outline along its own spine.
// Body, head and tail bend with the spine. Fins and whiskers are rigged like Wing Rig: each pivots at its
// socket with its own stroke and beat delay, can hang off a parent part, and blends keyed poses; the
// fish's mood (dash, turn, puff) folds them on top.
const SP3 = `
// ---- shared 3D spine: each spine texel is (x, y, depth, roll); the card's lateral axis L and its
// up-facing normal U are built from the tangent, then rolled so the fish banks into its turns ----
uniform mat4 uVP;
uniform vec3 uCam;
uniform float uShift, uShiftX, uRefDist, uWing, uOrtho;
// point-size denominator: gl_Position.w is the perspective camera's natural distance-from-eye
// term (so dividing by it shrinks far points correctly) -- under orthographic gl_Position.w is a
// constant 1 (no perspective divide at all), which would otherwise blow every point up to uRefDist
// pixels. Substituting uRefDist itself here (so the ratio becomes exactly 1) gives a constant,
// correctly-calibrated size instead: real orthographic sprites don't shrink with distance anyway.
float wDiv() { return max(1.0, mix(gl_Position.w, uRefDist, uOrtho)); }
vec4 S4(int i) { return texelFetch(uSpine, ivec2(clamp(i, 0, K - 1), gl_InstanceID + uRow0), 0); }
vec3 S(int i) { return S4(i).xyz; }
vec3 tanAt(int i) { return normalize(S(i + 1) - S(i - 1) + vec3(1e-5, 0.0, 0.0)); }
void frame3(float s, out vec3 P, out vec3 T, out vec3 L, out vec3 U) {
  float f = s * float(K - 1);
  int i0 = clamp(int(floor(f)), 0, K - 2);
  // a vertex positioned beyond the body's nominal bounding box (a decorative element drawn outside
  // it in the source art) gave an s outside [0,1] — t was only clamped for tangent/roll below, not
  // for P itself, so that vertex got linearly extrapolated far past the last spine segment instead
  // of snapping to the body's end, stretching into a long spike
  float t = clamp(f - float(i0), 0.0, 1.0);
  vec4 a = S4(i0), b = S4(i0 + 1);
  P = a.xyz + (b.xyz - a.xyz) * t;
  T = normalize(mix(tanAt(i0), tanAt(i0 + 1), t));
  float roll = mix(a.w, b.w, t);
  vec3 L0 = normalize(vec3(T.y, -T.x, 0.0) + vec3(1e-6, 0.0, 0.0));
  vec3 U0 = normalize(cross(T, L0)); if (U0.z > 0.0) U0 = -U0;        // up: toward the surface (−depth)
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
${EcologyWalk.LEG_GLSL}
${SP3}
vec2 rot(vec2 p, vec2 c, float a) { vec2 d = p - c; float cs = cos(a), sn = sin(a); return c + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs); }
bool rigid(float g) { return (g > 1.5 && g < 2.5) || g > 3.5; }
// keyed pose for this part at loop position u (cosine eased, looping, like Wing Rig)
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
// angle of a rigid part: its own beat, keyed pose, and the fish's mood folding it back or flaring it
float partAngle(int i, float ph, float d, vec4 mood, vec4 mood2) {
  vec4 A = PT(i, 0), R = PT(i, 2);
  float side = A.y == 0.0 ? 1.0 : A.y, g = A.x;
  float tuck = mood.x, turn = mood.y, puff = mood.z, glide = mood2.x, flap = mood2.y;
  float beat;
  if (g < 2.5) beat = R.x * sin(ph * 0.7 - R.y - d * 0.004) * smoothstep(0.0, 300.0, d);   // whisker: lagging sway
  else beat = R.x * flap * sin(ph * 0.5 - R.y - d * 0.0009);
  float fold = abs(A.y) * side * (0.65 * tuck + 0.45 * max(0.0, turn * side) - 0.3 * glide - 0.55 * puff);
  float u = fract(ph * 0.5 / 6.2831853);
  return beat + keyed(PT(i, 3), u) + (g < 2.5 ? fold * 0.4 : fold);
}
void main() {
  int pi = int(aPart + 0.5);
  vec4 A = PT(pi, 0), B = PT(pi, 1), R = PT(pi, 2);
  vec4 prm = texelFetch(uSpine, ivec2(K, row()), 0);       // phase, seed, px per unit, light
  vec4 mood = texelFetch(uSpine, ivec2(K + 1, row()), 0);  // tuck, turn, puff, alert
  vec4 mood2 = texelFetch(uSpine, ivec2(K + 2, row()), 0); // glide, flap
  float grp = A.x;
  float ph = prm.x, sc = prm.z * (1.0 + 0.45 * mood.z);
  vec2 p = aPos + aNorm * (uLineW / sc);
  vec3 w, Uf; float ang = 0.0;
  vec2 pl = p;
  if (legPose(pi, aPos, pl, row())) {          // a walking leg: posed per vertex by its band (ecology-walk.js)
    vec3 P, T, L, U; frame3((R.w - uBY0) / uLEN, P, T, L, U);
    w = P + L * (pl.x * sc) + T * (pl.y - R.w) * sc; Uf = U;
  } else if (rigid(grp)) {
    vec2 anc = A.zw;
    float d = distance(p, anc);
    ang = partAngle(pi, ph, d, mood, mood2);
    // wings beat out of the card's plane; the in-plane stroke shrinks to make room for it
    float lift = clamp((grp < 2.5 ? 0.5 : 2.2) * abs(R.x) * mood2.y * sin(ph * 0.5 - R.y - d * 0.0009) * (0.25 + 1.2 * uWing)
               + uWing * (0.25 * mood2.x - 0.45 * mood.x), -1.1, 1.1);
    p = rot(p, anc, ang * (1.0 - 0.55 * uWing));
    // ride the parent chain (up to three levels)
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
    // a part with an unusually long reach (a wide wingtip) can lift far out of plane at this angle —
    // cap the out-of-plane displacement itself, in body lengths, not just the lift angle
    float liftDisp = clamp(abs(dx) * sin(lift), -uLEN * sc * 0.6, uLEN * sc * 0.6);
    w = P + L * (anc.x * sc + dx * cos(lift)) + U * liftDisp + T * (p.y - R.w) * sc;
    Uf = normalize(U * cos(lift) - L * sign(dx) * sin(lift));
  } else {
    // body, head, tail: every vertex follows the spine at its own position
    vec3 P, T, L, U; frame3((p.y - uBY0) / uLEN, P, T, L, U);
    w = P + L * p.x * sc; Uf = U;
  }
  gl_Position = project(w);
  // parts of one fish stack in drawing order; fish against fish use the real depth
  gl_Position.z -= (aPart * 2.0 + uLayer) * 1.5e-6 * gl_Position.w;
  vFace = abs(dot(Uf, normalize(uCam - w)));
  vDim = prm.w; vAng = ang; vS = (aPos.y - uBY0) / uLEN; vAlert = mood.w;
  vG = clamp((aPos.y - B.x) / max(1.0, B.y - B.x), 0.0, 1.0);
  vBright = pow(max(0.0, sin(float(gl_VertexID) * 0.023 - uTime * 2.6 + prm.y)), 18.0);
  gl_PointSize = max(1.5, uPtSize * (0.6 + 1.4 * vBright) * uRefDist / wDiv());
}`;
// three iridescent finishes: oil slick (pastel), holo glass (cyan, violet, pink, amber), neon (cyan, blue, magenta)
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
// thin-film colour (ported from Wing Rig's oil-slick mode, wing-rig.html's shade()): shifts with each
// fin's angle, plus a foil sweep down the body — now also with Wing Rig's noise-marbled banding and
// twinkling glitter, adapted from screen-space UV noise to this rig's own (ang, spine-position) space
const IRIS = `
uniform float uIris, uTimeF, uIrisMode;
uniform float uWhite;   // 1 in every style but Glitch: the species drawn white, like paper cut-outs on the night
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
  float n = irFbm(fq);                                            // marbled, oil-on-water swirl in the film's hue
  float th = ang * 1.4 + s * 0.9 - uTimeF * 0.05 + seed * 0.07 + band * 0.35 + (n - 0.5) * 0.9;
  vec3 f = film(th) * (0.75 + 0.6 * band);
  vec2 cell = floor(vec2(ang * 30.0, s * 60.0) + seed * 17.0);     // sparse twinkling glitter specks
  float gseed = irHash(cell);
  float tw = pow(0.5 + 0.5 * sin(uTimeF * (2.0 + gseed * 5.0) + gseed * 60.0), 8.0);
  f += step(0.975, gseed) * tw * 1.6;
  return mix(c, f * max(max(c.r, c.g), c.b) * 1.25, uIris * (0.55 + 0.45 * band));
}`;
const FILL_FS = `#version 300 es
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; uniform float uAlpha; uniform vec3 uColHi, uColLo; uniform float uEnvLit; out vec4 o;
${IRIS}
void main() { vec3 c = mix(vec3(0.169, 0.161, 0.165), vec3(0.051), vG) * (0.5 + 0.5 * vDim);
  c = mix(c, uColHi * 0.78, 0.52);        // a body dominated by solid fill (jelly, puffer, dragon) still needs its own colour, not just its edge
  c = mix(c, iris(c * 2.2, vAng, vS, 0.0) * 0.45, uIris * 0.35);
  c = mix(c, vec3(0.3, 0.06, 0.05), vAlert * 0.5); o = vec4(c * (0.8 + 0.4 * vFace), uAlpha);
  if (uEnvLit > 0.5) o = vec4(mix(uColHi, uColLo, smoothstep(0.0, 0.75, vG)) * (0.72 + 0.38 * vFace), uAlpha);   // a set piece's painted bodies (places/engine.js): the species' own two colours, lit, no depth dimming
  if (uWhite > 0.5) o = vec4(vec3(0.95) * (0.84 + 0.16 * vFace), uAlpha); }`;   // a gentler edge-on falloff than before — a wing-heavy body (dragon, manta) has a lot of its surface edge-on to camera at any moment, and the old floor crushed it
const LINE_FS = `#version 300 es
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; uniform float uAlpha; uniform vec3 uColLo, uColHi; uniform float uEnvLit; out vec4 o;
${IRIS}
void main() {
  vec3 c = mix(uColHi, uColLo, smoothstep(0.0, 0.55, vG));
  c = iris(c, vAng, vS, 0.0);
  float dm = mix(vDim, 1.0, uEnvLit);   // a set piece lights every depth alike (it has its own water to sink things in)
  c = mix(c, vec3(0.25, 0.42, 0.75), (1.0 - dm) * 0.7);
  c = mix(c, vec3(1.0, 0.36, 0.3), vAlert * 0.75 * (1.0 - uEnvLit));
  o = vec4(c * dm * (0.45 + 0.65 * vFace) * (1.0 + 0.25 * uEnvLit), uAlpha);
  // white, and every species alike: no dark fish, no alarm red, only a little falloff where a body turns edge-on
  if (uWhite > 0.5) o = vec4(vec3(0.96) * (0.7 + 0.3 * vFace), uAlpha); }`;
const PT_FS = `#version 300 es
precision mediump float; in float vG; in float vBright; in float vDim; in float vAng; in float vS; in float vAlert; in float vFace; uniform float uAlpha; uniform vec3 uColHi; out vec4 o;
${IRIS}
void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
  vec3 c = mix(iris(uColHi, vAng, vS, 0.0), vec3(1.0, 0.5, 0.4), vAlert * 0.7);
  if (uWhite > 0.5) c = vec3(1.0);
  o = vec4(c * a * vBright * uAlpha * 0.6 * (uWhite > 0.5 ? 1.0 : vDim), 1.0); }`;
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
precision mediump float; in vec2 vUv; uniform sampler2D uTex; uniform float uGain, uGrainAmt, uVigAmt, uTime; out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 c = texture(uTex, vUv).rgb * uGain;
  if (uGrainAmt > 0.0) c += (hash(vUv * vec2(1920.0, 1080.0) + uTime) - 0.5) * 0.07 * uGrainAmt;   // film grain
  if (uVigAmt > 0.0) { float vig = smoothstep(0.78, 0.32, length(vUv - 0.5)); c *= mix(1.0, vig, 0.4 * uVigAmt); }   // soft vignette
  o = vec4(c, 1.0);
}`;
const GLOW_COMP_FS = `#version 300 es
precision mediump float; in vec2 vUv; uniform sampler2D uTex; uniform float uGain; out vec4 o;
void main() { vec3 c = texture(uTex, vUv).rgb * uGain; o = vec4(c / (1.0 + c), 1.0); }`;   // soft-rolloff instead of hard clip, so dense/bright schools glow without flattening into a white blob
// trail: instead of a hard clear, fade the previous frame toward the background colour by this much each tick
const FADE_FS = `#version 300 es
precision mediump float; uniform vec4 uColor; out vec4 o;
void main() { o = uColor; }`;


// The cloud fish: no geometry at all. Every point is a formula of its index and time
// (yuruyurau / Kaurov style), written in body coordinates and then laid along the spine.
const CLOUD_N = 7000;
const CLOUD_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uSpine;
uniform vec2 uRes;
uniform float uTime, uPt, uDensity, uAlpha, uLEN, uIris, uIrisMode, uWhite;
uniform int uRow0, uNFan;
uniform vec4 uHead, uBody, uWh, uFanA[${MAX_FANS}], uFanB[${MAX_FANS}], uFanC[${MAX_FANS}];
out vec4 vCol;
const int K = ${K};
${SP3}
${FILM}
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  float id = float(gl_VertexID);
  vec4 prm = texelFetch(uSpine, ivec2(K, gl_InstanceID + uRow0), 0);
  vec4 mood = texelFetch(uSpine, ivec2(K + 1, gl_InstanceID + uRow0), 0);   // tuck, turn, puff, alert
  vec4 mood2 = texelFetch(uSpine, ivec2(K + 2, gl_InstanceID + uRow0), 0);  // glide, flap
  float sw = prm.x, t = uTime + prm.y, bodyLen = prm.z * uLEN * (1.0 + 0.45 * mood.z);
  float finAng = 0.0;
  if (hash(id * 1.37 + float(gl_InstanceID + uRow0) * 7.1) > uDensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float s, lat, br, vert = 0.0;
  if (id < 800.0) {
    // head: counter-rotating rosette rings around the eye
    float ring = mod(id, 4.0);
    float a = id * 2.39996 + t * (0.6 + ring * 0.15) * (mod(ring, 2.0) * 2.0 - 1.0);
    float r = (0.014 + ring * 0.011 + 0.005 * sin(5.0 * a - t * 2.0 + ring)) * uHead.y;
    s = uHead.x + r * cos(a); lat = r * sin(a);
    vert = r * 0.55 * sin(a * 2.0 + t + ring);                         // the rosette stands up off the card
    br = 0.7 * (0.55 + 0.45 * sin(a * 3.0 + t));
  } else if (id < 2400.0) {
    // body: a spiral shell, the cos/sin pair gives it depth
    float k = id - 800.0;
    float u = fract(k * 0.61803);
    s = mix(uBody.x, uBody.y, u);
    float w = mix(uBody.z, uBody.w, u) * 1.4;
    float c = k * 2.39996 + t * 1.8 - s * 30.0;
    float d = length(vec2(5.0 * cos(k / 8.0), 5.0 * cos(s * 40.0)));
    lat = w * cos(c) * (1.0 + 0.25 * sin(d * d * 0.05 - t));
    vert = w * sin(c) * 0.9 * (1.0 + 0.25 * sin(d * d * 0.05 - t));   // the spiral is a real tube now
    br = 0.6 * (0.2 + 0.8 * (0.5 + 0.5 * sin(c)));
  } else if (id < 6500.0) {
    // fins and tail: fans of rays that row, ripple and carry light outward
    float side = mod(id, 2.0) * 2.0 - 1.0;
    float fi = id - 2400.0, local = -1.0, nR = 4.0, base = 0.0, spread = 0.0, len = 0.0, wave = 0.0, curlIn = 0.0, rowAmp = 0.0, rowOff = 0.0; vec2 root = vec2(0.0);
    for (int q = 0; q < ${MAX_FANS}; q++) {
      if (q >= uNFan) break;
      vec4 C = uFanC[q];
      if (fi >= C.z && fi < C.z + C.w) {
        vec4 A = uFanA[q], B = uFanB[q];
        local = fi - C.z; root = A.xy; base = A.z; spread = A.w; len = B.x; wave = B.y; curlIn = B.z; rowAmp = B.w; rowOff = C.x; nR = C.y;
        break;
      }
    }
    if (local < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    float j = mod(floor(local / 2.0), nR);
    float v = fract(local * 0.01371 + j * 0.31);
    float beat = rowAmp * mood2.y * sin(sw * 0.5 - rowOff - v * 0.8);
    float th = (base + spread * (j / (nR - 1.0))) * (1.0 - 0.45 * mood.x + 0.15 * mood2.x + 0.35 * mood.z) + beat;
    finAng = beat;
    vec2 dir = vec2(sin(th), cos(th));
    float lj = len * (0.75 + 0.25 * sin(j * 1.7 + 1.0));
    vec2 p = root + dir * v * lj;
    vec2 nrm = vec2(dir.y, -dir.x);
    float d = v * 6.0;
    p += nrm * (wave * v * sin(sw - v * 5.0 + j * 0.7) + 0.006 * sin(d * d * 0.3 - t * 2.0 + j));
    p.x -= curlIn * v * v;
    lat = side * p.x; s = p.y;
    vert = abs(p.x - root.x) * uWing * 0.9 * mood2.y * sin(sw * 0.5 - rowOff - v * 0.5) + 0.01 * sin(v * 9.0 + t + j);
    br = (1.0 - 0.6 * v) * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(v * 20.0 - t * 4.0 + j), 3.0));
  } else {
    // whiskers: reach forward and out, curling tighter toward the tip
    if (uWh.z <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    float local = id - 6500.0, side = mod(local, 2.0) * 2.0 - 1.0;
    float v = fract(local * 0.00713);
    float phi = uWh.w - 0.25 + v * v * 3.6 * min(1.0, 0.12 / uWh.z) + 0.25 * sin(t * 0.7 - v * 3.0);
    vec2 p = uWh.xy + uWh.z * 1.15 * v * vec2(sin(phi), cos(phi));
    lat = side * p.x; s = p.y;
    vert = 0.02 * v * sin(v * 8.0 - t * 1.3);
    br = 1.0 - 0.5 * v;
  }
  vec3 P, T, L, U; frame3(s, P, T, L, U);
  vec3 w = P + L * lat * bodyLen + U * vert * bodyLen;
  gl_Position = project(w);
  gl_PointSize = max(1.5, uPt * (0.7 + 0.8 * br) * uRefDist / wDiv());
  // each fish leans teal or blue, like light at different depths
  float tint = mix(fract(prm.y * 0.371), 1.0, (1.0 - prm.w) * 0.9);
  vec3 hi = mix(vec3(0.62, 1.0, 0.88), vec3(0.55, 0.78, 1.0), tint), lo = mix(vec3(0.16, 0.42, 0.35), vec3(0.14, 0.3, 0.55), tint);
  vec3 col = mix(lo, hi, br);
  vec3 fl = film(finAng * 1.4 + s * 0.9 - uTime * 0.05 + prm.y * 0.07);
  col = mix(col, fl * max(max(col.r, col.g), col.b) * 1.2, uIris * 0.5);
  col = mix(col, vec3(1.0, 0.35, 0.28), mood.w * 0.7);
  if (uWhite > 0.5) col = vec3(1.0);
  vCol = vec4(col * br * uAlpha * prm.w, 1.0);
}`;
const CLOUD_FS = `#version 300 es
precision mediump float; in vec4 vCol; out vec4 o;
void main() { float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); o = vec4(vCol.rgb * a, 1.0); }`;

// marine snow drifting through the volume, and a dotted seabed: they give the water its depth
const SNOW_N = 2200, FLOOR_C = 56, FLOOR_R = 36;
const SNOW_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform mat4 uVP; uniform float uShift, uShiftX, uRefDist, uTime, uPx, uRelief, uOrtho; uniform vec3 uTank; uniform int uFloor;
uniform sampler2D uHeight;
out float vA;
float h(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  float id = float(gl_VertexID); vec3 p;
  if (uFloor == 1) {
    // the same X-Y plane the fish cards themselves lie in (see frame3 above), with elevation
    // bulging Z toward/away from camera — a bas-relief on the fish's own plane, not a ground
    // plane on a different axis, which read as rotated 90 degrees from the creatures
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
  gl_PointSize = uPx * (uFloor == 1 ? 1.6 : 1.0 + 1.4 * h(id + 9.0)) * uRefDist / max(1.0, mix(c.w, uRefDist, uOrtho));
}`;
const SNOW_FS = `#version 300 es
precision mediump float; in float vA; out vec4 o;
void main() { float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)); vec3 col = vec3(0.45, 0.85, 0.78); o = vec4(col * vA * a, 1.0); }`;
const snowProg = program(SNOW_VS, SNOW_FS);



// (moved here from further down: it runs while this file loads)
function escHTML(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
