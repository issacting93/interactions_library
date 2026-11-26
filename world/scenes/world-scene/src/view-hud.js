// world/scenes/world-scene/src/view-hud.js -- World Scene: View presets, follow, the iris finish; capturing a preset; the rotary knobs; the threat HUD; the main loop.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- view presets, follow, iris finish ----------
document.querySelectorAll('input[name="proj"]').forEach(r => r.addEventListener('change', () => { S.projection = r.value; }));
document.querySelectorAll('input[name="view"]').forEach(r => r.addEventListener('change', () => {
  S.view = r.value;
  if (r.value === 'top') { setRange('tilt', 0); setRange('yaw', 0); if (S.orbit) document.getElementById('orbit').click(); cam.yawT = 0; setRange('zoom', 1.4); camPan[0] = 0; camPan[1] = 0; camPan[2] = 0; }
  if (r.value === 'angle') { if (+document.getElementById('tilt').value < 10) setRange('tilt', 38); setRange('zoom', 1.5); }
  if (r.value === 'follow') pickFollow();
}));
document.getElementById('next').addEventListener('click', () => { pickFollow(); if (S.view !== 'follow') document.getElementById('v-follow').click(); });
document.getElementById('recentre').addEventListener('click', () => { camPan[0] = 0; camPan[1] = 0; camPan[2] = 0; });
// Style: one list of recipes (built-ins + Forge-saved). Picking one sets the Look tab's knobs to that
// recipe's own values; the Style section only shows for the recipe-shaded kinds (not Glitch).
const stylePick = document.getElementById('style-pick');
function fillStylePick() {
  const all = StyleRecipes.all(), saved = all.filter(r => r.saved), opt = r => `<option value="${r.id}">${r.name}</option>`;
  stylePick.innerHTML = all.filter(r => !r.saved).map(opt).join('') + (saved.length ? `<optgroup label="Saved in Forge">${saved.map(opt).join('')}</optgroup>` : '');
  stylePick.value = S.style;
}
const syncStyleUI = () => {
  document.body.classList.toggle('route', styled());
  document.getElementById('style-title').textContent = curStyle.name || 'Style';
  document.getElementById('style-note').textContent = curStyle.note || '';
  if (stylePick.value !== S.style) stylePick.value = S.style;
};
function knobsFromRecipe() {
  setRange('routeLines', curStyle.lines.strength); setRange('routeBright', 1);
  setRange('routeGrain', curStyle.atmo.grain); setRange('routeVignette', curStyle.atmo.vignette);
  if (!S.routeAtmo) document.getElementById('route-atmo-toggle').click();
}
function setStyleId(id, keepKnobs) {
  S.style = id === 'route' ? 'route-zero' : id;
  curStyle = StyleRecipes.get(S.style);
  if (!keepKnobs) knobsFromRecipe();
  syncStyleUI();
}
fillStylePick();
stylePick.addEventListener('change', () => setStyleId(stylePick.value));
syncStyleUI();
document.getElementById('route-match').addEventListener('click', knobsFromRecipe);
document.getElementById('style-edit').addEventListener('click', () => window.open('../../forge/web/style.html?style=' + encodeURIComponent(S.style), '_blank'));
// styles saved in Forge: read once now, and again whenever this tab comes back into focus (so a
// style saved in Forge's other tab shows up without a reload)
const refreshSavedStyles = () => StyleRecipes.loadSaved().then(() => { curStyle = StyleRecipes.get(S.style); fillStylePick(); syncStyleUI(); });
refreshSavedStyles();
window.addEventListener('focus', refreshSavedStyles);
document.querySelectorAll('input[name="irismode"]').forEach(r => r.addEventListener('change', () => {
  S.irisMode = +r.value;
  if (+document.getElementById('iris').value <= 0) setRange('iris', 0.6);   // picking a finish is a request to see it
}));

