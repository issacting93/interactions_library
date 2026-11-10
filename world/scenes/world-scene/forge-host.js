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
// The streets: the grammar's walkable graph (open lots, ring roads, the stairs up each terrace), kept
// clear of the towers. Built when first needed and thrown away whenever the city is built again.
let forgeWalk = null, forgeWalkFor = null;
function forgeWalkGraph() {
  if (!grammarCity || !lastCityModel) return null;
  if (forgeWalk && forgeWalkFor === grammarCity) return forgeWalk;
  const s = lastCityModel[0], cx = lastCityModel[12], cy = lastCityModel[13];
  const block = placedTowers.map(tw => ({ x: (tw.pos[0] - cx) / s, z: (tw.pos[1] - cy) / s, r: (tw.footR || 1) * tw.scale / s * 0.8 }));
  forgeWalk = CityGrammar.walkGraph(grammarCity, { block }); forgeWalkFor = grammarCity;
  if (forgeGround) forgeGround.reroute();   // the ground changed under them
  return forgeWalk;
}
// the way from one tank point to another along the streets, as tank waypoints
function forgeRoute(x0, y0, x1, y1) {
  const W = forgeWalkGraph(); if (!W || !W.nodes.length) return null;
  const s = lastCityModel[0], cx = lastCityModel[12], cy = lastCityModel[13];
  const p = W.path(W.nearest((x0 - cx) / s, (y0 - cy) / s), W.nearest((x1 - cx) / s, (y1 - cy) / s));
  return p ? p.map(i => [cx + W.nodes[i].x * s, cy + W.nodes[i].z * s]) : null;
}
function forgeGroundSet(list) {
  if (!window.GroundWalkers) return;
  if (!forgeGround) forgeGround = GroundWalkers.create({ bounds: { w: tankW(), h: tankH() }, size: 1, route: forgeRoute,
    landmarks: () => placedTowers.map(tw => ({ x: tw.pos[0], y: tw.pos[1], key: tw.forgeKey || null, radius: Math.max((tw.footR || 1) * tw.scale * 2.2, tankW() * 0.03) })) });
  forgeGround.bounds.w = tankW(); forgeGround.bounds.h = tankH();
  forgeGround.size = (tankW() * 0.4 / 15.3) * 0.85;   // a creature's body is a little under a city block long, so it fits a street
  forgeGround.setSpecies(list || []);
}
// One pair of typed arrays, grown when the herd outgrows them and reused every frame: the walk is
// redrawn each frame, so nothing here should allocate per frame.
let forgeGroundPos = new Float32Array(6 * 2048), forgeGroundCol = new Float32Array(6 * 2048), forgeGroundCap = 0;
const forgeGroundRgb = {};
function stepForgeGround(dt) {
  if (!forgeGround || !forgeGround.agents.length) { forgeGroundN = 0; return; }
  forgeWalkGraph();   // a rebuilt city sends everyone a new way before they step
  forgeGround.step(dt);
  const baseZ = tankDepth() * 0.92, ease = Math.min(1, dt * 2.5);
  let n = 0, lift = 0, pos = forgeGroundPos, col = forgeGroundCol;
  // each creature stands at its own height, eased toward the terrace under it, so a stair is a climb and not a jump
  const emit = (x0, y0, h0, x1, y1, h1, c) => {
    if (n + 6 > pos.length) {   // grow both, keeping what is written
      const p2 = new Float32Array(pos.length * 2), c2 = new Float32Array(pos.length * 2); p2.set(pos); c2.set(col);
      pos = forgeGroundPos = p2; col = forgeGroundCol = c2;
    }
    const k = forgeGroundRgb[c] || (forgeGroundRgb[c] = hexToRgb3(c)), z = baseZ - lift;
    pos[n] = x0; pos[n + 1] = y0; pos[n + 2] = z - h0; pos[n + 3] = x1; pos[n + 4] = y1; pos[n + 5] = z - h1;
    col[n] = k[0]; col[n + 1] = k[1]; col[n + 2] = k[2]; col[n + 3] = k[0]; col[n + 4] = k[1]; col[n + 5] = k[2];
    n += 6;
  };
  emit.agent = (a) => { const want = cityLiftAt(a.x, a.y); a.lift = a.lift == null ? want : a.lift + (want - a.lift) * ease; lift = a.lift; };
  forgeGround.segments(emit);
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

// ---------- Drift, in the 3D city (shared/engine/generators/ecology-loop.js) ----------
// Forge's buildings stand as this city's towers; a building that attracts a species pulls it in, and a
// species that spends time round a building drifts its swim toward that building's character. The same
// loop Forge Ecology's top view runs, here over the towers where they stand. Forge starts it (driftStart)
// with the world's buildings and rigs; the scene's own tower vortices stay, the pull is added to them.
let forgeDrift = null, forgeDriftLive = [], forgeDriftOpts = null;
function forgeDriftVortices() { return forgeDriftLive; }
function forgeDriftTick(dt) { if (forgeDrift) forgeDrift.tick(dt); }
function forgeDriftBuild() {
  if (forgeDrift) forgeDrift.reset();   // every swim back to its base first: a new loop takes the swims it finds as the base
  forgeDrift = null; forgeDriftLive = [];
  const o = forgeDriftOpts;
  if (!o || !window.EcologyLoop) { refreshVortices(); return null; }
  const W = tankW(), H = tankH(), E = Math.min(W, H) / 2;   // extent = half the tank: the loop's units are tank units
  const prefabs = new Map((o.prefabs || []).map(b => [b.id, { ...b, attracts: (b.attracts || []).slice() }]));
  const placements = placedTowers.filter(tw => tw.forgeKey && prefabs.has(tw.forgeKey))
    .map(tw => ({ prefab: tw.forgeKey, cell: tw.site, x: tw.pos[0] - W / 2, y: tw.pos[1] - H / 2, span: W * 0.16 / 1.8 }));   // the tank is wide and the swimmers spread over it: each building reaches about a sixth of it
  // keep what each species had soaked up, so standing another tower doesn't wipe the run
  const before = o.keep && o.keep.exposure ? o.keep : null;
  forgeDrift = EcologyLoop.create({ sim, city: { placements, extent: E }, prefabs, rigs: o.rigs || [], rate: o.rate ?? 0.6,
    setVortices: (_, live) => { forgeDriftLive = live; refreshVortices(); } });
  if (before) before.exposure.forEach((ex, i) => forgeDrift.restore(i, ex));
  return forgeDrift;
}

// ---------- the scene's own panels, for Forge to show in its own ----------
// Forge hides this scene's panels (?forge=1) and shows the same controls in its inspector. Each
// control is described from this page's own elements and driven through them (the same input events a
// person would make), so the scene keeps one implementation and Forge never mirrors its state by hand.
//   'r:id' a range · 'c:name' a set of radio buttons · 't:id' a pressed/unpressed button · 'b:id' a button · 's:id' a select
function forgeDescribe1(spec) {
  const [k, id] = spec.split(':'), el = k === 'c' ? null : document.getElementById(id);
  if (k === 'r') {
    const lab = el.closest('label'), out = document.getElementById('o-' + id);
    return { kind: 'range', id, label: lab ? lab.querySelector('span').textContent : id, min: +el.min, max: +el.max, step: +el.step, value: +el.value, text: out ? out.textContent : el.value };
  }
  if (k === 'c') {
    const ins = [...document.querySelectorAll(`input[name="${id}"]`)], grp = ins[0] && ins[0].closest('[role=radiogroup]');
    return { kind: 'choice', id, label: grp ? grp.getAttribute('aria-label') : id, value: (ins.find(i => i.checked) || {}).value,
      options: ins.map(i => ({ value: i.value, label: (document.querySelector(`label[for="${i.id}"]`) || {}).textContent || i.value })) };
  }
  if (k === 't') return { kind: 'toggle', id, label: el.textContent.trim(), on: el.getAttribute('aria-pressed') === 'true' };
  if (k === 'b') return { kind: 'button', id, label: el.textContent.trim() };
  if (k === 's') return { kind: 'select', id, label: el.getAttribute('aria-label') || id, value: el.value, options: [...el.options].map(o => ({ value: o.value, label: o.textContent })) };
  return null;
}
const FORGE_PANELS = {
  population: ['s:species', 'r:count', 'r:size', 'r:dark', 'r:speed'],
  modes: ['c:mode', 'c:flow', 'c:beh', 'c:ptr'],
  motion: ['r:sep', 'r:align', 'r:coh', 'r:swirl', 'r:vradius', 'r:wiggle', 'r:flex', 'r:wings', 'r:bank'],
  look: ['r:glow', 'r:shimmer', 'r:trail', 'r:density', 'r:iris', 'c:irismode', 't:snow', 'b:reseed'],
  overlays: ['t:hud-toggle'],
  camera: ['c:view', 'r:tilt', 'r:yaw', 'r:zoom', 'r:dz', 'c:proj', 't:orbit', 'b:next', 'b:recentre'],
  capture: ['t:portrait', 'b:shot'],
  growth: ['r:city-grow-speed', 'b:city-replay', 'b:city-instant', 't:city-grid-toggle'],
};

function initForgeHost() {
  // undo and redo belong to the page that hosts the scene: keys pressed with the frame in focus are passed up
  if (FORGE_EMBED) document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return; const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
    e.preventDefault(); parent.postMessage({ forgeCity: 'key', key: k === 'y' || e.shiftKey ? 'redo' : 'undo' }, '*');
  });
  window.ForgeCityHost = {
    // { seed, pins }: a new seed builds a new world (towers, walkers and all); new pins only rebuild the city
    setCity(c) {
      forgePins = c.pins || null;
      const seed = c.seed == null ? lastCitySeed : (c.seed >>> 0) || 1, tw = document.getElementById('world-towers');
      const towers = c.towers == null ? +tw.value : Math.max(1, Math.min(6, c.towers | 0));
      // the Forge world's buildings and the sites the designer gave them: a change stands the towers again
      let restand = false, swap = null;
      if (c.buildings !== undefined) {
        const bsig = JSON.stringify((c.buildings || []).map(b => b.id + '@' + b.version)), ssig = JSON.stringify(c.sites || {});
        const sitesOnly = bsig === this._bsig && ssig !== this._ssig;
        restand = bsig !== this._bsig || ssig !== this._ssig; this._bsig = bsig; this._ssig = ssig;
        const before = forgeSites || {};
        forgeBuildings = c.buildings && c.buildings.length ? c.buildings : null; forgeSites = c.sites || {};
        // only the designer's choice for some sites changed: those towers are stood again where they are, nothing else is rebuilt
        if (sitesOnly) swap = Object.keys({ ...before, ...forgeSites }).filter(k => before[k] !== forgeSites[k] && forgeSites[k]).map(Number);
        if (sitesOnly && Object.keys(before).some(k => before[k] && !forgeSites[k])) swap = null;   // an unpinned site goes back to the city's own choice: that needs the whole plan
      }
      const fresh = seed !== lastCitySeed;
      if (!fresh && towers === +tw.value && swap && swap.length && swap.every(i => restandTower(i, forgeSites[i]))) {
        rebuildCityCreatureGeometry(); refreshVortices();
      } else if (fresh || restand || towers !== +tw.value) { tw.value = towers; tw.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('world-seed').value = seed; document.getElementById('world-new').click();
        if (!fresh) cityRevealStart = -1e6;   // only a new city grows in; a changed tower just stands
      }
      else rebuildCityCreatureGeometry();
      if (selectionHighlight && !forgeBlockKey) { gl.deleteVertexArray(selectionHighlight.vao); selectionHighlight = null; }
      forgeHighlight(forgeTileOf(forgeBlockKey) ? forgeBlockKey : null);
      return this.summary();
    },
    // ---- the scene's own controls (FORGE_PANELS above): describe a panel, and drive one control ----
    controls(panel) { return (FORGE_PANELS[panel] || []).map(forgeDescribe1).filter(Boolean); },
    set(id, value) {
      const el = document.getElementById(id); if (!el) return;
      if (el.tagName === 'SELECT') { el.value = value; el.dispatchEvent(new Event('change')); return; }
      el.value = value; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));
    },
    choose(name, value) { const r = document.querySelector(`input[name="${name}"][value="${value}"]`); if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change')); } },
    press(id) { const b = document.getElementById(id); if (b) b.click(); },
    // everything a person can tune here, as one object (World Scene's own settings link), and back
    preset() { const p = capturePreset(); delete p.style; return p; },
    applyPreset(p) { if (p) applyPreset({ ...p, style: undefined }); },
    // World Scene on its own, opened on this city and this tank
    link(q) { const u = new URL(location.href); u.searchParams.delete('forge'); for (const [k, v] of Object.entries(q || {})) u.searchParams.set(k, v); return u.origin + u.pathname + u.search + '#' + btoa(JSON.stringify(capturePreset())); },
    // the swimmers: who they are, what they eat and avoid, how many there are and how they are doing
    species() {
      const alive = SPECIES.map(() => 0); for (const f of sim.fish) if (!f.dead) alive[f.sp]++;
      const want = EcologySim.desired(sim), nm = i => SPECIES[i].name;
      return sim.speciesRT.map((sp, i) => ({ i, key: sp.key, name: sp.name, mood: sp.beh.mood || '', eats: [...sp.preySet].map(nm), avoids: [...sp.predators].map(nm),
        escape: sp.beh.flee || 'none', pop: sim.pop[sp.key] ?? 0, max: Math.max(12, (sim.POP_DEFAULT[sp.key] || 4) * 3), want: want[i] || 0, alive: alive[i],
        eaten: sim.tally[i].eaten, lost: sim.tally[i].lost, pressure: sim.pressure[i] > 0.8 }));
    },
    resetPop() { this.press('eco-reset'); },
    // the city's modules and its rules (the grammar's sheets), as data for Forge to lay out
    cityRules() {
      if (!grammarSheet || !grammarCity) return null;
      const used = {}; for (const t of grammarCity.tiles) if (t.module) used[t.module.id] = (used[t.module.id] || 0) + 1;
      const SOCK = CityGrammarMesh.SOCK_COL;
      return {
        modules: grammarSheet.modules.filter(m => m.layer === 'footprint' && used[m.id]).sort((a, b) => used[b.id] - used[a.id])
          .map(m => ({ name: m.name, count: used[m.id], district: m.district, shape: m.shape, socket: m.socket || null, colour: SOCK[m.socket] || null, part: m.part || null })),
        sockets: grammarSheet.raw.sockets.filter(r => !['ground', 'floor', 'roof', 'eave'].includes(r.socket))
          .map(r => ({ socket: r.socket, colour: SOCK[r.socket] || null, meets: r.meets.split(';').filter(Boolean), note: r.note })),
        seams: grammarCity.stats.seams,
      };
    },
    // ---- drift (forgeDriftBuild above) ----
    // { prefabs: [{ id, name, type, version, attracts }], rigs, rate }: (re)start it over the towers where they stand
    driftStart(o) { const keep = forgeDrift && o && o.keepExposure ? { exposure: forgeDrift.keys.map((_, i) => ({ ...forgeDrift.state(i).exposure })) } : null; forgeDriftOpts = o ? { ...o, keep } : null; forgeDriftBuild(); return !!forgeDrift; },
    drift() {
      if (!forgeDrift) return null;
      const seen = new Set(), landmarks = [];
      for (const l of forgeDrift.landmarks) { if (seen.has(l.prefab.id)) continue; seen.add(l.prefab.id);
        landmarks.push({ id: l.prefab.id, name: l.prefab.name, sites: forgeDrift.landmarks.filter(x => x.prefab.id === l.prefab.id).map(x => x.cell), attracts: [...l.species].map(i => forgeDrift.keys[i]) }); }
      const species = forgeDrift.keys.map((k, i) => { const s = forgeDrift.state(i); return { i, key: k, name: s.name, drift: s.drift, exposure: s.exposureTotal, top: s.top ? { id: s.top.id, name: s.top.name } : null, rigged: !!s.rigged, allow: s.allow, base: s.base, cur: s.cur }; });
      return { landmarks, species, rate: forgeDrift.rate };
    },
    driftAttracts(prefabId, keys) { if (!forgeDrift) return; forgeDrift.setAttracts(prefabId, keys); const pf = (forgeDriftOpts.prefabs || []).find(b => b.id === prefabId); if (pf) pf.attracts = keys.slice(); },
    driftRate(r) { if (forgeDrift) forgeDrift.rate = Math.max(0, Math.min(1, +r)); if (forgeDriftOpts) forgeDriftOpts.rate = +r; },
    driftReset() { if (forgeDrift) forgeDrift.reset(); },
    driftVariant(i) { return forgeDrift ? forgeDrift.variant(i) : null; },
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
        ForgeCityHost.setCreatures(walkers.map((o, i) => ({ id: o.id, name: o.name, flat: o.recipe.flat, motion: o.recipe.motion || null, home: (g.homes || {})[o.id] || null, count: counts[o.id] ?? 3, color: hues[i % hues.length] }))); }
    } catch (e) { console.warn('[world-scene] could not open the Forge city', e); }
  })();
}
