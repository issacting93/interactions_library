/* ─────────────────────────────────────────────────────────────
   PIECE · COMPASS
   components/interaction/cyberpunk-dial — rebranded and redrawn as
   layered SVG from the source's 400-unit geometry, scaled ×1.6 so
   the r180 bezel lands inside a polar TERRAIN underlay (r360): a
   seeded fBm heightmap contoured with marching squares, drawn once
   at build time under everything else — the compass floats on a
   topo map, per the vintage polar contour reference. The cardinals
   become rose needles instead of letters.
   One angle drives four geared rings: outer ×1, middle ×−1.5,
   inner ×0.7, cardinal ×−0.3. It auto-sweeps at 10°/s; dragging
   overrides it; tapping the core locks it (lock ring, LOCK codes).
   Patch language kept from the dial redesign: READOUT strip, bezel
   port jacks, centre 270° knob, LED cluster, focus rings and pod
   corner brackets on lock. After the unlock tap the sweep resumes,
   then every ring springs home to its start angle (ZERO), so the
   last pose is the first and EXPLODED loops without a seam.
   STORY drives it from its controls instead (SWEEP RATE, MIDDLE
   RATIO, LOCK): each ring's angle is the integral of its ratio ×
   the sweep speed, so turning a knob never makes a ring jump. LOCK
   brakes the train in ~.1 s, shakes the dial and springs the lock
   ring, focus rings and LOCK codes in; unlocking folds them out and
   the rings spin back up from where they stopped. The reel locks,
   unlocks, then speeds the sweep and reverses the middle ring.
   Everything here is a pure function of u: no accumulated state,
   hex telemetry and glitches are seeded by time.
   ───────────────────────────────────────────────────────────── */
