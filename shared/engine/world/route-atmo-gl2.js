/* shared/engine/world/route-atmo-gl2.js — the "Night Route" look (after Kentucky Route Zero), as a
   native raw-WebGL2 layer that World Scene.html draws alongside its own live sim instead of
   switching renderers or pages. Everything here is decoration around the tank: it reads the host
   page's own city/tower placement (positions only) and draws into the host's already-bound
   framebuffer with the host's own camera matrix. It owns no simulation state and touches no DOM.

   World Scene.html's coordinate convention (see its buildPlacedTower comment): world X/Y are
   the tank's screen-plane, world Z is depth, and a local "up" (height) maps to a SMALLER world Z
   (rising toward the camera from a baseZ ground plane). Billboards here use worldUp = (0,0,-1) to
   match that -- an approximation of the host's own per-yaw `up` vector (updateCamera's M4.look
   argument), close enough for decoration that nothing in this file needs the host's camera code.

   Because World Scene's camera can orbit and tilt all the way to a straight-down "Top" view, a
   fixed single-facing backdrop (right for a camera that never moves)
   would vanish edge-on from some angles. So: ridges are a true closed RING around the city (always
   presents a wall toward an orbiting viewer standing near the tank, degenerates gracefully to a
   thin circle from directly above) instead of one arc behind a fixed "upstage" direction; pines and
   the moon/lantern glow are camera-facing billboards (read correctly even from Top view); pilgrims
   are small solid pyramids, not flat cards, so they don't disappear edge-on either.

     RouteAtmoGL2.create(gl)                 -> A (compiled programs + textures, call once)
     RouteAtmoGL2.buildWorld(gl, A, seed, opts) -> world (ring/pine/pilgrim/glow geometry, call
                                                    whenever the city regenerates)
     RouteAtmoGL2.dispose(gl, world)
     RouteAtmoGL2.updatePilgrims(world, dt)  -> advance the walk, call once per frame
     RouteAtmoGL2.drawSolid(gl, A, world, { vp, eye })        -> ridges + pines + pilgrims, opaque
     RouteAtmoGL2.drawGlow(gl, A, world, { vp, eye, t })      -> moon + lantern glow, additive
     RouteAtmoGL2.setStyle(gl, u, A, world, cam, tone)         -> put the style recipe's uniforms on any program
                                                                   that pastes StyleRecipes.GLSL (World Scene's
                                                                   tower shader uses it for the city)
     A.recipe = StyleRecipes.get(id)          -> which look to draw in (shared/look/style/style-recipes.js,
                                                 load it first); its atmo flags switch ridges, pines,
                                                 moon and pilgrims, light.glow sizes the lit windows

   The Route Zero rules everything here follows: no surface lighting -- colour is a
   stepped depth band from ink to fog, warmed only by distance to a lantern, in hard steps; each ridge and
   the floor is one flat band; standing things (pines) turn about the up axis only; every vertex stage
   applies the host camera's lens shift (cam.shift/shiftX) so the layer stays registered to the city.

   opts: { cx, cy, baseZ, cityRadius, tankW, tankH, tankDepth, hub: {x,y,z,height}, towers: [{x,y,z}] } */
