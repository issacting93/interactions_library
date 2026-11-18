// Every component, as plain data. A creature: pos, vel, alt, body, spine, mind, ring. The player adds `maw`.
import type { Trait } from "../content/data";

export interface Vec { x: number; y: number }
export interface Body { species: string; len: number; speed: number; turn: number; heading: number; phase: number }
export interface Alt { z: number; goal: number; lo: number; hi: number }         // 0 the floor .. 1 the surface
export interface Spine { pts: number[]; seg: number }                             // [x0,y0, x1,y1, ...] head first
export interface Mind { mode: "wander" | "school" | "flee" | "hunt" | "rest"; target: number; t: number; wander: number; calm: number; light: boolean }
export interface InRing { i: number }

export interface Maw {
  energy: number;            // 0..1: hunger. Empty: you starve
  xp: number; level: number; owed: number;
  traits: Record<Trait, number>;
  since: Record<string, number>;           // meals by family since the last level: what the next mutation can be
  meals: number; ate: Record<string, number>;
  coil: number; holding: boolean;          // the lunge: hold to coil, let go to strike
  strike: { t: number; dir: number; reach: number } | null;
  state: "walk" | "climb" | "swim" | "leap" | "dead" | "won";
  move: { t: number; dur: number; from: Vec; to: Vec } | null;   // a climb or a leap in progress
  input: Vec;
  cool: number;                             // after a strike
  stunT: number;                            // held by something, struggling
  heldBy: number;
}

export interface C extends Record<string, unknown> {
  pos: Vec; vel: Vec; alt: Alt; body: Body; spine: Spine; mind: Mind; ring: InRing; maw: Maw; prey: true;
}
