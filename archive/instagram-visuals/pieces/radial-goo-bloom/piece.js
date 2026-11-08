/* ─────────────────────────────────────────────────────────────
   PIECE · RADIAL GOO BLOOM
   tools/radial-goo-bloom — redrawn as layered SVG from the same
   geometry: a Ø32 seed hub that springs to Ø144, 8 satellites
   (r40) blooming to R170 at 80 ms stagger, 3 sub-nodes (r28)
   fanning ±45° at D100, all on one spring (38/16, overdamped),
   merged by the same two-pass goo filter (blur 14/10, α×28−14).
   Counter-rotating chrome rings: 50 s / 35 s / 80 s / 20 s.
   STORY drives it from the source's spring sliders (STIFFNESS,
   DAMPING), the hub tap as a BLOOM toggle, and SPREAD (the orbit
   radius): each flip of BLOOM springs the hub and the 8 satellites
   (80 ms stagger out, 40 ms reversed in) on the stiffness / damping
   set at that moment, so with low damping the re-bloom overshoots
   and rings; pulling SPREAD in lets the goo fuse the satellites
   into the hub and each other.
   ───────────────────────────────────────────────────────────── */
(() => {

const SEED_R = 16, CORE_R = 72, ORBIT_R = 170, SAT_R = 40, SUB_DIST = 100, SUB_R = 28;
const N = 8, K = 38, C = 16, STAG = .08;
const satAng = i => rad(-90 + i * 45);
const satXY = (i, d = ORBIT_R) => [Math.cos(satAng(i)) * d, Math.sin(satAng(i)) * d];
const subAng = (j, k) => satAng(j) + rad((k - 1) * 45);
const sstep = t => springStep(t, K, C);

// the scripted performance — ends where it starts (bloomed, satellite 3 selected) so loops are seamless
const TAPS = [
  { at: 0.30, hub: 1, layer: 'goo' },     // hub → collapse everything to the seed
  { at: 1.10, hub: 1, layer: 'goo' },     // hub → bloom
  { at: 1.90, sat: 2, layer: 'goo' },     // satellite 3 → sub-bloom
  { at: 2.90, sat: 2, layer: 'goo' },     // satellite 3 → collapse its sub-bloom
];

// ScifiMod01 / ScifiMod02 badge glyphs from the source <symbol>s
// [kind, data, role]: role f = white fill, s = white stroke, a = accent stroke
const MOD01 = { vb: [611, 373], parts: [
  ['c', [279.3, 114.5, 5], 'a'], ['c', [248.5, 114.5, 5], 'a'], ['c', [263.9, 114.5, 5], 'a'],
  ['p', 'M343 205.818L243.758 206.339L261.676 192.923L248.702 192.923L230.469 206.409L59.0796 207.308L0.881708 187.274L213.319 184.899L256.962 143.178L333.002 143.178L361.295 171.931L342.829 188.892L355.868 189.213L367.63 178.369L374.647 185.5L368.37 185.597L343 205.818Z', 'f'],
  ['p', 'M477.762 175.057L436.675 217.025L429.999 200.852L450.674 178.917L450.717 166.491L477.704 138.716L477.704 146.916L482.221 142.848L482.221 134.068L519.02 96.1939L528.628 96.2111L531.166 93.5188L557.589 93.5189L497.332 155.067L497.332 145.81L477.762 165.756Z', 'f'],
  ['p', 'M456.506 172.53L456.506 120.624L511.011 64L572.932 64L599.999 85.0527L599.999 109.009', 's'],
  ['c', [197.5, 142.5, 7.91379], 'f'], ['c', [197.5, 142.5, 13], 'a'],
] };
const MOD02 = { vb: [654, 653], parts: [
  ['p', 'M258.32 343.367L131.103 343.282L132.531 323.283L140.16 317.586L145.858 323.283L158.953 323.283L147.659 311.985L170.749 294.741L201.123 294.741L225.202 318.819L209.694 294.741L241.067 294.741L246.062 282.804L287.459 282.804L328.229 323.283L246.807 323.283L234.933 311.409L226.095 311.141L238.236 323.283L258.32 343.367ZM266.709 343.372L246.807 323.283L328.229 323.283L293.662 343.39Z', 'f'],
  ['p', 'M289.661 325.426L238.594 274.359L130.389 271.145L70.7509 330.783L65.3942 377.565L88.9637 401.134', 's'],
  ['c', [424.296, 362.206, 36.3675], 's'], ['c', [424.296, 362.206, 15.1561], 'f'],
  ['c', [260.786, 403.342, 31.172], 'a'], ['c', [212.781, 403.343, 31.172], 'a'],
] };

function glyph(parent, mod, sw) {
  const [vw, vh] = mod.vb;
  const box = el('svg', { viewBox: `0 0 ${vw} ${vh}`, overflow: 'visible', opacity: 0 }, parent);
  // strokes in viewBox units, sized for the satellite at full radius
  const k = SAT_R * 1.8 / vw;
  for (const [kind, d, role] of mod.parts) {
    const a = role === 'f' ? { class: 'icondot' } : { class: role === 'a' ? 'acc' : 'icon', fill: 'none', 'stroke-width': sw.icon * .8 / k };
    if (kind === 'p') el('path', { d, ...a }, box);
    else el('circle', { cx: d[0], cy: d[1], r: d[2], ...a }, box);
  }
  return box;
}

registerPiece({
  id: 'radial-goo-bloom',
  code: 'BLM-06', series: 'C', n: '06',
  name: 'RADIAL GOO BLOOM',
  mechanic: 'SPRING BLOOM · GOO MERGE',
  source: 'TOOLS/RADIAL-GOO-BLOOM',
  hero: { v: '2', u: 'BLOOM LEVELS · 8 + 3' },
  extent: 300,
  spec: [
    ['INPUT',  'TAP HUB · TAP NODE · TAP EMPTY'],
    ['STATE',  'NODE TREE · DEPTH ≤ 2 · 1 SELECTED'],
    ['MOTION', 'SPRING 38/16 · STAGGER 80 MS'],
    ['BUILT',  'SVG GOO FILTER · ANIME.JS 4'],
  ],
  layers: [
    { id: 'chrome', name: 'CHROME RINGS', note: '4 RINGS · COUNTER-SPIN', edge: 238 },
    { id: 'goo',    name: 'GOO BLOBS',    note: 'BLUR 14 · α ×28 −14', edge: 210 },
    { id: 'links',  name: 'LINKS',        note: 'HUB → NODE · DASHED', edge: 170 },
    { id: 'glyphs', name: 'GLYPHS',       note: 'BADGES · FOCUS RINGS', edge: 218 },
    { id: 'input',  name: 'INPUT',        note: 'TAP · HIT r + 16', edge: 300 },
  ],
  // right half; leaders run radially out between the satellites
  callouts: [
    { at: [Math.cos(rad(-70)) * 231, Math.sin(rad(-70)) * 231], title: 'CHROME', note: '50 · 35 · 80 · 20 S' },
    { at: satXY(1),                           title: 'SATELLITE', note: '8 × 45° · R170' },
    { at: [ORBIT_R + SUB_DIST, 0],            title: 'SUB-BLOOM', note: '3 × 45° · D100' },
    { at: [Math.cos(rad(30)) * CORE_R, Math.sin(rad(30)) * CORE_R], title: 'HUB', note: 'Ø32 → Ø144' },
    { at: satXY(3, ORBIT_R + SAT_R), title: 'GOO', note: 'BLOBS MERGE IN FLIGHT' },
  ],
  taps: TAPS,
  specU: 2.85,

  // STORY: the source's spring sliders, the hub tap as a toggle, and the orbit radius
  controls: [
    { id: 'bloom', label: 'BLOOM',     kind: 'toggle', min: 0,  max: 1,  value: 1, fmt: v => v ? 'OPEN' : 'SEED' },
    { id: 'stiff', label: 'STIFFNESS', kind: 'knob',   min: 12, max: 90, value: K, fmt: v => `${Math.round(v).toString().padStart(2, '0')} K` },
    { id: 'damp',  label: 'DAMPING',   kind: 'knob',   min: 5,  max: 26, value: C, fmt: v => `${Math.round(v).toString().padStart(2, '0')} C` },
    { id: 'spread', label: 'SPREAD',   kind: 'slider', min: 110, max: 210, value: ORBIT_R, fmt: v => `R ${Math.round(v)} PX` },
  ],
  story: {
    tweaks: [
      { id: 'bloom', to: 0 },     // satellites stagger back into the hub; the hub shrinks to the seed
      { id: 'damp',  to: 5 },     // the spring goes loose (ζ ≈ .4)
      { id: 'bloom', to: 1 },     // re-bloom: satellites fly out, overshoot R170 and ring
      { id: 'spread', to: 122 },  // satellites draw in until the goo bridges them into one flower
    ],
  },
  exploded: { live: 4.4 },
  assembly: {
    // the hub and the eight places the satellites will land
    seeds: [[0, 0], ...Array.from({ length: N }, (_, i) => satXY(i))],
    live: 2.8,
    end: 3.2,
    draw: t => {
      const norm = a => clamp(sstep(t - a) / sstep(2.8 - a));
      return {
        ringA: dOn(t, .7, 1.7) * dOff(t, 6.3, 7.1),
        ringB: dOn(t, .85, 1.85) * dOff(t, 6.2, 7.0),
        orbit: dOn(t, 1.0, 1.8) * dOff(t, 6.0, 6.8),
        marks: dOn(t, 1.1, 1.6) * dOff(t, 6.0, 6.5),
        hub: dOn(t, .9, 1.4) * dOff(t, 6.6, 7.2),
        sats: Array.from({ length: N }, (_, i) => norm(1.25 + stag(i, N, STAG))),
        out: dOff(t, 5.9, 6.7),
      };
    },
  },

  build(L, sw) {
    const h = {};
    // ── chrome: A thick ring (two edges) rotated 45°, B thin ring, C/D marker rings + accent orbit
    h.ringA = el('g', {}, L.chrome);
    h.ringAc = [224, 238].map(r => drawable(el('circle', { r, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.ringA)));
    h.ringB = el('g', {}, L.chrome);
    h.ringBc = drawable(el('circle', { r: 231, fill: 'none', class: 'mid', 'stroke-width': sw.minor }, h.ringB));
    h.ringC = el('g', {}, L.chrome);
    h.ringD = el('g', {}, L.chrome);
    h.marks = [];
    for (const g of [h.ringC, h.ringD]) {
      for (let i = 0; i < 4; i++) {
        const a = rad(i * 90);
        h.marks.push(el('circle', { cx: Math.cos(a) * 160, cy: Math.sin(a) * 160, r: 10, fill: 'none', class: 'mid', 'stroke-width': sw.minor }, g));
      }
    }
    h.orbit = [
      drawable(el('circle', { r: 119, fill: 'none', class: 'acc', 'stroke-width': sw.minor * .5, opacity: .7 }, h.ringC)),
      drawable(el('circle', { r: 119, fill: 'none', class: 'acc', 'stroke-width': sw.minor }, h.ringD)),
    ];

    // ── goo: the same two-pass filter, outer halo in ink, inner fill in the ground
    const defs = el('defs', {}, L.goo);
    for (const [id, sd, a, b] of [['goo-blm-o', 14, 28, -14], ['goo-blm-i', 10, 30, -15]]) {
      const f = el('filter', { id, x: '-60%', y: '-60%', width: '220%', height: '220%' }, defs);
      el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: sd, result: 'blur' }, f);
      el('feColorMatrix', { in: 'blur', mode: 'matrix', values: `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${a} ${b}` }, f);
    }
    const outer = el('g', { filter: 'url(#goo-blm-o)', opacity: .55 }, L.goo);
    const inner = el('g', { filter: 'url(#goo-blm-i)' }, L.goo);
    const blob = () => ({ o: el('circle', { r: 0, class: 'icondot' }, outer), i: el('circle', { r: 0, class: 'disc' }, inner) });
    h.hub = blob();
    h.sats = Array.from({ length: N }, blob);
    h.subs = Array.from({ length: N }, () => [0, 1, 2].map(blob));

    // ── links: hub → satellite (selected solid accent), satellite → sub (fine dash)
    h.links = Array.from({ length: N }, () => el('line', { 'stroke-width': sw.minor }, L.links));
    h.subLinks = Array.from({ length: N }, () => [0, 1, 2].map(() =>
      el('line', { class: 'minor', 'stroke-width': sw.minor * .7, 'stroke-dasharray': '3 5' }, L.links)));

    // ── glyphs: badges, brackets, selection rings, focus rings, hub mark
    h.idle = el('circle', { fill: 'none', class: 'mid', 'stroke-width': sw.minor, opacity: 0 }, L.glyphs);
    h.badges = Array.from({ length: N }, (_, i) => glyph(L.glyphs, i % 2 === 0 ? MOD01 : MOD02, sw));
    h.subBadges = Array.from({ length: N }, () => [0, 1, 2].map(() => glyph(L.glyphs, MOD02, sw)));
    h.brackets = Array.from({ length: N }, () => el('path', { fill: 'none', 'stroke-linecap': 'square' }, L.glyphs));
    h.selRings = [
      el('circle', { fill: 'none', class: 'acc', 'stroke-width': sw.main * .6, 'stroke-dasharray': '3 4', opacity: 0 }, L.glyphs),
      el('circle', { fill: 'none', class: 'acc', 'stroke-width': sw.minor * .5, opacity: 0 }, L.glyphs),
    ];
    h.focus = [1, .5, .2].map(op => el('circle', { fill: 'none', class: 'mid', 'stroke-width': sw.minor, 'data-op': op, opacity: 0 }, L.glyphs));
    h.focusDot = el('circle', { r: 4, class: 'icondot', opacity: 0 }, L.glyphs);
    h.hubRing = el('circle', { fill: 'none', class: 'acc', 'stroke-width': sw.minor, opacity: .6 }, L.glyphs);
    h.hubDot = el('circle', { r: 3, class: 'accf' }, L.glyphs);
    return h;
  },

  // the tree u seconds into the performance (assembled = fully bloomed, hub focused)
  pose(u, ctl) {
    // live on the controls (STORY): find each BLOOM flip by walking ctl.integ's samples in order
    // (it calls f once per 1/120 s step, oldest first), and spring hub + satellites from there on
    // the STIFFNESS / DAMPING read at that flip. SPREAD is read directly. No taps, no sub-blooms.
    if (ctl) {
      const flips = [];
      let prev = null, n = 0;
      ctl.integ(v => { if (prev != null && v.bloom !== prev) flips.push({ k: n, to: v.bloom, K: Math.round(v.stiff), C: Math.round(v.damp) }); prev = v.bloom; n++; return 0; });
      const dt = n ? u / n : 0;
      const hubSteps = [], satSteps = Array.from({ length: N }, () => []);
      for (const f of flips) {
        const at = f.k * dt;
        hubSteps.push({ at, to: f.to ? CORE_R : SEED_R, k: f.K, c: f.C });
        for (let i = 0; i < N; i++) satSteps[i].push({ at: at + (f.to ? i * STAG : (N - 1 - i) * STAG * .5), to: f.to, k: f.K, c: f.C });
      }
      const open = ctl.v.bloom >= .5;
      return {
        hubR: sprung(CORE_R, hubSteps, u),
        sats: satSteps.map(st => sprung(1, st, u)),
        subs: Array.from({ length: N }, () => [0, 1, 2].map(() => ({ q: 0, c: 0, to: 'hub' }))),
        selected: 2, focused: open ? 'hub' : null, hubOpen: open,
        spread: ctl.v.spread,
        rot: u,
      };
    }
    const satSteps = Array.from({ length: N }, () => []), hubSteps = [];
    const subs = {};                 // sat j → { at, cAt, cTo }
    const open = new Set();
    let hubOpen = true, hubNow = true, selected = 2, focused = 2;
    for (const tp of TAPS) {
      const past = u >= tp.at;
      if (tp.sat != null) {
        const j = tp.sat;
        if (open.has(j)) { [0, 1, 2].forEach(k => { subs[j]['c' + k] = tp.at + (2 - k) * STAG * .5; }); subs[j].cTo = 'sat'; open.delete(j); }
        else { subs[j] = { at: tp.at }; open.add(j); }
        if (past) { selected = j; focused = j; }
      } else if (hubOpen) {
        // collapse(hub): depth-first doomed list, reversed 40 ms stagger, everything to the hub
        const doomed = [];
        for (let i = 0; i < N; i++) {
          if (open.has(i)) [0, 1, 2].forEach(k => doomed.push(['sub', i, k]));
          doomed.push(['sat', i]);
        }
        doomed.forEach((d, idx) => {
          const at = tp.at + (doomed.length - 1 - idx) * STAG * .5;
          if (d[0] === 'sat') satSteps[d[1]].push({ at, to: 0, k: K, c: C });
          else { subs[d[1]].cTo = 'hub'; subs[d[1]]['c' + d[2]] = at; }
        });
        hubSteps.push({ at: tp.at, to: SEED_R, k: K, c: C });
        open.clear(); hubOpen = false;
        if (past) { focused = null; hubNow = false; }
      } else {
        hubSteps.push({ at: tp.at, to: CORE_R, k: K, c: C });
        for (let i = 0; i < N; i++) satSteps[i].push({ at: tp.at + i * STAG, to: 1, k: K, c: C });
        hubOpen = true;
        if (past) { focused = 'hub'; hubNow = true; }
      }
    }
    const subState = Array.from({ length: N }, (_, j) => [0, 1, 2].map(k => {
      const s = subs[j];
      if (!s) return { q: 0, c: 0, to: 'hub' };
      const q = sstep(u - (s.at + k * STAG));
      const cAt = s['c' + k];
      return { q, c: cAt != null ? sstep(u - cAt) : 0, to: s.cTo };
    }));
    return {
      hubR: sprung(CORE_R, hubSteps, u),
      sats: satSteps.map(st => sprung(1, st, u)),
      subs: subState,
      selected, focused, hubOpen: hubNow,
      rot: u,
    };
  },

  finger(u) {
    const pt = tp => tp.sat != null ? satXY(tp.sat) : [0, 0];
    let from = [215, 225], prevAt = -0.6;   // rest point, lower right
    for (const tp of TAPS) {
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

  apply(h, p, D) {
    D = D || {};
    const one = v => v ?? 1;
    // chrome spins (deg = 360 · u / period); A sits at +45°
    // rings A/B are plain circles, C/D have 4-fold markers: D turns 90° per 4.4 s
    // (source: 18°/s) so the frame at the end of a performance matches the start
    h.ringA.setAttribute('transform', 'rotate(45)');
    h.ringD.setAttribute('transform', `rotate(${-90 * p.rot / 4.4 + 22.5})`);
    h.ringAc.forEach(c => setDraw(c, one(D.ringA)));
    setDraw(h.ringBc, one(D.ringB));
    h.orbit.forEach(c => setDraw(c, one(D.orbit)));
    h.marks.forEach(m => m.setAttribute('opacity', one(D.marks)));

    // blobs
    const R = p.spread ?? ORBIT_R;   // orbit radius (STORY's SPREAD)
    const put = (b, x, y, rr, halo) => {
      b.o.setAttribute('cx', x); b.o.setAttribute('cy', y); b.o.setAttribute('r', rr > 0 ? rr + halo : 0);
      b.i.setAttribute('cx', x); b.i.setAttribute('cy', y); b.i.setAttribute('r', Math.max(rr, 0));
    };
    const hubR = p.hubR * one(D.hub);
    put(h.hub, 0, 0, hubR, 2.5);
    const sat = p.sats.map((v, i) => {
      const k = v * (D.sats ? D.sats[i] : 1) * one(D.out);
      const [x, y] = satXY(i, R * k);
      return { x, y, r: SAT_R * k };
    });
    sat.forEach((s, i) => put(h.sats[i], s.x, s.y, s.r, 1.5));
    const sub = p.subs.map((row, j) => row.map((s, k) => {
      const [bx, by] = satXY(j, R);
      const a = subAng(j, k);
      const px = bx + Math.cos(a) * SUB_DIST * s.q, py = by + Math.sin(a) * SUB_DIST * s.q;
      const [tx, ty] = s.to === 'sat' ? [bx, by] : [0, 0];
      const o = one(D.out);
      return { x: lerp(px, tx, s.c) * o, y: lerp(py, ty, s.c) * o, r: SUB_R * s.q * (1 - s.c) * o };
    }));
    sub.forEach((row, j) => row.forEach((s, k) => put(h.subs[j][k], s.x, s.y, s.r, 1.5)));

    // links
    sat.forEach((s, i) => {
      const ln = h.links[i], on = i === p.selected;
      ln.setAttribute('x1', 0); ln.setAttribute('y1', 0); ln.setAttribute('x2', s.x); ln.setAttribute('y2', s.y);
      ln.setAttribute('class', on ? 'acc' : 'mid');
      ln.setAttribute('stroke-dasharray', on ? 'none' : '4 4');
      ln.setAttribute('opacity', s.r >= 4 ? 1 : 0);
    });
    sub.forEach((row, j) => row.forEach((s, k) => {
      const ln = h.subLinks[j][k];
      ln.setAttribute('x1', sat[j].x); ln.setAttribute('y1', sat[j].y); ln.setAttribute('x2', s.x); ln.setAttribute('y2', s.y);
      ln.setAttribute('opacity', s.r >= 4 ? 1 : 0);
    }));

    // badges + brackets on satellites
    const place = (box, x, y, rr, scale) => {
      const sz = rr * scale;
      box.setAttribute('x', x - sz / 2); box.setAttribute('y', y - sz / 2);
      box.setAttribute('width', Math.max(sz, .01)); box.setAttribute('height', Math.max(sz, .01));
    };
    sat.forEach((s, i) => {
      const on = i === p.selected;
      const alpha = clamp((s.r - 12) / 20);
      place(h.badges[i], s.x, s.y, s.r, 1.8);
      h.badges[i].setAttribute('opacity', s.r < 12 ? 0 : alpha * (on ? 1 : .35));
      const b = h.brackets[i];
      if (s.r > 20) {
        const br = s.r + 8, bc = 6, x = s.x, y = s.y;
        b.setAttribute('d', `M${x - br} ${y - br + bc}L${x - br} ${y - br}L${x - br + bc} ${y - br}M${x + br - bc} ${y - br}L${x + br} ${y - br}L${x + br} ${y - br + bc}M${x + br} ${y + br - bc}L${x + br} ${y + br}L${x + br - bc} ${y + br}M${x - br + bc} ${y + br}L${x - br} ${y + br}L${x - br} ${y + br - bc}`);
        b.setAttribute('class', on ? 'acc' : 'mid');
        b.setAttribute('stroke-width', on ? 1.2 : .7);
        b.setAttribute('opacity', alpha * (on ? 1 : .55));
      } else b.setAttribute('opacity', 0);
    });
    sub.forEach((row, j) => row.forEach((s, k) => {
      place(h.subBadges[j][k], s.x, s.y, s.r, 1.6);
      h.subBadges[j][k].setAttribute('opacity', s.r < 12 ? 0 : clamp((s.r - 12) / 20) * .6);
    }));

    // selection rings on the selected satellite
    const sel = sat[p.selected];
    const ph = Math.sin(2 * Math.PI * p.rot / 4.4);
    const pulse = 1 + ph * .04;
    const selOn = sel && sel.r > SAT_R * .7;
    h.selRings.forEach((c, k) => {
      c.setAttribute('cx', sel.x); c.setAttribute('cy', sel.y);
      c.setAttribute('r', sel.r * pulse + (k ? 14 : 6));
      c.setAttribute('opacity', selOn ? (k ? .4 : 1) : 0);
    });

    // focus rings on the focused node (hub or a satellite)
    const fn = p.focused === 'hub' ? { x: 0, y: 0, r: hubR } : p.focused != null ? sat[p.focused] : null;
    const fp = 1 + ph * .03;
    h.focus.forEach((c, k) => {
      const show = fn && fn.r > 20;
      if (show) { c.setAttribute('cx', fn.x); c.setAttribute('cy', fn.y); c.setAttribute('r', fn.r * [.15, .3, .45][k] * fp); }
      c.setAttribute('opacity', show ? c.getAttribute('data-op') : 0);
    });
    h.focusDot.setAttribute('opacity', fn && fn.r > 20 ? 1 : 0);
    if (fn) { h.focusDot.setAttribute('cx', fn.x); h.focusDot.setAttribute('cy', fn.y); }

    // idle pulse ring around a closed hub; the hub mark always
    const idle = !p.hubOpen;
    h.idle.setAttribute('r', Math.max(0, (hubR + 10) * (1 + ph * .12)));
    h.idle.setAttribute('opacity', idle ? .6 * one(D.hub) : 0);
    h.hubRing.setAttribute('r', hubR * .45);
    h.hubDot.setAttribute('r', 3 * Math.min(1, hubR / SEED_R));
  },
});
})();
