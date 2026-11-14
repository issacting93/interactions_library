/* body-climb: the physics body climbs. No browser: the motion scripts run in a bare Node context.
     node tools/check/body-climb.mjs
   A crawler sized like the Pincer Crawler is stood at the foot of a tower (shared/engine/motion/surface.js) and
   sent to a point on it. It must get there with its body held at standing height from the surface the whole way,
   its skeleton sound, and a creature that cannot climb must still ignore the tower as it always did. */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOTION = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../shared/engine/motion/");
function load() {
  const ctx = vm.createContext({ console, Math }); ctx.window = ctx;
  for (const f of ["ik.js", "gaits.js", "skeleton.js", "surface.js", "creature-body.js"]) vm.runInContext(fs.readFileSync(MOTION + f, "utf8"), ctx, { filename: f });
  return ctx;
}
// a six-legged crawler: leg 0.8, body 1.3, the Pincer Crawler's proportions
function crawler(extra = {}) {
  const Lm = 0.8, leg = (ang, z) => ({ ang, len: Lm, fracs: [0.3, 0.4, 0.3], reach: 0.82, hip: [0.2, 0.04, z] });
  return { segs: [{ h: 0.42 * Lm, gap: 0, parts: [], legs: [leg(66, 0.3), leg(92, 0), leg(118, -0.3)], arms: [], zF: 0.65, zB: -0.65, cy: 0 }],
    Lm, speed: 0.9 * Math.pow(Lm, 0.6), stride: 0.45 * Lm, lift: 0.3 * Lm, turn: 1.8, bob: 0, ...extra };
}
const STAND = 0.42 * 0.8;
const failures = [];
function scenario(name, { profile, start = { x: 0, z: 0 }, lift = 0, climb = true, target, secs = 60, radius = 0.6 }) {
  const ctx = load(), H = () => 0, world = ctx.Surface.world(H, [{ x: 0, z: 6, profile }]);
  const B = new ctx.CreatureBody(crawler({ climb }), { H, surface: world, start, yaw: 0 });
  if (lift) B.lift(lift);
  B.target.set(...target);
  let reached = null, lo = 9, hi = 0, nan = false, feet = 0, n = 0;
  for (let i = 0; i < secs * 60 && reached == null; i++) {
    B.step(1 / 60);
    for (const c of B.chunks) { lo = Math.min(lo, c.d); hi = Math.max(hi, c.d); if (!Number.isFinite(c.p.x + c.p.y + c.p.z)) nan = true; }
    feet += B.legs.filter((L) => L.planted).length / B.legs.length; n++;
    const h = B.chunks[0].p; if (Math.hypot(h.x - target[0], h.y - target[1], h.z - target[2]) < radius) reached = i / 60;
  }
  const bad = ctx.Skeleton.check(B.skel);
  const problems = [];
  if (reached == null) problems.push("did not reach the target");
  if (nan) problems.push("NaN");
  if (bad.length) problems.push("skeleton: " + bad.join(", "));
  if (lo < 0.02) problems.push(`sank into the surface (${lo.toFixed(2)})`);
  if (hi > STAND * 2) problems.push(`left the surface (${hi.toFixed(2)} away)`);
  if (feet / n < 0.5) problems.push(`feet down only ${Math.round((100 * feet) / n)}% of the time`);
  console.log(`${problems.length ? "FAIL" : "ok  "} ${name.padEnd(42)} ${reached == null ? "-" : reached.toFixed(1) + "s"}  feet down ${Math.round((100 * feet) / n)}%  distance ${lo.toFixed(2)}..${hi.toFixed(2)}`);
  if (problems.length) failures.push(`${name}: ${problems.join("; ")}`);
}
const shaft = [[2, 0], [2, 9]], ledge = [[2.6, 0], [2.6, 3], [1.6, 3], [1.6, 9]], thin = [[2.4, 0], [2.4, 3], [2.0, 3], [2.0, 9]];
scenario("up a straight wall", { profile: shaft, target: [0, 8, 4] });
scenario("up a wall, across a 1-wide ledge", { profile: ledge, target: [0, 8, 4.4] });
scenario("up a wall, across a ledge shorter than it", { profile: thin, target: [0, 8, 4] });
scenario("over the rim onto the roof", { profile: shaft, target: [0, 9, 6], secs: 90 });
scenario("down from the roof to the ground", { profile: shaft, start: { x: 0, z: 6 }, lift: 9, target: [0, 0, -2], secs: 90 });
scenario("a creature that cannot climb ignores the tower", { profile: shaft, climb: false, target: [0, 0, 12], secs: 40 });
if (failures.length) { console.error("\n" + failures.join("\n")); process.exit(1); }
console.log("body-climb: all scenarios passed");
