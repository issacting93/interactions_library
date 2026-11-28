/* INTERACTIONS: PartSolid. A kit part's flat drawing made into a solid, by rule.

   A part is line work: an outline (or a few), and lines inside it. Nothing here is extruded or voxelised. The rules:

     the outline   is the edge of the solid, kept exactly: its points are the rim's vertices, so the silhouette from the front
                   is the drawing.
     how it rises  from that rim, one of three ways:
                     plate   a bevel up to a flat top (armour, a carapace)
                     blade   a straight slope up to a ridge along the middle of the shape (a fin, a claw, a horn)
                     belly   rounded, as far out as the shape is wide at that place: a strip comes out as a tube, a wide
                             region as a dome (a body, a lantern). This is the inflation of Teddy (Igarashi 1999) and
                             Repoussé (Joshi and Carr 2008): the height h solves lap(u) = -1 inside, u = 0 on the rim, h = sqrt(2u),
                             which gives a strip of half-width w the half-circle sqrt(w² - x²)
     shapes inside closed shapes drawn inside the outline are a second layer on the first, raised (or sunk) as a low plate;
                   a shape inside one of those goes back down, and so on (even-odd)
     lines inside  every inner line, and the edge of every inner shape, is a crease pressed into the surface
     both faces    the back is the front mirrored, with a wall between them at the rim (edge: how thick the rim is)
     the drawing   comes back as 3D line segments lying on the surface, so the solid is drawn with its own lines

   An outline drawn as loose strokes (ends that nearly meet) is joined into a closed one first.

     const part = PartSolid.read(svgOrPaths)            svg string, ["M..Z", ...], or flat polylines [[x0, y0, x1, y1, ...], ...]
       -> { outer: [poly], inner: [poly], lines: [poly], box: {x, y, w, h}, joined, loose }     poly: { pts: [[x, y], ...], closed }
     const solid = PartSolid.build(part, { mode: "plate" | "blade" | "belly", thick: 1, inner: 0.35, crease: 0.5, edge: 0.04, res: 64 })
       -> { positions: Float32Array (x, y, z; y up, centred on the drawing), indices: Uint32Array, lines: Float32Array (segment pairs),
            ao: Float32Array (per vertex, 1 open .. 0.35 deep in a crease or hollow), cx, cy (the drawing point at x = y = 0),
            edge, size, height, tris, verts, ms, holes, cutIndices }   (cutIndices: the front-face triangles the holes took out, for a pane behind them)
            a vertex's drawing point is (cx + x, cy - y); its z is how far it stands off the drawing's plane (front +, back -)
     thick   how high it rises, as a share of the shape's widest half-width
     holes   true (or the least size, as a share of the part's): closed shapes drawn inside the outline are cut through, walled round
     inner   -1..1: inner shapes sunk .. raised          crease  0..1: how deep the inner lines press
     edge    the rim's thickness, as a share of the widest half-width          res  mesh points along the longer side
    grid    cells along the longer side of the distance and height fields (default 224); the solve costs its square, so a small part can take fewer

   Needs window.Delaunator (delaunator 5). Draws nothing. Classic script -> window.PartSolid. */
