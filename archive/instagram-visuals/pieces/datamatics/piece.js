/* ─────────────────────────────────────────────────────────────
   PIECE · DATAMATICS
   Reconstructed from three other pieces in the library: the flock
   from boids / murmuration-rosette (separation/alignment/cohesion
   on a shell sphere, called to a point), the address ring from
   rain-vortex-rev-b's valve ring (stations around a circle, stripped
   of its glow-beams), and the raw readout from datamatic-tape (a
   barcode + numeric strip, no easing, the number IS the value).

   The difference from MUR-12: no WebGL, no offscreen image. The
   flock is plotted straight into SVG as plain <rect> dots and <line>
   threads — the house pipeline reads it natively, same as every
   other piece, and "plotted coordinates, not rendered geometry" is
   the point of calling this one Datamatics. It's also the one piece
   in the grid that keeps colour at zero everywhere, including
   EXPLODED: the active address square is the only element that ever
   takes P.on, so even the "colour is identity" mode reads as pure
   black and white with a single accent, never a second hue.

   Determinism: same approximation MUR-12 already uses — the flock
   has no closed form, so it's a seeded, fixed-step REPLAY advanced
   to floor(p.t * 60), using whatever the CURRENT active address and
   density are for any newly-stepped frames. That's exact for normal
   forward playback (capture.mjs and the stage both only ever grow
   p.t by small increments) and an accepted approximation on a
   backward scrub, which resets and replays from step 0.
   ───────────────────────────────────────────────────────────── */
