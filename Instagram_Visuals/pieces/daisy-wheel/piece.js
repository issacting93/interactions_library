/* ─────────────────────────────────────────────────────────────
   PIECE · DAISY WHEEL
   components/interaction/daisy-wheel — the typewriter fusion of
   hex-workspace × signal-wheel, redrawn in the source's own 800 × 500
   units (×1.06 here), turned 90° clockwise: the wheel is cropped off
   the top edge, as the source viewBox crops it off the left.
     · drag the annulus to aim (stations translate, never rotate)
     · strike the STK pad to write the armed station onto the line
     · repeats are legal; ⌫ unwrites
   Detent spring 180/14 and the strike jab 420/22 are integrated with
   the source's semi-implicit Euler at 60 Hz, from u = 0, so every
   frame is reproducible.
   STORY drives it from its controls instead (STRIKE, AIM, DAMP): AIM
   picks the detent the wheel springs to, DAMP is the source's damp
   slider, and STRIKE on lets the head strike the armed station on a
   0.9 s cadence, each strike kicking the wheel with its recoil. The
   same Euler springs run over the control values from u = 0, so a
   change of aim or damping never makes the wheel jump.
   Rev SPINE: the face is redrawn as a HUD reticle — a degree-scaled
   ring, a centred numeric readout (no station chrome drawn on the
   ring itself), a strike pad styled like the panel's own knobs, and
   the written line as a vertical chain of vertebra brackets instead
   of named rows. The mechanic and its physics are untouched.
   ───────────────────────────────────────────────────────────── */
