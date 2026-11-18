// A run: one world, one seed, the systems in a fixed order. No drawing here: the view reads this state.
import { World, type Entity } from "./core/ecs";
import { Rng } from "./core/rng";
import { Clock } from "./core/clock";
import { Events } from "./core/events";
import { Grid } from "./core/grid";
import { BY_KEY, SPECIES, lengthOf, TRAITS, type Species, type Trait } from "./content/data";
import { makeWorld, ringAt, type WorldMap } from "./content/world";
import type { C, Maw } from "./systems/components";
import { Habitat } from "./systems/habitat";
import { aiSystem } from "./systems/ai";
import { motionSystem } from "./systems/motion";
import { feedSystem } from "./systems/feed";
import { gateSystem } from "./systems/gates";
import { directorSystem } from "./systems/director";

// the run's numbers in one place
export const RULES = {
  hatchLen: 50, grow: 1.11, walk: 200, swim: 235, turn: 9,
  drain: 1 / 85, mealEnergy: 0.55, xpBase: 2.4, xpStep: 1.15,
  coil: 0.55, reach: [1.1, 1.7], strikeOut: 0.14, strikeBack: 0.22, mouth: 0.42, cool: 0.18, cone: 0.7,
  canEat: 0.95, apexNeed: 0.85, hunterEats: 0.82, bite: 0.42, hunterRest: 5,
  reachWalk: 0.45, reachSwim: 1,
  climb: [2.1, 1.3, 0.9], leapK: [1, 2.3, 2.9, 3.4],
  pop: { floor: 120, frond: 90, shoals: 70, apex: 0 } as Record<string, number>,
  hunters: { floor: 2, frond: 3, shoals: 3, apex: 0 } as Record<string, number>,
  lightEvery: 6,          // rings that are not yours think once every this many steps
  view: 560,              // how far round you the screen shows, about (world units): births beyond it are out of sight
};

export class Game {
  readonly w = new World<C>();
  readonly rng: Rng;
  readonly clock = new Clock(60);
  readonly ev = new Events();
  readonly map: WorldMap;
  readonly hab: Habitat;
  readonly grid = new Grid(160);
  player!: Entity;
  stats = { meals: 0, maxRing: 0, t: 0 };
  offer: { trait: Trait; family: string; rank: number }[] | null = null;
  cause = "";
  seen = new Set<string>();
  timers = { director: 0, hint: 0 };   // systems keep their own timers here, never in module state (a run must replay)

  constructor(readonly seed: number) {
    this.rng = new Rng(seed);
    this.map = makeWorld(seed);
    this.hab = new Habitat(this.map);
    this.spawnPlayer();
    for (const ring of this.map.rings) this.populate(ring.i);
  }

  get maw(): Maw { return this.w.get(this.player, "maw")!; }
  ringOf(e: Entity): number { return this.w.get(e, "ring")?.i ?? 0; }
  lenOf(e: Entity): number { return this.w.get(e, "body")?.len ?? 0; }

  spawnPlayer(): void {
    const n = this.map.nest, traits = Object.fromEntries(TRAITS.map((t) => [t, 0])) as Record<Trait, number>;
    this.player = this.spawn({ key: "maw", len: RULES.hatchLen, x: n.x, y: n.y, ring: 0, speed: 1, turn: 720, alt: [0, 0.2] });
    this.w.add(this.player, "maw", { energy: 0.8, xp: 0, level: 1, owed: 0, traits, since: {}, meals: 0, ate: {}, coil: 0, holding: false, strike: null,
      state: "walk", move: null, input: { x: 0, y: 0 }, cool: 0, stunT: 0, heldBy: 0 });
    this.w.remove(this.player, "mind");
  }

