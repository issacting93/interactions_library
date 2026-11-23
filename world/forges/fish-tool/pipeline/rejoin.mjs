#!/usr/bin/env node
// Every tank species' lines as joined ribbons. Species built by this pipeline were stored a segment at a time (four corners each),
// which leaves a notch at every corner once a line is more than a hair wide; this reads those segments back into the lines they came
// from and writes them as one mitred ribbon each (lib/svg-extract.mjs buildLineMesh), closing a loop that ends where it began.
// Species already stored joined (the hand-built ones) are left as they are. Nothing else about a species changes.
//   node rejoin.mjs [--dry-run]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { buildLineMesh, toB64 } from './lib/svg-extract.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), WORLD = path.resolve(here, '../../../../packages/kit/ecology-species.js'), dry = process.argv.includes('--dry-run');
const b64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const src = fs.readFileSync(WORLD, 'utf8').split('\n'), li = src.findIndex((l) => l.startsWith('const SPECIES = [')), S = JSON.parse(src[li].slice(16).replace(/;\s*$/, ''));
let changed = 0;
for (const sp of S) {
  if (!sp.lineV || !sp.lineI) continue;   // stored as strokes (tools/kit3d/pack.mjs): joined already
  const V = b64(sp.lineV, Float32Array), I = b64(sp.lineI, Uint16Array); if (!I.length) continue;
  if (!(I[0] === 0 && I[1] === 2 && I[2] === 1)) { continue; }   // joined already
  const lines = []; let cur = null;   // [{ part, pts }]: consecutive segments of one part whose ends meet are one line
  for (let v = 0; v + 3 < V.length / 5; v += 4) { const ax = V[v * 5], ay = V[v * 5 + 1], bx = V[(v + 2) * 5], by = V[(v + 2) * 5 + 1], part = V[v * 5 + 4];
    const last = cur && cur.pts[cur.pts.length - 1];
    if (cur && cur.part === part && Math.abs(last[0] - ax) < 1e-3 && Math.abs(last[1] - ay) < 1e-3) cur.pts.push([bx, by]); else { cur = { part, pts: [[ax, ay], [bx, by]] }; lines.push(cur); } }
  let lineV = [], lineI = [];
  for (const L of lines) { const { verts, indices } = buildLineMesh([L.pts], L.part), base = lineV.length / 5; for (const x of verts) lineV.push(x); for (const ix of indices) lineI.push(ix + base); }
  const was = V.length / 5, now = lineV.length / 5; if (now > 65535) { console.log(sp.key, 'too many points, left as it was'); continue; }
  sp.lineV = toB64(new Float32Array(lineV)); sp.lineI = toB64(new Uint16Array(lineI)); sp.counts.lineVerts = now; changed++;
  console.log(sp.key.padEnd(34), String(lines.length).padStart(5), 'lines', String(was).padStart(6), '->', String(now).padStart(6), 'points');
}
if (!dry && changed) { src[li] = 'const SPECIES = ' + JSON.stringify(S) + ';'; fs.writeFileSync(WORLD, src.join('\n')); }
console.log(changed, 'species rejoined' + (dry ? ' (dry run: nothing written)' : ''));