(function () {
  "use strict";

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error("[route-atmo-gl2] " + log); }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error("[route-atmo-gl2] " + log); }
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace("[0]", "")] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const TAU = Math.PI * 2;

  // ---------- terrain noise, ported from World Scene.html's own seabed generator (trMakeNoise/
  // trFbm) so the mountains are built from the same heightfield algorithm as the tank floor, not a
  // separate hand-rolled squiggle -- same seeded 3D simplex noise, same fbm octave/persistence values ----
  function raMulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const RA_G3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
  function raMakeNoise(seed) {
    const r = raMulberry32(seed), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1));[p[i], p[j]] = [p[j], p[i]]; }
    const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const F3 = 1 / 3, G = 1 / 6;
    return function (x, y, z) {
      const s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
      const t = (i + j + k) * G, x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
      else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
      const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G, x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G, x3 = x0 - 1 + 3 * G, y3 = y0 - 1 + 3 * G, z3 = z0 - 1 + 3 * G;
      const ii = i & 255, jj = j & 255, kk = k & 255; let n = 0;
      const c = (gx, xx, yy, zz) => { let tt = .6 - xx * xx - yy * yy - zz * zz; if (tt < 0) return 0; tt *= tt; const g = RA_G3[gx % 12]; return tt * tt * (g[0] * xx + g[1] * yy + g[2] * zz); };
      n += c(perm[ii + perm[jj + perm[kk]]], x0, y0, z0);
      n += c(perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1);
      n += c(perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2);
      n += c(perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3);
      return 32 * n;
    };
  }
  function raFbm(noiseFn, x, y, oct) { let a = .5, f = 1, s = 0; for (let o = 0; o < oct; o++) { s += a * noiseFn(x * f, y * f, o * 17.3); f *= 2.1; a *= .52; } return s; }
  // marching squares + chain-stitching, ported verbatim from World Scene.html's own seabed
  // contour extraction (trMarchLevel/trStitch) -- same topographic-line look as
  // library/components/generative/terrain-isometric, not a flat-shaded solid mesh
  function raMarchLevel(vals, nx, ny, level) {
    const segs = [], lerp = (a, b) => (level - a) / (b - a);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = vals[j * nx + i], b = vals[j * nx + i + 1], c = vals[(j + 1) * nx + i + 1], d = vals[(j + 1) * nx + i];
      const k = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const T = [i + lerp(a, b), j], R = [i + 1, j + lerp(b, c)], B = [i + lerp(d, c), j + 1], L = [i, j + lerp(a, d)];
      const table = { 1: [L, B], 14: [L, B], 2: [B, R], 13: [B, R], 3: [L, R], 12: [L, R], 4: [T, R], 11: [T, R], 5: [L, T, B, R], 6: [T, B], 9: [T, B], 7: [L, T], 8: [L, T], 10: [T, R, L, B] };
      const s = table[k];
      for (let s2 = 0; s2 < s.length; s2 += 2) segs.push([s[s2], s[s2 + 1]]);
    }
    return segs;
  }
  function raStitch(segs) {
    const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    const used = new Array(segs.length).fill(false), byPoint = new Map();
    segs.forEach((s, i) => [0, 1].forEach((e) => { const k = key(s[e]); if (!byPoint.has(k)) byPoint.set(k, []); byPoint.get(k).push({ i, e }); }));
    const chains = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const chain = [segs[i][0], segs[i][1]];
      for (const atStart of [false, true]) {
        let guard = 0;
        while (guard++ < segs.length * 2) {
          const end = atStart ? chain[0] : chain[chain.length - 1];
          const cands = (byPoint.get(key(end)) || []).filter((c) => !used[c.i]);
          if (!cands.length) break;
          const { i: ci, e } = cands[0];
          used[ci] = true;
          const next = e === 0 ? segs[ci][1] : segs[ci][0];
          if (atStart) chain.unshift(next); else chain.push(next);
        }
      }
      if (chain.length > 1) chains.push(chain);
    }
    return chains;
  }

  // ---------- shaders ----------
  // true geometry (the ridge ring, pine stands' tiny mounting stub, pilgrim pyramids): position only,
  // lit by stepped distance-to-camera bands and stepped distance to up to 4 lantern points.
  const ATMO_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform float uShift, uShiftX;
