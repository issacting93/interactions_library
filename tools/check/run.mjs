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

// three.js comes from a CDN; it is served from this folder's node_modules (a devDependency), or THREE_DIR=<path to node_modules/three>
async function routeThree(ctx) {
  // delaunator (PartSolid's triangulator) is a devDependency here: served from node_modules when installed, so the solid checks run offline
  const del = path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules/delaunator/delaunator.min.js");
  if (fs.existsSync(del)) await ctx.route(/cdn\.jsdelivr\.net\/npm\/delaunator@[^/]+\/delaunator\.min\.js$/, (route) => route.fulfill({ path: del, contentType: "application/javascript" }));
  const three = process.env.THREE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules/three");   // a devDependency here, so the 3D checks run offline
  if (!fs.existsSync(three)) return;
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (route) => {
    const m = route.request().url().match(/three@[^/]+\/(.*)$/), file = path.join(three, m[1]);
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
      else if (f.name.endsWith(".html") && /packages\/kit\/data\//.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))) pages.push(rel);
    } };
    for (const d of ["world", "library", "packages"]) walk(d);
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
  ["bestiary-walkers", async ({ page, url }) => {
    await page.goto(url("world/forges/walker-bestiary/index.html")); await wait(page, 5000);
    const keys = await page.$$eval(".roster button[data-k]", (bs) => bs.map((b) => b.dataset.k));
    assert(keys.length >= 10, `only ${keys.length} creatures listed`);
    for (const k of keys) {
      await page.click(`.roster button[data-k="${k}"]`); await wait(page, 1500);
      const d = await dbg(page);
      assert(d && d.cur === k, `${k}: did not spawn`);
      assert(!d.nan, `${k}: NaN joints`);
      assert(!d.skel.length, `${k}: its skeleton is unsound: ${d.skel.join(", ")}`);
    }
  }],
  ["body-looks", async ({ page, url }) => {
    // one physics body, two looks reading its skeleton: it stands, walks, takes a shove and recovers,
    // floats in water, and a body with no legs slithers
    const B = (s) => page.evaluate(s);
    await page.goto(url("world/forges/walker-bestiary/body.html#pincer")); await wait(page, 4000);
    const s0 = await B(`({ bad: __body.check(), kit: __body.looks.l.count(), soft: __body.looks.r.count(), grip: __body.skel.feel.grip, legs: __body.skel.limbs.length, x: __body.skel.segs[0].o.x, z: __body.skel.segs[0].o.z })`);
    assert(!s0.bad.length, "skeleton: " + s0.bad.join(", "));
    assert(s0.legs === 6 && s0.kit > 500 && s0.soft > 0, `looks did not draw: ${JSON.stringify(s0)}`);
    assert(s0.grip > 0.3, `standing with ${Math.round(s0.grip * 100)}% of its feet down`);
    // send it somewhere 4 units off (no wandering, so the target holds still)
    await page.click('#goes [data-g="click"]');
    await B(`(() => { const b = __body.body, o = b.skel.segs[0].o; b.target.set(o.x + 4 * b.skel.segs[0].z.x, 0, o.z + 4 * b.skel.segs[0].z.z); })()`);
    await wait(page, 3000);
    const s1 = await B(`({ x: __body.skel.segs[0].o.x, z: __body.skel.segs[0].o.z, h: __body.skel.segs[0].o.y - __body.H(__body.skel.segs[0].o.x, __body.skel.segs[0].o.z) })`);
    assert(Math.hypot(s1.x - s0.x, s1.z - s0.z) > 0.4, "it did not walk");
    assert(s1.h > 0.15, `it is not standing: body ${s1.h.toFixed(2)} above the ground`);
    await page.click("#poke"); await wait(page, 300);
    const s2 = await B(`({ bad: __body.check() })`);
    assert(!s2.bad.length, "after a shove: " + s2.bad.join(", "));
    await wait(page, 3000);
    const s3 = await B(`({ bad: __body.check(), grip: __body.skel.feel.grip })`);
    assert(!s3.bad.length && s3.grip > 0.2, `it did not recover from a shove: ${JSON.stringify(s3)}`);
    await page.click('#modes [data-m="swim"]'); await wait(page, 3500);
    const s4 = await B(`({ air: __body.skel.feel.air, mode: __body.skel.mode, planted: __body.skel.limbs.filter((L) => L.planted).length })`);
    assert(s4.mode === "swim" && s4.air > 0.3 && s4.planted === 0, `in water: ${JSON.stringify(s4)}`);
    await page.click('#modes [data-m="walk"]');
    await page.click('#roster [data-k="leech"]'); await wait(page, 500);
    const l0 = await B(`(() => { const b = __body.body, c = b.skel.chunks[0].p, f = b.chunks[0].f; b.target.set(c.x + 5 * f.x, 0, c.z + 5 * f.z); return { x: c.x, z: c.z, n: b.skel.chunks.length, limbs: b.skel.limbs.length }; })()`);
    await wait(page, 3500);
    const l1 = await B(`({ x: __body.skel.chunks[0].p.x, z: __body.skel.chunks[0].p.z, bad: __body.check() })`);
    assert(l0.n > 4 && l0.limbs === 0, `the leech: ${JSON.stringify(l0)}`);
    assert(!l1.bad.length && Math.hypot(l1.x - l0.x, l1.z - l0.z) > 0.2, "the leech did not slither");
  }],
  ["solid-look", async ({ page, url }) => {
    // the creature page in the solid look: every roster creature bakes, walks and shoves with no NaN in its meshes, every switch toggles
    const B = (s) => page.evaluate(s);
    await page.goto(url("world/forges/kit-3d/creature.html#strider")); await wait(page, 6000);
    const LIMBS = { strider: 6, pincer: 6, puffer: 8, centiwyrm: 8, leech: 0, wisp: 0, koi: 0, serpent: 0, jelly: 0, manta: 0, lancer: 10, maw: 4, wraith: 6 };   // legs and wings drawn solid
    for (const key of Object.keys(LIMBS)) {
      await B(`__solid.build("${key}")`); await wait(page, 1500); await page.click("#poke"); await wait(page, 800);
      const s = await B(`(() => { const L = __solid.look, st = L.stats(); let bad = 0, n = 0; for (const o of L.objs) { const a = o.geometry.attributes.position.array; n += a.length; for (const v of a) if (!Number.isFinite(v)) bad++; } return { st, bad, n }; })()`);
      assert(s.n > 1000 && !s.bad, `${key}: ${JSON.stringify(s)}`);
      assert(s.st.legs === LIMBS[key], `${key}: ${s.st.legs} limbs drawn solid, wanted ${LIMBS[key]}`);
    }
    for (const sw of ["wrap", "noise", "blend", "depth", "lines", "mix", "film", "xray", "emit", "iris", "skin", "tint", "bloom", "dark", "flap"]) { await page.click(`[data-s="${sw}"]`); await wait(page, 300); await page.click(`[data-s="${sw}"]`); }
    await wait(page, 500);
    const errs = await B(`__solid.look.stats().tris`); assert(errs > 1000, "nothing drawn after the switches");
  }],
  ["specimen-cores", async ({ page, url }) => {
    // Specimen with solid cores on (ecology-render's render.cores), every species of the tank in turn: its core is built with no script or
    // shader error, and no part fails to bake. A species shown walking must have a solid body from the walker engine.
    await page.goto(url("world/forges/fish-tool/Specimen.html#core=1")); await wait(page, 4500);
    const n = await page.evaluate(() => SPECIES.length), none = [], failed = [], walking = [];
    for (let i = 0; i < n; i++) {
      await page.evaluate((j) => window.__specimen.show(j, true), i);   // not a click on its chip: under software rendering a frame of the heavier materials can outlast the click's wait
      let c = null; for (let k = 0; k < 150 && !c; k++) {   // built in a worker: it arrives a little later than it would on the page's thread
        c = await page.evaluate(() => { const sp = R.species[UI.i]; return sp && sp.core !== undefined ? { key: SPECIES[UI.i].key, count: sp.core ? sp.core.count : 0, H: sp.core ? sp.core.H : 0, tally: sp.core && sp.core.tally } : null; }); if (!c) await wait(page, 200); }
      const walks = await page.evaluate(() => mode !== "swim");
      if (walks) {   // shown walking: its body pieces are made solid by the walker engine (EcologyWalkers.solidOf), its legs stay lines
        await wait(page, 1200); const ws = await page.evaluate(() => { const w = walkers && walkers.crew[0] && EcologyWalkers.solidOf(walkers.crew[0]); return w ? { made: w.made, parts: w.parts, tris: w.tris } : null; });
        assert(ws && ws.made > 0 && ws.tris > 300, `species ${i} walks but has no solid body: ${JSON.stringify(ws)}`); walking.push(i + 1); continue; }
      assert(c, `species ${i}: no core was attempted (is PartSolid loaded?)`);
      assert(Number.isFinite(c.H), `${c.key}: core depth ${c.H}`);
      if (!c.count) none.push(c.key); if (c.tally && c.tally.failed) failed.push(`${c.key} (${c.tally.failed})`);
      await wait(page, 300);
    }
    assert(!failed.length, "parts failed to bake in: " + failed.join(", "));
    assert(none.length <= n / 4, `${none.length} of ${n} species have no core: ${none.join(", ")}`);
    if (none.length) console.log(`      no core (by design): ${none.join(", ")}`);
    assert(await page.evaluate(() => !!window.__specimen.R().coreW), "the cores were not built in a worker");
    { await page.evaluate(() => window.__specimen.show(MAW_I, true)); let ms = null; for (let k = 0; k < 30 && !(ms && ms.made); k++) { await wait(page, 300); ms = await page.evaluate(() => maw && EcologyMaw.solidOf(maw) && { made: EcologyMaw.solidOf(maw).made, parts: EcologyMaw.solidOf(maw).parts, tris: EcologyMaw.solidOf(maw).tris }); }   // the Maw: its body solid, every part
      assert(ms && ms.made === ms.parts && ms.tris > 1000, `the Maw has no solid body: ${JSON.stringify(ms)}`);
      await page.evaluate(() => { document.querySelector('#body [data-v=serpent]').click(); }); await wait(page, 1500); const m2 = await page.evaluate(() => EcologyMaw.solidOf(maw).tris);
      assert(m2 > 1000 && m2 !== ms.tris, "the Maw's solid did not follow its new body"); 
      await page.evaluate(() => window.__specimen.tab("look")); await page.click('#mat [data-v="ember"]'); await page.evaluate(() => { const el = document.getElementById("emis"); el.value = 0.5; el.oninput(); }); await wait(page, 800);   // the Maw wears a look of its own
      const ml = await page.evaluate(() => window.__specimen.lookFor("maw")); assert(ml && ml.material === "ember" && ml.emissive === 0.5 && ml.colors.length === 5, `the Maw's look was not kept: ${JSON.stringify(ml)}`);
      await page.click("#pal-reset"); await wait(page, 300); }
    await page.evaluate(() => window.__specimen.tab("look"));
    { await page.evaluate(() => window.__specimen.tab("view")); await page.click("#orbit"); const y0 = await page.evaluate(() => window.__specimen.cam.oy); await wait(page, 1200);   // the camera turns on its own, and Reset brings it back
      assert(Math.abs((await page.evaluate(() => window.__specimen.cam.oy)) - y0) > 0.1, "Orbit did not turn the camera"); await page.click("#cam-reset"); assert(await page.evaluate(() => window.__specimen.cam.oy === 0 && !window.__specimen.UI.orbit), "Reset view did not reset");
      await page.evaluate(() => window.__specimen.tab("look")); }   // the Core switch is on the Look tab
    // every material and pattern on one swimmer and one walker: the shaders take them with no error, and the choice is kept
    for (const k of ["jelly", "pincer"]) { await page.evaluate((key) => window.__specimen.show(SPECIES.findIndex((x) => x.key === key), true), k); await wait(page, 900);
      for (const m of ["plain", "skin", "glass", "ember", "shell", "golem", "own"]) { await page.click(`#mat [data-v="${m}"]`); await wait(page, 350); }
      // Golem and every overgrowth, its dials, and growth by the tank: they compile, and the choice is kept
      await page.click('#mat [data-v="golem"]'); await wait(page, 350); for (const g of ["frost", "rust", "fungus", "none", "moss"]) { await page.click(`#grow [data-v="${g}"]`); await wait(page, 300); }
      for (const [id, v] of [["grain", 2], ["rough", 0.9], ["lumps", 1.5], ["growa", 0.8], ["growp", 0.2]]) { await page.evaluate(([i, x]) => { const el = document.getElementById(i); el.value = x; el.oninput(); }, [id, v]); await wait(page, 200); }
      { const g = await page.evaluate((key) => window.__specimen.lookFor(key), k); assert(g && g.material === "golem" && g.grow === "moss" && g.grain === 2 && g.lumps === 1.5 && g.growAmount === 0.8 && g.colors.length === 5, `${k}: the golem look was not kept: ${JSON.stringify(g)}`); }
      await page.click('#gmode [data-v="tank"]'); await wait(page, 800); await page.click('#gmode [data-v="set"]'); await wait(page, 200); await page.click('#mat [data-v="own"]'); await wait(page, 300);
      for (const [id, v] of [["vein", 0], ["vein", 1], ["fres", 0], ["fres", 0.85], ["opac", 0.4], ["emis", 0.7], ["vsize", 2]]) { await page.evaluate(([i, x]) => { const el = document.getElementById(i); el.value = x; el.oninput(); }, [id, v]); await wait(page, 350); }
      const kept = await page.evaluate((key) => window.__specimen.lookFor(key), k); assert(kept && kept.material === "plain" && kept.vein === 1 && kept.fresnel === 0.85 && kept.opacity === 0.4 && kept.emissive === 0.7 && kept.veinSize === 2 && kept.colors.length === 5, `${k}: the look chosen was not kept: ${JSON.stringify(kept)}`);
      await page.click("#vshuffle"); await wait(page, 300); assert(await page.evaluate((key) => window.__specimen.lookFor(key).veinSeed > 0, k), `${k}: Shuffle veins gave no layout`);
      await page.click("#pal-next"); await wait(page, 300); await page.click("#pal-reset"); await wait(page, 300); }
    assert(await page.evaluate(() => SPECIES.every((x) => window.CreatureLooks[x.key].colors.length === 5)), "every species has a look of five colours");
    await page.click('#core [data-v="0"]'); await wait(page, 600); await page.click('#core [data-v="1"]'); await wait(page, 600);
  }],
  ["specimen-golem", async ({ page, url }) => {
    // the Golem material and the overgrowths on a swimmer and a walker; SHOTS=<folder> saves a picture of each
    const shot = async (name) => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, name + ".png") }); } };
    const set = async (id, v) => { await page.evaluate(([i, x]) => { const el = document.getElementById(i); el.value = x; el.oninput(); }, [id, v]); await wait(page, 250); };
    await page.goto(url("world/forges/fish-tool/Specimen.html#c=puffer&core=1&tab=look")); await wait(page, 6000);
    for (const k of ["puffer", "manta", "pincer"]) {
      await page.evaluate((key) => window.__specimen.show(SPECIES.findIndex((x) => x.key === key), true), k); await wait(page, 3500);
      assert(await page.evaluate((key) => keyNow() === key, k), `${k}: not shown`); await page.evaluate(() => { window.__specimen.cam.zoom = keyNow() === 'pincer' ? 1.5 : 3.2; });   // close, so a picture shows the surface
      await page.click("#pal-reset"); await wait(page, 300); await page.click('#mat [data-v="golem"]'); await wait(page, 2500); await shot(`${k}-golem`);
      await set("growa", 0); await wait(page, 800); await shot(`${k}-golem-bare`);
      await set("growa", 1); await wait(page, 800); await shot(`${k}-golem-overgrown`);
      await set("growa", 0.45); await set("emis", 0.8); await wait(page, 800); await shot(`${k}-golem-glow`);
      await set("emis", 0); await set("paint", 1); await wait(page, 800); await shot(`${k}-golem-painted`); await set("psteps", 3); await set("pbrush", 2); await wait(page, 800); await shot(`${k}-golem-painted-bold`); await set("psteps", 4); await set("pbrush", 1); await set("ptemp", 1); await set("pdet", 1); await set("pout", 1); await wait(page, 800); await shot(`${k}-golem-painted-full`); await set("ptemp", 0.6); await set("pdet", 0.5); await set("pout", 0.5); await set("paint", 0);
      for (const [m, g] of [["glass", "frost"], ["shell", "rust"], ["skin", "fungus"]]) { await page.click(`#mat [data-v="${m}"]`); await page.click(`#grow [data-v="${g}"]`); await set("growa", 0.6); await wait(page, 900); await shot(`${k}-${m}-${g}`); }
      const L = await page.evaluate(() => window.__specimen.lookFor(keyNow())); assert(L && L.grow === "fungus" && L.material === "skin", `${k}: overgrowth not kept: ${JSON.stringify(L)}`);
      for (const m of ["skin", "shell", "ember"]) { await page.click(`#mat [data-v="${m}"]`); await page.click('#grow [data-v="none"]'); await set("paint", 1); await wait(page, 800); await shot(`${k}-${m}-painted`); }
      const P = await page.evaluate(() => window.__specimen.lookFor(keyNow())); assert(P && P.paint === 1 && P.paintSteps === 4 && P.paintBrush === 1 && P.paintTemp === 0.6 && P.paintOutline === 0.5, `${k}: the painted layer was not kept: ${JSON.stringify(P)}`);
    }
  }],
  ["specimen-shape", async ({ page, ctx, url }) => {
    // Specimen's Shape tab (packages/render/shape-panel.js): how a species' drawing is made solid, changed for the creature and for one part,
    // in its three modes (Extrude, Mesh, Stages). Every change builds the core again with no script or shader error and is kept; Reset undoes it.
    // SHOTS=<folder>: a picture of each mode is saved there.
    const shot = async (name) => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, name + ".png") }); } };
    const core = () => page.evaluate(() => { const sp = R.species[UI.i], c = sp && sp.core; return c ? { H: c.H, count: c.count, tally: { cored: c.tally.cored, lines: c.tally.lines, thin: c.tally.thin, partTris: !!c.tally.partTris }, wire: !!c.wire } : null; });
    // do something, then wait for the core it asks for (a new one, built in the worker)
    const rebuilt = async (act) => { await page.evaluate(() => { window.__c0 = R.species[UI.i].core; }); await act(); for (let k = 0; k < 150; k++) { await wait(page, 200); if (await page.evaluate(() => { const c = R.species[UI.i].core; return !!c && c !== window.__c0; })) return core(); } throw new Error("the core was not built again"); };
    const dial = (id, v) => page.evaluate(([i, x]) => { const el = document.getElementById("sh-" + i); el.value = x; el.oninput(); }, [id, v]);
    await page.goto(url("world/forges/fish-tool/Specimen.html#core=1&c=manta&tab=shape")); await wait(page, 4500);
    let c0 = null; for (let k = 0; k < 150 && !c0; k++) { c0 = await core(); if (!c0) await wait(page, 200); }
    assert(c0 && c0.count > 0, "the Glass Manta has no core"); assert(c0.wire && c0.tally.partTris, "with the Shape tab open the core carries its mesh edges and each part's triangle count");
    assert(await page.evaluate(() => !document.getElementById("pmap").hidden && document.querySelectorAll("#shape-row .seg").length >= 6), "the Shape tab's controls or its part map are missing");
    await shot("shape-1-extrude");
    // Extrude, whole creature: thicker stands deeper; a ridge is a different solid; both are kept
    const thick = await rebuilt(() => dial("thick", 1.4)); assert(thick.H > c0.H * 1.2, `Thickness 140% did not deepen the solid: ${c0.H} to ${thick.H}`);
    await rebuilt(() => page.click('#sh-method [data-v="blade"]'));
    let mine = await page.evaluate(() => window.__specimen.shape.mine().manta); assert(mine && mine.thick === 1.4 && mine.mode === "blade", `the creature's shape was not kept: ${JSON.stringify(mine)}`);
    await shot("shape-2-ridge");
    // one part, picked on the map (its middle is the body), then by the stepper
    await page.evaluate(() => { const cv = document.querySelector("#pmap canvas"), r = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent("click", { clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.3, bubbles: true })); });
    const picked = await page.evaluate(() => window.__specimen.shape.state.pick); assert(picked >= 0, "a tap on the map picked no part");
    await rebuilt(() => page.click('#sh-method [data-v="plate"]')); await rebuilt(() => dial("inner", -0.6));
    mine = await page.evaluate(() => window.__specimen.shape.mine().manta); { const own = Object.values(mine.parts || {}); assert(own.length === 1 && own[0].mode === "plate" && own[0].inner === -0.6, `the part's own settings were not kept: ${JSON.stringify(mine.parts)}`); }
    await shot("shape-3-part");
    // Mesh: the edges drawn, a part left as lines, detail lowered
    await page.click('#sh-mode [data-v="mesh"]'); await wait(page, 500); assert(await page.evaluate(() => window.__specimen.shape.edit().wire > 0), "Mesh mode does not draw the mesh's edges");
    await shot("shape-4-mesh");
    const asLines = await rebuilt(() => page.click('#sh-make [data-v="lines"]')); assert(asLines.tally.lines === 1, `a part made Lines is still solid: ${JSON.stringify(asLines.tally)}`);
    const coarse = await rebuilt(() => { return page.click("#sh-whole").then(() => dial("res", 0.5)); }); assert(coarse.count < asLines.count * 0.8, `Detail 50% did not thin the mesh: ${asLines.count} to ${coarse.count}`);
    await page.click('#sh-wire [data-v="0"]'); await wait(page, 300); assert(await page.evaluate(() => window.__specimen.shape.edit().wire === 0), "Mesh lines Off still draws them");
    // Stages: each one draws with no error; Outline has no solid, Fill is flat, Lines is the finished creature
    await page.click('#sh-mode [data-v="stages"]'); await wait(page, 400);
    for (let n = 1; n <= 5; n++) { await page.click(`#sh-stage [data-v="${n}"]`); await wait(page, n === 3 || n === 4 ? 2200 : 900);
      const st = await page.evaluate(() => { const p = window.__specimen.shape, e = p.edit(); return { cores: p.cores(), rise: e.rise, wire: e.wire, plain: e.plain }; });
      if (n === 1) assert(st.cores === 0, "Outline still shows the solid"); if (n === 2) assert(st.rise === 0 && st.wire > 0, `Fill is not flat with its triangles shown: ${JSON.stringify(st)}`);
      if (n === 3) assert(st.rise > 0.9, `Inflate did not rise: ${JSON.stringify(st)}`); if (n === 5) assert(st.cores === 1 && st.rise === 1 && !st.plain && st.wire === 0, `Lines is not the finished creature: ${JSON.stringify(st)}`);
      await shot("shape-5-stage-" + n); }
    await dial("rise", 0.4); await wait(page, 300); assert(await page.evaluate(() => window.__specimen.shape.edit().rise === 0.4), "the Rise dial did not reach the view");
    // Copy all gives the text creature-shapes.json takes; Reset gives the creature back its saved shape
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {}); await page.click("#sh-copy"); await wait(page, 400);
    { const text = await page.evaluate(async () => window.__shapesText || (await navigator.clipboard.readText().catch(() => ""))), o = text ? JSON.parse(text) : null; assert(o && o.manta && o.manta.by === "zac" && o.manta.mode === "blade" && Object.keys(o.manta.parts).length === 1, `Copy all did not give the shapes: ${String(text).slice(0, 200)}`); }
    await page.click('#sh-mode [data-v="extrude"]'); await rebuilt(() => page.click("#sh-reset"));
    assert(await page.evaluate(() => !window.__specimen.shape.mine().manta && !JSON.parse(localStorage.getItem("forge:specimen-shapes") || "{}").manta), "Reset left the changes in place");
    // leaving the tab puts the creature back as the page has it; a species shown walking has nothing to shape here
    await page.evaluate(() => window.__specimen.tab("look")); await wait(page, 300); assert(await page.evaluate(() => window.__specimen.shape.edit() === null && document.getElementById("pmap").hidden), "the Shape view stayed on after its tab was left");
    await page.evaluate(() => { window.__specimen.tab("shape"); window.__specimen.show(SPECIES.findIndex((x) => x.key === "pincer"), true); }); await wait(page, 1500);
    assert(await page.evaluate(() => document.getElementById("shape-row").classList.contains("off") && window.__specimen.shape.cores() === null), "a walker is offered the Shape controls");
  }],
  ["specimen-creatures", async ({ page, url }) => {
    // every built creature (window.Creatures, shared/engine/creatures/) in Specimen: it stands, its feet step, its body does not bounce,
    // and each of its switches builds it again without an error. A new creature is covered by being registered.
    await page.goto(url("world/forges/fish-tool/Specimen.html#c=quad")); await wait(page, 5000);
    const keys = await page.evaluate(() => window.Creatures.list().map((c) => c.key)); assert(keys.length >= 7, "the creature registry is short: " + keys.join(", "));
    for (const key of keys) {
      await page.evaluate((k) => window.__specimen.show(SPECIES.length + 1 + window.Creatures.list().findIndex((c) => c.key === k), true), key); await wait(page, 2500);
      const m = await page.evaluate(async () => { const out = []; for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 50)); const w = window.__specimen.walkers, c = w.crew[0]; if (!c) return null; const B = c.body, q = B.chunks[B.segChunk[B.legs[0].seg]];
          out.push([q.p.y - w.W.H(q.p.x, q.p.z), B.legs.filter((L) => L.planted).length, q.p.x, q.p.z]); }
        const ys = out.map((o) => o[0]), c = window.__specimen.walkers.crew[0];
        return { bob: Math.max(...ys) - Math.min(...ys), h: ys[0], down: out.reduce((a, o) => a + o[1], 0) / out.length, Lm: c.def.Lm, nan: out.some((o) => !o.every(Number.isFinite)), switches: window.Creatures.get(c.brain.kind).switches.map((s) => [s.key, s.options.map((o) => String(o[0]))]) }; });
      assert(m, `${key}: no walker was built`); assert(!m.nan, `${key}: its body went NaN`);
      assert(m.h > 0.05, `${key}: it lies on the ground (${m.h.toFixed(2)})`); assert(m.down >= 1.5, `${key}: its feet are off the ground (${m.down.toFixed(1)} of 4 down on average)`);
      assert(m.bob < 0.25 * m.Lm, `${key}: its body bounces ${m.bob.toFixed(2)} (legs ${m.Lm})`);
      for (const [sk, vals] of m.switches) for (const v of vals) { await page.click(`#made-${sk} [data-v="${v}"]`); await wait(page, 700); assert(await page.evaluate(() => window.__specimen.walkers.crew.length === 1), `${key}: switch ${sk}=${v} left no walker`); }
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
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined,   // CHROME=<path>: use an installed Chrome instead of Playwright's own
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
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
