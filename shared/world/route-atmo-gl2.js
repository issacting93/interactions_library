/* shared/world/route-atmo-gl2.js — the "Night Route" look (tools/route/route.js's three canvas
   studies, tools/world-scene/route-scene.html's Three.js re-staging) ported a third time, now as a
   native raw-WebGL2 layer that World Scene Next.html draws alongside its own live sim instead of
   switching renderers or pages. Everything here is decoration around the tank: it reads the host
   page's own city/tower placement (positions only) and draws into the host's already-bound
   framebuffer with the host's own camera matrix. It owns no simulation state and touches no DOM.

   World Scene Next.html's coordinate convention (see its buildPlacedTower comment): world X/Y are
   the tank's screen-plane, world Z is depth, and a local "up" (height) maps to a SMALLER world Z
   (rising toward the camera from a baseZ ground plane). Billboards here use worldUp = (0,0,-1) to
   match that -- an approximation of the host's own per-yaw `up` vector (updateCamera's M4.look
   argument), close enough for decoration that nothing in this file needs the host's camera code.

   Because World Scene's camera can orbit and tilt all the way to a straight-down "Top" view, a
   fixed single-facing backdrop (route-scene.html's approach, viewed by a camera that never moves)
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
     RouteAtmoGL2.setFlat(gl, u, A, world, cam, tone)          -> put the flat Route Zero uniforms on any program
                                                                   (World Scene's tower shader uses it for the city)

   The Route Zero rules everything here follows (as route-scene.html): no surface lighting -- colour is a
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

  // ---------- shaders ----------
  // true geometry (the ridge ring, pine stands' tiny mounting stub, pilgrim pyramids): position only,
  // lit by stepped distance-to-camera bands and stepped distance to up to 4 lantern points.
  const ATMO_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform float uShift, uShiftX;
out vec3 vW;
void main() { vW = aPos; vec4 c = uVP * vec4(aPos, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w; gl_Position = c; }`;
  const ATMO_FS = `#version 300 es
precision highp float;
in vec3 vW;
uniform vec3 uCam, uInk, uFog, uWarm;
uniform vec4 uLights[4];
uniform float uNear, uFar, uBandFix, uTone;
out vec4 o;
void main() {
  float dist = length(vW - uCam);
  float d = clamp((dist - uNear) / max(1.0, uFar - uNear), 0.0, 1.0);
  float band = uBandFix >= 0.0 ? uBandFix : floor(d * 5.0 + 0.5) / 5.0;   // a ridge or the floor is one flat layer: one band
  float L = 0.0;
  for (int i = 0; i < 4; i++) if (uLights[i].w > 0.0) L = max(L, 1.0 - distance(vW, uLights[i].xyz) / uLights[i].w);
  L = clamp(floor(L * 3.0 + 0.35) / 3.0, 0.0, 1.0);                     // stepped, not smooth
  vec3 base = mix(uInk, uFog, clamp(pow(band, 1.5) * 0.95 + uTone, 0.0, 1.0));
  vec3 col = mix(base, uWarm * mix(0.6, 1.0, L), L * 0.6);
  o = vec4(col, 1.0);
}`;
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
const BB_CUTOUT_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vW; uniform sampler2D uTex;
uniform vec3 uCam, uInk, uFog, uWarm; uniform vec4 uLights[4]; uniform float uNear, uFar, uTone;
out vec4 o;
void main() {
  if (texture(uTex, vUv).a < 0.5) discard;
  float d = clamp((length(vW - uCam) - uNear) / max(1.0, uFar - uNear), 0.0, 1.0), band = floor(d * 5.0 + 0.5) / 5.0;
  float L = 0.0; for (int i = 0; i < 4; i++) if (uLights[i].w > 0.0) L = max(L, 1.0 - distance(vW, uLights[i].xyz) / uLights[i].w);
  L = clamp(floor(L * 3.0 + 0.35) / 3.0, 0.0, 1.0);
  vec3 base = mix(uInk, uFog, clamp(pow(band, 1.5) * 0.95 + uTone, 0.0, 1.0));
  o = vec4(mix(base, uWarm * mix(0.6, 1.0, L), L * 0.6), 1.0);
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
  // the moon: halo, disc, a few flat maria -- same idea as tools/route/route.js's moon(), a plain
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
      atmo: program(gl, ATMO_VS, ATMO_FS),
      bbGlow: program(gl, BB_VS, BB_GLOW_FS),
      bbCutout: program(gl, BB_VS, BB_CUTOUT_FS),
      moonTex: moonTexture(gl),
      glowTex: glowTexture(gl),
      pineTex: pineTexture(gl),
      // palette: a quiet sage/slate night, one warm lantern tone -- tools/route/route.js's "sage" palette
      ink: [0.09, 0.11, 0.1], fog: [0.47, 0.52, 0.49], warm: [0.94, 0.7, 0.35],
    };
  }

  // a closed ring "wall", ragged top, flat bottom -- always presents a face to a viewer standing
  // anywhere near/inside it, degenerates to a thin circle seen from directly above
  function buildRingGeom(R, cx, cy, baseZ, radius, hMin, hMax, segs) {
    const ph = [R() * TAU, R() * TAU, R() * TAU], k = [2 + R() * 2, 5 + R() * 3, 11 + R() * 6];
    const pos = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, a = t * TAU;
      const v = 0.55 * Math.sin(t * k[0] * TAU + ph[0]) + 0.3 * Math.sin(t * k[1] * TAU + ph[1]) + 0.15 * Math.sin(t * k[2] * TAU + ph[2]);
      const h = hMin + (hMax - hMin) * (0.5 + 0.5 * v);
      const x = cx + Math.cos(a) * radius, y = cy + Math.sin(a) * radius;
      pos.push(x, y, baseZ, x, y, baseZ - h);
    }
    const idx = [];
    for (let i = 0; i < segs; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
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
    // ---- the floor: one flat dark layer the whole set stands on, out past the last ridge ----
    const floorR = cityR * 3.4, fpos = [cx, cy, baseZ + tankSpan * 0.0015], fidx = [];
    for (let i = 0; i <= 120; i++) { const a = (i / 120) * TAU; fpos.push(cx + Math.cos(a) * floorR, cy + Math.sin(a) * floorR, baseZ + tankSpan * 0.0015); if (i) fidx.push(0, i, i + 1); }
    const floor = upload({ pos: new Float32Array(fpos), idx: new Uint32Array(fidx) });
    // ---- ridges: three closed rings, each one flat band, paler and taller the farther out ----
    const ringR = cityR * 1.5;
    const rings = [[1.5, 0.025, 0.07, 0.42], [1.85, 0.04, 0.1, 0.62], [2.3, 0.055, 0.14, 0.84]].map(([k, h0, h1, band]) =>
      Object.assign(upload(buildRingGeom(R, cx, cy, baseZ, cityR * k, tankSpan * h0, tankSpan * h1, 160)), { band }));

    // ---- pine billboards: scattered in an annulus between the city edge and the ridge ring ----
    const pineN = 150, pineQuad = [-0.5, -1, 0.5, -1, 0.5, 1, -0.5, -1, 0.5, 1, -0.5, 1];
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

    // ---- pilgrims: small pyramids walking a ring road just outside the city ----
    const roadR = cityR * 1.14, pilgrimN = 9, pilgrims = [];
    for (let i = 0; i < pilgrimN; i++) pilgrims.push({ a: R() * TAU, speed: (0.08 + R() * 0.06) * (R() < 0.5 ? 1 : -1), side: (R() - 0.5) * cityR * 0.03, size: tankSpan * (0.006 + R() * 0.004) });
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
      cx, cy, baseZ, cityR, tankSpan, floor, rings,
      pineVAO, pineCount: pineN * 6,
      pilgrims, pilgrimVAO, pilgrimVBO, pilgrimIBO, pilgrimCount: pilgrimIdx.length, roadR,
      lights, moon,
    };
  }

  function dispose(gl, world) {
    if (!world) return;
    gl.deleteVertexArray(world.floor.vao); for (const r of world.rings) gl.deleteVertexArray(r.vao); gl.deleteVertexArray(world.pineVAO);
    gl.deleteVertexArray(world.pilgrimVAO); gl.deleteBuffer(world.pilgrimVBO); gl.deleteBuffer(world.pilgrimIBO);
  }

  function updatePilgrims(gl, world, dt) {
    const buf = new Float32Array(world.pilgrims.length * 5 * 3);
    let o = 0;
    for (const p of world.pilgrims) {
      p.a += p.speed * dt * 0.3;
      const x = world.cx + Math.cos(p.a) * (world.roadR + p.side), y = world.cy + Math.sin(p.a) * (world.roadR + p.side);
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
  function lightsVec(world) {
    const lv = new Float32Array(16);
    for (let i = 0; i < 4; i++) { const L = world.lights[i]; if (L) { lv[i * 4] = L.x; lv[i * 4 + 1] = L.y; lv[i * 4 + 2] = L.z; lv[i * 4 + 3] = L.radius; } }
    return lv;
  }
  // set the flat Route Zero uniforms on any program that uses them (the host's tower shader too)
  function setFlat(gl, u, A, world, cam, tone) {
    const [n, f] = bandRange(world, cam.eye);
    gl.uniform3fv(u.uCam, cam.eye); gl.uniform3fv(u.uInk, A.ink); gl.uniform3fv(u.uFog, A.fog); gl.uniform3fv(u.uWarm, A.warm);
    gl.uniform1f(u.uNear, n); gl.uniform1f(u.uFar, f); gl.uniform4fv(u.uLights, lightsVec(world));
    if (u.uTone) gl.uniform1f(u.uTone, tone || 0);
  }
  function drawSolid(gl, A, world, cam) {
    gl.useProgram(A.atmo.p); const u = A.atmo.u;
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift || 0); gl.uniform1f(u.uShiftX, cam.shiftX || 0);
    setFlat(gl, u, A, world, cam, 0);
    gl.uniform1f(u.uBandFix, 0.06); gl.bindVertexArray(world.floor.vao); gl.drawElements(gl.TRIANGLES, world.floor.count, gl.UNSIGNED_INT, 0);
    for (const r of world.rings) { gl.uniform1f(u.uBandFix, r.band); gl.bindVertexArray(r.vao); gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, 0); }
    gl.uniform1f(u.uBandFix, -1); gl.uniform1f(u.uTone, -0.15);
    gl.bindVertexArray(world.pilgrimVAO); gl.drawElements(gl.TRIANGLES, world.pilgrimCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    gl.useProgram(A.bbCutout.p); const uc = A.bbCutout.u;
    gl.uniformMatrix4fv(uc.uVP, false, cam.vp); gl.uniform3fv(uc.uEye, cam.eye); gl.uniform1f(uc.uUpright, 1);
    gl.uniform1f(uc.uShift, cam.shift || 0); gl.uniform1f(uc.uShiftX, cam.shiftX || 0);
    setFlat(gl, uc, A, world, cam, -0.12);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.pineTex); gl.uniform1i(uc.uTex, 0);
    gl.bindVertexArray(world.pineVAO); gl.drawArrays(gl.TRIANGLES, 0, world.pineCount);
    gl.bindVertexArray(null);
  }

  function drawGlow(gl, A, world, cam) {
    gl.useProgram(A.bbGlow.p); const u = A.bbGlow.u;
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uEye, cam.eye); gl.uniform1f(u.uUpright, 0);
    gl.uniform1f(u.uShift, cam.shift || 0); gl.uniform1f(u.uShiftX, cam.shiftX || 0);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.uTex, 0);
    // a throwaway single-quad VAO, rebuilt per call: at most ~5 glow sprites a frame, not worth caching
    const corner = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, corner, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const centerBuf = gl.createBuffer(), sizeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, centerBuf); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    const drawOne = (cx_, cy_, cz_, w, h, tex, alpha) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, centerBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([cx_, cy_, cz_, cx_, cy_, cz_, cx_, cy_, cz_, cx_, cy_, cz_, cx_, cy_, cz_, cx_, cy_, cz_]), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([w, h, w, h, w, h, w, h, w, h, w, h]), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1f(u.uAlpha, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    drawOne(world.moon.x, world.moon.y, world.moon.z, world.moon.size, world.moon.size, A.moonTex, 1);
    for (const L of world.lights) drawOne(L.x, L.y, L.z, L.radius * 0.42, L.radius * 0.42, A.glowTex, 0.75);   // a lit window, not a flare
    gl.bindVertexArray(null); gl.deleteVertexArray(vao); gl.deleteBuffer(cb); gl.deleteBuffer(centerBuf); gl.deleteBuffer(sizeBuf);
  }

  window.RouteAtmoGL2 = { create, buildWorld, dispose, updatePilgrims, drawSolid, drawGlow, setFlat, bandRange };
})();
