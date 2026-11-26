// world/scenes/world-scene/src/tower-tab.js -- World Scene: The Tower tab: packages/forge/tower-forge-ui.js's editor on the selected placed tower; Variations and Atlas.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- Tower tab: the full packages/forge/tower-forge-ui.js editor, scoped to whichever placed
// tower is currently selected (standalone Tower Forge always edits one tower; here there are
// several, placed around the city, so a select box picks which spec the editor/profile canvas
// is bound to).
let curTowerIdx = 0, curTierIdx = 0, towerHistory = [], towerHistoryPos = -1, towerRebuildTimer = null;
const towerSubTabs = [['tt-tier', 'ttp-tier'], ['tt-crown', 'ttp-crown'], ['tt-aura', 'ttp-aura'], ['tt-look', 'ttp-look']];
function showTowerSubtab(id) {
  for (const [t, p] of towerSubTabs) { const on = t === id; document.getElementById(t).setAttribute('aria-selected', String(on)); document.getElementById(p).hidden = !on; }
}
for (const [t] of towerSubTabs) document.getElementById(t).addEventListener('click', () => showTowerSubtab(t));

function populateTowerSelect() {
  const sel = document.getElementById('tower-select'); sel.innerHTML = '';
  placedTowers.forEach((tw, i) => { const o = document.createElement('option'); o.value = i; o.textContent = towerLabel(i); sel.append(o); });
  sel.value = String(curTowerIdx);
}
(function populateTowerPresetSelect() {
  const sel = document.getElementById('tower-preset'); sel.innerHTML = '<option value="">Load preset…</option>';
  for (const [key, p] of Object.entries(TowerPresets)) { const o = document.createElement('option'); o.value = key; o.textContent = p.name; sel.append(o); }
})();
function renderTowerTierPicker() {
  const spec = placedTowers[curTowerIdx].spec;
  const box = document.getElementById('tower-tier-picker'); box.innerHTML = '';
  spec.tiers.forEach((t, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Tier ' + (i + 1);
    if (i === curTierIdx) b.setAttribute('aria-pressed', 'true');
    b.addEventListener('click', () => { curTierIdx = i; renderTowerForms(); profileEditor.draw(); });
    box.append(b);
  });
}
function renderTowerForms() {
  const spec = placedTowers[curTowerIdx].spec;
  renderTowerTierPicker();
  const tierBox = document.getElementById('ttp-tier'); tierBox.innerHTML = '';
  if (spec.tiers[curTierIdx]) TowerForgeUI.renderForm(tierBox, TowerForgeUI.TIER_SCHEMA, spec.tiers[curTierIdx], onTowerFieldChange);
  const crownBox = document.getElementById('ttp-crown'); crownBox.innerHTML = '';
  const h1 = document.createElement('h3'); h1.textContent = 'Crown'; crownBox.append(h1);
  TowerForgeUI.renderForm(crownBox, TowerForgeUI.CROWN_SCHEMA, spec.crown, onTowerFieldChange);
  const h2 = document.createElement('h3'); h2.textContent = 'Foot'; crownBox.append(h2);
  TowerForgeUI.renderForm(crownBox, TowerForgeUI.BASE_SCHEMA, spec.base, onTowerFieldChange);
  const auraBox = document.getElementById('ttp-aura'); auraBox.innerHTML = '';
  TowerForgeUI.renderForm(auraBox, TowerForgeUI.AURA_SCHEMA, spec.aura, onTowerFieldChange);
  const lookBox = document.getElementById('ttp-look'); lookBox.innerHTML = '';
  TowerForgeUI.renderForm(lookBox, TowerForgeUI.LOOK_SCHEMA, spec.look, onTowerFieldChange);
}
function pushTowerHistory() {
  towerHistory = towerHistory.slice(0, towerHistoryPos + 1);
  towerHistory.push({ idx: curTowerIdx, spec: JSON.parse(JSON.stringify(placedTowers[curTowerIdx].spec)) });
  towerHistoryPos = towerHistory.length - 1;
}
function onTowerFieldChange(field, done, relayout) {
  if (towerRebuildTimer) clearTimeout(towerRebuildTimer);
  towerRebuildTimer = setTimeout(() => { rebuildPlacedTowerAt(curTowerIdx); profileEditor && profileEditor.draw(); }, done ? 0 : 120);
  if (done) pushTowerHistory();
  if (relayout) renderTowerForms();
}
function selectTower(i) {
  curTowerIdx = i; curTierIdx = 0;
  populateTowerSelect();
  renderTowerForms(); profileEditor && profileEditor.draw();
}
const profileEditor = TowerForgeUI.attachProfileHandlers(document.getElementById('tower-profile'), {
  // placedTowers[curTowerIdx] can be absent if city generation exhausted RESERVE_ATTEMPTS above
  // (now rare, not impossible) -- drawProfile() already no-ops on an undefined spec.
  getSpec: () => placedTowers[curTowerIdx] && placedTowers[curTowerIdx].spec,
  getSelectedTier: () => curTierIdx,
  onSelectTier(i, { focus }) { curTierIdx = i; if (focus) { renderTowerForms(); showTowerSubtab('tt-tier'); } },
  onDrag() { if (towerRebuildTimer) clearTimeout(towerRebuildTimer); towerRebuildTimer = setTimeout(() => rebuildPlacedTowerAt(curTowerIdx), 120); },
  onCommit() { rebuildPlacedTowerAt(curTowerIdx); renderTowerForms(); pushTowerHistory(); },
});
document.getElementById('tower-select').addEventListener('change', e => selectTower(+e.target.value));
document.getElementById('tower-preset').addEventListener('change', e => {
  const key = e.target.value; if (!key) return;
  placedTowers[curTowerIdx].spec = JSON.parse(JSON.stringify(TowerPresets[key].s));
  curTierIdx = 0; rebuildPlacedTowerAt(curTowerIdx); renderTowerForms(); profileEditor.draw(); pushTowerHistory();
  e.target.value = '';
});
document.getElementById('tower-surprise').addEventListener('click', () => {
  const keys = Object.keys(TowerPresets), key = keys[Math.floor(Math.random() * keys.length)];
  placedTowers[curTowerIdx].spec = JSON.parse(JSON.stringify(TowerPresets[key].s));
  curTierIdx = 0; rebuildPlacedTowerAt(curTowerIdx); renderTowerForms(); profileEditor.draw(); pushTowerHistory();
});
// "Mutate style" wires CreatureArch.mutateBandGrammar() (ported/exported alongside makeBandGrammar
// since the muqarnas-alternation work but never previously called from any UI) to a button: nudges
// the tower's ornament/body band-grammars to a "nearby variant" (1-3 small perturbations -- reroll
// one bay rule, or nudge the bay width) WITHOUT touching the tower's actual shape/tiers/crown, the
// way mutating the whole spec (Variations tab) would. Reads the grammars buildTowerCreatureOrnament/
// Body already stash on their returned parts (`.grammar`); the resulting override is persisted on
// the tower entry (buildPlacedTower's `styleOverride` -> rebuildPlacedTowerAt carries it forward) so
// later field edits don't revert the look back to the seed's original grammar.
function mutateTowerStyle(i) {
  const tw = placedTowers[i];
  if (!tw || !CreatureArch.ready) return;
  const ornGrammar = tw.creatureOrnament && tw.creatureOrnament.grammar;
  const bodyGrammar = tw.creatureBody && tw.creatureBody.grammar;
  if (!ornGrammar && !bodyGrammar) return;
  const rnd = RNG.create(Math.floor(Math.random() * 1e9), 'style-mutate');
  // re-derive the SAME kits buildTowerCreatureOrnament/Body will independently re-derive from the
  // tower's own seed (deterministic from builtSeed+tag) -- mutateBandGrammar only needs a kit whose
  // roles match what the grammar's rules can resolve against, not any particular stored object.
  const kitO = CreatureArch.archKits(RNG.create(tw.builtSeed, 'ornament'), ['tower']).get('tower');
  const kitB = CreatureArch.archKits(RNG.create(tw.builtSeed, 'body'), ['tower']).get('tower');
  const styleOverride = {
    orn: ornGrammar ? CreatureArch.mutateBandGrammar(ornGrammar, kitO, rnd, 1) : null,
    body: bodyGrammar ? CreatureArch.mutateBandGrammar(bodyGrammar, kitB, rnd, 1) : null,
  };
  const old = tw;
  placedTowers[i] = buildPlacedTower(old.spec, old.builtSeed, old.pos[0], old.pos[1], old.scale, styleOverride);
  placedTowers[i].revealRank = old.revealRank;   // preserve Growth-reveal rank, same as rebuildPlacedTowerAt
  disposeTowerEntry(old);
  refreshVortices();
}
document.getElementById('tower-mutate-style').addEventListener('click', () => mutateTowerStyle(curTowerIdx));
document.getElementById('tower-undo').addEventListener('click', () => {
  if (towerHistoryPos <= 0) return;
  towerHistoryPos--; const snap = towerHistory[towerHistoryPos];
  placedTowers[snap.idx].spec = JSON.parse(JSON.stringify(snap.spec));
  rebuildPlacedTowerAt(snap.idx); selectTower(snap.idx);
});
document.getElementById('tower-redo').addEventListener('click', () => {
  if (towerHistoryPos >= towerHistory.length - 1) return;
  towerHistoryPos++; const snap = towerHistory[towerHistoryPos];
  placedTowers[snap.idx].spec = JSON.parse(JSON.stringify(snap.spec));
  rebuildPlacedTowerAt(snap.idx); selectTower(snap.idx);
});
// "Fit view" toggles sceneFocus (see updateCamera): click once to frame the selected tower, click
// again (or re-click once a different tower is already fitted) to drop back to the normal
// tank-wide framing.
document.getElementById('tower-fit').addEventListener('click', () => {
  const key = 'tower:' + curTowerIdx;
  if (sceneFocus && sceneFocus.key === key) clearSceneFocus();
  else { const tw = placedTowers[curTowerIdx]; setSceneFocus(tw.pos.slice(), towerFocusSpan(tw), key); }
});
const codeDlg = document.getElementById('codeDlg');
document.getElementById('tower-code').addEventListener('click', () => {
  document.getElementById('tower-code-text').value = TowerForgeUI.specCode(placedTowers[curTowerIdx].spec);
  document.getElementById('tower-code-err').textContent = '';
  codeDlg.showModal();
});
document.getElementById('tower-code-close').addEventListener('click', () => codeDlg.close());
document.getElementById('tower-code-copy').addEventListener('click', async () => {
  const text = document.getElementById('tower-code-text'), err = document.getElementById('tower-code-err');
  try { await navigator.clipboard.writeText(text.value); err.textContent = 'Copied.'; }
  catch (e) { text.select(); err.textContent = 'Select all and copy.'; }
});
document.getElementById('tower-code-load').addEventListener('click', () => {
  try {
    placedTowers[curTowerIdx].spec = TowerForgeUI.parseSpecCode(document.getElementById('tower-code-text').value);
    curTierIdx = 0; rebuildPlacedTowerAt(curTowerIdx); renderTowerForms(); profileEditor.draw(); pushTowerHistory();
    codeDlg.close();
  } catch (e) { document.getElementById('tower-code-err').textContent = 'Could not load: ' + e.message; }
});

