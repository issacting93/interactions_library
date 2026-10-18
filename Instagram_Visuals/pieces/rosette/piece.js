/* ─────────────────────────────────────────────────────────────
   PIECE · ROSETTE (formerly Beauty Dial)
   components/interaction/rosette — redrawn as layered SVG from
   the same geometry: decor rings Ø420/Ø560, 50 ticks at r170,
   8 nodes (Ø52) at R130, a Ø72 centre that springs 0.15 → 0.55 → 1.
   STORY drives it from its controls instead, in the bloomed state:
   NODE (the source's node selection; every step the knob crosses
   retargets the tick ring's 48/8 spring, so a long turn winds it
   through each node with the source's elastic snap) and the Graphite
   Halo's DENSITY, WARP and MORPH sliders. The halo's noise time is
   the integral of MORPH × .12/s, so its morph and orbit speed up
   without a jump.
   ───────────────────────────────────────────────────────────── */
(() => {

const BD_LABELS = ['SENSE', 'MOTION', 'STRUCTURE', 'RHYTHM', 'SPACE', 'SIGNAL', 'FORM', 'LAYER'];
// node glyphs: each label's first two letters, set in Stray Robotalk instead of a drawn icon
const BD_GLYPHS = BD_LABELS.map(l => l.slice(0, 2));

/* ── GRAPHITE HALO (source/Graphite Halo (1).html) ──
   Cloud contours: isolines of a domain-warped simplex field masked to a ring band, traced with
   marching squares and inked as pencil (pressure buckets + a soft halo stroke). Animated like the
   source: the field morphs (z += .12/s), the cloud mass orbits (spin .35 rad per unit z) and the
   line pressure "boils" in ~9 fps steps. To loop seamlessly, the field at loop time t is crossfaded
   with the field one loop earlier: F(t)·(1 − t/T) + F(t − T)·(t/T) equals F(0) at both ends. */
const HALO = { seed: 4108, warp: .11, scale: 8.5, density: .5, spread: .065, layers: 3, K: 600, speed: .12, spin: .35, boil: .11 };
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
    if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
    else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
    const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G, x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G, x3 = x0 - 1 + 3 * G, y3 = y0 - 1 + 3 * G, z3 = z0 - 1 + 3 * G;
    const ii = i & 255, jj = j & 255, kk = k & 255; let n = 0;
    const c = (gx, xx, yy, zz) => { let tt = .6 - xx * xx - yy * yy - zz * zz; if (tt < 0) return 0; tt *= tt; const g = G3[gx % 12]; return tt * tt * (g[0] * xx + g[1] * yy + g[2] * zz); };
    n += c(perm[ii + perm[jj + perm[kk]]], x0, y0, z0);
    n += c(perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1);
    n += c(perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2);
    n += c(perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3);
    return 32 * n;
  };
}
const HN = makeNoise(HALO.seed);
const fbm = (x, y, z, oct) => { let a = .5, f = 1, s = 0; for (let o = 0; o < oct; o++) { s += a * HN(x * f, y * f, z + o * 17.3); f *= 2.03; a *= .5; } return s; };

