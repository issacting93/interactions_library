// Smoke tests: serve the repo root, open each page in Chromium, fail on script errors or NaN walkers.
// node run.mjs [filter]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".wasm": "application/wasm" };
// errors that are about the network, not the page (fonts, CDNs unreachable offline)
const NOISE = /ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|fonts\.googleapis|Failed to load resource/;

function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.stat(p, (err, st) => {
      const file = !err && st.isDirectory() ? path.join(p, "index.html") : p;
      fs.readFile(file, (e, buf) => {
        if (e) { res.writeHead(404).end(); return; }
        res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" }).end(buf);
      });
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// three.js comes from a CDN; THREE_DIR=<path to node_modules/three> serves it locally (offline runs)
async function routeThree(ctx) {
  if (!process.env.THREE_DIR) return;
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (route) => {
    const m = route.request().url().match(/three@[^/]+\/(.*)$/), file = path.join(process.env.THREE_DIR, m[1]);
    if (fs.existsSync(file)) route.fulfill({ path: file, contentType: "application/javascript" }); else route.abort();
  });
}

const watch = (page, errs) => {
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !NOISE.test(m.text())) errs.push(m.text().slice(0, 300)); });
};
const wait = (page, ms) => page.waitForTimeout(ms);
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const dbg = (page) => page.evaluate(() => window.__dbg && window.__dbg());

