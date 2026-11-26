// world/scenes/world-scene/src/towers.js -- World Scene: Towers and the city's static geometry from packages/city/tower-engine-gl2.js: building, placing, drawing; offscreen tower thumbnails.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- towers & city: static procedural geometry (packages/city/tower-engine-gl2.js and
// shared/engine/city/city-mesh-gl2.js, both THREE-free ports), built once per "New world" and drawn each
// frame against the same tank-space camera the fish and terrain already use. Local tower/city
// space has "up" = +Y; tank space has no Y-up axis at all (X,Y span the tank's horizontal
// plane, Z is depth toward/away from camera — see tankW/tankH/tankDepth above), so the one real
// geometric step here is remapping "up" onto "closer to camera", the same convention terrain's
// own relief already uses (a taller terrain point gets a *smaller* z).
const TOWER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUV;
layout(location=3) in vec4 aCol;
uniform mat4 uVP, uModel;
uniform float uShift, uShiftX;
out vec3 vNrm; out vec2 vUV; out vec4 vCol; out vec3 vWorldPos;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vNrm = mat3(uModel) * aNrm;
  vUV = aUV; vCol = aCol; vWorldPos = wp.xyz;
  vec4 c = uVP * wp; c.y += uShift * c.w; c.x += uShiftX * c.w;
  gl_Position = c;
}`;
const TOWER_FS = `#version 300 es
precision highp float;
in vec3 vNrm; in vec2 vUV; in vec4 vCol; in vec3 vWorldPos;
uniform vec3 uTint; uniform float uUnlit, uUseTex, uCutout, uAlpha;
uniform vec3 uCam;
uniform sampler2D uTex;
// a style recipe (uRoute = 1): the shared chunk from packages/render/style-recipes.js shades the fill --
// for Route Zero no N.L, no rim, no baked colour, just stepped depth bands warmed near the lanterns;
// the other recipes (engraving, relief, saved ones) through the same function. styleFlat() sets it.
${StyleRecipes.GLSL}
uniform float uRoute, uTone;
out vec4 o;
void main() {
  if (uRoute > 0.5) { o = vec4(stShade(vWorldPos, vNrm, 0.0, uTone, -1.0), 1.0); return; }
  vec3 N = normalize(vNrm);
  vec3 L = normalize(vec3(0.35, 0.55, -0.6));
  float lit = uUnlit > 0.5 ? 1.0 : (0.35 + 0.65 * max(0.0, dot(N, L)));
  vec4 texc = uUseTex > 0.5 ? texture(uTex, vUV) : vec4(1.0);
  if (uCutout > 0.5 && texc.a < 0.35) discard;
  vec3 col = uTint * vCol.rgb * texc.rgb * lit;
  // a cool rim glow at grazing angles ties lit city/tower surfaces into the same luminous,
  // underwater mood the fish and halos already carry, instead of reading as a flat architectural render
  if (uUnlit < 0.5) {
    vec3 V = normalize(uCam - vWorldPos);
    float rim = pow(1.0 - max(0.0, dot(N, V)), 2.5);
    col += rim * vec3(0.25, 0.55, 0.9) * 0.35;
  }
  o = vec4(col, uAlpha * vCol.a * texc.a);
}`;
const towerProg = program(TOWER_VS, TOWER_FS);
// Dedicated glass-tower fragment shader (reuses TOWER_VS's vertex stage/attribute layout, so its
// VAOs are interchangeable with towerProg's — same attribute locations, just a different program
// object bound when drawing). Kept separate from TOWER_FS rather than adding more uUnlit-style
// branches to it, since that shader is also shared by city buildings and the Tower panel's
// thumbnail renderer, who have no use for a glass-specific fresnel/noise look.
const TOWER_GLASS_FS = `#version 300 es
precision mediump float;
in vec3 vNrm; in vec2 vUV; in vec4 vCol; in vec3 vWorldPos;
uniform vec3 uTint; uniform float uAlpha, uTime;
uniform vec3 uCam;
out vec4 o;
float hash31(vec3 p) { p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i), n100 = hash31(i + vec3(1,0,0)), n010 = hash31(i + vec3(0,1,0)), n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1)), n101 = hash31(i + vec3(1,0,1)), n011 = hash31(i + vec3(0,1,1)), n111 = hash31(i + vec3(1,1,1));
  float nx00 = mix(n000, n100, f.x), nx10 = mix(n010, n110, f.x), nx01 = mix(n001, n101, f.x), nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}
