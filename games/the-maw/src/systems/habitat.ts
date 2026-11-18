// Where things live (ported from the tank's EcologyHabitat). A place's props are read as habitat; a species' liking is read off
// its own behaviour; a newborn's spot is drawn from how well it suits that kind there, less how crowded it already is.
import type { Species } from "../content/data";
import type { Prop, PropKind, WorldMap } from "../content/world";
import { Grid } from "../core/grid";
import type { Rng } from "../core/rng";

export interface Like { bottom: number; cover: number; weed: number; carrion: number; warm: number; open: number }
const MOOD = { cover: /ambush|stalk|crawl|strik|loner|armou?r|deep|lancer|chaser/i, weed: /camoufl|frond/i, carrion: /scaveng/i, warm: /colony/i, open: /school|murmur|glid|monarch|show|swift|flutter|moth|watcher/i };
const cache = new Map<string, Like>();
export function like(sp: Species): Like {
  const c = cache.get(sp.key); if (c) return c;
  const bottom = Math.max(0, Math.min(1, (0.4 - sp.alt[0]) / 0.4));   // how much of its band reaches the floor
  const L: Like = { bottom, cover: MOOD.cover.test(sp.mood) || sp.stopgo || sp.lure ? 1 : 0.1, weed: sp.graze || MOOD.weed.test(sp.mood) ? 1 : 0.15,
    carrion: MOOD.carrion.test(sp.mood) ? 1.4 : 0, warm: MOOD.warm.test(sp.mood) || sp.sting ? 1.4 : /plankton/i.test(sp.mood) ? 0.7 : 0, open: MOOD.open.test(sp.mood) || sp.school >= 0.9 ? 1 : 0.35 };
  cache.set(sp.key, L); return L;
}
const MAP: Record<PropKind, keyof Like | null> = { boulder: "cover", weed: "weed", carcass: "carrion", vent: "warm", ruin: "cover" };
const REACH: Record<PropKind, number> = { boulder: 3, weed: 3.2, carcass: 2.4, vent: 4, ruin: 2 };

export class Habitat {
  private props = new Grid(220);
  constructor(readonly map: WorldMap) { map.props.forEach((p, i) => this.props.insert(i, p.x, p.y)); }
  // 0..1: how well a species suits a point (landmarks pull floor kinds; open water pulls the rest)
  suit(sp: Species, x: number, y: number): number {
    const L = like(sp), f: Record<string, number> = { cover: 0, weed: 0, carrion: 0, warm: 0 };
    for (const i of this.props.near(x, y, 260)) { const p: Prop = this.map.props[i], k = MAP[p.kind]; if (!k) continue; const d = Math.hypot(p.x - x, p.y - y) / (p.r * REACH[p.kind] + 40); if (d < 1) f[k] = Math.min(1, f[k] + (1 - d * d)); }
    const clutter = Math.max(f.cover, f.weed, f.carrion, f.warm), floor = L.cover * f.cover + L.weed * f.weed + L.carrion * f.carrion + L.warm * f.warm;
    return Math.min(1, (0.12 + L.bottom * floor + (1 - L.bottom * 0.6) * L.open * (1 - clutter) * 0.6 + (1 - L.bottom) * 0.25) / 1.5);
  }
  // a spot in a ring band (or a ring round a point), off screen if asked, chosen by suitability less crowding
  place(sp: Species, rng: Rng, o: { r0: number; r1: number; near?: { x: number; y: number; d0: number; d1: number }; avoid?: (x: number, y: number) => boolean; crowd: (x: number, y: number) => number }): { x: number; y: number } | null {
    let best: { x: number; y: number; w: number }[] = [], tot = 0;
    for (let k = 0; k < 28; k++) {
      let x: number, y: number;
      if (o.near) { const a = rng.range(0, Math.PI * 2), d = rng.range(o.near.d0, o.near.d1); x = o.near.x + Math.cos(a) * d; y = o.near.y + Math.sin(a) * d; }
      else { const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.range(o.r0 * o.r0, o.r1 * o.r1)); x = Math.cos(a) * r; y = Math.sin(a) * r; }
      const r = Math.hypot(x, y); if (r < o.r0 + 30 || r > o.r1 - 30) continue;
      if (o.avoid && o.avoid(x, y)) continue;
      const w = this.suit(sp, x, y) * Math.max(0.05, 1 - o.crowd(x, y) / 6); best.push({ x, y, w: w * w }); tot += w * w;
    }
    if (!best.length) return null;
    let r = rng.next() * tot; for (const b of best) if ((r -= b.w) <= 0) return b;
    return best[best.length - 1];
  }
}
