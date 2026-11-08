#!/usr/bin/env node
// SVG -> Sigil Species mesh digitizer (dry run / validation tool, not wired into Sigil Species.html).
//
// Produces the fillV/fillI/lineV/lineI mesh fields of a SPECIES entry from an SVG's dark-fill
// plate shapes (mesh) and teal-stroke-only linework (lattice). Does NOT infer parts/partInfo
// (the finned skeleton) or cloud.fanA/B/C (the procedural particle formula) -- see README below.
//
// Usage: node svg-to-species.mjs <file.svg> [--fill "#2B292A"] [--stroke "#61E5BF"]

import fs from 'node:fs';

function parseArgs(argv) {
  const out = { file: null, fill: null, stroke: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fill') out.fill = argv[++i];
    else if (argv[i] === '--stroke') out.stroke = argv[++i];
    else if (!out.file) out.file = argv[i];
  }
  return out;
}

// ---------- minimal SVG path 'd' tokenizer/flattener ----------
// Supports M/m L/l H/h V/v C/c S/s Q/q T/t Z/z. Arcs (A/a) are approximated as straight lines
// to their endpoint (rare in this art; flag if seen).
function flattenPath(d, tolerance = 1.5) {
  const tokens = d.match(/[MLHVCSQTZmlhvcsqtz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0;
  const next = () => parseFloat(tokens[i++]);
  let cur = [0, 0], start = [0, 0];
  let lastCtrl = null; // for S/T reflection
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
    if (/[A-Za-z]/.test(t)) { lastCmd = t; i++; } // else repeat lastCmd (implicit)
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
      next(); next(); next(); next(); next(); // rx ry xrot large sweep
      const p = [next(), next()];
      lineTo(rel ? [cur[0] + p[0], cur[1] + p[1]] : p);
    } else if (C === 'Z') { lineTo(start); }
    else { i++; } // unknown token, skip
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
  // crude chord+control polygon length estimate, enough to pick a subdivision count
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return d(p0, p1) + d(p1, p2) + d(p2, p3);
}

// ---------- ear-clipping triangulation (simple polygons; even-odd holes via signed-area nesting) ----------
function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
function earClip(points) {
  // points: array of [x,y], simple (non-self-intersecting) polygon, any winding.
  const idx = points.map((_, i) => i);
  if (polyArea(points) < 0) idx.reverse(); // ensure CCW
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
    if (!clipped) break; // degenerate input; bail with whatever we have
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

// ---------- mesh assembly ----------
function buildFillMesh(shapes) {
  // shapes: array of subpaths (each an array of [x,y]), one shape per filled <path>.
  const verts = []; // x,y,part (part always 0 here -- see README)
  const indices = [];
  for (const poly of shapes) {
    const cleaned = dedupe(poly);
    if (cleaned.length < 3) continue;
    const base = verts.length / 3;
    for (const [x, y] of cleaned) verts.push(x, y, 0);
    const tris = earClip(cleaned);
    for (const [a, b, c] of tris) indices.push(base + a, base + b, base + c);
  }
  return { fillV: new Float32Array(verts), fillI: new Uint16Array(indices) };
}
function dedupe(poly) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-3) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-3) out.pop();
  return out;
}
function buildLineMesh(polylines, lineWidthUnits = 1) {
  // polylines: array of [x,y] chains (open or closed). Emits a line LIST (pairs), stride 5: x,y,nx,ny,part.
  const verts = []; const indices = [];
  for (const poly of polylines) {
    const pts = dedupe(poly);
    if (pts.length < 2) continue;
    const base = verts.length / 5;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
      const nx = ty, ny = -tx; // perpendicular, matches aNorm usage in FISH_VS
      verts.push(pts[i][0], pts[i][1], nx, ny, 0);
    }
    for (let i = 0; i < pts.length - 1; i++) indices.push(base + i, base + i + 1);
  }
  return { lineV: new Float32Array(verts), lineI: new Uint16Array(indices) };
}

function toB64(typedArray) { return Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength).toString('base64'); }

