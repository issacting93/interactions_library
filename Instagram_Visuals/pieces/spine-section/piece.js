/* ─────────────────────────────────────────────────────────────
   PIECE · SPINE SECTION
   components/interaction/spine-section — redrawn as layered SVG.
   Two columns of 7 vertebra halves (105 × 100 px each, mirrored)
   stacked 20 px apart (li margin-top −80); hovering the section
   opens them to 100 px and dims them to 20 %. A column of 7 dot
   units sits on the spine: hovering one selects it (green fill)
   and swaps the slide behind. The sci-fi frame draws in on hover
   (vivus, 12 paths, 500 ms). Redesign (Patch language): the dot nav
   becomes a column of square SC ports with micro labels (selected =
   connected, hovered = armed halo); vertebrae carry order badges that
   fade in as the stack opens; the slide frame gains corner brackets
   and the project link an LED toggle. Piece units = source px × 0.6.
   STORY drives it from its controls instead (SECTION, SPACING, FRAME):
   the hover enters once the spine has drawn on and the stack opens to
   SPACING; turning SECTION walks the selection down the port column,
   crossfading the slides as it passes each one; FRAME off undraws the
   sci-fi frame over the source's 500 ms vivus window (time since the
   toggle is ∫ of the off state, so it eases rather than snaps).
   ───────────────────────────────────────────────────────────── */
