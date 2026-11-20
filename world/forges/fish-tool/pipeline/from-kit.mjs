#!/usr/bin/env node
// A tank species rebuilt from its kit sheet: the creature as it is drawn in the kit (shared/data/creature-parts.json), in place of
// the older build put together from other creatures' pieces.
//   node from-kit.mjs <species-key> <sheet-id> [--dry-run] [--svg out.svg]
//   e.g. node from-kit.mjs plated-scavenger sheet-plated-scavenger
// Every part of the sheet becomes one rig part (a left-side part twice, mirrored about the sheet's centre line), sized so the
// creature keeps the length it has in the tank now. A part's role in the swim comes from what the kit calls it: side wings, fins,
// claws, fronds and side blades sway from where they join the body; the topmost centre part is the head, the lowest the tail; the
// rest ride the body wave. The species' name, blurb, swim, weight, behaviour and place in the food web are kept as they are.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { buildSpecies, renderStaticSVG } from './lib/rig.mjs'; import { updateSpecies } from './lib/register.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), DATA = path.resolve(here, '../../../../shared/data'), WORLD = path.resolve(here, '../../../../shared/engine/ecology/ecology-species.js');
const args = process.argv.slice(2), [key, sheet] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--svg'), dry = args.includes('--dry-run'), svgOut = args.includes('--svg') ? args[args.indexOf('--svg') + 1] : null;
if (!key || !sheet) { console.error('usage: node from-kit.mjs <species-key> <sheet-id> [--dry-run] [--svg out.svg]'); process.exit(1); }
const kit = JSON.parse(fs.readFileSync(path.join(DATA, 'creature-parts.json'), 'utf8')).filter((p) => p.species === sheet), cat = JSON.parse(fs.readFileSync(path.join(DATA, 'creature-catalog.json'), 'utf8'));
if (!kit.length) { console.error('no kit sheet called ' + sheet); process.exit(1); }
const src = fs.readFileSync(WORLD, 'utf8').split('\n'), li = src.findIndex((l) => l.startsWith('const SPECIES = [')), old = JSON.parse(src[li].slice(16).replace(/;\s*$/, '')).find((s) => s.key === key);
if (!old) { console.error('no tank species called ' + key); process.exit(1); }
const CX = 200, SWAY = new Set(['wing', 'fin', 'claw', 'frond', 'blade']);
// the parts in sheet coordinates: all of a part's paths as one, its box, and whether it is on the sheet at all
const parts = kit.map((p) => { const d = [...p.svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(' '), n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number);
  return { p, d, feature: (cat.parts[p.id] || {}).feature || 'body', x0: p.ox - p.w / 2, x1: p.ox + p.w / 2, y0: p.oy - p.h / 2, y1: p.oy + p.h / 2 }; })
  .filter((q) => q.d && q.x1 > CX - 400 && q.x0 < CX + 400 && (q.p.side === 'center' ? Math.abs(q.p.ox - CX) < 60 : q.p.ox > -100));
const Y0 = Math.min(...parts.map((q) => q.y0)), Y1 = Math.max(...parts.map((q) => q.y1)), LEN = old.bounds[3] - old.bounds[1], s = LEN / (Y1 - Y0), oy = old.bounds[1] - Y0 * s;
const centre = parts.filter((q) => q.p.side === 'center'), top = centre.length ? centre.reduce((a, b) => (a.y0 < b.y0 ? a : b)) : null, low = centre.length > 1 ? centre.reduce((a, b) => (a.y1 > b.y1 ? a : b)) : null;
const slots = [...new Set(parts.filter((q) => q.p.side !== 'center' && SWAY.has(q.feature)).sort((a, b) => a.p.oy - b.p.oy).map((q) => q.p.id))];
const manifest = [];
for (const q of parts) { const side = q.p.side === 'center' ? 0 : -1, sway = side && SWAY.has(q.feature), role = sway ? 'fin' : q === top ? 'head' : q === low ? 'tail' : 'plate', slot = sway ? slots.indexOf(q.p.id) : undefined;
  manifest.push({ id: q.p.id, role, side, phaseSlot: slot, inline: { d: q.d, matrix: [s, 0, 0, s, -CX * s, oy] } });
  if (side) manifest.push({ id: q.p.id + 'r', role, side: 1, phaseSlot: slot, inline: { d: q.d, matrix: [-s, 0, 0, s, CX * s, oy] } }); }
const recipe = { key, name: old.name, blurb: old.blurb, weight: old.weight, swim: old.swim, partsManifest: manifest };
const sp = buildSpecies(recipe, here); delete sp._ecology;
console.log(key, 'from', sheet + ':', kit.length, 'kit parts ->', sp.parts, 'rig parts,', sp.counts.lineVerts, 'line points (was', old.counts.lineVerts + ', ' + old.parts + ' parts); length', Math.round(sp.bounds[3] - sp.bounds[1]), '(was', Math.round(LEN) + ')');
if (sp.counts.lineVerts > 65535) { console.error('too many line points for the tank (65535 at most): not written'); process.exit(1); }
if (svgOut) fs.writeFileSync(svgOut, renderStaticSVG(recipe, here));
if (dry) console.log('(dry run: the tank is unchanged)'); else { updateSpecies(WORLD, sp); console.log('written to', path.relative(process.cwd(), WORLD)); }
