/* ─────────────────────────────────────────────────────────────
   PIECE · GEAR LOCK (LCK-14)
   components/interaction/gear-lock — aim · lock · commit, redrawn as layered SVG the way
   daisy-wheel and geared-reticle-patch redraw their own sources. The master ring (×1, the one you
   drag) and a dashed counter-gear (×−1.3, decorative) share one angle, θ; the aim — parallax's own
   Reticle shape now, not a gradient ring-pair — rides the master ring at a fixed radius. Six target
   zones sit at the 60° stations, each a tolerance arc (±14°, drawn at its true angular width) plus
   a glyph keyed by index — the same hexagon/pentagon/diamond/circle/square/triangle set daisy-wheel
   uses for its stations, reused here for its own six targets.
     · drag the master ring to aim
     · tap the centre pad to commit a lock — in range, it's added to the sequence; out of range,
       a miss flash; already locked, a no-op
     · the sequence strip across the bottom holds up to six commits in order; UNDO reverts the last
   Everything is a pure function of u: θ is a direct eased drag-follow (the real mechanic has no
   detent spring — it holds wherever you release it), and lock/undo are a sorted event list replayed
   up to u, exactly as daisy-wheel's written line replays STRIKES/UNWRITES.
   STORY drives θ with a critically-damped spring toward the AIM knob instead (DAMP is its damping,
   same convention as daisy-wheel's own AIM/DAMP), and LOCK is a cadence like daisy-wheel's STRIKE.

   Rev PARALLAX: rebuilt to look and function like pieces/parallax (PLX-12) — all six of its rings,
   literal markup (same path data / circle radii / dasharrays as the real files), mounted at
   parallax's own absolute radii (this extent-300 frame matches its scale exactly), monochrome
   throughout (no accent hue — "locked" now reads as brightness/fill, not colour, the same way
   parallax itself carries no identity hue). The field is one more state than parallax has, though:
   it opens (parallax's own scale/opacity) the instant nothing is locked, and closes down to a
   near-invisible hint the instant a target is held — "looks like a dial when locked, expands into
   the parallax animation when unlocked." fieldChangedAt below is the last time committed.length
   crossed the 0 ↔ >0 line; pose() turns the time since into an eased 0..1 open/close value, the
   deterministic equivalent of the standalone component's own CSS transition on #field.
   Each ring still drifts on its own rate and gets pushed by the aim's own direction — parallax.js's
   translate(px·depth·amp), the aim standing in for the pointer, depths/turns/amp all taken straight
   from pieces/parallax/piece.js's own RINGS.
   mount() below fixes a real bug found while building this: translate(-cx,-cy) scale(ratio) only
   recentres correctly when ratio≈1 — a point maps to ratio·p − (cx,cy) instead of ratio·(p − (cx,cy)),
   leaving a residual offset of cx·(ratio−1). pieces/parallax/piece.js's own mount() has the same
   ordering, so it likely carries the same latent mis-centring on anything whose ratio isn't close
   to 1 (bezel/accent/frame/reticle) — worth fixing there too, separately.
   ───────────────────────────────────────────────────────────── */
