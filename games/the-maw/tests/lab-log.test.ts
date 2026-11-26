// The lab's event log (packages/lab/lab-log.js), loaded as a page loads it
import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
const g = { window: {} as Record<string, any> };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../../packages/lab/lab-log.js"), "utf8"), g);
const F = g.window.ForgeLog;
function sample(seed = 7) { const l = F.create({ page: "field", level: "Duel", seed });
  F.ev(l, 1.234, "meal", { pred: "Maw", prey: "Sigil Koi" }); F.ev(l, 2, "meal", { pred: "Blade Hunter", prey: "Glass Star" }); F.ev(l, 3, "death", { who: "Charge", cause: "killed", by: "Maw" }); F.ev(l, 60, "end", { why: "time" }); return l; }
describe("ForgeLog", () => {
  it("keeps simulation time to the hundredth and counts by type and per minute", () => {
    const s = F.summary(sample()); expect(sample().events[0].t).toBe(1.23); expect(s.byType).toEqual({ meal: 2, death: 1, end: 1 }); expect(s.mawMeals).toBe(1); expect(s.mawMealsPerMin).toBe(1); expect(s.perMin.meal).toBe(2); expect(s.secs).toBe(60);
  });
  it("gives the same digest for the same events, and another for any change", () => {
    expect(F.digest(sample())).toBe(F.digest(sample(8))); const b = sample(); b.events[1].prey = "Sigil Koi"; expect(F.digest(b)).not.toBe(F.digest(sample()));
  });
  it("round trips through JSON lines, and refuses what is not a log", () => {
    const l = sample(), back = F.fromJSONL(F.toJSONL(l)); expect(back.events).toEqual(l.events); expect(back.seed).toBe(7); expect(F.digest(back)).toBe(F.digest(l));
    expect(() => F.fromJSONL('{"format":"nope"}')).toThrow(); expect(() => F.fromJSONL('{"format":"forge-log","version":9}')).toThrow();
  });
  it("writes a table with a column for every field any event has", () => {
    const csv = F.toCSV(sample()).trim().split("\n"); expect(csv[0]).toBe("t,type,pred,prey,who,cause,by,why"); expect(csv.length).toBe(5); expect(csv[3]).toBe("3,death,,,Charge,killed,Maw,");
  });
  it("stops at its cap and counts what it dropped", () => { const l = F.create({}); l.events.length = F.CAP; F.ev(l, 1, "x"); expect(l.dropped).toBe(1); });
});
