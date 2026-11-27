// world/scenes/world-scene/src/sim.js -- World Scene: The habitat and the vortices (towers as whirlpools), the fish simulation, the first world's build, and picking things to inspect.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- habitat score + vortices: towers as real local whirlpools in the sim ----------
// Same spirit as Tower Forge's own MAP-Elites habitat axis, computed directly off plain spec
// fields (ported verbatim from world/scenes/world-scene/World Scene.html's habitatScore()).
function habitatScore(s) {
  let h = 0.4;
  for (const t of s.tiers) {
    if (t.band !== 'none') h += 0.35;
    if (t.winRows > 0) h += Math.min(0.6, t.winRows * t.winPer * 0.03);
    if (t.ribs > 0) h += 0.15;
    if (t.spN > 0) h += 0.2;
    if (t.pat !== 'none') h += 0.3;
    if (t.stair > 0) h += 0.1;
  }
  h += s.halos.length * 0.25;
  if (s.crown.kind !== 'flat') h += 0.2;
  if (s.crown.finial) h += 0.15;
  return h;
}
// Unlike the old Three.js World Scene (which placed towers/city in a separate "world" space and
// had to invert an affine remap, worldToTank(), to get back to the sim's tank coordinates), towers
// here are built directly in tank space (buildPlacedTower's tankX/tankY args) — the tank IS the
// world in this build, so no remap is needed, just the weight -> radius/strength formula.
function refreshVortices() {
  // a Forge city's drift adds the pull of the buildings that attract a species (forge-host.js)
  if (!placedTowers.length) { EcologySim.setVortices(sim, forgeDriftVortices()); return; }
  const scores = placedTowers.map(tw => habitatScore(tw.spec));
  const lo = Math.min(...scores, 0.4), hi = Math.max(...scores, lo + 0.01);
  EcologySim.setVortices(sim, placedTowers.map((tw, i) => {
    const weight = 0.6 + 1.2 * (scores[i] - lo) / (hi - lo);
    return { x: tw.pos[0], y: tw.pos[1], radius: tankW() * (0.03 + 0.02 * weight), strength: 0.5 * weight };
  }).concat(forgeDriftVortices()));
}

