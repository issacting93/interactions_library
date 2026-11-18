// Reads what Forge made (the parts kit, the catalog's families, the tank's species behaviour, the Maw's own fangs and wing) and
// writes the game's content as plain data: src/content/kit.json (the drawings) and src/content/species.json (who is who).
// The game never reads Forge's files directly: this is the one door between them. Run: npm run kit
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../../.."), out = path.resolve(here, "../src/content");
const read = (p) => fs.readFileSync(path.join(repo, p), "utf8");
const classic = (p) => { const ctx = { window: {} }; vm.runInNewContext(read(p), ctx); return ctx.window; };

const parts = JSON.parse(read("shared/data/creature-parts.json"));
const catalog = JSON.parse(read("shared/data/creature-catalog.json"));
const { SPECIES, BEH, TIER1_KEYS, TIER2_KEYS, TIER3_KEYS } = classic("shared/engine/ecology/ecology-species.js").EcologySpecies;
const { Fangs } = classic("shared/look/game/fangs.js"), { MawWing } = classic("shared/look/game/maw-wing.js");
const sheets = Object.keys(catalog.sheets);
const sheetOf = (name) => { const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), rest = slug.split("-").slice(1).join("-");
  for (const c of ["sheet-" + slug, slug, "sheet-" + rest, rest]) if (sheets.includes(c)) return c; return null; };

// which kinds live where: the first prototype's three rings and the centre (the brief: Floor, Frond Forest, Shoals, the Apex)
const RINGS = {
  floor:  { keys: ["wisp", "pincer", "carapace-strider", "plated-scavenger", "worm", "leech", "glass-star", "moth", "puffer"], hunters: ["pearl-chasing-centiwyrm"], apex: "pearl-clawed-hundred-worm" },
  frond:  { keys: ["wisp", "koi", "serpent", "frond-serpent", "fin-puffer", "comb-drifter", "jelly", "eye-wing", "leech"], hunters: ["angler-tailed-jelly-af60", "dragon-winged-worm-ed95"], apex: "angler" },
  shoals: { keys: ["wisp", "swift", "ringed-lance-swift", "abyssal-lance-swift", "koi", "black-monarch", "ophan-halo-monarch", "manta"], hunters: ["hunter", "ringed-lance-swift-mk2"], apex: "crowned-sickle-lancer" },
  apex:   { keys: ["wisp"], hunters: [], apex: "dragon" },
};
// a lineage (a kit family) is a trait: eating along it strengthens it. The first rank of each opens a gate or gives a verb
const TRAITS = { crawlers: "climb", fish: "eyes", swifts: "swim", wyrms: "leap", drifters: "sting", monarchs: "cloak", dragons: "bulk" };

const used = new Set(), species = [];
for (const [ring, R] of Object.entries(RINGS)) for (const k of [...R.keys, ...R.hunters, R.apex]) {
  if (species.some((s) => s.key === k)) { const s = species.find((x) => x.key === k); if (!s.rings.includes(ring)) s.rings.push(ring); continue; }
  const sp = SPECIES.find((s) => s.key === k); if (!sp) throw new Error("no species " + k);
  const sheet = sheetOf(sp.name); if (!sheet) throw new Error("no sheet for " + sp.name);
  used.add(sheet);
  const b = BEH[k] || {}, family = catalog.sheets[sheet].family, tier = TIER3_KEYS.includes(k) ? 3 : TIER2_KEYS.includes(k) ? 2 : TIER1_KEYS.includes(k) ? 1 : 2;
  const role = R.apex === k ? "apex" : R.hunters.includes(k) ? "hunter" : "prey";
  species.push({ key: k, name: sp.name, sheet, family, trait: TRAITS[family] || null, mood: b.mood || "", text: b.text || "",
    // the tank's depth band (0 surface .. 1 floor) turned over into altitude (0 floor .. 1 surface)
    alt: b.z ? [+(1 - b.z[1]).toFixed(2), +(1 - b.z[0]).toFixed(2)] : [0, 1], school: b.school ?? 0, speed: +(b.speedMul ?? 1).toFixed(2), sight: b.sight ?? 3,
    flee: b.flee || "bolt", wander: b.wander ?? 0.3, turn: b.turn ?? 200, graze: !!b.graze, sting: b.sting ?? 0, lure: b.lure ?? 0, stopgo: b.stopgo ?? 0,
    tier: role === "apex" ? 4 : role === "hunter" ? Math.max(3, tier) : Math.min(tier, 2), role, rings: [ring] });
}

// the drawings: every part of each sheet in use, its paths in sheet coordinates (x 0..400 about the axis at 200, head at the top)
const pathsOf = (svg) => [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
const kit = { sheets: {}, maw: {} };
for (const sh of used) {
  const ps = parts.filter((p) => p.species === sh).map((p) => ({ id: p.id, side: p.side === "center" ? "c" : p.side === "left" ? "l" : "r", ox: p.ox, oy: p.oy, w: p.w, h: p.h, d: pathsOf(p.svg) })).filter((p) => p.d.length)
    // a sheet's backing card (a bare rectangle the size of the sheet) is not part of the creature
    .filter((p) => !(p.d.length === 1 && /^M[\d.\s-]+L[\d.\s-]+Z$/.test(p.d[0].trim()) && p.d[0].split(/\s+/).length <= 12 && p.w > 150));
  const ys = ps.flatMap((p) => [p.oy - p.h / 2, p.oy + p.h / 2]);
  kit.sheets[sh] = { name: catalog.sheets[sh].name, family: catalog.sheets[sh].family, y0: Math.min(...ys), y1: Math.max(...ys), parts: ps };
}
// the Maw's own body: rows (head, neck, shoulders, back, haunch, tail) from Forge parts, two-part legs, its fangs and its wing
const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
const take = (id) => { const p = byId[id]; return { id, ox: p.ox, oy: p.oy, w: p.w, h: p.h, d: pathsOf(p.svg) }; };
kit.maw = {
  rows: [["P277", "head"], ["P280", "neck"], ["P280", "neck"], ["P246", "shoulders"], ["P253", "back"], ["P251", "haunch"], ["P276", "tail"]].map(([id, role]) => ({ role, ...take(id) })),
  thigh: take("P252"), shin: take("P254"),
  fangs: Fangs.PARTS.map((p) => ({ id: p.id, w: p.w, h: p.h, d: pathsOf(p.svg) })), fangCX: Fangs.CX, upper: Fangs.UPPER, lower: Fangs.LOWER,
  wing: { w: MawWing.PARTS[0].w, h: MawWing.PARTS[0].h, d: pathsOf(MawWing.PARTS[0].svg) },
};
kit.families = catalog.families.filter((f) => TRAITS[f.id]).map((f) => ({ id: f.id, name: f.name, blurb: f.blurb, trait: TRAITS[f.id] }));

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "kit.json"), JSON.stringify(kit));
fs.writeFileSync(path.join(out, "species.json"), JSON.stringify({ rings: RINGS, traits: TRAITS, species }, null, 1));
console.log(`kit: ${used.size} sheets, ${Object.values(kit.sheets).reduce((a, s) => a + s.parts.length, 0)} parts, ${(fs.statSync(path.join(out, "kit.json")).size / 1024).toFixed(0)} KB; ${species.length} species`);
