/* ─────────────────────────────────────────────────────────────
   PIECE · HEX WORKSPACE
   components/interaction/hex-workspace — redrawn as layered SVG from
   the same geometry: 6 Ø72 nodes in a 320 × 340 workspace (centred
   here, ×1.8), 8 graph edges, a 22 px dot grid, hit radius 38 / 32
   while tracing. Press a node and drag through others: the selection
   is ordered, the last pick is the filled tail.
   Redesign (radial-goo-bloom language): the trace is drawn through a
   goo filter (blur + alpha threshold) so the drag reads as wet ink;
   selected nodes gain corner brackets, the tail breathes focus rings,
   pick order pops on as Patch order badges, and a HUD readout counts
   the selection.
   The performance: press CONSTRAINT and trace 1 → 0 → 2 → 4 → 5, tap the
   empty centre to clear, click CONTEXT, then tap the centre again, so
   the last pose is the first and EXPLODED loops without a seam.
   STORY drives it from three controls instead (TRACE, SPREAD, CLOSE):
   TRACE walks the selection round the ring 1 → 0 → 2 → 4 → 5 → 3, each
   pick easing in on the source's 0.12 s ramp as the knob crosses it;
   SPREAD scales the workspace; CLOSE draws the trace's last edge back
   to its head (3 → 1), easing in from the time it has been on.
   ───────────────────────────────────────────────────────────── */
(() => {

const K = 1.8;                                  // source px → piece units
const SRC = [[160, 44], [72, 98], [248, 98], [72, 196], [248, 196], [160, 250]];
const POS = SRC.map(([x, y]) => [(x - 160) * K, (y - 147) * K]);
const EDGES = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 5]];
const LABELS = ['GOAL', 'CONSTRAINT', 'PREFERENCE', 'CONTEXT', 'ARTIFACT', 'SESSION'];
const NR = 36 * K;                              // node radius
const HIT = 32 * K;                             // hit radius while dragging
const PITCH = 22 * K, GRID = 7;                 // dot grid: 15 × 15 at 39.6

