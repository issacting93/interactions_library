// Pure geometry helpers lifted from svg-to-species.mjs (same tokenizer/triangulator/classifier),
// factored out so the rig pipeline can call them per-part instead of once over a whole file.
// See svg-to-species.mjs's own README comments for the documented limits of this heuristic
// (no true hole-cutting, luminance-based fill/stroke classification, etc) -- all still apply here.

export function flattenPath(d, tolerance = 1.5) {
  const tokens = d.match(/[MLHVCSQTZmlhvcsqtz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0;
  const next = () => parseFloat(tokens[i++]);
  let cur = [0, 0], start = [0, 0];
  let lastCtrl = null;
  let lastCmd = '';
  const subpaths = [];
  let poly = [];
  let sawArc = false;

  function moveTo(p) { if (poly.length > 1) subpaths.push(poly); poly = [p.slice()]; cur = p; start = p; }
  function lineTo(p) { poly.push(p.slice()); cur = p; }
  function cubic(p1, p2, p3) {
    const p0 = cur;
    const n = Math.max(2, Math.ceil(bezLen(p0, p1, p2, p3) / tolerance / 8));
    for (let t = 1; t <= n; t++) poly.push(bezPoint(p0, p1, p2, p3, t / n));
    cur = p3; lastCtrl = p2;
  }
  function quad(p1, p2) {
    const p0 = cur;
    const c1 = [p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1])];
    const c2 = [p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1])];
    cubic(c1, c2, p2);
    lastCtrl = p1;
  }

  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) { lastCmd = t; i++; }
    const rel = lastCmd === lastCmd.toLowerCase();
    const C = lastCmd.toUpperCase();
    if (C === 'M') { const p = [next(), next()]; moveTo(rel ? [cur[0] + p[0], cur[1] + p[1]] : p); }
    else if (C === 'L') { const p = [next(), next()]; lineTo(rel ? [cur[0] + p[0], cur[1] + p[1]] : p); }
    else if (C === 'H') { const x = next(); lineTo([rel ? cur[0] + x : x, cur[1]]); }
    else if (C === 'V') { const y = next(); lineTo([cur[0], rel ? cur[1] + y : y]); }
    else if (C === 'C') {
      let p1 = [next(), next()], p2 = [next(), next()], p3 = [next(), next()];
      if (rel) { p1 = [cur[0] + p1[0], cur[1] + p1[1]]; p2 = [cur[0] + p2[0], cur[1] + p2[1]]; p3 = [cur[0] + p3[0], cur[1] + p3[1]]; }
      cubic(p1, p2, p3);
    } else if (C === 'S') {
      let p2 = [next(), next()], p3 = [next(), next()];
      if (rel) { p2 = [cur[0] + p2[0], cur[1] + p2[1]]; p3 = [cur[0] + p3[0], cur[1] + p3[1]]; }
      const p1 = lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
      cubic(p1, p2, p3);
    } else if (C === 'Q') {
      let p1 = [next(), next()], p2 = [next(), next()];
      if (rel) { p1 = [cur[0] + p1[0], cur[1] + p1[1]]; p2 = [cur[0] + p2[0], cur[1] + p2[1]]; }
      quad(p1, p2);
    } else if (C === 'T') {
      let p2 = [next(), next()];
      if (rel) p2 = [cur[0] + p2[0], cur[1] + p2[1]];
      const p1 = lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
      quad(p1, p2);
    } else if (C === 'A') {
      sawArc = true;
      next(); next(); next(); next(); next();
      const p = [next(), next()];
      lineTo(rel ? [cur[0] + p[0], cur[1] + p[1]] : p);
    } else if (C === 'Z') { lineTo(start); }
    else { i++; }
  }
  if (poly.length > 1) subpaths.push(poly);
  return { subpaths, sawArc };
}
function bezPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
  const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
  return [x, y];
}
function bezLen(p0, p1, p2, p3) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return d(p0, p1) + d(p1, p2) + d(p2, p3);
}

function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
function earClip(points) {
  const idx = points.map((_, i) => i);
  if (polyArea(points) < 0) idx.reverse();
  const tris = [];
  const pt = i => points[idx[i]];
  function isConvex(a, b, c) { return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 0; }
  function pointInTri(p, a, b, c) {
    const s = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const d1 = s(a, b, p), d2 = s(b, c, p), d3 = s(c, a, p);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }
  let guard = 0;
  while (idx.length > 3 && guard++ < points.length * points.length) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = pt((i - 1 + idx.length) % idx.length), b = pt(i), c = pt((i + 1) % idx.length);
      if (!isConvex(a, b, c)) continue;
      let ear = true;
      for (let j = 0; j < idx.length; j++) {
        if (j === i || j === (i - 1 + idx.length) % idx.length || j === (i + 1) % idx.length) continue;
        if (pointInTri(pt(j), a, b, c)) { ear = false; break; }
      }
      if (ear) { tris.push([idx[(i - 1 + idx.length) % idx.length], idx[i], idx[(i + 1) % idx.length]]); idx.splice(i, 1); clipped = true; break; }
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

export function dedupe(poly) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-3) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-3) out.pop();
  return out;
}

