// Systems talk through events, not through each other's code. A system emits ("ate", { by, prey }) and any other system that
// cares reads it, in the same step, after the emitter has run (systems run in a fixed order). Events are plain data.

import type { Entity } from "./ecs";

export type GameEvent =
  | { type: "ate"; by: Entity; prey: Entity; species: string; family: string; size: number; isPlayer: boolean }
  | { type: "caught"; by: Entity; prey: Entity }
  | { type: "died"; who: Entity; cause: "eaten" | "starved"; by?: string }
  | { type: "level"; level: number }
  | { type: "mutated"; id: string; family: string; trait: string; rank: number }
  | { type: "climbed"; from: number; to: number }
  | { type: "gate"; ring: number; open: boolean; need: string }
  | { type: "apex"; species: string; ring: number }
  | { type: "won" }
  | { type: "born"; who: Entity; species: string; ring: number }
  | { type: "seen"; species: string };

export class Events {
  private now: GameEvent[] = [];
  private listeners = new Map<string, ((e: GameEvent) => void)[]>();
  emit(e: GameEvent): void { this.now.push(e); for (const f of this.listeners.get(e.type) ?? []) f(e); }
  // every event of a type emitted this step
  of<T extends GameEvent["type"]>(type: T): Extract<GameEvent, { type: T }>[] { return this.now.filter((e) => e.type === type) as Extract<GameEvent, { type: T }>[]; }
  on<T extends GameEvent["type"]>(type: T, f: (e: Extract<GameEvent, { type: T }>) => void): void {
    const l = this.listeners.get(type) ?? []; l.push(f as (e: GameEvent) => void); this.listeners.set(type, l);
  }
  // the end of a step
  clear(): void { this.now.length = 0; }
}
