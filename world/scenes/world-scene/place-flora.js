// world/scenes/world-scene/place-flora.js -- window.PlaceFlora: the plants of World Scene's places, grown by FloraGrow and drawn by FloraGPU
// in World Scene's own tank (x, y across, z down, the floor at tankDepth()). The plantings follow Forge Scenes' (world/forges/scenes):
// the same recipes and the same rules of what grows where, scaled from its world units to the tank by the creatures' own size, and its
// Overgrowth (plants on the machine's ledges, growing in from the ground to the top over the loop) on World Scene's towers.
//
//   PlaceFlora.plant(place.flora, ctx)   ctx: { TW, TH, TD, U (tank units a Forge Scenes world unit), C: [x, y], seed, surfZ,
//                                               towers: [{ parts, model }], city: { r } | null }
//   PlaceFlora.draw(gl, { vp, eye, shift, shiftX, time, grow, fog, sky })      grow: seconds since growing began (a timelapse), else all grown
//   PlaceFlora.clear()
//
// A place's flora: { kind: 'pond' | 'river' | 'kelp' | 'overgrowth' | 'winter' | 'night', amount (1: as designed), size (1),
//                    colours: { role: [hex, hex] } (a role's two ends; each plant takes a mix), timelapse: true (grows over the loop) }
(function () {
  'use strict';
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
  const hash = (x, y, s) => { let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 2147483647; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const vnoise = (x, y, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy, s), hash(ix + 1, iy, s), u), lerp(hash(ix, iy + 1, s), hash(ix + 1, iy + 1, s), u), v); };
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.1;
  const hexRGB = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  // what grows: role, recipes, height in Forge Scenes world units, how it sways, and how likely at a spot (g, k: two slow noise fields
  // 0..1; edge: 0 in the middle of the tank to 1 at its rim). where: 'bed' (on the floor, under the water), 'float' (on the surface)
  const L = (role, keys, h, w, o) => Object.assign({ role, keys, h, w, where: 'bed', sway: 1 }, o || {});
  const KINDS = {
    // the koi pond: weed and fern on the bed, lilies on the water, reeds round the rim
    pond: { cell: 0.75, layers: [
      L('reed', ['grown-horsetail', 'grown-grass'], [1.4, 2.4], (g, k, e) => (e > 0.82 ? 0.8 : 0), { sway: 0.8 }),
      L('lily', ['clump-round'], [0.2, 0.3], (g, k, e) => (k > 0.58 && e < 0.8 ? 0.3 : 0), { where: 'float', sway: 0.2 }),
      L('weed', ['grown-swordfern', 'clump-fern'], [0.6, 1.2], (g, k) => (g > 0.58 ? 0.55 : 0.04), { sway: 2.4 }),
      L('weed', ['grown-horsetail'], [1.0, 1.8], (g, k) => (k < 0.3 ? 0.35 : 0), { sway: 2.8 }),
      L('turf', ['grown-turf', 'clump-clover'], [0.2, 0.34], (g) => 0.15 + g * 0.35, { sway: 1.6 })] },
    // the night pond: the same, thinner, with more lilies
    night: { cell: 0.85, layers: [
      L('reed', ['grown-horsetail', 'grown-grass'], [1.4, 2.2], (g, k, e) => (e > 0.88 && k > 0.4 ? 0.5 : 0), { sway: 0.6 }),
      L('lily', ['clump-round', 'clump-flower'], [0.2, 0.32], (g, k, e) => (k > 0.5 && e < 0.85 ? 0.4 : 0), { where: 'float', sway: 0.15 }),
      L('weed', ['grown-swordfern'], [0.6, 1.1], (g) => (g > 0.62 ? 0.4 : 0), { sway: 2.2 }),
      L('turf', ['grown-turf'], [0.2, 0.3], (g) => 0.1 + g * 0.2, { sway: 1.4 })] },
    // a river over a pale bed: low turf and fern in banks either side, a few tall weeds
    river: { cell: 0.8, layers: [
      L('weed', ['grown-horsetail', 'grown-bamboo'], [1.2, 2.2], (g, k) => (k > 0.7 ? 0.35 : 0), { sway: 3 }),
      L('weed', ['grown-swordfern', 'clump-fern'], [0.5, 0.9], (g, k) => (g > 0.6 ? 0.45 : 0), { sway: 2.4 }),
      L('turf', ['grown-turf', 'clump-clover'], [0.18, 0.3], (g) => (g > 0.45 ? 0.45 : 0.08), { sway: 2 })] },
    // the deep: kelp between the towers, from Forge Scenes' Deep sea
    kelp: { cell: 0.9, layers: [
      L('kelp', ['grown-horsetail', 'grown-bamboo'], [2.4, 4.8], (g, k) => (k > 0.58 ? 0.45 : 0.03), { sway: 3 }),
      L('shrub', ['clump-round', 'clump-berry'], [0.4, 0.8], (g, k) => (k < 0.25 ? 0.25 : 0), { sway: 2 }),
      L('fern', ['grown-swordfern', 'clump-fern'], [0.6, 1.2], (g) => (g > 0.55 ? 0.4 : 0), { sway: 2.4 }),
      L('turf', ['grown-turf'], [0.2, 0.32], () => 0.3, { sway: 2 })] },
    // Forge Scenes' Overgrowth: a meadow round the foot of the towers, and the towers' ledges grown over (ledges, below)
    overgrowth: { cell: 0.7, ledges: true, layers: [
      L('fern', ['clump-fern', 'grown-swordfern'], [0.6, 1.1], (g, k) => (k > 0.5 ? 0.55 : 0.1)),
      L('flower', ['clump-flower'], [0.32, 0.5], (g, k) => (k > 0.66 ? 0.45 : 0)),
      L('grass', ['grown-grass'], [0.5, 0.95], (g) => (g > 0.5 ? 0.7 : 0.25)),
      L('turf', ['grown-turf', 'clump-clover'], [0.22, 0.38], (g) => 0.5 + g * 0.3)] },
    // winter: pines and dry grass in the snow, from Forge Scenes' winter
    winter: { cell: 1.0, trees: { cell: 6, at: 0.6, kinds: [['grown-pine', 2.6, 4.4], ['grown-cypress', 2.2, 3.6]] }, layers: [
      L('grass', ['grown-grass'], [0.4, 0.8], (g) => (g > 0.5 ? 0.4 : 0.1), { sway: 0.6 }),
      L('reed', ['grown-horsetail'], [0.6, 1.0], (g, k) => (k > 0.7 ? 0.35 : 0), { sway: 0.5 })] },
  };
  const COLOURS = {   // each role's two ends, when the place gives none
    pond: { reed: ['#5e8a3e', '#b8c96a'], lily: ['#2f7a3c', '#8fc25a'], weed: ['#1f5a3a', '#4f9a52'], turf: ['#3d6a35', '#7aa04a'] },
    night: { reed: ['#24402c', '#4d6a46'], lily: ['#1f4a34', '#6f8f5a'], weed: ['#163428', '#2f5a3e'], turf: ['#1d3424', '#3a5636'] },
    river: { weed: ['#1d6a5a', '#5fb08a'], turf: ['#2f6a4a', '#8ac08a'] },
    kelp: { kelp: ['#1a4a4a', '#3f8a6a'], shrub: ['#3a2a5a', '#7a4a8a'], fern: ['#1c4a3a', '#3f7a5a'], turf: ['#1a3a3a', '#2f5a4a'] },
    overgrowth: { fern: ['#2f6a2a', '#7ab04a'], flower: ['#d0a040', '#e86a5a'], grass: ['#4a7a30', '#a8c060'], turf: ['#3a6a2a', '#86a848'], vine: ['#2a5a26', '#6a9a3c'] },
    winter: { tree: ['#2a3a34', '#4a5a50'], grass: ['#8a8a78', '#c8c4b0'], reed: ['#6a6a5a', '#a8a490'] },
  };
  const LEDGE = [['clump-fern', 'fern', 0.4, 0.7], ['clump-clover', 'turf', 0.18, 0.3], ['grown-vine', 'vine', 0.6, 1.1], ['grown-swordfern', 'fern', 0.4, 0.8], ['grown-grass', 'grass', 0.3, 0.55]];

  const DEFS = new Map();
  function def(key, seed) { const id = key + '|' + seed; if (DEFS.has(id)) return DEFS.get(id); const G = window.FloraGrow, b = G && G.PRESETS.find((p) => p.key === key); if (!b) return null;
    const r = JSON.parse(JSON.stringify(b)); r.key = key + '-s' + seed; r.seed = seed; let d = null; try { d = G.grow(r); } catch (e) { d = null; } DEFS.set(id, d); return d; }

  const ST = { FG: null, plants: [], key: null, timelapse: false };
  function plant(F, ctx) {
    ST.plants = []; ST.timelapse = !!(F && F.timelapse); if (!F || !KINDS[F.kind] || !window.FloraGrow || !window.FloraGPU) return 0;
    const K = KINDS[F.kind], col = Object.assign({}, COLOURS[F.kind] || {}, F.colours || {}), U = ctx.U * (F.size || 1), amount = F.amount ?? 1;
    let seed = (ctx.seed || 1) * 9301 + 49297; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const tintOf = (role) => { const c = col[role] || col[Object.keys(col)[0]] || ['#4a7a3a', '#8ab05a'], a = hexRGB(c[0]), b = hexRGB(c[1]), m = rnd(); return [lerp(a[0], b[0], m), lerp(a[1], b[1], m), lerp(a[2], b[2], m)]; };
    const add = (role, key, x, y, h, o) => { const d = def(key, 1 + (hash(x * 0.07, y * 0.07, 3) * 3 | 0)); if (!d) return null;
      const p = Object.assign({ def: d, role, x, y, size: h * U / Math.max(200, d.tall || 1000), yaw: rnd() * TAU, phase: rnd() * TAU, delay: 0, sway: 1, dz: 0, tint: tintOf(role) }, o || {}); ST.plants.push(p); return p; };
    // the towers' feet (and the city's) are kept clear
    const feet = (ctx.towers || []).map((t) => t.foot).filter(Boolean), cityR = ctx.city ? ctx.city.r : 0;
    const clear = (x, y, pad) => { for (const f of feet) if (Math.hypot(x - f[0], y - f[1]) < f[2] + pad) return false; return !(cityR && Math.hypot(x - ctx.C[0], y - ctx.C[1]) < cityR + pad); };
    const TW = ctx.TW, TH = ctx.TH, cell = K.cell * U / Math.sqrt(Math.max(0.05, amount)), sc = 1 / (U * 9);
    if (K.trees) for (let x = 0; x < TW; x += K.trees.cell * U) for (let y = 0; y < TH; y += K.trees.cell * U) {
      const jx = x + (hash(x, y, 9) - 0.5) * K.trees.cell * U * 0.9, jy = y + (hash(x, y, 10) - 0.5) * K.trees.cell * U * 0.9, n = fbm(jx * sc * 0.8, jy * sc * 0.8, 41);
      if (n < K.trees.at || !clear(jx, jy, 2 * U)) continue; const pick = K.trees.kinds[(hash(jx, jy, 12) * K.trees.kinds.length) | 0];
      add('tree', pick[0], jx, jy, lerp(pick[1], pick[2], rnd()) * (0.8 + (n - K.trees.at) * 1.2), { sway: 0.35 }); }
    for (let x = 0; x < TW; x += cell) for (let y = 0; y < TH; y += cell) {
      const jx = x + (hash(x, y, 1) - 0.5) * cell, jy = y + (hash(x, y, 2) - 0.5) * cell, e = clamp(Math.max(Math.abs(jx / TW - 0.5), Math.abs(jy / TH - 0.5)) * 2, 0, 1);
      const g = fbm(jx * sc, jy * sc, 17), k = fbm(jx * sc * 2.5, jy * sc * 2.5, 23); if (!clear(jx, jy, 0.4 * U)) continue;
      const r = rnd(); for (const La of K.layers) { const w = La.w(g, k, e); if (w <= 0 || r > w) continue;
        const key = La.keys[(hash(jx * 0.2, jy * 0.2, 7) * La.keys.length) | 0], h = lerp(La.h[0], La.h[1], rnd()) * (0.75 + g * 0.5);
        add(La.role, key, jx, jy, h, { sway: La.sway, dz: La.where === 'float' ? (ctx.surfZ - ctx.TD) : 0, delay: ST.timelapse ? 0.5 + rnd() * 2 : 0 }); break; } }
    // Overgrowth: plants on the towers' ledges -- where a face looks up -- growing in from the ground to the top
    if (K.ledges) for (const T of ctx.towers || []) { const m = T.model, s = m[0], top = T.top || 1;
      for (const part of T.parts || []) { const P = part.positions, N = part.normals, I = part.indices; if (!P || !N || !I || !I.length || part.mode === 'points') continue;
        const nT = I.length / 3, step = Math.max(1, Math.floor(nT / (700 * amount)));
        for (let t = 0; t < nT; t += step) { const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2]; if (N[a * 3 + 1] < 0.6 || rnd() > 0.55) continue;
          const lx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, ly = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, lz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
          if (ly * s < 0.15 * U) continue;   // the ground round it has its own
          const x = m[12] + lx * s, y = m[13] + lz * s, z = m[14] - ly * s, up = clamp(ly * s / top, 0, 1), q = LEDGE[(rnd() * LEDGE.length) | 0];
          add(q[1], q[0], x, y, lerp(q[2], q[3], rnd()), { dz: z - ctx.TD - 0.02 * U, delay: 1.5 + up * 9 + rnd() * 2.5, sway: 0.6 }); } } }
    // the floor's own plants start at once; the ledges after them, bottom first
    const FG = ST.FG || (ST.FG = window.FloraGPU.create(ctx.gl)); window.FloraGPU.set(FG, ST.plants);
    return ST.plants.length;
  }
  function draw(gl, o) { if (!ST.FG || !ST.plants.length) return;
    window.FloraGPU.draw(ST.FG, Object.assign({ inPlace: true, floor: false, fill: true, alpha: 0.95, lift: 0.8, gust: 1, ink: [0.16, 0.2, 0.14], bark: [0.3, 0.24, 0.18], tint: 0.85, bias: 0.8 }, o)); }
  function clear() { ST.plants = []; if (ST.FG && window.FloraGPU) window.FloraGPU.set(ST.FG, []); }
  window.PlaceFlora = { plant, draw, clear, KINDS, COLOURS, get count() { return ST.plants.length; }, get timelapse() { return ST.timelapse; }, stats: () => ST.FG && ST.FG.stats };
})();
