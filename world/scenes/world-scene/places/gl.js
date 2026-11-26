// world/scenes/world-scene/places/gl.js -- window.ENVX_GL: the shaders a place draws with in World Scene's own WebGL2 pipeline:
// the floor (sand, ribbons of light, the shadows of what swims and flies over it), the water's surface seen from above or below, and the
// light over the frame (shafts, the vignette, the dip to dark at a cut). places/engine.js draws with them; they compile on first use, with
// World Scene's own program() and QUAD_VS.
(function () {
  'use strict';
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
  window.ENVX_GL = { progs };
})();