const CHECKS = [
  ["forge-pages", async ({ page, url, errs }) => {
    const skip = new Set(["workbench.html"]);           // superseded prototype, kept standalone
    const pages = fs.readdirSync(path.join(ROOT, "world/forge/web")).filter((f) => f.endsWith(".html") && !skip.has(f));
    for (const f of pages) {
      const before = errs.length;
      await page.goto(url(`world/forge/web/${f}`)); await wait(page, 1200);
      assert(errs.length === before, `${f}: ${errs.slice(before).join(" | ")}`);
    }
  }],
  ["data-paths", async ({ page, url }) => {
    // every page that reads the shared data must find it: no 404 for a json or svg it asks for
    const pages = [];
    const walk = (dir) => { for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, f.name);
      if (f.isDirectory()) { if (!/node_modules|archive|\.git/.test(f.name)) walk(rel); }
      else if (f.name.endsWith(".html") && /shared\/data\//.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))) pages.push(rel);
    } };
    for (const d of ["world", "library", "shared"]) walk(d);
    const missing = [];
    page.on("response", (r) => { if (r.status() >= 400 && /\.(json|svg)(\?|$)/.test(r.url())) missing.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+\//, "")}`); });
    for (const p of pages) { await page.goto(url(p.split(path.sep).map(encodeURIComponent).join("/"))).catch(() => {}); await wait(page, 800); }
    assert(pages.length > 20, `only ${pages.length} pages found`);
    assert(!missing.length, "missing: " + [...new Set(missing)].join(", "));
  }, { ignoreErrors: true }],
  ["compose-quad", async ({ page, url }) => {
    await page.goto(url("world/forge/web/compose.html?species=tpl-quad")); await wait(page, 2000);
    assert(await page.locator("#grid .cell").count() > 5, "no template cells");
    await page.click('#looks button:text-is("White mech")'); await wait(page, 400);
    assert(await page.locator("#stage svg").count() === 1, "no drawing in White mech");
  }],
  ["compose-blade-to-3d", async ({ page, ctx, url }) => {
    await page.goto(url("world/forge/web/compose.html?species=tpl-blade")); await wait(page, 2000);
    const labels = await page.$$eval("#grid .cell .lb", (l) => l.map((x) => x.textContent));
    for (const s of ["BODY", "POD", "FRONT LEG", "BACK LEG"]) assert(labels.includes(s), `missing slot ${s}`);
    await page.click('#grid .cell:not(.is-mirror):has(.lb:text-is("FRONT LEG"))'); await wait(page, 500);
    assert(await page.locator(".f-bloom__opt").count() > 1, "the bloom offered nothing");
    await page.locator(".f-bloom__opt").nth(1).click(); await wait(page, 400); await page.keyboard.press("Escape");
    assert((await page.textContent("#swaps")).includes("for"), "the swap did not register");
    const [pop] = await Promise.all([ctx.waitForEvent("page", { timeout: 15000 }), page.click("#walk3d")]);
    const errs3d = []; watch(pop, errs3d);
    await pop.waitForLoadState(); await wait(pop, 6000);
    const d = await dbg(pop);
    assert(d && d.cur === "composed", `3D view did not open the design: ${JSON.stringify(d)}`);
    assert(!d.nan, "the design went to NaN");
    assert(!errs3d.length, "3D view: " + errs3d.join(" | "));
  }],
  ["bestiary-walkers", async ({ page, url }) => {
    await page.goto(url("world/forges/walker-bestiary/index.html")); await wait(page, 5000);
    const keys = await page.$$eval(".roster button[data-k]", (bs) => bs.map((b) => b.dataset.k));
    assert(keys.length >= 10, `only ${keys.length} creatures listed`);
    for (const k of keys) {
      await page.click(`.roster button[data-k="${k}"]`); await wait(page, 1500);
      const d = await dbg(page);
      assert(d && d.cur === k, `${k}: did not spawn`);
      assert(!d.nan, `${k}: NaN joints`);
    }
  }],
  ["bestiary-remix", async ({ page, url }) => {
    await page.goto(url("world/forges/walker-bestiary/index.html#handMech")); await wait(page, 5000);
    assert(!(await page.locator("#bloomGrp").isHidden()), "the remix bloom is hidden");
    await page.locator("#bloom .petal").first().click(); await wait(page, 1500);
    await page.click("#bloomShuffle"); await wait(page, 1500);
    const d = await dbg(page);
    assert(d && d.cur === "handMech" && !d.nan, `remix broke the walker: ${JSON.stringify(d)}`);
  }],
  ["city-stage", async ({ page, url }) => {
    // Forge's City stage is World Scene in a frame: a click on a block opens the bloom, a pick pins it,
    // the grammar is built again with the pin, and the pin survives a new seed
    await page.goto(url("world/forge/web/city.html"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const f = document.getElementById("scene"); return f && f.contentWindow && f.contentWindow.ForgeCityHost && f.contentWindow.ForgeCityHost.summary(); }, null, { timeout: 120000 });
    await wait(page, 5000);
    const f = page.frames().find((fr) => /World%20Scene/.test(fr.url())), box = await page.locator("#scene").boundingBox();
    const pt = await f.evaluate(() => { for (let y = 0.35; y < 0.9; y += 0.02) for (let x = 0.25; x < 0.75; x += 0.02) { const t = pickGrammarTileAt(innerWidth * x, innerHeight * y); if (t && t.module && t.district === "dense") return [innerWidth * x, innerHeight * y, CityGrammar.tileKey(t)]; } return null; });
    assert(pt, "no dense housing block found under the pointer scan");
    await page.mouse.click(box.x + pt[0], box.y + pt[1]); await wait(page, 1200);
    assert(await page.locator('.f-bloom button[aria-label^="Market"]').count(), "the block bloom did not open");
    await page.evaluate(() => document.querySelector('.f-bloom button[aria-label^="Market"]').click()); await wait(page, 2500);
    const now = await f.evaluate((k) => { const t = forgeTileOf(k); return [t.district, t.module && t.module.id]; }, pt[2]);
    assert(now[0] === "market" && now[1], `pinned block is ${JSON.stringify(now)}, not a built market`);
    await page.evaluate(() => document.getElementById("newCity").click()); await wait(page, 6000);
    const after = await f.evaluate((k) => [forgeTileOf(k).district, ForgeCityHost.summary().seed], pt[2]);
    assert(after[0] === "market" && after[1] !== 7, `after New city the block is ${JSON.stringify(after)}`);
  }],
  ["city-world", async ({ page, url }) => {
    // the one 3D world: Forge buildings stand as the towers, built from their own design; walking
    // creatures handed over by the host walk it; the road leaves the gate
    await page.goto(url("world/forge/web/city.html"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const f = document.getElementById("scene"); return f && f.contentWindow && f.contentWindow.ForgeCityHost && f.contentWindow.ForgeCityHost.summary(); }, null, { timeout: 120000 });
    await wait(page, 5000);
    const f = page.frames().find((fr) => /World%20Scene/.test(fr.url()));
    await page.evaluate(() => document.getElementById("forgeStarters3d").click());
    await page.waitForFunction(() => /forged/.test(document.getElementById("status").textContent), null, { timeout: 120000 }); await wait(page, 5000);
    const st = (await f.evaluate(() => ForgeCityHost.summary())).standing;
    assert(st.length >= 2 && st.every((t) => t.key && t.exact), `towers are not Forge buildings built from their design: ${JSON.stringify(st)}`);
    assert(new Set(st.map((t) => t.key)).size === st.length, `a building stands twice while others stand nowhere: ${JSON.stringify(st)}`);
    // every building form stands up without an empty drawing
    const forms = await f.evaluate(() => forgeBuildings.map((b) => { const r = CreatureSpire.buildSpireGL2(b.spec.spire, {}); return [b.name, r.stats.segments, r.occluder.indices.length, +r.top.toFixed(1)]; }));
    assert(forms.length === 6 && forms.every((x) => x[1] > 500 && x[2] > 0 && x[3] > 5), `a building form came out empty in 3D: ${JSON.stringify(forms)}`);
    const flat = { of: "check", len: 1, h: 0.4, stride: 0.3, speed: 1, body: [-0.2, -0.5, 0.2, -0.5, 0.2, -0.5, 0.2, 0.5, 0.2, 0.5, -0.2, 0.5, -0.2, 0.5, -0.2, -0.5],
      legs: [0, 1].flatMap((i) => [1, -1].map((sd) => ({ i, side: sd, hip: [0.2 * sd, 0.3 - i * 0.6], home: [0.5 * sd, 0.3 - i * 0.6], len: 0.6 }))) };
    const n = await f.evaluate((flat) => ForgeCityHost.setCreatures([{ id: "check", name: "Check", flat, motion: { run: "none" }, count: 3, color: "#5be39a" }]), flat);
    await wait(page, 1500);
    const g = await f.evaluate(() => [forgeGroundN, forgeGround.agents.every((a) => Number.isFinite(a.x + a.y))]);
    assert(n === 3 && g[0] > 0 && g[1], `walking creatures did not stand in the city: ${n} ${JSON.stringify(g)}`);
    const r = await f.evaluate(() => [ForgeCityHost.route().road, !!(atmoWorld && atmoWorld.road && atmoWorld.road.length > 10 && atmoWorld.roadGeo.count > 0)]);
    assert(r[0] && r[1], `the road is missing: ${JSON.stringify(r)}`);
  }],
];

const filter = process.argv[2] || "";
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let failed = 0;
for (const [name, fn, opts = {}] of CHECKS.filter(([n]) => n.includes(filter))) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await routeThree(ctx);
  const page = await ctx.newPage(), errs = []; watch(page, errs);
  const t0 = Date.now();
  try {
    await fn({ page, ctx, errs, url: (p) => base + p });
    if (!opts.ignoreErrors) assert(!errs.length, errs.join(" | "));   // data-paths visits old pages whose own script errors are not its business
    console.log(`PASS  ${name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
await browser.close(); server.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
