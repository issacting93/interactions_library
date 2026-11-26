// world/scenes/world-scene/src/city.js -- World Scene: The city: the grammar city's instanced geometry, walkers on the street network, the creature-part architecture over it.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- city: shared/engine/city/city-mesh-gl2.js's output is thousands of instances of a handful of
// base shapes (box/cyl/oct/hemi/sphere/cone) plus a few hundred bespoke pieces (ribbons, screens,
// sector slabs). The repeated shapes are drawn instanced (one draw call per base-shape/material
// pair, a per-instance mat4 attribute instead of a uniform); the bespoke ones reuse towerProg/
// uploadGeoPart exactly like a placed tower's parts do, since both are just {positions,normals,
// uv,indices,materialTag,matrix} with no per-vertex colour.
const IDENTITY4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
// applies a column-major mat4 to a flat Float32Array of xyz triples in place (affine, w=1 implied)
function mat4TransformPoints(positions, m) {
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    positions[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    positions[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    positions[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return positions;
}

// a ring cell's centre and size (mid radius, mid angle, radial depth, arc width)
function cellFrame(cell) {
  if (cell.ring === 0) return { rm: 0, am: 0, depth: cell.r1 * 2, width: cell.r1 * 2 };
  const rm = (cell.r0 + cell.r1) / 2, am = (cell.a0 + cell.a1) / 2;
  return { rm, am, depth: cell.r1 - cell.r0, width: rm * (cell.a1 - cell.a0) };
}
let lastWfc = null, lastCitySeed = 0, lastCityModel = null;
// WFC cell ids a landmark ring tower is standing on — chosen and pinned BEFORE the WFC solves
// (see buildPlacedCity below), not reserved after the fact. placeTowersForCity reads this set to
// find each reserved cell's real centre for the tower's position.
let reservedCityCellIds = new Set();
// Parallel, richer structure alongside reservedCityCellIds (2026-11-03): [{ ids:[cellId,...], plan
// }], one entry per ring tower -- `ids` is the (possibly >1-cell) cluster reserved for that tower,
// `plan` is its precomputed { key, seed, scale, cellsWide } from buildPlacedCity. placeTowersForCity
// reads this instead of re-deriving picks/positions itself (see the footprint-overlap fix below).
let reservedTowerClusters = [];
// Landmark ring towers used to sit at a free-floating (radius, random angle) with zero awareness
// of the city plan; later they were snapped to a real WFC cell but still only RESERVED after the
// fact (skip building there, hope the neighbours still look sane). 2026-11-02: towers are now
// WFC-native — "treated as occupying tiles the WFC has to build around" (the user's own framing).
// Before CityWFC.generate() ever runs, ringCount cells on LANDMARK_RING are pinned to
// packages/city/city-wfc.js's zero-weight 'belvedere' tile (opts.domain, forwarded through generate() to
// solve()) — the solver then collapses every neighbouring street/building AROUND a real, grammar-
// legal "this cell is closed off" tile, the same way it already handles an ordinary house, instead
// of a tower being dropped onto whatever the solver happened to put there afterward.
// How many different RESERVED-CELL selections to try before giving up. CityWFC.generate() already
// retries 20 times internally, but every one of those retries only varies the solver's own seed —
// the set of cells pinned to 'belvedere' is fixed by the caller BEFORE generate() ever runs, so if
// that particular selection is itself unsolvable (two reserved cells landing somewhere the grammar
// can't route streets around), all 20 internal attempts fail for the same reason. Measured directly
// against the live solver (2026-11-03): ringCount=3 (the boot default) fails ~28.5% of the time with
// a single reservation choice, ringCount=6 (max) ~48.5% — high enough that `placedTowers` was
// routinely left empty, which crashed the Tower panel's Atlas/Variations init on a sizeable fraction
// of page loads (see RESERVE_ATTEMPTS' call site below and the defensive `placedTowers[curTowerIdx]`
// guards near the Atlas/Variations/profile-editor wiring, kept as a second line of defense in case
// every attempt here still fails). Re-rolling WHICH cells get reserved (not just the solver's seed)
// before retrying knocks the failure rate down geometrically (~0.285^6 for ringCount=3).
const RESERVE_ATTEMPTS = 6;
// Max angularly-adjacent LANDMARK_RING cells a single ring tower may reserve (always odd, centred
// on its originally-picked cell). See the footprint-overlap fix below buildPlacedCity's own
// reservation loop: a tower's real footprint can be 2x+ a single cell's width, so one cell was
// never enough space to guarantee the WFC's own neighbouring buildings (built flush to whatever
// it WASN'T told to reserve) don't visually overlap it.
const MAX_TOWER_CELLS = 3;
function buildPlacedCity(seed, ringCount) {
  ringCount = ringCount == null ? 3 : ringCount;
  const tiles = CityWFC.buildTiles();
  const belvedereIdx = tiles.findIndex(tl => tl.id === 'belvedere');
  const ringCells = CityWFC.buildGrid().cells.filter(c => c.ring === LANDMARK_RING);
  // cityScale only depends on tankW()/the solver's fixed RADII, not on the WFC result itself, so
  // it's safe to compute up front (needed below to size each ring tower's footprint in real tank
  // units before any cell gets reserved).
  const cityScale = (tankW() * 0.4) / 15.3;   // 15.3 = packages/city/city-wfc.js's RADII outer ring

  // Towers overlapping neighbouring buildings, fixed (2026-11-03): ring towers are picked from 8
  // very differently-proportioned Spire Forge presets (lighthouse/spire/hive/shrine x2 each) --
  // a 'shrine'/'hive' preset (explicitly "widest base"/"single squat wide terrace" per
  // creature-arch.js's own template docs) scaled to the SAME target HEIGHT as a thin 'spire'
  // preset comes out with a dramatically wider FOOTPRINT (confirmed live: 667 tank units across
  // vs. a single LANDMARK_RING cell's own ~300-wide/~290-deep footprint) -- reserving exactly one
  // cell, as the previous pass did, left the solver building ordinary flush-walled neighbours
  // right up against a tower that was actually more than twice that cell's size, so the
  // neighbours visibly poked into the tower from every side. Fixed two ways, together, by
  // precomputing each ring tower's preset/seed/scale BEFORE any cell gets reserved (previously
  // this picking happened in placeTowersForCity, AFTER the WFC had already solved, too late to
  // size the reservation by it):
  //   1. scale is now capped by a RADIAL footprint budget (half one ring cell's own depth, with a
  //      small margin) as well as by the height target -- reserving more cells WIDE can't help
  //      the radial direction (a ring's depth is fixed), so this is the hard limit that actually
  //      guarantees no radial overlap into the ring inside/outside LANDMARK_RING.
  //   2. the reservation itself widens to up to MAX_TOWER_CELLS angularly-adjacent cells when
  //      even the now-capped footprint's angular extent still needs more than one cell's width.
  const towerPlanRnd = RNG.create(seed, 'towers');   // same stream/tag placeTowersForCity used to own alone -- moved here so picks happen before reservation, not after
  const pool = towerPool(), keys = pool.keys, ringOrder = pool.forge ? forgeRingOrder(pool, seed) : null;
  const cityDiameter = 2 * CITY_FOOTPRINT_FRAC * tankW();
  const maxTowerHeight = cityDiameter * 0.25;
  const cellFrame0 = ringCells.length ? cellFrame(ringCells[0]) : { width: 1, depth: 1 };
  const cellWTank = cellFrame0.width * cityScale, cellDTank = cellFrame0.depth * cityScale;
  const radialBudget = cellDTank * 0.48;   // just under half the ring's own depth -- the hard cap, see note above
  const ringPlans = [];
  for (let i = 0; i < ringCount; i++) {
    let key = keys[Math.floor(towerPlanRnd() * keys.length)];
    const towerSeed = Math.floor(towerPlanRnd() * 1e9);
    const targetHeight = maxTowerHeight * (0.5 + towerPlanRnd() * 0.35);   // shorter than the hub, some variety
    if (ringOrder) key = pool.spec[forgeSites[i + 1]] ? forgeSites[i + 1] : ringOrder[i % ringOrder.length];   // Forge buildings: the designer's choice for this site, else each in turn
    const spec = pool.spec[key];
    const dims = towerDims(spec, towerSeed), localR = dims.r, localTop = dims.top;
    const scale = Math.min(targetHeight / Math.max(0.01, localTop), radialBudget / Math.max(0.01, localR));
    const footprintR = localR * scale;
    const cellsWide = footprintR * 2 > cellWTank ? Math.min(MAX_TOWER_CELLS, 3) : 1;
    ringPlans.push({ key, spec, seed: towerSeed, scale, cellsWide, targetHeight, radialBudget });
  }

  let wfc = null;
  for (let attempt = 0; attempt < RESERVE_ATTEMPTS && !wfc; attempt++) {
    reservedCityCellIds = new Set();
    reservedTowerClusters = [];
    if (belvedereIdx >= 0 && ringCells.length) {
      // offset into the 'tower-cells' stream per attempt so a retry picks DIFFERENT cells, not
      // just a different solver seed for the same (possibly unsolvable) reservation
      const cellRnd = RNG.create(((seed >>> 0) + attempt * 104729) >>> 0, 'tower-cells');
      const step = ringCells.length / Math.max(1, ringCount);
      for (let i = 0; i < ringCount; i++) {
        const idx = Math.floor((i + 0.5) * step + (cellRnd() - 0.5) * step * 0.6);
        const centerIdx = ((idx % ringCells.length) + ringCells.length) % ringCells.length;
        const half = (ringPlans[i].cellsWide - 1) / 2;
        const ids = [];
        for (let k = -half; k <= half; k++) {
          const ci = ((centerIdx + k) % ringCells.length + ringCells.length) % ringCells.length;
          const cell = ringCells[ci];
          reservedCityCellIds.add(cell.id);
          ids.push(cell.id);
        }
        reservedTowerClusters.push({ ids, plan: ringPlans[i] });
      }
    }
    const domain = reservedCityCellIds.size
      ? (cell => reservedCityCellIds.has(cell.id) ? [belvedereIdx] : CityWFC.initialDomain(cell, tiles))
      : undefined;
    const res = CityWFC.generate(seed >>> 0, { tiles, domain });
    if (res && res.ok !== false) wfc = res;
  }
  if (!wfc) { console.warn('[world-scene] city generation failed for seed', seed, 'after', RESERVE_ATTEMPTS, 'reservation attempts'); return; }
  lastWfc = wfc; lastCitySeed = seed >>> 0;   // retained so creatureArchReady's callback / the habitat-tint toggle can rebuild without a full city regeneration
  buildCityWalkerGraph(wfc);
  buildCellsByRing(wfc);
  const tankX = tankW() / 2, tankY = tankH() / 2, baseZ = tankDepth() * 0.92;
  // same local-up -> tank-depth remap as buildPlacedTower's `model`, baked into every instance
  // matrix once here rather than re-applied per vertex per frame
  const cityModel = new Float32Array([
    cityScale, 0, 0, 0,
    0, 0, -cityScale, 0,
    0, cityScale, 0, 0,
    tankX, tankY, baseZ, 1,
  ]);
  lastCityModel = cityModel;
  for (const tw of placedTowers) disposeTowerEntry(tw);
  placedTowers = placeTowersForCity(wfc, seed, cityScale, tankX, tankY, reservedTowerClusters);
  rebuildCityCreatureGeometry();
  cityGridLines = buildCityGridLines(cityModel);
  rebuildRouteAtmo(seed, tankX, tankY, baseZ, cityDiameter / 2);
}
// Builds (or rebuilds in place) the city you see: the city grammar for this seed (2026-11-07: replaced
// creature-city.js's block-per-cell city, whose neighbours never shaped each other). Its fills are drawn
// in the style recipes (drawCity); its line drawing is the city's wireframe in every style, faint white
// in Glitch so hundreds of additive segments don't blow out. Called from buildPlacedCity, once the
// grammar sheets arrive, and from creatureArchReady's callback.
const CITY_LINE_OPACITY = 0.3;   // uAlpha for the city's instanced creature-line draw (drawCreatureLines) — towers stay at full alpha, this is city-only
let cityOccluderParts = [];   // [{vao, count, matrix, tone}] — the grammar city's fills (buildings, terraces, water, gardens), drawn in the style recipes only
function rebuildCityCreatureGeometry() {
  for (const p of cityOccluderParts) gl.deleteVertexArray(p.vao);
  cityOccluderParts = [];
  for (const g of cityCreatureLineGroups) gl.deleteVertexArray(g.vao);
  cityCreatureLineGroups = [];
  if (!grammarSheet || !lastCityModel) return;
  // the city grammar, built for this seed, kept clear of the towers this scene stands itself
  const s = lastCityModel[0], cx = lastCityModel[12], cy = lastCityModel[13];
  const reserve = placedTowers.map(tw => ({ x: (tw.pos[0] - cx) / s, z: (tw.pos[1] - cy) / s,
    r: (tw.footR || Math.max(...tw.spec.tiers.map(t => Math.max(t.r0, t.r1)))) * tw.scale / s + 0.35 }));
  grammarCity = CityGrammar.build(lastCitySeed, grammarSheet, { reserve, pins: forgePins || undefined });
  const m = CityGrammarMesh.build(grammarCity, { tower: false, outskirts: false });
  const seq = (n) => { const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; return ix; };
  for (const [k, tone] of [['ground', 0.02], ['water', 0.22], ['green', -0.12], ['bldg', -0.1]]) {
    const part = m[k]; if (!part.positions.length) continue;
    cityOccluderParts.push({ ...uploadGeoPart({ positions: part.positions, normals: part.normals, indices: seq(part.positions.length / 3), mode: 'triangles', materialTag: 'city-' + k }), matrix: lastCityModel, tone });
  }
  // the line drawing: one instance at the city model; Glitch draws it as the faint glowing wireframe
  const vg = uploadLineInstanceGroup({ positions: m.lines, colors: new Float32Array(m.lines.length).fill(1) }, [lastCityModel]);
  vg.ranks = [0];
  cityCreatureLineGroups = [vg];
  if (typeof refreshCityGenPanels === 'function') refreshCityGenPanels();
}
grammarReady.then(() => { if (grammarSheet) rebuildCityCreatureGeometry(); });
// City tab "Layers > Radial grid": the ring/wedge outlines CityWFC.RADII/RINGS solves against,
// same idea as Round City Generator's own debug grid -- built once per "New world" (static,
// tiny: a few hundred segments) and only drawn when S.showGrid is on.
let cityGridLines = null;
// City tab "Growth": cityRevealStart defaults far enough in the past that cityRevealCount's
// elapsed-cells number is already huge on the very first frame, so the city's first-ever build
// (before the main loop's `t` clock even exists yet) shows fully formed, not an animated grow-in —
// "New world" and "Replay collapse" explicitly set cityRevealStart = t (both run from DOM event
// handlers, well after `t` exists) to actually play the reveal; "Skip to finished" resets to this
// same far-past default.
let cityRevealStart = -1e6, cityRevealSpeed = 150;   // cells revealed per second
function buildCityGridLines(cityModel) {
  const pos = [], col = [0.35, 0.85, 0.82];
  const SEG = 96;
  for (const R of CityWFC.RADII) {
    if (R <= 0) continue;
    for (let k = 0; k < SEG; k++) {
      const a0 = k / SEG * Math.PI * 2, a1 = (k + 1) / SEG * Math.PI * 2;
      pos.push(R * Math.cos(a0), 0, R * Math.sin(a0), R * Math.cos(a1), 0, R * Math.sin(a1));
    }
  }
  for (let r = 0; r < CityWFC.RINGS.length; r++) {
    const n = CityWFC.RINGS[r], r0 = CityWFC.RADII[r], r1 = CityWFC.RADII[r + 1];
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      pos.push(r0 * Math.cos(a), 0, r0 * Math.sin(a), r1 * Math.cos(a), 0, r1 * Math.sin(a));
    }
  }
  const positions = new Float32Array(pos), colors = new Float32Array(positions.length);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = col[0]; colors[i + 1] = col[1]; colors[i + 2] = col[2]; }
  mat4TransformPoints(positions, cityModel);
  return uploadLinePart({ positions, color: colors });
}

// ---------- Walkers: small agents roaming the real street network, City tab > Layers toggle
// (2026-11-03). A lightweight, non-physical roaming-point system -- each walker sits on a real
// street/avenue WFC cell and glides across that cell's angular span; when it reaches the far edge
// it steps to the next street cell on the same ring (angularly sorted), occasionally hopping to a
// radially-adjacent ring's street cell at a similar angle instead (an "avenue crossing"). Positions
// are recomputed on the CPU every frame and pushed into one small persistent DYNAMIC_DRAW buffer
// via gl.bufferSubData (not a VAO rebuilt per frame) -- cheap even redone every frame at this count.
const WALKER_COUNT = 40;
let cityWalkerRings = [];   // [[cell, cell, ...] angularly sorted] -- one array per ring that has street cells
let cityWalkers = [];       // [{ ring, idx, t, dir, speed }]
let walkerBuf = null;       // lazily-created { vao, posBuf, colBuf }
function buildCityWalkerGraph(wfc) {
  const byRing = new Map();
  for (const cell of wfc.cells) {
    const tile = wfc.tiles[wfc.result[cell.id]];
    if (!tile) continue;
    const kind = tile.base || tile.id;
    if (!CityWFC.STREET_KINDS.includes(kind)) continue;
    if (!byRing.has(cell.ring)) byRing.set(cell.ring, []);
    byRing.get(cell.ring).push(cell);
  }
  cityWalkerRings = [...byRing.values()].map(cells => cells.slice().sort((a, b) => a.a0 - b.a0));
  cityWalkers = [];
  if (!cityWalkerRings.length) return;
  for (let i = 0; i < WALKER_COUNT; i++) {
    const ring = Math.floor(Math.random() * cityWalkerRings.length), cells = cityWalkerRings[ring];
    if (!cells.length) continue;
    cityWalkers.push({ ring, idx: Math.floor(Math.random() * cells.length), t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, speed: 0.18 + Math.random() * 0.3 });
  }
}
// Ring-bucket cell index (2026-11-03): pickCellAt (near the other picking functions, below) used to
// linearly scan all ~280 wfc.cells on every click; the README itself flagged this as "fine at this
// scale, would want a radix/ring-bucket index if cell counts grew by an order of magnitude".
// Grouping cells by ring once per city regen (here, not per click) and narrowing the scan to the
// one ring a click's radius falls in gets most of that benefit for free, without changing which
// cell gets picked. Built here (not down by pickCellAt itself) so it's defined before
// buildPlacedCity's own boot-time call further down the script, which calls it immediately.
let cellsByRing = new Map();
function buildCellsByRing(wfc) {
  cellsByRing = new Map();
  for (const cell of wfc.cells) {
    if (!cellsByRing.has(cell.ring)) cellsByRing.set(cell.ring, []);
    cellsByRing.get(cell.ring).push(cell);
  }
}
function ringIndexForRadius(r) {
  const RADII = CityWFC.RADII;
  for (let i = 0; i < RADII.length - 1; i++) if (r >= RADII[i] && r < RADII[i + 1]) return i;
  return -1;
}
function stepCityWalkers(dt) {
  if (!S.showWalkers || !cityWalkerRings.length) return;
  for (const w of cityWalkers) {
    const cells = cityWalkerRings[w.ring]; if (!cells || !cells.length) continue;
    w.t += w.dir * w.speed * dt;
    if (w.t >= 1 || w.t <= 0) {
      w.idx = ((w.idx + (w.dir > 0 ? 1 : -1)) % cells.length + cells.length) % cells.length;
      w.t = w.dir > 0 ? 0 : 1;
      if (Math.random() < 0.12 && cityWalkerRings.length > 1) {   // occasional avenue crossing to a different ring
        const am = ((cells[w.idx].a0 + cells[w.idx].a1) / 2);
        let bestRing = -1, bestIdx = 0, bestD = 0.3;
        cityWalkerRings.forEach((rg, ri) => {
          if (ri === w.ring) return;
          rg.forEach((c, ci) => { const d = Math.abs((c.a0 + c.a1) / 2 - am); if (d < bestD) { bestD = d; bestRing = ri; bestIdx = ci; } });
        });
        if (bestRing >= 0) { w.ring = bestRing; w.idx = bestIdx; }
      }
    }
  }
}
function ensureWalkerBuf() {
  if (walkerBuf) return walkerBuf;
  const maxVerts = WALKER_COUNT * 2, bytes = maxVerts * 3 * 4;
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const colBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return (walkerBuf = { vao, posBuf, colBuf });
}
function drawCityWalkers(tt) {
  if (window.ENVX && ENVX.hides('walkers')) return;
  if (!S.showWalkers || !lastCityModel || !cityWalkers.length) return;
  const buf = ensureWalkerBuf();
  const cityScale = lastCityModel[0], tankX = lastCityModel[12], tankY = lastCityModel[13], baseZ = lastCityModel[14];
  const dth = 0.012, wh = 0.14;   // tangential tick half-angle (rad), lift above ground (city-local units)
  const pos = new Float32Array(cityWalkers.length * 2 * 3), col = new Float32Array(cityWalkers.length * 2 * 3);
  let vi = 0;
  for (const w of cityWalkers) {
    const cells = cityWalkerRings[w.ring]; if (!cells || !cells.length) continue;
    const cell = cells[w.idx], am = cell.a0 + (cell.a1 - cell.a0) * w.t, rm = (cell.r0 + cell.r1) / 2;
    const rgb = S.habitatTint ? (CREATURE_ZONE_GLOW[cell.zone] || CREATURE_UNIFORM_GLOW) : CREATURE_UNIFORM_GLOW;
    for (const a of [am - dth, am + dth]) {
      pos[vi * 3] = tankX + Math.cos(a) * rm * cityScale;
      pos[vi * 3 + 1] = tankY + Math.sin(a) * rm * cityScale;
      pos[vi * 3 + 2] = baseZ - (wh + CityGrammar.groundY(rm)) * cityScale;   // on the terrace at that radius
      col[vi * 3] = rgb[0]; col[vi * 3 + 1] = rgb[1]; col[vi * 3 + 2] = rgb[2];
      vi++;
    }
  }
  if (!vi) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos.subarray(0, vi * 3));
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.colBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, col.subarray(0, vi * 3));
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(creatureLineProg.p);
  const u = creatureLineProg.u;
  gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX);
  gl.uniformMatrix4fv(u.uModel, false, IDENTITY4); gl.uniform1f(u.uAlpha, 1.0);
  gl.bindVertexArray(buf.vao); gl.drawArrays(gl.LINES, 0, vi);
  gl.disable(gl.BLEND); gl.depthMask(true);
}
// shared/engine/city/creature-city.js's occluder (a single combined triangle mesh built from the exact same
// Block Forge blocks/towers as the visible wireframe) draws here as one uniform solid material.
// Glitch style still skips it entirely (the 2026-11-02 "wireframe-only, no solid mesh at all" look,
// see rebuildCityCreatureGeometry's note above) — this only runs for Route style, where the city
// needs real buildings instead of empty space behind the glowing lines.
// Route style's own flat, slightly-lit fill (uUnlit stays off so facades still read as volumes, not
// a flat silhouette like the ridge ring) -- sage body, unlike Glitch's near-black depth-only tint.
const CITY_OCCLUDER_ROUTE_TINT = [0.4, 0.34, 0.26];
function drawCity(t, glowPass) {
  if (window.ENVX && ENVX.hides('city')) return;
  if (glowPass || !cityOccluderParts.length || !styled()) return;   // Glitch keeps the wireframe-only look
  gl.useProgram(towerProg.p);
  const u = towerProg.u;
  gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX); gl.uniform3fv(u.uCam, cam.eye);
  gl.uniform3f(u.uTint, CITY_OCCLUDER_ROUTE_TINT[0] * S.routeBright, CITY_OCCLUDER_ROUTE_TINT[1] * S.routeBright, CITY_OCCLUDER_ROUTE_TINT[2] * S.routeBright);
  gl.uniform1f(u.uUnlit, 0); gl.uniform1f(u.uUseTex, 0); gl.uniform1f(u.uCutout, 0); gl.uniform1f(u.uAlpha, 1.0);
  for (const p of cityOccluderParts) {
    styleFlat(u, p.tone);
    gl.uniformMatrix4fv(u.uModel, false, p.matrix);
    gl.bindVertexArray(p.vao);
    gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_INT, 0);
  }
  gl.bindVertexArray(null);
  gl.uniform1f(u.uRoute, 0);
}
// switch towerProg into the current style recipe's fill for this draw (needs the atmosphere world for
// the lantern positions and the band range; without it, falls back to the lit look)
function styleFlat(u, tone) {
  if (!atmoWorld || !routeAtmoCtx) { gl.uniform1f(u.uRoute, 0); return; }
  gl.uniform1f(u.uRoute, 1);
  routeAtmoCtx.recipe = curStyle;
  RouteAtmoGL2.setStyle(gl, u, routeAtmoCtx, atmoWorld, cam, tone + (S.routeBright - 1) * 0.25);
}

