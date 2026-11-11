#!/usr/bin/env node
// Pipeline CLI: recipe (parts manifest) -> rigged SPECIES entry -> spliced into the live world.
// Usage: node run.mjs recipes/carapace-strider.mjs [--dry-run] [--svg [outfile.svg]] [--replace]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSpecies, renderStaticSVG } from './lib/rig.mjs';
import { registerSpecies, updateSpecies } from './lib/register.mjs';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(__dirname, '..', 'sigil-species-rig-svgs');
// Relocated 2026-10-31 to shared/engine/ecology-species.js (window.EcologySpecies) so Cybernetic
// Ecology's extracted simulation (shared/engine/ecology-sim.js) and any other consumer can load the same
// data file; this pipeline still edits it in place by string-splicing, same as always.
const WORLD_FILE = path.resolve(__dirname, '..', '..', '..', '..', 'shared', 'engine', 'ecology', 'ecology-species.js');
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

  // Parts redrawn in the kit since this recipe was written (kit-sync.mjs): same place, size, role and
  // motion, new drawing.
  const swapsFile = path.join(__dirname, 'recipes', 'kit-swaps.json');
  const swaps = fs.existsSync(swapsFile) ? JSON.parse(fs.readFileSync(swapsFile, 'utf8'))[path.basename(recipePath, '.mjs')] : null;
  if (swaps) {
    recipe.partsManifest = recipe.partsManifest.map(m => {
      const s = swaps[m.id]; if (!s) return m;
      const { source, pathIndex, transform, forceBucket, inline, ...rest } = m;
      return { ...rest, inline: { d: s.d, matrix: s.matrix } };
    });
    console.log(`kit swaps applied: ${Object.keys(swaps).length} parts`);
  }

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
  // Already in the water: redraw it, and keep how it moves. The entry's own swim, weight, part rig
  // (partTex), ids and its BEH/ECO lines stay exactly as they are; only the drawing (meshes, bounds,
  // counts) is replaced. A recipe whose part list changed is a different creature: that needs --replace.
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(WORLD_FILE, 'utf8'), sandbox);
  const live = sandbox.window.EcologySpecies.SPECIES.find(s => s.key === species.key);
  if (live && !args.includes('--replace')) {
    if (live.parts !== species.parts) throw new Error(`${species.key}: the recipe has ${species.parts} parts, the swimmer in the water has ${live.parts}; use --replace to rebuild its rig too`);
    const { _ecology, ...drawn } = species;
    const result = updateSpecies(WORLD_FILE, { ...live, bounds: drawn.bounds, fillV: drawn.fillV, fillI: drawn.fillI, lineV: drawn.lineV, lineI: drawn.lineI, counts: drawn.counts });
    console.log('redrawn', result.key, '(motion kept) ->', WORLD_FILE, `(${result.bytesWritten} bytes)`);
    return;
  }
  const result = live ? updateSpecies(WORLD_FILE, species) : registerSpecies(WORLD_FILE, species);
  console.log(live ? 'replaced' : 'registered', result.key, '->', WORLD_FILE, `(${result.bytesWritten} bytes)`);
}

main().catch(err => { console.error(err); process.exit(1); });
