// The run layer against the tank's real places (shared/engine/ecology/maw-stages.js, loaded as the page loads it)
import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import * as Run from "../src/run/run";
import { Rng, seedOf } from "../src/core/rng";

const g = { window: {} as Record<string, unknown>, localStorage: { getItem: () => null, setItem: () => {} } };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../../shared/engine/ecology/maw-stages.js"), "utf8"), g);
const PLACES = (g.window.MawStages as { LIST: Run.Place[] }).LIST;

describe("a run", () => {
  it("the same seed draws the same numbers", () => {
    const a = new Rng(42), b = new Rng(42); expect([a.next(), a.next()]).toEqual([b.next(), b.next()]); expect(seedOf("maw")).toBe(seedOf("maw"));
  });
  it("is the seven places in order, varied by its seed, the same seed the same run", () => {
    const a = Run.create(7, PLACES), b = Run.create(7, PLACES), c = Run.create(8, PLACES);
    expect(a.rings.map((r) => r.place.id)).toEqual(PLACES.map((p) => p.id));
    expect(JSON.stringify(a.rings)).toBe(JSON.stringify(b.rings)); expect(JSON.stringify(a.rings)).not.toBe(JSON.stringify(c.rings));
    for (const r of a.rings) { for (const k of Object.keys(PLACES[r.i].roster)) expect(r.place.roster[k]).toBeGreaterThanOrEqual(1);
      expect(r.gate.x).toBeGreaterThan(0.1); expect(r.gate.x).toBeLessThan(0.9); }
    expect(PLACES[0].roster.worm).toBe(8);   // the places themselves are never changed
  });
  it("opens a gate on the key, goes inward through it, and is won at the last ring", () => {
    const r = Run.create(3, PLACES);
    expect(Run.advance(r)).toBeNull();                     // shut: no way in yet
    expect(Run.open(r)).toBe("opened"); expect(Run.advance(r)?.place.id).toBe("frond"); expect(r.open).toBe(false);
    while (!Run.last(r)) { Run.open(r); Run.advance(r); }
    expect(Run.open(r)).toBe("won"); expect(r.state).toBe("won");
  });
  it("carries what it saw and ate into the nest, and says what was new", () => {
    const nest = Run.emptyNest(), r = Run.create(5, PLACES);
    Run.ate(r, "worm"); Run.ate(r, "worm"); Run.open(r); Run.advance(r); Run.end(r, "eaten");
    const out = Run.record(nest, r);
    expect(nest.runs).toBe(1); expect(nest.eaten.worm).toBe(2); expect(nest.deepest).toBe(1); expect(out.deeper).toBe(true); expect(out.fresh.length).toBeGreaterThan(5);
    const r2 = Run.create(6, PLACES); Run.end(r2, "starved"); expect(Run.record(nest, r2).fresh).toEqual(r2.seen.filter((k) => !out.fresh.includes(k)));
    expect(Run.readNest(JSON.stringify(nest)).runs).toBe(2); expect(Run.readNest("{bad").runs).toBe(0);
  });
});
