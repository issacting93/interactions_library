/* ─────────────────────────────────────────────────────────────
   PIECE · TERRAIN DISPLACEMENT (rev B — isometric, two-layer)
   Refactored from the perspective/RGB-shift version to match
   components/generative/terrain-isometric: a true isometric
   orthographic camera, a square field, and two layers built from
   the same contour chains — a 3D relief and a flat 2D plan
   floating above it, tethered by dashed corner guides.

   The standalone piece is driven by clicks and drags; this piece
   has no mouse, so the same markers/route are deterministic and
   controls-driven instead — MARKERS reveals the field's peaks one
   at a time, ROUTE draws on a seeded path between two of them
   (precomputed once, revealed via setDrawRange — no per-frame
   geometry rebuild). Nothing here is simulated state, same as the
   previous revision: pose(u, ctl) reads straight from controls.
   Same embedding trick as before: render offscreen, embed the
   frame as an <image> in the SVG's 'terrain' layer.
   ───────────────────────────────────────────────────────────── */
(() => {

let THREE = null;
import('three').then(mod => {
  THREE = mod;
  threeReady();
  if (typeof build === 'function' && typeof S !== 'undefined' && S.piece === 'terrain-displacement') build();
});

/* ── noise + marching squares + stitching (verbatim port of components/generative/terrain-*) ── */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const G3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
function makeNoise(seed) {
  const r = mulberry32(seed), p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const F3 = 1 / 3, G = 1 / 6;
  return function (x, y, z) {
    const s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G, x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; } else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; } else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; } }
    else { if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; } else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; } else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; } }
    const x1=x0-i1+G,y1=y0-j1+G,z1=z0-k1+G,x2=x0-i2+2*G,y2=y0-j2+2*G,z2=z0-k2+2*G,x3=x0-1+3*G,y3=y0-1+3*G,z3=z0-1+3*G;
    const ii=i&255,jj=j&255,kk=k&255; let n=0;
    const c = (gx,xx,yy,zz) => { let tt=.6-xx*xx-yy*yy-zz*zz; if (tt<0) return 0; tt*=tt; const g=G3[gx%12]; return tt*tt*(g[0]*xx+g[1]*yy+g[2]*zz); };
    n += c(perm[ii+perm[jj+perm[kk]]], x0,y0,z0);
    n += c(perm[ii+i1+perm[jj+j1+perm[kk+k1]]], x1,y1,z1);
    n += c(perm[ii+i2+perm[jj+j2+perm[kk+k2]]], x2,y2,z2);
    n += c(perm[ii+1+perm[jj+1+perm[kk+1]]], x3,y3,z3);
    return 32 * n;
  };
}
// seeded once per page load so STORY/SPEC/EXPLODED all show the same field, markers and route
const TD_SEED = Math.floor(Math.random() * 1e9);
const TD_RNG = mulberry32(TD_SEED ^ 0x9e3779b9);
const TD_HN = makeNoise(TD_SEED);
const tdFbm = (x, y, oct) => { let a=.5,f=1,s=0; for (let o=0;o<oct;o++){ s+=a*TD_HN(x*f,y*f,o*17.3); f*=2.1; a*=.52; } return s; };

const TD_NX = 90, TD_NY = 90, TD_SCALE = 2.6;
const TD_WORLD_W = 22, TD_WORLD_D = 22, TD_HEIGHT_SCALE = 3.2;
const tdVals = new Float32Array(TD_NX * TD_NY);
let tdVmin = Infinity, tdVmax = -Infinity;
for (let j = 0; j < TD_NY; j++) for (let i = 0; i < TD_NX; i++) {
  const v = tdFbm(i / TD_NX * TD_SCALE, j / TD_NY * TD_SCALE, 5);
  tdVals[j * TD_NX + i] = v;
  if (v < tdVmin) tdVmin = v; if (v > tdVmax) tdVmax = v;
}
const tdWorldX = i => (i / (TD_NX - 1) - 0.5) * TD_WORLD_W;
const tdWorldZ = j => (j / (TD_NY - 1) - 0.5) * TD_WORLD_D;
const tdWorldY = v => (v - (tdVmin + tdVmax) / 2) / (tdVmax - tdVmin) * TD_HEIGHT_SCALE;

