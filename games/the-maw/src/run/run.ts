// The Maw's run: the roguelike layer over the Cybernetic Ecology tank. The tank owns everything alive (creatures, the Maw's rig,
// eating, mutations, the look); a run owns the structure round it:
//   rings     the tank's seven places, always in order, always inward. Each run varies them from its seed (how many of each
//             creature, how many landmarks, the ground), so no two runs are the same place twice.
//   gates     every ring has one way in. Its key is the place's goal (eyes, swim, sonar, a climber eaten, a size): when the Maw
//             has it, the gate opens at a spot on the floor, and reaching it takes the Maw inward, as it is, to the next ring.
//   mission   a run is written as a mission before it is built as places (after Dormans, "Adventures in Level Design", 2010: the
//             mission first, then the space to fit it). Every place is a beat: what the Maw must already have to live there
//             (needs: what the place's own kit presumes) and what clearing it leaves the Maw with (gives: what its goal asks for).
//             A run may leave places out, to be shorter, but only ones nothing later depends on: the mission is checked so that
//             every beat's needs were given by a beat before it. The rings are then built from the beats, in order.
//   the nest  death ends the run. What was seen and eaten carries over in the bestiary; so do the deepest ring and the runs.
// Pure data and rules: no DOM, no tank globals. The tank page calls in (see the run block in Cybernetic Ecology.html).
import { Rng, seedOf } from "../core/rng";

export interface Place {
  id: string; n: number; name: string; place: string; verb: string; brief: string; trick: string;
  roster: Record<string, number>; crew: Record<string, number>; props?: Record<string, number>;
  env: { dark: number; ruins: boolean }; kit: Record<string, unknown>; goal: Record<string, unknown>;
}
export interface Ring { i: number; place: Place; seed: number; gate: { x: number; y: number } }   // gate: a share of the tank (0..1)
export interface Beat { id: string; needs: string[]; gives: string[]; optional: boolean }   // optional: nothing after it needs what only it gives
export interface Mission { beats: Beat[]; dropped: string[]; shortest: number; missing: { id: string; need: string }[] }   // missing: needs no earlier beat gives (a place edited into a dead end)
export type RunState = "play" | "dead" | "won";
export interface Run {
  seed: number; mission: Mission; rings: Ring[]; i: number; open: boolean; state: RunState; why: string; t: number;
  eaten: Record<string, number>; seen: string[]; meals: number; ringT: number[];
}

// how much a ring can differ from the place it comes from
export const VARY = { roster: [0.7, 1.35], props: [0.6, 1.5], gateX: [0.16, 0.84], gateY: [0.2, 0.72], extra: 0.5 };

// ---- the mission: which places, and that they can be cleared in that order ----
// the abilities a kit or a goal names: every key that is not a size or a count. A size (mass, tier) or a count (meals, parts, what to eat)
// is not one: the Maw grows into it by eating, wherever it is. So any ability a place can ask for is tracked (eyes, sonar, cloak, lure, puff,
// sting, harpoon, hitch, leap, infect, brood, mimic, spit, climb, ...), and a form other than walking (form: "swim") is one too.
// A place may also say outright what it needs and gives (needs, gives: lists), for what its kit and goal cannot say.
const NOT_ABILITY = new Set(["mass", "tier", "meals", "parts", "eat", "form"]);
const ABILITY = (o: Record<string, unknown> | undefined): string[] => { const out: string[] = []; if (!o) return out;
  for (const k in o) if (o[k] && !NOT_ABILITY.has(k)) out.push(k);
  if (typeof o.form === "string" && o.form !== "walk") out.push(o.form); return out; };
const both = (a: string[], b: unknown): string[] => [...new Set([...a, ...(Array.isArray(b) ? (b as string[]) : [])])];
export const beatOf = (p: Place): Beat => ({ id: p.id, needs: both(ABILITY(p.kit), (p as unknown as { needs?: string[] }).needs), gives: both(ABILITY(p.goal), (p as unknown as { gives?: string[] }).gives), optional: false });
// what each beat needs that nothing before it gave (the first beat's needs are its kit: the Maw is handed them)
export function unmet(beats: Beat[]): { id: string; need: string }[] {
  const have = new Set<string>(beats[0]?.needs ?? []), out: { id: string; need: string }[] = [];
  for (const b of beats) { for (const n of b.needs) if (!have.has(n)) out.push({ id: b.id, need: n }); for (const g of b.gives) have.add(g); }
  return out;
}
// the mission for a run: every place by default; with `rings` fewer, leaving out places (never the first or the last) that nothing
// later depends on, chosen by the seed. It never goes below the shortest mission that can still be cleared
export function mission(places: Place[], rng: Rng, rings?: number): Mission {
  const all = places.map(beatOf), missing = unmet(all), bad = missing.length;
  const without = (bs: Beat[], id: string) => bs.filter((b) => b.id !== id), ok = (bs: Beat[]) => unmet(bs).length <= bad;
  const inner = all.slice(1, -1); for (const b of inner) b.optional = ok(without(all, b.id));
  // the shortest: drop every beat that can go, last first (a later beat can free an earlier one, never the other way)
  let short = all; for (const b of inner.slice().reverse()) if (ok(without(short, b.id))) short = without(short, b.id);
  const want = Math.max(short.length, Math.min(all.length, Math.round(rings ?? all.length)));
  let beats = all; const dropped: string[] = [];
  while (beats.length > want) { const can = beats.slice(1, -1).filter((b) => ok(without(beats, b.id))); if (!can.length) break; const b = rng.pick(can); beats = without(beats, b.id); dropped.push(b.id); }
  return { beats, dropped, shortest: short.length, missing };
}

