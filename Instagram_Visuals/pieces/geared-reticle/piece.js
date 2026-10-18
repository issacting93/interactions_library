/* ─────────────────────────────────────────────────────────────
   PIECE · GEARED RETICLE (CYB-04 rev B)
   pieces/geared-reticle/source — the dial half of the page, redrawn
   as layered SVG from the source's ±300 geometry (1 source unit =
   1 piece unit). The Patch rack is left out; its default patch is
   baked in: SWEEP → OUTER ×1 → MIDDLE ×−1.5 → INNER ×−0.47, and
   SWEEP → FIELD (the graphite halo).
   The performance: the sweep scans at 10°/s, a drag turns the train
   back 110°, a tap on the core locks it, a second tap unlocks, then
   every ring springs home to 0 (the source's ZERO), so the last pose
   is the first and EXPLODED loops without a seam.
   STORY drives it from its controls instead (SWEEP RATE, MIDDLE /
   INNER RATIO, FIELD WARP): each gear's angle is the integral of its
   ratio × its input's speed, so turning a knob never makes a ring jump.
   Everything is a pure function of u: glitches, hex telemetry and
   the halo's boil are seeded, not random.
   ───────────────────────────────────────────────────────────── */
(() => {

// degrees, 0 = 12 o'clock, clockwise (the source's convention)
const pol = (r, a) => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];
function arc(r, a0, a1) {
  const [x0, y0] = pol(r, a0), [x1, y1] = pol(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const wrap = d => ((d % 360) + 360) % 360;
const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const hex4 = v => '0x' + Math.floor(v * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');

const R = { bezel: 272, ticks: 258, data: 248, outer: 226, halo: [150, 216], middle: 140, inner: 92, lock: 66, core: 60 };
const RATIO = { outer: 1, middle: -1.5, inner: -0.47 };
const DATA_SEGS = 30, DATA_A0 = -84, DATA_SPAN = 70;
const LOCK_HEX = ['TGT', 'ACQ', '0xA1F0', 'RNG', 'HOLD', '0x0C3E', 'BRG', 'FIX'];

/* ── GRAPHITE HALO: the same field as the source (and pieces/rosette), masked to the r150–216 band.
   In the source the FIELD jack's motion morphs it; here it morphs with loop time and is crossfaded
   with the field one loop earlier, so it loops seamlessly, and it orbits with the sweep (×.25).
   Locked, it holds still. */
const HALO = { seed: 4108, warp: .11, scale: 8.5, density: .5, spread: .065, layers: 3, K: 546, speed: .1, boil: .11 };
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

function haloField(n, z, warp = HALO.warp) {
  const P = HALO, m = Math.ceil(n / 5) + 1, wx = new Float32Array(m * m), wy = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const u = i / (m - 1) - .5, v = j / (m - 1) - .5;
    wx[j * m + i] = fbm(u * 2.2, v * 2.2, z, 3); wy[j * m + i] = fbm(u * 2.2 + 5.2, v * 2.2 + 1.3, z + 9.1, 3);
  }
  const vals = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const gy = j / (n - 1) * (m - 1), j0 = Math.min(m - 2, gy | 0), fy = gy - j0;
    for (let i = 0; i < n; i++) {
      const gx = i / (n - 1) * (m - 1), i0 = Math.min(m - 2, gx | 0), fx = gx - i0, k = j0 * m + i0;
      const qx = (wx[k] * (1 - fx) + wx[k + 1] * fx) * (1 - fy) + (wx[k + m] * (1 - fx) + wx[k + m + 1] * fx) * fy;
      const qy = (wy[k] * (1 - fx) + wy[k + 1] * fx) * (1 - fy) + (wy[k + m] * (1 - fx) + wy[k + m + 1] * fx) * fy;
      const u = i / (n - 1) - .5, v = j / (n - 1) - .5, wu = u + warp * qx, wv = v + warp * qy;
      const r = Math.hypot(wu, wv), th = Math.atan2(v, u);
      const lobe = .5 + .5 * HN(Math.cos(th) * 1.4, Math.sin(th) * 1.4, z * .5 + 40);
      const band = Math.exp(-(((r - (.335 + .03 * lobe)) / (P.spread * (.55 + 1.1 * lobe))) ** 2));
      if (band < .02) { vals[j * n + i] = -.04; continue; }   // outside the mask anyway
      const detail = fbm(wu * P.scale, wv * P.scale, z + 3.7, 4);
      vals[j * n + i] = band * (.35 + .85 * lobe) * (.55 + .9 * (detail + .5)) + .18 * detail - .04;
    }
  }
  return vals;
}
function haloContours(vals, n, bt) {
  const P = HALO, step = 1 / (n - 1), buckets = [[], [], [], []], f = v => (v * P.K).toFixed(1);
  for (let L = 0; L < P.layers; L++) {
    const lv = P.density + L * .13, lp = (a, b) => (lv - a) / (b - a);
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = vals[j * n + i], b = vals[j * n + i + 1], c = vals[(j + 1) * n + i + 1], d = vals[(j + 1) * n + i];
      const k = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const x = i * step - .5, y = j * step - .5;
      const T = [x + lp(a, b) * step, y], Rr = [x + step, y + lp(b, c) * step], B = [x + lp(d, c) * step, y + step], Lf = [x, y + lp(a, d) * step];
      const sg = ({ 1: [Lf, B], 14: [Lf, B], 2: [B, Rr], 13: [B, Rr], 3: [Lf, Rr], 12: [Lf, Rr], 4: [T, Rr], 11: [T, Rr], 5: [Lf, T, B, Rr], 6: [T, B], 9: [T, B], 7: [Lf, T], 8: [Lf, T], 10: [T, Rr, Lf, B] })[k];
      const pr = .5 + .5 * HN((x + .5) * 9, (y + .5) * 9, 77 + bt * 3.1);
      const bk = buckets[Math.min(3, Math.floor(pr * 4))];
      for (let q = 0; q < sg.length; q += 2) bk.push(`M${f(sg[q][0])} ${f(sg[q][1])}L${f(sg[q + 1][0])} ${f(sg[q + 1][1])}`);
    }
  }
  return buckets.map(b => b.join(''));
}
const HALO_CACHE = new Map();
function haloAt(t, T, warp = HALO.warp) {
  const capture = document.body.classList.contains('capture');
  const n = t == null || capture ? 200 : 120;       // lighter grid while previewing in the browser
  const key = t == null ? `still/${n}/${warp.toFixed(3)}` : `${t.toFixed(4)}/${T}/${n}/${warp.toFixed(3)}`;
  if (HALO_CACHE.has(key)) return HALO_CACHE.get(key);
  let d;
  if (t == null) d = haloContours(haloField(n, 0, warp), n, 0);
  else {
    const a = clamp(t / T), A = haloField(n, t * HALO.speed, warp), B = haloField(n, (t - T) * HALO.speed, warp);
    for (let i = 0; i < A.length; i++) A[i] = A[i] * (1 - a) + B[i] * a;
    d = haloContours(A, n, Math.floor(t / HALO.boil) % 97);
  }
  if (HALO_CACHE.size > 8) HALO_CACHE.clear();
  HALO_CACHE.set(key, d);
  return d;
}

// ── the script ──
const RATE = 10;                                          // °/s, the SWEEP module's default
const DRAG = { at: 0.6, end: 1.9, sweep: -110, grab: 130 };  // finger grabs the outer ring at 130°
const LOCK = 2.3, UNLOCK = 3.4, RESUME = 3.6, ZERO = 3.9, END = 4.9;
const GLITCHES = [{ at: 0.3, k: .4 }, { at: LOCK, k: .7 }, { at: UNLOCK, k: .7 }];

// the sweep's angle; every gear is ratio × its input, and all start at 0, so they stay proportional
function sweep(u) {
  if (u <= 0) return 0;
  if (u < DRAG.at) return RATE * u;
  const a1 = RATE * DRAG.at;
  if (u < DRAG.end) return a1 + DRAG.sweep * io(win(u, DRAG.at, DRAG.end));
  const a2 = a1 + DRAG.sweep;
  if (u < RESUME) return a2;                              // manual hold, then locked
  if (u < ZERO) return a2 + RATE * (u - RESUME);
  const aZ = a2 + RATE * (ZERO - RESUME);
  return aZ * (1 - springStep(u - ZERO, 70, 8));          // ZERO: every ring springs to its nearest 0
}
const locked = u => u >= LOCK && u < UNLOCK;

registerPiece({
  id: 'geared-reticle',
  code: 'GRT-10', series: 'B', n: '10',
  name: 'GEARED RETICLE',
  mechanic: 'PATCHED GEAR-TRAIN RETICLE',
  source: 'COMPONENTS/INTERACTION/CYBERPUNK-DIAL/GEARED-RETICLE',
  hero: { v: '3', u: 'GEARS · ONE DRIVE' },
  extent: 290,
  spec: [
    ['INPUT',  'DRAG TO TURN · TAP CORE TO LOCK'],
    ['STATE',  'SCAN · LOCK · JAM'],
    ['MOTION', '10°/S DRIVE · ×1 · ×−1.5 · ×−0.47'],
    ['BUILT',  'SVG · PATCH · SIMPLEX HALO'],
  ],
  layers: [
    { id: 'bezel',  name: 'BEZEL',         note: '72 TICKS · AIM · DATA ARC', edge: 288 },
    { id: 'halo',   name: 'GRAPHITE HALO', note: 'FIELD · ORBITS ×.25',       edge: R.halo[1] },
    { id: 'outer',  name: 'OUTER GEAR',    note: '×1 · 38 DASHES · 4 PODS',  edge: R.outer + 10 },
    { id: 'middle', name: 'MIDDLE GEAR',   note: '×−1.5 · HEX TELEMETRY',    edge: R.middle + 5 },
    { id: 'inner',  name: 'INNER GEAR',    note: '×−0.47 · 31 BARS',         edge: R.inner + 7 },
    { id: 'core',   name: 'CORE',          note: 'SCAN · LOCK · JAM',        edge: R.lock },
    { id: 'input',  name: 'INPUT',         note: 'DRAG · TAP TO LOCK',       edge: 300 },
  ],
  callouts: [
    // anchors step inward as they go clockwise, so the radial leaders fan out without crossing
    { at: pol(R.bezel, 40),   title: 'BEZEL',          note: 'CHAMFERED · 72 TICKS' },
    { at: pol(R.outer, 62),   title: 'OUTER ×1',       note: 'DRIVEN BY THE SWEEP' },
    { at: pol(183, 82),       title: 'GRAPHITE HALO',  note: 'FIELD · MORPHS WITH MOTION' },
    { at: pol(R.middle, 102), title: 'MIDDLE ×−1.5',   note: 'HEX TELEMETRY' },
    { at: pol(R.inner, 120),  title: 'INNER ×−0.47',   note: 'NETS ×+0.7 OF THE OUTER' },
    { at: pol(R.lock, 138),   title: 'LOCK RING',      note: 'TAP CORE TO LOCK' },
  ],
  specU: 2.9,

  // STORY: the SWEEP and GEAR modules' knobs from the source's rack, and the FIELD's warp
  controls: [
    { id: 'rate',   label: 'SWEEP RATE',   kind: 'knob', min: -30, max: 30, value: RATE,         fmt: v => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}°/S` },
    { id: 'middle', label: 'MIDDLE RATIO', kind: 'knob', min: -2,  max: 2,  value: RATIO.middle, fmt: v => `×${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}` },
    { id: 'inner',  label: 'INNER RATIO',  kind: 'knob', min: -2,  max: 2,  value: RATIO.inner,  fmt: v => `×${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}` },
    { id: 'warp',   label: 'FIELD WARP',   kind: 'knob', min: 0,   max: .25, value: HALO.warp,   fmt: v => v.toFixed(3) },
  ],
  story: {
    tweaks: [
      { id: 'rate',   to: 24 },     // the sweep speeds up; the data arc lights further
      { id: 'middle', to: 1.2 },    // the middle ring reverses
      { id: 'warp',   to: .22 },    // the halo's contours roughen
    ],
  },
  exploded: { live: 4.4, poseEnd: END },   // the ZERO spring settles while the stack closes

  assembly: {
    seeds: [[0, 0], ...[0, 90, 180, 270].map(a => pol(R.outer, a)), ...[45, 135, 225, 315].map(a => pol(R.bezel - 10, a))],
    live: 2.8,
    end: END,
    draw: t => ({ t }),
  },

  build(L, sw) {
    const h = { reg: [], roots: [], cache: new Map() };
    // reg: an element that draws on (kind 'draw') or fades on ('op') over [a,b], off over [c,d]
    const reg = (n, kind, a, b, c, d, base = 1) => { h.reg.push({ n, kind, a, b, c, d, base }); return n; };
    const root = id => { const g = el('g', {}, L[id]); h.roots.push(g); return g; };
    const W = { heavy: sw.main, main: sw.minor * 1.15, fine: sw.minor * .85 };
    const label = (parent, size, attrs = {}) => el('text', { 'text-anchor': 'middle', 'font-size': size, ...attrs }, parent);

    // ── BEZEL: chamfered quadrants with V notches at the diagonals, hairline, 72 ticks, labels,
    //    aim index, data nodes, ⊗ markers, data arc ──
    const bz = root('bezel');
    for (let k = 0; k < 4; k++) {
      const a = 45 + k * 90;
      const [x1, y1] = pol(R.bezel - 10, a + 90), [x2, y2] = pol(R.bezel, a + 97);
      const p = drawable(el('path', { d: `${arc(R.bezel, a + 7, a + 83)} L${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`, fill: 'none', class: 'ink', 'stroke-width': W.heavy }, bz));
      reg(p, 'draw', .7 + stag(k, 4, .12), 1.5 + stag(k, 4, .12), 6.6 + stag(3 - k, 4, .1), 7.3 + stag(3 - k, 4, .1));
    }
    reg(drawable(el('circle', { r: R.ticks + 6, fill: 'none', class: 'minor', 'stroke-width': W.fine, transform: 'rotate(-90)' }, bz)), 'draw', .8, 1.7, 6.5, 7.2);
    for (let i = 0; i < 72; i++) {
      const long = i % 6 === 0, [x1, y1] = pol(R.ticks - (long ? 8 : 3), i * 5), [x2, y2] = pol(R.ticks + 4, i * 5);
      const n = el('line', { x1, y1, x2, y2, class: long ? 'ink' : 'mid', 'stroke-width': long ? W.main * 1.15 : W.fine }, bz);
      const a0 = .9 + stag(i, 72, 1 / 72), b0 = 6.0 + stag(71 - i, 72, .9 / 72);
      reg(n, 'op', a0, a0 + .1, b0, b0 + .1);
    }
    ['N', '030', '060', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'].forEach((s, i) => {
      const [x, y] = pol(R.bezel + 16, i * 30);
      const t = label(bz, 9, { x, y: y + 3.5, 'letter-spacing': '.12em', class: i % 3 ? 'dim' : '' });
      t.textContent = s;
      reg(t, 'op', 1.4 + stag(i, 12, .05), 1.7 + stag(i, 12, .05), 6.0 + stag(11 - i, 12, .03), 6.3 + stag(11 - i, 12, .03));
    });
    [0, 8].forEach((dy, i) => {
      const y0 = -R.bezel + 14 + dy;
      reg(drawable(el('path', { d: `M-9 ${y0} L0 ${y0 + 7} L9 ${y0}`, fill: 'none', class: 'acc', 'stroke-width': W.heavy }, bz)), 'draw', 1.6 + i * .1, 2.0 + i * .1, 6.8, 7.2);
    });
    h.nodes = Array.from({ length: 12 }, (_, i) => {
      const [x, y] = pol(R.bezel - 5, i * 30 + 15);
      const g = reg(el('g', {}, bz), 'op', 1.2 + stag(i, 12, .06), 1.5 + stag(i, 12, .06), 6.2 + stag(11 - i, 12, .04), 6.5 + stag(11 - i, 12, .04));
      return el('circle', { cx: x, cy: y, r: 2.6, class: 'disc mid', 'stroke-width': W.fine }, g);
    });
    [-58, 58].forEach(a => {
      const [x, y] = pol(R.data - 12, a);
      const g = reg(el('g', { fill: 'none', class: 'mid', 'stroke-width': W.main }, bz), 'op', 1.5, 1.9, 6.3, 6.6);
      el('circle', { cx: x, cy: y, r: 7, class: 'mid' }, g);
      el('path', { d: `M${x - 3} ${y - 3}L${x + 3} ${y + 3}M${x + 3} ${y - 3}L${x - 3} ${y + 3}`, class: 'mid' }, g);
    });
    // data arc: |rate| lights segments; pose sets each one's class, the wrapper fades it on/off
    h.data = Array.from({ length: DATA_SEGS }, (_, i) => {
      const a0 = DATA_A0 + i * (DATA_SPAN / DATA_SEGS) + .5, a1 = a0 + DATA_SPAN / DATA_SEGS - 1;
      const g = reg(el('g', {}, bz), 'op', 1.6 + stag(i, DATA_SEGS, .5 / DATA_SEGS), 1.68 + stag(i, DATA_SEGS, .5 / DATA_SEGS), 6.0 + stag(DATA_SEGS - 1 - i, DATA_SEGS, .4 / DATA_SEGS), 6.08 + stag(DATA_SEGS - 1 - i, DATA_SEGS, .4 / DATA_SEGS));
      return el('path', { d: arc(R.data, a0, a1), fill: 'none', 'stroke-width': 7 }, g);
    });

    // ── HALO: pencil contours, clipped to the band by a mask that is also the angular draw-on ──
    const ha = root('halo');
    const mid = `grt-halo-${Math.random().toString(36).slice(2, 8)}`;
    const mask = el('mask', { id: mid, maskUnits: 'userSpaceOnUse', x: -300, y: -300, width: 600, height: 600 }, ha);
    reg(drawable(el('circle', { r: (R.halo[0] + R.halo[1]) / 2, fill: 'none', stroke: '#fff', 'stroke-width': R.halo[1] - R.halo[0], transform: 'rotate(-90)' }, mask)), 'draw', 1.2, 2.6, 6.0, 6.9);
    h.halo = el('g', { 'stroke-linecap': 'round', fill: 'none' }, el('g', { mask: `url(#${mid})` }, ha));
    h.haloPaths = [.35, .6, .8, .95].map(al => [
      el('path', { class: 'ink', 'stroke-width': W.main * 2.5, opacity: al * .09 }, h.halo),
      el('path', { class: 'mid', 'stroke-width': W.fine, opacity: al }, h.halo),
    ]);
    h.haloKey = null;

    // ── OUTER ×1: 38 dashes and 4 pods turn; the trail and the upright degree readouts follow ──
    const ou = root('outer');
    h.outerG = el('g', {}, ou);
    for (let i = 0; i < 38; i++) {
      const a = i * 360 / 38;
      const p = drawable(el('path', { d: arc(R.outer, a, a + 360 / 38 * .78), fill: 'none', class: 'mid', 'stroke-width': W.main }, h.outerG));
      const a0 = 1.0 + stag(i, 38, 1 / 38), b0 = 6.1 + stag(37 - i, 38, .8 / 38);
      reg(p, 'draw', a0, a0 + .12, b0, b0 + .12);
    }
    for (let k = 0; k < 4; k++) {
      const g = reg(el('g', { transform: `rotate(${k * 90})` }, h.outerG), 'op', 1.6 + stag(k, 4, .1), 1.9 + stag(k, 4, .1), 6.0, 6.4);
      el('rect', { x: -9, y: -R.outer - 6, width: 18, height: 12, rx: 3, class: `disc ${k ? 'mid' : 'ink'}`, 'stroke-width': W.main }, g);
      if (!k) el('rect', { x: -4, y: -R.outer - 2, width: 8, height: 4, rx: 1, class: 'icondot' }, g);
    }
    const trailG = reg(el('g', {}, ou), 'op', 2.2, 2.6, 6.0, 6.3);
    h.trail = [0, 1, 2].map(i => el('path', { fill: 'none', class: 'acc', 'stroke-width': W.heavy * (1.9 - i * .38) }, trailG));
    h.pods = [0, 1, 2, 3].map(k => {
      const t = label(ou, 9, { 'letter-spacing': '.1em', class: k ? 'dim' : '' });
      reg(t, 'op', 2.1 + stag(k, 4, .08), 2.4 + stag(k, 4, .08), 6.0, 6.3);
      return t;
    });

    // ── MIDDLE ×−1.5: hairline and 4 square targets turn; 8 hex labels ride it upright ──
    const mi = root('middle');
    h.midG = el('g', {}, mi);
    reg(drawable(el('circle', { r: R.middle, fill: 'none', class: 'ink', 'stroke-width': W.main, transform: 'rotate(-90)' }, h.midG)), 'draw', 1.2, 2.0, 6.3, 7.0);
    for (let k = 0; k < 4; k++) {
      const [x, y] = pol(R.middle, k * 90 + 45);
      const sq = el('rect', { x: x - 5, y: y - 5, width: 10, height: 10, class: 'disc ink', 'stroke-width': W.main, transform: `rotate(${k * 90 + 45} ${x} ${y})` }, h.midG);
      reg(sq, 'op', 1.7 + stag(k, 4, .08), 2.0 + stag(k, 4, .08), 6.1, 6.5);
    }
    h.hex = Array.from({ length: 8 }, (_, i) => {
      const t = label(mi, 8.5, { 'letter-spacing': '.08em' });
      reg(t, 'op', 2.0 + stag(i, 8, .05), 2.4 + stag(i, 8, .05), 6.0, 6.3);
      return t;
    });

    // ── INNER ×−0.47: hairline, 31 radial bars, 8 ticks ──
    const inn = root('inner');
    h.innerG = el('g', {}, inn);
    reg(drawable(el('circle', { r: R.inner, fill: 'none', class: 'mid', 'stroke-width': W.main, transform: 'rotate(-90)' }, h.innerG)), 'draw', 1.4, 2.1, 6.4, 7.1);
    for (let i = 0; i < 31; i++) {
      const [x1, y1] = pol(R.inner - 12, i * 360 / 31), [x2, y2] = pol(R.inner - 4, i * 360 / 31);
      const n = el('line', { x1, y1, x2, y2, class: i ? 'mid' : 'ink', 'stroke-width': i ? W.main * 1.15 : W.heavy * 1.5 }, h.innerG);
      const a0 = 1.9 + stag(i, 31, .6 / 31), b0 = 6.0 + stag(30 - i, 31, .5 / 31);
      reg(n, 'op', a0, a0 + .08, b0, b0 + .08);
    }
    for (let k = 0; k < 8; k++) {
      const [x1, y1] = pol(R.inner, k * 45), [x2, y2] = pol(R.inner + 7, k * 45);
      reg(el('line', { x1, y1, x2, y2, class: 'ink', 'stroke-width': W.main }, h.innerG), 'op', 1.8 + stag(k, 8, .04), 2.0 + stag(k, 8, .04), 6.2, 6.6);
    }

    // ── CORE: lock ring (pose drives it; its wrapper only fades it off at the end of ASSEMBLY),
    //    crosshair stubs, status capsules ──
    const co = root('core');
    h.lock = el('circle', { r: R.lock, fill: 'none', class: 'acc', 'stroke-width': W.heavy, 'stroke-dasharray': '3 3', opacity: 0 }, reg(el('g', {}, co), 'op', -2, -1, 6.3, 6.9));
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], i) =>
      reg(drawable(el('line', { x1: dx * 46, y1: dy * 46, x2: dx * 58, y2: dy * 58, class: 'mid', 'stroke-width': W.main }, co)), 'draw', 1.5 + stag(i, 4, .06), 1.9 + stag(i, 4, .06), 6.9, 7.3));
    h.caps = ['SCAN', 'LOCK', 'JAM'].map((s, i) => {
      const g = el('g', {}, reg(el('g', {}, co), 'op', 1.7 + stag(i, 3, .1), 2.0 + stag(i, 3, .1), 6.6 + stag(2 - i, 3, .08), 6.9 + stag(2 - i, 3, .08)));
      const r = el('rect', { x: -24, y: -9, width: 48, height: 18, rx: 6, 'stroke-width': W.main }, g);
      const tx = label(g, 8, { y: 3.2, 'letter-spacing': '.18em', 'font-weight': 600 });
      tx.textContent = s;
      return { g, r, tx, y: (i - 1) * 24 };
    });
    return h;
  },

  pose(u, ctl) {
    // live on the controls (STORY): each gear's angle is the integral of ratio × its input's speed,
    // so turning a knob changes speed without a jump. Otherwise: the scripted drag / lock / ZERO.
    const live = !!ctl;
    const sw0 = live ? ctl.integ(c => c.rate) : sweep(u), lk = !live && locked(u);
    const v = live ? ctl.v.rate : (sw0 - sweep(u - 1 / 60)) * 60;   // °/s of the outer ring this frame
    // glitch: a stepped shake (5 steps over 320 ms, decaying), seeded so every render matches
    let shake = [0, 0], errFlash = false;
    (live ? [] : GLITCHES).forEach((g, gi) => {
      if (u >= g.at && u < g.at + .32) {
        const st = Math.floor((u - g.at) / .32 * 5), amp = (1 - st / 5) * 5 * g.k;
        shake = [(hash(gi, st) - .5) * amp, (hash(gi + 9, st) - .5) * amp];
      }
      if (u >= g.at && u < g.at + .26) errFlash = true;
    });
    // hex telemetry: reshuffled every 1.1 s (12 % ERR); LOCK, then fixed target codes while locked;
    // ZERO restores the first set, so the loop closes on the frame it opened with
    const tick = live || u < ZERO ? Math.floor(Math.max(0, u) / 1.1) : 0;
    const hex = Array.from({ length: 8 }, (_, i) => {
      if (lk) return { s: u < LOCK + .42 ? 'LOCK' : LOCK_HEX[i], cls: 'accf' };
      if (errFlash && i % 3 === 0) return { s: 'ERR', cls: 'errf' };
      if (tick && hash(i + 30, tick) < .12) return { s: 'ERR', cls: 'errf' };
      return { s: hex4(hash(i + 50, tick)), cls: 'dim' };
    });
    // lock ring: springs in from ×1.6 on lock, shrinks out on unlock; its dashes crawl while held
    let lockOp = 0, lockScale = 1;
    if (lk) { const k = springStep(u - LOCK, 160, 13); lockOp = clamp(k * 1.4); lockScale = 1.6 - .6 * k; }
    else if (u >= UNLOCK && u < UNLOCK + .26) { const k = win(u, UNLOCK, UNLOCK + .26) ** 2; lockOp = 1 - k; lockScale = 1 - .2 * k; }
    const pop = at => 1 + .25 * Math.sin(Math.PI * win(u, at, at + .3));
    return {
      outer: sw0 * RATIO.outer,
      middle: live ? ctl.integ(c => c.rate * c.middle) : sw0 * RATIO.outer * RATIO.middle,
      inner: live ? ctl.integ(c => c.rate * c.middle * c.inner) : sw0 * RATIO.outer * RATIO.middle * RATIO.inner,
      warp: live ? ctl.v.warp : HALO.warp,
      orbit: sw0 * .25,
      v, locked: lk, hex, shake, lockOp, lockScale,
      lockDash: lk ? (u * 1000 / 120) % 6 : 0,
      sector: lk ? -1 : Math.floor(wrap(sw0 - 15) / 30),
      lit: lk ? 0 : Math.round(Math.min(1, live ? Math.abs(v) / 30 : (RATE + Math.abs(v) * .3) / 30) * DATA_SEGS),
      caps: [!lk, lk, false],
      capPop: [1, u >= UNLOCK ? pop(UNLOCK) : pop(LOCK), 1],
    };
  },

  finger(u) {
    const rest = [240, 250], away = [200, 230];
    const onRing = a => pol(R.outer, a);
    const a1 = sweep(DRAG.at), grab = onRing(DRAG.grab);
    if (u < DRAG.at - .04) {
      const k = io(win(u, .05, DRAG.at - .04));
      return { x: lerp(rest[0], grab[0], k), y: lerp(rest[1], grab[1], k), layer: 'outer' };
    }
    if (u < DRAG.end) {
      const [x, y] = onRing(DRAG.grab + sweep(u) - a1);
      return { x, y, down: u >= DRAG.at, layer: 'outer' };
    }
    const rel = onRing(DRAG.grab + DRAG.sweep);
    if (u < LOCK - .04) {
      const k = io(win(u, DRAG.end + .05, LOCK - .04));
      return { x: lerp(rel[0], 0, k), y: lerp(rel[1], 0, k), layer: 'core' };
    }
    if (u < LOCK + .5) return { x: 0, y: 0, pulse: u >= LOCK ? win(u, LOCK, LOCK + .5) : null, layer: 'core' };
    if (u < UNLOCK - .04) {   // drift off the core and come back for the unlock tap
      const k = Math.sin(Math.PI * win(u, LOCK + .5, UNLOCK - .04));
      return { x: 60 * k, y: 72 * k, layer: 'core' };
    }
    if (u < UNLOCK + .5) return { x: 0, y: 0, pulse: u >= UNLOCK ? win(u, UNLOCK, UNLOCK + .5) : null, layer: 'core' };
    const k = io(win(u, UNLOCK + .5, ZERO + .4));            // step back and watch it home
    return { x: lerp(0, away[0], k), y: lerp(0, away[1], k), layer: 'core' };
  },

  apply(h, p, D) {
    const put = (n, s) => { if (h.cache.get(n) !== s) { n.textContent = s; h.cache.set(n, s); } };
    for (const r of h.roots) r.setAttribute('transform', p.shake[0] || p.shake[1] ? `translate(${p.shake[0].toFixed(2)} ${p.shake[1].toFixed(2)})` : '');
    h.outerG.setAttribute('transform', `rotate(${p.outer})`);
    h.midG.setAttribute('transform', `rotate(${p.middle})`);
    h.innerG.setAttribute('transform', `rotate(${p.inner})`);

    // halo: orbits with the sweep; retraced only when the frame changes, and held still while locked
    h.halo.setAttribute('transform', `rotate(${p.orbit})`);
    const haloOn = !D || dOn(D.t, 1.2, 2.6) * dOff(D.t, 6.0, 6.9) > 0;
    const key = `${p.t == null ? 'still' : p.t.toFixed(4)}/${p.warp.toFixed(3)}`;
    if (haloOn && key !== h.haloKey && !(p.locked && h.haloKey)) {
      haloAt(p.t, p.T, p.warp).forEach((d, i) => h.haloPaths[i].forEach(pa => pa.setAttribute('d', d)));
      h.haloKey = key;
    }

    // trail behind the outer index, on the side it came from; longer and brighter with speed
    const dir = p.v >= 0 ? -1 : 1, speed = Math.min(1, Math.abs(p.v) / 30);
    h.trail.forEach((t, i) => {
      const a0 = p.outer + dir * (4 + i * 12), a1 = a0 + dir * 10 * (.3 + speed);
      t.setAttribute('d', arc(R.outer + 10, Math.min(a0, a1), Math.max(a0, a1)));
      t.setAttribute('opacity', p.locked ? 0 : (.7 - i * .22) * (.25 + .75 * speed));
    });
    h.pods.forEach((t, k) => {
      const a = p.outer + k * 90, [x, y] = pol(R.outer - 22, a);
      t.setAttribute('x', x.toFixed(2)); t.setAttribute('y', (y + 3).toFixed(2));
      put(t, String(Math.round(wrap(a)) % 360).padStart(3, '0') + '°');
    });
    h.hex.forEach((t, k) => {
      const a = p.middle + k * 45 + 22.5, [x, y] = pol(R.middle - 18, a);
      t.setAttribute('x', x.toFixed(2)); t.setAttribute('y', (y + 3).toFixed(2));
      put(t, p.hex[k].s);
      t.setAttribute('class', p.hex[k].cls);
    });
    h.nodes.forEach((c, i) => c.setAttribute('class', i === p.sector ? 'icondot' : 'disc mid'));
    h.data.forEach((s, i) => {
      s.setAttribute('class', i < p.lit ? 'ink' : 'minor');
      s.setAttribute('opacity', i < p.lit ? 1 : .4);
    });
    h.lock.setAttribute('opacity', p.lockOp);
    h.lock.setAttribute('transform', p.lockScale === 1 ? '' : `scale(${p.lockScale.toFixed(4)})`);
    h.lock.setAttribute('stroke-dashoffset', p.lockDash.toFixed(2));
    // capsules: SCAN fills with ink, LOCK with amber, JAM (never in this performance) with red
    const ON = ['icondot ink', 'accf acc', 'errf err'];
    h.caps.forEach((c, i) => {
      const on = p.caps[i];
      c.r.setAttribute('class', on ? ON[i] : 'disc mid');
      c.tx.setAttribute('class', on ? 'disc' : 'dim');
      c.g.setAttribute('transform', `translate(0 ${c.y})${p.capPop[i] !== 1 ? ` scale(${p.capPop[i].toFixed(4)})` : ''}`);
    });

    // draw on / off
    for (const r of h.reg) {
      const k = D ? dOn(D.t, r.a, r.b) * dOff(D.t, r.c, r.d) : 1;
      if (r.kind === 'draw') setDraw(r.n, k);
      else r.n.setAttribute('opacity', k * r.base);
    }
  },
});
})();
