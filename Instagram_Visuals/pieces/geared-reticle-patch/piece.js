/* ─────────────────────────────────────────────────────────────
   PIECE · GEARED RETICLE · PATCH (GRT-11)
   components/interaction/geared-reticle/geared-reticle.html: the Cyberpunk Dial rebuilt with Patch's
   knob / jack / cord / LED parts and a Graphite Halo interference band. Redrawn as layered SVG:
   the dial on the left (source geometry × .74, centred at DC), the gear-train rack on the right.
   Behaviour is the source's, as a pure function of u: a fixed 60 Hz simulation stepped once from
   u = 0 (sweep 10°/s · Δgear = ratio × Δinput over the patch of the moment · a loop jams the train).
   The dial-only version is pieces/geared-reticle (GRT-10); everything here is private to this IIFE.
   ───────────────────────────────────────────────────────────── */
(() => {

/* ── GRAPHITE HALO (after components/Graphite Halo (1).html) ──
   Isolines of a domain-warped simplex field masked to a ring band. To loop seamlessly the field at
   loop time t is crossfaded with the field one loop earlier, as in rosette/piece.js. */
const HALO = { seed: 4108, warp: .11, scale: 8.5, density: .5, spread: .065, layers: 3, K: 546, speed: .12, spin: .35, boil: .11 };
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
function haloField(n, z) {
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
      const wu = u + P.warp * qx, wv = v + P.warp * qy;
      const r = Math.hypot(wu, wv), th = Math.atan2(v, u);
      const lobe = .5 + .5 * HN(Math.cos(th) * 1.4, Math.sin(th) * 1.4, z * .5 + 40);
      const band = Math.exp(-(((r - (.335 + .03 * lobe)) / (P.spread * (.55 + 1.1 * lobe))) ** 2));
      if (band < .02) { vals[j * n + i] = -.04; continue; }
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
      const T = [x + lp(a, b) * step, y], R = [x + step, y + lp(b, c) * step], B = [x + lp(d, c) * step, y + step], Lf = [x, y + lp(a, d) * step];
      const sg = ({ 1: [Lf, B], 14: [Lf, B], 2: [B, R], 13: [B, R], 3: [Lf, R], 12: [Lf, R], 4: [T, R], 11: [T, R], 5: [Lf, T, B, R], 6: [T, B], 9: [T, B], 7: [Lf, T], 8: [Lf, T], 10: [T, R, Lf, B] })[k];
      const pr = .5 + .5 * HN((x + .5) * 9, (y + .5) * 9, 77 + bt * 3.1);
      const bk = buckets[Math.min(3, Math.floor(pr * 4))];
      for (let q = 0; q < sg.length; q += 2) bk.push(`M${f(sg[q][0])} ${f(sg[q][1])}L${f(sg[q + 1][0])} ${f(sg[q + 1][1])}`);
    }
  }
  return buckets.map(b => b.join(''));
}
const HALO_CACHE = new Map();
function haloAt(t, T) {
  const capture = document.body.classList.contains('capture');
  const n = t == null || capture ? 180 : 110;
  const key = t == null ? `still/${n}` : `${t.toFixed(4)}/${T}/${n}`;
  if (HALO_CACHE.has(key)) return HALO_CACHE.get(key);
  let d;
  if (t == null) d = haloContours(haloField(n, 0), n, 0);
  else {
    const a = clamp(t / T), A = haloField(n, t * HALO.speed), B = haloField(n, (t - T) * HALO.speed);
    for (let i = 0; i < A.length; i++) A[i] = A[i] * (1 - a) + B[i] * a;
    d = haloContours(A, n, Math.floor(t / HALO.boil) % 97);
  }
  if (HALO_CACHE.size > 8) HALO_CACHE.clear();
  HALO_CACHE.set(key, d);
  return d;
}