void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCam - vWorldPos);
  float lit = 0.35 + 0.65 * max(0.0, dot(N, normalize(vec3(0.35, 0.55, -0.6))));
  // fresnel: glass reads near-invisible face-on, bright at grazing edges -- classic glass-shell look
  float fres = pow(1.0 - max(0.0, dot(N, V)), 4.0);
  // slow drifting 3D value noise (world-space, so it reads as volume inside the glass, not a
  // surface decal) breaks the fill into an uneven, faintly foggy texture instead of a flat tint
  float n = noise3(vWorldPos * 0.045 + vec3(0.0, 0.0, uTime * 0.12));
  vec3 col = uTint * vCol.rgb * lit + fres * uTint * 0.45 + n * uTint * 0.12;
  // fresnel is deliberately left OUT of alpha: many thin overlapping shells (tiers, ribs, crown
  // lattice) compound a per-fragment alpha boost into near-opaque white through overdraw, which is
  // what made an earlier version of this look like a solid frosted bulb instead of glass
  float alpha = uAlpha * (0.75 + 0.3 * n);
  o = vec4(col, clamp(alpha, 0.0, 1.0) * vCol.a);
}`;
const towerGlassProg = program(TOWER_VS, TOWER_GLASS_FS);

// creature-part architecture: glowing gl.LINES geometry (packages/kit/creature-arch.js turns the
// 347-piece sigil-creature sheet into these line-segment elevations), drawn additively like
// terrain's own contour lines above, just with a per-vertex colour instead of one fixed ramp.
const CREATURE_LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aCol;
uniform mat4 uVP, uModel;
uniform float uShift, uShiftX;
out vec3 vCol;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vCol = aCol;
  vec4 c = uVP * wp; c.y += uShift * c.w; c.x += uShiftX * c.w;
  gl_Position = c;
}`;
const CREATURE_LINE_FS = `#version 300 es
precision mediump float;
in vec3 vCol; uniform float uAlpha; uniform vec3 uStyleTint; uniform float uMono; out vec4 o;
// uMono (Route Zero): the line drawing becomes a grey pencil tone, capped at white first, so bright
// zone-glow colours can't punch through as neon
void main() { vec3 c = uMono > 0.5 ? vec3(dot(min(vCol, vec3(1.0)), vec3(0.333))) : vCol; o = vec4(c * uStyleTint * uAlpha, 1.0); }`;
const creatureLineProg = program(CREATURE_LINE_VS, CREATURE_LINE_FS);
// uploads one {positions:Float32Array(xyz triples), color:Float32Array(rgb triples, same vertex
// count as positions)} line-part — every consecutive pair of vertices is one gl.LINES segment
// part.colors (plural) is CreatureArch's own convention (standElevation/wrapOnSurface both return
// {positions, colors}) and also what creature-city.js's Geo.done() returns; `.color` (singular) is
// kept as a fallback for any caller that still hand-builds its own {positions, color} literal (a
// GL_INVALID_VALUE from gl.bufferData(..., undefined, ...) otherwise — found while wiring
// creature-city.js in, since it was passing `.colors` straight through like CreatureArch always has).
function uploadLinePart(part) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const colBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, part.colors || part.color, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, count: part.positions.length / 3 };
}

