// Kit to 3D: each species' look. A look is a material, a noise pattern and five colours:
//
//   colors[0] body     the lit surface
//   colors[1] shade    where it turns from the light, and the dark of an ember
//   colors[2] glow     the rim, what shines through glass, an ember's light
//   colors[3] line     its line art
//   colors[4] accent   the pattern (spots, bands, veins), and the second colour of a shell
//
//   node tools/kit3d/kit3d.mjs looks            design them, write packages/kit/data/creature-looks.json and .js, and the sheet to look over
//
// How they are designed: an order owns a region of the colour wheel, a family a hue inside it, a material and a pattern. Every species of a
// family shares its body, shade and line (so cousins read as cousins) and has a glow and an accent of its own (so they are not twins).
// Amounts that may ride along, all optional: vein (how much of the pattern, 0.6), fresnel (rim light, 0.5), opacity (1), emissive (0),
// veinSize (how big the veins are, 1) and veinSeed (which layout of veins; the species' own if unset).
// A look changed by hand (by: "zac" in creature-looks.json, which Specimen's Copy button gives) is never overwritten.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { tank } from "./tank.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), DATA = path.join(ROOT, "packages/kit/data/creature-looks.json"), JS = path.join(ROOT, "packages/kit/data/creature-looks.js"), SHEET = path.join(ROOT, "packages/kit/data/kit-sources/creature-palettes.svg");

