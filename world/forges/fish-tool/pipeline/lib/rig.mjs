// Turns a parts manifest (which real path, from which source creature, plays which anatomical
// role) into a complete rigged SPECIES entry matching Cybernetic Ecology.html's live wire format:
// fillV/fillI/lineV/lineI (base64 meshes, now correctly part-tagged per vertex instead of the
// single inert group-0 blob svg-to-species.mjs produced), partTex (16 floats/part: group, side,
// anchor xy | rangeLo, rangeHi | beatAmp, phaseOffset, parentIdx, spineY | 4 keyed-pose floats),
// ids, counts, bounds, swim, cloud, weight.
//
// Reverse-engineered directly from Cybernetic Ecology.html's FISH_VS shader + species-prep code
// (not from svg-to-species.mjs's older/incomplete partInfo doc, which predates this 4-texel format).
// What this auto-generates vs. what it still only defaults, honestly:
//   MECHANICAL (derived from real geometry): fillV/fillI/lineV/lineI, bounds, counts, ids,
//     group/side (from the manifest), anchor point (nearest-vertex-to-rig-center), range (part's
//     own y-extent).
//   DEFAULTED, not hand-tuned (same conclusion svg-to-species.mjs's README already reached for the
//     old format -- still true here): beatAmp/phaseOffset for rigid parts, swim profile, cloud
//     particle-fan formula. These won't look broken, but they weren't art-directed either.

import fs from 'node:fs';
import path from 'node:path';
import {
  flattenPath, buildFillMesh, buildLineMesh, toB64, buildGradientMap,
  listDrawables, pathAttrs, classify,
} from './svg-extract.mjs';

const svgCache = new Map();
function loadSvg(sourceDir, file) {
  const key = path.join(sourceDir, file);
  if (!svgCache.has(key)) svgCache.set(key, fs.readFileSync(key, 'utf8'));
  return svgCache.get(key);
}

// Reference SVGs are drawn at their own small, per-file viewBox scale -- but live SPECIES meshes
// are NOT authored in raw SVG units; each source was independently scaled up into the sim's
// internal "world units" at authoring time. Ratio = that species' live LEN (bounds[3]-bounds[1])
// over its own reference SVG's viewBox height, read directly out of the shipped
// Cybernetic Ecology.html (not a single universal constant -- it varies file to file):
//   koi 7364.3/534=13.79  worm(butterfly-worm) 7364.3/583=12.63  manta(Glass Manta) 7364.3/560=13.15
//   hunter(Blade Hunter) 9669/620=15.60  angler(Lantern Angler) 6313/462=13.66
//   puffer(Blade Puffer) 3453.7/291=11.87  dragon(winged-dragon) 8866.1/670=13.23
//   jelly(BELL JELLY) 4060.9/343=11.84
// rogue-rig.svg/serpent-rig.svg/eel-rig.svg/Bead Siphon.svg are a different family: their own
// viewBox is ALREADY authored in near-world-scale coordinates (ratio ~0.92-0.96, i.e. close to 1):
//   rogue-rig 12559/13160=0.954  serpent-rig 11223.9/12144=0.924  eel-rig 13319.6/14237=0.936
//   Bead Siphon 7248.8/7683.9=0.943
// A composite built straight from raw path coordinates with no scaling ends up ~10-30x too small
// to see or to frame correctly (FOLLOW camera and body-length-relative logic both key off LEN) --
// every part defaults to its source file's ratio here unless the manifest overrides `transform.scale`.
const SOURCE_SCALE = {
  'koi.svg': 13.79, 'butterfly-worm.svg': 12.63, 'Glass Manta.svg': 13.15,
  'Blade Hunter.svg': 15.60, 'Lantern Angler.svg': 13.66, 'Blade Puffer.svg': 11.87,
  'winged-dragon.svg': 13.23, 'BELL JELLY.svg': 11.84,
  'rogue-rig.svg': 0.954, 'serpent-rig.svg': 0.924, 'eel-rig.svg': 0.936, 'Bead Siphon.svg': 0.943,
};

