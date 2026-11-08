/* shared/look/style/style-recipes.js — a render style as data, so every view draws the same look.

   The Route Zero look was written three times (world/scenes/route/route.js, world/scenes/world-scene/
   route-scene.html, World Scene Next's Route style) and the third drifted, because its rules lived
   only in each renderer's code. A STYLE RECIPE writes the rules down once; every renderer reads the
   same recipe through the same shader chunk, so a look (or a new one saved in Forge) shows up the
   same way everywhere.

   A recipe has five parts:
     palette  ink, fog, line, warm (the one lantern tone), sky [top, mid, horizon], moon   (#rrggbb)
     depth    bands (flat steps from ink to fog, 0 = smooth), curve (how the fade bends), roof (how
              much paler upward-facing faces are, in band units)
     light    steps (hard steps in the lantern falloff, 0 = smooth), strength, glow (lit-window size)
     lines    mode ("pencil" | "glow" | "ink"), strength, hatch (engraving line spacing, px)
     atmo     ridges, pines, moon, pilgrims (booleans), grain, vignette (0..1), bloom (multiplier
              on the host's own glow pass)
   plus kind: how fills are shaded --
     "flat"      Route Zero: depth band + stepped lantern, no surface lighting
     "glow"      dark solids, bright lines (World Scene draws this kind with its own Glitch renderer)
     "engraving" paper, ink lines, screen-space hatching that thickens toward the viewer
     "relief"    carved stone under one raking light

   A recipe may name a `base` (another recipe's id) and set only what differs, the same way Forge's
   overrides chain (world/forge/web/forge-overrides.js): resolve() fills the rest from the base.

     StyleRecipes.BUILTINS                      -> [recipe]   the looks that ship
     StyleRecipes.resolve(recipe)               -> a complete recipe (base chain filled in)
     StyleRecipes.get(id)                       -> resolved built-in or saved recipe
     StyleRecipes.all()                         -> resolved built-ins + saved, in menu order
     StyleRecipes.loadSaved()                   -> Promise: reads "style" objects from the active
                                                   Forge world (world/forge/web/forge-world.js), if loaded
     StyleRecipes.styleOf(record)               -> the style id a Forge object carries: its record's
                                                   `style`, else "route-zero" for a building or prefab
                                                   (buildings carry Route Zero unless told otherwise),
                                                   else null (follow the scene)
     StyleRecipes.GLSL                          -> the shading chunk (uniforms + stShade()) to paste
                                                   into a fragment shader, GLSL ES 3.0 or three.js
     StyleRecipes.values(recipe)                -> { uniform name: number | [r,g,b] } for that chunk
     StyleRecipes.applyGL(gl, locs, recipe, frame)   set them on a raw WebGL program
     StyleRecipes.applyThree(uniforms, recipe, THREE, frame)   set them on three.js uniforms
       frame (per draw, from the renderer): { cam:[x,y,z], near, far, up:[x,y,z], sun:[x,y,z],
                                              lights:[{x,y,z,radius}] (up to 8) }

   stShade(worldPos, normal, isLine, tone, bandFix) returns the colour. Pass a zero normal when the
   surface has none (the chunk takes one from screen derivatives); bandFix >= 0 pins a whole layer
   (a ridge, the floor) to one band; tone shifts a layer paler (+) or darker (-). Classic script. */