// icons redrawn from the source glyphs ⬡ ⊘ ◈ ◎ ⬙ ≋, centred on (0, 0), ~24 units
const hexPts = r => Array.from({ length: 6 }, (_, i) => {
  const a = rad(i * 60 - 90); return `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
});
const ICONS = [
  [['path', `M${hexPts(12).join(' L')} Z`]],
  [['circle', 11], ['path', 'M-7.8 7.8 L7.8 -7.8']],
  [['path', 'M0 -12 L12 0 L0 12 L-12 0 Z'], ['fill', 'M0 -5 L5 0 L0 5 L-5 0 Z']],
  [['circle', 11], ['circle', 4.5]],
  [['path', 'M0 -12 L12 0 L0 12 L-12 0 Z'], ['fill', 'M-12 0 L12 0 L0 12 Z']],
  [['path', 'M-11 -6 Q-5.5 -10 0 -6 Q5.5 -2 11 -6'], ['path', 'M-11 0 Q-5.5 -4 0 0 Q5.5 4 11 0'], ['path', 'M-11 6 Q-5.5 2 0 6 Q5.5 10 11 6']],
];

/* ── the scripted performance ──
   press GOAL… no: press CONSTRAINT (1), trace 1 → 0 → 2 → 4 → 5, release,
   tap the empty centre to clear, then (exploded only) click CONTEXT (3) and
   tap the centre once more, so the loop closes on an empty selection. */
const REST = [230, 250];
const DOWN = 0.45, UP = 2.2, CLEAR = 2.7, CLICK = 3.4, CLEAR2 = 3.95, END = 4.5;
const ROUTE = [1, 0, 2, 4, 5].map(i => POS[i]);
const RT = [DOWN, 0.85, 1.25, 1.65, 2.05];

// Catmull-Rom through the route so the trace flows instead of stopping at each node
function trace(u) {
  if (u >= RT[RT.length - 1]) return ROUTE[ROUTE.length - 1];
  let k = 0;
  while (u >= RT[k + 1]) k++;
  const f = (u - RT[k]) / (RT[k + 1] - RT[k]);
  const p0 = ROUTE[Math.max(0, k - 1)], p1 = ROUTE[k], p2 = ROUTE[k + 1], p3 = ROUTE[Math.min(ROUTE.length - 1, k + 2)];
  const cr = (a, b, c, d) => .5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
}

// the ordered selection the trace produces: sample the drag and hit-test like the source
const PICKS = [{ i: 1, at: DOWN }];
for (let u = DOWN; u <= UP; u += 1 / 240) {
  const [x, y] = trace(u);
  POS.forEach(([px, py], i) => {
    if (Math.hypot(x - px, y - py) < HIT && !PICKS.some(p => p.i === i)) PICKS.push({ i, at: u });
  });
}

function fingerAt(u) {
  if (u < DOWN) {
    const k = io(win(u, 0, DOWN - .05));
    return { x: lerp(REST[0], POS[1][0], k), y: lerp(REST[1], POS[1][1], k) };
  }
  if (u < UP) { const [x, y] = trace(u); return { x, y, down: true, layer: 'nodes' }; }
  const end = POS[5];
  if (u < CLEAR) {
    const k = io(win(u, UP + .1, CLEAR - .04));
    return { x: lerp(end[0], 0, k), y: lerp(end[1], 0, k), pulse: null };
  }
  if (u < CLEAR + .3) return { x: 0, y: 0, pulse: win(u, CLEAR, CLEAR + .5), tap: { layer: 'nodes' } };
  if (u < CLICK) {
    const k = io(win(u, CLEAR + .3, CLICK - .04));
    return { x: lerp(0, POS[3][0], k), y: lerp(0, POS[3][1], k), pulse: null };
  }
  if (u < CLICK + .25) return { x: POS[3][0], y: POS[3][1], pulse: win(u, CLICK, CLICK + .5), tap: { layer: 'nodes' } };
  if (u < CLEAR2) {
    const k = io(win(u, CLICK + .25, CLEAR2 - .04));
    return { x: lerp(POS[3][0], 0, k), y: lerp(POS[3][1], 0, k), pulse: null };
  }
  return { x: 0, y: 0, pulse: win(u, CLEAR2, CLEAR2 + .5), tap: { layer: 'nodes' } };
}

const ramp = (u, at) => win(u, at, at + .12);   // the source's 0.12 s transitions

// STORY's trace: a closed walk along the graph's edges (1-0, 0-2, 2-4, 4-5, 5-3, and 3-1 to close it)
const RING = [1, 0, 2, 4, 5, 3];

registerPiece({
  id: 'hex-workspace',
  code: 'HEX-07', series: 'B', n: '07',
  name: 'HEX WORKSPACE',
  mechanic: 'TRACE TO MULTI-SELECT',
  source: 'COMPONENTS/INTERACTION/HEX-WORKSPACE',
  hero: { v: '6', u: 'NODES · 8 EDGES' },
  extent: 280,
  spec: [
    ['INPUT',  'PRESS · DRAG THROUGH · TAP'],
    ['STATE',  'ORDERED SELECTION · TAIL'],
    ['MOTION', 'GOO INK TRAIL · 120 MS PICK'],
    ['BUILT',  'DOM NODES · SVG EDGES'],
  ],
  layers: [
    { id: 'grid',  name: 'DOT GRID',   note: '22 PX PITCH',      edge: 277 },
    { id: 'edges', name: 'GRAPH',      note: '8 EDGES · STATIC', edge: 158 },
    { id: 'path',  name: 'GOO TRAIL',  note: 'INK · ORDER = DRAG ORDER', edge: 158 },
    { id: 'nodes', name: 'NODES',      note: '6 × Ø72 · HIT R38', edge: 223 },
    { id: 'input', name: 'INPUT',      note: 'PRESS · DRAG · TAP', edge: 300 },
  ],
  callouts: [
    { at: [PITCH * 3, -PITCH * 6],                         title: 'DOT GRID',    note: '22 PX PITCH' },
    { at: [POS[2][0] + NR * Math.cos(rad(-25)), POS[2][1] + NR * Math.sin(rad(-25))], title: 'SELECTED', note: 'BRACKETS = IN THE TRACE' },
    { at: [POS[2][0], 0],                                  title: 'GOO TRAIL',   note: 'INK FILTER · ORDER = DRAG ORDER' },
    { at: [POS[4][0] + NR * Math.cos(rad(30)), POS[4][1] + NR * Math.sin(rad(30))], title: 'NODE', note: 'Ø72 · HIT R38' },
    { at: [POS[5][0] + NR * Math.cos(rad(60)), POS[5][1] + NR * Math.sin(rad(60))], title: 'TAIL', note: 'LAST PICK · FOCUS RINGS' },
  ],
  specU: 2.4,

  // STORY: the source has no panel, so these come from its internals: how far the drag has traced,
  // the workspace's node spacing, and a closing edge from the tail back to the head
  controls: [
    { id: 'trace',  label: 'TRACE',  kind: 'knob',   min: 0,   max: 6,    value: 2, fmt: v => `${v.toFixed(1)} / 6` },
    { id: 'spread', label: 'SPREAD', kind: 'slider', min: .8,  max: 1.15, value: 1, fmt: v => `×${v.toFixed(2)}` },
    { id: 'close',  label: 'CLOSE',  kind: 'toggle', min: 0,   max: 1,    value: 0, fmt: v => v ? 'LOOP' : 'OPEN' },
  ],
  story: {
    tweaks: [
      { id: 'trace',  to: 6 },      // the trace runs on round the ring, picking up all six nodes
      { id: 'spread', to: 1.15 },   // the workspace opens out, the ring and its edges with it
      { id: 'close',  to: 1 },      // the last edge grows back to the head: the trace closes into a hexagon
    ],
  },
  exploded: { live: 4.4, poseEnd: END },   // the second clearing tap's ripple settles while the stack closes
  assembly: {
    seeds: [[0, 0], ...POS],
    live: 2.8,
    end: 3.1,                                   // stops after the clearing tap
    draw: t => ({
      grid: (x, y) => {
        const d = Math.hypot(x, y) / 400;
        return dOn(t, .7 + d * .9, .9 + d * .9) * dOff(t, 6.5 + (1 - d) * .7, 6.7 + (1 - d) * .7);
      },
      edges: EDGES.map((_, i) => dOn(t, 1.0 + stag(i, EDGES.length, .08), 1.5 + stag(i, EDGES.length, .08)) * dOff(t, 6.3 + stag(i, EDGES.length, .05), 6.8 + stag(i, EDGES.length, .05))),
      nodes: POS.map((_, i) => dOn(t, 1.4 + stag(i, POS.length, .08), 2.0 + stag(i, POS.length, .08)) * dOff(t, 6.0 + stag(i, POS.length, .06), 6.5 + stag(i, POS.length, .06))),
      icons: POS.map((_, i) => dOn(t, 1.9 + stag(i, POS.length, .06), 2.4 + stag(i, POS.length, .06)) * dOff(t, 6.0, 6.3)),
      labels: POS.map((_, i) => dOn(t, 2.2 + stag(i, POS.length, .05), 2.5 + stag(i, POS.length, .05)) * dOff(t, 6.0, 6.2)),
    }),
  },

  build(L, sw) {
    const h = {};
    // grid: zero-length round-capped strokes read as dots and can fade individually
    h.dots = [];
    for (let gx = -GRID; gx <= GRID; gx++) for (let gy = -GRID; gy <= GRID; gy++) {
      const x = gx * PITCH, y = gy * PITCH;
      const d = el('path', { d: `M${x} ${y} h0.01`, class: 'mid', 'stroke-width': sw.main * 1.3, 'stroke-linecap': 'round' }, L.grid);
      d.x = x; d.y = y;
      h.dots.push(d);
    }
    // graph edges
    h.edges = EDGES.map(([a, b]) => drawable(el('line', {
      x1: POS[a][0], y1: POS[a][1], x2: POS[b][0], y2: POS[b][1], class: 'minor', 'stroke-width': sw.main, 'stroke-linecap': 'round',
    }, L.edges)));
    // goo ink trail (radial-goo-bloom's filter): a blurred + thresholded halo under a tighter
    // core, so the trace reads as wet ink instead of a plain polyline
    const defs = el('defs', {}, L.path);
    // thr: the alpha the threshold sits at. A thin stroke blurred peaks well under α .5 (core ≈ .4, halo ≈ .3),
    // so a mid-point cut erased the trail outright; the cut sits under each stroke's blurred peak instead
    const mkGoo = (id, blur, cut, thr) => {
      const f = el('filter', { id, x: '-60%', y: '-60%', width: '220%', height: '220%' }, defs);
      el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur, result: 'b' }, f);
      el('feColorMatrix', { in: 'b', mode: 'matrix', values: `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${cut} ${-(cut * thr)}` }, f);
    };
    // ids unique per build: the stage builds the piece more than once, and a url(#id) that resolves to
    // another build's (hidden) filter renders nothing
    const gid = `hex-goo-${Math.random().toString(36).slice(2, 8)}`;
    mkGoo(`${gid}-halo`, 9, 24, .12);
    mkGoo(`${gid}-core`, 2.5, 18, .15);
    h.haloG = el('g', { filter: `url(#${gid}-halo)`, opacity: .38 }, L.path);   // the halo's opacity applies after the goo
    h.coreG = el('g', { filter: `url(#${gid}-core)` }, L.path);
    h.halo = el('polyline', { fill: 'none', class: 'acc', 'stroke-width': sw.main * 4.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, h.haloG);
    h.path = el('polyline', { fill: 'none', class: 'acc', 'stroke-width': sw.main * 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, h.coreG);
    h.haloDrag = el('line', { class: 'acc', 'stroke-width': sw.main * 4.2, 'stroke-linecap': 'round', opacity: 0 }, h.haloG);
    h.drag = el('line', { class: 'acc', 'stroke-width': sw.main * 1.8, 'stroke-linecap': 'round', opacity: 0 }, h.coreG);
    // nodes
    h.nodes = POS.map(([x, y], i) => {
      const g = el('g', { transform: `translate(${x} ${y})` }, L.nodes);
      const disc = el('circle', { r: NR, class: 'disc' }, g);
      const ring = drawable(el('circle', { r: NR, fill: 'none', class: 'mid', 'stroke-width': sw.main }, g));
      const ig = el('g', { transform: 'translate(0 -12)' }, g);
      const parts = ICONS[i].map(([kind, v]) => {
        if (kind === 'circle') return drawable(el('circle', { r: v, class: 'icon', 'stroke-width': sw.icon }, ig));
        if (kind === 'fill') { const f = el('path', { d: v, class: 'icondot' }, ig); f.dot = true; return f; }
        return drawable(el('path', { d: v, class: 'icon', 'stroke-width': sw.icon }, ig));
      });
      const label = txt(g, 0, 26, LABELS[i], { 'text-anchor': 'middle', 'font-size': 12, 'letter-spacing': '.1em', class: 'icondot' });
      // corner brackets around a selected node (radial-goo-bloom)
      const br = NR + 7, bc = 6;
      const brackets = [
        `M ${-br} ${-br + bc} L ${-br} ${-br} L ${-br + bc} ${-br}`,
        `M ${br - bc} ${-br} L ${br} ${-br} L ${br} ${-br + bc}`,
        `M ${br} ${br - bc} L ${br} ${br} L ${br - bc} ${br}`,
        `M ${-br + bc} ${br} L ${-br} ${br} L ${-br} ${br - bc}`,
      ].map(d => el('path', { d, fill: 'none', 'stroke-width': sw.minor, 'stroke-linecap': 'square' }, g));
      // breathing focus rings on the tail (radial-goo-bloom)
      const focus = el('g', { opacity: 0 }, g);
      [8, 14, 20].forEach((dr, k) => el('circle', { r: NR + dr, fill: 'none', class: 'acc', 'stroke-width': sw.minor * .9, 'stroke-opacity': [.5, .3, .15][k] }, focus));
      // Patch order badge: the pick order pops on when selected
      const badge = el('g', { opacity: 0 }, g);
      const bd = NR * .72;
      el('circle', { cx: bd, cy: -bd, r: 11, class: 'disc', 'stroke-width': sw.minor }, badge);
      el('circle', { cx: bd, cy: -bd, r: 11, fill: 'none', class: 'ink', 'stroke-width': sw.minor }, badge);
      const badgeNum = txt(badge, bd, -bd, '01', { 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 9, 'font-weight': 500 });
      return { g, disc, ring, parts, label, brackets, focus, badge, badgeNum };
    });
    // HUD readout (radial-goo-bloom): a micro stack in the top-left of the workspace
    h.readT = txt(L.nodes, -240, -225, '', { 'font-size': 9, 'letter-spacing': '.2em', class: 'dim' });
    h.readE = txt(L.nodes, -240, -211, 'EDGES 08', { 'font-size': 9, 'letter-spacing': '.2em', class: 'dim' });
    // clear-tap ripple
    h.ripple = el('circle', { r: 0, fill: 'none', class: 'acc', 'stroke-width': sw.minor * 1.2, opacity: 0 }, L.input);
    // finger trail on the input plane
    h.trail = el('polyline', { fill: 'none', class: 'acc', 'stroke-width': sw.main, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .5 }, L.input);
    // colour rule, broken (rev C): the piece owns its hue — the goo bloom's orange — so the
    // mode accents and selected fills render in it, in every mode.
    el('style', {}, L.nodes.ownerSVGElement).textContent =
      '.acc{stroke:#FD8235}.accf{fill:#FD8235}.on .disc{fill:#FD8235}.on .ink{stroke:#FD8235}.on .accf{fill:#FD8235}';
    return h;
  },

  pose(u, ctl) {
    // live on the controls (STORY): the knob position picks nodes round RING, each pick's `at` set so the
    // source's 0.12 s ramp reads the knob's progress past it (the newest segment grows with the knob);
    // CLOSE eases in on the integral of its own value (= seconds it has been on). No finger, no script.
    if (ctl) {
      const { trace: tv, spread } = ctl.v;
      const sel = [];
      RING.forEach((i, k) => { if (tv > k) sel.push({ i, at: u - .12 * clamp(tv - k) }); });
      const close = sel.length > 2 ? io(clamp(ctl.integ(c => c.close) / .45)) : 0;
      return { u, sel, cleared: null, finger: { x: 0, y: 0 }, trail: [], spread, close };
    }
    const f = fingerAt(u);
    let sel = [], cleared = null;
    if (u >= DOWN) sel = PICKS.filter(p => p.at <= u);
    if (u >= CLEAR) { cleared = { at: CLEAR, was: sel }; sel = []; }
    if (u >= CLICK) sel = [{ i: 3, at: CLICK }];
    if (u >= CLEAR2) { cleared = { at: CLEAR2, was: sel }; sel = []; }
    // trail: where the finger was over the last 0.35 s while it was down
    const trail = [];
    if (f.down) for (let k = 0; k <= 14; k++) {
      const v = u - .35 * (1 - k / 14);
      if (v >= DOWN) trail.push(trace(v));
    }
    return { u, sel, cleared, finger: f, trail };
  },

  finger(u) { return fingerAt(u); },

  apply(h, p, D) {
    D = D || {};
    const u = p.u;
    const sp = p.spread ?? 1;
    const P = sp === 1 ? POS : POS.map(([x, y]) => [x * sp, y * sp]);
    const tail = p.sel.length ? p.sel[p.sel.length - 1].i : -1;
    h.nodes.forEach((n, i) => {
      const s = p.sel.find(q => q.i === i);
      let sc = 1;
      if (s) sc = 1 + (i === tail ? .12 : .1) * ramp(u, s.at);
      else if (p.cleared && p.cleared.was.some(q => q.i === i)) sc = 1 + .1 * (1 - ramp(u, p.cleared.at));
      n.g.setAttribute('transform', `translate(${P[i][0]} ${P[i][1]}) scale(${sc})`);
      const isTail = i === tail, isSel = !!s && !isTail;
      n.g.classList.toggle('on', isTail);
      n.ring.setAttribute('class', isTail ? 'ink' : isSel ? 'acc' : 'mid');
      n.parts.forEach(pp => pp.setAttribute('class', pp.dot ? (isSel ? 'accf' : 'icondot') : (isSel ? 'icon acc' : 'icon')));
      n.label.setAttribute('class', isSel ? 'accf' : 'icondot');
      const kwin = D.nodes ? D.nodes[i] : 1;
      // corner brackets: on for every selected node
      n.brackets.forEach(b => { b.setAttribute('class', isTail ? 'acc' : 'mid'); b.setAttribute('opacity', (isTail || isSel ? 1 : 0) * kwin); });
      // focus rings: breathing on the tail only
      if (isTail) {
        const t = p.t ?? 0;
        n.focus.setAttribute('opacity', kwin);
        n.focus.setAttribute('transform', `scale(${(1 + .03 * Math.sin(2 * Math.PI * t)).toFixed(4)})`);
      } else n.focus.setAttribute('opacity', 0);
      // order badge: the pick order, popping on
      if (s) {
        const ord = p.sel.indexOf(s) + 1;
        n.badgeNum.textContent = String(ord).padStart(2, '0');
        const bk = ramp(u, s.at);
        n.badge.setAttribute('opacity', bk * kwin);
        n.badge.setAttribute('transform', `scale(${(.6 + .4 * bk).toFixed(3)})`);
      } else n.badge.setAttribute('opacity', 0);
    });
    // ordered path, the newest segment growing in over 0.12 s
    const pts = p.sel.map(q => P[q.i].slice());
    if (pts.length > 1) {
      const last = p.sel[p.sel.length - 1], k = ramp(u, last.at);
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      pts[pts.length - 1] = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      // STORY's CLOSE: the closing edge grows from the tail back to the head
      if (p.close > 0) pts.push([lerp(b[0], pts[0][0], p.close), lerp(b[1], pts[0][1], p.close)]);
      h.path.setAttribute('points', pts.map(q => q.join(',')).join(' '));
      h.halo.setAttribute('points', pts.map(q => q.join(',')).join(' '));
    } else { h.path.setAttribute('points', ''); h.halo.setAttribute('points', ''); }
    // the trail draws on and off with the nodes it joins
    const kpath = D.nodes ? Math.min(...D.nodes) : 1;
    h.haloG.setAttribute('opacity', .38 * kpath);
    h.coreG.setAttribute('opacity', kpath);
    // while tracing, the live drag line flows as gooey beads; the finished trail stays solid
    const f = p.finger;
    if (f.down) {
      h.drag.setAttribute('x1', POS[1][0]); h.drag.setAttribute('y1', POS[1][1]);
      h.drag.setAttribute('x2', f.x); h.drag.setAttribute('y2', f.y);
      h.haloDrag.setAttribute('x1', POS[1][0]); h.haloDrag.setAttribute('y1', POS[1][1]);
      h.haloDrag.setAttribute('x2', f.x); h.haloDrag.setAttribute('y2', f.y);
      const t = p.t ?? 0;
      const off = -((t % 1) * 22);
      h.drag.setAttribute('stroke-dasharray', '10 4');
      h.drag.setAttribute('stroke-dashoffset', off);
      h.haloDrag.setAttribute('stroke-dasharray', '10 4');
      h.haloDrag.setAttribute('stroke-dashoffset', off);
      h.drag.setAttribute('opacity', .6);
      h.haloDrag.setAttribute('opacity', 1);
    } else {
      h.drag.setAttribute('opacity', 0);
      h.haloDrag.setAttribute('opacity', 0);
    }
    h.trail.setAttribute('points', p.trail.map(q => q.join(',')).join(' '));
    // clear-tap ripple (folds away with the nodes' draw window so it never lingers)
    if (p.cleared) {
      const k = win(u, p.cleared.at, p.cleared.at + .5);
      h.ripple.setAttribute('r', 26 + 84 * oq(k));
      h.ripple.setAttribute('opacity', .7 * (1 - k) * (D.nodes ? D.nodes[0] : 1));
    } else h.ripple.setAttribute('opacity', 0);
    // HUD readout
    const kread = D.labels ? D.labels[0] : 1;
    h.readT.textContent = `SEL ${p.sel.length ? String(p.sel.length).padStart(2, '0') : '—'} · TRACE ${p.sel.length}`;
    h.readT.setAttribute('opacity', kread);
    h.readE.setAttribute('opacity', kread);
    h.dots.forEach(d => d.setAttribute('opacity', D.grid ? D.grid(d.x, d.y) : 1));
    h.edges.forEach((e, i) => {
      setDraw(e, D.edges ? D.edges[i] : 1);
      if (p.spread != null) {
        const [a, b] = EDGES[i];
        e.setAttribute('x1', P[a][0]); e.setAttribute('y1', P[a][1]); e.setAttribute('x2', P[b][0]); e.setAttribute('y2', P[b][1]);
      }
    });
    h.nodes.forEach((n, i) => {
      const k = D.nodes ? D.nodes[i] : 1;
      setDraw(n.ring, k);
      n.disc.setAttribute('opacity', k);
      const ki = D.icons ? D.icons[i] : 1;
      n.parts.forEach(pp => pp.dot ? pp.setAttribute('opacity', ki) : setDraw(pp, ki));
      n.label.setAttribute('opacity', D.labels ? D.labels[i] : 1);
    });
  },
});

})();
