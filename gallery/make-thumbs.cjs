#!/usr/bin/env node
// Render every component in components/catalog.js to gallery/thumbs/<id>.jpg (480×300).
//   python3 -m http.server 8767 &   (from the repo root)
//   node gallery/make-thumbs.cjs [id …]
// Offline? Point CDN_DIR at a folder with `npm i three@0.169.0 animejs@4 parallax-js@3.1.0` in it and
// the script serves those instead of jsDelivr/cdnjs, so the three.js and anime.js pieces still render.
// Thumbnails are what the Bench's kit and the gallery's design cards draw, so pages stay light:
// a live component is only loaded when it is placed on the frame or a design is opened.
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");
const window = {}; new Function("window", fs.readFileSync(path.join(root, "components/catalog.js"), "utf8"))(window);
const base = process.env.BASE || "http://localhost:8767/";
const only = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (const c of window.LIBRARY_CATALOG.components) {
    if (only.length && !only.includes(c.id)) continue;
    // a fresh page each time, so one slow WebGL piece can't hold up the next
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 0.5 });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const cdn = process.env.CDN_DIR && path.join(process.env.CDN_DIR, "node_modules");
    if (cdn) await page.route(/cdn\.jsdelivr\.net\/npm\/|cdnjs\.cloudflare\.com\/ajax\/libs\/parallax/, (r) => {
      const u = new URL(r.request().url()).pathname;
      let f = null;
      if (u.startsWith("/npm/animejs@4")) f = "animejs/dist/bundles/anime.esm.js";
      else if (u.startsWith("/ajax/libs/parallax")) f = "parallax-js/dist/parallax.min.js";
      else { const m = u.match(/^\/npm\/three@[^/]+\/(.*)$/); if (m) f = "three/" + m[1]; }
      if (!f || !fs.existsSync(path.join(cdn, f))) return r.abort();
      r.fulfill({ body: fs.readFileSync(path.join(cdn, f)), contentType: "application/javascript", headers: { "access-control-allow-origin": "*" } });
    });
    try {
      await page.goto(base + c.file, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
      await page.mouse.move(520, 280); await page.waitForTimeout(1800); await page.mouse.move(600, 320); await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(__dirname, "thumbs", c.id + ".jpg"), type: "jpeg", quality: 72, timeout: 60000 });
      console.log("✓", c.id);
    } catch (e) { console.log("✗", c.id, e.message.split("\n")[0]); }
    await page.close().catch(() => {});
  }
  await browser.close();
})();