// the masked field on an n×n grid at noise time z; warp offsets are low-frequency, so they're
// sampled on a coarse grid and interpolated (as in the source)
function haloField(n, z, warp = HALO.warp) {
  const P = HALO, ang = z * P.spin, rc0 = Math.cos(ang), rs0 = Math.sin(ang);
  const m = Math.ceil(n / 5) + 1, wx = new Float32Array(m * m), wy = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const u0 = i / (m - 1) - .5, v0 = j / (m - 1) - .5, u = u0 * rc0 - v0 * rs0, v = u0 * rs0 + v0 * rc0;
    wx[j * m + i] = fbm(u * 2.2, v * 2.2, z, 3); wy[j * m + i] = fbm(u * 2.2 + 5.2, v * 2.2 + 1.3, z + 9.1, 3);
  }
  const vals = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const gy = j / (n - 1) * (m - 1), j0 = Math.min(m - 2, gy | 0), fy = gy - j0;
    for (let i = 0; i < n; i++) {
      const gx = i / (n - 1) * (m - 1), i0 = Math.min(m - 2, gx | 0), fx = gx - i0, k = j0 * m + i0;
      const qx = (wx[k] * (1 - fx) + wx[k + 1] * fx) * (1 - fy) + (wx[k + m] * (1 - fx) + wx[k + m + 1] * fx) * fy;
      const qy = (wy[k] * (1 - fx) + wy[k + 1] * fx) * (1 - fy) + (wy[k + m] * (1 - fx) + wy[k + m + 1] * fx) * fy;
      const u0 = i / (n - 1) - .5, v0 = j / (n - 1) - .5, u = u0 * rc0 - v0 * rs0, v = u0 * rs0 + v0 * rc0;
      const wu = u + warp * qx, wv = v + warp * qy;
      const r = Math.hypot(wu, wv), th = Math.atan2(v, u);
      const lobe = .5 + .5 * HN(Math.cos(th) * 1.4, Math.sin(th) * 1.4, z * .5 + 40);
      const rcB = .335 + .03 * lobe, bw = P.spread * (.55 + 1.1 * lobe);
      const band = Math.exp(-(((r - rcB) / bw) ** 2));
      if (band < .02) { vals[j * n + i] = .18 * fbm(wu * P.scale, wv * P.scale, z + 3.7, 2) - .04; continue; }   // far from the band: cheap
      const detail = fbm(wu * P.scale, wv * P.scale, z + 3.7, 4);
      vals[j * n + i] = band * (.35 + .85 * lobe) * (.55 + .9 * (detail + .5)) + .18 * detail - .04;
    }
  }
  return vals;
}
// marching squares → 4 pressure buckets of path data (light → heavy); bt = boil frame
function haloContours(vals, n, bt, density = HALO.density) {
  const P = HALO, step = 1 / (n - 1), buckets = [[], [], [], []], f = v => (v * P.K).toFixed(1);
  for (let L = 0; L < P.layers; L++) {
    const lv = density + L * .13, lerp = (a, b) => (lv - a) / (b - a);
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = vals[j * n + i], b = vals[j * n + i + 1], c = vals[(j + 1) * n + i + 1], d = vals[(j + 1) * n + i];
      const k = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const x = i * step - .5, y = j * step - .5;
      const T = [x + lerp(a, b) * step, y], R = [x + step, y + lerp(b, c) * step], B = [x + lerp(d, c) * step, y + step], Lf = [x, y + lerp(a, d) * step];
      const segs = ({ 1: [Lf, B], 14: [Lf, B], 2: [B, R], 13: [B, R], 3: [Lf, R], 12: [Lf, R], 4: [T, R], 11: [T, R], 5: [Lf, T, B, R], 6: [T, B], 9: [T, B], 7: [Lf, T], 8: [Lf, T], 10: [T, R, Lf, B] })[k];
      const pr = .5 + .5 * HN((x + .5) * 9, (y + .5) * 9, 77 + bt * 3.1);
      const bk = buckets[Math.min(3, Math.floor(pr * 4))];
      for (let s2 = 0; s2 < segs.length; s2 += 2) bk.push(`M${f(segs[s2][0])} ${f(segs[s2][1])}L${f(segs[s2 + 1][0])} ${f(segs[s2 + 1][1])}`);
    }
  }
  return buckets.map(b => b.join(''));
}
// the halo at loop time t of a loop T seconds long (t undefined → the still on the spec sheet).
// live (STORY): o = { z, warp, density } from the controls; no crossfade, since STORY starts and
// ends with the halo masked out
const HALO_CACHE = new Map();
function haloAt(t, T, o) {
  const capture = document.body.classList.contains('capture');
  const n = t == null || capture ? 200 : 120;       // lighter grid while previewing in the browser
  const key = (t == null ? `still/${n}` : `${t.toFixed(4)}/${T}/${n}`) + (o ? `/${o.z.toFixed(4)}/${o.warp.toFixed(3)}/${o.density.toFixed(3)}` : '');
  if (HALO_CACHE.has(key)) return HALO_CACHE.get(key);
  let d;
  if (o) d = haloContours(haloField(n, o.z, o.warp), n, Math.floor((t ?? 0) / HALO.boil) % 97, o.density);
  else if (t == null) d = haloContours(haloField(n, 0), n, 0);
  else {
    const a = clamp(t / T), A = haloField(n, t * HALO.speed), B = haloField(n, (t - T) * HALO.speed);
    for (let i = 0; i < A.length; i++) A[i] = A[i] * (1 - a) + B[i] * a;
    d = haloContours(A, n, Math.floor(t / HALO.boil) % 97);
  }
  if (HALO_CACHE.size > 8) HALO_CACHE.clear();
  HALO_CACHE.set(key, d);
  return d;
}


