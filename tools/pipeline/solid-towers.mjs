// Builds every Forge spire tower as solids (SpireSolid) with no browser and checks the mesh: NaN, unit normals, index range, triangle count, build time.
//   node tools/pipeline/solid-towers.mjs [detail=0.6]
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const detail = +(process.argv[2] || 0.6);
globalThis.window = globalThis;
globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/kit/data/creature-parts.json'), 'utf8')) });
for (const f of ['packages/core/vendor/delaunator.min.js', 'packages/core/kit-utils.js', 'packages/kit/creature-arch.js', 'packages/parts/part-solid.js', 'packages/city/creature-spire.js', 'packages/city/spire-solid.js', 'packages/city/naqsh-pattern-engine.js', 'packages/city/tower-engine.js', 'packages/city/tower-presets.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
await CreatureArch.load('x');
const P = TowerPresets, bad = [];
let n = 0;
for (const [k, v] of Object.entries(P)) {
  const g = v && v.s && v.s.spire; if (!g) continue;
  const t0 = performance.now();
  let b; try { b = CreatureSpire.buildSpireGL2(g, { detail: 3, solid: SpireSolid.sink({ detail }) }); } catch (e) { bad.push(k + ': threw ' + e.message); continue; }
  const m = b.solid, ms = Math.round(performance.now() - t0);
  if (!m) { bad.push(k + ': no solid'); continue; }
  const nv = m.positions.length / 3, tris = m.indices.length / 3;
  let nan = 0, off = 0, maxI = 0; for (const x of m.positions) if (!isFinite(x)) nan++;
  for (let i = 0; i < nv; i++) { const l = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]); if (Math.abs(l - 1) > 0.05) off++; }
  for (const i of m.indices) if (i > maxI) maxI = i;
  const ok = !nan && maxI < nv && off / nv < 0.02;
  if (!ok) bad.push(`${k}: nan ${nan}, non-unit normals ${off}, max index ${maxI} of ${nv}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${k.padEnd(18)} ${String(tris).padStart(7)} tris  ${String(ms).padStart(5)} ms  (${b.solid.stats.parts} parts)`); n++;
}
console.log(n + ' towers' + (bad.length ? ', FAILED:\n' + bad.join('\n') : ', all ok'));
process.exit(bad.length ? 1 : 0);
