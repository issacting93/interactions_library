/* Grown plants drawn by the graphics card: uploaded once, stood many times, swayed in the vertex shader.

   EcologyFlora.lines bends every point of every plant in JavaScript each frame and sends the lot again. That is right for a plant
   something is happening to (a trap closing, a frond being grazed). It is the wrong way to draw a forest. Here a recipe's lines and
   limbs go to the card once (FloraGPU.set), each standing plant is one small record (where, how big, which way it faces, its
   colour, when it starts growing), and the card draws every copy and does the bending (after Crysis' vegetation: one bend for the
   whole plant by height, one flutter for each leaf). The page's cost each frame is a few draw calls, whatever the number of plants.

     const F = FloraGPU.create(gl)
     FloraGPU.set(F, [{ def, x, y, size, yaw, phase, delay, tint: [r, g, b], sway }])    def: from FloraGrow.grow. x, y: tank floor.
                                                                                        size: pixels per thousandth of its height
     FloraGPU.draw(F, { vp, eye, time, grow, fz, view: [x, y], ink, bark, sky, ground, fog: [near, far], fill, alpha, detail, show })
        vp, eye: EcologyRender.camera(r, opt)      fz: the floor's depth      grow: seconds since growing began
        ink: the colour of wood lines; a leaf line takes its plant's tint      fill: leaves as filled shapes too
        sky: what far things fade into (black at night)
        style, frame: a style recipe (packages/render/style-recipes.js) and its frame { cam, near, far, up, sun, lights }. With these the
           colours above are not used: every fill is shaded by the recipe's own stShade (depth bands from ink to fog, the lantern's
           warm steps), so the wood wears the same look as the towers. tint (0 to 1): how much of a plant's own leaf colour shows
           through a flat recipe (0: the recipe's palette alone); a leaf's colour fades to fog by the same bands
        cull: how far (tank units) a plant is kept before it is culled, when the fog's units are not the tank's (a page whose vp scales the tank)
        detail: "auto" (the default: cull and pick a level each frame) | "full" (every plant at full detail, nothing culled)
        lift: 0..1 shades a plant by height (low in it darker) and each leaf a little apart, in the plain look (a clump's depth)
        show: true tints each plant by the level it was drawn at (near: as it is; middle: blue; far: red)
        Inside a page that owns the frame (the Maw's tank): inPlace: true draws into whatever is bound, clears nothing and paints no sky;
           floor: false leaves the ground to the page; shift, shiftX: the page's own view offset (clip units); apply(u): sets a style
           recipe's uniforms on each program (RouteAtmoGL2.setStyle does), in place of style and frame; a plant's dz is how far its foot
           stands above (negative) or below the flat floor fz
           clear: { to: [x, y, z], min, r }: a tall plant (more than min tall) that stands between the eye and that point, and over it on
           the screen (within r of its width, in screen units), is left out for the frame, so a creature followed through a wood is never hidden
   F.stats: { plants, kinds, drawn, culled, levels: [n, n, n], segments, triangles, calls }      what the last frame drew

   What a plant is made of here: its lines (wood or leaf), its leaves again as filled shapes, its thick limbs as tubes, and its thin
   limbs as plain lines. A hand-composed (flat) plant or a floor rosette is not drawn by this: those stay with EcologyFlora.

   Three levels of every recipe go to the card (LEVELS). The far ones have fewer leaves, each drawn bigger so the plant keeps its
   mass (as Ghost of Tsushima's far grass is half as many blades at twice the width), only the thicker limbs as tubes, with fewer
   sides, and no fine twigs. Each frame, for each plant: is any of it in view and nearer than the fog's end (if not, it is culled);
   how tall it stands on screen (that picks its level). That is a few numbers a plant on the page's side; the card then draws each
   recipe's levels as one call apiece. */