  spawn(o: { key: string; len: number; x: number; y: number; ring: number; speed: number; turn: number; alt: [number, number] }): Entity {
    const a = this.rng.range(0, Math.PI * 2), seg = o.len / 8, pts: number[] = [];
    for (let i = 0; i < 9; i++) pts.push(o.x - Math.cos(a) * seg * i, o.y - Math.sin(a) * seg * i);
    const z = this.rng.range(o.alt[0], o.alt[1]);
    return this.w.spawn({ pos: { x: o.x, y: o.y }, vel: { x: 0, y: 0 }, alt: { z, goal: z, lo: o.alt[0], hi: o.alt[1] },
      body: { species: o.key, len: o.len, speed: o.speed, turn: o.turn, heading: a, phase: this.rng.range(0, 10) },
      spine: { pts, seg }, mind: { mode: "wander", target: 0, t: this.rng.range(0, 3), wander: a, calm: 0, light: false }, ring: { i: o.ring } });
  }

  // a creature of a kind, somewhere in a ring that suits it (or round a point), schools born together
  birth(sp: Species, ringI: number, near?: { x: number; y: number; d0: number; d1: number }, avoid?: (x: number, y: number) => boolean): Entity[] {
    const ring = this.map.rings[ringI], r0 = ringI === 3 ? 40 : ring.r0, r1 = ringI === 3 ? this.map.moat.r0 - 20 : ring.r1;
    const at = this.hab.place(sp, this.rng, { r0, r1, near, avoid, crowd: (x, y) => this.grid.near(x, y, 120).length });
    if (!at) return [];
    const n = sp.role !== "prey" ? 1 : sp.school >= 1.2 ? this.rng.int(3, 5) : sp.school >= 0.7 ? this.rng.int(2, 3) : 1, out: Entity[] = [];
    for (let k = 0; k < n; k++) {
      const len = lengthOf(sp, () => this.rng.next());
      out.push(this.spawn({ key: sp.key, len, x: at.x + this.rng.range(-40, 40) * (k ? 1 : 0), y: at.y + this.rng.range(-40, 40) * (k ? 1 : 0), ring: ringI, speed: sp.speed, turn: sp.turn, alt: sp.alt }));
    }
    for (const e of out) this.ev.emit({ type: "born", who: e, species: sp.key, ring: ringI });
    return out;
  }

  // a ring's people: prey by how well they suit it, its hunters, and its apex
  populate(ringI: number): void {
    const id = this.map.rings[ringI].id, here = SPECIES.filter((s) => s.rings.includes(id));
    const prey = here.filter((s) => s.role === "prey"), hunters = here.filter((s) => s.role === "hunter"), apex = here.find((s) => s.role === "apex");
    let n = 0, guard = 0;
    while (n < RULES.pop[id] && guard++ < 400) { const sp = this.rng.weighted(prey, (s) => (s.key === "wisp" ? 3 : 1) / s.tier)!; n += this.birth(sp, ringI).length; this.reindex(); }
    for (let k = 0; k < RULES.hunters[id]; k++) this.birth(this.rng.pick(hunters), ringI);
    if (apex) this.birth(apex, ringI);
    this.reindex();
  }

  reindex(): void { this.grid.clear(); for (const [e, p] of this.w.query("pos")) this.grid.insert(e, p.x, p.y); }

  // can `a` eat `b`, by size (and the apex rule)?
  canEat(a: Entity, b: Entity): boolean {
    const ba = this.w.get(a, "body"), bb = this.w.get(b, "body"); if (!ba || !bb || a === b) return false;
    if (a === this.player) { const sp = BY_KEY[bb.species]; return sp?.role === "apex" ? ba.len >= bb.len * RULES.apexNeed : bb.len < ba.len * RULES.canEat; }
    return bb.len < ba.len * RULES.hunterEats;
  }

  // one fixed step: every system, in order
  step(): void {
    const dt = this.clock.dt, m = this.maw;
    if (m.state === "dead" || m.state === "won") return;
    this.reindex();
    aiSystem(this, dt);
    feedSystem(this, dt);
    motionSystem(this, dt);
    gateSystem(this, dt);
    directorSystem(this, dt);
    const pr = this.w.get(this.player, "ring")!, pp = this.w.get(this.player, "pos")!;
    if (m.state !== "climb" && m.state !== "leap") pr.i = ringAt(this.map, pp.x, pp.y);
    this.stats.maxRing = Math.max(this.stats.maxRing, pr.i);
    this.stats.t += dt;
    this.w.flush();
    this.clock.tick();
    this.ev.clear();
  }
}
