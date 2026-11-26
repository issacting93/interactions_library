// packages/render/eco-view.js -- shared by the ecology pages (World Scene, Cybernetic Ecology, Field Scan, Species Style Lab), which each
// carried the same copy: a body's outline from its fill mesh, and a point on the screen to the tank (through the page's own camera,
// cam, at a depth). Plain global functions; they use the page's own globals when called.

function buildOutline(fillV, fillI) {
  const edgeCount = new Map(), edgeAB = new Map();
  const addEdge = (a, b) => {
    const k = a < b ? a + ',' + b : b + ',' + a;
    edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    if (!edgeAB.has(k)) edgeAB.set(k, [a, b]);
  };
  for (let t = 0; t < fillI.length; t += 3) {
    const a = fillI[t], b = fillI[t + 1], c = fillI[t + 2];
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  const verts = [], idx = [];
  for (const [k, cnt] of edgeCount) {
    if (cnt !== 1) continue;   // an edge shared by two triangles is interior, not an outline
    const [ia, ib] = edgeAB.get(k);
    const ax = fillV[ia * 3], ay = fillV[ia * 3 + 1], ap = fillV[ia * 3 + 2];
    const bx = fillV[ib * 3], by = fillV[ib * 3 + 1], bp = fillV[ib * 3 + 2];
    let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const nx = -dy, ny = dx;   // perpendicular to the edge, for the shader's width-extrude trick
    const base = verts.length / 5;
    verts.push(ax, ay, nx, ny, ap, ax, ay, -nx, -ny, ap, bx, by, nx, ny, bp, bx, by, -nx, -ny, bp);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  return { v: new Float32Array(verts), i: new Uint16Array(idx) };
}
function screenToTank(px, py, depth) {
  if (!cam.ivp) return [px, py];
  const nx = px / vw * 2 - 1 - cam.shiftX, ny = 1 - py / vh * 2 - cam.shift;
  const un = (z) => { const m = cam.ivp, x = m[0] * nx + m[4] * ny + m[8] * z + m[12], y = m[1] * nx + m[5] * ny + m[9] * z + m[13], zz = m[2] * nx + m[6] * ny + m[10] * z + m[14], w = m[3] * nx + m[7] * ny + m[11] * z + m[15]; return [x / w, y / w, zz / w]; };
  const a = un(-1), b = un(1), t = (depth - a[2]) / ((b[2] - a[2]) || 1e-6);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
