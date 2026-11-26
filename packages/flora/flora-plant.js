// packages/flora/flora-plant.js -- window.FloraPlant: what grows where. The planting shared by Forge Scenes (world/forges/scenes) and
// World Scene's places (world/scenes/world-scene/place-flora.js): the profiles (which recipes, how tall, how likely at a spot), the scatter
// over the ground, and Overgrowth (plants on a machine's or tower's ledges, growing in from the ground to the top).
//
// It knows nothing of either page's coordinates: it works in Forge Scenes' world units (y up; a koi is 0.62 long) and hands each plant to
// the page's own add(role, key, x, z, h, o), which makes the FloraGPU record (size, height on the ground, tint) in the page's own space.
//
//   FloraPlant.def(key, seed)                       a grown recipe (FloraGrow.grow), cached by key and seed
//   FloraPlant.scatter(prof, env)                   trees, then the layers, over a disc
//       env: { add, rnd, cx, cz, R, H(x, z) (the ground's height, 0), level (the water's, -99), water: { x, z, r } (for wet),
//              clear(x, z, pad) (false where a tower or wall stands), avoid(x, z, pad), focus: [[x, z, r]], edge(x, z) (0..1, 0) }
//       a layer's w(g, k, wet, depth, x, z, edge): its chance at a spot. g, k: two slow noise fields 0..1; depth: under the water (> 0)
//   FloraPlant.ledges(meshes, env)                  Overgrowth: where a face looks up
//       meshes: [{ P, N, I, at(lx, ly, lz) -> [x, y, z] }] (local positions, normals (y up), indices; at() to world units)
//       env: { add, rnd, base (the ground's y), top (how high it climbs, 12), budget (faces a mesh, 1100), keep (0.55) }
//       add gets o = { y, up (0..1 from base to top), delay, sway, over: true }
//   FloraPlant.PROFILES, FloraPlant.L(role, keys, h, w, o), FloraPlant.hash / vn / fbm
(function () {
  'use strict';
  const TAU = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
  const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, z, s) => {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    return (hash(i, j, s) * (1 - u) + hash(i + 1, j, s) * u) * (1 - w) + (hash(i, j + 1, s) * (1 - u) + hash(i + 1, j + 1, s) * u) * w;
  };
  const fbm = (x, z, s) => vn(x, z, s) * 0.55 + vn(x * 2.1 + 5, z * 2.1 - 3, s + 1) * 0.3 + vn(x * 4.3 - 2, z * 4.3 + 7, s + 2) * 0.15;

  const DEFS = new Map();
  function def(key, seed) {
    const id = key + '|' + seed; if (DEFS.has(id)) return DEFS.get(id);
    const G = window.FloraGrow, b = G && G.PRESETS.find((p) => p.key === key); if (!b) return null;
    const r = JSON.parse(JSON.stringify(b)); r.key = key + '-s' + seed; r.seed = seed;
    let d = null; try { d = G.grow(r); } catch (e) { d = null; }
    DEFS.set(id, d); return d;
  }

  // a layer: role (which colour pair a plant takes), recipes, height range, and its chance at a spot.
  // o: float (on the water), wet (may grow in the shallows), sway (how much it moves)
  const L = (role, keys, h, w, o) => Object.assign({ role, keys, h, w }, o || {});

  const PROFILES = {
    // ---- Forge Scenes' places: on the ground round a pond (depth: how far under the water a spot is)
    meadow: { R: 34, cell: 0.6, trees: { cell: 4.2, at: 0.6, kinds: [['grown-oak', 6, 9], ['wood-tree', 5, 8], ['grown-willow', 6, 8]] },
      layers: [L('reed', ['grown-horsetail', 'grown-grass'], [0.9, 1.5], (g, k, wet, d) => (d > -0.25 && d < 0.15 ? 0.85 : 0), { wet: true }),
        L('lily', ['clump-round'], [0.16, 0.24], (g, k, wet, d) => (d > 0.25 && d < 1.0 && k > 0.55 ? 0.22 : 0), { float: true, sway: 0.2 }),
        L('fern', ['clump-fern', 'grown-swordfern'], [0.6, 1.1], (g, k, wet) => (wet > 0.3 && k > 0.45 ? 0.6 : k > 0.7 ? 0.3 : 0)),
        L('flower', ['clump-flower'], [0.32, 0.5], (g, k) => (k > 0.62 ? 0.5 : 0)),
        L('grass', ['grown-grass'], [0.5, 0.95], (g, k) => (g > 0.5 ? 0.75 : 0.25)),
        L('turf', ['grown-turf', 'clump-clover'], [0.22, 0.38], (g) => 0.6 + g * 0.3)] },
    autumn: { R: 30, cell: 0.75, trees: { cell: 3.4, at: 0.36, kinds: [['grown-oak', 6, 9.5], ['wood-tree', 5, 8], ['wood-sapling', 2.5, 4], ['grown-umbrella', 4, 6]] },
      layers: [L('reed', ['grown-grass'], [0.7, 1.1], (g, k, wet, d) => (d > -0.25 && d < 0.1 ? 0.7 : 0)),
        L('shrub', ['wood-shrub', 'clump-berry'], [0.6, 1.2], (g, k) => (k > 0.6 ? 0.45 : 0)),
        L('litter', ['wood-litter'], [0.12, 0.2], (g, k) => (g > 0.45 ? 0.7 : 0.3)),
        L('fern', ['clump-fern'], [0.5, 0.9], (g, k) => (k < 0.35 ? 0.4 : 0)),
        L('grass', ['grown-grass', 'grown-turf'], [0.4, 0.8], (g) => 0.45)] },
    winter: { R: 30, cell: 0.9, trees: { cell: 4.6, at: 0.55, kinds: [['grown-pine', 6, 10], ['grown-cypress', 5, 8]] },
      layers: [L('grass', ['grown-grass'], [0.4, 0.8], (g, k) => (g > 0.5 ? 0.45 : 0.12)),
        L('reed', ['grown-horsetail'], [0.6, 1.0], (g, k, wet, d) => (d > -0.25 && d < 0.1 ? 0.6 : 0))] },
    dusk: { R: 34, cell: 0.62, trees: { cell: 6, at: 0.66, kinds: [['grown-cypress', 6, 10], ['grown-pine', 6, 9]] },
      layers: [L('grass', ['grown-grass'], [0.7, 1.25], (g) => (g > 0.5 ? 0.5 : 0.15)), L('flower', ['clump-flower'], [0.4, 0.55], (g, k) => (k > 0.7 ? 0.4 : 0)),
        L('turf', ['grown-turf'], [0.25, 0.4], () => 0.4)] },
    deep: { R: 30, cell: 0.9, trees: { cell: 3.6, at: 0.5, kinds: [['grown-bamboo', 4, 7], ['grown-horsetail', 3, 5]] },
      layers: [L('kelp', ['grown-horsetail', 'grown-bamboo'], [1.6, 3.6], (g, k) => (k > 0.6 ? 0.4 : 0.03), { sway: 3 }),
        L('shrub', ['clump-round', 'clump-berry'], [0.4, 0.8], (g, k) => (k < 0.25 ? 0.25 : 0), { sway: 2 }),
        L('fern', ['grown-swordfern', 'clump-fern'], [0.6, 1.2], (g) => (g > 0.55 ? 0.4 : 0), { sway: 2.4 }),
        L('turf', ['grown-turf'], [0.2, 0.32], () => 0.35, { sway: 2 })] },
    lawn: { R: 32, cell: 0.7, trees: { cell: 5.5, at: 0.62, kinds: [['grown-oak', 6, 9], ['wood-tree', 5, 8]] },
      layers: [L('flower', ['clump-flower'], [0.2, 0.32], (g, k) => (k > 0.62 ? 0.5 : 0)), L('turf', ['grown-turf', 'clump-clover'], [0.14, 0.26], (g) => 0.7),
        L('grass', ['grown-grass'], [0.25, 0.45], (g) => (g > 0.6 ? 0.3 : 0.05))] },
    seasons: { R: 32, cell: 0.62, trees: { cell: 3.8, at: 0.5, kinds: [['grown-oak', 6, 9], ['wood-tree', 5, 8]] },
      layers: [L('reed', ['grown-horsetail', 'grown-grass'], [0.9, 1.4], (g, k, wet, d) => (d > -0.25 && d < 0.12 ? 0.8 : 0)),
        L('flower', ['clump-flower'], [0.32, 0.5], (g, k) => (k > 0.6 ? 0.6 : 0)), L('grass', ['grown-grass'], [0.5, 0.95], (g) => (g > 0.5 ? 0.75 : 0.3)),
        L('turf', ['grown-turf', 'clump-clover'], [0.22, 0.38], (g) => 0.6)] },

    // ---- World Scene's places: on a tank's floor, all of it under the water (edge: 0 in the middle of the tank to 1 at its rim)
    pond: { cell: 0.75, layers: [
      L('reed', ['grown-horsetail', 'grown-grass'], [1.4, 2.4], (g, k, wet, d, x, z, e) => (e > 0.82 ? 0.8 : 0), { sway: 0.8 }),
      L('lily', ['clump-round'], [0.2, 0.3], (g, k, wet, d, x, z, e) => (k > 0.58 && e < 0.8 ? 0.3 : 0), { float: true, sway: 0.2 }),
      L('weed', ['grown-swordfern', 'clump-fern'], [0.6, 1.2], (g) => (g > 0.58 ? 0.55 : 0.04), { sway: 2.4 }),
      L('weed', ['grown-horsetail'], [1.0, 1.8], (g, k) => (k < 0.3 ? 0.35 : 0), { sway: 2.8 }),
      L('turf', ['grown-turf', 'clump-clover'], [0.2, 0.34], (g) => 0.15 + g * 0.35, { sway: 1.6 })] },
    night: { cell: 0.85, layers: [
      L('reed', ['grown-horsetail', 'grown-grass'], [1.4, 2.2], (g, k, wet, d, x, z, e) => (e > 0.88 && k > 0.4 ? 0.5 : 0), { sway: 0.6 }),
      L('lily', ['clump-round', 'clump-flower'], [0.2, 0.32], (g, k, wet, d, x, z, e) => (k > 0.5 && e < 0.85 ? 0.4 : 0), { float: true, sway: 0.15 }),
      L('weed', ['grown-swordfern'], [0.6, 1.1], (g) => (g > 0.62 ? 0.4 : 0), { sway: 2.2 }),
      L('turf', ['grown-turf'], [0.2, 0.3], (g) => 0.1 + g * 0.2, { sway: 1.4 })] },
    river: { cell: 0.8, layers: [
      L('weed', ['grown-horsetail', 'grown-bamboo'], [1.2, 2.2], (g, k) => (k > 0.7 ? 0.35 : 0), { sway: 3 }),
      L('weed', ['grown-swordfern', 'clump-fern'], [0.5, 0.9], (g) => (g > 0.6 ? 0.45 : 0), { sway: 2.4 }),
      L('turf', ['grown-turf', 'clump-clover'], [0.18, 0.3], (g) => (g > 0.45 ? 0.45 : 0.08), { sway: 2 })] },
    kelp: { cell: 0.9, layers: [
      L('kelp', ['grown-horsetail', 'grown-bamboo'], [2.4, 4.8], (g, k) => (k > 0.58 ? 0.45 : 0.03), { sway: 3 }),
      L('shrub', ['clump-round', 'clump-berry'], [0.4, 0.8], (g, k) => (k < 0.25 ? 0.25 : 0), { sway: 2 }),
      L('fern', ['grown-swordfern', 'clump-fern'], [0.6, 1.2], (g) => (g > 0.55 ? 0.4 : 0), { sway: 2.4 }),
      L('turf', ['grown-turf'], [0.2, 0.32], () => 0.3, { sway: 2 })] },
    overgrowth: { cell: 0.7, ledges: true, layers: [
      L('fern', ['clump-fern', 'grown-swordfern'], [0.6, 1.1], (g, k) => (k > 0.5 ? 0.55 : 0.1)),
      L('flower', ['clump-flower'], [0.32, 0.5], (g, k) => (k > 0.66 ? 0.45 : 0)),
      L('grass', ['grown-grass'], [0.5, 0.95], (g) => (g > 0.5 ? 0.7 : 0.25)),
      L('turf', ['grown-turf', 'clump-clover'], [0.22, 0.38], (g) => 0.5 + g * 0.3)] },
    snowfield: { cell: 1.0, trees: { cell: 6, at: 0.6, kinds: [['grown-pine', 2.6, 4.4], ['grown-cypress', 2.2, 3.6]] }, layers: [
      L('grass', ['grown-grass'], [0.4, 0.8], (g) => (g > 0.5 ? 0.4 : 0.1), { sway: 0.6 }),
      L('reed', ['grown-horsetail'], [0.6, 1.0], (g, k) => (k > 0.7 ? 0.35 : 0), { sway: 0.5 })] },
  };

  // the nearest a spot is to the camera's focus discs (negative inside one)
  const focusDist = (focus, x, z) => { let fd = 1e9; for (const q of focus) fd = Math.min(fd, Math.hypot(x - q[0], z - q[1]) - q[2]); return fd; };

  // trees on their own coarser grid, then the layers on a fine one: at each spot the first layer that takes it wins
  function scatter(prof, env) {
    const rnd = env.rnd || Math.random, add = env.add, H = env.H || (() => 0), lev = env.level ?? -99, water = env.water;
    const cx = env.cx ?? prof.cx ?? 0, cz = env.cz ?? prof.cz ?? 0, R = env.R || prof.R || 30, cell = env.cell || prof.cell || 0.62;
    const clear = env.clear || (() => true), avoid = env.avoid || prof.avoid || (() => false), focus = env.focus || prof.focus, edge = env.edge || (() => 0);
    const out = [];
    if (prof.trees) {
      const tc = prof.trees.cell * (env.treeCell || 1);
      for (let x = cx - R; x <= cx + R; x += tc) for (let z = cz - R; z <= cz + R; z += tc) {
        const jx = x + (hash(x * 3 | 0, z * 3 | 0, 9) - 0.5) * tc * 0.9, jz = z + (hash(x * 3 | 0, z * 3 | 0, 10) - 0.5) * tc * 0.9;
        if (Math.hypot(jx - cx, jz - cz) > R || H(jx, jz) < lev + 0.5 || !clear(jx, jz, 1.6) || avoid(jx, jz, 3)) continue;
        if (focus && focusDist(focus, jx, jz) > 6 && hash(jx * 3 | 0, jz * 3 | 0, 33) > 0.45) continue;
        const n = fbm(jx * 0.07, jz * 0.07, 41); if (n < prof.trees.at) continue;
        const pick = prof.trees.kinds[(hash(jx | 0, jz | 0, 12) * prof.trees.kinds.length) | 0];
        const h = lerp(pick[1], pick[2], rnd()) * (0.8 + (n - prof.trees.at) * 1.2);
        const t = add('tree', pick[0], jx, jz, h, { sway: 0.35 }); if (t) out.push({ tree: true, x: jx, z: jz, h, y: H(jx, jz) });
      }
    }
    for (let x = cx - R; x <= cx + R; x += cell) for (let z = cz - R; z <= cz + R; z += cell) {
      const jx = x + (hash(x * 9 | 0, z * 9 | 0, 1) - 0.5) * cell, jz = z + (hash(x * 9 | 0, z * 9 | 0, 2) - 0.5) * cell;
      if (Math.hypot(jx - cx, jz - cz) > R * (0.9 + 0.1 * hash(x | 0, z | 0, 5))) continue;
      const depth = lev - H(jx, jz), g = fbm(jx * 0.09, jz * 0.09, 17), k = fbm(jx * 0.23, jz * 0.23, 23);
      const wet = water ? clamp(1 - (Math.hypot(jx - water.x, jz - water.z) - water.r) / 6, 0, 1) : 0;
      if (!clear(jx, jz, 0.25) || avoid(jx, jz, 0.4)) continue;
      if (focus) { const fd = focusDist(focus, jx, jz); if (fd > 0 && hash(jx * 13 | 0, jz * 13 | 0, 31) > Math.max(0.12, 1 - fd / 10)) continue; }   // dense where the camera looks
      const r = rnd(), e = edge(jx, jz);
      for (const La of prof.layers) {
        if (!La.float && !La.wet && depth > -0.04) continue;
        const w = La.w(g, k, wet, depth, jx, jz, e); if (w <= 0 || r > w) continue;
        const key = La.keys[(hash(jx * 5 | 0, jz * 5 | 0, 7) * La.keys.length) | 0];
        add(La.role, key, jx, jz, lerp(La.h[0], La.h[1], rnd()) * (0.75 + g * 0.5), { sway: La.sway || 1, float: !!La.float });
        break;
      }
    }
    return out;
  }

  // Overgrowth: the faces that look up, sampled, then planted bottom first (each plant's delay grows with its height)
  const LEDGE = [['clump-fern', 'fern', 0.4, 0.7], ['clump-clover', 'turf', 0.18, 0.3], ['grown-vine', 'fern', 0.6, 1.1], ['grown-swordfern', 'fern', 0.4, 0.8], ['grown-grass', 'grass', 0.3, 0.55]];
  function ledges(meshes, env) {
    const R = env.rnd || Math.random, base = env.base || 0, top = env.top || 12, budget = env.budget || 1100, keep = env.keep ?? 0.55, keys = env.keys || LEDGE, pts = [];
    for (const m of meshes) {
      const P = m.P, N = m.N, I = m.I; if (!P || !N || !I || !I.length) continue;
      const nT = I.length / 3, step = Math.max(1, Math.floor(nT / budget));
      for (let t = 0; t < nT; t += step) {
        const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2]; if (N[a * 3 + 1] < 0.6) continue; if (R() > keep) continue;
        const p = m.at((P[a * 3] + P[b * 3] + P[c * 3]) / 3, (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3);
        if (p[1] < (m.base ?? base) + (env.lift ?? 0.2)) continue;   // the ground round it has its own
        pts.push(p.concat([m.base ?? base, m.top ?? top]));
      }
    }
    for (const [x, y, z, b0, t0] of pts) {
      const k = keys[(R() * keys.length) | 0], up = clamp((y - b0) / t0, 0, 1);
      env.add(k[1], k[0], x, z, lerp(k[2], k[3], R()), { y, up, delay: 1.5 + up * 9 + R() * 2.5, sway: 0.6, over: true });
    }
    return pts.length;
  }

  window.FloraPlant = { def, scatter, ledges, PROFILES, L, LEDGE, hash, vn, fbm, TAU };
})();
