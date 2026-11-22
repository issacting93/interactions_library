/*
 * Forge — the shared building recipe.
 *
 * One saved "building" object, many editors. The recipe stored in the world file is a
 * Tower Forge spec (the format Tower Forge, World Scene Next and the prefab dialog already
 * read) with the full Spire design embedded as `spec.spire` — the convention Spire Forge's
 * own "To Tower Forge" export already used. So:
 *
 *   Spire Forge / Bench   edit spec.spire (the genome) and re-derive the spec on save
 *   Tower Forge           edits the spec itself; spec.spire is kept as where it came from,
 *                         and source.editedIn = "Tower Forge" marks the spec as hand-edited
 *   World Scene / prefab  read the spec (tiers, crown, height, footprint)
 *
 *   ForgeBuilding.read(recipe) -> { genome, spec, editedIn, legacy }
 *       accepts this format, older Bench saves (a bare genome), and older Spire Forge saves
 *       (a spec, with or without .spire). genome is null for a Tower-Forge-only building.
 *   ForgeBuilding.fromGenome(genome, byId, name) -> spec    (needs SpireGenerator.toTowerSpec)
 *   ForgeBuilding.isSpec(x), isGenome(x)
 *   ForgeBuilding.footprint(spec) -> { footprint: [d, d] | null, height: number | null }
 *
 * Pure, no DOM. Classic script.
 */
(function () {
  "use strict";
  const isGenome = (x) => !!(x && typeof x === "object" && x.base && x.crown && x.tpl);
  const isSpec = (x) => !!(x && typeof x === "object" && Array.isArray(x.tiers));

  function read(recipe) {
    if (isSpec(recipe)) {
      const editedIn = recipe.source && recipe.source.editedIn ? recipe.source.editedIn : null;
      return { genome: isGenome(recipe.spire) ? recipe.spire : null, spec: recipe, editedIn, legacy: false };
    }
    if (isGenome(recipe)) return { genome: recipe, spec: null, editedIn: null, legacy: true };
    return { genome: null, spec: null, editedIn: null, legacy: true };
  }

  function fromGenome(genome, byId, name) {
    const SG = typeof window !== "undefined" && window.SpireGenerator;
    if (!SG || !SG.toTowerSpec) throw new Error("ForgeBuilding.fromGenome needs spire-generator.js");
    return SG.toTowerSpec(genome, byId, name);
  }

  // same reading as forge-prefab.js always did: the widest tier is the footprint, tiers stack to the height
  function footprint(spec) {
    if (!isSpec(spec) || !spec.tiers.length) return { footprint: null, height: null };
    const maxR = Math.max(...spec.tiers.map((t) => Math.max(t.r0 || 0, t.r1 || 0)));
    const height = spec.tiers.reduce((sum, t) => sum + (t.h || 0), 0);
    const diameter = Math.round(maxR * 2);
    return { footprint: [diameter, diameter], height: Math.round(height) };
  }

  const ForgeBuilding = { read, fromGenome, isSpec, isGenome, footprint, FORMAT: "tower-spec+spire" };
  if (typeof window !== "undefined") window.ForgeBuilding = ForgeBuilding;
  if (typeof module !== "undefined") module.exports = ForgeBuilding;
})();