(() => {

const NODE_R = 190, INNER_R = NODE_R * .72;
const nodeXY = i => { const a = rad(i * 45 - 90); return [Math.cos(a) * NODE_R, Math.sin(a) * NODE_R]; };

/* ── the flock: plain {x,y,z} objects, no renderer — separation/alignment/cohesion/seek, plus a
   radial spring back to RING_R so the swarm stays a shell instead of a cloud ── */
const BOID = {
  count: 96, ringR: 7.5, radialK: 1.7, maxSpeed: 3.0, maxForce: 4.6,
  wSep: 2.4, wAli: .9, wCoh: .45, wSeek: 2.8, maxLines: 320, seed: 7781,
};
const seek3D = i => { const a = rad(i * 45 - 90); return { x: Math.cos(a) * BOID.ringR, y: Math.sin(a) * BOID.ringR, z: 0 }; };
const FLOCK_SCALE = (NODE_R / BOID.ringR) * .62;   // world units → piece units, same ratio as the live component

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash32 = n => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };

function makeFlock() {
  const rng = mulberry32(BOID.seed);
  const boids = Array.from({ length: BOID.count }, () => {
    const th = Math.acos(2 * rng() - 1), ph = 2 * Math.PI * rng(), r = BOID.ringR * (.9 + .2 * rng());
    const pos = { x: r * Math.sin(th) * Math.cos(ph), y: r * Math.sin(th) * Math.sin(ph), z: r * Math.cos(th) };
    const vx = rng() - .5, vy = rng() - .5, vz = rng() - .5, len = Math.hypot(vx, vy, vz) || 1, s = BOID.maxSpeed * .4 / len;
    return { pos, vel: { x: vx * s, y: vy * s, z: vz * s } };
  });
  return { step: 0, boids, lineN: 0, lines: new Float32Array(BOID.maxLines * 6) };
}
function stepFlock(sim, targetIdx, perception, lineDist) {
  const target = seek3D(targetIdx), { boids } = sim, n = boids.length, dt = 1 / 60;
  const ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n);
  let lineN = 0;
  const steer = (dx, dy, dz, vx, vy, vz, w, out) => {
    let len = Math.hypot(dx, dy, dz); if (!len) return;
    const k = BOID.maxSpeed / len; dx = dx * k - vx; dy = dy * k - vy; dz = dz * k - vz;
    let fl = Math.hypot(dx, dy, dz); if (fl > BOID.maxForce) { const fk = BOID.maxForce / fl; dx *= fk; dy *= fk; dz *= fk; }
    out.x += dx * w; out.y += dy * w; out.z += dz * w;
  };
  for (let i = 0; i < n; i++) {
    const b = boids[i];
    let sepx=0,sepy=0,sepz=0, alix=0,aliy=0,aliz=0, cohx=0,cohy=0,cohz=0, cnt=0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = boids[j], dx = b.pos.x-o.pos.x, dy = b.pos.y-o.pos.y, dz = b.pos.z-o.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 0 && d < perception) {
        const inv = 1 / (d * d);
        sepx += dx*inv; sepy += dy*inv; sepz += dz*inv;
        alix += o.vel.x; aliy += o.vel.y; aliz += o.vel.z;
        cohx += o.pos.x; cohy += o.pos.y; cohz += o.pos.z; cnt++;
      }
      if (j > i && d > 0 && d < lineDist && lineN < BOID.maxLines) {
        const k = lineN++ * 6;
        sim.lines[k]=b.pos.x; sim.lines[k+1]=b.pos.y; sim.lines[k+2]=b.pos.z;
        sim.lines[k+3]=o.pos.x; sim.lines[k+4]=o.pos.y; sim.lines[k+5]=o.pos.z;
      }
    }
    const out = { x: 0, y: 0, z: 0 };
    if (cnt > 0) {
      steer(sepx, sepy, sepz, b.vel.x, b.vel.y, b.vel.z, BOID.wSep, out);
      steer(alix/cnt, aliy/cnt, aliz/cnt, b.vel.x, b.vel.y, b.vel.z, BOID.wAli, out);
      steer(cohx/cnt-b.pos.x, cohy/cnt-b.pos.y, cohz/cnt-b.pos.z, b.vel.x, b.vel.y, b.vel.z, BOID.wCoh, out);
    }
    steer(target.x-b.pos.x, target.y-b.pos.y, target.z-b.pos.z, b.vel.x, b.vel.y, b.vel.z, BOID.wSeek, out);
    const r = Math.hypot(b.pos.x, b.pos.y, b.pos.z) || 1, pull = (BOID.ringR - r) * BOID.radialK;
    out.x += (b.pos.x/r)*pull; out.y += (b.pos.y/r)*pull; out.z += (b.pos.z/r)*pull;
    ax[i]=out.x; ay[i]=out.y; az[i]=out.z;
  }
  for (let i = 0; i < n; i++) {
    const b = boids[i];
    b.vel.x += ax[i]*dt; b.vel.y += ay[i]*dt; b.vel.z += az[i]*dt;
    const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    if (sp > BOID.maxSpeed) { const k = BOID.maxSpeed/sp; b.vel.x*=k; b.vel.y*=k; b.vel.z*=k; }
    b.pos.x += b.vel.x*dt; b.pos.y += b.vel.y*dt; b.pos.z += b.vel.z*dt;
  }
  sim.lineN = lineN; sim.step++;
}
function simAt(sim, targetIdx, targetStep, perception, lineDist) {
  if (targetStep < sim.step) { const fresh = makeFlock(); sim.step = fresh.step; sim.boids = fresh.boids; }
  while (sim.step < targetStep) stepFlock(sim, targetIdx, perception, lineDist);
}

// orthographic-ish projection with a slow constant roll (a scan, not a cinematic orbit) — a pure
// function of t, so scrubbing never drifts out of sync with the sim it's projecting
const ROLL_RATE = .05, FOCAL = 16;
function projectFlock(sim, t) {
  const roll = (t ?? 3) * ROLL_RATE, rc = Math.cos(roll), rs = Math.sin(roll);
  return sim.boids.map(b => {
    const p = b.pos, x = p.x*rc - p.z*rs, z = p.x*rs + p.z*rc, s = FOCAL / (FOCAL + z);
    return { sx: x * s * FLOCK_SCALE, sy: p.y * s * FLOCK_SCALE, s };
  });
}

const TAPS = [
  { at: 0.30, node: 2 },
  { at: 1.70, node: 6 },
  { at: 3.10, node: 4 },
];

