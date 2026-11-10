/* INTERACTIONS — Tower geometry-building engine.
   Extracted 2026-10-31 from world/forges/tower-forge/Tower Forge.html so buildTower(spec) — already a
   pure function returning a standalone THREE.Group plus an update(t)/dispose() handle, decoupled
   from Tower Forge's own render loop — can be called from another scene (e.g. a combined city +
   tower + ecology world) without pulling in Tower Forge's own renderer/camera/UI.

   Deliberately NOT included here: the MAP-Elites/mutation/crossover/fitness code (mutate,
   crossover, fitnessOf, coherence, ATLAS_AXES, etc.) and the spec()/TW_PRESETS/TIER_SCHEMA data —
   those are the "what tower to build" half and stay in Tower Forge; this file is only the "how to
   build it" half. TW_SKIES and TIER_DEF moved here too since the geometry (ground tinting, cloud
   color, the tiers[0]-missing fallback) reads them directly — Tower Forge now destructures both
   back from window.TowerEngine instead of keeping its own copy.

   Depends on shared/engine/rng.js and shared/engine/naqsh-pattern-engine.js being loaded first, and on THREE.
   Classic script (not a module), works from file://. Load order:
     <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
     <script src="../rng.js"></script>
     <script src="../naqsh-pattern-engine.js"></script>
     <script src="tower-engine.js"></script>
     (then your own script that reads window.TowerEngine)

   Known hidden dependency: buildAura() calls a bare `clone(s)` (a deep clone via
   JSON.parse(JSON.stringify)) that was never moved here — it's still Tower Forge.html's own
   top-level `const clone = o => JSON.parse(JSON.stringify(o));`, which this file's IIFE resolves
   through the shared top-level script scope at call time. Tower Forge.html gets this for free
   because it already defines `clone` as a true top-level const in its own (non-wrapped) script.
   Any OTHER consumer must define `window.clone = o => JSON.parse(JSON.stringify(o));` (or an
   equivalent true-top-level `const clone = ...`, not one scoped inside its own IIFE) before calling
   buildTower() — world/scenes/world-scene/World Scene.html does this explicitly, for exactly this reason.
*/
(function () {
  'use strict';
  const twRng = seed => RNG.mulberry32((seed >>> 0) || 1);

  const TIER_DEF = { h: 6, r0: 3, r1: 2.8, sides: 0, prof: 'straight', amp: 0.3, twist: 0, mat: 'body', pat: 'none', pal: 'dome', tile: 3, ribs: 0, ribD: 0.15, chan: 0, winRows: 0, winPer: 4, winKind: 'arch', winGlow: false, band: 'none', bandSize: 0.5, spN: 0, spH: 0.6, spR: 0.5, stair: 0, banN: 0, banLen: 6, butN: 0, butR: 5 };

  const TW_SKIES = {
    dusk: { name: 'Dusk', top: '#1b2550', mid: '#6d4f7e', bot: '#d98f63', fog: '#b07e74', sun: '#ffb27a', sunI: 1.1, hemi: ['#9aa6ff', '#4a3030'], hemiI: 0.55, ground: '#5a3e36', sunPos: [40, 22, 30] },
    verdigris: { name: 'Verdigris haze', top: '#1c2620', mid: '#4f5e45', bot: '#c9cf96', fog: '#8d9672', sun: '#eef2b8', sunI: 0.9, hemi: ['#c8d6a0', '#20261a'], hemiI: 0.6, ground: '#242820', sunPos: [-20, 40, -30] },
    night: { name: 'Starry night', top: '#03050d', mid: '#0c1636', bot: '#27386a', fog: '#121a34', sun: '#8aa4ff', sunI: 0.45, hemi: ['#4a5ab0', '#0a0c14'], hemiI: 0.45, ground: '#10141f', sunPos: [30, 50, -20], stars: true },
    ember: { name: 'Ember sky', top: '#22101a', mid: '#7a3430', bot: '#c86848', fog: '#8c4a3e', sun: '#ff9a6a', sunI: 0.8, hemi: ['#ff9a8a', '#2a1214'], hemiI: 0.5, ground: '#3a1e1c', sunPos: [-30, 30, 40], stars: true },
    ochre: { name: 'Ochre haze', top: '#c9b79a', mid: '#d6b994', bot: '#dcc3a4', fog: '#d2b896', sun: '#fff0d8', sunI: 0.95, hemi: ['#fff4e0', '#8a5a40'], hemiI: 0.7, ground: '#b06c48', sunPos: [35, 45, 25] },
    golden: { name: 'Golden hour', top: '#3d6ea0', mid: '#86a9c2', bot: '#e8b886', fog: '#d8b08c', sun: '#ffd09a', sunI: 1.35, hemi: ['#bcd8ff', '#7a4a30'], hemiI: 0.6, ground: '#8a5a3c', sunPos: [50, 26, 20] },
    olive: { name: 'Olive storm', top: '#2c2c1e', mid: '#5e5c3a', bot: '#a8a070', fog: '#77724e', sun: '#f2e2a8', sunI: 1, hemi: ['#e8dca8', '#2a281a'], hemiI: 0.6, ground: '#3a3826', sunPos: [30, 40, 30] },
  };

const BLOOM_LAYER = 1;
const NQDEF = NAQSH.def();
const PAT_CACHE = new Map();
function patCanvas(mode, pal, seed) {
  const key = mode + '|' + pal + '|' + seed;
  if (PAT_CACHE.has(key)) return PAT_CACHE.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  try { NAQSH.renderTo(cv.getContext('2d'), 512, { mode, params: Object.assign({}, NQDEF[mode], mode === 'bannai' ? { view: 'flat' } : mode === 'eslimi' ? { comp: 'wallpaper' } : mode === 'tongbori' ? { comp: 'wall' } : {}), pal, seed, b: 1 }); }
  catch (e) { const x = cv.getContext('2d'); x.fillStyle = '#888'; x.fillRect(0, 0, 512, 512); }
  PAT_CACHE.set(key, cv); return cv;
}
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; }

// radius of the tier outline at height fraction t
function rAt(T, t) {
  const base = Math.max(T.r0, T.r1); let r = T.r0 + (T.r1 - T.r0) * t;
  switch (T.prof) {
    case 'bulge': r += T.amp * base * Math.sin(Math.PI * t) * 0.6; break;
    case 'onion': r += T.amp * base * Math.sin(Math.PI * Math.pow(t, 0.6)) * 0.7; break;
    case 'flare': r += T.amp * T.r0 * Math.pow(1 - t, 3) * 1.4; break;
    case 'neck': r -= T.amp * base * Math.sin(Math.PI * t) * 0.45; break;
    case 'bell': r += T.amp * T.r0 * Math.pow(1 - t, 1.6) * 0.9; break;
  }
  return Math.max(0.05, r);
}
// polygon plans: corners at π/n + k·2π/n, so a face looks straight down +z; θ = 0 is a face centre
const phi0 = n => n ? Math.PI / n : 0;
function polyR(r, n, th) { if (!n) return r; const seg = 2 * Math.PI / n; let d = ((th - phi0(n)) % seg + seg) % seg - seg / 2; return r * Math.cos(Math.PI / n) / Math.cos(d); }
const at = (r, th, y) => new THREE.Vector3(r * Math.sin(th), y, r * Math.cos(th));

function lathe(points, n, weather, rnd) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), n || 48, phi0(n));
  if (weather !== undefined) {
    const p = g.attributes.position, col = new Float32Array(p.count * 3), off = rnd ? rnd() * 100 : 0;
    const ys = points.map(q => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
      const streak = vnoise(a * 9 + off) * vnoise(y * 0.15 + a * 3 + off), grime = Math.pow(1 - (y - y0) / Math.max(0.01, y1 - y0), 4);
      const v = 1 - weather * (0.45 * streak + 0.25 * grime + 0.12 * vnoise(y * 1.7 + a * 20));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}
function twistGeo(g, y0, h, tw) {
  if (!tw) return g;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = tw * (y - y0) / h, x = p.getX(i), z = p.getZ(i); p.setXYZ(i, x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)); }
  g.computeVertexNormals(); return g;
}
function mergeGeos(list) {
  const pos = [], nor = [], uv = [];
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return m;
}
// a strip that follows the tier outline at angle th: ribs, pilasters and glowing channels
function stripTris(T, y0, th, width, depth, out) {
  const N = 18, tw = (T.twist || 0) * Math.PI / 180, ring = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = th + tw * t, r = polyR(rAt(T, t), T.sides, a), y = y0 + t * T.h, d = width / 2 / Math.max(0.2, r);
    ring.push([at(r - 0.03, a - d, y), at(r + depth, a - d, y), at(r + depth, a + d, y), at(r - 0.03, a + d, y)]);
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
    const A = ring[i][k], B = ring[i][k + 1], C = ring[i + 1][k + 1], D = ring[i + 1][k];
    out.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, A.x, A.y, A.z, C.x, C.y, C.z, D.x, D.y, D.z);
  }
}
function trisGeo(arr) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; }
function instanced(geo, mat, mats) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  mats.forEach((M, i) => m.setMatrixAt(i, M)); m.count = mats.length; m.castShadow = true; m.receiveShadow = true; return m;
}
const M4 = (p, rotY, s, rotX = 0) => new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ')), s);
const WIN_TEX = {};
function winTex(kind) {
  if (WIN_TEX[kind]) return WIN_TEX[kind];
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x = cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128); x.fillStyle = '#fff'; x.beginPath();
  if (kind === 'round') { x.arc(32, 64, 28, 0, Math.PI * 2); }
  else if (kind === 'slit') { x.rect(22, 8, 20, 112); }
  else { x.moveTo(6, 124); x.lineTo(6, 52); x.quadraticCurveTo(6, 14, 32, 4); x.quadraticCurveTo(58, 14, 58, 52); x.lineTo(58, 124); x.closePath(); }
  x.fill();
  const t = new THREE.CanvasTexture(cv); WIN_TEX[kind] = t; return t;
}
function glyphTex() {
  if (glyphTex.t) return glyphTex.t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const x = cv.getContext('2d'), c = 256;
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round';
  for (const [r, w] of [[246, 6], [226, 2], [168, 3], [150, 1.5], [70, 3]]) { x.lineWidth = w; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke(); }
  const rr = twRng(77);
  for (let i = 0; i < 48; i++) { // glyph marks between the rings
    const a = i / 48 * Math.PI * 2; x.save(); x.translate(c + Math.cos(a) * 196, c + Math.sin(a) * 196); x.rotate(a + Math.PI / 2); x.lineWidth = 2.5; x.beginPath();
    const k = Math.floor(rr() * 4); if (k === 0) { x.moveTo(-7, -9); x.lineTo(7, 9); } else if (k === 1) { x.arc(0, 0, 7, 0, Math.PI * 1.4); } else if (k === 2) { x.moveTo(-8, 0); x.lineTo(8, 0); x.moveTo(0, -9); x.lineTo(0, 9); } else { x.moveTo(-6, 9); x.lineTo(0, -9); x.lineTo(6, 9); }
    x.stroke(); x.restore();
  }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.lineWidth = 1.5; x.beginPath(); x.moveTo(c + Math.cos(a) * 70, c + Math.sin(a) * 70); x.lineTo(c + Math.cos(a) * 150, c + Math.sin(a) * 150); x.stroke(); }
  glyphTex.t = new THREE.CanvasTexture(cv); return glyphTex.t;
}
function swirlTex() {
  if (swirlTex.t) return swirlTex.t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
  const g = x.createRadialGradient(128, 128, 4, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.7)';
  for (let k = 0; k < 4; k++) { x.lineWidth = 3 - k * 0.5; x.beginPath(); for (let i = 0; i < 120; i++) { const t = i / 120, a = t * 9 + k * Math.PI / 2, r = 6 + t * 110; i ? x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r) : x.moveTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } x.stroke(); }
  swirlTex.t = new THREE.CanvasTexture(cv); return swirlTex.t;
}
function dotTex() {
  if (dotTex.t) return dotTex.t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); dotTex.t = new THREE.CanvasTexture(cv); return dotTex.t;
}

