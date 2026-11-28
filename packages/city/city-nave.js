/* packages/city/city-nave.js — a ruined cathedral as a city layout: the third sibling of city-grammar.js (radial) and
   city-grid.js (grid). One building the size of a city, drawn as a plan a person would recognise:

     west front (twin towers, a portal, a rose window)  ->  the nave (two arcades of piers under pointed arches, a broken
     clerestory, ribs still spanning the open roof)  ->  the crossing (four great piers; the host stands its tallest
     tower here)  ->  the transepts  ->  the choir and a half-round apse with chapels.
     Outside: buttress piers and flying buttresses down both flanks, and a drowned town of gabled houses.

   The crossing is the origin; the nave runs toward -z, the apse toward +z. The floor is a plinth (height `plinth`) on
   the sea bed (y 0). Same output as CityGrid.build, so a host swaps one for the other, plus what a host needs to dress it:

     CityNave.build(seed, opts?) -> { ground, water, green, bldg: { positions, normals }, lines,
                                      sites: [{ x, z, h, role }]   where the host stands towers (west towers, chapels)
                                      lanterns: [{ x, y, z, r }]   warm lights (the rose, the crossing, the apse)
                                      rose: { x, y, z, r } }
       opts: { bays (5), bay (2.5: a bay's length), nave (3: half the nave's width), aisle (5.7: to the outer wall),
               pier (5.2: arcade height), clerestory (2.4), plinth (0.5), ruin (0.3: share of ribs, walls and buttresses
               fallen), town (16 houses), waterY (the water's height: roofs are built to break it) }
     CityNave.groundY(x, z, opts?) -> the floor height there (plinth inside the plan, 0 outside)
     CityNave.plan(opts?) -> the sites, lanterns and rose alone (no mesh)

   City-local units (the radial city's outer wall is at 15.3), y up. Triangles are not indexed, flat normals.
   Classic script; no dependencies. */