// family -> hue (degrees), how strong the colour is, material, pattern. Orders keep to their own stretch of the wheel:
//   Spinata 0-40 (rust, red oxide, bone)   Coronata 52 (gold)   Alata 78-105 (olive, leaf)   Cruciata 150-178 (jade, teal)
//   Velata 200-225 (ice, azure)            Falcata 262-318 (violet, rose)
const FAMILY = {
  "Barbed spines": { order: "Spinata", hue: 6, sat: 0.72, material: "shell", pattern: "veins" },
  "Ringbacks":     { order: "Spinata", hue: 22, sat: 0.78, material: "shell", pattern: "veins" },
  "Strands":       { order: "Spinata", hue: 38, sat: 0.34, material: "skin", pattern: "veins" },
  "Wheels":        { order: "Coronata", hue: 52, sat: 0.82, material: "shell", pattern: "veins" },
  "Drapes":        { order: "Alata", hue: 78, sat: 0.6, material: "ember", pattern: "veins" },
  "Split wings":   { order: "Alata", hue: 105, sat: 0.58, material: "ember", pattern: "veins" },
  "Winged worms":  { order: "Cruciata", hue: 150, sat: 0.6, material: "skin", pattern: "veins" },
  "Twin-finned":   { order: "Cruciata", hue: 178, sat: 0.66, material: "skin", pattern: "veins" },
  "Bells":         { order: "Velata", hue: 200, sat: 0.7, material: "glass", pattern: "veins" },
  "Twin-tails":    { order: "Velata", hue: 225, sat: 0.72, material: "glass", pattern: "veins" },
  "Swifts":        { order: "Falcata", hue: 262, sat: 0.7, material: "glass", pattern: "veins" },
  "Seraphs":       { order: "Falcata", hue: 318, sat: 0.66, material: "ember", pattern: "veins" },
};
const hex = (h, s, l) => { h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2, [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join(""); };
// the five colours of the i-th species of n in a family
function design(f, i, n) {
  const k = n > 1 ? i / (n - 1) - 0.5 : 0, h = f.hue + k * 6;                 // the family's hue, a few degrees either way
  const glowH = f.hue - 26 + k * 44, accH = f.hue + 180 + k * 70 + (i % 2 ? 22 : -22);   // its own glow (near the family) and accent (across the wheel)
  return [hex(h, f.sat * 0.8, 0.46), hex(h + 14, f.sat * 0.7, 0.11), hex(glowH, Math.min(1, f.sat * 1.25), 0.72), hex(h - 6, Math.min(1, f.sat * 0.95), 0.82), hex(accH, 0.78, 0.6)];
}

export function looks(opts = {}) {
  const { species } = tank({ render: false });
  const kept = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : {}, data = {}, fams = {};
  for (const sp of species) (fams[sp.family] || (fams[sp.family] = [])).push(sp);
  const missing = Object.keys(fams).filter((f) => !FAMILY[f]); if (missing.length) throw new Error("no hue for famil" + (missing.length > 1 ? "ies" : "y") + ": " + missing.join(", ") + " (add to FAMILY in tools/kit3d/looks.mjs)");
  for (const [fam, list] of Object.entries(fams)) list.forEach((sp, i) => { const f = FAMILY[fam], mine = kept[sp.key];
    data[sp.key] = mine && mine.by === "zac" ? mine : { name: sp.name, order: sp.order, family: fam, material: f.material, pattern: f.pattern, colors: design(f, i, list.length), by: "claude" }; });
  // the Maw: one dark mass with a single light (Zac's references). Near-black ember body with faint embers in its veins, dim warm lines, and gold
  // kept for the one eye (drawn by the page with its own glowing look). Not of any family; a look set by hand is kept
  data.maw = kept.maw && kept.maw.by === "zac" ? kept.maw : { name: "The Maw", order: "The Maw", family: "The Maw", material: "ember", pattern: "veins", colors: ["#2b2622", "#0a0807", "#e8b04a", "#a39885", "#8a3a22"], vein: 0.18, fresnel: 0.45, by: "claude" };
  if (opts.write !== false) { fs.writeFileSync(DATA, JSON.stringify(data, null, 1) + "\n");
    const flat = {}; for (const k of Object.keys(data)) { flat[k] = { material: data[k].material, pattern: data[k].pattern, colors: data[k].colors }; if (data[k].vein != null) flat[k].vein = data[k].vein; if (data[k].fresnel != null) flat[k].fresnel = data[k].fresnel; for (const f of ["opacity", "emissive", "veinSize", "veinSeed", "grain", "roughness", "lumps", "grow", "growAmount", "growClump", "growColors", "paint", "paintSteps", "paintBrush", "paintWobble"]) if (data[k][f] != null) flat[k][f] = data[k][f]; }
    fs.writeFileSync(JS, "// Each species' look: a material, a pattern and five colours (body, shade, glow, line, accent). Written by tools/kit3d/looks.mjs from\n// creature-looks.json. Cousins in a family share body, shade and line; each has its own glow and accent.\nwindow.CreatureLooks = " + JSON.stringify(flat) + ";\n");
    fs.mkdirSync(path.dirname(SHEET), { recursive: true }); fs.writeFileSync(SHEET, sheet(data)); }
  if (!opts.quiet) { console.log(`looks: ${Object.keys(data).length} species in ${Object.keys(fams).length} families (${Object.values(data).filter((d) => d.by === "zac").length} set by hand)`);
    for (const [fam, list] of Object.entries(fams).sort((a, b) => FAMILY[a[0]].hue - FAMILY[b[0]].hue)) console.log(`  ${FAMILY[fam].order.padEnd(9)} ${fam.padEnd(14)} ${String(FAMILY[fam].hue).padStart(3)}°  ${FAMILY[fam].material.padEnd(6)} ${FAMILY[fam].pattern.padEnd(6)} ${list.map((s) => s.name).join(", ")}`);
    if (opts.write !== false) console.log(`  wrote ${path.relative(ROOT, JS)} and ${path.relative(ROOT, SHEET)}`); }
  return data;
}

// the sheet: every species' five colours, family by family, on the wheel's order
function sheet(data) {
  const ROLES = ["BODY", "SHADE", "GLOW", "LINE", "ACCENT"], fams = {}; for (const [k, d] of Object.entries(data)) (fams[d.family] || (fams[d.family] = [])).push([k, d]);
  const order = Object.keys(fams).sort((a, b) => (FAMILY[a] ? FAMILY[a].hue : 999) - (FAMILY[b] ? FAMILY[b].hue : 999)), W = 1180, PAD = 36, ROW = 46, SW = 92; let y = 128, body = "";
  for (const fam of order) { const f = FAMILY[fam] || {};
    body += `  <text x="${PAD}" y="${y}" font-size="10" letter-spacing="2.4" fill="#8C8981">${(f.order || "").toUpperCase()}</text>\n  <text x="${PAD + 110}" y="${y}" font-size="13" letter-spacing="1.4" fill="#ECE8DE">${fam.toUpperCase()}</text>\n  <text x="${PAD + 300}" y="${y}" font-size="10" letter-spacing="2" fill="#8C8981">${String(f.hue)}° · ${String(f.material || "").toUpperCase()} · ${String(f.pattern || "").toUpperCase()}</text>\n  <line x1="${PAD}" y1="${y + 10}" x2="${W - PAD}" y2="${y + 10}" stroke="#ECE8DE" stroke-opacity="0.1"/>\n`; y += 30;
    for (const [, d] of fams[fam]) { body += `  <text x="${PAD}" y="${y + 22}" font-size="11" letter-spacing="1.2" fill="#ECE8DE">${String(d.name).toUpperCase()}</text>\n`;
      d.colors.forEach((c, i) => { const x = PAD + 300 + i * (SW + 8); body += `  <rect x="${x}" y="${y}" width="${SW}" height="32" rx="5" fill="${c}"/>\n  <text x="${x + SW + 0}" y="${y + 44}" font-size="0" fill="none"></text>\n`; });
      // how it sits together: a body disc on its shade, a glow rim, a line and an accent spot
      const px = PAD + 300 + 5 * (SW + 8) + 26; body += `  <rect x="${px}" y="${y - 2}" width="150" height="36" rx="5" fill="#0d0a14"/>\n  <circle cx="${px + 28}" cy="${y + 16}" r="13" fill="${d.colors[1]}" stroke="${d.colors[2]}" stroke-width="2"/>\n  <circle cx="${px + 25}" cy="${y + 13}" r="8.5" fill="${d.colors[0]}"/>\n  <circle cx="${px + 29}" cy="${y + 17}" r="2.6" fill="${d.colors[4]}"/>\n  <path d="M${px + 52} ${y + 24} q14 -22 28 -8 t30 -6 t26 4" fill="none" stroke="${d.colors[3]}" stroke-width="1.4"/>\n`;
      if (d.by === "zac") body += `  <text x="${W - PAD}" y="${y + 22}" font-size="9" letter-spacing="2" text-anchor="end" fill="#E8B04A">BY HAND</text>\n`;
      y += ROW; }
    y += 22; }
  const head = ROLES.map((r, i) => `<text x="${PAD + 300 + i * (SW + 8)}" y="98" font-size="9" letter-spacing="2.2" fill="#8C8981">${r}</text>`).join("") + `<text x="${PAD + 300 + 5 * (SW + 8) + 26}" y="98" font-size="9" letter-spacing="2.2" fill="#8C8981">TOGETHER</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y + 10}" viewBox="0 0 ${W} ${y + 10}" font-family="'IBM Plex Mono', ui-monospace, Menlo, monospace">\n  <rect width="${W}" height="${y + 10}" fill="#161618"/>\n  <text x="${PAD}" y="44" font-size="11" letter-spacing="3" fill="#8C8981">FORGE · TANK · LOOKS</text>\n  <text x="${PAD}" y="72" font-size="22" font-weight="300" fill="#ECE8DE">${Object.keys(data).length} species, five colours each</text>\n  ${head}\n${body}</svg>\n`;
}
