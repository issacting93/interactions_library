#!/usr/bin/env node
// Builds the published copy of Cybernetic Ecology from the repo page, so the two never drift.
//   node world/forges/fish-tool/tests/build-artifact.mjs <out-dir> [--run]
//   --run: the published copy of The Maw (games/the-maw): the same page, opening on the Run in its menu
// Writes <out-dir>/index.html with every shared script copied beside it (js/…), and the 20 MB species
// file cut in two (species-a.js, species-b.js) because one published file may not be over 16 MB.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), pageDir = path.resolve(here, ".."), args = process.argv.slice(2), out = path.resolve(args.find((a) => !a.startsWith("--")) || "ecology-artifact"), asRun = args.includes("--run");
fs.mkdirSync(path.join(out, "js"), { recursive: true });
const page = (args.find((a) => a.startsWith("--page=")) || "--page=Cybernetic Ecology.html").slice(7), tank = page === "Cybernetic Ecology.html";   // --page=Specimen.html: another page of this folder, built the same way
let html = fs.readFileSync(path.join(pageDir, page), "utf8"); const copied = [];
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const file = path.resolve(pageDir, src), name = path.basename(src);
  if (name === "ecology-species.js") {
    const lines = fs.readFileSync(file, "utf8").split("\n"), i = lines.findIndex((l) => l.startsWith("const SPECIES = ["));
    const arr = JSON.parse(lines[i].slice("const SPECIES = ".length).replace(/;\s*$/, "")); let size = 0, cut = 0; const total = lines[i].length;
    while (cut < arr.length && size < total / 2) size += JSON.stringify(arr[cut++]).length;
    fs.writeFileSync(path.join(out, "species-a.js"), lines.slice(0, i).join("\n") + "\nconst SPECIES = " + JSON.stringify(arr.slice(0, cut)) + ";\n");
    fs.writeFileSync(path.join(out, "species-b.js"), "SPECIES.push(...(" + JSON.stringify(arr.slice(cut)) + "));\n" + lines.slice(i + 1).join("\n"));
    copied.push("species-a.js", "species-b.js"); return '<script src="species-a.js"></script>\n<script src="species-b.js"></script>';
  }
  fs.copyFileSync(file, path.join(out, "js", name)); copied.push("js/" + name); return `<script src="js/${name}"></script>`;
});
// the walker crew's module import and the kit's parts file sit beside the page too
const looks = "../../../shared/engine/motion/looks.js", must = (ok, what) => { if (!ok) throw new Error("the page no longer has " + what); };
if (tank || html.includes(`from "${looks}"`)) { must(html.includes(`from "${looks}"`), "the looks.js import"); must(html.includes("PartLib.load()"), "PartLib.load()");
html = html.replace(`from "${looks}"`, 'from "./js/looks.js"').replace(/(window\.)?PartLib\.load\(\)/, 'window.PartLib.load("creature-parts.json")');
fs.copyFileSync(path.resolve(pageDir, looks), path.join(out, "js", "looks.js")); fs.copyFileSync(path.resolve(pageDir, "../../../shared/data/creature-parts.json"), path.join(out, "creature-parts.json"));
copied.push("js/looks.js", "creature-parts.json"); }
if (asRun) html = html.replace("<title>Cybernetic Ecology</title>", "<title>The Maw</title>").replace("<head>", "<head>\n<script>window.MAW_BOOT = 'run';</script>");
fs.writeFileSync(path.join(out, "index.html"), html);
// a page's stylesheets sit beside it too (css/…)
html = html.replace(/<link rel="stylesheet" href="(\.\.\/[^"]+\.css)">/g, (m, href) => { const name = path.basename(href); fs.mkdirSync(path.join(out, "css"), { recursive: true }); fs.copyFileSync(path.resolve(pageDir, href), path.join(out, "css", name)); copied.push("css/" + name); return `<link rel="stylesheet" href="css/${name}">`; });
fs.writeFileSync(path.join(out, "index.html"), html);
for (const f of ["species-a.js", "species-b.js"]) if (fs.existsSync(path.join(out, f)) && fs.statSync(path.join(out, f)).size > 16 * 1024 * 1024) throw new Error(f + " is over 16 MB");
console.log("built " + out + ": index.html + " + copied.length + " scripts\n" + copied.join("\n"));
