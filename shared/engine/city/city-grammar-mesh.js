/* shared/engine/city/city-grammar-mesh.js — geometry for a city built by shared/engine/city/city-grammar.js.

   Renderer-free: plain Float32Arrays, city-local units, y up. world/scenes/city-grammar/ turns them into
   three.js meshes; World Scene uploads them to raw WebGL2; Route Scene to three.js. One builder, so
   all three show the same city.

     CityGrammarMesh.build(city, opts?) -> {
       ground, water, green, bldg: { positions, normals, colors, tileIds }   // non-indexed triangles,
                                                                             // flat normals, sRGB 0-1 colours
       lines, lineColors,                    // segment pairs: street fronts, facades, stitches
       sockets: { positions, colors }        // each street front's top edge, coloured by its socket
     }
     opts.tower      false: leave out the grammar's own centre tower (a host that stands its own)
     opts.outskirts  false: leave out the plain ground disc outside the wall (a host with its own floor)

   Colours: buildings carry their district's colour from districts.csv (for a Plan view); lines are
   INK (a host recolours or ignores them). tileIds index city.tiles (-1 for stitches and ground). */
(function () {
  "use strict";
  const hex = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };
  const INK = { r: 0, g: 0, b: 0 }, STONE = hex("#c9bfa8");
  const SOCK_COL = { plain: "#9a9a92", door: "#6fa3d8", arcade: "#e8a34a", sacred: "#d9534f", blank: "#555555" };
  class Tri {
    constructor() { this.p = []; this.n = []; this.c = []; this.t = []; }
    tri(a, b, c, col, tid = -1) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.t.push(tid); }
    }
    quad(a, b, c, d, col, tid) { this.tri(a, b, c, col, tid); this.tri(a, c, d, col, tid); }
    out() { return { positions: new Float32Array(this.p), normals: new Float32Array(this.n), colors: new Float32Array(this.c), tileIds: new Float32Array(this.t) }; }
  }
  class Lines {
    constructor() { this.p = []; this.c = []; }
    seg(a, b, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2]); this.c.push(col.r, col.g, col.b, col.r, col.g, col.b); }
    poly(pts, col, closed) { for (let k = 0; k < pts.length - (closed ? 0 : 1); k++) this.seg(pts[k], pts[(k + 1) % pts.length], col); }
  }
const ring = (r0, r1, y, a0, a1, segs, acc, col, up = true) => {
  for (let k = 0; k < segs; k++) {
    const t0 = a0 + (a1 - a0) * k / segs, t1 = a0 + (a1 - a0) * (k + 1) / segs, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const A = [c0 * r0, y, s0 * r0], B = [c1 * r0, y, s1 * r0], C = [c1 * r1, y, s1 * r1], D = [c0 * r1, y, s0 * r1];
    up ? acc.quad(A, D, C, B, col) : acc.quad(A, B, C, D, col);
  }
};
const wallRing = (r, y0, y1, a0, a1, segs, acc, col) => {
  for (let k = 0; k < segs; k++) {
    const t0 = a0 + (a1 - a0) * k / segs, t1 = a0 + (a1 - a0) * (k + 1) / segs;
    acc.quad([Math.cos(t0) * r, y0, Math.sin(t0) * r], [Math.cos(t1) * r, y0, Math.sin(t1) * r], [Math.cos(t1) * r, y1, Math.sin(t1) * r], [Math.cos(t0) * r, y1, Math.sin(t0) * r], col);
  }
};
function prism(acc, lines, poly, y0, y1, col, tid, ink, outline = true) {
  for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; acc.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], col, tid); }
  for (let k = 1; k < poly.length - 1; k++) acc.tri([poly[0][0], y1, poly[0][1]], [poly[k + 1][0], y1, poly[k + 1][1]], [poly[k][0], y1, poly[k][1]], col, tid);
  if (outline && lines) lines.poly(poly.map((p) => [p[0], y1, p[1]]), ink, true);
}
const centroid = (poly) => poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
const ngon = (x, z, r, n, rot = 0) => Array.from({ length: n }, (_, k) => [x + Math.cos(rot + k / n * Math.PI * 2) * r, z + Math.sin(rot + k / n * Math.PI * 2) * r]);
function cone(acc, lines, x, z, y0, r, h, n, col, tid, ink) {
  const base = ngon(x, z, r, n);
  for (let k = 0; k < n; k++) { const a = base[k], b = base[(k + 1) % n]; acc.tri([a[0], y0, a[1]], [b[0], y0, b[1]], [x, y0 + h, z], col, tid); }
  if (lines) { lines.seg([x, y0, z].map((v, i) => i === 1 ? y0 : v), [x, y0 + h, z], ink); for (let k = 0; k < n; k += Math.max(1, n >> 2)) lines.seg([base[k][0], y0, base[k][1]], [x, y0 + h, z], ink); }
}
// a deep pagoda eave: a thin overhanging slab, a tier above it, and a little hat
function eaves(acc, lines, poly, y, col, tid, ink, tiers = 2) {
  let c = centroid(poly), p = poly, yy = y;
  for (let k = 0; k < tiers; k++) {
    const grow = 1.28 - k * 0.32, slab = p.map((q) => [c[0] + (q[0] - c[0]) * grow, c[1] + (q[1] - c[1]) * grow]);
    prism(acc, lines, slab, yy, yy + 0.05, col, tid, ink);
    const up = p.map((q) => [c[0] + (q[0] - c[0]) * (0.75 - k * 0.2), c[1] + (q[1] - c[1]) * (0.75 - k * 0.2)]);
    prism(acc, null, up, yy + 0.05, yy + 0.2, col, tid, ink, false);
    yy += 0.2; p = up;
  }
  hip(acc, lines, p, yy, 0.18, col, tid, ink);
}
function hip(acc, lines, poly, y, h, col, tid, ink) {
  const c = centroid(poly), apex = [c[0], y + h, c[1]];
  for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; acc.tri([a[0], y, a[1]], [b[0], y, b[1]], apex, col, tid); }
  // no lines here: the street front's top edge already outlines the block; per-tile roof lines would
  // turn the roofscape into the tile grid
}

