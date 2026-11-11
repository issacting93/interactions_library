#!/usr/bin/env node
// Keeps recipe swimmers in step with the parts kit after a shape swap (shared/engine/creature-catalog/swap_shapes.py).
//
// A swimmer's recipe holds its own copy of each drawing, so a part redrawn in the kit stays as the old
// drawing in the water. This finds, for every swapped kit part, the recipe part that is the old drawing
// (same outline, same place on the creature), and writes the new drawing for it to recipes/kit-swaps.json,
// fitted to the old part's place and size. run.mjs applies that file when it builds a recipe, so the
// recipe files themselves, the part order, roles, sides and motion stay as they are.
//
//   node kit-sync.mjs                 # every recipe listed in SHEET_OF; writes recipes/kit-swaps.json
//   node run.mjs recipes/<name>.mjs   # then re-bake each swimmer it lists
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformPoint } from './lib/rig.mjs';
import { flattenPath, listDrawables, pathAttrs } from './lib/svg-extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const SOURCE_DIR = path.resolve(HERE, '..', 'sigil-species-rig-svgs');
const KIT = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/data/creature-parts.json'), 'utf8'));
const ORIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/data/kit-sources/replaced-parts.json'), 'utf8')).parts;
const LIMIT = 0.035;   // mean outline distance, as a share of the part's longest side, under which two drawings are the same

// recipe file -> kit sheet
export const SHEET_OF = {
  'plated-scavenger': 'sheet-plated-scavenger', 'abyssal-lance-swift': 'abyssal-lance-swift',
  'crowned-sickle-lancer': 'crowned-sickle-lancer', 'halo-eyed-seraph': 'halo-eyed-seraph',
  'ringed-lance-swift': 'ringed-lance-swift', 'ringed-lance-swift-mk2': 'ringed-lance-swift-mk-ii',
  'ophan-halo-monarch': 'ophan-halo-monarch', 'ringed-lance-monarch': 'ringed-lance-monarch',
  'carapace-strider': 'sheet-carapace-strider', 'glass-star': 'sheet-glass-star',
  '../../sigil-species-rig-svgs/dragon-winged-worm-ed95': 'sheet-dragon-winged-worm',
};