export function create(seed: number | string, places: Place[], opts: { rings?: number } = {}): Run {
  const s = typeof seed === "number" ? seed >>> 0 : seedOf(seed), rng = new Rng(s);
  const plan = mission(places, rng.fork(1000), opts.rings), at = (id: string) => places.findIndex((p) => p.id === id);
  // the space after the mission: each beat's place, varied by its own stream (a place draws the same whether or not others were left out)
  const rings = plan.beats.map((b, i) => ring(places[at(b.id)], i, rng.fork(at(b.id) + 1), i ? places[at(plan.beats[i - 1].id)] : undefined));
  return { seed: s, mission: plan, rings, i: 0, open: false, state: "play", why: "", t: 0, eaten: {}, seen: Object.keys(rings[0].place.roster), meals: 0, ringT: [0] };
}

// one place, varied by the run: every count scaled, sometimes a creature borrowed from the ring before (the food web leaks
// between neighbours), its ground and its gate where the seed puts them
function ring(p: Place, i: number, r: Rng, prev: Place | undefined): Ring {
  const scale = (o: Record<string, number> | undefined, [a, b]: number[], min: number) =>
    Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Math.max(min, Math.round(v * r.range(a, b)))]));
  const roster = scale(p.roster, VARY.roster, 1);
  if (prev && r.chance(VARY.extra)) { const k = r.pick(Object.keys(prev.roster).filter((k) => !(k in roster) && k !== "wisp")); if (k) roster[k] = Math.max(2, Math.round(prev.roster[k] * 0.5)); }
  const place: Place = { ...p, roster, props: scale(p.props, VARY.props, 0), crew: { ...p.crew } };
  return { i, place, seed: r.int(1, 1e9), gate: { x: r.range(VARY.gateX[0], VARY.gateX[1]), y: r.range(VARY.gateY[0], VARY.gateY[1]) } };
}

export const current = (run: Run): Ring => run.rings[run.i];
export const last = (run: Run): boolean => run.i >= run.rings.length - 1;

// the key is in hand: the gate opens (the last ring has no gate: meeting its goal ends the run, won)
export function open(run: Run): "opened" | "won" | null {
  if (run.state !== "play" || run.open) return null;
  if (last(run)) { run.state = "won"; run.why = "apex"; return "won"; }
  run.open = true; return "opened";
}
// through the gate: the next ring inward
export function advance(run: Run): Ring | null {
  if (run.state !== "play" || !run.open || last(run)) return null;
  run.i++; run.open = false; run.ringT.push(run.t);
  for (const k of Object.keys(current(run).place.roster)) if (!run.seen.includes(k)) run.seen.push(k);
  return current(run);
}
export function ate(run: Run, key: string): void { run.meals++; run.eaten[key] = (run.eaten[key] ?? 0) + 1; if (!run.seen.includes(key)) run.seen.push(key); }
export function tick(run: Run, dt: number): void { if (run.state === "play") run.t += dt; }
export function end(run: Run, why: string): void { if (run.state === "play") { run.state = "dead"; run.why = why; } }

// ---- the nest: what carries between runs ----
export interface Nest { runs: number; won: number; deepest: number; best: { ring: number; t: number } | null; eaten: Record<string, number>; seen: string[] }
export const NEST_KEY = "maw-nest-v1";
export const emptyNest = (): Nest => ({ runs: 0, won: 0, deepest: 0, best: null, eaten: {}, seen: [] });
export function readNest(raw: string | null): Nest { try { const n = raw ? JSON.parse(raw) : null; return n ? { ...emptyNest(), ...n } : emptyNest(); } catch { return emptyNest(); } }
// a finished run into the nest: returns what was new (species never seen before, a new deepest ring)
export function record(nest: Nest, run: Run): { fresh: string[]; deeper: boolean } {
  const fresh = run.seen.filter((k) => !nest.seen.includes(k));
  nest.seen.push(...fresh); nest.runs++; if (run.state === "won") nest.won++;
  for (const [k, n] of Object.entries(run.eaten)) nest.eaten[k] = (nest.eaten[k] ?? 0) + n;
  const deeper = run.i > nest.deepest || (run.state === "won" && nest.deepest < run.rings.length);
  nest.deepest = Math.max(nest.deepest, run.state === "won" ? run.rings.length : run.i);
  if (!nest.best || run.i > nest.best.ring || (run.i === nest.best.ring && run.t < nest.best.t)) nest.best = { ring: run.i, t: run.t };
  return { fresh, deeper };
}