function clothTex() {
  if (clothTex.t) return clothTex.t;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 256);
  x.fillStyle = '#e8c070'; x.fillRect(0, 10, 64, 5); x.fillRect(0, 22, 64, 2); x.fillRect(4, 0, 3, 256); x.fillRect(57, 0, 3, 256);
  x.strokeStyle = '#e8c070'; x.lineWidth = 3; x.beginPath(); x.arc(32, 190, 12, 0, Math.PI * 2); x.moveTo(32, 168); x.lineTo(32, 212); x.moveTo(18, 222); x.lineTo(46, 222); x.stroke();
  for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(i * 11, 0, 5, 256); }
  clothTex.t = new THREE.CanvasTexture(cv); return clothTex.t;
}
function glyphStripTex() {
  if (glyphStripTex.t) return glyphStripTex.t;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const x = cv.getContext('2d'), r = twRng(19);
  x.fillStyle = '#000'; x.fillRect(0, 0, 512, 64); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 3; x.lineCap = 'round';
  x.fillRect(0, 4, 512, 3); x.fillRect(0, 57, 512, 3);
  for (let i = 0; i < 8; i++) { // eight glyphs per repeat, each from strokes on a 3 × 3 grid
    const ox = i * 64 + 14, oy = 16, g = 12;
    for (let k = 0; k < 4; k++) { const a = Math.floor(r() * 9), c = Math.floor(r() * 9); x.beginPath(); x.moveTo(ox + (a % 3) * g, oy + Math.floor(a / 3) * g); x.lineTo(ox + (c % 3) * g, oy + Math.floor(c / 3) * g); x.stroke(); }
    if (r() < 0.6) { x.beginPath(); x.arc(ox + g, oy + g, 5, 0, Math.PI * 2); x.stroke(); }
  }
  glyphStripTex.t = new THREE.CanvasTexture(cv); glyphStripTex.t.wrapS = THREE.RepeatWrapping; return glyphStripTex.t;
}
function cloudTex() {
  if (cloudTex.t) return cloudTex.t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'), r = twRng(8);
  for (let i = 0; i < 14; i++) { const cx = 30 + r() * 68, cy = 40 + r() * 48, rr = 14 + r() * 26, g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  cloudTex.t = new THREE.CanvasTexture(cv); return cloudTex.t;
}
// silhouette radius at a height, for things that climb the tower (roots, stairs)
function radiusAtY(info, y) {
  for (const p of info.profile) if (y >= p.y0 && y <= p.y1) return rAt(p.T, (y - p.y0) / Math.max(0.01, p.y1 - p.y0));
  const p = info.profile[0]; return p ? (y < p.y0 ? p.T.r0 : rAt(info.profile[info.profile.length - 1].T, 1)) : 1;
}
function makeMats(L) {
  const body = new THREE.MeshStandardMaterial({ color: L.body, roughness: 0.92, vertexColors: true, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: L.dark, roughness: 0.95, vertexColors: true, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color: L.accent, roughness: 0.35, metalness: 0.65, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ color: L.glow });
  const glowAdd = new THREE.MeshBasicMaterial({ color: L.glow, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const plainBody = new THREE.MeshStandardMaterial({ color: L.body, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const plainDark = new THREE.MeshStandardMaterial({ color: L.dark, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const winDark = new THREE.MeshBasicMaterial({ color: '#0d0907', alphaTest: 0.5, side: THREE.DoubleSide });
  const cloth = new THREE.MeshStandardMaterial({ color: L.cloth || '#b8322a', map: clothTex(), roughness: 0.95, side: THREE.DoubleSide });
  return { body, dark, accent, glow, glowAdd, plainBody, plainDark, winDark, cloth, list: [body, dark, accent, glow, glowAdd, plainBody, plainDark, winDark, cloth] };
}
function bloomify(o) { o.traverse(c => c.layers.enable(BLOOM_LAYER)); return o; }
function pickMat(M, k, plain) { return k === 'accent' ? M.accent : k === 'glow' ? M.glow : k === 'dark' ? (plain ? M.plainDark : M.dark) : (plain ? M.plainBody : M.body); }

// ---------- the body: foot, tiers, bands, turrets, crown ----------
function buildBody(s, M, rnd, G, extra) {
  const L = s.look, w = L.weather;
  let y = 0;
  const T0 = s.tiers[0] || TIER_DEF, n0 = T0.sides;
  // foot
  const B = s.base;
  if (B.kind !== 'none' && s.tiers.length) {
    const R = T0.r0 * B.spread;
    if (B.kind === 'plinth') {
      const a = new THREE.BoxGeometry(R * 2, B.h * 0.85, R * 2); a.translate(0, B.h * 0.425, 0);
      const b = new THREE.BoxGeometry(R * 2.12, B.h * 0.15, R * 2.12); b.translate(0, B.h * 0.925, 0);
      const m = new THREE.Mesh(mergeGeos([a, b]), pickMat(M, T0.mat === 'glow' ? 'body' : T0.mat, true)); m.castShadow = m.receiveShadow = true; G.add(m);
    } else if (B.kind === 'steps') {
      const k = 3, list = [];
      for (let i = 0; i < k; i++) { const r = R * (1 - i * 0.13); list.push(lathe([[0, B.h * i / k], [r, B.h * i / k], [r, B.h * (i + 1) / k], [0, B.h * (i + 1) / k]], n0)); }
      const m = new THREE.Mesh(mergeGeos(list), pickMat(M, T0.mat === 'glow' ? 'body' : T0.mat, true)); m.castShadow = m.receiveShadow = true; G.add(m);
    } else if (B.kind === 'buried') {
      // a sand dune heaped round the foot; the tower carries on below it
      const R2 = R * 1.5, pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([T0.r0 * 0.98 + (R2 - T0.r0) * (1 - t), B.h * Math.pow(Math.sin(Math.PI / 2 * t), 0.8)]); }
      const g = lathe(pts, 64), p = g.attributes.position, off = rnd() * 50;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(x, z), rr = Math.hypot(x, z), k = 1 + 0.12 * (vnoise(a * 3 + off) - 0.5), yy = y * (0.8 + 0.35 * vnoise(a * 2 + off + 7)); p.setXYZ(i, x * k, Math.min(yy, B.h), z * k); }
      g.computeVertexNormals();
      const sand = new THREE.MeshStandardMaterial({ color: new THREE.Color((TW_SKIES[L.sky] || TW_SKIES.dusk).ground).lerp(new THREE.Color(L.body), 0.35), roughness: 1, side: THREE.DoubleSide }); M.list.push(sand);
      const m = new THREE.Mesh(g, sand); m.receiveShadow = true; m.castShadow = true; G.add(m);
    } else if (B.kind === 'crag') {
      // the tower grows out of a jagged rock spire
      const list = [], off = rnd() * 40;
      const rock = (rx, ry, ox, oz, yb) => { const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 0.75 + 0.5 * vnoise(x * 2.3 + off) * vnoise(z * 2.1 + y * 1.7 + off); p.setXYZ(i, x * n * rx + ox, Math.max(-0.2, y) * n * ry + yb, z * n * rx + oz); } g.computeVertexNormals(); return g; };
      list.push(rock(R * 1.15, B.h * 1.05, 0, 0, 0));
      for (let i = 0; i < 4; i++) { const a = rnd() * 6.28, d = R * (0.8 + rnd() * 0.6); list.push(rock(R * (0.35 + rnd() * 0.35), B.h * (0.35 + rnd() * 0.45), Math.sin(a) * d, Math.cos(a) * d, 0)); }
      const m = new THREE.Mesh(mergeGeos(list), M.plainDark); m.castShadow = m.receiveShadow = true; G.add(m);
    } else {
      const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([T0.r0 + (R - T0.r0) * Math.pow(1 - t, 2.4), t * B.h]); }
      const m = new THREE.Mesh(lathe(pts, n0, w, rnd), pickMat(M, T0.mat === 'glow' ? 'body' : T0.mat)); m.castShadow = m.receiveShadow = true; G.add(m);
      if (B.fins) {
        const sh = new THREE.Shape([new THREE.Vector2(T0.r0 * 0.85, B.h * 1.25), new THREE.Vector2(R * 1.18, 0), new THREE.Vector2(T0.r0 * 0.85, 0)]);
        const fg = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.3, T0.r0 * 0.16), bevelEnabled: false }); fg.translate(0, 0, -Math.max(0.3, T0.r0 * 0.16) / 2);
        fg.rotateY(-Math.PI / 2); // radial along +z
        const mats = []; for (let i = 0; i < B.fins; i++) { const a = (B.fins === n0 ? phi0(n0) : 0) + i * Math.PI * 2 / B.fins; mats.push(M4(new THREE.Vector3(), a, new THREE.Vector3(1, 1, 1))); }
        G.add(instanced(fg, pickMat(M, T0.mat === 'glow' ? 'body' : T0.mat, true), mats));
      }
    }
    y = B.kind === 'buried' ? 0 : B.kind === 'crag' ? B.h * 0.82 : B.h;
  }
  const profile = [];
  s.tiers.forEach((T, ti) => {
    const y0 = y, n = T.sides, tw = (T.twist || 0) * Math.PI / 180, N = 20, pts = [];
    for (let i = 0; i <= N; i++) pts.push([rAt(T, i / N), y0 + T.h * i / N]);
    const g = twistGeo(lathe(pts, n, T.pat === 'none' ? w : w * 0.5, rnd), y0, T.h, tw);
    let mat = pickMat(M, T.mat);
    if (T.pat !== 'none' && NAQSH.MODES[T.pat]) {
      const tex = new THREE.CanvasTexture(patCanvas(T.pat, T.pal, s.seed)); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
      const circ = 2 * Math.PI * (T.r0 + T.r1) / 2; tex.repeat.set(Math.max(1, Math.round(circ / T.tile)), Math.max(0.2, T.h / T.tile));
      mat = mat.clone(); mat.map = tex; mat.color = new THREE.Color('#ffffff').lerp(new THREE.Color(T.mat === 'accent' ? L.accent : T.mat === 'dark' ? L.dark : L.body), T.mat === 'accent' ? 0.55 : 0.15);
      if (T.mat === 'glow') { mat = new THREE.MeshBasicMaterial({ map: tex, color: L.glow }); }
      M.list.push(mat); extra.tex.push(tex);
    }
    const body = new THREE.Mesh(g, mat); body.castShadow = body.receiveShadow = true; G.add(body);
    if (T.mat === 'glow') bloomify(body);
    // cap the top so ledges read
    const rTop = rAt(T, 1);
    G.add(Object.assign(new THREE.Mesh(twistGeo(lathe([[0, y0 + T.h], [rTop, y0 + T.h]], n), y0, T.h, tw), pickMat(M, T.mat === 'glow' ? 'dark' : T.mat, true)), { receiveShadow: true }));
    // ribs and glowing channels
    if (T.ribs > 0) {
      const arr = [], wid = Math.min(0.7, 2 * Math.PI * Math.min(T.r0, T.r1) / T.ribs * 0.32);
      for (let k = 0; k < T.ribs; k++) stripTris(T, y0, (T.ribs === n ? phi0(n) : 0) + k * Math.PI * 2 / T.ribs, wid, T.ribD, arr);
      const m = new THREE.Mesh(trisGeo(arr), pickMat(M, T.mat === 'glow' ? 'dark' : T.mat, true)); m.castShadow = m.receiveShadow = true; G.add(m);
    }
    if (T.chan > 0) {
      const arr = []; for (let k = 0; k < T.chan; k++) stripTris(T, y0, k * Math.PI * 2 / T.chan, 0.2, 0.05, arr);
      G.add(bloomify(new THREE.Mesh(trisGeo(arr), M.glow)));
    }
    // windows
    if (T.winRows > 0) {
      const rowH = T.h / T.winRows, list = [];
      const wh = T.winKind === 'round' ? rowH * 0.42 : T.winKind === 'slit' ? rowH * 0.62 : rowH * 0.58;
      const ww0 = T.winKind === 'round' ? wh : T.winKind === 'slit' ? wh * 0.32 : wh * 0.5;
      for (let rI = 0; rI < T.winRows; rI++) {
        const t = (rI + 0.5) / T.winRows, rr = rAt(T, t), ww = Math.min(ww0, 2 * Math.PI * rr / T.winPer * 0.55);
        for (let k = 0; k < T.winPer; k++) {
          const a = (k + (rI % 2 && T.winPer > 1 ? 0.5 : 0)) * Math.PI * 2 / T.winPer + tw * t, r = polyR(rr, n, a) + 0.04;
          list.push(M4(at(r, a, y0 + t * T.h), a, new THREE.Vector3(ww, wh, 1)));
        }
      }
      const wm = T.winGlow ? new THREE.MeshBasicMaterial({ color: L.glow, alphaMap: winTex(T.winKind), alphaTest: 0.5, side: THREE.DoubleSide }) : new THREE.MeshBasicMaterial({ color: '#0d0907', alphaMap: winTex(T.winKind), alphaTest: 0.5, side: THREE.DoubleSide });
      M.list.push(wm);
      const im = instanced(new THREE.PlaneGeometry(1, 1), wm, list); im.castShadow = false; G.add(T.winGlow ? bloomify(im) : im);
    }
    // band at the top
    addBand(T, y0 + T.h, rTop, n, M, G);
    if (T.stair > 0) addStair(T, y0, M, G);
    if (T.banN > 0) addBanners(T, y0 + T.h, rTop, n, M, G, rnd, extra);
    if (T.butN > 0) addButtresses(T, y0, M, G);
    // turrets round the foot
    if (T.spN > 0) {
      const sh = [], cap = [], ball = [], hh = T.spH * T.h, rr = T.spR;
      for (let k = 0; k < T.spN; k++) {
        const a = (k + 0.5) * Math.PI * 2 / T.spN, R = polyR(T.r0, n, a) + rr * 0.85;
        sh.push(M4(at(R, a, y0 + hh / 2), a, new THREE.Vector3(rr, hh, rr)));
        cap.push(M4(at(R, a, y0 + hh + rr * 1.1), a, new THREE.Vector3(rr * 1.15, rr * 2.2, rr * 1.15)));
        ball.push(M4(at(R, a, y0 + hh + rr * 2.35), 0, new THREE.Vector3(rr * 0.28, rr * 0.28, rr * 0.28)));
      }
      G.add(instanced(new THREE.CylinderGeometry(1, 1.08, 1, 16), pickMat(M, T.mat === 'glow' ? 'body' : T.mat, true), sh));
      G.add(instanced(new THREE.ConeGeometry(1, 1, 16), M.accent, cap));
      G.add(instanced(new THREE.SphereGeometry(1, 12, 8), M.accent, ball));
    }
    profile.push({ y0, y1: y0 + T.h, T });
    y += T.h;
  });
  const H = y, TL = s.tiers[s.tiers.length - 1] || TIER_DEF, rTop = rAt(TL, 1), nT = TL.sides;
  const crownTop = addCrown(s, H, rTop, nT, M, G, rnd, extra);
  return { H, top: crownTop, rTop, profile };
}
function addStair(T, y0, M, G) {
  // a stair winding up the outside of the tier: treads and risers, with a low parapet
  const turns = T.stair, N = Math.max(12, Math.round(turns * 40)), w = Math.max(0.8, Math.min(2.4, Math.min(T.r0, T.r1) * 0.38)), pos = [];
  const quad = (a, b, c, d) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, a0 = t0 * turns * Math.PI * 2, a1 = t1 * turns * Math.PI * 2, y = y0 + t0 * T.h * 0.92, yN = y0 + t1 * T.h * 0.92;
    const r0 = polyR(rAt(T, t0), T.sides, a0) - 0.05, r1 = polyR(rAt(T, t1), T.sides, a1) - 0.05;
    const A = at(r0, a0, y), B2 = at(r0 + w, a0, y), C = at(r1 + w, a1, y), D = at(r1, a1, y);
    quad(A, B2, C, D); // tread
    const U = at(r1, a1, yN), V = at(r1 + w, a1, yN); quad(D, C, V, U); // riser
    const P0 = at(r0 + w, a0, y - 0.35), P1 = at(r1 + w, a1, y - 0.35), Q0 = at(r0 + w, a0, y + 0.75), Q1 = at(r1 + w, a1, yN + 0.75); quad(P0, P1, Q1, Q0); // parapet
    const S0 = at(r0, a0, y - 0.35), S1 = at(r1, a1, y - 0.35); quad(S0, S1, P1, P0); // underside
  }
  const m = new THREE.Mesh(trisGeo(pos), pickMat(M, T.mat === 'glow' ? 'body' : T.mat, true)); m.castShadow = m.receiveShadow = true; G.add(m);
}
function addBanners(T, y1, rt, n, M, G, rnd, extra) {
  // cloth strips hanging from the tier top, swaying in the wind
  const k = T.banN, len = T.banLen, wdt = Math.max(0.4, Math.min(1.6, 2 * Math.PI * rt / k * 0.45));
  const items = [];
  for (let i = 0; i < k; i++) {
    const a = (i + 0.5) * Math.PI * 2 / k, r = polyR(rt, n, a) + 0.18 + (T.band === 'balcony' ? T.bandSize * 1.25 : T.band !== 'none' ? T.bandSize * 0.4 : 0);
    const g = new THREE.PlaneGeometry(wdt, len, 1, 14); g.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(g, M.cloth); m.position.copy(at(r, a, y1 - 0.1)); m.rotation.y = a; m.castShadow = true; G.add(m);
    items.push({ g, base: Float32Array.from(g.attributes.position.array), ph: rnd() * 6.28, amp: 0.25 + rnd() * 0.3 });
  }
  if (extra && extra.anim) extra.anim.push(t => {
    for (const it of items) {
      const p = it.g.attributes.position, b0 = it.base;
      for (let i = 0; i < p.count; i++) { const by = b0[i * 3 + 1], v = -by / len, sway = Math.sin(t * 1.6 + it.ph + v * 3.2) * it.amp * Math.pow(v, 1.4) * len * 0.12; p.setXYZ(i, b0[i * 3] + Math.sin(t * 2.1 + it.ph + v * 4) * 0.08 * v * len * 0.1, by + Math.abs(sway) * 0.15, b0[i * 3 + 2] + sway + v * 0.4); }
      p.needsUpdate = true; it.g.computeVertexNormals();
    }
  });
}
function addButtresses(T, y0, M, G) {
  // flying buttresses: a free-standing pier tied to the wall by a sloping half-arch
  const k = T.butN, reach = T.butR, yp = y0 + T.h * 0.5, yw = y0 + T.h * 0.85, th = Math.max(0.5, T.h * 0.05), dep = Math.max(0.5, Math.min(T.r0, T.r1) * 0.14);
  const piers = [], caps = [], flyers = [];
  const rw = Math.min(T.r0, T.r1) * 0.95, R = Math.max(T.r0, T.r1) + reach;
  const sh = new THREE.Shape(); sh.moveTo(R - 0.4, yp + th); sh.lineTo(rw, yw + th * 0.6);
  sh.lineTo(rw, yw - th * 1.2); for (let i = 1; i <= 10; i++) { const u = i / 10, x = rw + (R - 0.4 - rw) * u, yy = (yw - th * 1.2) + ((yp - th) - (yw - th * 1.2)) * u - Math.sin(Math.PI * u) * th * 1.4; sh.lineTo(x, yy); } sh.closePath();
  const fg = new THREE.ExtrudeGeometry(sh, { depth: dep, bevelEnabled: false }); fg.translate(0, 0, -dep / 2);
  const pierH = yp + th * 2.2, pw = Math.max(0.8, dep * 1.6);
  for (let i = 0; i < k; i++) {
    const a = (i + 0.5) * Math.PI * 2 / k;
    flyers.push(M4(new THREE.Vector3(), a - Math.PI / 2, new THREE.Vector3(1, 1, 1)));
    piers.push(M4(at(R, a, pierH / 2), a, new THREE.Vector3(pw, pierH, pw)));
    caps.push(M4(at(R, a, pierH + pw * 1.2), a + Math.PI / 4, new THREE.Vector3(pw * 0.75, pw * 2.4, pw * 0.75)));
  }
  const mat = pickMat(M, T.mat === 'glow' || T.mat === 'accent' ? 'body' : T.mat, true);
  G.add(instanced(fg, mat, flyers)); G.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat, piers)); G.add(instanced(new THREE.ConeGeometry(1, 1, 4), mat, caps));
}
function addBand(T, y1, rt, n, M, G) {
  const s = T.bandSize, circ = 2 * Math.PI * rt, mat = pickMat(M, T.mat === 'glow' ? 'body' : T.mat, true);
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; G.add(o); return o; };
  switch (T.band) {
    case 'ring': { const pts = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 10; pts.push([rt + Math.cos(a) * s * 0.35, y1 + Math.sin(a) * s * 0.35]); } add(lathe(pts, n), mat); break; }
    case 'balcony': {
      const o = s * 1.25;
      add(lathe([[rt - 0.02, y1 - 0.18], [rt + o, y1 - 0.18], [rt + o, y1 + 0.12], [rt + o, y1 + 0.12 + s * 0.85], [rt + o - 0.14, y1 + 0.12 + s * 0.85], [rt + o - 0.14, y1 + 0.12], [rt - 0.02, y1 + 0.12]], n), mat);
      const k = Math.max(6, Math.round(circ / Math.max(0.6, s * 1.4))), cs = [];
      for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, R = polyR(rt, n, a) + o * 0.55; cs.push(M4(at(R, a, y1 - 0.18 - s * 0.5), a, new THREE.Vector3(o * 0.32, s, o * 0.55), Math.PI)); }
      G.add(instanced(new THREE.ConeGeometry(1, 1, 4), mat, cs)); break;
    }
    case 'corbel': {
      add(lathe([[rt - 0.02, y1 - s * 1.6], [rt + s * 0.22, y1 - s * 1.6], [rt + s * 0.22, y1 - s * 1.05], [rt + s * 0.5, y1 - s * 1.05], [rt + s * 0.5, y1 - s * 0.5], [rt + s * 0.8, y1 - s * 0.5], [rt + s * 0.8, y1], [rt - 0.02, y1]], n), mat);
      const k = Math.max(8, Math.round(circ / Math.max(0.4, s * 0.8))), cs = [];
      for (let i = 0; i < k; i++) { const a = (i + 0.5) * Math.PI * 2 / k, R = polyR(rt, n, a) + s * 0.52; cs.push(M4(at(R, a, y1 - s * 0.78), a, new THREE.Vector3(s * 0.28, s * 0.45, 0.04))); }
      const im = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#1a1210', alphaMap: winTex('arch'), alphaTest: 0.5, side: THREE.DoubleSide }), cs); im.castShadow = false; G.add(im); break;
    }
    case 'beads': {
      add(lathe([[rt - 0.02, y1 - s * 1.25], [rt + s * 0.12, y1 - s * 1.25], [rt + s * 0.12, y1], [rt - 0.02, y1]], n), mat);
      const k = Math.max(6, Math.round(circ / (s * 1.25))), cs = [];
      for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, R = polyR(rt, n, a) + s * 0.16; cs.push(M4(at(R, a, y1 - s * 0.62), a, new THREE.Vector3(s, s, s))); }
      G.add(instanced(new THREE.TorusGeometry(0.42, 0.09, 8, 24), M.accent, cs)); break;
    }
    case 'crenel': {
      const k = Math.max(6, Math.round(circ / (s * 1.3))), cs = [];
      for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, R = polyR(rt, n, a) - s * 0.2; cs.push(M4(at(R, a, y1 + s * 0.5), a, new THREE.Vector3(s * 0.65, s, s * 0.4))); }
      G.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat, cs)); break;
    }
    case 'glyphs': {
      add(lathe([[rt - 0.02, y1 - s * 1.3], [rt + 0.08, y1 - s * 1.3], [rt + 0.08, y1], [rt - 0.02, y1]], n), M.plainDark);
      const tex = glyphStripTex().clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(Math.max(1, Math.round(circ / (s * 6))), 1);
      const gm = new THREE.MeshBasicMaterial({ color: M.glow.color, map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); M.list.push(gm);
      const o = new THREE.Mesh(lathe([[rt + 0.1, y1 - s * 1.25], [rt + 0.1, y1 - s * 0.05]], n), gm); o.userData.tex = tex; G.add(bloomify(o)); break;
    }
    case 'drops': {
      add(lathe([[rt - 0.02, y1 - s * 0.5], [rt + s * 0.25, y1 - s * 0.5], [rt + s * 0.25, y1], [rt - 0.02, y1]], n), M.accent);
      const k = Math.max(6, Math.round(circ / (s * 1.5))), cs = [], bs = [];
      for (let i = 0; i < k; i++) { const a = (i + 0.5) * Math.PI * 2 / k, R = polyR(rt, n, a) + s * 0.18; cs.push(M4(at(R, a, y1 - s * 1.25), a, new THREE.Vector3(s * 0.2, s * 1.3, s * 0.2), Math.PI)); bs.push(M4(at(R, a, y1 - s * 0.62), a, new THREE.Vector3(s * 0.22, s * 0.3, s * 0.22))); }
      G.add(instanced(new THREE.ConeGeometry(1, 1, 10), M.accent, cs)); G.add(instanced(new THREE.SphereGeometry(1, 10, 8), M.accent, bs)); break;
    }
  }
}
function addCrown(s, H, rt, n, M, G, rnd, extra = {}) {
  const C = s.crown, h = C.h, mat = pickMat(M, C.mat, C.mat !== 'glow'), out = [];
  const add = (geo, m = mat) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; G.add(o); if (m === M.glow) bloomify(o); return o; };
  let top = H;
  switch (C.kind) {
    case 'flat': add(lathe([[0, H + 0.25], [rt * 1.04, H + 0.25], [rt * 1.04, H], [rt, H]], n)); top = H + 0.25; break;
    case 'dome': { const pts = []; for (let i = 0; i <= 18; i++) { const a = Math.PI / 2 * i / 18; pts.push([rt * 0.97 * Math.cos(a), H + h * Math.sin(a)]); } add(lathe(pts, 48)); top = H + h; break; }
    case 'onion': { const P = [[1, 0], [1.12, 0.14], [1.16, 0.3], [1.02, 0.48], [0.72, 0.66], [0.4, 0.82], [0.14, 0.94], [0.02, 1]]; add(lathe(P.map(([r, yy]) => [r * rt * 0.88, H + yy * h]), 48)); top = H + h; break; }
    case 'cone': add(lathe([[rt * 1.06, H], [0.02, H + h]], n || 48)); top = H + h; break;
    case 'spire': {
      add(lathe([[rt * 0.55, H], [rt * 0.42, H + h * 0.08], [0.02, H + h]], n || 24));
      for (let i = 1; i <= 3; i++) { const yy = H + h * i * 0.18, r = rt * 0.42 * (1 - i * 0.18); const tg = new THREE.TorusGeometry(r + 0.06, 0.08 + rt * 0.02, 8, 32); tg.rotateX(Math.PI / 2); tg.translate(0, yy, 0); add(tg, M.accent); }
      top = H + h; break;
    }
    case 'spikes': {
      add(lathe([[0, H + 0.2], [rt * 1.08, H + 0.2], [rt * 1.08, H], [rt, H]], n));
      const k = Math.max(6, Math.round(rt * 3)), list = [];
      for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, hh = h * (i % 2 ? 0.28 : 0.5) * (0.8 + rnd() * 0.4); const g = new THREE.ConeGeometry(Math.max(0.08, rt * 0.08), hh, 8); g.translate(0, hh / 2, 0); g.translate(Math.sin(a) * rt * 0.92, H + 0.2, Math.cos(a) * rt * 0.92); list.push(g); }
      const c = new THREE.ConeGeometry(Math.max(0.12, rt * 0.16), h, 10); c.translate(0, H + 0.2 + h / 2, 0); list.push(c);
      add(mergeGeos(list)); top = H + 0.2 + h; break;
    }
    case 'crenel': {
      add(lathe([[0, H + 0.2], [rt, H + 0.2], [rt, H]], n));
      const k = Math.max(6, Math.round(2 * Math.PI * rt / Math.max(0.6, h * 0.9))), cs = [];
      for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, R = polyR(rt, n, a) - h * 0.15; cs.push(M4(at(R, a, H + 0.2 + h * 0.4), a, new THREE.Vector3(h * 0.55, h * 0.8, h * 0.3))); }
      G.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat, cs)); top = H + h; break;
    }
    case 'lantern': {
      add(lathe([[0, H + 0.2], [rt * 1.05, H + 0.2], [rt * 1.05, H], [rt, H]], n));
      const k = 8, cs = [], ch = h * 0.55;
      for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k; cs.push(M4(at(rt * 0.82, a, H + 0.2 + ch / 2), a, new THREE.Vector3(rt * 0.07 + 0.05, ch, rt * 0.07 + 0.05))); }
      G.add(instanced(new THREE.CylinderGeometry(1, 1, 1, 10), mat, cs));
      add(lathe([[0, H + 0.2 + ch], [rt, H + 0.2 + ch], [rt, H + 0.45 + ch]].concat(Array.from({ length: 13 }, (_, i) => { const a = Math.PI / 2 * i / 12; return [rt * 0.9 * Math.cos(a), H + 0.45 + ch + h * 0.45 * Math.sin(a)]; })), 48));
      const orb = new THREE.SphereGeometry(rt * 0.45, 24, 16); orb.translate(0, H + 0.2 + ch * 0.5, 0); add(orb, M.glow);
      top = H + 0.45 + ch + h * 0.45; break;
    }
    case 'crescent': {
      add(lathe([[0, H + 0.2], [rt * 1.05, H + 0.2], [rt * 1.05, H], [rt, H]], n));
      const R = Math.max(rt * 1.2, h * 0.5), tube = Math.max(0.3, rt * 0.42), arc = Math.PI * 1.4, seg = 7, gap = 0.035, list = [];
      for (let i = 0; i < seg; i++) {
        const a0 = -Math.PI / 2 - arc / 2 + arc * i / seg + gap, a1 = -Math.PI / 2 - arc / 2 + arc * (i + 1) / seg - gap;
        const tg = new THREE.TorusGeometry(R, tube * (1 - Math.abs(i - (seg - 1) / 2) / seg * 0.6), 6, 10, a1 - a0); tg.rotateZ(a0); list.push(tg);
      }
      const g = mergeGeos(list); g.translate(0, H + 0.2 + R - tube * 0.2, 0); add(g, pickMat(M, C.mat, true));
      top = H + R * 2; break;
    }
    case 'gothic': {
      // central spire with crockets, ringed by smaller pinnacles
      add(lathe([[0, H + 0.3], [rt * 1.04, H + 0.3], [rt * 1.04, H], [rt, H]], n));
      const list = [];
      const sp = lathe([[rt * 0.55, H + 0.3], [rt * 0.5, H + 0.3 + h * 0.12], [rt * 0.42, H + 0.3 + h * 0.12], [0.03, H + 0.3 + h]], 8); list.push(sp);
      const k = n >= 4 ? n : 8, pins = [], crk = [];
      for (let i = 0; i < k; i++) {
        const a = phi0(k) + i * Math.PI * 2 / k, R2 = polyR(rt, n, a) * 0.86, ph = h * 0.32;
        const shaft = new THREE.BoxGeometry(rt * 0.14 + 0.1, ph * 0.45, rt * 0.14 + 0.1); shaft.translate(Math.sin(a) * R2, H + 0.3 + ph * 0.225, Math.cos(a) * R2); list.push(shaft);
        const cone = new THREE.ConeGeometry(rt * 0.1 + 0.08, ph * 0.75, 4); cone.rotateY(Math.PI / 4); cone.translate(Math.sin(a) * R2, H + 0.3 + ph * 0.45 + ph * 0.375, Math.cos(a) * R2); list.push(cone);
      }
      for (let j = 1; j <= 6; j++) for (let i = 0; i < 8; i++) { // crockets up the spire's ridges
        const u = 0.12 + j * 0.13, a = phi0(8) + i * Math.PI / 4, rr = rt * 0.42 * (1 - (u - 0.12) / 0.88) + 0.05, yy = H + 0.3 + h * u;
        crk.push(M4(at(rr + 0.08, a, yy), a, new THREE.Vector3(0.12 + rt * 0.03, 0.3 + h * 0.02, 0.12 + rt * 0.03), -0.6));
      }
      add(mergeGeos(list)); G.add(instanced(new THREE.ConeGeometry(1, 1, 4), mat, crk));
      top = H + 0.3 + h; break;
    }
    case 'belfry': {
      // open arched belfry with a hanging bell under a pyramid roof
      add(lathe([[0, H + 0.25], [rt * 1.04, H + 0.25], [rt * 1.04, H], [rt, H]], n));
      const k = n >= 4 ? n : 4, ph = h * 0.55, list = [];
      for (let i = 0; i < k; i++) { const a = phi0(k) + i * Math.PI * 2 / k, R2 = polyR(rt, n, a) * 0.88, b = new THREE.BoxGeometry(rt * 0.22 + 0.15, ph, rt * 0.22 + 0.15); b.rotateY(a); b.translate(Math.sin(a) * R2, H + 0.25 + ph / 2, Math.cos(a) * R2); list.push(b); }
      list.push(lathe([[rt * 0.6, H + 0.25 + ph], [rt * 1.02, H + 0.25 + ph], [rt * 1.02, H + 0.6 + ph], [0, H + 0.6 + ph]], n || 8));
      list.push(lathe([[rt * 1.12, H + 0.6 + ph], [0.02, H + 0.6 + ph + h * 0.45]], k));
      add(mergeGeos(list));
      const bell = new THREE.Mesh(lathe([[0.02, 0], [rt * 0.12, -0.05], [rt * 0.2, -ph * 0.15], [rt * 0.26, -ph * 0.38], [rt * 0.38, -ph * 0.5], [rt * 0.36, -ph * 0.52]], 24), M.accent);
      bell.position.set(0, H + 0.25 + ph * 0.95, 0); bell.castShadow = true; G.add(bell);
      if (extra.anim) extra.anim.push(t => { bell.rotation.x = Math.sin(t * 1.1) * 0.18; });
      top = H + 0.6 + ph + h * 0.45; break;
    }
    case 'broken': {
      const list = [], k = 7;
      for (let i = 0; i < k; i++) { const a = rnd() * Math.PI * 2, r = rt * (0.2 + rnd() * 0.7), hh = h * (0.2 + rnd()), b = new THREE.BoxGeometry(rt * (0.25 + rnd() * 0.4), hh, rt * (0.25 + rnd() * 0.4)); b.rotateY(rnd() * 3); b.translate(Math.sin(a) * r, H + hh / 2, Math.cos(a) * r); list.push(b); }
      add(mergeGeos(list), pickMat(M, C.mat, true)); add(lathe([[0, H + 0.05], [rt, H + 0.05], [rt, H]], n), pickMat(M, C.mat, true)); top = H + h; break;
    }
  }
  if (C.finial) {
    const f1 = new THREE.CylinderGeometry(0.05, 0.08, Math.max(1, h * 0.35), 8); f1.translate(0, top + Math.max(0.5, h * 0.175), 0);
    const f2 = new THREE.SphereGeometry(Math.max(0.14, rt * 0.06), 12, 8); f2.translate(0, top + Math.max(0.6, h * 0.22), 0);
    add(mergeGeos([f1, f2]), M.accent); top += Math.max(1, h * 0.35);
  }
  return top;
}

