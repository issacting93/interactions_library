/*
 * Forge — the Maw on a hex lattice. A study generator, after HexMech (hex-mech.js): the Maw's body plan
 * (ecology-maw.js: head with the mouth, neck rows, shoulders with a leg pair, back, haunch with a leg pair,
 * tail; a meal grows a neck row, a body row with legs, or tusks) laid on ONE pointy-top hex lattice, seen
 * from above and mirrored across the spine. Two dials:
 *
 *   rows     the grid size: how many lattice rows the hatchling is long (12 coarse ... 48 fine). The body is
 *            the same size in the world whatever the grid, so a finer grid means smaller cells.
 *   density  0..1, how much of the silhouette is built: 0 a spine with ribs, 0.5 solid plates, 1 every plate
 *            panelled and bolted.
 *
 *   MawHex.design({ rows, density, seed, grow: { reach, bulk, wide } }) -> D
 *       D.cells   [{ k, r, x, y, band, level, leg, tau }]   k = 2q + r, so x = s * sqrt(3)/2 * k, y = 1.5 s r
 *       D.s, D.len, D.half, D.bands, D.mouth { x, y, R }, D.teeth [[x, y, ...]], D.panels [[x, y, ...]] (with D.panelCell)
 *   MawHex.lines2d(D)          -> { ink: [x0, y0, x1, y1, ...], teeth: [...] }   the top view as segments
 *   MawHex.mesh(D, form)       -> { ink: Float32Array (xyz pairs), teeth: Float32Array, tris: Float32Array }
 *       form: "flat" (the drawing as it is), "relief" (plates stepped up toward the spine),
 *             "solid" (prisms with an underside, standing on legs with raised knees)
 *
 * Pure: no DOM. Classic script -> window.MawHex.
 */