const dsOf = svg => [...svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);
function outline(polys, n = 160) {
  // n points spread evenly along the outline, in a box-normalised frame (centre 0, longest side 1)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const [x, y] = poly[i]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (i) len += Math.hypot(x - poly[i - 1][0], y - poly[i - 1][1]);
  }
  const L = Math.max(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, step = len / n, pts = [];
  let acc = 0;
  for (const poly of polys) for (let i = 1; i < poly.length; i++) {
    const [ax, ay] = poly[i - 1], [bx, by] = poly[i]; const seg = Math.hypot(bx - ax, by - ay);
    while (acc <= seg && seg > 0) { const t = acc / seg; pts.push([(ax + (bx - ax) * t - cx) / L, (ay + (by - ay) * t - cy) / L]); acc += step; }
    acc -= seg;
  }
  return { pts, box: [x0, y0, x1, y1], L, cx, cy };
}
function gap(a, b) {
  const one = (p, q) => p.reduce((s, [x, y]) => s + Math.sqrt(q.reduce((m, [u, v]) => Math.min(m, (x - u) ** 2 + (y - v) ** 2), Infinity)), 0) / p.length;
  return (one(a, b) + one(b, a)) / 2;
}
const flat = ds => ds.flatMap(d => flattenPath(d, 0.3).subpaths);
// A swimmer's line mesh is indexed with 16 bits (65,535 vertices, four per segment), and the new drawings
// are far finer than a swimmer shows. Drop points that move the outline by less than `eps`.
function simplify(poly, eps) {
  if (poly.length < 4) return poly;
  const keep = new Uint8Array(poly.length); keep[0] = keep[poly.length - 1] = 1;
  // a closed outline starts and ends on one point: split it at the point farthest from there first
  let far0 = 0, d0 = 0;
  for (let i = 1; i < poly.length - 1; i++) { const dd = Math.hypot(poly[i][0] - poly[0][0], poly[i][1] - poly[0][1]); if (dd > d0) { d0 = dd; far0 = i; } }
  keep[far0] = 1;
  const stack = [[0, far0], [far0, poly.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); const [ax, ay] = poly[a], [bx, by] = poly[b]; const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, most = eps;
    for (let i = a + 1; i < b; i++) { const dd = Math.abs((poly[i][0] - ax) * (by - ay) - (poly[i][1] - ay) * (bx - ax)) / len; if (dd > most) { most = dd; far = i; } }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return poly.filter((_, i) => keep[i]);
}
const lean = (ds, eps) => flat(ds).map(p => simplify(p, eps)).filter(p => p.length > 2).map(p => 'M' + p.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join(' L') + ' Z').join(' ');

export async function sync(recipeName) {
  const recipe = (await import(pathToFileURL(path.resolve(HERE, 'recipes', recipeName + '.mjs')).href)).default;
  const sheet = SHEET_OF[recipeName];
  const swapped = KIT.filter(p => p.species === sheet && ORIG[p.id] && String(p.from || '').startsWith('new-shapes.svg#'));
  const drawables = {};
  const mine = recipe.partsManifest.map(m => {
    let d = m.inline?.d;
    if (!d) {
      drawables[m.source] ??= listDrawables(fs.readFileSync(path.join(SOURCE_DIR, m.source), 'utf8'));
      d = pathAttrs(drawables[m.source][m.pathIndex]).d;
    }
    return { m, o: outline(flattenPath(d).subpaths.map(poly => poly.map(p => transformPoint(p, m)))) };
  });
  const all = mine.map(x => x.o.box);
  const W = [Math.min(...all.map(b => b[0])), Math.min(...all.map(b => b[1])), Math.max(...all.map(b => b[2])), Math.max(...all.map(b => b[3]))];
  const axis = (W[0] + W[2]) / 2, span = Math.max(W[2] - W[0], W[3] - W[1]);
  const out = {}, report = [];
  for (const part of swapped) {
    const old = ORIG[part.id];
    const ox = +old.ox, oy = +old.oy;
    const oldPolys = flat(dsOf(old.svg));
    for (const flip of old.side === 'left' ? [1, -1] : [1]) {
      const ref = outline(oldPolys.map(poly => poly.map(([x, y]) => [flip < 0 ? 400 - x : x, y])));
      // the old drawing in this recipe: same outline; among equals, the one whose side of the axis agrees
      let best = null;
      for (const x of mine) {
        if (out[x.m.id]) continue;
        const g = gap(ref.pts, x.o.pts);
        if (g > LIMIT) continue;
        const sideOk = old.side === 'center' || Math.sign(x.o.cx - axis) === Math.sign(ref.cx - 200) || Math.abs(x.o.cx - axis) < 0.01 * span;
        const score = g + (sideOk ? 0 : 1);
        if (!best || score < best.score) best = { x, g, score };
      }
      if (!best || best.score >= 1) { report.push(`  ${part.id}${flip < 0 ? ' (right)' : ''}: not in this recipe`); continue; }
      const { x } = best, s = x.o.L / ref.L;
      const sx = flip * s, f = x.o.cy - s * oy;
      // new drawing: sheet coords, centred on (ox, oy) like the old one -> the recipe part's own centre and size
      out[x.m.id] = { kit: part.id, shape: part.from.split('#')[1], d: lean(dsOf(part.svg), 0.004 * Math.max(+part.w, +part.h)),
                      matrix: [+sx.toFixed(5), 0, 0, +s.toFixed(5), +(flip < 0 ? x.o.cx + s * ox : x.o.cx - s * ox).toFixed(2), +f.toFixed(2)] };
      report.push(`  ${part.id}${flip < 0 ? ' (right)' : ''} -> ${x.m.id}  (${part.from.split('#')[1]}, outline gap ${best.g.toFixed(3)})`);
    }
  }
  return { out, report, swapped: swapped.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = {};
  for (let name of Object.keys(SHEET_OF)) {
    const { out, report, swapped } = await sync(name); name = path.basename(name);
    console.log(`${name}: ${swapped} swapped kit parts, ${Object.keys(out).length} recipe parts redrawn`); console.log(report.join('\n'));
    if (Object.keys(out).length) all[name] = out;
  }
  fs.writeFileSync(path.join(HERE, 'recipes', 'kit-swaps.json'), JSON.stringify(all, null, 1) + '\n');
}
