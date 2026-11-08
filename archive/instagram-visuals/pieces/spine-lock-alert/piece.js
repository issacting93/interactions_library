/* ─────────────────────────────────────────────────────────────
   PIECE · SPINE LOCK — ALERT (SLA-16)
   components/interaction/spine-lock-alert — redrawn as layered SVG the way spine-section (SPN-08)
   redraws its own vertebra bones. One button toggles a 7-segment spine through 4 stages
   ([0,1,3,5,7] segments locked), outward from the middle vertebra (index 3) to both ends — stage 1
   seats the middle pair, stage 2 its neighbours, stage 3 the next pair out, stage 4 the two ends
   ("SPINE RELEASED"/"SEALED"). Unlocking reverses the same sequence. Each vertebra is a filled bone
   silhouette (left/right mirror) with a central port that fills accent-coloured when its pair locks,
   and a connecting bar that grows from the body outward as it seats; the row's own vertical gap also
   opens (stacked −80px ↔ spaced 0px, per the source's margin-top rule) as its threshold stage is
   crossed, both eased over ~0.35 s to stand in for the source's own CSS transitions. HUD cell strip,
   EXT % readout, a 7-row LOCK/ACQ/STBY spec table and a 3-trace oscillograph (amplitude falls as the
   stage rises) read the same state; the title card swaps a JP glyph + EN caption per phase.
   Fidelity notes: the hazard-stripe marquee and hex background are simplified to static chrome (no
   animated repeating-gradient scroll) — decorative, not load-bearing on the mechanic. The source's
   two live states (engaging = red, released = amber) are collapsed to the piece's single identity
   hue (rev C: red #ff3b1f) rather than introducing a second dynamic colour the house palette has no
   slot for; the distinction still reads in the status text and title card.
   STORY drives it from two controls: LOCK (a toggle) and HALO (a knob for the backdrop below).
   Pressing LOCK doesn't jump the stage — pose() integrates a rate over however long LOCK has been
   held (ctl.integ, the same tool gear-lock's own AUTO cadence uses), climbing 0→4 at the source's
   engage rate (~1.84 stage/s, matching 500+3×560 ms) and falling at its unwind rate (~3.77 stage/s,
   matching 4×200+260 ms) — so a tap plays the full staged sequence at the source's own cadence
   regardless of how long the schedule holds LOCK on. The scripted ASSEMBLY/EXPLODED performance
   instead replays engage()/unwind() directly off the EVENTS timeline, through the same stageF-driven
   row math.
   Each row's own lock/open progress (a linear 0–1 window of stageF, see outBack() below) is reshaped
   with a back-ease overshoot rather than used raw, so a segment visibly snaps into its seat and
   settles instead of crawling in lockstep with the stage value — this is the fix for "feels very
   linear": the row math itself was always correct, it just had no pop of its own, borrowing all its
   shape from whatever eased the stage/knob driving it.
   A bottom HALO layer (ported from components/generative/graphite-halo: domain-warped simplex noise,
   marching-squares contours, hand-wobbled rings) sits behind everything, redrawn to an offscreen
   canvas and composited as a bitmap <image> — the same canvas→toDataURL→svg-image technique
   terrain-displacement already uses for its three.js layer. HALO sets its opacity and warp/density;
   its drift clock is piece time (p.t) where available, else the lock stage, so it still animates in
   SPEC's single frame and isn't just a static backdrop.
   Fidelity notes: the hazard-stripe marquee and hex background are simplified to static chrome (no
   animated repeating-gradient scroll) — decorative, not load-bearing on the mechanic. The source's
   two live states (engaging = red, released = amber) are collapsed to the piece's single identity
   hue (rev C: red #ff3b1f) rather than introducing a second dynamic colour the house palette has no
   slot for; the distinction still reads in the status text and title card. The oscillograph's clip
   rect was previously defined in oscAmp's pre-translate frame while oscAmp's content is drawn in its
   post-translate (centred) frame, so the visible clip window and the drawn traces only partially
   overlapped (looked like the waves were cut off/missing) — fixed by centring the clip rect on
   oscAmp's own local origin.
   ───────────────────────────────────────────────────────────── */
