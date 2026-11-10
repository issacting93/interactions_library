/* world/scenes/world-scene/forge-host.js — World Scene as Forge's city generator.

   Forge's City stage (world/forge/web/city.html) shows World Scene in a frame (?forge=1) and drives it
   through window.ForgeCityHost: the seed and the designer's pins, the Forge world's buildings as the
   towers, its walking creatures, and the layers round the city. This file is that whole seam, so World
   Scene.html itself stays the scene. A city saved in Forge opened on its own (?world=&city=) is read
   here too.

   A classic script, loaded BEFORE World Scene's own inline script: its top-level names are plain
   globals the scene reads (forgePins, forgeBuildings, forgeSites, stepForgeGround, drawForgeGround,
   forgePick, forgeAsleep), and its functions reach the scene's own names (gl, cam, placedTowers,
   grammarCity, ...) only when called, by which time the scene has defined them. The scene calls
   initForgeHost() once, at the end of its script. See README.md, "Hosted by Forge". */

// Forge's City stage hosts this scene in a frame (?forge=1) and hands it the designer's pins
// (CityGrammar.build's opts.pins); a saved Forge city opened here (?city=) brings its own
const FORGE_EMBED = new URLSearchParams(location.search).get('forge') === '1';
let forgePins = null, forgeBlockKey = null;
// the buildings saved in the Forge world, and which of them the designer stood on which tower site
// (0 = the main tower at the centre, 1.. = the ring). With none, the scene's own presets stand.
let forgeBuildings = null, forgeSites = {};
if (FORGE_EMBED) document.body.classList.add('forge-embed', 'panels-hidden');
let forgeAsleep = false;   // Forge puts the scene to sleep while its frame is out of view or the page is busy saving

// ---------- Forge's walking creatures: kit mechs, Blender solids and Bestiary walkers saved in the
// Forge world, walking this city between its towers (shared/engine/ecology/ground-walkers.js, the same
// walk Forge Ecology shows from above, here standing up). The host page hands them over. ----------
let forgeGround = null, forgeGroundBuf = null, forgeGroundN = 0;
function forgeGroundSet(list) {
  if (!window.GroundWalkers) return;
  if (!forgeGround) forgeGround = GroundWalkers.create({ bounds: { w: tankW(), h: tankH() }, size: 1,
    landmarks: () => placedTowers.map(tw => ({ x: tw.pos[0], y: tw.pos[1], radius: Math.max((tw.footR || 1) * tw.scale * 3, tankW() * 0.035) })) });
  forgeGround.bounds.w = tankW(); forgeGround.bounds.h = tankH();
  forgeGround.size = (tankW() * 0.4 / 15.3) * 1.25;   // a creature's body is a little over a city block long: they are the size of the houses
  forgeGround.setSpecies(list || []);
}
// One pair of typed arrays, grown when the herd outgrows them and reused every frame: the walk is
// redrawn each frame, so nothing here should allocate per frame.
let forgeGroundPos = new Float32Array(6 * 2048), forgeGroundCol = new Float32Array(6 * 2048), forgeGroundCap = 0;
const forgeGroundRgb = {};
function stepForgeGround(dt) {
  if (!forgeGround || !forgeGround.agents.length) { forgeGroundN = 0; return; }
  forgeGround.step(dt);
  const baseZ = tankDepth() * 0.92;
  let n = 0, lift = 0, liftFor = null, pos = forgeGroundPos, col = forgeGroundCol;
  forgeGround.segments((x0, y0, h0, x1, y1, h1, c) => {
    if (n + 6 > pos.length) {   // grow both, keeping what is written
      const p2 = new Float32Array(pos.length * 2), c2 = new Float32Array(pos.length * 2); p2.set(pos); c2.set(col);
      pos = forgeGroundPos = p2; col = forgeGroundCol = c2;
    }
    const key = (x0 / 40 | 0) * 4096 + (y0 / 40 | 0); if (key !== liftFor) { liftFor = key; lift = cityLiftAt(x0, y0); }   // each creature stands on the terrace under it
    const k = forgeGroundRgb[c] || (forgeGroundRgb[c] = hexToRgb3(c)), z = baseZ - lift;
    pos[n] = x0; pos[n + 1] = y0; pos[n + 2] = z - h0; pos[n + 3] = x1; pos[n + 4] = y1; pos[n + 5] = z - h1;
    col[n] = k[0]; col[n + 1] = k[1]; col[n + 2] = k[2]; col[n + 3] = k[0]; col[n + 4] = k[1]; col[n + 5] = k[2];
    n += 6;
  });
  if (!forgeGroundBuf) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null); forgeGroundBuf = { vao, pb, cb };
  }
  // the GPU buffers are (re)made only when the arrays grew; otherwise this frame's part is written into them
  const fresh = forgeGroundCap !== pos.length;
  for (const [buf, arr] of [[forgeGroundBuf.pb, pos], [forgeGroundBuf.cb, col]]) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    if (fresh) gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW); else gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr, 0, n);
  }
  forgeGroundCap = pos.length; forgeGroundN = n / 3;
}
function drawForgeGround(glowPass) {
  if (!forgeGroundN || !forgeGroundBuf) return;
  gl.useProgram(creatureLineProg.p); const u = creatureLineProg.u;
  gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX);
  gl.uniform1f(u.uAlpha, glowPass ? 0.45 : 1.0); gl.uniformMatrix4fv(u.uModel, false, IDENTITY4);
  gl.bindVertexArray(forgeGroundBuf.vao); gl.drawArrays(gl.LINES, 0, forgeGroundN);
}

