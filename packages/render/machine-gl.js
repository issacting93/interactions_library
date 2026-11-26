/* Machines in the tank: the Spine Machines kit's meshes (js/spine-kit.js) drawn in the tank's own view, on the tank renderer's context.

   A machine goes to the card once (its three roles: bone, dark, accent, and each role's edge lines); a standing machine is one matrix.
   Two looks, both from the Spine Machines bench: Lit (its Model view: the palette, lit as the tank's solids are, edges faint) and Plate
   (its drawing: black solids, the edges as hairlines).

     const G = MachineGL.create(gl)
     const h = MachineGL.add(G, machine)                         machine: from kit.machine(...)
     MachineGL.matrix(x, y, fz, s, ky, turn)                     machine space (y up, foot on the axis) to the tank (z down, floor at fz)
     MachineGL.draw(G, { vp, eye, shift, shiftX, list: [{ h, m, pal }], look: "lit" | "plate", lamp: [x, y, z], fog: [near, far], depthOnly })
        style, frame: a style recipe (js/style-recipes.js) and its frame { cam, near, far, up, sun, lights }. With these the palette and the lamp are not
           used: every face is shaded by the recipe's stShade (depth bands from ink to fog, the lanterns' warm steps), as the plantings are. Bone is a
           touch paler than its band, dark a touch darker, the accent is the recipe's one warm colour; the edges take its line colour
        depthOnly: no colour is written (a page that needs the machines in a second depth buffer); an item's plain (a lighter handle) is used if it has one
     MachineGL.inView(vp, x, y, z, r)                            is a ball in the view
   Classic script. */
