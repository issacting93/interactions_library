// The core as a classic script (window.EcoCore), loaded before the tank's engine scripts. Built to packages/core/eco-core.js.
// EcoCore.random is THE source of randomness for everything that simulates (the engine scripts call it instead of Math.random);
// reseed() restarts it, so a seed replays.
import { World } from "./ecs";
import { Rng, seedOf } from "./rng";
import { Clock } from "./clock";
import { Schedule } from "./schedule";
import { Events } from "./events";
import * as Web from "./web";

let rng = new Rng((Math.random() * 4294967296) >>> 0);
const EcoCore = {
  World, Rng, Clock, Schedule, Events, seedOf,
  Web,   // who eats whom, from bodies (web.ts)
  random: () => rng.next(),
  reseed: (seed: number | string) => { rng = new Rng(seedOf(seed)); },
  get rng() { return rng; },
};
(window as unknown as { EcoCore: typeof EcoCore }).EcoCore = EcoCore;
