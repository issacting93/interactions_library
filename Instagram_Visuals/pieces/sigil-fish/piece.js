/* ─────────────────────────────────────────────────────────────
   PIECE · SIGIL FISH (SGF-18)
   tools/fish-tool/Sigil Fish (1).html: a 26-part sigil creature swimming on a travelling body
   wave (canvas, 2D, its own rAF loop — not SVG). Redrawn as layered SVG per house convention
   (see geared-reticle/piece.js for the controls contract, geared-reticle-patch/piece.js for the
   knob/jack/cord drawing idiom): a schematic spine of 9 joints with a travelling sine wave, rib
   studs, mirrored pectoral/pelvic fins, a forked tail, a medallion head with whisker barbels —
   plus Patch-style instrument chrome (knob readouts for WAVE/SPEED, a toggle for IRIS, a jack
   that literally patches WAVE's cord into the spine's drive socket).
   This is a simplified reinterpretation of the source's exact bezier geometry and iridescence
   shader, in the same spirit as every other piece's "layered redraw" — not a pixel-for-pixel port.
   ───────────────────────────────────────────────────────────── */
(() => {

const N = 9;                                   // spine joints, head → tail base
const Y0 = -140, Y1 = 150;
const JY = Array.from({ length: N }, (_, i) => lerp(Y0, Y1, i / (N - 1)));
const AMPF = Array.from({ length: N }, (_, i) => Math.pow(i / (N - 1), 1.4));   // wave grows toward the tail
const K = .95;                                  // spatial wavelength along the spine (rad/joint)
const WAVE0 = 220, SPEED0 = 1, BASE_HZ = 2.0;   // control defaults, match the source's own defaults

function smooth(pts) {
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0].toFixed(2)} ${last[1].toFixed(2)}`;
}
const tangent = (pts, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
};

// ── scripted (SPEC / EXPLODED): wave loosens, a burst of speed, iris crossfades in ──
function scripted(u) {
  return {
    wave: lerp(WAVE0, 460, clamp(win(u, 0, 2.0))),
    speed: lerp(SPEED0, 2.4, clamp(win(u, 1.0, 2.6))),
    iris: win(u, 2.6, 3.0),
  };
}
// precompute the scripted phase integral (pure function of u, seekable) — same pattern as
// geared-reticle's ANG tables: integrate speed·BASE_HZ at 60 Hz from u = 0
const DT = 1 / 60, UMAX = 8, NSTEP = Math.ceil(UMAX / DT) + 2;
const PHASE = new Float64Array(NSTEP);
(function integrate() {
  let ph = 0;
  for (let n = 1; n < NSTEP; n++) { ph += scripted((n - .5) * DT).speed * BASE_HZ * DT; PHASE[n] = ph; }
})();
const samplePhase = u => { const x = clamp(u, 0, UMAX) / DT, i = Math.floor(x); return lerp(PHASE[i], PHASE[Math.min(i + 1, NSTEP - 1)], x - i); };

// ── Patch-style knob glyph (after geared-reticle-patch/piece.js) ──
const KR = 13;
function knobArc(kx, ky, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b), s0 = 135 + 270 * lo, s1 = 135 + 270 * hi;
  const p0 = [kx + KR * Math.cos(rad(s0)), ky + KR * Math.sin(rad(s0))], p1 = [kx + KR * Math.cos(rad(s1)), ky + KR * Math.sin(rad(s1))];
  return `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A${KR} ${KR} 0 ${270 * (hi - lo) > 180 ? 1 : 0} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
}
function cordD([x1, y1], [x2, y2]) { const d = 16 + Math.abs(x2 - x1) * .2; return `M${x1} ${y1} C${x1} ${y1 + d} ${x2} ${y2 - d} ${x2} ${y2}`; }

const RACK_X = 150, RACK_Y = [-96, -20, 56];   // WAVE, SPEED, IRIS stacked on the right