// ---------- Tower panel modes: Edit / Variations / Atlas ("like in Blender or Unity" -- a mode
// switch rather than more panels stacked into the Edit tab) ----------
const towerModes = [['tm-edit', 'tmp-edit'], ['tm-variations', 'tmp-variations'], ['tm-atlas', 'tmp-atlas']];
function showTowerMode(id) {
  for (const [t, p] of towerModes) { const on = t === id; document.getElementById(t).setAttribute('aria-selected', String(on)); document.getElementById(p).hidden = !on; }
}
for (const [t] of towerModes) document.getElementById(t).addEventListener('click', () => showTowerMode(t));

// ---------- Variations: 6 mutated takes on the selected tower, thumbnails via the offscreen
// renderTowerThumbnail() above. Click one to adopt it; Undo (Edit tab) steps back same as any
// other edit, since adopting a variation pushes tower history exactly like a field edit does. ----------
document.getElementById('o-var-wild').textContent = (+document.getElementById('var-wild').value).toFixed(2);
document.getElementById('var-wild').addEventListener('input', e => { document.getElementById('o-var-wild').textContent = (+e.target.value).toFixed(2); });
function makeVariations() {
  const grid = document.getElementById('var-grid'); grid.innerHTML = '';
  if (!placedTowers[curTowerIdx]) return; // no towers placed (city generation exhausted its retries) -- leave the gallery empty
  const base = placedTowers[curTowerIdx].spec, wild = +document.getElementById('var-wild').value, seed0 = Math.floor(Math.random() * 1e6);
  for (let i = 0; i < 6; i++) {
    const spec = TowerForgeUI.normalize(TowerForgeUI.mutate(base, seed0 + i * 7919, wild));
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'thumb';
    const img = document.createElement('img'); img.alt = 'Variation ' + (i + 1); btn.append(img); grid.append(btn);
    btn.addEventListener('click', () => {
      placedTowers[curTowerIdx].spec = spec;
      curTierIdx = 0; rebuildPlacedTowerAt(curTowerIdx); renderTowerForms(); profileEditor.draw(); pushTowerHistory();
    });
    requestAnimationFrame(() => { img.src = renderTowerThumbnail(spec, 150, 200); });
  }
}
document.getElementById('var-new').addEventListener('click', makeVariations);

