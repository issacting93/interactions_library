#!/usr/bin/env node
// A tank species from one finished drawing: an SVG of the whole creature, its paths already where they belong.
//   node from-svg.mjs <species-key> <file.svg> [--recipe recipes/<old>.mjs] [--len 3200] [--dry-run]
// Each path is one rig part. A path that sits off the centre line is a side part and sways from where it joins the body; a path
// across the centre line rides the body wave. If the species is in the tank already it is replaced in place and keeps its name,
// behaviour and place in the food web; if not it is added, with the name, blurb and ecology of --recipe.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSpecies } from './lib/rig.mjs'; import { registerSpecies, updateSpecies } from './lib/register.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), WORLD = path.resolve(here, '../../../../shared/engine/ecology/ecology-species.js');
const args = process.argv.slice(2), opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null), flags = new Set(['--recipe', '--len']);
const [key, file] = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1])), dry = args.includes('--dry-run');
if (!key || !file) { console.error('usage: node from-svg.mjs <species-key> <file.svg> [--recipe recipes/x.mjs] [--len 3200] [--dry-run]'); process.exit(1); }
const svg = fs.readFileSync(file, 'utf8'), ds = [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]);
const box = (d) => { const n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); } return { x0, x1, y0, y1 }; };
const B = ds.map(box), X0 = Math.min(...B.map((b) => b.x0)), X1 = Math.max(...B.map((b) => b.x1)), Y0 = Math.min(...B.map((b) => b.y0)), Y1 = Math.max(...B.map((b) => b.y1)), CX = (X0 + X1) / 2;
const src = fs.readFileSync(WORLD, 'utf8').split('\n'), li = src.findIndex((l) => l.startsWith('const SPECIES = [')), old = JSON.parse(src[li].slice(16).replace(/;\s*$/, '')).find((s) => s.key === key);
const rec = opt('--recipe') ? (await import(pathToFileURL(path.resolve(opt('--recipe'))).href)).default : null;
if (!old && !rec) { console.error(key + ' is not in the tank: give --recipe for its name and ecology'); process.exit(1); }
const LEN = Number(opt('--len')) || (old ? old.bounds[3] - old.bounds[1] : 3200), s = LEN / (Y1 - Y0), oy = (old ? old.bounds[1] : 150) - Y0 * s;
let slot = 0; const manifest = ds.map((d, i) => { const b = B[i], off = (b.x0 + b.x1) / 2 - CX, side = b.x1 < CX + 2 ? -1 : b.x0 > CX - 2 ? 1 : 0;
  return { id: 'p' + i, role: side ? 'fin' : 'plate', side, phaseSlot: side ? Math.round((b.y0 + b.y1) / 2 / (Y1 - Y0) * 6) : undefined, inline: { d, matrix: [s, 0, 0, s, -CX * s, oy] } }; });
const recipe = { key, name: (old || rec).name, blurb: (old || rec).blurb, weight: (old || rec).weight || 1, swim: old ? old.swim : rec.swim, ecology: old ? undefined : rec.ecology, partsManifest: manifest };
const sp = buildSpecies(recipe, here); if (old) delete sp._ecology;
console.log(key + ':', ds.length, 'paths ->', sp.parts, 'rig parts (' + manifest.filter((m) => m.side < 0).length + ' left, ' + manifest.filter((m) => m.side > 0).length + ' right, ' + manifest.filter((m) => !m.side).length + ' centre),', sp.counts.lineVerts, 'line points; length', Math.round(sp.bounds[3] - sp.bounds[1]), 'span', Math.round(sp.bounds[2] - sp.bounds[0]));
if (sp.counts.lineVerts > 65535) { console.error('too many line points for the tank (65535 at most): not written'); process.exit(1); }
if (dry) console.log('(dry run: the tank is unchanged)'); else { (old ? updateSpecies : registerSpecies)(WORLD, sp); console.log(old ? 'replaced in' : 'added to', path.relative(process.cwd(), WORLD)); }