registerPiece({
  id: 'sigil-fish',
  code: 'SGF-18', series: 'B', n: '18',
  name: 'SIGIL FISH',
  mechanic: 'PATCHED TRAVELLING-WAVE CREATURE',
  source: 'TOOLS/FISH-TOOL/SIGIL FISH',
  hero: { v: '1', u: '9 JOINTS · 2 FIN PAIRS · FORKED TAIL' },
  extent: 300,
  spec: [
    ['INPUT',  'BODY WAVE · SPEED · IRIS (PATCH)'],
    ['STATE',  'PHASE · AMPLITUDE PROFILE'],
    ['MOTION', 'Δphase = SPEED × 2.0 HZ · AMP ∝ (i/N)^1.4'],
    ['BUILT',  'SVG · PATCH KNOB/JACK/CORD CHROME'],
  ],
  layers: [
    { id: 'spine', name: 'SPINE',  note: '9 JOINTS · RIB STUDS',     edge: 180 },
    { id: 'fins',  name: 'FINS',   note: 'PECTORAL · PELVIC PAIR',   edge: 220 },
    { id: 'head',  name: 'HEAD',   note: 'MEDALLION · WHISKERS',     edge: 240 },
    { id: 'patch', name: 'PATCH',  note: 'WAVE/SPEED/IRIS · CORD',   edge: 300 },
    { id: 'input', name: 'INPUT',  note: 'KNOBS · TOGGLE',           edge: 300 },
  ],
  callouts: [
    { at: [0, Y0 - 10],         title: 'MEDALLION HEAD', note: 'WHISKER BARBELS' },
    { at: [-26, JY[2]],         title: 'PECTORAL FIN',   note: 'FULL AMPLITUDE' },
    { at: [20, JY[5]],          title: 'PELVIC FIN',     note: 'TRAILS THE WAVE' },
    { at: [0, Y1 + 24],         title: 'FORKED TAIL',    note: 'PEAK AMPLITUDE' },
    { at: [RACK_X, RACK_Y[0]],  title: 'WAVE · PATCHED',  note: 'CORD FEEDS THE SPINE' },
  ],
  specU: 1.2,
  exploded: { live: 4.4, poseEnd: 4.8 },

  controls: [
    { id: 'wave',  label: 'BODY WAVE', kind: 'knob',    min: 0, max: 500, value: WAVE0,  fmt: v => `${v.toFixed(0)} PX` },
    { id: 'speed', label: 'SPEED',     kind: 'knob',    min: 0, max: 3,   value: SPEED0, fmt: v => `×${v.toFixed(2)}` },
    { id: 'iris',  label: 'IRIS',      kind: 'toggle',  min: 0, max: 1,  value: 0,      fmt: v => v > .5 ? 'ON' : 'OFF' },
  ],
  story: {
    tweaks: [
      { id: 'wave',  to: 460 },   // the body loosens from a stiff twitch into a wide travelling wave
      { id: 'speed', to: 2.6 },   // a burst of speed down the spine
      { id: 'iris',  to: 1 },     // the body catches an oil-slick sheen, patched in from the rack
    ],
  },

  assembly: {
    seeds: [[0, Y0], [0, Y1], [-26, JY[2]], [26, JY[2]], [RACK_X, RACK_Y[0]], [RACK_X, RACK_Y[1]], [RACK_X, RACK_Y[2]]],
    live: 2.6,
    end: 2.2,
    draw: t => ({ t }),
  },

  build(L, sw) {
    const h = { reg: [] };
    // (n, kind:'draw'|'op', a, b, c, d, base=1): a→b draws/fades on, c→d draws/fades off, on the
    // canonical 8 s clock; consumed generically in apply()'s final pass (see geared-reticle/piece.js)
    const reg = (n, kind, a, b, c, d, base = 1) => { h.reg.push({ n, kind, a, b, c, d, base }); return n; };

    // rev C: the piece owns its hue — Sigil Fish's native teal — in every mode
    el('style', {}, L.input.ownerSVGElement).textContent =
      '.acc{stroke:#61E5BF}.accf{fill:#61E5BF}.on .disc{fill:#61E5BF}.on .ink{stroke:#61E5BF}.on .accf{fill:#61E5BF}';

    const Sp = L.spine;
    h.spineLine = reg(el('path', { fill: 'none', class: 'ink', 'stroke-width': sw.main * 1.3 }, Sp), 'draw', .8, 1.8, 6.2, 7.1);
    h.ribs = Array.from({ length: N - 2 }, (_, i) => reg(el('line', { class: 'mid', 'stroke-width': sw.minor }, Sp), 'draw', 1.1 + i * .06, 1.5 + i * .06, 6.0 + (N - i) * .04, 6.5 + (N - i) * .04));
    h.sockets = [2, 5].map(() => reg(drawable(el('circle', { r: 3.2, fill: 'none', class: 'acc', 'stroke-width': sw.minor }, Sp)), 'draw', 1.6, 2.0, 5.9, 6.3));

    const Fi = L.fins;
    h.fins = [2, 5].map((ji, k) => [-1, 1].map(() => reg(el('path', { fill: 'none', class: k ? 'mid' : 'ink', 'stroke-width': sw.main * (k ? .8 : 1) }, Fi), 'draw', 1.3 + k * .2, 1.9 + k * .2, 6.0, 6.6)));
    h.tail = [-1, 1].map(() => reg(el('path', { fill: 'none', class: 'ink', 'stroke-width': sw.main }, Fi), 'draw', 1.7, 2.3, 5.8, 6.4));

    const He = L.head;
    h.medallion = reg(el('circle', { cx: 0, cy: Y0, r: 16, fill: 'none', class: 'ink', 'stroke-width': sw.main }, He), 'draw', .9, 1.6, 6.4, 7.0);
    const headCore = reg(el('g', {}, He), 'op', 1.1, 1.7, 6.3, 6.9);
    h.medallionCore = el('circle', { cx: 0, cy: Y0, r: 5, class: 'disc acc', 'stroke-width': sw.minor }, headCore);
    h.eyes = [-6, 6].map(dx => el('circle', { cx: dx, cy: Y0 - 3, r: 1.6, class: 'icondot' }, headCore));
    h.whiskers = [-1, 1].map(() => reg(el('path', { fill: 'none', class: 'mid', 'stroke-width': sw.minor }, He), 'draw', 1.4, 2.0, 6.1, 6.6));

    // ── Patch rack: WAVE / SPEED knobs, IRIS LED-toggle, a jack patched into the spine socket ──
    const Pa = L.patch;
    h.cordG = el('g', { fill: 'none', 'stroke-linecap': 'round' }, Pa);
    h.cord = reg(drawable(el('path', { class: 'acc', 'stroke-width': sw.main }, h.cordG)), 'draw', 2.0, 2.6, 5.7, 6.2);
    h.rack = RACK_Y.map((ry, i) => {
      const g = reg(el('g', {}, Pa), 'op', 1.5 + i * .12, 2.1 + i * .12, 5.8 + (2 - i) * .1, 6.3 + (2 - i) * .1);
      el('rect', { x: RACK_X - 44, y: ry - 30, width: 88, height: 60, rx: 9, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      const label = ['WAVE', 'SPEED', 'IRIS'][i];
      txt(g, RACK_X - 36, ry - 14, label, { 'font-size': 10, 'letter-spacing': '.14em', class: 'disp dim' });
      const track = el('path', { fill: 'none', class: 'minor', 'stroke-width': sw.minor }, g);
      track.setAttribute('d', knobArc(RACK_X - 18, ry + 10, 0, 1));
      const valArc = el('path', { fill: 'none', class: 'ink', 'stroke-width': sw.main * 1.1 }, g);
      const ptr = el('line', { class: 'ink', 'stroke-width': sw.minor }, g);
      const dot = el('circle', { cx: RACK_X - 18, cy: ry + 10, r: 6, class: 'disc ink', 'stroke-width': sw.minor }, g);
      const val = txt(g, RACK_X + 4, ry + 14, '', { 'font-size': 10.5, class: 'disp' });
      const jack = el('circle', { cx: RACK_X - 44, cy: ry + 10, r: 4, class: 'disc ink', 'stroke-width': sw.main }, g);
      return { valArc, ptr, dot, val, jack, kx: RACK_X - 18, ky: ry + 10 };
    });
    return h;
  },

  // no drag/tap performance of its own (STORY's finger lives on the stage's generic control panel);
  // park it off the diagram so EXPLODED's unconditional piece.finger(u) call doesn't throw.
  finger() { return { x: 0, y: -400 }; },

  pose(u, ctl) {
    const live = !!ctl;
    const wave = live ? ctl.v.wave : scripted(u).wave;
    const speed = live ? ctl.v.speed : scripted(u).speed;
    const iris = live ? ctl.v.iris : scripted(u).iris;
    const phase = live ? ctl.integ(c => c.speed * BASE_HZ) : samplePhase(u);
    const amp = wave / 500 * 46;   // source px → house units
    const joints = JY.map((y, i) => [amp * AMPF[i] * Math.sin(phase - i * K), y]);
    return { wave, speed, iris, phase, joints };
  },

  apply(h, p, D) {
    const J = p.joints;
    h.spineLine.setAttribute('d', smooth(J));
    h.ribs.forEach((r, i) => {
      const idx = i + 1, [x, y] = J[idx], [tx, ty] = tangent(J, idx), nx = -ty, ny = tx, w = 10 + 16 * (idx / (N - 1));
      r.setAttribute('x1', (x - nx * w).toFixed(2)); r.setAttribute('y1', (y - ny * w).toFixed(2));
      r.setAttribute('x2', (x + nx * w).toFixed(2)); r.setAttribute('y2', (y + ny * w).toFixed(2));
    });
    [2, 5].forEach((ji, k) => { const [x, y] = J[ji]; h.sockets[k].setAttribute('cx', x.toFixed(2)); h.sockets[k].setAttribute('cy', y.toFixed(2)); });
    [2, 5].forEach((ji, k) => {
      const [x, y] = J[ji], [tx, ty] = tangent(J, ji), nx = -ty, ny = tx, sweep = 30 + 10 * k;
      h.fins[k].forEach((fin, s) => {
        const sgn = s === 0 ? -1 : 1;
        const bx = x + nx * sgn * sweep, by = y + ny * sgn * sweep + sweep * .6;
        fin.setAttribute('d', `M${x.toFixed(2)} ${y.toFixed(2)} Q${(x + nx * sgn * sweep * .6).toFixed(2)} ${(y + 6).toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`);
      });
    });
    const [tx0, ty0] = J[N - 1], [tgx, tgy] = tangent(J, N - 1);
    h.tail.forEach((t, s) => {
      const sgn = s === 0 ? -1 : 1, nx = -tgy, ny = tgx, len = 34;
      const ex = tx0 + tgx * len + nx * sgn * 18, ey = ty0 + tgy * len + ny * sgn * 18;
      t.setAttribute('d', `M${tx0.toFixed(2)} ${ty0.toFixed(2)} Q${(tx0 + tgx * len * .5).toFixed(2)} ${(ty0 + tgy * len * .5).toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`);
    });
    h.medallion.setAttribute('cx', J[0][0]);
    h.medallionCore.setAttribute('cx', J[0][0]);
    h.eyes.forEach((e, i) => e.setAttribute('cx', J[0][0] + (i ? 6 : -6)));
    h.whiskers.forEach((wk, s) => {
      const sgn = s === 0 ? -1 : 1, [x, y] = J[0], sway = Math.sin(p.phase * .3 + sgn) * 6;
      wk.setAttribute('d', `M${x.toFixed(2)} ${(y - 14).toFixed(2)} Q${(x + sgn * 20).toFixed(2)} ${(y - 28 + sway).toFixed(2)} ${(x + sgn * 30).toFixed(2)} ${(y - 40).toFixed(2)}`);
    });
    // patch rack: knobs read the live values; IRIS lights the jack and the cord carries the accent
    const VALS = [[0, 500, p.wave, v => `${v.toFixed(0)} PX`], [0, 3, p.speed, v => `×${v.toFixed(2)}`], [0, 1, p.iris, v => v > .5 ? 'ON' : 'OFF']];
    h.rack.forEach((r, i) => {
      const [lo, hi, v, fmt] = VALS[i], k = clamp((v - lo) / (hi - lo));
      r.valArc.setAttribute('d', knobArc(r.kx, r.ky, .5, k));
      const pa = rad(135 + 270 * k);
      r.ptr.setAttribute('x1', r.kx); r.ptr.setAttribute('y1', r.ky);
      r.ptr.setAttribute('x2', (r.kx + 7 * Math.cos(pa)).toFixed(2)); r.ptr.setAttribute('y2', (r.ky + 7 * Math.sin(pa)).toFixed(2));
      r.val.textContent = fmt(v);
      r.jack.setAttribute('class', i === 0 ? 'disc acc' : 'disc ink');
      r.dot.setAttribute('class', i === 2 && v > .5 ? 'disc acc' : 'disc ink');
    });
    h.cord.setAttribute('d', cordD([RACK_X - 44, RACK_Y[0] + 10], [J[2][0], J[2][1]]));

    // draw on / off (reveal in STORY/ASSEMBLY, undraw in fade/fold); fully shown in SPEC (D undefined)
    for (const r of h.reg) {
      const k = D ? dOn(D.t, r.a, r.b) * dOff(D.t, r.c, r.d) : 1;
      if (r.kind === 'draw') setDraw(r.n, k);
      else r.n.setAttribute('opacity', k * r.base);
    }
  },
});
})();