function tdMarchLevel(level) {
  const segs = [];
  const lerp = (a, b) => (level - a) / (b - a);
  for (let j = 0; j < TD_NY - 1; j++) for (let i = 0; i < TD_NX - 1; i++) {
    const a = tdVals[j*TD_NX+i], b = tdVals[j*TD_NX+i+1], c = tdVals[(j+1)*TD_NX+i+1], d = tdVals[(j+1)*TD_NX+i];
    const k = (a>level?8:0)|(b>level?4:0)|(c>level?2:0)|(d>level?1:0);
    if (k === 0 || k === 15) continue;
    const T=[i+lerp(a,b), j], R=[i+1, j+lerp(b,c)], B=[i+lerp(d,c), j+1], L=[i, j+lerp(a,d)];
    const table = {1:[L,B],14:[L,B],2:[B,R],13:[B,R],3:[L,R],12:[L,R],4:[T,R],11:[T,R],5:[L,T,B,R],6:[T,B],9:[T,B],7:[L,T],8:[L,T],10:[T,R,L,B]};
    const s = table[k];
    for (let s2 = 0; s2 < s.length; s2 += 2) segs.push([s[s2], s[s2+1]]);
  }
  return segs;
}
function tdStitch(segs) {
  const key = p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const used = new Array(segs.length).fill(false);
  const byPoint = new Map();
  segs.forEach((s, i) => [0, 1].forEach(e => {
    const k = key(s[e]);
    if (!byPoint.has(k)) byPoint.set(k, []);
    byPoint.get(k).push({ i, e });
  }));
  const chains = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain = [segs[i][0], segs[i][1]];
    for (const atStart of [false, true]) {
      let guard = 0;
      while (guard++ < TD_NX * TD_NY) {
        const end = atStart ? chain[0] : chain[chain.length - 1];
        const cands = (byPoint.get(key(end)) || []).filter(c => !used[c.i]);
        if (!cands.length) break;
        const { i: ci, e } = cands[0];
        used[ci] = true;
        const next = e === 0 ? segs[ci][1] : segs[ci][0];
        if (atStart) chain.unshift(next); else chain.push(next);
      }
    }
    if (chain.length > 1) chains.push(chain);
  }
  return chains;
}
// peaks: local maxima, well-separated — these become the fixed TRN markers
const TD_PEAKS = [];
for (let j = 1; j < TD_NY - 1; j++) for (let i = 1; i < TD_NX - 1; i++) {
  const v = tdVals[j*TD_NX+i];
  let isPeak = true;
  for (let dj = -1; dj <= 1 && isPeak; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj) continue;
    if (tdVals[(j+dj)*TD_NX+(i+di)] >= v) { isPeak = false; break; }
  }
  if (isPeak) TD_PEAKS.push({ i, j, v });
}
TD_PEAKS.sort((a, b) => b.v - a.v);
const TD_MARKERS = [];
for (const pk of TD_PEAKS) {
  if (TD_MARKERS.length >= 3) break;
  if (TD_MARKERS.every(c => Math.hypot(c.i - pk.i, c.j - pk.j) > TD_NX * 0.2)) TD_MARKERS.push(pk);
}
// one seeded, wobbly route between two of the markers — a deterministic stand-in for a dragged trace
const TD_ROUTE_ANCHORS = (() => {
  const a = TD_MARKERS[0], b = TD_MARKERS[TD_MARKERS.length - 1] ?? TD_MARKERS[0];
  const n = 7, pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const i = a.i + (b.i - a.i) * t, j = a.j + (b.j - a.j) * t;
    const wobble = (TD_RNG() - .5) * TD_NX * 0.14 * Math.sin(Math.PI * t);
    pts.push({ i: i - (b.j - a.j) / TD_NY * wobble, j: j + (b.i - a.i) / TD_NX * wobble });
  }
  return pts;
})();

/* ─────────────────────────────────────────────────────────────
   three.js: a true isometric orthographic camera, two layers from
   the same contour chains (a 3D relief and a flat plan floating
   above it), a vitrine box, dashed corner tethers, fixed markers
   and one route — all built once. Nothing here is per-frame state.
   ───────────────────────────────────────────────────────────── */
const PATH_COLOR = 0xff6b3d;
let renderer3D, scene3D, camera3D, terrainGroup3D, markerObjs3D, routeLine3D, routeSampleCount;
const TD_RES = 460, TD_ISO_SIZE = 13;

