/* ─────────────────────────────────────────────────────────────
   PIECE · RELIQUARY (RLQ-15)
   components/interaction/reliquary — a lock dial that reassembles a six-fragment emblem one seal
   at a time, fully ambient: the source has no pointer/touch input at all, only an async cycle()
   that shuffles the six stations, springs the aim onto each in turn, dwells, seals it (a beam +
   an eased seat-tween snaps the fragment home), then — once every station is sealed — closes a
   glass vitrine over the relic and lets its eyes ignite, before unwinding and starting again.
     · mechanism: a 72-tick bezel, a master gear (×1, aim rides it) and a decorative counter-gear
       (×−1.25, dashed) — same train as gear-lock's, scaled to this piece's own radii
     · 6 stations at 60° apart, numbered I–VI in the source's own Gothic/Garamond type, each
       catalogued to one fragment (FRAGS below — name/gloss/anchor/dist/spin are the source's own
       numbers, verbatim)
     · the relic sits at the centre the whole time, "half-present" (opacity tracks seals/6) until
       the vitrine closes over it and its eyes ignite
   Everything here is a pure function of u, same convention as gear-lock: thetaAt/commitsAt replay
   a short scripted catalogue (3 of the 6 seals — the full six-then-unwind cycle is ~20 s of real
   time in the source, far more than an EXPLODED/SPEC performance budget) for SPEC/EXPLODED/the
   legacy ASSEMBLY loop; STORY instead drives the dial live off its own controls.

   No controls to invent from scratch, the source mechanic never takes input — same situation
   gear-lock solved for parallax's ambient field. Reused that precedent directly: AIM (a knob,
   springing the dial's angle, critically damped) and SEAL (a toggle, gating an auto-attempt
   cadence) are gear-lock's own AIM/LOCK, renamed to this piece's own vocabulary. The third control,
   SPEED, isn't invented at all — it's the source's own `SPEED` constant (a global timescale
   multiplier on every wait()/tween()), lifted straight in: it speeds up both the seal cadence and
   the spring's stiffness (kept critically damped at any SPEED, so it only ever looks faster, never
   wobblier).

   The six fragments' own artwork is one inlined ~100 KB SVG path per id in the source — far too
   large to carry into a second file and not needed to read the mechanism, so each fragment gets a
   small built icon instead (skull dome + eye sockets, a ring, a plinth, a crest chevron, ring +
   halo) rather than the literal silhouette; see fragGlyph() below.

   Rev C — colour is identity: the source's own --rubric (#b8231a) replaces the mode accents and
   selected fills in every mode, same mechanism daisy-wheel/hex-workspace/signal-wheel/spine-section
   use for their own hues.
   ───────────────────────────────────────────────────────────── */
