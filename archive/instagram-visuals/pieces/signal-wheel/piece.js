/* ─────────────────────────────────────────────────────────────
   PIECE · SIGNAL WHEEL
   components/interaction/signal-wheel — the mechanic and angles of
   the source, redrawn for the stage so the drawing says what the
   input means:
     · polarity  → a hairline outer ring in two halves (+ top, − bottom)
     · likelihood → a band of three 120° zones (PROBABLE 330–90,
                    PLAUSIBLE 90–210, POSSIBLE 210–330, clock degrees)
     · value     → an accent arc from the zone's start to the needle,
                    and the large centre readout
   Dragging lerps .14/frame; on release a zone marker springs 55/8,
   as the source's dial does.
   The performance drags PROBABLE → PLAUSIBLE, taps the lower half
   (NEGATIVE), drags into POSSIBLE, taps the upper half (POSITIVE),
   then drags back round to PROBABLE 50 %, so the last pose is the
   first and EXPLODED loops without a seam.
   STORY drives it from its controls instead (SIGNAL, POLARITY,
   NOISE): SIGNAL is the needle's clock angle, read through the
   source's onMove so the zone, value arc and readout follow it; the
   zone marker runs the same lerp-then-spring over the knob's history
   (the knob turning = dragging); POLARITY eases the solid half across;
   NOISE trembles the needle with a seeded sum of sines.
   ───────────────────────────────────────────────────────────── */