// the marching-squares outline of a tile's built part, in its own (u,v) square: a=(0,0) b=(1,0) c=(1,1) d=(0,1)
const UV = [[0, 0], [1, 0], [1, 1], [0, 1]], CUT = 0.6;
function footprint(t) {
  const s = t.corners.map((L) => L.solid), edgePt = (p, q) => [UV[p][0] + (UV[q][0] - UV[p][0]) * CUT, UV[p][1] + (UV[q][1] - UV[p][1]) * CUT];
  if (t.shape === "saddle") return [0, 1, 2, 3].filter((k) => s[k]).map((k) => [UV[k], edgePt(k, (k + 1) % 4), edgePt(k, (k + 3) % 4)].map((p, i) => ({ uv: p, contour: i > 0 }))).map((pl) => [pl[0], pl[1], pl[2]]);
  const out = [];
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    if (s[k]) out.push({ uv: UV[k], contour: false });
    if (s[k] !== s[n]) out.push({ uv: s[k] ? edgePt(k, n) : edgePt(n, k), contour: true });
  }
  return [out];
}
function tileToWorld(city, t, uv) {
  const T = city.terraces[t.terrace], r = T.radii[t.i] + (T.radii[t.i + 1] - T.radii[t.i]) * uv[1], a = (t.j + uv[0]) / T.sectors * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

const area = (p) => p.reduce((s, q, k) => { const r = p[(k + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
// facade line work per socket: arcades, doors, a sacred rope, plain lancet windows
function facade(city, L, a, b, len, y0, t, col) {
  const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], at = (s, y) => [a[0] + dir[0] * s, y, a[1] + dir[1] * s];
  const FH = city.floorH, sock = t.module.socket;
  if (sock === "arcade") {
    const n = Math.max(1, Math.round(len / 0.28)), w = len / n;
    for (let k = 0; k < n; k++) { const s0 = k * w, pts = []; for (let q = 0; q <= 6; q++) { const th = Math.PI * q / 6; pts.push(at(s0 + w / 2 - Math.cos(th) * w * 0.38, y0 + FH * 0.55 + Math.sin(th) * w * 0.38)); } L.poly(pts, col); L.seg(at(s0 + w * 0.12, y0), at(s0 + w * 0.12, y0 + FH * 0.55), col); L.seg(at(s0 + w * 0.88, y0), at(s0 + w * 0.88, y0 + FH * 0.55), col); }
  } else if (sock === "door") {
    const n = Math.max(1, Math.floor(len / 0.42));
    for (let k = 0; k < n; k++) { const s = (k + 0.5) * len / n; L.poly([at(s - 0.06, y0), at(s - 0.06, y0 + FH * 0.7), at(s + 0.06, y0 + FH * 0.7), at(s + 0.06, y0)], col); }
  } else if (sock === "sacred") {
    const pts = []; for (let q = 0; q <= 8; q++) { const s = len * q / 8; pts.push(at(s, y0 + FH * 0.82 - Math.sin(Math.PI * q / 8) * 0.06)); } L.poly(pts, col);
    for (let q = 1; q < 8; q += 2) { const s = len * q / 8, y = y0 + FH * 0.82 - Math.sin(Math.PI * q / 8) * 0.06; L.poly([at(s, y), at(s + 0.03, y - 0.05), at(s - 0.01, y - 0.09), at(s + 0.02, y - 0.14)], col); }
  }
  if (sock !== "arcade") {   // lancet windows on every floor above (and on plain/door ground floors)
    const n = Math.max(1, Math.floor(len / 0.3));
    for (let f = sock === "plain" ? 0 : 1; f < t.floors; f++) for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * len / n, yb = y0 + f * FH + FH * 0.25, yt = y0 + f * FH + FH * 0.7;
      L.seg(at(s, yb), at(s, yt), col); L.seg(at(s, yt), at(s + 0.025, yt + 0.05), col);
    }
  }
  for (let f = 1; f < t.floors; f++) L.seg(at(0, y0 + f * FH), at(len, y0 + f * FH), col);   // storey bands (the stack)
}
function stitch(s, B, L, col) {
  const stone = STONE, cs = Math.cos(s.a || 0), sn = Math.sin(s.a || 0), side = [-sn, cs];
  const box = (x, z, w, d, y0, h, rot = s.a || 0) => { const c = Math.cos(rot), q = Math.sin(rot); const p = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]) => [x + u * c - v * q, z + u * q + v * c]); prism(B, L, p, y0, y0 + h, stone, -1, col); };
  if (s.kind === "terrace-edge") {   // buttresses down the retaining wall, Gothic, every so often
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; if (s.gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.08)) continue; box(Math.cos(a) * (s.r + 0.06), Math.sin(a) * (s.r + 0.06), 0.07, 0.05, s.y0, s.y1 - s.y0 - 0.05, a); }
  } else if (s.kind === "spoke-edge") {   // a stair up the retaining wall
    const n = 7, r0 = s.r1 + 0.02, r1 = s.r0 - 0.02;
    for (let k = 0; k < n; k++) { const r = r1 + (r0 - r1) * (k + 0.5) / n, h = (s.y1 - s.y0) * (k + 1) / n; box(cs * r, sn * r, (r0 - r1) / n / 2 + 0.01, 0.22, s.y0, h); }
  } else if (s.kind === "sanctum-spoke") {   // a torii, its lintel a Gothic pointed arch
    const w = 0.34, h = 0.75, P = (u, y) => [s.x + side[0] * u, s.y + y, s.z + side[1] * u];
    for (const u of [-w, w]) box(s.x + side[0] * u, s.z + side[1] * u, 0.035, 0.035, s.y, h);
    const lint = []; for (let q = 0; q <= 8; q++) { const u = -w * 1.35 + q / 8 * w * 2.7; lint.push(P(u, h + 0.05 + Math.pow(Math.abs(u) / (w * 1.35), 2) * 0.08)); } L.poly(lint, col);
    L.seg(P(-w * 1.1, h - 0.1), P(w * 1.1, h - 0.1), col);
    // Gothic tracery under the lintel: a pointed arch, two arcs meeting at the top
    const arch = []; for (let q = 0; q <= 10; q++) { const u = -w + q / 10 * 2 * w; arch.push(P(u, h - 0.42 + (1 - Math.pow(Math.abs(u) / w, 1.6)) * 0.3)); } L.poly(arch, col);
  } else if (s.kind === "canal-spoke") {   // a bridge
    box(s.x, s.z, 0.42, 0.2, s.y - 0.04, 0.08);
    const arch = []; for (let q = 0; q <= 8; q++) { const th = Math.PI * q / 8, u = -Math.cos(th) * 0.32; arch.push([s.x + cs * u, s.y - 0.09 + Math.sin(th) * 0.08, s.z + sn * u]); } L.poly(arch, col);
  } else if (s.kind === "ring-spoke") {   // a well with a little roof
    prism(B, L, ngon(s.x, s.z, 0.11, 8), s.y, s.y + 0.1, stone, -1, col);
    for (const k of [0, 4]) { const p = ngon(s.x, s.z, 0.1, 8)[k]; L.seg([p[0], s.y + 0.1, p[1]], [p[0], s.y + 0.32, p[1]], col); }
    hip(B, L, ngon(s.x, s.z, 0.16, 4, Math.PI / 4), s.y + 0.32, 0.1, stone, -1, col);
  } else if (s.kind === "wall") {
    const segs = 160;
    for (let k = 0; k < segs; k++) {
      const a0 = k / segs * Math.PI * 2, a1 = (k + 1) / segs * Math.PI * 2, am = (a0 + a1) / 2;
      if (s.gaps.some((g) => Math.abs(Math.atan2(Math.sin(am - g), Math.cos(am - g))) < 0.05)) continue;
      const h = 0.75 + (k % 2 ? 0.08 : 0);   // crenellations
      const p = [[s.r0, a0], [s.r0 + 0.35, a0], [s.r0 + 0.35, a1], [s.r0, a1]].map(([r, a]) => [Math.cos(a) * r, Math.sin(a) * r]);
      prism(B, null, p, s.y, s.y + h, stone, -1, col, false);
      L.seg([p[0][0], s.y + h, p[0][1]], [p[3][0], s.y + h, p[3][1]], col);
    }
  } else if (s.kind === "wall-spoke") {   // a gate: two towers with pagoda eaves
    for (const u of [-0.42, 0.42]) { const x = s.x + side[0] * u, z = s.z + side[1] * u, p = ngon(x, z, 0.2, 8); prism(B, L, p, s.y, s.y + 1.3, stone, -1, col); eaves(B, L, p, s.y + 1.3, stone, -1, col, 2); }
    const arch = []; for (let q = 0; q <= 10; q++) { const th = Math.PI * q / 10; arch.push([s.x + side[0] * -Math.cos(th) * 0.22, s.y + 0.5 + Math.sin(th) * 0.3, s.z + side[1] * -Math.cos(th) * 0.22]); } L.poly(arch, col);
  } else if (s.kind === "path") {   // stone lantern
    box(s.x, s.z, 0.025, 0.025, s.y, 0.16); box(s.x, s.z, 0.05, 0.05, s.y + 0.16, 0.06); hip(B, L, ngon(s.x, s.z, 0.07, 4, Math.PI / 4 + (s.a || 0)), s.y + 0.22, 0.05, stone, -1, col);
  }
}


  function build(city, opts) {
    opts = opts || {};
  const B = new Tri(), G = new Tri(), W = new Tri(), V = new Tri(), Lk = new Lines(), S = new Lines();
  const groundCol = hex("#b7ad98"), roadCol = hex("#8d8578"), waterCol = hex("#6f9db0"), greenCol = hex("#8fb38a"), ink = INK;
  const COLORS = {}, districtColor = (id) => COLORS[id] || (COLORS[id] = hex((city.sheet.byId[id] && city.sheet.byId[id].colour) || "#888888"));
  const TER = city.terraces, FH = city.floorH;
  // HEIGHT: each terrace a ring of ground at its level, the ring road outside it one level down,
  // the retaining wall between (the stitch below draws its buttresses and stairs)
  for (let k = 0; k < TER.length; k++) {
    const T = TER[k], inner = k === 0 ? 0 : TER[k - 1].r1, outer = k === TER.length - 1 ? city.wall.r1 + 0.6 : T.r1;
    ring(inner, outer, T.y, 0, Math.PI * 2, 128, G, k === 0 ? groundCol : groundCol);
    if (k < TER.length - 1) { wallRing(T.r1, TER[k + 1].y, T.y, 0, Math.PI * 2, 128, G, roadCol); Lk.poly(ngon(0, 0, T.r1, 128).map((p) => [p[0], T.y, p[1]]), ink, true); }
  }
  if (opts.outskirts !== false) ring(city.wall.r1 + 0.6, 70, TER[TER.length - 1].y - 0.02, 0, Math.PI * 2, 96, G, hex("#9e9886"));
  // the avenues: a pair of kerb lines down each spoke, terrace by terrace
  for (const a of city.spokes) for (const T of TER) for (const s of [-1, 1]) {
    const off = s * 0.16, c = Math.cos(a), sn = Math.sin(a), px = -sn * off, pz = c * off;
    Lk.seg([c * T.r0 + px, T.y + 0.01, sn * T.r0 + pz], [c * T.r1 + px, T.y + 0.01, sn * T.r1 + pz], ink);
  }
  // open lots: water, gardens, sacred trees
  for (const T of TER) for (const row of T.lots) for (const L of row) {
    const step = (T.r1 - T.r0) / T.rings, wa = Math.PI * 2 / T.sectors;
    if (L.open === "water" && !L.spoke) {
      const a0 = L.a - wa / 2, a1 = L.a + wa / 2;
      ring(L.r - step * 0.45, L.r + step * 0.45, T.y - 0.03, a0, a1, 2, W, waterCol);
      for (let q = 0; q < 2; q++) { const rr = L.r - step * 0.2 + q * step * 0.4; Lk.seg([Math.cos(a0 + 0.02) * rr, T.y - 0.02, Math.sin(a0 + 0.02) * rr], [Math.cos(a1 - 0.05) * rr, T.y - 0.02, Math.sin(a1 - 0.05) * rr], ink); }
    } else if (!L.solid && !L.reserved && (L.open === "garden" || (L.open === "courtyard" && (L.i + L.j) % 3 === 0) || L.open === "sacred")) {
      const h = L.open === "sacred" ? 0.9 : 0.45 + ((L.i * 7 + L.j * 13) % 5) * 0.08;
      cone(V, Lk, L.x, L.z, T.y, h * 0.32, h, 6, greenCol, -1, ink);
    }
  }
  // MODULES: every tile's built part, extruded to its floors, its bands, its roof, its street front
  for (const t of city.tiles) {
    if (!t.module) continue;
    const col = districtColor(t.district), tid = city.tiles.indexOf(t), y0 = t.y, y1 = t.y + t.floors * FH;
    for (const pl of footprint(t)) {
      const poly = pl.map((p) => tileToWorld(city, t, p.uv));
      prism(B, null, poly, y0, y1, col, tid, ink, false);
      // the street front: the contour edge(s), where the module's socket faces the lane
      for (let k = 0; k < pl.length; k++) {
        const p = pl[k], q = pl[(k + 1) % pl.length]; if (!(p.contour && q.contour)) continue;
        const a = poly[k], b = poly[(k + 1) % pl.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        Lk.seg([a[0], y0, a[1]], [a[0], y1, a[1]], ink); Lk.seg([b[0], y0, b[1]], [b[0], y1, b[1]], ink); Lk.seg([a[0], y1, a[1]], [b[0], y1, b[1]], ink);
        facade(city, Lk, a, b, L, y0, t, ink);
        S.seg([a[0], y1 + 0.03, a[1]], [b[0], y1 + 0.03, b[1]], hex(SOCK_COL[t.module.socket] || "#ffffff"));
      }
      // roofs
      const roof = t.roof && t.roof.shape;
      if (roof === "pyramid") hip(B, null, poly, y1, 0.22, col, tid, ink);
      else if (roof === "eave") eaves(B, Lk, poly, y1, col, tid, ink, t.district === "sanctum" || t.district === "shrine" ? 2 : 1);
      else if (roof === "spire") {
        const c = centroid(poly), r = Math.min(0.22, 0.4 * Math.sqrt(Math.abs(area(poly))));
        prism(B, Lk, ngon(c[0], c[1], r, 8), y1, y1 + 0.35, col, tid, ink);
        cone(B, Lk, c[0], c[1], y1 + 0.35, r * 1.05, 0.9 + (t.floors * 0.12), 8, col, tid, ink);
      }
    }
  }
  // the tower: Gothic shaft, pagoda eaves stacked up it, a spire (a host with its own hub tower skips it)
  if (opts.tower !== false) { const T0 = TER[0], y = T0.y, col = districtColor("tower");
    prism(B, Lk, ngon(0, 0, 1.25, 12), y, y + 0.7, col, -1, ink);
    let yy = y + 0.7, r = 0.95;
    for (let k = 0; k < 4; k++) {
      const h = 0.95 - k * 0.12;
      prism(B, Lk, ngon(0, 0, r, 12, k * 0.13), yy, yy + h, col, -1, ink);
      for (let q = 0; q < 12; q += 2) { const a = q / 12 * Math.PI * 2 + k * 0.13; Lk.seg([Math.cos(a) * r, yy + 0.15, Math.sin(a) * r], [Math.cos(a) * r, yy + h - 0.15, Math.sin(a) * r], ink); }
      yy += h; prism(B, Lk, ngon(0, 0, r * 1.45, 12, k * 0.13), yy, yy + 0.06, col, -1, ink); yy += 0.06; r *= 0.8;
    }
    cone(B, Lk, 0, 0, yy, r * 1.1, 2.6, 12, col, -1, ink); }
  // STITCHING
  for (const s of city.stitches) stitch(s, B, Lk, ink);
  return { ground: G.out(), water: W.out(), green: V.out(), bldg: B.out(), lines: new Float32Array(Lk.p), lineColors: new Float32Array(Lk.c), sockets: { positions: new Float32Array(S.p), colors: new Float32Array(S.c) } };
}

  window.CityGrammarMesh = { build, SOCK_COL };
})();
