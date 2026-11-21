// The Rust engine against the TypeScript core it takes over from: the same numbers, piece by piece. Loads the script as shipped
// (shared/engine/ecology/eco-engine.js, from `npm run build:engine`), so this checks the WebAssembly the tank actually runs.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Rng, seedOf } from "../src/core/rng";
import { Clock } from "../src/core/clock";
import * as Web from "../src/core/web";

const built = fileURLToPath(new URL("../../../shared/engine/ecology/eco-engine.js", import.meta.url));
const g = globalThis as any;
g.ECO_ENGINE = "js";   // load it without taking anything over: the pieces are compared side by side
if (existsSync(built)) new Function(readFileSync(built, "utf8"))();
const E = g.EcoEngine;

describe.skipIf(!E)("the Rust engine matches the TypeScript core", () => {
  it("started", () => { expect(E.exports, E.why).toBeTruthy(); expect(E.on).toBe(false); expect(E.version).toBeGreaterThan(0); });

  it("random: the same stream from a seed, draw for draw", () => {
    for (const seed of [1, 7, 4242, 0, 0xffffffff, seedOf("the maw"), 123456789]) {
      const r = new Rng(seed); E.seed(seed);
      for (let i = 0; i < 20000; i++) if (r.next() !== E.random()) throw new Error(`seed ${seed} differs at draw ${i}`);
    }
  });

  it("clock: the same steps from the same frames", () => {
    const frames = new Rng(5);
    for (const [quanta, maxQ] of [[240, 12], [1200, 60]]) {
      const a = new Clock(quanta, maxQ), b = new E.Clock(quanta, maxQ);
      expect(b.q).toBe(a.q);
      for (let i = 0; i < 5000; i++) {
        if (i % 700 === 0) a.scale = b.scale = i % 1400 === 0 ? 1 : 0.06;
        const wall = i % 997 === 0 ? 3 : frames.range(0, 0.03);
        const x = i % 13 === 0 ? a.fixed(20) : a.advance(wall), y = i % 13 === 0 ? b.fixed(20) : b.advance(wall);
        if (x !== y || a.t !== b.t || a.steps !== b.steps) throw new Error(`clock ${quanta} differs at frame ${i}: ${x} ${y}`);
      }
    }
  });

  it("web: the same answer for any two bodies", () => {
    const r = new Rng(11), rules = [Web.WEB, { band: [2, 100] as [number, number], plate: 2, claw: 0.6 }, { band: [1.5, 40] as [number, number], plate: 3, claw: 0.5 }];
    const one = () => Web.body({ kind: r.int(0, 5), length: r.range(0.2, 9), plate: r.chance(0.3), claw: r.chance(0.3), jaw: r.chance(0.3) ? r.range(0.2, 1.2) : 0, sieve: r.chance(0.2), schools: r.chance(0.2), hunts: r.chance(0.6) });
    for (let i = 0; i < 20000; i++) {
      const a = one(), b = one(), R = rules[i % 3];
      expect(E.Web.ratio(a, b, R)).toBe(Web.ratio(a, b, R));
      expect(E.Web.eats(a, b, R)).toBe(Web.eats(a, b, R));
      expect(E.Web.fears(a, b, R)).toBe(Web.fears(a, b, R));
      expect(E.Web.refusal(a, b, R)).toBe(Web.refusal(a, b, R));
    }
    const a = one(), b = one();
    expect(E.Web.eats(a, b)).toBe(Web.eats(a, b));   // the default rules
  });

  // a world of plain creatures: slot = place reversed, so place and slot are never confused
  const world = (fish: { x: number; y: number; sp: number; skip: boolean }[]) => {
    const w = new E.World(), n = fish.length; w.reserve(n); w.reserveList(n); w.setSpecies(8);
    fish.forEach((f, i) => { const s = n - 1 - i; w.ord[i] = s; w.data[s * 24] = f.x; w.data[s * 24 + 1] = f.y; w.sp[s] = f.sp; w.skip[s] = f.skip ? 1 : 0; });
    return w;
  };
  it("sense: each cell lists the same creatures in the same order as the tank's Map grid, and counts the same density", () => {
    const r = new Rng(3);
    for (const n of [0, 1, 300, 2500]) {
      const cell = r.range(20, 60), fish = Array.from({ length: n }, () => ({ x: r.range(-200, 1400), y: r.range(-100, 900), sp: r.int(0, 6), skip: r.chance(0.1) }));
      const s = world(fish);
      expect(s.sense(n, cell, true)).toBe(true);
      // the tank's grid, as ecology-sim.js builds it
      const key = (gx: number, gy: number) => (gx + 8192) * 16384 + (gy + 8192), grid = new Map<number, number[]>();
      fish.forEach((f, i) => { const k = key(Math.floor(f.x / cell), Math.floor(f.y / cell)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); });
      const at = (gx: number, gy: number) => { const cx = gx - s.gx0, cy = gy - s.gy0; if (cx < 0 || cy < 0 || cx >= s.cols || cy >= s.rows) return []; const c = cx + cy * s.cols; return Array.from(s.order.subarray(s.starts[c], s.starts[c + 1])); };
      for (let gy = s.gy0 - 1; gy <= s.gy0 + s.rows; gy++) for (let gx = s.gx0 - 1; gx <= s.gx0 + s.cols; gx++) expect(at(gx, gy)).toEqual(grid.get(key(gx, gy)) || []);
      fish.forEach((f, i) => {
        let cnt = 0;
        if (!f.skip) { const gx = Math.floor(f.x / cell), gy = Math.floor(f.y / cell);
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const j of grid.get(key(gx + ox, gy + oy)) || []) {
            const o = fish[j]; if (j === i || o.skip || o.sp !== f.sp) continue; const dx = o.x - f.x, dy = o.y - f.y; if (dx * dx + dy * dy <= cell * cell) cnt++; } }
        if (s.density[i] !== cnt) throw new Error(`density of ${i} of ${n}: ${s.density[i]} against ${cnt}`);
      });
    }
  });

  it("sense: refuses a position that is not a number, so the tank falls back to its own grid", () => {
    const fish = [{ x: 1, y: 1, sp: 0, skip: false }, { x: NaN, y: 0, sp: 0, skip: false }], s = world(fish);
    expect(s.sense(2, 10)).toBe(false);
    s.data[0] = 4; expect(s.sense(2, 10)).toBe(true);   // the creature at place 1 is in slot 0
  });

  it("the views are taken again when the engine's memory grows, and what was written is still there", () => {
    const w = new E.World(); w.reserve(4); w.data[24 * 3 + 1] = 7.5; const gen = w.gen;
    const big = new E.World(); big.reserve(200000);   // enough to grow the memory
    expect(w.gen).toBeGreaterThan(gen); expect(w.data.length).toBeGreaterThan(0); expect(w.data[24 * 3 + 1]).toBe(7.5);
  });

  it("takes over the core's names, and a seed still gives the same stream", () => {
    const core: any = { seedOf, Web: { ...Web }, rng: new Rng(99) };
    const want = new Rng(99), again = new Rng(seedOf("ring 3"));
    expect(E.use(core)).toBe(true);
    expect(E.on).toBe(true); expect(core.engine).toBe("rust");
    for (let i = 0; i < 100; i++) expect(core.random()).toBe(want.next());   // carries on from where the core's stream stood
    core.reseed("ring 3"); for (let i = 0; i < 100; i++) expect(core.random()).toBe(again.next());
    expect(core.Web.body).toBe(Web.body);   // what the engine does not have stays the core's
    expect(new core.Clock(240, 12).fixed(4)).toBe(new Clock(240, 12).fixed(4));
  });
});