// ---------- SVG extraction ----------
// Classification is luminance-based, not exact-hex: real art (koi.svg) uses several near-black
// fill tints (#2B292A, #2A2F2A, #262A2C) for different plates, several teal strokes
// (#61E5BF bright, #367F6A dim) for linework, and a socket-orange fill (#FFB86B, no stroke) for
// attach-point markers. --fill/--stroke, if passed, are treated as an exact-match override on
// top of the heuristic (useful for simpler single-color SVGs).
function luminance(hex) {
  const h = hex.replace('#', '');
  if (h.length < 6) return null;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Resolve `fill="url(#id)"` / `stroke="url(#id)"` to a representative hex by reading the
// referenced <linearGradient>'s first <stop stop-color="...">. This repo's Figma-exported SVGs
// (butterfly-worm.svg) use gradients purely as a dark-plate-fill or teal-stroke tint (every
// gradient's first stop is either #2B292A-family or #61E5BF/#367F6A-family) -- so the first stop
// is a faithful stand-in for classification purposes, even though it loses the gradient itself
// (fine: the live renderer colors meshes from shader uniforms, not per-vertex SVG color -- see
// FILL_FS/LINE_FS in Sigil Species.html, confirmed by reading them: they mix fixed vec3 colors by
// a gradient-position/dimness varying, never sample anything derived from the source art's color).
function buildGradientMap(svgText) {
  const map = new Map();
  const re = /<linearGradient id="([^"]+)"[^>]*>\s*<stop stop-color="([^"]+)"/g;
  let m; while ((m = re.exec(svgText))) map.set(m[1], m[2]);
  return map;
}
function resolveColor(raw, gradientMap) {
  if (!raw) return 'NONE';
  const urlMatch = raw.match(/^url\(#([^)]+)\)$/i);
  if (urlMatch) return (gradientMap.get(urlMatch[1]) || 'NONE').toUpperCase();
  return raw.toUpperCase();
}

// Build id -> d (path data) for every element that carries both an id and a d, so <use
// xlink:href="#id">/<use href="#id"> can be inlined. None of this file's <use>/<path> elements
// carry a `transform`, so transform composition is intentionally NOT implemented -- if a future
// asset needs it, this is the place to add it (warn instead of silently mis-placing geometry).
function buildPathDefMap(svgText) {
  const map = new Map();
  const re = /<path\s+([^>]*?)\/?>/g;
  let m; while ((m = re.exec(svgText))) {
    const attrs = m[1];
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const dMatch = attrs.match(/\bd="([^"]+)"/);
    if (idMatch && dMatch) map.set(idMatch[1], dMatch[1]);
  }
  return map;
}

// `<mask>` in this asset wraps a duplicate `<use>` of a shape purely to clip its STROKE render
// (a Figma "inner stroke" idiom) -- it is never used to cut a hole in the FILL silhouette here.
// So geometry extraction below deliberately ignores `mask="url(...)"` attributes rather than
// implementing true hole-cutting: nothing is dropped because it's masked, which is the correct
// behavior for this file but would be WRONG for an asset that uses a mask to punch an actual hole
// (e.g. an eye ring) -- that case would need real hole support (even-odd nested-contour
// triangulation), which this script does not have. Flag any such shapes for manual review.
function extractShapes(svgText, fillColorOverride, strokeColorOverride, opts = {}) {
  const darkMax = opts.darkMax ?? 60;       // fill luminance below this = "plate" (mesh fill)
  const socketMin = opts.socketMin ?? 140;  // fill luminance above this with no stroke = socket marker, skip
  const gradientMap = buildGradientMap(svgText);
  const pathDefMap = buildPathDefMap(svgText);

  // Collect every drawable element (<path> anywhere, <use> anywhere) as {attrs, d}.
  const elements = [];
  const pathRe = /<path\s+([^>]*?)\/?>/g;
  let m;
  while ((m = pathRe.exec(svgText))) {
    const attrs = m[1];
    const dMatch = attrs.match(/\bd="([^"]+)"/);
    if (dMatch) elements.push({ attrs, d: dMatch[1] });
  }
  const useRe = /<use\s+([^>]*?)\/?>/g;
  let unresolvedUse = 0;
  while ((m = useRe.exec(svgText))) {
    const attrs = m[1];
    const hrefMatch = attrs.match(/\b(?:xlink:href|href)="#([^"]+)"/);
    if (!hrefMatch) continue;
    const d = pathDefMap.get(hrefMatch[1]);
    if (!d) { unresolvedUse++; continue; }
    elements.push({ attrs, d }); // <use>'s own fill/stroke attrs take precedence (it never inherits from the def here)
  }
  if (unresolvedUse) console.warn(`warning: ${unresolvedUse} <use> element(s) had no matching path id`);

  const fillShapes = []; const strokeLines = []; const skipped = { socket: 0, other: 0 };
  for (const { attrs, d } of elements) {
    const fillMatch = attrs.match(/\bfill="([^"]+)"/i);
    const strokeMatch = attrs.match(/\bstroke="([^"]+)"/i);
    const fill = resolveColor(fillMatch ? fillMatch[1] : null, gradientMap);
    const stroke = resolveColor(strokeMatch ? strokeMatch[1] : null, gradientMap);
    const { subpaths, sawArc } = flattenPath(d);
    if (sawArc) console.warn('warning: path has an arc command, approximated as a straight segment');

    const isFillOverride = fillColorOverride && fill === fillColorOverride.toUpperCase();
    const isStrokeOverride = strokeColorOverride && stroke === strokeColorOverride.toUpperCase();
    const lum = fill === 'NONE' ? null : luminance(fill);

    if (isFillOverride || (lum !== null && lum <= darkMax)) { fillShapes.push(...subpaths); continue; }
    if (fill === 'NONE' && (isStrokeOverride || stroke !== 'NONE')) { strokeLines.push(...subpaths); continue; }
    if (lum !== null && lum >= socketMin && stroke === 'NONE') { skipped.socket++; continue; } // socket/attach-point marker, not geometry
    skipped.other++;
  }
  return { fillShapes, strokeLines, skipped };
}

