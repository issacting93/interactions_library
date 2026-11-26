// world/scenes/world-scene/places/flora.js -- window.PlaceFlora: the plants of World Scene's places. What grows where is shared with Forge
// Scenes (packages/flora/flora-plant.js: the profiles, the scatter, Overgrowth's ledges); this file maps it into World Scene's tank
// (x, y across, z down, the floor at tankDepth()) and draws it with FloraGPU.
//
//   PlaceFlora.plant(place.flora, ctx)   ctx: { gl, TW, TH, TD, U (tank units a Forge Scenes world unit), C: [x, y], seed, surfZ,
//                                               towers: [{ parts, model, top, foot }], city: { r } | null }
//   PlaceFlora.draw(gl, { vp, eye, shift, shiftX, time, grow, fz, view, sky, ink })   grow: seconds since growing began, else all grown
//   PlaceFlora.clear()
//
// A place's flora: { kind (a FloraPlant profile: pond, night, river, kelp, overgrowth, snowfield, or any of Forge Scenes'), amount (1),
//                    size (1), colours: { role: [hex, hex] } (a role's two ends; each plant takes a mix), ink, timelapse (grows over the loop) }
(function () {
  'use strict';
  const lerp = (a, b, k) => a + (b - a) * k, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hexRGB = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  const COLOURS = {   // each role's two ends, when the place gives none
    pond: { reed: ['#5e8a3e', '#b8c96a'], lily: ['#2f7a3c', '#8fc25a'], weed: ['#1f5a3a', '#4f9a52'], turf: ['#3d6a35', '#7aa04a'] },
    night: { reed: ['#24402c', '#4d6a46'], lily: ['#1f4a34', '#6f8f5a'], weed: ['#163428', '#2f5a3e'], turf: ['#1d3424', '#3a5636'] },
    river: { weed: ['#1d6a5a', '#5fb08a'], turf: ['#2f6a4a', '#8ac08a'] },
    kelp: { kelp: ['#1a4a4a', '#3f8a6a'], shrub: ['#3a2a5a', '#7a4a8a'], fern: ['#1c4a3a', '#3f7a5a'], turf: ['#1a3a3a', '#2f5a4a'] },
    overgrowth: { fern: ['#2f6a2a', '#7ab04a'], flower: ['#d0a040', '#e86a5a'], grass: ['#4a7a30', '#a8c060'], turf: ['#3a6a2a', '#86a848'] },
    snowfield: { tree: ['#2a3a34', '#4a5a50'], grass: ['#8a8a78', '#c8c4b0'], reed: ['#6a6a5a', '#a8a490'] },
  };

  const ST = { FG: null, plants: [], timelapse: false };
  function plant(F, ctx) {
    ST.plants = []; ST.timelapse = !!(F && F.timelapse);
    const FP = window.FloraPlant, prof = F && FP && FP.PROFILES[F.kind];
    if (!prof || !window.FloraGrow || !window.FloraGPU) return 0;
    const col = Object.assign({}, COLOURS[F.kind] || {}, F.colours || {}), U = ctx.U * (F.size || 1), amount = F.amount ?? 1, TD = ctx.TD;
    let seed = (ctx.seed || 1) * 9301 + 49297; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const tintOf = (role) => { const c = col[role] || col[Object.keys(col)[0]] || ['#4a7a3a', '#8ab05a'], a = hexRGB(c[0]), b = hexRGB(c[1]), m = rnd(); return [lerp(a[0], b[0], m), lerp(a[1], b[1], m), lerp(a[2], b[2], m)]; };
    // add a plant at (x, z) world units: in the tank at (x U, z U), on the floor unless o says otherwise
    const add = (role, key, x, z, h, o) => {
      const d = FP.def(key, 1 + (FP.hash(Math.floor(x * 7), Math.floor(z * 7), 3) * 3 | 0)); if (!d) return null;
      const dz = o && o.float ? ctx.surfZ - TD : o && o.y != null ? -o.y * U : 0;   // dz: from the floor, up negative
      const p = { def: d, role, x: x * U, y: z * U, size: h * U / Math.max(200, d.tall || 1000), yaw: rnd() * Math.PI * 2, phase: rnd() * Math.PI * 2,
        delay: ST.timelapse ? (o && o.delay != null ? o.delay : 0.5 + rnd() * 2) : 0, sway: (o && o.sway) || 1, dz, tint: tintOf(role) };
      ST.plants.push(p); return p;
    };
    // the whole tank's floor, in world units: a disc round it, cut to the rectangle; its rim for the reeds
    const w = ctx.TW / U, hh = ctx.TH / U, inRect = (x, z) => x >= 0 && z >= 0 && x <= w && z <= hh;
    const feet = (ctx.towers || []).map((t) => t.foot).filter(Boolean), cityR = ctx.city ? ctx.city.r : 0;
    const clear = (x, z, pad) => { const tx = x * U, ty = z * U, p = pad * U; for (const f of feet) if (Math.hypot(tx - f[0], ty - f[1]) < f[2] + p) return false;
      return !(cityR && Math.hypot(tx - ctx.C[0], ty - ctx.C[1]) < cityR + p); };
    const thin = 1 / Math.sqrt(Math.max(0.05, amount));
    FP.scatter(prof, { add, rnd, cx: w / 2, cz: hh / 2, R: Math.hypot(w, hh) / 2, cell: (prof.cell || 0.7) * thin, treeCell: thin,
      clear, avoid: (x, z) => !inRect(x, z), edge: (x, z) => clamp(Math.max(Math.abs(x / w - 0.5), Math.abs(z / hh - 0.5)) * 2, 0, 1) });
    // Overgrowth: the towers' ledges (local y up, scaled and placed by the tower's model; in the tank z runs down from its base)
    if (prof.ledges) for (const T of ctx.towers || []) {
      const m = T.model, s = m[0], baseUp = (TD - m[14]) / U;
      const meshes = (T.parts || []).filter((p) => p.mode !== 'points').map((p) => ({ P: p.positions, N: p.normals, I: p.indices,
        at: (lx, ly, lz) => [(m[12] + lx * s) / U, baseUp + ly * s / U, (m[13] + lz * s) / U] }));
      FP.ledges(meshes, { rnd, base: baseUp, top: (T.top || 1) / U, budget: 700 * amount, lift: 0.15, add });
    }
    const FG = ST.FG || (ST.FG = window.FloraGPU.create(ctx.gl)); window.FloraGPU.set(FG, ST.plants);
    return ST.plants.length;
  }
  function draw(gl, o) {
    if (!ST.FG || !ST.plants.length) return;
    window.FloraGPU.draw(ST.FG, Object.assign({ inPlace: true, floor: false, fill: true, alpha: 0.95, lift: 0.8, gust: 1, ink: [0.16, 0.2, 0.14], bark: [0.3, 0.24, 0.18], tint: 0.85, bias: 0.8 }, o));
  }
  function clear() { ST.plants = []; if (ST.FG && window.FloraGPU) window.FloraGPU.set(ST.FG, []); }
  window.PlaceFlora = { plant, draw, clear, COLOURS, get count() { return ST.plants.length; }, get timelapse() { return ST.timelapse; }, stats: () => ST.FG && ST.FG.stats };
})();
