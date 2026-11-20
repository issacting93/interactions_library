// The food web in the core (src/core/web.ts): one relation over bodies
import { describe, it, expect } from "vitest";
import { body, eats, fears, ratio, refusal, resize, WEB } from "../src/core/web";

describe("the web over bodies", () => {
  const hunter = () => body({ kind: "hunter", length: 2.2, hunts: true }), plain = (k = "plain", length = 1) => body({ kind: k, length });
  it("weight is length cubed, and the band is 2 to 100 times lighter", () => {
    const h = hunter(), p = plain();
    expect(h.weight).toBeCloseTo(2.2 ** 3, 6); expect(ratio(h, p)).toBeCloseTo(2.2 ** 3, 6); expect(eats(h, p)).toBe(true);
    expect(eats(p, h)).toBe(false); expect(eats(plain("a", 1.2), plain("b", 1))).toBe(false);       // 1.73 times: too near its own weight
    expect(eats(body({ kind: "giant", length: 5 }), plain())).toBe(false);                           // 125 times: not worth it
    expect(WEB.band).toEqual([2, 100]);
  });
  it("nothing eats its own kind", () => { expect(eats(body({ kind: 1, length: 3 }), body({ kind: 1, length: 1 }))).toBe(false); expect(refusal(body({ kind: 1, length: 3 }), body({ kind: 1, length: 1 }))).toBe("own kind"); });
  it("plate asks for a heavier hunter; claws and a jaw take prey nearer their own weight", () => {
    const h = body({ kind: "h", length: 1.5 }), p = plain();                                          // 3.4 times
    expect(eats(h, p)).toBe(true); expect(eats(h, body({ kind: "p", length: 1, plate: true }))).toBe(false);
    const near = body({ kind: "n", length: 1.15 });                                                   // 1.52 times
    expect(eats(near, p)).toBe(false); expect(eats(body({ kind: "n", length: 1.15, claw: true }), p)).toBe(true); expect(eats(body({ kind: "n", length: 1.15, jaw: 0.5 }), p)).toBe(true);
  });
  it("claws and a jaw do not add up", () => { const p = body({ kind: "p", length: 1 }); expect(ratio(body({ kind: "m", length: 1, claw: true, jaw: 0.5 }), p)).toBeCloseTo(2, 6); });
  it("far smaller prey is food only to a sieve, or when it schools", () => {
    const g = body({ kind: "g", length: 5 }), p = plain();
    expect(refusal(g, p)).toBe("too small"); expect(eats(body({ kind: "g", length: 5, sieve: true }), p)).toBe(true); expect(eats(g, body({ kind: "s", length: 1, schools: true }))).toBe(true);
  });
  it("prey fear what hunts and could eat them", () => {
    const h = hunter(), p = plain(), grazer = body({ kind: "big grazer", length: 2.2 });
    expect(fears(p, h)).toBe(true); expect(fears(h, p)).toBe(false); expect(fears(p, grazer)).toBe(false);
  });
  it("a body that grows takes what it could not", () => {
    const m = body({ kind: "maw", length: 1.1, jaw: 0.5, hunts: true }), big = plain("big", 1.12);
    expect(eats(m, big)).toBe(false); resize(m, 1.5); expect(eats(m, big)).toBe(true);
  });
});