// ---------- the aura: halos, debris, beam, motes, satellites; each returns an update(t, dt) ----------
function buildAura(s, M, rnd, G, info, anim) {
  const A = s.aura, L = s.look, Htop = info.H;
  let firstPortal = null;
  s.halos.forEach((h, hi) => {
    const holder = new THREE.Group(), face = h.face * Math.PI / 180;
    holder.position.set(Math.sin(face) * h.off + (Htop + h.y) * (info.lean || 0), Htop + h.y, Math.cos(face) * h.off); holder.rotation.y = face;
    const tiltG = new THREE.Group(); tiltG.rotation.x = h.tilt * Math.PI / 180; holder.add(tiltG); G.add(holder);
    const r = h.r, spin = h.spin;
    if (h.kind === 'portal') {
      const rings = [];
      for (let i = 0; i < Math.max(1, h.n); i++) {
        const rr = r * (1 - i * 0.14), tg = new THREE.TorusGeometry(rr, i ? r * 0.018 + 0.02 : r * 0.045 + 0.04, 8, 96);
        const m = new THREE.Mesh(tg, i ? M.glowAdd : M.glow); tiltG.add(bloomify(m)); rings.push(m);
      }
      const gm = new THREE.MeshBasicMaterial({ color: L.glow, map: glyphTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9 }); M.list.push(gm);
      const glyph = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 64), gm); tiltG.add(bloomify(glyph));
      const sm = new THREE.MeshBasicMaterial({ color: L.glow, map: swirlTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.75 }); M.list.push(sm);
      const swirl = new THREE.Mesh(new THREE.CircleGeometry(r * 0.62, 48), sm); swirl.position.z = 0.02; tiltG.add(bloomify(swirl));
      anim.push((t) => { rings.forEach((m, i) => m.rotation.z = t * spin * (i % 2 ? -1.3 : 1) * (1 + i * 0.2)); glyph.rotation.z = -t * spin * 0.35; swirl.rotation.z = t * spin * 2.2; sm.opacity = 0.6 + 0.2 * Math.sin(t * 2.3); });
      if (!firstPortal) firstPortal = tiltG;
    } else if (h.kind === 'armillary') {
      const rings = [];
      for (let i = 0; i < Math.max(1, h.n); i++) {
        const rr = r * (1 - i * 0.07), g = new THREE.Group(), q = new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
        g.rotation.copy(q);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, Math.max(0.05, r * 0.014), 8, 120), M.accent); ring.castShadow = true; g.add(ring);
        const pa = rnd() * Math.PI * 2, planet = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.2, r * (0.04 + rnd() * 0.05)), 20, 14), M.accent);
        planet.position.set(Math.cos(pa) * rr, Math.sin(pa) * rr, 0); planet.castShadow = true; g.add(planet);
        if (i === 0) { const ticks = []; for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; ticks.push(M4(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0), 0, new THREE.Vector3(0.06, 0.06, r * 0.05 + 0.1))); } g.add(instanced(new THREE.BoxGeometry(1, 1, 1), M.accent, ticks)); }
        tiltG.add(g); rings.push({ g, axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), sp: (0.3 + rnd()) * (rnd() < 0.5 ? -1 : 1), base: g.quaternion.clone() });
      }
      anim.push((t) => { for (const R of rings) R.g.quaternion.copy(R.base).premultiply(new THREE.Quaternion().setFromAxisAngle(R.axis, t * spin * R.sp)); tiltG.rotation.y = t * spin * 0.15; });
    } else if (h.kind === 'gear') {
      const arc = Math.PI * 1.45, g = new THREE.Group(); tiltG.add(g);
      const tg = new THREE.TorusGeometry(r, Math.max(0.12, r * 0.05), 8, 120, arc); tg.rotateZ(-Math.PI / 2 - arc / 2 + Math.PI);
      const ring = new THREE.Mesh(tg, M.accent); ring.castShadow = true; g.add(ring);
      const inner = new THREE.TorusGeometry(r * 0.86, Math.max(0.05, r * 0.012), 6, 120, arc); inner.rotateZ(-Math.PI / 2 - arc / 2 + Math.PI); g.add(bloomify(new THREE.Mesh(inner, M.glow)));
      const k = Math.round(arc * r / 0.9), teeth = [];
      for (let i = 0; i <= k; i++) { const a = Math.PI / 2 - arc / 2 + arc * i / k; teeth.push(M4(new THREE.Vector3(Math.cos(a) * (r + r * 0.07), Math.sin(a) * (r + r * 0.07), 0), 0, new THREE.Vector3(0.35, 0.35, 0.3)).multiply(new THREE.Matrix4().makeRotationZ(a))); }
      g.add(instanced(new THREE.BoxGeometry(1.4, 0.8, 1), M.accent, teeth));
      anim.push((t) => { g.rotation.z = Math.sin(t * spin) * 0.35; });
    } else if (h.kind === 'ring') {
      const g = new THREE.Group(); g.rotation.x = Math.PI / 2; tiltG.add(g);
      g.add(bloomify(new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.04, r * 0.012), 6, 160), M.glow)));
      const k = Math.round(r * 4), dots = []; for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2; dots.push(M4(new THREE.Vector3(Math.cos(a) * r * 1.06, Math.sin(a) * r * 1.06, 0), 0, new THREE.Vector3(0.12, 0.12, 0.12))); }
      g.add(bloomify(instanced(new THREE.SphereGeometry(1, 8, 6), M.glow, dots)));
      anim.push((t) => { g.rotation.z = t * spin * 0.6; });
    } else if (h.kind === 'orb') {
      const om = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.glow).multiplyScalar(0.8) }); M.list.push(om); tiltG.add(bloomify(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), om)));
      const sm = new THREE.SpriteMaterial({ map: dotTex(), color: L.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); M.list.push(sm);
      sm.opacity = 0.6; const halo = new THREE.Sprite(sm); halo.scale.set(r * 3.6, r * 3.6, 1); tiltG.add(bloomify(halo));
      const N = 420, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, rr = r * (1.5 + rnd() * 1.6); pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = (rnd() - 0.5) * r * 0.15; pos[i * 3 + 2] = Math.sin(a) * rr; }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({ color: L.glow, size: Math.max(0.12, r * 0.09), map: dotTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); M.list.push(pm);
      const disk = new THREE.Points(pg, pm); tiltG.add(bloomify(disk));
      anim.push((t) => { disk.rotation.y = t * spin; halo.material.opacity = 0.45 + 0.15 * Math.sin(t * 1.7); });
    }
  });
  if (A.beam && firstPortal) {
    const bm = new THREE.MeshBasicMaterial({ color: L.glow, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }); M.list.push(bm);
    const bg = new THREE.CylinderGeometry(0.12, 0.5, A.beamLen, 12, 1, true); bg.rotateX(Math.PI / 2); bg.translate(0, 0, A.beamLen / 2 + 0.2);
    const beam = new THREE.Mesh(bg, bm); firstPortal.add(bloomify(beam));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.14, A.beamLen, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, A.beamLen / 2 + 0.2), M.glow); firstPortal.add(bloomify(core));
    anim.push((t) => { bm.opacity = 0.55 + 0.3 * Math.sin(t * 5) * Math.sin(t * 1.3); });
  }
  // debris
  if (A.debN > 0) {
    const geo = A.debKind === 'crystal' ? new THREE.OctahedronGeometry(1, 0).scale(0.4, 1.5, 0.4) : A.debKind === 'block' ? new THREE.BoxGeometry(1, 1.3, 1) : A.debKind === 'shard' ? new THREE.OctahedronGeometry(1, 0).scale(0.45, 1.6, 0.3) : (() => { const g = new THREE.IcosahedronGeometry(1, 0); const p = g.attributes.position; const seen = {}; for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3); seen[k] = seen[k] || 0.75 + rnd() * 0.5; p.setXYZ(i, p.getX(i) * seen[k], p.getY(i) * seen[k], p.getZ(i) * seen[k]); } g.computeVertexNormals(); return g; })();
    let mat = A.debKind === 'shard' ? M.accent : A.debKind === 'block' ? M.plainBody : M.plainDark;
    if (A.debKind === 'crystal') { mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.glow).multiplyScalar(0.85), transparent: true, opacity: 0.9 }); M.list.push(mat); }
    const im = new THREE.InstancedMesh(geo, mat, A.debN); im.castShadow = A.debKind !== 'crystal'; im.frustumCulled = false;
    if (A.debKind === 'crystal') bloomify(im);
    const P = [];
    for (let i = 0; i < A.debN; i++) P.push({ a: rnd() * Math.PI * 2, r: Math.max(1.5, A.debR + (rnd() - 0.5) * 2 * A.debSpread), y: info.top * (A.debLow + rnd() * (1.08 - A.debLow)), s: A.debSize * (0.35 + rnd() * rnd() * 1.6), ax: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), w: (rnd() - 0.5) * 1.4, ph: rnd() * 6.28, sp: (0.15 + rnd() * 0.6) * (rnd() < 0.85 ? 1 : -1) });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const upd = (t) => { for (let i = 0; i < P.length; i++) { const p = P[i], a = p.a + t * A.drift * p.sp * 2.5 / Math.sqrt(p.r); q.setFromAxisAngle(p.ax, p.ph + t * p.w * A.drift); m.compose(new THREE.Vector3(Math.sin(a) * p.r, p.y + Math.sin(t * 0.7 + p.ph) * 0.35 * A.drift, Math.cos(a) * p.r), q, new THREE.Vector3(p.s, p.s, p.s)); im.setMatrixAt(i, m); } im.instanceMatrix.needsUpdate = true; };
    upd(0); anim.push(upd); G.add(im);
  }
  // satellite pillars
  if (A.satN > 0 && s.tiers.length) {
    for (let i = 0; i < A.satN; i++) {
      const a = (i + 0.3 + rnd() * 0.4) / A.satN * Math.PI * 2, R = A.satR * (0.75 + rnd() * 0.5), sc = A.satScale * (0.55 + rnd() * 0.7);
      const T0 = Object.assign({}, s.tiers[0], { h: info.H * sc, r0: s.tiers[0].r0 * A.satScale * (0.6 + rnd() * 0.5), winRows: 0, spN: 0, band: 'none', chan: 0, pat: 'none', stair: 0, banN: 0, butN: 0 });
      T0.r1 = T0.r0 * (0.65 + rnd() * 0.3);
      const sub = Object.assign(clone(s), { tiers: [T0], crown: { kind: 'broken', h: T0.r0 * 1.5, mat: s.tiers[0].mat === 'glow' ? 'dark' : s.tiers[0].mat, finial: false }, base: { kind: s.base.kind === 'roots' ? 'roots' : 'none', h: T0.h * 0.15, spread: 1.5, fins: 0, lean: 0 } });
      const g = new THREE.Group(); const inf = buildBody(sub, M, rnd, g, { tex: [], anim: null });
      g.position.set(Math.sin(a) * R, 0, Math.cos(a) * R); g.rotation.y = rnd() * 6.28; G.add(g);
      if (A.satGlow) {
        const sm = new THREE.SpriteMaterial({ map: dotTex(), color: L.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); M.list.push(sm);
        const sp = new THREE.Sprite(sm); sp.scale.set(T0.r0 * 2.4, T0.r0 * 2.4, 1); sp.position.set(0, inf.top + T0.r0 * 0.4, 0); g.add(bloomify(sp));
        const ph = rnd() * 6; anim.push(t => { sm.opacity = 0.5 + 0.25 * Math.sin(t * 1.3 + ph); });
      }
    }
  }
  // bridge: a deck on arched spans running out from the tower
  if (A.bridge) {
    const yb = Math.max(3, info.H * A.bridgeAt), dir = A.bridgeFace * Math.PI / 180, r0 = radiusAtY(info, yb) * 0.9, L0 = A.bridgeLen;
    const span = Math.max(6, Math.min(18, yb * 0.7)), nSp = Math.max(1, Math.round(L0 / span)), spw = L0 / nSp, wd = 3.2, pier = Math.min(2.2, spw * 0.25);
    const list = [], keep = A.bridgeBroken ? Math.max(1, Math.ceil(nSp * 0.7)) : nSp;
    for (let i = 0; i < keep; i++) {
      const x0 = r0 + i * spw, sh = new THREE.Shape();
      sh.moveTo(x0, 0); sh.lineTo(x0 + spw, 0); sh.lineTo(x0 + spw, yb); sh.lineTo(x0, yb); sh.closePath();
      const ah = Math.min(yb - 1.4, yb * 0.85), hw = (spw - pier) / 2, cx = x0 + spw / 2, hole = new THREE.Path();
      hole.moveTo(cx - hw, 0); hole.lineTo(cx - hw, Math.max(0.5, ah - hw)); hole.quadraticCurveTo(cx - hw, ah, cx, ah + hw * 0.15 > yb - 1 ? yb - 1 : ah); hole.quadraticCurveTo(cx + hw, ah, cx + hw, Math.max(0.5, ah - hw)); hole.lineTo(cx + hw, 0);
      hole.closePath(); sh.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(sh, { depth: wd, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -wd / 2); list.push(g);
    }
    const deckLen = A.bridgeBroken ? keep * spw * (0.92 + rnd() * 0.06) : L0;
    const deck = new THREE.BoxGeometry(deckLen, 0.7, wd + 0.8); deck.translate(r0 + deckLen / 2, yb + 0.35, 0); list.push(deck);
    for (const sd of [-1, 1]) { const par = new THREE.BoxGeometry(deckLen, 1, 0.3); par.translate(r0 + deckLen / 2, yb + 1.2, sd * (wd / 2 + 0.25)); list.push(par); }
    if (A.bridgeBroken) for (let i = 0; i < 8; i++) { const b = new THREE.BoxGeometry(0.6 + rnd(), 0.5 + rnd(), 0.6 + rnd()); b.rotateY(rnd() * 3); b.translate(r0 + deckLen + rnd() * spw, 0.4, (rnd() - 0.5) * wd * 2); list.push(b); }
    const bm = new THREE.Mesh(mergeGeos(list), M.plainBody); bm.castShadow = bm.receiveShadow = true;
    bm.rotation.y = dir - Math.PI / 2; bm.position.x = yb * (info.lean || 0) * 0; G.add(bm);
  }
  // roots climbing the shaft, tapering as they rise
  if (A.roots > 0) {
    const reachY = info.H * A.rootsH, mat = A.rootsGlow ? M.glow : M.plainDark, leaves = [];
    for (let i = 0; i < A.roots; i++) {
      const a0 = i / A.roots * Math.PI * 2 + rnd() * 0.5, dirn = rnd() < 0.5 ? -1 : 1, tw = (0.6 + rnd() * 1.4) * dirn, top = reachY * (0.45 + rnd() * 0.55), pts = [], thick = Math.max(0.12, info.rMax * (0.05 + rnd() * 0.05));
      for (let j = 0; j <= 14; j++) {
        const u = j / 14, y = u * top, a = a0 + tw * u + Math.sin(u * 9 + i) * 0.08, flare = Math.pow(1 - Math.min(1, u * 5), 2);
        const r = radiusAtY(info, y) + thick * 0.6 + flare * info.rMax * (0.8 + rnd() * 0.6);
        pts.push(at(r, a, y - (u === 0 ? 0.3 : 0)));
      }
      const curve = new THREE.CatmullRomCurve3(pts), segs = 60, rad = 8, g = new THREE.TubeGeometry(curve, segs, thick, rad, false), p = g.attributes.position;
      for (let s2 = 0; s2 <= segs; s2++) { const c = curve.getPointAt(s2 / segs), k = 1 - 0.85 * s2 / segs; for (let q = 0; q <= rad; q++) { const vi = s2 * (rad + 1) + q; p.setXYZ(vi, c.x + (p.getX(vi) - c.x) * k, c.y + (p.getY(vi) - c.y) * k, c.z + (p.getZ(vi) - c.z) * k); } }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.castShadow = true; info.body.add(A.rootsGlow ? bloomify(m) : m);
      if (A.rootsGlow) for (let j = 0; j < 14; j++) { const c = curve.getPointAt(0.25 + rnd() * 0.75); leaves.push(c.x + (rnd() - 0.5) * 1.2, c.y + (rnd() - 0.5) * 1.2, c.z + (rnd() - 0.5) * 1.2); }
    }
    if (leaves.length) {
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(leaves, 3));
      const pm = new THREE.PointsMaterial({ color: L.glow, size: 0.45, map: dotTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); M.list.push(pm);
      info.body.add(bloomify(new THREE.Points(pg, pm)));
    }
  }
  // a band of cloud wrapping the tower
  if (A.clouds > 0) {
    const sk = TW_SKIES[L.sky] || TW_SKIES.dusk, cy = info.top * A.cloudsAt, N = Math.round(14 + A.clouds * 40), grp = new THREE.Group(), base = [];
    const cm = new THREE.SpriteMaterial({ map: cloudTex(), color: new THREE.Color(sk.fog).lerp(new THREE.Color('#ffffff'), 0.25), transparent: true, opacity: 0.1 + A.clouds * 0.3, depthWrite: false, fog: true }); M.list.push(cm);
    for (let i = 0; i < N; i++) { const a = i / N * 6.28 + rnd() * 0.4, r = info.rMax * (1.6 + rnd() * 3.5), sp = new THREE.Sprite(cm), sc = info.rMax * (1.6 + rnd() * 2.2); sp.scale.set(sc * 2.2, sc * 0.8, 1); sp.position.set(Math.sin(a) * r, cy + (rnd() - 0.5) * info.rMax * 0.6, Math.cos(a) * r); grp.add(sp); }
    G.add(grp); anim.push(t => { grp.rotation.y = t * 0.02; });
  }
  // motes
  if (A.motes > 0) {
    const N = A.motes, pos = new Float32Array(N * 3), sp = new Float32Array(N), Rm = Math.max(info.rMax * 2.2, A.debN ? A.debR + A.debSpread : 0, A.satN ? A.satR * 1.2 : 0, 8), Hm = info.top * 1.25;
    for (let i = 0; i < N; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * Rm; pos[i * 3] = Math.sin(a) * r; pos[i * 3 + 1] = rnd() * Hm; pos[i * 3 + 2] = Math.cos(a) * r; sp[i] = 0.3 + rnd() * 1.2; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: L.glow, size: 0.22, map: dotTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); M.list.push(pm);
    const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; G.add(bloomify(pts));
    let last = 0;
    anim.push((t) => { const dt = Math.min(0.1, Math.max(0, t - last)); last = t; const p = pg.attributes.position; for (let i = 0; i < N; i++) { let y = p.getY(i) + sp[i] * dt * 0.9; if (y > Hm) y -= Hm; const x = p.getX(i), z = p.getZ(i), c = Math.cos(dt * 0.05 * sp[i]), sn = Math.sin(dt * 0.05 * sp[i]); p.setXYZ(i, x * c + z * sn, y, -x * sn + z * c); } p.needsUpdate = true; });
  }
}

function buildTower(s) {
  const G = new THREE.Group(), rnd = twRng(s.seed), M = makeMats(s.look), anim = [], extra = { tex: [], anim };
  // the body sits in its own group so a lean can shear it as one piece
  const body = new THREE.Group(); G.add(body);
  const lean = Math.tan((s.base.lean || 0) * Math.PI / 180);
  if (lean) { body.matrixAutoUpdate = false; body.matrix.set(1, lean, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1); }
  const info = buildBody(s, M, rnd, body, extra);
  info.lean = lean; info.body = body;
  info.rMax = Math.max(0.5, ...s.tiers.map(t => Math.max(t.r0, t.r1, rAt(t, 0.5)))) * (s.base.kind !== 'none' ? Math.max(1, s.base.spread) : 1);
  buildAura(s, M, rnd, G, info, anim);
  // overall reach, for framing the camera and the ground
  let reach = info.rMax;
  for (const h of s.halos) reach = Math.max(reach, h.r + h.off);
  if (s.aura.debN) reach = Math.max(reach, s.aura.debR + s.aura.debSpread * 0.5);
  if (s.aura.satN) reach = Math.max(reach, s.aura.satR * 1.1);
  if (s.aura.bridge) reach = Math.max(reach, Math.min(s.aura.bridgeLen * 0.3, 25));
  for (const t of s.tiers) if (t.butN > 0) reach = Math.max(reach, Math.max(t.r0, t.r1) + t.butR + 1);
  if (s.aura.roots > 0) reach = Math.max(reach, info.rMax * 2.2);
  if (s.base.kind === 'buried' || s.base.kind === 'crag') reach = Math.max(reach, (s.tiers[0] || TIER_DEF).r0 * s.base.spread * 1.6);
  let top = info.top; for (const h of s.halos) top = Math.max(top, info.H + h.y + h.r);
  return {
    group: G, info, reach, top, anim,
    update(t) { for (const f of anim) f(t); },
    dispose() { G.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.userData && o.userData.tex) o.userData.tex.dispose(); }); for (const m of M.list) m.dispose(); for (const t of extra.tex) t.dispose(); },
  };
}


  window.TowerEngine = {
    TIER_DEF, TW_SKIES, BLOOM_LAYER,
    NQDEF, PAT_CACHE, patCanvas, hash1, vnoise, rAt, phi0, polyR, at,
    lathe, twistGeo, mergeGeos, stripTris, trisGeo, instanced, M4,
    WIN_TEX, winTex, glyphTex, swirlTex, dotTex, clothTex, glyphStripTex, cloudTex,
    radiusAtY, makeMats, bloomify, pickMat,
    buildBody, addStair, addBanners, addButtresses, addBand, addCrown, buildAura,
    buildTower,
  };
})();
