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
const S = { view: 'angle', style: 'route-zero', irisMode: 0, snow: true, tilt: 38, yaw: 0, zoom: 1, bank: 0.6, wings: 1, orbit: false, species: 'mixed', beh: 'on', iris: 0.95, dz: 0.8, dark: 0, flow: 'free', swirl: 1.2, vradius: 0.8, mode: '3d', count: 200, size: 75, sep: 2.4, align: 1, coh: 0.8, speed: 1, wiggle: 0.03, flex: 18, glow: 1.2, shimmer: 0, trail: 0, ptr: 'scatter', hud: false, portrait: false, habitatTint: true, showGrid: false, showWalkers: false, routeLines: 0.16, routeBright: 1, routeGrain: 1, routeVignette: 1, routeAtmo: true, projection: 'persp' };
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

// (The creatures' own shaders lived here. They are drawn by the shared renderer now: src/creatures.js.)
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
