// ---------- City Generator UI: window.CityGenUI ----------
// Reusable piece-sheet browser (canvas-2D sprites of every WFC tile/module) and Rules/grammar
// explainer, extracted from tools/city-gen/Round City Generator.html so a second tool can show
// the same reference material without copy-pasting it. Everything here is pure canvas-2D + DOM +
// shared/city/city-wfc.js data -- no THREE.js dependency, unlike the standalone tool's own live 3D
// scene (which this module deliberately does not touch: no piece-isolation-in-the-3D-view, since
// a host's rendering of a piece may not even be a literal mesh any more -- see World Scene Next,
// where city pieces are an invisible depth occluder under glowing creature-line geometry).
//
// Dependencies (must already be loaded as globals before this script runs):
//   - window.CityWFC (shared/city/city-wfc.js) -- buildTiles()/buildModules()/ZONES/RINGS/RING_ZONE/
//     HEIGHT_RULES/LABEL/STREET_KINDS.
//   - window.NAQSH (shared/naqsh-pattern-engine.js) -- MODES/PAL/def()/renderTo(), for
//     buildPatternEditor's generator UI and live preview.
//   - window.TowerForgeUI (shared/tower/tower-forge-ui.js) -- reuses its generic renderForm() for
//     buildPatternEditor's parameter forms rather than a second copy of that form-builder.
//   - CSS custom properties --ink/--muted (read via getComputedStyle, same convention as
//     shared/tower/tower-forge-ui.js's profile canvas) for the orientation-key canvas.
//
// This module owns no DOM ids beyond what a caller hands it and closes over no caller-specific
// state: every function takes the container/canvas/data it needs as explicit parameters.