(() => {

const RING_R = 280;                    // polarity ring
const TICK_O = 268, TICK_I = 258;      // 72 ticks; boundaries run TICK_B → RING_R
const TICK_B = 244;
const LABEL_R = 241;                   // zone names (centre line of the text)
const BAND_O = 230, BAND_I = 200, BAND_M = 215;
const NEEDLE_I = 96, NEEDLE_O = 194;
const ZONES = ['PROBABLE', 'PLAUSIBLE', 'POSSIBLE'];
const ZONE_START = [330, 90, 210];     // clock degrees, 0 = top, clockwise
const ZONE_BOUNDS = [90, 210, 330];
const GAP = 1.6;                       // degrees cut from each end of a zone

let uid = 0;
const wrap = d => ((d + 180) % 360 + 360) % 360 - 180;
const clockXY = (r, a) => { const q = rad(a - 90); return [Math.cos(q) * r, Math.sin(q) * r]; };
// clockwise arc a0 → a1 (a1 may exceed 360)
const arcD = (r, a0, a1) => {
  const [x0, y0] = clockXY(r, a0), [x1, y1] = clockXY(r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
// annular sector outline a0 → a1 between r0 and r1
const sectorD = (r0, r1, a0, a1) => {
  const [ax, ay] = clockXY(r1, a0), [bx, by] = clockXY(r1, a1), [cx, cy] = clockXY(r0, a1), [dx, dy] = clockXY(r0, a0);
  const L = a1 - a0 > 180 ? 1 : 0;
  return `M ${ax} ${ay} A ${r1} ${r1} 0 ${L} 1 ${bx} ${by} L ${cx} ${cy} A ${r0} ${r0} 0 ${L} 0 ${dx} ${dy} Z`;
};
// angle on the ring → zone + value, exactly as onMove in the source
function readAngle(a) {
  a = ((a % 360) + 360) % 360;
  const z = (a >= 330 || a < 90) ? 0 : a < 210 ? 1 : 2;
  let rel = a - ZONE_START[z]; if (rel < 0) rel += 360;
  return { zone: z, value: clamp(rel / 120 * 100, 0, 100) };
}
const isPos = a => { const i = Math.floor((((a % 360) + 360) % 360) / 10); return i < 9 || i >= 27; };

// the scripted performance (clock degrees on the drag band, r164 in the source → the zone band here)
const DRAG_R = BAND_M;
const EVENTS = [
  { kind: 'drag', at: 0.25, end: 1.20, from: 20,  to: 150, layer: 'zones' },  // PROBABLE → PLAUSIBLE
  { kind: 'tap',  at: 1.55, angle: 180, r: RING_R, layer: 'polarity' },      // lower half → NEGATIVE
  { kind: 'drag', at: 2.15, end: 2.80, from: 235, to: 300, layer: 'zones' },  // into POSSIBLE
  { kind: 'tap',  at: 3.10, angle: 300, r: RING_R, layer: 'polarity' },      // upper half → POSITIVE
  { kind: 'drag', at: 3.65, end: 4.15, from: 300, to: 390, layer: 'zones' },  // home: PROBABLE 50 %
];
const POSE_END = 5.2;   // the marker's 55/8 spring settles after the last release while the stack closes

// STORY: seeded needle tremble, ±1 at most
const tremble = t => .55 * Math.sin(2 * Math.PI * .9 * t) + .3 * Math.sin(2 * Math.PI * 2.3 * t + 1.1) + .15 * Math.sin(2 * Math.PI * 5.1 * t + 2.7);
const dragAngle = (e, u) => lerp(e.from, e.to, io(win(u, e.at, e.end)));
const eventXY = (e, u) => e.kind === 'drag' ? clockXY(DRAG_R, dragAngle(e, u)) : clockXY(e.r, e.angle);

function stateAt(u) {
  let pol = true, zone = 0, value = 50, dragging = false;
  for (const e of EVENTS) {
    if (u < e.at) break;
    if (e.kind === 'tap') pol = isPos(e.angle);
    else {
      const r = readAngle(dragAngle(e, u));
      zone = r.zone; value = r.value;
      if (u < e.end) dragging = true;
    }
  }
  return { pol, zone, value, dragging };
}

registerPiece({
  id: 'signal-wheel',
  code: 'SGW-05', series: 'B', n: '05',
  name: 'SIGNAL WHEEL',
  mechanic: 'POLARITY × LIKELIHOOD INPUT',
  source: 'COMPONENTS/INTERACTION/SIGNAL-WHEEL',
  hero: { v: '3', u: 'ZONES · 120° EACH' },
  extent: 316,
  spec: [
    ['INPUT',  'DRAG RING · TAP HALF · ← →'],
    ['STATE',  'POLARITY · ZONE · VALUE %'],
    ['MOTION', 'LERP .14 · SPRING 55/8'],
    ['BUILT',  'SVG · ANIME.JS 4'],
  ],
  layers: [
    { id: 'chrome',   name: 'CHROME',      note: '2 RINGS · 1 TURN / LOOP', edge: 314 },
    { id: 'polarity', name: 'POLARITY',    note: '+ SOLID · − DASHED',  edge: RING_R },
    { id: 'zones',    name: 'ZONE BAND',   note: '3 × 120° · SPRING 55/8', edge: BAND_O },
    { id: 'value',    name: 'VALUE',       note: 'ARC + NEEDLE',        edge: BAND_M },
    { id: 'readout',  name: 'READOUT',     note: '0–100 % · HUD STACK', edge: 74 },
    { id: 'input',    name: 'INPUT',       note: 'DRAG · TAP',          edge: 300 },
  ],
  // frozen at rest: PROBABLE 50 %, needle at 30°; anchors spread down the right half
  callouts: [
    { at: clockXY(BAND_M, 18),   title: 'VALUE ARC', note: 'ZONE START → NEEDLE' },
    { at: clockXY(RING_R, 52),   title: 'POLARITY',  note: '+ SOLID · − DASHED' },
    { at: clockXY(BAND_O, 76),   title: 'ZONE BAND', note: '3 × 120° · ACTIVE BOLD' },
    { at: clockXY(TICK_B, 90),   title: 'BOUNDARY',  note: '72 TICKS · 3 LEDS' },
    { at: [88, 44],              title: 'READOUT',   note: 'VALUE · HUD STACK' },
    { at: clockXY(306, 30),      title: 'CHROME',    note: '2 RINGS · 1 TURN / LOOP' },
  ],
  specU: 0.2,

  // STORY: the wheel's own inputs as panel controls (the source has no panel; it is driven by drags and taps)
  controls: [
    { id: 'signal',   label: 'SIGNAL',   kind: 'knob',   min: -30, max: 330, value: 30, fmt: v => { const r = readAngle(v); return `${String(Math.round(r.value)).padStart(3, '\u2007')}% ${ZONES[r.zone]}`; } },
    { id: 'polarity', label: 'POLARITY', kind: 'toggle', min: 0,   max: 1,   value: 1,  fmt: v => v >= .5 ? '+ POS' : '− NEG' },
    { id: 'noise',    label: 'NOISE',    kind: 'knob',   min: 0,   max: 20,  value: 0,  fmt: v => `±${v.toFixed(1)}°` },
  ],
  story: {
    tweaks: [
      { id: 'signal',   to: 270 },   // the needle sweeps PROBABLE → PLAUSIBLE → POSSIBLE; the marker springs after it
      { id: 'polarity', to: 0 },     // the solid half crosses to the bottom; − lights
      { id: 'noise',    to: 14 },    // the needle trembles; the value arc and readout flicker with it
    ],
  },
  exploded: { live: 4.4, poseEnd: POSE_END },

  build(L, sw) {
    const h = { sw };
    // ── chrome: two faint ticked rings outside the polarity ring, one turn per loop ──
    h.chrome = el('g', {}, L.chrome);
    h.chromeA = el('g', {}, h.chrome);
    for (let i = 0; i < 72; i++) {
      const deg = i * 5, long = i % 6 === 0;
      const [x1, y1] = clockXY(298, deg), [x2, y2] = clockXY(long ? 291 : 295, deg);
      el('line', { x1, y1, x2, y2, class: 'minor', 'stroke-width': long ? sw.minor : sw.minor * .6, opacity: .5 }, h.chromeA);
    }
    h.chromeB = el('g', {}, h.chrome);
    for (let i = 0; i < 24; i++) {
      const deg = i * 15;
      const [x1, y1] = clockXY(314, deg), [x2, y2] = clockXY(314 - (i % 2 ? 4 : 8), deg);
      el('line', { x1, y1, x2, y2, class: 'mid', 'stroke-width': sw.minor * .6, opacity: .3 }, h.chromeB);
    }
    // ── polarity: two halves split at 3 and 9 o'clock, a glyph gap at 12 and 6 ──
    const halves = [[270, 360], [90, 180]].map(([a0, mid]) => {
      const g = el('g', {}, L.polarity);
      const d = arcD(RING_R, a0 + 2, mid - 5) + ' ' + arcD(RING_R, mid + 5, a0 + 178);
      const solid = drawable(el('path', { d, fill: 'none', class: 'acc', 'stroke-width': sw.main }, g));
      const dash = el('path', { d, fill: 'none', class: 'minor', 'stroke-width': sw.minor, 'stroke-dasharray': '3 6' }, g);
      return { solid, dash };
    });
    h.halves = halves;
    const gl = 6;
    h.plus = el('path', { d: `M ${-gl} ${-RING_R} H ${gl} M 0 ${-RING_R - gl} V ${-RING_R + gl}`, fill: 'none', 'stroke-width': sw.main, 'stroke-linecap': 'round' }, L.polarity);
    h.minus = el('path', { d: `M ${-gl} ${RING_R} H ${gl}`, fill: 'none', 'stroke-width': sw.main, 'stroke-linecap': 'round' }, L.polarity);
    h.ticks = [];
    for (let i = 0; i < 72; i++) {
      const deg = i * 5, bound = ZONE_BOUNDS.includes(deg);
      const [x1, y1] = clockXY(bound ? TICK_B : TICK_I, deg), [x2, y2] = clockXY(bound ? RING_R - 4 : TICK_O, deg);
      h.ticks.push(el('line', { x1, y1, x2, y2, class: bound ? 'ink' : 'minor', 'stroke-width': bound ? sw.main : sw.minor }, L.polarity));
    }
    // boundary LEDs: lit at the active zone's leading boundary
    h.bleds = ZONE_BOUNDS.map(deg => {
      const [x, y] = clockXY(237, deg);
      const g = el('g', {}, L.polarity);
      el('circle', { cx: x, cy: y, r: 7, fill: 'none', class: 'minor', 'stroke-width': sw.minor * .6 }, g);
      const dot = el('circle', { cx: x, cy: y, r: 3.5, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      return { g, dot, deg };
    });

    // ── zones: three outlined sectors, names along the arc, a marker riding the band ──
    h.zones = ZONES.map((name, i) => {
      const a0 = ZONE_START[i] + GAP, a1 = ZONE_START[i] + 120 - GAP;
      const g = el('g', {}, L.zones);
      const band = drawable(el('path', { d: sectorD(BAND_I, BAND_O, a0, a1), fill: 'none', 'stroke-width': sw.minor }, g));
      // text path: clockwise across the top, counter-clockwise across the bottom so it reads upright
      const c = ZONE_START[i] + 60, cn = ((c % 360) + 360) % 360;
      const flip = cn > 100 && cn < 260;
      const id = `sgw-zone-${++uid}`;
      el('path', { id, d: flip ? (() => {
        const [x0, y0] = clockXY(LABEL_R, a1), [x1, y1] = clockXY(LABEL_R, a0);
        return `M ${x0} ${y0} A ${LABEL_R} ${LABEL_R} 0 0 0 ${x1} ${y1}`;
      })() : arcD(LABEL_R, a0, a1), fill: 'none' }, g);
      const t = el('text', { 'font-size': 10.5, 'letter-spacing': '.32em', 'dominant-baseline': 'central' }, g);
      const tp = el('textPath', { href: `#${id}`, startOffset: '50%', 'text-anchor': 'middle' }, t);
      tp.textContent = name;
      return { band, text: t };
    });
    h.marker = el('path', { d: `M 0 ${-BAND_O + 1} L -5 ${-BAND_O - 8} L 5 ${-BAND_O - 8} Z`, class: 'accf' }, L.zones);
    // dim knob track under the value arc
    h.track = el('circle', { r: BAND_M, fill: 'none', class: 'minor', 'stroke-width': sw.minor, opacity: .4 }, L.zones);
    // boundary brackets: a lock mark at each end of the active zone
    h.bbrackets = ZONE_BOUNDS.map(deg => {
      const [x, y] = clockXY(BAND_O + 12, deg);
      const g = el('g', { transform: `translate(${x} ${y})`, opacity: 0 }, L.zones);
      const s = 9, c = 4;
      [`M ${-s} ${-s + c} L ${-s} ${-s} L ${-s + c} ${-s}`,
       `M ${s - c} ${-s} L ${s} ${-s} L ${s} ${-s + c}`,
       `M ${s} ${s - c} L ${s} ${s} L ${s - c} ${s}`,
       `M ${-s + c} ${s} L ${-s} ${s} L ${-s} ${s - c}`]
        .forEach(d => el('path', { d, fill: 'none', 'stroke-width': sw.minor, 'stroke-linecap': 'square' }, g));
      return { g, deg };
    });

    // ── value: arc along the band from zone start to the needle, and the needle ──
    h.arc = el('path', { fill: 'none', class: 'acc', 'stroke-width': sw.main * 1.9, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '1 1' }, L.value);
    h.needle = el('g', {}, L.value);
    h.shaft = drawable(el('line', { x1: 0, y1: -NEEDLE_I, x2: 0, y2: -NEEDLE_O + 7, class: 'acc', 'stroke-width': sw.main }, h.needle));
    h.tip = el('path', { d: `M 0 ${-NEEDLE_O - 3} L 4.5 ${-NEEDLE_O + 8} L -4.5 ${-NEEDLE_O + 8} Z`, class: 'accf' }, h.needle);
    // needle tip LED: on while dragging
    h.nled = el('circle', { cx: 0, cy: -NEEDLE_O - 9, r: 3.5, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.needle);

    // ── readout: the value, large; the zone and sign under it; a HUD stack on the right ──
    h.read = el('text', { x: 0, y: 20, 'text-anchor': 'middle', class: 'disp' }, L.readout);
    h.num = el('tspan', { 'font-size': 66, 'font-weight': 200, 'letter-spacing': '-.02em' }, h.read);
    h.pct = el('tspan', { 'font-size': 18, 'font-weight': 300, dx: 3, class: 'dim' }, h.read);
    h.pct.textContent = '%';
    h.micro = txt(L.readout, 0, 50, '', { 'text-anchor': 'middle', 'font-size': 11, 'letter-spacing': '.28em', class: 'dim' });
    // focus rings around the readout while dragging (radial-goo-bloom)
    h.focus = el('g', { opacity: 0 }, L.readout);
    [42, 50].forEach((r, i) => el('circle', { r, fill: 'none', class: 'acc', 'stroke-width': sw.minor * .8, 'stroke-opacity': [.4, .2][i] }, h.focus));
    // HUD column (radial-goo-bloom): zone · polarity, right of the centre readout
    h.hud = el('g', {}, L.readout);
    txt(h.hud, 150, -28, 'ZONE', { 'font-size': 9, 'letter-spacing': '.28em', class: 'dim' });
    h.hudZone = txt(h.hud, 150, -8, 'PROBABLE', { 'font-size': 11, 'letter-spacing': '.18em' });
    txt(h.hud, 150, 12, 'POL', { 'font-size': 9, 'letter-spacing': '.28em', class: 'dim' });
    h.hudSign = txt(h.hud, 150, 36, '+', { class: 'disp accf', 'font-size': 20, 'font-weight': 300 });
    // colour rule, broken (rev C): the piece owns its hue — green, the live component's signal
    // colour — so the mode accents and selected fills render in it, in every mode.
    el('style', {}, L.readout.ownerSVGElement).textContent =
      '.acc{stroke:#5BE39A}.accf{fill:#5BE39A}.on .disc{fill:#5BE39A}.on .ink{stroke:#5BE39A}.on .accf{fill:#5BE39A}';
    return h;
  },

  pose(u, ctl) {
    // live on the controls (STORY): the marker and the polarity ease are simulated over the knobs'
    // history (ctl.integ hands over every sample in order); the needle reads ctl.v directly
    if (ctl) {
      const dt = 1 / 120, lerpK = 1 - Math.pow(0.86, dt * 60);
      let m = 60, v = 0, snap = 60, was = false, prev = null, dragging = false, pm = 1, pv = 0;
      ctl.integ(c => {
        dragging = prev != null && Math.abs(c.signal - prev) > 1e-4; prev = c.signal;
        const target = ZONE_START[readAngle(c.signal).zone] + 60;
        if (dragging) { m += wrap(target - m) * lerpK; v = 0; was = true; }
        else {
          if (was) { snap = m + wrap(target - m); was = false; }
          v += (55 * (snap - m) - 8 * v) * dt;
          m += v * dt;
        }
        pv += (120 * ((c.polarity >= .5 ? 1 : 0) - pm) - 20 * pv) * dt; pm += pv * dt;
        return 0;
      });
      const r = readAngle(ctl.v.signal + ctl.v.noise * tremble(u));
      return { pol: ctl.v.polarity >= .5, polMix: clamp(pm), zone: r.zone, value: r.value, dragging, marker: m, needle: ZONE_START[r.zone] + r.value / 100 * 120 };
    }
    const st = stateAt(u);
    // zone marker: follows while dragging (lerp .14/frame at 60 fps), springs 55/8 on release
    const dt = 1 / 120, lerpK = 1 - Math.pow(0.86, dt * 60);
    let m = 60, v = 0, snap = 60, was = false;
    for (let t = 0; t < u; t += dt) {
      const s = stateAt(t), target = ZONE_START[s.zone] + 60;
      if (s.dragging) { m += wrap(target - m) * lerpK; v = 0; was = true; }
      else {
        if (was) { snap = m + wrap(target - m); was = false; }
        v += (55 * (snap - m) - 8 * v) * dt;
        m += v * dt;
      }
    }
    return { ...st, marker: m, needle: ZONE_START[st.zone] + st.value / 100 * 120 };
  },

  finger(u) {
    let from = [190, 300], prevEnd = -0.6;
    for (const e of EVENTS) {
      const start = eventXY(e, e.at);
      const a = Math.max(prevEnd + .1, e.at - .45), b = e.at - .03;
      if (u < b) {
        const k = io(win(u, a, b));
        return { x: lerp(from[0], start[0], k), y: lerp(from[1], start[1], k) };
      }
      if (e.kind === 'drag' && u < e.end) {
        const [x, y] = eventXY(e, u);
        return { x, y, down: true, layer: e.layer };
      }
      const endXY = eventXY(e, e.kind === 'drag' ? e.end : e.at);
      if (e.kind === 'tap' && u < e.at + .5) return { x: endXY[0], y: endXY[1], pulse: win(u, e.at, e.at + .5), tap: e };
      from = endXY; prevEnd = e.kind === 'drag' ? e.end : e.at;
    }
    return { x: from[0], y: from[1] };
  },

  apply(h, p, D) {
    D = D || {};
    const one = k => k ?? 1;
    const t = p.t ?? 0, T = p.T || 1;
    // chrome: one turn per loop, opposite ways, always seamless
    h.chromeA.setAttribute('transform', `rotate(${(t / T * 360).toFixed(3)})`);
    h.chromeB.setAttribute('transform', `rotate(${(-t / T * 360).toFixed(3)})`);
    h.chrome.setAttribute('opacity', one(D.chrome));
    // polarity: active half solid, inactive dashed
    // (STORY eases across with p.polMix, 1 = top half solid)
    h.halves.forEach((hf, i) => {
      const w = p.polMix != null ? (i === 0 ? p.polMix : 1 - p.polMix) : ((i === 0) === p.pol ? 1 : 0), k = one(D.ring);
      setDraw(hf.solid, w * k);
      hf.dash.setAttribute('opacity', (1 - w) * win(k, .2, 1));
    });
    h.plus.setAttribute('class', p.pol ? 'acc' : 'minor');
    h.minus.setAttribute('class', p.pol ? 'minor' : 'acc');
    h.plus.setAttribute('opacity', one(D.glyph));
    h.minus.setAttribute('opacity', one(D.glyph));
    h.ticks.forEach((tt, i) => tt.setAttribute('opacity', D.ticks ? D.ticks[i] : 1));
    // boundary LEDs: lit at the active zone's leading boundary
    h.bleds.forEach(b => {
      const on = ZONE_START[p.zone] === b.deg;
      b.dot.setAttribute('class', on ? 'icondot' : 'minor');
      if (on) b.dot.removeAttribute('fill'); else b.dot.setAttribute('fill', 'none');
      b.g.setAttribute('opacity', one(D.leds));
    });
    // zones
    h.zones.forEach((z, i) => {
      const sel = i === p.zone;
      z.band.setAttribute('class', sel ? 'ink' : 'minor');
      z.band.setAttribute('stroke-width', sel ? h.sw.main : h.sw.minor);
      setDraw(z.band, D.bands ? D.bands[i] : 1);
      z.text.setAttribute('class', sel ? 'accf' : 'dim');
      z.text.setAttribute('opacity', one(D.labels));
    });
    h.marker.setAttribute('transform', `rotate(${p.marker})`);
    h.marker.setAttribute('opacity', one(D.marker));
    // knob track + boundary brackets: leading bracket lit, trailing dim
    h.track.setAttribute('opacity', .4 * one(D.track));
    h.bbrackets.forEach(b => {
      const lead = ZONE_START[p.zone] === b.deg, trail = ((ZONE_START[p.zone] + 120) % 360) === b.deg;
      b.g.setAttribute('opacity', (lead ? 1 : trail ? .55 : 0) * one(D.brackets));
      b.g.querySelectorAll('path').forEach(q => q.setAttribute('class', lead ? 'acc' : 'mid'));
    });
    // value arc + needle
    const a0 = ZONE_START[p.zone] + GAP, a1 = Math.max(a0 + .01, p.needle);
    h.arc.setAttribute('d', arcD(BAND_M, a0, a1));
    setDraw(h.arc, p.needle - a0 < .3 ? 0 : one(D.value));
    h.needle.setAttribute('transform', `rotate(${p.needle})`);
    setDraw(h.shaft, one(D.needle));
    h.tip.setAttribute('opacity', win(one(D.needle), .85, 1));
    // needle tip LED + focus rings: live while dragging
    h.nled.setAttribute('class', p.dragging ? 'icondot' : 'minor');
    if (p.dragging) h.nled.removeAttribute('fill'); else h.nled.setAttribute('fill', 'none');
    h.nled.setAttribute('opacity', one(D.needle));
    h.focus.setAttribute('opacity', p.dragging ? 1 : 0);
    h.focus.setAttribute('transform', `scale(${(1 + .03 * Math.sin(2 * Math.PI * t)).toFixed(4)})`);
    // readout
    h.num.textContent = String(Math.round(p.value));
    h.micro.textContent = `${ZONES[p.zone]} · ${p.pol ? 'POS' : 'NEG'}`;
    h.read.setAttribute('opacity', one(D.readout));
    h.micro.setAttribute('opacity', one(D.micro));
    // HUD column
    h.hudZone.textContent = ZONES[p.zone];
    h.hudSign.textContent = p.pol ? '+' : '−';
    h.hud.setAttribute('opacity', one(D.hud));
  },

  // assembly: seeds at the centre and the three zone boundaries
  assembly: {
    seeds: [[0, 0], ...ZONE_BOUNDS.map(d => clockXY(BAND_M, d)), clockXY(RING_R, 0), clockXY(RING_R, 180)],
    live: 2.8,
    end: 2.1,          // after the polarity tap; the later drags are exploded-only
    draw: t => {
      const out = (a, b) => dOff(t, a, b);
      return {
        chrome: dOn(t, 1.2, 1.9) * out(6.3, 7.0),
        ring: dOn(t, .8, 1.8) * out(6.4, 7.2),
        glyph: dOn(t, 1.6, 1.9) * out(6.2, 6.5),
        ticks: Array.from({ length: 72 }, (_, i) => {
          const a = 1.0 + stag(i, 72, 1.0 / 72), b = 6.0 + stag(71 - i, 72, .9 / 72);
          return dOn(t, a, a + .1) * dOff(t, b, b + .1);
        }),
        bands: [0, 1, 2].map(i => dOn(t, 1.3 + stag(i, 3, .15), 2.0 + stag(i, 3, .15)) * out(6.1 + stag(i, 3, .12), 6.7 + stag(i, 3, .12))),
        labels: dOn(t, 2.0, 2.5) * out(6.0, 6.3),
        marker: dOn(t, 2.2, 2.5) * out(5.9, 6.2),
        value: dOn(t, 2.1, 2.6) * out(5.8, 6.3),
        needle: dOn(t, 1.9, 2.5) * out(6.0, 6.5),
        readout: dOn(t, 1.5, 2.1) * out(6.6, 7.1),
        micro: dOn(t, 2.2, 2.6) * out(6.3, 6.6),
        leds: dOn(t, 1.5, 2.0) * out(6.1, 6.5),
        track: dOn(t, 1.6, 2.1) * out(5.9, 6.3),
        brackets: dOn(t, 2.0, 2.4) * out(6.0, 6.3),
        hud: dOn(t, 2.2, 2.6) * out(6.3, 6.6),
      };
    },
  },
});
})();