(() => {

const K = 1.6;                                   // source units → piece units
const RAD = d => d * Math.PI / 180;
const pol = (deg, r) => [Math.cos(RAD(deg)) * r * K, Math.sin(RAD(deg)) * r * K];
// clockwise arc (screen) from a0° to a1°, math angles, radius in source units
function arc(r, a0, a1) {
  const [sx, sy] = pol(a0, r), [ex, ey] = pol(a1, r);
  const sweep = ((a1 - a0) % 360 + 360) % 360;
  return `M${sx.toFixed(2)} ${sy.toFixed(2)} A${r * K} ${r * K} 0 ${sweep > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}
const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const hex4 = v => '0x' + Math.floor(v * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
const NODE_ON = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0];     // which of the 12 ports are lit
const SECTOR = ['S00', 'S03', 'S06', 'S09'];               // cardinal port codes (N E S W)

// the pasted chevron mark: three nested arrow shells, 38×40, natural heading = pointing +x
const CHEVRON_PATHS = [
  'M32.83 24.7124C36.3165 22.3705 36.3165 17.2328 32.83 14.891L10.9544 0.197458C12.5357 -0.222119 14.307 0.00430798 15.8468 1.09532L35.3045 14.882C38.6293 17.2378 38.6293 22.1802 35.3045 24.536L15.8468 38.3227C14.3722 39.3675 12.6852 39.6194 11.1562 39.2704L32.83 24.7124ZM28.7647 24.536C32.0896 22.1802 32.0896 17.2378 28.7647 14.882L9.30701 1.09532C5.39903 -1.67366 6.6951e-06 1.1265 5.85657e-06 5.92233L1.0355e-06 33.4957C1.96966e-07 38.2915 5.39902 41.0917 9.30701 38.3227L28.7647 24.536ZM23.6656 24.6932C27.1288 22.349 27.1288 17.2396 23.6656 14.8954L10.6687 6.09804C6.75014 3.44563 1.4655 6.25866 1.4655 10.9969L1.46549 28.5916C1.46549 33.3299 6.75013 36.1429 10.6687 33.4905L23.6656 24.6932ZM11.8006 23.6479C13.9731 23.6479 15.7342 21.8834 15.7342 19.7066C15.7342 17.5299 13.9731 15.7653 11.8006 15.7653C9.62821 15.7653 7.8671 17.5299 7.8671 19.7066C7.8671 21.8834 9.62821 23.6479 11.8006 23.6479Z',
  'M36.625 23.2547C38.2796 21.0485 38.1839 17.9084 36.338 15.8103C36.0393 15.4708 35.6948 15.1586 35.3045 14.882L15.8468 1.09532C15.6834 0.979579 15.5175 0.873564 15.3494 0.77702C14.056 0.0340399 12.6382 -0.14809 11.3252 0.111672C11.2006 0.136322 11.0769 0.164951 10.9544 0.197458L32.83 14.891C33.4221 15.2887 33.9137 15.767 34.3047 16.2986C34.4644 16.5158 34.6074 16.7419 34.7336 16.975C35.609 18.5923 35.6764 20.5475 34.9358 22.2168C34.7822 22.5631 34.5939 22.897 34.3707 23.213C33.9696 23.7814 33.456 24.2919 32.83 24.7124L11.1562 39.2704C11.2123 39.2832 11.2686 39.2952 11.3252 39.3063C12.8088 39.5999 14.4263 39.3292 15.8468 38.3227L35.3045 24.536C35.8267 24.166 36.2668 23.7322 36.625 23.2547ZM9.30701 1.09532C8.70743 0.670489 8.07275 0.37675 7.42785 0.2012C3.86942 -0.76745 6.56645e-06 1.8623 5.85657e-06 5.92233L1.0355e-06 33.4957C2.89827e-07 37.7604 4.26944 40.447 7.96317 39.0426C8.42316 38.8677 8.87423 38.6293 9.30701 38.3227L28.7647 24.536C32.0896 22.1802 32.0896 17.2378 28.7647 14.882L9.30701 1.09532ZM2.0747 34.4319C2.69224 37.0357 5.83244 38.371 8.17144 36.7137L8.63399 36.3859C6.23893 36.7804 3.82088 36.0057 2.0747 34.4319ZM27.5713 22.968L27.6291 22.927C29.8457 21.3565 29.8457 18.0615 27.6291 16.491L27.4559 16.3683C28.4477 18.4389 28.4862 20.8695 27.5713 22.968ZM8.961 3.26376L8.17145 2.70433C5.77027 1.00298 2.52473 2.45537 2.03087 5.19643C3.85929 3.5236 6.44047 2.73505 8.961 3.26376ZM1.96678 8.5855C1.64666 9.30833 1.4655 10.1196 1.4655 10.9969L1.46549 28.5916C1.46549 29.4689 1.64666 30.2802 1.96678 31.003C3.37559 34.1842 7.47567 35.6518 10.6687 33.4905L23.6656 24.6932C27.1288 22.349 27.1288 17.2396 23.6656 14.8954L10.6687 6.09804C7.47567 3.93673 3.3756 5.40434 1.96678 8.5855ZM11.8006 21.6773C12.8869 21.6773 13.7674 20.795 13.7674 19.7066C13.7674 18.6183 12.8869 17.736 11.8006 17.736C10.7144 17.736 9.83388 18.6183 9.83388 19.7066C9.83388 20.795 10.7144 21.6773 11.8006 21.6773ZM15.7342 19.7066C15.7342 21.8834 13.9731 23.6479 11.8006 23.6479C9.62821 23.6479 7.8671 21.8834 7.8671 19.7066C7.8671 17.5299 9.62821 15.7653 11.8006 15.7653C13.9731 15.7653 15.7342 17.5299 15.7342 19.7066Z',
];
// deterministic 0/1 string for the binary ring — same hash() the hex telemetry already uses
function binaryDigits(n, k) {
  let s = '';
  for (let i = 0; i < n; i++) s += hash(i, k) < .5 ? '0' : '1';
  return s;
}
// heading mark: spring-snaps between six stops on a fixed cadence, forever — a pure, periodic
// function of u (same springStep() the ZERO homing and the rest of the stage use), so it loops
// cleanly in STORY/ASSEMBLY/EXPLODED alike without any scripted event list
const HEADINGS = [-38, 54, 146, 238, -118, 30];
const HEAD_HOLD = 2.3, HEAD_K = 46, HEAD_C = 9;
function headingAngle(u) {
  u = Math.max(0, u);
  const cycle = HEAD_HOLD * HEADINGS.length;
  const within = u - Math.floor(u / cycle) * cycle;
  const i = Math.floor(within / HEAD_HOLD) % HEADINGS.length;
  const prev = (i - 1 + HEADINGS.length) % HEADINGS.length;
  const from = HEADINGS[prev], to = HEADINGS[i], local = within - i * HEAD_HOLD;
  const d = ((to - from + 180) % 360 + 360) % 360 - 180;
  return from + d * springStep(local, HEAD_K, HEAD_C);
}

/* ── the polar terrain (bottom layer): a seeded fBm heightmap contoured with marching
   squares, generated once at module load — static, deterministic, cheap to re-draw. ── */
const TR = { R: 360, SEED: 1337, GRID: 160, LEVELS: 7, NOISE_SCALE: .042 };
const _mulberry = a => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const _tnoise = (() => {
  const rand = _mulberry(TR.SEED), p = new Uint8Array(512), perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return x - y;
      case 2: return -x + y; case 3: return -x - y;
      case 4: return x; case 5: return -x;
      case 6: return y; default: return -y;
    }
  };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), X = xi & 255, Y = yi & 255;
    const xf = x - xi, yf = y - yi, u = fade(xf), v = fade(yf);
    const aa = p[p[X] + Y], ba = p[p[X + 1] + Y], ab = p[p[X] + Y + 1], bb = p[p[X + 1] + Y + 1];
    return (grad(aa, xf, yf) * (1 - u) + grad(ba, xf - 1, yf) * u) * (1 - v)
         + (grad(ab, xf, yf - 1) * (1 - u) + grad(bb, xf - 1, yf - 1) * u) * v;
  };
  return (x, y) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < 5; i++) { sum += amp * noise(x * freq, y * freq); norm += amp; amp *= .5; freq *= 2; }
    return sum / norm;
  };
})();
function terrainPaths() {
  const { GRID, LEVELS, NOISE_SCALE } = TR, hs = new Float32Array(GRID * GRID);
  let mn = Infinity, mx = -Infinity;
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const e = _tnoise(x * NOISE_SCALE, y * NOISE_SCALE);
    hs[y * GRID + x] = e;
    const nx = (x / GRID - .5) * 2, ny = (y / GRID - .5) * 2;
    if (nx * nx + ny * ny <= 1) { if (e < mn) mn = e; if (e > mx) mx = e; }
  }
  const rg = (mx - mn) || 1;
  for (let i = 0; i < hs.length; i++) hs[i] = (hs[i] - mn) / rg;
  const out = [];
  for (let lv = 1; lv < LEVELS; lv++) {
    const iso = lv / LEVELS, segs = [];
    for (let y = 0; y < GRID - 1; y++) for (let x = 0; x < GRID - 1; x++) {
      const v1 = hs[y * GRID + x], v2 = hs[y * GRID + x + 1], v3 = hs[(y + 1) * GRID + x + 1], v4 = hs[(y + 1) * GRID + x];
      let c = 0;
      if (v1 > iso) c |= 1; if (v2 > iso) c |= 2; if (v3 > iso) c |= 4; if (v4 > iso) c |= 8;
      if (!c || c === 15) continue;
      const P1 = [x, y], P2 = [x + 1, y], P3 = [x + 1, y + 1], P4 = [x, y + 1];
      const ip = (a, b, va, vb) => { const t = Math.abs(va - vb) < 1e-6 ? 0 : (iso - va) / (vb - va); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
      const top = ip(P1, P2, v1, v2), right = ip(P2, P3, v2, v3), bottom = ip(P3, P4, v3, v4), left = ip(P4, P1, v4, v1);
      if (c === 1 || c === 14) segs.push([left, top]);
      else if (c === 2 || c === 13) segs.push([top, right]);
      else if (c === 3 || c === 12) segs.push([left, right]);
      else if (c === 4 || c === 11) segs.push([right, bottom]);
      else if (c === 5) segs.push([left, top], [right, bottom]);
      else if (c === 6 || c === 9) segs.push([top, bottom]);
      else if (c === 7 || c === 8) segs.push([bottom, left]);
      else segs.push([top, right], [bottom, left]);
    }
    const d = segs.map(([a, b]) =>
      `M${(a[0] / GRID * 2 - 1) * TR.R} ${(a[1] / GRID * 2 - 1) * TR.R}L${(b[0] / GRID * 2 - 1) * TR.R} ${(b[1] / GRID * 2 - 1) * TR.R}`).join('');
    out.push(d);
  }
  return out;
}
const TERRAIN_LINES = terrainPaths();

// ── the script ──
const A0 = 18;                    // angle at u = 0
const SPEED = 10;                 // °/s auto-sweep (0.010 °/ms)
const DRAG = { at: 0.6, end: 1.8, sweep: 110, startDeg: -35 };   // finger grabs the outer ring at −35°
const LOCK = 2.3, UNLOCK = 3.4, RESUME = UNLOCK + .5;             // source: manual = false 500 ms after unlock
const ZERO = 4.0, END = 5.2;      // ZERO: every ring springs home to A0; settled (and pings spent) by END
const RATIO = { outer: 1, middle: -1.5, inner: .7, card: -.3 };
const BRAKE = .12, SPIN_UP = .25; // s, LOCK's braking / UNLOCK's spin-up time constants (STORY)
// STORY: the LOCK toggle's flips up to u, as [{t, on, rate, middle}] with the control values at each flip.
// integ walks the controls in time order, so one pass with a counting integrand finds them (to 1/120 s).
function lockEvents(ctl, u) {
  const ev = []; let n = 0, prev = 0;
  ctl.integ(q => {
    const on = q.lock >= .5 ? 1 : 0;
    if (on !== prev) { ev.push({ k: n, on, rate: q.rate, middle: q.middle }); prev = on; }
    n++; return 0;
  });
  ev.forEach(x => { x.t = x.k / Math.max(1, n) * u; });
  return ev;
}
const GLITCHES = [{ at: 0.25, target: 3 }];
const SHAKE = [[3, -1], [-2, 2], [1, -1], [0, 0]];               // translate keyframes, steps(4)

function angle(u) {
  const a1 = A0 + SPEED * DRAG.at;
  if (u < DRAG.at) return A0 + SPEED * u;
  if (u < DRAG.end) return a1 + DRAG.sweep * io(win(u, DRAG.at, DRAG.end));
  const a2 = a1 + DRAG.sweep;
  if (u < RESUME) return a2;                       // manual hold, then locked
  if (u < ZERO) return a2 + SPEED * (u - RESUME);
  const aZ = a2 + SPEED * (ZERO - RESUME);
  return lerp(aZ, A0, springStep(u - ZERO, 120, 16));   // ZERO: home to the start angle, barely overshooting
}
const locked = u => u >= LOCK && u < UNLOCK;
// the 270° knob position for a ring angle: −135° (bottom-left) → +135° (bottom-right)
const knobDeg = ra => -135 + ((ra % 360) + 360) % 360 / 360 * 270;

registerPiece({
  id: 'compass',
  code: 'CMP-04', series: 'B', n: '04',
  name: 'COMPASS',
  mechanic: 'POLAR TERRAIN COMPASS',
  source: 'COMPONENTS/INTERACTION/CYBERPUNK-DIAL',
  hero: { v: '4', u: 'GEARED RINGS · POLAR TERRAIN' },
  extent: 360,
  spec: [
    ['INPUT',  'DRAG TO TURN · TAP CORE TO LOCK'],
    ['STATE',  '1 ANGLE · FREE / LOCKED'],
    ['MOTION', '10°/S SWEEP · ×1 −1.5 .7 −.3'],
    ['BUILT',  'SVG · fBm TERRAIN · ANIME.JS 4'],
  ],
  layers: [
    { id: 'terrain', name: 'TERRAIN',      note: 'POLAR CONTOUR · fBm', edge: TR.R },
    { id: 'bezel',   name: 'BEZEL',        note: '72 TICKS · 12 PORTS', edge: 180 * K },
    { id: 'outer',   name: 'OUTER RING',   note: '×1.0 · SWEEP + READOUT', edge: 160 * K },
    { id: 'middle',  name: 'MIDDLE RING',  note: 'HEX ×−1.5 · ROSE ×−.3', edge: 120 * K },
    { id: 'core',    name: 'CORE',         note: 'KNOB ×0.7 · LOCK RING', edge: 80 * K },
    { id: 'readout', name: 'READOUT',      note: '4 × AZ · LED',          edge: 304 },
    { id: 'input',   name: 'INPUT',        note: 'DRAG · TAP TO LOCK',    edge: 300 },
  ],
  callouts: [
    { at: pol(-55, 180),  title: 'BEZEL PORTS',    note: '12 JACKS · SC AT NESW' },
    { at: pol(-22, 150),  title: 'OUTER RING ×1.0', note: 'DRIVES THE SWEEP' },
    { at: pol(-80, 156),  title: 'HEADING MARK',   note: 'SPRING-SNAPS · 6 STOPS' },
    { at: pol(8, 120),    title: 'MIDDLE ×−1.5',   note: 'HEX TELEMETRY · BINARY RING' },
    { at: pol(38, 80),    title: 'CENTRE KNOB',    note: '270° VALUE ARC = SWEEP' },
    { at: pol(68, 55),    title: 'LOCK RING',      note: 'TAP CORE TO LOCK' },
    { at: [64, 300],      title: 'READOUT STRIP',  note: '4 × AZ · LED' },
    { at: [250, 250],     title: 'TERRAIN',        note: 'POLAR CONTOUR · SEED 1337' },
  ],
  specU: 2.9,

  // STORY: the source's sweep speed (0.010 °/ms), the middle gear ratio, and the core's lock tap
  controls: [
    { id: 'rate',   label: 'SWEEP RATE',   kind: 'knob',   min: -30, max: 30, value: SPEED,        fmt: v => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}°/S` },
    { id: 'middle', label: 'MIDDLE RATIO', kind: 'knob',   min: -2,  max: 2,  value: RATIO.middle, fmt: v => `×${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}` },
    { id: 'lock',   label: 'LOCK',         kind: 'toggle', min: 0,   max: 1,  value: 0,            fmt: v => v >= .5 ? 'LOCKED' : 'FREE' },
  ],
  story: {
    tweaks: [
      { id: 'lock',   to: 1 },      // the train brakes, the dial shakes, lock + focus rings spring in
      { id: 'lock',   to: 0 },      // the lock ring folds out, telemetry reshuffles, the rings spin back up
      { id: 'rate',   to: 26 },     // the sweep speeds up; ports ping in quick succession
      { id: 'middle', to: 1.2 },    // the hex ring reverses and runs with the outer ring
    ],
  },
  exploded: { live: 4.4, poseEnd: END },   // the ZERO spring settles while the stack closes

  assembly: {
    seeds: [[0, 0], ...Array.from({ length: 12 }, (_, i) => [Math.sin(RAD(i * 30)) * 180 * K, -Math.cos(RAD(i * 30)) * 180 * K])],
    live: 2.8,
    end: 3.0,
    draw: t => ({ t }),
  },

  build(L, sw) {
    const h = { reg: [], roots: [] };
    // reg: an element that draws on (kind 'draw') or fades on ('op') over [a,b], off over [c,d]
    const reg = (n, kind, a, b, c, d, base = 1) => { h.reg.push({ n, kind, a, b, c, d, base }); return n; };
    const root = id => { const g = el('g', {}, L[id]); h.roots.push(g); return g; };
    const W = { main: sw.main, minor: sw.minor, fine: sw.minor * .7 };

    // ── TERRAIN (bottom layer): the polar contour map — grid, rim, contours, H/L, scale bar ──
    const tr = root('terrain');
    const trDefs = el('defs', {}, L.terrain);
    el('clipPath', { id: 'cmp-terrain-clip' }, trDefs).appendChild(el('circle', { r: TR.R }));
    const trG = reg(el('g', { 'clip-path': 'url(#cmp-terrain-clip)' }, tr), 'op', .8, 1.6, 6.6, 7.3);
    const gridG = el('g', {}, trG);
    // uneven radii, not i/5 — reads as a hand-set graticule instead of a mechanical ladder
    [.21, .37, .58, .83].forEach(k =>
      el('circle', { r: TR.R * k, fill: 'none', class: 'minor', 'stroke-width': W.fine, opacity: .3 }, gridG));
    for (let i = 0; i < 12; i++) {
      const a = RAD(i * 30);
      el('line', { x1: 0, y1: 0, x2: Math.cos(a) * TR.R, y2: Math.sin(a) * TR.R, class: 'minor', 'stroke-width': W.fine, opacity: .3 }, gridG);
    }
    TERRAIN_LINES.forEach(d => {
      el('path', { d, fill: 'none', class: 'mid', 'stroke-width': W.fine, opacity: .3 }, trG);
    });
    // rim: hairline circle, cardinal crosshairs + degree labels (the reference's rim marks)
    el('circle', { r: TR.R, fill: 'none', class: 'minor', 'stroke-width': W.minor, opacity: .3 }, trG);
    [0, 90, 180, 270].forEach(deg => {
      const [x1, y1] = pol(deg, TR.R), [x2, y2] = pol(deg, TR.R + 10);
      el('line', { x1, y1, x2, y2, class: 'mid', 'stroke-width': W.minor }, trG);
      const [lx, ly] = pol(deg, TR.R - 14);
      const t = el('text', { x: lx, y: ly, 'font-size': 7, 'letter-spacing': 1.2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'dim' }, trG);
      t.textContent = deg + '°';
    });
    // H / L pressure markers + a scale bar (kept sparse, per the reference)
    [[-235, -235, 'H', '10'], [235, 235, 'L', '2']].forEach(([x, y, s, v]) => {
      const t = el('text', { x, y, 'font-size': 12, 'font-weight': 500, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'disp dim' }, trG);
      t.textContent = s;
      const vt = el('text', { x: x + 14, y: y + 8, 'font-size': 6, class: 'dim' }, trG);
      vt.textContent = v;
    });
    el('line', { x1: -50, y1: 348, x2: 30, y2: 348, class: 'minor', 'stroke-width': W.minor }, trG);
    el('text', { x: -40, y: 357, 'font-size': 6, 'letter-spacing': 1, class: 'dim' }, trG).textContent = '500 MI';

    // ── BEZEL: r180 ring, 72 ticks, 12 port jacks, LED cluster, gear micro label ──
    const bz = root('bezel');
    reg(drawable(el('circle', { r: 180 * K, fill: 'none', class: 'ink', 'stroke-width': W.main }, bz)), 'draw', .7, 1.6, 6.6, 7.3);
    for (let i = 0; i < 72; i++) {
      const a = RAD(i * 5), large = i % 6 === 0, r2 = large ? 168 : 173;
      const n = el('line', {
        x1: Math.sin(a) * 180 * K, y1: -Math.cos(a) * 180 * K, x2: Math.sin(a) * r2 * K, y2: -Math.cos(a) * r2 * K,
        class: large ? 'ink' : 'mid', 'stroke-width': large ? W.main : W.fine,
      }, bz);
      const a0 = .9 + stag(i, 72, 1 / 72), b0 = 6.0 + stag(71 - i, 72, .9 / 72);
      reg(n, 'op', a0, a0 + .1, b0, b0 + .1);
    }
    // 12 port jacks: round, square SC-style at the cardinals; a sector code at N E S W
    h.ports = Array.from({ length: 12 }, (_, i) => {
      const a = RAD(i * 30), cardinal = i % 3 === 0;
      const g = el('g', {}, bz);
      const [x, y] = [Math.sin(a) * 180 * K, -Math.cos(a) * 180 * K];
      const ring = cardinal
        ? el('rect', { x: x - 5.2 * K, y: y - 5.2 * K, width: 10.4 * K, height: 10.4 * K, rx: 1.2 * K, fill: 'none', 'stroke-width': W.fine }, g)
        : el('circle', { cx: x, cy: y, r: 5.2 * K, fill: 'none', 'stroke-width': W.fine }, g);
      const dot = el('circle', { cx: x, cy: y, r: 2.2 * K }, g);
      if (cardinal) {
        const [lx, ly] = pol(i * 30, 163);
        const t = el('text', { x: lx, y: ly, 'font-size': 6.5 * K, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'letter-spacing': 1.2, class: 'dim' }, g);
        t.textContent = SECTOR[i / 3];
      }
      reg(g, 'op', 1.0 + stag(i, 12, .06), 1.3 + stag(i, 12, .06), 6.2 + stag(i, 12, .04), 6.5 + stag(i, 12, .04));
      return { ring, dot, x, y };
    });
    // LED cluster: SWP · LCK · ERR, a row left of the readout strip (Patch inspector look)
    h.leds = ['SWP', 'LCK', 'ERR'].map((name, i) => {
      const x = -196 + i * 20;
      const g = el('g', {}, bz);
      const dot = el('circle', { cx: x, cy: 300, r: 3.5 * K, fill: 'none', 'stroke-width': W.fine }, g);
      const t = el('text', { x, y: 289, 'font-size': 7, 'letter-spacing': 1.2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
      t.textContent = name;
      reg(g, 'op', 2.0 + stag(i, 3, .06), 2.4 + stag(i, 3, .06), 6.0, 6.4);
      return { dot, t };
    });
    reg(txt(bz, 0, -298, 'AUTO SWEEP 10°/S · GEAR ×1 −1.5 .7 −.3', { 'font-size': 7, 'letter-spacing': 1.4, 'text-anchor': 'middle', class: 'dim' }), 'op', 2.3, 2.7, 5.8, 6.2);

    // ── OUTER: ×1.0 · dashed r150, 4 pods with corner brackets, static sweep trail + indicator A ──
    const ou = root('outer');
    h.trail = [[10, .18], [7, .10], [4, .05]].map(([w, o]) =>
      reg(el('path', { fill: 'none', class: 'acc', 'stroke-width': w * K, 'stroke-linecap': 'round' }, ou), 'op', 2.2, 2.6, 6.0, 6.3, o));
    h.outerG = el('g', {}, ou);
    // 20/5 dashes on r150 → 38 arcs that sweep on one by one
    const C150 = 2 * Math.PI * 150, nD = Math.round(C150 / 25), step = 360 / nD, dash = step * 20 / 25;
    for (let i = 0; i < nD; i++) {
      const p = el('path', { d: arc(150, i * step, i * step + dash), fill: 'none', class: 'ink', 'stroke-width': W.main * 1.4 }, h.outerG);
      drawable(p);
      const a0 = 1.0 + stag(i, nD, 1 / nD), b0 = 6.1 + stag(nD - 1 - i, nD, .8 / nD);
      reg(p, 'draw', a0, a0 + .12, b0, b0 + .12);
    }
    [45, 135, 225, 315].forEach((deg, i) => {
      const [x, y] = pol(deg, 150);
      const g = el('g', {}, h.outerG);
      el('circle', { cx: x, cy: y, r: 10 * K, class: 'disc ink', 'stroke-width': W.main }, g);
      el('circle', { cx: x, cy: y, r: 4 * K, class: 'accf' }, g);
      reg(g, 'op', 1.6 + stag(i, 4, .1), 1.9 + stag(i, 4, .1), 6.0, 6.4);
    });
    // corner brackets around each pod (radial-goo-bloom), lit while locked
    h.bracketG = reg(el('g', {}, h.outerG), 'op', 2.4, 2.8, 6.0, 6.4);
    h.brackets = [45, 135, 225, 315].map(deg => {
      const [x, y] = pol(deg, 150), br = 15 * K, bc = 6 * K;
      const corners = [
        `M ${x - br} ${y - br + bc} L ${x - br} ${y - br} L ${x - br + bc} ${y - br}`,
        `M ${x + br - bc} ${y - br} L ${x + br} ${y - br} L ${x + br} ${y - br + bc}`,
        `M ${x + br} ${y + br - bc} L ${x + br} ${y + br} L ${x + br - bc} ${y + br}`,
        `M ${x - br + bc} ${y + br} L ${x - br} ${y + br} L ${x - br} ${y + br - bc}`,
      ];
      return corners.map(d => el('path', { d, fill: 'none', 'stroke-width': W.main * .8, 'stroke-linecap': 'square' }, h.bracketG));
    });
    h.indA = reg(drawable(el('line', { x1: 0, y1: 0, class: 'acc', 'stroke-width': W.main, opacity: .6 }, ou)), 'draw', 2.0, 2.6, 6.0, 6.5);

    // heading mark: the pasted chevron, riding its own spring-driven angle at r156 (between the
    // outer sweep ring and the bezel) — independent of the ×1 sweep, see headingAngle()
    h.headingG = reg(el('g', {}, ou), 'op', 2.0, 2.5, 6.0, 6.5);
    const headShell = el('g', { transform: 'translate(-19 -20)' }, h.headingG);
    CHEVRON_PATHS.forEach((d, i) => el('path', { d, class: i === 0 ? 'accf' : 'ink', opacity: i === 0 ? 1 : .35 }, headShell));

    // ── MIDDLE: ×−1.5 · r120, 4 square targets, 8 hex labels; cardinal ×−0.3 at r105 ──
    const mi = root('middle');
    h.midG = el('g', {}, mi);
    reg(drawable(el('circle', { r: 120 * K, fill: 'none', class: 'mid', 'stroke-width': W.minor, opacity: .6 }, h.midG)), 'draw', 1.2, 2.0, 6.3, 7.0);
    [0, 90, 180, 270].forEach((deg, i) => {
      const [x, y] = pol(deg, 120);
      const g = el('g', { transform: `translate(${x} ${y})` }, h.midG);
      reg(drawable(el('rect', { x: -12 * K, y: -12 * K, width: 24 * K, height: 24 * K, class: 'disc ink', 'stroke-width': W.minor }, g)), 'draw', 1.6 + stag(i, 4, .08), 2.1 + stag(i, 4, .08), 6.1, 6.6);
      const inner = el('g', {}, g);
      el('rect', { x: -6 * K, y: -6 * K, width: 12 * K, height: 12 * K, fill: 'none', class: 'mid', 'stroke-width': W.fine, 'stroke-dasharray': `${2 * K} ${1 * K}` }, inner);
      el('circle', { r: 3 * K, class: 'accf' }, inner);
      reg(inner, 'op', 1.9 + stag(i, 4, .08), 2.2 + stag(i, 4, .08), 6.0, 6.4);
    });
    h.hex = [30, 60, 120, 150, 210, 240, 300, 330].map((deg, i) => {
      const [x, y] = pol(deg, 120);
      const g = el('g', { transform: `translate(${x} ${y}) rotate(${deg + 90})` }, h.midG);
      const t = el('text', { x: 0, y: 0, 'font-size': 6.5 * K, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'letter-spacing': '.04em' }, g);
      reg(g, 'op', 2.0 + stag(i, 8, .05), 2.4 + stag(i, 8, .05), 6.0, 6.3);
      return t;
    });
    h.cardG = el('g', {}, mi);
    // the compass rose: four tapered needles at the cardinals, pointing outward (the letters are gone)
    [0, 1, 2, 3].forEach(i => {
      const [x, y] = pol(i * 90, 105);
      const g = el('g', { transform: `translate(${x} ${y}) rotate(${i * 90})` }, h.cardG);
      reg(drawable(el('path', { d: 'M0 -21 L4 -9 L0 -3 L-4 -9 Z', fill: 'none', class: 'ink', 'stroke-width': W.minor, 'stroke-linejoin': 'round' }, g)), 'draw', 1.8 + stag(i, 4, .08), 2.3 + stag(i, 4, .08), 6.1, 6.6);
      const dot = el('circle', { r: 2.2 * K, class: 'accf' }, g);
      reg(dot, 'op', 2.1 + stag(i, 4, .08), 2.4 + stag(i, 4, .08), 6.0, 6.4);
    });

    // binary ring: scrolls past at r142, between the hex ring and the bezel — rides h.midG, so it
    // turns at the same ×−1.5 the hex telemetry does, for free
    const BIN_R = 142;
    const binDefs = el('defs', {}, h.midG);
    el('path', { id: 'cmp-bin-path', d: `M ${-BIN_R * K} 0 A ${BIN_R * K} ${BIN_R * K} 0 1 0 ${BIN_R * K} 0 A ${BIN_R * K} ${BIN_R * K} 0 1 0 ${-BIN_R * K} 0` }, binDefs);
    const binText = reg(el('text', { 'font-size': 6 * K, 'letter-spacing': 1.5, class: 'dim' }, h.midG), 'op', 1.3, 2.1, 6.2, 6.9, .7);
    el('textPath', { href: '#cmp-bin-path' }, binText).textContent = binaryDigits(170, 777);

    // ── CORE: inner ×0.7 (r80), segment bars, lock ring, focus rings, the centre knob ──
    const co = root('core');
    h.innerG = el('g', {}, co);
    reg(drawable(el('circle', { r: 80 * K, fill: 'none', class: 'ink', 'stroke-width': W.minor, opacity: .3 }, h.innerG)), 'draw', 1.4, 2.1, 6.4, 7.1);
    for (let i = 0; i < 8; i++) {
      const [x1, y1] = pol(i * 45, 80), [x2, y2] = pol(i * 45, 70);
      reg(el('line', { x1, y1, x2, y2, class: 'ink', 'stroke-width': W.minor }, h.innerG), 'op', 1.8 + stag(i, 8, .04), 2.0 + stag(i, 8, .04), 6.2, 6.6, .7);
    }
    h.segG = el('g', {}, h.innerG);
    const nS = Math.round(2 * Math.PI * 60 / 12);
    for (let i = 0; i < nS; i++) {
      const [x1, y1] = pol(i * 360 / nS, 52.5), [x2, y2] = pol(i * 360 / nS, 67.5);
      const a0 = 1.9 + stag(i, nS, .6 / nS), b0 = 6.0 + stag(nS - 1 - i, nS, .5 / nS);
      reg(el('line', { x1, y1, x2, y2, class: 'acc', 'stroke-width': W.minor }, h.segG), 'op', a0, a0 + .08, b0, b0 + .08, .45);
    }
    // lock ring: r55, 3/3 dashes as arcs; the wrapper folds it away with the rest of the piece
    h.lockW = reg(el('g', {}, co), 'op', -2, -1, 6.3, 6.9);
    h.lockG = el('g', { opacity: 0 }, h.lockW);
    const nL = Math.round(2 * Math.PI * 55 / 6);
    for (let i = 0; i < nL; i++) el('path', { d: arc(55, i * 360 / nL, i * 360 / nL + 180 / nL), fill: 'none', class: 'acc', 'stroke-width': W.main }, h.lockG);
    // focus rings: three concentric rings + centre dot while locked (radial-goo-bloom)
    h.focusW = reg(el('g', {}, co), 'op', 2.5, 2.9, 6.0, 6.4);
    h.focus = el('g', { opacity: 0 }, h.focusW);
    [6, 12, 18].forEach((dr, i) =>
      el('circle', { r: (80 + dr) * K, fill: 'none', class: 'acc', 'stroke-width': W.fine, 'stroke-opacity': [.55, .3, .15][i] }, h.focus));
    h.focusDot = el('circle', { r: 3 * K, class: 'accf', opacity: .9 }, h.focus);
    // static centre: r40, r20 dashed 6/2 (16 arcs), crosshair
    reg(drawable(el('circle', { r: 40 * K, class: 'disc ink', 'stroke-width': W.minor }, co)), 'draw', 1.0, 1.6, 6.8, 7.3);
    for (let i = 0; i < 16; i++) {
      const p = drawable(el('path', { d: arc(20, i * 22.5, i * 22.5 + 16.9), fill: 'none', class: 'mid', 'stroke-width': W.minor }, co));
      const a0 = 1.3 + stag(i, 16, .035), b0 = 6.7 + stag(15 - i, 16, .03);
      reg(p, 'draw', a0, a0 + .15, b0, b0 + .15);
    }
    reg(drawable(el('path', { d: `M${-5 * K} 0 H${5 * K} M0 ${-5 * K} V${5 * K}`, fill: 'none', class: 'ink', 'stroke-width': W.main }, co)), 'draw', 1.5, 1.9, 6.9, 7.3);
    // the centre knob (Patch): 270° track, top tick, value arc = sweep, pointer
    h.knob = el('g', {}, co);
    reg(drawable(el('path', { d: arc(28, -135, 135), fill: 'none', class: 'minor', 'stroke-width': W.minor }, h.knob)), 'draw', 1.4, 2.0, 6.6, 7.1);
    {
      const [x1, y1] = pol(-90, 28), [x2, y2] = pol(-90, 32);
      reg(el('line', { x1, y1, x2, y2, class: 'mid', 'stroke-width': W.fine }, h.knob), 'op', 1.5, 1.8, 6.5, 6.8);
    }
    h.knobArc = reg(el('path', { fill: 'none', class: 'acc', 'stroke-width': W.main * 1.4, 'stroke-linecap': 'round' }, h.knob), 'op', 1.5, 2.0, 6.5, 6.9);
    h.knobPtr = reg(el('line', { x1: 0, y1: 0, class: 'ink', 'stroke-width': W.main, 'stroke-linecap': 'round' }, h.knob), 'op', 1.6, 2.1, 6.5, 6.9);
    h.indB = reg(drawable(el('line', { x1: 0, y1: 0, class: 'ink', 'stroke-width': W.minor, opacity: .6 }, co)), 'draw', 2.1, 2.6, 6.0, 6.5);
    h.indC = reg(drawable(el('line', { x1: 0, y1: 0, class: 'acc', 'stroke-width': W.minor, opacity: .6 }, co)), 'draw', 2.2, 2.6, 6.0, 6.5);

    // ── READOUT: fixed strip below the bezel — 4 × (micro label · AZ value · LED) ──
    const ro = root('readout');
    h.readouts = [0, 90, 180, 270].map((base, i) => {
      const x = -96 + i * 64, y = 300;
      const g = el('g', {}, ro);
      const lab = el('text', { x, y: y - 8, 'font-size': 7, 'letter-spacing': 1.2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'dim' }, g);
      lab.textContent = `AZ ${String(base).padStart(3, '0')}`;
      const t = el('text', { x, y: y + 8, 'font-size': 15, 'font-weight': 500, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'letter-spacing': '.04em' }, g);
      t.textContent = '000°';
      const led = el('circle', { cx: x + 30, cy: y - 8, r: 2.4 * K, fill: 'none', 'stroke-width': W.fine }, g);
      reg(g, 'op', 1.8 + stag(i, 4, .08), 2.4 + stag(i, 4, .08), 5.9 + stag(3 - i, 4, .06), 6.4 + stag(3 - i, 4, .06));
      return { lab, t, led, base };
    });
    h.cache = new Map();
    // colour rule, broken (rev C): the piece owns its hue — the live component's red — so the
    // mode accents and selected fills render in it, in every mode.
    el('style', {}, bz.ownerSVGElement).textContent =
      '.acc{stroke:#FF5A6A}.accf{fill:#FF5A6A}.on .disc{fill:#FF5A6A}.on .ink{stroke:#FF5A6A}.on .accf{fill:#FF5A6A}';
    return h;
  },

  pose(u, ctl) {
    // live on the controls (STORY): each ring is A0 × its ratio plus the integral of ratio × the sweep
    // speed, so a knob changes speed without a jump. LOCK cuts the drive and the speed it had at the
    // tap decays over BRAKE; UNLOCK lets it spin back up over SPIN_UP. Both are closed-form per lock
    // episode and frozen once the episode ends, so the rings resume exactly where they stopped.
    // Otherwise: the scripted drag / lock / ZERO below.
    if (ctl) {
      const c = ctl.v, lk = c.lock >= .5;
      const ev = lockEvents(ctl, u);
      // brake / spin-up: the angle each lock episode takes off a free-running sweep
      let ob = 0, mb = 0, w = c.rate, wm = c.rate * c.middle;    // w: °/s of the outer ring now
      ev.forEach((x, i) => {
        const end = ev[i + 1] ? ev[i + 1].t : u, d = end - x.t;
        if (x.on) {                                           // braking from the rate at the tap
          const k = 1 - Math.exp(-d / BRAKE);
          ob += x.rate * BRAKE * k; mb += x.rate * x.middle * BRAKE * k;
          if (!ev[i + 1]) { w = x.rate * (1 - k); wm = w * x.middle; }
        } else {                                              // spinning back up from rest
          const k = 1 - Math.exp(-d / SPIN_UP);
          ob -= x.rate * SPIN_UP * k; mb -= x.rate * x.middle * SPIN_UP * k;
          if (!ev[i + 1]) { w = c.rate - x.rate * (1 - k); wm = c.rate * c.middle - x.rate * x.middle * (1 - k); }
        }
      });
      const ra = A0 + ctl.integ(q => q.lock >= .5 ? 0 : q.rate) + ob;
      const rb = A0 * RATIO.middle + ctl.integ(q => q.lock >= .5 ? 0 : q.rate * q.middle) + mb;
      const last = ev[ev.length - 1], e = last ? u - last.t : Infinity;   // seconds since the last tap
      const held = last && !lk && ev.length > 1 ? last.t - ev[ev.length - 2].t : 0;   // how long it was locked
      // sector ping: time since the outer ring entered its 30° sector, from where it sits in it
      let ping = null;
      if (!lk && Math.abs(w) > .5) {
        const a = ((ra % 360) + 360) % 360, s = Math.floor(a / 30) % 12, into = w > 0 ? a - s * 30 : (s + 1) * 30 - a;
        ping = { i: s, age: into / Math.abs(w) };
      }
      // lock ring: outExpo in at +60 ms, then the 1.9 s breathing pulse; 200 ms out on unlock
      const breathe = x => x < .38 ? 1 - Math.pow(2, -10 * win(x, .06, .38)) : .64 + .36 * Math.cos(2 * Math.PI * (x - .38) / 1.9);
      let lockOp = 0;
      if (lk && e >= .06) lockOp = breathe(e);
      else if (!lk && held && e < .2) lockOp = breathe(held) * (1 - oq(win(e, 0, .2)));
      // hex telemetry: LOCK, then fixed codes while locked (and 80 ms past the unlock); else reshuffled
      const tick = Math.floor((u + 20) / 1.1);
      const codes = lk ? e >= .04 : held && e < .08;
      const hex = Array.from({ length: 8 }, (_, i) => {
        if (codes) return lk && e < .3 ? { s: 'LOCK', cls: 'icondot', op: 1 }
          : { s: '0x' + (((i + 1) * 0x1337) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'), cls: 'accf', op: .85 };
        const g = hash(i, tick) < .25;
        return g ? { s: 'ERROR', cls: 'accf', op: .9 } : { s: hex4(hash(i + 50, tick)), cls: 'dim', op: .75 };
      });
      const shake = lk && e < .1 ? SHAKE[Math.min(3, Math.floor(e / .1 * 4))] : [0, 0];
      return { ra, rb, rc: ra * RATIO.inner, rd: ra * RATIO.card, locked: lk, lockOp, hex, ping, shake, errOn: false, heading: headingAngle(u) };
    }
    const ra = angle(u);
    const lk = locked(u);
    // sector ping: how long since the outer angle crossed into its current 30° sector
    let ping = null;
    if (!lk) {
      const sec = a => Math.floor(((a % 360) + 360) % 360 / 30) % 12;
      const s = sec(ra);
      for (let k = 1; k <= 42; k++) {
        const uu = u - k / 60;
        if (sec(angle(uu)) !== s || (uu >= LOCK && uu < UNLOCK)) { ping = { i: s, age: k / 60 }; break; }
      }
    }
    // lock ring: outExpo in at +60 ms, then a 1.9 s breathing pulse; 200 ms out on unlock
    let lockOp = 0;
    if (u >= LOCK + .06 && u < UNLOCK) {
      const k = win(u, LOCK + .06, LOCK + .38);
      const inK = 1 - Math.pow(2, -10 * k);
      const after = u - (LOCK + .38);
      lockOp = after < 0 ? inK : .64 + .36 * Math.cos(2 * Math.PI * after / 1.9);
    } else if (u >= UNLOCK && u < UNLOCK + .2) {
      const after = UNLOCK - (LOCK + .38);
      lockOp = (.64 + .36 * Math.cos(2 * Math.PI * after / 1.9)) * (1 - oq(win(u, UNLOCK, UNLOCK + .2)));
    }
    // hex telemetry: reshuffled every 1.1 s, 25 % ERROR; LOCK then fixed codes while locked
    // ZERO restores the first set, so the loop closes on the frame it opened with
    const tick = Math.floor(((u < ZERO ? u : 0) + 20) / 1.1);
    const hex = Array.from({ length: 8 }, (_, i) => {
      if (u >= LOCK + .04 && u < UNLOCK + .08) {
        if (u < LOCK + .3) return { s: 'LOCK', cls: 'icondot', op: 1 };
        return { s: '0x' + (((i + 1) * 0x1337) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'), cls: 'accf', op: .85 };
      }
      const g = hash(i, tick) < .25;
      return g ? { s: 'ERROR', cls: 'accf', op: .9 } : { s: hex4(hash(i + 50, tick)), cls: 'dim', op: .75 };
    });
    // glitch: shake + one label flashes ERR
    let shake = [0, 0];
    const shakeAt = (at, dur) => { if (u >= at && u < at + dur) shake = SHAKE[Math.min(3, Math.floor((u - at) / dur * 4))]; };
    for (const g of GLITCHES) {
      shakeAt(g.at, .12);
      if (u >= g.at + .06 && u < g.at + .24) hex[g.target] = { s: 'ERR', cls: 'icondot', op: 1 };
    }
    shakeAt(LOCK, .1);
    // the ERR LED: 4 Hz blink across the glitch window
    let errOn = false;
    for (const g of GLITCHES) if (u >= g.at && u < g.at + .24) errOn = Math.floor(u * 8) % 2 === 0;
    return { ra, rb: -ra * 1.5, rc: ra * .7, rd: -ra * .3, locked: lk, lockOp, hex, ping, shake, errOn, heading: headingAngle(u) };
  },

  finger(u) {
    const rest = [230, 250];
    const startA = DRAG.startDeg, R = 150 * K;
    const onRing = a => [Math.cos(RAD(a)) * R, Math.sin(RAD(a)) * R];
    const grab = onRing(startA);
    if (u < DRAG.at - .04) {
      const k = io(win(u, .06, DRAG.at - .04));
      return { x: lerp(rest[0], grab[0], k), y: lerp(rest[1], grab[1], k), layer: 'outer' };
    }
    if (u < DRAG.end) {
      const [x, y] = onRing(startA + (angle(u) - angle(DRAG.at)));
      return { x, y, down: u >= DRAG.at, layer: 'outer' };
    }
    const rel = onRing(startA + DRAG.sweep);
    if (u < LOCK - .04) {
      const k = io(win(u, DRAG.end + .05, LOCK - .04));
      return { x: lerp(rel[0], 0, k), y: lerp(rel[1], 0, k), layer: 'core' };
    }
    if (u < LOCK + .5) return { x: 0, y: 0, pulse: u >= LOCK ? win(u, LOCK, LOCK + .5) : null, layer: 'core' };
    if (u < UNLOCK - .04) {   // drift off the core and come back for the unlock tap
      const k = Math.sin(Math.PI * win(u, LOCK + .5, UNLOCK - .04));
      return { x: 70 * k, y: 80 * k, layer: 'core' };
    }
    if (u < UNLOCK + .5) return { x: 0, y: 0, pulse: u >= UNLOCK ? win(u, UNLOCK, UNLOCK + .5) : null, layer: 'core' };
    const k = io(win(u, UNLOCK + .5, ZERO + .4));            // step back to rest and watch it home
    return { x: lerp(0, rest[0], k), y: lerp(0, rest[1], k), layer: 'core' };
  },

  apply(h, p, D) {
    // pose
    for (const r of h.roots) r.setAttribute('transform', `translate(${p.shake[0] * K} ${p.shake[1] * K})`);
    h.outerG.setAttribute('transform', `rotate(${p.ra})`);
    h.midG.setAttribute('transform', `rotate(${p.rb})`);
    h.innerG.setAttribute('transform', `rotate(${p.rc})`);
    h.cardG.setAttribute('transform', `rotate(${p.rd})`);
    h.segG.setAttribute('transform', `rotate(${-((((p.rc % 12) + 12) % 12) / (60 * K)) * 180 / Math.PI * K})`);
    const [hx, hy] = pol(p.heading, 156);
    h.headingG.setAttribute('transform', `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) rotate(${p.heading.toFixed(2)}) scale(.55)`);
    const T = 42;
    h.trail[0].setAttribute('d', arc(160, p.ra - T * .33, p.ra));
    h.trail[1].setAttribute('d', arc(160, p.ra - T * .67, p.ra - T * .33));
    h.trail[2].setAttribute('d', arc(160, p.ra - T, p.ra - T * .67));
    const set2 = (n, deg, r) => { const [x, y] = pol(deg, r); n.setAttribute('x2', x); n.setAttribute('y2', y); };
    set2(h.indA, p.ra, 160); set2(h.indB, p.rb, 120); set2(h.indC, p.rc, 80);
    const put = (n, s) => { if (h.cache.get(n) !== s) { n.textContent = s; h.cache.set(n, s); } };
    // readout strip: live AZ values + a sector LED per quadrant
    h.readouts.forEach((r, i) => {
      const v = ((p.ra + r.base) % 360 + 360) % 360;
      put(r.t, String(Math.round(v)).padStart(3, '0') + '°');
      const lit = p.ping && Math.floor(p.ping.i / 3) === i && p.ping.age < .7;
      r.led.setAttribute('class', lit ? 'icondot' : 'minor');
      if (lit) r.led.removeAttribute('fill'); else r.led.setAttribute('fill', 'none');
    });
    h.hex.forEach((t, i) => {
      const v = p.hex[i];
      put(t, v.s);
      t.setAttribute('class', v.cls);
      t.setAttribute('opacity', v.op);
    });
    // ports: open · lit (NODE_ON) · ping flash scales the jack out
    h.ports.forEach((q, i) => {
      const flash = p.ping && p.ping.i === i && p.ping.age < .7;
      const k = flash ? 1 - Math.pow(2, -10 * p.ping.age / .7) : 1;
      const size = (flash ? 5.2 + 3.4 * k : 5.2) * K;
      q.ring.setAttribute('class', flash ? 'acc' : NODE_ON[i] ? 'mid' : 'minor');
      q.dot.setAttribute('class', flash ? 'accf' : NODE_ON[i] ? 'icondot' : 'minor');
      if (flash || NODE_ON[i]) q.dot.removeAttribute('fill'); else q.dot.setAttribute('fill', 'none');
      if (q.ring.tagName === 'rect') {
        q.ring.setAttribute('x', q.x - size); q.ring.setAttribute('y', q.y - size);
        q.ring.setAttribute('width', size * 2); q.ring.setAttribute('height', size * 2);
      } else q.ring.setAttribute('r', size);
    });
    // LED cluster: SWP on while sweeping, LCK while locked, ERR blinks on glitches
    const led = (i, on) => {
      const d = h.leds[i].dot;
      d.setAttribute('class', on ? 'icondot' : 'minor');
      if (on) d.removeAttribute('fill'); else d.setAttribute('fill', 'none');
      h.leds[i].t.setAttribute('class', on ? 'icondot' : 'dim');
    };
    led(0, !p.locked); led(1, p.locked); led(2, p.errOn);
    h.lockG.setAttribute('opacity', p.lockOp);
    // focus rings + pod brackets: lit while locked
    h.focus.setAttribute('opacity', p.lockOp);
    h.brackets.forEach(cs => cs.forEach(c => {
      c.setAttribute('class', p.locked ? 'acc' : 'mid');
      c.setAttribute('opacity', p.locked ? .9 : .22);
    }));
    // centre knob: value arc and pointer follow the sweep
    const ka = knobDeg(p.ra);
    if (ka > -135 + .5) h.knobArc.setAttribute('d', arc(28, -135, ka));
    else h.knobArc.setAttribute('d', arc(28, -135, -134.5));
    const [px, py] = pol(ka, 24);
    h.knobPtr.setAttribute('x2', px); h.knobPtr.setAttribute('y2', py);
    // draw on / off
    for (const r of h.reg) {
      const k = D ? dOn(D.t, r.a, r.b) * dOff(D.t, r.c, r.d) : 1;
      if (r.kind === 'draw') { setDraw(r.n, k); r.n.setAttribute('visibility', k < .002 ? 'hidden' : 'visible'); }
      else r.n.setAttribute('opacity', k * r.base);
    }
  },
});
})();
