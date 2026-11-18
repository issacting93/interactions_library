// The world: a radial grid, a tower at the centre, and you always move inward. The rings and their order stay; what fills each
// wedge, where the towers stand and where the stairs are hidden reshuffle with the run's seed.
//
//   ring 0  The Floor     (outer)   hatch here. Its inner wall is climbed at a tower (gate: Climb)
//   ring 1  Frond Forest            dark weed. Its inner wall is passed at a hidden stair you only see with Eyes (gate: Eyes)
//   ring 2  The Shoals              open water. Inside it, a moat round the Apex island (gate: Swim, or Leap across)
//   ring 3  The Apex      (centre)  the dragon. Be big enough to take it
import { Rng } from "../core/rng";
import type { RingId, Trait } from "./data";

export type PropKind = "boulder" | "weed" | "carcass" | "vent" | "ruin";
export interface Prop { kind: PropKind; x: number; y: number; r: number; a: number }   // a: facing (a ruin points to a tower)
export interface Gate { kind: "tower" | "stair"; x: number; y: number; a: number; ring: number; need: Trait[] }
export interface Ring { id: RingId; i: number; name: string; r0: number; r1: number; dark: number; water: boolean; wedges: PropKind[]; blurb: string }
export interface WorldMap {
  seed: number; R: number; rings: Ring[]; moat: { r0: number; r1: number }; props: Prop[]; gates: Gate[]; nest: { x: number; y: number };
}

export const RING_DEF: Omit<Ring, "wedges">[] = [
  { id: "floor", i: 0, name: "The Floor", r0: 1020, r1: 1640, dark: 0, water: false, blurb: "Open floor, boulders and carcasses. Learn to climb." },
  { id: "frond", i: 1, name: "Frond Forest", r0: 640, r1: 1020, dark: 0.86, water: false, blurb: "Dark weed. The way up is hidden until you can see." },
  { id: "shoals", i: 2, name: "The Shoals", r0: 340, r1: 640, dark: 0.2, water: false, blurb: "Open water over a shallow floor. The Apex waits past the moat." },
  { id: "apex", i: 3, name: "The Apex", r0: 0, r1: 200, dark: 0, water: false, blurb: "The centre." },
];
const WEDGES: Record<RingId, PropKind[]> = { floor: ["boulder", "boulder", "carcass", "weed", "ruin"], frond: ["weed", "weed", "weed", "vent", "boulder"], shoals: ["weed", "vent", "boulder", "ruin"], apex: ["ruin"] };
const N_WEDGE = [9, 7, 5, 1];

export function makeWorld(seed: number): WorldMap {
  const rng = new Rng(seed).fork(0x77);
  const rings: Ring[] = RING_DEF.map((d) => ({ ...d, wedges: Array.from({ length: N_WEDGE[d.i] }, () => rng.pick(WEDGES[d.id])) }));
  const props: Prop[] = [], gates: Gate[] = [], P = (r: number, a: number) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  // what fills each wedge: a cluster of its kind, and a scatter of boulders everywhere
  for (const ring of rings) {
    if (ring.id === "apex") continue;
    const n = ring.wedges.length, span = (Math.PI * 2) / n, off = rng.next() * span;
    ring.wedges.forEach((kind, w) => {
      const count = kind === "weed" ? 7 : kind === "boulder" ? 4 : kind === "ruin" ? 3 : kind === "vent" ? 3 : 1;
      for (let k = 0; k < count; k++) { const a = off + w * span + rng.range(0.15, 0.85) * span, r = rng.range(ring.r0 + 60, ring.r1 - 60), p = P(r, a);
        props.push({ kind, ...p, r: kind === "carcass" ? rng.range(70, 110) : kind === "weed" ? rng.range(26, 46) : kind === "vent" ? rng.range(22, 34) : rng.range(18, 44), a: rng.range(0, Math.PI * 2) }); }
    });
    for (let k = 0; k < 6; k++) { const p = P(rng.range(ring.r0 + 60, ring.r1 - 60), rng.range(0, Math.PI * 2)); props.push({ kind: "boulder", ...p, r: rng.range(14, 30), a: rng.range(0, 6.3) }); }
  }
  // gates: three towers round the Floor's inner wall (never two close together), two stairs hidden in the Frond's
  const spread = (n: number, min: number) => { const as: number[] = []; let guard = 0; while (as.length < n && guard++ < 400) { const a = rng.range(0, Math.PI * 2); if (as.every((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > min)) as.push(a); } return as; };
  for (const a of spread(3, 1.4)) gates.push({ kind: "tower", ...P(rings[0].r0, a), a, ring: 0, need: ["climb"] });
  for (const a of spread(2, 2.0)) gates.push({ kind: "stair", ...P(rings[1].r0, a), a, ring: 1, need: ["eyes"] });
  // pointing ruins: fallen pillars on the Floor, each turned toward the nearest tower, thicker as you get close
  for (let k = 0; k < 22; k++) { const a = rng.range(0, Math.PI * 2), r = rng.range(rings[0].r0 + 90, rings[0].r1 - 60), p = P(r, a);
    const t = gates.filter((g) => g.kind === "tower").sort((g, h) => Math.hypot(g.x - p.x, g.y - p.y) - Math.hypot(h.x - p.x, h.y - p.y))[0];
    props.push({ kind: "ruin", ...p, r: rng.range(16, 26), a: Math.atan2(t.y - p.y, t.x - p.x) }); }
  const na = rng.range(0, Math.PI * 2);
  return { seed, R: rings[0].r1, rings, moat: { r0: rings[3].r1, r1: rings[2].r0 }, props, gates, nest: P((rings[0].r0 + rings[0].r1) / 2 + 120, na) };
}

// which ring a point is in (the moat counts as the Shoals' inner edge; the island is the Apex)
export function ringAt(w: WorldMap, x: number, y: number): number {
  const r = Math.hypot(x, y);
  if (r < w.moat.r0) return 3;
  for (const ring of w.rings) if (ring.i < 3 && r >= ring.r0 && r <= ring.r1 + 1) return ring.i;
  return r > w.R ? 0 : 2;
}
export const inMoat = (w: WorldMap, x: number, y: number) => { const r = Math.hypot(x, y); return r > w.moat.r0 && r < w.moat.r1; };
