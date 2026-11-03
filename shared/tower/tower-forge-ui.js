// ---------- Tower Forge UI: window.TowerForgeUI ----------
// Reusable schema-driven form system + drag-to-shape profile canvas for authoring a
// tower spec (the plain JS object shape produced/consumed by shared/tower/tower-engine.js's
// buildTower()). Extracted from tools/tower-forge/Tower Forge.html so a second tool can
// share the exact same tier/crown/foot/halo/aura/look editing UI without copy-pasting it.
//
// Dependencies (must already be loaded as globals before this script runs):
//   - window.TowerEngine  (shared/tower/tower-engine.js)   — used for TW_SKIES (Look tab's
//     sky options) and rAt() (tier radius-at-t, used to draw/shape the profile canvas).
//   - window.NAQSH        (shared/naqsh-pattern-engine.js) — used for MODES/PAL option
//     lists (Tier tab's Naqsh pattern + palette selects).
//   - CSS custom properties from shared/tokens.css (--ink, --muted, --line, --lapis,
//     --hi, --fill1, --fill2, --fillsel, --panel, --glowui, --mono) — the profile
//     canvas reads these via getComputedStyle so it matches the host page's theme.
//
// This module owns NO DOM ids and closes over NO caller-specific state: every function
// takes the schema/object/canvas/callbacks it needs as explicit parameters, so it is
// safe to use for multiple independent towers on one page.