// towers[0] is always the city's hub landmark, standing where city-mesh-gl2.js's own small domed
// 'core' piece would otherwise go (buildPlacedCity calls buildCityGL2 with {skipCore:true} for
// exactly this reason, so the two never overlap) — picked as the most ornamented preset so it
// reads as the city's centrepiece, not just another tower. towers[1..] are placed on a mid-city
// ring at distinct angles, each a random preset (the gl2 analogue of the old World Scene's
// "sanctum-ring lots", simplified: no WFC lot lookup yet).
//
// The city's own roster is restricted to the Spire Forge-imported presets (TowerPresets entries
// whose spec carries `source.from === 'Spire Forge'`, added 2026-11-01 — see tower-presets.js):
// these are the only presets with per-tier `orn` data, so they're the only ones that render through
// elevFromOrn()'s exact-fidelity path instead of the older generic grammar-driven band. The
// hand-tuned presets stay in TowerPresets (still selectable from the Tower panel's "Load preset..."
// dropdown for manual editing, and still used by standalone Tower Forge.html), just no longer
// chosen automatically for a generated city. Falls back to every preset if the Spire Forge subset
// is ever empty, so this never leaves a city with no towers to place.
// A flat scale multiplier made some presets read taller than the city itself — a "spire" preset's
// local tier-height sum is several times a "hive" preset's, so the same multiplier produced wildly
// different real-world heights. Towers are now scaled to their OWN built height instead: each
// preset is built once (cheap, CPU-only, happens only at city-gen time) purely to read
// `built.top` (local units), then scaled so its actual world-space height lands at a fraction of
// the city's real footprint diameter (2 * CITY_FOOTPRINT_FRAC * tankW()) — the hub landmark capped
// at 25% of that diameter, ring towers a bit shorter still, so nothing dwarfs the skyline.
function towerScaleForHeight(spec, seed, worldHeight) {
  const top = towerDims(spec, seed).top;
  return worldHeight / Math.max(0.01, top);
}
// Ring towers used to sit at a free-floating (radius, random angle) with zero awareness of the
// WFC cell layout underneath. 2026-11-02: buildPlacedCity now pins ringCount real WFC cells on
// LANDMARK_RING (chosen to match the old fixed radius, ringR = 15.3*0.55, which fell in ring 4 —
// the housing district) to the 'belvedere' tile BEFORE the WFC even solves (see buildPlacedCity),
// so the solver itself builds everything else consistently around them — this function just reads
// reservedCityCellIds back to find each reserved cell's real centre for the tower's position. The
// hub landmark needs no such reservation: it sits on the ring-0 core cell, which
// CreatureCity.build() already always skips by default (skipCore), the same "the hub stands a real
// tower instead" design from the start of this build.
const LANDMARK_RING = 4;
// what may stand on a tower site: the Forge world's buildings when the host page handed some over, else the presets
function towerPool() {
  if (forgeBuildings && forgeBuildings.length) {
    const spec = {}; for (const b of forgeBuildings) spec[b.id] = b.spec;
    return { forge: true, keys: forgeBuildings.map(b => b.id), spec, list: forgeBuildings };
  }
  const spireKeys = Object.keys(TowerPresets).filter(k => TowerPresets[k].s.source && TowerPresets[k].s.source.from === 'Spire Forge');
  const keys = spireKeys.length ? spireKeys : Object.keys(TowerPresets), spec = {};
  for (const k of keys) spec[k] = TowerPresets[k].s;
  return { forge: false, keys, spec };
}
// the main tower: the designer's choice, else a building made for the centre, else the tallest design
function forgeHubKey(pool) {
  if (pool.spec[forgeSites[0]]) return forgeSites[0];
  const core = pool.list.find(b => (b.districts || []).includes('core'));
  if (core) return core.id;
  return pool.keys.reduce((best, k) => towerDims(pool.spec[k], 1).top > towerDims(pool.spec[best], 1).top ? k : best, pool.keys[0]);
}
// the ring takes the other buildings in a seeded order, so each stands once before any repeats
function forgeRingOrder(pool, seed) {
  const hub = forgeHubKey(pool), rest = pool.keys.filter(k => k !== hub), R = RNG.create(seed, 'forge-ring');
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return rest.length ? rest : [hub];
}
// Stand another building on one site, where the old one stood: same place, sized by the site's own
// budget. Only the city round it is built again (it keeps clear of the new footprint); the plan, the
// other towers and everything walking stay as they are.
function restandTower(i, key) {
  const old = placedTowers[i], pool = towerPool(), spec = pool.spec[key];
  if (!old || !spec || !old.plan) return false;
  const P = old.plan, d = towerDims(spec, P.seed);
  const scale = P.radialBudget ? Math.min(P.targetHeight / Math.max(0.01, d.top), P.radialBudget / Math.max(0.01, d.r)) : P.targetHeight / Math.max(0.01, d.top);
  const tw = buildPlacedTower(spec, P.seed, old.pos[0], old.pos[1], scale);
  tw.revealRank = old.revealRank; tw.forgeKey = pool.forge ? key : null; tw.site = i; tw.plan = P;
  placedTowers[i] = tw; disposeTowerEntry(old);
  return true;
}
function placeTowersForCity(wfc, seed, cityScale, tankX, tankY, reservedClusters) {
  const rnd = RNG.create(seed, 'towers');
  const pool = towerPool(), keys = pool.keys, out = [];
  const TP = pool.spec;
  const centerKey = pool.forge ? forgeHubKey(pool) : keys.reduce((best, k) => habitatScore(TP[k]) > habitatScore(TP[best]) ? k : best, keys[0]);
  const cityDiameter = 2 * CITY_FOOTPRINT_FRAC * tankW();
  const maxTowerHeight = cityDiameter * 0.25;
  const centerSeed = Math.floor(rnd() * 1e9);
  const centerTower = buildPlacedTower(TP[centerKey], centerSeed, tankX, tankY, towerScaleForHeight(TP[centerKey], centerSeed, maxTowerHeight));
  centerTower.revealRank = 0; centerTower.forgeKey = pool.forge ? centerKey : null; centerTower.site = 0; centerTower.plan = { seed: centerSeed, targetHeight: maxTowerHeight };   // the hub appears first -- "solved outward from the Great Mosque" (see Growth's own note), same framing as the city reveal
  out.push(centerTower);
  // Growth reveal (2026-11-03 follow-up): ring towers now gate on the SAME cityRevealStart/-Speed
  // clock as the city's own buildings, using the LOWEST solve-order rank among a cluster's cells
  // (the earliest-solved cell in the cluster) -- previously towers always appeared instantly
  // regardless of the Growth reveal's progress.
  const orderRank = new Map(); (wfc.order || []).forEach((id, k) => orderRank.set(id, k));
  // Footprint-overlap fix (2026-11-03): ring tower preset/seed/scale are now precomputed in
  // buildPlacedCity, BEFORE the WFC solves, so the reservation could be sized to the tower's real
  // footprint instead of the other way around (see that function's own note). A tower's position
  // is the cluster's cells averaged (mean unit vector, so the angle wraps correctly even if a
  // cluster straddles the 0/2*pi seam) rather than a single cell's centre.
  for (const cluster of reservedClusters) {
    let sx = 0, sy = 0, rm = 0, minRank = Infinity;
    for (const id of cluster.ids) {
      const cell = wfc.cells.find(c => c.id === id);
      if (!cell) continue;
      const f = cellFrame(cell);
      sx += Math.cos(f.am); sy += Math.sin(f.am); rm = f.rm;
      const r = orderRank.has(id) ? orderRank.get(id) : 0;
      if (r < minRank) minRank = r;
    }
    const am = Math.atan2(sy, sx);
    const tx = tankX + Math.cos(am) * rm * cityScale, ty = tankY + Math.sin(am) * rm * cityScale;
    const { key, seed: towerSeed, scale } = cluster.plan;
    const tw = buildPlacedTower(cluster.plan.spec, towerSeed, tx, ty, scale);
    tw.forgeKey = pool.forge ? key : null; tw.site = out.length; tw.plan = cluster.plan;
    tw.revealRank = Number.isFinite(minRank) ? minRank : 0;
    out.push(tw);
  }
  return out;
}

