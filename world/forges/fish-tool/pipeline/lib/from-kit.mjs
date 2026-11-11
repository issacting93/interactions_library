// Builds a recipe's parts straight from a kit sheet (shared/data/creature-parts.json), so the swimmer is
// the kit's own drawing and follows it on the next bake. Each kit part becomes one recipe part; a left
// part becomes two (itself and its mirror about the sheet's axis, x = 200). The sheet's 400 units are
// scaled to world units by `scale`.
//
//   fromKit('sheet-drape-vampire', { scale: 20, parts: { P748: { role: 'head' }, P152: { role: 'fin', phaseSlot: 0 }, ... } })
//
// Only the parts listed are used, in the order listed. `paths: [0]` keeps just those paths of a part
// (some kit parts carry a second, masked copy of the same outline).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'shared', 'data', 'creature-parts.json');

export function fromKit(sheet, { scale = 20, parts }) {
  const kit = new Map(JSON.parse(fs.readFileSync(KIT_FILE, 'utf8')).filter(p => p.species === sheet).map(p => [p.id, p]));
  const out = [];
  for (const [id, opt] of Object.entries(parts)) {
    const p = kit.get(id);
    if (!p) throw new Error(`fromKit: ${id} is not on ${sheet}`);
    let ds = [...p.svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);
    if (opt.paths) ds = opt.paths.map(i => ds[i]);
    const { role, paths, ...rest } = opt;
    const d = ds.join(' ');
    if (p.side === 'center') out.push({ id, role, side: 0, inline: { d, matrix: [scale, 0, 0, scale, -200 * scale, 0] }, ...rest });
    else {
      out.push({ id: id + '-l', role, side: -1, inline: { d, matrix: [scale, 0, 0, scale, -200 * scale, 0] }, ...rest });
      out.push({ id: id + '-r', role, side: 1, inline: { d, matrix: [-scale, 0, 0, scale, 200 * scale, 0] }, ...rest });
    }
  }
  return out;
}
