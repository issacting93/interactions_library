/* Small effects on the tank's context, drawn into whatever is bound with the page's camera.

     const F = FieldFX.create(gl)
     FieldFX.shadows(F, { vp, shift, shiftX, list: Float32Array of x, y, z, radius, alpha per blob, n })
        a soft dark blob on the floor under each thing: depth-tested against what is drawn (a tower hides it), writes no depth
   Classic script. */
(function () {
  'use strict';
  const VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; layout(location=1) in vec3 aUV; uniform mat4 uVP; uniform float uShift, uShiftX; out vec3 vUV;
void main() { vUV = aUV; gl_Position = uVP * vec4(aPos, 1.0); gl_Position.y += uShift * gl_Position.w; gl_Position.x += uShiftX * gl_Position.w; }`;
  const FS = `#version 300 es
precision mediump float; in vec3 vUV; out vec4 o; void main() { float d = length(vUV.xy); o = vec4(0.0, 0.0, 0.0, vUV.z * (1.0 - smoothstep(0.25, 1.0, d))); }`;
  function create(gl) {
    const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('FieldFX: ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); gl.bindVertexArray(null);
    return { gl, p, u: { vp: gl.getUniformLocation(p, 'uVP'), sh: gl.getUniformLocation(p, 'uShift'), sx: gl.getUniformLocation(p, 'uShiftX') }, vao, buf, data: new Float32Array(36 * 96) };
  }
  const Q = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
  function shadows(F, o) {
    const gl = F.gl, n = Math.min(o.n, 96); if (!n) return; const D = F.data, L = o.list; let k = 0;
    for (let i = 0; i < n; i++) { const x = L[i * 5], y = L[i * 5 + 1], z = L[i * 5 + 2], r = L[i * 5 + 3], a = L[i * 5 + 4]; for (let v = 0; v < 6; v++) { const ux = Q[v * 2], uy = Q[v * 2 + 1]; D[k++] = x + ux * r; D[k++] = y + uy * r; D[k++] = z; D[k++] = ux; D[k++] = uy; D[k++] = a; } }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
    gl.useProgram(F.p); gl.uniformMatrix4fv(F.u.vp, false, o.vp); gl.uniform1f(F.u.sh, o.shift || 0); gl.uniform1f(F.u.sx, o.shiftX || 0);
    gl.bindVertexArray(F.vao); gl.bindBuffer(gl.ARRAY_BUFFER, F.buf); gl.bufferData(gl.ARRAY_BUFFER, D.subarray(0, k), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, n * 6);
    gl.bindVertexArray(null); gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
  }
  window.FieldFX = { create, shadows };
})();