const BD_R = 130;
const nodeXY = i => { const a = rad(i * 45 - 90); return [Math.cos(a) * BD_R, Math.sin(a) * BD_R]; };

// the scripted performance: where the finger goes and when
const BD_TAPS = [
  { at: 0.30, node: 2, layer: 'nodes' },      // select STRUCTURE
  { at: 1.30, node: 5, layer: 'nodes' },      // select SIGNAL
  { at: 2.30, centre: 0, layer: 'core' },     // centre → state 0 (fold)
  { at: 3.00, centre: 1, layer: 'core' },     // centre → state 1
  { at: 3.60, centre: 2, layer: 'core' },     // centre → state 2 (bloom)
];

registerPiece({
  id: 'rosette',
  code: 'RST-03', series: 'B', n: '03',
  name: 'ROSETTE',
  mechanic: 'THREE-STATE RADIAL MENU',
  source: 'COMPONENTS/INTERACTION/ROSETTE',
  hero: { v: '8', u: 'NODES · 45° APART' },
  extent: 280,
  spec: [
    ['INPUT',  'TAP CENTRE · TAP NODE'],
    ['STATE',  '3 REVEAL STATES · 1 ACTIVE NODE'],
    ['MOTION', 'SPRINGS 70/10 · 48/8 · 90/12'],
    ['BUILT',  'DOM · SVG · ANIME.JS 4 · SIMPLEX HALO'],
  ],
  layers: [
    { id: 'decor', name: 'DECOR RINGS', note: 'Ø420 · Ø560 · STATIC', edge: 280 },
    { id: 'halo',  name: 'GRAPHITE HALO', note: 'NOISE ISOLINES · 3 LV', edge: 290 },
    { id: 'ticks', name: 'TICK RING',   note: '50 × 7.2° · 48/8', edge: 170 },
    { id: 'nodes', name: 'NODE RING',   note: '8 × 45° · R130', edge: 156 },
    { id: 'core',  name: 'CENTRE',      note: 'SCALE .15 · .55 · 1', edge: 36 },
    { id: 'input', name: 'INPUT',       note: 'TOUCH · HIT TEST', edge: 300 },
  ],
  // anchors on the right half; leaders run radially out, then across to the label column
  callouts: [
    { at: [Math.cos(rad(-70)) * 280, Math.sin(rad(-70)) * 280], title: 'DECOR', note: 'Ø420 · Ø560' },
    { at: [Math.cos(rad(-28)) * 232, Math.sin(rad(-28)) * 232], title: 'GRAPHITE HALO', note: 'NOISE ISOLINES · 3 LEVELS' },
    { at: nodeXY(1),                 title: 'NODE RING',   note: '8 × 45° · R130' },
    { at: nodeXY(2),                 title: 'ACTIVE NODE', note: 'FILL = SELECTED' },
    { at: [Math.cos(rad(22.5)) * 36, Math.sin(rad(22.5)) * 36], title: 'CENTRE', note: 'TAP TO STEP 0 → 1 → 2' },
    { at: [Math.cos(rad(70)) * 165, Math.sin(rad(70)) * 165], title: 'TICK RING', note: 'SPRINGS TO THE CHOICE' },
  ],
  taps: BD_TAPS,
  specU: 0.95,

  // STORY: node selection from the rosette, and the Graphite Halo's sliders (source ranges)
  controls: [
    { id: 'node',    label: 'NODE',    kind: 'knob',   min: 0,  max: 7,   value: 0,             fmt: v => `0${Math.round(v) + 1} ${BD_LABELS[Math.round(v)]}` },
    { id: 'density', label: 'DENSITY', kind: 'slider', min: .2, max: .9,  value: HALO.density,  fmt: v => `${(v * 100).toFixed(0).padStart(2, '0')}%` },
    { id: 'warp',    label: 'WARP',    kind: 'slider', min: 0,  max: .25, value: HALO.warp,     fmt: v => v.toFixed(3) },
    { id: 'morph',   label: 'MORPH',   kind: 'knob',   min: 0,  max: 3,   value: 1,             fmt: v => `×${v.toFixed(2)}` },
  ],
  story: {
    tweaks: [
      { id: 'node',    to: 5 },     // the tick ring winds node by node to SIGNAL, springing at each step
      { id: 'density', to: .25 },   // the cloud thickens: more, fuller contour rings
      { id: 'warp',    to: .23 },   // the contours buckle and roughen
      { id: 'morph',   to: 2.6 },   // the weather boils and orbits faster
    ],
  },
  exploded: { live: 4.4, poseEnd: 7 },   // the last spring (tick ring 48/8) settles while the stack closes
  // assembly: seeds at the centre and node centres; stops after the centre fold
  assembly: {
    seeds: [[0, 0], ...Array.from({ length: 8 }, (_, i) => nodeXY(i))],
    live: 2.8,
    end: 3.3,
    draw: t => ({
      t,
      decor: [dOn(t, .7, 1.7) * dOff(t, 6.3, 7.1), dOn(t, .9, 1.9) * dOff(t, 6.2, 7.0)],
      ticks: Array.from({ length: 50 }, (_, i) => {
        // each tick fades over .35 s and the sweep overlaps, so the ring grows on instead of popping
        const a = .9 + stag(i, 50, 1.1 / 50), b = 6.0 + stag(49 - i, 50, .9 / 50);
        return dOn(t, a, a + .35) * dOff(t, b, b + .35);
      }),
      nodes: Array.from({ length: 8 }, (_, i) => dOn(t, 1.3 + stag(i, 8, .07), 1.9 + stag(i, 8, .07))),
      icons: Array.from({ length: 8 }, (_, i) => dOn(t, 1.9 + stag(i, 8, .06), 2.5 + stag(i, 8, .06))),
      halo: dOn(t, 1.2, 2.6) * dOff(t, 6.0, 6.9),
      core: dOn(t, 1.0, 1.7) * dOff(t, 6.7, 7.3),
      coreIcon: dOn(t, 1.6, 2.3) * dOff(t, 6.6, 7.1),
    }),
  },

  // build the drawing into one <g> per layer; sw = stroke width in piece units
  build(L, sw) {
    const h = {};
    // decor
    h.decor = [210, 280].map((r, i) => drawable(el('circle', { r, fill: 'none', class: i ? 'minor' : 'mid', 'stroke-width': sw.minor }, L.decor)));
    // graphite halo: pencil contours, revealed through a sweeping mask (angular draw-on)
    const mid = `halo-mask-${Math.random().toString(36).slice(2, 8)}`;
    const mask = el('mask', { id: mid, maskUnits: 'userSpaceOnUse', x: -400, y: -400, width: 800, height: 800 }, L.halo);
    // the sweep is also the clip: an annulus r 178 → 292, between the tick ring and the outer decor ring
    h.haloSweep = drawable(el('circle', { r: 235, fill: 'none', stroke: '#fff', 'stroke-width': 114, transform: 'rotate(-90)' }, mask));
    h.halo = el('g', { mask: `url(#${mid})`, 'stroke-linecap': 'round', fill: 'none' }, L.halo);
    const alphas = [.35, .6, .8, .95];
    h.haloPaths = alphas.map(al => [
      el('path', { class: 'ink', 'stroke-width': sw.minor * 2.6, opacity: al * .1 }, h.halo),   // soft graphite halo
      el('path', { class: 'mid', 'stroke-width': sw.minor * .85, opacity: al }, h.halo),
    ]);
    h.haloKey = null;
    // ticks: 50 radial hairlines, r 160 → 170, inside a rotor
    h.rotor = el('g', {}, L.ticks);
    h.ticks = [];
    for (let i = 0; i < 50; i++) {
      const a = rad(i * 7.2 - 90);
      h.ticks.push(el('line', {
        x1: Math.cos(a) * 160, y1: Math.sin(a) * 160, x2: Math.cos(a) * 170, y2: Math.sin(a) * 170,
        class: i === 0 ? 'ink' : 'mid', 'stroke-width': i === 0 ? sw.main : sw.minor,
      }, h.rotor));
    }
    // nodes: the icon is a glyph set in Stray Robotalk (the label's first two letters), not a drawing
    h.nodes = BD_GLYPHS.map((gl, i) => {
      const [x, y] = nodeXY(i);
      const g = el('g', { transform: `translate(${x} ${y})` }, L.nodes);
      const inner = el('g', {}, g);
      const disc = el('circle', { r: 26, class: 'disc' }, inner);
      const ring = drawable(el('circle', { r: 26, fill: 'none', class: 'ink', 'stroke-width': sw.main }, inner));
      const glyph = el('text', {
        x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        style: "font-family:'Stray Robotalk'", 'font-size': 21, class: 'icondot',
      }, inner);
      glyph.textContent = gl;
      glyph.dot = true;
      return { g, inner, disc, ring, parts: [glyph] };
    });
    // centre button (72 box, 28 icon → coordinates in that box)
    h.coreG = el('g', {}, L.core);
    el('circle', { r: 36, class: 'disc' }, h.coreG);
    h.coreRing = drawable(el('circle', { r: 36, fill: 'none', class: 'ink', 'stroke-width': sw.main }, h.coreG));
    h.coreIcon = [
      el('circle', { r: 10, fill: 'none', class: 'icon', 'stroke-width': sw.icon }, h.coreG),
      el('circle', { r: 3.5, fill: 'none', class: 'icon', 'stroke-width': sw.icon }, h.coreG),
      el('path', { d: 'M0 -13 V-7 M0 7 V13 M-13 0 H-7 M7 0 H13', class: 'icon', 'stroke-width': sw.icon }, h.coreG),
    ].map(drawable);
    return h;
  },

  // what the piece looks like u seconds into the performance
  pose(u, ctl) {
    // live on the controls (STORY): bloomed, NODE selects. Every node step the knob crosses is a
    // 48/8 spring retarget of the tick ring, superposed (as sprung() does) over the step times,
    // which are read off ctl.integ's samples (midpoint t = (k + .5) / 120). The halo's noise time
    // is ∫ MORPH × .12/s; DENSITY and WARP are read directly.
    if (ctl) {
      const DT = 1 / 120, i = Math.round(ctl.v.node);
      let k = 0, prev = null, tick = 360 - i * 45, pick = -1;
      ctl.integ(c => {
        const t = (k++ + .5) * DT, j = Math.round(c.node);
        if (prev == null) tick = 360 - j * 45;
        else if (j !== prev) {
          const d = ((-(j - prev) * 45 + 180) % 360 + 360) % 360 - 180;   // shortest way round
          tick += d * springStep(u - t, 48, 8);
          pick = t;
        }
        prev = j;
        return 0;
      });
      const pop = pick < 0 ? 0 : .14 * Math.sin(Math.PI * win(u, pick, pick + .32));
      return {
        tick, btn: 1, active: i,
        nodes: Array.from({ length: 8 }, (_, n) => n === i ? 1 + pop : 1),
        halo: { z: ctl.integ(c => HALO.speed * c.morph), warp: ctl.v.warp, density: ctl.v.density },
      };
    }
    const T = this.taps;
    const tickSteps = [], btnSteps = [];
    let tick = 360, active = null;
    let fold = null, bloom = null;
    for (const tp of T) {
      if (tp.node != null) {
        let target = 360 - tp.node * 45;
        target = tick + (((target - tick + 180) % 360 + 360) % 360 - 180);
        tickSteps.push({ at: tp.at, to: target, k: 48, c: 8 });
        tick = target;
        if (u >= tp.at) active = tp.node;
      } else {
        const st = tp.centre;
        const target = [0, 180, 360][st];
        const to = tick + (((target - tick + 180) % 360 + 360) % 360 - 180);
        tickSteps.push({ at: tp.at, to, k: 48, c: 8 });
        tick = to;
        btnSteps.push({ at: tp.at, to: [0.15, 0.55, 1][st], k: 70, c: 10 });
        if (st === 0) { fold = tp.at; if (u >= tp.at) active = null; }
        if (st === 2) bloom = tp.at;
      }
    }
    const nodes = [];
    for (let i = 0; i < 8; i++) {
      let v = 1;
      if (fold != null && u >= fold) v = 1 - oq(win(u, fold + .018 * (7 - i), fold + .018 * (7 - i) + .2));
      if (bloom != null && u >= bloom) {
        const d = .035 * Math.abs(i - 3.5);
        v = clamp(springStep(u - bloom - d, 90, 12), 0, 1.2);
      }
      nodes.push(v);
    }
    return {
      tick: sprung(360, tickSteps, u),
      btn: sprung(1, btnSteps, u),
      nodes, active,
    };
  },

  // finger position at time u (piece coordinates), plus tap pulse 0..1
  finger(u) {
    const T = this.taps;
    const pt = tp => tp.node != null ? nodeXY(tp.node) : [0, 0];
    let from = [210, 230], prevAt = -0.6;
    for (const tp of T) {
      const to = pt(tp);
      const a = Math.max(prevAt + .12, tp.at - .5), b = tp.at - .04;
      if (u < b) {
        const k = io(win(u, a, b));
        return { x: lerp(from[0], to[0], k), y: lerp(from[1], to[1], k), pulse: null };
      }
      if (u < tp.at + .5) return { x: to[0], y: to[1], pulse: win(u, tp.at, tp.at + .5), tap: tp };
      from = to; prevAt = tp.at;
    }
    return { x: from[0], y: from[1], pulse: null };
  },

  apply(h, p, draw) {
    // draw: optional { decor, ticks[i], nodes[i], icons[i], core } progress 0..1
    h.rotor.setAttribute('transform', `rotate(${p.tick})`);
    // the weather sways with the choice; periodic in the tick angle, so 0° and 360° look the same
    h.halo.setAttribute('transform', `rotate(${14 * Math.sin(rad(p.tick))})`);
    // retrace the contours only when the frame changes (and skip it while the halo is masked out)
    const haloOn = !draw || (draw.halo ?? 1) > 0;
    const o = p.halo;   // live (STORY): the controls' z / warp / density
    const key = (p.t == null ? 'still' : p.t.toFixed(4)) + (o ? `/${o.z.toFixed(4)}/${o.warp.toFixed(3)}/${o.density.toFixed(3)}` : '');
    if (haloOn && key !== h.haloKey) {
      haloAt(p.t, p.T, o).forEach((d, i) => h.haloPaths[i].forEach(pa => pa.setAttribute('d', d)));
      h.haloKey = key;
    }
    h.coreG.setAttribute('transform', `scale(${p.btn})`);
    h.nodes.forEach((n, i) => {
      let v = p.nodes[i];
      // live (STORY) has no scripted fold, so the nodes fold into the centre as the piece undraws
      // (the fold's own shape and stagger), before the centre closes
      if (p.halo && draw) v *= 1 - oq(win(draw.t, 6.2 + .018 * (7 - i), 6.4 + .018 * (7 - i)));
      n.inner.setAttribute('transform', `scale(${0.85 + 0.15 * v})`);
      n.g.setAttribute('opacity', clamp(v));
      n.g.classList.toggle('on', p.active === i);
    });
    if (!draw) draw = {};
    h.decor.forEach((c, i) => setDraw(c, draw.decor ? draw.decor[i] : 1));
    h.ticks.forEach((t, i) => t.setAttribute('opacity', draw.ticks ? draw.ticks[i] : 1));
    h.nodes.forEach((n, i) => {
      setDraw(n.ring, draw.nodes ? draw.nodes[i] : 1);
      n.disc.setAttribute('opacity', draw.nodes ? draw.nodes[i] : 1);
      n.parts.forEach(pp => pp.dot ? pp.setAttribute('opacity', draw.icons ? draw.icons[i] : 1) : setDraw(pp, draw.icons ? draw.icons[i] : 1));
    });
    setDraw(h.haloSweep, draw.halo ?? 1);
    setDraw(h.coreRing, draw.core ?? 1);
    h.coreIcon.forEach(c => setDraw(c, draw.coreIcon ?? 1));
  },
});
})();
