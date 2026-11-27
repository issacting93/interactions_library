// world/scenes/world-scene/places/ui.js -- the Places tab: a rail tab in World Scene's dock that picks a place (places/places.js) and edits it:
// Setting (style, city, water, light), Cast (who, how many, in what role and layer), Camera (the shot list) and Look (how the creatures are
// drawn). It edits ENVX.P, the place running in places/engine.js, through the engine's own pieces (ENVX.lib), and keeps every edit in this
// browser (localStorage, ENVX.lib.STORE). Loaded after places/engine.js.
(function () {
  'use strict';
  const X = window.ENVX; if (!X) return;
  const { clamp, lerp, hex, toHex, clone, LAYERS, LAYER_NAMES, ROLE_NAMES, SHOT_NAMES, STORE, saved, keep, applyCast, applySetting, buildPaths, centerOf, layerOf, live, rowLists, specName } = X.lib;
  // ------------------------------------------------------------------ the Places tab
  const ui = {};
  const el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'style') e.style.cssText = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let castTimer = 0;
  function edited(what) { keep(); if (what === 'cast') { clearTimeout(castTimer); castTimer = setTimeout(() => { applyCast(6); ui.counts && ui.counts(); }, 350); }
    if (what === 'paths') { X.R.c = centerOf(X.P); X.R.paths = buildPaths(X.P, X.R.c); }
    if (what === 'setting') applySetting(); if (what === 'look') X.lookRev++; ui.status && ui.status(); }
  function buildUI() {
    if (document.getElementById('r-places')) return;
    const css = el('style', null, `
#mode-places{overflow-x:hidden}#mode-places *{box-sizing:border-box;min-width:0}#mode-places .pl-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:4px 0 10px}
#mode-places .pl-card{text-align:left;padding:8px 9px;border-radius:8px;line-height:1.25;min-height:54px}
#mode-places .pl-card{overflow:hidden}#mode-places .pl-card b,#mode-places .pl-card small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#mode-places .pl-card b{font-size:12px;margin-bottom:2px}#mode-places .pl-card small{font-size:10px;opacity:.6}
#mode-places .pl-card[aria-pressed="true"]{outline:1.5px solid currentColor}
#mode-places .pl-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:6px 0 8px}#mode-places .pl-tabs button{padding-left:2px;padding-right:2px}#mode-places select,#mode-places .seg{max-width:100%}
#mode-places .cast-row{border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px;margin:0 0 6px;display:grid;gap:4px}
#mode-places .cast-row .r1,#mode-places .cast-row .r2{display:grid;gap:4px;align-items:center}
#mode-places .cast-row .r1{grid-template-columns:minmax(0,1fr) 56px 28px}#mode-places .cast-row .r2{grid-template-columns:repeat(3,minmax(0,1fr))}
#mode-places .cast-row select,#mode-places .cast-row input[type=number]{width:100%;min-width:0;font-size:11px;padding:3px 4px}
#mode-places .cast-row .r3{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:11px;opacity:.85}#mode-places .colours{grid-template-columns:repeat(3,minmax(0,1fr))}
#mode-places .cast-row .live{font-size:10px;opacity:.55;justify-self:end}
#mode-places .shot-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 48px 28px;gap:4px;margin-bottom:4px}
#mode-places .shot-row select,#mode-places .shot-row input{min-width:0;font-size:11px;padding:3px 4px}
#mode-places .colours{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:4px 0 8px;font-size:11px}
#mode-places .colours label{display:grid;gap:2px}#mode-places .colours input{width:100%;height:24px;padding:0;border:none;background:none}
#mode-places .pl-status{font-size:11px;opacity:.6;margin:2px 0 8px}`);
    document.head.appendChild(css);
    const rail = document.getElementById('rail'), first = rail.querySelector('button');
    const btn = el('button', { type: 'button', role: 'tab', id: 'r-places', 'aria-selected': 'false', 'aria-controls': 'mode-places', title: 'Places' },
      '<span class="r-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18c3-2 5-2 8 0s5 2 10 0"/><path d="M3 13c3-2 5-2 8 0s5 2 10 0"/><circle cx="16" cy="6" r="2.4"/></svg></span>');
    rail.insertBefore(btn, first);
    const dock = document.getElementById('dock'), grp = el('div', { class: 'mode-group', id: 'mode-places', hidden: '' });
    grp.innerHTML = `<section class="tabp" role="tabpanel" aria-labelledby="r-places">
      <h2>Places</h2><div class="pl-cards" id="pl-cards"></div>
      <div class="pl-status" id="pl-status"></div>
      <div id="pl-edit">
        <div class="tabs pl-tabs" role="tablist" id="pl-tabs"><button type="button" role="tab" data-t="setting" aria-selected="true">Setting</button><button type="button" role="tab" data-t="cast" aria-selected="false">Cast</button><button type="button" role="tab" data-t="camera" aria-selected="false">Camera</button><button type="button" role="tab" data-t="look" aria-selected="false">Look</button></div>
        <div id="pl-setting"></div><div id="pl-cast" hidden></div><div id="pl-camera" hidden></div><div id="pl-look" hidden></div>
        <h2>This place</h2><div class="row"><button type="button" id="pl-copy">Copy JSON</button><button type="button" id="pl-dup">Save as new</button><button type="button" id="pl-reset">Reset</button></div>
        <p class="note">Edits are kept in this browser. Copy JSON gives the place as data, to paste into places/places.js. Reset puts a built-in place back as shipped.</p>
      </div></section>`;
    dock.insertBefore(grp, dock.firstChild);
    railModes.unshift(['r-places', 'mode-places']);
    btn.addEventListener('click', () => { const already = btn.getAttribute('aria-selected') === 'true'; if (already) setDock(dockEl().hidden); else { showMode('r-places'); if (dockEl().hidden) setDock(true); } });
    grp.querySelector('#pl-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; for (const x of grp.querySelectorAll('#pl-tabs button')) { const on = x === b; x.setAttribute('aria-selected', String(on)); grp.querySelector('#pl-' + x.dataset.t).hidden = !on; } });
    grp.querySelector('#pl-copy').onclick = () => { const txt = JSON.stringify({ [X.id]: X.P }, null, 2); navigator.clipboard && navigator.clipboard.writeText(txt).catch(() => {}); ui.say('Copied ' + (X.P ? X.P.title : '') + ' as JSON'); };
    grp.querySelector('#pl-dup').onclick = () => { if (!X.P) return; const name = (prompt('Name for the new place', X.P.title + ' 2') || '').trim(); if (!name) return; const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'place';
      const s = saved(); s[id] = Object.assign(clone(X.P), { title: name }); try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* */ } X.set(id); };
    grp.querySelector('#pl-reset').onclick = () => { if (X.id !== 'world') X.reset(); };
  }
  ui.say = (m) => { const s = document.getElementById('pl-status'); if (s) { s.textContent = m; clearTimeout(ui._t); ui._t = setTimeout(() => ui.status(), 2200); } };
  ui.status = () => { const s = document.getElementById('pl-status'); if (!s) return; if (!X.P) { s.textContent = 'World: the city and open water. Pick a place to edit it. (How the creatures are drawn: Draw, in the drawer.)'; return; }
    s.textContent = `${X.P.note || ''}${X.edited(X.id) ? ' (edited)' : ''}`; };
  function cards() { const box = document.getElementById('pl-cards'); box.innerHTML = '';
    for (const [id, P] of Object.entries(X.places)) { const b = el('button', { type: 'button', class: 'pl-card', 'aria-pressed': String(id === X.id) },
        `<b>${esc(P.title || id)}</b><small>${id === 'world' ? 'City, towers, open water' : `${(P.cast || []).reduce((a, r) => a + (r.n | 0), 0)} creatures · ${new Set((P.cast || []).map((r) => r.species)).size} species`}</small>`);
      b.onclick = () => X.set(id); box.appendChild(b); } }

  // ---- Setting
  const range = (label, get, set, min, max, step, fmt) => { const w = el('label', { class: 'ctl' }), v = get();
    w.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}"><output>${fmt ? fmt(v) : (+v).toFixed(2)}</output>`;
    const i = w.querySelector('input'), o = w.querySelector('output'); i.oninput = () => { set(+i.value); o.textContent = fmt ? fmt(+i.value) : (+i.value).toFixed(2); }; return w; };
  const seg = (name, opts, cur, on) => { const d = el('div', { class: 'seg', role: 'radiogroup' }); d.innerHTML = opts.map(([v, l]) => `<input type="radio" name="${name}" id="${name}-${v}" value="${v}" ${v === cur ? 'checked' : ''}><label for="${name}-${v}">${l}</label>`).join('');
    d.querySelectorAll('input').forEach((r) => r.onchange = () => r.checked && on(r.value)); return d; };
  function settingPanel() { const box = document.getElementById('pl-setting'); box.innerHTML = ''; const st = X.P.setting, w = st.water || (st.water = {}), sf = st.surface || (st.surface = { level: 0.3, colour: '#2fb3a0', opacity: 0 }), sh = st.shafts || (st.shafts = { amount: 0 });
    const k = el('div', { class: 'grp' }, '<span class="lbl">Style</span>'); const sel = el('select', { class: 'panel-select' });
    const src = document.getElementById('style-pick'); sel.innerHTML = src ? src.innerHTML : ''; sel.value = st.style || '';   // the same recipes as the drawer's Style
    sel.onchange = () => { st.style = sel.value; edited('setting'); }; k.appendChild(sel); box.appendChild(k);
    // the city: none, World's, or this place's own (its seed, towers, the main tower's design, how much has fallen); a turned-off plan is kept to turn back on
    const cur = !st.city ? 'off' : typeof st.city === 'object' ? 'own' : 'on';
    const c = el('div', { class: 'grp' }, '<span class="lbl">City</span>'); c.appendChild(seg('pl-city', [['own', 'Its own'], ['on', "World's"], ['off', 'None']], cur, (v) => {
      if (typeof st.city === 'object' && st.city) st._city = st.city;
      st.city = v === 'off' ? false : v === 'on' ? true : (st._city || { seed: (Math.random() * 1e4) | 0, towers: 3, ruin: 0 }); if (st.city && !st.center) st.center = 'tower';
      edited('setting'); edited('paths'); settingPanel(); })); box.appendChild(c);
    if (st.city && typeof st.city === 'object') { const C = st.city; let cityT = 0; const cityEdited = () => { keep(); clearTimeout(cityT); cityT = setTimeout(() => { edited('setting'); X.replant(); }, 350); };   // a city build takes a moment: once the knob rests
      const presets = Object.keys(window.TowerPresets || {}), opt = (k, v) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc((TowerPresets[k] && (TowerPresets[k].n || TowerPresets[k].name)) || k)}</option>`;
      const hub = el('div', { class: 'grp' }, '<span class="lbl">Main tower</span>'), hs = el('select', { class: 'panel-select' }); hs.innerHTML = '<option value="">The tallest</option>' + presets.map((k) => opt(k, C.hub)).join('');
      hs.onchange = () => { if (hs.value) C.hub = hs.value; else delete C.hub; cityEdited(); }; hub.appendChild(hs); box.appendChild(hub);
      const ck = el('div', { class: 'knobs' });
      ck.append(range('Towers', () => C.towers ?? 3, (v) => { C.towers = Math.round(v); cityEdited(); }, 0, 6, 1, (v) => Math.round(v)),
        range('Fallen', () => C.ruin ?? 0, (v) => { C.ruin = v; cityEdited(); }, 0, 0.8, 0.05, (v) => Math.round(v * 100) + '%'),
        range('Floor height', () => C.floorH ?? 0.34, (v) => { C.floorH = v; cityEdited(); }, 0.2, 0.7, 0.02));
      box.appendChild(ck);
      const rs = el('div', { class: 'row' }, `<button type="button">New city</button><small style="opacity:.6">seed ${C.seed ?? '-'}</small>`); rs.firstChild.onclick = () => { C.seed = (Math.random() * 1e4) | 0; cityEdited(); settingPanel(); }; box.appendChild(rs); }
    box.appendChild(el('h2', null, 'Water'));
    const cols = el('div', { class: 'colours' }); for (const [kk, lab, o] of [['deep', 'Deep', w], ['shallow', 'Shallow', w], ['light', 'Light', w], ['fog', 'Far', w], ['shade', 'Shadow', w], ['colour', 'Surface', sf]]) {
      const l = el('label', null, `${lab}<input type="color" value="${o[kk] || '#000000'}">`); l.querySelector('input').oninput = (e) => { o[kk] = e.target.value; edited(); }; cols.appendChild(l); } box.appendChild(cols);
    const kn = el('div', { class: 'knobs' });
    kn.append(range('Light ribbons', () => w.ribbons ?? 0.8, (v) => { w.ribbons = v; edited(); }, 0, 2, 0.05), range('Caustic net', () => w.net ?? 0.1, (v) => { w.net = v; edited(); }, 0, 0.5, 0.01),
      range('Ribbon size', () => w.scale ?? 400, (v) => { w.scale = v; edited(); }, 150, 1200, 10, (v) => Math.round(v)), range('Haze', () => (w.fogK ?? 0.0001) * 4000, (v) => { w.fogK = v / 4000; edited(); }, 0, 1.6, 0.02),
      range('Moon', () => w.moon || 0, (v) => { w.moon = v; sf.moon = v; edited(); }, 0, 1, 0.05),
      range('Surface level', () => sf.level ?? 0.3, (v) => { sf.level = v; edited(); }, 0, 0.6, 0.01), range('Surface', () => sf.opacity ?? 0.1, (v) => { sf.opacity = v; edited(); }, 0, 0.4, 0.01),
      range('Light shafts', () => sh.amount || 0, (v) => { sh.amount = v; edited(); }, 0, 1, 0.05), range('Vignette', () => st.vignette || 0, (v) => { st.vignette = v; edited(); }, 0, 1, 0.05),
      range('Glow', () => st.glow ?? 0.8, (v) => { st.glow = v; S.glow = v; edited(); }, 0, 2, 0.05));
    box.appendChild(kn);
    const sn = el('div', { class: 'grp' }, '<span class="lbl">Motes</span>'); sn.appendChild(seg('pl-snow', [['on', 'On'], ['off', 'Off']], st.snow ? 'on' : 'off', (v) => { st.snow = v === 'on'; S.snow = st.snow; edited(); })); box.appendChild(sn); }

  // ---- Cast
  const speciesOptions = (cur) => SPECIES.map((s) => `<option value="${s.key}" ${s.key === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  function castPanel() { const box = document.getElementById('pl-cast'); box.innerHTML = ''; const P = X.P, paths = Object.keys(P.paths || {});
    box.appendChild(el('p', { class: 'note' }, 'Each row is a group: a species, how many, and what it does where. A species can have more than one row.'));
    const list = el('div'); box.appendChild(list);
    (P.cast || []).forEach((r, i) => { const row = el('div', { class: 'cast-row' }); const lay = layerOf(r);
      row.innerHTML = `<div class="r1"><select data-k="species">${speciesOptions(r.species)}</select><input type="number" min="0" max="200" step="1" value="${r.n | 0}" data-k="n" title="How many"><button type="button" data-k="del" title="Remove">✕</button></div>
        <div class="r2"><select data-k="role">${Object.entries(ROLE_NAMES).map(([k, l]) => `<option value="${k}" ${k === r.role ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select data-k="layer">${Object.entries(LAYER_NAMES).map(([k, l]) => `<option value="${k}" ${k === lay ? 'selected' : ''}>${l}</option>`).join('')}${lay === 'custom' ? '<option value="custom" selected>Custom depth</option>' : ''}</select>
        ${r.role === 'escort' ? `<select data-k="lead" title="Who it escorts">${speciesOptions(r.lead)}</select>` : r.role === 'stream' || r.role === 'formation' ? `<select data-k="path" title="Which path">${paths.map((p) => `<option ${p === r.path ? 'selected' : ''}>${p}</option>`).join('')}</select>` : `<input type="number" data-k="radius" min="0.05" max="0.6" step="0.01" value="${r.radius ?? 0.3}" title="How far from the middle (of the tank's width)">`}</div>
        <div class="r3"><label>Speed <input type="number" data-k="speed" min="0.05" max="1.5" step="0.05" value="${r.speed ?? 0.4}" style="width:54px"></label>
        ${r.role === 'stream' ? `<label><input type="checkbox" data-k="reverse" ${r.reverse ? 'checked' : ''}> Against</label>` : ''}<label><input type="checkbox" data-k="stone" ${r.stone ? 'checked' : ''}> Stone</label><span class="live" data-live="${i}"></span></div>`;
      row.addEventListener('change', (e) => { const t = e.target, k = t.dataset.k; if (!k) return;
        if (k === 'n') r.n = Math.max(0, Math.min(200, t.value | 0)); else if (k === 'speed' || k === 'radius') r[k] = +t.value; else if (k === 'reverse' || k === 'stone') r[k] = t.checked;
        else if (k === 'layer') { if (t.value !== 'custom') { r.layer = t.value; delete r.z; } } else r[k] = t.value;
        if (k === 'role') { if ((r.role === 'stream' || r.role === 'formation') && !r.path) r.path = paths[0]; if (r.role === 'escort' && !r.lead) r.lead = (P.cast.find((q) => q !== r) || r).species; castPanel(); }
        if (k === 'stone') edited('look'); edited('cast'); cards(); });
      row.querySelector('[data-k=del]').onclick = () => { P.cast.splice(i, 1); castPanel(); edited('cast'); cards(); };
      list.appendChild(row); });
    const add = el('div', { class: 'row' }); const s = el('select', { class: 'panel-select' }, `<option value="">Add a creature…</option>${speciesOptions('')}`); add.appendChild(s); box.appendChild(add);
    s.onchange = () => { if (!s.value) return; (P.cast || (P.cast = [])).push({ species: s.value, n: 8, role: 'drift', layer: 'mid', radius: 0.3, speed: 0.3 }); castPanel(); edited('cast'); cards(); };
    ui.counts(); }
  ui.counts = () => { if (!X.P) return; const lists = rowLists(X.P); document.querySelectorAll('#pl-cast [data-live]').forEach((e) => { const i = +e.dataset.live; e.textContent = (lists[i] ? lists[i].length : 0) + ' in the water'; }); };

  // ---- Camera
  function cameraPanel() { const box = document.getElementById('pl-camera'); box.innerHTML = ''; const P = X.P;
    const g = el('div', { class: 'grp' }, '<span class="lbl">Camera</span>'); g.appendChild(seg('pl-cam', [['on', 'Directed'], ['off', 'Free']], X.shotsOn ? 'on' : 'off', (v) => { X.setDirected(v === 'on'); })); box.appendChild(g);
    box.appendChild(el('p', { class: 'note' }, 'The shots play in order and loop, dipping to dark between them. Free hands the camera back to the Camera tab.'));
    const targets = () => `<option value="center">The middle</option>${(P.cast || []).some((r) => r.role === 'stream') ? '<option value="densest">The busiest stream</option>' : ''}${[...new Set((P.cast || []).map((r) => r.species))].map((k) => `<option value="${k}">${esc(specName(k))}</option>`).join('')}`;
    (P.shots || (P.shots = [])).forEach((sh, i) => { const r = el('div', { class: 'shot-row' });
      r.innerHTML = `<select data-k="kind">${Object.entries(SHOT_NAMES).map(([k, l]) => `<option value="${k}" ${k === sh.kind ? 'selected' : ''}>${l}</option>`).join('')}</select><select data-k="target">${targets()}</select><input type="number" data-k="len" min="3" max="40" step="1" value="${sh.len}" title="Seconds"><button type="button" data-k="del">✕</button>`;
      r.querySelector('[data-k=target]').value = sh.target || 'center';
      r.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k === 'len') sh.len = Math.max(3, +e.target.value); else if (k) sh[k] = e.target.value; X.shot = null; edited(); loopNote(); });
      r.querySelector('[data-k=del]').onclick = () => { P.shots.splice(i, 1); cameraPanel(); edited(); };
      box.appendChild(r); });
    const add = el('div', { class: 'row' }, '<button type="button">Add a shot</button><button type="button">Restart</button>'); box.appendChild(add);
    add.children[0].onclick = () => { P.shots.push({ kind: 'above', len: 10, target: 'center' }); cameraPanel(); edited(); };
    add.children[1].onclick = () => { X.shotT = 0; X.shot = null; };
    const note = el('p', { class: 'note', id: 'pl-loop' }); box.appendChild(note); const loopNote = () => { note.textContent = `One loop: ${X.total()} s.`; }; loopNote(); }

  // ---- Look
  function lookPanel() { const box = document.getElementById('pl-look'); box.innerHTML = ''; const P = X.P, L = P.look || (P.look = {}), Y = L.styled || (L.styled = {}), Pt = Y.paint || (Y.paint = { paint: 0 });
    const g = el('div', { class: 'grp' }, '<span class="lbl">Creatures</span>');
    g.appendChild(seg('pl-bodies', [['specimen', 'Specimen'], ['styled', 'Styled'], ['flat', 'Lines']], X.bodies, (v) => { X.bodies = L.creatures = v; edited('look'); lookPanel(); })); box.appendChild(g);
    box.appendChild(el('p', { class: 'note' }, X.bodies === 'specimen' ? 'Each creature in its saved look, drawn as Specimen draws it.' : X.bodies === 'styled' ? 'This place’s own paint over every creature; rows marked Stone in the cast are turned to stone.' : 'World Scene’s own line drawing.'));
    if (X.bodies !== 'styled') return;
    box.appendChild(el('h2', null, 'Place style'));
    const kn = el('div', { class: 'knobs' });
    kn.append(range('Paint', () => Pt.paint ?? 0, (v) => { Pt.paint = v; edited('look'); }, 0, 1, 0.05), range('Steps', () => Pt.paintSteps ?? 4, (v) => { Pt.paintSteps = v; edited('look'); }, 2, 8, 1, (v) => v),
      range('Warmth', () => Pt.paintTemp ?? 0.4, (v) => { Pt.paintTemp = v; edited('look'); }, 0, 1, 0.05), range('Detail', () => Pt.paintDetail ?? 0.5, (v) => { Pt.paintDetail = v; edited('look'); }, 0, 1, 0.05),
      range('Ink outline', () => Pt.paintOutline ?? 0, (v) => { Pt.paintOutline = v; edited('look'); }, 0, 1, 0.05), range('Lines', () => Y.lineAlpha ?? 0.3, (v) => { Y.lineAlpha = v; edited('look'); }, 0, 1, 0.05));
    box.appendChild(kn);
    const st = Y.stone || (Y.stone = { material: 'golem', pattern: 'veins', colors: ['#6e6c64', '#1b1a17', '#ff8a3d', '#d3d6c6', '#8a7f6a'], grow: 'moss', growAmount: 0.5 });
    box.appendChild(el('h2', null, 'Stone'));
    const sg = el('div', { class: 'grp' }, '<span class="lbl">Growth</span>'), gs = el('select', { class: 'panel-select' }, ['none', 'moss', 'frost', 'rust', 'fungus'].map((g) => `<option value="${g}" ${g === (st.grow || 'none') ? 'selected' : ''}>${g[0].toUpperCase() + g.slice(1)}</option>`).join(''));
    gs.onchange = () => { st.grow = gs.value; edited('look'); }; sg.appendChild(gs); box.appendChild(sg);
    const k2 = el('div', { class: 'knobs' }); k2.append(range('Growth amount', () => st.growAmount ?? 0.5, (v) => { st.growAmount = v; edited('look'); }, 0, 1, 0.05)); box.appendChild(k2);
    const cols = el('div', { class: 'colours' }); [['Rock', 0], ['Crack glow', 2], ['Rock 2', 4]].forEach(([lab, i]) => { const l = el('label', null, `${lab}<input type="color" value="${st.colors[i]}">`); l.querySelector('input').oninput = (e) => { st.colors[i] = e.target.value; edited('look'); }; cols.appendChild(l); }); box.appendChild(cols); }

  ui.refresh = () => { if (!document.getElementById('pl-cards')) return; cards(); ui.status(); const ed = document.getElementById('pl-edit'); ed.hidden = !X.P; if (!X.P) return; settingPanel(); castPanel(); cameraPanel(); lookPanel(); };
  setInterval(() => { if (X.P && !document.getElementById('pl-cast').hidden) ui.counts(); }, 1500);


  X.ui = ui;
  buildUI(); ui.refresh();
})();
