// Who eats whom, from bodies. One relation for everything alive: a swimmer, a walker of the floor crew, the Maw.
//
// A Body is what a creature is, as far as eating goes: its kind, its length (in the tank's length units: a plain creature at scale 1
// is 1 long) and so its weight (length cubed), whether it is plated, clawed or all mouth, and how it takes its food.
//   const a = body({ kind: 3, length: 2.2, hunts: true }), b = body({ kind: 5, length: 1 });
//   eats(a, b)    true: a is between 2 and 100 times b's weight
//   fears(b, a)   true: a hunts, and could eat b
// The band is the range in which a hunter bothers: prey nearer its own weight is too much to bring down, prey far lighter is not worth
// the chase (unless the hunter sieves, or the prey schools). The upper end is from Brose, Williams and Martinez (2006), who find food
// webs persist best with hunters 10 to 100 times their prey's weight; the lower end, 2, is the game's own choice, so that near
// neighbours in size still eat each other.
// Plate makes prey count as heavier; claws let a hunter take prey nearer its own weight; a jaw (the Maw's) likewise, by its own factor.
// What a species was written to eat beyond this (its hand menu) is the caller's business: exceptions sit on top of the web, not in it.

export type Medium = "water" | "ground" | "air";
export interface Body {
  kind: number | string;      // its species: nothing eats its own kind
  length: number; weight: number;
  plate: boolean; claw: boolean;
  jaw: number;                // 0: none. Otherwise the factor its mouth gives it (under 1: it takes prey nearer its own weight)
  sieve: boolean;             // grazes or spins its food in: prey far lighter than itself is still food
  schools: boolean;           // keeps to a school: worth a big hunter's while though each is small
  hunts: boolean;             // eats other creatures at all (a grazer of wisps does not)
  medium: Medium;
}
export interface WebRules { band: [number, number]; plate: number; claw: number }
export const WEB: WebRules = { band: [2, 100], plate: 2, claw: 0.6 };

export function body(init: Partial<Body> & { kind: number | string; length: number }): Body {
  const b: Body = { kind: init.kind, length: 0, weight: 0, plate: !!init.plate, claw: !!init.claw, jaw: init.jaw || 0, sieve: !!init.sieve, schools: !!init.schools, hunts: !!init.hunts, medium: init.medium || "water" };
  return resize(b, init.length);
}
// a body that grew or shrank: its weight follows its length
export function resize(b: Body, length: number): Body { b.length = length; b.weight = length * length * length; return b; }
// how many times heavier the hunter is than the prey, as the band reads it
export function ratio(a: Body, b: Body, R: WebRules = WEB): number {
  let r = a.weight / b.weight;
  if (b.plate) r /= R.plate;
  const edge = Math.min(a.claw ? R.claw : 1, a.jaw > 0 ? a.jaw : 1);   // claws and a jaw do not add up: the better of the two counts
  return r / edge;
}
// is b food for a, by their bodies alone
export function eats(a: Body, b: Body, R: WebRules = WEB): boolean {
  if (a.kind === b.kind) return false;
  const r = ratio(a, b, R);
  if (r < R.band[0]) return false;                 // too near its own weight to bring down
  if (r > R.band[1]) return a.sieve || b.schools;  // too small to be worth it, unless it sieves or they school
  return true;
}
// should prey run from hunter
export const fears = (prey: Body, hunter: Body, R: WebRules = WEB): boolean => hunter.hunts && eats(hunter, prey, R);
// why not, for a person: "" when it is food
export function refusal(a: Body, b: Body, R: WebRules = WEB): "" | "own kind" | "too big" | "too small" {
  if (a.kind === b.kind) return "own kind"; const r = ratio(a, b, R);
  return r < R.band[0] ? "too big" : r > R.band[1] && !(a.sieve || b.schools) ? "too small" : "";
}
