// world/scenes/world-scene/src/terrain-camera.js -- World Scene: The seabed relief (contour terrain) and the camera: perspective down into the tank, tilted and turnable.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- terrain: a noise-driven seabed relief (same simplex-fbm + marching-squares technique
// as library/components/generative/terrain-grid) as contour lines only — a bas-relief on the same X-Y
// plane the fish cards themselves lie in (bulging Z toward/away from camera), not a true ground
// plane on a different axis, which read as rotated 90 degrees from the creatures ----------
const TERR_RELIEF = 0.55; // how far a peak's depth pulls toward the camera, as a fraction of tank depth
let trNoiseFn;   // reassigned by regenTerrain() below — trFbm reads it live through this closure
const trFbm = (x, y, oct) => { let a = .5, f = 1, s = 0; for (let o = 0; o < oct; o++) { s += a * trNoiseFn(x * f, y * f, o * 17.3); f *= 2.1; a *= .52; } return s; };


// two height fields from the same seeded noise: a coarse one (FLOOR_C x FLOOR_R) just for the
// floor-dot sparkle's elevation, and a denser, lightly smoothed one for the terrain mesh and its
// contour lines — raw fbm at mesh resolution reads as jagged, crystalline facets, not rolling hills
const TERR_SCALE = 1.3; // lower = fewer, broader landforms (bigger-looking hills) across the same tank plane
const terrHeightTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, terrHeightTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

const TERR_MESH_NX = 96, TERR_MESH_NY = 64;
const TERR_LEVELS = 7;
const terrChains = [];
// The city always sits centred on the tank at a FIXED radius of exactly 0.4 * tankW() (see
// placeTowersForCity's cityScale = tankW()*0.4/15.3, applied to CityWFC's own outer RADII of
// 15.3 -- 15.3 * that scale cancels back down to tankW()*0.4). Terrain relief is independent,
// seeded noise with no awareness of the city, so a peak could randomly land right under it and
// read as poking up through/in front of the glowing buildings. terrainRadialMask flattens the
// normalized 0..1 height field toward 0 (the lowest contour level, pulled back away from camera)
// within that same radius, with a soft transition band before full relief resumes outside it --
// "a flat circle in the centre of the terrain with the reliefs at the side."
const CITY_FOOTPRINT_FRAC = 0.4;   // matches cityScale's own derivation, as a fraction of tank width
function terrainRadialMask(uFrac, vFrac, aspect) {
  const dx = uFrac - 0.5, dy = (vFrac - 0.5) * aspect;
  const r = Math.hypot(dx, dy);
  const inner = CITY_FOOTPRINT_FRAC, outer = CITY_FOOTPRINT_FRAC * 1.55;
  const t = Math.max(0, Math.min(1, (r - inner) / (outer - inner)));
  return t * t * (3 - 2 * t);   // smoothstep
}
// rebuilds the seabed (height texture + contour chains) from a seed, so "Reseed" and a shared preset
// link can both reproduce or replace the layout without restarting the page
function regenTerrain(seed) {
  trNoiseFn = trMakeNoise(seed);
  // tankW()/tankH() aren't available yet the first time this runs (same reason terrainRebuild's
  // own comment gives), but the tank's aspect ratio is always just the viewport's own, so this
  // reads window dimensions directly rather than depending on that later setup.
  const aspect = (window.innerHeight || 1) / (window.innerWidth || 1);
  const terrVals = new Float32Array(FLOOR_C * FLOOR_R);
  for (let j = 0; j < FLOOR_R; j++) for (let i = 0; i < FLOOR_C; i++) {
    terrVals[j * FLOOR_C + i] = trFbm(i / FLOOR_C * TERR_SCALE, j / FLOOR_R * TERR_SCALE * (FLOOR_R / FLOOR_C), 5);
  }
  const terrNorm = normalize01(terrVals);
  for (let j = 0; j < FLOOR_R; j++) for (let i = 0; i < FLOOR_C; i++) {
    terrNorm[j * FLOOR_C + i] *= terrainRadialMask(i / (FLOOR_C - 1), j / (FLOOR_R - 1), aspect);
  }
  gl.bindTexture(gl.TEXTURE_2D, terrHeightTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, FLOOR_C, FLOOR_R, 0, gl.RED, gl.FLOAT, terrNorm);

  const raw = new Float32Array(TERR_MESH_NX * TERR_MESH_NY);
  for (let j = 0; j < TERR_MESH_NY; j++) for (let i = 0; i < TERR_MESH_NX; i++) {
    raw[j * TERR_MESH_NX + i] = trFbm(i / TERR_MESH_NX * TERR_SCALE, j / TERR_MESH_NY * TERR_SCALE * (TERR_MESH_NY / TERR_MESH_NX), 5);
  }
  const blur = src => {
    const out = new Float32Array(src.length);
    for (let j = 0; j < TERR_MESH_NY; j++) for (let i = 0; i < TERR_MESH_NX; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || ii >= TERR_MESH_NX || jj < 0 || jj >= TERR_MESH_NY) continue;
        s += src[jj * TERR_MESH_NX + ii]; n++;
      }
      out[j * TERR_MESH_NX + i] = s / n;
    }
    return out;
  };
  const terrMeshH = normalize01(blur(blur(raw)));
  for (let j = 0; j < TERR_MESH_NY; j++) for (let i = 0; i < TERR_MESH_NX; i++) {
    terrMeshH[j * TERR_MESH_NX + i] *= terrainRadialMask(i / (TERR_MESH_NX - 1), j / (TERR_MESH_NY - 1), aspect);
  }

  terrChains.length = 0;
  for (let L = 1; L < TERR_LEVELS; L++) {
    const levelFrac = L / TERR_LEVELS;
    for (const chain of trStitch(trMarchLevel(terrMeshH, TERR_MESH_NX, TERR_MESH_NY, levelFrac))) {
      if (chain.length > 1) terrChains.push({ levelFrac, pts: chain });
    }
  }
}
regenTerrain(S.seed);

