/* ─────────────────────────────────────────────────────────────
   PIECE · PARALLAX RINGS
   components/motion/parallax — mounts the LITERAL markup of the six
   source images (public/images/*.svg) into the stage's layer/depth
   system, rather than redrawing approximations of them: same path
   `d` strings and circle radii/dasharrays as the real files, just
   recentred on each one's own viewBox and scaled onto this layer's
   nominal radius. Hardcoded "white" is swapped for the mode-aware
   ink/mid/minor classes (SPEC renders on cream — literal white
   would be invisible there), and each source's own perpetual vivus
   draw-on `<style>` is stripped (it would fight our own D-driven
   reveal). RING-hero is itself 7 nested dashed circles round a soft
   centre glow; radial-inner-ring the exact two kinked paths; dotted-
   ring just one circle with stroke-dasharray="5 168" (6 short dashes,
   not a fine dotted line); radial-circle 3 thin concentric rings and
   a tiny centre dot, no spokes; Frame.svg a thick ring with 4 small
   filled corner dots, not brackets; Reticle.svg a small concentric
   target, off-centre in its own viewBox. The live component moves
   each ring with parallax.js's `translate3d(x, y, 0)` under
   `transform-style: preserve-3d` — but z is always 0, so that's a
   GPU-acceleration trick, not an actual depth illusion (no
   perspective or rotateX/Y anywhere in the source). Tried a real
   perspective-divide version here once (depth as literal camera
   distance, with foreshortening); reverted it — the live STORY
   capture only ever does a flat offset, so a scaling 3D effect in
   EXPLODED/SPEC was a different motion, not just a different style.
   Depth (0.6 → 5.6) is back to a flat per-ring multiplier on the
   same pointer offset, same as the real thing. Every ring also
   auto-rotates on its own fixed-turns-per-loop rate (reversed on
   alternating rings, as the source's CSS keyframes do), so it reads
   even at rest.
   Not converted to STORY controls — there's no discrete knob for
   an ambient depth field, so it plays the legacy ASSEMBLY loop.
   ───────────────────────────────────────────────────────────── */