(function () {
  "use strict";

  const KIND = { flat: 0, glow: 1, engraving: 2, relief: 3 };
  const DEFAULT = {
    kind: "flat",
    palette: { ink: "#1c2420", fog: "#7d8a80", line: "#c9d3c6", warm: "#f0b35a", sky: ["#26302c", "#56635b", "#8b978d"], moon: "#e6e9df" },
    depth: { bands: 5, curve: 1.5, roof: 0.09 },
    light: { steps: 3, strength: 1, glow: 0.42 },
    lines: { mode: "pencil", strength: 0.16, hatch: 6 },
    atmo: { ridges: true, pines: true, moon: true, pilgrims: true, grain: 1, vignette: 1, bloom: 0.45 },
  };
  const BUILTINS = [
    { id: "route-zero", name: "Route Zero", note: "Flat sage night. Painted planes, one warm light.", ...DEFAULT },
    { id: "route-blue", name: "Route Zero blue", base: "route-zero", note: "Kentucky Route Zero's own ultramarine and amber.",
      palette: { ink: "#0d1426", fog: "#36507d", line: "#9db3d9", warm: "#f5a742", sky: ["#070b18", "#1a2a52", "#3c5a8c"], moon: "#dfe6f0" } },
    { id: "ash", name: "Ash", base: "route-zero", note: "Warm grey dusk.",
      palette: { ink: "#1f1c19", fog: "#8a8274", line: "#d6cfc0", warm: "#ee9f4d", sky: ["#24211e", "#5e5850", "#9a9284"], moon: "#efe9dc" } },
    { id: "paper", name: "Paper", base: "route-zero", note: "Dark ink planes on cream.",
      palette: { ink: "#2a2a27", fog: "#d9d4c7", line: "#2a2a27", warm: "#e2873a", sky: ["#bdb7a8", "#d8d2c3", "#ebe6da"], moon: "#fbf8f0" },
      lines: { strength: 0.3 } },
    { id: "glitch", name: "Glitch", note: "Dark solids, bright glowing line work.", kind: "glow",
      palette: { ink: "#04060a", fog: "#162030", line: "#9fe0d0", warm: "#f0b35a", sky: ["#020306", "#060a12", "#0c1420"], moon: "#cfe0f0" },
      depth: { bands: 0, curve: 1, roof: 0 }, light: { steps: 0, strength: 1, glow: 1 }, lines: { mode: "glow", strength: 1 },
      atmo: { ridges: false, pines: false, moon: false, pilgrims: false, grain: 0, vignette: 0, bloom: 1 } },
    { id: "engraving", name: "Engraving", note: "Paper, ink lines, hatching that thickens toward you.", kind: "engraving",
      palette: { ink: "#1c1a16", fog: "#ede6d6", line: "#1c1a16", warm: "#ede6d6", sky: ["#e4dccb", "#ebe4d4", "#f1ebdd"], moon: "#fbf7ee" },
      depth: { bands: 5, curve: 1, roof: 0.15 }, lines: { mode: "ink", strength: 0.5, hatch: 8 },
      atmo: { ridges: true, pines: true, moon: true, pilgrims: true, grain: 0.3, vignette: 0.3, bloom: 0 } },
    { id: "relief", name: "Relief", note: "Carved stone under one raking light.", kind: "relief",
      palette: { ink: "#54504a", fog: "#d9d1c0", line: "#3e3a34", warm: "#e9b56a", sky: ["#bdb4a2", "#cdc5b4", "#dad3c3"], moon: "#efe9dc" },
      depth: { bands: 0, curve: 1, roof: 0 }, lines: { mode: "ink", strength: 0.4 },
      atmo: { ridges: true, pines: true, moon: false, pilgrims: true, grain: 0.5, vignette: 0.6, bloom: 0.2 } },
  ];

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  function merge(a, b) {   // b over a, one level into each part
    const out = { ...a };
    for (const k of Object.keys(b || {})) out[k] = isObj(b[k]) && isObj(a[k]) ? { ...a[k], ...b[k] } : b[k];
    return out;
  }
  let saved = [];
  const byId = (id) => saved.find((r) => r.id === id) || BUILTINS.find((r) => r.id === id);
  function resolve(r, depth) {
    if (!r) return resolve(BUILTINS[0]);
    const base = r.base && (depth || 0) < 8 ? resolve(byId(r.base), (depth || 0) + 1) : DEFAULT;
    return merge(base, r);
  }
  const get = (id) => resolve(byId(id) || BUILTINS[0]);
  const all = () => [...BUILTINS, ...saved].map((r) => resolve(r));

  async function loadSaved() {
    try {
      if (!window.ForgeWorld || !ForgeWorld.listWorlds().length) return saved;
      const meta = ForgeWorld.listWorlds().find((w) => w.id === ForgeWorld.getActiveWorldId()) || ForgeWorld.listWorlds()[0];
      const w = await ForgeWorld.open(meta.id);
      saved = (await w.list("style")).map((o) => ({ ...(o.recipe || {}), id: o.id, name: o.name || (o.recipe && o.recipe.name) || "Saved style", saved: true }));
    } catch (e) { /* no Forge world here: built-ins only */ }
    return saved;
  }

  // the look a saved Forge object asks to be drawn in: the record's own `style` field (forge-world.js),
  // so it travels with the object into City, Ecology and the scenes
  const BUILDING_DEFAULT = "route-zero";
  function styleOf(rec) {
    if (!rec) return null;
    if (rec.style) return rec.style;
    return rec.type === "building" || rec.prefab ? BUILDING_DEFAULT : null;
  }

  // ── the shading chunk ─────────────────────────────────────────────────────────────────────────
  const GLSL = /* glsl */`
uniform vec3 uStInk, uStFog, uStLine, uStWarm, uStCam, uStUp, uStSun;
uniform vec4 uStLights[8];
uniform float uStNear, uStFar, uStBands, uStCurve, uStRoof, uStSteps, uStLight, uStKind, uStLineStr, uStHatch;
float stBand(vec3 w, float fix) {
  if (fix >= 0.0) return fix;
  float d = clamp((length(w - uStCam) - uStNear) / max(1.0, uStFar - uStNear), 0.0, 1.0);
  return uStBands > 0.5 ? floor(d * uStBands + 0.5) / uStBands : d;
}
float stLamp(vec3 w) {
  float L = 0.0;
  for (int i = 0; i < 8; i++) if (uStLights[i].w > 0.0) L = max(L, 1.0 - distance(w, uStLights[i].xyz) / uStLights[i].w);
  L = clamp(L, 0.0, 1.0);
  return (uStSteps > 0.5 ? clamp(floor(L * uStSteps + 0.35) / uStSteps, 0.0, 1.0) : L) * uStLight;
}
vec3 stShade(vec3 w, vec3 n, float isLine, float tone, float fix) {
  float band = stBand(w, fix), L = stLamp(w);
  vec3 nn = length(n) > 0.01 ? normalize(n) : normalize(cross(dFdx(w), dFdy(w)));
  float roof = (fix < 0.0 && abs(dot(nn, uStUp)) > 0.7) ? uStRoof : 0.0;   // a pinned layer (floor) stays its one band
  if (uStKind < 0.5) {                                   // flat (Route Zero)
    vec3 col = mix(uStInk, uStFog, clamp(pow(band, uStCurve) * 0.95 + tone + roof, 0.0, 1.0));
    col = mix(col, uStWarm * mix(0.55, 1.0, L), L * 0.62);
    if (isLine > 0.5) col = mix(col, mix(uStLine, uStWarm, L * 0.5), clamp(uStLineStr * (0.6 + 0.4 * (1.0 - band)), 0.0, 1.0));
    return col;
  } else if (uStKind < 1.5) {                            // glow
    vec3 col = mix(uStInk, uStFog, band * 0.55 + tone * 0.5) + uStWarm * L * 0.3;
    if (isLine > 0.5) col = mix(uStLine, uStWarm, L * 0.75) * (1.35 - band * 0.8) * uStLineStr;
    return col;
  } else if (uStKind < 2.5) {                            // engraving
    if (isLine > 0.5) return mix(uStFog, uStInk, clamp(uStLineStr * 2.0, 0.0, 1.0));
    float dark = clamp((1.0 - band) * 0.5 - tone * 0.6 - roof, 0.0, 1.0) * (1.0 - L * 0.9);
    if (fix >= 0.0) dark *= 0.45;                        // a pinned layer (floor, ridge) is ground, not subject: keep it light
    float sp = max(2.0, uStHatch), h1 = fract((gl_FragCoord.x + gl_FragCoord.y) / sp), h2 = fract((gl_FragCoord.x - gl_FragCoord.y) / sp);
    float ink = step(h1, dark * 0.3);                    // one diagonal, thicker toward the viewer
    if (dark > 0.42) ink = max(ink, step(h2, (dark - 0.42) * 0.5));   // cross-hatch only the nearest, darkest band
    return mix(uStFog, uStInk, ink);
  }
  if (dot(nn, uStCam - w) < 0.0) nn = -nn;               // relief
  float sh = 0.12 + 0.88 * max(dot(nn, normalize(uStSun)), 0.0);
  vec3 col = mix(uStInk, uStFog, clamp(sh + tone, 0.0, 1.0));
  col = mix(col, uStFog, band * 0.3); col = mix(col, uStWarm, L * 0.4);
  if (isLine > 0.5) col *= 1.0 - clamp(uStLineStr, 0.0, 1.0);
  return col;
}`;

  const rgb = (h) => { const n = parseInt(String(h || "#000000").slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  function values(recipe) {
    const r = resolve(recipe);
    return {
      uStInk: rgb(r.palette.ink), uStFog: rgb(r.palette.fog), uStLine: rgb(r.palette.line), uStWarm: rgb(r.palette.warm),
      uStBands: r.depth.bands, uStCurve: r.depth.curve, uStRoof: r.depth.roof,
      uStSteps: r.light.steps, uStLight: r.light.strength,
      uStKind: KIND[r.kind] ?? 0, uStLineStr: r.lines.strength, uStHatch: r.lines.hatch || 6,
    };
  }
  function lightsVec(lights) {
    const lv = new Float32Array(32);
    (lights || []).slice(0, 8).forEach((L, i) => { lv[i * 4] = L.x; lv[i * 4 + 1] = L.y; lv[i * 4 + 2] = L.z; lv[i * 4 + 3] = L.radius; });
    return lv;
  }
  // raw WebGL: `locs` is the program's uniform-location map (names with "[0]" stripped)
  function applyGL(gl, locs, recipe, frame) {
    const v = values(recipe);
    for (const [k, x] of Object.entries(v)) { const l = locs[k]; if (!l) continue; if (Array.isArray(x)) gl.uniform3fv(l, x); else gl.uniform1f(l, x); }
    if (frame) {
      if (locs.uStCam) gl.uniform3fv(locs.uStCam, frame.cam);
      if (locs.uStUp) gl.uniform3fv(locs.uStUp, frame.up || [0, 1, 0]);
      if (locs.uStSun) gl.uniform3fv(locs.uStSun, frame.sun || [-0.7, 0.55, 0.45]);
      if (locs.uStNear) gl.uniform1f(locs.uStNear, frame.near);
      if (locs.uStFar) gl.uniform1f(locs.uStFar, frame.far);
      if (locs.uStLights) gl.uniform4fv(locs.uStLights, lightsVec(frame.lights));
    }
  }
  // three.js: colours go through THREE.Color so they're linearised like the rest of the scene
  // (the material must end with <colorspace_fragment>); `uniforms` is a shared uniforms object
  function threeUniforms(THREE) {
    const u = {};
    for (const k of ["uStInk", "uStFog", "uStLine", "uStWarm"]) u[k] = { value: new THREE.Color() };
    for (const k of ["uStCam", "uStUp", "uStSun"]) u[k] = { value: new THREE.Vector3() };
    for (const k of ["uStBands", "uStCurve", "uStRoof", "uStSteps", "uStLight", "uStKind", "uStLineStr", "uStHatch", "uStNear", "uStFar"]) u[k] = { value: 0 };
    u.uStLights = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) };
    return u;
  }
  function applyThree(u, recipe, THREE, frame) {
    const r = resolve(recipe), v = values(r);
    u.uStInk.value.set(r.palette.ink); u.uStFog.value.set(r.palette.fog); u.uStLine.value.set(r.palette.line); u.uStWarm.value.set(r.palette.warm);
    for (const k of ["uStBands", "uStCurve", "uStRoof", "uStSteps", "uStLight", "uStKind", "uStLineStr", "uStHatch"]) u[k].value = v[k];
    if (frame) {
      if (frame.cam) u.uStCam.value.fromArray(frame.cam);
      u.uStUp.value.fromArray(frame.up || [0, 1, 0]); u.uStSun.value.fromArray(frame.sun || [-0.7, 0.55, 0.45]);
      if (frame.near != null) u.uStNear.value = frame.near; if (frame.far != null) u.uStFar.value = frame.far;
      if (frame.lights) { const lv = frame.lights; for (let i = 0; i < 8; i++) { const L = lv[i]; if (L) u.uStLights.value[i].set(L.x, L.y, L.z, L.radius); else u.uStLights.value[i].set(0, -999, 0, 0); } }
    }
  }

  window.StyleRecipes = { BUILTINS, DEFAULT, KIND, BUILDING_DEFAULT, styleOf, resolve, get, all, loadSaved, saved: () => saved.slice(), GLSL, values, applyGL, threeUniforms, applyThree, rgb };
})();