// ---------- creature-part architecture: the city's real visible identity ----------
// packages/kit/creature-arch.js turns the 347-piece sigil-creature sheet into glowing line-art
// buildings; this ties it to the city's own WFC cells (reusing their zone/kind/footprint) and to
// placed towers (wrapped onto each tier's curved surface), all drawn with creatureLineProg.
const CREATURE_ZONE_GLOW = {
  core: [0.65, 0.45, 1.0], sanctum: [0.9, 0.7, 0.3], bazaar: [0.3, 0.9, 0.85],
  housing: [0.45, 0.95, 0.55], garden: [0.5, 1.0, 0.65], wall: [0.35, 0.55, 0.95],
};
const CREATURE_UNIFORM_GLOW = [0.55, 0.95, 0.78];   // used instead of CREATURE_ZONE_GLOW when the City tab's "Habitat tint" layer is off
// matches packages/kit/creature-arch.js's own (internal, unexported) TALL_KINDS table — mirrored here so
// city buildings can pick a matching-silhouette template (lighthouse/spire/gothic for tall kinds,
// hive/shrine for everything else) rather than every building using the same generic elevTower/elevHall
const CREATURE_TALL_KINDS = new Set(['minaret', 'tower', 'ab-anbar', 'pavilion', 'core', 'gate']);
// 'gothic' added 2026-11-02 (architecture-research follow-up, CreatureArch.TEMPLATE_NAMES' 5th
// entry) as a 3-way pick alongside lighthouse/spire for every tall-kind crown, including placed
// towers (buildTowerCreatureBody calls pickCreatureTemplate('tower', rnd) for its own crown).
function pickCreatureTemplate(kind, rnd) {
  if (CREATURE_TALL_KINDS.has(kind)) { const r = rnd(); return r < 1 / 3 ? 'lighthouse' : r < 2 / 3 ? 'spire' : 'gothic'; }
  return rnd() < 0.5 ? 'hive' : 'shrine';
}
let cityCreatureLineGroups = [];   // [{vao, vertCount, instCount, ranks}] — one per distinct creature-city.js instance group (see rebuildCityCreatureGeometry above)
// City tab "Growth": how many of a group's (solve-rank-sorted) instances should be visible at
// time `now` (seconds). cityRevealStart/-Speed are set by startCityReveal()/the speed slider;
// cityRevealStart defaults far in the past so a fresh page load shows the finished city, not a
// slow grow-in every time.
function cityRevealCount(g, now) {
  const elapsed = Math.max(0, (now - cityRevealStart) * cityRevealSpeed);
  const ranks = g.ranks;
  let lo = 0, hi = ranks.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ranks[mid] < elapsed) lo = mid + 1; else hi = mid; }
  return lo;
}
function drawCreatureLines(t, glowPass) {
  if (window.ENVX && ENVX.hides('city')) return;
  if (glowPass && styled()) return;   // Route Zero: the line drawing is a faint pencil accent over flat fills, never a bloom source
  if (cityCreatureLineGroups.length) {
    gl.useProgram(creatureLineInstProg.p);
    const ui = creatureLineInstProg.u;
    gl.uniformMatrix4fv(ui.uVP, false, cam.vp); gl.uniform1f(ui.uShift, cam.shift); gl.uniform1f(ui.uShiftX, cam.shiftX);
    gl.uniform1f(ui.uAlpha, glowPass ? 0.35 : CITY_LINE_OPACITY);
    for (const g of cityCreatureLineGroups) {
      const n = Math.min(g.instCount, cityRevealCount(g, t));
      if (n <= 0) continue;
      gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.LINES, 0, g.vertCount, n);
    }
  }
  if (placedTowers.some(tw => tw.creatureOrnament || tw.creatureBody)) {
    gl.useProgram(creatureLineProg.p);
    const u = creatureLineProg.u;
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX);
    gl.uniform1f(u.uAlpha, glowPass ? 0.35 : 1.0);
    gl.uniformMatrix4fv(u.uModel, false, IDENTITY4);
    // Growth reveal now covers towers too (2026-11-03 follow-up; was city-buildings-only before) --
    // same elapsed-cells clock as cityRevealCount, gated on each tower's own revealRank (hub = 0,
    // ring towers = their reserved cell's real WFC solve-order rank, see placeTowersForCity).
    const elapsed = Math.max(0, (t - cityRevealStart) * cityRevealSpeed);
    for (const tw of placedTowers) {
      if (tw.revealRank != null && tw.revealRank > elapsed) continue;
      const body = towerLines(tw);
      if (body) { gl.bindVertexArray(body.vao); gl.drawArrays(gl.LINES, 0, body.count); }
      if (tw.creatureOrnament) { gl.bindVertexArray(tw.creatureOrnament.vao); gl.drawArrays(gl.LINES, 0, tw.creatureOrnament.count); }
    }
  }
  if (!(window.ENVX && ENVX.hides('walkers'))) drawForgeGround(glowPass);
  gl.bindVertexArray(null);
}

