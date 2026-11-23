// Draw Bestiary Forge layouts with the forge's own code: clamp, placeFrag, expand and assemble are lifted out of
// world/forges/bestiary-forge/index.html at run time, so what this draws is what the forge draws.
//   node tools/kitgen/forge-render.mjs <candidates.json> <out.svg> [title]     a sheet, a row per plan, five to a row
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const html = fs.readFileSync(path.join(ROOT, "world/forges/bestiary-forge/index.html"), "utf8");
const grab = (sig) => { const i = html.indexOf(sig); if (i < 0) throw new Error("not in the forge: " + sig); let d = 0, j = html.indexOf(") {", i) + 2;
  for (let k = j; k < html.length; k++) { if (html[k] === "{") d++; else if (html[k] === "}" && --d === 0) return html.slice(i, k + 1); } };
const clampLine = html.match(/const clamp = .*;/)[0];
const parts = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/kit/data/creature-parts.json"), "utf8"));
const state = { partsById: Object.fromEntries(parts.map(p => [p.id, p])) };
const forge = new Function("state", `${clampLine}\n${grab("function placeFrag(")}\n${grab("function expand(")}\n${grab("function assemble(")}\nreturn { assemble };`)(state);

const args = process.argv.slice(2), LINES = args.includes("--lines");      // --lines: every line 1 px, black on white, no fills (as the other kit sheets)
const [src, out, title = "Bestiary Forge layouts"] = args.filter(a => a !== "--lines");
const doc = JSON.parse(fs.readFileSync(src, "utf8"));
const T = 300, L = 200, cols = 5, rowH = T + 34, plans = doc.plans;
const Wd = L + cols * T, Hd = 60 + plans.length * rowH;
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}" viewBox="0 0 ${Wd} ${Hd}"><rect width="100%" height="100%" fill="${LINES ? "#fff" : "#0b0d11"}"/>
${LINES ? `<style>.c *{fill:none!important;stroke:#111!important;stroke-width:1px!important;vector-effect:non-scaling-stroke;opacity:1!important;stroke-opacity:1!important}</style>` : ""}
<text x="16" y="32" font-family="monospace" font-size="16" fill="${LINES ? "#111" : "#e8eaf0"}">${title}</text>`;
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
plans.forEach((p, r) => {
  const y0 = 60 + r * rowH;
  s += `<line x1="16" y1="${y0}" x2="${Wd - 16}" y2="${y0}" stroke="${LINES ? "#ccc" : "#2a2e36"}"/><text x="16" y="${y0 + 28}" font-family="monospace" font-size="14" fill="${LINES ? "#111" : "#e8eaf0"}">${esc(p.common)}</text>
<text x="16" y="${y0 + 46}" font-family="monospace" font-size="11" fill="#9aa0ab">${esc(p.group)}</text>`;
  const words = p.rule.split(" "); let line = "", ly = y0 + 70;
  for (const w of [...words, ""]) { if (!w || line.length + w.length > 24) { s += `<text x="16" y="${ly}" font-family="monospace" font-size="10" fill="#7a808b">${esc(line.trim())}</text>`; ly += 14; line = ""; } line += " " + w; }
  doc.candidates.filter(c => c.plan === p.key).forEach((c, i) => {
    const a = forge.assemble(c.layout); if (!a) return;
    const inner = a.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    const x = L + i * T;
    if (!LINES) s += `<rect x="${x + 6}" y="${y0 + 4}" width="${T - 12}" height="${T - 4}" fill="#14171d"/>`;
    s += `<g class="c" id="${c.key}" transform="translate(${x + 10} ${y0 + 6}) scale(${(T - 20) / 400})" >${inner}</g>`;
    s += `<text x="${x + T / 2}" y="${y0 + T + 22}" font-family="monospace" font-size="12" text-anchor="middle" fill="${LINES ? "#111" : "#e8eaf0"}">${String(c.no).padStart(2, "0")}  ${esc(c.name)}</text>`;
  });
});
fs.writeFileSync(out, s + "\n</svg>\n");
console.log("drew", doc.candidates.length, "with the forge's assemble() ->", out);