// Species Forge exports parts as `inline: { d, matrix }` -- real path data straight out of its own
// RIG library, already placed by its own box-fitting assembler into a full 2x3 affine (so it can
// carry rotation, e.g. a forked branch), already multiplied by that recipe's frame-root world scale.
// No source file, no SOURCE_SCALE lookup -- the matrix alone takes local part space to final world units.
function transformPoint([x, y], m) {
  if (m.inline) {
    const [a, b, c, d, e, f] = m.inline.matrix;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  const t = m.transform;
  const s = t?.scale ?? SOURCE_SCALE[m.source] ?? 1;
  const dx = t?.dx ?? 0, dy = t?.dy ?? 0;
  return [x * s + dx, y * s + dy];
}

const GROUP = { plate: 0, head: 1, whisker: 2, tail: 3, leg: 4, fin: 4, eye: 1 };
// whisker (group 2) is rigid/lag-sway in the live shader same as leg/fin (group 4) -- included here
// so Forge-bred creatures using manta's whisker parts get a real anchor+sway instead of sitting inert.
const RIGID_ROLES = new Set(['leg', 'fin', 'whisker']);

// Shared pass-1: flatten + classify every manifest entry into its own fill/line subpaths, in final
// (already-transformed, already-source-scaled, already-recentered) canvas coordinates, with each
// part's own point cloud for bbox/anchor. Each part scales by ITS OWN source file's ratio
// (SOURCE_SCALE above) by default, so a recipe can freely mix parts pulled from differently-scaled
// source rigs (e.g. Blade Hunter's small reference art alongside rogue-rig's already-world-scale
// one) without every part landing at the wrong relative size. Used by both buildSpecies (the live
// rigged mesh) and renderStaticSVG (the flat reference sigil) so the two never drift apart.
export function computeParts(recipe, sourceDir) {
  const { partsManifest } = recipe;
  const gradientMapCache = new Map();
  const drawableCache = new Map();
  const parts = partsManifest.map((m, i) => {
    let d, fill, stroke, bucket;
    if (m.inline) {
      // Forge parts are already resolved to pure stroke-only sigil geometry (same convention this
      // pipeline already settled on for every part -- see the ribbon-line note in buildSpecies below),
      // so there's no fill/stroke to classify: skip straight to flatten+place.
      d = m.inline.d;
      bucket = 'line';
    } else {
      const svgText = loadSvg(sourceDir, m.source);
      if (!gradientMapCache.has(m.source)) gradientMapCache.set(m.source, buildGradientMap(svgText));
      if (!drawableCache.has(m.source)) drawableCache.set(m.source, listDrawables(svgText));
      const drawables = drawableCache.get(m.source);
      const drawable = drawables[m.pathIndex];
      if (!drawable) throw new Error(`${m.source}: no drawable at index ${m.pathIndex} (part "${m.id}"), only ${drawables.length} present`);
      ({ d, fill, stroke } = pathAttrs(drawable));
      if (!d) throw new Error(`${m.source}: drawable at index ${m.pathIndex} (part "${m.id}") has no resolvable d (unresolved <use> href?)`);
    }
    const { subpaths, sawArc } = flattenPath(d);
    if (sawArc) console.warn(`warning: ${m.id} (${m.inline ? 'inline' : m.source + '#' + m.pathIndex}) has an arc, approximated`);
    const placed = subpaths.map(poly => poly.map(p => transformPoint(p, m)));
    if (!m.inline) {
      // classify()'s luminance heuristic reads a bright, strokeless fill as a Figma attach-point
      // marker (bucket 'socket') and drops it -- right for most of this art, but wrong for a source
      // file that legitimately uses white as a real fill colour (confirmed: butterfly-worm.svg's
      // outer wing-fan layers and eye-marks are fill="white" with no stroke, by design, not markers).
      // `forceBucket` is the recipe-author's escape hatch for exactly that case -- skip the heuristic
      // and say what this part actually is, the same way `inline` already skips it entirely.
      bucket = m.forceBucket || classify(subpaths, fill, stroke, gradientMapCache.get(m.source)).bucket;
    }
    const allPts = placed.flat();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of allPts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    return { manifest: m, index: i, bucket, subpaths: placed, bbox: [minX, minY, maxX, maxY] };
  });

  // rig center: bbox-center of every non-rigid (body-wave) part, i.e. the shell/body plates --
  // the point rigid parts (legs/fins) anchor toward.
  const bodyParts = parts.filter(p => !RIGID_ROLES.has(p.manifest.role));
  let cx = 0, cy = 0, bodyPts = [];
  for (const p of bodyParts) bodyPts.push([(p.bbox[0] + p.bbox[2]) / 2, (p.bbox[1] + p.bbox[3]) / 2]);
  if (bodyPts.length) { cx = bodyPts.reduce((a, p) => a + p[0], 0) / bodyPts.length; cy = bodyPts.reduce((a, p) => a + p[1], 0) / bodyPts.length; }

  // Re-center x on the rig's own spine centerline. This is NOT cosmetic: the live shader treats a
  // non-rigid vertex's raw x as a LATERAL OFFSET FROM THE SPINE, added directly with no extra
  // offset-correction (`w = P + L*p.x*sc + ...`), the way bounds[1]/BY0 corrects y. Confirmed by
  // decoding koi's own live fillV: its x spans -1658..+1653 (centered on 0), y spans 150..7514
  // (head-to-tail, NOT centered). A composite built from raw SVG path coordinates (e.g. Blade
  // Puffer's own viewBox is 0..268, centered near x=134) renders every vertex shifted sideways by
  // that offset *and* by `worldScale` -- thousands of units off from where the boid/camera thinks
  // the body is -- which is why an un-recentered creature is mechanically present (real geometry,
  // no GL errors) but never actually visible on screen.
  for (const p of parts) {
    p.subpaths = p.subpaths.map(poly => poly.map(([x, y]) => [x - cx, y]));
    p.bbox = [p.bbox[0] - cx, p.bbox[1], p.bbox[2] - cx, p.bbox[3]];
  }
  return { parts, cx: 0, cy };
}

export function buildSpecies(recipe, sourceDir) {
  const { key, name, blurb, ecology = {}, swim, weight = 1 } = recipe;
  const { parts, cx, cy } = computeParts(recipe, sourceDir);

  // pass 2: build meshes (part-tagged) + partTex rig row per part.
  let fillV = [], fillI = [], lineV = [], lineI = [];
  const partTex = [];
  const ids = [];
  const legsByPhaseSlot = new Map();
  for (const p of parts) {
    const role = p.manifest.role;
    const group = GROUP[role] ?? 0;
    const side = p.manifest.side ?? 0;
    const rigid = RIGID_ROLES.has(role);

    // Every part becomes ribbon LINE geometry, closed-loop (last point rejoins the first), never
    // triangulated fill. Confirmed from the live renderer's own fishPass: the SIGIL fill draw is
    // filtered to `sp.lineVAO.count === 0` -- i.e. fill is a fallback for the 3 species (jelly,
    // puffer, dragon) that ship NO line mesh at all, not something that layers on top of one. A
    // species with any line geometry renders via its ribbon mesh alone; what reads as a "filled"
    // plate in the real species is dense overlapping ribbon strokes, not a solid fill pass. This
    // also matches the green-stroke/no-fill look already used throughout the rest of the Codex.
    if (p.bucket !== 'skip' && p.bucket !== 'socket') {
      const closedLoops = p.subpaths.map(poly => (poly.length > 1 ? [...poly, poly[0]] : poly));
      const { verts, indices } = buildLineMesh(closedLoops, p.index);
      const base = lineV.length / 5;
      lineV = lineV.concat(verts);
      lineI = lineI.concat(indices.map(ix => ix + base));
    }

    const [minX, minY, maxX, maxY] = p.bbox;
    const centroidY = (minY + maxY) / 2;

    let ancX, ancY, beatAmp, phaseOffset, parentIdx = -1;
    if (rigid) {
      // anchor = this part's own point nearest the rig center -- its real attach point to the body.
      let best = null, bestD = Infinity;
      for (const sp of p.subpaths) for (const pt of sp) {
        const d = Math.hypot(pt[0] - cx, pt[1] - cy);
        if (d < bestD) { bestD = d; best = pt; }
      }
      [ancX, ancY] = best || [(minX + maxX) / 2, (minY + maxY) / 2];
      const slot = p.manifest.phaseSlot ?? 0;
      if (!legsByPhaseSlot.has(slot)) legsByPhaseSlot.set(slot, legsByPhaseSlot.size);
      const slotOrder = legsByPhaseSlot.get(slot);
      beatAmp = (p.manifest.beatAmp ?? 0.18) * (side < 0 ? 1 : -1); // mirror the swing direction L/R
      phaseOffset = p.manifest.phaseOffset ?? (slotOrder * (Math.PI * 2 / Math.max(1, legsByPhaseSlot.size || 1)));
    } else {
      ancX = (minX + maxX) / 2; ancY = centroidY;
      beatAmp = 0; phaseOffset = 0;
    }
    const spineY = ancY;
    const rangeLo = minY, rangeHi = maxY;

    partTex.push(
      group, side, ancX, ancY,
      rangeLo, rangeHi, 0, 0,
      beatAmp, phaseOffset, parentIdx, spineY,
      0, 0, 0, 0, // keyed pose: none authored, uKeyN handles this as "no pose" at runtime
    );
    const sideLetter = side < 0 ? 'L' : side > 0 ? 'R' : 'C';
    ids.push(`${key}-${String(p.index).padStart(2, '0')}-${role}-${sideLetter}`);
  }

  const allX = [], allY = [];
  for (let i = 0; i < fillV.length; i += 3) { allX.push(fillV[i]); allY.push(fillV[i + 1]); }
  for (let i = 0; i < lineV.length; i += 5) { allX.push(lineV[i]); allY.push(lineV[i + 1]); }
  const bounds = [Math.min(...allX), Math.min(...allY), Math.max(...allX), Math.max(...allY)];

  const fillVf = new Float32Array(fillV), fillIf = new Uint16Array(fillI);
  const lineVf = new Float32Array(lineV), lineIf = new Uint16Array(lineI);

  return {
    key, name, blurb,
    swim: swim || { len: 1.0, waves: 0.9, amp: 1.0, ampPow: 1.6, bend: 1.0, fin: 0.21, lag: 0, sep: 1.0, speed: 1.0 },
    bounds, parts: parts.length,
    partTex,
    fillV: toB64(fillVf), fillI: toB64(fillIf),
    lineV: toB64(lineVf), lineI: toB64(lineIf),
    ids, keyT: [],
    cloud: { head: [0, 0, 0, 0], body: [0, 0, 0, 0], wh: [0, 0, 0, 0], nFan: 0, fanA: [], fanB: [], fanC: [] },
    counts: { fillVerts: fillVf.length / 3, lineVerts: lineVf.length / 5 },
    weight,
    _ecology: ecology, // consumed by register.mjs, not part of the live SPECIES schema
  };
}

// Renders the SAME parts (same computeParts pass used by the live rig) as a flat, standalone
// reference-sigil SVG: green stroke, no fill, matching the rest of the Codex's sigil-species-rig-
// svgs/mono/*.svg files -- so a species built by this pipeline gets a real static image instead of
// the "Design only" placeholder, using the exact same geometry the live tank swims, not a redrawn
// approximation of it.
export function renderStaticSVG(recipe, sourceDir, opts = {}) {
  const { parts } = computeParts(recipe, sourceDir);
  const stroke = opts.stroke ?? '#5FD38D';
  const pad = opts.pad ?? 0.08;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of parts) {
    const [a, b, c, d] = p.bbox;
    minX = Math.min(minX, a); minY = Math.min(minY, b); maxX = Math.max(maxX, c); maxY = Math.max(maxY, d);
  }
  const w = maxX - minX, h = maxY - minY;
  const padX = w * pad, padY = h * pad;
  const vbX = minX - padX, vbY = minY - padY, vbW = w + padX * 2, vbH = h + padY * 2;
  const strokeWidth = Math.max(vbW, vbH) * 0.004;

  // No vector-effect="non-scaling-stroke" here -- that keeps a stroke at a fixed PIXEL width
  // regardless of how much the SVG itself is scaled down for display (it's meant for the live
  // rig's instancing, where creatures share one shader uniform despite wildly different internal
  // viewBox scales). On a lone static image sized down for a thumbnail, non-scaling-stroke makes
  // the stroke width stay fixed while the shape shrinks around it, until the stroke is wider than
  // the shape and every part reads as a solid blob instead of a thin outline. A normal (scaling)
  // stroke shrinks together with the shape, which is what a flat reference image needs.
  const pathEls = parts.filter(p => p.bucket !== 'skip' && p.bucket !== 'socket').map(p => {
    const d = p.subpaths
      .filter(poly => poly.length > 1)
      .map(poly => 'M' + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z')
      .join(' ');
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(2)}"/>`;
  });

  return `<svg width="${Math.round(vbW)}" height="${Math.round(vbH)}" viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" fill="none" xmlns="http://www.w3.org/2000/svg">
${pathEls.join('\n')}
</svg>
`;
}