// ---------- Atlas: MAP-Elites grid over two trait axes, using the shared TowerForgeUI.createAtlas
// (same mutate/crossover/fitness math standalone Tower Forge's own Atlas uses) ----------
let towerAtlas = null;
function seedAtlas() {
  // placedTowers[curTowerIdx] can be absent (no towers placed -- see RESERVE_ATTEMPTS above);
  // the atlas still seeds fine from presets + random "surprise" towers alone in that case.
  const cur = placedTowers[curTowerIdx] ? [TowerForgeUI.normalize(JSON.parse(JSON.stringify(placedTowers[curTowerIdx].spec)))] : [];
  const specs = cur
    .concat(Object.values(TowerPresets).map(p => TowerForgeUI.normalize(JSON.parse(JSON.stringify(p.s)))));
  for (let i = 0; i < 24; i++) specs.push(TowerForgeUI.normalize(TowerForgeUI.surprise(Math.floor(Math.random() * 1e6))));
  for (const s of specs) towerAtlas.insert(s);
}
function newAtlas() {
  towerAtlas = TowerForgeUI.createAtlas(document.getElementById('atlas-x').value, document.getElementById('atlas-y').value, 8);
  seedAtlas();
  renderAtlasGrid();
}
function renderAtlasGrid() {
  const grid = document.getElementById('atlas-grid'); grid.innerHTML = '';
  const AT = towerAtlas.state;
  document.getElementById('atlas-stats').textContent = AT.grid.size + '/' + (AT.n * AT.n) + ' cells filled · ' + AT.iters + ' towers tried' + (AT.pins.length ? ' · ' + AT.pins.length + ' pinned' : '');
  for (let dy = AT.n - 1; dy >= 0; dy--) {
    for (let dx = 0; dx < AT.n; dx++) {
      const cell = AT.grid.get(dy * AT.n + dx);
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'thumb atlas-cell';
      if (!cell) { btn.disabled = true; grid.append(btn); continue; }
      const img = document.createElement('img'); img.alt = ''; btn.append(img);
      if (cell.url) img.src = cell.url;
      else requestAnimationFrame(() => { cell.url = renderTowerThumbnail(cell.spec, 72, 96); img.src = cell.url; });
      btn.addEventListener('click', () => {
        placedTowers[curTowerIdx].spec = JSON.parse(JSON.stringify(cell.spec));
        curTierIdx = 0; rebuildPlacedTowerAt(curTowerIdx); renderTowerForms(); profileEditor.draw(); pushTowerHistory();
      });
      grid.append(btn);
    }
  }
}
for (const [id, label] of Object.entries(TowerForgeUI.ATLAS_AXES)) {
  for (const sel of [document.getElementById('atlas-x'), document.getElementById('atlas-y')]) {
    const o = document.createElement('option'); o.value = id; o.textContent = label.label; sel.append(o);
  }
}
document.getElementById('atlas-x').value = 'height'; document.getElementById('atlas-y').value = 'ornament';
for (const id of ['atlas-x', 'atlas-y']) document.getElementById(id).addEventListener('change', newAtlas);
document.getElementById('atlas-evolve').addEventListener('click', () => { towerAtlas.step(500); renderAtlasGrid(); });
document.getElementById('atlas-pin').addEventListener('click', () => {
  towerAtlas.state.pins.push(JSON.parse(JSON.stringify(placedTowers[curTowerIdx].spec)));
  renderAtlasGrid();
});
document.getElementById('atlas-reset').addEventListener('click', newAtlas);
newAtlas();
makeVariations();

populateTowerSelect(); renderTowerForms(); pushTowerHistory();