// ---------- preset: capture the whole tunable state (sliders, toggles, population, seabed seed) into
// a link; applying one replays it onto the same controls that already drive S, so nothing new to keep in sync ----------
const RADIO_KEYS = [['flow', 'flow'], ['mode', 'mode'], ['beh', 'beh'], ['ptr', 'ptr'], ['view', 'view'], ['proj', 'projection']];
const TOGGLE_KEYS = [['orbit', 'orbit'], ['snow', 'snow'], ['hud-toggle', 'hud'], ['portrait', 'portrait'], ['route-atmo-toggle', 'routeAtmo']];
function capturePreset() {
  const p = { seed: S.seed, species: S.species, pop: { ...sim.pop } };
  for (const k of Object.keys(fmt)) p[k] = S[k];
  for (const [, key] of RADIO_KEYS) p[key] = S[key];
  for (const [, key] of TOGGLE_KEYS) p[key] = S[key];
  p.irisMode = S.irisMode; p.style = S.style;
  return p;
}
function applyPreset(p) {
  if (p.seed != null && p.seed !== S.seed) { S.seed = p.seed; regenTerrain(S.seed); terrainRebuild(); showSeed(); }
  if (p.species) setSpecies(p.species);
  if (p.pop) {
    Object.assign(sim.pop, p.pop);
    ecoEls.forEach((e, i) => { const v = sim.pop[SPECIES[i].key]; if (v != null) e.inp.value = v; });
    EcologySim.setCount(sim);
  }
  if (p.style) setStyleId(p.style);   // first, so the preset's own knob values below win over the recipe's
  for (const k of Object.keys(fmt)) if (p[k] != null) setRange(k, p[k]);
  for (const [name, key] of RADIO_KEYS) {
    if (p[key] == null) continue;
    const r = document.querySelector(`input[name="${name}"][value="${p[key]}"]`);
    if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change')); }
  }
  if (p.irisMode != null) {
    const r = document.querySelector(`input[name="irismode"][value="${p.irisMode}"]`);
    if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change')); }
  }
  for (const [id, key] of TOGGLE_KEYS) {
    if (p[key] == null) continue;
    if (S[key] !== !!p[key]) document.getElementById(id).click();
  }
  refreshEco();
}
document.getElementById('copylink').addEventListener('click', async () => {
  const url = location.href.split('#')[0] + '#' + btoa(JSON.stringify(capturePreset()));
  const btn = document.getElementById('copylink'), old = btn.textContent;
  try { await navigator.clipboard.writeText(url); btn.textContent = 'Copied!'; }
  catch { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = old; }, 1400);
});
document.getElementById('shot').addEventListener('click', () => {
  canvas.toBlob(blob => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cybernetic-ecology.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
});
if (urlPreset) applyPreset(urlPreset);

// ---------- rotary knobs: a patch-style 270° readout in front of each range input; it drives the
// same input (reads and writes .value, fires real 'input' events), so nothing else knows it exists ----
document.querySelectorAll('.dock .ctl input[type=range]').forEach(input => input.insertAdjacentElement('beforebegin', makeKnob(input)));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused = reduce;
const pauseBtn = document.getElementById('pause');
pauseBtn.textContent = paused ? 'Play' : 'Pause';
pauseBtn.classList.toggle('on', !paused);
pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? 'Play' : 'Pause'; pauseBtn.classList.toggle('on', !paused); });

const fpsEl = document.getElementById('fps'), vertsEl = document.getElementById('verts');