(() => {

const N = 6, STEP = 360 / N, TOLERANCE = 14;
const RADIUS = 174;                                   // target ring + the radius the aim rides at
const R_BEZEL = 240, R_TICK = 224, R_GEARB = 200, R_GEARA = 172, R_ARC = 192;
const pol = (r, a) => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];   // 0° = 12 o'clock, clockwise
function arcD(r, a0, a1) {
  const [x0, y0] = pol(r, a0), [x1, y1] = pol(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const wrap = d => ((d % 360) + 360) % 360;
const pad2 = n => String(n).padStart(2, '0');

// the six target glyphs — one silhouette per index, legible even filled small (after daisy-wheel's
// STATIONS convention: point-count alone carries the distinction, nothing needs a slash through it)
function targetGlyph(i, r) {
  const poly = (n2, rot) => {
    const pts = Array.from({ length: n2 }, (_, k) => { const a = rad(360 / n2 * k + rot); return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`; });
    return `M ${pts.join(' L ')} Z`;
  };
  switch (i) {
    case 0: return poly(6, 0);                          // hexagon
    case 1: return poly(5, 0);                           // pentagon
    case 2: return poly(4, 0);                            // diamond
    case 3: return `M ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 Z`;  // circle
    case 4: return poly(4, 45);                            // square
    default: return poly(3, 0);                            // triangle
  }
}
const outExpo = k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
const outBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

/* ── the field: all six of parallax's own rings (pieces/parallax/piece.js's RINGS), same depths,
   turns and radii — this piece's extent (300) is the same frame parallax itself renders into. ── */
const FIELD = [
  { id: 'hero',    r: 280, depth: .6, turns:  1, cx: 264,   cy: 264,    nativeR: 260 },
  { id: 'bezel',   r: 225, depth: 1.6, turns: -2, cx: 404,   cy: 405,    nativeR: 404 },
  { id: 'dotted',  r: 170, depth: 2.6, turns:  3, cx: 177.5, cy: 177.5,  nativeR: 174.5 },
  { id: 'accent',  r: 120, depth: 3.6, turns: -3, cx: 200,   cy: 200,    nativeR: 199 },
  { id: 'frame',   r:  85, depth: 4.6, turns:  2, cx: 200,   cy: 200,    nativeR: 194.5 },
  { id: 'reticle', r:  45, depth: 5.6, turns: -4, cx: 224.5, cy: 223.17, nativeR: 16.37 },
];
const FIELD_AMP = 4.2;         // parallax's own AMP — this frame matches its scale exactly
const FIELD_CLOSED = { scale: .5, op: .07 };
const FIELD_OPEN = { scale: 1, op: .55 };
const FIELD_TRANS = 1.0;       // seconds — the deterministic equivalent of the standalone's 1.3s CSS transition

/* ── the scripted performance (u seconds): lock target 0 (field closes) · drag onto target 5 and
   lock it (stays closed) · undo twice back to nothing held (field reopens on the second) · drag
   while open and miss · drag onto target 3 and lock it (field closes again) ── */
const DRAGS = [
  { t0: .9,   t1: 1.5,  a0: 0,   a1: 300 },
  { t0: 3.3,  t1: 3.8,  a0: 300, a1: 200 },
  { t0: 4.15, t1: 4.55, a0: 200, a1: 180 },
];
const LOCKS = [.4, 1.8, 4.05, 4.8];
const UNDOS = [2.4, 2.9];
const UMAX = 5.1;

function thetaAt(u) {
  let theta = 0;
  for (const d of DRAGS) {
    if (u <= d.t0) return theta;
    if (u < d.t1) return lerp(d.a0, d.a1, io(win(u, d.t0, d.t1)));
    theta = d.a1;
  }
  return theta;
}
function nearest(theta) {
  const t = wrap(theta);
  let best = 0, bd = Infinity;
  for (let i = 0; i < N; i++) {
    const raw = Math.abs(t - i * STEP), d = Math.min(raw, 360 - raw);
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: bd };
}
// replay LOCK/UNDO events up to u — a lock commits if in range and not already held, a miss is
// recorded otherwise, an already-locked target is a silent no-op; undo pops the most recent commit.
// fieldChangedAt tracks the last time committed.length crossed the 0 ↔ >0 line (open ↔ closed).
function commitsAt(u) {
  const committed = [], lockedSet = new Set(), misses = [];
  let fieldChangedAt = -Infinity;
  const events = [...LOCKS.map(t => ({ t, kind: 'lock' })), ...UNDOS.map(t => ({ t, kind: 'undo' }))].sort((a, b) => a.t - b.t);
  for (const e of events) {
    if (e.t > u) break;
    const wasOpen = committed.length === 0;
    if (e.kind === 'undo') { const last = committed.pop(); if (last) lockedSet.delete(last.i); }
    else {
      const { i, d } = nearest(thetaAt(e.t));
      if (d > TOLERANCE) misses.push(e.t);
      else if (!lockedSet.has(i)) { committed.push({ i, at: e.t }); lockedSet.add(i); }
    }
    if (wasOpen !== (committed.length === 0)) fieldChangedAt = e.t;
  }
  return { committed, lockedSet, misses, fieldChangedAt };
}

/* ── STORY: θ springs toward the AIM control (critically-damped by DAMP); LOCK is a cadence, like
   daisy-wheel's STRIKE. ctl.integ hands the midpoint samples to f in time order. No UNDO control —
   the scripted performance is the only place the open↔close cycle is seen, same as daisy-wheel's
   unwrite — STORY only ever shows the one close, on the first lock. ── */
function stepSpring(v, vel, target, dt, k, c) {
  const a = k * (target - v) - c * vel;
  vel += a * dt; v += vel * dt;
  return [v, vel];
}
const LOCK_EVERY = .9, LOCK_LEAD = .75, SPRING_K = 170;
function livePose(u, ctl) {
  const vs = []; ctl.integ(v => { vs.push(v); return 0; });
  const n = vs.length, dt = n ? u / n : 0;
  let theta = 0, vel = 0, phase = 0, fieldChangedAt = -Infinity;
  const committed = [], lockedSet = new Set(), misses = [];
  for (let k = 0; k < n; k++) {
    const v = vs[k], now = (k + 1) * dt;
    [theta, vel] = stepSpring(theta, vel, v.aim, dt, SPRING_K, v.damp);
    const ph = phase + (v.lock ? dt / LOCK_EVERY : 0);
    if (Math.floor(ph + LOCK_LEAD) > Math.floor(phase + LOCK_LEAD) && v.lock) {
      const { i, d } = nearest(theta);
      if (d > TOLERANCE) misses.push(now);
      else if (!lockedSet.has(i)) {
        if (committed.length === 0) fieldChangedAt = now;
        committed.push({ i, at: now }); lockedSet.add(i);
      }
    }
    phase = ph;
  }
  return { theta, committed, lockedSet, misses, fieldChangedAt };
}

/* ── the finger, in piece units ── */
const PAD_PT = [0, 0];
const CHIP_Y = 252, CHIP_X0 = -100, CHIP_STEP = 40;
const chipPt = k => [CHIP_X0 + k * CHIP_STEP, CHIP_Y];
const UNDO_PT = [-150, CHIP_Y];
const dragPt = (d, u) => pol(RADIUS, lerp(d.a0, d.a1, io(win(u, d.t0, d.t1))));
const ACTIONS = [
  { kind: 'tap',  at: LOCKS[0], pt: PAD_PT,  layer: 'pad' },
  { kind: 'drag', d: DRAGS[0] },
  { kind: 'tap',  at: LOCKS[1], pt: PAD_PT,  layer: 'pad' },
  { kind: 'tap',  at: UNDOS[0], pt: UNDO_PT, layer: 'strip' },
  { kind: 'tap',  at: UNDOS[1], pt: UNDO_PT, layer: 'strip' },
  { kind: 'drag', d: DRAGS[1] },
  { kind: 'tap',  at: LOCKS[2], pt: PAD_PT,  layer: 'pad' },
  { kind: 'drag', d: DRAGS[2] },
  { kind: 'tap',  at: LOCKS[3], pt: PAD_PT,  layer: 'pad' },
];
function fingerAt(u) {
  let pos = PAD_PT, free = -1;
  for (const a of ACTIONS) {
    const s = a.kind === 'drag' ? a.d.t0 : a.at;
    const to = a.kind === 'drag' ? dragPt(a.d, a.d.t0) : a.pt;
    const m0 = Math.max(free + .06, s - .4), m1 = s - .04;
    if (u < m1) {
      if (u < m0 || m1 <= m0) return { x: pos[0], y: pos[1], pulse: null };
      const k = io(win(u, m0, m1));
      return { x: lerp(pos[0], to[0], k), y: lerp(pos[1], to[1], k), pulse: null };
    }
    if (a.kind === 'tap') {
      if (u < a.at + .3) return { x: to[0], y: to[1], pulse: win(u, a.at, a.at + .5), layer: a.layer };
      pos = to; free = a.at + .3;
    } else {
      if (u <= a.d.t1) { const [x, y] = dragPt(a.d, u); return { x, y, down: true, layer: 'gear' }; }
      pos = dragPt(a.d, a.d.t1); free = a.d.t1;
    }
  }
  return { x: pos[0], y: pos[1], pulse: null };
}

registerPiece({
  id: 'gear-lock',
  code: 'LCK-14', series: 'B', n: '14',
  name: 'GEAR LOCK',
  mechanic: 'AIM · LOCK · COMMIT',
  source: 'COMPONENTS/INTERACTION/GEAR-LOCK · PARALLAX',
  hero: { v: '6', u: 'TARGETS · ±14° TOLERANCE' },
  extent: 300,
  spec: [
    ['INPUT',  'DRAG RING · TAP TO LOCK · UNDO'],
    ['STATE',  '1 ANGLE · 6 TARGETS · SEQUENCE'],
    ['MOTION', 'GEAR ×1 / ×−1.3 · FIELD OPENS UNLOCKED'],
    ['BUILT',  'SVG · EULER INTEGRATION · PARALLAX RINGS'],
  ],
  layers: [
    { id: 'field',   name: 'PARALLAX FIELD', note: 'OPENS WHEN UNLOCKED · PLX-12', edge: 296 },
    { id: 'chrome',  name: 'BEZEL',     note: '24 TICKS · DEGREE SCALE',       edge: R_BEZEL + 20 },
    { id: 'gear',    name: 'GEAR TRAIN', note: 'MASTER ×1 · COUNTER ×−1.3',    edge: R_GEARB + 10 },
    { id: 'targets', name: 'TARGETS',   note: '6 ZONES · ±14° TOLERANCE',      edge: RADIUS + 20 },
    { id: 'aim',     name: 'AIM',       note: 'PARALLAX RETICLE · RIDES THE RING', edge: RADIUS + 30 },
    { id: 'pad',     name: 'LOCK PAD',  note: 'CENTRE · TAP TO COMMIT',        edge: 40 },
    { id: 'strip',   name: 'SEQUENCE',  note: 'COMMITTED LOCKS · UNDO',        edge: 150 },
    { id: 'readout', name: 'READOUT',   note: 'NEAREST TARGET · COUNT',        edge: 90 },
    { id: 'input',   name: 'INPUT',     note: 'DRAG RING · TAP TO LOCK',       edge: 300 },
  ],
  calloutRoute: 'right',
  callouts: [
    { at: pol(272, -34),           title: 'PARALLAX FIELD', note: 'CLOSED WHILE LOCKED' },
    { at: pol(R_GEARB, 200),       title: 'COUNTER GEAR', note: 'DECORATIVE · ×−1.3' },
    { at: pol(R_ARC, 20),          title: 'TARGET ZONE',  note: '±14° TO LOCK' },
    { at: pol(RADIUS, 0),          title: 'AIM',          note: 'PARALLAX RETICLE' },
    { at: [0, 28],                 title: 'LOCK PAD',     note: 'TAP = COMMIT' },
    { at: chipPt(2),               title: 'SEQUENCE',     note: 'COMMITTED LOCKS, IN ORDER' },
    { at: UNDO_PT,                 title: 'UNDO',         note: 'LAST OUT REOPENS THE FIELD' },
  ],
  controls: [
    { id: 'lock', label: 'LOCK', kind: 'toggle', min: 0, max: 1,   value: 0,  fmt: v => v ? 'AUTO' : 'OFF' },
    { id: 'aim',  label: 'AIM',  kind: 'knob',   min: 0, max: 360, value: 0,  fmt: v => `${String(Math.round(wrap(v))).padStart(3, '0')}°` },
    { id: 'damp', label: 'DAMP', kind: 'knob',   min: 4, max: 40,  value: 14, fmt: v => `${v.toFixed(1).padStart(4, '0')} /S` },
  ],
  story: {
    tweaks: [
      { id: 'lock', to: 1 },     // the head starts attempting locks; target 0 is already docked — field closes
      { id: 'aim',  to: 300 },   // springs to target 5 and locks it
      { id: 'damp', to: 4 },     // underdamped: the ring rings past the next target before settling
      { id: 'aim',  to: 120 },   // target 2 — overshoots, settles, and locks on the next cadence
    ],
  },
  specU: 2.1,
  exploded: { live: 5.0 },
  assembly: {
    seeds: [PAD_PT, pol(RADIUS, 0), pol(R_BEZEL, 90), pol(R_BEZEL, 270), chipPt(0), UNDO_PT, pol(280, 0)],
    live: 2.8,
    end: 1.85,                                    // after the first lock + first drag + its lock, before the undos
    draw: t => {
      const out = (a, b) => dOff(t, a, b);
      return {
        field: dOn(t, .5, 1.2) * out(6.9, 7.6),
        bezel: dOn(t, .7, 1.6) * out(6.5, 7.2),
        ticks: Array.from({ length: 24 }, (_, i) => { const a = .9 + stag(i, 24, 1.0 / 24), b = 6.1 + stag(23 - i, 24, .9 / 24); return dOn(t, a, a + .3) * out(b, b + .3); }),
        gear: dOn(t, 1.1, 1.9) * out(6.2, 6.8),
        targets: Array.from({ length: N }, (_, i) => { const a = 1.3 + stag(i, N, .5 / N), b = 6.0 + stag(N - 1 - i, N, .4 / N); return dOn(t, a, a + .3) * out(b, b + .3); }),
        aim: dOn(t, 1.6, 2.1) * out(6.3, 6.8),
        pad: dOn(t, 1.8, 2.3) * out(6.1, 6.6),
        strip: Array.from({ length: N }, (_, i) => { const a = 2.0 + stag(i, N, .4 / N), b = 5.9 + stag(N - 1 - i, N, .3 / N); return dOn(t, a, a + .25) * out(b, b + .25); }),
        undo: dOn(t, 2.2, 2.6) * out(5.9, 6.3),
        readout: dOn(t, 2.3, 2.8) * out(5.8, 6.2),
      };
    },
  },

  build(L, sw) {
    const h = {};
    const micro = (parent, x, y, s, extra = {}) => txt(parent, x, y, s, { 'font-size': 6.5, 'letter-spacing': 1.6, 'dominant-baseline': 'middle', class: 'dim', ...extra });

    // field: parallax's own six rings, literal markup, monochrome (house classes, so it still
    // adapts across SPEC/STORY/EXPLODED). h.fieldWrap carries the assembly draw-on fade; nested
    // h.fieldMorph carries the open/close scale+opacity the field breathes through; each ring inside
    // it carries its own independent drift (translate from the aim's direction, rotate from phase).
    h.fieldWrap = el('g', {}, L.field);
    h.fieldMorph = el('g', {}, h.fieldWrap);
    // mount a ring's literal markup, recentred on (cx, cy) in its own viewBox and scaled so its own
    // radius nativeR lands on r — scale MUST be outermost (see the mount() note up top)
    function mount(cx, cy, nativeR, r, markup, parent) {
      const ratio = r / nativeR;
      const g = el('g', { transform: `scale(${ratio.toFixed(5)}) translate(${(-cx).toFixed(3)} ${(-cy).toFixed(3)})` }, parent);
      g.innerHTML = markup;
      return g;
    }
    h.field = FIELD.map(rg => {
      const ring = el('g', {}, h.fieldMorph);
      mount(rg.cx, rg.cy, rg.nativeR, rg.r, FIELD_SVG[rg.id], ring);
      return { ring, rg };
    });

    // bezel: static frame + a 24-tick degree scale, heavy every 60° (a target bearing) — after daisy-wheel's own ring
    h.bezel = drawable(el('circle', { r: R_BEZEL, fill: 'none', class: 'minor', 'stroke-width': sw.main }, L.chrome));
    h.ticks = Array.from({ length: 24 }, (_, i) => {
      const deg = i * 15, heavy = deg % STEP === 0;
      const [x1, y1] = pol(R_TICK, deg), [x2, y2] = pol(heavy ? R_TICK - 16 : R_TICK - 7, deg);
      return el('line', { x1, y1, x2, y2, class: heavy ? 'mid' : 'minor', 'stroke-width': sw.minor * (heavy ? 1.3 : .8) }, L.chrome);
    });

    // gear train: the dashed counter-gear (decorative, ×−1.3) outside the solid master ring (×1, the
    // one the finger actually drags) — grip ticks on the master ring read as the drag affordance
    h.gearBGroup = el('g', {}, L.gear);
    h.gearB = drawable(el('circle', { r: R_GEARB, fill: 'none', class: 'minor', 'stroke-width': sw.minor, 'stroke-dasharray': '2 6' }, h.gearBGroup));
    h.gearAGroup = el('g', {}, L.gear);
    h.gearA = drawable(el('circle', { r: R_GEARA, fill: 'none', class: 'ink', 'stroke-width': sw.main }, h.gearAGroup));
    h.grip = Array.from({ length: 8 }, (_, i) => {
      const deg = i * 45, [x1, y1] = pol(R_GEARA - 6, deg), [x2, y2] = pol(R_GEARA + 6, deg);
      return el('line', { x1, y1, x2, y2, class: 'ink', 'stroke-width': sw.minor }, h.gearAGroup);
    });

    // targets: a tolerance arc drawn at its true angular width (±14°) plus a glyph keyed by index —
    // "locked" is brightness/fill now (ink), not a colour, matching the field's own monochrome rule
    h.targets = Array.from({ length: N }, (_, i) => {
      const a = i * STEP, g = el('g', {}, L.targets);
      const arc = drawable(el('path', { d: arcD(R_ARC, a - TOLERANCE, a + TOLERANCE), fill: 'none', class: 'minor', 'stroke-width': sw.main * 1.1 }, g));
      const [gx, gy] = pol(RADIUS, a);
      const gg = el('g', { transform: `translate(${gx.toFixed(2)} ${gy.toFixed(2)})` }, g);
      const glyphRing = el('path', { d: targetGlyph(i, 9), fill: 'none', class: 'minor', 'stroke-width': sw.minor }, gg);
      const glyphDot = el('path', { d: targetGlyph(i, 5), fill: 'none' }, gg);
      return { g, arc, glyphRing, glyphDot, i };
    });

    // aim: parallax's own Reticle shape (3 thin concentric rings) — "aim" and "reticle" are the
    // same idea, the piece's clearest crossover with the field underneath it
    h.aim = el('g', {}, L.aim);
    mount(224.5, 223.17, 16.37, 50, FIELD_SVG.reticle, h.aim);
    h.aimCore = el('circle', { r: 4.2, fill: 'none', class: 'minor' }, h.aim);

    // lock pad: a hollow ring + crosshair at the hub, with a ripple that flashes ink on a lock,
    // error on a miss — the hub is the one fixed point everything else moves around
    h.padRing = drawable(el('circle', { r: 28, fill: 'none', class: 'ink', 'stroke-width': sw.main * 1.2 }, L.pad));
    h.padCross = [0, 90, 180, 270].map(a => {
      const [x1, y1] = pol(16, a), [x2, y2] = pol(24, a);
      return el('line', { x1, y1, x2, y2, class: 'ink', 'stroke-width': sw.minor }, L.pad);
    });
    h.padRipple = el('circle', { r: 0, fill: 'none', class: 'ink', 'stroke-width': sw.minor * 1.2, opacity: 0 }, L.pad);

    // sequence strip: up to 6 slots, filled in order with the locked target's own glyph; UNDO sits
    // left of the first slot, pulsing error when it fires
    h.chips = Array.from({ length: N }, k => {
      const g = el('g', {}, L.strip);
      const ring = el('circle', { r: 10, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      const dot = el('path', { d: '', fill: 'none' }, g);
      return { g, ring, dot };
    });
    h.undoG = el('g', { transform: `translate(${UNDO_PT[0]} ${UNDO_PT[1]})` }, L.strip);
    h.undoBracket = el('path', { d: 'M-8 -10 L-13 -10 L-13 10 L-8 10 M8 -10 L13 -10 L13 10 L8 10', fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.undoG);
    h.undoRipple = el('circle', { r: 0, fill: 'none', class: 'err', 'stroke-width': sw.minor, opacity: 0 }, h.undoG);

    // readout: the nearest target's index (big, like daisy-wheel's ARMED STATION), a LED that lights
    // on a successful lock and reddens on a miss, and the running LOCKS count
    h.ro = el('g', { transform: 'translate(0 -95)' }, L.readout);
    micro(h.ro, 0, -36, 'TARGET', { 'text-anchor': 'middle' });
    h.roLed = el('circle', { cx: -32, cy: -37, r: 1.8, class: 'minor icondot' }, h.ro);
    h.roIdx = txt(h.ro, 0, 2, '01', { class: 'disp ink', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 38, 'font-weight': 200 });
    el('line', { x1: -30, x2: 30, y1: 22, y2: 22, class: 'minor', 'stroke-width': sw.minor }, h.ro);
    h.lockLabel = micro(h.ro, 0, 36, 'LOCKS', { 'text-anchor': 'middle' });
    h.lockCount = txt(h.ro, 0, 50, '00', { class: 'disp', 'text-anchor': 'middle', 'font-size': 13 });

    return h;
  },

  pose(u, ctl) {
    const live = ctl ? livePose(u, ctl) : null;
    const theta = live ? live.theta : thetaAt(u);
    const res = live ?? commitsAt(u);
    const { committed, lockedSet, misses, fieldChangedAt } = res;
    const { i: near, d: nd } = nearest(theta);
    const inRange = nd <= TOLERANCE;
    const lastLock = committed.length ? committed[committed.length - 1] : null;
    let ripple = null, missRipple = null, bounce = 0;
    if (lastLock && u - lastLock.at < .5) ripple = (u - lastLock.at) / .5;
    if (lastLock && u - lastLock.at < .32) bounce = 4 * (1 - outBack((u - lastLock.at) / .32));
    for (const t of misses) if (t <= u && u - t < .5) missRipple = (u - t) / .5;
    // the undo flash only exists in the scripted performance (STORY has no undo control)
    let undoRipple = null;
    if (!live) for (const t of UNDOS) if (t <= u && u - t < .5) undoRipple = (u - t) / .5;
    // the field's open/close value: eased 0..1 over FIELD_TRANS since the last 0 ↔ >0 crossing
    const isOpen = committed.length === 0;
    const since = u - fieldChangedAt;
    const k = io(clamp(since / FIELD_TRANS));
    const fieldOpen = isOpen ? k : 1 - k;
    return { u, theta, near, nd, inRange, committed, lockedSet, ripple, missRipple, undoRipple, bounce, fieldOpen };
  },

  finger(u) { return fingerAt(u); },

  apply(h, p, D) {
    D = D || {};
    const one = k => (k === undefined ? 1 : k);

    // field: fieldWrap carries the assembly draw-on fade; fieldMorph breathes between FIELD_CLOSED
    // and FIELD_OPEN; each ring still drifts independently (aim-direction push + its own rotation)
    h.fieldWrap.setAttribute('opacity', one(D.field));
    const fScale = lerp(FIELD_CLOSED.scale, FIELD_OPEN.scale, p.fieldOpen);
    const fOp = lerp(FIELD_CLOSED.op, FIELD_OPEN.op, p.fieldOpen);
    h.fieldMorph.setAttribute('transform', `scale(${fScale.toFixed(4)})`);
    h.fieldMorph.setAttribute('opacity', fOp.toFixed(3));
    const px = Math.sin(rad(p.theta)), py = -Math.cos(rad(p.theta));
    const phase = (p.t ?? 0) / (p.T || 1);
    h.field.forEach(({ ring, rg }) => {
      const ang = phase * rg.turns * 360;
      const dx = px * rg.depth * FIELD_AMP, dy = py * rg.depth * FIELD_AMP;
      ring.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${ang.toFixed(2)})`);
    });

    setDraw(h.bezel, one(D.bezel));
    h.ticks.forEach((t, i) => t.setAttribute('opacity', D.ticks ? D.ticks[i] : 1));

    setDraw(h.gearB, one(D.gear));
    h.gearBGroup.setAttribute('transform', `rotate(${(p.theta * -1.3).toFixed(2)})`);
    setDraw(h.gearA, one(D.gear));
    h.grip.forEach(t => t.setAttribute('opacity', one(D.gear)));
    h.gearAGroup.setAttribute('transform', `rotate(${p.theta.toFixed(2)})`);

    h.targets.forEach(t => {
      const locked = p.lockedSet.has(t.i), active = t.i === p.near;
      const missing = active && p.missRipple != null;
      const cls = locked ? 'ink' : missing ? 'err' : (active && p.inRange) ? 'mid' : 'minor';
      setDraw(t.arc, D.targets ? D.targets[t.i] : 1);
      t.arc.setAttribute('class', cls);
      t.glyphRing.setAttribute('class', locked ? 'ink' : 'minor');
      t.glyphRing.setAttribute('opacity', D.targets ? D.targets[t.i] : 1);
      const lastIdx = p.committed.length ? p.committed[p.committed.length - 1].i : -1;
      const pop = locked && t.i === lastIdx ? 1 + p.bounce * .1 : 1;
      t.glyphDot.setAttribute('class', locked ? 'icondot' : 'minor');
      t.glyphDot.setAttribute('opacity', locked ? (D.targets ? D.targets[t.i] : 1) : 0);
      t.glyphDot.setAttribute('transform', `scale(${pop.toFixed(3)})`);
    });

    // aim: rides the master ring; a small lock-pop on the frame it commits
    const [ax, ay] = pol(RADIUS, p.theta);
    const aimScale = 1 + p.bounce * .08;
    h.aim.setAttribute('transform', `translate(${ax.toFixed(2)} ${ay.toFixed(2)}) scale(${aimScale.toFixed(3)})`);
    h.aim.setAttribute('opacity', one(D.aim));
    const lockedHere = p.inRange && p.lockedSet.has(p.near);
    h.aimCore.setAttribute('class', lockedHere ? 'icondot' : p.inRange ? 'icondot mid' : 'minor');

    // lock pad: a ripple reads success (ink) or a miss (error); the ring itself tightens on the hit
    setDraw(h.padRing, one(D.pad));
    h.padCross.forEach(c => c.setAttribute('opacity', one(D.pad)));
    const hitK = p.ripple != null ? 1 - outExpo(p.ripple) : p.missRipple != null ? 1 - outExpo(p.missRipple) : 0;
    h.padRing.setAttribute('r', 28 - 3 * hitK);
    if (p.ripple != null) {
      h.padRipple.setAttribute('class', 'ink');
      h.padRipple.setAttribute('r', 28 + 26 * outExpo(p.ripple));
      h.padRipple.setAttribute('opacity', .8 * (1 - outExpo(p.ripple)) * one(D.pad));
    } else if (p.missRipple != null) {
      h.padRipple.setAttribute('class', 'err');
      h.padRipple.setAttribute('r', 28 + 26 * outExpo(p.missRipple));
      h.padRipple.setAttribute('opacity', .8 * (1 - outExpo(p.missRipple)) * one(D.pad));
    } else h.padRipple.setAttribute('opacity', 0);

    // sequence strip: filled left to right in commit order, each slot the locked target's own glyph
    h.chips.forEach((c, k) => {
      const op = D.strip ? D.strip[k] : 1;
      const [cx, cy] = chipPt(k);
      if (k < p.committed.length) {
        const item = p.committed[k], isLast = k === p.committed.length - 1;
        const pop = isLast ? 1 + p.bounce * .12 : 1;
        c.g.setAttribute('transform', `translate(${cx} ${cy}) scale(${pop.toFixed(3)})`);
        c.ring.setAttribute('class', 'ink'); c.ring.setAttribute('opacity', op);
        c.dot.setAttribute('d', targetGlyph(item.i, 5.5));
        c.dot.setAttribute('class', 'icondot'); c.dot.setAttribute('opacity', op);
      } else {
        c.g.setAttribute('transform', `translate(${cx} ${cy})`);
        c.ring.setAttribute('class', 'minor'); c.ring.setAttribute('opacity', op * .5);
        c.dot.setAttribute('d', ''); c.dot.setAttribute('opacity', 0);
      }
    });
    h.undoBracket.setAttribute('opacity', one(D.undo));
    if (p.undoRipple != null) {
      h.undoRipple.setAttribute('r', 10 + 20 * outExpo(p.undoRipple));
      h.undoRipple.setAttribute('opacity', .8 * (1 - outExpo(p.undoRipple)) * one(D.undo));
    } else h.undoRipple.setAttribute('opacity', 0);

    // readout
    h.ro.setAttribute('opacity', one(D.readout));
    h.roIdx.textContent = pad2(p.near + 1);
    h.roLed.setAttribute('class', p.ripple != null ? 'ink icondot' : p.missRipple != null ? 'err icondot' : 'minor icondot');
    h.lockCount.textContent = pad2(p.committed.length);
  },
});

/* ── literal markup for parallax's six rings (components/motion/parallax/public/images/*.svg,
   via pieces/parallax/piece.js), house classes (mode-aware) instead of the live files' hardcoded
   white or this piece's own earlier hardcoded orange ── */
const FIELD_SVG = {
  hero: `
    <circle cx="264.242" cy="264.242" r="41.193" fill="url(#lckHeroGlow)" opacity=".4"/>
    <defs><radialGradient id="lckHeroGlow" gradientUnits="userSpaceOnUse"
      cx="264.242" cy="264.242" r="41.193"><stop stop-color="#2D3A5A"/><stop offset="1" stop-color="#121212"/></radialGradient></defs>
    <circle cx="264" cy="264" r="260"    fill="none" class="mid" stroke-width="8"  stroke-dasharray="2 2"   opacity=".4"/>
    <circle cx="264" cy="264" r="235.47" fill="none" class="mid" stroke-width="2"  stroke-dasharray="5 5"   opacity=".4"/>
    <circle cx="264" cy="264" r="221.98" fill="none" class="mid" stroke-width="20" stroke-dasharray="10 10" opacity=".3"/>
    <circle cx="264" cy="264" r="188.87" fill="none" class="mid" stroke-width="20" stroke-dasharray="1 1"   opacity=".3"/>
    <circle cx="264" cy="264" r="134.91" fill="none" class="mid" stroke-width="1"  stroke-dasharray="5 10"  stroke-linecap="round" opacity=".4"/>
    <circle cx="264" cy="264" r="111.6"  fill="none" class="ink" stroke-width="2"  stroke-linecap="round"   opacity=".4"/>
    <circle cx="264" cy="264" r="77.26"  fill="none" class="ink" stroke-width="2"  stroke-linecap="round"   opacity=".4"/>
  `,
  bezel: `
    <path d="M50.4702 405C50.5177 355.652 60.8853 306.86 80.9071 261.757C100.929 216.653 130.162 176.236 166.73 143.1L177.86 155.44C143.012 187.014 115.151 225.526 96.0658 268.504C76.981 311.482 67.0942 357.975 67.0402 405C67.0402 590.5 217.99 741.5 403.54 741.5H404.33V758.12H403.54C208.85 758.08 50.4702 599.65 50.4702 405ZM314.85 63.14C343.679 55.676 373.34 51.9058 403.12 51.92V68.5C374.743 68.5072 346.482 72.1092 319.01 79.22L314.85 63.14ZM488.39 730.66C540.869 716.931 589.258 690.739 629.45 654.31L640.63 666.61C598.45 704.819 547.684 732.301 492.63 746.73L488.39 730.66Z"
      fill="none" class="mid" stroke-width="2"/>
    <path d="M0.540039 439.6L3.66004 439.35C5.75225 463.741 10.0634 487.891 16.54 511.5L13.54 512.33C6.99244 488.535 2.64089 464.19 0.540039 439.6H0.540039ZM73.44 638.86L75.97 637.07C89.0881 655.507 103.719 672.821 119.71 688.83C156.898 726.217 201.131 755.858 249.851 776.037C298.57 796.217 350.807 806.533 403.54 806.39C510.75 806.39 611.54 764.64 687.32 688.83L689.65 690.91L689.53 691.03C613.09 767.42 511.54 809.5 403.45 809.5C295.36 809.5 193.85 767.42 117.45 691.03C101.389 674.863 86.6704 657.415 73.44 638.86V638.86ZM117.26 119.22L117.55 118.93C193.9 42.58 295.54 0.5 403.54 0.5C511.54 0.5 613.14 42.58 689.54 118.97C705.703 135.137 720.484 152.628 733.73 171.26L731.2 173.05C718.064 154.555 703.392 137.2 687.34 121.17C611.54 45.36 510.74 3.62 403.54 3.62C296.34 3.62 195.54 45.36 119.75 121.17L117.26 119.22ZM790.62 298.7L793.62 297.87C800.125 321.661 804.45 345.995 806.54 370.57L803.42 370.81C801.347 346.435 797.063 322.299 790.62 298.7Z"
      fill="none" class="ink" stroke-width="3"/>
  `,
  dotted: `
    <circle cx="177.5" cy="177.5" r="174.5" fill="none" class="ink" stroke-width="5" stroke-linecap="round" stroke-dasharray="5 168"/>
  `,
  accent: `
    <circle cx="200" cy="200" r="195"    fill="none" class="minor" stroke-width="10" opacity=".4"/>
    <circle cx="200" cy="200" r="184.5"  fill="none" class="mid"   stroke-width="5"  stroke-dasharray="70 100" opacity=".4"/>
    <circle cx="200" cy="200" r="199"    fill="none" class="ink"   stroke-width="2"/>
    <circle cx="200" cy="200" r="33.31"  fill="none" class="mid"   stroke-width="5"  opacity=".6"/>
    <circle cx="200" cy="200" r="6.59"   fill="none" class="mid"   stroke-width="1"  opacity=".4"/>
    <circle cx="200" cy="200" r="2.34"   class="icondot"/>
  `,
  frame: `
    <circle cx="200" cy="200" r="194.5" fill="none" class="ink" stroke-width="11"/>
    <circle cx="8.16"   cy="391.11" r="6.16" class="icondot" opacity=".7"/>
    <circle cx="391.84" cy="391.11" r="6.16" class="icondot" opacity=".7"/>
    <circle cx="8.16"   cy="8.89"   r="6.16" class="icondot" opacity=".7"/>
    <circle cx="391.84" cy="8.89"   r="6.16" class="icondot" opacity=".7"/>
  `,
  reticle: `
    <circle cx="224.5" cy="223.17" r="29.19" fill="none" class="minor" stroke-width="1"/>
    <circle cx="224.5" cy="223.17" r="16.37" fill="none" class="ink"   stroke-width="1"/>
    <circle cx="224.5" cy="223.17" r="9.09"  fill="none" class="mid"  stroke-width="1"/>
  `,
};

})();