(function () {
  "use strict";
  const { min, max, abs, sqrt, hypot, ceil, floor, round, exp } = Math;

  // ---- reading the drawing: every path as a polyline ----
  function paths(d) {
    const tok = d.match(/[MLHVCQZmlhvcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [], out = [];
    let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, cur = null;
    const num = () => +tok[i++], isNum = () => i < tok.length && !/^[A-Za-z]$/.test(tok[i]);
    const open = (px, py) => { cur = { pts: [[px, py]], closed: false }; out.push(cur); sx = px; sy = py; };
    const to = (px, py) => { if (!cur) open(x, y); cur.pts.push([px, py]); };
    while (i < tok.length) {
      if (!isNum()) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase() && cmd !== "z" && cmd !== "Z", ox = rel ? x : 0, oy = rel ? y : 0;
      switch (cmd.toUpperCase()) {
        case "M": x = ox + num(); y = oy + num(); open(x, y); cmd = rel ? "l" : "L"; break;
        case "L": x = ox + num(); y = oy + num(); to(x, y); break;
        case "H": x = ox + num(); to(x, y); break;
        case "V": y = oy + num(); to(x, y); break;
        case "C": { const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(), x3 = ox + num(), y3 = oy + num();
          for (let k = 1; k <= 10; k++) { const t = k / 10, u = 1 - t; to(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3); }
          x = x3; y = y3; break; }
        case "Q": { const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num();
          for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; to(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2); }
          x = x2; y = y2; break; }
        case "Z": if (cur) cur.closed = true; x = sx; y = sy; cur = null; break;
        default: i++;
      }
    }
    for (const p of out) { const a = p.pts[0], b = p.pts[p.pts.length - 1]; if (p.pts.length > 2 && hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) { p.pts.pop(); p.closed = true; } }
    return out.filter((p) => p.pts.length > 1);
  }
  const area = (pts) => { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  function inside(pts, x, y) { let c = false; for (let i = 0, n = pts.length, j = n - 1; i < n; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function boxOf(polys) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of polys) for (const q of p.pts) { x0 = min(x0, q[0]); x1 = max(x1, q[0]); y0 = min(y0, q[1]); y1 = max(y1, q[1]); } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
  // loose strokes whose ends nearly meet, joined end to end; a chain whose own two ends meet is closed
  function join(polys, tol) {
    const open = polys.filter((p) => !p.closed).map((p) => ({ pts: p.pts.slice(), closed: false })), done = polys.filter((p) => p.closed); let joined = 0;
    for (;;) {
      let best = null, bd = tol;
      for (let i = 0; i < open.length; i++) for (let j = i; j < open.length; j++) for (const ei of [0, 1]) for (const ej of [0, 1]) {
        if (i === j && ei >= ej) continue;
        const a = open[i].pts[ei ? open[i].pts.length - 1 : 0], b = open[j].pts[ej ? open[j].pts.length - 1 : 0], d = hypot(a[0] - b[0], a[1] - b[1]);
        if (d < bd) { bd = d; best = [i, j, ei, ej]; }
      }
      if (!best) break;
      const [i, j, ei, ej] = best; joined++;
      if (i === j) { open[i].closed = true; done.push(open[i]); open.splice(i, 1); continue; }
      const A = ei ? open[i].pts : open[i].pts.slice().reverse(), B = ej ? open[j].pts.slice().reverse() : open[j].pts;   // A ends at the joint, B starts there
      open[i] = { pts: A.concat(B), closed: false }; open.splice(j, 1);
    }
    return { polys: done.concat(open), joined };
  }
  function read(src, opts = {}) {
    let all = [];
    if (Array.isArray(src) && src.length && typeof src[0] !== "string") {   // flat polylines [x0, y0, x1, y1, ...] (PartLib.lines): closed when they end where they start
      for (const pl of src) { const pts = []; for (let i = 0; i + 1 < pl.length; i += 2) pts.push([pl[i], pl[i + 1]]); if (pts.length < 2) continue;
        const a = pts[0], b = pts[pts.length - 1], closed = pts.length > 2 && hypot(a[0] - b[0], a[1] - b[1]) < 1e-6; if (closed) pts.pop(); all.push({ pts, closed }); }
    } else { const ds = Array.isArray(src) ? src : [...String(src).matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]); for (const d of ds) all = all.concat(paths(d)); }
    const b0 = boxOf(all), size = max(b0.w, b0.h, 1e-6);
    let joined = 0;
    if (opts.join !== false && all.some((p) => !p.closed)) {
      // only strokes that could be outline: a closed outline already there keeps its inner strokes as they are
      const closed = all.filter((p) => p.closed), bigA = closed.reduce((m, p) => max(m, abs(area(p.pts))), 0);
      if (bigA < 0.05 * b0.w * b0.h) { const r = join(all, size * (opts.joinTol || 0.04)); all = r.polys; joined = r.joined; }
    }
    const closed = all.filter((p) => p.closed && abs(area(p.pts)) > 1e-6 * size * size), loose = all.filter((p) => !p.closed);
    // a shape is inside another only when it is the smaller of the two and (nearly) all of it lies within: two shapes that merely overlap
    // (a wing whose root runs under the body) are both outlines, and the solid is their union
    const AR = closed.map((p) => abs(area(p.pts))), BX = closed.map((p) => { let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18; for (const q of p.pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } return [x0, y0, x1, y1]; });
    const within = (p, q) => { const a = BX[closed.indexOf(p)], b = BX[closed.indexOf(q)], cx = (a[0] + a[2]) / 2, cy = (a[1] + a[3]) / 2; if (cx < b[0] || cx > b[2] || cy < b[1] || cy > b[3]) return false;   // its middle is not even in the other's box
      const st = max(1, floor(p.pts.length / 24)); let n = 0, k = 0; for (let i = 0; i < p.pts.length; i += st) { n++; if (inside(q.pts, p.pts[i][0], p.pts[i][1])) k++; } return k >= 0.9 * n; };
    const depth = closed.map((p, i) => closed.reduce((n, q, j) => n + (j !== i && AR[j] > AR[i] && within(p, q) ? 1 : 0), 0));
    const outer = closed.filter((_, i) => depth[i] === 0), inner = closed.filter((_, i) => depth[i] > 0);
    return { outer, inner, lines: loose, box: boxOf(outer.length ? outer : all), joined, loose: loose.length };
  }

  // ---- fields on a grid over the drawing ----
  // exact squared distance to the nearest set cell, in cells (Felzenszwalb and Huttenlocher), in place
  function edt(f, W, H) {
    const n = max(W, H), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n), INF = 1e20;
    const pass = (off, step, len) => { let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 0; q < len; q++) g[q] = f[off + q * step];
      for (let q = 1; q < len; q++) { let s; do { const p = v[k]; s = ((g[q] + q * q) - (g[p] + p * p)) / (2 * q - 2 * p); } while (s <= z[k] && --k >= 0); k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
      k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; f[off + q * step] = (q - p) * (q - p) + g[p]; } };
    for (let x = 0; x < W; x++) pass(x, W, H);
    for (let y = 0; y < H; y++) pass(y * W, 1, W);
    return f;
  }
  function grid(part, N) {
    const b = part.box, cs = max(b.w, b.h) / N, pad = 3, W = ceil(b.w / cs) + 2 * pad, H = ceil(b.h / cs) + 2 * pad, x0 = b.x - pad * cs, y0 = b.y - pad * cs;
    const G = { W, H, cs, x0, y0 };
    // a set of closed shapes filled, even-odd across the set, by scanline at cell centres
    const fill = (polys, into) => { const xs = [];
      for (let r = 0; r < H; r++) { const y = y0 + (r + 0.5) * cs; xs.length = 0;
        for (const p of polys) for (let i = 0, n = p.pts.length, j = n - 1; i < n; j = i++) { const a = p.pts[i], c = p.pts[j]; if ((a[1] > y) !== (c[1] > y)) xs.push((c[0] - a[0]) * (y - a[1]) / (c[1] - a[1]) + a[0]); }
        xs.sort((a, c) => a - c);
        for (let k = 0; k + 1 < xs.length; k += 2) { const c0 = max(0, ceil((xs[k] - x0) / cs - 0.5)), c1 = min(W - 1, floor((xs[k + 1] - x0) / cs - 0.5)); for (let c = c0; c <= c1; c++) into[r * W + c] ^= 1; } }
      return into; };
    const mask = new Uint8Array(W * H); for (const p of part.outer) { const m = fill([p], new Uint8Array(W * H)); for (let i = 0; i < m.length; i++) mask[i] |= m[i]; }   // islands are a union
    const imask = fill(part.inner, new Uint8Array(W * H)); for (let i = 0; i < imask.length; i++) imask[i] &= mask[i];
    // distance to the edge, in drawing units: positive inside
    const dist = (m) => { const a = new Float64Array(W * H), c = new Float64Array(W * H), out = new Float32Array(W * H);
      for (let i = 0; i < m.length; i++) { a[i] = m[i] ? 1e20 : 0; c[i] = m[i] ? 0 : 1e20; } edt(a, W, H); edt(c, W, H);
      for (let i = 0; i < m.length; i++) out[i] = (m[i] ? sqrt(a[i]) - 0.5 : -(sqrt(c[i]) - 0.5)) * cs; return out; };
    G.mask = mask; G.d = dist(mask); G.di = dist(imask);
    // distance to the nearest inner line (the strokes, and the edges of the inner shapes)
    const L = new Float64Array(W * H).fill(1e20); let any = false;
    for (const p of part.inner.concat(part.lines)) for (let i = 0, n = p.pts.length; i < (p.closed ? n : n - 1); i++) { const a = p.pts[i], c = p.pts[(i + 1) % n], len = hypot(c[0] - a[0], c[1] - a[1]), st = max(1, ceil(len / (cs * 0.5)));
      for (let k = 0; k <= st; k++) { const gx = floor((a[0] + (c[0] - a[0]) * k / st - x0) / cs), gy = floor((a[1] + (c[1] - a[1]) * k / st - y0) / cs); if (gx >= 0 && gy >= 0 && gx < W && gy < H) { L[gy * W + gx] = 0; any = true; } } }
    G.l = new Float32Array(W * H); if (any) { edt(L, W, H); for (let i = 0; i < L.length; i++) G.l[i] = sqrt(L[i]) * cs; } else G.l.fill(1e9);
    G.dmax = 0; for (let i = 0; i < G.d.length; i++) if (G.d[i] > G.dmax) G.dmax = G.d[i];
    return G;
  }
  // lap(u) = -1 inside, u = 0 outside: relaxed (red and black, over-relaxed), coarse first
  function poisson(G) {
    const { W, H, mask, cs } = G, u = new Float32Array(W * H);
    const w2 = ceil(W / 2), h2 = ceil(H / 2), m2 = new Uint8Array(w2 * h2), u2 = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) m2[y * w2 + x] = mask[min(H - 1, y * 2) * W + min(W - 1, x * 2)];
    const relax = (a, m, w, h, k, it, om) => { for (let n = 0; n < it; n++) for (let c = 0; c < 2; c++) for (let y = 1; y < h - 1; y++) for (let x = 1 + ((y + c) & 1); x < w - 1; x += 2) { const i = y * w + x; if (!m[i]) continue; a[i] += om * ((a[i - 1] + a[i + 1] + a[i - w] + a[i + w] + k) / 4 - a[i]); } };
    relax(u2, m2, w2, h2, 4, 260, 1.9);                                       // cells twice the size: the source is 4 in fine-cell units
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) u[y * W + x] = u2[min(h2 - 1, y >> 1) * w2 + min(w2 - 1, x >> 1)];
    relax(u, mask, W, H, 1, 120, 1.7);
    const out = new Float32Array(W * H); for (let i = 0; i < u.length; i++) out[i] = sqrt(2 * max(0, u[i])) * cs;
    return out;
  }
  const sample = (G, f, x, y) => { const gx = (x - G.x0) / G.cs - 0.5, gy = (y - G.y0) / G.cs - 0.5, ix = max(0, min(G.W - 2, floor(gx))), iy = max(0, min(G.H - 2, floor(gy))), tx = max(0, min(1, gx - ix)), ty = max(0, min(1, gy - iy)), i = iy * G.W + ix;
    return (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + G.W] * (1 - tx) + f[i + G.W + 1] * tx) * ty; };
  const smooth = (t) => { t = max(0, min(1, t)); return t * t * (3 - 2 * t); };

  // ---- the solid ----
  // a polyline with no step longer than s, its own corners kept
  function dense(p, s) { const out = [], n = p.pts.length, m = p.closed ? n : n - 1;
    for (let i = 0; i < m; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n], k = max(1, ceil(hypot(b[0] - a[0], b[1] - a[1]) / s)); for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
    if (!p.closed) out.push(p.pts[n - 1]); return out; }
  function build(part, o = {}) {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const mode = o.mode || "belly", thick = o.thick ?? 1, innerK = o.inner ?? 0.35, crease = o.crease ?? 0.5, res = o.res || 64;
    if (!part.outer.length) return { positions: new Float32Array(0), indices: new Uint32Array(0), lines: new Float32Array(0), size: 0, height: 0, tris: 0, verts: 0, ms: 0, empty: true };
    const GN = Math.max(48, Math.min(224, Math.round(o.grid || 224))), G = (part._grid && part._grid.N === GN) ? part._grid : (part._grid = Object.assign(grid(part, GN), { N: GN })), b = part.box, size = max(b.w, b.h), s = size / res, R = G.dmax || 1, edge = (o.edge ?? 0.04) * R;
    if (mode === "belly" && !G.p) G.p = poisson(G);
    const T = thick * R, gw = max(1.3 * G.cs, 0.045 * R), bw = max(2 * G.cs, 0.16 * R);
    // the true distance to the outline (the grid's is good to half a cell, which shows as terraces on a slope)
    const E = part._edges || (part._edges = (() => { const e = []; for (const p of part.outer) for (let i = 0, n = p.pts.length; i < n; i++) { const a = p.pts[i], c = p.pts[(i + 1) % n]; e.push(a[0], a[1], c[0] - a[0], c[1] - a[1], (c[0] - a[0]) * (c[0] - a[0]) + (c[1] - a[1]) * (c[1] - a[1]) || 1e-12); } return Float64Array.from(e); })());
    const toRim = (x, y) => { let m = 1e20; for (let i = 0; i < E.length; i += 5) { const px = x - E[i], py = y - E[i + 1], t = max(0, min(1, (px * E[i + 2] + py * E[i + 3]) / E[i + 4])), dx = px - t * E[i + 2], dy = py - t * E[i + 3], q = dx * dx + dy * dy; if (q < m) m = q; } return sqrt(m); };
    // the height above the rim at a point inside
    const height = (x, y) => { if (sample(G, G.d, x, y) <= 0) return 0; const d = toRim(x, y);
      let h = mode === "plate" ? 0.5 * T * smooth(d / max(2 * G.cs, 0.3 * R)) : mode === "blade" ? 0.62 * T * d / R : thick * sample(G, G.p, x, y);
      if (innerK && part.inner.length) { const di = sample(G, G.di, x, y); if (di > 0) h = max(0.2 * h, h + innerK * 0.3 * T * smooth(di / bw) * smooth(d / bw)); }
      if (crease) { const l = sample(G, G.l, x, y); h *= 1 - 0.55 * crease * exp(-(l * l) / (gw * gw)); }
      return h; };
    // points: the outline's own (the rim), the inner lines' own, and a hex grid between
    const pts = [], rim = [], cell = new Map(), key = (x, y) => round(x / (s * 0.4)) + "," + round(y / (s * 0.4));
    const add = (x, y, isRim) => { const k = key(x, y), had = cell.get(k); if (had !== undefined) return had; const i = pts.length; pts.push([x, y]); rim.push(isRim ? 1 : 0); cell.set(k, i); return i; };
    const loops = part.outer.map((p) => { const d = dense(p, s), ids = []; for (const q of d) { const i = add(q[0], q[1], true); if (ids[ids.length - 1] !== i) ids.push(i); } if (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop(); return ids; });
    for (const p of part.inner.concat(part.lines)) for (const q of dense(p, s)) if (sample(G, G.d, q[0], q[1]) > 0.35 * s) add(q[0], q[1], false);
    const near = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cell.has((round(x / (s * 0.4)) + dx) + "," + (round(y / (s * 0.4)) + dy))) return true; return false; };
    for (let r = 0, y = b.y; y <= b.y + b.h; y += s * 0.866, r++) for (let x = b.x + (r & 1 ? s / 2 : 0); x <= b.x + b.w; x += s) if (sample(G, G.d, x, y) > 0.45 * s && !near(x, y)) add(x, y, false);
    // holes: the closed shapes drawn inside the outline are cut through, if they are big enough to read as an opening
    const cut = o.holes ? part.inner.filter((p) => { const bb = boxOf([p]); return Math.min(bb.w, bb.h) > (o.holes === true ? 0.07 : o.holes) * size && bb.w * bb.h < 0.7 * b.w * b.h; }) : []; let cutTris = 0; const gone = [];
    const D = new window.Delaunator(Float64Array.from(pts.flat())), tri = D.triangles, keep = [];
    for (let i = 0; i < tri.length; i += 3) { const a = pts[tri[i]], c = pts[tri[i + 1]], e = pts[tri[i + 2]], cx = (a[0] + c[0] + e[0]) / 3, cy = (a[1] + c[1] + e[1]) / 3, d = sample(G, G.d, cx, cy);
      if (!(d > 1.5 * G.cs || (d > -1.5 * G.cs && part.outer.some((p) => inside(p.pts, cx, cy))))) continue;
      if (cut.length) { let in_ = false; for (const p of cut) if (inside(p.pts, cx, cy)) in_ = !in_; if (in_) { cutTris++; gone.push(tri[i], tri[i + 2], tri[i + 1]); continue; } }   // inside a hole (even-odd across the cut shapes)
      keep.push(tri[i], tri[i + 1], tri[i + 2]); }
    // front and back faces (y up, centred), then the wall round the rim
    const n = pts.length, cx = b.x + b.w / 2, cy = b.y + b.h / 2, pos = new Float32Array(n * 6), hs = new Float32Array(n); let top = 0;
    for (let i = 0; i < n; i++) { const h = rim[i] ? 0 : height(pts[i][0], pts[i][1]); hs[i] = h; top = max(top, h); const z = edge / 2 + h;
      pos[i * 3] = pts[i][0] - cx; pos[i * 3 + 1] = -(pts[i][1] - cy); pos[i * 3 + 2] = z; pos[(n + i) * 3] = pts[i][0] - cx; pos[(n + i) * 3 + 1] = -(pts[i][1] - cy); pos[(n + i) * 3 + 2] = -z; }
    // crease shading: how far the height field dips below its neighbours around a point (a crease, the foot of a raised inner shape)
    const ao = new Float32Array(n * 2), ar = max(1.5 * G.cs, 0.07 * R);
    for (let i = 0; i < n; i++) { if (rim[i]) { ao[i] = ao[n + i] = 1; continue; } const x = pts[i][0], y = pts[i][1];
      const lap = (height(x + ar, y) + height(x - ar, y) + height(x, y + ar) + height(x, y - ar)) / 4 - hs[i];
      ao[i] = ao[n + i] = max(0.35, min(1, 1 - 2.2 * max(0, lap) / max(1e-9, 0.12 * T + 0.5 * edge))); }
    const idx = [];
    for (let i = 0; i < keep.length; i += 3) { idx.push(keep[i], keep[i + 2], keep[i + 1]); idx.push(n + keep[i], n + keep[i + 1], n + keep[i + 2]); }   // the drawing's y is flipped, so the winding is too
    if (edge > 0) for (let li = 0; li < loops.length; li++) { const L = loops[li], sgn = area(part.outer[li].pts) > 0 ? 1 : -1; for (let k = 0; k < L.length; k++) { const a = L[k], c = L[(k + 1) % L.length]; if (sgn > 0) idx.push(a, c, n + a, c, n + c, n + a); else idx.push(a, n + a, c, c, n + a, n + c); } }
    // the wall round each hole: every edge the cut left open that is not the rim's own
    if (cutTris) { const seen = new Map(), ek = (p, q) => p < q ? p * n + q : q * n + p;
      for (let i = 0; i < keep.length; i += 3) for (let k = 0; k < 3; k++) { const p = keep[i + k], q = keep[i + (k + 1) % 3], key = ek(p, q); seen.set(key, seen.has(key) ? null : [p, q]); }
      for (const e of seen.values()) { if (!e || (rim[e[0]] && rim[e[1]])) continue; const p = e[0], q = e[1]; idx.push(p, q, n + q, p, n + q, n + p); } }
    // the drawing, lying on both faces: the outline on the rim, the inner lines on the surface
    const seg = [], lift = 0.004 * size;
    const lay = (p, onRim) => { const d = dense(p, s * 0.5); if (p.closed) d.push(d[0]);
      for (let i = 0; i + 1 < d.length; i++) { const a = d[i], c = d[i + 1], ha = onRim ? 0 : height(a[0], a[1]), hc = onRim ? 0 : height(c[0], c[1]); if (!onRim && (sample(G, G.d, a[0], a[1]) <= 0 || sample(G, G.d, c[0], c[1]) <= 0)) continue;
        for (const sg of [1, -1]) seg.push(a[0] - cx, -(a[1] - cy), sg * (edge / 2 + ha + lift), c[0] - cx, -(c[1] - cy), sg * (edge / 2 + hc + lift)); } };
    for (const p of part.outer) lay(p, true); for (const p of part.inner.concat(part.lines)) lay(p, false);
    return { positions: pos, indices: Uint32Array.from(idx), lines: Float32Array.from(seg), ao, cx, cy, edge: edge / 2, size, height: top + edge / 2, tris: idx.length / 3, verts: n * 2, holes: cutTris ? cut.length : 0, cutIndices: Uint32Array.from(gone), ms: typeof performance !== "undefined" ? performance.now() - t0 : 0 };
  }

  window.PartSolid = { read, build, paths, join };
})();
