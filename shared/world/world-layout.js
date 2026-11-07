/* shared/world/world-layout.js — the World Scene world as data, with no renderer attached.

   For one seed this builds exactly the city and towers that tools/world-scene/World Scene Next.html
   builds (buildPlacedCity + placeTowersForCity + buildTowerCreatureBody/Ornament there), so another
   view (tools/world-scene/route-scene.html) can stage the identical place. It is a faithful copy of
   that logic, not a re-design: same RNG streams and tags, same LANDMARK_RING reservations, same
   preset picks and sizes. If World Scene Next's layout changes, change it here too.

   Everything comes back in CITY-LOCAL units (shared/city/city-wfc.js RADII: the outer ring is 15.3),
   y up — the space shared/city/creature-city.js already builds in.

     WorldLayout.build(seed, { ringCount = 3 }) -> {
       seed, wfc, clusters: [{ ids, plan }],
       towers: [{ key, spec, seed, x, z, scale, hub }]      // scale: local tower units -> city-local
     }
     WorldLayout.towerGeometry(tower) -> {
       solids: [{ positions, indices }],                    // the tower shell (triangles), city-local
       lines: Float32Array,                                  // creature ornament + body (segment pairs)
       top, crownY                                           // heights, city-local
     }

   Needs (classic scripts, in this order): shared/rng.js, shared/naqsh-pattern-engine.js,
   shared/tower/tower-engine-gl2.js, `window.TowerEngine = window.TowerEngineGL2`,
   shared/tower/tower-presets.js, shared/city/city-wfc.js, shared/creature-arch.js (loaded via
   CreatureArch.load() before towerGeometry), shared/tower/creature-spire.js, shared/city/creature-city.js. */
