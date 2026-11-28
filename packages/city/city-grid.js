/* packages/city/city-grid.js — a city on a GRID, the rectangular sibling of city-grammar.js's radial one.

   Square blocks stand on a regular pitch with chasms between them, joined by causeways: avenues along the
   two middle axes, and a scatter of lesser bridges. Blocks step down with distance from the middle
   (the same terrace heights as the radial city, so a host's towers and plants stand on the right level).
   Each block is a plaza (where a host stands a tower), a garden, or built: a small cluster of houses, now and
   then a single tall monolith. Pillars drop each block into the water. Same output as CityGrammarMesh.build, so
   a host swaps one for the other:

     CityGrid.build(seed, opts?) -> { ground, water, green, bldg: { positions, normals }, lines }
       opts: { pitch (3.2), block (2.4), n (blocks each way of the middle, 4), radius (15.2), levelStep (0.85),
               floorH (0.34), drop (4), reserve: [{ x, z, r }] (kept as plazas), groundY(r) -> level height,
               voids (0.08: share of blocks left out, never on an axis), gardens (0.12), monoliths (0.22) }

   City-local units, y up. Triangles are not indexed and carry flat normals. Classic script; no dependencies. */
(function () {
  "use strict";
  function rngOf(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function groundDefault(levelStep) { return (r) => (r <= 3.3 ? 3 : r <= 6.5 ? 2 : r <= 10.1 ? 1 : 0) * levelStep; }

  function build(seed, opts) {
    opts = opts || {};
    const R = rngOf(seed), P = opts.pitch || 3.2, B = opts.block || 2.4, N = opts.n != null ? opts.n : 4, RAD = opts.radius || 15.2;
    const step = opts.levelStep != null ? opts.levelStep : 0.85, FH = opts.floorH || 0.34, DROP = opts.drop || 4;
    const gY = opts.groundY || groundDefault(step), reserve = opts.reserve || [];
    const VOID = opts.voids != null ? opts.voids : 0.08, GARD = opts.gardens != null ? opts.gardens : 0.12, MONO = opts.monoliths != null ? opts.monoliths : 0.22;
    const out = { ground: { positions: [], normals: [] }, water: { positions: [], normals: [] }, green: { positions: [], normals: [] }, bldg: { positions: [], normals: [] }, lines: [] };

    // a quad (a, b, c, d in order) into a group, one flat normal
    function quad(g, a, b, c, d) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      for (const p of [a, b, c, a, c, d]) { g.positions.push(p[0], p[1], p[2]); g.normals.push(nx, ny, nz); }
    }
    const seg = (a, b) => out.lines.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    // a box; the top may be sloped (yt0 at x0, yt1 at x1). Faces wound to face out; no underside.
    function box(g, x0, z0, x1, z1, yb, yt0, yt1, lines, zs) {
      if (yt1 == null) yt1 = yt0;
      const a = [x0, yt0, z0], b = [x1, zs ? yt0 : yt1, z0], c = [x1, yt1, z1], d = [x0, zs ? yt1 : yt0, z1];
      quad(g, a, d, c, b);                                                                     // top (up)
      quad(g, [x0, yb, z0], [x1, yb, z0], b, a); quad(g, [x1, yb, z1], [x0, yb, z1], d, c);   // -z, +z sides
      quad(g, [x0, yb, z1], [x0, yb, z0], a, d); quad(g, [x1, yb, z0], [x1, yb, z1], c, b);   // -x, +x sides
      if (lines !== false) { seg(a, b); seg(b, c); seg(c, d); seg(d, a); seg([x0, yb, z0], a); seg([x1, yb, z0], b); seg([x1, yb, z1], c); seg([x0, yb, z1], d); seg([x0, yb, z0], [x1, yb, z0]); seg([x1, yb, z0], [x1, yb, z1]); seg([x1, yb, z1], [x0, yb, z1]); seg([x0, yb, z1], [x0, yb, z0]); }
    }

    const blocks = new Map(), key = (i, j) => i + ',' + j;
    for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
      const cx = i * P, cz = j * P, r = Math.hypot(cx, cz);
      if (r > RAD) continue;
      const axis = i === 0 || j === 0;
      if (!axis && R() < VOID) continue;                                                       // a gap in the city
      const plaza = reserve.some((q) => Math.hypot(cx - q.x, cz - q.z) < q.r + B * 0.72);
      const kind = plaza ? 'plaza' : R() < GARD ? 'garden' : 'built';
      blocks.set(key(i, j), { i, j, cx, cz, r, y: gY(r), kind });
    }

    for (const b of blocks.values()) {
      const h = B / 2, x0 = b.cx - h, x1 = b.cx + h, z0 = b.cz - h, z1 = b.cz + h;
      box(out.ground, x0, z0, x1, z1, b.y - 0.45, b.y);                                         // the slab
      const pw = B * 0.14;                                                                     // pillars: four down into the water
      for (const [px, pz] of [[x0 + B * 0.2, z0 + B * 0.2], [x1 - B * 0.2, z0 + B * 0.2], [x0 + B * 0.2, z1 - B * 0.2], [x1 - B * 0.2, z1 - B * 0.2]]) box(out.ground, px - pw, pz - pw, px + pw, pz + pw, b.y - DROP, b.y - 0.45, null, false);
      for (const [px, pz] of [[x0 + B * 0.2, z0 + B * 0.2], [x1 - B * 0.2, z1 - B * 0.2]]) { seg([px, b.y - 0.45, pz], [px, b.y - DROP, pz]); }
      if (b.kind === 'plaza') {                                                                 // open stone, posts at the corners
        for (const [px, pz] of [[x0 + 0.12, z0 + 0.12], [x1 - 0.12, z0 + 0.12], [x0 + 0.12, z1 - 0.12], [x1 - 0.12, z1 - 0.12]]) box(out.bldg, px - 0.05, pz - 0.05, px + 0.05, pz + 0.05, b.y, b.y + 0.4 + R() * 0.2);
      } else if (b.kind === 'garden') {
        box(out.green, x0 + 0.15, z0 + 0.15, x1 - 0.15, z1 - 0.15, b.y, b.y + 0.04, null, false);
        if (R() < 0.6) box(out.bldg, b.cx - 0.07, b.cz - 0.07, b.cx + 0.07, b.cz + 0.07, b.y, b.y + 0.9 + R() * 0.8);   // an obelisk
      } else if (R() < MONO) {                                                                  // one monolith: tall, slim, the block's landmark
        const w = B * (0.2 + R() * 0.1), ht = FH * (6 + R() * 5) * (b.r < 8 ? 1.2 : 1);
        box(out.bldg, b.cx - w, b.cz - w, b.cx + w, b.cz + w, b.y, b.y + ht);
        box(out.bldg, b.cx - w * 0.5, b.cz - w * 0.5, b.cx + w * 0.5, b.cz + w * 0.5, b.y + ht, b.y + ht + FH * 1.2);
        for (const [sx, sz] of [[-1, -1], [1, 1]]) box(out.bldg, b.cx + sx * B * 0.38 - 0.18, b.cz + sz * B * 0.38 - 0.18, b.cx + sx * B * 0.38 + 0.18, b.cz + sz * B * 0.38 + 0.18, b.y, b.y + FH * (1 + R() * 1.5));
      } else {                                                                                  // houses: a 2 x 2 cluster
        const m = 0.1, s = (B - m * 2 - 0.12) / 2;
        for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
          if (R() < 0.22) continue;
          const sx0 = x0 + m + a * (s + 0.12), sz0 = z0 + m + c * (s + 0.12), fl = 1 + Math.floor(R() * 3) + (b.r < 8 ? 1 : 0), ht = fl * FH;
          box(out.bldg, sx0, sz0, sx0 + s, sz0 + s, b.y, b.y + ht);
          if (R() < 0.3) box(out.bldg, sx0 + s * 0.35, sz0 + s * 0.35, sx0 + s * 0.65, sz0 + s * 0.65, b.y + ht, b.y + ht + FH * 0.9);   // a lantern room
        }
      }
    }

    // causeways: avenues along the middle axes always, the rest by chance
    for (const b of blocks.values()) for (const [di, dj] of [[1, 0], [0, 1]]) {
      const o = blocks.get(key(b.i + di, b.j + dj)); if (!o) continue;
      const avenue = di ? b.j === 0 : b.i === 0;
      if (!avenue && R() > 0.5) continue;
      const w = avenue ? 0.5 : 0.26, hB = B / 2;
      const ax = di ? b.cx + hB : b.cx - w, az = di ? b.cz - w : b.cz + hB, bx = di ? o.cx - hB : b.cx + w, bz = di ? b.cz + w : o.cz - hB;
      const y0 = b.y, y1 = o.y;
      box(out.ground, ax, az, bx, bz, Math.min(y0, y1) - 0.3, y0, y1, true, !di);
      if (avenue) for (const sgn of [-1, 1]) {                                                  // balustrade posts
        for (let k = 0; k < 3; k++) { const t = (k + 0.5) / 3; const px = di ? ax + (bx - ax) * t : (sgn < 0 ? ax : bx), pz = di ? (sgn < 0 ? az : bz) : az + (bz - az) * t; const py = y0 + (y1 - y0) * t; seg([px, py, pz], [px, py + 0.22, pz]); }
      }
    }
    return { ground: pack(out.ground), water: pack(out.water), green: pack(out.green), bldg: pack(out.bldg), lines: new Float32Array(out.lines), blocks: [...blocks.values()] };
  }
  function pack(g) { return { positions: new Float32Array(g.positions), normals: new Float32Array(g.normals) }; }
  window.CityGrid = { build };
})();
