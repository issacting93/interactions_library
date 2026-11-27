// world/scenes/world-scene/src/world-tab.js -- World Scene: The World tab: seed and tower count, regenerating city, towers and vortices together.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- World tab: seed + tower count, regenerates city + towers + vortices together ----------
document.getElementById('world-seed').value = S.seed;
document.getElementById('o-world-towers').textContent = document.getElementById('world-towers').value;
document.getElementById('world-towers').addEventListener('input', e => { document.getElementById('o-world-towers').textContent = e.target.value; });
// City Pieces/Rules sub-tabs: shared/engine/city/city-gen-ui.js builds pure DOM/canvas reference material off
// the live wfc result (lastWfc, already kept around for rebuildCityCreatureGeometry's own rebuilds)
// -- cheap enough (no WebGL) to just rebuild both whenever the city regenerates.
// the City tab reads the city grammar: its districts, the modules this city used, and its rules
const citySubTabs = [['ct-city', 'ctp-city'], ['ct-pieces', 'ctp-pieces'], ['ct-rules', 'ctp-rules']];
function showCitySubtab(id) {
  for (const [t, p] of citySubTabs) { const on = t === id; document.getElementById(t).setAttribute('aria-selected', String(on)); document.getElementById(p).hidden = !on; }
}
for (const [t] of citySubTabs) document.getElementById(t).addEventListener('click', () => showCitySubtab(t));
document.getElementById('city-grid-toggle').addEventListener('click', e => {
  S.showGrid = !S.showGrid; e.target.setAttribute('aria-pressed', String(S.showGrid));
});
document.getElementById('city-walkers-toggle').addEventListener('click', e => {
  S.showWalkers = !S.showWalkers; e.target.setAttribute('aria-pressed', String(S.showWalkers));
});
document.getElementById('o-city-grow-speed').textContent = document.getElementById('city-grow-speed').value + '/s';
document.getElementById('city-grow-speed').addEventListener('input', e => {
  cityRevealSpeed = +e.target.value; document.getElementById('o-city-grow-speed').textContent = e.target.value + '/s';
});
document.getElementById('city-replay').addEventListener('click', () => { cityRevealStart = t; });
document.getElementById('city-instant').addEventListener('click', () => { cityRevealStart = -1e6; });
document.getElementById('world-new').addEventListener('click', () => {
  const seed = Math.floor(+document.getElementById('world-seed').value) || Math.floor(Math.random() * 1e9);
  const n = +document.getElementById('world-towers').value || 3;
  S.seed = seed; document.getElementById('world-seed').value = seed;
  buildPlacedCity(seed, n);
  refreshVortices();
  refreshCityGenPanels();
  cityRevealStart = t;   // play the growth reveal -- regenerating is the moment it actually earns its keep
  curTowerIdx = 0; curTierIdx = 0;
  populateTowerSelect(); renderTowerForms(); profileEditor.draw();
  towerHistory = []; towerHistoryPos = -1; pushTowerHistory();
});
refreshCityGenPanels();

for (const [t] of tabs) document.getElementById(t).addEventListener('click', () => showTab(t));
document.querySelector('.tabs').addEventListener('keydown', e => {
  const i = tabs.findIndex(([t]) => document.getElementById(t).getAttribute('aria-selected') === 'true');
  const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return;
  const n = tabs[(i + d + tabs.length) % tabs.length][0]; showTab(n); document.getElementById(n).focus(); e.preventDefault();
});
// the dock opens and closes from the rail: click the lit mode button again to put it away
function setDock(open) { dockEl().hidden = !open; refreshEco(); }
document.getElementById('hide-all').addEventListener('click', () => setPanelsHidden(true));
// phones: the drawer's quick switches open over the tank from the rail's Quick button
const quickBtn = document.getElementById('r-quick');
quickBtn.addEventListener('click', () => { const open = !document.body.classList.contains('drawer-open'); document.body.classList.toggle('drawer-open', open); quickBtn.setAttribute('aria-pressed', String(open)); });
if (vw <= 760) setDock(false);            // phones start with the tank, not the panel

// Tank depth moves the floor: the city and its towers stand at 0.92 of the depth, so they are built again where the new floor is (same seed,
// same towers) -- otherwise the creatures and a place's plants would move and the city stay put. On letting go of the slider, and when a
// place sets its own depth (places/engine.js)
function cityFollowDepth() {
  if (Math.abs(cityBuiltTD - tankDepth()) < 0.5) return false;
  buildPlacedCity(lastCitySeed || S.seed, +document.getElementById('world-towers').value || 3);
  refreshVortices(); refreshCityGenPanels(); return true;
}
document.getElementById('dz').addEventListener('change', () => { if (cityFollowDepth() && window.ENVX && ENVX.P) ENVX.replant(); });
