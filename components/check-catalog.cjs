#!/usr/bin/env node
// Check components/catalog.js against the files on disk.
//   node components/check-catalog.cjs
// Fails (exit 1) when the catalogue and the folders disagree: a listed file that is gone, a component file
// nobody listed, a duplicate id, or a `from` that points at nothing. Also reports, without failing, which
// components use the shared design tokens and which carry their own colours.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(__dirname, "catalog.js"), "utf8");
const window = {};
new Function("window", src)(window);
const cat = window.LIBRARY_CATALOG;

const errors = [], notes = [];
const exists = (f) => fs.existsSync(path.join(root, f));

// ids unique across studies, components and tools
const seen = new Map();
for (const [kind, list] of [["study", cat.studies], ["component", cat.components], ["tool", cat.tools]]) {
  for (const x of list) {
    if (seen.has(x.id)) errors.push(`duplicate id "${x.id}" (${seen.get(x.id)} and ${kind})`);
    seen.set(x.id, kind);
    if (!exists(x.file)) errors.push(`${kind} "${x.id}": file missing: ${x.file}`);
  }
}
for (const c of cat.components) if (!cat.categories.includes(c.category)) errors.push(`component "${c.id}": unknown category "${c.category}"`);

// every component file on disk is listed or deliberately ignored
const listed = new Set([...cat.components.map((c) => c.file), ...(cat.ignore || []).map((x) => x.file)]);
for (const dir of fs.readdirSync(path.join(root, "components"))) {
  const d = path.join(root, "components", dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const sub of fs.readdirSync(d)) {
    const sd = path.join(d, sub);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const f of fs.readdirSync(sd)) if (f.endsWith(".html")) {
      const rel = `components/${dir}/${sub}/${f}`;
      if (!listed.has(rel)) errors.push(`not in the catalogue: ${rel}`);
    }
  }
}

// lineage points at real things
const byKind = { study: new Map(cat.studies.map((s) => [s.id, s])), component: new Map(cat.components.map((c) => [c.id, c])), tool: new Map(cat.tools.map((t) => [t.id, t])) };
for (const c of cat.components) for (const f of c.from || []) {
  const target = byKind[f.kind] && byKind[f.kind].get(f.id);
  if (!target) { errors.push(`component "${c.id}": from ${f.kind} "${f.id}" does not exist`); continue; }
  if (f.panel && !(target.panels || []).includes(f.panel)) errors.push(`component "${c.id}": study "${f.id}" has no panel ${f.panel}`);
}

// report: which studies produced components, and token use
for (const s of cat.studies) {
  const kids = cat.components.filter((c) => (c.from || []).some((f) => f.kind === "study" && f.id === s.id));
  notes.push(`study ${String(s.n).padStart(2, "0")} ${s.name}: ${kids.length ? kids.map((k) => k.id).join(", ") : "no components yet"}`);
}
const tokenUse = { "shared/tokens.css": 0, "shared/tape08-tokens.css": 0, own: 0 };
const own = [];
for (const c of cat.components) {
  const html = fs.readFileSync(path.join(root, c.file), "utf8");
  if (html.includes("shared/tokens.css")) tokenUse["shared/tokens.css"]++;
  else if (html.includes("shared/tape08-tokens.css")) tokenUse["shared/tape08-tokens.css"]++;
  else { tokenUse.own++; own.push(c.id); }
}
notes.push(`tokens: ${tokenUse["shared/tokens.css"]} use shared/tokens.css, ${tokenUse["shared/tape08-tokens.css"]} use shared/tape08-tokens.css, ${tokenUse.own} carry their own colours`);

// the Sci-fi Gallery's starter designs use parts by id; every part needs a thumbnail
const designsFile = path.join(root, "gallery/designs.js");
if (fs.existsSync(designsFile)) {
  const w2 = {}; new Function("window", fs.readFileSync(designsFile, "utf8"))(w2);
  const designs = w2.SCIFI_DESIGNS || [], ids = new Set();
  for (const d of designs) {
    if (ids.has(d.id)) errors.push(`gallery: duplicate design id "${d.id}"`); ids.add(d.id);
    for (const s of d.slots) {
      if (!byKind.component.has(s.part)) errors.push(`gallery: design "${d.id}" uses unknown part "${s.part}"`);
      if (s.x < 0 || s.y < 0 || s.x + s.w > d.cols || s.y + s.h > d.rows) errors.push(`gallery: design "${d.id}" slot ${s.id} is off the ${d.cols}×${d.rows} frame`);
    }
  }
  const noThumb = cat.components.filter((c) => !exists(`gallery/thumbs/${c.id}.jpg`)).map((c) => c.id);
  if (noThumb.length) errors.push(`gallery: no thumbnail for ${noThumb.join(", ")} (node gallery/make-thumbs.cjs ${noThumb.join(" ")})`);
  notes.push(`gallery: ${designs.length} starter designs, ${cat.components.length - noThumb.length} thumbnails`);
}

console.log(`${cat.studies.length} studies, ${cat.components.length} components, ${cat.tools.length} tools`);
for (const n of notes) console.log("  " + n);
if (process.argv.includes("--own")) console.log("  own colours: " + own.join(", "));
if (errors.length) { console.error("\n" + errors.map((e) => "✗ " + e).join("\n")); process.exit(1); }
console.log("\n✓ catalogue matches the files on disk");
