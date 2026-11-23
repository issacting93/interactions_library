// The fingerprint of everything eco-engine.js is built from: the Rust crate's sources and manifest, and the loader (src/engine). The build
// writes it into the script's first line; `node tools/engine-source.mjs --check` fails (exit 1) when the committed script was built from
// something else, so a change to the Rust that was not rebuilt (or a script edited by hand) is caught without needing Rust to check it.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const files = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : [p]; });
export function engineSource() {
  const list = [...files(join(root, "engine/src")), join(root, "engine/Cargo.toml"), ...files(join(root, "src/engine"))].filter((p) => /\.(rs|toml|ts)$/.test(p)).sort();
  const h = createHash("sha256");
  for (const p of list) { h.update(relative(root, p).replaceAll("\\", "/")); h.update("\0"); h.update(readFileSync(p, "utf8").replace(/\r\n/g, "\n")); h.update("\0"); }
  return h.digest("hex").slice(0, 16);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--check")) {
  const out = fileURLToPath(new URL("../../../shared/engine/ecology/eco-engine.js", import.meta.url));
  const got = (/engine-source: ([0-9a-f]+)/.exec(readFileSync(out, "utf8").slice(0, 600)) || [])[1], want = engineSource();
  if (got === want) console.log("eco-engine.js is built from the current engine source (" + want + ")");
  else { console.error(`eco-engine.js was built from ${got || "an unmarked source"}, but the engine source is now ${want}: run \`npm run build:engine\` in games/the-maw and commit the script`); process.exit(1); }
}