function threeReady() {
  const canvas = document.createElement('canvas');
  renderer3D = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer3D.setSize(TD_RES, TD_RES, false);
  scene3D = new THREE.Scene();
  scene3D.background = new THREE.Color(0x000000);
  scene3D.fog = new THREE.FogExp2(0x000000, 0.012);
  camera3D = new THREE.OrthographicCamera(-TD_ISO_SIZE, TD_ISO_SIZE, TD_ISO_SIZE, -TD_ISO_SIZE, -100, 100);

  const boxH = TD_HEIGHT_SCALE * 0.75;
  const FLAT_Y = TD_HEIGHT_SCALE * 2.7;

  terrainGroup3D = new THREE.Group();
  scene3D.add(terrainGroup3D);
  const flatLayer = new THREE.Group();
  flatLayer.position.y = FLAT_Y;
  scene3D.add(flatLayer);

  const LEVELS = 6;
  for (let L = 1; L < LEVELS; L++) {
    const level = tdVmin + (tdVmax - tdVmin) * L / LEVELS;
    const yRelief = tdWorldY(level) + 0.01;
    const reliefPos = [], flatPos = [];
    for (const chain of tdStitch(tdMarchLevel(level))) {
      for (let k = 0; k < chain.length - 1; k++) {
        const [i0, j0] = chain[k], [i1, j1] = chain[k + 1];
        const x0 = tdWorldX(i0), z0 = tdWorldZ(j0), x1 = tdWorldX(i1), z1 = tdWorldZ(j1);
        reliefPos.push(x0, yRelief, z0, x1, yRelief, z1);
        flatPos.push(x0, 0, z0, x1, 0, z1);
      }
    }
    const reliefGeo = new THREE.BufferGeometry();
    reliefGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(reliefPos), 3));
    terrainGroup3D.add(new THREE.LineSegments(reliefGeo, new THREE.LineBasicMaterial({ color: 0xece8de, transparent: true, opacity: 0.75, fog: true })));

    const flatGeo = new THREE.BufferGeometry();
    flatGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flatPos), 3));
    flatLayer.add(new THREE.LineSegments(flatGeo, new THREE.LineBasicMaterial({ color: 0xe8b04a, transparent: true, opacity: 0.55, fog: true })));
  }
  const flatPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(TD_WORLD_W * 1.08, TD_WORLD_D * 1.08),
    new THREE.MeshBasicMaterial({ color: 0x1b1a14, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  flatPlate.rotation.x = Math.PI / 2;
  flatLayer.add(flatPlate);

  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(TD_WORLD_W * 1.08, boxH, TD_WORLD_D * 1.08)),
    new THREE.LineBasicMaterial({ color: 0xe8b04a, transparent: true, opacity: 0.35 })
  );
  scene3D.add(box);
  const baseGrid = new THREE.GridHelper(Math.max(TD_WORLD_W, TD_WORLD_D) * 1.15, 18, 0xe8b04a, 0xe8b04a);
  baseGrid.position.y = -boxH / 2;
  baseGrid.material.transparent = true; baseGrid.material.opacity = 0.18;
  scene3D.add(baseGrid);

  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) {
    const x = sx * TD_WORLD_W / 2 * 1.08, z = sz * TD_WORLD_D / 2 * 1.08;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, boxH / 2, z), new THREE.Vector3(x, FLAT_Y, z)]);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xe8b04a, transparent: true, opacity: 0.45, dashSize: 0.3, gapSize: 0.22 }));
    line.computeLineDistances();
    scene3D.add(line);
  }

  // fixed markers, each a tether + dot + canvas-text tag, visibility driven by the MARKERS control
  const tagTex = label => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, 200, 40);
    ctx.fillStyle = 'rgba(22,22,24,.85)'; ctx.fillRect(4, 4, 200, 40);
    ctx.fillStyle = '#ece8de'; ctx.font = '600 22px ui-monospace, monospace'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 16, 25);
    ctx.strokeStyle = '#e8b04a'; ctx.beginPath(); ctx.moveTo(6, 46); ctx.lineTo(6, 70); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, 76, 4, 0, Math.PI * 2); ctx.fillStyle = '#e8b04a'; ctx.fill();
    return new THREE.CanvasTexture(c);
  };
  markerObjs3D = TD_MARKERS.map((pk, idx) => {
    const x = tdWorldX(pk.i), y = tdWorldY(pk.v), z = tdWorldZ(pk.j), top = y + 3.4;
    const g = new THREE.Group();
    const tetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, z), new THREE.Vector3(x, top, z)]);
    g.add(new THREE.Line(tetherGeo, new THREE.LineBasicMaterial({ color: 0xe8b04a, transparent: true, opacity: 0.6 })));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), new THREE.MeshBasicMaterial({ color: 0xe8b04a }));
    dot.position.set(x, y + 0.04, z);
    g.add(dot);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(`TRN ${String(idx + 1).padStart(3, '0')}`), transparent: true }));
    tag.position.set(x, top + 0.5, z);
    tag.scale.set(2.4, 0.9, 1);
    g.add(tag);
    g.visible = false;
    terrainGroup3D.add(g);
    return g;
  });

  // the route: one precomputed line, revealed progressively with setDrawRange (no geometry rebuild)
  const curve = new THREE.CatmullRomCurve3(
    TD_ROUTE_ANCHORS.map(p => new THREE.Vector3(tdWorldX(p.i), tdWorldY(tdVals[Math.max(0, Math.min(TD_NY - 1, Math.round(p.j))) * TD_NX + Math.max(0, Math.min(TD_NX - 1, Math.round(p.i)))]) + 0.08, tdWorldZ(p.j))),
    false, 'catmullrom', 0.3
  );
  routeSampleCount = 90;
  const routeGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(routeSampleCount - 1));
  routeLine3D = new THREE.Line(routeGeo, new THREE.LineBasicMaterial({ color: PATH_COLOR, transparent: true, opacity: 0.85 }));
  routeLine3D.geometry.setDrawRange(0, 0);
  terrainGroup3D.add(routeLine3D);
}