(function () {
  'use strict';
  const VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; layout(location=1) in vec3 aN; uniform mat4 uVP, uM; uniform float uShift, uShiftX, uTop; out vec3 vW; out vec3 vN; out float vH;
void main() { vec4 w = uM * vec4(aPos, 1.0); vW = w.xyz; vN = mat3(uM) * aN; vH = aPos.y / uTop; gl_Position = uVP * w; gl_Position.y += uShift * gl_Position.w; gl_Position.x += uShiftX * gl_Position.w; }`;
  // lit as EcologyRender's solids are (the same wrap, rim and glint), but the lamp is the page's (o.lamp, toward the light): a tower is mostly wall, and a
  // wall facing the view should not be in its own shade, so a page keeps it on the camera's side. A little darker toward the foot, fading into the dark with distance
  const FS = `#version 300 es
precision mediump float; uniform vec3 uCol; uniform highp vec3 uCam; uniform float uEmis, uFlat; uniform vec3 uLamp; uniform highp vec2 uFog; in highp vec3 vW; in vec3 vN; in float vH; out vec4 o;
void main() { vec3 n = normalize(vN), V = normalize(uCam - vW); if (dot(n, V) < 0.0) n = -n; vec3 Ld = normalize(uLamp);
  float d = max(0.0, dot(n, Ld)), ndv = dot(n, V), wrap = d * 0.75 + 0.25 * (0.5 - 0.5 * n.z);
  vec3 c = mix(uCol * 0.07 + vec3(0.012, 0.012, 0.02), uCol * 0.62 + 0.05, wrap * wrap);
  c += uCol * pow(1.0 - ndv, 2.4) * 0.3 + pow(max(0.0, dot(reflect(-Ld, n), V)), 26.0) * 0.25;
  c *= (0.5 + 0.5 * smoothstep(0.0, 0.3, vH)) * 1.3; c = mix(c, uCol, uEmis) * (1.0 - uFlat);
  o = vec4(c * (1.0 - smoothstep(uFog.x, uFog.y, distance(uCam, vW))), 1.0); }`;
  const ST = (window.StyleRecipes && window.StyleRecipes.GLSL) || '';
  const SFS = `#version 300 es
precision highp float; uniform float uTone, uWarm; in vec3 vW; in vec3 vN; in float vH; out vec4 o;
${ST}
void main() { vec3 c = stShade(vW, vN, 0.0, uTone, -1.0); o = vec4(mix(c, uStWarm, uWarm), 1.0); }`;
  const LVS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; uniform mat4 uVP, uM; uniform float uShift, uShiftX; uniform vec3 uCam; uniform vec2 uFog; out float vF;
void main() { vec4 w = uM * vec4(aPos, 1.0); gl_Position = uVP * w; gl_Position.y += uShift * gl_Position.w; gl_Position.x += uShiftX * gl_Position.w; vF = 1.0 - smoothstep(uFog.x, uFog.y, distance(uCam, w.xyz)); }`;
  const LFS = `#version 300 es
precision mediump float; uniform vec4 uCol; in float vF; out vec4 o; void main() { o = vec4(uCol.rgb, uCol.a * vF); }`;
  function program(gl, vs, fs) {
    const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('MachineGL: ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('MachineGL: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); } return { p, u };
  }
  const ROLES = ['bone', 'dark', 'accent'];
  const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
  // the bench's palettes, with the accents kept off the game's two signal colours (amber: a tell; red: it hurts)
  const PALS = {
    bone: { bone: hex('#d9d4c8'), dark: hex('#33363d'), accent: hex('#35e0d0') },
    gunmetal: { bone: hex('#9aa3ad'), dark: hex('#262a31'), accent: hex('#5be39a') },
    verdigris: { bone: hex('#9dbdae'), dark: hex('#22332f'), accent: hex('#e6e1d6') },
  };
  const PLATE = { bone: [0.945, 0.93, 0.894], dark: [0.56, 0.54, 0.51], accent: [0.21, 0.88, 0.82] };   // the drawing's line colours

  function create(gl) { return { gl, styled: ST ? program(gl, VS, SFS) : null, tri: program(gl, VS, FS), line: program(gl, LVS, LFS), stats: { drawn: 0, triangles: 0, segments: 0 } }; }
  function add(G, mc) {
    const gl = G.gl, h = { top: mc.top, maxR: mc.maxR, roles: {}, tris: 0, segs: 0 };
    for (const role of ROLES) { const r = mc.roles[role]; if (!r) continue;
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, r.pos, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, r.nrm, gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, r.idx, gl.STATIC_DRAW);
      const e = mc.edges[role], lvao = gl.createVertexArray(); gl.bindVertexArray(lvao);
      const eb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, eb); gl.bufferData(gl.ARRAY_BUFFER, e || new Float32Array(0), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null); h.roles[role] = { vao, count: r.idx.length, lvao, lines: e ? e.length / 3 : 0 }; h.tris += r.idx.length / 3; h.segs += e ? e.length / 6 : 0; }
    return h;
  }
  // machine space to the tank: x, z on the floor (turned about the axis), y up becomes z toward the surface; s: tank units a machine unit, ky: its height stretched
  function matrix(x, y, fz, s, ky, turn) { const c = Math.cos(turn || 0) * s, n = Math.sin(turn || 0) * s; return new Float32Array([c, -n, 0, 0, 0, 0, -s * (ky || 1), 0, n, c, 0, 0, x, y, fz, 1]); }
  // the six sides of the view from vp (column-major), each a plane with a unit normal; a ball is in view if it is not wholly behind any
  function inView(m, x, y, z, r) {
    for (let i = 0; i < 6; i++) { const k = i >> 1, sg = i & 1 ? -1 : 1, a = m[3] + sg * m[k], b = m[7] + sg * m[4 + k], c = m[11] + sg * m[8 + k], d = m[15] + sg * m[12 + k], l = Math.hypot(a, b, c) || 1;
      if ((a * x + b * y + c * z + d) / l < -r) return false; } return true;
  }
  function draw(G, o) {
    const gl = G.gl, SR = window.StyleRecipes, styled = !!(o.style && G.styled && SR && !o.depthOnly), T = styled ? G.styled : G.tri, L = G.line, plate = o.look === 'plate', fog = o.fog || [1e8, 1e9], st = G.stats; st.drawn = o.list.length; st.triangles = 0; st.segments = 0; if (!o.list.length) return;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    if (o.depthOnly) gl.colorMask(false, false, false, false);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);      // the solids a little back, so the edges lying on them are not buried
    gl.useProgram(T.p); gl.uniformMatrix4fv(T.u.uVP, false, o.vp); gl.uniform1f(T.u.uShift, o.shift || 0); gl.uniform1f(T.u.uShiftX, o.shiftX || 0); if (styled) SR.applyGL(gl, T.u, o.style, o.frame); else { gl.uniform3fv(T.u.uCam, o.eye); gl.uniform2fv(T.u.uFog, fog); gl.uniform1f(T.u.uFlat, plate ? 1 : 0); gl.uniform3fv(T.u.uLamp, o.lamp || [-0.5, 0.45, -0.74]); }
    for (const it of o.list) { const pal = PALS[it.pal] || PALS.bone, h = o.depthOnly && it.plain ? it.plain : it.h; gl.uniformMatrix4fv(T.u.uM, false, it.m); gl.uniform1f(T.u.uTop, h.top);
      for (const role of ROLES) { const r = h.roles[role]; if (!r) continue; if (styled) { gl.uniform1f(T.u.uTone, role === 'bone' ? 0.05 : role === 'dark' ? -0.07 : 0); gl.uniform1f(T.u.uWarm, role === 'accent' ? 0.85 : 0); } else { gl.uniform3fv(T.u.uCol, pal[role]); gl.uniform1f(T.u.uEmis, role === 'accent' ? 0.85 : 0); } gl.bindVertexArray(r.vao); gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, 0); st.triangles += r.count / 3; } }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    if (o.depthOnly) { gl.colorMask(true, true, true, true); gl.bindVertexArray(null); return; }
    gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(L.p); gl.uniformMatrix4fv(L.u.uVP, false, o.vp); gl.uniform3fv(L.u.uCam, o.eye); gl.uniform1f(L.u.uShift, o.shift || 0); gl.uniform1f(L.u.uShiftX, o.shiftX || 0); gl.uniform2fv(L.u.uFog, styled ? [1e8, 1e9] : fog); const lc = styled ? SR.rgb(SR.resolve(o.style).palette.line) : null, la = styled ? Math.min(0.6, SR.resolve(o.style).lines.strength * 2.2) : 0;
    for (const it of o.list) { gl.uniformMatrix4fv(L.u.uM, false, it.m);
      for (const role of ROLES) { const r = it.h.roles[role]; if (!r || !r.lines) continue; const c = PLATE[role];
        if (styled) gl.uniform4f(L.u.uCol, lc[0], lc[1], lc[2], role === 'accent' ? 0 : la); else if (plate) gl.uniform4f(L.u.uCol, c[0], c[1], c[2], role === 'dark' ? 0.55 : 0.8); else gl.uniform4f(L.u.uCol, 0, 0, 0, role === 'accent' ? 0 : 0.34);
        gl.bindVertexArray(r.lvao); gl.drawArrays(gl.LINES, 0, r.lines); st.segments += r.lines / 2; } }
    gl.bindVertexArray(null); gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
  }
  window.MachineGL = { create, add, matrix, inView, draw, PALS };
})();
