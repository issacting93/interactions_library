// One palette, checked. The TAPE 08 values live in three places for historical reasons:
//   packages/ui/tape08-tokens.css          the file the game pages and the patch tools link
//   packages/ui/tokens.css [data-theme=t8] the same block inside the unified file
//   packages/ui/forge-ds/tokens.json       Forge Console's source, with its own names
// This fails if any two disagree, or if a game page stops taking its colours from the shared file.
//   node games/the-maw/tools/ui-tokens-check.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => readFileSync(join(root, p), "utf8");
const norm = (v) => v.trim().toLowerCase().replace(/\s+/g, "").replace(/0\.(\d)/g, ".$1").replace(/(\.\d*[1-9])0+(?=[,)])/g, "$1");
const decls = (css) => { const o = {}; for (const m of css.matchAll(/(--t8-[\w-]+)\s*:\s*([^;]+);/g)) o[m[1]] = norm(m[2]); return o; };
const bad = [];

const a = decls(read("packages/ui/tape08-tokens.css").replace(/\/\*[\s\S]*?\*\//g, ""));
const uni = read("packages/ui/tokens.css");
const blk = /:root\[data-theme="t8"\]\s*\{([\s\S]*?)\n\}/.exec(uni);
if (!blk) bad.push("tokens.css has no [data-theme=t8] block");
const b = blk ? decls(blk[1]) : {};
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) bad.push(`${k}: tape08-tokens.css has ${a[k]}, tokens.css has ${b[k]}`);

// Forge Console's names for the same things
const ds = JSON.parse(read("packages/ui/forge-ds/tokens.json"));
const theme = ds.color.themes[0].id, dsv = {};
for (const k of ds.color.tokens) dsv[k.name] = norm(typeof k.value === "string" ? k.value : k.value[theme]);
const same = { ground: "ground", panel: "panel", bar: "bar", lane: "lane", "lane-sel": "lane-sel", well: "well", ink: "ink", "ink-2": "ink-2", "ink-3": "ink-off", "ink-off": "ink-ghost",
  "line-1": "line-1", "line-2": "line-2", "line-3": "line-3", "line-4": "line-4", "line-5": "line-5", accent: "pick", rec: "stale", loop: "ok", solo: "sim", "on-signal": "on-signal" };
for (let i = 1; i <= 8; i++) same["trk-" + i] = "trk-" + i;
for (const [t8, f] of Object.entries(same)) {
  if (dsv[f] === undefined) bad.push(`forge-ds/tokens.json has no ${f}`);
  else if (dsv[f] !== a["--t8-" + t8]) bad.push(`--t8-${t8} is ${a["--t8-" + t8]} but Forge Console's --${f} is ${dsv[f]}`);
}

// the game's pages take their palette from the shared file and do not restate it
const pages = ["games/the-maw/editor/index.html", "games/the-maw/field/index.html", "world/forges/fish-tool/Cybernetic Ecology.html"];
const restated = /--(?:t8-)?(?:ground|panel|ink|ink2|ink-2|acc|accent|rec|text|muted|gold|card|line|line-2)\s*:\s*(?:#161618|#1d1d20|#ece8de|#8c8981|#e8b04a|#ff4d5e|#f1ece8|#9a8aa3|#e8a23c|#1b1422|#33243d|#4a3456)/i;
for (const p of pages) {
  const s = read(p);
  if (!s.includes("packages/ui/tape08-tokens.css")) bad.push(`${p} does not link packages/ui/tape08-tokens.css`);
  const m = restated.exec(s.split("\n").filter((l) => !l.includes("daylight")).join("\n"));   // daylight is its own, lighter set
  if (m) bad.push(`${p} states a shared colour itself: ${m[0]}`);
}

if (process.argv.includes("--print")) console.log(a);
if (bad.length) { console.error("UI tokens disagree:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`ui tokens: ${Object.keys(a).length} values agree in 3 places; ${pages.length} game pages use them`);