// (moved here from further down: it runs while this file loads)
function refreshCityGenPanels() {
  const dEl = document.getElementById('city-districts'), mEl = document.getElementById('ctp-pieces'), rEl = document.getElementById('ctp-rules');
  if (!grammarSheet || !grammarCity) { dEl.innerHTML = mEl.innerHTML = rEl.innerHTML = '<p class="note">Reading the city grammar…</p>'; return; }
  const used = {}, byDistrict = {};
  for (const t of grammarCity.tiles) if (t.module) { used[t.module.id] = (used[t.module.id] || 0) + 1; byDistrict[t.district] = (byDistrict[t.district] || 0) + 1; }
  dEl.innerHTML = grammarSheet.districts.filter(d => byDistrict[d.id] || d.id === 'tower' || d.id === 'canal').map(d =>
    `<div class="legend-row"><span class="sw" style="background:${escHTML(d.colour)}"></span><span>${escHTML(d.name)}</span><span class="rg">${d.id === 'tower' ? 'centre' : d.id === 'canal' ? 'water' : byDistrict[d.id]}</span></div>`).join('');
  const SOCK = CityGrammarMesh.SOCK_COL, chip = (k) => k ? `<span class="sock-chip" style="background:${SOCK[k] || '#ccc'}">${escHTML(k)}</span>` : '';
  const rows = grammarSheet.modules.filter(m => m.layer === 'footprint' && used[m.id]).sort((a, b) => used[b.id] - used[a.id]);
  mEl.innerHTML = `<p class="note">The building pieces this city is made of, from packages/city/grammar/modules.csv, most used first. Each picks its shape from which of its four corners are built; the coloured chip is its street front (socket). Edit the sheet and press New world to rebuild.</p>
    <div class="gram-mods">${rows.map(m => `<div class="gram-mod"><b>${escHTML(m.name)}</b><em>${used[m.id]}</em><span>${escHTML(m.district)} · ${escHTML(m.shape)} ${chip(m.socket)}${m.part ? ' · part ' + escHTML(m.part) : ''}</span></div>`).join('')}</div>`;
  const socks = grammarSheet.raw.sockets.filter(r => !['ground', 'floor', 'roof', 'eave'].includes(r.socket));
  rEl.innerHTML = `<div><h2>Four layers</h2>
    <p>1. Height: terraces, the tower's acropolis highest. 2. Zoning: districts by rule. 3. Modules: a dual grid, each piece chosen from its built corners, street fronts that must meet. 4. Stitching: retaining walls, stairs, sacred gates, bridges, wells, the wall and its gates.</p>
    <h2>Which fronts meet</h2>
    ${socks.map(r => `<div class="rule"><h3>${chip(r.socket)}</h3><p>meets ${escHTML(r.meets.split(';').join(', '))}</p><p>${escHTML(r.note)}</p></div>`).join('')}
    <p>${grammarCity.stats.seams ? grammarCity.stats.seams + ' seams where no front could meet.' : 'Every street front in this city meets its neighbour.'}</p></div>`;
}