// ---------- Forge's City stage: this scene as the city generator ----------
// A click finds the grammar tile under the pointer (the block of buildings there) and tells the
// host page, which opens the hex bloom over this frame. The host sends back pins; the grammar is
// built again with them, so its socket solve reworks the neighbours.
function pickGrammarTileAt(px, py) {
  if (!grammarCity || !lastCityModel) return null;
  const s = lastCityModel[0]; let lift = 0, lx = 0, lz = 0;
  for (let k = 0; k < 3; k++) {   // the terraces are raised: meet the ray with the level it lands on
    const [wx, wy] = screenToTank(px, py, lastCityModel[14] - lift);
    lx = (wx - lastCityModel[12]) / s; lz = (wy - lastCityModel[13]) / s;
    lift = CityGrammar.groundY(Math.hypot(lx, lz)) * s;
  }
  return CityGrammar.locate(grammarCity, lx, lz);
}
function forgeTileOf(key) {
  if (!key || !grammarCity) return null;
  const [T, i, j] = key.split(':').map(Number), ter = grammarCity.terraces[T];
  return ter && ter.tiles[i] ? ter.tiles[i][j] || null : null;
}
function forgeHighlight(key) {
  forgeBlockKey = key || null; selection = null;
  if (selectionHighlight) { gl.deleteVertexArray(selectionHighlight.vao); selectionHighlight = null; }
  const tile = forgeTileOf(key); if (!tile || !lastCityModel) return;
  const y0 = tile.y + 0.05, y1 = tile.y + 0.05 + Math.max(1, tile.floors) * grammarCity.floorH, pos = [];
  for (let k = 0; k < 4; k++) {
    const a = tile.quad[k], b = tile.quad[(k + 1) % 4];
    pos.push(a[0], y0, a[1], b[0], y0, b[1], a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], a[0], y1, a[1]);
  }
  const positions = new Float32Array(pos), colors = new Float32Array(positions.length);
  for (let k = 0; k < colors.length; k += 3) { colors[k] = SELECTION_COLOR[0]; colors[k + 1] = SELECTION_COLOR[1]; colors[k + 2] = SELECTION_COLOR[2]; }
  mat4TransformPoints(positions, lastCityModel);
  selectionHighlight = uploadLinePart({ positions, color: colors });
}
function forgeDescribe(tile) {
  const D = grammarCity.sheet.byId, lots = CityGrammar.lotKeys(tile), lp = (forgePins && forgePins.lots) || {};
  return { key: CityGrammar.tileKey(tile), terrace: tile.terrace, lotKeys: lots, lotSolid: tile.corners.map(L => !!L.solid), district: tile.district, districtName: (D[tile.district] || {}).name || tile.district,
    shape: tile.shape, module: tile.module ? tile.module.id : null, moduleName: tile.module ? tile.module.name : null, floors: tile.floors,
    pinnedFront: !!tile.pinned, pinnedLots: lots.filter(k => lp[k]).length };
}
function forgePick(px, py) {
  // a tower first: its site takes one of the Forge world's buildings
  const hit = pickTowerAt(px, py);
  if (hit) {
    const tw = placedTowers[hit.idx]; forgeHighlight(null);
    selection = hit; rebuildSelectionHighlight(); selection = null;
    parent.postMessage({ forgeCity: 'tower', x: px, y: py, site: hit.idx, key: tw.forgeKey || null, pinned: !!(forgeSites && forgeSites[hit.idx]), main: hit.idx === 0 }, '*');
    return;
  }
  const tile = pickGrammarTileAt(px, py);
  forgeHighlight(tile ? CityGrammar.tileKey(tile) : null);
  parent.postMessage(tile ? { forgeCity: 'pick', x: px, y: py, tile: forgeDescribe(tile), choices: CityGrammar.choices(grammarCity, tile) } : { forgeCity: 'miss' }, '*');
}

