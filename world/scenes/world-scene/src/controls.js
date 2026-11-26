// world/scenes/world-scene/src/controls.js -- World Scene: The drawer's controls: the sliders and radios that set S, the species picker.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- controls & loop ----------
const fmt = { tilt: v => v + '°', yaw: v => v + '°', zoom: v => (+v).toFixed(2) + '×', bank: v => Math.round(v * 100) + '%', wings: v => Math.round(v * 100) + '%', dz: v => Math.round(v * 100) + '%', dark: v => Math.round(v * 100) + '%', swirl: v => (+v).toFixed(2), vradius: v => Math.round(v * 100) + '%', density: v => Math.round(v * 100) + '%', count: v => v, size: v => v + 'px', sep: v => (+v).toFixed(2), align: v => (+v).toFixed(2), coh: v => (+v).toFixed(2), speed: v => (+v).toFixed(2) + '×', wiggle: v => (v * 100).toFixed(1) + '%', flex: v => v + '°', glow: v => Math.round(v * 100) + '%', shimmer: v => Math.round(v * 100) + '%', trail: v => Math.round(v * 100) + '%', iris: v => Math.round(v * 100) + '%', routeLines: v => Math.round(v * 100) + '%', routeBright: v => (+v).toFixed(2) + '×', routeGrain: v => Math.round(v * 100) + '%', routeVignette: v => Math.round(v * 100) + '%' };
for (const key of Object.keys(fmt)) {
  const el = document.getElementById(key), o = document.getElementById('o-' + key);
  const set = () => { S[key] = parseFloat(el.value); o.textContent = fmt[key](el.value); if (key === 'count') EcologySim.setCount(sim); };
  el.addEventListener('input', set); set();
}
const pick = document.getElementById('species'), info = document.getElementById('info');
for (const [i, sp] of [['mixed', { name: 'All kinds', key: 'mixed' }], ...SPECIES.map((s, i) => [i, s])]) {
  const o = document.createElement('option'); o.value = sp.key; o.textContent = sp.key === 'mixed' ? 'All kinds' : sp.name; o.title = sp.name;
  pick.appendChild(o);
}
pick.addEventListener('change', () => setSpecies(pick.value));
function setSpecies(key) {
  S.species = key;
  pick.value = key;
  const sp = SPECIES.find(s => s.key === key);
  const b = sp && BEH[sp.key];
  info.textContent = sp ? `${sp.name} · ${b ? b.mood + ': ' + b.text : sp.blurb}` : `${SPECIES.length} species, each with its own temperament: hunters stalk, koi school and flee, swifts murmurate, leeches hitch rides · click to move the vortex`;
  EcologySim.setSpecies(sim, key);
}
setSpecies(S.species);
document.querySelectorAll('input[name="flow"]').forEach(r => r.addEventListener('change', () => { S.flow = r.value; }));
document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => { S.mode = r.value; }));
document.querySelectorAll('input[name="beh"]').forEach(r => r.addEventListener('change', () => { S.beh = r.value; }));
document.querySelectorAll('input[name="ptr"]').forEach(r => r.addEventListener('change', () => { S.ptr = r.value; }));