function main() {
  const { file, fill, stroke } = parseArgs(process.argv.slice(2));
  if (!file) { console.error('usage: node svg-to-species.mjs <file.svg> [--fill "#2B292A"] [--stroke "#61E5BF"]'); process.exit(1); }
  const svgText = fs.readFileSync(file, 'utf8');
  const vbMatch = svgText.match(/viewBox="([-\d.\s]+)"/);
  const { fillShapes, strokeLines, skipped } = extractShapes(svgText, fill, stroke);

  const { fillV, fillI } = buildFillMesh(fillShapes);
  const { lineV, lineI } = buildLineMesh(strokeLines);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < fillV.length; i += 3) { minX = Math.min(minX, fillV[i]); maxX = Math.max(maxX, fillV[i]); minY = Math.min(minY, fillV[i + 1]); maxY = Math.max(maxY, fillV[i + 1]); }

  const entry = {
    key: 'TODO', name: 'TODO', blurb: 'TODO',
    swim: { len: 1.0, waves: 0.9, amp: 1.0, ampPow: 1.6, bend: 1.0, fin: 0.21, lag: 0, sep: 1.0, speed: 1.0 },
    bounds: [minX, minY, maxX, maxY],
    parts: 1,
    partInfo: [0, 0, 0, 0, minY, maxY, 0, 0], // SINGLE whole-body group -- author real parts by hand, see README
    fillV: toB64(fillV), fillI: toB64(fillI),
    lineV: toB64(lineV), lineI: toB64(lineI),
    cloud: { head: [0, 0, 0, 0], body: [0, 0, 0, 0], wh: [0, 0, 0, 0], fanA: [], fanB: [], fanC: [] }, // TODO hand-author, see README
  };

  console.log(JSON.stringify({
    source: file, viewBox: vbMatch ? vbMatch[1] : null,
    fillShapeCount: fillShapes.length, strokeLineCount: strokeLines.length,
    fillVertCount: fillV.length / 3, fillTriCount: fillI.length / 3,
    lineVertCount: lineV.length / 5, lineSegCount: lineI.length / 2,
    skipped,
  }, null, 2));
  fs.writeFileSync(file.replace(/\.svg$/, '.species.json'), JSON.stringify(entry, null, 2));
  console.log('wrote', file.replace(/\.svg$/, '.species.json'));
}

main();

