/* INTERACTIONS: SpireSolid. A tower's kit parts stood up as solids.

   creature-spire.js decides where every kit part goes on a tower (spun round the axis as fins, bent onto a drum, repeated round a ring).
   It draws each as flat lines. This module is the other way to draw one: a sink that creature-spire hands each part and the map that
   places a point of it, and that answers with the part made solid by PartSolid (packages/parts/part-solid.js) and put
   through the same map, so the solid stands exactly where the drawing would have.

     const sink = SpireSolid.sink({ detail: 1, depth: 1 })
     const built = CreatureSpire.buildSpireGL2(genome, { solid: sink })
     built.solid -> { positions, normals, ao, thin, blend, join, sec, indices, lines, secs, stats, relief }

   sink options: detail, depth (as before); rough: metres the stone is moved by a slow noise of position (0 off);
   far: { w, h } bakes the wall reliefs into a height map round the axis instead of triangles (relief below)

   positions, normals    Float32Array (x, y up, z), metres, in the tower's own space (the same as built.lines)
   ao                    per vertex, 1 open .. 0.35 deep in a crease (PartSolid's crease shading)
   thin                  per vertex, how thick the part stands there in metres (for light through thin parts)
   blend, join           per vertex: the normal of what the part stands on (the wall under a relief, straight out from the axis at a fin's
                         root) and how much of it to use (1 at the foot, 0 at the crown), so a look can light the foot like the wall
   relief                far only: { data: Float32Array, two a cell (metres above the wall; the wall's distance from the axis), w, h, hmax, top }; column = angle round the axis
                         (atan2(x, z) / 2pi), row = height / top. The look draws it on the body (packages/city/spire-look.js)
   sec                   per vertex, an index into secs (the section the part belongs to: bay, fin, fan, lamp ...), so a look can tint by it
   indices               Uint32Array, triangles
   lines                 Float32Array of segment pairs: each part's own drawing, lying on its surface
   stats                 { parts, bakes, tris, verts, ms }

   How a part rises depends on the section it is in (LOOK below):
     wall relief   bays, pilasters, friezes, the core: bent onto the drum and risen from it only outward (the back is left out)
     fins, fans    ribs, hooks, buttresses, crown blades: two-sided, spun round the axis in K planes
     crown         the lamp and the halo beads belly out; the halo is a thin plate; the spire a blade
   Closed shapes drawn inside a halo or a bay are cut through (PartSolid holes). Behind a bay's holes lies a pane (section "pane"),
   for a look to light as a window. A relief's foot is flared: it leaves the wall at a slant, not straight up.

   A part with no closed outline cannot be made solid; the sink answers false and creature-spire draws it as lines.
   Mesh detail follows the size a part is stood at, so a small bay has a handful of triangles and a buttress has many.
   Needs window.PartSolid (and Delaunator). Draws nothing. Classic script -> window.SpireSolid. */