(() => {

// Composition (departs from the source's viewBox crop): the whole source is turned 90° clockwise,
// so the wheel runs off the TOP edge (~75% of it shows), the strike head sits at 6 o'clock, and the
// spine of written stations runs down the plate below it. Everything upright is drawn directly in
// piece units via P(); nothing needs a rotated sub-group any more.
const K = 0.95;                                  // source px → piece units
const OX = 257.6, OY = 250 + 22 / K;             // source point at the piece origin
const ROT = 90;                                  // source → piece rotation (clockwise, degrees)
// source (x, y) → piece units: shift to the origin, scale, rotate +90° (x, y) → (−y, x)
const P = (x, y) => [-(y - OY) * K, (x - OX) * K];

/* ── source geometry (unchanged) ── */
const N = 6, STEP = 360 / N;
const CX = 60, CY = 250;
const R_STATION = 210, R_TICK = 232, R_FRAME = 246, R_INNER = 130;
const HEAD = { x: CX + R_STATION, y: CY };
const PAD = { x: HEAD.x + 106, y: CY, r: 19 };   // the strike pad, south of the ring (where the old tape head sat)
const ROWS = 3;                                   // the spine's visible window: 3 written + 1 next
const ROW_H = 24, ROW_GAP = 22, PITCH = ROW_H + ROW_GAP, HP = PITCH / 2;   // the resting pitch; it breathes live, see pitchAt
const ROW_Y0 = (PAD.x + PAD.r - OX) * K + 40;    // first vertebra centre (piece y), under the strike pad
const rowY = k => ROW_Y0 + k * PITCH;
// the idle breath: one shared A↔B timeline, every ambient layer reads off it so nothing drifts out
// of phase with anything else (ported from the "targeting/trajectory HUD" reference's animation
// model — half-cycle 1.5s, hold the first 40% at the endpoint, ease through the remaining 60%,
// alternate, ~3s full loop — rather than each layer breathing on its own independent sine).
// A = idle/compact, B = alert/expanded. 0 at u = 0, so every render of the same u agrees.
const CYCLE_HALF = 1.5, CYCLE_HOLD = .4;
function cycleAB(u) {
  const half = CYCLE_HALF, period = half * 2;
  const phase = ((u ?? 0) % period + period) % period;
  const fwd = phase < half, local = fwd ? phase : phase - half;
  const holdT = half * CYCLE_HOLD, transT = half - holdT;
  const k = (E.inOutQuint ?? io)(clamp((local - holdT) / transT));
  return fwd ? k : 1 - k;
}
// the spine's idle breath: the whole chain's spacing swells and eases back with cycleAB, anchored
// at vertebra 0 (nearest the pad, which never itself moves — only the gaps below it do)
const BREATHE_AMP = .28;
const pitchAtBreath = breath => PITCH * (1 + BREATHE_AMP * (2 * breath - 1));
// the vertebra blade: the actual vertebra <li> artwork from pieces/spine-section/source/spine-section.html
// (its .spine-left li, viewBox 105×100 — a short foot, then a two-kink diagonal blade to the far
// corner; .spine-right is its mirror). Traced down to a plain polyline — the source draws it as a
// hairline stroke rendered as a thin filled ribbon via a Figma mask trick, which isn't worth carrying
// over at this scale. The badge sits at the li's vertical midpoint (CSS top: 50%), so (52.5, 50) in
// its own viewBox is this vertebra's joint (0, 0) here; everything scales with hp, like the old rail.
const BLADE_LX = [2, 2, 32, 37, 74], BLADE_LY = [0, 44, 63, 79, 100];
const bladeD = (side, hp) => {
  const s = hp / 50;
  const pts = BLADE_LX.map((lx, i) => `${(side * (lx - 52.5) * s).toFixed(2)} ${((BLADE_LY[i] - 50) * s).toFixed(2)}`);
  return `M ${pts.join(' L ')}`;
};
const V_INNER = 11, V_STUB = 6;
const pad2 = n => String(n).padStart(2, '0');

// the 6 stations the wheel aims at (from the pre-rev typewriter build — GOAL · CONSTRAINT ·
// PREFERENCE · CONTEXT · ARTIFACT · SESSION). Dropped as on-canvas text in the SPINE rev for the
// clean numeric read, but a written entry still loses real information if it shows only "a strike
// happened" — so each gets back a small glyph instead of a name, legible as a silhouette even where
// a word wouldn't survive a thumbnail. Order matches the old station index exactly.
const STATIONS = ['GOAL', 'CONSTRAINT', 'PREFERENCE', 'CONTEXT', 'ARTIFACT', 'SESSION'];
function stationD(i, r) {
  // a regular n-gon, point-count alone carrying the distinction — a written entry pairs this shape
  // at two radii (ring, stroked; dot, filled, on top), and anything with a line through the centre
  // (an "X", a slash) gets hidden under that filled dot, so every glyph is a plain outer silhouette
  const poly = (n, rot) => {
    const pts = Array.from({ length: n }, (_, k) => { const a = rad(360 / n * k + rot); return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`; });
    return `M ${pts.join(' L ')} Z`;
  };
  switch (i) {
    case 0: return poly(6, -90);                      // GOAL — hexagon
    case 1: return poly(5, -90);                       // CONSTRAINT — pentagon
    case 2: return poly(4, -90);                       // PREFERENCE — diamond
    case 3: return `M ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 Z`; // CONTEXT — circle
    case 4: return poly(4, -45);                        // ARTIFACT — square
    default: return poly(3, -90);                       // SESSION — triangle
  }
}

const outExpo = k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
const outBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

/* ── the scripted performance (u seconds) ──
   strike GOAL · flick the ring one detent · strike CONSTRAINT twice (a repeat) ·
   (exploded) flick again · strike PREFERENCE · ↑↑ and ⌫ × 4 back to the start */
const DRAGS = [
  { t0: 0.55, t1: 1.15, a0: 35, D: -50 },        // a flick: still moving at release, the projection lands one station on
  { t0: 2.35, t1: 2.95, a0: 35, D: -50 },
];
const STRIKES = [0.25, 1.55, 1.90, 3.30];
const KEYS_UP = [3.50, 3.72];                     // ArrowUp: target steps back one station
const UNWRITES = [3.60, 3.80, 4.00, 4.20];        // ⌫: 160 ms fade, then the chip pops
const DRAG_R = 200;                               // inside the 150–246 drag annulus
const ptrAng = (d, u) => d.a0 + d.D * (1 - Math.cos(Math.PI / 2 * clamp((u - d.t0) / (d.t1 - d.t0))));

/* ── integrate the wheel once, at the source's 60 Hz ── */
const DT = 1 / 60, UMAX = 4.6, NSTEP = Math.ceil(UMAX / DT) + 2;
const armedOf = th => ((Math.round(-th / STEP) % N) + N) % N;
function stepSpring(v, vel, target, dt, k, c) {
  const a = k * (target - v) - c * vel;
  vel += a * dt; v += vel * dt;
  return [v, vel];
}
const TH = [], JB = [], SETTLES = [], STRUCK = [];
(function simulate() {
  let theta = 0, vel = 0, target = 0, drag = null, velEMA = 0, lastPtr = 0, settled = true, jab = 0, jabVel = 0;
  const at = t => Math.ceil(t / DT - 1e-9);       // the first step at or after t (integer, so no event falls between steps)
  for (let n = 0; n < NSTEP; n++) {
    const now = n * DT;
    for (const d of DRAGS) if (at(d.t0) === n) { drag = d; velEMA = 0; lastPtr = ptrAng(d, d.t0); }
    if (drag) {
      const a = ptrAng(drag, Math.min(now, drag.t1)), dd = a - lastPtr;
      theta += dd; velEMA = velEMA * .7 + (dd / DT) * .3; lastPtr = a;
      if (now >= drag.t1) {                     // pointerup: momentum projection → nearest detent
        target = Math.round((theta + velEMA * .15) / STEP) * STEP;
        vel = velEMA; velEMA = 0; drag = null; settled = false;
      }
    }
    for (const s of STRIKES) if (at(s) === n) { STRUCK.push({ at: s, i: armedOf(theta) }); jabVel = -320; }
    for (const k of KEYS_UP) if (at(k) === n) { settled = false; target = (Math.round(-theta / STEP) - 1) * -STEP; }
    if (!drag) [theta, vel] = stepSpring(theta, vel, target, DT, 180, 14);
    [jab, jabVel] = stepSpring(jab, jabVel, 0, DT, 420, 22);
    if (!drag && !settled && Math.abs(vel) < .8) { settled = true; SETTLES.push(now); }
    TH[n] = theta; JB[n] = jab;
  }
})();
/* ── STORY: the same springs, run over the control values ──
   ctl.integ hands its midpoint samples (∫₀ᵘ at a fixed step) to f in time order; recording them gives
   the control history from 0 to u, and the wheel is integrated over it exactly as the sim above.
   The strike cadence is a phase (strikes / s) integrated alongside, so it never jumps either. */
const STRIKE_EVERY = .9, STRIKE_LEAD = .75;      // first strike .225 s after STRIKE goes on
const KICK = 150;                                 // °/s of recoil the hammer gives the wheel per strike
function livePose(u, ctl) {
  const vs = [];
  ctl.integ(v => { vs.push(v); return 0; });
  const n = vs.length, dt = n ? u / n : 0;
  let theta = 0, vel = 0, jab = 0, jabVel = 0, target = 0, settled = true, phase = 0;
  const struck = [], settles = [];
  for (let k = 0; k < n; k++) {
    const v = vs[k], now = (k + 1) * dt;
    const tgt = -Math.round(v.aim / STEP) * STEP;
    if (tgt !== target) { target = tgt; settled = false; }
    const ph = phase + (v.strike ? dt / STRIKE_EVERY : 0);
    if (Math.floor(ph + STRIKE_LEAD) > Math.floor(phase + STRIKE_LEAD) && v.strike) {
      struck.push({ at: now, i: armedOf(theta) }); jabVel = -320; vel += KICK;
    }
    phase = ph;
    [theta, vel] = stepSpring(theta, vel, target, dt, DETENT_K, v.damp);
    [jab, jabVel] = stepSpring(jab, jabVel, 0, dt, 420, 22);
    if (!settled && Math.abs(vel) < .8 && Math.abs(target - theta) < 1) { settled = true; settles.push(now); }
  }
  return { theta, jab, struck, settles, line: struck.map(s => ({ i: s.i, at: s.at, fade: null })) };
}
const DETENT_K = 180;

const sample = (arr, u) => {
  const x = clamp(u, 0, UMAX) / DT, i = Math.floor(x);
  return lerp(arr[i], arr[Math.min(i + 1, arr.length - 1)], x - i);
};

// the written line at u: strikes push, ⌫ fades the tail for 160 ms then pops it
function lineAt(u) {
  const ev = [...STRUCK.map(s => ({ t: s.at, s })), ...UNWRITES.map(t => ({ t }))].sort((a, b) => a.t - b.t);
  const list = [];
  for (const e of ev) {
    if (e.t > u) break;
    if (e.s) list.push({ i: e.s.i, at: e.t, fade: null });
    else if (list.length) {
      if (u >= e.t + .16) list.pop(); else list[list.length - 1].fade = e.t;
    }
  }
  return list;
}

/* ── the finger, in piece units ── */
const PADP = P(PAD.x, PAD.y);
const REST = P(520, 420);
const grabPt = (d, u) => { const a = rad(ptrAng(d, u)); return P(CX + DRAG_R * Math.cos(a), CY + DRAG_R * Math.sin(a)); };
const ACTIONS = [
  { kind: 'tap', at: STRIKES[0] },
  { kind: 'drag', d: DRAGS[0] },
  { kind: 'tap', at: STRIKES[1] },
  { kind: 'tap', at: STRIKES[2] },
  { kind: 'drag', d: DRAGS[1] },
  { kind: 'tap', at: STRIKES[3] },
  { kind: 'park', at: 3.75 },
];
function fingerAt(u) {
  let pos = REST, free = -1;
  for (const a of ACTIONS) {
    const s = a.kind === 'drag' ? a.d.t0 : a.at;
    const to = a.kind === 'drag' ? grabPt(a.d, a.d.t0) : a.kind === 'tap' ? PADP : REST;
    const m0 = Math.max(free + .06, s - .45), m1 = a.kind === 'park' ? s : s - .04;
    if (u < m1) {
      if (u < m0 || m1 <= m0) return { x: pos[0], y: pos[1], pulse: null };
      const k = io(win(u, m0, m1));
      return { x: lerp(pos[0], to[0], k), y: lerp(pos[1], to[1], k), pulse: null };
    }
    if (a.kind === 'tap') {
      if (u < a.at + .3) return { x: to[0], y: to[1], pulse: win(u, a.at, a.at + .5), tap: { layer: 'pad' } };
      pos = to; free = a.at + .3;
    } else if (a.kind === 'drag') {
      if (u <= a.d.t1) { const [x, y] = grabPt(a.d, u); return { x, y, down: true, layer: 'input' }; }
      pos = grabPt(a.d, a.d.t1); free = a.d.t1;
    } else { pos = to; free = a.at; }
  }
  return { x: pos[0], y: pos[1], pulse: null };
}

/* ── ring geometry helpers ── */
const ringPt = (r, deg) => P(CX + r * Math.cos(rad(deg)), CY + r * Math.sin(rad(deg)));
const tickOut = deg => ringPt(R_TICK, deg);
// a point `r` source units right of piece point q (upright parts keep their source widths)
const edgeR = (q, r) => [q[0] + r * K, q[1]];
const TICK_N = 24;                                // the degree scale: a tick every 15°, heavy every 60° (a station)

registerPiece({
  id: 'daisy-wheel',
  code: 'DSY-09', series: 'B', n: '09',
  name: 'DAISY WHEEL',
  mechanic: 'ROTATE TO AIM · STRIKE TO WRITE',
  source: 'COMPONENTS/INTERACTION/DAISY-WHEEL',
  hero: { v: '6', u: 'STATIONS · 60° DETENTS' },
  extent: 300,
  spec: [
    ['INPUT',  'DRAG RING · STRIKE · UNWRITE'],
    ['STATE',  '1 ANGLE · SEQUENCE WITH REPEATS'],
    ['MOTION', 'DETENT 180/14 · FLICK × .15 S'],
    ['BUILT',  'SVG · EULER SPRINGS · ANIME.JS 4'],
  ],
  layers: [
    { id: 'chrome',  name: 'CHROME',       note: '24 TICKS · DEGREE SCALE',  edge: 160 },
    { id: 'readout', name: 'READOUT',      note: 'ARMED STATION · CENTRE',   edge: 90 },
    { id: 'pad',     name: 'STRIKE PAD',   note: "6 O'CLOCK · 270° ARC",     edge: 50 },
    { id: 'spine',   name: 'SPINE',        note: 'WRITTEN LINE · VERTEBRAE', edge: 90 },
    { id: 'input',   name: 'INPUT',        note: 'DRAG RING · TAP STRIKE',   edge: 300 },
  ],
  // the spine runs straight down from the strike pad: anchors sit on its right edge, leaders run
  // right, so they stack top to bottom without crossing
  calloutRoute: 'right',
  callouts: [
    { at: tickOut(-110),                     title: 'DEGREE SCALE', note: '24 TICKS · HEAVY EVERY 60°' },
    { at: ringPt(R_FRAME + 14, 180),         title: 'AIM MARK',      note: "FIXED · OPPOSITE THE PAD" },
    { at: P(CX, CY - 40),                    title: 'ARMED STATION', note: 'CENTRE READOUT' },
    { at: edgeR(PADP, PAD.r + 2),             title: 'STRIKE PAD',    note: 'TAP = COMMIT' },
    { at: edgeR([PADP[0], rowY(1)], 24),      title: 'WRITTEN LINE',  note: 'SPINE · REPEATS ALLOWED' },
    { at: edgeR([PADP[0], rowY(ROWS)], 24),   title: 'NEXT SLOT',     note: 'NEXT STRIKE LANDS HERE' },
  ],
  // STORY: the source's damp slider, plus an aim and a strike for the finger to work
  controls: [
    { id: 'strike', label: 'STRIKE', kind: 'toggle', min: 0, max: 1,   value: 0,  fmt: v => v ? 'AUTO' : 'OFF' },
    { id: 'aim',    label: 'AIM',    kind: 'knob',   min: 0, max: 300, value: 0,  fmt: v => `${String(Math.round(v)).padStart(3, '0')}°` },
    { id: 'damp',   label: 'DAMP',   kind: 'knob',   min: 4, max: 40,  value: 14, fmt: v => `${v.toFixed(1).padStart(4, '0')} /S` },
  ],
  story: {
    tweaks: [
      { id: 'strike', to: 1 },     // the head starts writing GOAL, GOAL ×2, ×3 …
      { id: 'aim',    to: 120 },   // the wheel springs two detents on; PREFERENCE is armed and written
      { id: 'damp',   to: 4 },     // each strike's recoil now rings the wheel, and θ swings
      { id: 'aim',    to: 240 },   // underdamped, the wheel overshoots through the detents to ARTIFACT
    ],
  },
  specU: 2.3,
  exploded: { live: 4.4 },
  assembly: {
    // the strike pad first: it is the fixed point, and the last dot standing
    seeds: [PADP, P(CX, CY), ringPt(R_FRAME, 180), ringPt(R_FRAME, 90), ringPt(R_FRAME, 270), [PADP[0], rowY(0)]],
    live: 2.8,
    end: 2.33,                                   // after the repeat strike, before the second flick
    draw: t => {
      const out = (a, b) => dOff(t, a, b);
      return {
        frame: dOn(t, .7, 1.6) * out(6.5, 7.2),
        inner: dOn(t, .9, 1.4) * out(6.4, 6.9),
        ticks: Array.from({ length: TICK_N }, (_, i) => {
          const a = .9 + stag(i, TICK_N, 1.1 / TICK_N), b = 6.0 + stag(TICK_N - 1 - i, TICK_N, .9 / TICK_N);
          return dOn(t, a, a + .35) * out(b, b + .35);
        }),
        labels: dOn(t, 1.6, 2.2) * out(6.2, 6.6),
        mark: dOn(t, 1.1, 1.7) * out(6.3, 6.8),
        lineLabel: dOn(t, 1.0, 1.6) * out(6.6, 7.1),
        readout: dOn(t, 2.2, 2.7) * out(5.9, 6.3),
        pad: dOn(t, 1.5, 2.1) * out(6.2, 6.7),
        spine: Array.from({ length: ROWS + 1 }, (_, i) =>
          dOn(t, 1.7 + stag(i, ROWS + 1, .08), 1.9 + stag(i, ROWS + 1, .08)) *
          out(5.9 - stag(i, ROWS + 1, .05), 6.3 - stag(i, ROWS + 1, .05))),
        // the stack-spring (ported from spine-section's hover expand): each vertebra pops to full
        // opacity fast (`spine`, above) and then — already visible — slides from the collapsed stack
        // out to its resting slot over a longer, later window, eased with outBack so it overshoots
        // and settles like the source's CSS spring. Opacity and position deliberately don't share a
        // window: if they fade in and slide at once, the slide is mostly hidden under low opacity and
        // reads as nothing happening — it only shows up when scrubbed frame by frame.
        spineOpen: Array.from({ length: ROWS + 1 }, (_, i) =>
          outBack(win(t, 1.9 + stag(i, ROWS + 1, .12), 3.1 + stag(i, ROWS + 1, .12)))),
      };
    },
  },

  build(L, sw) {
    const h = {};
    const [pcx, pcy] = P(CX, CY);
    const micro = (parent, x, y, s, extra = {}) => txt(parent, x, y, s, { 'font-size': 6.5, 'letter-spacing': 1.6, 'dominant-baseline': 'middle', class: 'dim', ...extra });

    /* ring ("scope"): dotted frame, a degree scale (heavy every 60°, a station), the dashed inner
       boundary, a fixed aim mark at the head's bearing (opposite the strike pad), and two cardinal
       flares — all in one group so it can grow/shrink as a unit (see h.scope in apply, cycleAB) the
       way the reference's scope wrapper animates from ~103×107 to ~147×152 */
    h.scope = el('g', {}, L.chrome);
    h.frame = drawable(el('circle', { cx: pcx, cy: pcy, r: R_FRAME * K, fill: 'none', class: 'minor', 'stroke-width': sw.minor, 'stroke-dasharray': '1 6' }, h.scope));
    h.inner = drawable(el('circle', { cx: pcx, cy: pcy, r: R_INNER * K, fill: 'none', class: 'minor', 'stroke-width': sw.minor, 'stroke-dasharray': '1.5 5' }, h.scope));
    h.ticks = [];
    for (let i = 0; i < TICK_N; i++) {
      const deg = i * (360 / TICK_N), isStation = deg % STEP === 0;
      const r1 = R_TICK, r2 = isStation ? R_TICK - 16 : R_TICK - 6;
      const [x1, y1] = ringPt(r1, deg), [x2, y2] = ringPt(r2, deg);
      h.ticks.push(el('line', {
        x1, y1, x2, y2,
        class: isStation ? 'mid' : 'minor',
        'stroke-width': sw.minor * (isStation ? 1.3 : .8),
        'stroke-opacity': isStation ? 1 : .6,
      }, h.scope));
    }
    // detent angles, measured from the head (000 sits at the head, so it is left out)
    h.degs = Array.from({ length: N - 1 }, (_, j) => {
      const deg = (j + 1) * STEP, [x, y] = ringPt(R_FRAME + 14, deg);
      return micro(h.scope, x, y, String(deg).padStart(3, '0') + '°', { 'text-anchor': 'middle', 'font-size': 7, 'letter-spacing': 1 });
    });
    // the aim mark: fixed at the head's bearing (180°, directly opposite the strike pad at the bottom)
    h.mark = el('g', {}, h.scope);
    {
      const [tx1, ty1] = ringPt(R_FRAME - 16, 180), [tx2, ty2] = ringPt(R_FRAME + 4, 180), [dx, dy] = ringPt(R_FRAME + 14, 180);
      el('line', { x1: tx1, y1: ty1, x2: tx2, y2: ty2, class: 'ink', 'stroke-width': sw.main }, h.mark);
      h.markDot = el('circle', { cx: dx, cy: dy, r: 3, class: 'ink icondot' }, h.mark);
    }
    h.sideL = (() => {
      const [x1, y1] = ringPt(R_FRAME + 2, 90), [x2, y2] = ringPt(R_FRAME + 22, 90), [dx, dy] = ringPt(R_FRAME + 26, 90);
      const g = el('g', {}, h.scope);
      el('line', { x1, y1, x2, y2, class: 'mid', 'stroke-width': sw.minor }, g);
      el('circle', { cx: dx, cy: dy, r: 2, class: 'mid icondot' }, g);
      return g;
    })();
    h.sideR = (() => {
      const [x1, y1] = ringPt(R_FRAME + 2, 270), [x2, y2] = ringPt(R_FRAME + 22, 270), [dx, dy] = ringPt(R_FRAME + 26, 270);
      const g = el('g', {}, h.scope);
      el('line', { x1, y1, x2, y2, class: 'mid', 'stroke-width': sw.minor }, g);
      el('circle', { cx: dx, cy: dy, r: 2, class: 'mid icondot' }, g);
      return g;
    })();
    // the drag ring: INPUT says "DRAG RING" but nothing on the ring itself used to hint it's
    // grabbable. A dashed track at the actual drag radius (DRAG_R, where the finger grips in the
    // performance) plus 8 short grip ticks reads as a rotate affordance, the way a volume ring would
    h.dragRing = el('circle', { cx: pcx, cy: pcy, r: DRAG_R * K, fill: 'none', class: 'minor', 'stroke-width': sw.minor, 'stroke-dasharray': '2 7' }, h.scope);
    h.dragTicks = Array.from({ length: 8 }, (_, i) => {
      const deg = i * 45, [x1, y1] = ringPt(DRAG_R - 7, deg), [x2, y2] = ringPt(DRAG_R + 7, deg);
      return el('line', { x1, y1, x2, y2, class: 'minor', 'stroke-width': sw.minor }, h.scope);
    });
    // corner brackets (adopted from components/motion/scifi-frame — four short angled marks framing
    // the plate like a viewfinder, drawn on with the rest of the chrome; the source's own blur-pulse
    // filter is dropped, the house style keeps flat vectors, but the draw-on + a breath-locked pulse
    // and a small outward snap on the B state reads as the same "lock-on" moment)
    h.corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
      const len = 22;
      const d = `M ${-sx * len} 0 L 0 0 L 0 ${-sy * len}`;
      const g = el('g', { transform: `translate(${sx * 272} ${sy * 272})` }, L.chrome);
      el('path', { d, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      return { g, sx, sy };
    });
    // LINE counter, upper-left of the ring
    const [llx, lly] = ringPt(R_FRAME * .78, 128);
    h.lineLabel = micro(L.chrome, llx, lly - 10, 'LINE', { 'font-size': 7 });
    h.lineCount = txt(L.chrome, llx, lly + 10, '00', { class: 'disp', 'font-size': 20, 'font-weight': 300 });

    // legend, upper-right (mirrors LINE counter's spot) — a Patch legend (components/Patch/components
    // /legend: a swatch + a label, stacked), reading the spine's three states back as a key rather
    // than leaving them to be learned by watching: a written slot, the next slot armed to receive a
    // strike, an open slot not yet reached
    const [lgx, lgy] = ringPt(R_FRAME * .78, 232);
    h.legendG = el('g', {}, L.chrome);
    h.legend = [
      ['accf', true, 1, 'WRITE'],
      ['ink', false, .9, 'NEXT'],
      ['minor', false, .4, 'OPEN'],
    ].map(([cls, filled, op, label], i) => {
      const y = lgy - 10 + i * 11;
      const attrs = { cx: lgx - 5, cy: y, r: 2.4, class: cls, 'stroke-width': sw.minor, opacity: op };
      if (!filled) attrs.fill = 'none';
      const mark = el('circle', attrs, h.legendG);
      micro(h.legendG, lgx + 4, y, label, { 'font-size': 6 });
      return mark;
    });

    /* readout: ARMED STATION, the armed index (amber, like a selected track index), and a decorative
       sub-scale underneath — no name or live angle text, the ring stays purely numeric.
       The caption row borrows Patch's node-card header (components/Patch/components/node-card —
       a hairline under the title, an LED before it): the rule separates "what this is" from the
       number the way a card separates its head from its body, and the LED lights exactly while a
       strike is landing, standing in for the card's own connected/bypassed status. */
    h.ro = el('g', {}, L.readout);
    micro(h.ro, pcx, pcy - 52, 'ARMED STATION', { 'text-anchor': 'middle' });
    h.roLed = el('circle', { cx: pcx - 46, cy: pcy - 53, r: 1.8, class: 'minor icondot' }, h.ro);
    el('line', { x1: pcx - 40, x2: pcx + 40, y1: pcy - 45, y2: pcy - 45, class: 'minor', 'stroke-width': sw.minor }, h.ro);
    h.roIdx = txt(h.ro, pcx, pcy - 10, '01', { class: 'disp accf', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 46, 'font-weight': 200 });
    for (let k = 0; k < 7; k++) el('line', { x1: pcx - 24 + k * 8, x2: pcx - 24 + k * 8, y1: pcy + 36, y2: pcy + 36 - (k % 3 === 0 ? 6 : 3), class: 'minor', 'stroke-width': sw.minor }, h.ro);

    /* strike pad: a knob-styled dial (matches the panel's own AIM/DAMP glyph) — a hollow ring, an
       always-filled accent centre, and the jab's 270° arc. No label inside it: the control panel
       already names STRIKE directly below, and anything smaller wouldn't survive a post thumbnail. */
    h.chevron = el('path', { d: 'M -7 5 L 0 -8 L 7 5 Z', class: 'accf' }, L.pad);
    h.chevron.setAttribute('transform', `translate(${PADP[0]} ${PADP[1] - PAD.r * K - 16})`);
    h.stem = el('line', { x1: PADP[0], x2: PADP[0], y1: PADP[1] + PAD.r * K, y2: rowY(0) - HP, class: 'minor', 'stroke-width': sw.minor }, L.pad);
    h.pad = drawable(el('circle', { cx: PADP[0], cy: PADP[1], r: PAD.r * K, fill: 'none', class: 'ink', 'stroke-width': sw.main * 1.2 }, L.pad));
    h.padRing = el('circle', { cx: PADP[0], cy: PADP[1], r: PAD.r * K * .58, class: 'accf' }, L.pad);
    h.ripple = el('circle', { cx: PADP[0], cy: PADP[1], r: 0, fill: 'none', class: 'acc', 'stroke-width': sw.minor * 1.2, opacity: 0 }, L.pad);
    // the pad doubles as a knob: a 270° track whose arc fills while the strike jab is in flight
    const PR = PAD.r * K + 8;
    const park = a => [PADP[0] + Math.cos(rad(a)) * PR, PADP[1] + Math.sin(rad(a)) * PR];
    h.padArcD = a1 => {
      const [x0, y0] = park(-135), [x1, y1] = park(a1), sweep = ((a1 + 135) % 360 + 360) % 360;
      return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${PR} ${PR} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    };
    h.padTrack = el('path', { d: h.padArcD(135), fill: 'none', class: 'minor', 'stroke-width': sw.minor }, L.pad);
    h.padArc = el('path', { d: h.padArcD(135), fill: 'none', class: 'acc', 'stroke-width': sw.main * 1.3, 'stroke-linecap': 'round' }, L.pad);

    /* the spine: a vertical chain of vertebrae, one per slot (ROWS written + 1 next), redrawn from
       the actual spine_dial.svg reference — not isolated floating brackets, but two straight rails
       running the length of the column with a small rectangular notch cut in at each joint (tick
       stubs + a centre dot sitting inside the notch). Each vertebra's rail spans exactly half a
       pitch above and below its own joint, so at rest adjacent units' rails meet edge to edge and
       read as one continuous interlocking spine, the way the reference does.
       The entrance is ported from spine-section's own hover animation (pieces/spine-section/source/
       spine-section.html — the .spine-left/.spine-right <li>s sit stacked at margin-top: -80px of
       their 100px height, an 80% overlap, and spring out to margin-top: 0 on hover): here the stack
       springs open once, on entrance, each vertebra starting bunched 20% of the way down the chain
       and easing out (outBack, so it overshoots and settles like the source's spring) to its resting
       slot as the piece draws on. After that it keeps breathing: the whole chain's pitch swells and
       eases back continuously (pitchAt), so the gaps visibly widen and narrow rather than sitting
       static — the blades are redrawn every frame to the live half-pitch so their joints still meet.
       The centre marker encodes state through its shape: a filled station glyph (hexagon · circled
       slash · diamond · circle · square · triangle, one per station — see STATIONS/stationD above)
       for a written entry, the same glyph hollow and blinking for the armed station on the next slot
       (a preview of what a strike would write here), or a plain hollow dot for a future slot, where
       nothing is known yet. */
    function vertebra(k) {
      const g = el('g', { transform: `translate(${PADP[0]} ${rowY(k)})` }, L.spine);
      const bladeL = el('path', { d: bladeD(-1, HP), fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      const bladeR = el('path', { d: bladeD(1, HP), fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      const tickL = el('line', { x1: -V_INNER, x2: -V_STUB, y1: 0, y2: 0, class: 'minor', 'stroke-width': sw.minor }, g);
      const tickR = el('line', { x1: V_INNER, x2: V_STUB, y1: 0, y2: 0, class: 'minor', 'stroke-width': sw.minor }, g);
      const ring = el('path', { d: stationD(3, 5.5), fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      const dot = el('path', { d: stationD(3, 3.2), fill: 'none' }, g);
      return { g, bladeL, bladeR, tickL, tickR, ring, dot, k };
    }
    h.spine = Array.from({ length: ROWS + 1 }, (_, k) => vertebra(k));
    // the chain's loose end: a short stem down to an open Patch-style port (components/Patch/components/port
    // — a hollow jack, unconnected; "pending" there is an amber halo at 4px/18% opacity). The spine's
    // open end reads the same way: a signal path still waiting for its next write, so it pings on a
    // loop instead of sitting inert — reusing the strike ripple's own outExpo rather than a new curve.
    h.tailStem = el('line', { x1: PADP[0], x2: PADP[0], y1: rowY(ROWS) + HP, y2: rowY(ROWS) + HP + 14, class: 'minor', 'stroke-width': sw.minor }, L.spine);
    h.tailDot = el('circle', { cx: PADP[0], cy: rowY(ROWS) + HP + 14, r: 3.2, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, L.spine);
    h.tailHalo = el('circle', { cx: PADP[0], cy: rowY(ROWS) + HP + 14, r: 3.2, fill: 'none', class: 'acc', 'stroke-width': sw.minor }, L.spine);

    // colour rule, broken (rev C): the piece owns its hue — amber, the accent ink of its route —
    // so the mode accents and selected fills render in it, in every mode.
    el('style', {}, L.chrome.ownerSVGElement).textContent =
      '.acc{stroke:#E8B04A}.accf{fill:#E8B04A}.on .disc{fill:#E8B04A}.on .ink{stroke:#E8B04A}.on .accf{fill:#E8B04A}';
    return h;
  },

  pose(u, ctl) {
    // live on the controls (STORY): the wheel and the jab are integrated over the control history,
    // strikes come from the STRIKE cadence. Otherwise: the scripted flicks, strikes and unwrites.
    const live = ctl ? livePose(u, ctl) : null;
    const STR = live ? live.struck : STRUCK, SET = live ? live.settles : SETTLES;
    const line = live ? live.line : lineAt(u);
    line.forEach((c, j) => { c.rep = 1 + line.slice(0, j).filter(q => q.i === c.i).length; });
    const lastStrikeAt = line.length ? line[line.length - 1].at : -1;
    const wear = new Array(N).fill(0);
    line.forEach(c => wear[c.i]++);
    const flash = new Array(N).fill(0);
    let ripple = null;
    for (const s of STR) if (s.at <= u) {
      flash[s.i] = Math.max(flash[s.i], 1 - 3 * (u - s.at));
      if (u - s.at < .58) ripple = (u - s.at) / .58;
    }
    let bounce = 0;
    for (const st of SET) if (st <= u && u - st < .32) bounce = 4 * (1 - outBack((u - st) / .32));
    const theta = live ? live.theta : sample(TH, u);
    return { u, theta, jab: live ? live.jab : sample(JB, u), armed: armedOf(theta), line, wear, flash, ripple, bounce, lastStrikeAt };
  },

  finger(u) { return fingerAt(u); },

  apply(h, p, D) {
    D = D || {};
    const one = k => (k === undefined ? 1 : k);
    // the shared breath (cycleAB): 0 = idle/compact, 1 = alert/expanded. The scope, the spine's pitch
    // (pitchAt, used below), the corner brackets and the readout all read off this one value, so they
    // stay phase-locked instead of drifting apart on independent timers.
    // SPEC has no clock (p.t is absent) and its callouts are anchored to the unscaled base geometry,
    // so it's pinned to 0 — the clean reference frame — rather than whatever cycleAB(specU) lands on.
    const breath = p.t == null ? 0 : cycleAB(p.u);
    const [pcx, pcy] = P(CX, CY);
    const striking = p.ripple != null && p.ripple < .45;

    setDraw(h.frame, one(D.frame));
    setDraw(h.inner, one(D.inner));
    h.ticks.forEach((t, i) => t.setAttribute('opacity', D.ticks ? D.ticks[i] : 1));
    h.degs.forEach(d => d.setAttribute('opacity', one(D.labels)));
    h.scope.setAttribute('transform', `translate(${pcx} ${pcy}) scale(${1 + .12 * breath}) translate(${-pcx} ${-pcy})`);
    h.mark.setAttribute('opacity', one(D.mark));
    h.markDot.setAttribute('r', 3 + p.bounce * 1.2);
    h.sideL.setAttribute('opacity', one(D.mark));
    h.sideR.setAttribute('opacity', one(D.mark));
    h.dragRing.setAttribute('opacity', one(D.mark) * .5);
    h.dragTicks.forEach(t => t.setAttribute('opacity', one(D.mark) * .5));
    h.lineLabel.setAttribute('opacity', one(D.lineLabel));
    h.lineCount.setAttribute('opacity', one(D.lineLabel));
    h.lineCount.textContent = pad2(p.line.length);
    h.legendG.setAttribute('opacity', one(D.lineLabel));

    // readout: the armed index, amber, like a selected track index — breathes with the scope (a
    // subtle scale + opacity lift, not a full hide: the number is the one thing worth always reading).
    // the header LED lights exactly while a strike is landing, like a node-card's connected state.
    h.roIdx.textContent = pad2(p.armed + 1);
    h.ro.setAttribute('opacity', one(D.readout) * (.88 + .12 * breath));
    h.ro.setAttribute('transform', `translate(${pcx} ${pcy}) scale(${.97 + .03 * breath}) translate(${-pcx} ${-pcy})`);
    h.roLed.setAttribute('class', striking ? 'acc accf' : 'minor icondot');

    // strike pad: the chevron pops on the strike itself; the jab's 270° arc fills while the hammer is in flight
    setDraw(h.pad, one(D.pad));
    const pop = p.ripple != null ? 1 - outExpo(p.ripple) : 0;
    h.chevron.setAttribute('transform', `translate(${PADP[0]} ${PADP[1] - PAD.r * K - 16 - pop * 3}) scale(${1 + pop * .35})`);
    h.chevron.setAttribute('opacity', one(D.pad));
    h.stem.setAttribute('y2', ROW_Y0 - pitchAtBreath(breath) / 2);
    h.stem.setAttribute('opacity', one(D.pad));
    h.padRing.setAttribute('opacity', one(D.pad));
    const pk = clamp(-p.jab / 15, 0, 1);
    h.padArc.setAttribute('d', h.padArcD(-135 + 270 * Math.max(pk, .012)));
    h.padArc.setAttribute('opacity', (striking ? 1 : .3) * one(D.pad));
    h.padTrack.setAttribute('opacity', one(D.pad));
    if (p.ripple != null) {
      h.ripple.setAttribute('r', PAD.r * K + 22 * outExpo(p.ripple));
      h.ripple.setAttribute('opacity', .8 * (1 - outExpo(p.ripple)) * one(D.pad));
    } else h.ripple.setAttribute('opacity', 0);

    // the spine: the last ROWS entries, newest nearest the pad; the next write slot follows them.
    // the chain breathes continuously (pitchAt) — the live pitch drives both each vertebra's slot
    // and its blades' own ±hp span, so adjacent blades keep meeting exactly as the gap widens/narrows
    const start = Math.max(0, p.line.length - ROWS);
    const vis = p.line.slice(start);
    const slot = Math.min(vis.length, ROWS);
    const blink = p.t == null || Math.floor(p.t * 2) % 2 === 0;
    const livePitch = pitchAtBreath(breath), liveHP = livePitch / 2;
    h.spine.forEach((v, k) => {
      const op = D.spine ? D.spine[k] : 1;
      const open = D.spineOpen ? D.spineOpen[k] : 1;
      const restY = ROW_Y0 + v.k * livePitch, collapsedY = ROW_Y0 + v.k * livePitch * .2;
      v.g.setAttribute('transform', `translate(${PADP[0]} ${lerp(collapsedY, restY, open)})`);
      v.bladeL.setAttribute('d', bladeD(-1, liveHP));
      v.bladeR.setAttribute('d', bladeD(1, liveHP));
      v.tickL.setAttribute('opacity', op); v.tickR.setAttribute('opacity', op);
      const blade = (cls, bladeOp) => { v.bladeL.setAttribute('class', cls); v.bladeR.setAttribute('class', cls); v.bladeL.setAttribute('opacity', bladeOp); v.bladeR.setAttribute('opacity', bladeOp); };
      if (k < vis.length) {
        const item = vis[k];
        let a = oq(win(p.u, item.at, item.at + .26));
        if (item.fade != null) a *= 1 - oq(win(p.u, item.fade, item.fade + .16));
        const tail = start + k === p.line.length - 1;
        blade(tail ? 'mid' : 'minor', op);
        v.ring.setAttribute('d', stationD(item.i, 5.5));
        v.ring.setAttribute('class', 'acc');
        v.ring.setAttribute('opacity', a * op);
        v.dot.setAttribute('d', stationD(item.i, 3.2));
        v.dot.setAttribute('class', 'accf');
        v.dot.removeAttribute('fill');
        v.dot.setAttribute('opacity', a * op);
      } else if (k === slot) {
        // a preview, not a placeholder: the armed station's own glyph, hollow and blinking — this is
        // exactly what a strike would write here right now
        blade('minor', op * .8);
        v.ring.setAttribute('d', stationD(p.armed, 5.5));
        v.ring.setAttribute('class', 'ink'); v.ring.setAttribute('opacity', (blink ? 1 : .35) * op);
        v.dot.setAttribute('d', stationD(p.armed, 3.2));
        v.dot.setAttribute('fill', 'none'); v.dot.setAttribute('opacity', 0);
      } else {
        blade('minor', op * .35);
        v.ring.setAttribute('d', stationD(3, 5.5));
        v.ring.setAttribute('class', 'minor'); v.ring.setAttribute('opacity', op * .35);
        v.dot.setAttribute('d', stationD(3, 3.2));
        v.dot.setAttribute('fill', 'none'); v.dot.setAttribute('opacity', op * .5);
      }
    });
    const tailOp = D.spine ? D.spine[ROWS] : 1;
    const tailY0 = ROW_Y0 + ROWS * livePitch + liveHP, tailY = tailY0 + 14;
    h.tailStem.setAttribute('y1', tailY0); h.tailStem.setAttribute('y2', tailY);
    h.tailDot.setAttribute('cy', tailY);
    h.tailStem.setAttribute('opacity', tailOp);
    h.tailDot.setAttribute('opacity', tailOp);
    // the open port's ping: a slow radar pulse, looping, independent of any strike
    const ping = (p.u % 1.6) / 1.6;
    h.tailHalo.setAttribute('cy', tailY);
    h.tailHalo.setAttribute('r', 3.2 + 10 * outExpo(ping));
    h.tailHalo.setAttribute('opacity', .5 * (1 - outExpo(ping)) * tailOp);

    // corner brackets: draw on with the rest of the chrome, then breathe with the shared cycle — the
    // scifi-frame glow pulse, reread as a plain opacity cycle (the house style avoids filters) and
    // phase-locked to `breath` instead of running on its own independent timer. On B they also snap
    // outward a few units, like a viewfinder racking focus onto its lock.
    h.corners.forEach(c => {
      c.g.setAttribute('transform', `translate(${c.sx * (272 + 6 * breath)} ${c.sy * (272 + 6 * breath)})`);
      c.g.setAttribute('opacity', one(D.mark) * (.8 + .2 * breath));
    });
  },
});

})();
