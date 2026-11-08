/* INTERACTIONS — Tower geometry-building engine, raw-WebGL2 port.
   Ported 2026-11-01 from shared/engine/tower/tower-engine.js so a hand-written raw-WebGL2 pipeline (no Three.js
   anywhere — see world/forges/fish-tool/Cybernetic Ecology.html's regenTerrain()/TERRAIN_VS/SNOW_VS/
   CARCASS_VS for the house style this targets: CPU-built typed arrays, uploaded once via
   gl.bufferData, drawn with a dedicated shader program) can render fish + city + towers in one
   pipeline. This file calls ZERO gl.* / THREE.* APIs — it only produces plain data. A later
   integration pass (not this file) writes the GLSL + draw calls that consume buildTowerGL2()'s
   output.

   Depends on shared/engine/rng.js's convention (a "seeded RNG" is a zero-arg function returning floats in
   [0,1) — see RNG.mulberry32/RNG.create) and shared/engine/naqsh-pattern-engine.js's NAQSH.renderTo(ctx2d,
   size, {mode,params,pal,seed,b}) / NAQSH.def() / NAQSH.MODES, both reused completely unmodified.
   Classic script (not a module). Load order:
     <script src="../rng.js"></script>
     <script src="../naqsh-pattern-engine.js"></script>
     <script src="tower-engine-gl2.js"></script>
     (then your own script that reads window.TowerEngineGL2)

   ---------------------------------------------------------------------------------------------
   MATERIAL TAGS — one per distinct visual treatment found in the original's THREE materials
   (makeMats()). Every part's `materialTag` is one of:
     body          - lit, vertex-colored (weathering baked per-vertex): tier bodies, foot/base,
                      tier top caps, turret shafts, broken-crown rubble, plinth/steps.
     dark          - same lit treatment as `body` but for mat:'dark' elements (ribs/bands/stairs/
                      buttresses/crenellations/etc. when a tier's `mat` is 'dark').
     accent        - metal trim: finials, spire rings, turret caps/balls, balcony brackets, bead
                      torii, drop cones/balls, buttress caps, armillary rings/planets/ticks, bell.
     glow          - opaque "emissive" flat color (bloom candidate): channel strips, inner portal
                      ring, inner gear ring, plain halo ring, orb sphere, beam core.
     glowAdditive  - transparent additive-blend, untextured (outer portal rings, beam outer
                      cylinder, 'crystal' debris).
     glowTex       - transparent additive-blend, textured color map (portal glyph/swirl discs,
                      glyph-strip crown band). texture.canvas is a color map here, not a mask.
     window        - opaque alpha-test cutout, texture.canvas is a white-on-black alpha MASK
                      (winTexCanvas): dark unlit windows + corbel brackets.
     windowGlow    - same alpha-mask cutout as `window` but bloom/emissive colored (T.winGlow).
     pattern       - tier bodies carrying a NAQSH pattern texture; texture.canvas is a color map,
                      vertex color carries the tint lerp the original applied to mat.color.
     cloth         - banner geometry; texture.canvas is the hand-drawn cloth-strip color map.
     rock          - crag spires / buried sand dune: flat ground-ish material, vertex color already
                      baked from the sky's ground color lerp.
     bridge        - bridge deck/piers/parapets.
     auraPoints    - `mode:'points'` parts: debris-adjacent aura particles (motes, root-glow leaf
                      sparks, cloud puffs). Positions only; `uv.x` carries a point-size sentinel
                      where the original varied per-point size (currently: cloud puffs only — motes
                      and leaves used one constant PointsMaterial.size in the original, so their
                      uv.x is 0 and the integration shader should pick one constant size for those).

   KNOWN GAPS (left out deliberately, not silently):
   1. No animation/update hook. buildTowerGL2()'s contract is the static {parts, info, reach, top}
      — there is no update(t). Every originally-animated effect (banner sway, bell swing, portal/
      gear/ring/armillary spin, debris drift, mote/leaf drift, cloud rotation, halo shimmer) is
      baked at its t=0 pose only — the exact pose the original itself computes before animating
      (it even calls its debris matrix updater once as `upd(0)` for the first frame).
   2. True camera-facing billboards (THREE.Sprite) have no static-buffer equivalent. The orb halo
      sprite and the satellite glow sprite are DROPPED entirely (their radius is still recoverable
      from the halo/satellite spec at runtime if the integration step wants to fake a billboard).
      Cloud puffs / motes / root-glow leaf sparks (all THREE.Points in the original) are kept, as
      `mode:'points'` parts tagged `auraPoints`.
   3. The bridge's arched cut-out (a THREE.Shape with a quadratic-bezier hole) is not triangulated
      with a hole — ear-clipping-with-holes is a general polygon-triangulation problem the porting
      brief explicitly said to avoid pulling a library in for. The bridge ports as solid deck + pier
      blocks + parapets (faithful placement/count), just without the open archway silhouette.
   4. `buried`/`crag` base kinds and the default ("rock") debris kind use a per-vertex noise
      displacement over an icosphere, ported faithfully in spirit; the original dedupes one random
      scale per unique *shared* corner (THREE.IcosahedronGeometry's indexed verts share corners
      across faces), but this port's icosphere does not share corner vertices across faces (so it
      can carry hard per-face normals), so the displacement is applied per-vertex instead of per-
      shared-corner. Same bumpy-rock character, not vertex-identical.
   5. Normal correction under non-uniform instance scale (debris 'crystal'/'shard' base shapes,
      pre-scaled like THREE's `.scale(0.4,1.5,0.4)`) uses the cheap "divide by scale, then rotate"
      approximation rather than a true inverse-transpose. Fine for the near-diagonal scales used.
   6. `info` mirrors the original's `{H, top, rTop, profile, lean, rMax}` but omits `info.body`
      (a THREE.Group handle with no meaning outside Three.js).
*/
(function () {
  'use strict';

  /* ============================== pure math (ported verbatim) ============================== */
  function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; }

  const TIER_DEF = { h: 6, r0: 3, r1: 2.8, sides: 0, prof: 'straight', amp: 0.3, twist: 0, mat: 'body', pat: 'none', pal: 'dome', tile: 3, ribs: 0, ribD: 0.15, chan: 0, winRows: 0, winPer: 4, winKind: 'arch', winGlow: false, band: 'none', bandSize: 0.5, spN: 0, spH: 0.6, spR: 0.5, stair: 0, banN: 0, banLen: 6, butN: 0, butR: 5 };

  const TW_SKIES = {
    dusk: { name: 'Dusk', top: '#1b2550', mid: '#6d4f7e', bot: '#d98f63', fog: '#b07e74', sun: '#ffb27a', sunI: 1.1, hemi: ['#9aa6ff', '#4a3030'], hemiI: 0.55, ground: '#5a3e36', sunPos: [40, 22, 30] },
    verdigris: { name: 'Verdigris haze', top: '#1c2620', mid: '#4f5e45', bot: '#c9cf96', fog: '#8d9672', sun: '#eef2b8', sunI: 0.9, hemi: ['#c8d6a0', '#20261a'], hemiI: 0.6, ground: '#242820', sunPos: [-20, 40, -30] },
    night: { name: 'Starry night', top: '#03050d', mid: '#0c1636', bot: '#27386a', fog: '#121a34', sun: '#8aa4ff', sunI: 0.45, hemi: ['#4a5ab0', '#0a0c14'], hemiI: 0.45, ground: '#10141f', sunPos: [30, 50, -20], stars: true },
    ember: { name: 'Ember sky', top: '#22101a', mid: '#7a3430', bot: '#c86848', fog: '#8c4a3e', sun: '#ff9a6a', sunI: 0.8, hemi: ['#ff9a8a', '#2a1214'], hemiI: 0.5, ground: '#3a1e1c', sunPos: [-30, 30, 40], stars: true },
    ochre: { name: 'Ochre haze', top: '#c9b79a', mid: '#d6b994', bot: '#dcc3a4', fog: '#d2b896', sun: '#fff0d8', sunI: 0.95, hemi: ['#fff4e0', '#8a5a40'], hemiI: 0.7, ground: '#b06c48', sunPos: [35, 45, 25] },
    golden: { name: 'Golden hour', top: '#3d6ea0', mid: '#86a9c2', bot: '#e8b886', fog: '#d8b08c', sun: '#ffd09a', sunI: 1.35, hemi: ['#bcd8ff', '#7a4a30'], hemiI: 0.6, ground: '#8a5a3c', sunPos: [50, 26, 20] },
    olive: { name: 'Olive storm', top: '#2c2c1e', mid: '#5e5c3a', bot: '#a8a070', fog: '#77724e', sun: '#f2e2a8', sunI: 1, hemi: ['#e8dca8', '#2a281a'], hemiI: 0.6, ground: '#3a3826', sunPos: [30, 40, 30] },
  };

  // radius of the tier outline at height fraction t (identical to tower-engine.js)
  function rAt(T, t) {
    const base = Math.max(T.r0, T.r1); let r = T.r0 + (T.r1 - T.r0) * t;
    switch (T.prof) {
      case 'bulge': r += T.amp * base * Math.sin(Math.PI * t) * 0.6; break;
      case 'onion': r += T.amp * base * Math.sin(Math.PI * Math.pow(t, 0.6)) * 0.7; break;
      case 'flare': r += T.amp * T.r0 * Math.pow(1 - t, 3) * 1.4; break;
      case 'neck': r -= T.amp * base * Math.sin(Math.PI * t) * 0.45; break;
      case 'bell': r += T.amp * T.r0 * Math.pow(1 - t, 1.6) * 0.9; break;
    }
    return Math.max(0.05, r);
  }
  const phi0 = n => n ? Math.PI / n : 0;
  function polyR(r, n, th) { if (!n) return r; const seg = 2 * Math.PI / n; let d = ((th - phi0(n)) % seg + seg) % seg - seg / 2; return r * Math.cos(Math.PI / n) / Math.cos(d); }
  // local "forward" = +Z at th=0 (matches the x=sin,z=cos convention below everywhere, so a
  // primitive authored with its own +Z as "outward" lines up with rotY(th) placement, below).
  const at = (r, th, y) => ({ x: r * Math.sin(th), y, z: r * Math.cos(th) });

  /* ============================== tiny vector / rotation helpers ============================= */
  const vAdd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const vCross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const vLen = a => Math.hypot(a.x, a.y, a.z);
  const vNorm = a => { const l = vLen(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
  function rotX(v, ang) { if (!ang) return v; const c = Math.cos(ang), s = Math.sin(ang); return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c }; }
  function rotY(v, ang) { if (!ang) return v; const c = Math.cos(ang), s = Math.sin(ang); return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }; }
  function rotZ(v, ang) { if (!ang) return v; const c = Math.cos(ang), s = Math.sin(ang); return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z }; }
  function rotEulerXYZ(v, rx, ry, rz) { return rotZ(rotY(rotX(v, rx), ry), rz); }
  function rotAxisAngle(v, axis, ang) { // Rodrigues' rotation formula
    const k = vNorm(axis), c = Math.cos(ang), s = Math.sin(ang);
    const kv = vCross(k, v), kdv = k.x * v.x + k.y * v.y + k.z * v.z;
    return { x: v.x * c + kv.x * s + k.x * kdv * (1 - c), y: v.y * c + kv.y * s + k.y * kdv * (1 - c), z: v.z * c + kv.z * s + k.z * kdv * (1 - c) };
  }

  /* ============================== growable-buffer utilities ============================== */
  function newBuf() { return { pos: [], nor: [], uv: [], col: [], idx: [] }; }
  function pushVert(b, x, y, z, u, v, r, g, bl, a) {
    b.pos.push(x, y, z); b.nor.push(0, 0, 0); b.uv.push(u, v);
    b.col.push(r === undefined ? 1 : r, g === undefined ? 1 : g, bl === undefined ? 1 : bl, a === undefined ? 1 : a);
    return b.pos.length / 3 - 1;
  }
  function pushTri(b, i0, i1, i2) { b.idx.push(i0, i1, i2); }
  function faceNormalAdd(pos, acc, ia, ib, ic) {
    const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
    const bx = pos[ib * 3], by = pos[ib * 3 + 1], bz = pos[ib * 3 + 2];
    const cx = pos[ic * 3], cy = pos[ic * 3 + 1], cz = pos[ic * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    acc[ia * 3] += nx; acc[ia * 3 + 1] += ny; acc[ia * 3 + 2] += nz;
    acc[ib * 3] += nx; acc[ib * 3 + 1] += ny; acc[ib * 3 + 2] += nz;
    acc[ic * 3] += nx; acc[ic * 3 + 1] += ny; acc[ic * 3 + 2] += nz;
  }
  // smooth: accumulate+normalize face normals per shared index (like THREE's computeVertexNormals
  // on an INDEXED geometry) — used for lathe grids, extrudes, primitives with shared verts.
  function smoothNormalsWIP(b) {
    const n = b.pos.length / 3, acc = new Float64Array(n * 3);
    for (let t = 0; t < b.idx.length; t += 3) faceNormalAdd(b.pos, acc, b.idx[t], b.idx[t + 1], b.idx[t + 2]);
    for (let i = 0; i < n; i++) { const x = acc[i * 3], y = acc[i * 3 + 1], z = acc[i * 3 + 2], l = Math.hypot(x, y, z) || 1; b.nor[i * 3] = x / l; b.nor[i * 3 + 1] = y / l; b.nor[i * 3 + 2] = z / l; }
  }
  // flat: every 3 consecutive (non-indexed) verts are one triangle; all 3 get that face's normal —
  // matches THREE's computeVertexNormals on a NON-indexed (toNonIndexed'd) triangle soup, i.e. the
  // ribs/channels/stair/banner-parapet strips built by the original's stripTris()/trisGeo().
  function flatNormalsWIP(b) {
    const n = b.pos.length / 3;
    for (let i = 0; i < n; i += 3) {
      const ax = b.pos[i * 3], ay = b.pos[i * 3 + 1], az = b.pos[i * 3 + 2];
      const bx = b.pos[(i + 1) * 3], by = b.pos[(i + 1) * 3 + 1], bz = b.pos[(i + 1) * 3 + 2];
      const cx = b.pos[(i + 2) * 3], cy = b.pos[(i + 2) * 3 + 1], cz = b.pos[(i + 2) * 3 + 2];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { b.nor[(i + k) * 3] = nx; b.nor[(i + k) * 3 + 1] = ny; b.nor[(i + k) * 3 + 2] = nz; }
      if (!b.idx.length || b.idx[b.idx.length - 1] !== i + 2) { /* indices added lazily below */ }
    }
  }
  function finalizeBuf(b, mode) {
    if (!b.idx.length && mode !== 'points') for (let i = 0; i < b.pos.length / 3; i++) b.idx.push(i); // identity index for soups
    return { positions: Float32Array.from(b.pos), normals: Float32Array.from(b.nor), uv: Float32Array.from(b.uv), color: Float32Array.from(b.col), indices: mode === 'points' ? new Uint32Array(0) : Uint32Array.from(b.idx), mode: mode || 'triangles' };
  }
  // mergeBuffers(list): concatenate positions/normals/uv/color and renumber indices with the
  // correct offset — combines many small same-material parts into one draw-able buffer.
  function mergeBuffers(list) {
    const out = newBuf(); let mode = 'triangles';
    for (const g of list) {
      if (!g || !g.positions || !g.positions.length) continue;
      mode = g.mode || mode;
      const base = out.pos.length / 3;
      for (let i = 0; i < g.positions.length; i++) out.pos.push(g.positions[i]);
      for (let i = 0; i < g.normals.length; i++) out.nor.push(g.normals[i]);
      const cnt = g.positions.length / 3;
      if (g.uv && g.uv.length === cnt * 2) for (let i = 0; i < g.uv.length; i++) out.uv.push(g.uv[i]); else for (let i = 0; i < cnt; i++) out.uv.push(0, 0);
      if (g.color && g.color.length === cnt * 4) for (let i = 0; i < g.color.length; i++) out.col.push(g.color[i]); else for (let i = 0; i < cnt; i++) out.col.push(1, 1, 1, 1);
      if (g.indices && g.indices.length) for (let i = 0; i < g.indices.length; i++) out.idx.push(g.indices[i] + base);
    }
    return { positions: Float32Array.from(out.pos), normals: Float32Array.from(out.nor), uv: Float32Array.from(out.uv), color: Float32Array.from(out.col), indices: mode === 'points' ? new Uint32Array(0) : Uint32Array.from(out.idx), mode };
  }
  // shear + re-derive normals from an already-finalized buffer (used for the base.lean shear,
  // applied after the fact so every sub-builder can stay lean-agnostic).
  function applyShear(buf, lean) {
    if (!lean || !buf || !buf.positions.length) return buf;
    for (let i = 0; i < buf.positions.length; i += 3) buf.positions[i] += lean * buf.positions[i + 1];
    if (buf.mode === 'points') return buf;
    const n = buf.positions.length / 3, acc = new Float64Array(n * 3);
    if (buf.indices.length) for (let t = 0; t < buf.indices.length; t += 3) faceNormalAdd(buf.positions, acc, buf.indices[t], buf.indices[t + 1], buf.indices[t + 2]);
    else for (let i = 0; i < n; i += 3) faceNormalAdd(buf.positions, acc, i, i + 1, i + 2);
    for (let i = 0; i < n; i++) { const x = acc[i * 3], y = acc[i * 3 + 1], z = acc[i * 3 + 2], l = Math.hypot(x, y, z) || 1; buf.normals[i * 3] = x / l; buf.normals[i * 3 + 1] = y / l; buf.normals[i * 3 + 2] = z / l; }
    return buf;
  }
  // bake one instance's position/rotation (rotY then rotX, matching the original's M4's
  // Euler('YXZ') usage — see header note: rotX is only ever 0 or Math.PI in the source material,
  // so Y/X application order never actually matters there) into a COPY of a primitive buffer.
  function bakeInstance(prim, px, py, pz, rotY_, rotX_) {
    const n = prim.positions.length / 3, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let p = { x: prim.positions[i * 3], y: prim.positions[i * 3 + 1], z: prim.positions[i * 3 + 2] };
      let nv = { x: prim.normals[i * 3], y: prim.normals[i * 3 + 1], z: prim.normals[i * 3 + 2] };
      p = rotY(rotX(p, rotX_ || 0), rotY_ || 0); nv = rotY(rotX(nv, rotX_ || 0), rotY_ || 0);
      pos[i * 3] = p.x + px; pos[i * 3 + 1] = p.y + py; pos[i * 3 + 2] = p.z + pz;
      nor[i * 3] = nv.x; nor[i * 3 + 1] = nv.y; nor[i * 3 + 2] = nv.z;
    }
    return { positions: pos, normals: nor, uv: prim.uv.slice(), color: prim.color.slice(), indices: prim.indices.slice(), mode: prim.mode };
  }
  function bakeInstances(prim, list) { return mergeBuffers(list.map(it => bakeInstance(prim, it.x, it.y, it.z, it.rotY, it.rotX))); }
  function recolor(buf, r, g, bl, a) { const n = buf.color.length / 4; for (let i = 0; i < n; i++) { buf.color[i * 4] = r; buf.color[i * 4 + 1] = g; buf.color[i * 4 + 2] = bl; buf.color[i * 4 + 3] = a === undefined ? 1 : a; } return buf; }
  function hexToRGB(hex) { const n = parseInt(String(hex).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* ============================== canvas texture builders (ported, unwrapped) ================= */
  const NQDEF = NAQSH.def();
  const PAT_CACHE = new Map();
  function patCanvas(mode, pal, seed) {
    const key = mode + '|' + pal + '|' + seed;
    if (PAT_CACHE.has(key)) return PAT_CACHE.get(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    try { NAQSH.renderTo(cv.getContext('2d'), 512, { mode, params: Object.assign({}, NQDEF[mode], mode === 'bannai' ? { view: 'flat' } : mode === 'eslimi' ? { comp: 'wallpaper' } : mode === 'tongbori' ? { comp: 'wall' } : {}), pal, seed, b: 1 }); }
    catch (e) { const x = cv.getContext('2d'); x.fillStyle = '#888'; x.fillRect(0, 0, 512, 512); }
    PAT_CACHE.set(key, cv); return cv;
  }
  const WIN_TEX = {};
  function winTexCanvas(kind) {
    if (WIN_TEX[kind]) return WIN_TEX[kind];
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x = cv.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128); x.fillStyle = '#fff'; x.beginPath();
    if (kind === 'round') { x.arc(32, 64, 28, 0, Math.PI * 2); }
    else if (kind === 'slit') { x.rect(22, 8, 20, 112); }
    else { x.moveTo(6, 124); x.lineTo(6, 52); x.quadraticCurveTo(6, 14, 32, 4); x.quadraticCurveTo(58, 14, 58, 52); x.lineTo(58, 124); x.closePath(); }
    x.fill(); WIN_TEX[kind] = cv; return cv;
  }
  let _glyphTex = null;
  function twRngLocal(seed) { return RNG.mulberry32((seed >>> 0) || 1); }
  function glyphTexCanvas() {
    if (_glyphTex) return _glyphTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const x = cv.getContext('2d'), c = 256;
    x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round';
    for (const [r, w] of [[246, 6], [226, 2], [168, 3], [150, 1.5], [70, 3]]) { x.lineWidth = w; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke(); }
    const rr = twRngLocal(77);
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2; x.save(); x.translate(c + Math.cos(a) * 196, c + Math.sin(a) * 196); x.rotate(a + Math.PI / 2); x.lineWidth = 2.5; x.beginPath();
      const k = Math.floor(rr() * 4); if (k === 0) { x.moveTo(-7, -9); x.lineTo(7, 9); } else if (k === 1) { x.arc(0, 0, 7, 0, Math.PI * 1.4); } else if (k === 2) { x.moveTo(-8, 0); x.lineTo(8, 0); x.moveTo(0, -9); x.lineTo(0, 9); } else { x.moveTo(-6, 9); x.lineTo(0, -9); x.lineTo(6, 9); }
      x.stroke(); x.restore();
    }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.lineWidth = 1.5; x.beginPath(); x.moveTo(c + Math.cos(a) * 70, c + Math.sin(a) * 70); x.lineTo(c + Math.cos(a) * 150, c + Math.sin(a) * 150); x.stroke(); }
    _glyphTex = cv; return cv;
  }
  let _swirlTex = null;
  function swirlTexCanvas() {
    if (_swirlTex) return _swirlTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
    const g = x.createRadialGradient(128, 128, 4, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 4; k++) { x.lineWidth = 3 - k * 0.5; x.beginPath(); for (let i = 0; i < 120; i++) { const t = i / 120, a = t * 9 + k * Math.PI / 2, r = 6 + t * 110; i ? x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r) : x.moveTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } x.stroke(); }
    _swirlTex = cv; return cv;
  }
  let _dotTex = null;
  function dotTexCanvas() {
    if (_dotTex) return _dotTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); _dotTex = cv; return cv;
  }
  let _clothTex = null;
  function clothTexCanvas() {
    if (_clothTex) return _clothTex;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 256);
    x.fillStyle = '#e8c070'; x.fillRect(0, 10, 64, 5); x.fillRect(0, 22, 64, 2); x.fillRect(4, 0, 3, 256); x.fillRect(57, 0, 3, 256);
    x.strokeStyle = '#e8c070'; x.lineWidth = 3; x.beginPath(); x.arc(32, 190, 12, 0, Math.PI * 2); x.moveTo(32, 168); x.lineTo(32, 212); x.moveTo(18, 222); x.lineTo(46, 222); x.stroke();
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(i * 11, 0, 5, 256); }
    _clothTex = cv; return cv;
  }
  let _glyphStripTex = null;
  function glyphStripTexCanvas() {
    if (_glyphStripTex) return _glyphStripTex;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const x = cv.getContext('2d'), r = twRngLocal(19);
    x.fillStyle = '#000'; x.fillRect(0, 0, 512, 64); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 3; x.lineCap = 'round';
    x.fillRect(0, 4, 512, 3); x.fillRect(0, 57, 512, 3);
    for (let i = 0; i < 8; i++) {
      const ox = i * 64 + 14, oy = 16, g = 12;
      for (let k = 0; k < 4; k++) { const a = Math.floor(r() * 9), c = Math.floor(r() * 9); x.beginPath(); x.moveTo(ox + (a % 3) * g, oy + Math.floor(a / 3) * g); x.lineTo(ox + (c % 3) * g, oy + Math.floor(c / 3) * g); x.stroke(); }
      if (r() < 0.6) { x.beginPath(); x.arc(ox + g, oy + g, 5, 0, Math.PI * 2); x.stroke(); }
    }
    _glyphStripTex = cv; return cv;
  }
  let _cloudTex = null;
  function cloudTexCanvas() {
    if (_cloudTex) return _cloudTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'), r = twRngLocal(8);
    for (let i = 0; i < 14; i++) { const cx = 30 + r() * 68, cy = 40 + r() * 48, rr = 14 + r() * 26, g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
    _cloudTex = cv; return cv;
  }

  /* ============================== primitive geometry builders ============================== */
  // All primitives are authored with Y as "up" and local +Z as "outward" at angle 0, matching
  // at()'s x=sin,z=cos convention, so bakeInstance()'s rotY(angle) lines them up with placement.
  function boxGL2(w, h, d) {
    const b = newBuf(); const x = w / 2, y = h / 2, z = d / 2;
    const faces = [
      { n: [1, 0, 0], v: [[x, -y, -z], [x, -y, z], [x, y, z], [x, y, -z]] },
      { n: [-1, 0, 0], v: [[-x, -y, z], [-x, -y, -z], [-x, y, -z], [-x, y, z]] },
      { n: [0, 1, 0], v: [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]] },
      { n: [0, -1, 0], v: [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]] },
      { n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
      { n: [0, 0, -1], v: [[-x, -y, -z], [-x, y, -z], [x, y, -z], [x, -y, -z]] },
    ];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const f of faces) {
      const base = b.pos.length / 3;
      for (let i = 0; i < 4; i++) { const p = f.v[i]; pushVert(b, p[0], p[1], p[2], uvs[i][0], uvs[i][1]); b.nor[(base + i) * 3] = f.n[0]; b.nor[(base + i) * 3 + 1] = f.n[1]; b.nor[(base + i) * 3 + 2] = f.n[2]; }
      pushTri(b, base, base + 1, base + 2); pushTri(b, base, base + 2, base + 3);
    }
    return finalizeBuf(b);
  }
  function cylinderGL2(rTop, rBottom, height, seg, openEnded) {
    const b = newBuf(); const hy = height / 2; seg = seg || 16;
    for (let i = 0; i <= seg; i++) {
      const phi = i / seg * Math.PI * 2, s = Math.sin(phi), c = Math.cos(phi);
      pushVert(b, rTop * s, hy, rTop * c, i / seg, 1); pushVert(b, rBottom * s, -hy, rBottom * c, i / seg, 0);
    }
    for (let i = 0; i < seg; i++) { const A = i * 2, B = i * 2 + 1, D = (i + 1) * 2, C = (i + 1) * 2 + 1; pushTri(b, A, B, C); pushTri(b, A, C, D); }
    smoothNormalsWIP(b);
    if (!openEnded) {
      if (rBottom > 1e-4) {
        const ctr = pushVert(b, 0, -hy, 0, 0.5, 0.5); const ringStart = b.pos.length / 3;
        for (let i = 0; i <= seg; i++) { const phi = i / seg * Math.PI * 2; pushVert(b, rBottom * Math.sin(phi), -hy, rBottom * Math.cos(phi), 0.5 + 0.5 * Math.sin(phi), 0.5 + 0.5 * Math.cos(phi)); b.nor[(ringStart + i) * 3 + 1] = -1; }
        b.nor[ctr * 3 + 1] = -1;
        for (let i = 0; i < seg; i++) pushTri(b, ctr, ringStart + i, ringStart + i + 1);
      }
      if (rTop > 1e-4) {
        const ctr = pushVert(b, 0, hy, 0, 0.5, 0.5); const ringStart = b.pos.length / 3;
        for (let i = 0; i <= seg; i++) { const phi = i / seg * Math.PI * 2; pushVert(b, rTop * Math.sin(phi), hy, rTop * Math.cos(phi), 0.5 + 0.5 * Math.sin(phi), 0.5 + 0.5 * Math.cos(phi)); b.nor[(ringStart + i) * 3 + 1] = 1; }
        b.nor[ctr * 3 + 1] = 1;
        for (let i = 0; i < seg; i++) pushTri(b, ctr, ringStart + i + 1, ringStart + i);
      }
    }
    return finalizeBuf(b);
  }
  const coneGL2 = (r, height, seg, openEnded) => cylinderGL2(0, r, height, seg, openEnded);
  function sphereGL2(r, wSeg, hSeg) {
    const b = newBuf(); wSeg = wSeg || 16; hSeg = hSeg || 12;
    for (let j = 0; j <= hSeg; j++) {
      const v = j / hSeg, theta = v * Math.PI, sy = Math.sin(theta), cy = Math.cos(theta);
      for (let i = 0; i <= wSeg; i++) {
        const u = i / wSeg, phi = u * Math.PI * 2, sx = Math.sin(phi), cx = Math.cos(phi);
        const x = r * sy * sx, y = r * cy, z = r * sy * cx;
        const idx = pushVert(b, x, y, z, u, 1 - v); const l = Math.hypot(x, y, z) || 1;
        b.nor[idx * 3] = x / l; b.nor[idx * 3 + 1] = y / l; b.nor[idx * 3 + 2] = z / l;
      }
    }
    for (let j = 0; j < hSeg; j++) for (let i = 0; i < wSeg; i++) {
      const a = j * (wSeg + 1) + i, bb = a + 1, c = a + wSeg + 2, d = a + wSeg + 1;
      if (j > 0) pushTri(b, a, bb, d); if (j < hSeg - 1) pushTri(b, bb, c, d);
    }
    return finalizeBuf(b);
  }
  function icosphereGL2(r, detail) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => vNorm({ x: v[0], y: v[1], z: v[2] }));
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const d = Math.max(0, detail || 0);
    for (let pass = 0; pass < d; pass++) {
      const mid = {}, midOf = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (mid[k] !== undefined) return mid[k]; const m = vNorm({ x: (verts[a].x + verts[b].x) / 2, y: (verts[a].y + verts[b].y) / 2, z: (verts[a].z + verts[b].z) / 2 }); verts.push(m); return mid[k] = verts.length - 1; };
      const nf = [];
      for (const [a, bI, c] of faces) { const ab = midOf(a, bI), bc = midOf(bI, c), ca = midOf(c, a); nf.push([a, ab, ca], [bI, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      faces = nf;
    }
    // every vertex is shared across faces (indexed) -> smooth sphere-ish normals via position itself
    const buf = newBuf();
    for (const v of verts) { const idx = pushVert(buf, v.x * r, v.y * r, v.z * r, 0, 0); buf.nor[idx * 3] = v.x; buf.nor[idx * 3 + 1] = v.y; buf.nor[idx * 3 + 2] = v.z; }
    for (const f of faces) pushTri(buf, f[0], f[1], f[2]);
    return finalizeBuf(buf);
  }
  // torus lying FLAT in the XZ plane (local +Y = the ring's face normal at its own origin) — this
  // is the orientation every ring/halo/band torus in the original reaches after its own
  // .rotateX(Math.PI/2); authoring it flat up-front avoids re-deriving that rotation per caller.
  function torusFlatGL2(radius, tube, radialSeg, tubularSeg, arc) {
    const b = newBuf(); radialSeg = radialSeg || 8; tubularSeg = tubularSeg || 48; arc = arc === undefined ? Math.PI * 2 : arc;
    for (let j = 0; j <= radialSeg; j++) for (let i = 0; i <= tubularSeg; i++) {
      const u = i / tubularSeg * arc, v = j / radialSeg * Math.PI * 2;
      const cx = radius * Math.cos(u), cz = radius * Math.sin(u);
      const x = (radius + tube * Math.cos(v)) * Math.cos(u), z = (radius + tube * Math.cos(v)) * Math.sin(u), y = tube * Math.sin(v);
      const idx = pushVert(b, x, y, z, i / tubularSeg, j / radialSeg);
      const nvx = x - cx, nvy = y, nvz = z - cz, l = Math.hypot(nvx, nvy, nvz) || 1;
      b.nor[idx * 3] = nvx / l; b.nor[idx * 3 + 1] = nvy / l; b.nor[idx * 3 + 2] = nvz / l;
    }
    for (let j = 0; j < radialSeg; j++) for (let i = 0; i < tubularSeg; i++) {
      const a = j * (tubularSeg + 1) + i, bb = a + 1, c = a + tubularSeg + 2, d = a + tubularSeg + 1;
      pushTri(b, a, bb, c); pushTri(b, a, c, d);
    }
    return finalizeBuf(b);
  }
  function planeGL2(w, h, wSeg, hSeg) {
    const b = newBuf(); wSeg = wSeg || 1; hSeg = hSeg || 1;
    for (let j = 0; j <= hSeg; j++) for (let i = 0; i <= wSeg; i++) {
      const u = i / wSeg, v = j / hSeg; const idx = pushVert(b, (u - 0.5) * w, (0.5 - v) * h, 0, u, 1 - v);
      b.nor[idx * 3 + 2] = 1;
    }
    for (let j = 0; j < hSeg; j++) for (let i = 0; i < wSeg; i++) {
      const a = j * (wSeg + 1) + i, bb = a + 1, c = a + wSeg + 2, d = a + wSeg + 1; pushTri(b, a, bb, c); pushTri(b, a, c, d);
    }
    return finalizeBuf(b);
  }
  function circleGL2(r, seg) {
    const b = newBuf(); seg = seg || 32; const ctr = pushVert(b, 0, 0, 0, 0.5, 0.5); b.nor[2] = 1;
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; const idx = pushVert(b, r * Math.cos(a), r * Math.sin(a), 0, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)); b.nor[idx * 3 + 2] = 1; }
    for (let i = 0; i < seg; i++) pushTri(b, ctr, ctr + 1 + i, ctr + 2 + i);
    return finalizeBuf(b);
  }

  /* ============================== lathe / twist / strip (ported) ============================= */
  // latheGL2: a revolve of `points` ([r,y] pairs) around Y, n angular segments starting at phi0(n)
  // — a direct port of THREE.LatheGeometry(points, n, phi0(n)), whose own azimuth formula
  // (x=r*sin(phi), z=r*cos(phi)) already matches this file's at() convention.
  function latheGL2(points, n, weather, rnd) {
    n = n || 48; const b = newBuf();
    const ys = points.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const off = (weather !== undefined && rnd) ? rnd() * 100 : 0;
    const rows = points.length;
    for (let i = 0; i <= n; i++) {
      const phi = phi0(n) + i / n * Math.PI * 2, u = i / n;
      for (let j = 0; j < rows; j++) {
        const r = Math.max(0.001, points[j][0]), y = points[j][1], v = j / Math.max(1, rows - 1);
        const x = r * Math.sin(phi), z = r * Math.cos(phi);
        let col = [1, 1, 1, 1];
        if (weather !== undefined) {
          const streak = vnoise(phi * 9 + off) * vnoise(y * 0.15 + phi * 3 + off), grime = Math.pow(1 - (y - y0) / Math.max(0.01, y1 - y0), 4);
          const val = 1 - weather * (0.45 * streak + 0.25 * grime + 0.12 * vnoise(y * 1.7 + phi * 20));
          col = [val, val, val, 1];
        }
        pushVert(b, x, y, z, u, v, col[0], col[1], col[2], col[3]);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < rows - 1; j++) {
      const A = i * rows + j, D = i * rows + j + 1, B = (i + 1) * rows + j, C = (i + 1) * rows + j + 1;
      // A,B,C / A,C,D ring-to-ring quad (A=this col/this row, B=next col/this row, matching the
      // outward-winding convention verified on cylinderGL2's side wall)
      pushTri(b, A, B, C); pushTri(b, A, C, D);
    }
    smoothNormalsWIP(b);
    return finalizeBuf(b);
  }
  function twistBuffer(buf, y0, h, tw) {
    if (!tw) return buf;
    const n = buf.positions.length / 3;
    for (let i = 0; i < n; i++) {
      const x = buf.positions[i * 3], y = buf.positions[i * 3 + 1], z = buf.positions[i * 3 + 2];
      const a = tw * (y - y0) / h;
      buf.positions[i * 3] = x * Math.cos(a) + z * Math.sin(a); buf.positions[i * 3 + 2] = -x * Math.sin(a) + z * Math.cos(a);
    }
    const acc = new Float64Array(n * 3);
    if (buf.indices.length) for (let t = 0; t < buf.indices.length; t += 3) faceNormalAdd(buf.positions, acc, buf.indices[t], buf.indices[t + 1], buf.indices[t + 2]);
    for (let i = 0; i < n; i++) { const x = acc[i * 3], y = acc[i * 3 + 1], z = acc[i * 3 + 2], l = Math.hypot(x, y, z) || 1; if (l > 1e-6) { buf.normals[i * 3] = x / l; buf.normals[i * 3 + 1] = y / l; buf.normals[i * 3 + 2] = z / l; } }
    return buf;
  }
  // a strip that follows the tier outline at angle th: ribs, pilasters, glowing channels.
  function stripTrisGL2(T, y0, th, width, depth) {
    const N = 18, tw = (T.twist || 0) * Math.PI / 180, ring = [], b = newBuf();
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = th + tw * t, r = polyR(rAt(T, t), T.sides, a), y = y0 + t * T.h, d = width / 2 / Math.max(0.2, r);
      ring.push([at(r - 0.03, a - d, y), at(r + depth, a - d, y), at(r + depth, a + d, y), at(r - 0.03, a + d, y)]);
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
      const A = ring[i][k], B = ring[i][k + 1], C = ring[i + 1][k + 1], D = ring[i + 1][k];
      pushVert(b, A.x, A.y, A.z, 0, 0); pushVert(b, B.x, B.y, B.z, 0, 0); pushVert(b, C.x, C.y, C.z, 0, 0);
      pushVert(b, A.x, A.y, A.z, 0, 0); pushVert(b, C.x, C.y, C.z, 0, 0); pushVert(b, D.x, D.y, D.z, 0, 0);
    }
    flatNormalsWIP(b); b.idx = []; return finalizeBuf(b);
  }
  // extrude a simple (fan-triangulable) 2D point list [[x,y],...] by `depth` along local Z: front
  // cap + back cap (fan from vertex 0) + a quad-strip side wall. Faithful for the original's
  // convex/near-convex THREE.Shape+ExtrudeGeometry uses (fins, buttress flyers).
  function extrudeFanGL2(pts2d, depth) {
    const b = newBuf(), m = pts2d.length, hz = depth / 2;
    const front = [], back = [];
    for (let i = 0; i < m; i++) front.push(pushVert(b, pts2d[i][0], pts2d[i][1], hz, 0, 0, 1, 1, 1, 1));
    for (let i = 0; i < m; i++) back.push(pushVert(b, pts2d[i][0], pts2d[i][1], -hz, 0, 0, 1, 1, 1, 1));
    for (let i = 0; i < m; i++) { b.nor[front[i] * 3 + 2] = 1; b.nor[back[i] * 3 + 2] = -1; }
    for (let i = 1; i < m - 1; i++) { pushTri(b, front[0], front[i], front[i + 1]); pushTri(b, back[0], back[i + 1], back[i]); }
    // side walls use a separate normal pass below (sides need their own smoothed normals)
    const sideStart = b.pos.length / 3, sideIdxBase = b.idx.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const a = pushVert(b, pts2d[i][0], pts2d[i][1], hz, 0, 0), d = pushVert(b, pts2d[i][0], pts2d[i][1], -hz, 0, 1);
      const bb = pushVert(b, pts2d[j][0], pts2d[j][1], hz, 1, 0), c = pushVert(b, pts2d[j][0], pts2d[j][1], -hz, 1, 1);
      pushTri(b, a, d, c); pushTri(b, a, c, bb);
    }
    // recompute normals ONLY for the side-wall vertices (front/back caps already set above). The
    // side verts are INDEXED (4 new verts + 2 triangles per quad, not a plain consecutive-triple
    // soup), so this must go through the index-aware smoothNormalsWIP, not flatNormalsWIP.
    const sideBuf = { pos: b.pos.slice(sideStart * 3), nor: new Array((b.pos.length - sideStart * 3)).fill(0), uv: [], col: [], idx: b.idx.slice(sideIdxBase).map(i => i - sideStart) };
    smoothNormalsWIP(sideBuf);
    for (let i = 0; i < sideBuf.nor.length; i++) b.nor[sideStart * 3 + i] = sideBuf.nor[i];
    return finalizeBuf(b);
  }

  /* ============================== radius-at-height (ported) ============================== */
  function radiusAtY(info, y) {
    for (const p of info.profile) if (y >= p.y0 && y <= p.y1) return rAt(p.T, (y - p.y0) / Math.max(0.01, p.y1 - p.y0));
    const p = info.profile[0]; return p ? (y < p.y0 ? p.T.r0 : rAt(info.profile[info.profile.length - 1].T, 1)) : 1;
  }
  // Catmull-Rom sampler over an array of {x,y,z} control points (replaces THREE.CatmullRomCurve3).
  function catmullRom3(pts, t) {
    const n = pts.length, p = t * (n - 1), i1 = Math.min(n - 2, Math.max(0, Math.floor(p))), f = p - i1;
    const i0 = Math.max(0, i1 - 1), i2 = Math.min(n - 1, i1 + 1), i3 = Math.min(n - 1, i1 + 2);
    const P0 = pts[i0], P1 = pts[i1], P2 = pts[i2], P3 = pts[i3];
    const h00 = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    return { x: h00(P0.x, P1.x, P2.x, P3.x), y: h00(P0.y, P1.y, P2.y, P3.y), z: h00(P0.z, P1.z, P2.z, P3.z) };
  }

  /* ============================== body builder ============================== */
  // pushPart: the shared accumulator every body/aura feature routes through. `tex` (when given)
  // is {canvas,label,key} — same-key textures merge into one part; everything else merges by tag.
  function makePartStore() { return { buckets: new Map() }; }
  function pushPart(store, tag, buf, tex) {
    if (!buf || !buf.positions || !buf.positions.length) return;
    const key = tex ? tag + '|' + tex.key : tag;
    let e = store.buckets.get(key);
    if (!e) { e = { tag, mode: buf.mode, texture: tex ? { canvas: tex.canvas, label: tex.label } : null, list: [] }; store.buckets.set(key, e); }
    e.list.push(buf);
  }

  function buildBodyGL2(s, rnd, store, lean) {
    const L = s.look, w = L.weather;
    const add = (tag, buf, tex) => pushPart(store, tag, applyShear(buf, lean), tex);
    const resolve = (mat, glowAs) => mat === 'glow' ? (glowAs || 'body') : mat;
    let y = 0;
    const T0 = s.tiers[0] || TIER_DEF, n0 = T0.sides;
    const B = s.base;
    if (B.kind !== 'none' && s.tiers.length) {
      const R = T0.r0 * B.spread;
      const bodyTag = resolve(T0.mat, 'body');
      if (B.kind === 'plinth') {
        const bb = boxGL2(R * 2, B.h * 0.85, R * 2); for (let i = 1; i < bb.positions.length; i += 3) bb.positions[i] += B.h * 0.425;
        const tb = boxGL2(R * 2.12, B.h * 0.15, R * 2.12); for (let i = 1; i < tb.positions.length; i += 3) tb.positions[i] += B.h * 0.925;
        add(bodyTag, mergeBuffers([bb, tb]));
      } else if (B.kind === 'steps') {
        const k = 3, list = [];
        for (let i = 0; i < k; i++) { const r = R * (1 - i * 0.13); list.push(latheGL2([[0, B.h * i / k], [r, B.h * i / k], [r, B.h * (i + 1) / k], [0, B.h * (i + 1) / k]], n0)); }
        add(bodyTag, mergeBuffers(list));
      } else if (B.kind === 'buried') {
        const R2 = R * 1.5, pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([T0.r0 * 0.98 + (R2 - T0.r0) * (1 - t), B.h * Math.pow(Math.sin(Math.PI / 2 * t), 0.8)]); }
        const g = latheGL2(pts, 64), off = rnd() * 50, n = g.positions.length / 3;
        for (let i = 0; i < n; i++) {
          const x = g.positions[i * 3], y2 = g.positions[i * 3 + 1], z = g.positions[i * 3 + 2], a = Math.atan2(x, z);
          const k = 1 + 0.12 * (vnoise(a * 3 + off) - 0.5), yy = y2 * (0.8 + 0.35 * vnoise(a * 2 + off + 7));
          g.positions[i * 3] = x * k; g.positions[i * 3 + 1] = Math.min(yy, B.h); g.positions[i * 3 + 2] = z * k;
        }
        const groundCol = lerp3(hexToRGB((TW_SKIES[L.sky] || TW_SKIES.dusk).ground), hexToRGB(L.body), 0.35);
        for (let i = 0; i < n; i++) { g.color[i * 4] = groundCol[0]; g.color[i * 4 + 1] = groundCol[1]; g.color[i * 4 + 2] = groundCol[2]; g.color[i * 4 + 3] = 1; }
        add('rock', g);
      } else if (B.kind === 'crag') {
        const off = rnd() * 40, list = [];
        const rock = (rx, ry, ox, oz, yb) => {
          const g = icosphereGL2(1, 2), n = g.positions.length / 3;
          for (let i = 0; i < n; i++) {
            const x = g.positions[i * 3], y2 = g.positions[i * 3 + 1], z = g.positions[i * 3 + 2];
            const nz2 = 0.75 + 0.5 * vnoise(x * 2.3 + off) * vnoise(z * 2.1 + y2 * 1.7 + off);
            g.positions[i * 3] = x * nz2 * rx + ox; g.positions[i * 3 + 1] = Math.max(-0.2, y2) * nz2 * ry + yb; g.positions[i * 3 + 2] = z * nz2 * rx + oz;
          }
          const acc = new Float64Array(n * 3); for (let t = 0; t < g.indices.length; t += 3) faceNormalAdd(g.positions, acc, g.indices[t], g.indices[t + 1], g.indices[t + 2]);
          for (let i = 0; i < n; i++) { const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1; g.normals[i * 3] = acc[i * 3] / l; g.normals[i * 3 + 1] = acc[i * 3 + 1] / l; g.normals[i * 3 + 2] = acc[i * 3 + 2] / l; }
          return g;
        };
        list.push(rock(R * 1.15, B.h * 1.05, 0, 0, 0));
        for (let i = 0; i < 4; i++) { const a = rnd() * 6.28, d = R * (0.8 + rnd() * 0.6); list.push(rock(R * (0.35 + rnd() * 0.35), B.h * (0.35 + rnd() * 0.45), Math.sin(a) * d, Math.cos(a) * d, 0)); }
        add('rock', recolor(mergeBuffers(list), ...hexToRGB(L.dark), 1));
      } else {
        const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([T0.r0 + (R - T0.r0) * Math.pow(1 - t, 2.4), t * B.h]); }
        add(bodyTag, latheGL2(pts, n0, w, rnd));
        if (B.fins) {
          const shape = [[T0.r0 * 0.85, B.h * 1.25], [R * 1.18, 0], [T0.r0 * 0.85, 0]];
          const depth = Math.max(0.3, T0.r0 * 0.16);
          // fin shape authored in (radial-outward, up) local axes, then extruded along the tangent
          // axis, then swung onto the tower's local Z=out convention per-instance below.
          const finPts = shape.map(([rr, yy]) => [rr, yy]); // (x=radial, y=up) prior to rotateY(-90°)
          const finPrim0 = extrudeFanGL2(finPts, depth);
          // original: fg.rotateY(-PI/2) maps local X(radial)->local -Z(forward); do that once here.
          const n = finPrim0.positions.length / 3;
          for (let i = 0; i < n; i++) { const p = rotY({ x: finPrim0.positions[i * 3], y: finPrim0.positions[i * 3 + 1], z: finPrim0.positions[i * 3 + 2] }, -Math.PI / 2); finPrim0.positions[i * 3] = p.x; finPrim0.positions[i * 3 + 1] = p.y; finPrim0.positions[i * 3 + 2] = p.z;
            const nv = rotY({ x: finPrim0.normals[i * 3], y: finPrim0.normals[i * 3 + 1], z: finPrim0.normals[i * 3 + 2] }, -Math.PI / 2); finPrim0.normals[i * 3] = nv.x; finPrim0.normals[i * 3 + 1] = nv.y; finPrim0.normals[i * 3 + 2] = nv.z; }
          const list = []; for (let i = 0; i < B.fins; i++) { const a = (B.fins === n0 ? phi0(n0) : 0) + i * Math.PI * 2 / B.fins; list.push({ x: 0, y: 0, z: 0, rotY: a }); }
          add(bodyTag, recolor(bakeInstances(finPrim0, list), ...hexToRGB(L[bodyTag] || L.body), 1));
        }
      }
      y = B.kind === 'buried' ? 0 : B.kind === 'crag' ? B.h * 0.82 : B.h;
    }
    const profile = [];
    s.tiers.forEach((T) => {
      const y0 = y, n = T.sides, tw = (T.twist || 0) * Math.PI / 180, N = 20, pts = [];
      for (let i = 0; i <= N; i++) pts.push([rAt(T, i / N), y0 + T.h * i / N]);
      const g = twistBuffer(latheGL2(pts, n, T.pat === 'none' ? w : w * 0.5, rnd), y0, T.h, tw);
      const tag = T.pat !== 'none' && NAQSH.MODES[T.pat] ? 'pattern' : (T.mat === 'glow' ? 'glow' : T.mat);
      if (tag === 'pattern') {
        const cv = patCanvas(T.pat, T.pal, s.seed);
        const circ = 2 * Math.PI * (T.r0 + T.r1) / 2, repU = Math.max(1, Math.round(circ / T.tile)), repV = Math.max(0.2, T.h / T.tile);
        const n2 = g.positions.length / 3;
        for (let i = 0; i < n2; i++) { g.uv[i * 2] *= repU; g.uv[i * 2 + 1] *= repV; }
        const tint = lerp3([1, 1, 1], hexToRGB(T.mat === 'accent' ? L.accent : T.mat === 'dark' ? L.dark : T.mat === 'glow' ? L.glow : L.body), T.mat === 'accent' ? 0.55 : T.mat === 'glow' ? 1 : 0.15);
        for (let i = 0; i < n2; i++) { g.color[i * 4] = tint[0]; g.color[i * 4 + 1] = tint[1]; g.color[i * 4 + 2] = tint[2]; }
        add('pattern', g, { canvas: cv, label: 'naqsh:' + T.pat + '|' + T.pal + '|' + s.seed, key: T.pat + '|' + T.pal + '|' + s.seed });
      } else {
        add(tag, g);
      }
      const rTop = rAt(T, 1);
      add(resolve(T.mat, 'dark'), twistBuffer(latheGL2([[0, y0 + T.h], [rTop, y0 + T.h]], n), y0, T.h, tw));
      if (T.ribs > 0) {
        const wid = Math.min(0.7, 2 * Math.PI * Math.min(T.r0, T.r1) / T.ribs * 0.32), list = [];
        for (let k = 0; k < T.ribs; k++) list.push(stripTrisGL2(T, y0, (T.ribs === n ? phi0(n) : 0) + k * Math.PI * 2 / T.ribs, wid, T.ribD));
        add(resolve(T.mat, 'dark'), mergeBuffers(list));
      }
      if (T.chan > 0) {
        const list = []; for (let k = 0; k < T.chan; k++) list.push(stripTrisGL2(T, y0, k * Math.PI * 2 / T.chan, 0.2, 0.05));
        add('glow', mergeBuffers(list));
      }
      if (T.winRows > 0) {
        const rowH = T.h / T.winRows;
        const wh = T.winKind === 'round' ? rowH * 0.42 : T.winKind === 'slit' ? rowH * 0.62 : rowH * 0.58;
        const ww0 = T.winKind === 'round' ? wh : T.winKind === 'slit' ? wh * 0.32 : wh * 0.5;
        const plane = planeGL2(1, 1); const insts = [];
        for (let rI = 0; rI < T.winRows; rI++) {
          const t = (rI + 0.5) / T.winRows, rr = rAt(T, t), ww = Math.min(ww0, 2 * Math.PI * rr / T.winPer * 0.55);
          for (let k = 0; k < T.winPer; k++) {
            const a = (k + (rI % 2 && T.winPer > 1 ? 0.5 : 0)) * Math.PI * 2 / T.winPer + tw * t, r = polyR(rr, n, a) + 0.04;
            const p = at(r, a, y0 + t * T.h); insts.push({ x: p.x, y: p.y, z: p.z, rotY: a, scale: [ww, wh, 1] });
          }
        }
        const merged = mergeBuffers(insts.map(it => { const s2 = { positions: plane.positions.map((v, i) => v * (i % 3 === 0 ? it.scale[0] : i % 3 === 1 ? it.scale[1] : it.scale[2])), normals: plane.normals, uv: plane.uv, color: plane.color, indices: plane.indices, mode: plane.mode }; return bakeInstance(s2, it.x, it.y, it.z, it.rotY, 0); }));
        const cv = winTexCanvas(T.winKind);
        add(T.winGlow ? 'windowGlow' : 'window', recolor(merged, ...hexToRGB(T.winGlow ? L.glow : '#0d0907'), 1), { canvas: cv, label: 'window:' + T.winKind, key: T.winKind });
      }
      addBandGL2(T, y0 + T.h, rTop, n, add);
      if (T.stair > 0) addStairGL2(T, y0, resolve(T.mat, 'body'), add);
      if (T.banN > 0) addBannersGL2(T, y0 + T.h, rTop, n, rnd, add);
      if (T.butN > 0) addButtressesGL2(T, y0, resolve(T.mat === 'accent' ? 'glow' : T.mat, 'body'), add);
      if (T.spN > 0) {
        const hh = T.spH * T.h, rr = T.spR, shaftPrim = cylinderGL2(rr, rr * 1.08, hh, 16), capPrim = coneGL2(rr * 1.15, rr * 2.2, 16), ballPrim = sphereGL2(rr * 0.28, 12, 8);
        const sh = [], cap = [], ball = [];
        for (let k = 0; k < T.spN; k++) {
          const a = (k + 0.5) * Math.PI * 2 / T.spN, R2 = polyR(T.r0, n, a) + rr * 0.85;
          let p = at(R2, a, y0 + hh / 2); sh.push({ x: p.x, y: p.y, z: p.z, rotY: a });
          p = at(R2, a, y0 + hh + rr * 1.1); cap.push({ x: p.x, y: p.y, z: p.z, rotY: a });
          p = at(R2, a, y0 + hh + rr * 2.35); ball.push({ x: p.x, y: p.y, z: p.z, rotY: 0 });
        }
        add(resolve(T.mat, 'body'), bakeInstances(shaftPrim, sh));
        add('accent', recolor(bakeInstances(capPrim, cap), ...hexToRGB(L.accent), 1));
        add('accent', recolor(bakeInstances(ballPrim, ball), ...hexToRGB(L.accent), 1));
      }
      profile.push({ y0, y1: y0 + T.h, T });
      y += T.h;
    });
    const H = y, TL = s.tiers[s.tiers.length - 1] || TIER_DEF, rTop = rAt(TL, 1), nT = TL.sides;
    const crownTop = addCrownGL2(s, H, rTop, nT, rnd, add);
    return { H, top: crownTop, rTop, profile };
  }

  function addStairGL2(T, y0, tag, add) {
    const turns = T.stair, N = Math.max(12, Math.round(turns * 40)), w = Math.max(0.8, Math.min(2.4, Math.min(T.r0, T.r1) * 0.38)), b = newBuf();
    const quad = (A, B, C, D) => { pushVert(b, A.x, A.y, A.z, 0, 0); pushVert(b, B.x, B.y, B.z, 0, 0); pushVert(b, C.x, C.y, C.z, 0, 0); pushVert(b, A.x, A.y, A.z, 0, 0); pushVert(b, C.x, C.y, C.z, 0, 0); pushVert(b, D.x, D.y, D.z, 0, 0); };
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N, a0 = t0 * turns * Math.PI * 2, a1 = t1 * turns * Math.PI * 2, y = y0 + t0 * T.h * 0.92, yN = y0 + t1 * T.h * 0.92;
      const r0 = polyR(rAt(T, t0), T.sides, a0) - 0.05, r1 = polyR(rAt(T, t1), T.sides, a1) - 0.05;
      const A = at(r0, a0, y), B2 = at(r0 + w, a0, y), C = at(r1 + w, a1, y), D = at(r1, a1, y);
      quad(A, B2, C, D);
      const U = at(r1, a1, yN), V = at(r1 + w, a1, yN); quad(D, C, V, U);
      const P0 = at(r0 + w, a0, y - 0.35), P1 = at(r1 + w, a1, y - 0.35), Q0 = at(r0 + w, a0, y + 0.75), Q1 = at(r1 + w, a1, yN + 0.75); quad(P0, P1, Q1, Q0);
      const S0 = at(r0, a0, y - 0.35), S1 = at(r1, a1, y - 0.35); quad(S0, S1, P1, P0);
    }
    flatNormalsWIP(b); b.idx = []; add(tag, finalizeBuf(b));
  }
  function addBannersGL2(T, y1, rt, n, rnd, add) {
    const k = T.banN, len = T.banLen, wdt = Math.max(0.4, Math.min(1.6, 2 * Math.PI * rt / k * 0.45)), list = [];
    for (let i = 0; i < k; i++) {
      const a = (i + 0.5) * Math.PI * 2 / k, r = polyR(rt, n, a) + 0.18 + (T.band === 'balcony' ? T.bandSize * 1.25 : T.band !== 'none' ? T.bandSize * 0.4 : 0);
      const g = planeGL2(wdt, len, 1, 14);
      const cnt = g.positions.length / 3;
      for (let j = 0; j < cnt; j++) g.positions[j * 3 + 1] -= len / 2; // original: g.translate(0,-len/2,0)
      const pos = at(r, a, y1 - 0.1);
      list.push(bakeInstance(g, pos.x, pos.y - 0.0, pos.z, a, 0));
    }
    add('cloth', mergeBuffers(list), { canvas: clothTexCanvas(), label: 'cloth', key: 'cloth' });
  }
  function addButtressesGL2(T, y0, tag, add) {
    const k = T.butN, reach = T.butR, yp = y0 + T.h * 0.5, yw = y0 + T.h * 0.85, th = Math.max(0.5, T.h * 0.05), dep = Math.max(0.5, Math.min(T.r0, T.r1) * 0.14);
    const rw = Math.min(T.r0, T.r1) * 0.95, R = Math.max(T.r0, T.r1) + reach;
    const pts = [[R - 0.4, yp + th], [rw, yw + th * 0.6], [rw, yw - th * 1.2]];
    for (let i = 1; i <= 10; i++) { const u = i / 10, x = rw + (R - 0.4 - rw) * u, yy = (yw - th * 1.2) + ((yp - th) - (yw - th * 1.2)) * u - Math.sin(Math.PI * u) * th * 1.4; pts.push([x, yy]); }
    const flyerPrim = extrudeFanGL2(pts, dep);
    const pierH = yp + th * 2.2, pw = Math.max(0.8, dep * 1.6);
    const pierPrim = boxGL2(pw, pierH, pw), capPrim = coneGL2(pw * 0.75, pw * 2.4, 4);
    const flyers = [], piers = [], caps = [];
    for (let i = 0; i < k; i++) {
      const a = (i + 0.5) * Math.PI * 2 / k;
      flyers.push({ x: 0, y: 0, z: 0, rotY: a - Math.PI / 2 });
      let p = at(R, a, pierH / 2); piers.push({ x: p.x, y: p.y, z: p.z, rotY: a });
      p = at(R, a, pierH + pw * 1.2); caps.push({ x: p.x, y: p.y, z: p.z, rotY: a + Math.PI / 4 });
    }
    add(tag, mergeBuffers([bakeInstances(flyerPrim, flyers), bakeInstances(pierPrim, piers), bakeInstances(capPrim, caps)]));
  }
  function addBandGL2(T, y1, rt, n, add) {
    const s = T.bandSize, circ = 2 * Math.PI * rt, tag = T.mat === 'glow' ? 'body' : T.mat;
    switch (T.band) {
      case 'ring': { const pts = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 10; pts.push([rt + Math.cos(a) * s * 0.35, y1 + Math.sin(a) * s * 0.35]); } add(tag, latheGL2(pts, n)); break; }
      case 'balcony': {
        const o = s * 1.25;
        add(tag, latheGL2([[rt - 0.02, y1 - 0.18], [rt + o, y1 - 0.18], [rt + o, y1 + 0.12], [rt + o, y1 + 0.12 + s * 0.85], [rt + o - 0.14, y1 + 0.12 + s * 0.85], [rt + o - 0.14, y1 + 0.12], [rt - 0.02, y1 + 0.12]], n));
        const k = Math.max(6, Math.round(circ / Math.max(0.6, s * 1.4))), prim = coneGL2(o * 0.32, s, 4), list = [];
        for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, R = polyR(rt, n, a) + o * 0.55, p = at(R, a, y1 - 0.18 - s * 0.5); list.push({ x: p.x, y: p.y, z: p.z, rotY: a, rotX: Math.PI }); }
        add(tag, bakeInstances(prim, list)); break;
      }
      case 'corbel': {
        add(tag, latheGL2([[rt - 0.02, y1 - s * 1.6], [rt + s * 0.22, y1 - s * 1.6], [rt + s * 0.22, y1 - s * 1.05], [rt + s * 0.5, y1 - s * 1.05], [rt + s * 0.5, y1 - s * 0.5], [rt + s * 0.8, y1 - s * 0.5], [rt + s * 0.8, y1], [rt - 0.02, y1]], n));
        const k = Math.max(8, Math.round(circ / Math.max(0.4, s * 0.8))), prim = planeGL2(s * 0.28, s * 0.45), list = [];
        for (let i = 0; i < k; i++) { const a = (i + 0.5) * Math.PI * 2 / k, R = polyR(rt, n, a) + s * 0.52, p = at(R, a, y1 - s * 0.78); list.push({ x: p.x, y: p.y, z: p.z, rotY: a }); }
        add('window', recolor(bakeInstances(prim, list), 0.102, 0.071, 0.063, 1), { canvas: winTexCanvas('arch'), label: 'window:arch', key: 'arch' }); break;
      }
      case 'beads': {
        add(tag, latheGL2([[rt - 0.02, y1 - s * 1.25], [rt + s * 0.12, y1 - s * 1.25], [rt + s * 0.12, y1], [rt - 0.02, y1]], n));
        const k = Math.max(6, Math.round(circ / (s * 1.25))), prim = torusFlatGL2(0.42 * s, 0.09 * s, 8, 24), list = [];
        for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, R = polyR(rt, n, a) + s * 0.16, p = at(R, a, y1 - s * 0.62); list.push({ x: p.x, y: p.y, z: p.z, rotY: a }); }
        add('accent', bakeInstances(prim, list)); break;
      }
      case 'crenel': {
        const k = Math.max(6, Math.round(circ / (s * 1.3))), prim = boxGL2(s * 0.65, s, s * 0.4), list = [];
        for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, R = polyR(rt, n, a) - s * 0.2, p = at(R, a, y1 + s * 0.5); list.push({ x: p.x, y: p.y, z: p.z, rotY: a }); }
        add(tag, bakeInstances(prim, list)); break;
      }
      case 'glyphs': {
        add('dark', latheGL2([[rt - 0.02, y1 - s * 1.3], [rt + 0.08, y1 - s * 1.3], [rt + 0.08, y1], [rt - 0.02, y1]], n));
        const g = latheGL2([[rt + 0.1, y1 - s * 1.25], [rt + 0.1, y1 - s * 0.05]], n), repU = Math.max(1, Math.round(circ / (s * 6)));
        for (let i = 0; i < g.uv.length; i += 2) g.uv[i] *= repU;
        add('glowTex', g, { canvas: glyphStripTexCanvas(), label: 'glyphStrip', key: 'glyphStrip' }); break;
      }
      case 'drops': {
        add('accent', latheGL2([[rt - 0.02, y1 - s * 0.5], [rt + s * 0.25, y1 - s * 0.5], [rt + s * 0.25, y1], [rt - 0.02, y1]], n));
        const k = Math.max(6, Math.round(circ / (s * 1.5))), conePrim = coneGL2(s * 0.2, s * 1.3, 10), ballPrim = sphereGL2(s * 0.22, 10, 8), cs = [], bs = [];
        for (let i = 0; i < k; i++) { const a = (i + 0.5) * Math.PI * 2 / k, R = polyR(rt, n, a) + s * 0.18; let p = at(R, a, y1 - s * 1.25); cs.push({ x: p.x, y: p.y, z: p.z, rotY: a, rotX: Math.PI }); p = at(R, a, y1 - s * 0.62); bs.push({ x: p.x, y: p.y, z: p.z, rotY: a }); }
        add('accent', mergeBuffers([bakeInstances(conePrim, cs), bakeInstances(ballPrim, bs)])); break;
      }
    }
  }
  function addCrownGL2(s, H, rt, n, rnd, add) {
    const C = s.crown, h = C.h, tag = C.mat === 'glow' ? 'glow' : C.mat; let top = H;
    switch (C.kind) {
      case 'flat': add(tag, latheGL2([[0, H + 0.25], [rt * 1.04, H + 0.25], [rt * 1.04, H], [rt, H]], n)); top = H + 0.25; break;
      case 'dome': { const pts = []; for (let i = 0; i <= 18; i++) { const a = Math.PI / 2 * i / 18; pts.push([rt * 0.97 * Math.cos(a), H + h * Math.sin(a)]); } add(tag, latheGL2(pts, 48)); top = H + h; break; }
      case 'onion': { const P = [[1, 0], [1.12, 0.14], [1.16, 0.3], [1.02, 0.48], [0.72, 0.66], [0.4, 0.82], [0.14, 0.94], [0.02, 1]]; add(tag, latheGL2(P.map(([r, yy]) => [r * rt * 0.88, H + yy * h]), 48)); top = H + h; break; }
      case 'cone': add(tag, latheGL2([[rt * 1.06, H], [0.02, H + h]], n || 48)); top = H + h; break;
      case 'spire': {
        add(tag, latheGL2([[rt * 0.55, H], [rt * 0.42, H + h * 0.08], [0.02, H + h]], n || 24));
        const list = [];
        for (let i = 1; i <= 3; i++) { const yy = H + h * i * 0.18, r = rt * 0.42 * (1 - i * 0.18); list.push(bakeInstance(torusFlatGL2(r + 0.06, 0.08 + rt * 0.02, 8, 32), 0, yy, 0, 0, 0)); }
        add('accent', mergeBuffers(list)); top = H + h; break;
      }
      case 'spikes': {
        add(tag, latheGL2([[0, H + 0.2], [rt * 1.08, H + 0.2], [rt * 1.08, H], [rt, H]], n));
        const k = Math.max(6, Math.round(rt * 3)), list = [];
        for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, hh = h * (i % 2 ? 0.28 : 0.5) * (0.8 + rnd() * 0.4); const prim = coneGL2(Math.max(0.08, rt * 0.08), hh, 8); const p = at(rt * 0.92, a, H + 0.2 + hh / 2); list.push(bakeInstance(prim, p.x, p.y, p.z, a, 0)); }
        list.push(bakeInstance(coneGL2(Math.max(0.12, rt * 0.16), h, 10), 0, H + 0.2 + h / 2, 0, 0, 0));
        add(tag, mergeBuffers(list)); top = H + 0.2 + h; break;
      }
      case 'crenel': {
        add(tag, latheGL2([[0, H + 0.2], [rt, H + 0.2], [rt, H]], n));
        const k = Math.max(6, Math.round(2 * Math.PI * rt / Math.max(0.6, h * 0.9))), prim = boxGL2(h * 0.55, h * 0.8, h * 0.3), list = [];
        for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, R = polyR(rt, n, a) - h * 0.15, p = at(R, a, H + 0.2 + h * 0.4); list.push({ x: p.x, y: p.y, z: p.z, rotY: a }); }
        add(tag, bakeInstances(prim, list)); top = H + h; break;
      }
      case 'lantern': {
        add(tag, latheGL2([[0, H + 0.2], [rt * 1.05, H + 0.2], [rt * 1.05, H], [rt, H]], n));
        const k = 8, ch = h * 0.55, prim = cylinderGL2(rt * 0.07 + 0.05, rt * 0.07 + 0.05, ch, 10), list = [];
        for (let i = 0; i < k; i++) { const a = i * Math.PI * 2 / k, p = at(rt * 0.82, a, H + 0.2 + ch / 2); list.push({ x: p.x, y: p.y, z: p.z, rotY: a }); }
        add(tag, bakeInstances(prim, list));
        add(tag, latheGL2([[0, H + 0.2 + ch], [rt, H + 0.2 + ch], [rt, H + 0.45 + ch]].concat(Array.from({ length: 13 }, (_, i) => { const a = Math.PI / 2 * i / 12; return [rt * 0.9 * Math.cos(a), H + 0.45 + ch + h * 0.45 * Math.sin(a)]; })), 48));
        add('glow', bakeInstance(sphereGL2(rt * 0.45, 24, 16), 0, H + 0.2 + ch * 0.5, 0, 0, 0));
        top = H + 0.45 + ch + h * 0.45; break;
      }
      case 'crescent': {
        add(tag, latheGL2([[0, H + 0.2], [rt * 1.05, H + 0.2], [rt * 1.05, H], [rt, H]], n));
        const R = Math.max(rt * 1.2, h * 0.5), tube = Math.max(0.3, rt * 0.42), arc = Math.PI * 1.4, seg = 7, gap = 0.035, list = [];
        for (let i = 0; i < seg; i++) {
          const a0 = -Math.PI / 2 - arc / 2 + arc * i / seg + gap, a1 = -Math.PI / 2 - arc / 2 + arc * (i + 1) / seg - gap;
          const tube2 = tube * (1 - Math.abs(i - (seg - 1) / 2) / seg * 0.6);
          const prim = torusFlatGL2(R, tube2, 6, 10, a1 - a0);
          // rotateZ(a0) then the whole thing sits in the XZ "flat" plane already (crescent is meant
          // to stand upright facing +Z like the crown body, so swing it 90° about X first, matching
          // the original's torus -> rotateZ chain being applied inside an XY-plane torus; approximated
          // here by rotating the flat torus's arc segment about its own local Y via rotateZ-equivalent
          // using the generic axis-angle helper on the Y axis (up), which keeps it in a vertical plane.
          const n2 = prim.positions.length / 3;
          for (let i2 = 0; i2 < n2; i2++) {
            let p = { x: prim.positions[i2 * 3], y: prim.positions[i2 * 3 + 1], z: prim.positions[i2 * 3 + 2] };
            p = rotX(p, Math.PI / 2); p = rotZ(p, a0);
            prim.positions[i2 * 3] = p.x; prim.positions[i2 * 3 + 1] = p.y; prim.positions[i2 * 3 + 2] = p.z;
          }
          list.push(bakeInstance(prim, 0, H + 0.2 + R - tube * 0.2, 0, 0, 0));
        }
        add(tag, mergeBuffers(list)); top = H + R * 2; break;
      }
      case 'gothic': {
        add(tag, latheGL2([[0, H + 0.3], [rt * 1.04, H + 0.3], [rt * 1.04, H], [rt, H]], n));
        const list = []; list.push(latheGL2([[rt * 0.55, H + 0.3], [rt * 0.5, H + 0.3 + h * 0.12], [rt * 0.42, H + 0.3 + h * 0.12], [0.03, H + 0.3 + h]], 8));
        const k = n >= 4 ? n : 8, crk = []; const shaftPrim = boxGL2(rt * 0.14 + 0.1, 1, rt * 0.14 + 0.1), conePrim = coneGL2(rt * 0.1 + 0.08, 1, 4);
        for (let i = 0; i < k; i++) {
          const a = phi0(k) + i * Math.PI * 2 / k, R2 = polyR(rt, n, a) * 0.86, ph = h * 0.32;
          const shaft = cylinderGL2(rt * 0.14 / 2 + 0.05, rt * 0.14 / 2 + 0.05, ph * 0.45, 4); // box-ish approximation kept cheap via a 4-sided cylinder
          list.push(bakeInstance(boxGL2(rt * 0.14 + 0.1, ph * 0.45, rt * 0.14 + 0.1), Math.sin(a) * R2, H + 0.3 + ph * 0.225, Math.cos(a) * R2, a, 0));
          list.push(bakeInstance(coneGL2(rt * 0.1 + 0.08, ph * 0.75, 4), Math.sin(a) * R2, H + 0.3 + ph * 0.45 + ph * 0.375, Math.cos(a) * R2, a + Math.PI / 4, 0));
        }
        const crkPrim = coneGL2(0.12 + rt * 0.03, 0.3 + h * 0.02, 4);
        for (let j = 1; j <= 6; j++) for (let i = 0; i < 8; i++) {
          const u = 0.12 + j * 0.13, a = phi0(8) + i * Math.PI / 4, rr = rt * 0.42 * (1 - (u - 0.12) / 0.88) + 0.05, yy = H + 0.3 + h * u, p = at(rr + 0.08, a, yy);
          crk.push({ x: p.x, y: p.y, z: p.z, rotY: a, rotX: -0.6 });
        }
        add(tag, mergeBuffers(list)); add('accent', bakeInstances(crkPrim, crk));
        top = H + 0.3 + h; break;
      }
      case 'belfry': {
        add(tag, latheGL2([[0, H + 0.25], [rt * 1.04, H + 0.25], [rt * 1.04, H], [rt, H]], n));
        const k = n >= 4 ? n : 4, ph = h * 0.55, list = []; const boxPrim = boxGL2(rt * 0.22 + 0.15, ph, rt * 0.22 + 0.15);
        for (let i = 0; i < k; i++) { const a = phi0(k) + i * Math.PI * 2 / k, R2 = polyR(rt, n, a) * 0.88; list.push(bakeInstance(boxPrim, Math.sin(a) * R2, H + 0.25 + ph / 2, Math.cos(a) * R2, a, 0)); }
        list.push(latheGL2([[rt * 0.6, H + 0.25 + ph], [rt * 1.02, H + 0.25 + ph], [rt * 1.02, H + 0.6 + ph], [0, H + 0.6 + ph]], n || 8));
        list.push(latheGL2([[rt * 1.12, H + 0.6 + ph], [0.02, H + 0.6 + ph + h * 0.45]], k));
        add(tag, mergeBuffers(list));
        const bell = latheGL2([[0.02, 0], [rt * 0.12, -0.05], [rt * 0.2, -ph * 0.15], [rt * 0.26, -ph * 0.38], [rt * 0.38, -ph * 0.5], [rt * 0.36, -ph * 0.52]], 24);
        add('accent', bakeInstance(bell, 0, H + 0.25 + ph * 0.95, 0, 0, 0));
        top = H + 0.6 + ph + h * 0.45; break;
      }
      case 'broken': {
        const list = [], k = 7, boxPrim = boxGL2(1, 1, 1);
        for (let i = 0; i < k; i++) { const a = rnd() * Math.PI * 2, r = rt * (0.2 + rnd() * 0.7), hh = h * (0.2 + rnd()); const prim = boxGL2(rt * (0.25 + rnd() * 0.4), hh, rt * (0.25 + rnd() * 0.4)); list.push(bakeInstance(prim, Math.sin(a) * r, H + hh / 2, Math.cos(a) * r, rnd() * 3, 0)); }
        add(tag, mergeBuffers(list)); add(tag, latheGL2([[0, H + 0.05], [rt, H + 0.05], [rt, H]], n)); top = H + h; break;
      }
    }
    if (C.finial) {
      const f1 = cylinderGL2(0.05, 0.08, Math.max(1, h * 0.35), 8), f2 = sphereGL2(Math.max(0.14, rt * 0.06), 12, 8);
      const list = [bakeInstance(f1, 0, top + Math.max(0.5, h * 0.175), 0, 0, 0), bakeInstance(f2, 0, top + Math.max(0.6, h * 0.22), 0, 0, 0)];
      add('accent', mergeBuffers(list)); top += Math.max(1, h * 0.35);
    }
    return top;
  }

  /* ============================== aura: halos, debris, satellites, bridge, roots, clouds, motes */
  function haloComposer(h, Htop, lean) {
    const face = h.face * Math.PI / 180, tilt = h.tilt * Math.PI / 180;
    const holder = { x: Math.sin(face) * h.off + (Htop + h.y) * (lean || 0), y: Htop + h.y, z: Math.cos(face) * h.off };
    return {
      point(v) { const p2 = rotX(v, tilt); const w = rotY(p2, face); return { x: w.x + holder.x, y: w.y + holder.y, z: w.z + holder.z }; },
      normal(v) { const p2 = rotX(v, tilt); return rotY(p2, face); },
      bake(buf) {
        const n = buf.positions.length / 3, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const p = this.point({ x: buf.positions[i * 3], y: buf.positions[i * 3 + 1], z: buf.positions[i * 3 + 2] });
          const nv = this.normal({ x: buf.normals[i * 3], y: buf.normals[i * 3 + 1], z: buf.normals[i * 3 + 2] });
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; nor[i * 3] = nv.x; nor[i * 3 + 1] = nv.y; nor[i * 3 + 2] = nv.z;
        }
        return { positions: pos, normals: nor, uv: buf.uv.slice(), color: buf.color.slice(), indices: buf.indices.slice(), mode: buf.mode };
      },
    };
  }
  function buildAuraGL2(s, rnd, store, info, lean) {
    const A = s.aura, L = s.look, Htop = info.H;
    const add = (tag, buf, tex) => pushPart(store, tag, buf, tex);
    const addSheared = (tag, buf, tex) => pushPart(store, tag, applyShear(buf, lean), tex);
    let firstPortalComposer = null, firstPortalR = 0;
    s.halos.forEach((h) => {
      const hc = haloComposer(h, Htop, lean), r = h.r;
      if (h.kind === 'portal') {
        for (let i = 0; i < Math.max(1, h.n); i++) {
          const rr = r * (1 - i * 0.14), prim = torusFlatGL2(rr, i ? r * 0.018 + 0.02 : r * 0.045 + 0.04, 8, 96);
          const baked = hc.bake(prim);
          add(i ? 'glowAdditive' : 'glow', recolor(baked, ...hexToRGB(L.glow), i ? 0.85 : 1));
        }
        const glyph = hc.bake(circleGL2(r * 0.98, 64)); add('glowTex', recolor(glyph, ...hexToRGB(L.glow), 0.9), { canvas: glyphTexCanvas(), label: 'glyph', key: 'glyph' });
        const swirl = hc.bake(circleGL2(r * 0.62, 48)); for (let i = 2; i < swirl.positions.length; i += 3) swirl.positions[i] += 0.02; add('glowTex', recolor(swirl, ...hexToRGB(L.glow), 0.75), { canvas: swirlTexCanvas(), label: 'swirl', key: 'swirl' });
        if (!firstPortalComposer) { firstPortalComposer = hc; firstPortalR = r; }
      } else if (h.kind === 'armillary') {
        const ringList = [], tickK = 36;
        for (let i = 0; i < Math.max(1, h.n); i++) {
          const rr = r * (1 - i * 0.07), rx = rnd() * Math.PI, ry = rnd() * Math.PI, rz = rnd() * Math.PI;
          const ringPrim = torusFlatGL2(rr, Math.max(0.05, r * 0.014), 8, 120), planetPrim = sphereGL2(Math.max(0.2, r * (0.04 + rnd() * 0.05)), 20, 14);
          const pa = rnd() * Math.PI * 2;
          const ring2 = { positions: ringPrim.positions.slice(), normals: ringPrim.normals.slice(), uv: ringPrim.uv, color: ringPrim.color, indices: ringPrim.indices, mode: ringPrim.mode };
          for (let vi = 0; vi < ring2.positions.length; vi += 3) { const p = rotEulerXYZ({ x: ring2.positions[vi], y: ring2.positions[vi + 1], z: ring2.positions[vi + 2] }, rx, ry, rz); ring2.positions[vi] = p.x; ring2.positions[vi + 1] = p.y; ring2.positions[vi + 2] = p.z; const nv = rotEulerXYZ({ x: ring2.normals[vi], y: ring2.normals[vi + 1], z: ring2.normals[vi + 2] }, rx, ry, rz); ring2.normals[vi] = nv.x; ring2.normals[vi + 1] = nv.y; ring2.normals[vi + 2] = nv.z; }
          ringList.push(hc.bake(ring2));
          const planetLocal = rotEulerXYZ({ x: Math.cos(pa) * rr, y: Math.sin(pa) * rr, z: 0 }, rx, ry, rz);
          ringList.push(hc.bake(bakeInstance(planetPrim, planetLocal.x, planetLocal.y, planetLocal.z, 0, 0)));
          if (i === 0) {
            const tickPrim = boxGL2(0.06, 0.06, r * 0.05 + 0.1), ticks = [];
            for (let k = 0; k < tickK; k++) { const a = k / tickK * Math.PI * 2; const lp = rotEulerXYZ({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, z: 0 }, rx, ry, rz); ticks.push({ x: lp.x, y: lp.y, z: lp.z, rotY: 0 }); }
            ringList.push(hc.bake(bakeInstances(tickPrim, ticks)));
          }
        }
        add('accent', mergeBuffers(ringList));
      } else if (h.kind === 'gear') {
        const arc = Math.PI * 1.45;
        const ring = torusFlatGL2(r, Math.max(0.12, r * 0.05), 8, 120, arc), inner = torusFlatGL2(r * 0.86, Math.max(0.05, r * 0.012), 6, 120, arc);
        // original rotates the (XY-plane) gear ring about Z then lies it inside tiltG; approximate by
        // standing the flat torus up (rotX 90°) so its arc sweeps in a vertical plane like a gear face.
        const stand = buf => { const n2 = buf.positions.length / 3; for (let i = 0; i < n2; i++) { let p = rotX({ x: buf.positions[i * 3], y: buf.positions[i * 3 + 1], z: buf.positions[i * 3 + 2] }, Math.PI / 2); buf.positions[i * 3] = p.x; buf.positions[i * 3 + 1] = p.y; buf.positions[i * 3 + 2] = p.z; let nv = rotX({ x: buf.normals[i * 3], y: buf.normals[i * 3 + 1], z: buf.normals[i * 3 + 2] }, Math.PI / 2); buf.normals[i * 3] = nv.x; buf.normals[i * 3 + 1] = nv.y; buf.normals[i * 3 + 2] = nv.z; } return buf; };
        add('accent', hc.bake(stand(ring)));
        add('glow', recolor(hc.bake(stand(inner)), ...hexToRGB(L.glow), 1));
        const k = Math.round(arc * r / 0.9), toothPrim = boxGL2(1.4, 0.8, 1), teeth = [];
        for (let i = 0; i <= k; i++) { const a = Math.PI / 2 - arc / 2 + arc * i / k; const local = { x: Math.cos(a) * (r + r * 0.07), y: Math.sin(a) * (r + r * 0.07), z: 0 }; const standp = rotX(local, Math.PI / 2); teeth.push({ x: standp.x, y: standp.y, z: standp.z, rotY: 0, rotX: 0, a }); }
        const toothBuf = mergeBuffers(teeth.map(it => { const p0 = boxGL2(1.4, 0.8, 1); const n2 = p0.positions.length / 3; for (let i = 0; i < n2; i++) { let v = rotZ({ x: p0.positions[i * 3], y: p0.positions[i * 3 + 1], z: p0.positions[i * 3 + 2] }, it.a); v = rotX(v, Math.PI / 2); p0.positions[i * 3] = v.x + it.x; p0.positions[i * 3 + 1] = v.y + it.y; p0.positions[i * 3 + 2] = v.z + it.z; let nv = rotZ({ x: p0.normals[i * 3], y: p0.normals[i * 3 + 1], z: p0.normals[i * 3 + 2] }, it.a); nv = rotX(nv, Math.PI / 2); p0.normals[i * 3] = nv.x; p0.normals[i * 3 + 1] = nv.y; p0.normals[i * 3 + 2] = nv.z; } return p0; }));
        add('accent', hc.bake(toothBuf));
      } else if (h.kind === 'ring') {
        add('glow', recolor(hc.bake(torusFlatGL2(r, Math.max(0.04, r * 0.012), 6, 160)), ...hexToRGB(L.glow), 1));
        const k = Math.round(r * 4), dotPrim = sphereGL2(0.12, 8, 6), dots = [];
        for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2; dots.push({ x: Math.cos(a) * r * 1.06, y: Math.sin(a) * r * 1.06, z: 0, rotY: 0 }); }
        add('glow', recolor(hc.bake(bakeInstances(dotPrim, dots)), ...hexToRGB(L.glow), 1));
      } else if (h.kind === 'orb') {
        add('glow', recolor(hc.bake(sphereGL2(r, 32, 20)), ...lerp3(hexToRGB(L.glow), [0, 0, 0], 0.2), 1));
        const N = 420, b = newBuf();
        for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, rr = r * (1.5 + rnd() * 1.6); pushVert(b, Math.cos(a) * rr, (rnd() - 0.5) * r * 0.15, Math.sin(a) * rr, 0, 0, ...hexToRGB(L.glow), 1); }
        const diskBuf = finalizeBuf(b, 'points');
        add('auraPoints', hc.bake(diskBuf));
        // orb halo sprite: DROPPED (see header KNOWN GAPS #2) — a camera-facing glow quad of scale
        // r*3.6 can be re-added by the integration step at this halo's world point if desired.
      }
    });
    if (A.beam && firstPortalComposer) {
      const bg = cylinderGL2(0.12, 0.5, A.beamLen, 12, true); const n = bg.positions.length / 3;
      for (let i = 0; i < n; i++) bg.positions[i * 3 + 2] += A.beamLen / 2 + 0.2 - (bg.positions[i * 3 + 1]); // placeholder, corrected below
      // rebuild beam directly pointing along local +Z (rotateX(PI/2) on a Y-axis cylinder swaps Y/Z)
      const beam = cylinderGL2(0.12, 0.5, A.beamLen, 12, true), core = cylinderGL2(0.04, 0.14, A.beamLen, 8, true);
      for (const prim of [beam, core]) { const nn = prim.positions.length / 3; for (let i = 0; i < nn; i++) { const x = prim.positions[i * 3], y = prim.positions[i * 3 + 1], z = prim.positions[i * 3 + 2]; prim.positions[i * 3] = x; prim.positions[i * 3 + 1] = z; prim.positions[i * 3 + 2] = y + A.beamLen / 2 + 0.2; const nx = prim.normals[i * 3], ny = prim.normals[i * 3 + 1], nz = prim.normals[i * 3 + 2]; prim.normals[i * 3] = nx; prim.normals[i * 3 + 1] = nz; prim.normals[i * 3 + 2] = ny; } }
      add('glowAdditive', recolor(firstPortalComposer.bake(beam), ...hexToRGB(L.glow), 0.8));
      add('glow', recolor(firstPortalComposer.bake(core), ...hexToRGB(L.glow), 1));
    }
    if (A.debN > 0) {
      let prim, tag2;
      if (A.debKind === 'crystal') { prim = octaScale(1.0, 0.4, 1.5, 0.4); tag2 = 'glowAdditive'; }
      else if (A.debKind === 'block') { prim = boxGL2(1, 1.3, 1); tag2 = 'body'; }
      else if (A.debKind === 'shard') { prim = octaScale(1.0, 0.45, 1.6, 0.3); tag2 = 'accent'; }
      else { prim = bumpyIco(rnd); tag2 = 'dark'; }
      const insts = [];
      for (let i = 0; i < A.debN; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.max(1.5, A.debR + (rnd() - 0.5) * 2 * A.debSpread), yy = info.top * (A.debLow + rnd() * (1.08 - A.debLow)), sc = A.debSize * (0.35 + rnd() * rnd() * 1.6);
        insts.push({ x: Math.sin(a) * rr, y: yy, z: Math.cos(a) * rr, sc });
      }
      const merged = mergeBuffers(insts.map(it => { const scaled = { positions: prim.positions.map(v => v), normals: prim.normals, uv: prim.uv, color: prim.color, indices: prim.indices, mode: prim.mode }; const pos = new Float32Array(scaled.positions.length); for (let i = 0; i < pos.length; i++) pos[i] = scaled.positions[i] * it.sc; const inst = bakeInstance({ positions: pos, normals: scaled.normals, uv: scaled.uv, color: scaled.color, indices: scaled.indices, mode: scaled.mode }, it.x, it.y, it.z, 0, 0); return inst; }));
      add(tag2, tag2 === 'glowAdditive' ? recolor(merged, ...lerp3(hexToRGB(L.glow), [0, 0, 0], 0.15), 0.9) : merged);
    }
    if (A.satN > 0 && s.tiers.length) {
      for (let i = 0; i < A.satN; i++) {
        const a = (i + 0.3 + rnd() * 0.4) / A.satN * Math.PI * 2, R = A.satR * (0.75 + rnd() * 0.5), sc = A.satScale * (0.55 + rnd() * 0.7);
        const T0 = Object.assign({}, s.tiers[0], { h: info.H * sc, r0: s.tiers[0].r0 * A.satScale * (0.6 + rnd() * 0.5), winRows: 0, spN: 0, band: 'none', chan: 0, pat: 'none', stair: 0, banN: 0, butN: 0 });
        T0.r1 = T0.r0 * (0.65 + rnd() * 0.3);
        const sub = Object.assign(JSON.parse(JSON.stringify(s)), { tiers: [T0], crown: { kind: 'broken', h: T0.r0 * 1.5, mat: s.tiers[0].mat === 'glow' ? 'dark' : s.tiers[0].mat, finial: false }, base: { kind: s.base.kind === 'roots' ? 'roots' : 'none', h: T0.h * 0.15, spread: 1.5, fins: 0, lean: 0 } });
        const subStore = makePartStore(); buildBodyGL2(sub, rnd, subStore, 0);
        const rotYBase = rnd() * 6.28, px = Math.sin(a) * R, pz = Math.cos(a) * R;
        for (const [, e] of subStore.buckets) { const merged = mergeBuffers(e.list); const baked = bakeInstance(merged, px, 0, pz, rotYBase, 0); add(e.tag, baked, e.texture ? { canvas: e.texture.canvas, label: e.texture.label, key: e.tag + ':' + e.texture.label } : null); }
        // satellite glow sprite: DROPPED (KNOWN GAPS #2), as with the orb halo sprite.
      }
    }
    if (A.bridge) {
      const yb = Math.max(3, info.H * A.bridgeAt), dir = A.bridgeFace * Math.PI / 180, r0 = radiusAtY(info, yb) * 0.9, L0 = A.bridgeLen;
      const span = Math.max(6, Math.min(18, yb * 0.7)), nSp = Math.max(1, Math.round(L0 / span)), spw = L0 / nSp, wd = 3.2, pier = Math.min(2.2, spw * 0.25);
      const keep = A.bridgeBroken ? Math.max(1, Math.ceil(nSp * 0.7)) : nSp, list = [];
      // KNOWN GAPS #3: solid pier blocks in place of the original's arched (holed) spans.
      for (let i = 0; i < keep; i++) { const x0 = r0 + i * spw + spw / 2; list.push(bakeInstance(boxGL2(spw * 0.9, yb, wd * 0.9), x0, yb / 2, 0, 0, 0)); }
      const deckLen = A.bridgeBroken ? keep * spw * (0.92 + rnd() * 0.06) : L0;
      list.push(bakeInstance(boxGL2(deckLen, 0.7, wd + 0.8), r0 + deckLen / 2, yb + 0.35, 0, 0, 0));
      for (const sd of [-1, 1]) list.push(bakeInstance(boxGL2(deckLen, 1, 0.3), r0 + deckLen / 2, yb + 1.2, sd * (wd / 2 + 0.25), 0, 0));
      if (A.bridgeBroken) for (let i = 0; i < 8; i++) list.push(bakeInstance(boxGL2(0.6 + rnd(), 0.5 + rnd(), 0.6 + rnd()), r0 + deckLen + rnd() * spw, 0.4, (rnd() - 0.5) * wd * 2, rnd() * 3, 0));
      let merged = mergeBuffers(list);
      const rotYAll = dir - Math.PI / 2, nAll = merged.positions.length / 3;
      for (let i = 0; i < nAll; i++) { const p = rotY({ x: merged.positions[i * 3], y: merged.positions[i * 3 + 1], z: merged.positions[i * 3 + 2] }, rotYAll); merged.positions[i * 3] = p.x; merged.positions[i * 3 + 1] = p.y; merged.positions[i * 3 + 2] = p.z; const nv = rotY({ x: merged.normals[i * 3], y: merged.normals[i * 3 + 1], z: merged.normals[i * 3 + 2] }, rotYAll); merged.normals[i * 3] = nv.x; merged.normals[i * 3 + 1] = nv.y; merged.normals[i * 3 + 2] = nv.z; }
      add('bridge', merged);
    }
    if (A.roots > 0) {
      const reachY = info.H * A.rootsH, tag2 = A.rootsGlow ? 'glow' : 'dark', leaves = [];
      const rootBufs = [];
      for (let i = 0; i < A.roots; i++) {
        const a0 = i / A.roots * Math.PI * 2 + rnd() * 0.5, dirn = rnd() < 0.5 ? -1 : 1, tw = (0.6 + rnd() * 1.4) * dirn, top = reachY * (0.45 + rnd() * 0.55), pts = [], thick = Math.max(0.12, info.rMax * (0.05 + rnd() * 0.05));
        for (let j = 0; j <= 14; j++) {
          const u = j / 14, y = u * top, a = a0 + tw * u + Math.sin(u * 9 + i) * 0.08, flare = Math.pow(1 - Math.min(1, u * 5), 2);
          const r = radiusAtY(info, y) + thick * 0.6 + flare * info.rMax * (0.8 + rnd() * 0.6);
          pts.push(at(r, a, y - (u === 0 ? 0.3 : 0)));
        }
        const segs = 40, rad = 8, b = newBuf(), rows = [];
        for (let si = 0; si <= segs; si++) { const c = catmullRom3(pts, si / segs), k = 1 - 0.85 * si / segs; const row = []; for (let q = 0; q <= rad; q++) { const phi = q / rad * Math.PI * 2; row.push(pushVert(b, c.x + Math.sin(phi) * thick * k, c.y + Math.cos(phi) * thick * k * 0.0 + 0, c.z + Math.cos(phi) * thick * k, q / rad, si / segs)); } rows.push({ c, row }); }
        // re-author the tube properly in a local frame per segment (sin/cos around the path's up axis)
        const b2 = newBuf(); const rings2 = [];
        for (let si = 0; si <= segs; si++) { const c = catmullRom3(pts, si / segs), k = 1 - 0.85 * si / segs; const ring = []; for (let q = 0; q <= rad; q++) { const phi = q / rad * Math.PI * 2; ring.push(pushVert(b2, c.x + Math.sin(phi) * thick * k, c.y + Math.cos(phi) * thick * k, c.z, q / rad, si / segs)); } rings2.push(ring); }
        for (let si = 0; si < segs; si++) for (let q = 0; q < rad; q++) { const A2 = rings2[si][q], B2 = rings2[si][q + 1], D2 = rings2[si + 1][q], C2 = rings2[si + 1][q + 1]; pushTri(b2, A2, B2, C2); pushTri(b2, A2, C2, D2); }
        smoothNormalsWIP(b2); rootBufs.push(finalizeBuf(b2));
        if (A.rootsGlow) for (let j = 0; j < 14; j++) { const c = catmullRom3(pts, 0.25 + rnd() * 0.75); leaves.push(c.x + (rnd() - 0.5) * 1.2, c.y + (rnd() - 0.5) * 1.2, c.z + (rnd() - 0.5) * 1.2); }
      }
      addSheared(tag2, recolor(mergeBuffers(rootBufs), ...hexToRGB(A.rootsGlow ? L.glow : L.dark), 1));
      if (leaves.length) { const b = newBuf(); for (let i = 0; i < leaves.length; i += 3) pushVert(b, leaves[i], leaves[i + 1], leaves[i + 2], 0, 0, ...hexToRGB(L.glow), 1); addSheared('auraPoints', finalizeBuf(b, 'points')); }
    }
    if (A.clouds > 0) {
      const sk = TW_SKIES[L.sky] || TW_SKIES.dusk, cy = info.top * A.cloudsAt, N = Math.round(14 + A.clouds * 40);
      const col = lerp3(hexToRGB(sk.fog), [1, 1, 1], 0.25), b = newBuf(), sizeBase = Math.max(0.1, 0.1 + A.clouds * 0.3);
      for (let i = 0; i < N; i++) { const a = i / N * 6.28 + rnd() * 0.4, r = info.rMax * (1.6 + rnd() * 3.5), sc = info.rMax * (1.6 + rnd() * 2.2); pushVert(b, Math.sin(a) * r, cy + (rnd() - 0.5) * info.rMax * 0.6, Math.cos(a) * r, sc * 2.2, sizeBase, col[0], col[1], col[2], sizeBase); }
      add('auraPoints', finalizeBuf(b, 'points'));
    }
    if (A.motes > 0) {
      const N = A.motes, Rm = Math.max(info.rMax * 2.2, A.debN ? A.debR + A.debSpread * 0.5 : 0, A.satN ? A.satR * 1.2 : 0, 8), Hm = info.top * 1.25, b = newBuf();
      for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * Rm; pushVert(b, Math.sin(a) * r, rnd() * Hm, Math.cos(a) * r, 0, 0, ...hexToRGB(L.glow), 1); }
      add('auraPoints', finalizeBuf(b, 'points'));
    }
  }
  function octaScale(r, sx, sy, sz) {
    const b = newBuf();
    const verts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(v => ({ x: v[0] * r * sx, y: v[1] * r * sy, z: v[2] * r * sz }));
    const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    for (const v of verts) pushVert(b, v.x, v.y, v.z, 0, 0);
    for (const f of faces) pushTri(b, f[0], f[1], f[2]);
    smoothNormalsWIP(b); return finalizeBuf(b);
  }
  function bumpyIco(rnd) {
    const g = icosphereGL2(1, 0), n = g.positions.length / 3;
    for (let i = 0; i < n; i++) { const s = 0.75 + rnd() * 0.5; g.positions[i * 3] *= s; g.positions[i * 3 + 1] *= s; g.positions[i * 3 + 2] *= s; }
    const acc = new Float64Array(n * 3); for (let t = 0; t < g.indices.length; t += 3) faceNormalAdd(g.positions, acc, g.indices[t], g.indices[t + 1], g.indices[t + 2]);
    for (let i = 0; i < n; i++) { const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1; g.normals[i * 3] = acc[i * 3] / l; g.normals[i * 3 + 1] = acc[i * 3 + 1] / l; g.normals[i * 3 + 2] = acc[i * 3 + 2] / l; }
    return g;
  }

  /* ============================== top-level ============================== */
  function buildTowerGL2(spec, rnd) {
    const store = makePartStore();
    const lean = Math.tan((spec.base.lean || 0) * Math.PI / 180);
    const info = buildBodyGL2(spec, rnd, store, lean);
    info.lean = lean;
    info.rMax = Math.max(0.5, ...spec.tiers.map(t => Math.max(t.r0, t.r1, rAt(t, 0.5)))) * (spec.base.kind !== 'none' ? Math.max(1, spec.base.spread) : 1);
    buildAuraGL2(spec, rnd, store, info, lean);
    let reach = info.rMax;
    for (const h of spec.halos) reach = Math.max(reach, h.r + h.off);
    if (spec.aura.debN) reach = Math.max(reach, spec.aura.debR + spec.aura.debSpread * 0.5);
    if (spec.aura.satN) reach = Math.max(reach, spec.aura.satR * 1.1);
    if (spec.aura.bridge) reach = Math.max(reach, Math.min(spec.aura.bridgeLen * 0.3, 25));
    for (const t of spec.tiers) if (t.butN > 0) reach = Math.max(reach, Math.max(t.r0, t.r1) + t.butR + 1);
    if (spec.aura.roots > 0) reach = Math.max(reach, info.rMax * 2.2);
    if (spec.base.kind === 'buried' || spec.base.kind === 'crag') reach = Math.max(reach, (spec.tiers[0] || TIER_DEF).r0 * spec.base.spread * 1.6);
    let top = info.top; for (const h of spec.halos) top = Math.max(top, info.H + h.y + h.r);

    const parts = [];
    for (const [, e] of store.buckets) {
      const merged = mergeBuffers(e.list);
      if (!merged.positions.length) continue;
      parts.push({ materialTag: e.tag, positions: merged.positions, normals: merged.normals, uv: merged.uv, color: merged.color, indices: merged.indices, mode: merged.mode, texture: e.texture || null });
    }
    return { parts, info, reach, top };
  }

  window.TowerEngineGL2 = {
    TIER_DEF, TW_SKIES,
    hash1, vnoise, rAt, phi0, polyR, at,
    newBuf, pushVert, pushTri, finalizeBuf, mergeBuffers, applyShear,
    boxGL2, cylinderGL2, coneGL2, sphereGL2, icosphereGL2, torusFlatGL2, planeGL2, circleGL2,
    latheGL2, twistBuffer, stripTrisGL2, extrudeFanGL2,
    radiusAtY, catmullRom3,
    patCanvas, winTexCanvas, glyphTexCanvas, swirlTexCanvas, dotTexCanvas, clothTexCanvas, glyphStripTexCanvas, cloudTexCanvas,
    buildBodyGL2, addStairGL2, addBannersGL2, addButtressesGL2, addBandGL2, addCrownGL2, buildAuraGL2,
    buildTowerGL2,
  };
})();