// Triangulates one part's fill shapes. partIndex is written into every vertex's 3rd float
// (fillV stride 3: x,y,part) so the live shader can bend this part independently.
export function buildFillMesh(shapes, partIndex) {
  const verts = []; const indices = [];
  for (const poly of shapes) {
    const cleaned = dedupe(poly);
    if (cleaned.length < 3) continue;
    const base = verts.length / 3;
    for (const [x, y] of cleaned) verts.push(x, y, partIndex);
    const tris = earClip(cleaned);
    for (const [a, b, c] of tris) indices.push(base + a, base + b, base + c);
  }
  return { verts, indices };
}
// Builds one part's line/lattice mesh as a triangle RIBBON, not a GL_LINES list -- confirmed from
// Cybernetic Ecology.html's own runtime: lineV/lineI is drawn with `gl.TRIANGLES`, and its own
// buildOutline() fallback (used when a species ships no lineV at all) builds exactly this shape:
// per segment, 4 verts (both endpoints duplicated with +normal/-normal) and 6 indices (2 tris).
// The actual on-screen stroke WIDTH is applied later, in the vertex shader, via aNorm * uLineW --
// this mesh only needs correct per-vertex (x,y,nx,ny,part). svg-to-species.mjs's own buildLineMesh
// (which this was first copied from) predates that discovery and emits a 2-point-per-segment
// GL_LINES-style list instead -- harmless-looking (valid floats, non-zero index count) but
// silently wrong: fed through `gl.TRIANGLES`, 2-per-segment indices get regrouped in 3s into
// garbage/degenerate triangles that don't rasterize, AND (see fishPass's `sp.lineVAO.count === 0`
// filter) having ANY non-empty lineV at all disables that species' fill-plate draw too -- so a
// species built with the old format doesn't just get a broken outline, it renders nothing
// whatsoever, with no GL error anywhere to point at why.
// lineV stride 5: x,y,nx,ny,part.
export function buildLineMesh(polylines, partIndex) {
  const verts = []; const indices = [];
  for (const poly of polylines) {
    const pts = dedupe(poly);
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      let tx = bx - ax, ty = by - ay;
      const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
      const nx = -ty, ny = tx;
      const base = verts.length / 5;
      verts.push(ax, ay, nx, ny, partIndex, ax, ay, -nx, -ny, partIndex, bx, by, nx, ny, partIndex, bx, by, -nx, -ny, partIndex);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  return { verts, indices };
}

export function toB64(typedArray) { return Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength).toString('base64'); }