(() => {

const RINGS = [
  { id: 'hero',    r: 280, depth: 0.6, turns:  1 },
  { id: 'bezel',   r: 225, depth: 1.6, turns: -2 },
  { id: 'dotted',  r: 170, depth: 2.6, turns:  3 },
  { id: 'accent',  r: 120, depth: 3.6, turns: -3 },
  { id: 'frame',   r:  85, depth: 4.6, turns:  2 },
  { id: 'reticle', r:  45, depth: 5.6, turns: -4 },
];
const AMBIENT_DIM = 0.5;   // matches the live component's own CSS base opacity exactly; each ring's own
                            // opacity (baked into the markup above, e.g. hero's .4/.3) multiplies on top
const AMP = 4.2;           // px of translate per depth unit — parallax.js's own scalar(5), tamed to piece units
const END = 4.0;   // performance length (s)
const LIVE = 2.6;  // canonical t the performance starts (after the rings draw on)

// finger sweep: right, left, down, up, a diagonal settle, back to rest — exercises both axes
const KF = [
  [0.0,  0,   0  ],
  [0.7,  1,   0  ],
  [1.5, -1,   0  ],
  [2.3,  0,   1  ],
  [3.1,  0,  -1  ],
  [3.6,  .6,  .6 ],
  [4.0,  0,   0  ],
];
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
// nearest ring to a radius, for the EXPLODED drop-line hit test
function ringAt(r) {
  let best = RINGS[0], bd = Infinity;
  for (const rg of RINGS) { const d = Math.abs(r - rg.r); if (d < bd) { bd = d; best = rg; } }
  return best;
}

registerPiece({
  id: 'parallax',
  code: 'PLX-12', series: 'B', n: '12',
  name: 'PARALLAX RINGS',
  mechanic: 'MOUSE-PARALLAX RING FIELD',
  source: 'COMPONENTS/MOTION/PARALLAX',
  hero: { v: '6', u: 'RINGS · DEPTH 0.6 → 5.6' },
  extent: 300,
  center: 0.5,  // true centre, matching STORY's live capture exactly — the callouts[] notes
                // below are kept short so they still fit the margin at this position
  spec: [
    ['INPUT',  'POINTER MOVE · NO CLICK'],
    ['STATE',  '6 RINGS · INDEPENDENT DEPTH'],
    ['MOTION', 'PARALLAX ×5 · ROTATE 15–30S/TURN'],
    ['BUILT',  'PARALLAX-JS · CSS KEYFRAMES'],
  ],
  layers: [
    { id: 'hero',    name: 'HERO RING',    note: '7 NESTED RINGS · 0.6',  edge: 280 },
    { id: 'bezel',   name: 'INNER RING',   note: 'WAYPOINT TICKS · 1.6',  edge: 225 },
    { id: 'dotted',  name: 'DOTTED RING',  note: '6 TICKS · DEPTH 2.6',   edge: 170 },
    { id: 'accent',  name: 'ACCENT RINGS', note: '3 RINGS + DOT · 3.6',   edge: 120 },
    { id: 'frame',   name: 'FRAME',        note: 'RING + 4 DOTS · 4.6',   edge:  85 },
    { id: 'reticle', name: 'RETICLE',      note: 'TARGET + CORNERS · 5.6', edge:  45 },
    { id: 'input',   name: 'INPUT',        note: 'POINTER · NO HIT TEST', edge: 300 },
  ],
  // anchors spread across the right half, one per ring, outer → inner. Notes kept to ~9 chars:
  // true centre (0.5) leaves a much narrower margin than the usual left-biased layout
  callouts: [
    { at: [Math.cos(rad(-80)) * 280, Math.sin(rad(-80)) * 280], title: 'HERO RING',    note: 'DEPTH 0.6' },
    { at: [Math.cos(rad(-45)) * 225, Math.sin(rad(-45)) * 225], title: 'INNER RING',    note: 'DEPTH 1.6' },
    { at: [Math.cos(rad(-10)) * 170, Math.sin(rad(-10)) * 170], title: 'DOTTED RING',   note: 'DEPTH 2.6' },
    { at: [Math.cos(rad(25))  * 120, Math.sin(rad(25))  * 120], title: 'ACCENT RINGS',  note: 'DEPTH 3.6' },
    { at: [Math.cos(rad(55))  *  85, Math.sin(rad(55))  *  85], title: 'FRAME',         note: 'DEPTH 4.6' },
    { at: [Math.cos(rad(80))  *  45, Math.sin(rad(80))  *  45], title: 'RETICLE',       note: 'DEPTH 5.6' },
  ],
  specU: 0.7,
  exploded: { live: END },
  assembly: {
    seeds: [[0, 0], ...RINGS.map(rg => [0, -rg.r])],
    live: LIVE,
    end: END,
    // outer rings draw on first and undraw last; inner rings draw on last and undraw first —
    // a telescoping reveal that closes the same way it opened, from the centre out
    draw: t => ({
      hero:    dOn(t, .70, 1.30) * dOff(t, 6.90, 7.50),
      bezel:   dOn(t, .95, 1.55) * dOff(t, 6.70, 7.30),
      dotted:  dOn(t, 1.20, 1.80) * dOff(t, 6.50, 7.10),
      accent:  dOn(t, 1.45, 2.05) * dOff(t, 6.30, 6.90),
      frame:   dOn(t, 1.70, 2.30) * dOff(t, 6.10, 6.70),
      reticle: dOn(t, 1.95, 2.55) * dOff(t, 5.90, 6.50),
    }),
  },

  // build the six rings, one <g> per layer (bottom → top) — each mounts the LITERAL markup of
  // its source SVG (public/images/*.svg), not a redrawn approximation: same path `d` / circle
  // radii / dasharrays, just recentred on its own viewBox and scaled to this layer's nominal
  // radius, with hardcoded "white" swapped for the stage's mode-aware ink/mid/minor classes
  // (SPEC renders on cream — literal white would be invisible there) and each source's own
  // perpetual vivus draw-on style stripped (it would fight our own D-driven reveal).
  build(L, sw) {
    const h = { layers: L, groups: {} };
    const uid = Math.random().toString(36).slice(2, 8);
    // mounts `svg` (recentred on cx,cy in its own viewBox) into layer rg.id, scaled so that
    // its own radius `nativeR` lands on rg.r
    function mount(rg, cx, cy, nativeR, svg) {
      const g = el('g', { opacity: 0 }, L[rg.id]);
      h.groups[rg.id] = g;
      const inner = el('g', { transform: `translate(${-cx} ${-cy}) scale(${(rg.r / nativeR).toFixed(5)})` }, g);
      inner.innerHTML = svg;
    }

    // HERO — RING-hero.svg (528×528, centred ~264,264): 7 nested dashed circles round a soft
    // centre glow (its own radial gradient, kept literal — a decorative dark blob, not a stroke)
    mount(RINGS[0], 264, 264, 260, `
      <circle cx="264.242" cy="264.242" r="41.193" fill="url(#pxHeroGlow${uid})" opacity=".4"/>
      <defs><radialGradient id="pxHeroGlow${uid}" gradientUnits="userSpaceOnUse"
        cx="264.242" cy="264.242" r="41.193"><stop stop-color="#2D3A5A"/><stop offset="1" stop-color="#121212"/></radialGradient></defs>
      <circle cx="264" cy="264" r="260"    fill="none" class="mid" stroke-width="8"  stroke-dasharray="2 2"   opacity=".4"/>
      <circle cx="264" cy="264" r="235.47" fill="none" class="mid" stroke-width="2"  stroke-dasharray="5 5"   opacity=".4"/>
      <circle cx="264" cy="264" r="221.98" fill="none" class="mid" stroke-width="20" stroke-dasharray="10 10" opacity=".3"/>
      <circle cx="264" cy="264" r="188.87" fill="none" class="mid" stroke-width="20" stroke-dasharray="1 1"   opacity=".3"/>
      <circle cx="264" cy="264" r="134.91" fill="none" class="mid" stroke-width="1"  stroke-dasharray="5 10"  stroke-linecap="round" opacity=".4"/>
      <circle cx="264" cy="264" r="111.6"  fill="none" class="ink" stroke-width="2"  stroke-linecap="round"   opacity=".4"/>
      <circle cx="264" cy="264" r="77.26"  fill="none" class="ink" stroke-width="2"  stroke-linecap="round"   opacity=".4"/>
    `);

    // INNER RING — radial-inner-ring.svg (808×810): the exact two paths the source traces,
    // kinks and all (its own perpetual vivus loop dropped — our own reveal handles that)
    mount(RINGS[1], 404, 405, 404, `
      <path d="M50.4702 405C50.5177 355.652 60.8853 306.86 80.9071 261.757C100.929 216.653 130.162 176.236 166.73 143.1L177.86 155.44C143.012 187.014 115.151 225.526 96.0658 268.504C76.981 311.482 67.0942 357.975 67.0402 405C67.0402 590.5 217.99 741.5 403.54 741.5H404.33V758.12H403.54C208.85 758.08 50.4702 599.65 50.4702 405ZM314.85 63.14C343.679 55.676 373.34 51.9058 403.12 51.92V68.5C374.743 68.5072 346.482 72.1092 319.01 79.22L314.85 63.14ZM488.39 730.66C540.869 716.931 589.258 690.739 629.45 654.31L640.63 666.61C598.45 704.819 547.684 732.301 492.63 746.73L488.39 730.66Z"
        fill="none" class="mid" stroke-width="2"/>
      <path d="M0.540039 439.6L3.66004 439.35C5.75225 463.741 10.0634 487.891 16.54 511.5L13.54 512.33C6.99244 488.535 2.64089 464.19 0.540039 439.6H0.540039ZM73.44 638.86L75.97 637.07C89.0881 655.507 103.719 672.821 119.71 688.83C156.898 726.217 201.131 755.858 249.851 776.037C298.57 796.217 350.807 806.533 403.54 806.39C510.75 806.39 611.54 764.64 687.32 688.83L689.65 690.91L689.53 691.03C613.09 767.42 511.54 809.5 403.45 809.5C295.36 809.5 193.85 767.42 117.45 691.03C101.389 674.863 86.6704 657.415 73.44 638.86V638.86ZM117.26 119.22L117.55 118.93C193.9 42.58 295.54 0.5 403.54 0.5C511.54 0.5 613.14 42.58 689.54 118.97C705.703 135.137 720.484 152.628 733.73 171.26L731.2 173.05C718.064 154.555 703.392 137.2 687.34 121.17C611.54 45.36 510.74 3.62 403.54 3.62C296.34 3.62 195.54 45.36 119.75 121.17L117.26 119.22ZM790.62 298.7L793.62 297.87C800.125 321.661 804.45 345.995 806.54 370.57L803.42 370.81C801.347 346.435 797.063 322.299 790.62 298.7Z"
        fill="none" class="ink" stroke-width="3"/>
    `);

    // DOTTED RING — dotted-ring.svg (355×355): literally one circle, stroke-dasharray="5 168"
    mount(RINGS[2], 177.5, 177.5, 174.5, `
      <circle cx="177.5" cy="177.5" r="174.5" fill="none" class="ink" stroke-width="5" stroke-linecap="round" stroke-dasharray="5 168"/>
    `);

    // ACCENT RINGS — radial-circle.svg (400×400): 3 concentric circles + a tiny centre dot
    // (gradient strokes flattened to flat opacity; no spokes in the source)
    mount(RINGS[3], 200, 200, 199, `
      <circle cx="200" cy="200" r="195"    fill="none" class="minor" stroke-width="10" opacity=".4"/>
      <circle cx="200" cy="200" r="184.5"  fill="none" class="mid"   stroke-width="5"  stroke-dasharray="70 100" opacity=".4"/>
      <circle cx="200" cy="200" r="199"    fill="none" class="ink"   stroke-width="2"/>
      <circle cx="200" cy="200" r="33.31"  fill="none" class="mid"   stroke-width="5"  opacity=".6"/>
      <circle cx="200" cy="200" r="6.59"   fill="none" class="mid"   stroke-width="1"  opacity=".4"/>
      <circle cx="200" cy="200" r="2.34"   class="icondot"/>
    `);

    // FRAME — Frame.svg (400×400): one thick ring + 4 small filled dots at its bounding
    // square's corners — not brackets
    mount(RINGS[4], 200, 200, 194.5, `
      <circle cx="200" cy="200" r="194.5" fill="none" class="ink" stroke-width="11"/>
      <circle cx="8.16"   cy="391.11" r="6.16" class="icondot" opacity=".7"/>
      <circle cx="391.84" cy="391.11" r="6.16" class="icondot" opacity=".7"/>
      <circle cx="8.16"   cy="8.89"   r="6.16" class="icondot" opacity=".7"/>
      <circle cx="391.84" cy="8.89"   r="6.16" class="icondot" opacity=".7"/>
    `);

    // RETICLE — Reticle.svg (447×447): a small concentric target, off-centre in its own
    // viewBox — no corner brackets in the source
    mount(RINGS[5], 224.5, 223.17, 16.37, `
      <circle cx="224.5" cy="223.17" r="29.19" fill="none" class="minor" stroke-width="1"/>
      <circle cx="224.5" cy="223.17" r="16.37" fill="none" class="ink"   stroke-width="1"/>
      <circle cx="224.5" cy="223.17" r="9.09"  fill="none" class="mid"  stroke-width="1"/>
    `);

    return h;
  },

  // what the field looks like u seconds into the pointer sweep (no controls, so ctl is never passed)
  pose(u) {
    const [px, py] = fingerAt(u);
    return { px, py };
  },

  finger(u) {
    const [px, py] = fingerAt(u);
    const x = px * 220, y = py * 220;
    return { x, y, down: true, layer: ringAt(Math.hypot(x, y)).id };
  },

  apply(h, p, D) {
    D = D || {};
    const one = v => v ?? 1;
    const t = p.t ?? 0, T = p.T || 1, phase = t / T;
    RINGS.forEach(rg => {
      const ang = phase * rg.turns * 360;
      // flat 2D offset, matching what the live component actually does: parallax.js's
      // translate3d(x, y, 0) always has z = 0, so there's no real depth to project here either —
      // depth is just a per-ring multiplier on the same pointer offset, same as the STORY capture
      const dx = p.px * rg.depth * AMP, dy = p.py * rg.depth * AMP;
      h.layers[rg.id].setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${ang.toFixed(2)})`);
      // dimmed to roughly the live component's own ambient opacity, so SPEC/EXPLODED read closer
      // to the STORY capture instead of full-bright stage hairlines
      h.groups[rg.id].setAttribute('opacity', (one(D[rg.id]) * AMBIENT_DIM).toFixed(3));
    });
  },
});

})();
