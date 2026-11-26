// world/scenes/world-scene/src/panels.js -- World Scene: The ecosystem panel, the dock's layout, and the rail's mode switch (Ecology / City / Tower).
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- ecosystem panel ----------
const ecoP = document.getElementById('tab-eco'), ecoRows = document.getElementById('eco-rows');
const nameOf = i => SPECIES[i].name.split(' ').pop().toLowerCase();
const ecoEls = sim.speciesRT.map((sp, i) => {
  const b = sp.beh, eats = [...sp.preySet].map(nameOf), feared = [...sp.predators].map(nameOf);
  const row = document.createElement('div'); row.className = 'eco-row';
  const max = Math.max(12, (sim.POP_DEFAULT[sp.key] || 4) * 3);
  row.innerHTML = `<b>${sp.name}<i>${b.mood || ''}</i></b><input type="range" min="0" max="${max}" step="1" value="${sim.pop[sp.key] ?? 4}" aria-label="${sp.name} population"><output></output>
    <small>${eats.length ? 'eats ' + eats.join(', ') : 'eats nothing here'}${feared.length ? ' · <em>avoids ' + feared.join(', ') + '</em>' : ''} · escapes: ${b.flee || 'none'}<span class="tl"></span></small>`;
  const inp = row.querySelector('input');
  inp.addEventListener('input', () => { sim.pop[sp.key] = +inp.value; EcologySim.setCount(sim); });
  ecoRows.appendChild(row);
  return { row, inp, out: row.querySelector('output'), tl: row.querySelector('.tl') };
});
function refreshEco() {
  if (ecoP.hidden || dockEl().hidden) return;
  const alive = SPECIES.map(() => 0); for (const f of sim.fish) alive[f.sp]++;
  const want = EcologySim.desired(sim);
  SPECIES.forEach((sp, i) => {
    const e = ecoEls[i];
    e.row.style.opacity = want[i] || alive[i] ? 1 : 0.45;
    e.out.textContent = `${alive[i]}/${want[i]}`;
    const t = sim.tally[i];
    e.tl.textContent = (t.eaten || t.lost) ? ` · ate ${t.eaten}, lost ${t.lost}${sim.pressure[i] > 0.8 ? ' · under pressure' : ''}` : '';
  });
  document.getElementById('eco-sum').textContent = `${sim.fish.length} alive · ${sim.tally.reduce((a, t) => a + t.eaten, 0)} eaten`;
}
document.getElementById('eco-reset').addEventListener('click', () => {
  Object.assign(sim.pop, sim.POP_DEFAULT); ecoEls.forEach((e, i) => { e.inp.value = sim.pop[SPECIES[i].key] ?? 4; }); EcologySim.setCount(sim); refreshEco();
});
for (const [id, key] of [['orbit', 'orbit'], ['snow', 'snow'], ['hud-toggle', 'hud'], ['route-atmo-toggle', 'routeAtmo']]) {
  const b = document.getElementById(id);
  b.addEventListener('click', () => { S[key] = !S[key]; b.setAttribute('aria-pressed', String(S[key])); });
}
const portraitBtn = document.getElementById('portrait');
portraitBtn.addEventListener('click', () => {
  S.portrait = !S.portrait;
  portraitBtn.setAttribute('aria-pressed', String(S.portrait));
  document.body.classList.toggle('portrait', S.portrait);
  resize();   // the canvas's own box just changed shape, but body didn't, so the ResizeObserver on
              // body won't fire this on its own — poke it directly
});
const seedOut = document.getElementById('o-seed');
function showSeed() { seedOut.textContent = '#' + S.seed; }
showSeed();
document.getElementById('reseed').addEventListener('click', () => {
  S.seed = Math.floor(Math.random() * 1e9);
  regenTerrain(S.seed); terrainRebuild(); showSeed();
});
// ---------- layout: dock tabs, show/hide, toolbar height ----------
const tabs = [['t-eco', 'tab-eco'], ['t-motion', 'tab-motion'], ['t-look', 'tab-look']];
function showTab(id) {
  for (const [t, p] of tabs) { const on = t === id; document.getElementById(t).setAttribute('aria-selected', String(on)); document.getElementById(p).hidden = !on; }
  refreshEco();
}

// ---------- rail: top-level mode switch (Ecology / City / Tower). Each mode owns one
// .mode-group in the dock (Ecology keeps its own 4-tab strip inside its group); species/tower
// pickers are dropdowns inside their own panel, not a separate bottom bar.
const railModes = [['r-eco', 'mode-eco'], ['r-city', 'mode-city'], ['r-camera', 'mode-camera'], ['r-tower', 'mode-tower']];
function showMode(id) {
  for (const [r, m] of railModes) { const on = r === id; document.getElementById(r).setAttribute('aria-selected', String(on)); document.getElementById(m).hidden = !on; }
  refreshEco();
  if (id === 'r-tower' && profileEditor) profileEditor.draw();   // the canvas was hidden (0 size) until now
}
for (const [r] of railModes) document.getElementById(r).addEventListener('click', () => {
  const already = document.getElementById(r).getAttribute('aria-selected') === 'true';
  if (already) setDock(dockEl().hidden); else { showMode(r); if (dockEl().hidden) setDock(true); }
});
document.getElementById('rail').addEventListener('keydown', e => {
  const i = railModes.findIndex(([r]) => document.getElementById(r).getAttribute('aria-selected') === 'true');
  const d = { ArrowDown: 1, ArrowUp: -1 }[e.key]; if (!d) return;
  const n = railModes[(i + d + railModes.length) % railModes.length][0]; showMode(n); document.getElementById(n).focus(); e.preventDefault();
});
