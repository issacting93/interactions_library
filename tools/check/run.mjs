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
    assert(pages.length >= 15, `only ${pages.length} pages found`);   // a floor that says the walk still finds the tree (20 pages after the 2026-11-10 removals)
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
  ["compose-sheet", async ({ page, url }) => {
    // a sheet species composes from the kit as it now stands: its header counts only the parts it is
    // drawn with, the old Black Monarch spine (legacy parts) is not drawn, a swap registers and saves
    const kit = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/data/creature-parts.json"), "utf8"));
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/data/creature-catalog.json"), "utf8"));
    const drawn = kit.filter((p) => p.species === "sheet-black-monarch" && !p.legacy && (cat.parts[p.id] || {}).hidden !== "empty");
    await page.goto(url("world/forge/web/compose.html?species=sheet-black-monarch")); await wait(page, 2000);
    const meta = await page.textContent("#curMeta");
    assert(meta.includes(`${drawn.length} parts`), `header says "${meta}", the creature is drawn with ${drawn.length} parts`);
    const legacy = kit.filter((p) => p.legacy).map((p) => p.svg.match(/\sd="([^"]{20})/)?.[1]).filter(Boolean);
    const stage = await page.innerHTML("#stage");
    assert(!legacy.some((d) => stage.includes(d)), "a legacy part is drawn on the creature");
    assert(await page.locator("#curImg").getAttribute("src").then((s) => s.length > 2000), "the picker thumbnail is not the whole creature");
    await page.locator("#grid .cell:not(.is-mirror)").first().click(); await wait(page, 500);
    await page.locator(".f-bloom__opt").nth(1).click(); await wait(page, 400); await page.keyboard.press("Escape");
    assert((await page.textContent("#swaps")).includes("for"), "the swap did not register");
    await page.setViewportSize({ width: 390, height: 844 }); await wait(page, 500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(over <= 1, `the page is ${over}px wider than a phone`);
  }],
  ["bestiary-forge", async ({ page, url }) => {
    // the species sheet is the kit's creatures as they stand now, Remix and Shuffle fill the bench with
    // creatures that fit the frame, and a tower saved to the world stands in the 3D city
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/data/creature-catalog.json"), "utf8"));
    const creatures = cat.families.filter((f) => f.id !== "marks").flatMap((f) => f.sheets);
    await page.goto(url("world/forges/bestiary-forge/index.html")); await wait(page, 2500);
    const tiles = await page.$$eval("#sheet .tile .cap span:first-child", (l) => l.map((x) => x.textContent));
    assert(tiles.length >= creatures.length - 2 && tiles.length <= creatures.length, `${tiles.length} species on the sheet, the kit has ${creatures.length} creatures`);
    assert(tiles.includes(cat.sheets["sheet-unnamed-no-30"].name), "Shade Drake is not on the sheet under its name");
    assert(!(await page.isVisible("#planSet")), "an empty body plan image shows");
    await page.click("#remixBtn"); await wait(page, 600);
    for (let i = 0; i < 3; i++) { await page.click("#shuffleBtn"); await wait(page, 200); }
    const cards = await page.locator("#tray > article").count();
    assert(cards >= 4, `only ${cards} creatures on the bench`);
    // every drawing fits its frame: the rendered lines stay inside the 400 x 400 view
    const outside = await page.evaluate(async () => {
      let worst = 0;
      for (const img of document.querySelectorAll("#tray article .plate img")) {
        const doc = new DOMParser().parseFromString(decodeURIComponent(img.src.split(",")[1]), "image/svg+xml");
        const svg = document.importNode(doc.documentElement, true); svg.style.cssText = "position:absolute;left:-9999px"; document.body.append(svg);
        const b = svg.getBBox(); svg.remove();
        worst = Math.max(worst, -b.y, b.y + b.height - 400, -b.x, b.x + b.width - 400);
      }
      return worst;
    });
    assert(outside < 6, `a creature runs ${outside.toFixed(0)} units off its frame`);
    assert(await page.locator('#tray button:text-is("Download .svg"):enabled').count() > 0, "Download .svg is off outside Claude");
    // a tower, saved, stands in the 3D city as designed
    await page.click('#mode [data-v="towers"]'); await wait(page, 300);
    await page.click("#evolveBtn"); await wait(page, 7000);
    assert(await page.locator("#arch .cell:not(.void)").count() >= 8, "Evolve filled too few cells");
    assert(await page.locator("#arch .cell .f").count() === 0, "fitness scores are printed on the towers");
    await page.locator("#arch .cell:not(.void)").first().click(); await wait(page, 300);
    await page.locator('#tray article').first().locator('button:text-is("Save to world")').click(); await wait(page, 1500);
    await page.goto(url("world/scenes/world-scene/World%20Scene.html")); await wait(page, 5000);
    const stood = await page.evaluate(async () => {
      const w = await ForgeWorld.activeWorld(), t = (await w.list()).filter((o) => o.type === "building" && o.recipe && o.recipe.kind === "bred-tower").pop();
      if (!t) return "no tower in the world";
      ForgeCityHost.setCity({ seed: 5, towers: 1, buildings: [{ id: t.id, version: t.version, name: t.name, spec: t.recipe }], sites: { 0: t.id } });
      await new Promise((r) => setTimeout(r, 2500));
      const tw = placedTowers[0];
      return tw && tw.forgeKey && tw.spire && tw.lineCount > 100 ? "ok" : `stood as ${JSON.stringify({ key: tw && tw.forgeKey, spire: tw && tw.spire, lines: tw && tw.lineCount })}`;
    });
    assert(stood === "ok", stood);
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
    // undo steps back through the new seed and then the pin; redo brings them back; a reload keeps the unsaved city
    await page.evaluate(() => { document.getElementById("undo").click(); document.getElementById("undo").click(); }); await wait(page, 6000);
    const undone = await f.evaluate((k) => [forgeTileOf(k).district, ForgeCityHost.summary().seed], pt[2]);
    assert(undone[0] === "dense" && undone[1] === 7, `after two undos the city is ${JSON.stringify(undone)}`);
    await page.evaluate(() => document.getElementById("redo").click()); await wait(page, 2500);
    assert((await f.evaluate((k) => forgeTileOf(k).district, pt[2])) === "market", "redo did not bring the pin back");
    await page.goto(url("world/forge/web/city.html"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const fr = document.getElementById("scene"); return fr && fr.contentWindow && fr.contentWindow.ForgeCityHost && fr.contentWindow.ForgeCityHost.summary(); }, null, { timeout: 120000 });
    await wait(page, 5000);
    const f2 = page.frames().find((fr) => /World%20Scene/.test(fr.url()));
    assert((await f2.evaluate((k) => forgeTileOf(k).district, pt[2])) === "market", "the unsaved pin did not survive a reload");
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
    // they keep to the streets: near a node of the walkable graph, never on a built lot
    let worst = 0, built = 0;
    for (let k = 0; k < 6; k++) { await wait(page, 2000); const s = await f.evaluate(() => { const W = forgeWalkGraph(), sc = lastCityModel[0], cx = lastCityModel[12], cy = lastCityModel[13];
      return forgeGround.agents.map((a) => { const lx = (a.x - cx) / sc, lz = (a.y - cy) / sc, nd = W.nodes[W.nearest(lx, lz)], t = CityGrammar.locate(grammarCity, lx, lz);
        return [Math.hypot(nd.x - lx, nd.z - lz), t ? t.corners.filter((L) => L.solid && Math.hypot(L.x - lx, L.z - lz) < 0.3).length : 0]; }); });
      for (const x of s) { worst = Math.max(worst, x[0]); built += x[1]; } }
    assert(worst < 0.9 && built === 0, `walkers left the streets: ${worst.toFixed(2)} from a node, ${built} on built lots`);
    // the drawing used across the city is the light one
    const lines = await f.evaluate(() => placedTowers.map((t) => t.lineCount));
    assert(lines.every((c) => c > 300 && c < 40000), `tower drawings are not the light ones: ${JSON.stringify(lines)}`);
    const r = await f.evaluate(() => [ForgeCityHost.route().road, !!(atmoWorld && atmoWorld.road && atmoWorld.road.length > 10 && atmoWorld.roadGeo.count > 0)]);
    assert(r[0] && r[1], `the road is missing: ${JSON.stringify(r)}`);
  }],
  ["city-panels", async ({ page, url }) => {
    // World Scene's own panels, shown in Forge: the swimmers' dials and modes drive the scene, drift runs
    // over the Forge buildings standing as towers, the camera and the city's rules are reachable, and what
    // was tuned is kept on the city
    await page.goto(url("world/forge/web/city.html"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const f = document.getElementById("scene"); return f && f.contentWindow && f.contentWindow.ForgeCityHost && f.contentWindow.ForgeCityHost.summary(); }, null, { timeout: 120000 });
    await wait(page, 5000);
    const f = page.frames().find((fr) => /World%20Scene/.test(fr.url()));
    const tab = await page.evaluate(() => { const t = document.getElementById("tab3d-ecology"), q = t.getBoundingClientRect(); return document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2) === t; });
    assert(tab, "the inspector's tabs are covered");
    await page.evaluate(() => document.getElementById("forgeStarters3d").click());
    await page.waitForFunction(() => /forged/.test(document.getElementById("status").textContent), null, { timeout: 120000 }); await wait(page, 5000);
    await page.evaluate(() => document.getElementById("tab3d-ecology").click()); await wait(page, 1500);
    await page.evaluate(() => { const r = document.getElementById("k3d-count"); r.value = 260; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); document.getElementById("c3d-mode-both").click(); });
    await wait(page, 800);
    const sc = await f.evaluate(() => [+document.getElementById("count").value, document.querySelector('input[name="mode"]:checked').value]);
    assert(sc[0] === 260 && sc[1] === "both", `the swimmer controls did not reach the scene: ${JSON.stringify(sc)}`);
    const kept = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("forge:city-draft")); const s = k && JSON.parse(localStorage.getItem(k)).recipe.grammar.scene; return s ? [s.count, s.mode] : null; });
    assert(kept && kept[0] === 260 && kept[1] === "both", `the tuned scene is not kept on the city: ${JSON.stringify(kept)}`);
    const d0 = await f.evaluate(() => { const d = ForgeCityHost.drift(); return d && d.landmarks.map((l) => l.attracts.length); });
    assert(d0 && d0.length >= 2 && d0.every((n) => n > 0), `drift has no landmarks that attract: ${JSON.stringify(d0)}`);
    await wait(page, 20000);
    const moved = await f.evaluate(() => ForgeCityHost.drift().species.filter((s) => s.exposure > 0 && s.drift > 0).length);
    assert(moved > 0, "no species drifted round the buildings");
    await page.evaluate(() => document.getElementById("tab3d-camera").click()); await wait(page, 800);
    await page.evaluate(() => document.getElementById("c3d-view-top").click()); await wait(page, 800);
    assert((await f.evaluate(() => +document.getElementById("tilt").value)) === 0, "Top view did not reach the scene");
    await page.evaluate(() => document.getElementById("tab3d-city").click()); await wait(page, 800);
    assert(await page.evaluate(() => document.querySelectorAll("#rules3d .modlist span").length > 4), "the city's modules are not listed");
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
