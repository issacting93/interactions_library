// world/scenes/world-scene/set-pieces.js -- window.ENVX: environments for World Scene, each a composed set piece.
//
// An environment is a place built around its creatures: what stands there (or not), the water and its light, who is
// there and what they do (choreography, steered through the sim's own f.steer), and the shots a camera takes of it.
// "World" is the page as it always was; switching to a set piece takes a snapshot of the settings and the population,
// and switching back puts them back.
//
// It runs inside World Scene's own pipeline: it reads the page's globals (gl, cam, S, sim, SPECIES, program, QUAD_VS,
// quadVAO, tankW/H/Depth ...) and the page calls it at five seams:
//   ENVX.tick(dt)            after the sim steps: the choreography
//   ENVX.camera(dt)          in updateCamera: the shot, as { c, yaw, tilt, dist }, or null to leave the camera alone
//   ENVX.under(t)            just after the frame is cleared: the floor (pond bed, caustic light, shadows)
//   ENVX.over(t)             before the frame is shown: the water's surface, light shafts, the dip between shots
//   ENVX.hides(layer)        'city' | 'towers' | 'terrain' | 'walkers' : a layer the set piece leaves out
// Z runs down: z = 0 is the top of the tank (nearest an overhead camera), z = tankDepth() the floor.
// Open one with ?env=<id> (crossing, spires, vigil). ?shots=0 leaves the camera to you.
(function () {
  'use strict';
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k, ease = (v) => v * v * (3 - 2 * v);
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
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

  // ------------------------------------------------------------------ helpers the set pieces use
  const keyOf = (f) => SPECIES[f.sp].key, bl = (f) => EcologySim.bodyLen(sim, f);
  const live = (keys) => sim.fish.filter((f) => !f.dead && keys.includes(keyOf(f)));
  const head = (f) => [f.chain[0], f.chain[1]];
  function steerTo(f, x, y, spd) { const dx = x - f.x, dy = y - f.y, l = Math.hypot(dx, dy) || 1; f.steer = { x: dx / l * spd, y: dy / l * spd, keep: true }; }
  function holdZ(f, z, k) { f.z += (z - f.z) * k; f.zGoal = z; const TD = tankDepth(); if (f.cz) for (let i = 0; i < f.cz.length; i++) f.cz[i] += (z * TD - f.cz[i]) * k; }
  // a closed path: a rounded racetrack (or an ellipse at sq = 2) round c, a radius along and across, turned by ang
  function loop(cx, cy, ra, rb, ang, sq) { const ca = Math.cos(ang), sa = Math.sin(ang), e = 2 / (sq || 2);
    const at = (s) => { const u = s * TAU, cu = Math.cos(u), su = Math.sin(u), x = Math.sign(cu) * Math.pow(Math.abs(cu), e) * ra, y = Math.sign(su) * Math.pow(Math.abs(su), e) * rb; return [cx + x * ca - y * sa, cy + x * sa + y * ca]; };
    const near = (x, y, s0) => { let bs = s0, bd = 1e18; const N = s0 == null ? 96 : 16, span = s0 == null ? 1 : 0.12; for (let i = 0; i <= N; i++) { const s = s0 == null ? i / N : s0 - span / 2 + span * i / N, p = at(s), d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; bs = s; } } return ((bs % 1) + 1) % 1; };
    const tan = (s) => { const a = at(s - 0.002), b = at(s + 0.002), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    return { at, near, tan }; }
  // a stream of creatures along a loop: each keeps a lane across it and a pace, and the stream has narrows and widenings
  function stream(list, L, width, spd, z0, z1, dt, dir) { dir = dir || 1; for (const f of list) {
      if (f._lane == null) { f._lane = rnd(-1, 1) * Math.pow(rnd(), 0.6); f._pace = rnd(0.85, 1.15); f._zl = rnd(); f._s = null; }
      f._s = L.near(f.x, f.y, f._s); const s2 = f._s + 0.018 * f._pace * dir, p = L.at(s2), tg = L.tan(s2), w = width * (0.75 + 0.35 * Math.sin(s2 * TAU * 3 + 1.3));
      steerTo(f, p[0] - tg[1] * f._lane * w, p[1] + tg[0] * f._lane * w, spd * f._pace); holdZ(f, lerp(z0, z1, f._zl), Math.min(1, dt * 0.8)); } }
  // a formation along a loop: the first is the leader; the rest hold slots back and to either side of it (an echelon)
  function formation(list, L, spd, z, slots, dt, st) { if (!list.length) return; const ld = list[0];
    st.s = L.near(ld.x, ld.y, st.s); const p = L.at(st.s + 0.03), tg = L.tan(st.s);
    steerTo(ld, p[0], p[1], spd); holdZ(ld, z, Math.min(1, dt * 0.6)); const h = [Math.cos(ld.ang), Math.sin(ld.ang)], b = bl(ld);
    list.slice(1).forEach((f, i) => { const sl = slots[i % slots.length], tx = ld.x - h[0] * sl[0] * b - h[1] * sl[1] * b, ty = ld.y - h[1] * sl[0] * b + h[0] * sl[1] * b, d = Math.hypot(tx - f.x, ty - f.y);
      steerTo(f, tx, ty, clamp(spd * (0.75 + d / (b * 2.5)), spd * 0.6, spd * 1.5)); holdZ(f, z + sl[2], Math.min(1, dt * 0.6)); }); }
  const shadowsOf = (list, sun, st) => { const TD = tankDepth(), out = [];
    for (const f of list) { const h = TD - f.z * TD, b = bl(f), sp = SPECIES[f.sp]; out.push([f.x + sun[0] * h * 0.35, f.y + sun[1] * h * 0.35, b * (1 + h / TD * 0.25), f.ang, st.wing ? st.wing(f) : 1.6, clamp(0.35 + h / TD * 0.6, 0.3, 0.95), st.k * (1 - h / TD * 0.45)]); }
    return out; };

  // the cast: the rest of the bestiary, each in a role in its layer of the place. A role is { keys, n, role, z: [top, bottom] (0..1 of the depth), ... }
  //   drift  : turning slowly round a centre (at(e) or the middle), within rad (of the tank's width), bobbing
  //   patrol : along one of the place's paths (path: name on e), in a lane of width w, dir -1 against the stream
  //   escort : behind and beside the first of `lead`, back 1.5 to `back` body lengths of it, spread `side`
  //   bed    : along the floor, slow, now and then pausing
  const ROLES = {
    drift(list, r, e, dt) { const c = r.at ? r.at(e) : (e.c || e.C || [tankW() / 2, tankH() / 2]);
      for (const f of list) { if (f._ph == null) { f._ph = rnd(0, TAU); f._r = (r.rad0 || 0) * tankW() + Math.sqrt(rnd()) * (r.rad - (r.rad0 || 0)) * tankW(); f._zz = rnd(r.z[0], r.z[1]); f._w = (rnd() < 0.5 ? -1 : 1) * rnd(0.5, 1); }
        const a = f._ph + sim.time * 0.03 * f._w * (r.turn || 1), x = c[0] + Math.cos(a) * f._r, y = c[1] + Math.sin(a) * f._r * (r.squash || 1);
        steerTo(f, x, y, r.spd || 0.3); holdZ(f, f._zz + (r.bob || 0) * Math.sin(sim.time * 0.5 + f._ph * 3), Math.min(1, dt * 0.4)); } },
    patrol(list, r, e, dt) { const L = e[r.path]; if (L) stream(list, L, (r.w || 0.05) * tankW(), r.spd || 0.45, r.z[0], r.z[1], dt, r.dir || 1); },
    escort(list, r, e, dt) { const ld = live(r.lead)[0]; if (!ld) return ROLES.drift(list, Object.assign({ rad: 0.3 }, r), e, dt); const h = [Math.cos(ld.ang), Math.sin(ld.ang)], b = bl(ld);
      for (const f of list) { if (f._ph == null) { f._ph = rnd(0, TAU); f._bk = rnd(1.5, r.back || 4); f._sd = rnd(-1, 1) * (r.side || 1.5); f._zz = rnd(r.z[0], r.z[1]); }
        const sd = f._sd + 0.25 * Math.sin(sim.time * 0.7 + f._ph), tx = ld.x - h[0] * f._bk * b - h[1] * sd * b, ty = ld.y - h[1] * f._bk * b + h[0] * sd * b, d = Math.hypot(tx - f.x, ty - f.y);
        steerTo(f, tx, ty, clamp(0.4 + d / (b * 3), 0.35, 1.3)); holdZ(f, f._zz, Math.min(1, dt * 0.5)); } },
    bed(list, r, e, dt) { const c = r.at ? r.at(e) : (e.c || e.C || [tankW() / 2, tankH() / 2]);
      for (const f of list) { if (f._ph == null) { f._ph = rnd(0, TAU); f._r = Math.sqrt(rnd()) * r.rad * tankW(); }
        const go = Math.sin(sim.time * 0.2 + f._ph * 5) > -0.3, a = f._ph + sim.time * 0.012, x = c[0] + Math.cos(a) * f._r, y = c[1] + Math.sin(a) * f._r;
        if (go) steerTo(f, x, y, r.spd || 0.2); else f.steer = { x: 0, y: 0, keep: true }; holdZ(f, r.z[0], Math.min(1, dt * 0.5)); } },
  };
  const castPop = (E) => { const o = Object.assign({}, E.pop || {}); for (const r of E.cast || []) { const n = r.n, ks = r.keys; ks.forEach((k, i) => { o[k] = (o[k] || 0) + Math.round(n / ks.length + (i < n % ks.length ? 0.5 : 0)); }); } return o; };

  // shots: { len (s), cam(v, e) -> { c: [x, y, z], yaw (deg), tilt (deg), dist } }, v from 0 to 1 over the shot
  const fov = 40 * DEG, distFor = (span) => span / (2 * Math.tan(fov / 2));   // the distance at which `span` fills the picture's height
  const seen = {};   // eased camera state per set piece

  // ------------------------------------------------------------------ the set pieces
  const ENVS = {
    world: { title: 'World', note: 'The city, its towers and the open water, as the page has always been.' },

    // ---- Glass Crossing: a river of koi under the surface of a teal pond; three Glass Mantas cross over it in an echelon,
    // their shadows sliding over the bed; ribbons of light lie across everything. Seen from straight above, it is three
    // layers moving against each other: bed, koi, mantas.
    crossing: {
      title: 'Glass Crossing', note: 'Three Glass Mantas cross a river of koi, seen from above through the water.',
      style: 'glitch', colour: true, hide: ['city', 'towers', 'terrain', 'walkers'],
      S: { snow: false, glow: 0.55, shimmer: 0, trail: 0, beh: 'off', flow: 'free', mode: 'sigil', dz: 0.8, routeAtmo: false, wings: 1 },
      pop: { koi: 120, 'koi-longfin-showa': 44, manta: 3 },
      // painted: warmth held low (it turns pale colours tan), more detail, the ink outline on (it reads on the light water)
      allPaint: { paint: 1, paintSteps: 4, paintBrush: 1.1, paintWobble: 0.35, paintTemp: 0.32, paintDetail: 0.7, paintOutline: 0.75 },
      solidRender: { lineAlpha: 0.14 },
      looks: { koi: { material: 'ember', pattern: 'koi', colors: ['#ff8a1e', '#3a1406', '#ffc45a', '#ffe2a8', '#ff5a1a'], emissive: 0.35 } },
      paint: { koi: ['#ffc061', '#ff6a12'], 'koi-longfin-showa': ['#fff7ea', '#e2382a'], manta: ['#ffffff', '#cfe8ff'], swift: ['#ffffff', '#9fc3d6'], 'ringed-lance-swift': ['#ffffff', '#b9a6e6'], 'abyssal-lance-swift': ['#eaf6ff', '#6fa3c8'] }, fill: 0.9,
      // over the surface: swifts trailing the mantas, two monarchs high and slow; in the water between the surface and the koi:
      // glass stars and comb drifters hanging still; two frond serpents swimming up the river against the koi; on the bed, scavengers
      cast: [
        { keys: ['swift', 'ringed-lance-swift', 'abyssal-lance-swift'], n: 16, role: 'escort', lead: ['manta'], back: 7, side: 2.5, z: [0.03, 0.12] },
        { keys: ['ringed-lance-monarch'], n: 2, role: 'drift', rad: 0.32, z: [0.01, 0.04], spd: 0.25 },
        { keys: ['glass-star', 'comb-drifter'], n: 9, role: 'drift', rad: 0.3, z: [0.36, 0.48], spd: 0.14, bob: 0.02 },
        { keys: ['frond-serpent'], n: 2, role: 'patrol', path: 'river', dir: -1, w: 0.05, spd: 0.5, z: [0.58, 0.66] },
        { keys: ['plated-scavenger'], n: 5, role: 'bed', rad: 0.3, z: [0.95] },
      ],
      floor: { deep: '#0a3d66', shallow: '#21b48d', rib: '#e8fff0', ribK: 1.0, rib0: 1.1, net: 0.16, fog: '#0f5d6e', fogK: 0.00005, sh: '#05223a', scale: 330 },
      surf: { z: 0.3, col: '#2fb3a0', a: 0.12, rib: 0.3 },
      over: { shaft: 0, vig: 0.55 },
      // both paths are rounded loops whose near side runs through the middle of the tank, crossing there at about 75 degrees:
      // the river of koi one way, the mantas' flight the other
      setup(e) { const TW = tankW(), TH = tankH(), C = [TW / 2, TH / 2], aR = -1.05, aS = aR + 1.3, rR = TW * 0.2, rS = TW * 0.32;
        e.C = C; e.river = loop(C[0] - Math.sin(aR) * rR, C[1] + Math.cos(aR) * rR, TH * 0.34, rR, aR, 4); e.sky = loop(C[0] - Math.sin(aS) * rS, C[1] + Math.cos(aS) * rS, TH * 0.36, rS, aS, 3); e.form = {}; },
      tick(e, dt) { stream(live(['koi', 'koi-longfin-showa']), e.river, tankW() * 0.06, 0.62, 0.55, 0.85, dt);
        formation(live(['manta']), e.sky, 0.42, 0.07, [[1.25, -1.05, 0.02], [1.25, 1.05, 0.04]], dt, e.form); },
      shadows(e) { return shadowsOf(live(['manta']), [0.45, 0.3], { k: 0.55, wing: () => 2.1 }).concat(shadowsOf(live(['koi', 'koi-longfin-showa']), [0.45, 0.3], { k: 0.32, wing: () => 0.9 })); },
      // the river point nearest the lead manta: the overhead camera drifts with it, so the river stays in the picture and the mantas cross it
      // the densest stretch of the river (koi counted along it in 48 bins, smoothed): the overhead and from-beneath shots look there
      watch(e) { const H = new Float32Array(48); for (const f of live(['koi', 'koi-longfin-showa'])) if (f._s != null) H[(f._s * 48 | 0) % 48]++;
        let bi = 0, bv = -1; for (let i = 0; i < 48; i++) { const v = H[i] * 2 + H[(i + 1) % 48] + H[(i + 47) % 48]; if (v > bv) { bv = v; bi = i; } }
        if (e.wb == null || bv > (e.wbv || 0) * 1.6) { e.wb = bi; } e.wbv = bv; const q = e.river.at((e.wb + 0.5) / 48); const s = e.wt || (e.wt = q.slice()); s[0] += (q[0] - s[0]) * 0.02; s[1] += (q[1] - s[1]) * 0.02; return s; },
      shots: [
        { name: 'above', len: 12, cam: (v, e) => { const c = ENVS.crossing.watch(e); return { c: [c[0], c[1], tankDepth() * 0.4], yaw: lerp(-6, 4, v), tilt: 2, dist: distFor(tankH() * lerp(0.3, 0.26, ease(v))) }; } },
        { name: 'ride', len: 11, cam: (v, e) => { const m = live(['manta'])[0]; if (!m) return null; const s = e.st || (e.st = { c: [m.x, m.y], y: 0 }); s.c[0] += (m.x - s.c[0]) * 0.06; s.c[1] += (m.y - s.c[1]) * 0.06;
            const want = Math.atan2(-Math.cos(m.ang), -Math.sin(m.ang)) / DEG; s.y += (((want - s.y) % 360 + 540) % 360 - 180) * 0.02; return { c: [s.c[0], s.c[1], m.z * tankDepth()], yaw: s.y, tilt: lerp(14, 26, v), dist: bl(m) * 3.6 }; } },
        // from under the koi, looking up through them at the surface and the mantas going over
        { name: 'beneath', len: 10, cam: (v, e) => { const c = ENVS.crossing.watch(e); return { c: [c[0], c[1], tankDepth() * 0.3], yaw: lerp(30, 55, v), tilt: 152, dist: tankDepth() * lerp(0.62, 0.55, ease(v)) }; } },
      ] },

    // ---- Drowned Spires: the city stands on the floor of a deep blue sea; light comes down through the surface in shafts,
    // jellies rise between the towers, a school of koi turns round the tallest one and two mantas glide over the roofs.
    spires: {
      title: 'Drowned Spires', note: 'The city under the sea: light shafts, jellies between the towers, koi circling the tallest.',
      style: 'route-blue', colour: false, hide: ['terrain'],
      S: { snow: true, glow: 0.8, shimmer: 0, trail: 0, beh: 'off', flow: 'free', mode: 'sigil', dz: 0.9, routeAtmo: false },
      pop: { koi: 60, jelly: 12, 'angler-tailed-jelly-af60': 6, manta: 2, wisp: 26 },
      // the old ones of the city turned to stone: the spine dragon, the colonies, siphons and anglers are golem, mossed and rusted, their cracks lit sea-blue;
      // everything under a cool paint (little warmth, three steps, no ink: the water is dark)
      golem: ['dragon', 'chain-colony', 'siphon', 'angler', 'puffer-plated-angler-25d9'],
      golemLook: { material: 'golem', pattern: 'veins', colors: ['#5f6a6c', '#141a1c', '#5fd8ff', '#c9d6d4', '#6f7a66'], grow: 'moss', growAmount: 0.55, growClump: 0.6, lumps: 0.6, roughness: 0.7, grain: 1, vein: 0.5, emissive: 0.15 },
      allPaint: { paint: 0.85, paintSteps: 3, paintBrush: 1.3, paintWobble: 0.25, paintTemp: 0.18, paintDetail: 0.5, paintOutline: 0 },
      solidRender: { lineAlpha: 0.22 },
      // chain colonies and siphons hanging between the towers; lantern anglers and plated anglers low by the main tower;
      // a centiwyrm coiling round it the other way from the koi; a spine dragon and eels patrolling wide; comb drifters high up in the light
      cast: [
        { keys: ['chain-colony', 'siphon'], n: 7, role: 'drift', rad: 0.42, rad0: 0.12, z: [0.3, 0.6], spd: 0.12, bob: 0.03 },
        { keys: ['angler', 'puffer-plated-angler-25d9'], n: 5, role: 'drift', rad: 0.18, rad0: 0.06, z: [0.82, 0.9], spd: 0.15, turn: 0.6 },
        { keys: ['pearl-chasing-centiwyrm'], n: 2, role: 'patrol', path: 'ring', dir: -1, w: 0.03, spd: 0.45, z: [0.45, 0.55] },
        { keys: ['dragon', 'eel'], n: 4, role: 'patrol', path: 'wide', w: 0.08, spd: 0.4, z: [0.22, 0.4] },
        { keys: ['comb-drifter'], n: 6, role: 'drift', rad: 0.35, z: [0.1, 0.2], spd: 0.1, bob: 0.03 },
      ],
      floor: { deep: '#06142e', shallow: '#13406a', rib: '#7fd8ff', ribK: 0.9, rib0: 0.45, net: 0.22, fog: "#071a36", fogK: 0.00028, sh: "#020814", scale: 420 },
      surf: { z: 0.02, col: '#3d7fb8', a: 0.18, rib: 0.5 },
      over: { shaft: 0.55, shaftC: '#9fdcff', src: [0.5, 1.25], vig: 0.7 },
      setup(e) { const TW = tankW(), TH = tankH(), T = (typeof placedTowers !== 'undefined' && placedTowers[0]) || null;
        e.c = T ? [T.x != null ? T.x : T.pos[0], T.y != null ? T.y : T.pos[1]] : [TW / 2, TH / 2];
        e.ring = loop(e.c[0], e.c[1], TW * 0.16, TW * 0.16, 0, 2); e.wide = loop(e.c[0], e.c[1], TW * 0.42, TH * 0.3, 0.4, 2); e.form = {}; },
      tick(e, dt) { const ko = live(['koi']); stream(ko, e.ring, tankW() * 0.05, 0.55, 0.35, 0.7, dt);
        for (const f of live(['jelly', 'angler-tailed-jelly-af60'])) { if (f._ph == null) f._ph = rnd(0, TAU); f.steer = { x: Math.cos(f._ph + sim.time * 0.05) * 0.2, y: Math.sin(f._ph + sim.time * 0.05) * 0.2, keep: true }; holdZ(f, 0.45 + 0.35 * Math.sin(sim.time * 0.06 + f._ph), Math.min(1, dt * 0.3)); }
        formation(live(['manta']), e.wide, 0.38, 0.2, [[1.4, -1.2, 0.05]], dt, e.form); },
      shadows(e) { return shadowsOf(live(['manta']), [0.1, 0.25], { k: 0.4, wing: () => 2.1 }); },
      shots: [
        { name: 'descent', len: 11, cam: (v, e) => ({ c: [e.c[0], e.c[1], tankDepth() * lerp(0.35, 0.6, ease(v))], yaw: lerp(20, 50, v), tilt: lerp(40, 66, ease(v)), dist: tankH() * lerp(0.36, 0.26, ease(v)) }) },
        { name: 'orbit', len: 12, cam: (v, e) => ({ c: [e.c[0], e.c[1], tankDepth() * 0.62], yaw: 80 + v * 60, tilt: 74, dist: tankH() * 0.22 }) },
        { name: 'look up', len: 10, cam: (v, e) => ({ c: [e.c[0] + tankW() * 0.05, e.c[1], tankDepth() * 0.45], yaw: 230 + v * 25, tilt: lerp(118, 132, ease(v)), dist: tankDepth() * 0.5 }) },
      ] },

    // ---- Lantern Vigil: a pond at night; the surface holds the moon, Lantern Wisps gather over the water like lanterns
    // set afloat, Black Monarchs drift through them and koi turn slowly in the dark below.
    vigil: {
      title: 'Lantern Vigil', note: 'A night pond: the moon on the water, Lantern Wisps afloat, monarchs drifting, koi below.',
      style: 'glitch', colour: true, hide: ['city', 'towers', 'terrain', 'walkers'],
      S: { snow: false, glow: 1.7, shimmer: 0, trail: 0, beh: 'off', flow: 'free', mode: 'sigil', dz: 0.8, routeAtmo: false },
      pop: { wisp: 70, 'black-monarch': 7, 'ophan-halo-monarch': 3, 'koi-longfin-showa': 30 },
      // moths and eye-wings drawn in to the lanterns; a halo-eyed seraph high over all of it; a winged dragon circling the pond; glass stars faint under the water
      cast: [
        { keys: ['moth', 'eye-wing'], n: 10, role: 'drift', rad: 0.22, z: [0.12, 0.24], spd: 0.35, turn: 2.5, bob: 0.03 },
        { keys: ['halo-eyed-seraph'], n: 1, role: 'drift', rad: 0.18, z: [0.02, 0.03], spd: 0.18 },
        { keys: ['koi-winged-dragon-6cce'], n: 1, role: 'patrol', path: 'drift', w: 0.04, spd: 0.4, z: [0.1, 0.14] },
        { keys: ['glass-star'], n: 5, role: 'drift', rad: 0.3, z: [0.45, 0.6], spd: 0.1, bob: 0.02 },
      ],
      allPaint: { paint: 0.9, paintSteps: 3, paintBrush: 0.9, paintWobble: 0.5, paintTemp: 0.7, paintDetail: 0.35, paintOutline: 0 },
      solidRender: { lineAlpha: 0.25 },
      paint: { moth: ['#fff3d6', '#d8a060'], 'eye-wing': ['#e8f0ff', '#8fa8ff'], 'glass-star': ['#9fd8ff', '#3b6fa8'], wisp: ['#fff1b8', '#ff9a3c'], 'black-monarch': ['#e9e4ff', '#6c5a9c'], 'ophan-halo-monarch': ['#fff6d8', '#c9a2ff'], 'koi-longfin-showa': ['#d9d2c8', '#a8342a'] }, fill: 0.85,
      floor: { deep: "#010308", shallow: "#04121a", rib: "#4d8090", ribK: 0.8, rib0: 0.22, net: 0.04, fog: "#02060b", fogK: 0.00008, sh: "#000000", scale: 380, moon: 1 },
      surf: { z: 0.32, col: '#040c12', a: 0.08, rib: 0.1, moon: 1.0 },
      over: { shaft: 0, vig: 0.8 },
      setup(e) { const TW = tankW(), TH = tankH(); e.c = [TW * 0.5, TH * 0.42]; e.pond = loop(e.c[0], e.c[1], TW * 0.3, TW * 0.22, 0.2, 2); e.drift = loop(e.c[0], e.c[1] + TH * 0.04, TW * 0.36, TH * 0.18, -0.3, 2.2); },
      tick(e, dt) { stream(live(['koi-longfin-showa']), e.pond, tankW() * 0.06, 0.35, 0.62, 0.88, dt);
        for (const f of live(['wisp'])) { if (f._ph == null) { f._ph = rnd(0, TAU); f._r = Math.sqrt(rnd()) * tankW() * 0.3; f._zz = rnd(0.2, 0.3); }   // gathered over the water, bobbing, turning slowly round the middle
          const a = f._ph + sim.time * 0.025, x = e.c[0] + Math.cos(a) * f._r, y = e.c[1] + Math.sin(a) * f._r * 0.75; steerTo(f, x, y, 0.25); holdZ(f, f._zz + 0.02 * Math.sin(sim.time * 0.8 + f._ph), Math.min(1, dt * 0.5)); }
        for (const f of live(['black-monarch', 'ophan-halo-monarch'])) { if (f._ph == null) { f._ph = rnd(0, 1); f._s = null; } f._s = e.drift.near(f.x, f.y, f._s); const p = e.drift.at(f._s + 0.03), w = Math.sin(sim.time * 0.3 + f._ph * 9) * tankW() * 0.06; const tg = e.drift.tan(f._s); steerTo(f, p[0] - tg[1] * w, p[1] + tg[0] * w, 0.4); holdZ(f, 0.08 + f._ph * 0.12, Math.min(1, dt * 0.5)); } },
      shadows() { return []; },
      shots: [
        { name: 'above', len: 11, cam: (v, e) => ({ c: [e.c[0], e.c[1], tankDepth() * 0.4], yaw: lerp(-5, 8, v), tilt: 4, dist: distFor(tankH() * lerp(0.42, 0.36, ease(v))) }) },
        { name: 'low', len: 11, cam: (v, e) => ({ c: [e.c[0], e.c[1] + tankH() * 0.05, tankDepth() * 0.28], yaw: lerp(175, 195, v), tilt: 70, dist: tankH() * lerp(0.3, 0.24, ease(v)) }) },
        { name: 'monarch', len: 10, cam: (v, e) => { const m = live(['ophan-halo-monarch', 'black-monarch'])[0]; if (!m) return null; const s = e.ms || (e.ms = { c: [m.x, m.y], y: 0 }); s.c[0] += (m.x - s.c[0]) * 0.05; s.c[1] += (m.y - s.c[1]) * 0.05;
            const want = Math.atan2(-Math.cos(m.ang), -Math.sin(m.ang)) / DEG; s.y += (((want - s.y) % 360 + 540) % 360 - 180) * 0.02; return { c: [s.c[0], s.c[1], m.z * tankDepth()], yaw: s.y, tilt: 30, dist: bl(m) * 6 }; } },
      ] },
  };

  // ------------------------------------------------------------------ switching
  const X = { id: 'world', E: null, envs: ENVS, shotsOn: true, manualOn: false, shotT: 0, shot: null, fade: 0 };
  let snap = null;
  const SKEYS = ['count', 'snow', 'glow', 'shimmer', 'trail', 'beh', 'flow', 'mode', 'dz', 'routeAtmo', 'wings', 'view', 'orbit', 'style'];
  function setStyle(id) { if (S.style === id) return; if (window.ForgeCityHost && ForgeCityHost.setStyle) ForgeCityHost.setStyle(id); else { const sel = document.getElementById('style-pick'); if (sel) { sel.value = id; sel.dispatchEvent(new Event('change')); } } }
  X.set = function (id) {
    if (!ENVS[id]) id = 'world'; const E = ENVS[id];
    if (id !== 'world' && !snap) { snap = { S: {}, pop: Object.assign({}, sim.pop) }; for (const k of SKEYS) snap.S[k] = S[k]; }
    for (const f of sim.fish) { f.steer = null; f._lane = f._s = f._ph = null; }
    if (id === 'world') { if (snap) { for (const k of SKEYS) if (k !== 'style') S[k] = snap.S[k]; Object.assign(sim.pop, snap.pop); EcologySim.setCount(sim); setStyle(snap.S.style); snap = null; } }
    else { if (E.style) setStyle(E.style); Object.assign(S, E.S || {}); for (const sp of SPECIES) sim.pop[sp.key] = 0; Object.assign(sim.pop, castPop(E)); S.count = sim.POP_TOTAL; EcologySim.setCount(sim);   // count = POP_TOTAL: the sim's targets are then the numbers given, not scaled; a species left out would default to 4
      seedR = 12345; E._ = {}; E.setup && E.setup(E._); X.E = E; X.warm(E.warm || 25); }
    X.id = id; X.E = id === 'world' ? null : E; X.shotT = 0; X.shot = null; cam.fc = null;
    const sel = document.getElementById('env-pick'); if (sel && sel.value !== id) sel.value = id;
    const note = document.getElementById('env-note'); if (note) note.textContent = E.note || '';
    return id; };
  X.paint = (sp) => { const P = X.E && X.E.paint; if (!P) return null; const c = P[sp.key]; return c ? (c._ || (c._ = [hex(c[0]), hex(c[1])])) : null; };
  X.fill = () => (X.E && X.E.fill) || 0;
  // run the place for a while without drawing, so its creatures are already where the choreography puts them
  X.warm = (sec) => { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) { EcologySim.step(sim, 1 / 30); if (X.E) { X.E.tick && X.E.tick(X.E._, 1 / 30); runCast(X.E, 1 / 30); } } };
  X.hides = (layer) => !!(X.E && X.E.hide && X.E.hide.includes(layer));
  X.colour = () => !!(X.E && X.E.colour);
  const runCast = (E, dt) => { for (const r of E.cast || []) ROLES[r.role](live(r.keys), r, E._, dt); };
  X.tick = function (dt) { if (!X.E) return; X.E.tick && X.E.tick(X.E._, dt); runCast(X.E, dt); X.shotT += dt; };
  // the shot list, looped; the picture dips to dark over the last and first 0.45 s of each shot
  X.camera = function () { const E = X.E; X.lastDist = 0; if (!E || !X.shotsOn || !E.shots) return null; const total = E.shots.reduce((a, s) => a + s.len, 0);
    let tt = X.shotT % total, i = 0; while (i < E.shots.length - 1 && tt >= E.shots[i].len) { tt -= E.shots[i].len; i++; }
    const sh = E.shots[i]; if (X.shot !== sh) { X.shot = sh; E._.st = null; E._.rs = null; E._.ms = null; }
    X.fade = E.shots.length > 1 ? 1 - clamp(Math.min(tt, sh.len - tt) / 0.45, 0, 1) : 0;
    const o = sh.cam(tt / sh.len, E._); if (!o) return null; X.lastDist = o.dist; return { c: o.c, yaw: o.yaw * DEG, tilt: o.tilt * DEG, dist: o.dist }; };
  X.total = () => X.E && X.E.shots ? X.E.shots.reduce((a, s) => a + s.len, 0) : 0;

  // ------------------------------------------------------------------ drawing
  X.under = function (t) { const E = X.E; if (!E || !E.floor) return; const p = progs().floor, u = p.u, F = E.floor, sh = E.shadows ? E.shadows(E._) : [];
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    gl.useProgram(p.p); gl.bindVertexArray(quadVAO);
    gl.uniformMatrix4fv(u.uIVP, false, cam.ivp); gl.uniform3fv(u.uEye, cam.eye); gl.uniform1f(u.uFloorZ, tankDepth()); gl.uniform1f(u.uT, t);
    gl.uniform1f(u.uScale, F.scale); gl.uniform1f(u.uRib, F.rib0); gl.uniform1f(u.uRibK, F.ribK); gl.uniform1f(u.uNet, F.net); gl.uniform1f(u.uFogK, F.fogK); gl.uniform1f(u.uMoon, F.moon || 0);
    gl.uniform3fv(u.uDeep, hex(F.deep)); gl.uniform3fv(u.uShallow, hex(F.shallow)); gl.uniform3fv(u.uRibC, hex(F.rib)); gl.uniform3fv(u.uFogC, hex(F.fog)); gl.uniform3fv(u.uShC, hex(F.sh));
    gl.uniform2f(u.uTank, tankW(), tankH());
    const A = new Float32Array(64 * 4), B = new Float32Array(64 * 4), n = Math.min(64, sh.length);
    for (let i = 0; i < n; i++) { const s = sh[i]; A.set([s[0], s[1], s[2], s[3]], i * 4); B.set([s[4], s[5], s[6], 0], i * 4); }
    gl.uniform4fv(u.uSh, A); gl.uniform4fv(u.uShB, B); gl.uniform1i(u.uShN, n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); };
  X.over = function (t) { const E = X.E; if (!E) return;
    if (E.surf) { const p = progs().surf, u = p.u, F = E.surf, Fl = E.floor || {};
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(p.p); gl.bindVertexArray(quadVAO);
      gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform2f(u.uTank, tankW(), tankH()); gl.uniform1f(u.uSurfZ, F.z * tankDepth()); gl.uniform1f(u.uT, t);
      gl.uniform1f(u.uScale, (Fl.scale || 800) * 1.1); gl.uniform1f(u.uA, F.a); gl.uniform1f(u.uRib, F.rib); gl.uniform1f(u.uRibK, Fl.ribK || 1); gl.uniform1f(u.uMoon, F.moon || 0);
      gl.uniform3fv(u.uCol, hex(F.col)); gl.uniform3fv(u.uRibC, hex(Fl.rib || '#ffffff')); gl.uniform3fv(u.uEye, cam.eye); gl.uniform1f(u.uBelow, cam.eye[2] > F.z * tankDepth() ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true); gl.depthFunc(gl.LESS); }
    const O = E.over || {}, p = progs().over, u = p.u;
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(p.p); gl.bindVertexArray(quadVAO);
    gl.uniform1f(u.uT, t); gl.uniform1f(u.uShaft, O.shaft || 0); gl.uniform1f(u.uFade, X.fade); gl.uniform1f(u.uVig, O.vig || 0); gl.uniform1f(u.uAsp, vw / Math.max(1, vh));
    gl.uniform3fv(u.uShaftC, hex(O.shaftC || '#ffffff')); gl.uniform3fv(u.uFadeC, [0, 0, 0]); gl.uniform2fv(u.uSrc, O.src || [0.5, 1.2]);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); };
  // ------------------------------------------------------------------ Solid: the creatures as their 3D bodies (packages/render/ecology-render.js, the
  // kit-to-3D cores and the looks saved in Specimen), drawn into this page's own context and depth buffer, white lines over them as Forge Scenes draws them
  let ECO = null;
  // a creature's look in a set piece: its saved look (or, with none, one made from its own two colours), then the set piece's
  // stone for the species it turns to stone (golem: [keys], with golemLook), then the set piece's paint over all of it (paint: the Painted fields)
  const toHex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  function lookFor(E, sp, saved) {
    let L = saved && saved.material !== 'own' ? saved : null;
    if (!L && (E.allPaint || (E.golem && E.golem.includes(sp.key)))) { const hi = sp.colHi || [0.8, 0.8, 0.8], lo = sp.colLo || hi.map((v) => v * 0.5); L = { material: 'skin', pattern: 'veins', colors: [toHex(hi), toHex(lo.map((v) => v * 0.6)), toHex(hi), toHex(hi), toHex(lo)] }; }
    if (!L) return null;
    if (E.golem && E.golem.includes(sp.key)) L = Object.assign({}, L, E.golemLook);
    if (E.allPaint) L = Object.assign({}, L, E.allPaint);
    return L; }
  X.solidOn = true;
  X.solid = () => !!(X.E && X.E.solid !== false && X.solidOn && window.EcologyRender && window.PartSolid);
  X.creatures = function (t) { const ER = window.EcologyRender;
    if (!ECO) { const ES0 = window.EcologySpeciesPristine || EcologySpecies; ECO = ER.create(canvas, ES0, { maxFish: MAX_FISH }); ECO._looksFor = null; }
    if (ECO._looksFor !== X.id) { ECO._looksFor = X.id; const CL = window.CreatureLooks || {}, own = X.E.looks || {};   // the looks saved in Specimen, and the set piece's own for a species that has none
      (window.EcologySpeciesPristine || EcologySpecies).SPECIES.forEach((sp, i) => { ER.setLook(ECO, i, lookFor(X.E, sp, own[sp.key] || CL[sp.key])); }); }
    const dist = X.lastDist || cam.refDist, px = dist * 2 * Math.tan(20 * DEG) / (vh * dpr);   // one device pixel, in tank units, at what the camera looks at
    const R = X.E.solidRender || {};
    ER.drawInto(ECO, { sim, time: t, vp: cam.vp, eye: cam.eye, refDist: cam.refDist, shift: cam.shift, shiftX: cam.shiftX, dpr, px, lineW: px * dpr * (R.lineW || 0.3),
      render: Object.assign({ cores: 1, coreWorker: X.manualOn ? false : undefined, lineColor: [1, 1, 1], lineAlpha: 0.38, iris: 0.95, lookIris: 0.16, wings: S.wings, dark: 0, shimmer: 0, lit: 1 }, R) });
    gl.bindVertexArray(null); gl.useProgram(null); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); };
  X.bg = () => X.E && X.E.floor ? hex(X.E.floor.fog) : null;

  // ------------------------------------------------------------------ for a recorder: step by hand
  X.manual = (on) => { X.manualOn = !!on; };
  X.step = (dt) => { EcologySim.step(sim, dt); try { forgeDriftTick(dt); stepCityWalkers(dt); stepForgeGround(dt); } catch (err) { /* hosts without these */ } t += dt; X.tick(dt); updateCamera(dt); draw(t); };
  X.hidePanels = () => { const b = document.getElementById('hide-all'); if (b && !document.body.classList.contains('bare')) b.click(); };

  // ------------------------------------------------------------------ the picker (top of the drawer's Scene section)
  function ui() { const modes = document.querySelector('#drawer .modes'); if (!modes || document.getElementById('env-pick')) return;
    const h2 = modes.querySelector('h2'), grp = document.createElement('div'); grp.className = 'grp';
    grp.innerHTML = `<span class="lbl">Environment</span><select id="env-pick" class="panel-select" aria-label="Environment">${Object.entries(ENVS).map(([k, e]) => `<option value="${k}">${e.title}</option>`).join('')}</select>`;
    const g2 = document.createElement('div'); g2.className = 'grp'; g2.innerHTML = `<span class="lbl">Shots</span><div class="seg" role="radiogroup" aria-label="Set-piece camera"><input type="radio" name="env-shots" id="es-on" value="on" checked><label for="es-on">Directed</label><input type="radio" name="env-shots" id="es-off" value="off"><label for="es-off">Free</label></div>`;
    const g3 = document.createElement('div'); g3.className = 'grp'; g3.innerHTML = `<span class="lbl">Bodies</span><div class="seg" role="radiogroup" aria-label="Set-piece creatures"><input type="radio" name="env-bodies" id="eb-solid" value="solid" checked><label for="eb-solid">Solid</label><input type="radio" name="env-bodies" id="eb-flat" value="flat"><label for="eb-flat">Flat</label></div>`;
    g3.querySelectorAll('input').forEach((r) => r.addEventListener('change', () => { if (r.checked) X.solidOn = r.value === 'solid'; }));
    const note = document.createElement('p'); note.id = 'env-note'; note.style.cssText = 'margin:2px 0 8px;font-size:11px;opacity:0.65;line-height:1.35';
    h2.after(grp); grp.after(g2); g2.after(g3); g3.after(note);
    grp.querySelector('select').addEventListener('change', (ev) => { X.set(ev.target.value); syncLink(); });
    g2.querySelectorAll('input').forEach((r) => r.addEventListener('change', () => { X.shotsOn = r.value === 'on' && r.checked ? true : r.value === 'off' && r.checked ? false : X.shotsOn; }));
    function syncLink() { const q = new URLSearchParams(location.search); if (X.id === 'world') q.delete('env'); else q.set('env', X.id); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } }
  window.ENVX = X;
  ui();
  const q = new URLSearchParams(location.search); if (q.get('bodies') === 'flat') { X.solidOn = false; const r = document.getElementById('eb-flat'); if (r) r.checked = true; }
  if (q.get('shots') === '0') { X.shotsOn = false; const r = document.getElementById('es-off'); if (r) r.checked = true; }
  if (q.get('env')) X.set(q.get('env'));
})();
