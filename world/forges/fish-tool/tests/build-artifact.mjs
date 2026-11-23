#!/usr/bin/env node
// Builds the published copy of Cybernetic Ecology from the repo page, so the two never drift.
//   node world/forges/fish-tool/tests/build-artifact.mjs <out-dir> [--run]
//   --run: the published copy of The Maw (games/the-maw): the same page, opening on the Run in its menu
//   --endless: the same page, opening straight into Endless (what games/the-maw deploys to Vercel)
//   --stage=<id>: the same page, opening straight into one stage (frond: the Frond Forest)
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
const looks = "../../../packages/motion/looks.js", must = (ok, what) => { if (!ok) throw new Error("the page no longer has " + what); };
if (tank || html.includes(`from "${looks}"`)) { must(html.includes(`from "${looks}"`), "the looks.js import"); must(html.includes("PartLib.load()"), "PartLib.load()");
html = html.replace(`from "${looks}"`, 'from "./js/looks.js"').replace(/(window\.)?PartLib\.load\(\)/, 'window.PartLib.load("creature-parts.json")');
fs.copyFileSync(path.resolve(pageDir, looks), path.join(out, "js", "looks.js")); fs.copyFileSync(path.resolve(pageDir, "../../../packages/kit/data/creature-parts.json"), path.join(out, "creature-parts.json"));
copied.push("js/looks.js", "creature-parts.json"); }
// a page that reads the kit catalogue gets it beside it
const catPath = "../../../packages/kit/data/creature-catalog.json";
if (html.includes(`fetch("${catPath}")`)) { html = html.replace(`fetch("${catPath}")`, 'fetch("creature-catalog.json")'); fs.copyFileSync(path.resolve(pageDir, catPath), path.join(out, "creature-catalog.json")); copied.push("creature-catalog.json"); }
// a synchronous attribute + style right at the top of <head> keeps the full desktop editor chrome (the Play button,
// the left Drawer, the right Dock) off the very first paint -- without this, the browser can paint the parsed-so-far
// DOM (editor chrome visible, #play still hidden) before the boot script further down ever runs playSet(true)
const bootCritCSS = "<style>[data-boot-mode] #play-btn,[data-boot-mode] .dock,[data-boot-mode] .drawer{display:none!important}</style>";
if (asRun) html = html.replace("<title>Cybernetic Ecology</title>", "<title>The Maw</title>").replace("<head>", `<head>\n<script>window.MAW_BOOT = 'run'; document.documentElement.setAttribute('data-boot-mode', 'run');</script>\n${bootCritCSS}`);
// --endless: The Maw, opening straight into Endless (the build games/the-maw deploys)
if (args.includes("--endless")) html = html.replace("<title>Cybernetic Ecology</title>", "<title>The Maw: Endless</title>").replace("<head>", `<head>\n<script>window.MAW_BOOT = 'endless'; document.documentElement.setAttribute('data-boot-mode', 'endless');</script>\n${bootCritCSS}`);
// --stage=frond: opens straight into that stage (a place to look at, rather than the menu)
{ const sg = (args.find((x) => x.startsWith("--stage=")) || "").slice(8); if (sg) html = html.replace("<head>", `<head>\n<script>window.MAW_STAGE = ${JSON.stringify(sg)};</script>`); }
fs.writeFileSync(path.join(out, "index.html"), html);
// a page's stylesheets sit beside it too (css/…)
html = html.replace(/<link rel="stylesheet" href="(\.\.\/[^"]+\.css)">/g, (m, href) => { const name = path.basename(href); fs.mkdirSync(path.join(out, "css"), { recursive: true }); fs.copyFileSync(path.resolve(pageDir, href), path.join(out, "css", name)); copied.push("css/" + name); return `<link rel="stylesheet" href="css/${name}">`; });
fs.writeFileSync(path.join(out, "index.html"), html);
for (const f of ["species-a.js", "species-b.js"]) if (fs.existsSync(path.join(out, f)) && fs.statSync(path.join(out, f)).size > 16 * 1024 * 1024) throw new Error(f + " is over 16 MB");
console.log("built " + out + ": index.html + " + copied.length + " scripts\n" + copied.join("\n"));