out vec3 vW;
void main() { vW = aPos; vec4 c = uVP * vec4(aPos, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w; gl_Position = c; }`;
  // every fill below shades through the shared style chunk (shared/look/style/style-recipes.js), so the
  // ridges, pines and pilgrims take whatever recipe the host is drawing -- A.recipe, set by the host
  const ST = () => (window.StyleRecipes ? StyleRecipes.GLSL : "");
  const ATMO_FS = () => `#version 300 es
precision highp float;
in vec3 vW;
${ST()}
uniform float uBandFix, uTone;
out vec4 o;
void main() { o = vec4(stShade(vW, vec3(0.0), 0.0, uTone, uBandFix), 1.0); }`;
  // mountain contour lines: position + this vertex's own band (0 at the lowest ring drawn, 1 at the
  // highest), so each traced elevation level gets pinned to its own stepped colour via stShade's
  // `fix` argument (isLine=1 so it reads as line work, not a fill -- the "flat" recipe's own
  // ink/line/warm lerp for lines, same path the seabed's own contour lines would take if routed here)
  const MTN_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in float aLevel;
uniform mat4 uVP; uniform float uShift, uShiftX;
out vec3 vW; out float vLevel;
void main() { vW = aPos; vLevel = aLevel; vec4 c = uVP * vec4(aPos, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w; gl_Position = c; }`;
  const MTN_FS = () => `#version 300 es
precision highp float;
in vec3 vW; in float vLevel;
${ST()}
uniform float uTone, uAlpha;
out vec4 o;
// isLine=0: the recipe's regular ink-to-fog band colour, not its (deliberately subtle, meant for a
// thin accent over an already-coloured fill) line tint -- these lines ARE the terrain's colour, the
// only thing drawing it, so they need the same visibility a filled contour band would have
void main() { o = vec4(stShade(vW, vec3(0.0), 0.0, uTone, vLevel), uAlpha); }`;
  // camera-facing billboard quad: one world-space corner offset per vertex, world "up" fixed to
  // (0,0,-1) per this file's header note.
  const BB_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aCenter;
layout(location=2) in vec2 aSize;
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uShift, uShiftX, uUpright;
out vec2 vUv; out vec3 vW;
void main() {
  vec3 fwd = normalize(aCenter - uEye);
  vec3 worldUp = vec3(0.0, 0.0, -1.0), right, up;
  if (uUpright > 0.5) {
    // a standing cut-out (pine): turns about the world's up axis only, so it stays upright from any
    // orbit instead of tipping over to face a camera that looks down on it
    vec3 h = fwd - worldUp * dot(fwd, worldUp);
    right = length(h) > 1e-3 ? normalize(cross(worldUp, normalize(h))) : vec3(1.0, 0.0, 0.0);
    up = worldUp;
  } else {
    if (abs(dot(fwd, worldUp)) > 0.98) worldUp = vec3(0.0, 1.0, 0.0);
    right = normalize(cross(worldUp, fwd)); up = cross(fwd, right);
  }
  vec3 w = aCenter + right * aCorner.x * aSize.x + up * aCorner.y * aSize.y;
  vUv = aCorner + 0.5; vW = w;
  vec4 c = uVP * vec4(w, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w;
  gl_Position = c;
}`;
  const BB_GLOW_FS = `#version 300 es
precision mediump float;
in vec2 vUv; uniform sampler2D uTex; uniform float uAlpha; out vec4 o;
void main() { vec4 t = texture(uTex, vUv); o = vec4(t.rgb * t.a * uAlpha, 1.0); }`;
  // pines: the same flat depth bands and stepped lanterns as everything else, cut to the pine's shape
const BB_CUTOUT_FS = () => `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vW; uniform sampler2D uTex;
${ST()}
uniform float uTone;
out vec4 o;
void main() {
  if (texture(uTex, vUv).a < 0.5) discard;
  o = vec4(stShade(vW, vec3(0.0), 0.0, uTone, -1.0), 1.0);
}`;

  function makeCanvasTex(gl, draw, size) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  // the moon: halo, disc, a few flat maria -- a plain
  // 2D-canvas painting rather than a shaded sphere, since it reads as a flat disc either way at tank scale
  function moonTexture(gl) {
    return makeCanvasTex(gl, (x, n) => {
      const r = n * 0.16, cx = n / 2, cy = n / 2;
      const g = x.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 3.2);
      g.addColorStop(0, "rgba(255,255,255,0.3)"); g.addColorStop(0.4, "rgba(255,255,255,0.08)"); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.fillRect(0, 0, n, n);
      x.fillStyle = "#fff"; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
      x.fillStyle = "rgba(0,0,0,0.05)";
      const R = rng(7);
      for (let i = 0; i < 6; i++) x.beginPath(), x.arc(cx + (R() - 0.5) * r * 1.1, cy + (R() - 0.5) * r * 1.1, r * (0.12 + R() * 0.2), 0, TAU), x.fill();
    }, 256);
  }
  function glowTexture(gl) {
    return makeCanvasTex(gl, (x, n) => {
      const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.15, "rgba(255,255,255,0.5)"); g.addColorStop(0.45, "rgba(255,255,255,0.1)"); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.fillRect(0, 0, n, n);
    }, 128);
  }
  // a pine as a flat alpha-cutout silhouette, drawn once into a texture and billboarded many times
  function pineTexture(gl) {
    return makeCanvasTex(gl, (x, n) => {
      x.clearRect(0, 0, n, n);
      // vUv.y=0 (quad corner -0.5, world-down toward the ground) samples canvas row 0; the shape
      // below draws its apex near row 0 and its base near row n, so without this flip the apex would
      // land at the ground and the wide base up in the air -- mirror the canvas instead of the shape
      x.translate(0, n); x.scale(1, -1);
      x.fillStyle = "#fff";
      const R = rng(3), cx = n * 0.5, tiers = 6, baseW = n * 0.34;
      x.beginPath(); x.moveTo(cx, n * 0.04);
      for (let i = 1; i <= tiers; i++) { const t = i / tiers, y = n * 0.04 + n * 0.82 * t, w = baseW * Math.pow(t, 0.85); x.lineTo(cx + w, y); x.lineTo(cx + w * 0.3, y - n * 0.05); }
      x.lineTo(cx + n * 0.03, n * 0.9); x.lineTo(cx + n * 0.03, n); x.lineTo(cx - n * 0.03, n); x.lineTo(cx - n * 0.03, n * 0.9);
      for (let i = tiers; i >= 1; i--) { const t = i / tiers, y = n * 0.04 + n * 0.82 * t, w = baseW * Math.pow(t, 0.85); x.lineTo(cx - w * 0.3, y - n * 0.05); x.lineTo(cx - w, y); }
      x.closePath(); x.fill();
      void R;
    }, 128);
  }

  function create(gl) {
    return {
      atmo: program(gl, ATMO_VS, ATMO_FS()),
      mtn: program(gl, MTN_VS, MTN_FS()),
      bbGlow: program(gl, BB_VS, BB_GLOW_FS),
      bbCutout: program(gl, BB_VS, BB_CUTOUT_FS()),
      moonTex: moonTexture(gl),
      glowTex: glowTexture(gl),
      pineTex: pineTexture(gl),
      // the style recipe every layer here draws in (the host swaps it: A.recipe = StyleRecipes.get(id))
      recipe: window.StyleRecipes ? StyleRecipes.get("route-zero") : null,
    };
  }

  // topographic contour relief, not a flat-shaded solid: build the same heightfield grid a solid
  // mountain mesh would (angSegs x radSegs samples of the tank's own simplex fbm, evaluated at this
  // annulus's world x/y), then trace LEVELS elevation contours through it with marching squares
  // (raMarchLevel/raStitch, ported from World Scene.html's own seabed contour extraction) and
  // drape each traced line at its real elevation -- library/components/generative/terrain-isometric's own
  // look (and the seabed's), stacked rings of lines reading the actual relief, not a filled plane.
  function buildMountainContours(noiseFn, noiseScale, cx, cy, baseZ, rInner, rOuter, hMin, hMax, angSegs, radSegs, levels) {
    const cols = angSegs + 1, rows = radSegs + 1, raw = new Float32Array(cols * rows);
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = (i / angSegs) * TAU, r = rInner + (rOuter - rInner) * (j / radSegs);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const v = raFbm(noiseFn, x * noiseScale, y * noiseScale, 5);
      raw[j * cols + i] = v; if (v < mn) mn = v; if (v > mx) mx = v;
    }
    const span = Math.max(1e-6, mx - mn);
    const toWorld = (gi, gj) => { const a = (gi / angSegs) * TAU, r = rInner + (rOuter - rInner) * (gj / radSegs); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const buf = [];
    for (let L = 1; L < levels; L++) {
      const levelFrac = L / levels, level = mn + span * levelFrac, h = hMin + (hMax - hMin) * levelFrac;
      for (const chain of raStitch(raMarchLevel(raw, cols, rows, level))) {
        for (let k = 0; k < chain.length - 1; k++) {
          const [x0, y0] = toWorld(chain[k][0], chain[k][1]), [x1, y1] = toWorld(chain[k + 1][0], chain[k + 1][1]);
          buf.push(x0, y0, baseZ - h, levelFrac, x1, y1, baseZ - h, levelFrac);
        }
      }
    }
    return new Float32Array(buf);
  }
  function buildWorld(gl, A, seed, opts) {
    const R = rng(seed ^ 0x52a7e);
    const cx = opts.cx, cy = opts.cy, baseZ = opts.baseZ;
    const cityR = opts.cityRadius || Math.min(opts.tankW, opts.tankH) * 0.3;
    const tankSpan = Math.max(opts.tankW, opts.tankH);

    const upload = (geo) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, geo.pos, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null); return { vao, count: geo.idx.length };
    };
    // interleaved {x,y,z,level} per vertex, drawn as gl.LINES (two verts per contour segment) --
    // same vertex layout TERRAIN_VS/FS use for the seabed's own contour lines
    const uploadLines = (buf) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
      gl.bindVertexArray(null); return { vao, count: buf.length / 4 };
    };
    // ---- the floor: one flat dark layer the whole set stands on, out past the last ridge ----
    const floorR = cityR * 3.4, fpos = [cx, cy, baseZ + tankSpan * 0.0015], fidx = [];
    for (let i = 0; i <= 120; i++) { const a = (i / 120) * TAU; fpos.push(cx + Math.cos(a) * floorR, cy + Math.sin(a) * floorR, baseZ + tankSpan * 0.0015); if (i) fidx.push(0, i, i + 1); }
    const floor = upload({ pos: new Float32Array(fpos), idx: new Uint32Array(fidx) });
    // ---- mountains: contour relief (see buildMountainContours), one continuous annulus traced at
    // several elevations -- the same technique as library/components/generative/terrain-isometric and the
    // tank's own seabed, not a flat-shaded plane
    const ringR = cityR * 1.65;
    const mtnNoise = raMakeNoise((seed ^ 0x6d7a1e) >>> 0), mtnScale = 1.4 / tankSpan;
    const mountain = uploadLines(buildMountainContours(mtnNoise, mtnScale, cx, cy, baseZ, cityR * 1.3, cityR * 2.45, tankSpan * 0.02, tankSpan * 0.15, 220, 26, 7));

    // ---- pine billboards: scattered in an annulus between the city edge and the ridge ring ----
    const pineN = 150, pineQuad = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
    const pCorner = [], pCenter = [], pSize = [];
    for (let i = 0; i < pineN; i++) {
      const a = R() * TAU, r = cityR * (1.06 + Math.pow(R(), 0.8) * 0.4);
      const h = tankSpan * (0.02 + Math.pow(R(), 1.6) * 0.045);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      for (let k = 0; k < 6; k++) { pCorner.push(pineQuad[k * 2], pineQuad[k * 2 + 1]); pCenter.push(x, y, baseZ - h * 0.5); pSize.push(h * 0.55, h); }
    }
    const pineVAO = gl.createVertexArray(); gl.bindVertexArray(pineVAO);
    const cornerBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pCorner), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const centerBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, centerBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pCenter), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const sizeBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pSize), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ---- the road (Route Scene's): it leaves the city by a gate and winds out through the hills,
    // poles and a sagging wire beside it. opts.gateAngle is the avenue it continues. ----
    const ga = opts.gateAngle == null ? 0.6 : opts.gateAngle, road = [], roadZ = baseZ + tankSpan * 0.0005;
    for (let i = 0; i <= 48; i++) { const t = i / 48, r = cityR * (1.0 + t * 2.3), a = ga + Math.sin(t * 5.2 + 0.4) * 0.16 * t + t * 0.38; road.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    const roadLen = [0]; for (let i = 1; i < road.length; i++) roadLen.push(roadLen[i - 1] + Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]));
    const rpos = [], ridx = [], poleBuf = [], poleH = tankSpan * 0.02; let lastTop = null;
    road.forEach(([x, y], i) => {
      const [px, py] = road[Math.max(0, i - 1)], [nx, ny] = road[Math.min(road.length - 1, i + 1)], dx = nx - px, dy = ny - py, l = Math.hypot(dx, dy) || 1;
      const w = cityR * 0.02 * (1 + i / road.length * 0.5), ox = -dy / l, oy = dx / l;
      rpos.push(x + ox * w, y + oy * w, roadZ, x - ox * w, y - oy * w, roadZ);
      if (i) { const b = (i - 1) * 2; ridx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      if (i >= 2 && i % 3 === 2) {   // a pole, a short crossbar, and the wire from the pole before it
        const qx = x + ox * w * 2.4, qy = y + oy * w * 2.4, top = roadZ - poleH;
        poleBuf.push(qx, qy, roadZ, 0.3, qx, qy, top, 0.3, qx - ox * w * 0.5, qy - oy * w * 0.5, top + poleH * 0.12, 0.3, qx + ox * w * 0.5, qy + oy * w * 0.5, top + poleH * 0.12, 0.3);
        if (lastTop) for (let k = 0; k < 4; k++) { const t0 = k / 4, t1 = (k + 1) / 4, sag = (t) => poleH * 0.22 * 4 * t * (1 - t);
          poleBuf.push(lastTop[0] + (qx - lastTop[0]) * t0, lastTop[1] + (qy - lastTop[1]) * t0, top + poleH * 0.12 + sag(t0), 0.3, lastTop[0] + (qx - lastTop[0]) * t1, lastTop[1] + (qy - lastTop[1]) * t1, top + poleH * 0.12 + sag(t1), 0.3); }
        lastTop = [qx, qy];
      }
    });
    const roadGeo = upload({ pos: new Float32Array(rpos), idx: new Uint32Array(ridx) }), poles = uploadLines(new Float32Array(poleBuf));
    // ---- pilgrims: small pyramids walking the road in toward the city, and beginning again ----
    const roadR = cityR * 1.14, pilgrimN = 9, pilgrims = [], roadTotal = roadLen[roadLen.length - 1];
    for (let i = 0; i < pilgrimN; i++) pilgrims.push({ a: R() * TAU, d: R() * roadTotal, walk: tankSpan * (0.007 + R() * 0.005), speed: (0.08 + R() * 0.06) * (R() < 0.5 ? 1 : -1), side: (R() - 0.5) * cityR * 0.03, size: tankSpan * (0.006 + R() * 0.004) });
    const pilgrimVAO = gl.createVertexArray(); gl.bindVertexArray(pilgrimVAO);
    const pilgrimVBO = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pilgrimVBO); gl.bufferData(gl.ARRAY_BUFFER, pilgrimN * 5 * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const pilgrimIdx = []; for (let i = 0; i < pilgrimN; i++) { const b = i * 5; pilgrimIdx.push(b, b + 1, b + 4, b + 1, b + 2, b + 4, b + 2, b + 3, b + 4, b + 3, b, b + 4); }
    const pilgrimIBO = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pilgrimIBO); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(pilgrimIdx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // ---- glow points: the hub tower's lantern + a couple of outer towers, plus the moon ----
    const lights = [];
    if (opts.hub) lights.push({ x: opts.hub.x, y: opts.hub.y, z: baseZ - (opts.hub.height || 0) * 0.82, radius: tankSpan * 0.16 });
    const outer = (opts.towers || []).filter((t) => t !== opts.hub);
    for (let i = 0; i < Math.min(3, outer.length); i++) { const tw = outer[Math.floor(R() * outer.length)]; lights.push({ x: tw.x, y: tw.y, z: baseZ - (tw.height || 0) * 0.75, radius: tankSpan * 0.1 }); }
    // World Scene's camera floats ABOVE the tank looking down into it (Top view looks straight down),
    // never up toward an open sky the way an outdoor scene's camera would -- there's no height that's
    // "always above the camera" the way a real sky is. Pragmatic fix: rest the moon near the ridge
    // ring's own crest height, just beyond it radially, so it reads as rising over the hills in the
    // default angled view instead of chasing an orbit-proof "sky" this camera metaphor doesn't have.
    const moonA = R() * TAU;
    const moon = { x: cx + Math.cos(moonA) * ringR * 1.7, y: cy + Math.sin(moonA) * ringR * 1.7, z: baseZ - tankSpan * 0.11, size: tankSpan * 0.3 };

    return {
      cx, cy, baseZ, cityR, tankSpan, floor, mountain,
      pineVAO, pineCount: pineN * 6,
      pilgrims, pilgrimVAO, pilgrimVBO, pilgrimIBO, pilgrimCount: pilgrimIdx.length, roadR,
      road, roadLen, roadTotal, roadGeo, poles, gateAngle: ga,
      lights, moon,
    };
  }

  function dispose(gl, world) {
    if (!world) return;
    gl.deleteVertexArray(world.floor.vao); gl.deleteVertexArray(world.mountain.vao); gl.deleteVertexArray(world.pineVAO);
    gl.deleteVertexArray(world.pilgrimVAO); gl.deleteBuffer(world.pilgrimVBO); gl.deleteBuffer(world.pilgrimIBO);
    if (world.roadGeo) { gl.deleteVertexArray(world.roadGeo.vao); gl.deleteVertexArray(world.poles.vao); }
  }
  // a point `d` along the road, from the gate (0) outward
  function roadAt(world, d) {
    const len = world.roadLen, road = world.road; d = Math.max(0, Math.min(world.roadTotal, d));
    let i = 1; while (i < len.length - 1 && len[i] < d) i++;
    const t = (d - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
    return [road[i - 1][0] + (road[i][0] - road[i - 1][0]) * t, road[i - 1][1] + (road[i][1] - road[i - 1][1]) * t];
  }

  function updatePilgrims(gl, world, dt) {
    const buf = world.pilgrimBuf || (world.pilgrimBuf = new Float32Array(world.pilgrims.length * 5 * 3));
    let o = 0;
    for (const p of world.pilgrims) {
      let x, y;
      if (world.road && world.onRoad !== false) { p.d -= p.walk * dt; if (p.d <= 0) p.d = world.roadTotal; const q = roadAt(world, p.d); x = q[0] + p.side; y = q[1] + p.side; }
      else { p.a += p.speed * dt * 0.3; x = world.cx + Math.cos(p.a) * (world.roadR + p.side); y = world.cy + Math.sin(p.a) * (world.roadR + p.side); }
      const w = p.size, h = p.size * 2.2, z0 = world.baseZ;
      const base = [[x - w, y - w, z0], [x + w, y - w, z0], [x + w, y + w, z0], [x - w, y + w, z0]];
      for (const b of base) { buf[o++] = b[0]; buf[o++] = b[1]; buf[o++] = b[2]; }
      buf[o++] = x; buf[o++] = y; buf[o++] = z0 - h;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, world.pilgrimVBO); gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf);
  }

  // the depth bands span the stage as seen from where the camera is now: nearest edge of the floor
  // to the farthest ridge, so the city sits mid-band and the ridges step paler behind it
  function bandRange(world, eye) {
    const dx = eye[0] - world.cx, dy = eye[1] - world.cy, dz = eye[2] - world.baseZ, dc = Math.hypot(dx, dy, dz);
    return [Math.max(1, dc - world.cityR * 1.6), dc + world.cityR * 2.4];
  }
  // put the style recipe's uniforms on any program that pastes StyleRecipes.GLSL (the host's tower
  // shader too). World up here is (0,0,-1); the band range and lanterns come from this world.
  function frameOf(world, cam) {
    const [near, far] = bandRange(world, cam.eye);
    return { cam: cam.eye, near, far, up: [0, 0, -1], sun: [-0.6, 0.45, -0.65], lights: world.lights.slice(0, 8) };
  }
  function setStyle(gl, u, A, world, cam, tone) {
    StyleRecipes.applyGL(gl, u, A.recipe, frameOf(world, cam));
    if (u.uTone) gl.uniform1f(u.uTone, tone || 0);
  }
  // a recipe switches its own layers; A.override ({ road, pilgrims, ridges, pines, moon }) is the host's hand over that
  const atmoOn = (A, k) => (A.override && k in A.override) ? !!A.override[k] : (!A.recipe || A.recipe.atmo[k] !== false);
  function drawSolid(gl, A, world, cam) {
    gl.useProgram(A.atmo.p); const u = A.atmo.u;
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift || 0); gl.uniform1f(u.uShiftX, cam.shiftX || 0);
    setStyle(gl, u, A, world, cam, 0);
    gl.uniform1f(u.uBandFix, 0.06); gl.bindVertexArray(world.floor.vao); gl.drawElements(gl.TRIANGLES, world.floor.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    if (atmoOn(A, "ridges")) {
      // contour lines, not a filled layer: alpha-blended over whatever's behind them, depth-tested
      // but not depth-writing (so they never incorrectly hide a fish or tower drawn after them)
      gl.useProgram(A.mtn.p); const um = A.mtn.u;
      gl.uniformMatrix4fv(um.uVP, false, cam.vp); gl.uniform1f(um.uShift, cam.shift || 0); gl.uniform1f(um.uShiftX, cam.shiftX || 0);
      setStyle(gl, um, A, world, cam, 0); gl.uniform1f(um.uAlpha, 0.85);
      gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(world.mountain.vao); gl.drawArrays(gl.LINES, 0, world.mountain.count); gl.bindVertexArray(null);
      gl.disable(gl.BLEND); gl.depthMask(true);
      gl.useProgram(A.atmo.p);
    }
    world.onRoad = atmoOn(A, "road");
    if (world.onRoad && world.roadGeo) {
      gl.uniform1f(u.uBandFix, 0.06); gl.uniform1f(u.uTone, 0.16);
      gl.bindVertexArray(world.roadGeo.vao); gl.drawElements(gl.TRIANGLES, world.roadGeo.count, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
      gl.useProgram(A.mtn.p); const up = A.mtn.u;
      gl.uniformMatrix4fv(up.uVP, false, cam.vp); gl.uniform1f(up.uShift, cam.shift || 0); gl.uniform1f(up.uShiftX, cam.shiftX || 0);
      setStyle(gl, up, A, world, cam, 0.2); gl.uniform1f(up.uAlpha, 0.9);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(world.poles.vao); gl.drawArrays(gl.LINES, 0, world.poles.count); gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.useProgram(A.atmo.p); setStyle(gl, u, A, world, cam, 0);
    }
    gl.uniform1f(u.uBandFix, -1); gl.uniform1f(u.uTone, -0.15);
    if (atmoOn(A, "pilgrims")) { gl.bindVertexArray(world.pilgrimVAO); gl.drawElements(gl.TRIANGLES, world.pilgrimCount, gl.UNSIGNED_SHORT, 0); }
    gl.bindVertexArray(null);
    if (!atmoOn(A, "pines")) return;

    gl.useProgram(A.bbCutout.p); const uc = A.bbCutout.u;
    gl.uniformMatrix4fv(uc.uVP, false, cam.vp); gl.uniform3fv(uc.uEye, cam.eye); gl.uniform1f(uc.uUpright, 1);
    gl.uniform1f(uc.uShift, cam.shift || 0); gl.uniform1f(uc.uShiftX, cam.shiftX || 0);
    setStyle(gl, uc, A, world, cam, -0.12);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.pineTex); gl.uniform1i(uc.uTex, 0);
    gl.bindVertexArray(world.pineVAO); gl.drawArrays(gl.TRIANGLES, 0, world.pineCount);
    gl.bindVertexArray(null);
  }

  function drawGlow(gl, A, world, cam) {
    gl.useProgram(A.bbGlow.p); const u = A.bbGlow.u;
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uEye, cam.eye); gl.uniform1f(u.uUpright, 0);
    gl.uniform1f(u.uShift, cam.shift || 0); gl.uniform1f(u.uShiftX, cam.shiftX || 0);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.uTex, 0);
    // one quad, kept on the layer: its centre and size are rewritten per sprite (a handful a frame)
    if (!A.glowQuad) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const centerBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, centerBuf); gl.bufferData(gl.ARRAY_BUFFER, 18 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      const sizeBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf); gl.bufferData(gl.ARRAY_BUFFER, 12 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      A.glowQuad = { vao, centerBuf, sizeBuf, center: new Float32Array(18), size: new Float32Array(12) };
    }
    const Q = A.glowQuad; gl.bindVertexArray(Q.vao);
    const drawOne = (cx_, cy_, cz_, w, h, tex, alpha) => {
      for (let i = 0; i < 6; i++) { Q.center[i * 3] = cx_; Q.center[i * 3 + 1] = cy_; Q.center[i * 3 + 2] = cz_; Q.size[i * 2] = w; Q.size[i * 2 + 1] = h; }
      gl.bindBuffer(gl.ARRAY_BUFFER, Q.centerBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, Q.center);
      gl.bindBuffer(gl.ARRAY_BUFFER, Q.sizeBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, Q.size);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1f(u.uAlpha, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const glow = A.recipe ? A.recipe.light.glow : 0.42;
    if (atmoOn(A, "moon")) drawOne(world.moon.x, world.moon.y, world.moon.z, world.moon.size, world.moon.size, A.moonTex, 1);
    if (glow > 0) for (const L of world.lights) drawOne(L.x, L.y, L.z, L.radius * glow, L.radius * glow, A.glowTex, 0.75);   // a lit window, not a flare
    gl.bindVertexArray(null);
  }

  window.RouteAtmoGL2 = { create, buildWorld, dispose, updatePilgrims, drawSolid, drawGlow, setStyle, setFlat: setStyle, frameOf, bandRange };
})();
