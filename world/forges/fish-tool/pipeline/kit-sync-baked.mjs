#!/usr/bin/env node
// The same job as kit-sync.mjs, for the swimmers that have no recipe: their rig was drawn by hand and
// only the baked mesh exists (shared/engine/ecology/ecology-species.js). For each swapped kit part this
// finds the swimmer part with the old outline and replaces just that part's line and fill geometry with
// the new drawing, at the old part's place and size. The part keeps its number, so its rig row (partTex),
// id and everything about how the swimmer moves are untouched. Safe to run again: a part already
// redrawn no longer matches the old outline and is left alone.
//
//   node kit-sync-baked.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { flattenPath, buildFillMesh, buildLineMesh } from './lib/svg-extract.mjs';
import { updateSpecies } from './lib/register.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const WORLD_FILE = path.join(ROOT, 'shared/engine/ecology/ecology-species.js');
const KIT = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/data/creature-parts.json'), 'utf8'));
const ORIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/data/kit-sources/replaced-parts.json'), 'utf8')).parts;
const LIMIT = 0.035;
const SHEET_OF = { moth: 'sheet-crown-moth', wisp: 'sheet-lantern-wisp', pincer: 'sheet-pincer-crawler' };   // swimmer key -> kit sheet

const dsOf = svg => [...svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);
const f32 = b64 => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); };
const b64 = arr => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
function indices(b64s, nVerts) {
  const b = Buffer.from(b64s, 'base64');
  const wide = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~3)));
  if (b.length % 4 === 0 && wide.every(i => i < nVerts)) return { arr: Array.from(wide), Type: Uint32Array };
  return { arr: Array.from(new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))), Type: Uint16Array };
}
function frame(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const L = Math.max(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { L, cx, cy, pts: pts.map(([x, y]) => [(x - cx) / L, (y - cy) / L]) };
}
function thin(pts, n = 220) { const k = Math.max(1, Math.floor(pts.length / n)); return pts.filter((_, i) => i % k === 0); }
function along(polys, n = 220) {
  let len = 0; for (const p of polys) for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const step = len / n, out = []; let acc = 0;
  for (const p of polys) for (let i = 1; i < p.length; i++) {
    const [ax, ay] = p[i - 1], [bx, by] = p[i], seg = Math.hypot(bx - ax, by - ay);
    while (acc <= seg && seg > 0) { const t = acc / seg; out.push([ax + (bx - ax) * t, ay + (by - ay) * t]); acc += step; }
    acc -= seg;
  }
  return out;
}
function gap(a, b) {
  const one = (p, q) => p.reduce((s, [x, y]) => s + Math.sqrt(q.reduce((m, [u, v]) => Math.min(m, (x - u) ** 2 + (y - v) ** 2), Infinity)), 0) / p.length;
  return (one(a, b) + one(b, a)) / 2;
}
const area = p => Math.abs(p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0) / 2);

/** drop every vertex of one part from a mesh (stride floats per vertex, part number last), keep the rest in order */
function without(verts, idx, stride, part) {
  const map = new Int32Array(verts.length / stride).fill(-1), v = []; let n = 0;
  for (let i = 0; i < verts.length; i += stride) if (verts[i + stride - 1] !== part) { map[i / stride] = n++; for (let k = 0; k < stride; k++) v.push(verts[i + k]); }
  const ix = [];
  for (let i = 0; i < idx.length; i += 3) { const a = map[idx[i]], b = map[idx[i + 1]], c = map[idx[i + 2]]; if (a >= 0 && b >= 0 && c >= 0) ix.push(a, b, c); }
  return { v, ix };
}

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(WORLD_FILE, 'utf8'), sandbox);
const dry = process.argv.includes('--dry-run');
for (const [key, sheet] of Object.entries(SHEET_OF)) {
  const sp = sandbox.window.EcologySpecies.SPECIES.find(s => s.key === key);
  let fillV = Array.from(f32(sp.fillV)), lineV = Array.from(f32(sp.lineV));
  const fi = indices(sp.fillI, fillV.length / 3), li = indices(sp.lineI, lineV.length / 5);
  let fillI = fi.arr, lineI = li.arr;
  const swapped = KIT.filter(p => p.species === sheet && ORIG[p.id] && String(p.from || '').startsWith('new-shapes.svg#'));
  const outlineOf = part => { const pts = []; for (let i = 0; i < lineV.length; i += 5) if (lineV[i + 4] === part) pts.push([lineV[i], lineV[i + 1]]); return pts; };
  const used = new Set(); let done = 0;
  for (const kp of swapped) {
    const old = ORIG[kp.id];
    for (const flip of old.side === 'left' ? [1, -1] : [1]) {
      const mir = polys => polys.map(p => p.map(([x, y]) => [flip < 0 ? 400 - x : x, y]));
      const oldPolys = mir(dsOf(old.svg).flatMap(d => flattenPath(d, 0.3).subpaths));
      const ref = frame(along(oldPolys));
      let best = null;
      for (let part = 0; part < sp.parts; part++) {
        if (used.has(part)) continue;
        const pts = outlineOf(part); if (pts.length < 8) continue;
        const fr = frame(pts), g = gap(ref.pts, thin(fr.pts));
        const side = Math.sign(fr.cx) === Math.sign(ref.cx - 200) || old.side === 'center';
        if (g <= LIMIT && side && (!best || g < best.g)) best = { part, fr, g };
      }
      if (!best) { console.log(`  ${key}: ${kp.id}${flip < 0 ? ' (right)' : ''} has no part with the old outline (already redrawn, or not in this swimmer)`); continue; }
      used.add(best.part);
      // new drawing: centred on the old kit part's origin, so the same centre and scale as the old one
      const s = best.fr.L / ref.L, rc = frame(oldPolys.flat());
      const place = ([x, y]) => [best.fr.cx + (x - rc.cx) * s, best.fr.cy + (y - rc.cy) * s];
      const polys = mir(dsOf(kp.svg).flatMap(d => flattenPath(d, 0.3).subpaths)).map(p => p.map(place));
      const hull = polys.reduce((a, b) => (area(b) > area(a) ? b : a));
      const F = without(fillV, fillI, 3, best.part), Lm = without(lineV, lineI, 5, best.part);
      const nf = buildFillMesh([hull], best.part), nl = buildLineMesh(polys.map(p => [...p, p[0]]), best.part);
      fillV = F.v.concat(nf.verts); fillI = F.ix.concat(nf.indices.map(i => i + F.v.length / 3));
      lineV = Lm.v.concat(nl.verts); lineI = Lm.ix.concat(nl.indices.map(i => i + Lm.v.length / 5));
      console.log(`  ${key}: ${kp.id}${flip < 0 ? ' (right)' : ''} -> ${sp.ids[best.part]}  (${kp.from.split('#')[1]}, outline gap ${best.g.toFixed(3)})`); done++;
    }
  }
  if (!done || dry) continue;
  const need = n => (n > 65535 ? Uint32Array : null);
  const FT = need(fillV.length / 3) || fi.Type, LT = need(lineV.length / 5) || li.Type;
  updateSpecies(WORLD_FILE, { ...sp, fillV: b64(new Float32Array(fillV)), fillI: b64(new FT(fillI)), lineV: b64(new Float32Array(lineV)), lineI: b64(new LT(lineI)),
                              counts: { fillVerts: fillV.length / 3, lineVerts: lineV.length / 5 } });
  console.log(`${key}: ${done} parts redrawn in the water`);
}