// ---------------------------------------------------------------------------
// README / limitations (read before using on ribbon-serpent or butterfly-worm):
//
// 1. This script only reproduces the MESH (fillV/fillI, lineV/lineI) -- the two fields that
//    are purely geometric. It does NOT reproduce:
//      - `parts`/`partInfo` (the finned skeleton: group/side/anchor/range/lag per moving part,
//        8 floats each -- see the group vocabulary below). It emits a single inert group-0
//        "whole body" placeholder so the output is at least structurally valid.
//      - `cloud.fanA/fanB/fanC` (+ head/body/wh) -- the hand-tuned procedural particle-fan
//        formula used by the "Cloud" render mode. These are NOT derived from art at all in the
//        existing species (confirmed by reading the CLOUD_VS shader): they are authored numbers
//        (root point, base/spread angle, ray count, length, wave, curl, row amp/offset per fan).
//        A new species needs these hand-written to taste; there is nothing to digitize here.
//    Both of the above require a human (or a follow-up authoring pass) using "Fish Part
//    Library (1).html" as the slot reference.
//
// 2. Group vocabulary (reverse-engineered from FISH_VS + Fish Part Library, confirmed against
//    koi's 26-part skeleton):
//      group 0 = body-wave piece, no independent sway. Mirrored pair -> "ribs"; side=0 center
//                piece -> "spine plate" (koi has 5, at shrinking scale down the body).
//      group 1 = body-wave piece, head area. side=0 -> head medallion (koi has 2 overlapping).
//                mirrored pair also seen at head -> likely eye ports (no koi blurb mention).
//      group 2 = WHISKER behavior (fin-branch): decaying sway, lag grows toward the tip
//                (smoothstep 0-300 distance falloff). Always mirrored pair.
//      group 3 = body-wave piece, tail area. Mirrored pair -> tail lobes (forked tail); side=0
//                -> tail spike/center plate.
//      group 4 = PECTORAL fin (fin-branch): amp 1.0, no phase offset -- "full strength".
//      group 5 = PELVIC fin (fin-branch): amp 0.75, phase offset 1.3 -- lags the pectorals.
//      group 6 = GILL fin (fin-branch): amp 0.5, phase offset 0.6 -- "half strength".
//      Groups >6 are used by other species (angler's lure/crest/fangs/wings per its blurb) but
//      were not decoded in this pass -- check those entries' partInfo directly before reusing.
//    Per-part 8 floats: [group, side(-1|0|1), ancX (lateral offset), ancY (position along spine,
//    same units as `bounds`), rangeLo, rangeHi (brightness-gradient band, also in spine-position
//    units), reserved (always 0 in koi except one single 1 -- meaning not identified), lag].
//
// 3. fillV stride is 3 floats (x, y, part-index); lineV stride is 5 (x, y, nx, ny, part-index) --
//    confirmed directly from makeVAO()'s gl.vertexAttribPointer calls, not inferred. `part-index`
//    selects which partInfo entry bends that vertex (FISH_VS: fins/whiskers rotate rigidly around
//    their anchor; everything else just follows the spine frame at its own y). This script writes
//    part-index 0 for every vertex (single group), so a digitized mesh will swim as one rigid
//    body-following blob until you hand-split vertices across real parts and re-tag them.
//
// 4. Plausibility check on koi.svg as the mesh's source: koi.svg has 63 <path> elements -- 12 with
//    fill="#2B292A" (dark plate fill) and 22 with stroke="#61E5BF" and no fill (teal linework).
//    12 fill shapes is close to koi's 13 unique part slots ("26 parts, mirrored" / 2 ≈ 13), which
//    is consistent with koi.svg being hand-drawn to mirror the mesh's plate structure (not proven,
//    but a reasonable working assumption for ribbon-serpent/butterfly-worm too).
//
// 5. Triangulation is ear-clipping on a single closed contour per filled path. It does NOT handle
//    holes (a ring/annulus shape, e.g. an eye ring, will triangulate wrong -- it'll fill the hole).
//    It does not merge multiple subpaths within one <path> d= attribute into a hole relationship;
//    each subpath triangulates independently, so a "shape with a hole" authored as two subpaths in
//    one path will double-fill rather than subtract. Fine for solid plates (most of koi's fills
//    looked like simple closed outlines); check any ring/eye/annulus shapes by hand.
//
// 6. Bezier flattening tolerance is fixed and coarse-ish (subdivision count from estimated chord
//    length / 1.5px / 8) -- fine for this scale of art but worth tightening if art is much larger
//    or has tight curves (whisker filament tips, claw hooks).
//
// 7. Validated on koi.svg only: ran clean, no exceptions, produced a plausible-shaped
//    bounds box and non-zero triangle/line counts (see the JSON stdout summary this script
//    prints). Not yet checked by actually loading the generated mesh in Sigil Species.html --
//    that would need temporarily swapping it in for a real species entry and eyeballing the
//    WebGL canvas, which this pass intentionally did not do (no edits to Sigil Species.html).
//
// Bottom line: use this to get a real, correctly-stride-formatted fillV/fillI/lineV/lineI quickly
// instead of hand-typing coordinates, then hand-author partInfo (skeleton) and cloud.fan* (particle
// formula) using the group vocabulary above and Fish Part Library as reference. Not production-
// ready as a one-shot "SVG in, finished finned species out" pipeline -- only the static mesh half
// of that is mechanical; the rigging and particle-formula half is still creative/manual work.