buildPlacedCity(S.seed, 3);
refreshVortices();
// the very first build above likely ran before creature-parts.json finished fetching (buildPlacedCity/
// buildPlacedTower both check CreatureArch.ready and just skip the glowing architecture if not)
// — once it's actually in hand, rebuild creature lines/ornaments in place without a full city rebuild
creatureArchReady.then(() => {
  if (!CreatureArch.ready) return;
  rebuildCityCreatureGeometry();
  // towers that carry a Forge design were stood as shells before the parts arrived: build the world again with the real thing
  if (placedTowers.some(tw => tw.spec.spire && !tw.spire)) { buildPlacedCity(lastCitySeed || S.seed, +document.getElementById('world-towers').value || 3); refreshVortices(); return; }
  placedTowers.forEach((tw, i) => {
    if (tw.spire) return;
    if (!tw.creatureOrnament) tw.creatureOrnament = buildTowerCreatureOrnament(tw.spec, tw.builtSeed, tw.model);
    if (!tw.creatureBody) tw.creatureBody = buildTowerCreatureBody(tw.spec, tw.builtSeed, tw.model, tw.built.top);
  });
});
// snaps to target the first time (v is still null), eases toward it after — k is a pre-clamped Math.min(1, dt*rate)
const ease = (v, target, k) => v == null ? target : v + (target - v) * k;
function updateCamera(dt) {
  const TW = tankW(), TH = tankH(), TD = tankDepth(), fov = 40 * DEG, aspect = vw / Math.max(1, vh);
  if (S.orbit) cam.yawT += dt * 0.06;
  // base tilt/turn ease toward the slider rather than cutting, so preset buttons (Top/Angled) swing instead of jump
  const baseK = Math.min(1, dt * 5), targetTilt = S.tilt * DEG, targetYaw = S.yaw * DEG + cam.yawT;
  cam.tilt = ease(cam.tilt, targetTilt, baseK);
  cam.yaw = ease(cam.yaw, targetYaw, baseK);
  let yaw = cam.yaw, tilt = cam.tilt;
  const vis = 1;         // nothing covers the tank vertically — the species/tower pickers live inside the side panels now, not a bottom bar
  const coverR = dockCover(), coverL = drawerCover(), visW = Math.max(0.3, (vw - coverL - coverR) / vw);
  const frameDist = Math.max((TH / 2) / (Math.tan(fov / 2) * vis), (TW / 2) / (Math.tan(fov / 2) * aspect * visW)) * 1.08;
  let dist = frameDist / S.zoom, c = [TW / 2 + camPan[0], TH / 2 + camPan[1], TD * 0.45 + camPan[2]];
  if (S.view === 'follow') {
    // ride behind one creature: the camera eases after it and swings round to sit behind its heading;
    // picking a new target (Follow another) eases from wherever the camera already is, not a cut
    if (!cam.follow || !sim.fish.includes(cam.follow)) pickFollow();
    const f = cam.follow;
    if (f) {
      const bl = EcologySim.bodyLen(sim, f);
      // distance pulls back more than linearly for creatures bigger than a koi (swim.len 1) and in
      // closer than linear for smaller ones, so a manta reads as sprawling and a wisp as tiny and
      // near, not just "the same shot, further away"; sizeNorm stays ~1 for a koi-sized fish however
      // S.size itself is set, so the exponent reshapes the spread without fighting that slider
      const sizeNorm = bl / Math.max(1, S.size);
      const goalDist = Math.max(S.size * 0.9, S.size * 6 * Math.pow(Math.max(0.05, sizeNorm), 1.25)) / S.zoom;
      // and the camera's own tracking speed keys off the subject's actual speed (in body-lengths/s,
      // so it's not just "big fish = slow camera"): a dash gets a snappy camera, a drift gets a slow,
      // cinematic one
      const relSpd = Math.hypot(f.vx, f.vy) / Math.max(1, bl);
      const followRate = Math.min(6, Math.max(1.4, relSpd * 1.1 + 1.3));
      const goal = [f.chain[(K >> 2) * 2], f.chain[(K >> 2) * 2 + 1], f.z * TD];
      cam.fc = cam.fc || goal.slice();
      const k = Math.min(1, dt * followRate); for (let i = 0; i < 3; i++) cam.fc[i] += (goal[i] - cam.fc[i]) * k;
      const want = Math.atan2(-Math.cos(f.ang), -Math.sin(f.ang)), dy = Math.atan2(Math.sin(want - cam.fyaw), Math.cos(want - cam.fyaw));
      cam.fyaw += dy * Math.min(1, dt * followRate * 0.5);
      const goalTilt = Math.max(tilt, 30 * DEG);
      cam.ftilt = ease(cam.ftilt, goalTilt, k);
      cam.fdist = ease(cam.fdist, goalDist, k);
      c = cam.fc; yaw = cam.fyaw + S.yaw * DEG + cam.yawT; tilt = cam.ftilt; dist = cam.fdist;   // orbit still drifts the view slowly around the subject while following
    }
  } else if (sceneFocus) {
    // "Fit view" / Inspector "Frame": frame an arbitrary tank-space point (a tower, a city cell, a
    // fish -- anything with a position and a real-world size). Unlike Follow above, a focus point
    // never moves on its own, so this just eases cam.fc toward it and cam.fdist toward a distance
    // that frames `span` -- same formula standalone Tower Forge's own fitCamera() uses (span is
    // already whatever the caller decided "the whole object" spans, d = span / (2 tan(fov/2))).
    // Turn (S.yaw) and Zoom stay fully live, same as Top/Angled, so the user can still orbit/zoom
    // once fitted instead of being locked to one frozen shot.
    const goal = [sceneFocus.pos[0], sceneFocus.pos[1], tankDepth() * 0.75];
    cam.fc = cam.fc || goal.slice();
    const k = Math.min(1, dt * 3); for (let i = 0; i < 3; i++) cam.fc[i] += (goal[i] - cam.fc[i]) * k;
    const goalDist = (sceneFocus.span / (2 * Math.tan(fov / 2)) * 1.3) / S.zoom;
    cam.fdist = ease(cam.fdist, goalDist, k);
    const goalTilt = Math.max(tilt, 24 * DEG);
    cam.ftilt = ease(cam.ftilt, goalTilt, k);
    c = cam.fc; tilt = cam.ftilt; dist = cam.fdist;   // yaw stays the normal eased S.yaw -- free orbit around the fit point
  }
  const envShot = window.ENVX && ENVX.camera(dt);   // a set piece's directed shot (places/engine.js) takes the camera
  if (envShot) { c = envShot.c; yaw = envShot.yaw; tilt = envShot.tilt; dist = envShot.dist; }
  const eye = [c[0] + Math.sin(yaw) * Math.sin(tilt) * dist, c[1] + Math.cos(yaw) * Math.sin(tilt) * dist, c[2] - Math.cos(tilt) * dist];
  const view = M4.look(eye, c, [-Math.sin(yaw), -Math.cos(yaw), -0.25]);
  const near = dist * 0.1, far = Math.max(dist, frameDist) * 4 + TD * 2;
  // orthographic uses the SAME eye/dist the perspective orbit does (just a different projection), sized
  // so objects at the focal distance read the same size switching projections -- only how size changes
  // with depth differs (ortho: not at all; perspective: nearer reads bigger), which is the whole point
  const proj = S.projection === 'ortho' ? M4.ortho(2 * dist * Math.tan(fov / 2) * aspect, 2 * dist * Math.tan(fov / 2), near, far) : M4.persp(fov, aspect, near, far);
  cam.vp = M4.mul(proj, view); cam.ivp = M4.inv(cam.vp); cam.eye = eye; cam.refDist = frameDist; cam.dist = dist;   // dist: how far the camera really is (zoom, follow, a shot), for line widths in world units
  cam.shift = 1 - vis;
  cam.shiftX = (coverL - coverR) / vw;                  // centred between the rack on the left and the dock on the right
}
// a screen point to the tank: cast a ray and meet the plane at the given depth

