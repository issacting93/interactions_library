// The entity component system. An entity is a number; a component is plain data kept in a Map per kind; a system is a function
// over the world. Components are plain objects (no methods, no classes) so a run can be saved, replayed and later ported to Bevy.
//
//   const w = new World<Components>();
//   const e = w.spawn({ pos: { x: 0, y: 0 }, body: {...} });
//   for (const [e, pos, vel] of w.query("pos", "vel")) { ... }
//   w.despawn(e)   (queued: entities leave at the end of the step, so a query in progress is never cut short)

export type Entity = number;

export class World<C extends Record<string, unknown>> {
  private next = 1;
  private stores = new Map<keyof C, Map<Entity, unknown>>();
  private dead: Entity[] = [];
  readonly alive = new Set<Entity>();

  spawn(comps: Partial<C>): Entity {
    const e = this.next++;
    this.alive.add(e);
    for (const k in comps) if (comps[k] !== undefined) this.add(e, k, comps[k] as C[typeof k]);
    return e;
  }
  add<K extends keyof C>(e: Entity, k: K, v: C[K]): C[K] {
    let s = this.stores.get(k);
    if (!s) this.stores.set(k, (s = new Map()));
    s.set(e, v);
    return v;
  }
  remove<K extends keyof C>(e: Entity, k: K): void { this.stores.get(k)?.delete(e); }
  get<K extends keyof C>(e: Entity, k: K): C[K] | undefined { return this.stores.get(k)?.get(e) as C[K] | undefined; }
  has<K extends keyof C>(e: Entity, k: K): boolean { return !!this.stores.get(k)?.has(e); }
  despawn(e: Entity): void { if (this.alive.has(e)) this.dead.push(e); }
  // the end of a step: queued entities go
  flush(): void {
    for (const e of this.dead) { this.alive.delete(e); for (const s of this.stores.values()) s.delete(e); }
    this.dead.length = 0;
  }
  count<K extends keyof C>(k: K): number { return this.stores.get(k)?.size ?? 0; }

  // every entity that has all the named components, with them, in order. Iterates the smallest store.
  *query<K extends (keyof C)[]>(...ks: K): Generator<[Entity, ...{ [I in keyof K]: C[K[I]] }]> {
    const ss = ks.map((k) => this.stores.get(k));
    if (ss.some((s) => !s)) return;
    const stores = ss as Map<Entity, unknown>[];
    let small = stores[0];
    for (const s of stores) if (s.size < small.size) small = s;
    outer: for (const e of small.keys()) {
      if (!this.alive.has(e)) continue;
      const out: unknown[] = [e];
      for (const s of stores) { const v = s.get(e); if (v === undefined) continue outer; out.push(v); }
      yield out as [Entity, ...{ [I in keyof K]: C[K[I]] }];
    }
  }
}