(function () {

  // ---------- schema helpers ----------
  const sel = (opts) => ({ type: 'select', opts });
  const NQ_OPTS = () => [['none', 'None']].concat(Object.entries(NAQSH.MODES).filter(([k]) => k !== 'facade').map(([k, m]) => [k, m.label]));
  const PAL_OPTS = () => Object.entries(NAQSH.PAL).filter(([k]) => !k.startsWith('__')).map(([k, p]) => [k, p.name.split(' · ')[0]]);

  // ---------- schemas: drive both the panel forms and any variation/mutation engine ----------
  const TIER_SCHEMA = [
    { g: 'Shape' },
    { id: 'h', label: 'Height', type: 'range', min: 0.5, max: 40, step: 0.1, u: 'm' },
    { id: 'r0', label: 'Radius at base', type: 'range', min: 0.2, max: 12, step: 0.05, u: 'm' },
    { id: 'r1', label: 'Radius at top', type: 'range', min: 0.2, max: 12, step: 0.05, u: 'm' },
    { id: 'sides', label: 'Plan', ...sel([[0, 'Round'], [3, 'Triangle'], [4, 'Square'], [6, 'Hexagon'], [8, 'Octagon'], [12, 'Twelve-sided']]) },
    { id: 'prof', label: 'Profile', ...sel([['straight', 'Straight'], ['bulge', 'Bulge'], ['onion', 'Onion swell'], ['flare', 'Flared foot'], ['neck', 'Waisted'], ['bell', 'Bell']]) },
    { id: 'amp', label: 'Profile strength', type: 'range', min: 0, max: 1, step: 0.01 },
    { id: 'twist', label: 'Twist', type: 'range', min: -180, max: 180, step: 1, u: '°' },
    { g: 'Surface' },
    { id: 'mat', label: 'Material', ...sel([['body', 'Body'], ['accent', 'Accent metal'], ['dark', 'Dark stone'], ['glow', 'Glowing']]) },
    { id: 'pat', label: 'Naqsh pattern', type: 'select', opts: NQ_OPTS },
    { id: 'pal', label: 'Pattern palette', type: 'select', opts: PAL_OPTS, when: t => t.pat !== 'none' },
    { id: 'tile', label: 'Pattern tile', type: 'range', min: 0.5, max: 12, step: 0.1, u: 'm', when: t => t.pat !== 'none' },
    { id: 'ribs', label: 'Ribs', type: 'range', min: 0, max: 48, step: 1 },
    { id: 'ribD', label: 'Rib depth', type: 'range', min: 0.02, max: 0.8, step: 0.01, u: 'm', when: t => t.ribs > 0 },
    { id: 'chan', label: 'Glowing channels', type: 'range', min: 0, max: 6, step: 1 },
    { g: 'Openings' },
    { id: 'winRows', label: 'Window rows', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'winPer', label: 'Windows per row', type: 'range', min: 1, max: 16, step: 1, when: t => t.winRows > 0 },
    { id: 'winKind', label: 'Window shape', ...sel([['arch', 'Pointed arch'], ['slit', 'Arrow slit'], ['round', 'Oculus']]), when: t => t.winRows > 0 },
    { id: 'winGlow', label: 'Windows lit', type: 'check', when: t => t.winRows > 0 },
    { g: 'Band at the top' },
    { id: 'band', label: 'Band', ...sel([['none', 'None'], ['ring', 'Moulded ring'], ['beads', 'Ring of discs'], ['crenel', 'Crenellations'], ['balcony', 'Balcony'], ['corbel', 'Corbelled steps'], ['drops', 'Hanging drops'], ['glyphs', 'Glowing glyph band']]) },
    { id: 'bandSize', label: 'Band size', type: 'range', min: 0.1, max: 2.5, step: 0.05, u: 'm', when: t => t.band !== 'none' },
    { g: 'Turrets round the foot' },
    { id: 'spN', label: 'Turrets', type: 'range', min: 0, max: 12, step: 1 },
    { id: 'spH', label: 'Turret height', type: 'range', min: 0.1, max: 1.3, step: 0.01, u: '×', when: t => t.spN > 0 },
    { id: 'spR', label: 'Turret radius', type: 'range', min: 0.1, max: 2, step: 0.05, u: 'm', when: t => t.spN > 0 },
    { g: 'Stairs, cloth and buttresses' },
    { id: 'stair', label: 'Spiral stair turns', type: 'range', min: 0, max: 5, step: 0.25 },
    { id: 'banN', label: 'Hanging banners', type: 'range', min: 0, max: 16, step: 1 },
    { id: 'banLen', label: 'Banner length', type: 'range', min: 1, max: 24, step: 0.5, u: 'm', when: t => t.banN > 0 },
    { id: 'butN', label: 'Flying buttresses', type: 'range', min: 0, max: 12, step: 1 },
    { id: 'butR', label: 'Buttress reach', type: 'range', min: 1, max: 16, step: 0.5, u: 'm', when: t => t.butN > 0 },
  ];
  const CROWN_SCHEMA = [
    { id: 'kind', label: 'Crown', ...sel([['flat', 'Flat cap'], ['dome', 'Dome'], ['onion', 'Onion dome'], ['cone', 'Cone'], ['spire', 'Needle spire'], ['spikes', 'Crown of spikes'], ['crenel', 'Crenellated top'], ['lantern', 'Open lantern'], ['crescent', 'Crescent wing'], ['gothic', 'Gothic pinnacles'], ['belfry', 'Open belfry'], ['broken', 'Broken top']]) },
    { id: 'h', label: 'Crown height', type: 'range', min: 0.2, max: 20, step: 0.1, u: 'm' },
    { id: 'mat', label: 'Material', ...sel([['body', 'Body'], ['accent', 'Accent metal'], ['dark', 'Dark stone'], ['glow', 'Glowing']]) },
    { id: 'finial', label: 'Finial', type: 'check' },
  ];
  const BASE_SCHEMA = [
    { id: 'kind', label: 'Foot', ...sel([['none', 'None'], ['plinth', 'Square plinth'], ['steps', 'Round steps'], ['roots', 'Flared roots'], ['buried', 'Half-buried in sand'], ['crag', 'Rock crag']]) },
    { id: 'h', label: 'Foot height', type: 'range', min: 0.2, max: 12, step: 0.1, u: 'm', when: b => b.kind !== 'none' },
    { id: 'spread', label: 'Spread', type: 'range', min: 1, max: 3, step: 0.05, u: '×', when: b => b.kind !== 'none' },
    { id: 'fins', label: 'Buttress fins', type: 'range', min: 0, max: 12, step: 1, when: b => b.kind === 'roots' },
    { id: 'lean', label: 'Lean', type: 'range', min: -15, max: 15, step: 0.5, u: '°' },
  ];
  const HALO_SCHEMA = [
    { id: 'kind', label: 'Kind', ...sel([['portal', 'Portal ring'], ['armillary', 'Armillary sphere'], ['gear', 'Gear arc'], ['ring', 'Orbit ring'], ['orb', 'Glowing orb']]) },
    { id: 'r', label: 'Radius', type: 'range', min: 0.5, max: 20, step: 0.1, u: 'm' },
    { id: 'y', label: 'Height from top', type: 'range', min: -30, max: 15, step: 0.1, u: 'm' },
    { id: 'tilt', label: 'Tilt', type: 'range', min: -90, max: 90, step: 1, u: '°' },
    { id: 'face', label: 'Facing', type: 'range', min: 0, max: 360, step: 1, u: '°' },
    { id: 'n', label: 'Rings', type: 'range', min: 1, max: 8, step: 1, when: h => h.kind === 'armillary' || h.kind === 'portal' },
    { id: 'spin', label: 'Spin', type: 'range', min: -2, max: 2, step: 0.05 },
    { id: 'off', label: 'Offset from axis', type: 'range', min: 0, max: 10, step: 0.1, u: 'm' },
  ];
  const AURA_SCHEMA = [
    { g: 'Floating debris' },
    { id: 'debN', label: 'Pieces', type: 'range', min: 0, max: 220, step: 1 },
    { id: 'debKind', label: 'Shape', ...sel([['rock', 'Rocks'], ['block', 'Cut blocks'], ['shard', 'Shards'], ['crystal', 'Glowing crystals']]), when: a => a.debN > 0 },
    { id: 'debR', label: 'Orbit radius', type: 'range', min: 1, max: 40, step: 0.5, u: 'm', when: a => a.debN > 0 },
    { id: 'debSpread', label: 'Spread', type: 'range', min: 0, max: 30, step: 0.5, u: 'm', when: a => a.debN > 0 },
    { id: 'debSize', label: 'Size', type: 'range', min: 0.1, max: 3, step: 0.05, u: 'm', when: a => a.debN > 0 },
    { id: 'debLow', label: 'Lowest', type: 'range', min: 0, max: 1, step: 0.01, u: '× height', when: a => a.debN > 0 },
    { id: 'drift', label: 'Drift', type: 'range', min: 0, max: 2, step: 0.05, when: a => a.debN > 0 },
    { g: 'Light' },
    { id: 'beam', label: 'Beam from the first portal', type: 'check' },
    { id: 'beamLen', label: 'Beam length', type: 'range', min: 5, max: 120, step: 1, u: 'm', when: a => a.beam },
    { id: 'motes', label: 'Glowing motes', type: 'range', min: 0, max: 800, step: 10 },
    { g: 'Bridge' },
    { id: 'bridge', label: 'Bridge', type: 'check' },
    { id: 'bridgeLen', label: 'Length', type: 'range', min: 10, max: 140, step: 1, u: 'm', when: a => a.bridge },
    { id: 'bridgeAt', label: 'Deck height', type: 'range', min: 0.05, max: 0.9, step: 0.01, u: '× height', when: a => a.bridge },
    { id: 'bridgeFace', label: 'Direction', type: 'range', min: 0, max: 360, step: 1, u: '°', when: a => a.bridge },
    { id: 'bridgeBroken', label: 'Broken off', type: 'check', when: a => a.bridge },
    { g: 'Roots and clouds' },
    { id: 'roots', label: 'Roots climbing the tower', type: 'range', min: 0, max: 14, step: 1 },
    { id: 'rootsH', label: 'Root reach', type: 'range', min: 0.1, max: 1, step: 0.01, u: '× height', when: a => a.roots > 0 },
    { id: 'rootsGlow', label: 'Roots glow', type: 'check', when: a => a.roots > 0 },
    { id: 'clouds', label: 'Cloud band', type: 'range', min: 0, max: 1, step: 0.05 },
    { id: 'cloudsAt', label: 'Cloud height', type: 'range', min: 0.05, max: 1, step: 0.01, u: '× height', when: a => a.clouds > 0 },
    { g: 'Satellite pillars' },
    { id: 'satN', label: 'Pillars', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'satR', label: 'Distance', type: 'range', min: 4, max: 40, step: 0.5, u: 'm', when: a => a.satN > 0 },
    { id: 'satScale', label: 'Scale', type: 'range', min: 0.15, max: 0.9, step: 0.01, u: '×', when: a => a.satN > 0 },
    { id: 'satGlow', label: 'Lit tops', type: 'check', when: a => a.satN > 0 },
  ];
  const LOOK_SCHEMA = [
    { id: 'sky', label: 'Sky', type: 'select', opts: () => Object.entries(TowerEngine.TW_SKIES).map(([k, s]) => [k, s.name]) },
    { id: 'body', label: 'Body colour', type: 'color' },
    { id: 'accent', label: 'Accent metal', type: 'color' },
    { id: 'dark', label: 'Dark stone', type: 'color' },
    { id: 'glow', label: 'Glow colour', type: 'color' },
    { id: 'cloth', label: 'Cloth colour', type: 'color' },
    { id: 'weather', label: 'Weathering', type: 'range', min: 0, max: 1, step: 0.01 },
    { id: 'bloom', label: 'Bloom', type: 'range', min: 0, max: 2.5, step: 0.05 },
  ];

  // ---------- generic schema-driven form renderer ----------
  // box: a DOM element to append the form rows into (its contents are not cleared here).
  // schema: one of the arrays above. obj: the plain object the schema's ids read/write.
  // onChange(field, done, relayout): called as the user edits; `done` means the edit is
  // settled (e.g. mouseup / change, not input), `relayout` means a value changed that
  // affects which fields should be visible (so the caller should re-render the form).
  function optsOf(f) { return typeof f.opts === 'function' ? f.opts() : f.opts; }
  function renderForm(box, schema, obj, onChange) {
    for (const f of schema) {
      if (f.g) { const h = document.createElement('h3'); h.textContent = f.g; box.append(h); continue; }
      if (f.when && !f.when(obj)) continue;
      const row = document.createElement('label'); row.className = 'prm';
      const sp = document.createElement('span'); sp.textContent = f.label; row.append(sp);
      let inp; const v = obj[f.id];
      if (f.type === 'range') {
        inp = document.createElement('input'); Object.assign(inp, { type: 'range', min: f.min, max: f.max, step: f.step, value: v });
        const out = document.createElement('output'); const fmt = x => (+x).toFixed(f.step < 0.1 ? 2 : f.step < 1 ? 1 : 0) + (f.u ? ' ' + f.u : ''); out.textContent = fmt(v);
        inp.oninput = () => { out.textContent = fmt(inp.value); obj[f.id] = +inp.value; onChange(f, false); };
        inp.onchange = () => onChange(f, true);
        row.append(inp, out); row.classList.add('rng');
      } else if (f.type === 'select') {
        inp = document.createElement('select'); for (const [k, l] of optsOf(f)) { const o = document.createElement('option'); o.value = k; o.textContent = l; inp.append(o); }
        inp.value = v; inp.onchange = () => { const raw = inp.value, num = optsOf(f).find(o => String(o[0]) === raw); obj[f.id] = num && typeof num[0] === 'number' ? +raw : raw; onChange(f, true, true); };
        row.append(inp);
      } else if (f.type === 'check') {
        inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!v; inp.onchange = () => { obj[f.id] = inp.checked; onChange(f, true, true); }; row.append(inp);
      } else if (f.type === 'color') {
        inp = document.createElement('input'); inp.type = 'color'; inp.value = v; inp.oninput = () => { obj[f.id] = inp.value; onChange(f, false); }; inp.onchange = () => onChange(f, true); row.append(inp);
      }
      box.append(row);
    }
  }

  // ---------- profile editor: draw + drag-to-shape the tower silhouette ----------
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  // Pure draw: renders `spec`'s silhouette into `canvas`/`ctx`, highlighting `selectedTier`
  // (an index, or -1/undefined for none). Clears and refills `handlesOut` with the hit
  // targets (tier top/base dots, crown apex, halo dots, tier bodies) used for dragging and
  // hit-testing; `activeHandle`, if given, is drawn slightly larger (the handle currently
  // being dragged — matches the original tool's handle object identity exactly, including
  // that it only renders larger for the single draw call issued right at drag-start, since
  // every draw rebuilds `handlesOut` with fresh objects).
  // Returns { k, cx, gy }: the canvas-space scale/origin, needed to convert further pointer
  // drags (in CSS pixels) into spec-space deltas.
  function drawProfile(canvas, ctx, spec, selectedTier, handlesOut, activeHandle) {
    const s = spec; if (!s) return null;
    const px = ctx;
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
    px.setTransform(dpr, 0, 0, dpr, 0, 0); px.clearRect(0, 0, r.width, r.height);
    const W = r.width, Hc = r.height, baseH = s.base.kind === 'none' ? 0 : s.base.h;
    const Htiers = s.tiers.reduce((a, t) => a + t.h, 0), Hall = Math.max(4, baseH + Htiers + s.crown.h + 2, ...s.halos.map(h => baseH + Htiers + h.y + h.r * 0.3));
    let Rmax = Math.max(...s.tiers.map(t => Math.max(t.r0, t.r1, TowerEngine.rAt(t, 0.5) + (t.band !== 'none' ? t.bandSize * 1.3 : 0)))) * 1.1;
    if (s.base.kind !== 'none') Rmax = Math.max(Rmax, s.tiers[0].r0 * s.base.spread * 1.05);
    for (const h of s.halos) Rmax = Math.max(Rmax, h.r * 1.05);
    // clamp away from 0/negative: a canvas inside a hidden container (e.g. an unopened dock tab)
    // reports a 0x0 bounding rect on its first ResizeObserver firing, which would otherwise make
    // k negative and crash the arc()/ellipse() calls below
    const k = Math.max(0.01, Math.min((Hc - 34) / Hall, (W / 2 - 22) / Rmax)), cx = W / 2, gy = Hc - 16;
    const PV = { k, cx, gy };
    const X = rr => cx + rr * k, Y = yy => gy - yy * k;
    const ink = css('--ink'), muted = css('--muted'), line = css('--line'), acc = css('--lapis'), sel2 = css('--hi');
    px.strokeStyle = line; px.setLineDash([3, 4]); px.beginPath(); px.moveTo(cx, 6); px.lineTo(cx, gy); px.stroke(); px.setLineDash([]);
    px.strokeStyle = muted; px.beginPath(); px.moveTo(8, gy); px.lineTo(W - 8, gy); px.stroke();
    handlesOut.length = 0;
    const shape = (pts, fill, stroke) => { px.beginPath(); pts.forEach(([rr, yy], i) => i ? px.lineTo(X(rr), Y(yy)) : px.moveTo(X(rr), Y(yy))); for (let i = pts.length - 1; i >= 0; i--) px.lineTo(X(-pts[i][0]), Y(pts[i][1])); px.closePath(); px.fillStyle = fill; px.fill(); px.strokeStyle = stroke; px.lineWidth = 1.2; px.stroke(); };
    if (s.base.kind !== 'none') {
      const R = s.tiers[0].r0 * s.base.spread, pts = s.base.kind === 'roots' ? Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [s.tiers[0].r0 + (R - s.tiers[0].r0) * Math.pow(1 - t, 2.4), t * baseH]; }) : [[R, 0], [R, baseH]];
      shape(pts, css('--fill2'), muted);
      handlesOut.push({ kind: 'base', x: X(R), y: Y(baseH / 2) });
    }
    let y = baseH;
    s.tiers.forEach((T, i) => {
      const pts = []; for (let j = 0; j <= 16; j++) pts.push([TowerEngine.rAt(T, j / 16), y + T.h * j / 16]);
      const on = i === selectedTier;
      shape(pts, on ? css('--fillsel') : (i % 2 ? css('--fill1') : css('--fill2')), on ? acc : muted);
      if (T.band !== 'none') { px.fillStyle = muted; const bw = T.bandSize * (T.band === 'balcony' ? 1.25 : 0.6); px.fillRect(X(-TowerEngine.rAt(T, 1) - bw), Y(y + T.h) - 2, (2 * TowerEngine.rAt(T, 1) + 2 * bw) * k, 3); }
      if (T.spN > 0) { px.strokeStyle = muted; for (const sg of [-1, 1]) { const xx = X(sg * (T.r0 + T.spR)); px.strokeRect(Math.min(xx, xx + sg * T.spR * k) - T.spR * k / 2, Y(y + T.h * T.spH), T.spR * k, T.h * T.spH * k); } }
      px.fillStyle = on ? acc : muted; px.font = '11px ' + css('--mono'); px.textAlign = 'left'; px.fillText(String(i + 1), 8, Y(y + T.h / 2) + 4);
      handlesOut.push({ kind: 'r0', i, x: X(T.r0), y: Y(y) - (i ? 0 : 0) });
      handlesOut.push({ kind: 'top', i, x: X(TowerEngine.rAt(T, 1)), y: Y(y + T.h) });
      handlesOut.push({ kind: 'body', i, y0: Y(y + T.h), y1: Y(y) });
      y += T.h;
    });
    const rt = TowerEngine.rAt(s.tiers[s.tiers.length - 1], 1), H = y, C = s.crown;
    px.fillStyle = css('--fill2'); px.strokeStyle = muted; px.beginPath();
    if (['dome', 'onion', 'lantern'].includes(C.kind)) { px.ellipse(cx, Y(H), rt * k * 0.95, C.h * k, 0, Math.PI, 2 * Math.PI); }
    else if (['cone', 'spire', 'spikes'].includes(C.kind)) { px.moveTo(X(-rt * (C.kind === 'spire' ? 0.5 : 1)), Y(H)); px.lineTo(cx, Y(H + C.h)); px.lineTo(X(rt * (C.kind === 'spire' ? 0.5 : 1)), Y(H)); }
    else if (C.kind === 'crescent') { const R = Math.max(rt * 1.2, C.h * 0.5); px.save(); px.lineWidth = Math.max(3, rt * 0.8 * k); px.strokeStyle = css('--fill1'); px.beginPath(); px.arc(cx, Y(H + R), R * k, -0.2 * Math.PI, 1.2 * Math.PI); px.stroke(); px.lineWidth = 1; px.strokeStyle = muted; px.stroke(); px.restore(); px.beginPath(); }
    else { px.rect(X(-rt), Y(H + Math.min(C.h, 1.5)), 2 * rt * k, Math.min(C.h, 1.5) * k); }
    px.fill(); px.stroke();
    handlesOut.push({ kind: 'crown', x: cx, y: Y(H + (C.kind === 'crescent' ? Math.max(rt * 1.2, C.h * 0.5) * 2 : C.h)) });
    s.halos.forEach((h, i) => {
      const yy = Y(H + h.y);
      px.strokeStyle = css('--glowui'); px.lineWidth = 1.5; px.beginPath(); px.ellipse(cx + Math.sin(h.face * Math.PI / 180) * h.off * k, yy, h.r * k, Math.max(2, h.r * k * Math.abs(Math.sin((h.tilt + (h.kind === 'ring' ? 90 : 0)) * Math.PI / 180)) * 0.35 + 2), 0, 0, Math.PI * 2); px.stroke();
      handlesOut.push({ kind: 'halo', i, x: cx + Math.sin(h.face * Math.PI / 180) * h.off * k + h.r * k, y: yy });
    });
    for (const hd of handlesOut) if (hd.x !== undefined) {
      const on = hd.i === selectedTier && (hd.kind === 'top' || hd.kind === 'r0');
      px.beginPath(); px.arc(hd.x, hd.y, hd === activeHandle ? 7 : 5, 0, Math.PI * 2);
      px.fillStyle = hd.kind === 'halo' ? css('--glowui') : on ? acc : css('--panel'); px.fill(); px.strokeStyle = hd.kind === 'halo' ? css('--glowui') : acc; px.lineWidth = 2; px.stroke();
    }
    return PV;
  }

  // Attaches drag-to-shape pointer handling to `canvas`, driving `drawProfile()` above.
  // `hooks`:
  //   getSpec()            -> the live spec object to read/mutate (called fresh each time).
  //   getSelectedTier()    -> index of the tier to highlight (optional; default none).
  //   onSelectTier(i, { focus }) -> called when the user picks a tier via the canvas.
  //       `focus: true` means they clicked a tier's body directly (the host should switch
  //       to that tier's tab and re-render its form now); `focus: false` means a drag just
  //       started on one of that tier's handles (the host should just remember the index,
  //       without forcing a tab switch or re-render, since a possibly-expensive form
  //       re-render shouldn't happen on every drag start).
  //   onDrag()             -> called after the spec was mutated by an in-progress drag (the
  //       canvas has already redrawn itself; the host should do its own lightweight/
  //       debounced follow-up, e.g. scheduling a 3D rebuild).
  //   onCommit()           -> called once, on pointerup, if a drag happened (the host should
  //       re-render its form and push an undo/history snapshot here).
  // Returns { draw() }: call draw() whenever the host changes the spec/selection out of band
  // (new preset, undo/redo, tier added/removed, window resize notwithstanding — a
  // ResizeObserver is already wired internally).
  function attachProfileHandlers(canvas, hooks) {
    const ctx = canvas.getContext('2d');
    let handles = [], pdrag = null, PV = null;

    function redraw() {
      const spec = hooks.getSpec();
      const selTier = hooks.getSelectedTier ? hooks.getSelectedTier() : -1;
      PV = drawProfile(canvas, ctx, spec, selTier, handles, pdrag && pdrag.h) || PV;
    }
    function hit(x, y) {
      let best = null, bd = 12;
      for (const h of handles) if (h.x !== undefined) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
      if (best) return best;
      for (const h of handles) if (h.kind === 'body' && y >= h.y0 && y <= h.y1) return h;
      return null;
    }

    canvas.addEventListener('pointerdown', e => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, h = hit(x, y);
      if (!h) return;
      if (h.kind === 'body') { hooks.onSelectTier && hooks.onSelectTier(h.i, { focus: true }); redraw(); return; }
      if (h.i !== undefined && h.kind !== 'halo') { hooks.onSelectTier && hooks.onSelectTier(h.i, { focus: false }); }
      const s = hooks.getSpec();
      pdrag = { h, x, y, snap: h.kind === 'top' ? { h: s.tiers[h.i].h, r1: s.tiers[h.i].r1 } : h.kind === 'r0' ? { r0: s.tiers[h.i].r0 } : h.kind === 'crown' ? { h: s.crown.h } : h.kind === 'base' ? { spread: s.base.spread } : { r: s.halos[h.i].r, y: s.halos[h.i].y } };
      canvas.setPointerCapture(e.pointerId); redraw();
    });
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (!pdrag) { canvas.style.cursor = hit(x, y) ? (hit(x, y).kind === 'body' ? 'pointer' : 'grab') : 'default'; return; }
      const s = hooks.getSpec(), h = pdrag.h, dx = (x - pdrag.x) / PV.k, dy = -(y - pdrag.y) / PV.k, q = v => Math.round(v * 20) / 20;
      if (h.kind === 'top') { const T = s.tiers[h.i]; T.h = q(Math.max(0.5, pdrag.snap.h + dy)); T.r1 = q(Math.max(0.2, pdrag.snap.r1 + dx)); }
      else if (h.kind === 'r0') { s.tiers[h.i].r0 = q(Math.max(0.2, pdrag.snap.r0 + dx)); }
      else if (h.kind === 'crown') { s.crown.h = q(Math.max(0.2, pdrag.snap.h + (s.crown.kind === 'crescent' ? dy / 2 : dy))); }
      else if (h.kind === 'base') { s.base.spread = q(Math.max(1, pdrag.snap.spread + dx / s.tiers[0].r0)); }
      else if (h.kind === 'halo') { const H = s.halos[h.i]; H.r = q(Math.max(0.5, pdrag.snap.r + dx)); H.y = q(pdrag.snap.y + dy); }
      // the host's onDrag is expected to redraw synchronously (e.g. by calling this
      // editor's own draw()), matching the original tool's single draw-per-drag-move.
      hooks.onDrag && hooks.onDrag();
    });
    canvas.addEventListener('pointerup', () => { if (pdrag) { pdrag = null; hooks.onCommit && hooks.onCommit(); redraw(); } });
    new ResizeObserver(redraw).observe(canvas);

    return { draw: redraw };
  }

  // ---------- spec defaults, Code dialog, variation + MAP-Elites ----------
  // Extracted from tools/tower-forge/Tower Forge.html's own (THREE-free) spec-arithmetic
  // sections, same reasoning as the rest of this module: two tools edit tower specs, so the
  // editing logic lives once, here. Thumbnail RENDERING is deliberately NOT here — standalone
  // Tower Forge renders thumbnails through THREE.js, a from-scratch WebGL2 host renders its own
  // — each host supplies its own renderThumbnail(spec, w, h) callback to the Atlas/Variations
  // helpers below instead.
  const HALO_DEF = { kind: 'portal', r: 3, y: 0, tilt: 0, face: 0, n: 2, spin: 0.4, off: 0 };
  const AURA_DEF = { debN: 0, debKind: 'rock', debR: 10, debSpread: 6, debSize: 0.6, debLow: 0.3, drift: 0.4, beam: false, beamLen: 50, motes: 0, satN: 0, satR: 10, satScale: 0.5, satGlow: false, bridge: false, bridgeLen: 50, bridgeAt: 0.35, bridgeFace: 200, bridgeBroken: false, roots: 0, rootsH: 0.5, rootsGlow: false, clouds: 0, cloudsAt: 0.45 };
  const LOOK_DEF = { sky: 'dusk', body: '#d8cdb8', accent: '#c9a24a', dark: '#3e4642', glow: '#ffd27a', cloth: '#b8322a', weather: 0.35, bloom: 1.1 };
  const clone = o => JSON.parse(JSON.stringify(o));
  const twRng = seed => RNG.mulberry32((seed >>> 0) || 1);

  // fills in any missing fields of a (possibly hand-edited or partial) spec with defaults —
  // used by the Code dialog's "Rebuild from this" and anywhere else an external spec is accepted.
  function normalize(o) {
    const s = { seed: o.seed || 1 };
    s.base = Object.assign({ kind: 'none', h: 2, spread: 1.6, fins: 0, lean: 0 }, o.base || {});
    const TIER_DEF = TowerEngine.TIER_DEF;
    s.tiers = (o.tiers && o.tiers.length ? o.tiers : [TIER_DEF]).map(t => Object.assign({}, TIER_DEF, t));
    s.crown = Object.assign({ kind: 'flat', h: 2, mat: 'body', finial: false }, o.crown || {});
    s.halos = (o.halos || []).map(h => Object.assign({}, HALO_DEF, h));
    s.aura = Object.assign({}, AURA_DEF, o.aura || {});
    s.look = Object.assign({}, LOOK_DEF, o.look || {});
    if (!TowerEngine.TW_SKIES[s.look.sky]) s.look.sky = 'dusk';
    // a spec pasted in from Spire Forge's "To Tower Forge" bridge carries extra top-level fields
    // this schema has no slot for: `orn.crown` (blade/lamp placement for the very top), `spire`
    // (the full 2D genome it was built from — "World Scene builds this exact tower in 3D"), and
    // `source` (where it came from). None of this tool's own logic reads them, but round-tripping
    // through normalize() (Code dialog load, mutate/crossover clone) must not silently drop them.
    if (o.orn) s.orn = o.orn;
    if (o.spire) s.spire = o.spire;
    if (o.source) s.source = o.source;
    return s;
  }

  // Code dialog: specCode(spec) -> display text, parseSpecCode(text) -> normalized spec (throws
  // a short, user-facing message on bad input, same contract as Tower Forge's own c-load handler).
  function specCode(s) { return '// Tower spec. Every field is a parameter; paste it back to rebuild the tower.\nconst tower = ' + JSON.stringify(s, null, 2) + ';\n'; }
  function parseSpecCode(text) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('no { ... } object found');
    const o = JSON.parse(text.slice(a, b + 1));
    if (!Array.isArray(o.tiers)) throw new Error('needs a tiers list');
    return normalize(o);
  }

  // ---------- variation: perturb numbers, sometimes swap a choice, occasionally add/drop a part ----------
  function schemaOf(kind) { return { tier: TIER_SCHEMA, crown: CROWN_SCHEMA, base: BASE_SCHEMA, halo: HALO_SCHEMA, aura: AURA_SCHEMA }[kind]; }
  function jitterObj(obj, schema, rnd, wild, keep = []) {
    for (const f of schema) {
      if (!f.id || keep.includes(f.id)) continue;
      if (f.type === 'range') {
        const span = f.max - f.min, v = obj[f.id] + (rnd() * 2 - 1) * span * 0.18 * wild;
        obj[f.id] = Math.round(Math.min(f.max, Math.max(f.min, v)) / f.step) * f.step;
        if (f.step >= 1) obj[f.id] = Math.round(obj[f.id]); else obj[f.id] = +obj[f.id].toFixed(3);
      } else if (f.type === 'select' && rnd() < 0.12 * wild) {
        const o = typeof f.opts === 'function' ? f.opts() : f.opts; obj[f.id] = o[Math.floor(rnd() * o.length)][0];
      } else if (f.type === 'check' && rnd() < 0.08 * wild) obj[f.id] = !obj[f.id];
    }
  }
  function mutate(s, seed, wild, locks) {
    const r = twRng(seed), o = clone(s);
    locks = locks || {};
    o.seed = Math.floor(r() * 1e6);
    if (!locks.stack) for (const t of o.tiers) { jitterObj(t, TIER_SCHEMA, r, wild * 0.8, ['pal']); t.r1 = Math.min(t.r1, t.r0 * 1.6); }
    // keep the stack continuous: each tier starts near where the last ended
    if (!locks.stack) for (let i = 1; i < o.tiers.length; i++) if (r() < 0.6) o.tiers[i].r0 = +(o.tiers[i - 1].r1 * (0.8 + r() * 0.3)).toFixed(2);
    if (!locks.crown) jitterObj(o.crown, CROWN_SCHEMA, r, wild);
    if (!locks.foot) jitterObj(o.base, BASE_SCHEMA, r, wild);
    if (!locks.aura) { for (const h of o.halos) jitterObj(h, HALO_SCHEMA, r, wild * 0.7); jitterObj(o.aura, AURA_SCHEMA, r, wild * 0.6); }
    if (!locks.stack && r() < 0.18 * wild && o.tiers.length < 6) { const i = Math.floor(r() * o.tiers.length), t = clone(o.tiers[i]); t.h = +(t.h * (0.4 + r() * 0.5)).toFixed(1); t.r0 = t.r1 = +(o.tiers[i].r1 * 0.85).toFixed(2); o.tiers.splice(i + 1, 0, t); }
    if (!locks.stack && r() < 0.12 * wild && o.tiers.length > 1) o.tiers.splice(Math.floor(r() * o.tiers.length), 1);
    if (!locks.aura && r() < 0.15 * wild && o.halos.length < 4) o.halos.push(Object.assign({}, HALO_DEF, { kind: ['portal', 'armillary', 'ring', 'orb', 'gear'][Math.floor(r() * 5)], r: 2 + r() * 6, y: -r() * 6, spin: (r() - 0.5) * 1.6, face: Math.floor(r() * 360), off: 0 }));
    if (!locks.aura && r() < 0.1 * wild && o.halos.length) o.halos.splice(Math.floor(r() * o.halos.length), 1);
    return o;
  }
  // locked parts are copied from the reference tower (the one you are working on)
  function applyLocks(o, ref, locks) {
    if (!locks || !ref) return o;
    if (locks.stack) o.tiers = clone(ref.tiers);
    if (locks.crown) o.crown = clone(ref.crown);
    if (locks.foot) o.base = clone(ref.base);
    if (locks.aura) { o.halos = clone(ref.halos); o.aura = clone(ref.aura); }
    if (locks.look) o.look = clone(ref.look);
    return o;
  }
  // crossover: the lower tiers of one parent under the upper tiers of the other, each other part from either parent
  function crossover(a, b, seed) {
    const r = twRng(seed), o = clone(a);
    const ca = 1 + Math.floor(r() * a.tiers.length), cb = Math.floor(r() * b.tiers.length);
    o.tiers = clone(a.tiers.slice(0, ca).concat(b.tiers.slice(cb))).slice(0, 6);
    for (let i = 1; i < o.tiers.length; i++) { const prev = o.tiers[i - 1], top = prev.r1; if (Math.abs(o.tiers[i].r0 - top) > top * 0.35) { const k = top * 0.92 / o.tiers[i].r0; o.tiers[i].r0 *= k; o.tiers[i].r1 *= k; o.tiers[i].r0 = +o.tiers[i].r0.toFixed(2); o.tiers[i].r1 = +o.tiers[i].r1.toFixed(2); } }
    for (const k of ['crown', 'base', 'look']) o[k] = clone(r() < 0.5 ? a[k] : b[k]);
    if (r() < 0.5) { o.halos = clone(b.halos); o.aura = clone(b.aura); }
    o.seed = Math.floor(r() * 1e6);
    return o;
  }

  // ---------- MAP-Elites: what a tower is like (descriptors) and how well it holds together (fitness) ----------
  function towerHeight(s) { return (s.base.kind === 'none' ? 0 : s.base.h) + s.tiers.reduce((a, t) => a + t.h, 0); }
  function twTopR(s) { const t = s.tiers[s.tiers.length - 1]; return TowerEngine.rAt(t, 1); }
  function ornamentOf(s) {
    let o = 0;
    for (const t of s.tiers) {
      o += t.band !== 'none' ? (t.band === 'glyphs' || t.band === 'balcony' ? 1.4 : 1) : 0;
      o += t.ribs > 0 ? Math.min(1.2, t.ribs / 12) : 0; o += Math.min(1.5, t.chan * 0.5);
      o += Math.min(1.5, t.winRows * t.winPer / 10); o += t.spN > 0 ? 1 : 0; o += t.pat !== 'none' ? 1.2 : 0;
      o += t.banN > 0 ? 1 : 0; o += t.stair > 0 ? 0.8 : 0; o += t.butN > 0 ? 1.2 : 0;
    }
    o += { flat: 0, broken: 0.3, cone: 0.5, dome: 0.8, onion: 1, spire: 1, crenel: 0.8, spikes: 1.2, lantern: 1.5, crescent: 1.5, gothic: 2, belfry: 1.5 }[s.crown.kind] || 0;
    o += s.crown.finial ? 0.3 : 0; o += s.base.kind === 'none' ? 0 : 0.5;
    return o;
  }
  function auraOf(s) {
    const A = s.aura; let a = 0;
    for (const h of s.halos) a += h.kind === 'armillary' ? 2.4 : 1.8;
    a += Math.min(2.5, A.debN / 40) + Math.min(2, A.motes / 250) + (A.beam ? 1 : 0) + Math.min(2, A.satN * 0.4) + Math.min(2, A.roots * 0.25) + A.clouds * 1.5 + (A.bridge ? 1.5 : 0);
    return a;
  }
  function habitatOf(s) {
    let h = 0;
    for (const t of s.tiers) {
      h += { none: 0, ring: 0.5, beads: 0.5, glyphs: 0.3, crenel: 1.5, balcony: 2, corbel: 1.2, drops: 0.3 }[t.band] || 0;
      h += Math.min(3, t.winRows * t.winPer / 6) + (t.spN > 0 ? 1 : 0) + (t.stair > 0 ? 1.2 : 0) + (t.butN > 0 ? 1.5 : 0) + (t.banN > 0 ? 0.6 : 0) + (t.ribs > 0 ? 0.4 : 0);
    }
    h += Math.min(3, s.aura.roots * 0.35) + (s.aura.bridge ? 1.5 : 0) + (['lantern', 'belfry', 'crenel'].includes(s.crown.kind) ? 1.2 : 0) + (s.base.kind === 'crag' || s.base.kind === 'roots' ? 1 : 0);
    return h;
  }
  const ATLAS_AXES = {
    height: { label: 'Height', f: s => towerHeight(s) + s.crown.h, min: 8, max: 70, u: 'm' },
    slender: { label: 'Slenderness', f: s => (towerHeight(s) + s.crown.h) / (2 * Math.max(...s.tiers.map(t => Math.max(t.r0, t.r1)))), min: 1, max: 9, u: '×' },
    ornament: { label: 'Ornament', f: ornamentOf, min: 0, max: 12 },
    aura: { label: 'Aura', f: auraOf, min: 0, max: 10 },
    habitat: { label: 'Habitat for creatures', f: habitatOf, min: 0, max: 14 },
    tiers: { label: 'Tiers', f: s => s.tiers.length, min: 0.5, max: 6.5 },
  };
  // coherence: tiers meet cleanly, the crown and halos fit the tower, proportions stay buildable
  function coherence(s) {
    let c = 1; const T = s.tiers, H = towerHeight(s), rTop = Math.max(0.3, twTopR(s));
    for (let i = 1; i < T.length; i++) {
      const top = TowerEngine.rAt(T[i - 1], 1), d = Math.abs(top - T[i].r0) / Math.max(top, T[i].r0);
      c -= 0.22 * Math.min(1, Math.max(0, d - 0.12) * 2.5);
      if (T[i].r0 > T[0].r0 * 1.35) c -= 0.12;
    }
    const ch = s.crown.h / rTop; if (ch < 0.25 || ch > 4.5) c -= 0.12;
    const sl = (H + s.crown.h) / (2 * Math.max(...T.map(t => Math.max(t.r0, t.r1)))); if (sl < 0.9 || sl > 10) c -= 0.15;
    for (const h of s.halos) { if (h.r > rTop * 7 + 6) c -= 0.08; if (h.y < -H * 0.9 || h.y > H * 0.6) c -= 0.08; }
    for (const t of T) { if (t.band !== 'none' && t.bandSize > Math.max(t.r0, t.r1) * 0.9) c -= 0.05; if (t.h < 0.8 && t.band === 'none') c -= 0.05; }
    if (s.aura.debN > 150 && s.aura.motes > 500) c -= 0.05;
    return Math.max(0, Math.min(1, c));
  }
  // how close a tower is to one you pinned: shared parts plus nearby descriptor values
  function similarity(a, b) {
    let num = 0, n = 0;
    for (const k of Object.keys(ATLAS_AXES)) { const ax = ATLAS_AXES[k]; num += 1 - Math.min(1, Math.abs(ax.f(a) - ax.f(b)) / (ax.max - ax.min)); n++; }
    let cat = 0, m = 0;
    const eq = (x, y) => { cat += x === y ? 1 : 0; m++; };
    eq(a.crown.kind, b.crown.kind); eq(a.base.kind, b.base.kind); eq(a.look.sky, b.look.sky); eq(a.tiers[0].sides, b.tiers[0].sides); eq(a.tiers[0].prof, b.tiers[0].prof);
    const hk = x => x.halos.map(h => h.kind).sort().join(); eq(hk(a), hk(b));
    return 0.6 * num / n + 0.4 * cat / m;
  }
  function fitnessOf(s, pinned) {
    const c = coherence(s);
    if (!pinned || !pinned.length) return c;
    return 0.65 * c + 0.35 * Math.max(...pinned.map(p => similarity(s, p)));
  }
  // surprise: mix the parts of two presets (TowerPresets, from shared/tower/tower-presets.js)
  function surprise(seed) {
    const r = twRng(seed), keys = Object.keys(TowerPresets), pick = () => clone(TowerPresets[keys[Math.floor(r() * keys.length)]].s);
    const a = pick(), b = pick(), c = pick();
    const o = clone(a);
    o.crown = b.crown; o.halos = r() < 0.5 ? b.halos : c.halos; o.aura = c.aura; o.look = r() < 0.5 ? a.look : b.look; o.base = r() < 0.5 ? a.base : c.base;
    return mutate(o, seed + 1, 0.8);
  }

  // MAP-Elites grid: a small stateful helper, one per host gallery (Tower Forge and World Scene
  // Next each keep their own). axisX/axisY are ATLAS_AXES keys, n is the grid's side length.
  function createAtlas(axisX, axisY, n) {
    const AT = { x: axisX, y: axisY, n, grid: new Map(), pool: [], pins: [], iters: 0 };
    const clampI = (v, n) => Math.max(0, Math.min(n - 1, v));
    function bin(s) {
      const ax = ATLAS_AXES[AT.x], ay = ATLAS_AXES[AT.y];
      const dx = clampI(Math.floor((ax.f(s) - ax.min) / (ax.max - ax.min) * AT.n), AT.n);
      const dy = clampI(Math.floor((ay.f(s) - ay.min) / (ay.max - ay.min) * AT.n), AT.n);
      return dy * AT.n + dx;
    }
    function insert(s) {
      const k = bin(s), f = fitnessOf(s, AT.pins);
      const cur = AT.grid.get(k);
      if (!cur || f > cur.fitness) AT.grid.set(k, { spec: s, fitness: f });
      AT.pool.push(s); if (AT.pool.length > 3000) AT.pool.splice(0, AT.pool.length - 2500);
      return k;
    }
    function step(k, locks) {
      const cells = [...AT.grid.values()];
      for (let i = 0; i < k; i++) {
        let parent;
        if (AT.pins.length && Math.random() < 0.35) parent = AT.pins[Math.floor(Math.random() * AT.pins.length)];
        else if (cells.length) parent = cells[Math.floor(Math.random() * cells.length)].spec;
        else parent = AT.pool[0]; if (!parent) return;
        const seed = Math.floor(Math.random() * 1e9);
        let child = (cells.length > 1 && Math.random() < 0.3)
          ? mutate(crossover(parent, cells[Math.floor(Math.random() * cells.length)].spec, seed), seed + 1, 0.3, locks)
          : mutate(parent, seed, 0.35 + Math.random() * 0.9, locks);
        insert(child);
        AT.iters++;
      }
    }
    return { state: AT, bin, insert, step, fitnessOf: s => fitnessOf(s, AT.pins) };
  }

  window.TowerForgeUI = {
    TIER_SCHEMA, CROWN_SCHEMA, BASE_SCHEMA, HALO_SCHEMA, AURA_SCHEMA, LOOK_SCHEMA,
    sel, optsOf, renderForm,
    drawProfile, attachProfileHandlers,
    normalize, specCode, parseSpecCode,
    schemaOf, jitterObj, mutate, applyLocks, crossover, surprise, towerHeight,
    ATLAS_AXES, ornamentOf, auraOf, habitatOf, coherence, similarity, fitnessOf,
    createAtlas,
  };
})();
