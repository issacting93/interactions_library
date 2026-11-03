/*
 * Forge — terrain. A seeded height field under the round city, plus the numbers the
 * city needs from it per WFC cell.
 *
 *   Terrain.create(params) -> terrain
 *     params = { seed, relief 0..1, sea 0..1, tilt 0..1, angle (deg), scale (feature size),
 *                mound 0..1 (round cities sit on a rise: lifts the centre) }
 *     terrain.h(x, y) -> height 0..1 at city coordinates (x, y in CityWFC units, centre 0,0)
 *     terrain.grid: Float32Array N×N over [-EXTENT, EXTENT]², terrain.N, terrain.EXTENT
 *   Terrain.cellStats(terrain, cell) -> { mean, min, max, slope, flood }
 *       sampled over the cell's annular sector; flood is the fraction below sea level,
 *       slope the mean gradient magnitude (height per city unit).
 *   Terrain.contours(terrain, levels) -> [{ level, d }] SVG path data in city units
 *       (marching squares; segments, not joined loops — fine for drawing).
 *   Terrain.shade(terrain, ctx2d, size, palette) -> paints a hillshade into a canvas.
 *   Terrain.DEFAULTS
 *
 * "Coast tilt" leans the whole field one way, so a city gets a shore on one side
 * (the flood numbers then steer WFC weights and keep landmarks off wet plots).
 * Pure apart from shade(). Classic script; also loads under Node (module.exports).
 */