/* ── geometry ── */
const DC = [-85, 0], S = .74;                       // dial centre and scale (source units × S = piece units)
const R = { bezel: 272, ticks: 258, data: 248, outer: 226, halo: [150, 216], middle: 140, inner: 92 };
const pol = (r, a) => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];      // 0° = 12 o'clock, clockwise
const dialPt = (r, a) => { const [x, y] = pol(r, a); return [DC[0] + x * S, DC[1] + y * S]; };
function arcD(r, a0, a1) {
  const [x0, y0] = pol(r, a0), [x1, y1] = pol(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const wrap = d => ((d % 360) + 360) % 360;

// rack: five modules stacked on the right, jacks on their right edge, cords sag in the gutter
const MODS = [
  { id: 'sweep', no: '01', name: 'SWEEP', ins: false, outs: true },
  { id: 'outer', no: '02', name: 'OUTER', ins: true, outs: true, ratio: 1 },
  { id: 'middle', no: '03', name: 'MIDDLE', ins: true, outs: true, ratio: -1.5 },
  { id: 'inner', no: '04', name: 'INNER', ins: true, outs: true, ratio: -.47 },
  { id: 'field', no: '05', name: 'FIELD', ins: true, outs: false },
];
const RX = 150, RW = 134, RH = 88, RGAP = 10, RTOP = -272, JX = RX + RW;
const modTop = i => RTOP + i * (RH + RGAP);
const IDX = Object.fromEntries(MODS.map((m, i) => [m.id, i]));
const jack = (id, side) => [JX, modTop(IDX[id]) + (side === 'in' ? 50 : 72)];
const BTN_Y = modTop(5) + 4, BTN_H = 28;
const BTN = { lock: [RX, 62], zero: [RX + 72, 62] };   // x, width
const zeroPt = [BTN.zero[0] + BTN.zero[1] / 2, BTN_Y + BTN_H / 2];
function cordD([x1, y1], [x2, y2]) {
  const d = 12 + Math.abs(y2 - y1) * .07;
  return `M${x1} ${y1} C${x1 + d} ${y1} ${x2 + d} ${y2} ${x2} ${y2}`;
}

/* ── the patch over time (Patch semantics: tap an OUT to arm it, then an IN; an IN takes one cord;
      tapping a fed IN with nothing armed pulls its cord) ── */
const GEARS = ['outer', 'middle', 'inner'];
const DEFAULT_EDGES = [['sweep', 'outer'], ['outer', 'middle'], ['middle', 'inner'], ['sweep', 'field']];
const PATCH_EV = [
  { at: 1.6, out: 'inner' },
  { at: 2.0, in: 'outer' },          // inner → outer closes a loop: the train jams
  { at: 2.7, in: 'outer' },          // nothing armed: pulls the loop cord
  { at: 3.1, out: 'sweep' },
  { at: 3.5, in: 'outer' },          // the default patch again
];
const ZERO_AT = 3.9;
const DRAG = { t0: .3, t1: 1.2, a0: 40, a1: 100 };   // outer ring, +60°
function patchAt(u) {
  let edges = DEFAULT_EDGES.map(e => e.slice()), pending = null;
  for (const e of PATCH_EV) {
    if (e.at > u) break;
    if (e.out) pending = e.out;
    else if (pending) { edges = edges.filter(x => x[1] !== e.in).concat([[pending, e.in]]); pending = null; }
    else edges = edges.filter(x => x[1] !== e.in);
  }
  return { edges, pending };
}
const ANALYSIS = new Map();
function analyse(edges) {
  const key = edges.map(e => e.join('>')).join(',');
  if (ANALYSIS.has(key)) return ANALYSIS.get(key);
  const inOf = {}; edges.forEach(([a, b]) => { inOf[b] = a; });
  const jam = new Set();
  for (const g of GEARS) {
    const seen = [g]; let cur = inOf[g];
    while (cur && cur !== 'sweep') {
      if (seen.includes(cur)) { seen.slice(seen.indexOf(cur)).forEach(x => jam.add(x)); break; }
      seen.push(cur); cur = inOf[cur];
    }
  }
  const illegal = new Set(edges.filter(([a, b]) => jam.has(a) && jam.has(b)).map(e => e.join('>')));
  const order = [], done = new Set(['sweep']);
  for (let pass = 0; pass < 3; pass++) for (const g of GEARS) if (!done.has(g) && !jam.has(g) && (!inOf[g] || done.has(inOf[g]))) { order.push(g); done.add(g); }
  const r = { inOf, jam, illegal, order };
  ANALYSIS.set(key, r);
  return r;
}

/* ── simulation: 60 Hz from u = 0. All rings start aim-aligned at 0°. ── */
const DT = 1 / 60, UMAX = 7, NSTEP = Math.ceil(UMAX / DT) + 2;
const RATE = 10, MANUAL_HOLD = 2;
const ANG = { sweep: [], outer: [], middle: [], inner: [] }, VEL = [];
// the auto drive spins up from rest (at u = 0 and after the 2 s manual hold), so the loop starts still
const autoGain = u => u < DRAG.t0 ? io(win(u, 0, DRAG.t0)) : io(win(u, DRAG.t1 + MANUAL_HOLD, DRAG.t1 + MANUAL_HOLD + .3));
(function simulate() {
  const ang = { sweep: 0, outer: 0, middle: 0, inner: 0 };
  const dragAt = u => 60 * io(win(u, DRAG.t0, DRAG.t1));
  let zeroFrom = null;
  for (let n = 0; n < NSTEP; n++) {
    const u = n * DT;
    if (u >= ZERO_AT) {                       // ZERO: every ring springs home; the drive stays parked
      if (!zeroFrom) zeroFrom = { ...ang };
      const k = springStep(u - ZERO_AT, 90, 11);
      for (const g in ang) ang[g] = zeroFrom[g] + (Math.round(zeroFrom[g] / 360) * 360 - zeroFrom[g]) * k;
    } else if (n > 0) {
      const uPrev = u - DT;
      const auto = RATE * DT * autoGain(uPrev);
      const delta = { sweep: auto + dragAt(u) - dragAt(uPrev) };
      ang.sweep += delta.sweep;
      const A = analyse(patchAt(u).edges);
      for (const g of GEARS) delta[g] = 0;
      for (const g of A.order) {
        const src = A.inOf[g];
        delta[g] = (MODS[IDX[g]].ratio) * (src ? delta[src] : 0);
        ang[g] += delta[g];
      }
    }
    for (const g in ang) ANG[g][n] = ang[g];
    VEL[n] = n ? (ang.outer - ANG.outer[n - 1]) / DT : 0;
  }
})();
const sample = (arr, u) => {
  const x = clamp(u, 0, UMAX) / DT, i = Math.floor(x);
  return lerp(arr[i], arr[Math.min(i + 1, arr.length - 1)], x - i);
};

/* ── the finger: drag on the outer ring, then taps on the rack ── */
const TAPS = [
  ...PATCH_EV.map(e => ({ at: e.at, pt: e.out ? jack(e.out, 'out') : jack(e.in, 'in'), layer: 'rack' })),
  { at: ZERO_AT, pt: zeroPt, layer: 'rack' },
];
const dragPt = u => dialPt(R.outer, lerp(DRAG.a0, DRAG.a1, io(win(u, DRAG.t0, DRAG.t1))));
function fingerAt(u) {
  if (u < DRAG.t0) { const [x, y] = dragPt(0); return { x, y }; }
  if (u <= DRAG.t1) { const [x, y] = dragPt(u); return { x, y, down: true, layer: 'outer' }; }
  let from = dragPt(DRAG.t1), prevAt = DRAG.t1;
  for (const tp of TAPS) {
    const a = Math.max(prevAt + .12, tp.at - .45), b = tp.at - .04;
    if (u < b) {
      const k = io(win(u, a, b));
      return { x: lerp(from[0], tp.pt[0], k), y: lerp(from[1], tp.pt[1], k) };
    }
    const next = TAPS[TAPS.indexOf(tp) + 1];
    if (u < tp.at + .5 && (!next || u < Math.max(tp.at + .12, next.at - .45))) return { x: tp.pt[0], y: tp.pt[1], pulse: win(u, tp.at, tp.at + .5), layer: tp.layer };
    from = tp.pt; prevAt = tp.at;
  }
  return { x: from[0], y: from[1] };
}
// a deterministic hash for glitch jitter and hex labels
const hash = n => { let s = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); s ^= s >>> 13; s = Math.imul(s, 0xc2b2ae35); return ((s ^ (s >>> 16)) >>> 0) / 4294967296; };
const HEXW = 1.1;
function hexLabels(w) {
  return Array.from({ length: 8 }, (_, i) => {
    const r = hash(w * 31 + i * 7 + 3);
    return r < .12 ? 'ERR' : '0x' + Math.floor(hash(w * 97 + i * 13) * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  });
}

registerPiece({
  id: 'geared-reticle-patch',
  code: 'GRT-11', series: 'B', n: '11',
  name: 'GEARED RETICLE · PATCH',
  mechanic: 'PATCHABLE GEAR-TRAIN RETICLE',
  source: 'COMPONENTS/INTERACTION/CYBERPUNK-DIAL/GEARED-RETICLE',
  hero: { v: '3', u: 'GEARS · 1 DRIVE · 1 FIELD' },
  extent: 300,
  spec: [
    ['INPUT',  'DRAG RING · PATCH JACKS · LOCK'],
    ['STATE',  'PATCH · 4 ANGLES · FIELD Z'],
    ['MOTION', 'Δ = RATIO × ΔIN · 10°/S DRIVE'],
    ['BUILT',  'SVG · PATCH PARTS · SIMPLEX HALO'],
  ],
  layers: [
    { id: 'bezel',  name: 'BEZEL',         note: 'AIM · 72 TICKS · RATE', edge: DC[0] + (R.bezel + 16) * S },
    { id: 'halo',   name: 'INTERFERENCE',  note: 'GRAPHITE HALO FIELD',   edge: DC[0] + R.halo[1] * S },
    { id: 'outer',  name: 'OUTER RING',    note: 'GEAR 02 · ×+1.00',      edge: DC[0] + R.outer * S },
    { id: 'middle', name: 'MIDDLE RING',   note: 'GEAR 03 · ×−1.50',      edge: DC[0] + R.middle * S },
    { id: 'core',   name: 'INNER + CORE',  note: 'GEAR 04 · STATUS CAPS', edge: DC[0] + R.inner * S },
    { id: 'rack',   name: 'GEAR TRAIN',    note: 'PATCH · LOOP = JAM',    edge: JX },
    { id: 'input',  name: 'INPUT',         note: 'DRAG · TAP JACKS',      edge: 300 },
  ],
  // only one dial callout, above the rack: anything else from the dial would have to cross it
  callouts: [
    { at: dialPt(183, 50),                               title: 'INTERFERENCE',  note: 'SWEEP-DRIVEN HALO' },
    { at: jack('outer', 'in'),                           title: 'GEAR · OUTER',  note: 'IN TAKES ONE CORD' },
    { at: [JX, modTop(2) + 26],                          title: 'JAMMED GEAR',   note: 'HOLDS TILL THE LOOP BREAKS' },
    { at: [JX + .75 * (12 + 218 * .07), (jack('inner', 'out')[1] + jack('outer', 'in')[1]) / 2], title: 'ILLEGAL LOOP', note: 'INNER → OUTER' },
    { at: [BTN.zero[0] + BTN.zero[1], BTN_Y + BTN_H / 2], title: 'ZERO', note: 'RINGS SPRING HOME' },
  ],
  specU: 2.3,
  exploded: { live: 4.4, poseEnd: 6 },
  assembly: {
    seeds: [DC, dialPt(R.outer, 0), ...MODS.map(m => jack(m.id, m.outs ? 'out' : 'in')), zeroPt],
    live: 2.8,
    end: 2.4,                       // holds on the jam, then undraws
    draw: t => ({
      bezel: dOn(t, .7, 1.6) * dOff(t, 6.5, 7.2),
      ticks: Array.from({ length: 72 }, (_, i) => { const a = .85 + stag(i, 72, 1.0 / 72), b = 6.1 + stag(71 - i, 72, .9 / 72); return dOn(t, a, a + .3) * dOff(t, b, b + .3); }),
      text: dOn(t, 1.5, 2.2) * dOff(t, 6.0, 6.6),
      data: Array.from({ length: 30 }, (_, i) => dOn(t, 1.6 + stag(i, 30, .025), 1.8 + stag(i, 30, .025)) * dOff(t, 6.0 + stag(29 - i, 30, .015), 6.2 + stag(29 - i, 30, .015))),
      halo: dOn(t, 1.2, 2.6) * dOff(t, 6.0, 6.9),
      outer: Array.from({ length: 38 }, (_, i) => dOn(t, 1.0 + stag(i, 38, .02), 1.35 + stag(i, 38, .02)) * dOff(t, 6.2 + stag(37 - i, 38, .015), 6.55 + stag(37 - i, 38, .015))),
      middle: dOn(t, 1.25, 2.0) * dOff(t, 6.3, 7.0),
      inner: dOn(t, 1.45, 2.15) * dOff(t, 6.5, 7.15),
      caps: dOn(t, 2.0, 2.5) * dOff(t, 6.0, 6.5),
      mods: MODS.map((_, i) => dOn(t, 1.3 + stag(i, 5, .1), 1.9 + stag(i, 5, .1)) * dOff(t, 6.3 + stag(4 - i, 5, .08), 6.9 + stag(4 - i, 5, .08))),
      modText: MODS.map((_, i) => dOn(t, 1.8 + stag(i, 5, .1), 2.2 + stag(i, 5, .1)) * dOff(t, 6.0, 6.4)),
      cords: dOn(t, 2.1, 2.7) * dOff(t, 5.9, 6.4),
      btns: dOn(t, 2.0, 2.5) * dOff(t, 6.4, 6.9),
    }),
  },

  build(L, sw) {
    const h = {};
    h.bg = L.input.ownerSVGElement.querySelector('rect')?.getAttribute('fill') || '#000';   // the mode's background
    const wS = w => w / S;          // stroke widths inside the scaled dial groups
    const dial = id => el('g', { transform: `translate(${DC[0]} ${DC[1]}) scale(${S})` }, L[id]);
    h.dg = {};

    // ── bezel ──
    const B = h.dg.bezel = dial('bezel');
    h.bezelArcs = [];
    for (let k = 0; k < 4; k++) {
      const a = 45 + k * 90;
      h.bezelArcs.push(drawable(el('path', { d: arcD(R.bezel, a + 7, a + 83), fill: 'none', class: 'ink', 'stroke-width': wS(sw.main) }, B)));
      const [x0, y0] = pol(R.bezel, a + 83), [x1, y1] = pol(R.bezel - 10, a + 90), [x2, y2] = pol(R.bezel, a + 97);
      h.bezelArcs.push(drawable(el('path', { d: `M${x0} ${y0} L${x1} ${y1} L${x2} ${y2}`, fill: 'none', class: 'ink', 'stroke-width': wS(sw.main) }, B)));
    }
    h.bezelArcs.push(drawable(el('circle', { r: R.ticks + 6, fill: 'none', class: 'minor', 'stroke-width': wS(sw.minor) }, B)));
    h.ticks = Array.from({ length: 72 }, (_, i) => {
      const long = i % 6 === 0, [x0, y0] = pol(R.ticks - (long ? 8 : 3), i * 5), [x1, y1] = pol(R.ticks + 4, i * 5);
      return el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: long ? 'ink' : 'mid', 'stroke-width': wS(long ? sw.main : sw.minor) }, B);
    });
    h.bezelText = el('g', {}, B);
    ['N', '030', '060', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'].forEach((s2, i) => {
      const [x, y] = pol(R.bezel + 19, i * 30);
      txt(h.bezelText, x, y + 4, s2, { 'text-anchor': 'middle', 'font-size': 11.5, 'letter-spacing': '.1em', class: i % 3 ? 'dim' : '' });
    });
    h.aim = [0, 9].map(dy => drawable(el('path', { d: `M-11 ${-R.bezel + 14 + dy} L0 ${-R.bezel + 22 + dy} L11 ${-R.bezel + 14 + dy}`, fill: 'none', class: 'acc', 'stroke-width': wS(sw.main) }, B)));
    h.dataNodes = Array.from({ length: 12 }, (_, i) => { const [x, y] = pol(R.bezel - 5, i * 30 + 15); return el('circle', { cx: x, cy: y, r: 3.2, class: 'disc mid', 'stroke-width': wS(sw.minor) }, B); });
    h.markers = [-58, 58].map(a => {
      const [x, y] = pol(R.data - 12, a), g = el('g', {}, B);
      el('circle', { cx: x, cy: y, r: 8, fill: 'none', class: 'mid', 'stroke-width': wS(sw.minor) }, g);
      el('path', { d: `M${x - 3.5} ${y - 3.5}L${x + 3.5} ${y + 3.5}M${x + 3.5} ${y - 3.5}L${x - 3.5} ${y + 3.5}`, fill: 'none', class: 'mid', 'stroke-width': wS(sw.minor) }, g);
      return g;
    });
    // data arc (Rocinante): 30 heavy segments, upper-left; |rate| lights them, a jam turns them red
    h.data = Array.from({ length: 30 }, (_, i) => {
      const a0 = -84 + i * (70 / 30) + .5, a1 = a0 + 70 / 30 - 1;
      return drawable(el('path', { d: arcD(R.data, a0, a1), fill: 'none', class: 'minor', 'stroke-width': 7 }, B));
    });

    // ── halo: clipped to its band, revealed by an angular sweep in ASSEMBLY ──
    const Hd = h.dg.halo = dial('halo');
    const mid = `grtp-halo-${Math.random().toString(36).slice(2, 8)}`;
    const mask = el('mask', { id: mid, maskUnits: 'userSpaceOnUse', x: -300, y: -300, width: 600, height: 600 }, Hd);
    h.haloSweep = drawable(el('circle', { r: (R.halo[0] + R.halo[1]) / 2, fill: 'none', stroke: '#fff', 'stroke-width': R.halo[1] - R.halo[0], transform: 'rotate(-90)' }, mask));
    h.halo = el('g', { mask: `url(#${mid})`, 'stroke-linecap': 'round', fill: 'none' }, Hd);
    h.haloPaths = [.35, .6, .8, .95].map(al => [
      el('path', { class: 'ink', 'stroke-width': wS(sw.minor) * 2.6, opacity: al * .09 }, h.halo),
      el('path', { class: 'mid', 'stroke-width': wS(sw.minor) * .85, opacity: al }, h.halo),
    ]);
    h.haloKey = null;

    // ── outer ring: 38 dashes + 4 pods rotate; the trail and readouts are placed by angle ──
    const O = h.dg.outer = dial('outer');
    h.outerRot = el('g', {}, O);
    h.outerDash = Array.from({ length: 38 }, (_, i) => drawable(el('path', { d: arcD(R.outer, i * (360 / 38), i * (360 / 38) + 360 / 38 * .78), fill: 'none', class: 'mid', 'stroke-width': wS(sw.minor) }, h.outerRot)));
    h.pods = [0, 1, 2, 3].map(k => {
      const g = el('g', { transform: `rotate(${k * 90})` }, h.outerRot);
      el('rect', { x: -10, y: -R.outer - 7, width: 20, height: 14, rx: 3.5, class: `disc ${k ? 'mid' : 'ink'}`, 'stroke-width': wS(sw.minor) }, g);
      if (!k) el('rect', { x: -4.5, y: -R.outer - 2.5, width: 9, height: 5, rx: 1, class: 'icondot' }, g);
      return g;
    });
    h.trail = [0, 1, 2].map(i => el('path', { fill: 'none', class: 'acc', 'stroke-width': wS(sw.main) * (1.6 - i * .35) }, O));
    h.podText = [0, 1, 2, 3].map(() => txt(O, 0, 0, '', { 'text-anchor': 'middle', 'font-size': 11.5, 'letter-spacing': '.08em', class: 'dim' }));

    // ── middle ring ──
    const Mi = h.dg.middle = dial('middle');
    h.midRot = el('g', {}, Mi);
    h.midRing = drawable(el('circle', { r: R.middle, fill: 'none', class: 'ink', 'stroke-width': wS(sw.minor) }, h.midRot));
    h.midSq = [0, 1, 2, 3].map(k => { const [x, y] = pol(R.middle, k * 90 + 45); return el('rect', { x: x - 6, y: y - 6, width: 12, height: 12, class: 'disc ink', 'stroke-width': wS(sw.minor), transform: `rotate(${k * 90 + 45} ${x} ${y})` }, h.midRot); });
    h.hex = Array.from({ length: 8 }, () => txt(Mi, 0, 0, '', { 'text-anchor': 'middle', 'font-size': 10.5, 'letter-spacing': '.06em', class: 'dim' }));

    // ── inner ring + core: crosshair and the SCAN / LOCK / JAM capsules ──
    const C = h.dg.core = dial('core');
    h.innerRot = el('g', {}, C);
    h.innerRing = drawable(el('circle', { r: R.inner, fill: 'none', class: 'mid', 'stroke-width': wS(sw.minor) }, h.innerRot));
    h.innerBars = Array.from({ length: 31 }, (_, i) => {
      const [x0, y0] = pol(R.inner - 13, i * (360 / 31)), [x1, y1] = pol(R.inner - 4, i * (360 / 31));
      return el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: i ? 'mid' : 'ink', 'stroke-width': wS(i ? sw.minor : sw.main) * (i ? 1 : 1.4) }, h.innerRot);
    });
    h.innerTicks = Array.from({ length: 8 }, (_, k) => { const [x0, y0] = pol(R.inner, k * 45), [x1, y1] = pol(R.inner + 8, k * 45); return el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'ink', 'stroke-width': wS(sw.minor) }, h.innerRot); });
    h.cross = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => drawable(el('line', { x1: dx * 46, y1: dy * 46, x2: dx * 58, y2: dy * 58, class: 'mid', 'stroke-width': wS(sw.minor) }, C)));
    h.caps = ['SCAN', 'LOCK', 'JAM'].map((s2, i) => {
      const g = el('g', { transform: `translate(0 ${(i - 1) * 26})` }, C);
      const r = el('rect', { x: -27, y: -10, width: 54, height: 20, rx: 6.5, class: 'disc mid', 'stroke-width': wS(sw.minor) }, g);
      const tx = txt(g, 0, 4, s2, { 'text-anchor': 'middle', 'font-size': 10, 'letter-spacing': '.16em', 'font-weight': 600, class: 'dim' });
      return { g, r, tx };
    });

    // ── rack ──
    const K = L.rack;
    h.cordG = el('g', { fill: 'none', 'stroke-linecap': 'round' }, K);   // cords under the modules' jacks
    h.mods = MODS.map((m, i) => {
      const top = modTop(i), g = el('g', {}, K);
      const frame = drawable(el('rect', { x: RX, y: top, width: RW, height: RH, rx: 11, class: 'disc minor', 'stroke-width': sw.minor }, g));
      const tg = el('g', {}, g);
      el('circle', { cx: RX + 13, cy: top + 17, r: 8.5, fill: 'none', class: 'mid', 'stroke-width': sw.minor }, tg);
      txt(tg, RX + 13, top + 20, m.no, { 'text-anchor': 'middle', 'font-size': 7.5, class: 'disp' });
      txt(tg, RX + 27, top + 21, m.name, { 'font-size': 11, 'letter-spacing': '.08em', class: 'disp' });
      const sub = txt(tg, RX + 27, top + 34, '', { 'font-size': 7.5, 'letter-spacing': '.16em', class: 'dim' });
      const led = el('circle', { cx: RX + RW - 13, cy: top + 17, r: 3.6, class: m.id === 'sweep' ? 'accf' : 'icondot' }, tg);
      // knob glyph: 270° track, value arc from its zero, pointer
      const v = m.id === 'sweep' ? (RATE + 30) / 60 : m.id === 'field' ? .44 : (m.ratio + 2) / 4;
      const zero = m.id === 'field' ? 0 : .5, kx = RX + 18, ky = top + 61, kr = 11;
      const kArc = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b), s0 = 135 + 270 * lo, s1 = 135 + 270 * hi; const p0 = [kx + kr * Math.cos(rad(s0)), ky + kr * Math.sin(rad(s0))], p1 = [kx + kr * Math.cos(rad(s1)), ky + kr * Math.sin(rad(s1))]; return `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A${kr} ${kr} 0 ${270 * (hi - lo) > 180 ? 1 : 0} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`; };
      el('path', { d: kArc(0, 1), fill: 'none', class: 'minor', 'stroke-width': sw.minor }, tg);
      el('path', { d: kArc(zero, v), fill: 'none', class: 'ink', 'stroke-width': sw.main * 1.1 }, tg);
      el('circle', { cx: kx, cy: ky, r: 6.5, class: 'disc ink', 'stroke-width': sw.minor }, tg);
      const pa = rad(135 + 270 * v);
      el('line', { x1: kx, y1: ky, x2: kx + 6 * Math.cos(pa), y2: ky + 6 * Math.sin(pa), class: 'ink', 'stroke-width': sw.minor }, tg);
      const val = m.id === 'sweep' ? '+10.0°/S' : m.id === 'field' ? 'W.110 D.50' : '×' + (m.ratio < 0 ? '−' : '+') + Math.abs(m.ratio).toFixed(2);
      txt(tg, RX + 36, top + 65, val, { 'font-size': 10.5, class: 'disp' });
      // jacks: IN a ring, OUT a rounded square
      const jacks = {};
      if (m.ins) { const [x, y] = jack(m.id, 'in'); txt(tg, x - 11, y + 2.6, 'IN', { 'text-anchor': 'end', 'font-size': 7, 'letter-spacing': '.16em', class: 'dim' }); jacks.in = el('circle', { cx: x, cy: y, r: 5, class: 'disc ink', 'stroke-width': sw.main }, g); }
      if (m.outs) { const [x, y] = jack(m.id, 'out'); txt(tg, x - 11, y + 2.6, 'OUT', { 'text-anchor': 'end', 'font-size': 7, 'letter-spacing': '.16em', class: 'dim' }); jacks.out = el('rect', { x: x - 5, y: y - 5, width: 10, height: 10, rx: 2.5, class: 'disc ink', 'stroke-width': sw.main }, g); }
      return { m, frame, tg, sub, led, jacks };
    });
    h.cords = new Map();
    h.ghost = el('path', { fill: 'none', class: 'acc', 'stroke-width': sw.main, 'stroke-dasharray': '3 4', 'stroke-linecap': 'round' }, K);
    h.btns = Object.entries(BTN).map(([k, [x, w]]) => {
      const g = el('g', {}, K);
      const r = drawable(el('rect', { x, y: BTN_Y, width: w, height: BTN_H, rx: 8, fill: 'none', class: k === 'lock' ? 'acc' : 'mid', 'stroke-width': sw.minor }, g));
      const t = txt(g, x + w / 2, BTN_Y + 17.5, k.toUpperCase(), { 'text-anchor': 'middle', 'font-size': 9, 'letter-spacing': '.2em', 'font-weight': 500, class: k === 'lock' ? 'accf' : '' });
      return { k, g, r, t };
    });
    return h;
  },

  pose(u) {
    const uc = clamp(u, 0, UMAX);
    const { edges, pending } = patchAt(uc);
    const A = analyse(edges);
    const ang = { sweep: sample(ANG.sweep, uc), outer: sample(ANG.outer, uc), middle: sample(ANG.middle, uc), inner: sample(ANG.inner, uc) };
    // a jam glitches: a stepped, decaying shake and ERR flashes for .32 s
    const jamAt = PATCH_EV[1].at, gk = uc >= jamAt && uc < jamAt + .32 ? 1 - (uc - jamAt) / .32 : 0;
    const step = Math.floor((uc - jamAt) / .064);
    const shake = gk ? [(hash(step * 2 + 1) - .5) * 7 * gk, (hash(step * 2 + 2) - .5) * 7 * gk] : [0, 0];
    // ZERO resets the readouts too, so the loop closes on the labels it opened with
    let hex = hexLabels(uc >= ZERO_AT + .6 ? 0 : Math.floor(uc / HEXW));
    if (gk) hex = hex.map((v, i) => i % 3 === 0 ? 'ERR' : v);
    const manual = uc >= DRAG.t0 && uc < DRAG.t1 + MANUAL_HOLD;
    return { u: uc, ang, vel: sample(VEL, uc), edges, pending, A, shake, hex, manual, zeroing: uc >= ZERO_AT && uc < ZERO_AT + 1.2, finger: fingerAt(uc) };
  },

  finger(u) { return fingerAt(u); },

  apply(h, p, D) {
    D = D || {};
    const one = k => (k === undefined ? 1 : k);
    const jam = p.A.jam.size > 0;
    // dial groups shake together on a jam
    for (const id in h.dg) h.dg[id].setAttribute('transform', `translate(${DC[0] + p.shake[0]} ${DC[1] + p.shake[1]}) scale(${S})`);

    // bezel
    h.bezelArcs.forEach(a => setDraw(a, one(D.bezel)));
    h.aim.forEach(a => setDraw(a, one(D.bezel)));
    h.ticks.forEach((t, i) => t.setAttribute('opacity', D.ticks ? D.ticks[i] : 1));
    h.bezelText.setAttribute('opacity', one(D.text));
    h.markers.forEach(m => m.setAttribute('opacity', one(D.text)));
    const sector = Math.floor(wrap(p.ang.outer - 15) / 30);
    h.dataNodes.forEach((n, i) => { n.setAttribute('class', i === sector && !jam ? 'icondot ink' : 'disc mid'); n.setAttribute('opacity', one(D.text)); });
    const lit = p.manual ? 0 : 10;                   // |10°/s| of 30 → a third of the arc; dark while held by hand
    h.data.forEach((s2, i) => {
      s2.setAttribute('class', i < (jam ? 30 : lit) ? (jam ? 'err' : 'ink') : 'minor');
      s2.setAttribute('stroke-dasharray', jam ? '' : '1 1');   // a jam fills the whole arc; drawable otherwise
      if (jam) s2.setAttribute('opacity', D.data ? D.data[i] : 1); else { s2.removeAttribute('opacity'); setDraw(s2, D.data ? D.data[i] : 1); }
    });

    // halo: morphs on the loop clock; sways with the outer ring (periodic in its angle)
    setDraw(h.haloSweep, one(D.halo));
    h.halo.setAttribute('transform', `rotate(${18 * Math.sin(rad(p.ang.outer))})`);
    const haloOn = (D.halo ?? 1) > 0, key = p.t == null ? 'still' : p.t.toFixed(4);
    if (haloOn && key !== h.haloKey) { haloAt(p.t, p.T).forEach((d, i) => h.haloPaths[i].forEach(pa => pa.setAttribute('d', d))); h.haloKey = key; }

    // outer ring
    h.outerRot.setAttribute('transform', `rotate(${p.ang.outer})`);
    h.outerDash.forEach((d, i) => setDraw(d, D.outer ? D.outer[i] : 1));
    h.pods.forEach(g => g.setAttribute('opacity', D.outer ? D.outer[0] : 1));
    const speed = Math.min(1, Math.abs(p.vel) / 30), dir = p.vel >= 0 ? -1 : 1;
    h.trail.forEach((t, i) => {
      const a0 = p.ang.outer + dir * (5 + i * 12), a1 = a0 + dir * 10 * (.3 + speed);
      t.setAttribute('d', arcD(R.outer + 11, Math.min(a0, a1), Math.max(a0, a1)));
      t.setAttribute('opacity', jam ? 0 : (.75 - i * .22) * (.2 + .8 * speed) * one(D.text));
    });
    h.podText.forEach((t, k) => {
      const a = p.ang.outer + k * 90, [x, y] = pol(R.outer - 24, a);
      t.setAttribute('x', x.toFixed(2)); t.setAttribute('y', (y + 4).toFixed(2));
      t.textContent = jam && k === 0 ? 'JAM' : String(Math.round(wrap(a))).padStart(3, '0') + '°';
      t.setAttribute('class', jam && k === 0 ? 'errf' : k ? 'dim' : '');
      t.setAttribute('opacity', one(D.text));
    });

    // middle ring + hex labels (upright, placed by angle)
    h.midRot.setAttribute('transform', `rotate(${p.ang.middle})`);
    setDraw(h.midRing, one(D.middle));
    h.midSq.forEach(r => r.setAttribute('opacity', one(D.middle)));
    h.hex.forEach((t, k) => {
      const a = p.ang.middle + k * 45 + 22.5, [x, y] = pol(R.middle - 19, a);
      t.setAttribute('x', x.toFixed(2)); t.setAttribute('y', (y + 3.5).toFixed(2));
      t.textContent = p.hex[k];
      t.setAttribute('class', p.hex[k] === 'ERR' ? 'errf' : 'dim');
      t.setAttribute('opacity', one(D.text));
    });

    // inner ring + core
    h.innerRot.setAttribute('transform', `rotate(${p.ang.inner})`);
    setDraw(h.innerRing, one(D.inner));
    [...h.innerBars, ...h.innerTicks].forEach(b => b.setAttribute('opacity', one(D.inner)));
    h.cross.forEach(c => setDraw(c, one(D.inner)));
    const blink = p.t == null ? 1 : (Math.floor(p.t / .5) % 2 ? .25 : 1);
    [[!p.manual && !p.zeroing && !jam, 'ink'], [false, 'acc'], [jam, 'err']].forEach(([on, c], i) => {
      const cp = h.caps[i];
      cp.r.setAttribute('class', on ? (c === 'ink' ? 'icondot ink' : c === 'acc' ? 'accf acc' : 'errf err') : 'disc mid');
      // text on a filled capsule takes the background colour
      cp.tx.setAttribute('class', on ? '' : 'dim');
      if (on) cp.tx.setAttribute('style', `fill:${h.bg}`); else cp.tx.removeAttribute('style');
      cp.g.setAttribute('opacity', one(D.caps) * (on && c === 'err' ? blink : 1));
    });

    // rack
    const fedIns = new Set(p.edges.map(e => e[1])), usedOuts = new Set(p.edges.map(e => e[0]));
    h.mods.forEach((md, i) => {
      const id = md.m.id, mj = p.A.jam.has(id);
      setDraw(md.frame, D.mods ? D.mods[i] : 1);
      md.frame.setAttribute('class', `disc ${mj ? 'err' : 'minor'}`);
      md.tg.setAttribute('opacity', D.modText ? D.modText[i] : 1);
      md.sub.textContent = id === 'sweep' ? (p.zeroing ? 'PARKED · ZERO' : p.manual ? 'MANUAL · HOLD 2S' : 'DRIVE · AUTO SCAN')
        : id === 'field' ? (p.A.inOf.field ? 'HALO · DRIVEN' : 'HALO · STILL')
        : mj ? 'JAMMED · LOOP' : !p.A.inOf[id] ? 'FREE · NO DRIVE' : 'GEAR · DRIVEN';
      md.sub.setAttribute('class', mj ? 'errf' : 'dim');
      const vis = D.mods ? D.mods[i] : 1;
      if (md.jacks.in) {
        const armed = !!p.pending && p.pending !== id;
        md.jacks.in.setAttribute('class', `${fedIns.has(id) ? 'icondot' : 'disc'} ${armed ? 'acc' : 'ink'}`);
        md.jacks.in.setAttribute('opacity', vis);
      }
      if (md.jacks.out) {
        const pend = p.pending === id;
        md.jacks.out.setAttribute('class', `${pend ? 'accf acc' : usedOuts.has(id) ? 'icondot ink' : 'disc ink'}`);
        md.jacks.out.setAttribute('opacity', vis);
      }
    });
    // cords: keyed by edge; an illegal cord is red and dashed (so it still reads in monochrome)
    const keep = new Set();
    p.edges.forEach(([a, b]) => {
      const key = a + '>' + b; keep.add(key);
      let c = h.cords.get(key);
      if (!c) { c = drawable(el('path', { 'stroke-width': 1 }, h.cordG)); h.cords.set(key, c); }
      const ill = p.A.illegal.has(key);
      c.setAttribute('d', cordD(jack(a, 'out'), jack(b, 'in')));
      c.setAttribute('class', ill ? 'err' : b === 'field' ? 'mid' : 'ink');
      c.setAttribute('stroke-width', ill ? 2.2 : 1.4);
      const k = one(D.cords);
      if (ill || b === 'field') {       // dashed cords can't use the draw-on dash; fade them instead
        c.removeAttribute('pathLength');
        c.setAttribute('stroke-dasharray', ill ? '5 4' : '3 3');
        c.setAttribute('stroke-dashoffset', 0);
        c.setAttribute('opacity', k);
        c.setAttribute('visibility', k > .001 ? 'visible' : 'hidden');
      } else { c.setAttribute('pathLength', 1); c.setAttribute('stroke-dasharray', '1 1'); c.removeAttribute('opacity'); setDraw(c, k); }
    });
    for (const [key, c] of h.cords) if (!keep.has(key)) c.setAttribute('visibility', 'hidden');
    // ghost cord from the armed OUT to the finger
    if (p.pending) {
      const [x1, y1] = jack(p.pending, 'out'), f = p.finger;
      h.ghost.setAttribute('d', `M${x1} ${y1} C${x1 + 24} ${y1} ${f.x + 24} ${f.y} ${f.x} ${f.y}`);
      h.ghost.setAttribute('visibility', 'visible');
    } else h.ghost.setAttribute('visibility', 'hidden');
    h.btns.forEach(b => { setDraw(b.r, one(D.btns)); b.t.setAttribute('opacity', one(D.btns)); });
  },
});
})();
