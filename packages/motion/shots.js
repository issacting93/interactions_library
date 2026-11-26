// packages/motion/shots.js -- window.Shots: the directed camera's shared parts. Forge Scenes (its takes), World Scene's places (their
// shot lists) and the machine garden's film mode (#film) each frame their own shots in their own space; what they share is here: where in
// a loop of shots a moment falls, the dip to dark at a cut, where the creatures are thickest, and easing a camera after a moving subject.
//
//   Shots.total(list)                     the loop's length: the shots' len (seconds) added up
//   Shots.at(list, t)                     the shot at t seconds into the loop: { i, shot, t (into it), v (0..1 through it), cut (seconds to
//                                         the nearer cut) }. The loop's own end counts as a cut, so a recording still loops
//   Shots.dip(cut, width, smooth)         0..1 dark across a cut: 1 at the cut, 0 by width seconds from it (smooth: a smoothstep, else linear)
//   Shots.cluster(points, at, n)          the middle of the n points nearest at ([x, y])
//   Shots.densest(points, cell)           the middle of the busiest cell (and its neighbours) of a grid laid over the points
//   Shots.chase(cur, want, k)             an angle in degrees eased toward another the short way round
//   Shots.lead(f, bl, max)                where a moving creature will be shortly: ahead of it by about half its length
(function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const total = (list) => (list || []).reduce((a, s) => a + (+s.len || 0), 0);
  function at(list, t) {
    const T = total(list); if (!T) return null;
    let tt = ((t % T) + T) % T, i = 0;
    while (i < list.length - 1 && tt >= list[i].len) { tt -= list[i].len; i++; }
    const s = list[i]; return { i, shot: s, t: tt, v: tt / s.len, cut: Math.min(tt, s.len - tt) };
  }
  const dip = (cut, width, isSmooth) => (isSmooth ? 1 - smooth(0, width, cut) : 1 - clamp(cut / width, 0, 1));

  function cluster(points, p, n) {
    const near = points.map((q) => [Math.hypot(q[0] - p[0], q[1] - p[1]), q[0], q[1]]).sort((a, b) => a[0] - b[0]);
    const m = Math.min(n || 6, near.length); if (!m) return null;
    let x = 0, y = 0; for (let i = 0; i < m; i++) { x += near[i][1]; y += near[i][2]; } return [x / m, y / m];
  }
  function densest(points, cell) {
    if (!points.length) return null; const G = new Map(), key = (i, j) => i + ',' + j;
    for (const q of points) { const k = key(Math.floor(q[0] / cell), Math.floor(q[1] / cell)); G.set(k, (G.get(k) || 0) + 1); }
    let best = null, bv = -1;
    for (const k of G.keys()) { const [i, j] = k.split(',').map(Number); let v = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) v += (G.get(key(i + a, j + b)) || 0) * (a || b ? 1 : 2); if (v > bv) { bv = v; best = [i, j]; } }
    let x = 0, y = 0, n = 0;
    for (const q of points) if (Math.abs(Math.floor(q[0] / cell) - best[0]) <= 1 && Math.abs(Math.floor(q[1] / cell) - best[1]) <= 1) { x += q[0]; y += q[1]; n++; }
    return [x / n, y / n];
  }
  const chase = (cur, want, k) => cur + ((((want - cur) % 360) + 540) % 360 - 180) * k;
  function lead(f, bl, max) {
    const spd = Math.hypot(f.vx || 0, f.vy || 0), t = Math.min(max ?? 0.5, bl * 0.45 / Math.max(1e-6, spd));
    return [f.x + (f.vx || 0) * t, f.y + (f.vy || 0) * t];
  }

  window.Shots = { total, at, dip, cluster, densest, chase, lead };
})();