(() => {

const N = 6, STEP = 60, TOLERANCE = 14;
const RADIUS = 222;                                     // dial / target ring radius (source's own)
const R_BEZEL1 = 262, R_BEZEL2 = 268, R_TICK = 262, R_GEARB = 232, R_GEARA = 222, R_ARC = RADIUS + 9;
const R_VITRINE = 214, LABEL_R = 284;
const CX = 487, CY = 497, ES = .4;                       // the source's own emblem centre + scale
const NUMS = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const RUBRIC = '#B8231A';

const pol = (r, a) => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];
function arcD(r, a0, a1) {
  const [x0, y0] = pol(r, a0), [x1, y1] = pol(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const wrap = d => ((d % 360) + 360) % 360;
const outBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const fragPt = i => pol(LABEL_R, i * STEP);

// the source's own FRAGS, verbatim (name / gloss / anchor / dist / spin); `glyph` is this piece's
// own stand-in icon key (see fragGlyph below, and the file header for why it isn't the real path).
const FRAGS = [
  { name: 'Calvaria',      gloss: 'the skull',          anchor: [487, 150], dist: 170, spin: -6,  glyph: 'skull' },
  { name: 'Rota exterior', gloss: 'the outer wheel',    anchor: [840, 330], dist: 120, spin: 9,   glyph: 'ring'  },
  { name: 'Pes dexter',    gloss: 'the right foot',     anchor: [745, 900], dist: 190, spin: 14,  glyph: 'foot'  },
  { name: 'Crista',        gloss: 'the crest',          anchor: [487, 960], dist: 170, spin: 0,   glyph: 'crest' },
  { name: 'Pes sinister',  gloss: 'the left foot',      anchor: [228, 900], dist: 190, spin: -14, glyph: 'foot'  },
  { name: 'Rota interior', gloss: 'inner wheel, nimbus', anchor: [205, 400], dist: 110, spin: -9, glyph: 'halo'  },
];
// per-fragment geometry, derived once: each fragment's station index equals its FRAGS index (the
// source's own stations are `FRAGS.map((f,i)=>({angle:i*60,...}))`), so its "explode" direction is
// just that station's own unit vector — home is the anchor recentred on CX/CY and scaled by ES,
// exactly as the source's own leader-line code recentres anchors for the screen.
const FRAG_INFO = FRAGS.map((f, i) => {
  const angle = i * STEP, dir = [Math.sin(rad(angle)), -Math.cos(rad(angle))];
  return { ...f, i, angle, dir, home: [(f.anchor[0] - CX) * ES, (f.anchor[1] - CY) * ES], explode: f.dist * ES };
});

// a small built icon per fragment kind. Returns { strokes, fills } so apply() can drive its
// "sealed" colour the same way everything else here does: minor → mid → ink (identity-hued via
// the .on-group pattern once sealed, see the colour-rule note in build()) for outline parts, and
// dim → disc (same mechanism, fill side) for the few parts that are genuinely filled marks — kept
// separate so a stroke-only part (fill="none") never has a fill-setting class land on it and paint
// it in solid instead of outline.
function fragGlyph(kind, g, sw) {
  switch (kind) {
    case 'skull': return {
      strokes: [
        el('circle', { r: 11, fill: 'none', 'stroke-width': sw.main }, g),
        el('path', { d: 'M-4 6H4M-2 9V6M2 9V6', fill: 'none', 'stroke-width': sw.minor }, g),
      ],
      fills: [
        el('circle', { cx: -4, cy: -2, r: 2.1 }, g),
        el('circle', { cx: 4, cy: -2, r: 2.1 }, g),
      ],
    };
    case 'ring': return { strokes: [el('circle', { r: 12, fill: 'none', 'stroke-width': sw.main }, g)], fills: [] };
    case 'foot': return {
      strokes: [el('path', { d: 'M-7 -5L7 -5L9 6L-9 6Z', fill: 'none', 'stroke-width': sw.main, 'stroke-linejoin': 'round' }, g)],
      fills: [],
    };
    case 'crest': return {
      strokes: [el('path', { d: 'M-9 5L0 -7L9 5', fill: 'none', 'stroke-width': sw.main, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g)],
      fills: [],
    };
    case 'halo': return {
      strokes: [
        el('circle', { r: 6, fill: 'none', 'stroke-width': sw.main }, g),
        el('circle', { r: 12, fill: 'none', 'stroke-width': sw.minor }, g),
      ],
      fills: [],
    };
  }
}

/* ── the scripted catalogue (SPEC / EXPLODED / legacy ASSEMBLY): 3 of the 6 seals, in the order
   the real cycle() would shuffle them to. Station 0 (skull) is already home at rest — angle 0 is
   station 0 — so it seals almost at once; the dial then springs to the crest (station 3) and the
   inner wheel (station 5). The full six-then-unwind cycle is ~20 s in the source; this is a
   representative slice, same scale as gear-lock's own 4-of-6-locks EXPLODED performance. ── */
const PERF = [{ i: 0 }, { i: 3, from: 0, to: 180 }, { i: 5, from: 180, to: 300 }];
const MOVE_T = [[0, 0], [.9, 1.7], [2.35, 3.15]];
const LOCK_AT = [.45, 2.05, 3.5];
const UEND = 4.1;

function thetaAt(u) {
  let theta = PERF[0].i * STEP;
  for (let k = 1; k < PERF.length; k++) {
    const [t0, t1] = MOVE_T[k], a0 = PERF[k].from, a1 = PERF[k].to;
    if (u <= t0) return theta;
    if (u < t1) return a0 + (a1 - a0) * outBack((u - t0) / (t1 - t0));
    theta = a1;
  }
  return theta;
}
function commitsAt(u) {
  const committed = [], lockedSet = new Set();
  for (let k = 0; k < PERF.length; k++) {
    if (LOCK_AT[k] > u) break;
    committed.push({ i: PERF[k].i, at: LOCK_AT[k] });
    lockedSet.add(PERF[k].i);
  }
  return { committed, lockedSet };
}
// the finger taps each sealed station's own label point (same radius the catalogue numerals sit
// at), gliding ahead of the seal the way gear-lock's finger glides to the pad before it taps.
function fingerAt(u) {
  let pos = fragPt(PERF[0].i), free = -1;
  for (let k = 0; k < PERF.length; k++) {
    const to = fragPt(PERF[k].i), at = LOCK_AT[k];
    const m0 = Math.max(free + .06, at - .5), m1 = at - .04;
    if (u < m1) {
      if (u < m0 || m1 <= m0) return { x: pos[0], y: pos[1], pulse: null };
      const kk = io(win(u, m0, m1));
      return { x: lerp(pos[0], to[0], kk), y: lerp(pos[1], to[1], kk), pulse: null };
    }
    if (u < at + .5) return { x: to[0], y: to[1], pulse: win(u, at, at + .5), layer: 'targets' };
    pos = to; free = at + .3;
  }
  return { x: pos[0], y: pos[1], pulse: null };
}

/* ── STORY: θ springs toward the AIM knob (critically damped, stiffness scaled by SPEED so it
   never gets wobblier, only faster); SEAL gates a cadence of auto-seal attempts, same convention
   as gear-lock's LOCK — ctl.integ hands the midpoint samples to f in time order. ── */
function nearest(theta) {
  const t = wrap(theta); let best = 0, bd = Infinity;
  for (let i = 0; i < N; i++) { const raw = Math.abs(t - i * STEP), d = Math.min(raw, 360 - raw); if (d < bd) { bd = d; best = i; } }
  return { i: best, d: bd };
}
function stepSpring(v, vel, target, dt, k, c) { const a = k * (target - v) - c * vel; vel += a * dt; v += vel * dt; return [v, vel]; }
const SPRING_K = 170, SEAL_EVERY = 1.0, SEAL_LEAD = .8;
function livePose(u, ctl) {
  const vs = []; ctl.integ(v => { vs.push(v); return 0; });
  const n = vs.length, dt = n ? u / n : 0;
  let theta = 0, vel = 0, phase = 0;
  const committed = [], lockedSet = new Set();
  for (let k = 0; k < n; k++) {
    const v = vs[k], now = (k + 1) * dt;
    const kS = SPRING_K * v.speed, c = 2 * Math.sqrt(kS);          // critically damped at any SPEED
    [theta, vel] = stepSpring(theta, vel, v.aim, dt, kS, c);
    const every = SEAL_EVERY / Math.max(.3, v.speed);
    const ph = phase + (v.seal ? dt / every : 0);
    if (Math.floor(ph + SEAL_LEAD) > Math.floor(phase + SEAL_LEAD) && v.seal) {
      const { i, d } = nearest(theta);
      if (d <= TOLERANCE && !lockedSet.has(i)) { committed.push({ i, at: now }); lockedSet.add(i); }
    }
    phase = ph;
  }
  return { theta, committed, lockedSet };
}

const CHIP_Y = 252, CHIP_X0 = -100, CHIP_STEP = 40;

registerPiece({
  id: 'reliquary',
  code: 'RLQ-15', series: 'B', n: '15',
  name: 'RELIQUARY',
  mechanic: 'AIM · SEAL · AMBIENT',
  source: 'COMPONENTS/INTERACTION/RELIQUARY',
  hero: { v: '6', u: 'FRAGMENTS · 60° STATIONS' },
  extent: 320,
  spec: [
    ['INPUT',  'NONE · AMBIENT, AUTO-AIM + AUTO-SEAL'],
    ['STATE',  '1 ANGLE · 6 SEALS · RELIC COMPLETION'],
    ['MOTION', 'GEAR ×1 / ×−1.25 · VITRINE CLOSES WHEN SEALED'],
    ['BUILT',  'SVG · CRITICALLY-DAMPED SPRING'],
  ],
  layers: [
    { id: 'chrome',      name: 'BEZEL',       note: '72 TICKS · DEGREE SCALE',    edge: R_BEZEL2 + 16 },
    { id: 'gear',        name: 'GEAR TRAIN',  note: 'MASTER ×1 · COUNTER ×−1.25', edge: R_GEARB + 10 },
    { id: 'targets',     name: 'STATIONS',    note: '6 SEALS · ±14° TOLERANCE',   edge: LABEL_R + 20 },
    { id: 'vitrine',     name: 'VITRINE',     note: 'GLASS · CLOSES WHEN SEALED', edge: R_VITRINE + 10 },
    { id: 'emblem',      name: 'RELIC',       note: '6 FRAGMENTS · CORE',         edge: 200 },
    { id: 'aim',         name: 'AIM',         note: 'CROSSHAIR · RIDES THE RING', edge: RADIUS + 30 },
    { id: 'hud',         name: 'READOUT',     note: 'STATION · SEAL COUNT',       edge: 90 },
    { id: 'strip',       name: 'SEQUENCE',    note: 'SEALED FRAGMENTS, IN ORDER', edge: 150 },
    { id: 'inscription', name: 'INSCRIPTION', note: 'REVEALED WHEN SEALED',       edge: 110 },
    { id: 'input',       name: 'INPUT',       note: 'NO TOUCH · FULLY AMBIENT',   edge: 320 },
  ],
  calloutRoute: 'right',
  callouts: [
    { at: pol(R_BEZEL2, -40), title: 'BEZEL',    note: '72 × 5° TICKS' },
    { at: pol(R_GEARB, 160),  title: 'COUNTER GEAR', note: 'DECORATIVE · ×−1.25' },
    { at: pol(R_ARC, 20),     title: 'STATION',  note: '±14° TO SEAL' },
    { at: pol(RADIUS, 0),     title: 'AIM',      note: 'SPRINGS TO EACH STATION' },
    { at: [0, 0],             title: 'RELIC',    note: '6 FRAGMENTS · CENTRE' },
    { at: pol(R_VITRINE, -60), title: 'VITRINE', note: 'CLOSES ON THE 6TH SEAL' },
    { at: fragPt(3),          title: 'SEQUENCE', note: 'SEALED, IN ORDER' },
  ],
  specU: 2.2,

  // STORY: AIM/SEAL are gear-lock's own AIM/LOCK renamed; SPEED is the source's own SPEED constant
  controls: [
    { id: 'seal',  label: 'SEAL',  kind: 'toggle', min: 0, max: 1,   value: 0, fmt: v => v ? 'AUTO' : 'OFF' },
    { id: 'aim',   label: 'AIM',   kind: 'knob',   min: 0, max: 360, value: 0, fmt: v => `${String(Math.round(wrap(v))).padStart(3, '0')}°` },
    { id: 'speed', label: 'SPEED', kind: 'knob',   min: .4, max: 2.4, value: 1, fmt: v => `×${v.toFixed(2)}` },
  ],
  story: {
    tweaks: [
      { id: 'seal',  to: 1 },     // auto-sealing begins; station I is already home and seats almost at once
      { id: 'aim',   to: 180 },   // springs across to station IV (the crest), seals it on arrival
      { id: 'speed', to: 2.2 },   // the dial quickens — cadence and spring both speed up together
      { id: 'aim',   to: 300 },   // on to station VI, sealed well before the hold
    ],
  },
  exploded: { live: UEND },
  assembly: {
    seeds: [...FRAG_INFO.map(f => f.home), pol(RADIUS, 0), pol(R_BEZEL2, 90), pol(R_BEZEL2, 270), fragPt(0)],
    live: 1.3,
    end: UEND,
    draw: t => {
      const out = (a, b) => dOff(t, a, b);
      return {
        chrome: dOn(t, .5, 1.3) * out(6.9, 7.6),
        ticks: Array.from({ length: 72 }, (_, i) => { const a = .7 + stag(i, 72, 1.0 / 72), b = 6.3 + stag(71 - i, 72, .9 / 72); return dOn(t, a, a + .25) * out(b, b + .25); }),
        gear: dOn(t, .9, 1.7) * out(6.5, 7.2),
        targets: Array.from({ length: N }, (_, i) => { const a = 1.1 + stag(i, N, .5 / N), b = 6.1 + stag(N - 1 - i, N, .4 / N); return dOn(t, a, a + .3) * out(b, b + .3); }),
        vitrine: dOn(t, 1.3, 2.0) * out(6.0, 6.6),
        frags: Array.from({ length: N }, (_, i) => { const a = 1.4 + stag(i, N, .5 / N), b = 5.9 + stag(N - 1 - i, N, .4 / N); return dOn(t, a, a + .3) * out(b, b + .3); }),
        core: dOn(t, 1.3, 1.9) * out(6.2, 6.8),
        aim: dOn(t, 1.6, 2.2) * out(6.3, 6.9),
        hud: dOn(t, 1.8, 2.4) * out(6.1, 6.7),
        strip: Array.from({ length: N }, (_, i) => { const a = 1.9 + stag(i, N, .4 / N), b = 5.8 + stag(N - 1 - i, N, .3 / N); return dOn(t, a, a + .25) * out(b, b + .25); }),
        inscription: dOn(t, 2.1, 2.7) * out(5.9, 6.4),
      };
    },
  },

  build(L, sw) {
    const h = {};
    const micro = (parent, x, y, s, extra = {}) => txt(parent, x, y, s, { 'font-size': 6.5, 'letter-spacing': 1.6, 'dominant-baseline': 'middle', class: 'dim', ...extra });

    // chrome: two bezel rings + a 72-tick degree scale, heavy every 60° (a station bearing)
    h.bezel1 = drawable(el('circle', { r: R_BEZEL1, fill: 'none', class: 'minor', 'stroke-width': sw.main }, L.chrome));
    h.bezel2 = drawable(el('circle', { r: R_BEZEL2, fill: 'none', class: 'minor', 'stroke-width': sw.minor * .6 }, L.chrome));
    h.ticks = Array.from({ length: 72 }, (_, i) => {
      const deg = i * 5, heavy = deg % STEP === 0;
      const [x1, y1] = pol(R_TICK, deg), [x2, y2] = pol(R_TICK + (heavy ? 10 : i % 2 ? 3 : 5), deg);
      return el('line', { x1, y1, x2, y2, class: heavy ? 'mid' : 'minor', 'stroke-width': sw.minor * (heavy ? 1.3 : .8) }, L.chrome);
    });

    // gear train: the dashed counter-gear (decorative, ×−1.25) outside the solid master ring
    h.gearBGroup = el('g', {}, L.gear);
    h.gearB = drawable(el('circle', { r: R_GEARB, fill: 'none', class: 'minor', 'stroke-width': sw.minor, 'stroke-dasharray': '2 9' }, h.gearBGroup));
    h.gearAGroup = el('g', {}, L.gear);
    h.gearA = drawable(el('circle', { r: R_GEARA, fill: 'none', class: 'ink', 'stroke-width': sw.main }, h.gearAGroup));

    // stations: a tolerance arc, a Gothic numeral + italic Garamond name (always the identity hue,
    // like the source's own hardcoded RUBRIC fill), and a dashed leader to the fragment
    h.targets = FRAG_INFO.map((f, i) => {
      const a = f.angle, g = el('g', {}, L.targets);
      const arc = drawable(el('path', { d: arcD(R_ARC, a - TOLERANCE, a + TOLERANCE), fill: 'none', class: 'minor', 'stroke-width': sw.main * 1.1 }, g));
      const [lx, ly] = pol(LABEL_R, a);
      const ty = ly + (ly < -200 ? -6 : ly > 200 ? 12 : 0);
      const anchor = Math.abs(lx) < 5 ? 'middle' : lx > 0 ? 'start' : 'end';
      const num = txt(g, lx, ty, NUMS[i], { 'text-anchor': anchor, 'font-size': 15, style: "font-family:'UnifrakturMaguntia',serif", class: 'accf' });
      const nm = txt(g, lx, ty + 12, f.name, { 'text-anchor': anchor, 'font-size': 9.5, 'font-style': 'italic', style: "font-family:'EB Garamond',serif", class: 'dim' });
      const leader = el('path', { fill: 'none', class: 'minor', 'stroke-width': sw.minor * .6, 'stroke-dasharray': '2 3' }, L.targets);
      const tip = el('circle', { r: 1.6, class: 'minor' }, L.targets);
      return { g, arc, num, nm, leader, tip, labelPos: [lx, ly] };
    });

    // vitrine: a glass circle + two highlight streaks, closes over the relic on the sixth seal
    h.vitrineG = el('g', {}, L.vitrine);
    h.vitrineRing = drawable(el('circle', { r: R_VITRINE, class: 'disc minor', 'stroke-width': sw.minor }, h.vitrineG));
    h.vitrineHi = [
      el('path', { d: `M${pol(R_VITRINE * .72, -70).map(v => v.toFixed(2)).join(' ')} A${(R_VITRINE * .72).toFixed(2)} ${(R_VITRINE * .72).toFixed(2)} 0 0 1 ${pol(R_VITRINE * .72, 15).map(v => v.toFixed(2)).join(' ')}`, fill: 'none', class: 'ink', 'stroke-width': sw.main * 1.6, 'stroke-linecap': 'round' }, h.vitrineG),
      el('path', { d: `M${pol(R_VITRINE * .84, -48).map(v => v.toFixed(2)).join(' ')} A${(R_VITRINE * .84).toFixed(2)} ${(R_VITRINE * .84).toFixed(2)} 0 0 1 ${pol(R_VITRINE * .84, -58).map(v => v.toFixed(2)).join(' ')}`, fill: 'none', class: 'ink', 'stroke-width': sw.main, 'stroke-linecap': 'round' }, h.vitrineG),
    ];

    // the relic: 6 fragments at their catalogued anchors (see fragGlyph/FRAG_INFO), plus a centre
    // core/gauge/eyes that is "half present" (opacity tracks seals/6) until the vitrine closes
    h.frags = FRAG_INFO.map(f => { const g = el('g', {}, L.emblem); return { g, parts: fragGlyph(f.glyph, g, sw) }; });
    h.coreG = el('g', {}, L.emblem);
    h.coreShield = drawable(el('path', { d: 'M0 -26L22 0L0 26L-22 0Z', fill: 'none', class: 'minor', 'stroke-width': sw.main }, h.coreG));
    h.gaugeRing = drawable(el('circle', { r: 19, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.coreG));
    h.gaugeTicks = Array.from({ length: 24 }, (_, i) => {
      const deg = i * 15, [x1, y1] = pol(16, deg), [x2, y2] = pol(21, deg);
      return el('line', { x1, y1, x2, y2, class: 'minor', 'stroke-width': sw.minor }, h.coreG);
    });
    h.eyes = [-6.5, 6.5].map(x => el('circle', { cx: x, cy: -4, r: 2.3, class: 'dim' }, h.coreG));
    h.face = el('circle', { cx: 0, cy: 7, r: 1.6, class: 'dim' }, h.coreG);

    // aim: a crosshair reticle rides the master ring
    h.aim = el('g', {}, L.aim);
    h.aimRing1 = drawable(el('circle', { r: 22, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.aim));
    h.aimRing2 = drawable(el('circle', { r: 13, fill: 'none', class: 'ink', 'stroke-width': sw.main }, h.aim));
    h.aimNucleus = el('circle', { r: 3.5, class: 'dim' }, h.aim);
    h.aimCross = drawable(el('path', { d: 'M0 -30V-24M0 24V30M-30 0H-24M24 0H30', fill: 'none', class: 'mid', 'stroke-width': sw.minor }, h.aim));

    // readout: the nearest station (big Gothic numeral, identity-hued like the source's own), a
    // LED that flashes on a seal, and the running seal count
    h.ro = el('g', { transform: 'translate(0 -95)' }, L.hud);
    micro(h.ro, 0, -36, 'STATION', { 'text-anchor': 'middle' });
    h.roLed = el('circle', { cx: -34, cy: -37, r: 1.8, class: 'minor icondot' }, h.ro);
    h.roIdx = txt(h.ro, 0, 6, 'I', { class: 'accf', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 38, style: "font-family:'UnifrakturMaguntia',serif" });
    el('line', { x1: -30, x2: 30, y1: 22, y2: 22, class: 'minor', 'stroke-width': sw.minor }, h.ro);
    micro(h.ro, 0, 36, 'SEALS', { 'text-anchor': 'middle' });
    h.roCount = txt(h.ro, 0, 50, '0/6', { class: 'disp', 'text-anchor': 'middle', 'font-size': 13 });

    // sequence strip: up to 6 slots, filled in seal order with the station's own Gothic numeral
    h.chips = Array.from({ length: N }, () => {
      const g = el('g', {}, L.strip);
      const ring = el('circle', { r: 11, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      const num = txt(g, 0, 5, '', { class: 'accf', 'text-anchor': 'middle', 'font-size': 13, style: "font-family:'UnifrakturMaguntia',serif" });
      return { g, ring, num };
    });

    // inscription: the source's own epigraph, legible only once the case is sealed
    h.inscription = txt(L.inscription, 0, 0, 'The reliquary does not destroy the relic. It makes it visible as what it is.',
      { 'text-anchor': 'middle', 'font-style': 'italic', 'font-size': 13, style: "font-family:'EB Garamond',serif", class: 'dim' });

    // colour rule, broken (rev C): the piece owns its hue — the source's own --rubric — so the
    // mode accents and selected fills render in it, in every mode.
    el('style', {}, L.emblem.ownerSVGElement).textContent =
      `.acc{stroke:${RUBRIC}}.accf{fill:${RUBRIC}}.on .disc{fill:${RUBRIC}}.on .ink{stroke:${RUBRIC}}.on .accf{fill:${RUBRIC}}`;
    return h;
  },

  // what the piece looks like u seconds into the performance
  pose(u, ctl) {
    const live = ctl ? livePose(u, ctl) : null;
    const theta = live ? live.theta : thetaAt(u);
    const { committed, lockedSet } = live ?? commitsAt(u);
    const { i: near, d: nd } = nearest(theta);
    const inRange = nd <= TOLERANCE;
    const lastLock = committed.length ? committed[committed.length - 1] : null;
    let ripple = null, bounce = 0;
    if (lastLock && u - lastLock.at < .5) ripple = (u - lastLock.at) / .5;
    if (lastLock && u - lastLock.at < .32) bounce = 4 * (1 - outBack((u - lastLock.at) / .32));
    // completion: once all six are sealed, rel/ignite rise exponentially from that moment — the
    // pure-function equivalent of the source's own per-frame `rel += (target - rel) * (1 - e^-dt/τ)`
    const completedAt = committed.length === N ? committed[N - 1].at : null;
    const rel = completedAt == null ? 0 : 1 - Math.exp(-(u - completedAt) / .9);
    const ignite = completedAt == null ? 0 : 1 - Math.exp(-(u - completedAt) / .26);
    return { u, theta, near, nd, inRange, committed, lockedSet, ripple, bounce, k: committed.length / N, rel, ignite };
  },

  finger(u) { return fingerAt(u); },

  apply(h, p, D) {
    D = D || {};
    const one = k => (k === undefined ? 1 : k);

    setDraw(h.bezel1, one(D.chrome)); setDraw(h.bezel2, one(D.chrome));
    h.ticks.forEach((t, i) => t.setAttribute('opacity', D.ticks ? D.ticks[i] : 1));

    setDraw(h.gearB, one(D.gear));
    h.gearBGroup.setAttribute('transform', `rotate(${(-p.theta * 1.25).toFixed(2)})`);
    setDraw(h.gearA, one(D.gear));
    h.gearAGroup.setAttribute('transform', `rotate(${p.theta.toFixed(2)})`);

    // fragments: an eased seat-tween from exploded (seat 0) to home (seat 1), outBack snap at the
    // moment it seals — the pure-function equivalent of the source's easeOutBack seat tween
    const pos = FRAG_INFO.map((fi, i) => {
      const c = p.committed.find(cm => cm.i === i);
      const seat = c ? Math.min(1.15, outBack(Math.min(1, (p.u - c.at) / 1.0))) : 0;
      const open = 1 - seat;
      return { x: fi.home[0] + fi.dir[0] * fi.explode * open, y: fi.home[1] + fi.dir[1] * fi.explode * open, seat, locked: seat > .02 };
    });

    h.targets.forEach((t, i) => {
      const locked = pos[i].locked, active = i === p.near && p.inRange && !locked;
      t.g.classList.toggle('on', locked);
      setDraw(t.arc, D.targets ? D.targets[i] : 1);
      t.arc.setAttribute('class', locked ? 'ink' : active ? 'mid' : 'minor');
      const dOp = D.targets ? D.targets[i] : 1;
      t.num.setAttribute('opacity', dOp); t.nm.setAttribute('opacity', dOp);
      const [lx, ly] = t.labelPos;
      const lop = Math.max(0, dOp * (1 - pos[i].seat * .9));           // leader fades as its fragment seats home
      t.leader.setAttribute('d', `M${lx.toFixed(1)} ${ly.toFixed(1)} Q${(lx * .6).toFixed(1)} ${(ly * .6).toFixed(1)} ${pos[i].x.toFixed(1)} ${pos[i].y.toFixed(1)}`);
      t.leader.setAttribute('opacity', lop);
      t.tip.setAttribute('cx', pos[i].x.toFixed(1)); t.tip.setAttribute('cy', pos[i].y.toFixed(1)); t.tip.setAttribute('opacity', lop);
    });

    h.frags.forEach((fr, i) => {
      const { x, y, seat, locked } = pos[i];
      const spin = FRAG_INFO[i].spin * (1 - seat);
      fr.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${spin.toFixed(2)})`);
      fr.g.setAttribute('opacity', (D.frags ? D.frags[i] : 1) * (locked ? 1 : i === p.near && p.inRange ? .85 : .55));
      fr.g.classList.toggle('on', locked);
      const cls = locked ? 'ink' : i === p.near && p.inRange ? 'mid' : 'minor';
      fr.parts.strokes.forEach(e => e.setAttribute('class', cls));
      fr.parts.fills.forEach(e => e.setAttribute('class', locked ? 'disc' : 'dim'));
    });

    // the relic itself: half-present until complete, gauge ring lights station by station
    const k = p.k;
    h.coreG.setAttribute('opacity', (D.core ?? 1) * (.45 + .55 * Math.max(k, p.rel)));
    setDraw(h.coreShield, D.core ?? 1); setDraw(h.gaugeRing, D.core ?? 1);
    h.gaugeTicks.forEach((tk, i) => tk.setAttribute('class', i < Math.round(k * h.gaugeTicks.length) ? 'acc' : 'minor'));
    const es = (.2 + .8 * p.ignite) * (1 + .35 * Math.sin(Math.min(1, p.ignite) * Math.PI));
    h.eyes.forEach(e => { e.setAttribute('transform', `scale(${es.toFixed(3)})`); e.setAttribute('class', p.ignite > .1 ? 'accf' : 'dim'); });
    h.face.setAttribute('class', p.ignite > .3 ? 'accf' : 'dim');

    // vitrine: closes (opacity + a slight inward scale) the instant the sixth seal lands
    h.vitrineG.setAttribute('transform', `scale(${(1.08 - .08 * p.rel).toFixed(4)})`);
    setDraw(h.vitrineRing, one(D.vitrine));
    h.vitrineRing.setAttribute('opacity', (D.vitrine ?? 1) * p.rel * .9);
    h.vitrineHi.forEach(hl => hl.setAttribute('opacity', (D.vitrine ?? 1) * p.rel * .8));

    // aim: rides the master ring; a small lock-pop on the frame it seals
    const [ax, ay] = pol(RADIUS, p.theta);
    h.aim.setAttribute('transform', `translate(${ax.toFixed(2)} ${ay.toFixed(2)}) rotate(${p.theta.toFixed(1)}) scale(${(1 + p.bounce * .08).toFixed(3)})`);
    h.aim.setAttribute('opacity', one(D.aim));
    setDraw(h.aimRing1, one(D.aim)); setDraw(h.aimRing2, one(D.aim)); setDraw(h.aimCross, one(D.aim));
    h.aimNucleus.setAttribute('class', p.lockedSet.has(p.near) ? 'icondot' : p.inRange ? 'icondot mid' : 'dim');

    // readout
    h.ro.setAttribute('opacity', one(D.hud));
    h.roIdx.textContent = NUMS[p.near];
    h.roLed.setAttribute('class', p.ripple != null ? 'acc icondot' : 'minor icondot');
    h.roCount.textContent = `${p.committed.length}/${N}`;

    // sequence strip
    h.chips.forEach((c, kk) => {
      const op = D.strip ? D.strip[kk] : 1, x = CHIP_X0 + kk * CHIP_STEP, filled = kk < p.committed.length;
      if (filled) {
        const item = p.committed[kk], pop = kk === p.committed.length - 1 ? 1 + p.bounce * .12 : 1;
        c.g.setAttribute('transform', `translate(${x} ${CHIP_Y}) scale(${pop.toFixed(3)})`);
        c.ring.setAttribute('class', 'ink'); c.ring.setAttribute('opacity', op);
        c.num.textContent = NUMS[item.i]; c.num.setAttribute('opacity', op);
      } else {
        c.g.setAttribute('transform', `translate(${x} ${CHIP_Y})`);
        c.ring.setAttribute('class', 'minor'); c.ring.setAttribute('opacity', op * .5);
        c.num.textContent = ''; c.num.setAttribute('opacity', 0);
      }
    });

    // inscription: only legible once the case is sealed
    h.inscription.setAttribute('opacity', (D.inscription ?? 1) * p.rel);
  },
});
})();
