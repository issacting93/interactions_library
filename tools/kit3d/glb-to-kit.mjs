// Turn Zac's Blender Qilin (packages/kit/data/mechs/blender-mech.glb) into kit drawings: runs tools/kit3d/glb-to-kit.html in Chrome and writes
// tools/kit3d/out/blender-qilin.json (the pieces with their joints) and tools/kit3d/out/blender-qilin.svg (one sheet, for the importer and for looking at).
// Serve the repo root on 8731 first. CHROME=/path/to/chrome THREE_DIR=<node_modules/three> node tools/kit3d/glb-to-kit.mjs
import { createRequire } from "module"; import fs from "fs"; import path from "path";
const require = createRequire(path.resolve("tools/check/package.json")); const { chromium } = require("playwright");
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext();
await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (r) => { const m = r.request().url().match(/three@[^/]+\/(.*)$/), f = path.join(process.env.THREE_DIR, m[1]); fs.existsSync(f) ? r.fulfill({ path: f, contentType: "application/javascript" }) : r.abort(); });
const pg = await ctx.newPage(); pg.on("pageerror", (e) => console.log("ERR", e.message));
await pg.goto("http://localhost:8731/tools/kit3d/glb-to-kit.html"); await pg.waitForFunction(() => window.KIT, null, { timeout: 60000 });
const K = await pg.evaluate(() => window.KIT); await b.close();
if (K.error) { console.log(K.error); process.exit(1); }
fs.mkdirSync("tools/kit3d/out", { recursive: true }); fs.writeFileSync("tools/kit3d/out/blender-qilin.json", JSON.stringify(K, null, 1));
let x = 20, svg = ""; for (const p of K.pieces) { svg += `<g id="${p.name}" data-view="${p.view}" transform="translate(${(x + p.w / 2).toFixed(1)} ${(20 + p.h / 2).toFixed(1)})" fill="none" stroke="#222" stroke-width="0.8">${p.svg}</g>`; x += p.w + 30; }
fs.writeFileSync("tools/kit3d/out/blender-qilin.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 300" width="${x * 3}" height="900"><rect width="100%" height="100%" fill="#fff"/>${svg}</svg>`);
for (const p of K.pieces) console.log(p.name, p.view, p.w, p.h, "loops", p.loops, JSON.stringify(p.meta && { J: p.meta.J, K: p.meta.K, T: p.meta.T }));
console.log("fwd", K.fwd, "hipY", K.hipY, JSON.stringify(K.plates));
