// packages/ecology/scene-metrics.js -- window.SceneMetrics: numbers for how a scene moves and looks, so a change that makes it worse shows up
// as a red number, not as a screenshot. Used by World Scene's ?check mode (on a real phone) and by tools/capture/world-scene-check.mjs
// (headless, after a change). Plain functions; no page globals.
//
//   const m = SceneMetrics.motion(sim, { species: ['koi', ...] })   then m.sample(dt) every frame (after the sim stepped), m.result() at the end
//       per species: turn (rad/s: median, 95th), bend (rad between head and tail: median, 95th), nn (nearest neighbour, body lengths),
//       groups (clusters of 3+ within 3 bodies), biggest (the largest cluster's share), align (heading agreement of neighbours, -1..1)
//   SceneMetrics.picture(canvas)    from the drawn frame: black, white (shares of near-black / near-white pixels), mean (luma 0..1), flat (share of
//                                   pixels within 2% of the frame's most common colour: a blank or washed frame)
//   SceneMetrics.grade(report)      [{ level: 'fail' | 'warn', what, value, limit }] against LIMITS
//   SceneMetrics.LIMITS
(function () {
  'use strict';
  const LIMITS = {
    turn95: 2.0, // rad/s: a koi gliding round, not snapping
    bend95: 2.0, // rad: a body folding nearly double
    align: 0.6, // a school's neighbours facing the same way (warn below)
    biggest: 0.9, // one cluster holding nearly every creature: a bundle, not schools (warn)
    black: 0.55, // most of the frame near black (fail above 0.8)
    white: 0.25, // a washed-out frame
    flat: 0.92, // one colour almost everywhere: nothing drawn
    fps: 30, // a phone should hold this
  };
  const q = (A, k) => (A.length ? A[Math.min(A.length - 1, Math.floor(A.length * k))] : 0);
  const r2 = (v) => Math.round(v * 100) / 100;

  function motion(sim, opt) {
    const keys = (opt && opt.species) || [],
      S = sim.speciesRT || [],
      idx = {};
    const SP = (window.EcologySpecies && EcologySpecies.SPECIES) || [];
    keys.forEach((k) => {
      const i = SP.findIndex((s) => s.key === k);
      if (i >= 0) idx[k] = i;
    });
    const acc = {};
    for (const k in idx)
      acc[k] = { turns: [], bends: [], nn: [], groups: [], biggest: [], align: [], prev: new Map(), n: 0 };
    let frames = 0,
      clock = 0,
      next = 0;
    const bodyLen = (f) => (window.EcologySim && EcologySim.bodyLen ? EcologySim.bodyLen(sim, f) : 20);
    function sample(dt) {
      frames++;
      clock += dt;
      const groupsNow = clock >= next;
      if (groupsNow) next = clock + 0.5;
      for (const k in idx) {
        const A = acc[k],
          list = sim.fish.filter((f) => !f.dead && f.sp === idx[k]);
        A.n = list.length;
        for (const f of list) {
          const a = A.prev.get(f);
          if (a != null && dt > 0) {
            const d = Math.atan2(Math.sin(f.ang - a), Math.cos(f.ang - a));
            A.turns.push(Math.abs(d) / dt);
          }
          A.prev.set(f, f.ang);
          const c = f.chain,
            n = c ? c.length / 2 : 0;
          if (n > 3) {
            const hx = c[2] - c[0],
              hy = c[3] - c[1],
              tx = c[(n - 1) * 2] - c[(n - 2) * 2],
              ty = c[(n - 1) * 2 + 1] - c[(n - 2) * 2 + 1];
            A.bends.push(Math.abs(Math.atan2(hx * ty - hy * tx, hx * tx + hy * ty)));
          }
        }
        if (!groupsNow || list.length < 3) continue; // the group numbers twice a second, whatever the frame rate
        const bl = bodyLen(list[0]),
          lab = list.map((_, j) => j),
          find = (j) => (lab[j] === j ? j : (lab[j] = find(lab[j])));
        let al = 0,
          alN = 0;
        for (let i = 0; i < list.length; i++) {
          let m = 1e9;
          const f = list[i];
          for (let j = 0; j < list.length; j++) {
            if (i === j) continue;
            const g = list[j],
              d = Math.hypot(f.x - g.x, f.y - g.y);
            if (d < m) m = d;
            if (d < bl * 3) {
              if (j > i) lab[find(i)] = find(j);
              al += Math.cos(f.ang - g.ang);
              alN++;
            }
          }
          A.nn.push(m / bl);
        }
        const sz = {};
        list.forEach((_, j) => {
          const r = find(j);
          sz[r] = (sz[r] || 0) + 1;
        });
        const v = Object.values(sz);
        A.groups.push(v.filter((x) => x >= 3).length);
        A.biggest.push(Math.max(...v) / list.length);
        if (alN) A.align.push(al / alN);
      }
    }
    function result() {
      const out = {};
      for (const k in acc) {
        const A = acc[k],
          s = (X) => X.slice().sort((a, b) => a - b),
          mean = (X) => (X.length ? X.reduce((a, b) => a + b, 0) / X.length : 0),
          T = s(A.turns),
          B = s(A.bends);
        out[k] = {
          n: A.n,
          turn50: r2(q(T, 0.5)),
          turn95: r2(q(T, 0.95)),
          bend50: r2(q(B, 0.5)),
          bend95: r2(q(B, 0.95)),
          nn: r2(mean(A.nn)),
          groups: r2(mean(A.groups)),
          biggest: r2(mean(A.biggest)),
          align: r2(mean(A.align)),
        };
      }
      return out;
    }
    return { sample, result };
  }

  // the frame as drawn (a WebGL canvas needs preserveDrawingBuffer, or call right after drawing)
  function picture(canvas, w) {
    w = w || 96;
    const h = Math.max(1, Math.round((w * canvas.height) / Math.max(1, canvas.width)));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(canvas, 0, 0, w, h);
    const D = x.getImageData(0, 0, w, h).data,
      N = w * h,
      bins = new Map();
    let black = 0,
      white = 0,
      sum = 0;
    for (let i = 0; i < D.length; i += 4) {
      const l = (0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]) / 255;
      sum += l;
      if (l < 0.04) black++;
      if (l > 0.96) white++;
      const key = ((D[i] >> 3) << 10) | ((D[i + 1] >> 3) << 5) | (D[i + 2] >> 3);
      bins.set(key, (bins.get(key) || 0) + 1);
    }
    let top = 0;
    for (const v of bins.values()) if (v > top) top = v;
    return {
      black: r2(black / N),
      white: r2(white / N),
      mean: r2(sum / N),
      flat: r2(top / N),
      thumb: c.toDataURL('image/jpeg', 0.7),
    };
  }

  // report: { motion: { species: {...} }, picture: {...}, fps, free (the ecosystem runs: motion only warns), limits (a place's own, over LIMITS: a
  // dark place allows more black) }
  function grade(rep) {
    const L = Object.assign({}, LIMITS, rep.limits || {}),
      out = [],
      add = (level, what, value, limit) => out.push({ level, what, value, limit });
    const hard = rep.free ? 'warn' : 'fail'; // free: the ecosystem runs (World, the Hunt): darting and fleeing are meant, so motion only warns
    for (const [k, m] of Object.entries(rep.motion || {})) {
      if (!m.n) continue;
      if (m.turn95 > L.turn95) add(hard, k + ' turns sharply', m.turn95, L.turn95);
      if (m.bend95 > L.bend95) add(hard, k + ' folds its body', m.bend95, L.bend95);
      if (m.n >= 6 && m.align < L.align) add('warn', k + ' not facing together', m.align, L.align);
      if (m.n >= 12 && m.biggest > L.biggest) add('warn', k + ' all in one bundle', m.biggest, L.biggest);
    }
    const P = rep.picture;
    if (P) {
      if (P.black > Math.max(0.8, L.black)) add('fail', 'frame nearly all black', P.black, Math.max(0.8, L.black));
      else if (P.black > L.black) add('warn', 'frame mostly black', P.black, L.black);
      if (P.white > L.white) add('warn', 'frame washed out', P.white, L.white);
      if (P.flat > L.flat) add('fail', 'frame one flat colour', P.flat, L.flat);
    }
    if (rep.fps != null && rep.fps < L.fps) add(rep.fps < 20 ? 'fail' : 'warn', 'frame rate', rep.fps, L.fps);
    return out;
  }
  window.SceneMetrics = { motion, picture, grade, LIMITS };
})();