// ---------- fish: full simulation (species derivation, boids, predation, carcasses, respawn)
// now lives in packages/ecology/ecology-sim.js (window.EcologySim) -- see sim = EcologySim.create(S) above.
// What stays here: the pointer/vortex input listeners (DOM-only) and the colHi/colLo/glow lookup
// (render-only -- those fields are read directly off the bare SPECIES array by writeSpines/draw
// below, never by the sim, so they're derived here rather than in packages/ecology/ecology-sim.js).

const toTank = e => screenToTank(e.clientX, e.clientY, tankDepth() * 0.35);
// dragging the canvas turns the camera's own Tilt/Turn sliders -- the fish attract/scatter pointer
// below is hover-driven (pointermove fires, and always has, whether or not a button is held), so it
// keeps tracking the cursor throughout a drag too; nothing about it depends on a modifier key, which
// a first version of this required (right-click/ctrl-click) and turned out not to be discoverable.
// Shift-drag pans instead of rotating: it offsets camPan (tank-space [x, y, z], added to
// updateCamera()'s default view centre) rather than touching the Tilt/Turn sliders. Horizontal
// drag (dx) moves the view sideways along the camera's own current "right" vector (so it still
// feels lateral at any yaw); vertical drag (dy) moves it along tank Z directly -- real vertical
// camera movement, not ground-plane forward/back, since tank Z IS the vertical axis here (smaller
// Z is higher/closer to camera, documented at tankDepth()'s own definition above). The conversion
// from screen pixels to tank units uses the camera's actual current distance (cam.refDist /
// S.zoom, same frameDist updateCamera derives every frame) and half the vertical FOV, so a pixel
// of drag always moves the same amount under the cursor regardless of zoom level -- a real "grab
// and drag" pan, not a flat per-pixel constant like the rotate-drag above uses.
const tiltEl = document.getElementById('tilt'), yawEl = document.getElementById('yaw');
const dragRange = (el, v) => { el.value = Math.min(+el.max, Math.max(+el.min, v)).toFixed(0); el.dispatchEvent(new Event('input', { bubbles: true })); };
let camDrag = null;
let camPan = [0, 0, 0];
canvas.addEventListener('pointermove', e => {
  [sim.ptr.x, sim.ptr.y] = toTank(e); sim.ptr.active = true;
  if (camDrag && camDrag.pan) {
    const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
    const dist = (cam.refDist || tankW()) / Math.max(0.1, S.zoom);
    const unitsPerPx = (2 * dist * Math.tan(20 * DEG)) / Math.max(1, vh);   // updateCamera's fov is 40deg
    const yaw = cam.yaw || 0, right = [Math.cos(yaw), -Math.sin(yaw)];
    camPan[0] = camDrag.pan0[0] - dx * right[0] * unitsPerPx;
    camPan[1] = camDrag.pan0[1] - dx * right[1] * unitsPerPx;
    camPan[2] = camDrag.pan0[2] + dy * unitsPerPx;   // drag down -> larger Z -> camera moves down
  } else if (camDrag) {
    dragRange(yawEl, camDrag.yaw + (e.clientX - camDrag.x) * 0.3);
    if (!(window.ENVX && ENVX.P && ENVX.shotsOn)) dragRange(tiltEl, camDrag.tilt - (e.clientY - camDrag.y) * 0.3);   // a directed shot keeps its own tilt: dragging turns it
  }
});
canvas.addEventListener('pointerdown', e => {
  [sim.ptr.x, sim.ptr.y] = toTank(e); sim.ptr.active = true; if (S.flow === 'vortex') { sim.vortex.x = sim.ptr.x; sim.vortex.y = sim.ptr.y; }
  if (e.shiftKey) { clearSceneFocus(); camDrag = { x: e.clientX, y: e.clientY, pan: true, pan0: camPan.slice() }; }
  else { camDrag = { x: e.clientX, y: e.clientY, yaw: +yawEl.value, tilt: +tiltEl.value }; }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', e => {
  if (camDrag && !camDrag.pan && Math.hypot(e.clientX - camDrag.x, e.clientY - camDrag.y) < 5) {
    if (FORGE_EMBED) forgePick(e.clientX, e.clientY);
    else { const hit = pickAt(e.clientX, e.clientY); if (hit) selectObject(hit); else clearSelection(); }
  }
  camDrag = null; canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointercancel', () => { camDrag = null; });
canvas.addEventListener('pointerleave', () => { sim.ptr.active = false; });

// ---------- Scene selection: click a tower, city cell or fish to inspect it (see #inspector
// below). Picking is screen-space-nearest against projected candidate points for towers/fish
// (hudProject/hudRect, the same projection the threat HUD already uses -- both are `function`
// declarations defined further down, hoisted, so calling them from here is safe) and an exact
// ray/ground-plane + polar-bucket lookup for city cells (cells already carry their own closed-form
// r0/r1/a0/a1 wedge bounds, no need for real geometric raycasting against their meshes). ----------
let selection = null;              // { kind:'tower', idx } | { kind:'cell', cell } | { kind:'fish', fish } | null
let selectionHighlight = null;     // {vao,count} line geometry for the tower/cell highlight ring, rebuilt per selection
function pointSegDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
  let k = len2 > 1e-6 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
  k = Math.max(0, Math.min(1, k));
  return Math.hypot(px - (x0 + dx * k), py - (y0 + dy * k));
}
function pickTowerAt(px, py) {
  let best = -1, bestD = 40;   // generous px tolerance -- towers are the "big landmark" objects
  for (let i = 0; i < placedTowers.length; i++) {
    const tw = placedTowers[i];
    const base = hudProject(tw.pos[0], tw.pos[1], tw.model[14]);
    const tip = hudProject(tw.pos[0], tw.pos[1], tw.model[14] - tw.built.top * tw.scale);
    if (!base || !tip) continue;
    const d = pointSegDist(px, py, base.x, base.y, tip.x, tip.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best < 0 ? null : { kind: 'tower', idx: best };
}
function pickFishAt(px, py) {
  let best = null, bestD = 26;
  for (const f of sim.fish) {
    if (f.dead || f.caught) continue;
    const r = hudRect(f); if (!r) continue;
    const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best ? { kind: 'fish', fish: best } : null;
}
function pickCellAt(px, py) {
  if (!lastWfc || !lastCityModel) return null;
  const [wx, wy] = screenToTank(px, py, lastCityModel[14]);
  const cityScale = lastCityModel[0];
  const localX = (wx - lastCityModel[12]) / cityScale, localZ = (wy - lastCityModel[13]) / cityScale;
  const r = Math.hypot(localX, localZ);
  let a = Math.atan2(localZ, localX); if (a < 0) a += Math.PI * 2;
  const ring = ringIndexForRadius(r);
  if (ring <= 0) return null;   // ring 0 (hub) intentionally has no pickable cell -- the hub stands a real tower, clicking it picks that instead
  const cells = cellsByRing.get(ring);
  if (!cells) return null;
  for (const cell of cells) {
    let a0 = cell.a0 % (Math.PI * 2); if (a0 < 0) a0 += Math.PI * 2;
    let a1 = cell.a1 % (Math.PI * 2); if (a1 < 0) a1 += Math.PI * 2;
    const inWedge = a0 <= a1 ? (a >= a0 && a < a1) : (a >= a0 || a < a1);
    if (inWedge) return { kind: 'cell', cell };
  }
  return null;
}
function pickAt(px, py) { return pickTowerAt(px, py) || pickFishAt(px, py) || pickCellAt(px, py); }

function buildFlatRingLines(cx, cy, z, radius, color) {
  const SEG = 48, pos = [];
  for (let i = 0; i < SEG; i++) {
    const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
    pos.push(cx + radius * Math.cos(a0), cy + radius * Math.sin(a0), z, cx + radius * Math.cos(a1), cy + radius * Math.sin(a1), z);
  }
  const positions = new Float32Array(pos), colors = new Float32Array(positions.length);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = color[0]; colors[i + 1] = color[1]; colors[i + 2] = color[2]; }
  return uploadLinePart({ positions, color: colors });
}
function buildCellHighlightLines(cell, cityModel, color) {
  const SEG = 16, a0 = cell.a0, a1 = cell.a1, pos = [];
  for (let i = 0; i < SEG; i++) {
    const t0 = a0 + (a1 - a0) * i / SEG, t1 = a0 + (a1 - a0) * (i + 1) / SEG;
    pos.push(cell.r0 * Math.cos(t0), 0, cell.r0 * Math.sin(t0), cell.r0 * Math.cos(t1), 0, cell.r0 * Math.sin(t1));
    pos.push(cell.r1 * Math.cos(t0), 0, cell.r1 * Math.sin(t0), cell.r1 * Math.cos(t1), 0, cell.r1 * Math.sin(t1));
  }
  pos.push(cell.r0 * Math.cos(a0), 0, cell.r0 * Math.sin(a0), cell.r1 * Math.cos(a0), 0, cell.r1 * Math.sin(a0));
  pos.push(cell.r0 * Math.cos(a1), 0, cell.r0 * Math.sin(a1), cell.r1 * Math.cos(a1), 0, cell.r1 * Math.sin(a1));
  const positions = new Float32Array(pos), colors = new Float32Array(positions.length);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = color[0]; colors[i + 1] = color[1]; colors[i + 2] = color[2]; }
  mat4TransformPoints(positions, cityModel);
  return uploadLinePart({ positions, color: colors });
}
const SELECTION_COLOR = [1.0, 0.82, 0.3];
function rebuildSelectionHighlight() {
  if (selectionHighlight) { gl.deleteVertexArray(selectionHighlight.vao); selectionHighlight = null; }
  if (!selection) return;
  if (selection.kind === 'tower') {
    const tw = placedTowers[selection.idx]; if (!tw) return;
    const footprintR = Math.max(0.3, ...tw.spec.tiers.map(t => Math.max(t.r0, t.r1))) * tw.scale * 1.7;
    selectionHighlight = buildFlatRingLines(tw.pos[0], tw.pos[1], tw.model[14] - tw.scale * 0.3, footprintR, SELECTION_COLOR);
  } else if (selection.kind === 'cell' && lastCityModel) {
    selectionHighlight = buildCellHighlightLines(selection.cell, lastCityModel, SELECTION_COLOR);
  }
  // fish selection has no ring geometry -- it reuses the existing hud-box overlay instead (see hudUpdate)
}
function drawSelectionHighlight(tt) {
  if (!selectionHighlight) return;
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(creatureLineProg.p);
  const u = creatureLineProg.u;
  gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX);
  gl.uniformMatrix4fv(u.uModel, false, IDENTITY4); gl.uniform1f(u.uAlpha, 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(tt * 4)));
  gl.bindVertexArray(selectionHighlight.vao); gl.drawArrays(gl.LINES, 0, selectionHighlight.count);
  gl.disable(gl.BLEND); gl.depthMask(true);
}
function fishStateLabel(f) {
  if (f.caught) return 'Caught';
  if (f.target) return 'Hunting';
  if (f.alarm > 0.35) return 'Fleeing';
  return 'Swimming';
}
function selectObject(sel) { selection = sel; rebuildSelectionHighlight(); renderInspector(); }
function clearSelection() { selection = null; rebuildSelectionHighlight(); renderInspector(); }
function focusSelection() {
  if (!selection) return;
  if (selection.kind === 'tower') { const tw = placedTowers[selection.idx]; if (tw) setSceneFocus(tw.pos.slice(), towerFocusSpan(tw), 'tower:' + selection.idx); }
  else if (selection.kind === 'cell') { const c = selection.cell, mid = (c.r0 + c.r1) / 2 * lastCityModel[0]; setSceneFocus([lastCityModel[12], lastCityModel[13]], Math.max(8, mid * 2.2), 'cell:' + c.id); }
  else if (selection.kind === 'fish') { const f = selection.fish; setSceneFocus([f.x, f.y], 12, 'fish'); }
}
function renderInspector() {
  const panel = document.getElementById('inspector');
  if (!selection) { panel.hidden = true; return; }
  panel.hidden = false;
  const title = document.getElementById('insp-title'), body = document.getElementById('insp-body'), actionBtn = document.getElementById('insp-action');
  body.innerHTML = ''; actionBtn.hidden = true; actionBtn.onclick = null;
  const row = (k, v) => { const r = document.createElement('div'); r.className = 'insp-row'; const b = document.createElement('b'); b.textContent = k; const s = document.createElement('span'); s.textContent = v; r.append(b, s); body.append(r); };
  const note = text => { const n = document.createElement('div'); n.className = 'insp-note'; n.textContent = text; body.append(n); };
  if (selection.kind === 'tower') {
    const tw = placedTowers[selection.idx];
    if (!tw) { clearSelection(); return; }
    title.textContent = towerLabel(selection.idx);
    row('Tiers', tw.spec.tiers.length);
    row('Height', tw.built.top.toFixed(1) + ' m');
    row('Crown', tw.spec.crown.kind);
    row('Halos', tw.spec.halos.length);
    actionBtn.hidden = false; actionBtn.textContent = 'Edit this tower';
    actionBtn.onclick = () => { showMode('r-tower'); selectTower(selection.idx); showTowerMode('tm-edit'); };
  } else if (selection.kind === 'cell') {
    const cell = selection.cell, tile = lastWfc && lastWfc.tiles[lastWfc.result[cell.id]];
    title.textContent = tile ? tile.name : 'Unsolved cell';
    row('Zone', (CityWFC.ZONES[cell.zone] || {}).name || cell.zone);
    row('Ring', cell.ring);
    if (tile) { row('Sockets', `${tile.in}${tile.out}${tile.cw}${tile.ccw}`); if (tile.note) note(tile.note); }
    actionBtn.hidden = false; actionBtn.textContent = 'View in Pieces';
    actionBtn.onclick = () => { showMode('r-city'); showCitySubtab('ct-pieces'); };
  } else if (selection.kind === 'fish') {
    const f = selection.fish;
    if (f.dead || f.caught || !sim.fish.includes(f)) { clearSelection(); return; }
    title.textContent = SPECIES[f.sp].name;
    row('State', fishStateLabel(f));
    if (f.target && !f.target.dead && !f.target.caught) row('Target', SPECIES[f.target.sp].name);
  }
}
document.getElementById('insp-close').addEventListener('click', clearSelection);
document.getElementById('insp-frame').addEventListener('click', focusSelection);
document.addEventListener('keydown', e => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;   // don't steal keys from form fields
  if (e.key === 'Escape') { clearSelection(); clearSceneFocus(); }
  else if (e.key === 'f' || e.key === 'F') { if (selection) focusSelection(); }
  else if (e.key === 'h' || e.key === 'H') setPanelsHidden(!document.body.classList.contains('panels-hidden'));
});
const panelsToggleBtn = document.getElementById('panels-toggle');
function setPanelsHidden(hidden) {
  document.body.classList.toggle('panels-hidden', hidden);
  panelsToggleBtn.setAttribute('aria-pressed', String(hidden));
  panelsToggleBtn.textContent = hidden ? 'Show panels' : 'Hide panels';
}
panelsToggleBtn.addEventListener('click', () => setPanelsHidden(!document.body.classList.contains('panels-hidden')));
// scroll (or pinch, which browsers report as a ctrl+wheel) to zoom the camera in and out
const zoomEl = document.getElementById('zoom');
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const min = +zoomEl.min, max = +zoomEl.max;
  const nv = Math.min(max, Math.max(min, +zoomEl.value * Math.exp(-e.deltaY * 0.0012)));
  zoomEl.value = nv.toFixed(3);
  zoomEl.dispatchEvent(new Event('input', { bubbles: true }));
}, { passive: false });

for (const sp of SPECIES) {
  const h = HUE[sp.key], hi = h ? h.hi : DEFAULT_COL_HI;
  sp.colHi = hi; sp.colLo = h?.lo || hi.map(v => v * 0.556); sp.glow = h?.glow || 0;   // 0.556 matches
}                                                                                       // the original teal's lo:hi ratio
// .wing drives the render's wingbeat uniform below; packages/ecology/ecology-sim.js derives its own copy of
// this same value (from the same WING table) independently, for the sim's trail3D roll -- a trivial
// one-line formula, cheaper to duplicate than to thread sim.speciesRT through every draw call here.
for (const sp of SPECIES) sp.wing = WING[sp.key] ?? 0.25;