(function () {
  "use strict";
  function rngOf(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function dims(o) {
    o = o || {};
    const D = { bays: o.bays || 5, bay: o.bay || 2.5, nave: o.nave || 3, aisle: o.aisle || 5.7, pier: o.pier || 5.2, cler: o.clerestory != null ? o.clerestory : 2.4,
      PL: o.plinth != null ? o.plinth : 0.5, ruin: o.ruin != null ? o.ruin : 0.3, town: o.town != null ? o.town : 16, waterY: o.waterY != null ? o.waterY : 3 };
    D.X = D.nave + 0.6;                       // the crossing's half-width (its piers stand just outside the arcades' line)
    D.zW = -(D.X + D.bays * D.bay);           // the west wall
    D.zE = D.X + 2 * D.bay;                   // where the choir ends and the apse begins
    D.tr = D.aisle + 3.4;                     // the transept's reach
    D.wall = D.pier + D.cler;                 // the top of the nave wall
    return D;
  }
  function plan(o) {
    const D = dims(o), y = D.PL;
    const sites = [
      { x: -(D.aisle - 0.6), z: D.zW - 1.3, h: D.wall + 3.4, role: 'west' }, { x: D.aisle - 0.6, z: D.zW - 1.3, h: D.wall + 2.6, role: 'west' },
    ];
    for (const a of [-58, 0, 58]) { const r = D.aisle + 1.5, t = a * Math.PI / 180; sites.push({ x: Math.sin(t) * r, z: D.zE + Math.cos(t) * r, h: D.pier * 0.95, role: 'chapel' }); }
    const rose = { x: 0, y: y + D.pier + 0.9, z: D.zW, r: D.nave * 0.62 };
    const lanterns = [
      { x: 0, y: rose.y, z: D.zW + 0.6, r: 7 },                         // the rose window
      { x: 0, y: y + D.wall * 0.8, z: 0, r: 8 },                        // the crossing
      { x: 0, y: y + D.pier * 0.6, z: D.zE + D.aisle * 0.5, r: 6 },     // the high altar
      { x: 0, y: y + 1.2, z: D.zW * 0.5, r: 4.5 },                      // votives down the nave
    ];
    return { sites, lanterns, rose, dims: D };
  }
  function groundY(x, z, o) {
    const D = dims(o), ax = Math.abs(x);
    if (ax <= D.aisle + 0.5 && z >= D.zW - 2.4 && z <= D.zE) return D.PL;
    if (ax <= D.tr + 0.5 && Math.abs(z) <= D.X + 0.5) return D.PL;
    if (Math.hypot(x, z - D.zE) <= D.aisle + 2.6 && z >= D.zE) return D.PL;
    return 0;
  }

  function build(seed, opts) {
    const R = rngOf(seed), D = dims(opts), P = plan(opts), y0 = D.PL;
    const out = { ground: { positions: [], normals: [] }, water: { positions: [], normals: [] }, green: { positions: [], normals: [] }, bldg: { positions: [], normals: [] }, lines: [] };
    const seg = (a, b) => out.lines.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    function tri(g, a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1;
      for (const p of [a, b, c]) { g.positions.push(p[0], p[1], p[2]); g.normals.push(nx / L, ny / L, nz / L); }
    }
    const quad = (g, a, b, c, d) => { tri(g, a, b, c); tri(g, a, c, d); };
    // a box, axis-aligned; faces wound to face out, no underside
    function box(g, x0, z0, x1, z1, yb, yt, lines) {
      const a = [x0, yt, z0], b = [x1, yt, z0], c = [x1, yt, z1], d = [x0, yt, z1], e = [x0, yb, z0], f = [x1, yb, z0], h = [x1, yb, z1], i = [x0, yb, z1];
      quad(g, a, d, c, b); quad(g, e, f, b, a); quad(g, h, i, d, c); quad(g, i, e, a, d); quad(g, f, h, c, b);
      if (lines !== false) { seg(a, b); seg(b, c); seg(c, d); seg(d, a); seg(e, a); seg(f, b); seg(h, c); seg(i, d); }
    }
    // a prism on a regular polygon (a pier): n sides, radius r, from yb to yt, a flat top
    function prism(g, cx, cz, r, yb, yt, n, lines) {
      n = n || 8;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * 6.2831853 + 0.3927, a1 = ((k + 1) / n) * 6.2831853 + 0.3927;
        const p0 = [cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, 0, cz + Math.sin(a1) * r];
        quad(g, [p0[0], yb, p0[2]], [p0[0], yt, p0[2]], [p1[0], yt, p1[2]], [p1[0], yb, p1[2]]);
        tri(g, [cx, yt, cz], [p1[0], yt, p1[2]], [p0[0], yt, p0[2]]);
        if (lines !== false && k % 2 === 0) seg([p0[0], yb, p0[2]], [p0[0], yt, p0[2]]);
        if (lines !== false) seg([p0[0], yt, p0[2]], [p1[0], yt, p1[2]]);
      }
    }
    // a bar along a run of points: w across (along the unit vector W), t deep (in the points' own plane). An arch, a rib, a buttress.
    function bar(g, pts, W, w, t, lines) {
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
        // the in-plane perpendicular: W x direction
        let px = W[1] * dz - W[2] * dy, py = W[2] * dx - W[0] * dz, pz = W[0] * dy - W[1] * dx; const pl = Math.hypot(px, py, pz) || 1; px = px / pl * t / 2; py = py / pl * t / 2; pz = pz / pl * t / 2;
        const wx = W[0] * w / 2, wy = W[1] * w / 2, wz = W[2] * w / 2;
        const c = (p, sw, sp) => [p[0] + sw * wx + sp * px, p[1] + sw * wy + sp * py, p[2] + sw * wz + sp * pz];
        quad(g, c(a, -1, 1), c(b, -1, 1), c(b, 1, 1), c(a, 1, 1)); quad(g, c(a, 1, -1), c(b, 1, -1), c(b, -1, -1), c(a, -1, -1));
        quad(g, c(a, 1, 1), c(b, 1, 1), c(b, 1, -1), c(a, 1, -1)); quad(g, c(a, -1, -1), c(b, -1, -1), c(b, -1, 1), c(a, -1, 1));
        if (lines !== false) { seg(c(a, 1, -1), c(b, 1, -1)); seg(c(a, -1, -1), c(b, -1, -1)); }
        void L;
      }
    }
    // a pointed arch from a to b (two points at the springing, same height): rise as a share of the span (0.87: equilateral). `upto` (0..1) keeps
    // only so much of it from each side: a broken arch.
    function archPts(a, b, rise, upto, n) {
      n = n || 7; upto = upto == null ? 1 : upto;
      const span = Math.hypot(b[0] - a[0], b[2] - a[2]), h = span * rise, left = [], right = [];
      // each half is an arc centred on the other foot when rise is 0.87; in general, a quadratic through foot, shoulder, apex
      for (let k = 0; k <= n; k++) {
        const u = k / n; if (u > upto + 1e-6) break;
        const s = u * 0.5, lift = h * Math.sin(u * 1.5707963) * (0.72 + 0.28 * u);
        left.push([a[0] + (b[0] - a[0]) * s, a[1] + lift, a[2] + (b[2] - a[2]) * s]);
        right.push([b[0] + (a[0] - b[0]) * s, b[1] + lift, b[2] + (a[2] - b[2]) * s]);
      }
      return upto >= 1 ? [left.concat(right.reverse().slice(1))] : [left, right];
    }
    const arch = (g, a, b, rise, W, w, t, upto) => { for (const run of archPts(a, b, rise, upto)) if (run.length > 1) bar(g, run, W, w, t); };
    const AX = [1, 0, 0], AZ = [0, 0, 1];

    // ---- the plinth: a cross, a half-round east end, steps at the west door
    const drop = -0.6;
    box(out.ground, -D.aisle - 0.5, D.zW - 2.4, D.aisle + 0.5, D.zE, drop, y0);
    box(out.ground, -D.tr - 0.5, -D.X - 0.5, D.tr + 0.5, D.X + 0.5, drop, y0);
    { const r = D.aisle + 2.6, n = 14, c = [0, y0, D.zE];
      for (let k = 0; k < n; k++) { const a0 = (k / n) * Math.PI, a1 = ((k + 1) / n) * Math.PI, p0 = [Math.cos(a0) * r, y0, D.zE + Math.sin(a0) * r], p1 = [Math.cos(a1) * r, y0, D.zE + Math.sin(a1) * r];
        tri(out.ground, c, p1, p0); quad(out.ground, [p0[0], drop, p0[2]], [p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], drop, p1[2]]); seg(p0, p1); } }
    for (let k = 0; k < 3; k++) box(out.ground, -D.nave - 0.4 - k * 0.3, D.zW - 2.4 - (k + 1) * 0.45, D.nave + 0.4 + k * 0.3, D.zW - 2.4 - k * 0.45, drop, y0 - (k + 1) * 0.14);
    // the nave's paving: a paler runner down the middle (the water group is the palest tone), the labyrinth's line at the crossing
    box(out.water, -0.7, D.zW + 0.6, 0.7, -D.X, y0, y0 + 0.02, false);
    for (let k = 0; k < 3; k++) { const r = 1 + k * 0.7, n = 28; for (let i = 0; i < n; i++) { const a0 = (i / n) * 6.2831853, a1 = ((i + 1) / n) * 6.2831853; seg([Math.cos(a0) * r, y0 + 0.03, Math.sin(a0) * r], [Math.cos(a1) * r, y0 + 0.03, Math.sin(a1) * r]); } }

    // ---- the arcades: piers, arches between them, the clerestory over, ribs across the nave
    const zs = []; for (let k = 0; k <= D.bays; k++) zs.push(-D.X - k * D.bay);        // pier lines, from the crossing west
    const ySpring = y0 + D.pier * 0.64, yCl = y0 + D.pier + 0.25, yTop = y0 + D.wall;
    for (const sx of [-1, 1]) {
      const x = sx * D.nave;
      for (let k = 1; k <= D.bays; k++) {
        const z = zs[k];
        prism(out.bldg, x, z, 0.46, y0, ySpring, 8); box(out.bldg, x - 0.58, z - 0.58, x + 0.58, z + 0.58, ySpring, ySpring + 0.22);   // pier and capital
        box(out.bldg, x - 0.62, z - 0.62, x + 0.62, z + 0.62, y0, y0 + 0.3, false);                                                   // its base
      }
      for (let k = 0; k < D.bays; k++) {
        const za = zs[k] - (k === 0 ? 0.3 : 0), zb = zs[k + 1], fallen = k > 0 && R() < D.ruin * 0.5;
        arch(out.bldg, [x, ySpring + 0.2, za], [x, ySpring + 0.2, zb], 0.62, AX, 0.6, 0.26, fallen ? 0.45 : 1);
        if (fallen) continue;
        // the wall over the arch, and the clerestory: two mullions and a lintel a bay, some of it down
        box(out.bldg, x - 0.3, zb, x + 0.3, za, y0 + D.pier, yCl);
        const keep = R() > D.ruin * 0.8, hi = keep ? yTop : yCl + D.cler * (0.25 + R() * 0.4);
        box(out.bldg, x - 0.26, zb - 0.22, x + 0.26, zb + 0.22, yCl, hi);
        if (keep) { box(out.bldg, x - 0.2, (za + zb) / 2 - 0.1, x + 0.2, (za + zb) / 2 + 0.1, yCl, yTop - 0.3); box(out.bldg, x - 0.3, zb, x + 0.3, za, yTop - 0.3, yTop);
          arch(out.bldg, [x, yCl + D.cler * 0.4, zb + 0.22], [x, yCl + D.cler * 0.4, (za + zb) / 2 - 0.1], 0.8, AX, 0.3, 0.12);
          arch(out.bldg, [x, yCl + D.cler * 0.4, (za + zb) / 2 + 0.1], [x, yCl + D.cler * 0.4, za - 0.22], 0.8, AX, 0.3, 0.12); }
      }
    }
    for (let k = 1; k <= D.bays; k++) {                                                     // the ribs over the open nave
      const z = zs[k], u = R();
      arch(out.bldg, [-D.nave, yTop - 0.4, z], [D.nave, yTop - 0.4, z], 0.6, AZ, 0.36, 0.24, u < D.ruin ? 0.3 + R() * 0.35 : 1);
    }

    // ---- the aisles' outer walls: buttress piers, a sill wall, lancets, flying buttresses up to the clerestory
    const yAis = y0 + D.pier * 0.72;
    for (const sx of [-1, 1]) {
      const x = sx * D.aisle;
      for (let k = 1; k <= D.bays; k++) {
        const z = zs[k], bx = x + sx * 0.55, gone = R() < D.ruin * 0.6;
        box(out.bldg, Math.min(x - 0.3, bx + sx * 0.45), z - 0.34, Math.max(x + 0.3, bx + sx * 0.45), z + 0.34, drop, gone ? y0 + 1 + R() * 1.6 : yAis + 1.5);   // the buttress pier
        if (!gone) {
          box(out.bldg, bx - 0.2, z - 0.2, bx + 0.2, z + 0.2, yAis + 1.5, yAis + 2.5);                                    // its pinnacle
          const a = [bx, yAis + 1.2, z], b = [sx * (D.nave + 0.3), yTop - 0.9, z], n = 6, pts = [];
          for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.5, z]); }
          bar(out.bldg, pts, AZ, 0.3, 0.3);                                                                              // the flyer
        }
      }
      for (let k = 0; k < D.bays; k++) {
        const za = zs[k] - (k === 0 ? 0.6 : 0), zb = zs[k + 1], broke = R() < D.ruin;
        box(out.bldg, x - 0.22, zb, x + 0.22, za, y0, y0 + (broke ? 0.5 + R() * 0.8 : 1.3));                             // the sill wall
        if (!broke) { arch(out.bldg, [x, y0 + 1.3 + D.pier * 0.3, zb + 0.34], [x, y0 + 1.3 + D.pier * 0.3, za - 0.34], 0.75, AX, 0.4, 0.2); box(out.bldg, x - 0.12, (za + zb) / 2 - 0.08, x + 0.12, (za + zb) / 2 + 0.08, y0 + 1.3, y0 + 1.3 + D.pier * 0.42, false); }
      }
    }

    // ---- the crossing: four great piers, the four arches that carried the tower
    const yX = y0 + D.wall - 0.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { prism(out.bldg, sx * D.X, sz * D.X, 0.85, y0, yX, 8); box(out.bldg, sx * D.X - 1, sz * D.X - 1, sx * D.X + 1, sz * D.X + 1, y0, y0 + 0.4, false); box(out.bldg, sx * D.X - 0.98, sz * D.X - 0.98, sx * D.X + 0.98, sz * D.X + 0.98, yX, yX + 0.3); }
    for (const s of [-1, 1]) {
      arch(out.bldg, [-D.X, yX + 0.3, s * D.X], [D.X, yX + 0.3, s * D.X], 0.55, AZ, 0.8, 0.36, s > 0 && R() < D.ruin ? 0.4 : 1);
      arch(out.bldg, [s * D.X, yX + 0.3, -D.X], [s * D.X, yX + 0.3, D.X], 0.55, AX, 0.8, 0.36);
    }

    // ---- the transepts: an end wall each with a tall lancet, low side walls
    for (const sx of [-1, 1]) {
      const x = sx * D.tr, w = D.X;
      box(out.bldg, x - 0.3, -w - 0.3, x + 0.3, -w * 0.45, y0, yTop - 1); box(out.bldg, x - 0.3, w * 0.45, x + 0.3, w + 0.3, y0, yTop - 1 - (R() < D.ruin ? 2.5 : 0));
      box(out.bldg, x - 0.3, -w * 0.45, x + 0.3, w * 0.45, y0, y0 + 1.4);
      arch(out.bldg, [x, yTop - 2.6, -w * 0.45], [x, yTop - 2.6, w * 0.45], 0.8, AX, 0.6, 0.3);
      for (const sz of [-1, 1]) box(out.bldg, Math.min(sx * (D.aisle + 0.3), x), sz * (w + 0.3) - 0.22, Math.max(sx * (D.aisle + 0.3), x), sz * (w + 0.3) + 0.22, y0, y0 + 1.2 + R() * 2.2);
    }

    // ---- the choir and the apse: two bays of arcade, then a half-ring of piers under arches
    for (const sx of [-1, 1]) for (let k = 1; k <= 2; k++) {
      const x = sx * D.nave, z = D.X + k * D.bay, zp = D.X + (k - 1) * D.bay + (k === 1 ? 0.3 : 0);
      if (k < 2) { prism(out.bldg, x, z, 0.46, y0, ySpring, 8); box(out.bldg, x - 0.58, z - 0.58, x + 0.58, z + 0.58, ySpring, ySpring + 0.22); }
      arch(out.bldg, [x, ySpring + 0.2, zp], [x, ySpring + 0.2, z], 0.62, AX, 0.6, 0.26);
      box(out.bldg, x - 0.3, zp, x + 0.3, z, y0 + D.pier, yCl + (R() < D.ruin ? 0.2 : D.cler * 0.6));
    }
    { const n = 6, r = D.nave, pts = [];
      for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI; pts.push([Math.cos(a) * r, Math.sin(a) * r + D.zE]); }
      for (let k = 0; k <= n; k++) { const [x, z] = pts[k]; prism(out.bldg, x, z, 0.4, y0, ySpring + 0.4, 8); box(out.bldg, x - 0.5, z - 0.5, x + 0.5, z + 0.5, ySpring + 0.4, ySpring + 0.6); }
      for (let k = 0; k < n; k++) { const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), W = [-dz / L, 0, dx / L];
        arch(out.bldg, [a[0], ySpring + 0.6, a[1]], [b[0], ySpring + 0.6, b[1]], 0.85, W, 0.6, 0.3, R() < D.ruin * 0.5 ? 0.5 : 1); }
      // the altar: three steps and a block, a pale top
      for (let k = 0; k < 3; k++) box(out.ground, -1.6 + k * 0.3, D.zE - 0.4 + k * 0.3, 1.6 - k * 0.3, D.zE + 2 - k * 0.3, y0, y0 + (k + 1) * 0.16);
      box(out.bldg, -0.8, D.zE + 0.5, 0.8, D.zE + 1.2, y0 + 0.48, y0 + 1.25); box(out.water, -0.86, D.zE + 0.44, 0.86, D.zE + 1.26, y0 + 1.25, y0 + 1.32);
      // the ambulatory's outer wall, low and broken
      const ro = D.aisle + 0.2, m = 10;
      for (let k = 0; k < m; k++) { if (R() < D.ruin * 0.7) continue; const a0 = (k / m) * Math.PI, a1 = ((k + 0.82) / m) * Math.PI, h = y0 + 1 + R() * 2.4;
        const p0 = [Math.cos(a0) * ro, D.zE + Math.sin(a0) * ro], p1 = [Math.cos(a1) * ro, D.zE + Math.sin(a1) * ro];
        bar(out.bldg, [[p0[0], (y0 + h) / 2, p0[1]], [p1[0], (y0 + h) / 2, p1[1]]], [0, 1, 0], h - y0, 0.4); }
    }

    // ---- the west front: the wall between the towers, the portal, the rose
    { const z = D.zW, w = D.aisle - 2.2, rz = P.rose, top = y0 + D.wall + 1.2;
      box(out.bldg, -w, z - 0.35, -1.3, z + 0.35, y0, top); box(out.bldg, 1.3, z - 0.35, w, z + 0.35, y0, top);          // either side of the door
      box(out.bldg, -1.3, z - 0.35, 1.3, z + 0.35, y0 + 3.3, rz.y - rz.r - 0.25);                                      // over the door, under the rose
      box(out.bldg, -1.3, z - 0.35, -rz.r - 0.2, z + 0.35, rz.y - rz.r - 0.25, top); box(out.bldg, rz.r + 0.2, z - 0.35, 1.3, z + 0.35, rz.y - rz.r - 0.25, top);
      box(out.bldg, -rz.r - 0.2, z - 0.35, rz.r + 0.2, z + 0.35, rz.y + rz.r + 0.2, top);                                // over the rose
      arch(out.bldg, [-1.3, y0 + 2.2, z], [1.3, y0 + 2.2, z], 0.8, AZ, 0.9, 0.3);                                       // the portal's arch
      { const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([-w + 2 * w * t, top + (1 - Math.abs(t * 2 - 1)) * 2.2, z]); } bar(out.bldg, pts, AZ, 0.6, 0.35); }   // the gable
      // the rose: a pale disc (glass) and its tracery in lines and thin stone: a rim, twelve spokes, a ring of petals, an eye
      const n = 24, r = rz.r;
      for (const dz of [-0.06, 0.06]) for (let k = 0; k < n; k++) { const a0 = (k / n) * 6.2831853, a1 = ((k + 1) / n) * 6.2831853, c = [0, rz.y, z + dz], p0 = [Math.cos(a0) * r, rz.y + Math.sin(a0) * r, z + dz], p1 = [Math.cos(a1) * r, rz.y + Math.sin(a1) * r, z + dz];
        if (dz < 0) tri(out.water, c, p0, p1); else tri(out.water, c, p1, p0); }
      for (const dz of [-0.1, 0.1]) {
        const ring = (rr, m) => { for (let k = 0; k < m; k++) { const a0 = (k / m) * 6.2831853, a1 = ((k + 1) / m) * 6.2831853; seg([Math.cos(a0) * rr, rz.y + Math.sin(a0) * rr, z + dz], [Math.cos(a1) * rr, rz.y + Math.sin(a1) * rr, z + dz]); } };
        ring(r, 36); ring(r * 0.62, 30); ring(r * 0.22, 16);
        for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.2831853; seg([Math.cos(a) * r * 0.22, rz.y + Math.sin(a) * r * 0.22, z + dz], [Math.cos(a) * r, rz.y + Math.sin(a) * r, z + dz]);
          const am = a + 6.2831853 / 24, pr = r * 0.81, cr = r * 0.17; for (let i = 0; i < 10; i++) { const b0 = (i / 10) * 6.2831853, b1 = ((i + 1) / 10) * 6.2831853;
            seg([Math.cos(am) * pr + Math.cos(b0) * cr, rz.y + Math.sin(am) * pr + Math.sin(b0) * cr, z + dz], [Math.cos(am) * pr + Math.cos(b1) * cr, rz.y + Math.sin(am) * pr + Math.sin(b1) * cr, z + dz]); } }
      }
      for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.2831853; bar(out.bldg, [[Math.cos(a) * r * 0.24, rz.y + Math.sin(a) * r * 0.24, z], [Math.cos(a) * r, rz.y + Math.sin(a) * r, z]], AZ, 0.14, 0.07, false); }
      { const pts = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * 6.2831853; pts.push([Math.cos(a) * (r + 0.1), rz.y + Math.sin(a) * (r + 0.1), z]); } bar(out.bldg, pts, AZ, 0.8, 0.22, false); }
      // the towers' own stumps: the host stands a forge tower on each
      for (const s of P.sites) if (s.role === 'west') box(out.ground, s.x - 1.5, s.z - 1.5, s.x + 1.5, s.z + 1.5, drop, y0 + 0.25);
    }
    for (const s of P.sites) if (s.role === 'chapel') prism(out.ground, s.x, s.z, 1.5, drop, y0 + 0.2, 10);

    // ---- the drowned town: gabled houses round the cathedral, their ridges just breaking the water
    for (let k = 0, tries = 0; k < D.town && tries < 400; tries++) {
      const a = R() * 6.2831853, r = 9.5 + R() * 5.6, x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r - 1.5;
      if (groundY(x * 0.86, z * 0.86, opts) > 0 || groundY(x, z, opts) > 0 || Math.abs(x) < D.nave + 1 && z < D.zW) continue;   // not on the plinth, not in front of the door
      k++;
      const w = 0.7 + R() * 0.5, l = 1 + R() * 0.9, along = R() < 0.5, hx = along ? l : w, hz = along ? w : l;
      const eave = D.waterY - 0.9 + R() * 1.1, ridge = eave + 0.7 + R() * 0.5;
      box(out.bldg, x - hx, z - hz, x + hx, z + hz, 0, eave, false);
      const g = out.bldg, A = [x - hx, eave, z - hz], B = [x + hx, eave, z - hz], C = [x + hx, eave, z + hz], E = [x - hx, eave, z + hz];
      if (along) { const r0 = [x - hx, ridge, z], r1 = [x + hx, ridge, z]; quad(g, A, r0, r1, B); quad(g, C, r1, r0, E); tri(g, A, E, r0); tri(g, B, r1, C); seg(r0, r1); seg(A, r0); seg(E, r0); seg(B, r1); seg(C, r1); }
      else { const r0 = [x, ridge, z - hz], r1 = [x, ridge, z + hz]; quad(g, A, E, r1, r0); quad(g, B, r0, r1, C); tri(g, A, r0, B); tri(g, E, C, r1); seg(r0, r1); seg(A, r0); seg(B, r0); seg(E, r1); seg(C, r1); }
      seg(A, B); seg(B, C); seg(C, E); seg(E, A);
      if (R() < 0.35) box(out.bldg, x - 0.12, z - 0.12, x + 0.12, z + 0.12, eave, ridge + 0.5, false);                  // a chimney
    }
    return { ground: pack(out.ground), water: pack(out.water), green: pack(out.green), bldg: pack(out.bldg), lines: new Float32Array(out.lines), sites: P.sites, lanterns: P.lanterns, rose: P.rose };
  }
  function pack(g) { return { positions: new Float32Array(g.positions), normals: new Float32Array(g.normals) }; }
  window.CityNave = { build, plan, groundY };
})();
