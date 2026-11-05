/* shared/skins/holy-light.js — a look, not a mechanism: divine light over any drawing.
   A WebGL2 post pass that reads another canvas (anything bright on black) and adds, on its own canvas:
     shafts    light scattered from every bright line towards a source (volumetric light scattering,
               the GPU Gems 3 ch. 13 radial-sample technique), so the figure seems to pour light
     burst     a slow sunburst of rays behind the source, two interfering ray counts so it never looks regular
     halo      a thin ring of light at a given radius, with a soft bloom around it
     stars     a four-point cross flare on the brightest points, like light catching gilding
   Two ways to lay it down:
     light    (default) gold-to-white light on black, for a dark page: put it over the source with
              mix-blend-mode: screen
     ink      the same light as gold leaf on a pale page: white where there is no light, warm gold where
              there is; put it over the page with mix-blend-mode: multiply
   It draws only when asked, so a caller that stops calling it freezes it.

     const h = HolyLight.create(canvas);       // throws if WebGL2 is unavailable
     HolyLight.resize(h, pxW, pxH);            // device px; renders at a fraction of this (opts.scale, default .5)
     HolyLight.draw(h, sourceCanvas, { time, light: [u, v], ring, power, burst })
        light: source position in 0..1 of the canvas (v down); ring: halo radius as a fraction of the
        canvas height; power/burst: strengths (defaults 1); ink: true for the pale-page version, with
        inkColor [r,g,b] 0..1 (default gold leaf). Call right after the source canvas was drawn
        (a WebGL canvas without preserveDrawingBuffer is only readable in that same task).
   Classic script, no dependencies. */
(function () {
  "use strict";
  const VS = `#version 300 es
out vec2 vUv; void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene;
uniform vec2 uLight, uTexel;
uniform float uTime, uAspect, uRing, uPower, uBurst, uInk;
uniform vec3 uInkCol;
const int N = 56;
float lum(vec2 uv) { vec3 c = texture(uScene, uv).rgb; return max(c.r, max(c.g, c.b)); }
void main() {
  vec2 uv = vUv;
  // shafts: march from this pixel towards the light, gathering what is bright along the way
  vec2 stepv = (uv - uLight) * (0.94 / float(N));
  vec2 s = uv; float decay = 1.0, shafts = 0.0;
  for (int i = 0; i < N; i++) { s -= stepv; shafts += lum(s) * decay; decay *= 0.957; }
  shafts /= float(N);
  // polar coordinates around the light, corrected for aspect so circles stay round
  vec2 p = uv - uLight; p.x *= uAspect; p.y = -p.y;
  float r = length(p), a = atan(p.y, p.x);
  // burst: two ray counts drifting against each other
  float rays = pow(0.5 + 0.5 * sin(a * 22.0 + uTime * 0.11 + 2.6 * sin(a * 3.0 - uTime * 0.05)), 7.0) * 0.7
             + pow(0.5 + 0.5 * sin(a * 7.0 - uTime * 0.07), 12.0) * 0.6;
  float burst = rays * exp(-r * 2.2) * smoothstep(0.015, 0.2, r) * uBurst;
  // halo: a thin ring and its bloom, breathing very slightly
  float rr = uRing * (1.0 + 0.006 * sin(uTime * 0.6));
  float halo = exp(-pow((r - rr) / 0.0045, 2.0)) * 0.55 + exp(-pow((r - rr) / 0.05, 2.0)) * 0.16;
  float core = exp(-r * r / 0.012) * 0.35;
  // stars: a cross of taps either side of the brightest points
  float star = 0.0;
  for (int i = 1; i <= 7; i++) {
    float k = float(i) * 2.2, w = exp(-float(i) * 0.5);
    star += w * (lum(uv + vec2(uTexel.x * k, 0.0)) + lum(uv - vec2(uTexel.x * k, 0.0)) + lum(uv + vec2(0.0, uTexel.y * k)) + lum(uv - vec2(0.0, uTexel.y * k)));
  }
  star = max(star - 1.1, 0.0) * 0.22;
  vec3 gold = vec3(1.0, 0.78, 0.42), pale = vec3(1.0, 0.95, 0.84);
  vec3 col = gold * (shafts * 2.6 * uPower + burst * 0.32) + pale * (halo + core + star);
  col = col / (1.0 + col);              // keep the brightest light from clipping
  if (uInk > 0.5) {
    // gold leaf: the light's strength lays down ink colour on white (multiply this over the page)
    float k = max(col.r, max(col.g, col.b));
    o = vec4(vec3(1.0) - k * 1.35 * (vec3(1.0) - uInkCol), 1.0);
  } else o = vec4(col, 1.0);
}`;

  function compile(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }

  function create(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; for (const n of ["uScene", "uLight", "uTexel", "uTime", "uAspect", "uRing", "uPower", "uBurst", "uInk", "uInkCol"]) u[n] = gl.getUniformLocation(p, n);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // the source is shrunk through a 2D canvas first: the light is soft, so a third of the pixels is plenty
    const small = document.createElement("canvas"), sctx = small.getContext("2d");
    return { gl, canvas, p, u, tex, small, sctx, vao: gl.createVertexArray(), scale: opts.scale || 0.5 };
  }
  function resize(h, pxW, pxH) {
    h.canvas.width = Math.max(1, Math.round(pxW * h.scale)); h.canvas.height = Math.max(1, Math.round(pxH * h.scale));
    h.small.width = Math.max(1, Math.round(pxW / 3)); h.small.height = Math.max(1, Math.round(pxH / 3));
  }
  function draw(h, source, o) {
    o = o || {};
    const gl = h.gl, sw = h.small.width, sh = h.small.height;
    h.sctx.clearRect(0, 0, sw, sh); h.sctx.drawImage(source, 0, 0, sw, sh);
    gl.bindTexture(gl.TEXTURE_2D, h.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, h.small);
    gl.viewport(0, 0, h.canvas.width, h.canvas.height);
    gl.useProgram(h.p); gl.bindVertexArray(h.vao);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(h.u.uScene, 0);
    const light = o.light || [0.5, 0.5];
    gl.uniform2f(h.u.uLight, light[0], 1 - light[1]);
    gl.uniform2f(h.u.uTexel, 1 / sw, 1 / sh);
    gl.uniform1f(h.u.uTime, o.time || 0);
    gl.uniform1f(h.u.uAspect, h.canvas.width / h.canvas.height);
    gl.uniform1f(h.u.uRing, o.ring ?? 0.38);
    gl.uniform1f(h.u.uPower, o.power ?? 1);
    gl.uniform1f(h.u.uBurst, o.burst ?? 1);
    gl.uniform1f(h.u.uInk, o.ink ? 1 : 0);
    const ink = o.inkColor || [0.72, 0.53, 0.2];
    gl.uniform3f(h.u.uInkCol, ink[0], ink[1], ink[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function clear(h, ink) { const gl = h.gl, v = ink ? 1 : 0; gl.viewport(0, 0, h.canvas.width, h.canvas.height); gl.clearColor(v, v, v, 1); gl.clear(gl.COLOR_BUFFER_BIT); }

  window.HolyLight = { create, resize, draw, clear };
})();
