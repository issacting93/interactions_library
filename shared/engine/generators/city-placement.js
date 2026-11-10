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
 *   The city's own words. The solver's tile ids (city-wfc.js) come from the old desert round city;
 *   Forge names them for this world instead: a central Tower with the University round it, markets
 *   where avenues cross, housing in tiers (villas high, tenements low), gardens, shrines and water.
 *     CityPlacement.VOCAB[tileId] = { name, note }     ZONE_NAMES[zone]     GATE_NAMES
 *     CityPlacement.tileName(tileId, ring?)            housing reads by tier: ring 4 villa, 5 townhouse, 6 tenement
 *
 *   Pins. recipe.pins[cellId] = tileId fixes what one cell is; the solver then rebuilds the rest of
 *   the city round it, so streets and walls still meet. A pin that leaves no connected city fails
 *   the solve ({ ok: false }) and the caller takes it back.
 *     CityPlacement.options(cell) -> [{ id, name, note, tile, current }]   what may stand in that cell
 *
 * Depends on CityWFC and Terrain. Pure; classic script, also loads under Node.
 */
(function () {
  "use strict";
  const G = typeof window !== "undefined" ? window : global;
  const PLOT_TILES = ["core", "minaret", "bayt-al-hikma", "caravanserai", "madrasa", "masjid", "hammam", "bimaristan", "ab-anbar", "belvedere", "pavilion", "tower", "gate"];
  const ZONE_KEYS = ["core", "sanctum", "bazaar", "housing", "garden", "wall"];
  const DEFAULTS = { seed: 7, pxPerUnit: 300, tolerance: 1.1, maxSlope: 0.09, maxFlood: 0.34, houses: false, rules: {}, overrides: {}, pins: {} };
  const ZONE_NAMES = { core: "The Tower", sanctum: "University", bazaar: "Markets", housing: "Housing", garden: "Gardens", wall: "Wall" };
  const GATE_NAMES = ["Dawn Gate", "River Gate", "Dusk Gate", "Hill Gate"];
  const VOCAB = {
    "core": ["The Tower", "The main tower at the centre. Everything in the city faces it."],
    "iwan": ["Tower gate", "A gateway from the Tower's court onto a radial avenue."],
    "fountain": ["Spring court", "A pool fed by the spring under the Tower; closed to the markets behind it."],
    "minaret": ["Lesser tower", "A smaller tower on the edge of the court, raised as the city grew."],
    "bayt-al-hikma": ["University hall", "Library and lecture hall: the University stands round the Tower."],
    "avenue": ["Avenue", "A radial street lined with stalls."],
    "chaharsu": ["Market crossing", "An open square where an avenue crosses the market arcade: a place to gather and eat."],
    "chaharsu-t": ["Market crossing, inner end", "The avenue ends at the arcade."],
    "chaharsu-o": ["Market crossing, outer start", "The avenue leaves the arcade outward."],
    "arcade": ["Market arcade", "A covered market street running round the ring."],
    "arcade-end": ["Arcade end", "The arcade stops at a shopfront."],
    "caravanserai": ["Market hall", "A courtyard hall for traders and their stores."],
    "madrasa": ["School", "A small elementary school at the end of a street."],
    "avenue-h": ["Avenue", "A radial street between houses."],
    "lane": ["Ring lane", "A lane running round the quarter."],
    "cross": ["Crossroads", "An avenue meets a ring lane."],
    "t-in": ["Junction, avenue ends", "An avenue meets a lane and stops."],
    "t-out": ["Junction, avenue starts", "An avenue leaves a lane outward."],
    "t-side": ["Junction, side lane", "A lane branches off one side of the avenue."],
    "bend-in": ["Bend, inward", "An avenue turns into a lane."],
    "bend-out": ["Bend, outward", "A lane turns outward."],
    "house": ["House", "Housing in tiers: larger houses high and near the Tower, dense rows lower down."],
    "kucheh": ["Close", "A dead-end court ending at house doors."],
    "kucheh-o": ["Close, outer", "A dead-end court reached from outside."],
    "kucheh-s": ["Close, side", "A dead-end court off a ring lane."],
    "hammam": ["Bathhouse", "A bathhouse over warm water."],
    "bimaristan": ["Infirmary", "Wards and a dispensary round a running channel."],
    "masjid": ["Wayside shrine", "A small shrine at the head of a lane, for the quarter's own spirit."],
    "qanat": ["Canal", "Water running through the quarter in an open channel."],
    "ab-anbar": ["Well house", "A roofed well where the canal ends."],
    "belvedere": ["Open court", "Kept open for a free-standing landmark. The solver never chooses it; pin it where you want room."],
    "orchard": ["Orchard", "Rows of fruit trees."],
    "pool-garden": ["Pond garden", "A garden round a still pond."],
    "pavilion": ["Garden shrine", "A small shrine on posts among the trees."],
    "garden-path": ["Garden avenue", "An avenue running through to a gate."],
    "garden-end": ["Garden walk", "An avenue ends in the gardens."],
    "garden-canal": ["Rill", "Canal water crossing the gardens."],
    "wall": ["Curtain wall", "The round wall."],
    "tower": ["Watchtower", "A round tower on the wall."],
    "gate": ["City gate", "One of four gates, at the cardinal points."],
    "inlet": ["Water gate", "Where the canal passes under the wall."],
  };
  for (const k in VOCAB) VOCAB[k] = { name: VOCAB[k][0], note: VOCAB[k][1] };
  const HOUSE_TIERS = { 4: "Villa", 5: "Townhouse", 6: "Tenement row" };
  const tileName = (id, ring) => (id === "house" && HOUSE_TIERS[ring]) || (VOCAB[id] ? VOCAB[id].name : id);

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
    // pins: a pinned cell's choices shrink to that one tile (and its mirror); the rest solve round it
    const pins = R.pins || {}, hasPins = Object.keys(pins).length > 0;
    const domain = hasPins ? (c) => {
      const all = CW.initialDomain(c, tiles), pin = pins[c.id];
      if (!pin) return all;
      const only = tiles.filter((t) => baseId(t) === pin && t.zone === c.zone).map((t) => t.index);
      return only.length ? only : all;
    } : undefined;
    const wfc = CW.generate(R.seed >>> 0, { weight, domain });
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
    const names = { core: "sacred core the tower", sanctum: "sanctum ring university", bazaar: "bazaar ring markets", housing: "mahalle quarters housing", garden: "gardens", wall: "round wall" };
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

  // what may stand in a cell: every tile the grammar allows there (a gate cell only a gate, an
  // avenue cell only pieces an avenue runs through), each once, the current one first
  function options(cell) {
    const CW = G.CityWFC, tiles = CW.buildTiles(), seen = new Set(), cur = cell.tile ? baseId(cell.tile) : null, out = [];
    for (const i of CW.initialDomain(cell, tiles)) {
      const t = tiles[i], id = baseId(t); if (seen.has(id)) continue; seen.add(id);
      out.push({ id, name: tileName(id, cell.ring), note: (VOCAB[id] || {}).note || t.note, tile: t, current: id === cur, plot: PLOT_TILES.includes(id) });
    }
    return out.sort((a, b) => (b.current - a.current) || (b.plot - a.plot) || b.tile.weight - a.tile.weight);
  }

  const CityPlacement = { solve, candidates, assign, matchesZone, frameOf, options, tileName, PLOT_TILES, ZONE_KEYS, DEFAULTS, VOCAB, ZONE_NAMES, GATE_NAMES };
  if (typeof window !== "undefined") window.CityPlacement = CityPlacement;
  if (typeof module !== "undefined") module.exports = CityPlacement;
})();