export function luminance(hex) {
  const h = hex.replace('#', '');
  if (h.length < 6) return null;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function buildGradientMap(svgText) {
  const map = new Map();
  const re = /<linearGradient id="([^"]+)"[^>]*>\s*<stop stop-color="([^"]+)"/g;
  let m; while ((m = re.exec(svgText))) map.set(m[1], m[2]);
  return map;
}
// A handful of these source files use CSS named colors ("black"/"white") instead of hex for real
// fill/stroke art (confirmed: Blade Hunter's claw/plate/leg paths, among others -- NOT the "plain
// white/black background rects" the comment below is about, which are separate <rect> elements).
// luminance() only understands 6-digit hex, so an unnormalized "BLACK"/"WHITE" silently fails its
// length check and falls through classify() to the 'skip' bucket -- the part parses fine, has real
// geometry, and simply never renders, with no error anywhere to point at why. Confirmed: this is
// exactly what made Blade Hunter's claws/legs and three of its plates vanish from Plated Scavenger
// and Strike Lance (both consumed those exact paths) while looking like "missing geometry" bugs in
// the recipes themselves.
const NAMED_COLORS = { BLACK: '#000000', WHITE: '#FFFFFF' };
export function resolveColor(raw, gradientMap) {
  if (!raw) return 'NONE';
  const urlMatch = raw.match(/^url\(#([^)]+)\)$/i);
  if (urlMatch) return (gradientMap.get(urlMatch[1]) || 'NONE').toUpperCase();
  const upper = raw.toUpperCase();
  return NAMED_COLORS[upper] || upper;
}

// Parses every top-level <path .../> in a source SVG, in document order -- this order is the
// "path index" addressing scheme used throughout the pipeline. MUST match the browser's
// querySelectorAll('path, use, rect, circle') combined document order exactly, index for index --
// that's how parts get visually identified (part-inspector.html labels each element by that same
// combined order) before being referenced by index in a recipe. A handful of these rig files mix
// in <rect> (confirmed: plain white/black background rects, not art -- Blade Hunter, koi, rogue-rig)
// and <use> (confirmed in butterfly-worm.svg: the VISIBLE geometry is almost entirely <use
// xlink:href="#strokeN_..."> elements referencing <path id="strokeN_..."> definitions that live
// inside <defs>, with the <use> tag's own fill overriding the def's) -- an earlier version of this
// function only matched top-level <path>, which silently mis-indexed every file with any <rect>/
// <use> in it (and, worse, a naive path-only regex over the raw text also picks up the <defs>-only
// path definitions themselves as if they were separate top-level elements, which
// querySelectorAll('path') does too since <defs> children are normal, matchable DOM nodes despite
// not being rendered -- so matching only <path> was ALSO wrong for files with no <use>/<rect> at
// all, coincidentally safe only when every real part remained below the first defs-internal path).
export function listDrawables(svgText) {
  const idMap = new Map(); // id -> {d, fill, stroke} for <path>/<rect>/<circle> with an id, for <use> resolution
  const tagRe = /<(path|use|rect|circle)\b([^>]*?)\/?>/g;
  const raw = [];
  let m;
  while ((m = tagRe.exec(svgText))) {
    const [, tag, attrs] = m;
    raw.push({ tag, attrs });
  }
  function attr(attrs, name) {
    const m2 = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
    return m2 ? m2[1] : null;
  }
  function rectToD(attrs) {
    const x = parseFloat(attr(attrs, 'x') || '0'), y = parseFloat(attr(attrs, 'y') || '0');
    const w = parseFloat(attr(attrs, 'width') || '0'), h = parseFloat(attr(attrs, 'height') || '0');
    return `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;
  }
  function circleToD(attrs) {
    const cx = parseFloat(attr(attrs, 'cx') || '0'), cy = parseFloat(attr(attrs, 'cy') || '0'), r = parseFloat(attr(attrs, 'r') || '0');
    const N = 24, pts = [];
    for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; pts.push(`${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`); }
    return 'M' + pts.join('L') + 'Z';
  }
  // first pass: resolve every id-bearing path/rect/circle's own d (for <use> targets, incl. inside <defs>)
  for (const { tag, attrs } of raw) {
    const id = attr(attrs, 'id');
    if (!id || tag === 'use') continue;
    const d = tag === 'path' ? attr(attrs, 'd') : tag === 'rect' ? rectToD(attrs) : circleToD(attrs);
    idMap.set(id, { d, fill: attr(attrs, 'fill'), stroke: attr(attrs, 'stroke') });
  }
  // second pass: build the combined-order drawable list with {d, fill, stroke} uniformly resolved
  return raw.map(({ tag, attrs }) => {
    if (tag === 'path') return { d: attr(attrs, 'd'), fill: attr(attrs, 'fill'), stroke: attr(attrs, 'stroke') };
    if (tag === 'rect') return { d: rectToD(attrs), fill: attr(attrs, 'fill'), stroke: attr(attrs, 'stroke') };
    if (tag === 'circle') return { d: circleToD(attrs), fill: attr(attrs, 'fill'), stroke: attr(attrs, 'stroke') };
    // use: href (or legacy xlink:href) -> id lookup; the <use> tag's own fill/stroke win when present
    const href = attr(attrs, 'xlink:href') || attr(attrs, 'href') || '';
    const refId = href.replace(/^#/, '');
    const ref = idMap.get(refId);
    if (!ref) return { d: null, fill: attr(attrs, 'fill'), stroke: attr(attrs, 'stroke') };
    const dx = parseFloat(attr(attrs, 'x') || '0'), dy = parseFloat(attr(attrs, 'y') || '0');
    const d = (dx || dy) && ref.d ? ref.d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_, c, x, y) => `${c}${parseFloat(x) + dx} ${parseFloat(y) + dy}`) : ref.d;
    return { d, fill: attr(attrs, 'fill') ?? ref.fill, stroke: attr(attrs, 'stroke') ?? ref.stroke };
  });
}
export function pathAttrs(drawable) {
  return { d: drawable.d, fill: drawable.fill, stroke: drawable.stroke };
}

// Classifies ONE already-flattened path's subpaths into fillShapes / strokeLines, same heuristic
// as svg-to-species.mjs's extractShapes (luminance-based; darkMax/socketMin identical defaults).
export function classify(subpaths, fill, stroke, gradientMap, opts = {}) {
  const darkMax = opts.darkMax ?? 60;
  const socketMin = opts.socketMin ?? 140;
  const fillC = resolveColor(fill, gradientMap);
  const strokeC = resolveColor(stroke, gradientMap);
  const lum = fillC === 'NONE' ? null : luminance(fillC);
  // svg-to-species.mjs's original heuristic (dark-fill-plate vs fill:none-with-stroke-linework)
  // assumes every rig uses a near-black plate fill -- true for koi/puffer/hunter/etc, but some
  // species (Bead Siphon, confirmed by reading its source) use a LIGHT fill (#D7DBE0) alongside
  // the same teal stroke instead. Since this pipeline only ever emits ribbon-line geometry (see
  // rig.mjs), any element with a real stroke is usable regardless of its fill's luminance --
  // checked first, so a light-fill+stroke shape doesn't fall through to 'skip'.
  if (strokeC !== 'NONE') return { bucket: 'line', subpaths };
  if (lum !== null && lum <= darkMax) return { bucket: 'fill', subpaths };
  if (lum !== null && lum >= socketMin && strokeC === 'NONE') return { bucket: 'socket', subpaths };
  return { bucket: 'skip', subpaths };
}
