#!/usr/bin/env node
// Pipeline CLI: recipe (parts manifest) -> rigged SPECIES entry -> spliced into the live world.
// Usage: node run.mjs recipes/carapace-strider.mjs [--dry-run] [--svg [outfile.svg]]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSpecies, renderStaticSVG } from './lib/rig.mjs';
import { registerSpecies } from './lib/register.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(__dirname, '..', 'sigil-species-rig-svgs');
// Relocated 2026-10-31 to shared/ecology-species.js (window.EcologySpecies) so Cybernetic
// Ecology's extracted simulation (shared/ecology-sim.js) and any other consumer can load the same
// data file; this pipeline still edits it in place by string-splicing, same as always.
const WORLD_FILE = path.resolve(__dirname, '..', '..', '..', 'shared', 'ecology-species.js');
const MONO_DIR = path.join(SOURCE_DIR, 'mono');

async function main() {
  const args = process.argv.slice(2);
  const recipePath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const svgIdx = args.indexOf('--svg');
  const wantSvg = svgIdx !== -1;
  const svgOutArg = wantSvg && args[svgIdx + 1] && !args[svgIdx + 1].startsWith('--') ? args[svgIdx + 1] : null;
  if (!recipePath) { console.error('usage: node run.mjs <recipe.mjs> [--dry-run] [--svg [outfile.svg]]'); process.exit(1); }

  const recipeMod = await import(pathToFileURL(path.resolve(__dirname, recipePath)).href);
  const recipe = recipeMod.default;

  const species = buildSpecies(recipe, SOURCE_DIR);
  console.log(JSON.stringify({
    key: species.key, name: species.name, parts: species.parts,
    fillVerts: species.counts.fillVerts, fillTris: species.counts.fillVerts ? undefined : 0,
    lineVerts: species.counts.lineVerts,
    bounds: species.bounds,
    partTexFloats: species.partTex.length,
  }, null, 2));

  if (wantSvg) {
    const svg = renderStaticSVG(recipe, SOURCE_DIR);
    const outPath = svgOutArg ? path.resolve(__dirname, svgOutArg) : path.join(MONO_DIR, `${recipe.name}.svg`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, svg);
    console.log('wrote static sigil ->', outPath);
  }

  if (dryRun) { console.log('(dry run -- not written to', WORLD_FILE, ')'); return; }
  const result = registerSpecies(WORLD_FILE, species);
  console.log('registered', result.key, '->', WORLD_FILE, `(${result.bytesWritten} bytes)`);
}

main().catch(err => { console.error(err); process.exit(1); });