(function () {
  'use strict';
  const { min, max, abs, round, floor, sqrt, cos, sin, atan2, hypot, PI } = Math, TAU = PI * 2;
  const clamp = (v, a, b) => min(b, max(a, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // how each section's parts rise: PartSolid mode, how far (share of the part's widest half-width), wall relief or two-sided.
  // cap: the most a part may stand off its surface, in sheet px as stood (a share, capF, of the part's longer side, and/or a fixed capPx),
  // so a huge drawing on a drum is a relief on it and not a barrel round it.
  // far: on a far build this section goes into the height map (it stands on the body's own wall; a drop or a parapet hangs off a ledge and stays a solid).
  // holes: its inner closed shapes are cut through. pane: a lit pane lies behind the holes. join: "radial" = a fin, joined at its root
  const LOOK = {
    core:     { mode: 'plate', thick: 0.5,  relief: true, far: true, capPx: 8, holes: 0.04, pierced: true },   // a pierced skin over the shaft: the wall and its windows show through. A core with nothing to pierce stays a line drawing on the wall
    neck:     { mode: 'belly', thick: 0.6,  relief: true, far: true, capPx: 12 },
    bay:      { mode: 'belly', thick: 0.6,  relief: true, far: true, capPx: 14, capF: 0.3, holes: true, pane: true },
    pilaster: { mode: 'belly', thick: 0.5,  relief: true, far: true, capPx: 9, capF: 0.22 },
    cornice:  { mode: 'plate', thick: 0.5,  relief: true, far: true, capPx: 7, capF: 0.3 },
    frieze:   { mode: 'plate', thick: 0.5,  relief: true, far: true, capPx: 7, capF: 0.3 },
    parapet:  { mode: 'plate', thick: 0.5,  relief: true, capPx: 7, capF: 0.3 },
    drop:     { mode: 'belly', thick: 0.7,  relief: true, capPx: 9, capF: 0.4 },
    corner:   { mode: 'blade', thick: 0.7,  capF: 0.12, join: 'radial' },
    fin:      { mode: 'blade', thick: 0.7,  capF: 0.12, join: 'radial' },
    butt:     { mode: 'blade', thick: 0.55, capF: 0.1, join: 'radial' },
    fan:      { mode: 'blade', thick: 0.7,  capF: 0.1 },
    halo:     { mode: 'plate', thick: 0.12, capF: 0.03, holes: true },
    haloBead: { mode: 'belly', thick: 0.8,  capF: 0.4 },
    lamp:     { mode: 'belly', thick: 0.8,  capF: 0.3 },
    spire:    { mode: 'blade', thick: 0.7,  capF: 0.1 },
  };
  const SECS = Object.keys(LOOK).concat('pane');
  const DEFAULT = { mode: 'belly', thick: 0.6 };
  const FLARE = 0.75;   // how much of a relief's rise is eased in at its foot

  // a part's drawing as PartSolid reads it (flat polylines), once per part
  function readPart(PS, p) {
    if (p._solidRead !== undefined) return p._solidRead;
    let r = null;
    try {
      const flat = p.polys.map((pl) => { const a = []; for (const q of pl) a.push(q[0], q[1]); return a; });
      const rd = PS.read(flat);
      if (rd.outer.length) r = rd;
    } catch (e) { r = null; }
    return (p._solidRead = r);
  }

  // detail: how finely a part is meshed; 1 is the default, 0.7 light, 1.4 full
  function bake(PS, p, s, sec, detail, stats) {
    const L = LOOK[sec] || DEFAULT, rd = readPart(PS, p);
    if (!rd) return null;
    const stood = max(p.w, p.h) * s;
    const res = clamp(round(sqrt(stood) * 3.2 * detail / 4) * 4, 8, 64), grid = clamp(res * 3, 48, 160);
    const key = L.mode + '|' + L.thick + '|' + res + (L.holes ? '|h' : ''), cache = p._solidCache || (p._solidCache = {});
    if (cache[key] !== undefined) return cache[key];
    let so = null;
    try { so = PS.build(rd, { mode: L.mode, thick: L.thick, res, grid, edge: 0.05, holes: !!L.holes }); } catch (e) { so = null; }
    if (so && (!so.tris || so.empty)) so = null;
    stats.bakes++;
    return (cache[key] = so);
  }

  // ---- stone: a slow noise of position moves every vertex a little, the same for a part and the wall under it ----
  const hsh = (x, y, z, k) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + k * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  function vnoise(x, y, z, k) {
    const ix = floor(x), iy = floor(y), iz = floor(z); let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t, H = (dx, dy, dz) => hsh(ix + dx, iy + dy, iz + dz, k);
    return L(L(L(H(0, 0, 0), H(1, 0, 0), fx), L(H(0, 1, 0), H(1, 1, 0), fx), fy), L(L(H(0, 0, 1), H(1, 0, 1), fx), L(H(0, 1, 1), H(1, 1, 1), fx), fy), fz);
  }
  // positions (metres) moved in place by up to amp metres; wave: the noise's wavelength in metres. The ground (y = 0) stays level
  function displace(pos, amp, wave) {
    if (!(amp > 0)) return pos;
    const f = 1 / (wave || 1.6);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i] * f, y = pos[i + 1] * f, z = pos[i + 2] * f;
      pos[i] += amp * 2 * (vnoise(x, y, z, 1) - 0.5); pos[i + 2] += amp * 2 * (vnoise(x, y, z, 3) - 0.5);
      pos[i + 1] += amp * 2 * (vnoise(x, y, z, 2) - 0.5) * smooth(pos[i + 1] / 0.5);
    }
    return pos;
  }

  function sink(opts) {
    opts = opts || {};
    const PS = window.PartSolid, detail = opts.detail == null ? 1 : opts.detail, depth = opts.depth == null ? 1 : opts.depth, rough = opts.rough || 0;
    const far = opts.far ? { w: opts.far.w || 2048, h: opts.far.h || 2048 } : null;
    const stats = { parts: 0, bakes: 0, tris: 0, verts: 0, ms: 0, baked: 0, holes: 0, panes: 0, bySec: {} };
    let u = 1 / 16, topPx = 1;
    const P = [], A = [], S = [], T = [], BN = [], JW = [], I = [], LN = [];
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const e = 8;
    let map2 = null, hmax = 0;

    // a triangle of (column, row, height) drawn into the far map, the highest kept
    function raster(a, b, c) {
      const W = far.w, H = far.h, D = map2;
      let x0 = a[0], x1 = b[0], x2 = c[0];
      if (max(x0, x1, x2) - min(x0, x1, x2) > W / 2) { if (x0 < W / 2) x0 += W; if (x1 < W / 2) x1 += W; if (x2 < W / 2) x2 += W; }   // across the seam
      const y0 = a[1], y1 = b[1], y2 = c[1], den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      const rad = (a[3] + b[3] + c[3]) / 3, put = (x, y, h) => { if (y < 0 || y >= H) return; const i = 2 * (y * W + ((x % W) + W) % W); if (h > D[i]) { D[i] = h; D[i + 1] = rad; } };
      put(floor(x0), floor(y0), a[2]); put(floor(x1), floor(y1), b[2]); put(floor(x2), floor(y2), c[2]);
      if (abs(den) < 1e-9) return;
      const tol = clamp(1 / sqrt(abs(den)), 0.02, 1.5);   // a triangle smaller than a cell still fills the cells it touches, or the map is full of pinholes
      const xa = floor(min(x0, x1, x2)), xb = floor(max(x0, x1, x2)), ya = max(0, floor(min(y0, y1, y2))), yb = min(H - 1, floor(max(y0, y1, y2)));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const px = x + 0.5, py = y + 0.5, l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den, l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den, l2 = 1 - l0 - l1;
        if (l0 < -tol || l1 < -tol || l2 < -tol) continue;
        const m0 = clamp(l0, 0, 1), m1 = clamp(l1, 0, 1), m2 = clamp(l2, 0, 1), ms = m0 + m1 + m2 || 1;
        put(x, y, (m0 * a[2] + m1 * b[2] + m2 * c[2]) / ms);
      }
    }

    return {
      begin(unit, info) { u = unit; topPx = (info && info.top) || 1; if (far) map2 = new Float32Array(far.w * far.h * 2); },   // per cell: metres above the wall, and the wall's distance from the axis there
      part(p, s, rot, flipY, sx, map, sec) {
        if (!PS || !window.Delaunator) return false;
        const B = bake(PS, p, s, sec, detail, stats);
        if (!B) return false;
        if ((LOOK[sec] || DEFAULT).pierced && !B.holes) return false;   // it would only be a blank skin over the wall
        const L = LOOK[sec] || DEFAULT, r = rot * PI / 180, cr = cos(r), sr = sin(r), fy = flipY ? -1 : 1, relief = !!L.relief;
        // how far the solid may stand off its drawing: its own height scaled with the part, held to the section's cap
        const top = max(B.height, 1e-9), cap = min(L.capPx == null ? 1e9 : L.capPx, L.capF == null ? 1e9 : L.capF * max(p.w, p.h) * s), k = min(s, cap / top) * depth;
        // a relief rises outward only, and leaves the wall at a slant (the flare)
        const zf = relief ? (z) => { const t = max(z, 0) / top; return top * (t + FLARE * (t * t * (3 - 2 * t) - t)); } : (z) => z;
        // a point of the drawing (solid space: x, y up) -> the part's plane, then the same turn, scale and map as its lines; lz is the rise off that plane
        const at = (x, y, lz) => { const px = B.cx + x, py = (B.cy - y) * fy; return map(sx * (px * cr - py * sr) * s, (px * sr + py * cr) * s, lz); };
        const F = (x, y, z) => at(x, y, zf(z) * k);
        const pos = B.positions, idx = B.indices, nv = pos.length / 3, half = B.verts / 2, id = max(0, SECS.indexOf(sec));
        const bs = stats.bySec[sec] || (stats.bySec[sec] = { parts: 0, tris: 0 });
        stats.parts++; bs.parts++; if (B.holes) stats.holes += B.holes;

        // a lit pane behind a bay's holes: the triangles the holes took out, lying just off the wall
        const pane = () => {
          const ci = B.cutIndices; if (!L.pane || !ci || !ci.length) return;
          const base = P.length / 3, re = new Int32Array(half).fill(-1), pid = SECS.indexOf('pane'), lz = max(0.06 * top * k, 0.6); let n = 0;
          for (let i = 0; i < ci.length; i++) if (re[ci[i]] < 0) re[ci[i]] = 0;
          for (let q = 0; q < half; q++) if (re[q] === 0) { re[q] = n++; const v = at(pos[q * 3], pos[q * 3 + 1], lz), w = at(pos[q * 3], pos[q * 3 + 1], lz + 1);
            const bx = w[0] - v[0], by = w[1] - v[1], bz = w[2] - v[2], bl = hypot(bx, by, bz) || 1;
            P.push(v[0] * u, v[1] * u, v[2] * u); A.push(0.55); S.push(pid); T.push(9); BN.push(bx / bl, by / bl, bz / bl); JW.push(1); }
          const o2 = at(0, 0, 0), a2 = at(e, 0, 0), b2 = at(0, e, 0), c2 = at(0, 0, e);
          const fl = ((a2[0] - o2[0]) * ((b2[1] - o2[1]) * (c2[2] - o2[2]) - (b2[2] - o2[2]) * (c2[1] - o2[1])) - (a2[1] - o2[1]) * ((b2[0] - o2[0]) * (c2[2] - o2[2]) - (b2[2] - o2[2]) * (c2[0] - o2[0])) + (a2[2] - o2[2]) * ((b2[0] - o2[0]) * (c2[1] - o2[1]) - (b2[1] - o2[1]) * (c2[0] - o2[0]))) < 0;
          for (let i = 0; i < ci.length; i += 3) { const n0 = base + re[ci[i]], n1 = base + re[ci[i + 1]], n2 = base + re[ci[i + 2]]; if (fl) I.push(n0, n2, n1); else I.push(n0, n1, n2); }
          stats.panes++; bs.tris += ci.length / 3;
        };

        // far: a wall relief is drawn into the height map (column = angle, row = height), not made of triangles
        if (far && relief && L.far) {
          const W = far.w, H = far.h, c3 = new Float32Array(half * 4);
          for (let q = 0; q < half; q++) { const v = at(pos[q * 3], pos[q * 3 + 1], 0), h = zf(pos[q * 3 + 2]) * k * u;
            let a = atan2(v[0], v[2]) / TAU; a -= floor(a); c3[q * 4] = a * W; c3[q * 4 + 1] = v[1] / topPx * H; c3[q * 4 + 2] = h; c3[q * 4 + 3] = hypot(v[0], v[2]) * u; if (h > hmax) hmax = h; }
          for (let i = 0; i < idx.length; i += 3) { const i0 = idx[i], i1 = idx[i + 1], i2 = idx[i + 2]; if (i0 >= half || i1 >= half || i2 >= half) continue;
            raster(c3.subarray(i0 * 4, i0 * 4 + 4), c3.subarray(i1 * 4, i1 * 4 + 4), c3.subarray(i2 * 4, i2 * 4 + 4)); }
          stats.baked++; pane();
          return true;
        }

        // a mirrored placement turns the surface inside out: find out from where the three axes land
        const o = F(0, 0, 0), a = F(e, 0, 0), b = F(0, e, 0), c = F(0, 0, e);
        const ax = a[0] - o[0], ay = a[1] - o[1], az = a[2] - o[2], bx = b[0] - o[0], by = b[1] - o[1], bz = b[2] - o[2], cx = c[0] - o[0], cy = c[1] - o[1], cz = c[2] - o[2];
        const flip = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) < 0;
        const remap = new Int32Array(nv).fill(-1), base = P.length / 3;
        const i0len = I.length, keep = (i) => !(relief && idx[i] >= half && idx[i + 1] >= half && idx[i + 2] >= half);   // the back of a relief lies against the wall
        // number the kept vertices in the order they are written below (by index), not the order triangles first reach them
        for (let i = 0; i < idx.length; i += 3) if (keep(i)) { remap[idx[i]] = remap[idx[i + 1]] = remap[idx[i + 2]] = 0; }
        let used = 0;
        for (let q = 0; q < nv; q++) if (remap[q] === 0) remap[q] = used++;
        for (let i = 0; i < idx.length; i += 3) {
          if (!keep(i)) continue;
          const n0 = base + remap[idx[i]], n1 = base + remap[idx[i + 1]], n2 = base + remap[idx[i + 2]];
          if (flip) I.push(n0, n2, n1); else I.push(n0, n1, n2);
        }
        let rmin = 1e9, rmax = 0;
        for (let q = 0; q < nv; q++) {
          if (remap[q] < 0) continue;
          const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2], zr = zf(z) * k, v = at(x, y, zr);
          P.push(v[0] * u, v[1] * u, v[2] * u); A.push(B.ao[q]); S.push(id);
          T.push(2 * abs(zr) * u);   // how thick the part stands here, metres
          if (relief) {   // the wall's own normal under this point, most of it at the foot and none at the crown
            const w = at(x, y, zr + 1), dx = w[0] - v[0], dy = w[1] - v[1], dz = w[2] - v[2], dl = hypot(dx, dy, dz) || 1;
            BN.push(dx / dl, dy / dl, dz / dl); JW.push(1 - smooth(max(z, 0) / (0.7 * top)));
          } else if (L.join === 'radial') {
            const rr = hypot(v[0], v[2]); if (rr < rmin) rmin = rr; if (rr > rmax) rmax = rr;
            if (rr > 1e-6) BN.push(v[0] / rr, 0, v[2] / rr); else BN.push(0, 1, 0);
            JW.push(rr);   // the distance from the axis for now; turned into a weight below
          } else { BN.push(0, 1, 0); JW.push(0); }
        }
        if (!relief && L.join === 'radial') { const span = max(rmax - rmin, 1e-6); for (let q = base; q < base + used; q++) JW[q] = 0.7 * (1 - smooth((JW[q] - rmin) / (0.3 * span))); }
        // the drawing on the surface
        const ln = B.lines;
        for (let i = 0; i < ln.length; i += 6) {
          if (relief && ln[i + 2] < 0) continue;
          const v0 = F(ln[i], ln[i + 1], ln[i + 2]), v1 = F(ln[i + 3], ln[i + 4], ln[i + 5]);
          LN.push(v0[0] * u, v0[1] * u, v0[2] * u, v1[0] * u, v1[1] * u, v1[2] * u);
        }
        bs.tris += (I.length - i0len) / 3;
        pane();
        return true;
      },
      finish() {
        const positions = displace(Float32Array.from(P), rough), indices = Uint32Array.from(I), n = positions.length / 3, normals = new Float32Array(n * 3);
        for (let i = 0; i < indices.length; i += 3) {
          const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
          const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
          const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;   // area weighted
          for (const q of [a, b, c]) { normals[q] += nx; normals[q + 1] += ny; normals[q + 2] += nz; }
        }
        for (let i = 0; i < n; i++) { const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2], l = Math.hypot(x, y, z); if (l < 1e-12) { normals[i * 3 + 1] = 1; continue; } normals[i * 3] = x / l; normals[i * 3 + 1] = y / l; normals[i * 3 + 2] = z / l; }
        stats.tris = indices.length / 3; stats.verts = n;
        stats.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
        if (far) {   // close the pinholes left between small triangles: an empty cell with relief on most sides takes their mean
          const W = far.w, H = far.h;
          for (let pass = 0; pass < 2; pass++) { const src = map2.slice();
            for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) { const i = 2 * (y * W + x); if (src[i] > 0) continue; let n = 0, sum = 0, rs = 0;
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const j = 2 * ((y + dy) * W + (x + dx + W) % W); if (src[j] > 0) { n++; sum += src[j]; rs += src[j + 1]; } }
              if (n >= 5) { map2[i] = sum / n; map2[i + 1] = rs / n; } } }
        }
        return { positions, normals, ao: Float32Array.from(A), thin: Float32Array.from(T), blend: Float32Array.from(BN), join: Float32Array.from(JW), sec: Uint8Array.from(S), indices,
          lines: displace(Float32Array.from(LN), rough), secs: SECS.slice(), stats, relief: far ? { data: map2, w: far.w, h: far.h, hmax, top: topPx * u } : null };
      },
    };
  }

  window.SpireSolid = { sink, LOOK, SECS, displace };
})();