// pure function of (controls) → a rendered PNG data URL. Nothing carried between calls.
function renderTerrainFrame(u, relief, orbitDeg, markersValue, routeValue) {
  terrainGroup3D.scale.y = Math.max(0.001, relief);

  markerObjs3D.forEach((g, i) => { g.visible = markersValue >= i + 0.5; });
  routeLine3D.geometry.setDrawRange(0, Math.round(clamp(routeValue) * routeSampleCount));

  const angle = rad(orbitDeg) + Math.PI / 4;
  const r = 24;
  camera3D.position.set(Math.sin(angle) * r, r * 0.82, Math.cos(angle) * r);
  camera3D.lookAt(0, TD_HEIGHT_SCALE * 1.35, 0);

  renderer3D.render(scene3D, camera3D);
  return renderer3D.domElement.toDataURL('image/png');
}

/* ─────────────────────────────────────────────────────────────
   the piece
   ───────────────────────────────────────────────────────────── */
const TD_E = 300;
const TD_TAPS = [
  { at: 0.4, markers: 1 },
  { at: 1.1, markers: 2 },
  { at: 1.8, markers: 3 },
];

registerPiece({
  id: 'terrain-displacement',
  code: 'TRN-13', series: 'B', n: '13',
  name: 'TERRAIN DISPLACEMENT',
  mechanic: 'ISOMETRIC RELIEF · TRACED ROUTE',
  source: 'COMPONENTS/GENERATIVE/TERRAIN-ISOMETRIC',
  hero: { v: String(TD_MARKERS.length), u: 'MARKERS · LOCAL PEAKS' },
  extent: TD_E,
  spec: [
    ['INPUT',  'RELIEF · ORBIT · MARKERS · ROUTE'],
    ['FIELD',  `${TD_NX}×${TD_NY} SIMPLEX FBM · MARCHING SQUARES · 2 LAYERS`],
    ['MOTION', 'TRUE ISOMETRIC ORTHOGRAPHIC · NO SIMULATED STATE'],
    ['BUILT',  'DOM · SVG · THREE.JS · ANIME.JS 4'],
  ],
  layers: [
    { id: 'terrain', name: 'TERRAIN FIELD', note: 'RELIEF + FLOATING PLAN · 2 LAYERS', edge: TD_E },
    { id: 'hud',     name: 'SURVEY HUD',    note: 'COORDINATE GRID · READOUT', edge: TD_E },
    { id: 'input',   name: 'INPUT',         note: 'TOUCH · HIT TEST', edge: TD_E + 20 },
  ],
  callouts: [
    { at: [-TD_E * .7, -TD_E * .6], title: 'RELIEF LAYER', note: 'SIMPLEX FBM · DISPLACED' },
    { at: [TD_E * .7, -TD_E * .7],  title: 'FLOATING PLAN', note: 'SAME CHAINS · FLATTENED' },
    { at: [TD_E * .6, TD_E * .5],   title: 'MARKER', note: 'TRN ### · LOCAL PEAK' },
    { at: [-TD_E * .5, TD_E * .7],  title: 'ROUTE', note: 'SEEDED TRACE · DRAWS ON' },
  ],
  taps: TD_TAPS,
  specU: 2.2,

  controls: [
    { id: 'relief',  label: 'RELIEF',  kind: 'slider', min: 0, max: 1, value: 0, fmt: v => `${(v * 100).toFixed(0).padStart(3, '0')}%` },
    { id: 'orbit',   label: 'ORBIT',   kind: 'knob',   min: -180, max: 180, value: 0, fmt: v => `${v.toFixed(0)}°` },
    { id: 'markers', label: 'MARKERS', kind: 'knob',   min: 0, max: TD_MARKERS.length, value: 0, fmt: v => String(Math.round(v)) },
    { id: 'route',   label: 'ROUTE',   kind: 'slider', min: 0, max: 1, value: 0, fmt: v => `${(v * 100).toFixed(0).padStart(3, '0')}%` },
  ],
  story: {
    tweaks: [
      { id: 'relief',  to: 1 },
      { id: 'markers', to: TD_MARKERS.length },
      { id: 'route',   to: 1 },
      { id: 'orbit',   to: 110 },
    ],
  },
  exploded: { live: 3.4, poseEnd: 5.5 },
  assembly: {
    seeds: [[0, 0]],
    live: 2.4,
    end: 2.8,
    draw: t => ({ t, hud: dOn(t, 1.0, 2.0) * dOff(t, 6.2, 7.0) }),
  },

  build(L, sw) {
    const h = {};
    const E = this.extent;
    h.img3d = el('image', { x: -E, y: -E, width: 2 * E, height: 2 * E, preserveAspectRatio: 'xMidYMid slice', opacity: THREE ? 1 : 0 }, L.terrain);

    h.hud = el('g', {}, L.hud);
    const b = 26;
    [[-E, -E, 1, 1], [E, -E, -1, 1], [E, E, -1, -1], [-E, E, 1, -1]].forEach(([x, y, sx, sy]) => {
      el('path', { d: `M${x} ${y + b*sy}V${y}H${x + b*sx}`, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.hud);
    });
    const COLS = 6, ROWS = 6;
    for (let i = 0; i <= COLS; i++) {
      const x = -E + i / COLS * 2 * E;
      el('line', { x1: x, x2: x, y1: -E, y2: -E + 10, class: 'minor', 'stroke-width': sw.minor }, h.hud);
      el('text', { x: x + 4, y: -E + 22, class: 'dim', 'font-size': 11, 'letter-spacing': '.12em' }, h.hud).textContent = String(i * 10).padStart(2, '0');
    }
    for (let j = 0; j <= ROWS; j++) {
      const y = -E + j / ROWS * 2 * E;
      el('line', { x1: -E, x2: -E + 10, y1: y, y2: y, class: 'minor', 'stroke-width': sw.minor }, h.hud);
      el('text', { x: -E + 4, y: y - 5, class: 'dim', 'font-size': 11, 'letter-spacing': '.12em' }, h.hud).textContent = String(j * 10).padStart(2, '0');
    }
    el('rect', { x: E - 200, y: E - 68, width: 178, height: 50, fill: 'rgba(0,0,0,.55)' }, h.hud);
    h.readout = el('text', { x: E - 22, y: E - 32, 'text-anchor': 'end', 'font-size': 16, 'letter-spacing': '.06em', style: "font-family:'Martian Mono',ui-monospace,monospace;fill:#ece8de" }, h.hud);
    h.readoutSub = el('text', { x: E - 22, y: E - 52, 'text-anchor': 'end', 'font-size': 11, 'letter-spacing': '.18em', style: 'fill:rgba(236,232,222,.65)' }, h.hud);
    return h;
  },

  pose(u, ctl) {
    if (ctl) return { relief: ctl.v.relief, orbit: ctl.v.orbit, markers: ctl.v.markers, route: ctl.v.route, u };
    const T = this.taps;
    let markers = 0;
    for (const tp of T) if (u >= tp.at) markers = tp.markers;
    const relief = clamp(win(u, 0, 2.0));
    const route = clamp(win(u, 0.3, 2.3));
    const orbit = lerp(-30, 90, clamp(win(u, 0, 2.6)));
    return { relief, orbit, markers, route, u };
  },

  finger(u) {
    const E = this.extent;
    return { x: Math.cos(u * 1.7) * E * 0.5, y: Math.sin(u * 2.1) * E * 0.45, pulse: null };
  },

  apply(h, p, draw) {
    if (!draw) draw = {};
    h.hud.setAttribute('opacity', draw.hud ?? 1);
    h.readout.textContent = `MARKERS ${Math.round(p.markers)}/${TD_MARKERS.length} · ROUTE ${(p.route * 100).toFixed(0)}%`;
    h.readoutSub.textContent = `ORBIT ${p.orbit.toFixed(0)}° · RELIEF ${(p.relief * 100).toFixed(0)}%`;

    if (!THREE) return;
    h.img3d.setAttribute('opacity', 1);
    h.img3d.setAttribute('href', renderTerrainFrame(p.u ?? 0, p.relief, p.orbit, p.markers, p.route));
  },
});
})();