(function () {
  "use strict";
  const S3 = Math.sqrt(3), { max, min, round, floor, abs, hypot, PI, cos, sin } = Math;
  const hash = (a, b, c) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const smooth = (a, b, x) => { const t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const HALF = 0.3;                       // shoulder half-width, in hatchling lengths

  // the body plan: bands head to tail. len in hatchling lengths; w(u) half-width as a share of the shoulders'
  function plan(g) {
    const B = [{ key: "head", len: 0.2 + 0.02 * g.wide, head: true }];
    for (let i = 0; i < 2; i++) B.push({ key: "neck", len: 0.085, w: () => 0.2 });
    for (let i = 0; i < g.reach; i++) B.push({ key: "neck+", len: 0.13, w: (u) => 0.24 + 0.5 * sin(PI * u) ** 3, grown: true });   // a grown neck row carries blades
    B.push({ key: "shoulders", len: 0.16, w: (u) => 0.78 + 0.22 * sin(PI * u), legs: "front" });
    B.push({ key: "back", len: 0.12, w: () => 0.6 });
    for (let i = 0; i < g.bulk; i++) B.push({ key: "row+", len: 0.15, w: (u) => 0.66 + 0.2 * sin(PI * u), legs: "extra", grown: true });
    B.push({ key: "haunch", len: 0.15, w: (u) => 0.7 + 0.16 * sin(PI * u), legs: "hind" });
    B.push({ key: "tail", len: 0.22, w: (u) => 0.4 * (1 - u) ** 1.4 + 0.05 });
    return B;
  }

  function design(o) {
    o = o || {};
    const N = o.rows || 20, d = o.density == null ? 0.55 : o.density, seed = o.seed || 1, g = Object.assign({ reach: 0, bulk: 0, wide: 0 }, o.grow || {});
    const s = 1 / (1.5 * N), kx = (s * S3) / 2, bands = plan(g), cells = new Map(), put = (k, r, c) => cells.set(k + "," + r, Object.assign({ k, r, x: k * kx, y: 1.5 * s * r }, c));
    const ribEvery = max(2, round(0.06 / (1.5 * s))), pKeep = smooth(0.18, 0.5, d), terrace = max(s * S3, 0.055);
    let r0 = 0, mouth = null;
    bands.forEach((b, bi) => {
      let rows = max(b.head ? 3 : 1, round(b.len * N)); b.i = bi;
      if (b.head) {   // a ring round the mouth: the hex rings about a centre cell (on an even row, so a cell sits on the spine there), the inner ones left out
        const h = rows >> 1, cr = h + (h & 1), cy = 1.5 * s * cr, R = h * S3 * s + 0.1 * s, hr = max(0.6 * s, min(R - 1.3 * s, max(0.055 + 0.02 * g.wide, R * 0.5)));
        let inner = 1e9;
        for (let r = cr - h; r <= cr + h; r++) for (let k = -4 * N; k <= 4 * N; k++) { if ((k - r) & 1) continue; const dd = hypot(k * kx, 1.5 * s * r - cy); if (dd <= R && dd > hr) { put(k, r, { band: bi, level: 1, rim: 0 }); inner = min(inner, dd); } }
        mouth = { x: 0, y: cy, R: inner - 0.82 * s, rim: R }; b.r0 = cr - h; rows = b.rows = 2 * h + 1; r0 = cr - h;
      } else { b.r0 = r0; b.rows = rows; for (let r = r0; r < r0 + rows; r++) {
        const u = (r - r0 + 0.5) / rows, hw = b.w(u) * HALF, kmax = max(r & 1 ? 1 : 0, floor(hw / kx + 1e-6)), km = kmax - ((kmax - r) & 1), rib = (r - r0) % ribEvery === 0 || rows < 2;
        for (let k = -km; k <= km; k += 2) { const a = abs(k);
          if (!(a <= 1 || rib || hash(a, r, seed) < pKeep)) continue;
          put(k, r, { band: bi, level: min(2, floor(((km - a) * kx) / terrace)), rim: km - a }); }
      } }
      r0 += rows;
    });
    // what is not joined to the spine falls away (a loose cell between two ribs)
    { const seen = new Set(), q = []; for (const [id, c] of cells) if (abs(c.k) <= 1) { seen.add(id); q.push(c); }
      while (q.length) { const c = q.pop(); for (const [dk, dr] of [[2, 0], [-2, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const id = (c.k + dk) + "," + (c.r + dr); if (cells.has(id) && !seen.has(id)) { seen.add(id); q.push(cells.get(id)); } } }
      for (const id of [...cells.keys()]) if (!seen.has(id)) cells.delete(id); }
    // legs: from the rim of a leg band, a thigh and a shin along lattice rays, mirrored; thicker on a fine grid
    const step = s * S3, thick = max(1, round(0.045 / step)), DIR = { front: [[1, -1], [1, 1]], extra: [[2, 0], [1, 1]], hind: [[1, 1], [1, -1]] };
    let legId = 0;
    for (const b of bands) { if (!b.legs) continue;
      const r = b.r0 + (b.rows >> 1); let km = 0; for (const c of cells.values()) if (c.r === r && c.band === b.i) km = max(km, c.k);
      const [d1, d2] = DIR[b.legs], n1 = max(1, round(0.17 / step)), n2 = max(1, round(0.23 / step)), tot = n1 + n2;
      for (const sx of [1, -1]) { let k = km, rr = r, n = 0; const id = legId++;
        for (const [dir, cnt, seg] of [[d1, n1, 0], [d2, n2, 1]]) for (let i = 0; i < cnt; i++) { k += dir[0]; rr += dir[1]; n++;
          for (let t = 0; t < thick; t++) { const kk = k + 2 * t, key = sx * kk + "," + rr; if (!cells.has(key)) put(sx * kk, rr, { band: 1000 + id * 2 + seg, level: 0, leg: b.legs, tau: n / tot, seg, foot: n === tot }); } } }
    }
    const list = [...cells.values()];
    // panels and bolts: an inset hex on a share of the plates, more as the density rises; mirrored by |k|
    const pPanel = smooth(0.42, 1, d) * 0.85, pBolt = smooth(0.75, 1, d) * 0.5, panels = [], panelCell = [];
    const hexAt = (x, y, R) => { const o2 = []; for (let i = 0; i <= 6; i++) { const a = (PI / 180) * (60 * i - 30); o2.push(x + R * cos(a), y + R * sin(a)); } return o2; };
    for (const c of list) { if (c.leg && !c.foot) continue; const h = hash(abs(c.k) + 7, c.r, seed + 3);
      if (h < pPanel) { panels.push(hexAt(c.x, c.y, s * 0.56)); panelCell.push(c); } else if (h > 1 - pBolt) { panels.push(hexAt(c.x, c.y, s * 0.2)); panelCell.push(c); } }
    // teeth: spikes from the mouth's rim toward its centre; tusks (wide) add more and longer ones
    const teeth = [], nT = 6 + 4 * g.wide, tl = mouth.R * (0.42 + 0.12 * g.wide);
    for (let i = 0; i < nT; i++) { const a = (i / nT) * 2 * PI + PI / nT, w = (PI / nT) * 0.45, R = mouth.R * 1.02;
      teeth.push([mouth.x + R * cos(a - w), mouth.y + R * sin(a - w), mouth.x + (R - tl) * cos(a), mouth.y + (R - tl) * sin(a), mouth.x + R * cos(a + w), mouth.y + R * sin(a + w)]); }
    let y1 = 0, xw = 0; for (const c of list) { y1 = max(y1, c.y); xw = max(xw, abs(c.x)); }
    return { rows: N, density: d, seed, grow: g, s, kx, bands, cells: list, index: cells, mouth, teeth, panels, panelCell, len: y1 + s, half: xw + s, terrace };
  }

  // every hex edge with who owns it: one owner is the outline; two owners of different band or level is a seam or a step
  function edges(D, all) {
    const E = new Map(), s = D.s, key = (x, y) => round((x / s) * 512) + ":" + round((y / s) * 512);
    for (const c of D.cells) { const P = []; for (let i = 0; i < 6; i++) { const a = (PI / 180) * (60 * i - 30); P.push([c.x + s * cos(a), c.y + s * sin(a)]); }
      for (let i = 0; i < 6; i++) { const a = P[i], b = P[(i + 1) % 6], ka = key(a[0], a[1]), kb = key(b[0], b[1]), id = ka < kb ? ka + "|" + kb : kb + "|" + ka, e = E.get(id);
        if (e) e.c2 = c; else E.set(id, { a, b, ka, kb, c1: c, c2: null }); } }
    for (const e of E.values()) e.seam = !e.c2 || e.c2.band !== e.c1.band || e.c2.level !== e.c1.level;
    return all ? [...E.values()] : [...E.values()].filter((e) => e.seam);
  }
  function lines2d(D) {
    const ink = []; for (const e of edges(D)) ink.push(e.a[0], e.a[1], e.b[0], e.b[1]);
    for (const p of D.panels) for (let i = 0; i + 3 < p.length; i += 2) ink.push(p[i], p[i + 1], p[i + 2], p[i + 3]);
    const teeth = []; for (const p of D.teeth) for (let i = 0; i + 3 < p.length; i += 2) teeth.push(p[i], p[i + 1], p[i + 2], p[i + 3]);
    return { ink, teeth };
  }

  // the same drawing with height. y is up; the body lies along z, head toward -z, centred
  function mesh(D, form) {
    const s = D.s, hB = form === "solid" ? 0.2 : 0, st = form === "flat" ? 0 : 0.028, under = 0.05, zc = D.len / 2;
    const top = (c) => { if (form === "flat") return 0; if (!c.leg) return hB + c.level * st + (form === "relief" ? 0 : 0);
      if (form === "relief") return 0; const t = c.tau; return t < 0.42 ? hB * (1 + 0.45 * (t / 0.42)) : hB * 1.45 * (1 - (t - 0.42) / 0.58) + 0.035; };
    const bot = (c) => (form !== "solid" ? top(c) : c.leg ? max(0, top(c) - 0.075) : hB - under);
    const ink = [], teeth = [], tris = [], L = (A, x0, y0, z0, x1, y1, z1) => A.push(x0, y0, z0 - zc, x1, y1, z1 - zc), seenV = new Set();
    const quad = (a, b, lo, hi) => { if (hi - lo < 1e-6) return; tris.push(a[0], lo, a[1] - zc, b[0], lo, b[1] - zc, b[0], hi, b[1] - zc, a[0], lo, a[1] - zc, b[0], hi, b[1] - zc, a[0], hi, a[1] - zc); };
    for (const e of edges(D, true)) { const t1 = top(e.c1), t2 = e.c2 ? top(e.c2) : -1, hi = max(t1, t2);
      if (!e.seam && abs(t1 - t2) < 1e-6) continue;   // inside one plate: no line (a leg's cells step down, so theirs are drawn)
      L(ink, e.a[0], hi, e.a[1], e.b[0], hi, e.b[1]);
      if (e.c2) { const lo = min(t1, t2); if (hi - lo > 1e-6) { L(ink, e.a[0], lo, e.a[1], e.b[0], lo, e.b[1]); quad(e.a, e.b, min(lo, max(bot(e.c1), bot(e.c2))), hi); } continue; }
      const lo = bot(e.c1); if (hi - lo < 1e-6) continue;
      L(ink, e.a[0], lo, e.a[1], e.b[0], lo, e.b[1]); quad(e.a, e.b, lo, hi);
      for (const [p, k] of [[e.a, e.ka], [e.b, e.kb]]) { if (seenV.has(k)) continue; seenV.add(k); L(ink, p[0], lo, p[1], p[0], hi, p[1]); } }
    for (const c of D.cells) { const y = top(c), yb = bot(c), P = []; for (let i = 0; i < 6; i++) { const a = (PI / 180) * (60 * i - 30); P.push([c.x + s * cos(a), c.y + s * sin(a) - zc]); }
      for (const [yy, on] of [[y, true], [yb, form === "solid"]]) if (on) for (let i = 1; i < 5; i++) tris.push(P[0][0], yy, P[0][1], P[i][0], yy, P[i][1], P[i + 1][0], yy, P[i + 1][1]); }
    D.panels.forEach((p, j) => { const y = top(D.panelCell[j]) + 0.0015; for (let i = 0; i + 3 < p.length; i += 2) L(ink, p[i], y, p[i + 1], p[i + 2], y, p[i + 3]); });
    const ym = form === "flat" ? 0 : hB + st + 0.002, yd = form === "flat" ? 0 : ym - (form === "solid" ? 0.06 : 0.03);
    for (const p of D.teeth) { L(teeth, p[0], ym, p[1], p[2], yd, p[3]); L(teeth, p[2], yd, p[3], p[4], ym, p[5]); }
    return { ink: new Float32Array(ink), teeth: new Float32Array(teeth), tris: new Float32Array(tris) };
  }

  window.MawHex = { design, lines2d, mesh, edges, HALF };
})();
