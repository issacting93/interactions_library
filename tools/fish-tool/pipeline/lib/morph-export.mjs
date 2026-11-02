// Converts a recipe into Metamorphosis.html's CREATURES entry format -- a completely different,
// much simpler encoding than SPECIES' baked ribbon mesh (confirmed by reading Metamorphosis.html's
// own prepare() hydration function): each part is a tuple [g, side, ax, ay, ring, rings], where
// `rings` is just the part's own flattened subpath point lists ([x,y,x,y,...] per subpath/ring), no
// triangulation or base64 packing at all. Reuses computeParts() (the SAME shared pass-1 geometry
// buildSpecies uses) so a Metamorphosis entry can never visually drift from the live Cybernetic
// Ecology rig -- both are built from one placement pass, just packaged two different ways downstream.
//
// Group vocabulary differs from rig.mjs's GROUP (Cybernetic Ecology only distinguishes 5 groups,
// collapsing leg+fin together): Metamorphosis has 8 (G = ['body','head','whisker','tail','pectoral',
// 'pelvic','shoulder','rib']), with RIGID = {2,4,5,6}. MORPH_GROUP below maps this pipeline's role
// vocabulary onto the closest Metamorphosis group -- leg/fin both land on 4 (pectoral), same
// simplification rig.mjs's own GROUP already makes for the live rig, so no information is lost that
// wasn't already collapsed upstream.
import { computeParts } from './rig.mjs';

const MORPH_GROUP = { plate: 0, head: 1, eye: 1, whisker: 2, tail: 3, leg: 4, fin: 4 };
const MORPH_RIGID = new Set(['whisker', 'leg', 'fin']);

export function buildMorphCreature(recipe, sourceDir, opts = {}) {
  const { key, name, blurb } = recipe;
  const { parts, cx, cy } = computeParts(recipe, sourceDir);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const tuples = [];
  for (const p of parts) {
    if (p.bucket === 'skip' || p.bucket === 'socket') continue;
    const role = p.manifest.role;
    const g = MORPH_GROUP[role] ?? 0;
    const side = p.manifest.side ?? 0;
    const rigid = MORPH_RIGID.has(role);
    const [bminX, bminY, bmaxX, bmaxY] = p.bbox;

    let ax, ay;
    if (rigid) {
      let best = null, bestD = Infinity;
      for (const sp of p.subpaths) for (const pt of sp) {
        const d = Math.hypot(pt[0] - cx, pt[1] - cy);
        if (d < bestD) { bestD = d; best = pt; }
      }
      [ax, ay] = best || [(bminX + bmaxX) / 2, (bminY + bmaxY) / 2];
    } else {
      ax = (bminX + bmaxX) / 2; ay = (bminY + bmaxY) / 2;
    }

    const rings = p.subpaths.filter(sp => sp.length > 1).map(sp => {
      const closed = [...sp, sp[0]];
      const flat = [];
      for (const [x, y] of closed) { flat.push(round(x), round(y)); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      return flat;
    });
    if (!rings.length) continue;
    tuples.push([g, side, round(ax), round(ay), 0, rings]);
  }

  return {
    key, name, blurb,
    flap: !!opts.flap,
    bounds: [round(minX), round(minY), round(maxX), round(maxY)],
    parts: tuples,
  };
}

function round(v) { return Math.round(v * 10) / 10; }
