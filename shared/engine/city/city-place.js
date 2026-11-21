/* city-place.js: World Scene's city as a place a creature page can stand on — the same grammar city for the same seed, in tank units.

   World Scene and the tank (Cybernetic Ecology, the Maw's game) share the tank's coordinates: x and y across, z depth with the floor
   at the bottom (larger z is lower). The grammar builds its city in its own units, y up (city-grammar.js). This module puts that city in
   the tank the way World Scene does (lastCityModel: a scale s = tw · 0.4 / 15.3, centred, the ground at the tank's floor) and reads off
   what a page needs to draw it, to stand creatures on it and to fill its districts.

     const sheet = await CityGrammar.load();
     const P = CityPlace.build(sheet, { seed, pins, tw, th, td, floor: 0.97, ks: 0.027 });
     P.city                 the grammar city (CityGrammar.build)
     P.lines                Float32Array x, y, z, level per vertex (tank units), segment pairs: its line drawing (CityGrammarMesh)
     P.tris                 Float32Array x, y, z, nx, ny, nz per vertex (tank units): its solids, for a look that shades planes
     P.tower                { x, y, r, zTop }: the centre tower as a solid (zTop a share of td, as the sim's solids have it)
     P.place()              what EcologyWalkers.layout({ place }) wants: { towers, walls, H, cell } in walker units
     P.spawn(W)             a free walkable spot on a terrace a little out from the centre, [x, z] in walker units (or null)
     P.districts            [{ id, name, x, y, r, lots: [[x, y], ...] }] in tank units: where each district of the city is
     P.props(ids, kind)     landmarks over those districts' lots, for EcologyHabitat.create({ props }): births go there

   Needs CityGrammar and CityGrammarMesh (shared/engine/city/). Classic script -> window.CityPlace. */