(() => {

const N = 7;
const K = 0.6;                                    // source px → piece units (matches spine-section)
const BONE_D = 'M0 44.46V0.13H3.4V2.57L0.4 6.39V43.85L32.37 63.38L36.78 78.87L67.11 99.19H81.09V100H67.05L36.51 79.55L32.1 64.06Z';
const BLOCK = { x: 94.3, y: 96.5, w: 10.2, h: 2.1 };
const PORT = { x: 85.5, y: 91, w: 3.8, h: 8.4 };
const ROW_W = 105, ROW_H = 100, GAP_W = 72;

const COUNTS = [0, 1, 3, 5, 7];
const AMPS = [1, .72, .48, .26, .07];
const COHS = [12.4, 41.7, 63.9, 86.2, 100.0];
const CARDS = {
  standby:   ['待機', 'STANDBY',    'Awaiting key input'],
  engaging:  ['接続', 'CONNECTING', 'Segments locking · C4 outward'],
  released:  ['解放', 'SPINE RELEASED', 'All segments locked · 14/14'],
  unwinding: ['収納', 'RETRACTING', 'Segments unlocking'],
};

// row i (0..6): distance from the middle (3), the stage at which it locks, the stage at which its
// gap opens, which side it drifts to — all taken straight from the source's renderVals()
function rowInfo(i) {
  const d = Math.abs(i - 3);
  const lockStage = d + 1;
  const openStage = i === 0 ? 0 : (i <= 3 ? 5 - i : i - 2);   // 0 = always open (first-child rule)
  const side = i < 3 ? 'up' : i > 3 ? 'dn' : 'mid';
  return { d, lockStage, openStage, side };
}
const ROWS = Array.from({ length: N }, (_, i) => rowInfo(i));

// ── the scripted performance: one tap engages (stage climbs 0→4 over 4 steps), a hold, one tap
// releases (stage falls 4→0 over 4 steps) — timings compressed from the source's own ms cadence ──
const ENGAGE_AT = .2;
const ENGAGE_STEP = [.32, .68, 1.04, 1.40];       // u at which stage becomes 1,2,3,4 (cumulative, from ENGAGE_AT)
const RELEASE_HOLD = .6;
const UNWIND_STEP = [.16, .32, .48, .64];         // u at which stage becomes 3,2,1,0 (cumulative, from unwindAt)
const RELAT = ENGAGE_AT + ENGAGE_STEP[3];
const UNWIND_AT = RELAT + RELEASE_HOLD;
const STANDBY_AT = UNWIND_AT + UNWIND_STEP[3] + .15;
const END = STANDBY_AT;

const EVENTS = [
  { t: 0,         stage: 0, phase: 'standby' },
  { t: ENGAGE_AT, stage: 0, phase: 'engaging' },
  ...ENGAGE_STEP.map((dt, i) => ({ t: ENGAGE_AT + dt, stage: i + 1, phase: i === 3 ? 'released' : 'engaging' })),
  { t: UNWIND_AT, stage: 4, phase: 'unwinding' },
  ...UNWIND_STEP.map((dt, i) => ({ t: UNWIND_AT + dt, stage: 3 - i, phase: 'unwinding' })),
  { t: STANDBY_AT, stage: 0, phase: 'standby' },
];

function liveAt(u) {
  let cur = EVENTS[0];
  for (const e of EVENTS) { if (e.t > u) break; cur = e; }
  return cur;
}
// smooth eased stage, interpolated between consecutive EVENTS keyframes (unifies the scripted replay
// with the continuous STAGE knob STORY drives — both feed the same row math below)
function stageF(u) {
  let i = 0;
  for (; i < EVENTS.length - 1; i++) if (EVENTS[i + 1].t > u) break;
  const a = EVENTS[i], b = EVENTS[Math.min(i + 1, EVENTS.length - 1)];
  if (a.stage === b.stage || u <= a.t) return a.stage;
  return lerp(a.stage, b.stage, io(win(u, a.t, b.t)));
}
function wave(period, amp, phase0) {
  let d = '';
  for (let x = -140; x <= 140; x += 4) {
    const y = Math.sin(((x + 140) / period) * Math.PI * 2 + phase0) * amp;
    d += (x === -140 ? 'M' : 'L') + x + ' ' + y.toFixed(2) + ' ';
  }
  return d;
}

// reshapes a local 0–1 progress with a snap-and-settle overshoot (same formula reliquary.html's own
// easeOutBack uses) — applied to each row's own lockK/openK window so a segment pops into its seat
// instead of crawling at exactly the rate of whatever eases the stage value driving it
function outBack(k, s = 1.7) {
  k = clamp(k, 0, 1);
  const c3 = s + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
}

// the rate pose(u, ctl) integrates while LOCK is held on/off, so a tap plays the full staged
// sequence at the source's own cadence: engage 4 stages / (500 + 3×560) ms, unwind 4 / (4×200+260) ms
const LOCK_RATE_ON = 4 / 2.18, LOCK_RATE_OFF = 4 / 1.06;

// a plain ctl.integ(f) sums the rate over the WHOLE history in one shot, clamped only once at the
// end — so the long stretch with LOCK off (rate negative) accrues a deep negative total that the
// short ON stretch can never climb back out of before the clamp ever applies. Needs a saturating
// (per-step clamped) integrator instead: harvest the sample history the same way gear-lock's own
// livePose(u, ctl) does (ctl.integ as a way to obtain `vs`, discarding its own return value), then
// replay it by hand with the clamp applied at every step.
function liveStage(u, ctl) {
  const vs = []; ctl.integ(v => { vs.push(v); return 0; });
  const n = vs.length, dt = n ? u / n : 0;
  let sF = 0;
  for (let k = 0; k < n; k++) {
    const rate = vs[k].lock > .5 ? LOCK_RATE_ON : -LOCK_RATE_OFF;
    sF = clamp(sF + rate * dt, 0, 4);
  }
  return sF;
}

// ── halo: trimmed port of components/generative/graphite-halo/graphite-halo-draft.html (domain-
// warped simplex noise, marching-squares contours, hand-wobbled rings), minus its own UI — redrawn
// to an offscreen canvas and composited as a bitmap <image>, the technique terrain-displacement
// already uses to bring a canvas/WebGL layer into this SVG-only stage ──
const HALO_SEED = 20260, HALO_RES = 420, HALO_R = 300;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const HALO_G3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
function makeHaloNoise(seed) {
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
    const c = (gx, xx, yy, zz) => { let tt = .6 - xx * xx - yy * yy - zz * zz; if (tt < 0) return 0; tt *= tt; const g = HALO_G3[gx % 12]; return tt * tt * (g[0] * xx + g[1] * yy + g[2] * zz); };
    n += c(perm[ii + perm[jj + perm[kk]]], x0, y0, z0);
    n += c(perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1);
    n += c(perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2);
    n += c(perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3);
    return 32 * n;
  };
}
const haloNoise = makeHaloNoise(HALO_SEED);
function haloFbm(x, y, z, oct = 3) { let a = .5, f = 1, s = 0; for (let o = 0; o < oct; o++) { s += a * haloNoise(x * f, y * f, z + o * 17.3); f *= 2.03; a *= .5; } return s; }
function haloField(u, v, t, warp) {
  const qx = haloFbm(u * 2.2, v * 2.2, t, 2), qy = haloFbm(u * 2.2 + 5.2, v * 2.2 + 1.3, t + 9.1, 2);
  const wu = u + warp * qx, wv = v + warp * qy;
  const r = Math.hypot(wu, wv), th = Math.atan2(v, u);
  const lobe = .5 + .5 * haloNoise(Math.cos(th) * 1.4, Math.sin(th) * 1.4, t * .5 + 40);
  const rc = .335 + .03 * lobe, bw = .07 * (.55 + 1.1 * lobe);
  const band = Math.exp(-(((r - rc) / bw) ** 2));
  const detail = haloFbm(wu * 8, wv * 8, t + 3.7, 3);
  return band * (.35 + .85 * lobe) * (.55 + .9 * (detail + .5)) + .18 * detail - .04;
}
function haloContours(vals, n, step, lv) {
  const segs = [];
  const lerp2 = (a, b) => (lv - a) / (b - a);
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = vals[j * n + i], b = vals[j * n + i + 1], c = vals[(j + 1) * n + i + 1], d = vals[(j + 1) * n + i];
    const k = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const x = i * step, y = j * step;
    const T = [x + lerp2(a, b) * step, y], R = [x + step, y + lerp2(b, c) * step], B = [x + lerp2(d, c) * step, y + step], L = [x, y + lerp2(a, d) * step];
    switch (k) {
      case 1: case 14: segs.push(L, B); break;
      case 2: case 13: segs.push(B, R); break;
      case 3: case 12: segs.push(L, R); break;
      case 4: case 11: segs.push(T, R); break;
      case 5: segs.push(L, T, B, R); break;
      case 6: case 9: segs.push(T, B); break;
      case 7: case 8: segs.push(L, T); break;
      case 10: segs.push(T, R, L, B); break;
    }
  }
  return segs;
}
let haloCanvas = null, haloCtx = null;
// graphite white → identity red (#ff3b1f), the same accent every other element in the piece wakes
// up to once it goes active — tint 0 = idle white, 1 = fully red
const HALO_WHITE = [232, 230, 224], HALO_RED = [255, 59, 31];
function haloColor(tint, a) {
  const c = HALO_WHITE.map((v, i) => Math.round(v + (HALO_RED[i] - v) * clamp(tint, 0, 1)));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
// pure function of (t, warp, density, tint): same inputs in → same bitmap out, so it stays
// seekable under capture/scrub exactly like the SVG-only layers
function haloDraw(t, warp, density, tint) {
  if (!haloCanvas) { haloCanvas = document.createElement('canvas'); haloCanvas.width = haloCanvas.height = HALO_RES; haloCtx = haloCanvas.getContext('2d'); }
  const ctx = haloCtx, S = HALO_RES, cx = S / 2, cy = S / 2;
  // transparent, not the source's own black-paper fill — this canvas is composited under three
  // different mode backgrounds (SPEC cream, STORY black, EXPLODED charcoal), so it can only safely
  // supply the graphite strokes and let the stage's own background show through underneath
  ctx.clearRect(0, 0, S, S);
  const n = 72, step = S / (n - 1);
  const vals = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[j * n + i] = haloField(i / (n - 1) - .5, j / (n - 1) - .5, t, warp);
  const rr = mulberry32(HALO_SEED + 11);
  [.25, .30, .318, .352, .37].forEach((f, i) => {
    const ex = (rr() - .5) * S * .03, ey = (rr() - .5) * S * .03, R = f * S;
    ctx.beginPath();
    for (let a = 0; a <= 360; a += 3) {
      const rad2 = a * Math.PI / 180, wob = haloNoise(Math.cos(rad2) * 2, Math.sin(rad2) * 2, (HALO_SEED * 31 + i * 97) * .13) * S * .0025;
      const x = cx + ex + Math.cos(rad2) * (R + wob), y = cy + ey + Math.sin(rad2) * (R + wob);
      a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = haloColor(tint, .22 + rr() * .12); ctx.lineWidth = Math.max(.6, S / 900); ctx.stroke();
  });
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let L = 0; L < 3; L++) {
    const lv = density + L * .13, segs = haloContours(vals, n, step, lv);
    ctx.beginPath();
    for (let s = 0; s < segs.length; s += 2) { ctx.moveTo(segs[s][0], segs[s][1]); ctx.lineTo(segs[s + 1][0], segs[s + 1][1]); }
    ctx.strokeStyle = haloColor(tint, .3 - L * .07); ctx.lineWidth = Math.max(.6, S / 900) * (1 - L * .12); ctx.stroke();
  }
  return haloCanvas.toDataURL('image/png');
}

const OSC = { x: 128, y: -70, w: 150, h: 64 };
const HUD_L = { x: -256, y: -248 };
const HUD_R = { x: 256, y: -248 };
const SPEC = { x: -256, y: -70 };
const CARD = { x: -256, y: 236 };
const KEY_R = 34;

registerPiece({
  id: 'spine-lock-alert',
  code: 'SLA-16', series: 'B', n: '16',
  name: 'SPINE LOCK — ALERT',
  mechanic: 'TAP KEY · 7-SEGMENT LOCK, OUTWARD FROM CENTRE',
  source: 'COMPONENTS/INTERACTION/SPINE-LOCK-ALERT',
  hero: { v: '4', u: 'STAGES · 7 SEGMENTS' },
  extent: 300,
  spec: [
    ['INPUT',  'TAP KEY · TOGGLE ENGAGE/RELEASE'],
    ['STATE',  '4 STAGES · 0/1/3/5/7 SEGMENTS'],
    ['MOTION', 'LOCKS MID → ENDS · 500–560 MS/STAGE'],
    ['BUILT',  'INLINE SVG · SETTIMEOUT STATE MACHINE'],
  ],
  layers: [
    { id: 'halo',  name: 'HALO',      note: 'GENERATIVE GRAPHITE BACKDROP', edge: 300 },
    { id: 'bg',    name: 'CHROME',    note: 'HAZARD BARS · HEX FIELD',   edge: 300 },
    { id: 'hud',   name: 'HUD',       note: 'CELL STRIP · EXT %',        edge: 290 },
    { id: 'table', name: 'SPEC TABLE', note: '7 ROWS · LOCK/ACQ/STBY',  edge: 200 },
    { id: 'osc',   name: 'OSCILLOGRAPH', note: '3 TRACES · COHERENCE', edge: 200 },
    { id: 'spine', name: 'SPINE',     note: '7 VERTEBRAE · MID OUTWARD', edge: 130 },
    { id: 'key',   name: 'KEY',       note: 'CENTRE · TAP TO TOGGLE',   edge: 40 },
    { id: 'card',  name: 'TITLE CARD', note: 'JP GLYPH · EN CAPTION',   edge: 280 },
    { id: 'input', name: 'INPUT',     note: 'TAP KEY',                      edge: 300 },
  ],
  callouts: [
    { at: [-280, -260],                  title: 'HALO',    note: 'GENERATIVE GRAPHITE BACKDROP · NOISE CONTOURS' },
    { at: [HUD_L.x + 40, HUD_L.y + 20],  title: 'HUD',     note: '7-CELL STRIP · STATUS' },
    { at: [SPEC.x + 60, SPEC.y + 60],    title: 'SPEC TABLE', note: 'LOCK / ACQ / STBY PER SEGMENT' },
    { at: [OSC.x + 70, OSC.y + 30],      title: 'OSCILLOGRAPH', note: 'AMPLITUDE FALLS AS STAGE RISES' },
    { at: [0, 20],                        title: 'VERTEBRA',  note: '105 × 100 · MIRRORED PAIR' },
    { at: [0, -KEY_R - 6],                title: 'KEY',       note: 'TAP = ENGAGE / RELEASE' },
  ],
  controls: [
    { id: 'lock', label: 'LOCK', kind: 'toggle', min: 0, max: 1, value: 0, fmt: v => v ? 'ENGAGED' : 'OPEN' },
    { id: 'halo', label: 'HALO', kind: 'knob',   min: 0, max: 1, value: 0, fmt: v => `${Math.round(v * 100)}%` },
  ],
  // only 2 tweaks (not the usual 3–4): LOCK needs a full, uninterrupted ~2.2 s slot to integrate all
  // the way to sealed — splitting the TWEAK beat any finer cuts LOCK's own slot shorter than that and
  // the piece never reaches RELEASED before the next tweak releases it. Ending on 'lock' also means
  // the sealed state is what plays through CONTROLS OUT + HOLD, which is the piece's payoff beat.
  story: {
    tweaks: [
      { id: 'halo', to: 1 },   // backdrop blooms in first
      { id: 'lock', to: 1 },   // key engages — spine locks outward at its own cadence, seals, and holds
    ],
  },
  specU: .95,
  exploded: { live: END },
  assembly: {
    seeds: [[0, 0], [0, -120], [0, 120], [HUD_L.x, HUD_L.y], [HUD_R.x, HUD_R.y], [SPEC.x, SPEC.y + 60], [OSC.x + 70, OSC.y + 30]],
    live: 2.8,
    end: END,
    draw: t => ({
      halo:  dOn(t, .2, 1.0) * dOff(t, 6.9, 7.6),
      bg:    dOn(t, .5, 1.2) * dOff(t, 6.6, 7.3),
      hud:   dOn(t, .8, 1.4) * dOff(t, 6.3, 6.9),
      table: Array.from({ length: N }, (_, i) => dOn(t, 1.0 + stag(i, N, .3), 1.5 + stag(i, N, .3)) * dOff(t, 6.0 + stag(N - 1 - i, N, .25), 6.5 + stag(N - 1 - i, N, .25))),
      osc:   dOn(t, 1.2, 1.9) * dOff(t, 6.1, 6.7),
      verts: Array.from({ length: N }, (_, i) => dOn(t, .9 + stag(i, N, .35), 1.6 + stag(i, N, .35)) * dOff(t, 5.9 + stag(N - 1 - i, N, .3), 6.6 + stag(N - 1 - i, N, .3))),
      key:   dOn(t, 1.6, 2.2) * dOff(t, 5.8, 6.4),
      card:  dOn(t, 2.0, 2.6) * dOff(t, 5.9, 6.3),
    }),
  },

  build(L, sw) {
    const h = {};
    // rev C: this piece owns red as its identity hue, replacing the mode accent/selected fills in
    // every mode (distinct from SPN-08's violet, which belongs to Spine Section, not this piece)
    el('style', {}, L.bg.ownerSVGElement).textContent =
      '.acc{stroke:#ff3b1f}.accf{fill:#ff3b1f}.on .disc{fill:#ff3b1f}.on .ink{stroke:#ff3b1f}.on .accf{fill:#ff3b1f}';

    // halo: bitmap backdrop, redrawn and re-composited in apply() (see haloDraw() above)
    h.haloImg = el('image', { x: -HALO_R, y: -HALO_R, width: HALO_R * 2, height: HALO_R * 2, preserveAspectRatio: 'xMidYMid slice' }, L.halo);

    // chrome: a hairline frame + a static hex tile sample (the source's full hazard-marquee and
    // hex-pattern tiling are simplified to this — decorative, not part of the mechanic)
    h.frame = el('rect', { x: -290, y: -290, width: 580, height: 580, rx: 6, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, L.bg);
    h.haz = [-284, 284].map(y => el('rect', { x: -290, y: y - 4, width: 580, height: 8, class: 'minor', opacity: .5 }, L.bg));

    // HUD: left (label + cell strip + status), right (EXT %)
    h.hudL = el('g', { transform: `translate(${HUD_L.x} ${HUD_L.y})` }, L.hud);
    txt(h.hudL, 0, 0, 'SPINE LOCK', { 'font-size': 9, 'letter-spacing': '.22em', class: 'dim' });
    h.cells = Array.from({ length: N }, (_, i) => el('rect', { x: i * 11, y: 14, width: 8, height: 5, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.hudL));
    h.status = txt(h.hudL, 0, 32, 'STANDBY', { 'font-size': 11, 'font-weight': 700, 'letter-spacing': '.1em' });
    h.hudR = el('g', { transform: `translate(${HUD_R.x} ${HUD_R.y})`, 'text-anchor': 'end' }, L.hud);
    txt(h.hudR, 0, 0, 'EXTENSION', { 'font-size': 9, 'letter-spacing': '.22em', class: 'dim', 'text-anchor': 'end' });
    h.ext = txt(h.hudR, 0, 22, '000%', { 'font-size': 20, 'font-weight': 700, 'text-anchor': 'end' });

    // spec table: 7 rows of SEG · bar · status
    h.specG = el('g', { transform: `translate(${SPEC.x} ${SPEC.y})` }, L.table);
    txt(h.specG, 0, -12, 'SEG · STATUS', { 'font-size': 9, 'letter-spacing': '.2em', class: 'dim' });
    h.rows = Array.from({ length: N }, (_, i) => {
      const g = el('g', { transform: `translate(0 ${i * 20})` }, h.specG);
      const lab = txt(g, 0, 10, 'C' + (i + 1), { 'font-size': 9, 'letter-spacing': '.1em' });
      const bar = el('rect', { x: 28, y: 4, width: 70, height: 6, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      const barFill = el('rect', { x: 28, y: 4, width: 0, height: 6, class: 'accf' }, g);
      const st = txt(g, 108, 10, 'STBY', { 'font-size': 9, 'letter-spacing': '.12em' });
      return { lab, bar, barFill, st };
    });

    // oscillograph: 3 static traces, amplitude-scaled and horizontally drifting in the ambient loop
    h.oscG = el('g', { transform: `translate(${OSC.x} ${OSC.y})` }, L.osc);
    txt(h.oscG, 0, -8, 'COHERENCE', { 'font-size': 9, 'letter-spacing': '.2em', class: 'dim' });
    h.coh = txt(h.oscG, OSC.w, -8, '012.4%', { 'font-size': 9, 'letter-spacing': '.1em', 'text-anchor': 'end' });
    h.oscBox = el('rect', { x: 0, y: 0, width: OSC.w, height: OSC.h, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.oscG);
    const clip = el('clipPath', { id: 'slaOscClip' }, h.oscG);
    // centred on oscAmp's own local origin (oscAmp already translates to the box centre, so a clip
    // rect at (0,0,w,h) would sit one half-box off from the frame drawn in h.oscG — see header note)
    el('rect', { x: -OSC.w / 2, y: -OSC.h / 2, width: OSC.w, height: OSC.h }, clip);
    h.oscAmp = el('g', { transform: `translate(${OSC.w / 2} ${OSC.h / 2})`, 'clip-path': 'url(#slaOscClip)' }, h.oscG);
    h.traces = [
      { d: wave(70, 24, 0), cls: 'mid' },
      { d: wave(56, 18, 1.2), cls: 'acc' },
      { d: wave(140, 28, 2.4), cls: 'ink' },
    ].map(tr => el('path', { d: tr.d, fill: 'none', class: tr.cls, 'stroke-width': sw.minor, opacity: tr.cls === 'ink' ? .7 : 1 }, h.oscAmp));

    // spine: 7 vertebra pairs, each a filled bone silhouette L/R with a locking port + growing bar
    h.spineG = el('g', {}, L.spine);
    h.verts = ROWS.map((r, i) => {
      const g = el('g', {}, h.spineG);
      const inner = el('g', { transform: `scale(${K})` }, g);
      const halves = [1, -1].map(dir => {
        const hg = el('g', { transform: `scale(${dir} 1) translate(-${ROW_W} 0)` }, inner);
        const bone = el('path', { d: BONE_D, class: 'icondot' }, hg);
        const block = el('rect', { x: BLOCK.x, y: BLOCK.y, width: BLOCK.w, height: BLOCK.h, class: 'icondot' }, hg);
        const port = el('rect', { x: PORT.x, y: PORT.y, width: PORT.w, height: PORT.h, class: 'disc ink', 'stroke-width': sw.minor / K }, hg);
        return { bone, block, port };
      });
      const barH = ROW_H * K;
      const bar = el('rect', { x: -1, y: -barH / 2, width: 2, height: 0, class: 'accf' }, g);
      const tag = [-1, 1].map(side => txt(g, side * (ROW_W * K + 16), 4, 'C' + (i + 1) + (side < 0 ? 'L' : 'R'),
        { 'font-size': 8, 'letter-spacing': '.1em', 'text-anchor': side < 0 ? 'end' : 'start', opacity: 0 }));
      return { g, halves, bar, tag, r };
    });

    // key: hex rings + core + cross, centred on the spine (same anchor, per the source's z-index)
    h.keyG = el('g', {}, L.key);
    const hexPts = (r2) => [0, 1, 2, 3, 4, 5].map(k => { const a = rad(60 * k - 90); return `${(r2 * Math.cos(a)).toFixed(2)},${(r2 * Math.sin(a)).toFixed(2)}`; }).join(' ');
    h.orb = el('circle', { r: KEY_R, fill: 'none', class: 'minor', 'stroke-width': sw.minor, 'stroke-dasharray': '3 5' }, h.keyG);
    h.h1 = el('polygon', { points: hexPts(KEY_R * .79), fill: 'none', class: 'disc ink', 'stroke-width': sw.main }, h.keyG);
    h.h2 = el('polygon', { points: hexPts(KEY_R * .5), fill: 'none', class: 'icon', 'stroke-width': sw.minor }, h.keyG);
    h.h3 = el('polygon', { points: hexPts(KEY_R * .29), fill: 'none', class: 'icon', 'stroke-width': sw.main * .9 }, h.keyG);
    h.core = el('polygon', { points: hexPts(KEY_R * .11), class: 'icondot' }, h.keyG);
    h.cross = [[0, -KEY_R + 2, 0, -KEY_R + 6], [0, KEY_R - 6, 0, KEY_R - 2]].map(([x1, y1, x2, y2]) =>
      el('line', { x1, y1, x2, y2, class: 'ink', 'stroke-width': sw.minor }, h.keyG));

    // title card
    h.cardG = el('g', { transform: `translate(${CARD.x} ${CARD.y})` }, L.card);
    h.jp = txt(h.cardG, 0, 0, '待機', { 'font-size': 42, class: 'minor', 'font-family': "'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif" });
    h.en = txt(h.cardG, 104, -4, 'STANDBY', { 'font-size': 13, 'font-weight': 700, 'letter-spacing': '.1em' });
    h.enSub = txt(h.cardG, 104, 12, 'Awaiting key input', { 'font-size': 9, class: 'dim' });

    return h;
  },

  pose(u, ctl) {
    if (ctl) {
      // integrate the engage/unwind rate over however long LOCK has been held, rather than reading
      // a continuous knob — see header note; liveStage() replays the full history, so this stays a
      // pure, seekable function of u even though LOCK itself is a step function
      const sF = liveStage(u, ctl);
      const locked = ctl.v.lock > .5;
      const phase = locked ? (sF >= 3.98 ? 'released' : 'engaging') : (sF > .02 ? 'unwinding' : 'standby');
      return { stageF: sF, phase, halo: clamp(ctl.v.halo, 0, 1) };
    }
    const sF = stageF(u);
    const { phase } = liveAt(u);
    // no separate halo control on the scripted replay — tie its bloom to lock progress
    return { stageF: sF, phase, halo: clamp(sF / 4, 0, 1) };
  },

  finger(u) {
    const p1 = win(u, ENGAGE_AT, ENGAGE_AT + .5), p2 = win(u, UNWIND_AT, UNWIND_AT + .5);
    const pulse = (u >= ENGAGE_AT && u < ENGAGE_AT + .5) ? p1 : (u >= UNWIND_AT && u < UNWIND_AT + .5) ? p2 : null;
    return { x: 0, y: 0, pulse, layer: 'key' };
  },

  apply(h, p, D) {
    D = D || {};
    const one = v => v ?? 1;
    const sF = p.stageF;
    const engaging = p.phase === 'engaging';
    const active = engaging || p.phase === 'released';

    const haloT = p.t != null ? p.t * .06 : sF * .3;
    const haloTint = clamp(sF / 4, 0, 1);   // white while open, reddens as the spine locks outward, full red once sealed
    h.haloImg.setAttribute('href', haloDraw(haloT, .08 + .1 * p.halo, .42 + .12 * p.halo, haloTint));
    h.haloImg.setAttribute('opacity', one(D.halo) * clamp(.55 + .65 * p.halo, 0, 1));   // base bumped +0.4

    h.frame.setAttribute('opacity', one(D.bg));
    h.haz.forEach(hz => hz.setAttribute('opacity', one(D.bg) * .5 * (active ? 1 : .4)));

    h.hudL.setAttribute('opacity', one(D.hud));
    h.hudR.setAttribute('opacity', one(D.hud));
    const count = COUNTS[Math.min(4, Math.max(0, Math.round(sF)))];
    h.cells.forEach((c, i) => c.setAttribute('class', i < count ? 'accf acc' : 'minor'));
    let status = 'STANDBY';
    if (engaging) status = sF < .04 ? 'ACQUIRING' : `LOCKED ${String(count).padStart(2, '0')}/07`;
    if (p.phase === 'released') status = 'RELEASED';
    if (p.phase === 'unwinding') status = 'UNWINDING';
    h.status.textContent = status;
    h.status.setAttribute('class', active ? 'accf' : '');
    h.ext.textContent = `${Math.round(sF * 25)}%`;

    h.specG.setAttribute('opacity', 1);
    h.rows.forEach((row, i) => {
      const op = D.table ? D.table[i] : 1;
      const info = ROWS[i];
      const lockKRaw = clamp(sF - info.d, 0, 1);       // locks one stage before the row's own lockStage-1 edge → smooth ramp across its threshold
      const lockK = outBack(lockKRaw);                 // visual pop; status text below still reads the raw value
      const acq = engaging && !((lockKRaw) >= .999) && Math.floor(sF) === info.d;
      row.lab.setAttribute('opacity', op);
      row.bar.setAttribute('opacity', op);
      row.barFill.setAttribute('width', Math.max(0, 70 * lockK));   // outBack overshoots slightly past 70 at the snap, by design
      row.barFill.setAttribute('opacity', op);
      row.st.textContent = lockKRaw >= .999 ? 'LOCK' : acq ? 'ACQ' : 'STBY';
      row.st.setAttribute('class', lockKRaw >= .999 ? 'accf' : acq ? 'acc' : 'dim');
      row.st.setAttribute('opacity', op);
    });

    h.oscG.setAttribute('opacity', one(D.osc));
    const si = clamp(sF, 0, 4), s0 = Math.floor(si), s1 = Math.min(4, s0 + 1), fk = si - s0;
    const amp = lerp(AMPS[s0], AMPS[s1], fk);
    h.oscAmp.setAttribute('transform', `translate(${OSC.w / 2} ${OSC.h / 2}) scale(1 ${amp.toFixed(3)})`);
    if (p.t != null) {
      const scroll = -((p.t * 40) % OSC.w);
      h.traces.forEach((tr, i) => tr.setAttribute('transform', `translate(${scroll + i * .001})`));
    }
    h.coh.textContent = `${lerp(COHS[s0], COHS[s1], fk).toFixed(1)}%`;

    let posAcc = 0;
    const tops = [];
    h.verts.forEach((v, i) => {
      const info = v.r;
      tops.push(posAcc);
      const op = i === 0 ? 1 : outBack(clamp(sF - info.openStage + 1, 0, 1));
      const marginTop = lerp(-80, 0, op);
      posAcc += ROW_H + (i === 0 ? 0 : marginTop);
    });
    const totalH = posAcc + ROW_H;
    const centerOff = totalH / 2;
    h.verts.forEach((v, i) => {
      const info = v.r, dOne = D.verts ? D.verts[i] : 1;
      const lockKRaw = clamp(sF - info.d, 0, 1);
      const lockK = outBack(lockKRaw);                 // visual pop; thresholds below still read the raw value
      const y = (tops[i] + ROW_H / 2 - centerOff) * K;
      v.g.setAttribute('transform', `translate(0 ${y.toFixed(2)})`);
      v.g.setAttribute('opacity', dOne);
      v.halves.forEach(hf => {
        hf.bone.setAttribute('opacity', clamp(lerp(.38, 1, lockK), 0, 1));
        hf.block.setAttribute('opacity', clamp(lockK * 2 - 1, 0, 1));
        hf.port.setAttribute('class', lockKRaw >= .999 ? 'accf acc' : 'disc ink');
      });
      const side = info.side;
      const barH = Math.max(0, ROW_H * K * lockK);     // outBack overshoots slightly past full height, by design
      v.bar.setAttribute('height', barH.toFixed(2));
      v.bar.setAttribute('y', (side === 'up' ? (ROW_H * K / 2) * (lockK - 1) : side === 'dn' ? -(ROW_H * K / 2) * lockK : -barH / 2).toFixed(2));
      // the source's own op flag is hardcoded false for i===0 (and it's not the mid row either),
      // so row 0's tag stays invisible always — a quirk of the source's CSS rule, kept faithfully
      const tagOp = i === 0 ? 0 : clamp(sF - info.openStage + 1, 0, 1);
      v.tag.forEach(t => { t.setAttribute('opacity', tagOp); t.setAttribute('class', lockKRaw >= .999 ? 'accf' : ''); });
    });

    h.keyG.setAttribute('opacity', one(D.key));
    h.orb.setAttribute('class', active ? 'acc' : 'minor');
    h.h3.setAttribute('class', active ? 'acc' : 'icon');
    const beat = engaging ? .5 + .5 * Math.sin((p.t ?? 0) * 2 * Math.PI * 3) : p.phase === 'released' ? 1 : 0;
    h.core.setAttribute('class', active ? 'accf' : 'icondot');
    h.core.setAttribute('transform', `scale(${(1 + .25 * beat).toFixed(3)})`);

    h.cardG.setAttribute('opacity', one(D.card));
    const c = CARDS[p.phase] ?? CARDS.standby;
    h.jp.textContent = c[0]; h.jp.setAttribute('class', active ? 'accf' : 'minor');
    h.en.textContent = c[1];
    h.enSub.textContent = c[2];
  },
});

})();