const TERRAIN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in float aLevel;
uniform mat4 uVP; uniform float uShift, uShiftX;
out float vLevel;
void main() {
  vLevel = aLevel;
  vec4 c = uVP * vec4(aPos, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w;
  gl_Position = c;
}`;
const TERRAIN_FS = `#version 300 es
precision mediump float; in float vLevel; out vec4 o;
void main() {
  vec3 low = vec3(0.20, 0.42, 0.40), high = vec3(0.89, 0.69, 0.26);
  o = vec4(mix(low, high, vLevel), 0.28 + 0.26 * vLevel);
}`;
const terrainProg = program(TERRAIN_VS, TERRAIN_FS);
const terrainVAO = gl.createVertexArray(), terrainVBO = gl.createBuffer();
gl.bindVertexArray(terrainVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, terrainVBO);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
gl.bindVertexArray(null);
let terrainVertCount = 0;

// tankH()/tankDepth() aren't declared yet at this point in the file (they're defined with the
// camera below), and this runs from inside the very first resize() call — so the tank-size math
// is inlined here rather than calling those helpers, to avoid touching them before they exist.
function terrainRebuild() {
  const TW = vw * WORLD_SCALE;
  const TH = vh * WORLD_SCALE;
  const TD = Math.max(60, Math.min(TW, TH) * 0.9 * S.dz);
  const buf = [];
  for (const { levelFrac, pts } of terrChains) {
    const z = TD * (1 - levelFrac * TERR_RELIEF);
    for (let k = 0; k < pts.length - 1; k++) {
      const [gx0, gy0] = pts[k], [gx1, gy1] = pts[k + 1];
      buf.push(gx0 / (TERR_MESH_NX - 1) * TW, gy0 / (TERR_MESH_NY - 1) * TH, z, levelFrac,
                gx1 / (TERR_MESH_NX - 1) * TW, gy1 / (TERR_MESH_NY - 1) * TH, z, levelFrac);
    }
  }
  const arr = new Float32Array(buf);
  gl.bindBuffer(gl.ARRAY_BUFFER, terrainVBO);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  terrainVertCount = arr.length / 4;
}

// a carcass: one drifting point, drawn individually since there are only ever a handful at a time
const CARCASS_VS = `#version 300 es
uniform mat4 uVP; uniform float uShift, uShiftX, uRefDist, uPx, uLife, uOrtho; uniform vec3 uPos;
out float vA;
void main() {
  vec4 c = uVP * vec4(uPos, 1.0); c.y += uShift * c.w; c.x += uShiftX * c.w;
  gl_Position = c;
  gl_PointSize = uPx * (1.0 + 0.25 * sin(uLife * 3.0)) * uRefDist / max(1.0, mix(c.w, uRefDist, uOrtho));
  vA = clamp(uLife / 3.0, 0.0, 1.0);
}`;
const CARCASS_FS = `#version 300 es
precision mediump float; in float vA; out vec4 o;
void main() { float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
  vec3 col = vec3(0.58, 0.24, 0.17);
  o = vec4(col * vA * a, 1.0); }`;
const carcassProg = program(CARCASS_VS, CARCASS_FS);
const blurProg = program(QUAD_VS, BLUR_FS);
const compProg = program(QUAD_VS, COMP_FS);
const glowCompProg = program(QUAD_VS, GLOW_COMP_FS);
const fadeProg = program(QUAD_VS, FADE_FS);

const quadVAO = gl.createVertexArray();
// the species as data only: the shared renderer (src/creatures.js) builds and draws their geometry from window.EcologySpeciesPristine.
// Kept here: walking legs (the sim's walkers read them) and each one's length
for (const sp of SPECIES) { EcologyWalk.legs(sp); sp.BY0 = sp.bounds[1]; sp.LEN = sp.bounds[3] - sp.bounds[1]; delete sp.fillV; delete sp.fillI; delete sp.lineV; delete sp.lineI; }

function target(w, h) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}
let glowA, glowB, trailBuf, vw = 0, vh = 0, dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  vw = canvas.clientWidth; vh = canvas.clientHeight;
  EcologySim.resize(sim, vw, vh);
  canvas.width = Math.max(1, Math.round(vw * dpr)); canvas.height = Math.max(1, Math.round(vh * dpr));
  const gw = Math.max(1, Math.round(canvas.width / 4)), gh = Math.max(1, Math.round(canvas.height / 4));
  for (const t of [glowA, glowB, trailBuf]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); if (t.depth) gl.deleteRenderbuffer(t.depth); }
  glowA = target(gw, gh); glowB = target(gw, gh);
  // full-res, persisted across frames: a fish's own frame fades into it instead of being wiped by a hard clear
  trailBuf = target(canvas.width, canvas.height);
  trailBuf.depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, trailBuf.depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, canvas.width, canvas.height);   // 24 bits: at 16, a creature's lines and the solid under them share a depth step from far off and flicker
  gl.bindFramebuffer(gl.FRAMEBUFFER, trailBuf.fb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, trailBuf.depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  terrainRebuild();
}
new ResizeObserver(resize).observe(document.body);
resize();

// ---------- camera: perspective, looking down into the tank, tilted and turnable ----------
const M4 = {
  persp(fy, a, n, f) { const t = 1 / Math.tan(fy / 2), r = 1 / (n - f); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + f) * r, -1, 0, 0, 2 * n * f * r, 0]; },
  // standard OpenGL-style symmetric orthographic projection, same column-major layout as persp above
  ortho(w, h, n, f) {
    const r = 1 / (f - n);
    return [2 / w, 0, 0, 0, 0, 2 / h, 0, 0, 0, 0, -2 * r, 0, 0, 0, -(f + n) * r, 1];
  },
  look(e, c, up) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  },
  mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = v; } return o; },
  inv(m) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
            (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
            (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
            (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d];
  },
};
const cam = { vp: null, ivp: null, eye: [0, 0, 0], shift: 0, shiftX: 0, refDist: 1, yawT: 0, follow: null, fc: null, fyaw: 0, ftilt: null, fdist: null, tilt: null, yaw: null };
// "Fit view" / the selection Inspector's "Frame" button: frames an arbitrary tank-space point
// instead of a swimming fish, so it's a separate, much simpler state than cam.follow above -- no
// heading-chase/speed-based ease, a focus point doesn't move on its own. Reuses the same eased
// cam.fc/cam.ftilt/cam.fdist fields as Follow (they're never both live at once: updateCamera only
// enters this branch when S.view !== 'follow') so the transition in/out is smooth rather than a
// cut. null = normal tank-wide framing. { pos:[x,y], span, key } -- span is the real-world extent
// to fit in frame (a tower's height/reach, a cell's footprint, ...), generic across selection
// kinds; key identifies the source (e.g. 'tower:2') so a trigger can toggle itself back off.
let sceneFocus = null;
function setSceneFocus(pos, span, key) { sceneFocus = { pos, span: Math.max(1, span), key }; }
function clearSceneFocus() { sceneFocus = null; }
function towerFocusSpan(tw) { return Math.max(tw.built.top * 1.05, tw.built.reach * 2) * tw.scale; }
const dockEl = () => document.getElementById('dock');
function dockCover() {      // how much of the screen's right side the dock hides (0 on phones, where it is a bottom sheet)
  const d = dockEl(); if (!d || d.hidden || vw <= 760) return 0;
  return d.getBoundingClientRect().width + 16;
}
const drawerEl = () => document.querySelector('.drawer');
function drawerCover() {    // how much of the screen's left side the rail+rack together hide
  const d = drawerEl(); if (!d || vw <= 760) return 0;   // phones: the rack no longer sits beside the tank, it floats over it like the dock does
  return d.getBoundingClientRect().right + 16;   // .right (not .width): the drawer starts after the rail now, so this already folds the rail in
}
function pickFollow() {
  let want;
  if (S.species === 'mixed') {
    // pick a species, not just another individual — uniformly among the kinds actually alive right
    // now (not population-weighted, or a 60-strong wisp school would hog every pick), and different
    // from whatever's currently followed so "Follow another" always shows something new
    const alive = [...new Set(sim.fish.map(f => f.sp))];
    const others = alive.filter(sp => sp !== (cam.follow ? cam.follow.sp : -1));
    const choices = others.length ? others : alive;
    want = choices.length ? choices[Math.floor(Math.random() * choices.length)] : null;
  } else {
    want = SPECIES.findIndex(s => s.key === S.species);
  }
  let pool = sim.fish.filter(f => (want === null || f.sp === want) && f.fade > 0.5 && f.darkRoll >= S.dark);   // a lit one, so there is something to see
  if (!pool.length) pool = sim.fish.filter(f => want === null || f.sp === want);
  cam.follow = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;   // fc/fyaw/ftilt/fdist stay put so the next pick eases in rather than cutting
}
const tankH = () => vh * WORLD_SCALE;
const tankW = () => vw * WORLD_SCALE;
const tankDepth = () => Math.max(60, Math.min(tankW(), tankH()) * 0.9 * S.dz);

// temporary: one hardcoded placed tower, tank-centred, to validate the gl2 geometry port and
// draw-loop wiring end to end before any City/Tower dock UI exists (build-sequencing step 2)