(function () {
  "use strict";
  function build(sheet, o) {
    const G = window.CityGrammar, tw = o.tw, th = o.th, td = o.td, floor = o.floor || 0.97, ks = o.ks || 0.027;
    const city = G.build(o.seed >>> 0, sheet, { reserve: o.reserve || [], pins: o.pins || undefined });
    const s = (tw * 0.4) / 15.3, cx = tw / 2, cy = th / 2, base = floor * td;
    const X = (gx) => cx + s * gx, Y = (gz) => cy + s * gz, Z = (gy) => base - s * gy;
    const mesh = window.CityGrammarMesh.build(city, { tower: true, outskirts: false });
    // its line drawing: level runs with height (0 at the ground, 1 a tower's height up), as the tank's contours have it
    const L = mesh.lines, lines = new Float32Array((L.length / 3) * 4);
    for (let i = 0, o4 = 0; i < L.length; i += 3, o4 += 4) { lines[o4] = X(L[i]); lines[o4 + 1] = Y(L[i + 2]); lines[o4 + 2] = Z(L[i + 1]); lines[o4 + 3] = Math.max(0.15, Math.min(1, L[i + 1] / 6)); }
    // its solids: ground terraces, water, green, buildings (grammar y up -> tank z down; the normal turns the same way)
    let n = 0; for (const k of ["ground", "water", "green", "bldg"]) n += mesh[k].positions.length;
    const tris = new Float32Array(n * 2); let w = 0;
    for (const k of ["ground", "water", "green", "bldg"]) { const P = mesh[k].positions, N = mesh[k].normals;
      for (let i = 0; i < P.length; i += 3) { tris[w++] = X(P[i]); tris[w++] = Y(P[i + 2]); tris[w++] = Z(P[i + 1]); tris[w++] = N[i]; tris[w++] = N[i + 2]; tris[w++] = -N[i + 1]; } }
    // the centre tower (the grammar's own: a shaft of four tiers on the first terrace), as one solid the sim's swimmers steer round
    const T0 = city.terraces[0], shaftTop = T0.y + 0.7 + 0.95 + 0.83 + 0.71 + 0.59 + 0.24;
    const tower = { x: cx, y: cy, r: s * 1.1, zTop: Z(shaftTop + 2.6) / td, top: shaftTop };
    // the roofs: every built lot raised into the ground on a grid of 0.25 city units, so a house is a step up the ground
    const cell = 0.25, R = 16, nG = Math.ceil(2 * R / cell), roof = new Float32Array(nG * nG), seen = new Map();
    for (const t of city.tiles) for (const Lt of t.corners) if (Lt.solid) seen.set(Lt.x.toFixed(3) + "," + Lt.z.toFixed(3), Lt);
    const U = [...seen.values()]; let gap = 1;
    if (U.length > 1) { const d = []; for (let i = 0; i < Math.min(60, U.length); i++) { let m = 1e9; for (const q of U) if (q !== U[i]) m = Math.min(m, Math.hypot(q.x - U[i].x, q.z - U[i].z)); d.push(m); } d.sort((a, b) => a - b); gap = d[d.length >> 1] || 1; }
    const half = gap * 0.42;
    for (const Lt of U) { const top = G.groundY(Math.hypot(Lt.x, Lt.z)) + Lt.floors * city.floorH;
      for (let i = Math.floor((Lt.x - half + R) / cell); i <= Math.floor((Lt.x + half + R) / cell); i++) for (let j = Math.floor((Lt.z - half + R) / cell); j <= Math.floor((Lt.z + half + R) / cell); j++)
        if (i >= 0 && j >= 0 && i < nG && j < nG) roof[j * nG + i] = Math.max(roof[j * nG + i], top); }
    const gy = (gx, gz) => { const i = Math.floor((gx + R) / cell), j = Math.floor((gz + R) / cell), r = i >= 0 && j >= 0 && i < nG && j < nG ? roof[j * nG + i] : 0; return Math.max(G.groundY(Math.hypot(gx, gz)), r); };
    // walker units: x, z = (tank x, y about the middle) · ks; y up from the floor. One city unit is s · ks walker units
    const k = s * ks, H = (x, z) => gy(x / k, z / k) * k;
    const place = () => ({ towers: [{ x: 0, z: 0, r: 1.1 * k, h: shaftTop * k }], walls: [], H, cell: 1 });
    const spawn = (W, seed) => {
      const rnd = window.WorldGen ? window.WorldGen.rng(((seed != null ? seed : o.seed) | 0) * 31 + 3) : Math.random, ring = tw * 0.4 * 0.35 * ks;
      for (let i = 0; i < 80; i++) { const a = rnd() * Math.PI * 2, d = ring * (0.8 + 0.5 * (i / 80)), q = [Math.cos(a) * d, Math.sin(a) * d]; if (!W || W.nav.free(q[0], q[1])) return q; }
      return null;
    };
    // the districts: where each district's lots are, in tank units
    const by = new Map();
    for (const t of city.tiles) for (const Lt of t.corners) { if (!Lt.district) continue; let d = by.get(Lt.district); if (!d) by.set(Lt.district, (d = { id: Lt.district, lots: [], seen: new Set() }));
      const key = Lt.x.toFixed(2) + "," + Lt.z.toFixed(2); if (!d.seen.has(key)) { d.seen.add(key); d.lots.push([X(Lt.x), Y(Lt.z)]); } }
    const names = sheet.byId || {}, districts = [...by.values()].map((d) => { let sx = 0, sy = 0; for (const p of d.lots) { sx += p[0]; sy += p[1]; } const mx = sx / d.lots.length, my = sy / d.lots.length;
      let r = 0; for (const p of d.lots) r = Math.max(r, Math.hypot(p[0] - mx, p[1] - my)); return { id: d.id, name: (names[d.id] && names[d.id].name) || d.id, x: mx, y: my, r, lots: d.lots }; });
    const props = (ids, kind) => { const out = [], want = new Set(ids || []); for (const d of districts) if (!ids || want.has(d.id)) { const step = Math.max(1, Math.floor(d.lots.length / 24));
      for (let i = 0; i < d.lots.length; i += step) out.push({ kind: kind || "weed", x: d.lots[i][0], y: d.lots[i][1], r: s * gap * 1.2 }); } return out; };
    return { city, s, cx, cy, base, ks, lines, tris, tower, place, spawn, districts, props, gap };
  }
  window.CityPlace = { build };
})();