// ---------- threat HUD: a bounding box on the hunter and on whoever it's locked onto (chase), and a
// box on anyone alarmed enough to be fleeing, joined to the nearest thing it's fleeing from. ----------
const hudEl = document.getElementById('hud'), hudLinesEl = document.getElementById('hud-lines');
const hudPool = [];
function hudProject(x, y, z) {
  const m = cam.vp; if (!m) return null;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw < 1e-3) return null;    // behind the camera
  const ndcX = (cx + cam.shiftX * cw) / cw, ndcY = (cy + cam.shift * cw) / cw;
  return { x: (ndcX * 0.5 + 0.5) * vw, y: (1 - (ndcY * 0.5 + 0.5)) * vh };
}
// the fish's actual on-screen bounding box, from its projected spine (every other chain joint is
// plenty to get the extent)
const HUD_MAX_PAIRS = 9;
function hudPairs() {
  const pairs = [];
  if (S.beh !== 'on') return pairs;
  for (const f of sim.fish) {                                      // chasing: whoever has a target locked
    if (pairs.length >= HUD_MAX_PAIRS) return pairs;
    if (f.dead || f.caught || !f.target) continue;
    const t = f.target; if (t.dead || t.caught) continue;
    pairs.push({ hunter: f, prey: t, kind: 'chase' });
  }
  for (const f of sim.fish) {                                      // avoiding: alarmed prey + nearest threat
    if (pairs.length >= HUD_MAX_PAIRS) return pairs;
    if (f.dead || f.caught || f.alarm < 0.35) continue;
    const spc = sim.speciesRT[f.sp]; if (!spc.predators.size) continue;
    const best = EcologySim.nearestFish(sim, f.x, f.y, sim.gridCell * 6, h => h !== f && !h.dead && !h.caught && spc.predators.has(h.sp));
    if (best) pairs.push({ hunter: best, prey: f, kind: 'flee' });
  }
  return pairs;
}
// selected-fish highlight box: a dedicated element outside hudPool (not part of the hunt/flee
// pairs cycle below) and independent of the S.hud toggle -- it's deliberate selection feedback
// from a click, not the ambient predator/prey debug overlay, so it stays even with HUD off.
let selFishBoxEl = null;
function ensureSelFishBox() {
  if (selFishBoxEl) return selFishBoxEl;
  const el = document.createElement('div'); el.className = 'hud-box hud-box-sel';
  const lab = document.createElement('div'); lab.className = 'hud-label'; el.appendChild(lab);
  hudEl.appendChild(el);
  return (selFishBoxEl = { el, lab });
}
function hudUpdate() {
  if (selection && selection.kind === 'fish') {
    const f = selection.fish;
    if (f.dead || f.caught || !sim.fish.includes(f)) { clearSelection(); }
    else {
      const r = hudRect(f), b = ensureSelFishBox();
      if (r) { b.el.style.cssText = `opacity:0.95;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`; b.lab.textContent = SPECIES[f.sp].name.toUpperCase(); }
      else b.el.style.opacity = 0;
    }
  } else if (selFishBoxEl) { selFishBoxEl.el.style.opacity = 0; }
  if (!S.hud) { for (const b of hudPool) b.el.style.opacity = 0; hudLinesEl.innerHTML = ''; return; }
  const pairs = hudPairs();
  let n = 0, svg = '';
  for (const { hunter, prey, kind } of pairs) {
    const rh = hudRect(hunter), rp = hudRect(prey);
    if (!rh || !rp) continue;
    const bh = hudBoxEl(n++); bh.el.style.cssText = `opacity:0.7;left:${rh.x}px;top:${rh.y}px;width:${rh.w}px;height:${rh.h}px`;
    bh.lab.textContent = `${SPECIES[hunter.sp].name.toUpperCase()} · ${kind === 'chase' ? 'HUNTING' : 'THREAT'}`;
    const bp = hudBoxEl(n++); bp.el.style.cssText = `opacity:0.7;left:${rp.x}px;top:${rp.y}px;width:${rp.w}px;height:${rp.h}px`;
    const d = (Math.hypot(prey.x - hunter.x, prey.y - hunter.y) / EcologySim.bodyLen(sim, prey)).toFixed(1);
    bp.lab.textContent = kind === 'chase' ? `${SPECIES[prey.sp].name.toUpperCase()} · TARGET ${d}×` : `${SPECIES[prey.sp].name.toUpperCase()} · FLEEING ${Math.round(prey.alarm * 100)}%`;
    svg += `<path d="M${rh.cx.toFixed(1)},${rh.cy.toFixed(1)} L${rp.cx.toFixed(1)},${rp.cy.toFixed(1)}"/><circle cx="${rh.cx.toFixed(1)}" cy="${rh.cy.toFixed(1)}" r="2"/><circle cx="${rp.cx.toFixed(1)}" cy="${rp.cy.toFixed(1)}" r="2"/>`;
  }
  for (let i = n; i < hudPool.length; i++) hudPool[i].el.style.opacity = 0;
  hudLinesEl.innerHTML = svg;
}

initForgeHost();   // Forge's seam (forge-host.js): window.ForgeCityHost, and a saved Forge city named in the URL

let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0, lastAtmoT = 0;   // (t, the scene's clock, is declared in core.js: a load-time callback may read it before this file runs)
updateCamera(0);
for (let i = 0; i < 90; i++) EcologySim.step(sim, 1 / 60);   // settle so the first frame already shows a school
function loop(now) {
  if (forgeAsleep || (window.ENVX && ENVX.manualOn)) { last = now; requestAnimationFrame(loop); return; }   // ENVX.manual: a recorder steps the scene itself
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (!paused) { EcologySim.step(sim, dt); forgeDriftTick(dt); stepCityWalkers(dt); stepForgeGround(dt); t += dt; window.ENVX && ENVX.tick(dt); }
  updateCamera(paused ? 0 : dt);
  draw(t);
  hudUpdate();
  fpsAcc += dt; fpsN++;
  if (now - fpsT > 500) {
    fpsEl.textContent = Math.round(fpsN / Math.max(fpsAcc, 1e-3));
    let pts = S.mode !== 'sigil' ? sim.fish.length * CLOUD_N * S.density : 0;
    if (S.mode !== 'cloud') for (const f of sim.fish) pts += SPECIES[f.sp].counts.fillVerts + SPECIES[f.sp].counts.lineVerts;
    vertsEl.textContent = `${sim.fish.length} alive · ${new Set(sim.fish.map(f => f.sp)).size} kinds · ${sim.tally.reduce((a, t) => a + t.eaten, 0)} eaten · ${(pts / 1000).toFixed(0)}k points`;
    refreshEco();
    fpsAcc = 0; fpsN = 0; fpsT = now;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