(function () {
  'use strict';
  // the levels: which leaves are kept (every step-th) and how much bigger, how thick a limb must be to be a tube (thousandths of the
  // plant's height) and with how many sides, how thick to be drawn at all, which wood pieces are kept, and how tall on screen
  // (its height over its distance: 0.6 fills the view top to bottom) a plant must stand to be drawn at this level
  const LEVELS = [
    { leafStep: 1, leafScale: 1, thick: 3.2, sides: 6, twig: 0, woodStep: 1, tall: 0.075 },
    { leafStep: 2, leafScale: 1.5, thick: 5, sides: 5, twig: 1.3, woodStep: 1, tall: 0.026 },
    { leafStep: 5, leafScale: 2.3, thick: 9, sides: 4, twig: 3.2, woodStep: 2, tall: 0.004 },
  ];
  const COMMON = `uniform vec4 uPush[4]; uniform float uGust; uniform vec2 uGustDir;      // push: up to four things walking through (x, y, reach, how hard): a plant leans away from each. gust: a slow front of wind crossing the field
uniform mat4 uVP; uniform float uT, uGrow, uFz; uniform vec2 uView, uFog; uniform vec3 uMark; uniform float uShift, uShiftX;
layout(location=4) in vec4 iA; layout(location=5) in vec4 iB; layout(location=6) in vec3 iC;      // where x, y, size, turn | phase, delay, sway, foot height | tint
float shown() { return clamp((uGrow - iB.y) / 2.6, 0.0, 1.0); }
// a point of the plant (across, back, up: thousandths of its height) to the tank. The whole plant bends by height squared, as the tank's plants do
vec3 stand(vec3 P, out vec2 xd) { float c = cos(iA.w), s = sin(iA.w), yf = P.z / 1000.0, ph = iB.x, gust = 0.6 + 0.4 * sin(uT * 0.23 + iA.x * 0.004); xd = vec2(P.x * c - P.y * s, P.x * s + P.y * c);
  vec2 bend = vec2(sin(uT * 0.7 + ph) + 0.45 * sin(uT * 1.63 + ph * 2.1), sin(uT * 0.53 + ph + 1.7) + 0.4 * sin(uT * 1.31 + ph)) * gust * vec2(30.0, 24.0) * iB.z * yf * yf;
  bend += uGustDir * pow(0.5 + 0.5 * sin(dot(iA.xy, uGustDir * 0.0024) - uT * 0.55), 5.0) * uGust * 120.0 * yf * yf * iB.z;
  for (int i = 0; i < 4; i++) { vec2 aw = iA.xy - uPush[i].xy; float pd = length(aw); bend += aw / max(pd, 1.0) * uPush[i].w * (1.0 - smoothstep(uPush[i].z * 0.3, uPush[i].z, pd)) * 320.0 * yf; }
  return vec3(iA.x + (xd.x + bend.x) * iA.z, iA.y + (xd.y + bend.y) * iA.z, uFz + iB.w - (P.z - 0.0006 * dot(bend, bend) * yf) * iA.z); }`;
  const LINE_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; layout(location=1) in vec3 aFlut; layout(location=2) in vec3 aMisc;      // phase, born, leaf
${COMMON}
out vec3 vCol; out float vFog; out vec3 vW; out vec3 vTint; out float vLeaf; out float vHide; uniform vec3 uInk; uniform float uLift;
void main() { vHide = step(shown(), aMisc.y - 0.0001);      // not grown yet: hidden in the fragment stage (moving the point away drew a streak from a half-grown line)
  vec3 P = aPos + aFlut * sin(uT * (1.5 + aMisc.x * 0.22) + aMisc.x * 7.0) * min(1.0, aPos.z / 400.0 + 0.25) * iB.z; vec2 xd; vec3 w = stand(P, xd);      // a leaf flutters about its foot
  vW = w; vTint = iC; vLeaf = aMisc.z; gl_Position = uVP * vec4(w, 1.0); gl_Position.y += uShift * gl_Position.w; gl_Position.x += uShiftX * gl_Position.w; vFog = smoothstep(uFog.x, uFog.y, gl_Position.w); vCol = mix(mix(uInk, iC, aMisc.z) * clamp(0.8 + dot(xd, uView) * 0.0005, 0.5, 1.0), uMark, step(0.001, dot(uMark, vec3(1.0))) * 0.75);
  vCol *= mix(1.0, (0.5 + 0.65 * clamp(aPos.z / 1000.0, 0.0, 1.0)) * (1.0 + 0.16 * sin(aMisc.x * 5.3)), uLift); }`;      // lift: low in a plant darker, each leaf a little apart
  // the recipe's shading, where there is one: ST is the chunk from StyleRecipes (empty without it)
  const ST = (window.StyleRecipes && window.StyleRecipes.GLSL) || '';
  const MARKED = `vec3 marked(vec3 c) { return mix(c, uMark, step(0.001, dot(uMark, vec3(1.0))) * 0.75); }`;
  const LINE_FS = (st) => `#version 300 es
precision highp float; in vec3 vCol; in float vFog; in vec3 vW; in vec3 vTint; in float vLeaf; in float vHide; uniform vec3 uSky, uMark; uniform float uAlpha, uTint, uFilled; out vec4 o;
${st ? ST : ''}
${MARKED}
void main() { if (vHide > 0.001) discard;
${st ? `  vec3 c = stShade(vW, vec3(1.0, 0.0, 0.0), 1.0 - uFilled, -0.04, -1.0);
  if (vLeaf > 0.5 && uStKind < 0.5) { float band = stBand(vW, -1.0), L = stLamp(vW); vec3 t = mix(vTint, uStFog, clamp(pow(band, uStCurve) * 0.95, 0.0, 1.0)); t = mix(t, uStWarm * mix(0.55, 1.0, L), L * 0.62); c = mix(c, t, uTint); }      // a leaf keeps some of its own colour, faded by the same bands
  else if (vLeaf > 0.5 && uStKind < 1.5) c = mix(c, vTint * (1.2 - stBand(vW, -1.0) * 0.7), uTint * 0.8);
  o = vec4(marked(c), uAlpha);` : `  o = vec4(mix(vCol, uSky, vFog), uAlpha * (1.0 - 0.5 * vFog));`}
}`;
  const TUBE_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aCen; layout(location=1) in vec3 aOff; layout(location=2) in float aBorn;
${COMMON}
out vec3 vN; out float vFog; out vec3 vW;
void main() { float g = clamp((shown() - aBorn) * 12.0, 0.0, 1.0); vec2 xd; vec3 w = stand(aCen + aOff * g, xd); vW = w;      // a limb not yet grown has no thickness
  gl_Position = uVP * vec4(w, 1.0); gl_Position.y += uShift * gl_Position.w; gl_Position.x += uShiftX * gl_Position.w; vFog = smoothstep(uFog.x, uFog.y, gl_Position.w); float c = cos(iA.w), s = sin(iA.w); vec3 n = normalize(aOff + 1e-5); vN = vec3(n.x * c - n.y * s, n.x * s + n.y * c, -n.z); }`;
  const TUBE_FS = (st) => `#version 300 es
precision highp float; in vec3 vN; in float vFog; in vec3 vW; uniform vec3 uSky, uBark, uMark; out vec4 o;
${st ? ST : ''}
${MARKED}
void main() { vec3 n = normalize(vN);
${st ? `  o = vec4(marked(stShade(vW, n, 0.0, -0.06, -1.0)), 1.0);` : `  float d = 0.5 + 0.5 * dot(n, normalize(vec3(-0.35, 0.4, -0.85))); o = vec4(mix(marked(uBark) * (0.45 + 0.75 * d * d), uSky, vFog), 1.0);`}
}`;
  const GROUND_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; uniform mat4 uVP; out float vFog; out vec2 vP; out vec3 vW; uniform vec2 uFog; uniform float uShift, uShiftX; void main() { gl_Position = uVP * vec4(aPos, 1.0); gl_Position.y += uShift * gl_Position.w; gl_Position.x += uShiftX * gl_Position.w; vFog = smoothstep(uFog.x, uFog.y, gl_Position.w); vP = aPos.xy; vW = aPos; }`;
  const GROUND_FS = (st) => `#version 300 es
precision highp float; in float vFog; in vec2 vP; in vec3 vW; uniform vec3 uSky, uGround; uniform float uCaus, uCausT; out vec4 o;
${st ? ST : ''}
// caustics (o.caustics): light through moving water, on the floor. Two fields of noise, bent by a third and drifting against each other; light gathers where they cancel, so it
// is soft dappled light that never repeats, and it comes and goes in broad patches
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float caus(vec2 p, float t) { vec2 q = p * 0.0052; q += (vec2(cNoise(q * 1.3 + t * 0.06), cNoise(q * 1.3 - t * 0.05 + 7.3)) - 0.5) * 2.2;
  float a = cNoise(q * 2.1 + t * 0.1) + 0.5 * cNoise(q * 4.3 - t * 0.13 + 2.0), b = cNoise(q * 2.9 - t * 0.08 + 11.0) + 0.5 * cNoise(q * 5.1 + t * 0.11 + 5.0);
  return pow(clamp(1.0 - abs(a - b) * 1.25, 0.0, 1.0), 3.0) * smoothstep(0.3, 0.7, cNoise(p * 0.0011 + t * 0.015 + 3.0)); }
void main() {
${st ? `  vec3 c = stShade(vW, uStUp, 0.0, 0.1, -1.0); if (uCaus > 0.0) c += mix(uStInk, vec3(1.0), 0.45) * uCaus * caus(vW.xy, uCausT) * (1.0 - stBand(vW, -1.0) * 0.8);
  o = vec4(c, 1.0);` : `  float h = fract(sin(dot(floor(vP / 9.0), vec2(12.9898, 78.233))) * 43758.5453); o = vec4(mix(uGround * (0.9 + 0.2 * h), uSky, vFog), 1.0);`}
}`;
  // the recipe's sky: its three colours from the horizon up, behind everything
  const SKY_VS = `#version 300 es
precision highp float; out float vY; void main() { vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0); vY = p.y * 0.5 + 0.5; gl_Position = vec4(p, 0.999, 1.0); }`;
  const SKY_FS = `#version 300 es
precision mediump float; in float vY; uniform vec3 uTop, uMid, uLow; uniform float uHorizon; out vec4 o; void main() { float t = clamp((vY - uHorizon) / max(0.05, 1.0 - uHorizon), 0.0, 1.0); o = vec4(t < 0.5 ? mix(uLow, uMid, t * 2.0) : mix(uMid, uTop, t * 2.0 - 1.0), 1.0); }`;
  function program(gl, vs, fs) { const p = gl.createProgram(); for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('FloraGPU: ' + gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('FloraGPU: ' + gl.getProgramInfoLog(p)); const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); } return { p, u }; }
  function create(gl) { const set = (st) => ({ line: program(gl, LINE_VS, LINE_FS(st)), tube: program(gl, TUBE_VS, TUBE_FS(st)), ground: program(gl, GROUND_VS, GROUND_FS(st)) });
    return { gl, plain: set(false), styled: ST ? set(true) : null, sky: program(gl, SKY_VS, SKY_FS), kinds: [], bufs: [], stats: { plants: 0, kinds: 0, drawn: 0, culled: 0, levels: [0, 0, 0], segments: 0, triangles: 0, calls: 0 } }; }

  // ---- one recipe's geometry at one level, worked out once ----
  function build(def, V) {
    const F = def.frame, n = def.lines.length, L = [], T = [], cen = [], off = [], born = [], idx = [], SIDES = V.sides; let leafN = 0, woodN = 0;
    const v = (arr, X, D, Y, fx, fd, fy, ph, b, leaf) => arr.push(X, D, Y, fx, fd, fy, ph, b, leaf);
    for (let i = 0; i < n; i++) { if (def.still && def.still[i] === 1) continue; const a = def.lines[i], q = i * 9, leaf = def.leafLine ? def.leafLine[i] : 0, ph = (i * 2.399963) % 6.2832, b = i / n, P = [];
      if (leaf ? leafN++ % V.leafStep : (def.still && def.still[i] === 2 ? 0 : woodN++ % V.woodStep)) continue;                     // a far level keeps every step-th leaf
      const sc = leaf ? V.leafScale : 1;                                                                                           // and draws it bigger, about its own foot
      for (let j = 0; j < a.length; j += 2) { const u = a[j] * sc, w = a[j + 1] * sc, k = leaf ? u * 0.11 : 0; P.push([F[q] + u * F[q + 3] + w * F[q + 6], F[q + 1] + u * F[q + 4] + w * F[q + 7], F[q + 2] + u * F[q + 5] + w * F[q + 8], F[q + 6] * k, F[q + 7] * k, F[q + 8] * k]); }
      for (let j = 0; j + 1 < P.length; j++) { v(L, ...P[j], ph, b, leaf); v(L, ...P[j + 1], ph, b, leaf); }
      // a leaf whose outline closes is also filled: a fan from its first point
      if (leaf && P.length >= 4 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1], P[0][2] - P[P.length - 1][2]) < 3 * sc) for (let j = 1; j + 2 < P.length; j++) { v(T, ...P[0], ph, b, 1); v(T, ...P[j], ph, b, 1); v(T, ...P[j + 1], ph, b, 1); } }
    for (const M of def.limbs || []) { const m = M.length / 5; let cut = 0; while (cut < m && M[cut * 5 + 3] >= V.thick) cut++;                                     // thick as far as cut, thin after
      for (let i = Math.max(0, cut - 1); i + 1 < m; i++) { if (M[i * 5 + 3] < V.twig) break; v(L, M[i * 5], M[i * 5 + 1], M[i * 5 + 2], 0, 0, 0, 0, M[i * 5 + 4], 0); v(L, M[i * 5 + 5], M[i * 5 + 6], M[i * 5 + 7], 0, 0, 0, 0, M[i * 5 + 9], 0); }
      if (cut < 2) continue; let ux = 0, uy = 0, uz = 0; const v0 = cen.length / 3;
      for (let i = 0; i < cut; i++) { const a = Math.max(0, i - 1) * 5, b2 = Math.min(cut - 1, i + 1) * 5; let tx = M[b2] - M[a], ty = M[b2 + 1] - M[a + 1], tz = M[b2 + 2] - M[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        if (!i) { if (Math.abs(tz) < 0.9) { ux = 0; uy = 0; uz = 1; } else { ux = 1; uy = 0; uz = 0; } }
        const dt = ux * tx + uy * ty + uz * tz; ux -= tx * dt; uy -= ty * dt; uz -= tz * dt; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul; const wx = ty * uz - tz * uy, wy = tz * ux - tx * uz, wz = tx * uy - ty * ux, r = M[i * 5 + 3];
        for (let k = 0; k < SIDES; k++) { const an = k / SIDES * 6.2832, c = Math.cos(an), s = Math.sin(an); cen.push(M[i * 5], M[i * 5 + 1], M[i * 5 + 2]); off.push((ux * c + wx * s) * r, (uy * c + wy * s) * r, (uz * c + wz * s) * r); born.push(M[i * 5 + 4]);
          if (i) { const k2 = (k + 1) % SIDES, A = v0 + (i - 1) * SIDES + k, B = v0 + (i - 1) * SIDES + k2, C = v0 + i * SIDES + k, D = v0 + i * SIDES + k2; idx.push(A, C, B, B, C, D); } } } }
    const tube = new Float32Array(born.length * 7); for (let i = 0; i < born.length; i++) { tube.set([cen[i * 3], cen[i * 3 + 1], cen[i * 3 + 2], off[i * 3], off[i * 3 + 1], off[i * 3 + 2], born[i]], i * 7); }
    return { lines: new Float32Array(L), fills: new Float32Array(T), tube, idx: new Uint32Array(idx) };
  }
  function geometry(def) { if (def.gpu !== undefined) return def.gpu; return (def.gpu = def.frame ? LEVELS.map((V) => build(def, V)) : null); }
  // ---- the plants to draw: grouped by recipe, each recipe one set of buffers and one list of records ----
  function set(F, plants) {
    const gl = F.gl; for (const b of F.bufs) gl.deleteBuffer(b); for (const k of F.kinds) for (const lv of k.lv) for (const v of lv.vaos) gl.deleteVertexArray(v); F.bufs = []; F.kinds = [];
    const by = new Map(); for (const p of plants) { if (!geometry(p.def)) continue; if (!by.has(p.def)) by.set(p.def, []); by.get(p.def).push(p); }
    const buf = (target, data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, usage || gl.STATIC_DRAW); F.bufs.push(b); return b; };
    F.stats = { plants: 0, kinds: by.size, drawn: 0, culled: 0, levels: [0, 0, 0], segments: 0, triangles: 0, calls: 0 };
    for (const [def, list] of by) {
      // every plant's record, kept here: what the card needs (11 numbers), and what the culling needs (its middle and how far it reaches)
      const rec = new Float32Array(list.length * 11), tall = Math.min(1000, def.tall || 1000), reach = Math.max(tall, (def.wide || 0) / 2) * 0.62;
      list.forEach((p, i) => rec.set([p.x, p.y, p.size, p.yaw || 0, p.phase || 0, p.delay || 0, p.sway == null ? 1 : p.sway, p.dz || 0, ...(p.tint || [1, 1, 1])], i * 11));
      const K = { n: list.length, rec, tall, reach, wide: Math.max(0, def.wide || 0), lv: [] };
      def.gpu.forEach((G) => { const I = new Float32Array(list.length * 11), ib = buf(gl.ARRAY_BUFFER, I, gl.DYNAMIC_DRAW), vaos = [];
        const inst = () => { gl.bindBuffer(gl.ARRAY_BUFFER, ib); [[4, 4, 0], [5, 4, 16], [6, 3, 32]].forEach(([loc, n, o]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 44, o); gl.vertexAttribDivisor(loc, 1); }); };
        const vao9 = (data) => { const v = gl.createVertexArray(); gl.bindVertexArray(v); const b = buf(gl.ARRAY_BUFFER, data); gl.bindBuffer(gl.ARRAY_BUFFER, b); [[0, 3, 0], [1, 3, 12], [2, 3, 24]].forEach(([loc, n, o]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 36, o); }); inst(); vaos.push(v); return v; };
        const lv = { I, ib, count: 0, vaos, lines: G.lines.length / 9, fills: G.fills.length / 9, tris: G.idx.length };
        lv.lv = vao9(G.lines); if (lv.fills) lv.fv = vao9(G.fills);
        if (lv.tris) { lv.tv = gl.createVertexArray(); gl.bindVertexArray(lv.tv); const tb = buf(gl.ARRAY_BUFFER, G.tube); gl.bindBuffer(gl.ARRAY_BUFFER, tb); [[0, 3, 0], [1, 3, 12], [2, 1, 24]].forEach(([loc, n, o]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 28, o); }); inst(); buf(gl.ELEMENT_ARRAY_BUFFER, G.idx); vaos.push(lv.tv); }
        K.lv.push(lv); });
      gl.bindVertexArray(null); F.kinds.push(K); F.stats.plants += K.n; }
  }
  // the six sides of what the camera sees, from its matrix (each: a direction and a distance; a point is inside when all six are positive)
  function sides(m) { const P = []; for (const [r, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) { const a = m[3] + s * m[r], b = m[7] + s * m[4 + r], c = m[11] + s * m[8 + r], d = m[15] + s * m[12 + r], l = Math.hypot(a, b, c) || 1; P.push(a / l, b / l, c / l, d / l); } return P; }
  // which plants are drawn this frame, and at which level: each recipe's levels get their plants' records
  function choose(F, o) {
    const gl = F.gl, st = F.stats, full = o.detail === 'full' || !o.eye, P = full ? null : sides(o.vp), far = o.cull != null ? o.cull : o.fog ? o.fog[1] * 1.02 : 1e9, bias = o.bias || 1, slack = (Math.abs(o.shift || 0) + Math.abs(o.shiftX || 0)) * 0.9, cl = o.clear && !full ? o.clear : null, m = o.vp, pr = (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[3] * x + m[7] * y + m[11] * z + m[15]], T = cl ? pr(cl.to[0], cl.to[1], cl.to[2]) : null; st.drawn = 0; st.culled = 0; st.levels = [0, 0, 0]; st.segments = 0; st.triangles = 0;
    for (const K of F.kinds) { for (const lv of K.lv) lv.count = 0;
      for (let i = 0; i < K.n; i++) { const q = i * 11, R = K.rec; let L = 0;
        if (!full) { const size = R[q + 2], h = K.tall * size, x = R[q], y = R[q + 1], z = o.fz + R[q + 7] - h * 0.5, rad = K.reach * size, dx = x - o.eye[0], dy = y - o.eye[1], dz = z - o.eye[2], d = Math.hypot(dx, dy, dz);
          if (d - rad > far) { st.culled++; continue; }                                                              // lost in the fog
          let out = false; for (let p = 0; p < 24; p += 4) if (P[p] * x + P[p + 1] * y + P[p + 2] * z + P[p + 3] < -rad - d * slack) { out = true; break; } if (out) { st.culled++; continue; }      // wholly outside the view
          if (cl && h > cl.min) { const zf = o.fz + R[q + 7], A = pr(x, y, zf), B = pr(x, y, zf - h);      // in front of the target, and over it on the screen: foot to crown top, a crown's width either side
            if (A[2] > 0 && A[2] < T[2] * 1.02) { const cw = K.wide * size * 0.3 * m[0] / A[2] + (cl.r || 0.1), ax = A[0] / A[2], ay = A[1] / A[2], by = B[2] > 0 ? B[1] / B[2] : 9, tx = T[0] / T[2], ty = T[1] / T[2];
              if (Math.abs(tx - ax) < cw && ty > Math.min(ay, by) - (cl.r || 0.1) && ty < Math.max(ay, by) + (cl.r || 0.1)) { st.culled++; continue; } } }
          const s = Math.max(h, rad) / Math.max(1, d - rad * 0.5) * bias;      // how big it stands on screen: its height (or its spread, for something lying low) over its distance
           L = s > LEVELS[0].tall ? 0 : s > LEVELS[1].tall ? 1 : s > LEVELS[2].tall ? 2 : -1; if (L < 0) { st.culled++; continue; } }      // too small to see
        const lv = K.lv[L]; lv.I.set(R.subarray(q, q + 11), lv.count * 11); lv.count++; st.levels[L]++; }
      for (const lv of K.lv) if (lv.count) { gl.bindBuffer(gl.ARRAY_BUFFER, lv.ib); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lv.I, 0, lv.count * 11); st.drawn += lv.count; st.segments += lv.lines / 2 * lv.count; st.triangles += (lv.tris + (o.fill ? lv.fills : 0)) / 3 * lv.count; } }
  }
  const MARK = [[0, 0, 0], [0.25, 0.55, 1], [1, 0.3, 0.25]];
  const NOPUSH = new Float32Array(16);
  function draw(F, o) {
    const gl = F.gl, st = F.stats; st.calls = 0; choose(F, o); const SR = window.StyleRecipes, styled = !!((o.style || o.apply) && F.styled && SR), Q = styled ? F.styled : F.plain;
    const common = (P) => { gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, o.vp); gl.uniform1f(P.u.uT, o.time); gl.uniform1f(P.u.uGrow, o.grow == null ? 1e6 : o.grow); gl.uniform1f(P.u.uFz, o.fz); gl.uniform2fv(P.u.uView, o.view || [0, 1]); gl.uniform2fv(P.u.uFog, o.fog || [1e8, 1e9]); gl.uniform3fv(P.u.uSky, o.sky || [0, 0, 0]); gl.uniform1f(P.u.uShift, o.shift || 0); gl.uniform1f(P.u.uShiftX, o.shiftX || 0); if (P.u.uLift) gl.uniform1f(P.u.uLift, o.lift || 0); if (P.u.uPush) gl.uniform4fv(P.u.uPush, o.push || NOPUSH); if (P.u.uGust) gl.uniform1f(P.u.uGust, o.gust || 0); if (P.u.uGustDir) gl.uniform2fv(P.u.uGustDir, o.gustDir || [0.876, 0.482]); if (styled) { if (o.apply) o.apply(P.u); else SR.applyGL(gl, P.u, o.style, o.frame); } };
    const each = (P, pick, call) => { for (const K of F.kinds) K.lv.forEach((lv, L) => { if (!lv.count || !pick(lv)) return; gl.uniform3fv(P.u.uMark, o.show ? MARK[L] : MARK[0]); call(lv); st.calls++; }); };
    if (!o.inPlace) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearDepth(1); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); } gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    if (styled && o.skyOn !== false && !o.inPlace) { const R = SR.resolve(o.style), sk = R.palette.sky.map(SR.rgb); gl.disable(gl.DEPTH_TEST); gl.useProgram(F.sky.p); gl.uniform3fv(F.sky.u.uTop, sk[0]); gl.uniform3fv(F.sky.u.uMid, sk[1]); gl.uniform3fv(F.sky.u.uLow, sk[2]); gl.uniform1f(F.sky.u.uHorizon, o.horizon == null ? 0.4 : o.horizon); gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLES, 0, 3); st.calls++; }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    if ((o.ground || styled) && o.floor !== false) { const P = Q.ground, s = o.span || 6000, cx = o.cx || 0, cy = o.cy || 0; if (!F.gq) { F.gq = gl.createVertexArray(); F.gb = gl.createBuffer(); } gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, o.vp); gl.uniform2fv(P.u.uFog, o.fog || [1e8, 1e9]); gl.uniform3fv(P.u.uSky, o.sky || [0, 0, 0]); gl.uniform3fv(P.u.uGround, o.ground || [0, 0, 0]); gl.uniform1f(P.u.uShift, o.shift || 0); gl.uniform1f(P.u.uShiftX, o.shiftX || 0); if (styled) { if (o.apply) o.apply(P.u); else SR.applyGL(gl, P.u, o.style, o.frame); gl.uniform1f(P.u.uCaus, o.caustics || 0); gl.uniform1f(P.u.uCausT, o.time || 0); }
      gl.bindVertexArray(F.gq); gl.bindBuffer(gl.ARRAY_BUFFER, F.gb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([cx - s, cy - s, o.fz + 0.5, cx + s, cy - s, o.fz + 0.5, cx - s, cy + s, o.fz + 0.5, cx + s, cy + s, o.fz + 0.5]), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); st.calls++; }
    common(Q.tube); gl.uniform3fv(Q.tube.u.uBark, o.bark || [0.4, 0.3, 0.25]);
    each(Q.tube, (lv) => lv.tris, (lv) => { gl.bindVertexArray(lv.tv); gl.drawElementsInstanced(gl.TRIANGLES, lv.tris, gl.UNSIGNED_INT, 0, lv.count); });
    common(Q.line); gl.uniform3fv(Q.line.u.uInk, o.ink || [0.93, 0.91, 0.87]); gl.uniform1f(Q.line.u.uTint, o.tint == null ? 0.7 : o.tint); gl.depthFunc(gl.LEQUAL);
    if (o.fill) { gl.uniform1f(Q.line.u.uAlpha, 1); gl.uniform1f(Q.line.u.uFilled, 1); each(Q.line, (lv) => lv.fills, (lv) => { gl.bindVertexArray(lv.fv); gl.drawArraysInstanced(gl.TRIANGLES, 0, lv.fills, lv.count); }); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.uniform1f(Q.line.u.uAlpha, o.alpha == null ? 0.95 : o.alpha); gl.uniform1f(Q.line.u.uFilled, 0);
    each(Q.line, (lv) => lv.lines, (lv) => { gl.bindVertexArray(lv.lv); gl.drawArraysInstanced(gl.LINES, 0, lv.lines, lv.count); });
    gl.bindVertexArray(null); gl.disable(gl.BLEND); if (!o.inPlace) gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LESS);
  }
  window.FloraGPU = { create, set, draw, geometry, LEVELS };
})();