function initForgeHost() {
  window.ForgeCityHost = {
    // { seed, pins }: a new seed builds a new world (towers, walkers and all); new pins only rebuild the city
    setCity(c) {
      forgePins = c.pins || null;
      const seed = c.seed == null ? lastCitySeed : (c.seed >>> 0) || 1, tw = document.getElementById('world-towers');
      const towers = c.towers == null ? +tw.value : Math.max(1, Math.min(6, c.towers | 0));
      // the Forge world's buildings and the sites the designer gave them: a change stands the towers again
      let restand = false;
      if (c.buildings !== undefined) {
        const sig = JSON.stringify([(c.buildings || []).map(b => b.id + '@' + b.version), c.sites || {}]);
        restand = sig !== this._sig; this._sig = sig;
        forgeBuildings = c.buildings && c.buildings.length ? c.buildings : null; forgeSites = c.sites || {};
      }
      const fresh = seed !== lastCitySeed;
      if (fresh || restand || towers !== +tw.value) { tw.value = towers; tw.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('world-seed').value = seed; document.getElementById('world-new').click();
        if (!fresh) cityRevealStart = -1e6;   // only a new city grows in; a changed tower just stands
      }
      else rebuildCityCreatureGeometry();
      if (selectionHighlight && !forgeBlockKey) { gl.deleteVertexArray(selectionHighlight.vao); selectionHighlight = null; }
      forgeHighlight(forgeTileOf(forgeBlockKey) ? forgeBlockKey : null);
      return this.summary();
    },
    highlight: forgeHighlight,
    sleep(on) { forgeAsleep = !!on; },
    // Ecology: the Forge world's walking creatures ([{ id, name, flat, motion, count, color }]), and the swimmers this scene keeps
    setCreatures(list) { forgeGroundSet(list); return forgeGround ? forgeGround.agents.length : 0; },
    ecology() {
      return { playing: !paused, walking: forgeGround ? forgeGround.agents.length : 0,
        species: SPECIES.map((sp, i) => ({ key: sp.key, name: sp.name || sp.key, want: sim.pop[sp.key] ?? 0, alive: sim.fish.filter(f => f.sp === i && !f.dead).length })) };
    },
    setPop(key, n) { sim.pop[key] = Math.max(0, n | 0); EcologySim.setCount(sim); ecoEls.forEach((e, i) => { const v = sim.pop[SPECIES[i].key]; if (v != null) e.inp.value = v; }); },
    play(on) { if (paused === !on) return; pauseBtn.click(); },
    // Route: the layers round the city (the road and its pilgrims, the hills, the pines, the moon) and the walkers in its streets
    route() { const o = (routeAtmoCtx && routeAtmoCtx.override) || {}, r = curStyle.atmo || {}, on = (k) => k in o ? !!o[k] : r[k] !== false;
      return { drawn: styled() && S.routeAtmo, road: on('road'), pilgrims: on('pilgrims'), ridges: on('ridges'), pines: on('pines'), moon: on('moon'), walkers: !!S.showWalkers }; },
    setRoute(flags) {
      if (!routeAtmoCtx) return;
      routeAtmoCtx.override = { ...(routeAtmoCtx.override || {}) };
      for (const k of ['road', 'pilgrims', 'ridges', 'pines', 'moon']) if (k in flags) routeAtmoCtx.override[k] = !!flags[k];
      if ('walkers' in flags && !!flags.walkers !== !!S.showWalkers) document.getElementById('city-walkers-toggle').click();
    },
    // look down the road from outside the city toward the gate, or back to the whole city
    viewRoad() { if (!atmoWorld || !atmoWorld.road) return; const q = atmoWorld.road[14]; setSceneFocus([q[0], q[1]], atmoWorld.cityR * 0.9, 'forge-road'); },
    // put the whole city in frame (a shift-drag pan lets go of it again)
    frame() { setSceneFocus([tankW() / 2, tankH() / 2], 2 * CITY_FOOTPRINT_FRAC * tankW() * 0.92, 'forge-city'); },
    styles() { return StyleRecipes.all().map(r => ({ id: r.id, name: r.name, saved: !!r.saved })); },
    style() { return S.style; },
    setStyle(id) { setStyleId(id); },
    summary() {
      if (!grammarCity) return null;
      const by = {}; let blocks = 0;
      for (const tl of grammarCity.tiles) if (tl.module) { blocks++; by[tl.district] = (by[tl.district] || 0) + 1; }
      return { seed: lastCitySeed, blocks, byDistrict: by, seams: grammarCity.stats.seams, towers: placedTowers.length,
        standing: placedTowers.map((tw, i) => ({ site: i, key: tw.forgeKey || null, exact: !!tw.spire, pinned: !!forgeSites[i] })) };
    },
    // the plan: every lot, for a small map of the districts
    plan() {
      if (!grammarCity) return null;
      const lp = (forgePins && forgePins.lots) || {}, lots = [];
      for (const T of grammarCity.terraces) for (const row of T.lots) for (const L of row) lots.push({ x: +L.x.toFixed(2), z: +L.z.toFixed(2), d: L.district, s: L.solid ? 1 : 0, o: L.open, p: lp[T.index + ':' + L.i + ':' + L.j] ? 1 : 0 });
      return { lots, wall: grammarCity.wall.r1, spokes: grammarCity.spokes, colours: Object.fromEntries(grammarCity.sheet.districts.map(d => [d.id, d.colour])), names: Object.fromEntries(grammarCity.sheet.districts.map(d => [d.id, d.name])) };
    },
  };
  Promise.all([grammarReady, creatureArchReady]).then(() => { if (FORGE_EMBED && parent !== window) { ForgeCityHost.frame(); parent.postMessage({ forgeCity: 'ready' }, '*'); } });
  // a city saved in Forge, opened here on its own: its seed and its pins
  (async () => {
    const q = new URLSearchParams(location.search); if (!q.get('city') || !window.ForgeWorld) return;
    try {
      if (q.get('world')) ForgeWorld.setActiveWorldId(q.get('world'));
      const rec = await (await ForgeWorld.activeWorld()).get(q.get('city'));
      if (rec && rec.recipe) { await grammarReady; const g = rec.recipe.grammar || {}; if (g.style) setStyleId(g.style);
        await creatureArchReady;
        const buildings = (await (await ForgeWorld.activeWorld()).list()).filter(o => o.type === 'building' && o.recipe && Array.isArray(o.recipe.tiers) && o.recipe.tiers.length)
          .map(o => ({ id: o.id, version: o.version, name: o.name, districts: (o.prefab && o.prefab.districts) || [], spec: o.recipe }));
        ForgeCityHost.setCity({ seed: rec.recipe.seed, pins: g.pins, towers: g.towers, buildings, sites: g.sites || {} });
        if (g.route) ForgeCityHost.setRoute(g.route);
        // the world's walking creatures, in the numbers Forge Ecology keeps
        const hues = ['#5be39a', '#e8b04a', '#a98bff', '#5cc8e0', '#ff8a3d', '#e66fb8', '#a3d65c', '#7fa8c9'];
        let counts = {}; try { counts = JSON.parse(localStorage.getItem('forge:ground-walkers:' + ForgeWorld.getActiveWorldId()) || '{}'); } catch (e) { /* default counts */ }
        const walkers = (await (await ForgeWorld.activeWorld()).list('species')).filter(o => o.recipe && o.recipe.flat && o.recipe.flat.body && o.recipe.flat.legs).sort((a, b) => a.createdAt - b.createdAt);
        ForgeCityHost.setCreatures(walkers.map((o, i) => ({ id: o.id, name: o.name, flat: o.recipe.flat, motion: o.recipe.motion || null, count: counts[o.id] ?? 3, color: hues[i % hues.length] }))); }
    } catch (e) { console.warn('[world-scene] could not open the Forge city', e); }
  })();
}
