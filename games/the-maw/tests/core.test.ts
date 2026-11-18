import { describe, it, expect } from "vitest";
import { World } from "../src/core/ecs";
import { Rng, seedOf } from "../src/core/rng";
import { Clock } from "../src/core/clock";
import { makeWorld, ringAt } from "../src/content/world";

describe("core", () => {
  it("the same seed draws the same numbers; a fork does not disturb its parent's other draws", () => {
    const a = new Rng(42), b = new Rng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
    expect(seedOf("the maw")).toBe(seedOf("the maw"));
  });
  it("queries return every entity with all the components, and despawn waits for the end of the step", () => {
    const w = new World<{ pos: { x: number }; vel: { x: number } }>();
    const a = w.spawn({ pos: { x: 1 }, vel: { x: 2 } }), b = w.spawn({ pos: { x: 3 } });
    expect([...w.query("pos", "vel")].map((r) => r[0])).toEqual([a]);
    w.despawn(a); expect(w.alive.has(a)).toBe(true); w.flush(); expect(w.alive.has(a)).toBe(false);
    expect([...w.query("pos")].map((r) => r[0])).toEqual([b]);
  });
  it("the clock runs fixed steps whatever the frame time", () => {
    const c = new Clock(60); expect(c.advance(1 / 30)).toBe(2); expect(c.advance(0.001)).toBe(0); c.scale = 0; expect(c.advance(1)).toBe(0);
  });
  it("a world from a seed is the same world; rings are found by radius", () => {
    const a = makeWorld(7), b = makeWorld(7), c = makeWorld(8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(JSON.stringify(a.gates)).not.toBe(JSON.stringify(c.gates));
    expect(a.gates.filter((g) => g.kind === "tower")).toHaveLength(3); expect(a.gates.filter((g) => g.kind === "stair")).toHaveLength(2);
    expect(ringAt(a, 2200, 0)).toBe(0); expect(ringAt(a, 1400, 0)).toBe(1); expect(ringAt(a, 800, 0)).toBe(2); expect(ringAt(a, 100, 0)).toBe(3);
  });
});