registerPiece({
  id: 'datamatics',
  code: 'DTM-17', series: 'D', n: '17',
  name: 'DATAMATICS',
  mechanic: 'ADDRESS RING · CALLS A FLOCK, READS IT BACK',
  source: 'COMPONENTS/INTERACTION/DATAMATICS',
  hero: { v: '96', u: 'POINTS · SEEDED SIM' },
  extent: 300,
  spec: [
    ['INPUT',   'TAP AN ADDRESS · NO EASING'],
    ['FLOCK',   '96 POINTS · SEPARATION/ALIGNMENT/COHESION'],
    ['READOUT', 'BARCODE KEYED TO LIVE THREAD COUNT'],
    ['BUILT',   'DOM · SVG · SEEDED FIXED-STEP SIM'],
  ],
  layers: [
    { id: 'flock', name: 'FLOCK',   note: `${BOID.count} POINTS · CALLED TO THE ACTIVE ADDRESS`, edge: 170 },
    { id: 'ring',  name: 'SCAN RING', note: 'Ø380 · Ø274 · SWEEP', edge: 190 },
    { id: 'nodes', name: 'ADDRESSES', note: '8 × 45° · R190', edge: 210 },
    { id: 'core',  name: 'CENTRE',  note: 'STATIC · NO RELEASE IN STORY', edge: 40 },
    { id: 'tape',  name: 'TAPE',    note: 'BARCODE + BIN/HEX READOUT', edge: 300 },
    { id: 'input', name: 'INPUT',   note: 'TAP · HIT TEST', edge: 300 },
  ],
  // anchors spread across angles (not two stacked straight down), so the sorted label column
  // doesn't overflow the bottom and get shifted up into the hero numeral at the top
  callouts: [
    { at: [0, -70],         title: 'FLOCK',    note: 'SEEDED · FIXED-STEP SIM' },
    { at: nodeXY(1),        title: 'ADDRESSES', note: '8 × 45° · FLOCK ATTRACTOR' },
    { at: [Math.cos(rad(22.5)) * 20, Math.sin(rad(22.5)) * 20], title: 'CENTRE', note: 'RELEASE (LIVE COMPONENT ONLY)' },
    { at: nodeXY(3),        title: 'ACTIVE',    note: 'SNAPS — NO SPRING' },
    { at: [150, 200],       title: 'TAPE',      note: 'THE NUMBER IS THE VALUE' },
  ],
  taps: TAPS,
  specU: 1.15,

  controls: [
    { id: 'node',    label: 'NODE',    kind: 'knob',   min: 0, max: 7,   value: 0,  fmt: v => `${Math.round(v)}/8` },
    { id: 'density', label: 'DENSITY', kind: 'slider', min: .2, max: .9, value: .5, fmt: v => v.toFixed(2) },
    { id: 'clock',   label: 'CLOCK',   kind: 'slider', min: .4, max: 1.8, value: 1, fmt: v => `${v.toFixed(2)}×` },
  ],
  story: {
    tweaks: [
      { id: 'node',    to: 6 },     // the address snaps — no spring, the flock is the only thing that eases
      { id: 'density', to: .26 },   // tighter perception: fewer, shorter-lived threads
      { id: 'clock',   to: 1.55 },  // the sweep and the tape both read faster, the sim itself does not
    ],
  },
  exploded: { live: 3.6 },
  assembly: {
    seeds: [[0, 0], ...Array.from({ length: 8 }, (_, i) => nodeXY(i))],
    live: 2.6,
    end: 3.1,
    draw: t => ({
      t,
      ring: [dOn(t, .6, 1.5) * dOff(t, 6.3, 7.1), dOn(t, .8, 1.7) * dOff(t, 6.2, 7.0)],
      sweep: dOn(t, .9, 1.6) * dOff(t, 6.1, 6.9),
      nodes: Array.from({ length: 8 }, (_, i) => {
        const a = 1.0 + stag(i, 8, .08), b = 6.0 + stag(7 - i, 8, .08);
        return dOn(t, a, a + .3) * dOff(t, b, b + .3);
      }),
      core: dOn(t, 1.1, 1.8) * dOff(t, 6.6, 7.3),
      flock: dOn(t, 1.3, 2.4) * dOff(t, 5.8, 6.8),
      tape: dOn(t, 1.6, 2.6) * dOff(t, 5.6, 6.6),
    }),
  },

  build(L, sw) {
    const h = {};
    h.sim = makeFlock();

    h.flockG = el('g', {}, L.flock);
    h.threadLines = Array.from({ length: BOID.maxLines }, () => el('line', { class: 'minor', 'stroke-width': sw.minor * .6, opacity: 0 }, h.flockG));
    h.boidEls = Array.from({ length: BOID.count }, () => el('rect', { class: 'icondot', width: 2, height: 2 }, h.flockG));

    h.ringOuter = drawable(el('circle', { r: NODE_R, fill: 'none', class: 'mid', 'stroke-width': sw.minor }, L.ring));
    h.ringInner = drawable(el('circle', { r: INNER_R, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, L.ring));
    h.sweepG = el('g', {}, L.ring);
    el('line', { x1: INNER_R, y1: 0, x2: NODE_R, y2: 0, class: 'ink', 'stroke-width': sw.main }, h.sweepG);

    h.nodes = Array.from({ length: 8 }, (_, i) => {
      const [x, y] = nodeXY(i), sz = 13;
      const g = el('g', { transform: `translate(${x} ${y})` }, L.nodes);
      const disc = el('rect', { x: -sz/2, y: -sz/2, width: sz, height: sz, class: 'disc' }, g);
      const ring = drawable(el('rect', { x: -sz/2, y: -sz/2, width: sz, height: sz, fill: 'none', class: 'ink', 'stroke-width': sw.main }, g));
      const label = txt(g, 0, sz + 15, String(i), { 'text-anchor': 'middle', class: 'mid', 'font-size': 11 });
      return { g, disc, ring, label };
    });

    h.coreG = el('g', {}, L.core);
    h.coreRing = drawable(el('rect', { x: -14, y: -14, width: 28, height: 28, fill: 'none', class: 'ink', 'stroke-width': sw.main }, h.coreG));
    h.coreIcon = [
      el('path', { d: 'M-7 0 H-3 M3 0 H7 M0 -7 V-3 M0 3 V7', class: 'icon', 'stroke-width': sw.icon }, h.coreG),
    ].map(drawable);

    h.tapeG = el('g', {}, L.tape);
    const BARS = 56, TW = 330, BW = TW / BARS, BX0 = -TW / 2, BY = 200, BH = 45;
    h.tapeFrame = drawable(el('rect', { x: BX0, y: BY, width: TW, height: BH, fill: 'none', class: 'minor', 'stroke-width': sw.minor }, h.tapeG));
    h.tapeBars = Array.from({ length: BARS }, (_, i) => el('rect', {
      x: BX0 + i * BW, y: BY, width: Math.max(1, BW * .78), height: 0, class: 'icondot',
    }, h.tapeG));
    h.tapeL = txt(h.tapeG, BX0, BY + BH + 16, '', { class: 'mid', 'font-size': 11 });
    h.tapeR = txt(h.tapeG, BX0 + TW, BY + BH + 16, '', { 'text-anchor': 'end', class: 'mid', 'font-size': 11 });
    return h;
  },

  pose(u, ctl) {
    if (ctl) return { active: Math.round(ctl.v.node), density: ctl.v.density, clock: ctl.v.clock };
    const T = this.taps;
    let active = T[0].node;
    for (const tp of T) if (u >= tp.at) active = tp.node;
    return { active, density: .5, clock: 1 };
  },

  finger(u) {
    const T = this.taps;
    let from = [NODE_R * .85, NODE_R * .4], prevAt = -0.6;
    for (const tp of T) {
      const to = nodeXY(tp.node);
      const a = Math.max(prevAt + .12, tp.at - .5), b = tp.at - .04;
      if (u < b) { const k = io(win(u, a, b)); return { x: lerp(from[0], to[0], k), y: lerp(from[1], to[1], k), pulse: null }; }
      if (u < tp.at + .5) return { x: to[0], y: to[1], pulse: win(u, tp.at, tp.at + .5), tap: tp };
      from = to; prevAt = tp.at;
    }
    return { x: from[0], y: from[1], pulse: null };
  },

  apply(h, p, draw) {
    if (!draw) draw = {};
    setDraw(h.ringOuter, draw.ring ? draw.ring[0] : 1);
    setDraw(h.ringInner, draw.ring ? draw.ring[1] : 1);
    h.sweepG.setAttribute('opacity', draw.sweep ?? 1);
    const sweepDeg = p.t == null ? -90 : (p.t * 70 * (p.clock || 1)) % 360;
    h.sweepG.setAttribute('transform', `rotate(${sweepDeg})`);

    h.nodes.forEach((n, i) => {
      n.g.classList.toggle('on', i === p.active);
      const v = draw.nodes ? draw.nodes[i] : 1;
      n.ring.setAttribute('opacity', v); n.disc.setAttribute('opacity', v); n.label.setAttribute('opacity', v);
    });
    setDraw(h.coreRing, draw.core ?? 1);
    h.coreIcon.forEach(c => setDraw(c, draw.core ?? 1));

    // flock: deterministic replay to p.t (a single baked frame when p.t is absent, i.e. SPEC)
    const density = p.density ?? .5, perception = 2.6 + density * 4.2, lineDist = .9 + density * 2.4;
    const renderFlock = () => {
      const pts = projectFlock(h.sim, p.t);
      h.boidEls.forEach((el2, i) => {
        const pt = pts[i], sz = Math.max(1.4, 3.1 * pt.s);
        el2.setAttribute('x', pt.sx - sz / 2); el2.setAttribute('y', pt.sy - sz / 2);
        el2.setAttribute('width', sz); el2.setAttribute('height', sz);
        el2.setAttribute('opacity', clamp(.35 + .65 * pt.s));
      });
      h.threadLines.forEach((ln, k) => {
        if (k >= h.sim.lineN) { ln.setAttribute('opacity', 0); return; }
        const i6 = k * 6, roll = (p.t ?? 3) * ROLL_RATE, rc = Math.cos(roll), rs = Math.sin(roll);
        const proj3 = (x, y, z) => { const xx = x*rc - z*rs, zz = x*rs + z*rc, s = FOCAL/(FOCAL+zz); return [xx*s*FLOCK_SCALE, y*s*FLOCK_SCALE]; };
        const [x1, y1] = proj3(h.sim.lines[i6], h.sim.lines[i6+1], h.sim.lines[i6+2]);
        const [x2, y2] = proj3(h.sim.lines[i6+3], h.sim.lines[i6+4], h.sim.lines[i6+5]);
        ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
        ln.setAttribute('opacity', .4);
      });
    };
    if (p.t == null) {
      if (!h.flockBaked) { simAt(h.sim, p.active, 150, perception, lineDist); renderFlock(); h.flockBaked = true; }
    } else {
      simAt(h.sim, p.active, Math.max(0, Math.floor(p.t * 60)), perception, lineDist);
      renderFlock();
    }
    h.flockG.setAttribute('opacity', draw.flock ?? 1);

    // tape: real numbers off the sim, the same way the live component derives its barcode seed
    h.tapeG.setAttribute('opacity', draw.tape ?? 1);
    const target = seek3D(p.active);
    let sumD = 0;
    for (const b of h.sim.boids) sumD += Math.hypot(b.pos.x - target.x, b.pos.y - target.y, b.pos.z - target.z);
    const avgD = sumD / h.sim.boids.length, threads = h.sim.lineN;
    const seed = (threads & 0x3ff) ^ ((Math.floor(avgD * 8) & 0xff) << 10) ^ (p.active << 18);
    const tapeClock = p.t == null ? 0 : p.t * (p.clock || 1);
    h.tapeBars.forEach((bar, i) => {
      const idx = i + Math.floor(seed * 2.7 + tapeClock * 6);
      const on = hash32((idx * 2654435761) >>> 0) > .52;
      const short = hash32((idx * 1597334677) >>> 0) > .78;
      const h2 = on ? (short ? 26 : 45) : 0;
      bar.setAttribute('height', h2);
      bar.setAttribute('y', 200 + (45 - h2));
    });
    const bits = threads.toString(2).padStart(10, '0');
    h.tapeL.textContent = `LINES ${String(threads).padStart(3, '0')}  BIN ${bits}  HEX 0x${threads.toString(16).toUpperCase().padStart(3, '0')}`;
    h.tapeR.textContent = `SEEK Δ${avgD.toFixed(3)}  NODE ${p.active}/8`;
  },
});
})();