(() => {

const K = 0.6;                                  // source px → piece units
const PROJECTS = ['Stealth Game Concept', 'Dark Future', 'Lynn', 'ICARUS', 'Division', 'Drifter', 'Black Monarch'];
const N = 7;
const SLIDE = { w: 600, h: 390 };               // img 650 px tall, ≥55 % wide → ±300 × ±195

// one vertebra half, left column, in its 105 × 100 box
const V_OUTLINE = 'M0 0.1 V44.4 L32.4 63.4 L36.8 78.9 L67.1 99.2 H81.1';
const V_TAB = 'M0.4 0.1 H3.4 V2.6 L0.4 6.4';

// sci-fi frame: the 12 vivus paths, 4956 × 3513 viewBox → ±300 wide
const FRAME_S = 600 / 4956;
const FRAME_PATHS = [
  'M1340.49 2765.32L1355.84 2723.05L1553 2591.84L1615.6 2582.22',
  'M23.8928 3280.58L455.951 3307.12L1255.82 2915.04L1328.1 2802.86',
  'M1766.04 2510.41L1772.99 2537.7L1689.35 2592.71L1649.33 2587.16',
  'M3637.64 2766.32L3622.29 2724.05L3425.13 2592.84L3362.53 2583.22',
  'M4954.24 3281.58L4522.18 3308.12L3722.31 2916.04L3650.03 2803.86',
  'M3212.09 2511.41L3205.14 2538.7L3288.78 2593.71L3328.8 2588.16',
  'M3622.75 643.775L3607.4 680.213L3410.24 793.347L3347.64 801.637',
  'M4939.34 199.527L4507.29 176.643L3707.42 514.69L3635.14 611.409',
  'M3197.2 863.553L3190.25 840.023L3273.89 792.597L3313.91 797.377',
  'M1318.6 643.775L1333.94 680.213L1531.11 793.347L1593.71 801.637',
  'M1.99998 199.527L434.059 176.643L1233.93 514.691L1306.21 611.41',
  'M1744.15 863.554L1751.1 840.023L1667.45 792.597L1627.44 797.378',
];
const framePt = (x, y) => [x * FRAME_S - 300, y * FRAME_S - 3513 * FRAME_S / 2];

// placeholder compositions for the 7 project images (hairline, inside the slide)
const COMPS = [
  // Stealth Game: horizon, crouched figure, searchlight cone
  ['M-280 110 H280', 'M-60 110 L-40 70 L-10 62 L5 80 L30 110', 'M180 -170 L-20 110 M180 -170 L120 110', 'C:180,-170,6'],
  // Dark Future: skyline
  ['M-280 130 H-220 V10 H-170 V60 H-120 V-60 H-70 V40 H-10 V-120 H40 V20 H90 V-30 H150 V70 H210 V-10 H280'],
  // Lynn: portrait
  ['C:0,-40,70', 'M-150 190 Q-140 60 0 50 Q140 60 150 190', 'M-30 -50 H-10 M10 -50 H30'],
  // ICARUS: sun and wings
  ['C:150,-110,48', 'M-200 40 L-20 -10 L-200 -40 M-200 40 L-120 -5 M-200 -40 L-120 -10', 'M200 40 L20 -10 M20 -10 L120 -40'],
  // Division: split grid
  ['M-280 -180 L280 180', 'M-200 -195 V195 M-100 -195 V195 M0 -195 V195 M100 -195 V195 M200 -195 V195', 'M-300 -100 H300 M-300 0 H300 M-300 100 H300'],
  // Drifter: dunes and a walker
  ['M-300 60 Q-150 -10 0 60 T300 40', 'M-300 140 Q-80 80 120 140 T300 120', 'M40 -10 V40 M40 0 L28 18 M40 0 L52 18 M40 40 L30 60 M40 40 L50 60', 'C:40,-22,10'],
  // Black Monarch: wings and crown
  ['M0 -120 V110', 'M0 -40 Q-180 -200 -230 -60 Q-200 40 0 10 Q-150 80 -120 160 Q-40 160 0 60', 'M0 -40 Q180 -200 230 -60 Q200 40 0 10 Q150 80 120 160 Q40 160 0 60', 'M-30 -150 L-15 -125 L0 -160 L15 -125 L30 -150 V-120 H-30 Z'],
];

// ── performance: hover the page, walk the dot column, sweep back to the top, leave ──
const KF = [
  [0.00, 250, 230],
  [0.55, 0, -120],   // dot 2 (index 1)
  [0.85, 0, -120],
  [1.15, 0, 0],      // passes index 2 → index 3
  [1.50, 0, 0],
  [1.80, 0, 120],    // index 4 → index 5
  [2.05, 0, 120],
  [2.30, 0, 180],    // index 6
  [2.60, 0, 180],
  [3.00, 0, -180],   // sweep up through every dot → index 0
  [3.15, 0, -180],
  [3.50, 270, -210], // leave
];
const ENTER = 0.1, LEAVE = 3.4;
const STORY_ENTER = 1.6;   // STORY: the hover enters once the vertebrae have drawn on (stage T)

function fingerAt(u) {
  if (u <= KF[0][0]) return [KF[0][1], KF[0][2]];
  for (let i = 1; i < KF.length; i++) {
    if (u <= KF[i][0]) {
      const [a, ax, ay] = KF[i - 1], [b, bx, by] = KF[i];
      const k = io(win(u, a, b));
      return [lerp(ax, bx, k), lerp(ay, by, k)];
    }
  }
  const l = KF[KF.length - 1];
  return [l[1], l[2]];
}
// hover expands the stack (source snaps; eased 0.3 s here so it reads on video)
const expandAt = u => oq(win(u, ENTER, ENTER + .3)) * (1 - oq(win(u, LEAVE, LEAVE + .3)));
const spacing = h => lerp(20, 100, h);                       // source px between vertebra tops
const vTop = (i, h) => (i * spacing(h) - (6 * spacing(h) + 100) / 2) * K;
const dotY = (i, h) => lerp((i - 3) * 14, (i - 3) * 100 * K, h);
const DOT = { w: 18, h: 13 };
function dotUnder(x, y, h) {
  if (h < .5) return null;
  for (let i = 0; i < N; i++) if (Math.abs(x) <= DOT.w / 2 + 3 && Math.abs(y - dotY(i, h)) <= DOT.h / 2 + 3) return i;
  return null;
}

registerPiece({
  id: 'spine-section',
  code: 'SPN-08', series: 'B', n: '08',
  name: 'SPINE SECTION',
  mechanic: 'HOVER-TO-BROWSE SPINE NAV',
  source: 'COMPONENTS/INTERACTION/SPINE-SECTION',
  hero: { v: '7', u: 'PROJECTS · 14 VERTEBRAE' },
  extent: 300,
  spec: [
    ['INPUT',  'HOVER SECTION · HOVER DOT'],
    ['STATE',  'STACKED / OPEN · 1 OF 7'],
    ['MOTION', 'STACK 20 → 100 PX · DIM 20%'],
    ['BUILT',  'CSS :HOVER · INLINE SVG · VIVUS'],
  ],
  layers: [
    { id: 'slides', name: 'SLIDESHOW',    note: '7 PROJECTS · 50% IMG', edge: 300 },
    { id: 'frame',  name: 'SCI-FI FRAME', note: '12 PATHS · ON HOVER',  edge: 298 },
    { id: 'spine',  name: 'SPINE',        note: '2 × 7 HALVES · BADGES', edge: 63 },
    { id: 'dots',   name: 'PORT NAV',     note: '7 SC JACKS · HOVER = SELECT', edge: 9 },
    { id: 'input',  name: 'INPUT',        note: 'HOVER · NO CLICK',     edge: 300 },
  ],
  // anchors on the right half; leaders run radially out to the column
  callouts: [
    { at: [(105 - 32.4) * K, (100 - 350 + 63.4) * K], title: 'VERTEBRA',     note: '105 × 100 · 7 A SIDE' },
    { at: framePt(3707.42, 514.69),                  title: 'SCI-FI FRAME', note: 'DRAWS IN ON HOVER' },
    { at: [7, 6.5],                                   title: 'ACTIVE PORT',  note: 'SC JACK · HOVER = SELECT' },
    { at: [282, 22],                                 title: 'PROJECT LINK', note: 'LED ON = HOVER' },
    { at: [300, 120],                                title: 'SLIDE',        note: 'SWAPS ON DOT HOVER' },
  ],
  // STORY: the section the spine selects, the stack's open spacing, and the sci-fi frame
  controls: [
    { id: 'sel',     label: 'SECTION', kind: 'knob',   min: 1,  max: 7,   value: 1,   fmt: v => `${String(Math.round(v)).padStart(2, '0')} / 07` },
    { id: 'spacing', label: 'SPACING', kind: 'slider', min: 20, max: 100, value: 100, fmt: v => `${v.toFixed(0)} PX` },
    { id: 'frame',   label: 'FRAME',   kind: 'toggle', min: 0,  max: 1,   value: 1,   fmt: v => v ? 'ON' : 'OFF' },
  ],
  story: {
    tweaks: [
      { id: 'sel',     to: 5 },     // the selection walks down the ports; slides swap 1 → 5
      { id: 'spacing', to: 38 },    // the stack half-closes: vertebrae brighten, badges fade, ports gather
      { id: 'frame',   to: 0 },     // the sci-fi frame and corner brackets undraw
    ],
  },
  specU: 1.3,
  exploded: { live: 4.0 },
  assembly: {
    seeds: [[0, 0], ...Array.from({ length: N }, (_, i) => [0, dotY(i, 0)]),
      [-300, -195], [300, -195], [300, 195], [-300, 195]],
    live: 2.8,
    end: 2.65,
    draw: t => ({
      slideFrame: dOn(t, .7, 1.5) * dOff(t, 6.4, 7.2),
      comps: dOn(t, 1.4, 2.3) * dOff(t, 6.0, 6.8),
      text: dOn(t, 2.0, 2.5) * dOff(t, 6.0, 6.4),
      verts: Array.from({ length: N }, (_, i) => dOn(t, .9 + stag(i, N, .12), 1.5 + stag(i, N, .12)) * dOff(t, 6.2 + stag(N - 1 - i, N, .1), 6.7 + stag(N - 1 - i, N, .1))),
      dots: Array.from({ length: N }, (_, i) => dOn(t, 1.8 + stag(i, N, .07), 2.2 + stag(i, N, .07)) * dOff(t, 6.0 + stag(i, N, .05), 6.4 + stag(i, N, .05))),
      frame: dOff(t, 6.0, 6.5),
    }),
  },

  build(L, sw) {
    const h = {};
    // slides: image frame, 7 compositions, "N / 7", project link box
    h.slideFrame = drawable(el('rect', { x: -SLIDE.w / 2, y: -SLIDE.h / 2, width: SLIDE.w, height: SLIDE.h, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, L.slides));
    h.comps = COMPS.map(parts => {
      const g = el('g', { opacity: 0 }, L.slides);
      const strokes = parts.map(d => {
        if (d.startsWith('C:')) {
          const [cx, cy, r] = d.slice(2).split(',').map(Number);
          return drawable(el('circle', { cx, cy, r, fill: 'none', class: 'mid', 'stroke-width': sw.minor }, g));
        }
        return drawable(el('path', { d, fill: 'none', class: 'mid', 'stroke-width': sw.minor, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g));
      });
      return { g, strokes };
    });
    h.textG = el('g', {}, L.slides);
    h.num = txt(h.textG, -288, 4, '1 / 7', { 'font-size': 10, 'letter-spacing': '.1em' });
    h.slideLab = txt(h.textG, -288, -16, 'SLIDE', { 'font-size': 9, 'letter-spacing': '.24em', class: 'dim' });
    h.linkBox = el('rect', { y: 0, height: 22, fill: 'none', class: 'ink', 'stroke-width': sw.minor }, h.textG);
    h.link = txt(h.textG, 0, 15, '', { 'font-size': 9.5, 'letter-spacing': '.12em' });
    // LED toggle on the project link: lit while a dot is hovered (Patch led-bypass)
    h.led = el('circle', { cy: 11, r: 4, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.textG);
    // micro labels: the section tag and the machine note
    h.sec = txt(h.textG, -10, -205, 'SEC 01', { 'text-anchor': 'end', 'font-size': 9, 'letter-spacing': '.24em', class: 'dim' });
    h.mach = txt(h.textG, 288, 218, '14 VERTEBRAE · HOVER', { 'text-anchor': 'end', 'font-size': 9, 'letter-spacing': '.24em', class: 'dim' });

    // sci-fi frame (vivus paths), drawn in on hover; corner brackets ride the same window
    const fg = el('g', { transform: `translate(-300 ${-3513 * FRAME_S / 2}) scale(${FRAME_S})` }, L.frame);
    h.frame = FRAME_PATHS.map((d, i) => drawable(el('path', {
      d, fill: 'none', class: 'mid', 'stroke-width': (i % 3 === 0 ? sw.main : sw.minor) / FRAME_S, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, fg)));
    h.frameG = fg;
    // corner brackets at the slide's four corners (radial-goo-bloom)
    h.slideCorners = el('g', { opacity: 0 }, L.frame);
    (() => {
      const [hw, hh] = [SLIDE.w / 2, SLIDE.h / 2], s = 26, c = 12;
      [`M ${-hw} ${-hh + s} L ${-hw} ${-hh} L ${-hw + s} ${-hh}`,
       `M ${hw - s} ${-hh} L ${hw} ${-hh} L ${hw} ${-hh + s}`,
       `M ${hw} ${hh - s} L ${hw} ${hh} L ${hw - s} ${hh}`,
       `M ${-hw + s} ${hh} L ${-hw} ${hh} L ${-hw} ${hh - s}`]
        .forEach(d => el('path', { d, fill: 'none', class: 'acc', 'stroke-width': sw.main * .9, 'stroke-linecap': 'square' }, h.slideCorners));
    })();

    // spine: 7 vertebrae, each a left half and its mirror, with an order badge on the centre line
    h.verts = Array.from({ length: N }, (_, i) => {
      const g = el('g', {}, L.spine);
      const inner = el('g', { transform: `scale(${K})` }, g);
      const halves = [1, -1].map(dir => {
        const hg = el('g', { transform: `scale(${dir} 1) translate(-105 0)` }, inner);
        const outline = drawable(el('path', { d: V_OUTLINE, fill: 'none', class: 'ink', 'stroke-width': sw.main / K, 'stroke-linejoin': 'round' }, hg));
        const tab = drawable(el('path', { d: V_TAB, fill: 'none', class: 'ink', 'stroke-width': sw.minor / K }, hg));
        const block = el('rect', { x: 94.3, y: 97, width: 10.2, height: 2.1, class: 'icondot' }, hg);
        const post = drawable(el('rect', { x: 85.5, y: 90.6, width: 3.8, height: 8.4, fill: 'none', class: 'ink', 'stroke-width': sw.minor / K }, hg));
        return { outline, tab, block, post };
      });
      // Patch order badge at the vertebra centre, fading in as the stack opens
      const badge = el('g', { opacity: 0 }, g);
      const [bx, by] = [0, 50 * K];
      el('circle', { cx: bx, cy: by, r: 10, class: 'disc', 'stroke-width': sw.minor }, badge);
      el('circle', { cx: bx, cy: by, r: 10, fill: 'none', class: 'ink', 'stroke-width': sw.minor }, badge);
      const num = txt(badge, bx, by, String(i + 1).padStart(2, '0'), { 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 8.5, 'font-weight': 500 });
      return { g, halves, badge, num };
    });

    // dot nav: 7 square SC ports with micro labels; the ⚀ glyph pops on hover
    h.dots = Array.from({ length: N }, (_, i) => {
      const g = el('g', {}, L.dots);
      const sq = el('rect', { x: -7, y: -6.5, width: 14, height: 13, rx: 3, class: 'disc ink', 'stroke-width': sw.main }, g);
      const core = el('rect', { x: -3, y: -2.5, width: 6, height: 5, rx: 1, class: 'disc' }, g);
      const label = txt(g, -12, 1.5, String(i + 1).padStart(2, '0'), { 'text-anchor': 'end', 'font-size': 8, 'letter-spacing': '.18em', class: 'dim' });
      const halo = el('circle', { r: 11, fill: 'none', class: 'acc', 'stroke-width': sw.minor, opacity: 0 }, g);
      const glyph = el('g', { opacity: 0 }, g);
      el('rect', { x: -3.5, y: -3.5, width: 7, height: 7, rx: 1, class: 'icon', 'stroke-width': sw.icon * .7 }, glyph);
      el('circle', { r: 1, class: 'icondot' }, glyph);
      return { g, sq, core, label, halo, glyph };
    });
    // colour rule, broken (rev C): the piece owns its hue — violet for the port column — so the
    // mode accents and selected fills render in it, in every mode.
    el('style', {}, L.dots.ownerSVGElement).textContent =
      '.acc{stroke:#A98BFF}.accf{fill:#A98BFF}.on .disc{fill:#A98BFF}.on .ink{stroke:#A98BFF}.on .accf{fill:#A98BFF}';
    return h;
  },

  pose(u, ctl) {
    // live on the controls (STORY): no scripted pointer; the stack opens to SPACING once the hover
    // enters, SECTION picks the slide (fractional → crossfade), the frame eases off with FRAME
    if (ctl) {
      const enter = oq(win(u, STORY_ENTER, STORY_ENTER + .3));
      const hv = enter * clamp((ctl.v.spacing - 20) / 80);
      const selF = clamp(ctl.v.sel, 1, N) - 1;
      const sel = Math.round(selF);
      const off = ctl.integ(c => c.frame ? 0 : 1);   // s since FRAME went off
      const frameK = io(win(u, STORY_ENTER, STORY_ENTER + .5)) * (1 - io(clamp(off / .5)));
      return { h: hv, sel, selF, hover: enter > .5 ? sel : null, frameK };
    }
    const hv = expandAt(u);
    // replay the pointer to find the last dot it hovered (mouseover selects; leaving keeps it)
    let sel = 0;
    for (let v = 0; v <= u; v += 1 / 120) {
      const [x, y] = fingerAt(v);
      const d = dotUnder(x, y, expandAt(v));
      if (d != null) sel = d;
    }
    const [fx, fy] = fingerAt(u);
    const hover = u > 0 ? dotUnder(fx, fy, hv) : null;
    // frame: shown while the section is hovered, vivus draws it in 500 ms
    const frameK = io(win(u, ENTER, ENTER + .5)) * (1 - win(u, LEAVE, LEAVE + .2));
    return { h: hv, sel, hover, frameK };
  },

  finger(u) {
    const [x, y] = fingerAt(u);
    const d = dotUnder(x, y, expandAt(u));
    return d != null ? { x, y, down: true, layer: 'dots' } : { x, y };
  },

  apply(h, p, D) {
    D = D || {};
    const one = v => v ?? 1;
    // slides
    setDraw(h.slideFrame, one(D.slideFrame));
    h.comps.forEach((c, i) => {
      // STORY passes a fractional selection: the slides crossfade as the knob passes them
      c.g.setAttribute('opacity', p.selF != null ? clamp(1 - Math.abs(p.selF - i) * 2) : i === p.sel ? 1 : 0);
      c.strokes.forEach(s => setDraw(s, one(D.comps)));
    });
    h.textG.setAttribute('opacity', one(D.text));
    h.num.textContent = `${p.sel + 1} / ${N}`;
    const name = PROJECTS[p.sel].toUpperCase();
    h.link.textContent = name;
    const bw = name.length * 7.4 + 16;
    h.linkBox.setAttribute('x', 288 - bw); h.linkBox.setAttribute('width', bw);
    h.link.setAttribute('x', 288 - bw + 8);
    // LED toggle: lit while the finger is on a dot
    const hon = p.hover != null;
    h.led.setAttribute('cx', 288 - bw - 9);
    h.led.setAttribute('class', hon ? 'icondot' : 'minor');
    if (hon) h.led.removeAttribute('fill'); else h.led.setAttribute('fill', 'none');
    // frame
    h.frame.forEach(f => setDraw(f, p.frameK * one(D.frame)));
    h.slideCorners.setAttribute('opacity', p.frameK * one(D.frame));
    // spine
    h.verts.forEach((v, i) => {
      v.g.setAttribute('transform', `translate(0 ${vTop(i, p.h)})`);
      v.g.setAttribute('opacity', lerp(1, .25, p.h));
      const k = D.verts ? D.verts[i] : 1;
      v.halves.forEach(hf => {
        setDraw(hf.outline, k); setDraw(hf.tab, k); setDraw(hf.post, k);
        hf.block.setAttribute('opacity', clamp(k * 2 - 1));
      });
      // order badge: fades in as the stack opens, accents the selected vertebra
      v.badge.setAttribute('opacity', clamp(p.h * 1.4 - .2, 0, 1) * k);
      v.num.setAttribute('class', i === p.sel ? 'accf' : 'icondot');
    });
    // dots: square SC ports — connected when selected, an armed halo while hovered
    h.dots.forEach((d, i) => {
      const k = D.dots ? D.dots[i] : 1;
      d.g.setAttribute('transform', `translate(0 ${dotY(i, p.h)})`);
      d.g.classList.toggle('on', i === p.sel);
      d.sq.setAttribute('opacity', k);
      d.core.setAttribute('opacity', k);
      d.label.setAttribute('opacity', k);
      const t = p.t ?? 0;
      d.halo.setAttribute('r', 11 + 2 * Math.sin(2 * Math.PI * t));
      d.halo.setAttribute('opacity', (i === p.hover ? .6 : 0) * k);
      d.glyph.setAttribute('opacity', i === p.hover ? k : 0);
    });
  },
});

})();
