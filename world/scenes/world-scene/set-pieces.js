// world/scenes/world-scene/set-pieces.js -- window.ENVX: World Scene's places (places.js), run and edited.
//
// A place (places.js) is data: its setting (style, city, water, surface, light), its paths, its cast (who, how many, in what role and layer),
// its shots and its look. This file runs one: it builds the paths, populates the tank with the cast and steers each row by its role through the
// sim's own f.steer, draws the water and its light in World Scene's own pipeline, takes the shots, and draws the creatures (as Specimen does, in the
// place's own style, or as World Scene's line drawing). The Places tab (a rail tab, built here) picks a place and edits it; an edited place is kept in
// this browser (localStorage 'forge:world-places'), and Copy gives its JSON to paste into places.js.
//
// World Scene calls it at these seams: ENVX.tick(dt) after the sim steps; ENVX.camera(dt) in updateCamera; ENVX.under(t) after the frame is cleared
// (the floor); ENVX.creatures(t) after the towers and city (the solid creatures); ENVX.over(t) before the frame is shown (surface, shafts, vignette,
// the dip between shots); ENVX.hides(layer); ENVX.bg(), colour(), paint(sp), fill(), solid().
// Z runs down: z = 0 is the top of the tank, tankDepth() the floor. Tilt 0 looks straight down; over 90 looks up.
// Links: ?place=<id> (or ?env=), ?shots=0, ?bodies=specimen|styled|flat.
(function () {
  'use strict';
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k, ease = (v) => v * v * (3 - 2 * v);
  const hex = (h) => { const n = parseInt(String(h || '#000000').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let seedR = 1; const rnd = (a = 0, b = 1) => { seedR = (seedR * 16807) % 2147483647; return a + (b - a) * (seedR / 2147483647); };

  // ------------------------------------------------------------------ shaders
  const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += vn(p) * a; p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// a ribbon of light: a wavy line across the water, a sharp bright crest with a soft fall behind it, broken into runs
// (the light that a long swell throws down). q is in "ribbon units"; the crest repeats every 1 in y.
float ribbon(vec2 q, float t){ float w = q.y + sin(q.x * 0.9 + t * 0.21 + q.y * 0.4) * 0.22 + (fbm(q * vec2(0.6, 1.1) + vec2(t * 0.03, -t * 0.02)) - 0.5) * 1.1;
  float f = fract(w); float crest = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.03, 0.16, f)) + 0.35 * (1.0 - smoothstep(0.0, 0.03, abs(f - 0.06)));
  float run = smoothstep(0.42, 0.62, fbm(vec2(q.x * 0.5 + floor(w) * 3.7, floor(w) * 1.3) + t * 0.015));
  return crest * run; }
`;
  // the floor: every pixel's ray followed to the plane z = uFloorZ (the pond's bed)
  const FLOOR_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform mat4 uIVP; uniform vec3 uEye; uniform float uFloorZ, uT, uScale, uRib, uRibK, uNet, uFogK, uMoon;
uniform vec3 uDeep, uShallow, uRibC, uFogC, uShC; uniform vec2 uTank, uSun;
uniform vec4 uSh[64]; uniform vec4 uShB[64]; uniform int uShN;
${NOISE}
void main(){ vec2 n = vUv * 2.0 - 1.0; vec4 a = uIVP * vec4(n, -1.0, 1.0), b = uIVP * vec4(n, 1.0, 1.0); a /= a.w; b /= b.w;
  vec3 d = normalize(b.xyz - a.xyz); float tt = (uFloorZ - a.z) / d.z; if (d.z <= 0.0001) tt = 1e7;
  vec3 p = a.xyz + d * tt; vec2 q = p.xy / uScale;
  // the bed: deep to shallow across the pond, in broad soft patches
  float g = clamp(p.y / uTank.y, 0.0, 1.0); vec3 c = mix(uDeep, uShallow, clamp(g * 0.55 + (fbm(q * 0.18 + 3.1) - 0.5) * 0.9 + 0.2, 0.0, 1.0));
  // a fine net of light, and the long ribbons, each colour a little apart (the edge of the light splits)
  float net = pow(1.0 - abs(vn(q * 1.7 + vec2(uT * 0.08, uT * 0.05)) * 2.0 - 1.0), 6.0) * pow(1.0 - abs(vn(q * 2.3 - vec2(uT * 0.06, -uT * 0.07) + 11.0) * 2.0 - 1.0), 6.0);
  c += uRibC * net * uNet;
  vec2 rq = q * vec2(1.0, uRibK); vec3 rb = vec3(ribbon(rq + vec2(0.0, 0.018), uT), ribbon(rq, uT), ribbon(rq - vec2(0.0, 0.018), uT));
  float core = min(rb.r, min(rb.g, rb.b));
  c += (rb - core) * vec3(1.0, 0.85, 1.2) * uRib * 0.7 + core * uRibC * uRib * 1.25;   // the edge splits into colour, the middle is white light
  // shadows: each flier's, slid away from the sun, soft. (x, y, length, heading), (wing span / length, softness, strength, 0)
  float sh = 0.0;
  for (int i = 0; i < 64; i++) { if (i >= uShN) break; vec4 s = uSh[i], e = uShB[i]; vec2 r = p.xy - s.xy; float ca = cos(s.w), sa = sin(s.w);
    vec2 l = vec2(dot(r, vec2(ca, sa)), dot(r, vec2(-sa, ca))) / s.z;   // along the body, across it
    float m = e.x < 1.2 ? length(l / vec2(0.5, 0.13 * e.x)) : abs(l.x + 0.05) / 0.45 + abs(l.y) / (0.25 * e.x) * (1.0 + max(0.0, l.x) * 0.8);   /* a fish: a soft ellipse; a flier: a broad diamond, swept back */ sh = max(sh, (1.0 - smoothstep(1.0 - e.y, 1.0, m)) * e.z); }
  c = mix(c, uShC, sh);
  // the far bed sinks into the water's colour
  c = mix(c, uFogC, 1.0 - exp(-tt * uFogK));
  if (uMoon > 0.0) { vec2 m = (p.xy - uTank * vec2(0.5, 0.3)) / uTank.x; c += uRibC * uMoon * 0.05 * exp(-dot(m, m) * 30.0); }
  o = vec4(c, 1.0); }`;
  // the water's surface: a sheet at z = uSurfZ, tested against the frame's depth, so whatever swims under it is seen
  // through it (tinted, with light on it) and whatever flies over it is not
  const SURF_VS = `#version 300 es
uniform mat4 uVP; uniform vec2 uTank; uniform float uSurfZ; out vec2 vP;
void main(){ vec2 c = vec2(gl_VertexID & 1, (gl_VertexID >> 1) & 1); vec2 p = mix(-uTank * 1.5, uTank * 2.5, c); vP = p; gl_Position = uVP * vec4(p, uSurfZ, 1.0); }`;
  const SURF_FS = `#version 300 es
precision highp float; in vec2 vP; out vec4 o;
uniform float uT, uScale, uA, uRib, uRibK, uBelow, uMoon; uniform vec3 uCol, uRibC, uEye; uniform vec2 uTank;
${NOISE}
void main(){ vec2 q = vP / uScale; vec3 c = uCol; float a = uA;
  vec2 rq = q * vec2(1.0, uRibK) + vec2(0.3, 0.17);
  float r = ribbon(rq, uT * 1.1); c += uRibC * r * uRib; a += r * uRib * 0.35;
  float gl = step(0.985, vn(q * 9.0 + vec2(uT * 0.9, uT * 0.4))) * step(0.5, vn(q * 0.8 - uT * 0.05)); c += vec3(1.0) * gl * 0.8; a += gl * 0.4;   // glints
  if (uBelow > 0.5) { float s = fbm(q * 0.9 + uT * 0.06); c = mix(c, uRibC, smoothstep(0.55, 0.8, s) * 0.5); a = mix(a, a + 0.25, smoothstep(0.5, 0.85, s)); }   // from beneath: the bright, moving ceiling
  if (uMoon > 0.0) { vec2 m = (vP - uTank * vec2(0.5, 0.2)) / uTank.x; float w = exp(-(m.x * m.x * 900.0 + m.y * m.y * 5.0)) * smoothstep(0.35, 0.75, vn(q * vec2(3.0, 9.0) + uT * vec2(0.3, 0.7))) * (0.5 + 0.5 * vn(q * vec2(7.0, 2.0) - uT * 0.4)); c += vec3(0.95, 0.95, 0.85) * w * uMoon; a += w * uMoon * 0.6; }
  o = vec4(c, clamp(a, 0.0, 0.95)); }`;
  // light shafts, a dip to dark across a cut, and a soft vignette
  const OVER_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform float uT, uShaft, uFade, uVig, uAsp; uniform vec3 uShaftC, uFadeC; uniform vec2 uSrc;
${NOISE}
void main(){ vec2 p = (vUv - uSrc) * vec2(uAsp, 1.0); float ang = atan(p.x, -p.y), r = length(p);
  float rays = smoothstep(0.55, 0.95, vn(vec2(ang * 9.0 + uT * 0.05, 0.0))) * smoothstep(0.55, 0.9, vn(vec2(ang * 23.0 - uT * 0.07, 3.0)) * 0.6 + 0.5);
  float s = rays * exp(-r * 1.1) * uShaft;
  vec2 v = (vUv - 0.5) * vec2(uAsp, 1.0) * 2.0; float vig = smoothstep(0.7, 1.8, length(v)) * uVig;
  o = vec4(uShaftC * s * (1.0 - uFade) + uFadeC * uFade, max(vig, uFade)); }`;   // drawn ONE, ONE_MINUS_SRC_ALPHA: shafts add, the vignette and the dip darken
  let P = null;
  const progs = () => P || (P = { floor: program(QUAD_VS, FLOOR_FS), surf: program(SURF_VS, SURF_FS), over: program(QUAD_VS, OVER_FS) });

  // ------------------------------------------------------------------ the vocabulary the editor offers
  const ER = window.EcologyRoles, LAYERS = ER.LAYERS;   // the roles, paths and depth bands: packages/ecology/ecology-roles.js (shared with Forge Scenes)
  const LAYER_NAMES = { high: 'High air', air: 'Air', surface: 'Surface', mid: 'Mid-water', deep: 'Deep', bed: 'Bed' };
  const ROLE_NAMES = { stream: 'Stream', formation: 'Formation', escort: 'Escort', drift: 'Drift', school: 'School', bed: 'Crawl the bed' };   // stream and formation follow a path; escort keeps behind another species; drift turns round the middle; school: Forge Scenes' koi
  const SHOT_NAMES = { above: 'Above', ride: 'Ride behind', follow: 'Follow', beneath: 'From beneath', descent: 'Descent', orbit: 'Orbit', lookup: 'Look up', low: 'Low across' };
  const zOf = ER.zOf;
  const layerOf = (r) => { if (r.layer) return r.layer; if (r.z) for (const k in LAYERS) if (LAYERS[k][0] === r.z[0] && LAYERS[k][1] === r.z[1]) return k; return 'custom'; };

  // ------------------------------------------------------------------ helpers
  const keyOf = (f) => SPECIES[f.sp].key, bl = (f) => EcologySim.bodyLen(sim, f);
  const live = (keys) => sim.fish.filter((f) => !f.dead && keys.includes(keyOf(f)));
  const specName = (k) => { const s = SPECIES.find((x) => x.key === k); return s ? s.name : k; };
  function holdZ(f, z, k) { f.z += (z - f.z) * k; f.zGoal = z; const TD = tankDepth(); if (f.cz) for (let i = 0; i < f.cz.length; i++) f.cz[i] += (z * TD - f.cz[i]) * k; }

  // ------------------------------------------------------------------ the place at run time
  const X = { id: 'world', P: null, R: null, places: {}, shotsOn: true, manualOn: false, shotT: 0, shot: null, fade: 0, bodies: 'specimen' };
  function centerOf(P) { const TW = tankW(), TH = tankH(), c = P.setting && P.setting.center;
    if (c === 'tower') { const T = (typeof placedTowers !== 'undefined' && placedTowers[0]) || null; if (T) return [T.x != null ? T.x : T.pos[0], T.y != null ? T.y : T.pos[1]]; return [TW / 2, TH / 2]; }
    return c ? [c[0] * TW, c[1] * TH] : [TW / 2, TH / 2]; }
  const buildPaths = (P, C) => ER.paths(P.paths, C, tankW(), tankH());

  // the cast's roles run in EcologyRoles, with this page's sim, tank and depth
  const roleCtx = () => ({ sim, rnd, keyOf, bl, tankW, tankDepth, center: X.R.c, paths: X.R.paths, setZ: holdZ });
  const rowLists = (P) => ER.rows(roleCtx(), P.cast);
  function runCast(dt) { const P = X.P, R = X.R; if (!P || !P.cast) return; ER.run(roleCtx(), P.cast, dt, R.st); }
  const castPop = (P) => { const o = {}; for (const r of P.cast || []) o[r.species] = (o[r.species] || 0) + (r.n | 0); return o; };

  // shadows on the floor: what is over the surface casts a broad one; what swims under it a soft small one
  function shadows() { const P = X.P, out = []; if (!P || !P.cast) return out; const TD = tankDepth(), lev = (P.setting.surface || {}).level || 0, sun = [0.45, 0.3], lists = rowLists(P);
    const add = (f, wing, k) => { const h = TD - f.z * TD, b = bl(f); out.push([f.x + sun[0] * h * 0.35, f.y + sun[1] * h * 0.35, b * (1 + h / TD * 0.25), f.ang, wing, clamp(0.35 + h / TD * 0.6, 0.3, 0.95), k * (1 - h / TD * 0.45)]); };
    P.cast.forEach((r, i) => { if (zOf(r)[1] < lev) for (const f of lists[i]) if (out.length < 64) add(f, 2.1, 0.55); });
    if (lev > 0.1) P.cast.forEach((r, i) => { if (zOf(r)[0] >= lev && zOf(r)[0] < 0.9) for (const f of lists[i]) if (out.length < 64) add(f, 0.9, 0.3); });
    return out; }

  // ------------------------------------------------------------------ shots
  const distFor = (span) => span / (2 * Math.tan(20 * DEG));
  function targetOf(sh) { const R = X.R, P = X.P, tg = sh.target || 'center';
    if (tg === 'center') return [R.c[0], R.c[1], null];
    if (tg === 'densest') { const r = (P.cast || []).find((q) => q.role === 'stream'); const L = r && R.paths[r.path];
      if (!L) { const pts = rowLists(P).flat().map((f) => [f.x, f.y]), b = pts.length ? bl(rowLists(P).flat()[0]) : 40, m = Shots.densest(pts, b * 8);   // no stream: where the cast is thickest
        if (!m) return [R.c[0], R.c[1], null]; if (!R.wd) R.wd = m; R.wd[0] += (m[0] - R.wd[0]) * 0.05; R.wd[1] += (m[1] - R.wd[1]) * 0.05; return [R.wd[0], R.wd[1], null]; }
      const H = new Float32Array(48), lists = rowLists(P); P.cast.forEach((q, i) => { if (q.role === 'stream' && q.path === r.path) for (const f of lists[i]) if (f._s != null) H[(f._s * 48 | 0) % 48]++; });
      let bi = 0, bv = -1; for (let i = 0; i < 48; i++) { const v = H[i] * 2 + H[(i + 1) % 48] + H[(i + 47) % 48]; if (v > bv) { bv = v; bi = i; } }
      if (R.wb == null || bv > (R.wbv || 0) * 1.6) R.wb = bi; R.wbv = bv; const q = L.at((R.wb + 0.5) / 48); return [q[0], q[1], null]; }
    const f = live([tg])[0]; return f ? [f.x, f.y, f] : [R.c[0], R.c[1], null]; }
  function shotCam(sh, v) { const R = X.R, TD = tankDepth(), TH = tankH(), zm = sh.zoom || 1, y0 = sh.yaw || 0, T = targetOf(sh);
    const s = R.ss || (R.ss = { c: [T[0], T[1]], y: null }); const k = sh.kind === 'ride' || sh.kind === 'follow' ? 0.06 : 0.02; s.c[0] += (T[0] - s.c[0]) * k; s.c[1] += (T[1] - s.c[1]) * k; const c = s.c;
    switch (sh.kind) {
      case 'above': return { c: [c[0], c[1], TD * 0.4], yaw: y0 + lerp(-6, 4, v), tilt: 2, dist: distFor(TH * lerp(0.3, 0.26, ease(v))) / zm };
      case 'ride': case 'follow': { const f = T[2]; if (!f) return null; const want = Math.atan2(-Math.cos(f.ang), -Math.sin(f.ang)) / DEG; if (s.y == null) s.y = want; s.y = Shots.chase(s.y, want, 0.02);
        return sh.kind === 'ride' ? { c: [c[0], c[1], f.z * TD], yaw: s.y + y0, tilt: lerp(14, 26, v), dist: bl(f) * 3.6 / zm } : { c: [c[0], c[1], f.z * TD], yaw: s.y + y0, tilt: 30, dist: bl(f) * 6 / zm }; }
      case 'beneath': return { c: [c[0], c[1], TD * ((X.P.setting.surface || {}).level || 0.3)], yaw: y0 + lerp(30, 55, v), tilt: 152, dist: TD * lerp(0.62, 0.55, ease(v)) / zm };
      case 'descent': return { c: [c[0], c[1], TD * lerp(0.35, 0.6, ease(v))], yaw: y0 + lerp(20, 50, v), tilt: lerp(40, 66, ease(v)), dist: TH * lerp(0.36, 0.26, ease(v)) / zm };
      case 'orbit': return { c: [c[0], c[1], TD * 0.62], yaw: y0 + 80 + v * 60, tilt: 74, dist: TH * 0.22 / zm };
      case 'lookup': return { c: [c[0] + tankW() * 0.05, c[1], TD * 0.45], yaw: y0 + 230 + v * 25, tilt: lerp(118, 132, ease(v)), dist: TD * 0.5 / zm };
      case 'low': return { c: [c[0], c[1] + TH * 0.05, TD * 0.28], yaw: y0 + lerp(175, 195, v), tilt: 70, dist: TH * lerp(0.3, 0.24, ease(v)) / zm };
    } return null; }
  X.total = () => (X.P ? Shots.total(X.P.shots) : 0);   // packages/motion/shots.js
  X.camera = function () { const P = X.P; X.lastDist = 0; if (!P || !X.shotsOn || !P.shots || !P.shots.length) return null; const total = X.total(); if (!total) return null;
    const a = Shots.at(P.shots, X.shotT), sh = a.shot; if (X.shot !== sh) { X.shot = sh; X.R.ss = null; }
    X.fade = P.shots.length > 1 ? Shots.dip(a.cut, 0.45) : 0;
    const o = shotCam(sh, a.v); if (!o) return null; X.lastDist = o.dist; return { c: o.c, yaw: o.yaw * DEG, tilt: o.tilt * DEG, dist: o.dist }; };

  // ------------------------------------------------------------------ loading a place
  const STORE = 'forge:world-places';
  const saved = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } };
  const PLACES_V = 3;   // the built-in places' version: raise it when they are redesigned
  function keep() { try { const s = saved(); if (X.P && X.id !== 'world') { X.P._v = PLACES_V; s[X.id] = X.P; } localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* storage off */ } }
  function allPlaces() { const out = {}, base = window.WorldPlaces || { world: { title: 'World' } }, mine = saved();
    for (const k in base) out[k] = clone(base[k]);
    for (const k in mine) if (!base[k] || mine[k]._v === PLACES_V) out[k] = mine[k];   // an edit of a built-in place made before it was redesigned is set aside
    return out; }
  X.edited = (id) => { const m = saved()[id]; return !!m && (!(window.WorldPlaces || {})[id] || m._v === PLACES_V); };
  let snap = null;
  const SKEYS = ['count', 'snow', 'glow', 'shimmer', 'trail', 'beh', 'flow', 'mode', 'dz', 'routeAtmo', 'wings', 'view', 'orbit', 'style'];
  function setStyle(id) { if (!id || S.style === id) return; if (window.ForgeCityHost && ForgeCityHost.setStyle) ForgeCityHost.setStyle(id); else { const sel = document.getElementById('style-pick'); if (sel) { sel.value = id; sel.dispatchEvent(new Event('change')); } } }
  function applySetting() { const st = X.P.setting || {}; setStyle(st.style); Object.assign(S, { snow: !!st.snow, glow: st.glow ?? 0.8, shimmer: 0, trail: 0, beh: 'off', flow: 'free', mode: 'sigil', dz: st.dz || 0.8, routeAtmo: false });
    for (const id of ['r-city', 'r-tower']) { const b = document.getElementById(id); if (b) b.hidden = !st.city; } }
  function applyCast(warm) { for (const sp of SPECIES) sim.pop[sp.key] = 0; Object.assign(sim.pop, castPop(X.P)); S.count = sim.POP_TOTAL; EcologySim.setCount(sim);   // count = POP_TOTAL: the numbers given are the numbers spawned
    for (const f of sim.fish) { f.steer = null; f._lane = f._s = f._ph = f._hx = null; } seedR = 12345; X.R.st = []; X.R.wb = null; if (warm) X.warm(warm); }
  X.set = function (id) { X.places = allPlaces(); if (!X.places[id]) id = 'world';
    if (id !== 'world' && !snap) { snap = { S: {}, pop: Object.assign({}, sim.pop) }; for (const k of SKEYS) snap.S[k] = S[k]; }
    for (const f of sim.fish) f.steer = null;
    if (id === 'world') { if (snap) { for (const k of SKEYS) if (k !== 'style') S[k] = snap.S[k]; Object.assign(sim.pop, snap.pop); EcologySim.setCount(sim); setStyle(snap.S.style); snap = null; }
      X.P = null; X.R = null; X.bodies = X.worldBodies; window.PlaceFlora && PlaceFlora.clear(); for (const b of ['r-city', 'r-tower']) { const e = document.getElementById(b); if (e) e.hidden = false; } }
    else { X.P = X.places[id]; X.R = { st: [] }; X.id = id; applySetting(); X.R.c = centerOf(X.P); X.R.paths = buildPaths(X.P, X.R.c); X.bodies = (X.P.look && X.P.look.creatures) || 'specimen'; applyCast(25); X.replant(); }
    X.id = id; X.shotT = 0; X.shot = null; cam.fc = null; ECO && (ECO._looksFor = null); syncLink(); ui.refresh && ui.refresh(); return id; };
  X.reset = () => { const s = saved(); delete s[X.id]; try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* */ } X.set(X.id); };
  X.hides = (layer) => !!(X.P && X.P.setting && !X.P.setting.city && ['city', 'towers', 'walkers', 'terrain'].includes(layer)) || !!(X.P && layer === 'terrain');
  X.flat = () => X.P && X.P.look && X.P.look.flat;
  X.colour = () => !!(X.P && X.bodies === 'flat' && X.flat());
  X.paint = (sp) => { const F = X.flat(); const c = X.colour() && F.colours && F.colours[sp.key]; return c ? (c._ || (c._ = [hex(c[0]), hex(c[1])])) : null; };
  X.fill = () => (X.colour() && X.flat().fill) || 0;
  X.tick = function (dt) { if (!X.P) return; runCast(dt); X.shotT += dt; };
  X.warm = (sec) => { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) { EcologySim.step(sim, 1 / 30); runCast(1 / 30); } };

  // ------------------------------------------------------------------ drawing the water and its light
  const W = () => (X.P.setting && X.P.setting.water) || null;
  X.bg = () => X.P && W() ? hex(W().fog) : null;
  X.under = function (t) { if (!X.P || !W()) return; const p = progs().floor, u = p.u, F = W(), sh = shadows();
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    gl.useProgram(p.p); gl.bindVertexArray(quadVAO);
    gl.uniformMatrix4fv(u.uIVP, false, cam.ivp); gl.uniform3fv(u.uEye, cam.eye); gl.uniform1f(u.uFloorZ, tankDepth()); gl.uniform1f(u.uT, t);
    gl.uniform1f(u.uScale, F.scale || 400); gl.uniform1f(u.uRib, F.ribbons ?? 0.8); gl.uniform1f(u.uRibK, 1); gl.uniform1f(u.uNet, F.net ?? 0.1); gl.uniform1f(u.uFogK, F.fogK ?? 0.0001); gl.uniform1f(u.uMoon, F.moon || 0);
    gl.uniform3fv(u.uDeep, hex(F.deep)); gl.uniform3fv(u.uShallow, hex(F.shallow)); gl.uniform3fv(u.uRibC, hex(F.light)); gl.uniform3fv(u.uFogC, hex(F.fog)); gl.uniform3fv(u.uShC, hex(F.shade));
    gl.uniform2f(u.uTank, tankW(), tankH());
    const A = new Float32Array(64 * 4), B = new Float32Array(64 * 4), n = Math.min(64, sh.length);
    for (let i = 0; i < n; i++) { const s = sh[i]; A.set([s[0], s[1], s[2], s[3]], i * 4); B.set([s[4], s[5], s[6], 0], i * 4); }
    gl.uniform4fv(u.uSh, A); gl.uniform4fv(u.uShB, B); gl.uniform1i(u.uShN, n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); };
  X.over = function (t) { if (!X.P) return; const st = X.P.setting || {}, F = st.surface, Fl = W() || {};
    if (F && F.opacity > 0) { const p = progs().surf, u = p.u;
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(p.p); gl.bindVertexArray(quadVAO);
      gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform2f(u.uTank, tankW(), tankH()); gl.uniform1f(u.uSurfZ, F.level * tankDepth()); gl.uniform1f(u.uT, t);
      gl.uniform1f(u.uScale, (Fl.scale || 400) * 1.1); gl.uniform1f(u.uA, F.opacity); gl.uniform1f(u.uRib, F.ribbons || 0); gl.uniform1f(u.uRibK, 1); gl.uniform1f(u.uMoon, F.moon || 0);
      gl.uniform3fv(u.uCol, hex(F.colour)); gl.uniform3fv(u.uRibC, hex(Fl.light || '#ffffff')); gl.uniform3fv(u.uEye, cam.eye); gl.uniform1f(u.uBelow, cam.eye[2] > F.level * tankDepth() ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true); gl.depthFunc(gl.LESS); }
    const O = st.shafts || {}, p = progs().over, u = p.u;
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(p.p); gl.bindVertexArray(quadVAO);
    gl.uniform1f(u.uT, t); gl.uniform1f(u.uShaft, O.amount || 0); gl.uniform1f(u.uFade, X.fade); gl.uniform1f(u.uVig, st.vignette || 0); gl.uniform1f(u.uAsp, vw / Math.max(1, vh));
    gl.uniform3fv(u.uShaftC, hex(O.colour || '#ffffff')); gl.uniform3fv(u.uFadeC, [0, 0, 0]); gl.uniform2fv(u.uSrc, [0.5, 1.25]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); };

  // ------------------------------------------------------------------ the creatures, solid: the shared renderer (packages/render/ecology-render.js) in this page's context
  let ECO = null;
  const toHex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  function styledLook(sp, savedLook) { const Y = (X.P.look && X.P.look.styled) || {}, row = (X.P.cast || []).find((r) => r.species === sp.key);
    let L = (Y.looks && Y.looks[sp.key]) || (Y.all ? Object.assign({}, Y.all) : null) || (savedLook && savedLook.material !== 'own' ? savedLook : null);   // all: one look for every creature (Lantern Vigil's Energy)
    if (L && L.preset) L = EcologyRender.preset(L.preset, L);   // { preset: 'energy', colors: [...] }: the material's start, then the look's own
    if (!L) { const hi = sp.colHi || [0.8, 0.8, 0.8], lo = sp.colLo || hi.map((v) => v * 0.5); L = { material: 'skin', pattern: 'veins', colors: [toHex(hi), toHex(lo.map((v) => v * 0.6)), toHex(hi), toHex(hi), toHex(lo)] }; }
    if (row && row.stone) L = Object.assign({}, L, Y.stone || { material: 'golem', grow: 'moss', growAmount: 0.5 });   // stone keeps the creature's own colours
    if (Y.paint) L = Object.assign({}, L, Y.paint);
    return L; }
  X.worldBodies = 'specimen';   // World itself: its creatures in 3D as Specimen draws them, or World Scene's own line drawing
  X.solid = () => !!(X.bodies !== 'flat' && window.EcologyRender && window.PartSolid);
  X.creatures = function (t) { const ER = window.EcologyRender, ES0 = window.EcologySpeciesPristine || EcologySpecies;
    if (!ECO) { ECO = ER.create(canvas, ES0, { maxFish: MAX_FISH }); ECO._looksFor = null; }
    const lk = X.id + ':' + X.bodies + ':' + X.lookRev; if (ECO._looksFor !== lk) { ECO._looksFor = lk; const CL = window.CreatureLooks || {};
      ES0.SPECIES.forEach((sp, i) => { const sv = CL[sp.key]; ER.setLook(ECO, i, X.bodies === 'styled' && X.P ? styledLook(sp, sv) : (sv && sv.material !== 'own' ? sv : null)); }); }
    const dist = X.lastDist || cam.refDist, px = dist * 2 * Math.tan(20 * DEG) / (vh * dpr), Y = (X.P && X.P.look && X.P.look.styled) || {};
    // as Specimen draws them (cores 1, the Shape tab's shapes, dark 0, lit 1, lines in each look's own colour); styled: white lines, lighter
    const R = X.bodies === 'styled' ? { lineColor: [1, 1, 1], lineAlpha: Y.lineAlpha ?? 0.3 } : {}, shapes = window.CreatureShapes && Object.keys(window.CreatureShapes).length ? { shape: window.CreatureShapes } : undefined;
    ER.drawInto(ECO, { sim, time: t, vp: cam.vp, eye: cam.eye, refDist: cam.refDist, shift: cam.shift, shiftX: cam.shiftX, dpr, px, lineW: px * dpr * 0.5,
      render: Object.assign({ cores: 1, core: shapes, coreWorker: X.manualOn ? false : undefined, wings: S.wings, dark: 0, shimmer: 0, lit: 1 }, R) });
    gl.bindVertexArray(null); gl.useProgram(null); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); };
  X.lookRev = 0;

  // ------------------------------------------------------------------ plants (place-flora.js: Forge Scenes' plantings in this tank)
  // a Forge Scenes world unit in tank units: its koi is 0.62 long, so the creatures here set the scale
  function worldUnit() { const ls = sim.fish.filter((f) => !f.dead).slice(0, 60).map((f) => EcologySim.bodyLen(sim, f)).filter((v) => v > 0).sort((a, b) => a - b);
    return ls.length ? ls[ls.length >> 1] / 0.8 : tankW() / 70; }
  function towerInfo() { if (typeof placedTowers === 'undefined') return [];
    return placedTowers.filter((tw) => tw && tw.model && tw.built && tw.built.parts).map((tw) => { const m = tw.model, s = m[0]; let top = 0, foot = 0;
      for (const p of tw.built.parts) { const P = p.positions; if (!P) continue; for (let i = 0; i < P.length; i += 3) { if (P[i + 1] > top) top = P[i + 1]; if (P[i + 1] < 0.08 * (top || 1)) foot = Math.max(foot, Math.hypot(P[i], P[i + 2])); } }
      return { parts: tw.built.parts, model: m, top: top * s, foot: [m[12], m[13], foot * s * 1.1] }; }); }
  X.replant = function () { if (!window.PlaceFlora) return; const P = X.P, F = P && P.flora; if (!F) { PlaceFlora.clear(); return; }
    const st = P.setting || {}, TD = tankDepth();
    X.R.flora = PlaceFlora.plant(F, { gl, TW: tankW(), TH: tankH(), TD, U: worldUnit(), C: X.R.c, seed: 7, surfZ: ((st.surface && st.surface.level) ?? 0) * TD,
      towers: st.city ? towerInfo() : [], city: st.city ? { r: CITY_FOOTPRINT_FRAC * tankW() * 0.9 } : null }); };
  X.plants = function (t) { if (!X.P || !X.P.flora || !window.PlaceFlora || !PlaceFlora.count) return;
    const total = X.total() || 30, u = ((X.shotT % total) + total) % total / total, grow = PlaceFlora.timelapse ? ease(clamp((u - 0.02) / 0.85, 0, 1)) * 16 : undefined;
    const Fl = W() || {}, sky = Fl.fog ? hex(Fl.fog) : [0, 0, 0], v = [X.R.c[0] - cam.eye[0], X.R.c[1] - cam.eye[1]], vl = Math.hypot(v[0], v[1]) || 1;
    PlaceFlora.draw(gl, { vp: cam.vp, eye: cam.eye, shift: cam.shift, shiftX: cam.shiftX, time: t, grow, fz: tankDepth(), view: [v[0] / vl, v[1] / vl], sky, ink: X.P.flora.ink ? hex(X.P.flora.ink) : undefined });
    gl.bindVertexArray(null); gl.useProgram(null); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); };

  // ------------------------------------------------------------------ for a recorder: step by hand
  X.manual = (on) => { X.manualOn = !!on; };
  X.step = (dt) => { EcologySim.step(sim, dt); try { forgeDriftTick(dt); stepCityWalkers(dt); stepForgeGround(dt); } catch (err) { /* hosts without these */ } t += dt; X.tick(dt); updateCamera(dt); draw(t); };
  X.hidePanels = () => { const b = document.getElementById('hide-all'); if (b && !document.body.classList.contains('bare')) b.click(); };
  function syncLink() { const q = new URLSearchParams(location.search); q.delete('env'); if (X.id === 'world') q.delete('place'); else q.set('place', X.id); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }

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
        <p class="note">Edits are kept in this browser. Copy JSON gives the place as data, to paste into places.js. Reset puts a built-in place back as shipped.</p>
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
  ui.status = () => { const s = document.getElementById('pl-status'); if (!s) return; if (!X.P) { s.innerHTML = ''; s.appendChild(el('span', {}, 'World: the city and open water. Pick a place to edit it. Creatures ')); s.appendChild(seg('pl-wbodies', [['specimen', '3D'], ['flat', 'Lines']], X.worldBodies, (v) => { X.worldBodies = X.bodies = v; ECO && (ECO._looksFor = null); })); return; }
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
    const c = el('div', { class: 'grp' }, '<span class="lbl">City</span>'); c.appendChild(seg('pl-city', [['on', 'Standing'], ['off', 'None']], st.city ? 'on' : 'off', (v) => { st.city = v === 'on'; if (st.city && !st.center) st.center = 'tower'; edited('setting'); edited('paths'); })); box.appendChild(c);
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
    const g = el('div', { class: 'grp' }, '<span class="lbl">Camera</span>'); g.appendChild(seg('pl-cam', [['on', 'Directed'], ['off', 'Free']], X.shotsOn ? 'on' : 'off', (v) => { X.shotsOn = v === 'on'; })); box.appendChild(g);
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

  // ------------------------------------------------------------------ start
  window.ENVX = X;
  X.places = allPlaces();
  buildUI(); ui.refresh();
  const q = new URLSearchParams(location.search);
  if (['specimen', 'styled', 'flat'].includes(q.get('bodies'))) X.bodyOverride = q.get('bodies');
  if (q.get('shots') === '0') X.shotsOn = false;
  const want = q.get('place') || q.get('env'); if (want && want !== 'world') { X.set(want); if (X.bodyOverride) { X.bodies = X.bodyOverride; ui.refresh(); } }
})();