// instanced variant: many buildings in a city share the same (kind, zone) combo and therefore —
// since the kit and bandOpts are keyed by exactly those — produce byte-identical LOCAL elevation
// geometry, differing only by each cell's position/size/facing. Building that geometry once (at
// unit footprint radius, centred on the origin) and drawing it many times with a per-instance mat4
// avoids redoing the SVG-polyline placement/transform math (previously the dominant per-"New
// World" CPU cost) for every single building — same idea as CITY_INST_VS's box/cylinder instancing.
const CREATURE_LINE_INST_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aCol;
layout(location=4) in vec4 aM0;
layout(location=5) in vec4 aM1;
layout(location=6) in vec4 aM2;
layout(location=7) in vec4 aM3;
uniform mat4 uVP;
uniform float uShift, uShiftX;
out vec3 vCol;
void main() {
  mat4 M = mat4(aM0, aM1, aM2, aM3);
  vec4 wp = M * vec4(aPos, 1.0);
  vCol = aCol;
  vec4 c = uVP * wp; c.y += uShift * c.w; c.x += uShiftX * c.w;
  gl_Position = c;
}`;
const creatureLineInstProg = program(CREATURE_LINE_INST_VS, CREATURE_LINE_FS);   // shares the same fragment shader as the non-instanced one above
// baseLineGeom: {positions:Float32Array(xyz triples), colors:Float32Array(rgb triples)} — unit-
// space, centred at the origin (`.colors`, matching CreatureArch's and creature-city.js's own
// convention; `.color` kept as a fallback, see uploadLinePart's note above). matrices: array of
// column-major Float32Array(16) instance transforms.
function uploadLineInstanceGroup(baseLineGeom, matrices) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, baseLineGeom.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const colBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, baseLineGeom.colors || baseLineGeom.color, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const flat = new Float32Array(matrices.length * 16);
  for (let i = 0; i < matrices.length; i++) flat.set(matrices[i], i * 16);
  const instBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, flat, gl.STATIC_DRAW);
  for (let k = 0; k < 4; k++) {
    const loc = 4 + k;
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, k * 16); gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);
  return { vao, vertCount: baseLineGeom.positions.length / 3, instCount: matrices.length };
}

function hexToRgb3(hex) { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

// uploads one packages/city/tower-engine-gl2.js (or city-mesh-gl2.js) part — {positions,normals,uv,
// color,indices,mode,texture,materialTag} — into a VAO; returns the handle draw() needs.
function uploadGeoPart(part) {
  const isPoints = part.mode === 'points';
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  if (isPoints) {
    const colBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, part.color, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  } else {
    const nrmBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, part.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const uvBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    // a part with no uv of its own (city-grammar's non-indexed fills, uploaded with just
    // positions/normals/indices) needs SOME data here: an enabled vertex attribute array bound to a
    // too-small (or, as `undefined` coerces to, zero-size) buffer makes WebGL silently refuse to draw
    // at all -- no thrown error, no console output, just nothing on screen -- so this always needs a
    // real buffer sized for the vertex count, same as the color fallback just below already does
    gl.bufferData(gl.ARRAY_BUFFER, part.uv || new Float32Array((part.positions.length / 3) * 2), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    const colBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    // shared/engine/city/city-mesh-gl2.js parts carry no per-vertex colour (only tower-engine-gl2.js's do) — default to opaque white
    gl.bufferData(gl.ARRAY_BUFFER, part.color || new Float32Array((part.positions.length / 3) * 4).fill(1), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);
  }
  let count;
  if (isPoints) {
    count = part.positions.length / 3;
  } else {
    const idxBuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);
    count = part.indices.length;
  }
  // city-mesh-gl2.js parts carry no per-vertex colour (only packages/city/tower-engine-gl2.js's parts do) —
  // location 3 is bound above either way (filled with 1,1,1,1) so one program (towerProg) can draw both
  gl.bindVertexArray(null);
  let tex = null;
  if (part.texture && part.texture.canvas) {
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, part.texture.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }
  return { vao, isPoints, count, materialTag: part.materialTag, tex };
}

// one placed tower: a built spec, its uploaded GL parts, and the tank-space placement that
// turns its local (x, height, z) geometry into world (tankX, tankY, tankZ).
// one glowing creature-part ornament band per tier, wrapped onto that tier's own curved surface
// (packages/kit/creature-arch.js's wrapOnSurface — the "Spire Forge ornament" idea from Tower Forge (1).html,
// generalized) — built in the tower's own LOCAL space, then carried through the same `model` as
// the tower's real geometry so it rides along with it exactly.
// `grammarOverride` (optional): use this exact band-grammar instead of building a fresh one from
// `rnd` -- lets "Mutate style" (see mutateTowerStyle() below) apply a CreatureArch.mutateBandGrammar()
// result instead of every rebuild re-deriving the same seed-determined grammar. Either way, the
// grammar actually used is stashed on the returned part as `.grammar` so a caller can persist/mutate
// it later (harmless extra property; disposeTowerEntry only ever reads `.vao` off this object).
function buildTowerCreatureOrnament(spec, seed, model, grammarOverride) {
  if (!CreatureArch.ready) return null;
  const rnd = RNG.create(seed, 'ornament');
  const kit = CreatureArch.archKits(rnd, ['tower']).get('tower');
  const grammar = grammarOverride || CreatureArch.makeBandGrammar(rnd, kit);   // one consistent rule set for every tier's band, so bays read as one coherent design, not independently-random noise per tier
  const glowColor = hexToRgb3(spec.look.glow || spec.look.accent || '#ffffff');
  const posAll = [], colAll = [];
  let y0 = 0;
  spec.tiers.forEach((tier, i) => {
    const radius = Math.max(0.3, (tier.r0 + tier.r1) / 2) * 1.04;
    // ground tier reads as the base band (its own rule family); everything above reads as the
    // repeating "drum" band family — the same base/drum distinction Spire Forge's own rule table uses
    // a tier imported via Spire Forge's "To Tower Forge" bridge carries orn (exact part ids +
    // counts/pixel sizes it computed for this tier's bays/ribs/frieze) — when present, that's the
    // hand-authored ground truth, so it's used verbatim instead of the generic grammar+kit band.
    // Any tier without orn (presets, mutations, Atlas evolution) keeps the original generic path.
    const hasOrn = tier.orn && (tier.orn.bay || tier.orn.front || tier.orn.rib || tier.orn.frieze);
    const bandOpts = { grammar, rng: rnd, family: i === 0 ? 'base' : 'drum', level: i === 0 ? 'ground' : null };
    const elevation = hasOrn ? CreatureArch.elevFromOrn(tier.orn, 70) : CreatureArch.elevHall(kit, 280, 70, false, bandOpts);
    if (elevation.E.length) {
      const { positions, colors } = CreatureArch.wrapOnSurface(elevation, [0, y0, 0], [0, 1, 0], rnd() * Math.PI * 2, radius, tier.h, 1.0, { defaultColor: glowColor });
      mat4TransformPoints(positions, model);
      for (let j = 0; j < positions.length; j++) posAll.push(positions[j]);
      for (let j = 0; j < colors.length; j++) colAll.push(colors[j]);
    }
    y0 += tier.h;
  });
  const ornPart = posAll.length ? uploadLinePart({ positions: new Float32Array(posAll), color: new Float32Array(colAll) }) : null;
  if (ornPart) ornPart.grammar = grammar;
  return ornPart;
}
// Spire Stack's technique (world/forges/fish-tool/Spire Stack.html: cut a drawn elevation into slices,
// spin each slice into copies around the spine, stack into a tower) generalized the same way the
// city's buildings already use it — standElevation IS that technique, radially standing an
// elevation in several copies around a vertical axis. The first version of this function called
// buildTemplate() ONCE for the whole tower and force-stretched it to the tower's total height,
// which collapsed a whole multi-tier Tower Forge spec into one generic, heavily distorted
// silhouette ("don't look anything like the SVG... reduced too much"). This version instead
// composes ONE elevation PER TIER — same technique buildTowerCreatureOrnament already uses for
// its wrapped bands, just stood up as a solid radial volume instead of wrapped thin onto the
// surface — so the body's richness and taper track the tower's own real tier count/radii at their
// natural (undistorted) proportions, and reads far denser (planeCount 6, not 3).
function buildTowerCreatureBody(spec, seed, model, totalH, grammarOverride) {
  if (!CreatureArch.ready) return null;
  const rnd = RNG.create(seed, 'body');
  const kit = CreatureArch.archKits(rnd, ['tower']).get('tower');
  const grammar = grammarOverride || CreatureArch.makeBandGrammar(rnd, kit);
  const glowColor = hexToRgb3(spec.look.glow || spec.look.accent || '#ffffff');
  const posAll = [], colAll = [];
  let y0 = 0;
  spec.tiers.forEach((tier, i) => {
    const radius = Math.max(0.3, (tier.r0 + tier.r1) / 2);
    const bandOpts = { grammar, rng: rnd, family: i === 0 ? 'base' : 'drum', level: i === 0 ? 'ground' : null };
    const elevation = CreatureArch.elevHall(kit, 280, 70, false, bandOpts);
    if (elevation.E.length) {
      const { positions, colors } = CreatureArch.standElevation(elevation, [0, y0, 0], radius, 6, { defaultColor: glowColor });
      for (let j = 0; j < positions.length; j++) posAll.push(positions[j]);
      for (let j = 0; j < colors.length; j++) colAll.push(colors[j]);
    }
    y0 += tier.h;
  });
  // crown: one small lighthouse/spire flourish, stretched ONLY across the (usually short) gap
  // between the last tier and the real shell's crown-inclusive top (`totalH`), so the depth
  // occluder never pokes out above the glowing body — the distortion this stretch causes stays
  // confined to the crown cap instead of warping the whole tower the way the old version did.
  const crownH = Math.max(0, totalH - y0);
  if (crownH > 0.5) {
    const templateName = pickCreatureTemplate('tower', rnd);
    const crownElev = CreatureArch.buildTemplate(templateName, kit, rnd);
    if (crownElev.E.length) {
      const topTier = spec.tiers[spec.tiers.length - 1] || { r1: 1 };
      const { positions, colors } = CreatureArch.standElevation(crownElev, [0, y0, 0], Math.max(0.3, topTier.r1), 6, { defaultColor: glowColor });
      let maxY = 0;
      for (let i = 1; i < positions.length; i += 3) if (positions[i] > maxY) maxY = positions[i];
      if (maxY > 0.001) { const k = crownH / maxY; for (let i = 1; i < positions.length; i += 3) positions[i] *= k; }
      for (let j = 0; j < positions.length; j++) posAll.push(positions[j]);
      for (let j = 0; j < colors.length; j++) colAll.push(colors[j]);
    }
  }
  if (!posAll.length) return null;
  const positions = new Float32Array(posAll), colors = new Float32Array(colAll);
  mat4TransformPoints(positions, model);
  const bodyPart = uploadLinePart({ positions, color: colors });
  if (bodyPart) bodyPart.grammar = grammar;
  return bodyPart;
}
// `styleOverride` (optional): { orn, body } band-grammars to force onto the creature-ornament/body
// passes instead of their seed-derived defaults -- set by mutateTowerStyle() below and carried
// forward on the returned entry so subsequent edits (rebuildPlacedTowerAt) keep the mutated look
// instead of silently reverting to the seed's original grammar.
// A building designed in Forge carries its whole design (spec.spire, the Spire genome). That exact
// tower is stood here (creature-spire.js): its drawing in the round and a silhouette that matches
// it, instead of the Tower-engine shell the spec only approximates it with.
const spireOf = (spec) => (spec && spec.spire && CreatureArch.ready && window.CreatureSpire) ? spec.spire : null;
function towerDims(spec, seed) {
  const g = spireOf(spec);
  if (g) {
    const L = CreatureSpire.layout(g), u = 1 / 16;
    const r = Math.max(8, ...L.solids.map(sd => Math.max(sd.r0, sd.r1)), ...L.boxes.map(b => Math.max(Math.abs(b.x0), Math.abs(b.x1))));
    return { top: L.top * u, r: r * u };
  }
  return { top: TowerEngineGL2.buildTowerGL2(spec, RNG.create(seed)).top, r: Math.max(...spec.tiers.map(t => Math.max(t.r0, t.r1))) };
}
// Two drawings of one tower. The one drawn across the city has its ornament simplified to about
// half a screen pixel at the whole-city view (a tenth of the segments or fewer, with nothing visibly
// lost); the full drawing is only built the first time the tower is seen close (towerLines below).
function spireLines(spec, model, detail) {
  const glow = hexToRgb3((spec.look && (spec.look.glow || spec.look.accent)) || '#7ff0b0');
  const b = CreatureSpire.buildSpireGL2(spec.spire, { color: glow, detail });
  const positions = new Float32Array(b.lines.positions); mat4TransformPoints(positions, model);
  return { built: b, part: positions.length ? uploadLinePart({ positions, color: b.lines.colors }) : null };
}
function buildPlacedSpire(spec, seed, tankX, tankY, scale) {
  const baseZ = tankDepth() * 0.92 - cityLiftAt(tankX, tankY);
  const model = new Float32Array([scale, 0, 0, 0,  0, 0, -scale, 0,  0, scale, 0, 0,  tankX, tankY, baseZ, 1]);
  // one sheet px of this tower on screen when the whole city is in frame (the framing ForgeCityHost.frame / the default view use)
  const pxPerSheet = (scale / 16) * (vh / Math.max(1, 2 * CITY_FOOTPRINT_FRAC * tankW() * 1.2));
  const detail = Math.max(1, Math.min(6, 0.5 / Math.max(pxPerSheet, 1e-3)));
  const far = spireLines(spec, model, detail), b = far.built;
  return { spec, built: { top: b.top, reach: b.reach, parts: [] }, uploaded: [uploadGeoPart(b.occluder)], pos: [tankX, tankY], scale, model, builtSeed: seed,
    creatureOrnament: null, creatureBody: far.part, creatureBodyFull: null, styleOverride: null, spire: true, footR: towerDims(spec, seed).r, lineCount: b.stats.segments };
}
// which drawing of a tower this frame: the full one once it stands taller than 30% of the view
function towerLines(tw) {
  if (!tw.spire) return tw.creatureBody;
  const base = hudProject(tw.pos[0], tw.pos[1], tw.model[14]), tip = hudProject(tw.pos[0], tw.pos[1], tw.model[14] - tw.built.top * tw.scale);
  if (!base || !tip || Math.hypot(tip.x - base.x, tip.y - base.y) < vh * 0.3) return tw.creatureBody;
  if (!tw.creatureBodyFull) tw.creatureBodyFull = spireLines(tw.spec, tw.model, 0).part;
  return tw.creatureBodyFull || tw.creatureBody;
}
function buildPlacedTower(spec, seed, tankX, tankY, scale, styleOverride) {
  if (spireOf(spec)) return buildPlacedSpire(spec, seed, tankX, tankY, scale);
  const rnd = RNG.create(seed);
  const built = TowerEngineGL2.buildTowerGL2(spec, rnd);
  const uploaded = built.parts.map(uploadGeoPart);
  const baseZ = tankDepth() * 0.92 - cityLiftAt(tankX, tankY);   // standing on its terrace
  // column-major mat4: local x -> tank X, local z -> tank Y, local y (height) -> SMALLER tank Z
  // (rising toward the camera), matching terrain's own peak-pulls-toward-camera convention above.
  const model = new Float32Array([
    scale, 0, 0, 0,
    0, 0, -scale, 0,
    0, scale, 0, 0,
    tankX, tankY, baseZ, 1,
  ]);
  const creatureOrnament = buildTowerCreatureOrnament(spec, seed, model, styleOverride && styleOverride.orn);
  const creatureBody = buildTowerCreatureBody(spec, seed, model, built.top, styleOverride && styleOverride.body);
  return { spec, built, uploaded, pos: [tankX, tankY], scale, model, builtSeed: seed, creatureOrnament, creatureBody, styleOverride: styleOverride || null };
}
// VAOs/textures only — the underlying VBOs/IBOs they reference are left for the browser to collect
// on navigation; an editing session creates and discards many of these, but each is tiny
function disposeTowerEntry(entry) {
  for (const up of entry.uploaded) { gl.deleteVertexArray(up.vao); if (up.tex) gl.deleteTexture(up.tex); }
  if (entry.creatureOrnament) gl.deleteVertexArray(entry.creatureOrnament.vao);
  if (entry.creatureBody) gl.deleteVertexArray(entry.creatureBody.vao);
  if (entry.creatureBodyFull) gl.deleteVertexArray(entry.creatureBodyFull.vao);
}
function rebuildPlacedTowerAt(i) {
  const old = placedTowers[i];
  placedTowers[i] = buildPlacedTower(old.spec, old.builtSeed, old.pos[0], old.pos[1], old.scale, old.styleOverride);
  placedTowers[i].revealRank = old.revealRank;   // preserve Growth-reveal rank across edits (not set by buildPlacedTower itself -- see placeTowersForCity)
  disposeTowerEntry(old);
  refreshVortices();
}
let placedTowers = [];
// Route style's atmosphere layer (packages/render/route-atmo-gl2.js): created lazily on first use,
// rebuilt whenever the city itself regenerates (end of buildPlacedCity below) so the ridge ring/
// pines/pilgrims/lantern glow always match the current seed and city radius.
let routeAtmoCtx = null, atmoWorld = null;
function rebuildRouteAtmo(seed, tankX, tankY, baseZ, cityRadius) {
  if (!routeAtmoCtx) routeAtmoCtx = RouteAtmoGL2.create(gl);
  if (atmoWorld) RouteAtmoGL2.dispose(gl, atmoWorld);
  // a tower's height above the floor includes the terrace it stands on (cityLiftAt)
  const hub = placedTowers[0] ? { x: placedTowers[0].pos[0], y: placedTowers[0].pos[1], height: placedTowers[0].scale * placedTowers[0].built.top + cityLiftAt(placedTowers[0].pos[0], placedTowers[0].pos[1]) } : null;
  const towers = placedTowers.map((tw) => ({ x: tw.pos[0], y: tw.pos[1], height: tw.scale * tw.built.top + cityLiftAt(tw.pos[0], tw.pos[1]) }));
  atmoWorld = RouteAtmoGL2.buildWorld(gl, routeAtmoCtx, seed, { cx: tankX, cy: tankY, baseZ, cityRadius, tankW: tankW(), tankH: tankH(), tankDepth: tankDepth(), hub, towers,
    gateAngle: CityGrammar.spokesOf(seed)[0] });   // the road leaves by the first avenue's gate
}

// the old box/lathe tier shell (TowerEngineGL2's "blocks") is no longer the tower's visible
// identity — that's now buildTowerCreatureBody's standElevation geometry, drawn via
// creatureLineProg in drawCreatureLines. The shell still gets built and uploaded, but drawn only
// as a pure depth occluder (a fixed near-black tint) so fish/creature-lines still correctly
// disappear behind a tower's real silhouette instead of behind its old boxy one.
// Its point-sprite parts (aura debris/motes/satellites, towerPtProg) are left unbuilt-on-screen —
// a scattered particle swarm that read as clutter/noise against the clean creature-line look, not
// as a feature the glowing redesign depends on, so this stage simply never draws them.
// The shell was originally drawn fully opaque near-black (TOWER_OCCLUDER_TINT) purely so fish and
// nearer buildings got correct depth occlusion against it, with the creature-line wireframe doing
// all the actual visible work. Now it's drawn through towerGlassProg (TOWER_GLASS_FS) instead — a
// translucent light-green "glass tower" fill, fresnel-bright at grazing edges, with a slow drifting
// 3D noise breaking up the fill so it reads as foggy glass volume rather than a flat tint — under
// the glowing wireframe, while still writing full opaque depth (gl.depthMask stays true; blending
// only changes how the COLOR channel composites, not depth), so it keeps occluding correctly.
// uTint's green channel is pushed above 1.0 deliberately: the shader multiplies uTint by each
// part's own baked material color (vCol), and most of those are already dark teal/near-black (this
// build's presets share one green-toned `look` palette), so a flat [1,1,1]-ish tint would stay dark
// instead of reading as light green glass.
const TOWER_GLASS_TINT = [0.85, 1.7, 1.15];
const TOWER_GLASS_ALPHA = 0.15;
// Route style's solid facade: most parts' own baked vCol is dark teal/near-black (same reason
// TOWER_GLASS_TINT above pushes its green channel past 1.0), so this tint is brightened the same
// way to come out as a visible lit body instead of staying dark. The red channel is pushed well
// past the green/blue ones specifically to counteract vCol's own teal bias (strong G/B, weak R) —
// a flat [x,x,x] tint here reads cool/teal no matter what; only an R-heavy tint lands on a warm
// sage instead. uUnlit stays off (real N·L lighting from TOWER_FS) so facets read as volumes.
const TOWER_ROUTE_TINT = [3.4, 2.0, 1.5];
function drawTowers(t, glowPass) {
  if (window.ENVX && ENVX.hides('towers')) return;
  if (!placedTowers.length) return;
  if (glowPass) return;   // the shell itself never glows any more — all tower glow comes from creature lines
  if (styled()) {
    gl.useProgram(towerProg.p);
    const u = towerProg.u;
    gl.uniformMatrix4fv(u.uVP, false, cam.vp);
    gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX); gl.uniform3fv(u.uCam, cam.eye);
    gl.uniform3f(u.uTint, TOWER_ROUTE_TINT[0] * S.routeBright, TOWER_ROUTE_TINT[1] * S.routeBright, TOWER_ROUTE_TINT[2] * S.routeBright);
    gl.uniform1f(u.uUnlit, 0); gl.uniform1f(u.uUseTex, 0); gl.uniform1f(u.uCutout, 0); gl.uniform1f(u.uAlpha, 1.0);
    styleFlat(u, -0.04);
    for (const entry of placedTowers) {
      gl.uniformMatrix4fv(u.uModel, false, entry.model);
      for (const up of entry.uploaded) {
        if (up.isPoints) continue;
        gl.bindVertexArray(up.vao);
        gl.drawElements(gl.TRIANGLES, up.count, gl.UNSIGNED_INT, 0);
      }
    }
    gl.bindVertexArray(null);
    gl.uniform1f(u.uRoute, 0);
    return;
  }
  gl.useProgram(towerGlassProg.p);
  const u = towerGlassProg.u;
  gl.uniformMatrix4fv(u.uVP, false, cam.vp);
  gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX); gl.uniform3fv(u.uCam, cam.eye);
  gl.uniform3f(u.uTint, TOWER_GLASS_TINT[0], TOWER_GLASS_TINT[1], TOWER_GLASS_TINT[2]);
  gl.uniform1f(u.uAlpha, TOWER_GLASS_ALPHA); gl.uniform1f(u.uTime, t);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const entry of placedTowers) {
    gl.uniformMatrix4fv(u.uModel, false, entry.model);
    for (const up of entry.uploaded) {
      if (up.isPoints) continue;
      gl.bindVertexArray(up.vao);
      gl.drawElements(gl.TRIANGLES, up.count, gl.UNSIGNED_INT, 0);
    }
  }
  gl.bindVertexArray(null);
  gl.disable(gl.BLEND);
}

// ---------- offscreen tower thumbnails (Tower panel > Variations/Atlas) ----------
// Standalone Tower Forge renders each candidate spec through a pooled THREE.WebGLRenderer into a
// fresh THREE.Scene per call; this is the raw-WebGL2 equivalent -- a reused offscreen framebuffer
// (resized per call, same "one renderer, many quick renders" idea), the *existing* towerProg/
// TOWER_VS/TOWER_FS shader (same one the main view's placed towers already use), and a small
// fixed-angle camera framed by the same span formula standalone Tower Forge's own fitCamera()
// uses. Unlike placed towers (which are demoted to a depth occluder under the real glowing
// creature-line geometry), a thumbnail draws TowerEngineGL2's solid shell with its REAL per-part
// tints -- running the creature-line/standElevation pipeline per candidate would be far too slow
// for a 500-tower "Evolve" pass, and the shell is what a spec's own fields (material/pattern/
// window/band/etc.) actually control, so it's the more legible comparison for this purpose.
let thumbFB = null, thumbTex = null, thumbDepthRB = null, thumbFBW = 0, thumbFBH = 0;
function ensureThumbFB(w, h) {
  if (thumbFB && thumbFBW === w && thumbFBH === h) return;
  if (thumbFB) { gl.deleteFramebuffer(thumbFB); gl.deleteTexture(thumbTex); gl.deleteRenderbuffer(thumbDepthRB); }
  thumbFBW = w; thumbFBH = h;
  thumbTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, thumbTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  thumbDepthRB = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, thumbDepthRB);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  thumbFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, thumbFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, thumbTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, thumbDepthRB);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
const THUMB_GLOW_TAGS = new Set(['glow', 'glowAdditive', 'glowTex', 'windowGlow']);
function thumbTagTint(tag, look) {
  switch (tag) {
    case 'body': return look.body;
    case 'dark': case 'rock': case 'window': return look.dark;
    case 'accent': return look.accent;
    case 'bridge': return look.body;
    case 'cloth': return look.cloth;
    case 'glow': case 'glowAdditive': case 'glowTex': case 'windowGlow': return look.glow;
    default: return '#ffffff';
  }
}
// renderTowerThumbnail(spec, w, h) -> data: URL (jpeg). Builds + uploads + draws + tears down its
// own GL resources per call (candidates are one-shot, not cached/reused like a placed tower).
function renderTowerThumbnail(spec, w, h) {
  ensureThumbFB(w, h);
  const rnd = RNG.create(spec.seed || 1);
  const built = TowerEngineGL2.buildTowerGL2(spec, rnd);
  const uploaded = built.parts.map(uploadGeoPart);
  gl.bindFramebuffer(gl.FRAMEBUFFER, thumbFB);
  gl.viewport(0, 0, w, h);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.clearColor(0.05, 0.045, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const span = Math.max(built.top * 1.05, built.reach * 2), dist = span / (2 * Math.tan(20 * DEG)) * 1.3;
  const target = [0, built.top * 0.5, 0], dirLen = Math.hypot(0.62, 0.12, 1);
  const eye = [target[0] + dist * 0.62 / dirLen, target[1] + dist * 0.12 / dirLen, target[2] + dist / dirLen];
  const view = M4.look(eye, target, [0, 1, 0]);
  const proj = M4.persp(40 * DEG, w / h, Math.max(0.1, dist / 200), dist * 30);
  const vp = M4.mul(proj, view);
  gl.useProgram(towerProg.p);
  const u = towerProg.u;
  gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniform1f(u.uShift, 0); gl.uniform1f(u.uShiftX, 0); gl.uniform3fv(u.uCam, eye);
  gl.uniformMatrix4fv(u.uModel, false, IDENTITY4);
  for (const up of uploaded) {
    if (up.isPoints) continue;
    const glow = THUMB_GLOW_TAGS.has(up.materialTag);
    const tint = hexToRgb3(thumbTagTint(up.materialTag, spec.look));
    gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
    gl.uniform1f(u.uUnlit, glow ? 1 : 0); gl.uniform1f(u.uUseTex, up.tex ? 1 : 0);
    gl.uniform1f(u.uCutout, (up.materialTag === 'window' || up.materialTag === 'windowGlow') ? 1 : 0);
    gl.uniform1f(u.uAlpha, 1.0);
    if (up.tex) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, up.tex); gl.uniform1i(u.uTex, 3); }
    gl.bindVertexArray(up.vao); gl.drawElements(gl.TRIANGLES, up.count, gl.UNSIGNED_INT, 0);
  }
  gl.bindVertexArray(null);
  const pixels = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  for (const up of uploaded) { gl.deleteVertexArray(up.vao); if (up.tex) gl.deleteTexture(up.tex); }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const imgData = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    imgData.data.set(pixels.subarray(srcRow, srcRow + w * 4), y * w * 4);
  }
  ctx.putImageData(imgData, 0, 0);
  return cv.toDataURL('image/jpeg', 0.85);
}


// (moved here from further down: it runs while this file loads)
function towerLabel(i) { return i === 0 ? 'Center tower' : 'Tower ' + (i + 1); }
