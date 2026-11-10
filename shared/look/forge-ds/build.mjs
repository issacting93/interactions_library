// Forge Console: turn tokens.json into tokens.css.
//   node shared/look/forge-ds/build.mjs
// tokens.json is the one source. It is the same file as the "Forge Console" design-system
// artifact's project/tokens.json, so a change made on either side is copied to the other whole.
// The output is scoped to :root[data-theme="forge"] and also declares the older names the
// pages used before the system existed (--accent, --loop, --r-btn …) as aliases, so a page can
// move onto the f- components one at a time.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));
const theme = t.color.themes[0].id;
const val = (v) => {
  const raw = typeof v === "string" ? v : v[theme];
  const m = /^\{(.+)\}$/.exec(raw);
  return m ? `var(--${m[1]})` : raw;
};

const lines = [];
for (const k of t.color.tokens) lines.push(`  --${k.name}: ${val(k.value)};`);
for (const fam of ["spacing", "radius", "size"]) for (const k of (t[fam] || {}).tokens || []) lines.push(`  --${k.name}: ${k.value};`);
for (const [key, stack] of Object.entries(t.type.families)) lines.push(`  --font-${key}: ${stack};`);

// older names, kept so pages not yet on the f- components still resolve
const legacy = {
  accent: "pick", "accent-dark": "pick-dim", loop: "pick", solo: "pick-hi", rec: "stale", cyan: "sim",
  broken: "stale", "sel-bg": "lane-sel", "sel-line": "pick", "warn-bg": "panel", "body-ink": "ink-body",
  "socket-empty": "line-4", "socket-hover": "pick", "socket-filled-bg": "lane-sel", "socket-filled-bd": "pick", "socket-broken-bd": "stale",
  "font-body": "font-ui",
  "r-xs": "radius-xs", "r-sm": "radius-sm", "r-btn": "radius-btn", "r-lane": "radius-lane", "r-card": "radius-card", "r-panel": "radius-panel",
};
const legacyLines = Object.entries(legacy).map(([a, b]) => `  --${a}: var(--${b});`);

// one class per type style, for pages and previews that want the exact style
const styleCss = [];
for (const g of t.type.groups) for (const s of g.styles) {
  const decl = [`font-family: var(--font-${s.family || g.family})`, `font-size: ${s.fontSize}`];
  if (s.lineHeight) decl.push(`line-height: ${s.lineHeight}`);
  if (s.fontWeight) decl.push(`font-weight: ${s.fontWeight}`);
  if (s.letterSpacing) decl.push(`letter-spacing: ${s.letterSpacing}`);
  styleCss.push(`.f-t-${s.name} { ${decl.join("; ")}; }`);
}

const out = `/* Forge Console — generated from tokens.json by build.mjs. Do not edit; edit tokens.json. */
:root[data-theme="forge"] {
  color-scheme: dark;
${lines.join("\n")}
  /* older names, aliased onto the system */
${legacyLines.join("\n")}
}
${styleCss.join("\n")}
`;
writeFileSync(join(here, "tokens.css"), out);
console.log(`tokens.css: ${t.color.tokens.length} colours, ${styleCss.length} type styles`);
