// The game's content, as typed data. kit.json and species.json come from Forge through tools/export-kit.mjs.
import speciesJson from "./species.json";
import kitJson from "./kit.json";

export type Trait = "climb" | "eyes" | "swim" | "leap" | "sting" | "cloak" | "bulk";
export const TRAITS: Trait[] = ["climb", "eyes", "swim", "leap", "sting", "cloak", "bulk"];
export type Role = "prey" | "hunter" | "apex";
export type RingId = "floor" | "frond" | "shoals" | "apex";

export interface Species {
  key: string; name: string; sheet: string; family: string; trait: Trait | null; mood: string; text: string;
  alt: [number, number]; school: number; speed: number; sight: number; flee: string; wander: number; turn: number;
  graze: boolean; sting: number; lure: number; stopgo: number; tier: number; role: Role; rings: RingId[];
}
export interface KitPart { id: string; side: "c" | "l" | "r"; ox: number; oy: number; w: number; h: number; d: string[] }
export interface Sheet { name: string; family: string; y0: number; y1: number; parts: KitPart[] }
export interface MawPart { id: string; ox: number; oy: number; w: number; h: number; d: string[] }
export interface Family { id: string; name: string; blurb: string; trait: Trait }
export interface Kit {
  sheets: Record<string, Sheet>;
  maw: { rows: (MawPart & { role: string })[]; thigh: MawPart; shin: MawPart; fangs: { id: string; w: number; h: number; d: string[] }[]; fangCX: number; upper: string[]; lower: string[]; wing: { w: number; h: number; d: string[] } };
  families: Family[];
}

export const SPECIES: Species[] = (speciesJson as unknown as { species: Species[] }).species;
export const BY_KEY: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.key, s]));
export const KIT = kitJson as unknown as Kit;
export const FAMILY: Record<string, Family> = Object.fromEntries(KIT.families.map((f) => [f.id, f]));

// how long a creature of a tier is, in world units (the hatchling is 50)
export const TIER_LEN = [40, 38, 70, 125, 210];
export function lengthOf(sp: Species, r: () => number): number {
  const base = TIER_LEN[Math.max(0, Math.min(4, sp.tier))] * (sp.key === "dragon" ? 1.35 : 1);
  return sp.role === "apex" ? base : base * (0.85 + 0.3 * r());
}

// what each trait does, rank by rank (rank 1 opens its gate); the words the cards and the HUD use
export const TRAIT_INFO: Record<Trait, { name: string; gate?: string; ranks: string[] }> = {
  climb: { name: "Climb", gate: "Towers on the Floor's inner wall", ranks: ["Climb towers", "Climb faster", "Climb any wall"] },
  eyes:  { name: "Eyes", gate: "The hidden stairs in the dark Frond", ranks: ["See in the dark, and the stairs", "See farther", "See hunters through weed"] },
  swim:  { name: "Swim", gate: "The moat round the Apex", ranks: ["Swim: leave the floor", "Swim faster", "Dive at prey"] },
  leap:  { name: "Leap", gate: "Jump the moat", ranks: ["Lunge leaps far", "Leap farther", "Leap from anywhere"] },
  sting: { name: "Sting", ranks: ["What bites you lets go", "Stuns longer", "Stings back"] },
  cloak: { name: "Cloak", ranks: ["Still, you vanish", "Fade while slow", "Hunters forget you"] },
  bulk:  { name: "Bulk", ranks: ["Bigger", "Bigger still", "Huge"] },
};