(function () {

  const TAU = Math.PI * 2;
  const hexCss = h => '#' + h.toString(16).padStart(6, '0');
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // zone swatch colours + the flat ground tint under each tile's sprite -- plain data copied from
  // shared/city/city-mesh-engine.js's own PALETTE (0xf1e8d6 etc.), not imported from it, so this module
  // never depends on that THREE-coupled file.
  const ZONE_COL = { core: 0xd8a441, sanctum: 0x2aa39b, bazaar: 0xd2743a, housing: 0x5470c7, garden: 0x4f9c56, wall: 0x9a7a5a };
  const GROUND = { core: 0xf1e8d6, sanctum: 0xf1e8d6, bazaar: 0xd8ad84, housing: 0xeadbbb, garden: 0x84a85e, wall: 0xdcc29a };
  const VLABEL = { F: '#c9aa7c', A: '#bcd8e8', T: '#2aa39b', W: '#8a6a49', G: '#3f8f6b', a: '#bcd8e8', f: '#c9aa7c', k: '#a8643c' };
  // same list as shared/city/city-mesh-engine.js's STREETISH, plus the 3 garden-path kinds it also
  // checks that CityWFC.STREET_KINDS doesn't carry -- kept as a literal here for the same reason
  // ZONE_COL/GROUND are literals, not an import from the THREE-coupled engine.
  const STREETISH = new Set(['avenue', 'chaharsu', 'chaharsu-t', 'chaharsu-o', 'arcade', 'arcade-end', 'avenue-h', 'lane', 'cross', 't-in', 't-out', 't-side', 'bend-in', 'bend-out', 'kucheh', 'kucheh-o', 'kucheh-s', 'qanat', 'garden-path', 'garden-end', 'garden-canal']);
  const SIDE_POS = () => ({ out: [0.5, 0], in: [0.5, 1], ccw: [0, 0.5], cw: [1, 0.5] });

  // CityGenUI.drawTileSprite(canvas, tileDef) -- a top-down icon of one ground tile (a TILE_DEFS/
  // buildTiles() record: {id, name, zone, in, out, cw, ccw, weight, mirrored, base, note}).
  function drawTileSprite(cv, t) {
    const s = cv.width, x = cv.getContext('2d'), kind = t.base || t.id;
    const LABEL = CityWFC.LABEL;
    x.clearRect(0, 0, s, s);
    const p = s * 0.06, a = p, b = s - p, side = b - a;
    const P = (u, v) => [a + u * side, a + v * side];
    x.fillStyle = hexCss(GROUND[t.zone]);
    x.beginPath(); x.roundRect ? x.roundRect(a, a, side, side, s * 0.04) : x.rect(a, a, side, side); x.fill();
    const box = (u, v, w, h, col) => { x.fillStyle = col; x.fillRect(a + (u - w / 2) * side, a + (v - h / 2) * side, w * side, h * side); };
    const circ = (u, v, r, col, stroke) => { x.beginPath(); x.arc(a + u * side, a + v * side, r * side, 0, TAU); x.fillStyle = col; x.fill(); if (stroke) { x.lineWidth = s * 0.012; x.strokeStyle = stroke; x.stroke(); } };
    const ring = (u, v, w, h, th, col) => { box(u, v - h / 2 + th / 2, w, th, col); box(u, v + h / 2 - th / 2, w, th, col); box(u - w / 2 + th / 2, v, th, h, col); box(u + w / 2 - th / 2, v, th, h, col); };
    const pos = SIDE_POS();
    if (STREETISH.has(kind)) {
      for (const [u, v] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
        if (t.zone === 'garden') circ(u, v, 0.08, '#2f5b3e');
        else box(u, v, 0.26, 0.26, t.zone === 'bazaar' ? '#b07a52' : '#c9aa7c');
      }
    }
    for (const sd of ['in', 'out', 'cw', 'ccw']) {
      const lab = t[sd];
      if (!['S', 'M', 'c'].includes(lab)) continue;
      const [u, v] = pos[sd];
      x.strokeStyle = lab === 'M' ? '#9d6c48' : LABEL[lab].css;
      x.lineWidth = side * (lab === 'S' ? 0.2 : lab === 'M' ? 0.26 : 0.09);
      x.lineCap = 'butt';
      x.beginPath(); x.moveTo(...P(0.5, 0.5)); x.lineTo(...P(u, v)); x.stroke();
      if (lab === 'M') { const steps = 2; for (let k = 1; k <= steps; k++) { const f = k / (steps + 0.6); circ(0.5 + (u - 0.5) * f, 0.5 + (v - 0.5) * f, 0.06, '#eadbbb'); } }
    }
    switch (kind) {
      case 'core': circ(0.5, 0.5, 0.26, '#3f8f6b', '#26478f'); for (const [u, v] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) circ(u, v, 0.05, '#f2ead8', '#2aa39b'); break;
      case 'iwan': box(0.5, 0.22, 0.46, 0.12, '#2a4ea3'); box(0.5, 0.25, 0.2, 0.06, '#2a2c38'); break;
      case 'fountain': circ(0.5, 0.5, 0.2, '#c6a77c'); circ(0.5, 0.5, 0.16, '#3d9cc6'); break;
      case 'minaret': circ(0.5, 0.5, 0.1, '#f2ead8', '#2aa39b'); break;
      case 'bayt-al-hikma': ring(0.5, 0.5, 0.74, 0.74, 0.14, '#eadbbb'); circ(0.5, 0.42, 0.14, '#2a4ea3'); box(0.5, 0.78, 0.22, 0.08, '#2aa39b'); break;
      case 'chaharsu': case 'chaharsu-t': case 'chaharsu-o': circ(0.5, 0.5, 0.15, '#eadbbb', '#9d6c48'); break;
      case 'caravanserai': ring(0.5, 0.5, 0.78, 0.78, 0.16, '#bd8a5f'); for (const [u, v] of [[0.11, 0.11], [0.89, 0.11], [0.11, 0.89], [0.89, 0.89]]) circ(u, v, 0.06, '#9d6c48'); box(0.5, 0.86, 0.22, 0.08, '#2a4ea3'); break;
      case 'madrasa': ring(0.5, 0.5, 0.76, 0.76, 0.16, '#eadbbb'); box(0.5, 0.86, 0.26, 0.1, '#2a4ea3'); circ(0.5, 0.2, 0.1, '#2aa39b'); break;
      case 'house': ring(0.5, 0.5, 0.8, 0.8, 0.19, '#d9bf93'); box(0.5, 0.5, 0.36, 0.36, '#84a85e'); box(0.5, 0.5, 0.12, 0.12, '#3d9cc6'); break;
      case 'hammam': box(0.5, 0.5, 0.7, 0.7, '#c6a77c'); for (const u of [0.24, 0.5, 0.76]) circ(u, 0.5, 0.1, '#f2ead8'); break;
      case 'bimaristan': ring(0.5, 0.5, 0.72, 0.72, 0.16, '#f2ead8'); circ(0.3, 0.3, 0.1, '#dcc29a'); box(0.5, 0.5, 0.1, 0.5, '#3d9cc6'); break;
      case 'masjid': box(0.5, 0.38, 0.55, 0.6, '#eadbbb'); circ(0.5, 0.38, 0.14, '#2aa39b'); circ(0.24, 0.62, 0.05, '#f2ead8', '#2aa39b'); break;
      case 'ab-anbar': circ(0.5, 0.56, 0.22, '#dcc29a', '#c6a77c'); for (const [u, v] of [[0.22, 0.28], [0.78, 0.28], [0.22, 0.84], [0.78, 0.84]]) box(u, v, 0.09, 0.09, '#9d7b55'); break;
      case 'orchard': for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) circ(0.25 + k * 0.25, 0.3 + i * 0.4, 0.08, (i + k) % 2 ? '#2f5b3e' : '#6f9a4a'); break;
      case 'pool-garden': box(0.5, 0.5, 0.8, 0.06, '#3d9cc6'); box(0.5, 0.5, 0.06, 0.8, '#3d9cc6'); circ(0.5, 0.5, 0.12, '#3d9cc6', '#f2ead8'); for (const [u, v] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) circ(u, v, 0.06, '#2f5b3e'); break;
      case 'pavilion': for (const [u, v] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) circ(u, v, 0.07, '#2f5b3e'); box(0.5, 0.5, 0.36, 0.36, '#f2ead8'); circ(0.5, 0.5, 0.1, '#2aa39b'); break;
      case 'wall': box(0.5, 0.5, 1, 0.5, '#c9a06c'); box(0.5, 0.5, 1, 0.06, '#b48c5b'); break;
      case 'tower': box(0.5, 0.5, 1, 0.5, '#c9a06c'); circ(0.5, 0.42, 0.24, '#b48c5b', '#8a6a49'); break;
      case 'gate': box(0.13, 0.5, 0.26, 0.5, '#c9a06c'); box(0.87, 0.5, 0.26, 0.5, '#c9a06c'); circ(0.3, 0.5, 0.13, '#b48c5b'); circ(0.7, 0.5, 0.13, '#b48c5b'); circ(0.5, 0.5, 0.1, '#3f8f6b'); break;
      case 'inlet': box(0.5, 0.5, 1, 0.5, '#c9a06c'); box(0.5, 0.5, 0.09, 0.5, '#3d9cc6'); break;
    }
    for (const sd of ['in', 'out', 'cw', 'ccw']) {
      const lab = t[sd]; if (lab === 'X') continue;
      const [u, v] = pos[sd], horiz = sd === 'in' || sd === 'out';
      x.fillStyle = LABEL[lab].css;
      const len = side * 0.36, th = Math.max(3, s * 0.035);
      const [cx, cy] = P(u, v);
      if (horiz) x.fillRect(cx - len / 2, cy - th / 2, len, th); else x.fillRect(cx - th / 2, cy - len / 2, th, len);
    }
  }

  // CityGenUI.drawModuleSprite(canvas, modDef) -- a side-on icon of one stacked module (a
  // MOD_DEFS/buildModules() record: {id, name, down, up, in}).
  function drawModuleSprite(cv, m) {
    const s = cv.width, x = cv.getContext('2d');
    x.clearRect(0, 0, s, s);
    const p = s * 0.06, a = p, b = s - p, side = b - a;
    const box = (u, v, w, h, col) => { x.fillStyle = col; x.fillRect(a + (u - w / 2) * side, a + v * side, w * side, h * side); };
    const domeAt = (u, v, r, col) => { x.beginPath(); x.arc(a + u * side, a + v * side, r * side, Math.PI, 0); x.fillStyle = col; x.fill(); };
    x.fillStyle = '#e6eef2'; x.fillRect(a, a, side, side);
    const ground = 0.86;
    box(0.5, ground, 1, 1 - ground, '#d9c49e');
    switch (m.id) {
      case 'storey': box(0.28, 0.4, 0.34, 0.46, '#d9bf93'); box(0.72, 0.4, 0.34, 0.46, '#d9bf93'); box(0.28, 0.4, 0.36, 0.04, '#9d7b55'); box(0.72, 0.4, 0.36, 0.04, '#9d7b55'); break;
      case 'sabat': box(0.2, 0.4, 0.3, 0.46, '#d9bf93'); box(0.8, 0.4, 0.3, 0.46, '#d9bf93'); box(0.5, 0.44, 0.32, 0.26, '#eadbbb'); box(0.5, 0.7, 0.32, 0.03, '#9d6c48'); break;
      case 'roof': box(0.28, 0.76, 0.34, 0.1, '#f2ead8'); box(0.72, 0.76, 0.34, 0.1, '#f2ead8'); box(0.72, 0.62, 0.14, 0.14, '#eadbbb'); break;
      case 'dome': box(0.5, 0.78, 0.8, 0.08, '#f2ead8'); domeAt(0.5, 0.78, 0.26, '#2aa39b'); break;
      case 'badgir': box(0.5, 0.78, 0.8, 0.08, '#f2ead8'); box(0.32, 0.22, 0.14, 0.56, '#b7966b'); box(0.32, 0.3, 0.1, 0.1, '#2a2c38'); box(0.32, 0.19, 0.18, 0.04, '#dcc29a'); break;
      case 'talar': box(0.5, 0.78, 0.8, 0.08, '#f2ead8'); for (const u of [0.25, 0.42, 0.58, 0.75]) box(u, 0.48, 0.03, 0.3, '#f2ead8'); box(0.5, 0.44, 0.6, 0.05, '#bd8a5f'); break;
      case 'shaft': box(0.5, 0.06, 0.18, 0.8, '#f2ead8'); box(0.5, 0.2, 0.2, 0.04, '#2aa39b'); break;
      case 'cap': box(0.5, 0.62, 0.18, 0.24, '#f2ead8'); box(0.5, 0.58, 0.32, 0.05, '#b7966b'); x.beginPath(); x.moveTo(a + 0.38 * side, a + 0.58 * side); x.lineTo(a + 0.5 * side, a + 0.14 * side); x.lineTo(a + 0.62 * side, a + 0.58 * side); x.fillStyle = '#2aa39b'; x.fill(); break;
      case 'battlement': for (let i = 0; i < 5; i++) box(0.14 + i * 0.18, 0.66, 0.1, 0.2, '#b48c5b'); break;
      case 'gatehouse': box(0.5, 0.5, 0.62, 0.36, '#b48c5b'); domeAt(0.5, 0.5, 0.2, '#3f8f6b'); break;
    }
    const th = Math.max(4, s * 0.04), len = side * 0.42;
    x.fillStyle = VLABEL[m.down]; x.fillRect(s / 2 - len / 2, b - th, len, th);
    x.fillStyle = VLABEL[m.up]; x.fillRect(s / 2 - len / 2, a, len, th);
    x.fillStyle = VLABEL[m.in]; x.fillRect(a, s / 2 - len / 2, th, len); x.fillRect(b - th, s / 2 - len / 2, th, len);
    x.fillStyle = '#1a2236'; x.font = '600 ' + Math.round(s * 0.09) + 'px "IBM Plex Mono", monospace'; x.textAlign = 'center';
    x.fillText(m.up, s / 2, a + th + s * 0.1); x.fillText(m.down, s / 2, b - th - s * 0.03);
  }

  // CityGenUI.drawOrientKey(canvas) -- the small "which edge is which" diagram.
  function drawOrientKey(cv) {
    const x = cv.getContext('2d'), s = cv.width;
    x.clearRect(0, 0, s, s);
    const ink = cssVar('--ink') || '#1a2236', muted = cssVar('--muted') || '#586174';
    x.strokeStyle = muted; x.lineWidth = 2; x.setLineDash([6, 5]);
    x.strokeRect(s * 0.22, s * 0.22, s * 0.56, s * 0.56); x.setLineDash([]);
    x.fillStyle = ink; x.font = '600 20px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('out', s / 2, s * 0.1); x.fillText('in', s / 2, s * 0.9);
    x.fillText('ccw', s * 0.1, s / 2); x.fillText('cw', s * 0.9, s / 2);
    x.fillStyle = muted; x.font = '16px "IBM Plex Mono", monospace'; x.fillText('↓ core', s / 2, s / 2);
  }

  // CityGenUI.buildPieceSheet(container, opts) -- clears `container` and fills it with the full
  // zone-grouped ground-tile sprite sheet plus the stacked-module sheet. opts (all optional):
  //   wfcResult: a CityWFC.generate() result ({result, tiles}) -- if given, each sprite's count
  //     badge reflects how many times it's actually used in this specific city.
  //   stackResult: a CityWFC.stack() result ({result, mods}) -- same, for modules.
  //   onSelect(id, isModule): called when a sprite button is clicked (toggles its own pressed
  //     state before calling back) -- a host with a meaningful "isolate this piece" view wires
  //     its own highlighting here; omit it for a pure browse/reference sheet.
  function buildPieceSheet(container, opts) {
    opts = opts || {};
    container.innerHTML = '';
    const tiles = CityWFC.buildTiles();
    const counts = {};
    if (opts.wfcResult) opts.wfcResult.result.forEach(i => { const k = opts.wfcResult.tiles[i].base || opts.wfcResult.tiles[i].id; counts[k] = (counts[k] || 0) + 1; });
    for (const zone of Object.keys(CityWFC.ZONES)) {
      const head = document.createElement('h3');
      head.textContent = CityWFC.ZONES[zone].name + ' · ring ' + CityWFC.ZONES[zone].rings;
      const grid = document.createElement('div'); grid.className = 'sheet';
      for (const t of tiles.filter(t => t.zone === zone && !t.mirrored)) {
        const btn = document.createElement('button');
        btn.className = 'sprite'; btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
        const cv = document.createElement('canvas'); cv.width = cv.height = 160;
        drawTileSprite(cv, t);
        const name = document.createElement('b'); name.textContent = t.name;
        const meta = document.createElement('span');
        const mirror = tiles.some(u => u.base === t.id) ? ' · + mirror' : '';
        meta.textContent = t.in + t.out + t.cw + t.ccw + ' · w' + t.weight + ' · ×' + (counts[t.id] || 0) + mirror;
        btn.append(cv, name, meta);
        btn.addEventListener('click', () => {
          const on = btn.getAttribute('aria-pressed') !== 'true';
          container.querySelectorAll('.sprite').forEach(b => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', String(on));
          if (opts.onSelect) opts.onSelect(t.id, false);
        });
        grid.appendChild(btn);
      }
      container.append(head, grid);
    }
    const mcount = {};
    if (opts.stackResult) opts.stackResult.result.forEach(i => { const k = opts.stackResult.mods[i].id; mcount[k] = (mcount[k] || 0) + 1; });
    const head = document.createElement('h3');
    head.textContent = 'Stacked modules · levels 1–' + CityWFC.LAYERS;
    const note = document.createElement('p');
    note.className = 'small';
    note.textContent = 'Drawn side-on. The bar under each module is the socket it needs below, the bar on top is what it offers above, and the side bars are how it meets its neighbours at the same level.';
    const grid = document.createElement('div'); grid.className = 'sheet';
    for (const m of CityWFC.buildModules().filter(m => m.id !== 'air')) {
      const btn = document.createElement('button');
      btn.className = 'sprite'; btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
      const cv = document.createElement('canvas'); cv.width = cv.height = 160;
      drawModuleSprite(cv, m);
      const name = document.createElement('b'); name.textContent = m.name;
      const meta = document.createElement('span');
      meta.textContent = m.down + '→' + m.up + ' · side ' + m.in + ' · ×' + (mcount[m.id] || 0);
      btn.append(cv, name, meta);
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        container.querySelectorAll('.sprite').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', String(on));
        if (opts.onSelect) opts.onSelect(m.id, true);
      });
      grid.appendChild(btn);
    }
    container.append(head, note, grid);
  }

  // CityGenUI.buildDistrictsLegend(container) -- small zone-colour swatch list, reused by both a
  // City tab's own legend and the Rules tab (same content, matching the standalone tool).
  function buildDistrictsLegend(container) {
    container.innerHTML = '';
    for (const [k, z] of Object.entries(CityWFC.ZONES)) {
      const row = document.createElement('div'); row.className = 'legend-row';
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = hexCss(ZONE_COL[k]);
      const nm = document.createElement('span'); nm.textContent = z.name;
      const rg = document.createElement('span'); rg.className = 'rg'; rg.textContent = 'ring ' + z.rings;
      row.append(sw, nm, rg);
      container.append(row);
    }
  }

  // CityGenUI.buildRulesPanel(container, wfcResult) -- clears `container` and fills it with the
  // full grammar explainer: the six rule sections (sockets/zoning/splitting/fixed positions/
  // reachability/stacking), their tables, and (if wfcResult is given) the live connectivity stats
  // line from that specific solve. Pure DOM, no THREE dependency.
  function buildRulesPanel(container, wfcResult) {
    container.innerHTML = '';
    const sec = (titleHtml, bodyEls) => {
      const div = document.createElement('div'); div.className = 'rule';
      const h3 = document.createElement('h3'); h3.textContent = titleHtml; div.append(h3);
      for (const el of bodyEls) div.append(el);
      container.append(div);
      return div;
    };
    const p = text => { const el = document.createElement('p'); el.textContent = text; return el; };
    const pre = text => { const el = document.createElement('pre'); el.textContent = text; return el; };
    const table = (headers, rows) => {
      const t = document.createElement('table');
      const thead = document.createElement('thead'); const trh = document.createElement('tr');
      for (const h of headers) { const th = document.createElement('th'); th.textContent = h; trh.append(th); }
      thead.append(trh); t.append(thead);
      const tbody = document.createElement('tbody');
      for (const row of rows) { const tr = document.createElement('tr'); for (const cell of row) { const td = document.createElement('td'); td.textContent = cell; tr.append(td); } tbody.append(tr); }
      t.append(tbody);
      return t;
    };

    const intro = document.createElement('div');
    const h2 = document.createElement('h2'); h2.textContent = 'Grammar'; intro.append(h2);
    intro.append(p('Six kinds of rule decide what can go where. The street plan is solved first on the ground level; a second pass stacks storeys, roofs and towers on top of it.'));
    container.append(intro);

    sec('1 · Sockets must match', [
      p('Two neighbouring pieces must show the same label on the edge they share.'),
      table(['Label', 'Meaning', 'Passable'], Object.entries(CityWFC.LABEL).map(([k, v]) => [k, v.name, v.pass ? 'yes' : '—'])),
    ]);

    const tiles = CityWFC.buildTiles();
    sec('2 · Ring zoning', [
      p('Each ring only accepts pieces from its own district, so the city reads inside-out like the Round City of Baghdad.'),
      table(['Ring', 'Cells', 'District', 'Pieces'], CityWFC.RINGS.map((n, r) => {
        const zone = CityWFC.RING_ZONE[r];
        const names = [...new Set(tiles.filter(t => t.zone === zone).map(t => t.name))];
        return [String(r), String(n), CityWFC.ZONES[zone].name, r === 2 || r === 4 || r === 5 ? 'same as above' : names.join(', ')];
      })),
    ]);

    sec('3 · Splitting outward', [
      p("Where a ring has twice the cells of the ring inside it, a piece's outer edge touches two pieces, and both must match it. This keeps cells a similar size from centre to wall."),
      pre('RINGS = [' + CityWFC.RINGS.join(', ') + ']'),
    ]);

    sec('4 · Fixed positions', [
      pre('ring 8, j ∈ {0, 16, 32, 48}  →  gate only\nring 8, any other j          →  never a gate\ncells on a gate\'s bearing    →  street in and out\n                                (the four royal avenues)'),
    ]);

    const connLine = document.createElement('pre');
    connLine.textContent = wfcResult
      ? 'seed ' + wfcResult.seed + ': ' + wfcResult.pruned + ' unreachable street cells re-solved as buildings\nattempts ' + wfcResult.attempts + ' · backtracks ' + wfcResult.backtracks + ' · orphans after pruning ' + wfcResult.orphans
      : '—';
    sec('5 · Everything reaches the core', [
      p('After solving, a walk from the Great Mosque follows plaza, street and arcade edges. Streets it never reaches are re-solved as closed buildings, keeping every socket the rest of the city already fixed.'),
      connLine,
    ]);

    sec('6 · Stacking', [
      p("Every cell is a column of four slots above its ground piece. A module's bottom socket must equal the top socket of what is below it, so a tower has to end in a cap and a storey has to end in a roof, dome, windcatcher or talar."),
      pre('F  floor that can carry more    A  open sky\nT  tower shaft                  W  wall walk\nG  gate top\n\nside:  a open · f built · k sabat bridge\n       k meets only f or k  (a sabat needs a\n       built floor on every side at its level)'),
      table(['District', 'Max levels above ground'], CityWFC.HEIGHT_RULES.map(([name, h]) => [name, String(h)])),
      p('Storeys get rarer the higher they go and the farther the cell is from the core, so the skyline climbs toward the mosque.'),
    ]);

    sec('Solver', [
      p('Lowest weighted entropy first, weighted random pick, arc-consistency propagation, and full backtracking from a decision stack when a cell runs out of options.'),
    ]);
  }

  // CityGenUI.buildPatternEditor(container, state, hooks) -- a Naqsh generator/palette/seed
  // editor + live preview, reusing TowerForgeUI.renderForm for its forms (same schema-driven
  // pattern as Tower Forge's own per-tier "Naqsh pattern" field) rather than a second form
  // builder. `state` is a plain object the caller owns and this function mutates in place:
  //   { on: boolean, mode: a NAQSH.MODES key, pal: a NAQSH.PAL key, seed: number, params: {} }
  // hooks.onChange(state) fires after every edit (including live drag, not just on commit) --
  // a host re-renders its own preview/texture from `state` each time; NAQSH.renderTo is cheap
  // enough that this module doesn't debounce it itself.
  // Deliberately simpler than Round City Generator's own multi-slot Patterns tab (one pattern
  // per material type, each with its own repeat/tiling): a caller with only one visible surface
  // to paint (a single ground disc, say) has no use for per-slot repeat/tiling controls, so this
  // is one generator/palette/seed set, not a slot system -- a caller with several real surfaces
  // can just call this once per surface with a separate `state` object for each.
  function buildPatternEditor(container, state, hooks) {
    container.innerHTML = '';
    const NQ_OPTS = () => Object.entries(NAQSH.MODES).filter(([k]) => k !== 'facade').map(([k, m]) => [k, m.label]);
    const PAL_OPTS = () => Object.entries(NAQSH.PAL).filter(([k]) => !k.startsWith('__')).map(([k, p]) => [k, p.name.split(' · ')[0]]);
    const topSchema = [
      { id: 'on', label: 'Pattern', type: 'check' },
      { id: 'mode', label: 'Generator', type: 'select', opts: NQ_OPTS, when: s => s.on },
      { id: 'pal', label: 'Palette', type: 'select', opts: PAL_OPTS, when: s => s.on },
      { id: 'seed', label: 'Seed', type: 'range', min: 1, max: 99999, step: 1, when: s => s.on },
    ];
    const topBox = document.createElement('div');
    const preview = document.createElement('canvas'); preview.width = preview.height = 220; preview.className = 'pattern-preview';
    const paramsBox = document.createElement('div');
    container.append(topBox, preview, paramsBox);

    function redrawPreview() {
      const ctx = preview.getContext('2d');
      if (!state.on) { ctx.clearRect(0, 0, 220, 220); return; }
      NAQSH.renderTo(ctx, 220, { mode: state.mode, params: state.params, pal: state.pal, seed: state.seed });
    }
    function renderParams() {
      paramsBox.innerHTML = '';
      if (!state.on) return;
      TowerForgeUI.renderForm(paramsBox, NAQSH.MODES[state.mode].params, state.params, () => { redrawPreview(); hooks.onChange(state); });
    }
    function renderTop() {
      topBox.innerHTML = '';
      TowerForgeUI.renderForm(topBox, topSchema, state, (field, done, relayout) => {
        if (field.id === 'mode') state.params = Object.assign({}, NAQSH.def()[state.mode]);
        if (relayout) { renderTop(); renderParams(); }
        redrawPreview(); hooks.onChange(state);
      });
    }
    renderTop(); renderParams(); redrawPreview();
  }

  window.CityGenUI = {
    ZONE_COL, GROUND,
    drawTileSprite, drawModuleSprite, drawOrientKey,
    buildPieceSheet, buildDistrictsLegend, buildRulesPanel, buildPatternEditor,
  };
})();
