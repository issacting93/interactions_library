/* INTERACTIONS — a generated place: terrain, towers, walls, and the ways through them.

   One seed makes the same place every time. Rolling hills outside, a flat keep in the middle with a ring of
   towers joined by curtain walls (each wall has a gate in it, a few have fallen), a taller tower at the centre,
   and a few ruined walls standing in the hills.

     const W = WorldGen.generate(seed, { size: 12 });
     W.H(x, z)            ground height
     W.ceil(x, z)         the highest thing a flyer must clear at a point: ground, tower roof, wall top
     W.surface            Surface.world(H, towers, { walls }): what a climber can grip (shared/engine/motion/surface.js)
     W.towers, W.walls    the specs, for drawing
     W.push(p, prev, r)   push a point out of the towers and walls (for creatures that cannot climb)
     W.nav                { free, see(x0, z0, x1, z1), near, path(x0, z0, x1, z1) -> [[x, z], ...], random(rand) }: how a creature that
                          cannot climb gets around: A* on a grid, with towers, walls and steep ground blocked

   Classic script -> window.WorldGen. Needs window.Surface for W.surface. */
(function () {
  "use strict";
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function noiseOf(seed) {
    const hash = (i, j) => { let h = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const v = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
      return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - w) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * w; };
    return (x, z) => v(x * 0.21, z * 0.21) * 0.62 + v(x * 0.47 + 9, z * 0.47 - 4) * 0.28 + v(x * 1.1 - 3, z * 1.1 + 7) * 0.1;
  }
  const segDist = (px, pz, x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz; let t = l2 ? ((px - x0) * dx + (pz - z0) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t)); };

  function generate(seed = 1, opts = {}) {
    const R = rng(seed), size = opts.size || 12, keepR = size * 0.42, N = noiseOf(seed);
    const H = (x, z) => {
      const d = Math.hypot(x, z), hills = (N(x, z) - 0.42) * 2.1, keep = sm(keepR * 0.9, keepR * 1.5, d), rim = Math.max(0, d - size * 0.78);
      return hills * keep + rim * rim * 0.22;
    };
    // ---- towers: a ring of them, and a taller one in the middle ----
    const towers = [], nRing = 5 + Math.floor(R() * 3), a0 = R() * Math.PI * 2;
    const profile = (r0, hs, top) => [[r0, -0.6], [r0, hs], [r0 * 1.32, hs + 0.12], [r0 * 1.32, hs + 0.42], [r0 * 1.0, hs + 0.54], [r0 * 1.0, top], [r0 * 1.22, top + 0.1], [r0 * 1.22, top + 0.32]];
    const mk = (x, z, r0, h) => { const hs = h * (0.55 + R() * 0.15); towers.push({ x, z, r: r0, top: h + 0.32, profile: profile(r0, hs, h) }); };
    for (let i = 0; i < nRing; i++) { const a = a0 + (i / nRing) * Math.PI * 2 + (R() - 0.5) * 0.25, d = keepR * (0.92 + R() * 0.16); mk(Math.cos(a) * d, Math.sin(a) * d, 0.8 + R() * 0.35, 3.2 + R() * 1.9); }
    mk(0, 0, 1.25, 6.2 + R() * 1.2);
    // ---- walls: ring towers joined in a curtain, a gate in each, a few fallen; some ruins out in the hills ----
    const walls = [], WT = 0.34, WH = 1.7, GATE = 1.9;
    const slab = (x0, z0, x1, z1) => walls.push({ x0, z0, x1, z1, t: WT, y0: Math.min(H(x0, z0), H(x1, z1)) - 0.8, y1: Math.max(H(x0, z0), H(x1, z1)) + WH });
    for (let i = 0; i < nRing; i++) {
      const A = towers[i], B = towers[(i + 1) % nRing]; if (R() < 0.18) continue;                    // a fallen stretch
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, s0 = A.r * 0.9, s1 = L - B.r * 0.9, mid = (s0 + s1) / 2 + (R() - 0.5) * 0.8;
      slab(A.x + ux * s0, A.z + uz * s0, A.x + ux * (mid - GATE / 2), A.z + uz * (mid - GATE / 2));   // either side of the gate
      slab(A.x + ux * (mid + GATE / 2), A.z + uz * (mid + GATE / 2), A.x + ux * s1, A.z + uz * s1);
    }
    for (let i = 0, n = 2 + Math.floor(R() * 3); i < n; i++) {   // ruins
      const a = R() * Math.PI * 2, d = keepR * (1.5 + R() * 0.7), x = Math.cos(a) * d, z = Math.sin(a) * d, b = R() * Math.PI, l = 2 + R() * 2.4;
      slab(x - Math.cos(b) * l / 2, z - Math.sin(b) * l / 2, x + Math.cos(b) * l / 2, z + Math.sin(b) * l / 2);
    }
    // ---- what a flyer must clear ----
    const ceil = (x, z) => {
      let c = H(x, z);
      for (const t of towers) { const d = Math.hypot(x - t.x, z - t.z); if (d < t.r * 1.5 + 1.6) c = Math.max(c, t.top * sm(t.r * 1.5 + 1.6, t.r * 1.2, d)); }
      for (const w of walls) { const d = segDist(x, z, w.x0, w.z0, w.x1, w.z1); if (d < w.t + 1.4) c = Math.max(c, w.y1 * sm(w.t + 1.4, w.t + 0.2, d)); }
      return c;
    };
    const surface = window.Surface ? window.Surface.world(H, towers, { walls }) : null;
    // ---- the grid a walker that cannot climb finds its way on ----
    const cs = 0.5, n = Math.ceil((size * 2) / cs), ox = -size, oz = -size, blocked = new Uint8Array(n * n), solid = new Uint8Array(n * n);
    const cell = (x, z) => [Math.floor((x - ox) / cs), Math.floor((z - oz) / cs)];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = ox + (i + 0.5) * cs, z = oz + (j + 0.5) * cs; let b = Math.hypot(x, z) > size * 0.86;
      let sd = false;
      for (const t of towers) if (Math.hypot(x - t.x, z - t.z) < t.r * 1.15) sd = true;
      for (const w of walls) if (segDist(x, z, w.x0, w.z0, w.x1, w.z1) < w.t + 0.1) sd = true;
      solid[j * n + i] = sd ? 1 : 0; if (sd) b = true;
      for (const t of towers) if (Math.hypot(x - t.x, z - t.z) < t.r * 1.32 + 0.5) b = true;
      for (const w of walls) if (segDist(x, z, w.x0, w.z0, w.x1, w.z1) < w.t + 0.55) b = true;
      const g = Math.hypot(H(x + 0.4, z) - H(x - 0.4, z), H(x, z + 0.4) - H(x, z - 0.4)) / 0.8; if (g > 0.8) b = true;
      blocked[j * n + i] = b ? 1 : 0;
    }
    const isB = (i, j) => i < 0 || j < 0 || i >= n || j >= n || blocked[j * n + i] === 1;
    const free = (x, z) => { const [i, j] = cell(x, z); return !isB(i, j); };
    const near = (x, z) => { const [i0, j0] = cell(x, z); if (!isB(i0, j0)) return [i0, j0]; for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && !isB(i0 + di, j0 + dj)) return [i0 + di, j0 + dj]; return null; };
    const los = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.ceil(d / (cs * 0.5)); for (let s = 0; s <= k; s++) { const t = s / k, [i, j] = cell(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (isB(i, j)) return false; } return true; };
    function path(x0, z0, x1, z1) {
      if (free(x0, z0) && free(x1, z1) && los([x0, z0], [x1, z1])) return [[x1, z1]];
      const s = near(x0, z0), g = near(x1, z1); if (!s || !g) return [[x1, z1]];
      const key = (i, j) => j * n + i, open = [[0, s[0], s[1]]], came = new Map([[key(s[0], s[1]), -1]]), cost = new Map([[key(s[0], s[1]), 0]]);
      let found = false;
      while (open.length) {
        let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
        const [, ci, cj] = open.splice(bi, 1)[0]; if (ci === g[0] && cj === g[1]) { found = true; break; }
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (isB(ni, nj) || (di && dj && (isB(ci + di, cj) || isB(ci, cj + dj)))) continue;
          const c = cost.get(key(ci, cj)) + (di && dj ? 1.414 : 1), k = key(ni, nj);
          if (!cost.has(k) || c < cost.get(k)) { cost.set(k, c); came.set(k, key(ci, cj)); open.push([c + Math.hypot(g[0] - ni, g[1] - nj), ni, nj]); }
        }
      }
      if (!found) return [[x1, z1]];
      const pts = []; for (let k = key(g[0], g[1]); k !== -1; k = came.get(k)) pts.push([ox + ((k % n) + 0.5) * cs, oz + (Math.floor(k / n) + 0.5) * cs]);
      pts.reverse();
      const out = []; let a = [x0, z0], i = 0;                                  // pull the string tight
      while (i < pts.length) { let j = pts.length - 1; while (j > i && !los(a, pts[j])) j--; out.push(pts[j]); a = pts[j]; i = j + 1; }
      return out;
    }
    // can one point see another along the ground: nothing solid (a tower, a wall) between them
    const see = (x0, z0, x1, z1) => { const d = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.ceil(d / (cs * 0.5))); for (let q = 1; q < k; q++) { const t = q / k; if (d * t < 0.7 || d * (1 - t) < 0.7) continue; const [i, j] = cell(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t); if (i >= 0 && j >= 0 && i < n && j < n && solid[j * n + i]) return false; } return true; };
    // a creature that cannot climb is pushed out of the solid things: p and prev move together, so it keeps its speed
    const push = (p, prev, r) => {
      for (const t of towers) { const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), m = t.r * 1.12 + r; if (d < m && d > 1e-6) { const k = (m - d) / d; p.x += dx * k; p.z += dz * k; prev.x += dx * k; prev.z += dz * k; } }
      for (const w of walls) {
        const ex = w.x1 - w.x0, ez = w.z1 - w.z0, l2 = ex * ex + ez * ez; let u = l2 ? ((p.x - w.x0) * ex + (p.z - w.z0) * ez) / l2 : 0; u = Math.max(0, Math.min(1, u));
        const qx = w.x0 + ex * u, qz = w.z0 + ez * u, dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz), m = w.t + r;
        if (d < m) { let nx = dx, nz = dz, k; if (d > 1e-6) k = (m - d) / d; else { nx = -ez; nz = ex; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; k = m; } p.x += nx * k; p.z += nz * k; prev.x += nx * k; prev.z += nz * k; }
      }
    };
    const random = (rnd, avoid) => { for (let k = 0; k < 60; k++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * size * 0.8, x = Math.cos(a) * d, z = Math.sin(a) * d; if (free(x, z) && (!avoid || Math.hypot(x - avoid[0], z - avoid[1]) > 3)) return [x, z]; } return [0, size * 0.5]; };
    return { seed, size, H, ceil, surface, towers, walls, push, nav: { free, path, random, see, near: (x, z) => { const c = near(x, z); return c ? [ox + (c[0] + 0.5) * cs, oz + (c[1] + 0.5) * cs] : [x, z]; } } };
  }
  window.WorldGen = { generate, rng };
})();
