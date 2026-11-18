import { describe, it, expect } from "vitest";
import { World } from "../src/core/ecs";
import { Clock } from "../src/core/clock";
import { Schedule } from "../src/core/schedule";

describe("the core", () => {
  it("queries return every entity with all the components, and despawn waits for the end of the step", () => {
    const w = new World<{ pos: { x: number }; vel: { x: number } }>();
    const a = w.spawn({ pos: { x: 1 }, vel: { x: 2 } }), b = w.spawn({ pos: { x: 3 } });
    expect([...w.query("pos", "vel")].map((r) => r[0])).toEqual([a]);
    w.despawn(a); expect(w.alive.has(a)).toBe(true); w.flush(); expect(w.alive.has(a)).toBe(false);
    expect([...w.query("pos")].map((r) => r[0])).toEqual([b]);
  });
  it("the clock steps in whole quanta, carries the remainder, and slows with its scale", () => {
    const c = new Clock(240);
    expect(c.advance(1 / 60)).toBeCloseTo(4 / 240, 10); expect(c.advance(0.001)).toBe(0); expect(c.advance(0.0035)).toBeCloseTo(1 / 240, 10);
    expect(c.advance(1)).toBeCloseTo(12 / 240, 10);          // a long frame: capped, the backlog dropped
    c.scale = 0.5; expect(c.fixed()).toBeCloseTo(2 / 240, 10); expect(c.steps).toBe(4);
  });
  it("systems run in the order they were added, gated by when and on", () => {
    const s = new Schedule(), log: string[] = []; let gate = false;
    s.add("a", () => log.push("a")).add("b", () => log.push("b"), () => gate).add("c", () => log.push("c"));
    s.run(0.016); gate = true; s.get("a")!.on = false; s.run(0.016);
    expect(log).toEqual(["a", "c", "b", "c"]); expect(Object.keys(s.report())).toEqual(["a", "b", "c"]);
  });
});