(function () {
  "use strict";
  const EXTENT = 18, N = 97;
  const DEFAULTS = { seed: 1, relief: 0.55, sea: 0.28, tilt: 0.35, angle: 210, scale: 9, mound: 0.3 };

  function hash2(seed) {
    return (ix, iy) => {
      let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
  }
  const fade = (t) => t * t * (3 - 2 * t);
  function valueNoise(seed) {
    const r = hash2(seed);
    return (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
      const a = r(ix, iy), b = r(ix + 1, iy), c = r(ix, iy + 1), d = r(ix + 1, iy + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }

  function create(params) {
    const P = { ...DEFAULTS, ...(params || {}) };
    const octaves = [0, 1, 2, 3, 4].map((o) => valueNoise((P.seed * 2654435761 + o * 97) >>> 0));
    const ang = (P.angle * Math.PI) / 180, dx = Math.cos(ang), dy = Math.sin(ang);
    const raw = (x, y) => {
      let v = 0, amp = 0.5, f = 1 / Math.max(P.scale, 0.5), norm = 0;
      for (const n of octaves) { v += amp * n(x * f + 31.7, y * f - 12.3); norm += amp; amp *= 0.5; f *= 2; }
      v /= norm;                                                // 0..1, mean ~0.5
      const lean = ((x * dx + y * dy) / EXTENT) * 0.5;          // -0.5..0.5 across the map
      const rise = (P.mound || 0) * Math.exp(-(x * x + y * y) / 110);
      return 0.5 + (v - 0.5) * (0.4 + 1.6 * P.relief) + lean * P.tilt + rise;
    };
    const grid = new Float32Array(N * N);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -EXTENT + (2 * EXTENT * i) / (N - 1), y = -EXTENT + (2 * EXTENT * j) / (N - 1);
      const v = raw(x, y); grid[j * N + i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    const span = hi - lo || 1;
    for (let k = 0; k < grid.length; k++) grid[k] = (grid[k] - lo) / span;
    const t = { params: P, grid, N, EXTENT, sea: P.sea };
    t.h = (x, y) => {
      const gx = ((x + EXTENT) / (2 * EXTENT)) * (N - 1), gy = ((y + EXTENT) / (2 * EXTENT)) * (N - 1);
      const i = Math.max(0, Math.min(N - 2, Math.floor(gx))), j = Math.max(0, Math.min(N - 2, Math.floor(gy)));
      const fx = Math.max(0, Math.min(1, gx - i)), fy = Math.max(0, Math.min(1, gy - j));
      const a = grid[j * N + i], b = grid[j * N + i + 1], c = grid[(j + 1) * N + i], d = grid[(j + 1) * N + i + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    return t;
  }

  function cellStats(t, cell) {
    const pts = [];
    const ra = cell.ring === 0 ? [0, cell.r1 * 0.5, cell.r1 * 0.9] : [cell.r0 + 0.15 * (cell.r1 - cell.r0), (cell.r0 + cell.r1) / 2, cell.r1 - 0.15 * (cell.r1 - cell.r0)];
    const aa = cell.ring === 0 ? [0, 1, 2, 3, 4, 5].map((k) => (k * Math.PI) / 3) : [0.15, 0.5, 0.85].map((f) => cell.a0 + f * (cell.a1 - cell.a0));
    for (const r of ra) for (const a of aa) pts.push([r * Math.cos(a), r * Math.sin(a)]);
    let sum = 0, mn = Infinity, mx = -Infinity, wet = 0, slope = 0;
    const e = 0.25;
    for (const [x, y] of pts) {
      const v = t.h(x, y); sum += v; mn = Math.min(mn, v); mx = Math.max(mx, v); if (v < t.sea) wet++;
      slope += Math.hypot(t.h(x + e, y) - t.h(x - e, y), t.h(x, y + e) - t.h(x, y - e)) / (2 * e);
    }
    return { mean: sum / pts.length, min: mn, max: mx, slope: slope / pts.length, flood: wet / pts.length };
  }

  // marching squares over the grid; returns path data per level in city units
  function contours(t, levels) {
    const { grid, N } = t, step = (2 * t.EXTENT) / (N - 1), X = (i) => -t.EXTENT + i * step;
    const out = [];
    for (const L of levels) {
      let d = "";
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
        const a = grid[j * N + i], b = grid[j * N + i + 1], c = grid[(j + 1) * N + i + 1], dd = grid[(j + 1) * N + i];
        const code = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (dd > L ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const lerp = (p, q) => (L - p) / (q - p || 1e-9);
        const top = [X(i) + step * lerp(a, b), X(j)], right = [X(i + 1), X(j) + step * lerp(b, c)];
        const bottom = [X(i) + step * lerp(dd, c), X(j + 1)], left = [X(i), X(j) + step * lerp(a, dd)];
        const segs = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bottom, right]],
          6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]], 9: [[top, bottom]], 10: [[top, right], [left, bottom]],
          11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
        }[code];
        for (const [p, q] of segs) d += `M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
      }
      out.push({ level: L, d });
    }
    return out;
  }

  // hillshade + water into a 2D context of size×size covering [-EXTENT, EXTENT]²
  function shade(t, ctx, size, pal) {
    pal = { land: [24, 28, 34], high: [52, 58, 66], water: [16, 34, 46], deep: [10, 20, 30], ...(pal || {}) };
    const img = ctx.createImageData(size, size), e = 0.3;
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = -t.EXTENT + ((px + 0.5) / size) * 2 * t.EXTENT, y = -t.EXTENT + ((py + 0.5) / size) * 2 * t.EXTENT;
      const v = t.h(x, y), k = (py * size + px) * 4;
      let rgb;
      if (v < t.sea) {
        const w = Math.min(1, (t.sea - v) / Math.max(t.sea, 0.05));
        rgb = pal.water.map((c, i) => c + (pal.deep[i] - c) * w);
      } else {
        const gx = (t.h(x + e, y) - t.h(x - e, y)) / (2 * e), gy = (t.h(x, y + e) - t.h(x, y - e)) / (2 * e);
        const light = Math.max(-1, Math.min(1, (-gx * 0.7 - gy * 0.7) * 6));   // light from the top-left
        const up = (v - t.sea) / Math.max(1 - t.sea, 0.05);
        rgb = pal.land.map((c, i) => c + (pal.high[i] - c) * up + light * 10);
      }
      img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  const Terrain = { create, cellStats, contours, shade, DEFAULTS, EXTENT, N };
  if (typeof window !== "undefined") window.Terrain = Terrain;
  if (typeof module !== "undefined") module.exports = Terrain;
})();
