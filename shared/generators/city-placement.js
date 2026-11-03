/*
 * Forge — city placement. Solves a round city with CityWFC over a Terrain, then fills its
 * landmark plots with real prefabs from the world file.
 *
 *   CityPlacement.solve(recipe) -> { wfc, terrain, cells, plots }
 *       recipe = { seed, terrain: Terrain params, ... }. The terrain biases the solver:
 *       flooded housing cells lean to qanat channels and gardens to rills, wet wall cells
 *       to qanat inlets, and landmark tiles are discouraged on wet or steep ground.
 *       plots: the cells whose tile is a landmark (PLOT_TILES), with frame + terrain stats.
 *   CityPlacement.candidates(plot, prefabs, recipe) -> [{ prefab, fit, ok, why }]
 *       prefab = { id, name, span, height, districts, attracts } (span/height in drawing px).
 *       A prefab fits when it is allowed in the plot's zone (recipe.rules[prefabId] = zones,
 *       else the prefab's own district tags, else anywhere), its span at recipe.pxPerUnit is
 *       no wider than the plot (recipe.tolerance), and the ground is dry and gentle enough.
 *   CityPlacement.assign(solved, prefabs, recipe) -> Map(cellId -> { prefab, fit, pinned })
 *       deterministic in recipe.seed; recipe.overrides[cellId] = prefabId | "empty" wins.
 *   CityPlacement.PLOT_TILES, ZONE_KEYS, matchesZone(tags, zone, tileId)
 *
 * Depends on CityWFC and Terrain. Pure; classic script, also loads under Node.
 */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : global;
  const PLOT_TILES = ["core", "minaret", "bayt-al-hikma", "caravanserai", "madrasa", "masjid", "hammam", "bimaristan", "ab-anbar", "belvedere", "pavilion", "tower", "gate"];
  const ZONE_KEYS = ["core", "sanctum", "bazaar", "housing", "garden", "wall"];
  const DEFAULTS = { seed: 7, pxPerUnit: 300, tolerance: 1.1, maxSlope: 0.09, maxFlood: 0.34, houses: false, rules: {}, overrides: {} };

  const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const baseId = (t) => (t ? t.base || t.id : null);

  function frameOf(cell) {
    if (cell.ring === 0) return { x: 0, y: 0, width: cell.r1 * 1.4, depth: cell.r1 * 1.4, angle: -Math.PI / 2 };
    const rm = (cell.r0 + cell.r1) / 2, am = (cell.a0 + cell.a1) / 2;
    return { x: rm * Math.cos(am), y: rm * Math.sin(am), width: rm * (cell.a1 - cell.a0), depth: cell.r1 - cell.r0, angle: am };
  }

  function solve(recipe) {
    const CW = G.CityWFC, T = G.Terrain;
    const R = { ...DEFAULTS, ...recipe };
    const terrain = T.create({ ...(R.terrain || {}), seed: (R.terrain && R.terrain.seed) ?? R.seed });
    const { cells } = CW.buildGrid();
    const stats = cells.map((c) => T.cellStats(terrain, c));
    const tiles = CW.buildTiles();
    const plotSet = new Set(PLOT_TILES.concat(R.houses ? ["house"] : []));
    const weight = (ci, ti) => {
      const t = tiles[ti], s = stats[ci], id = baseId(t);
      let w = t.weight;
      if (!w) return 0;
      const wet = s.flood, steep = Math.min(1, s.slope / 0.12);
      if (wet > 0.25) {
        if (id === "qanat" || id === "garden-canal" || id === "inlet" || id === "ab-anbar") w *= 1 + 8 * wet;
        else if (id === "orchard" || id === "pool-garden" || id === "lane") w *= 1 + 2 * wet;
        else if (plotSet.has(id) && id !== "core") w *= 0.08;
        else if (id === "house") w *= 0.4;
      }
      if (steep > 0.6 && plotSet.has(id) && id !== "core") w *= 0.3;
      return w;
    };
    const wfc = CW.generate(R.seed >>> 0, { weight });
    if (!wfc.ok) return { ok: false, reason: wfc.reason, terrain, cells, stats, plots: [] };
    const plots = [];
    for (const c of wfc.cells) {
      const t = wfc.tiles[wfc.result[c.id]], id = baseId(t);
      c.tile = t; c.stats = stats[c.id]; c.frame = frameOf(c);
      if (plotSet.has(id)) plots.push(c);
    }
    return { ok: true, wfc, terrain, cells: wfc.cells, plots, recipe: R };
  }

  function matchesZone(tags, zone, tileId) {
    if (!tags || !tags.length) return true;
    const names = { core: "sacred core", sanctum: "sanctum ring", bazaar: "bazaar ring", housing: "mahalle quarters", garden: "gardens", wall: "round wall" };
    return tags.some((t) => {
      const s = String(t).toLowerCase().trim();
      return s === "any" || s === zone || s === tileId || (names[zone] || "").includes(s) || (s.length > 3 && zone.startsWith(s.slice(0, 4)));
    });
  }

  function candidates(plot, prefabs, recipe) {
    const R = { ...DEFAULTS, ...recipe }, tile = baseId(plot.tile), f = plot.frame, s = plot.stats;
    const room = Math.min(f.width, f.depth * 1.6) * R.tolerance;
    const out = [];
    for (const p of prefabs) {
      const zones = R.rules[p.id];
      const allowed = zones ? zones.includes(plot.zone) : matchesZone(p.districts, plot.zone, tile);
      const units = p.span / R.pxPerUnit, fit = room / Math.max(units, 1e-6);
      let why = null;
      if (!allowed) why = `not allowed in ${plot.zone}`;
      else if (fit < 1) why = `${units.toFixed(1)}u wide, plot is ${room.toFixed(1)}u`;
      else if (s.flood > R.maxFlood && tile !== "core") why = `ground ${Math.round(s.flood * 100)}% flooded`;
      else if (s.slope > R.maxSlope && tile !== "core") why = `slope ${s.slope.toFixed(2)} too steep`;
      out.push({ prefab: p, fit, ok: !why, why, units });
    }
    // best fill first: the largest prefab that still fits
    return out.sort((a, b) => (b.ok - a.ok) || (a.ok ? a.fit - b.fit : b.fit - a.fit));
  }

  function assign(solved, prefabs, recipe) {
    const R = { ...DEFAULTS, ...recipe }, out = new Map();
    for (const plot of solved.plots) {
      const ov = R.overrides[plot.id];
      if (ov === "empty") continue;
      if (ov) {
        const p = prefabs.find((x) => x.id === ov);
        if (p) { const c = candidates(plot, [p], R)[0]; out.set(plot.id, { prefab: p, fit: c.fit, pinned: true, why: c.why }); continue; }
      }
      const ok = candidates(plot, prefabs, R).filter((c) => c.ok);
      if (!ok.length) continue;
      // deterministic pick, biased toward prefabs that fill the plot well
      const w = ok.map((c) => 1 / (0.3 + Math.abs(Math.log(c.fit))));
      const total = w.reduce((a, b) => a + b, 0);
      let r = (hash(`${R.seed}:${plot.id}`) / 4294967296) * total, k = 0;
      while (k < ok.length - 1 && (r -= w[k]) > 0) k++;
      out.set(plot.id, { prefab: ok[k].prefab, fit: ok[k].fit, pinned: false });
    }
    return out;
  }

  const CityPlacement = { solve, candidates, assign, matchesZone, frameOf, PLOT_TILES, ZONE_KEYS, DEFAULTS };
  if (typeof window !== "undefined") window.CityPlacement = CityPlacement;
  if (typeof module !== "undefined") module.exports = CityPlacement;
})();