(function () {
  "use strict";
  // World Scene Next's constants. Its tank width cancels out of every ratio below, so any value works.
  const TANK_W = 1000, CITY_FOOTPRINT_FRAC = 0.4, LANDMARK_RING = 4, RESERVE_ATTEMPTS = 6, MAX_TOWER_CELLS = 3;
  const CITY_SCALE = (TANK_W * 0.4) / 15.3;
  const TALL = new Set(["minaret", "tower", "ab-anbar", "pavilion", "core", "gate"]);

  function habitatScore(s) {
    let h = 0.4;
    for (const t of s.tiers) {
      if (t.band !== "none") h += 0.35;
      if (t.winRows > 0) h += Math.min(0.6, t.winRows * t.winPer * 0.03);
      if (t.ribs > 0) h += 0.15;
      if (t.spN > 0) h += 0.2;
      if (t.pat !== "none") h += 0.3;
      if (t.stair > 0) h += 0.1;
    }
    h += s.halos.length * 0.25;
    if (s.crown.kind !== "flat") h += 0.2;
    if (s.crown.finial) h += 0.15;
    return h;
  }
  function presetKeys() {
    const spire = Object.keys(TowerPresets).filter((k) => TowerPresets[k].s.source && TowerPresets[k].s.source.from === "Spire Forge");
    return spire.length ? spire : Object.keys(TowerPresets);
  }
  const towerTop = (spec, seed) => TowerEngineGL2.buildTowerGL2(spec, RNG.create(seed)).top;

  function build(seed, opts) {
    seed = seed >>> 0;
    const ringCount = opts && opts.ringCount != null ? opts.ringCount : 3;
    const tiles = CityWFC.buildTiles(), belvedereIdx = tiles.findIndex((t) => t.id === "belvedere");
    const ringCells = CityWFC.buildGrid().cells.filter((c) => c.ring === LANDMARK_RING);
    const keys = presetKeys();
    // ring tower plans (World Scene Next: buildPlacedCity, before reservation)
    const planRnd = RNG.create(seed, "towers");
    const cityDiameter = 2 * CITY_FOOTPRINT_FRAC * TANK_W, maxTowerHeight = cityDiameter * 0.25;
    const f0 = ringCells.length ? CreatureCity.frameOf(ringCells[0]) : { width: 1, depth: 1 };
    const cellW = f0.width * CITY_SCALE, radialBudget = f0.depth * CITY_SCALE * 0.48;
    const plans = [];
    for (let i = 0; i < ringCount; i++) {
      const key = keys[Math.floor(planRnd() * keys.length)], towerSeed = Math.floor(planRnd() * 1e9);
      const targetHeight = maxTowerHeight * (0.5 + planRnd() * 0.35), spec = TowerPresets[key].s;
      const localR = Math.max(...spec.tiers.map((t) => Math.max(t.r0, t.r1)));
      const scale = Math.min(targetHeight / Math.max(0.01, towerTop(spec, towerSeed)), radialBudget / Math.max(0.01, localR));
      plans.push({ key, seed: towerSeed, scale, cellsWide: localR * scale * 2 > cellW ? Math.min(MAX_TOWER_CELLS, 3) : 1 });
    }
    // reserve LANDMARK_RING cells, retrying with new selections until the WFC solves
    let wfc = null, clusters = [];
    for (let attempt = 0; attempt < RESERVE_ATTEMPTS && !wfc; attempt++) {
      const reserved = new Set(); clusters = [];
      if (belvedereIdx >= 0 && ringCells.length) {
        const cellRnd = RNG.create(((seed >>> 0) + attempt * 104729) >>> 0, "tower-cells"), step = ringCells.length / Math.max(1, ringCount);
        for (let i = 0; i < ringCount; i++) {
          const idx = Math.floor((i + 0.5) * step + (cellRnd() - 0.5) * step * 0.6), center = ((idx % ringCells.length) + ringCells.length) % ringCells.length;
          const half = (plans[i].cellsWide - 1) / 2, ids = [];
          for (let k = -half; k <= half; k++) { const cell = ringCells[((center + k) % ringCells.length + ringCells.length) % ringCells.length]; reserved.add(cell.id); ids.push(cell.id); }
          clusters.push({ ids, plan: plans[i] });
        }
      }
      const domain = reserved.size ? ((cell) => reserved.has(cell.id) ? [belvedereIdx] : CityWFC.initialDomain(cell, tiles)) : undefined;
      const res = CityWFC.generate(seed, { tiles, domain });
      if (res && res.ok !== false) wfc = res;
    }
    if (!wfc) return null;
    // towers (World Scene Next: placeTowersForCity) — the hub first, then one per reserved cluster
    const rnd = RNG.create(seed, "towers");
    const centerKey = keys.reduce((best, k) => habitatScore(TowerPresets[k].s) > habitatScore(TowerPresets[best].s) ? k : best, keys[0]);
    const centerSeed = Math.floor(rnd() * 1e9), cs = TowerPresets[centerKey].s;
    const towers = [{ key: centerKey, spec: cs, seed: centerSeed, x: 0, z: 0, scale: (maxTowerHeight / Math.max(0.01, towerTop(cs, centerSeed))) / CITY_SCALE, hub: true }];
    for (const cl of clusters) {
      let sx = 0, sy = 0, rm = 0;
      for (const id of cl.ids) { const cell = wfc.cells.find((c) => c.id === id); if (!cell) continue; const f = CreatureCity.frameOf(cell); sx += Math.cos(f.am); sy += Math.sin(f.am); rm = f.rm; }
      const am = Math.atan2(sy, sx);
      // World Scene's tank y is city-local z (its cityModel maps local z -> tank y)
      towers.push({ key: cl.plan.key, spec: TowerPresets[cl.plan.key].s, seed: cl.plan.seed, x: Math.cos(am) * rm, z: Math.sin(am) * rm, scale: cl.plan.scale / CITY_SCALE, hub: false });
    }
    return { seed, wfc, clusters, towers };
  }

  function pickTemplate(kind, rnd) {
    if (TALL.has(kind)) { const r = rnd(); return r < 1 / 3 ? "lighthouse" : r < 2 / 3 ? "spire" : "gothic"; }
    return rnd() < 0.5 ? "hive" : "shrine";
  }
  function hexToRgb3(hex) { const n = parseInt((hex || "#ffffff").slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  // World Scene Next's buildTowerCreatureOrnament + buildTowerCreatureBody, in tower-local space
  function creatureLines(spec, seed, totalH) {
    if (!window.CreatureArch || !CreatureArch.ready) return new Float32Array(0);
    const out = [], glow = hexToRgb3(spec.look.glow || spec.look.accent || "#ffffff");
    { const rnd = RNG.create(seed, "ornament"), kit = CreatureArch.archKits(rnd, ["tower"]).get("tower"), grammar = CreatureArch.makeBandGrammar(rnd, kit);
      let y0 = 0;
      spec.tiers.forEach((tier, i) => {
        const radius = Math.max(0.3, (tier.r0 + tier.r1) / 2) * 1.04;
        const hasOrn = tier.orn && (tier.orn.bay || tier.orn.front || tier.orn.rib || tier.orn.frieze);
        const bandOpts = { grammar, rng: rnd, family: i === 0 ? "base" : "drum", level: i === 0 ? "ground" : null };
        const elev = hasOrn ? CreatureArch.elevFromOrn(tier.orn, 70) : CreatureArch.elevHall(kit, 280, 70, false, bandOpts);
        if (elev.E.length) { const { positions } = CreatureArch.wrapOnSurface(elev, [0, y0, 0], [0, 1, 0], rnd() * Math.PI * 2, radius, tier.h, 1.0, { defaultColor: glow }); for (const v of positions) out.push(v); }
        y0 += tier.h;
      }); }
    { const rnd = RNG.create(seed, "body"), kit = CreatureArch.archKits(rnd, ["tower"]).get("tower"), grammar = CreatureArch.makeBandGrammar(rnd, kit);
      let y0 = 0;
      spec.tiers.forEach((tier, i) => {
        const radius = Math.max(0.3, (tier.r0 + tier.r1) / 2), bandOpts = { grammar, rng: rnd, family: i === 0 ? "base" : "drum", level: i === 0 ? "ground" : null };
        const elev = CreatureArch.elevHall(kit, 280, 70, false, bandOpts);
        if (elev.E.length) { const { positions } = CreatureArch.standElevation(elev, [0, y0, 0], radius, 6, { defaultColor: glow }); for (const v of positions) out.push(v); }
        y0 += tier.h;
      });
      const crownH = Math.max(0, totalH - y0);
      if (crownH > 0.5) {
        const crown = CreatureArch.buildTemplate(pickTemplate("tower", rnd), kit, rnd);
        if (crown.E.length) {
          const top = spec.tiers[spec.tiers.length - 1] || { r1: 1 };
          const { positions } = CreatureArch.standElevation(crown, [0, y0, 0], Math.max(0.3, top.r1), 6, { defaultColor: glow });
          let maxY = 0; for (let i = 1; i < positions.length; i += 3) if (positions[i] > maxY) maxY = positions[i];
          const k = maxY > 0.001 ? crownH / maxY : 1;
          for (let i = 0; i < positions.length; i++) out.push(i % 3 === 1 ? positions[i] * k : positions[i]);
        }
      } }
    return new Float32Array(out);
  }

  function towerGeometry(t) {
    const built = TowerEngineGL2.buildTowerGL2(t.spec, RNG.create(t.seed));
    const xf = (src) => { const p = new Float32Array(src.length); for (let i = 0; i < src.length; i += 3) { p[i] = src[i] * t.scale + t.x; p[i + 1] = src[i + 1] * t.scale; p[i + 2] = src[i + 2] * t.scale + t.z; } return p; };
    const solids = built.parts.filter((p) => p.mode !== "points" && p.mode !== "lines" && p.indices && p.indices.length).map((p) => ({ positions: xf(p.positions), indices: p.indices, tag: p.materialTag }));
    const lines = xf(creatureLines(t.spec, t.seed, built.top));
    // the crown: the top tier's upper edge, where World Scene's lantern-like glow sits
    let y = 0; for (const tier of t.spec.tiers) y += tier.h;
    return { solids, lines, top: built.top * t.scale, crownY: Math.min(built.top, y + (built.top - y) * 0.35) * t.scale };
  }

  window.WorldLayout = { build, towerGeometry, habitatScore, LANDMARK_RING };
})();
