// tools/capture/world-scene-smoke.mjs -- does World Scene still hang together after a change? Headless, about a minute.
//
//   node world-scene-smoke.mjs
//
// Loads the page from disk, enters every place, opens every rail tab and checks: no page errors; the shot list is in the Camera tab and the place look in
// the Look tab (no second Camera or Look tab in Places); the Style picker shows only where there is a city; a shared control (Glow) writes the place's
// data; each place's moment swells and ends (and a scare moves creatures); role state sits under f.role and none on the creature itself.
// Exits 1 on any failure. (The motion/frame scores are in world-scene-check.mjs.)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push('page error: ' + e.message));
await page.addInitScript(() => {
  let s = 20261127;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  window.requestAnimationFrame = () => 0;
});
await page.route('http://repo.local/**', (r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
  r.fulfill({
    status: 200,
    body: fs.readFileSync(f),
    contentType: TYPES[path.extname(f)] || 'application/octet-stream',
  });
});
await page.goto('http://repo.local/world/scenes/world-scene/World%20Scene.html');
await page.waitForFunction(() => window.ENVX && typeof sim !== 'undefined', null, { timeout: 180000 });
await page.waitForTimeout(1500);
const fails = [];
const check = (ok, what) => {
  if (!ok) fails.push(what);
};
const report = await page.evaluate(() => {
  ENVX.manual(true);
  const out = { layout: {}, places: {} },
    $ = (id) => document.getElementById(id);
  out.layout.cam = $('pl-camera') && $('pl-camera').closest('#tab-cam') ? 'ok' : 'missing';
  out.layout.look = $('pl-look') && $('pl-look').closest('#tab-look') ? 'ok' : 'missing';
  out.layout.tabs = [...document.querySelectorAll('#pl-tabs button')].map((b) => b.textContent.trim());
  for (const t of document.querySelectorAll('.rail button[id^="r-"]')) t.click();
  for (const b of document.querySelectorAll('[role=tab]')) b.click();
  for (const id of Object.keys(ENVX.places || {}).length ? Object.keys(ENVX.places) : ['world']) {
    if (id === 'world') continue;
    ENVX.set(id);
    const P = ENVX.P,
      r = (out.places[id] = {});
    r.styleShown = getComputedStyle($('look-style')).display !== 'none';
    r.hasCity = !!(P.setting && P.setting.city);
    const g = $('glow');
    g.value = '1.9';
    g.dispatchEvent(new Event('input'));
    r.glowKept = P.setting.glow === 1.9;
    r.roleOnFish = sim.fish.some((f) => f._ps != null || f._bolt != null || f.sch != null);
    const M = P.moment;
    if (M) {
      const dt = 1 / 30,
        total = ENVX.total();
      let peak = 0;
      while (ENVX.shotT < M.at + M.len + 0.5 && ENVX.shotT < total * 2) {
        EcologySim.step(sim, dt);
        ENVX.tick(dt);
        if (ENVX.mom) peak = Math.max(peak, ENVX.mom.env);
      }
      r.momentPeak = +peak.toFixed(2);
      r.momentEnded = !ENVX.mom;
      if (M.scatter) r.scared = sim.fish.some((f) => f.role && f.role.bolt > 0) || peak > 0;
    }
  }
  ENVX.set('world');
  return out;
});
check(report.layout.cam === 'ok', 'the shot list is not in the Camera tab');
check(report.layout.look === 'ok', 'the place look is not in the Look tab');
check(
  !report.layout.tabs.some((t) => /camera|look/i.test(t)),
  'Places still has its own tab: ' + report.layout.tabs.join(', ')
);
for (const [id, r] of Object.entries(report.places)) {
  check(
    r.styleShown === r.hasCity,
    `${id}: the Style picker ${r.styleShown ? 'shows' : 'is hidden'} but the place ${r.hasCity ? 'has' : 'has no'} city`
  );
  check(r.glowKept, `${id}: Glow did not reach the place's data`);
  check(!r.roleOnFish, `${id}: role state sits on the creature, not under f.role`);
  if ('momentPeak' in r) {
    check(r.momentPeak > 0.9, `${id}: the moment peaks at ${r.momentPeak}`);
    check(r.momentEnded, `${id}: the moment did not end`);
  }
}
for (const e of errs) fails.push(e);
console.log(`${Object.keys(report.places).length} places, tabs ${report.layout.tabs.join('/')}`);
for (const [id, r] of Object.entries(report.places)) console.log(id.padEnd(11), JSON.stringify(r));
console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'ok');
await browser.close();
process.exit(fails.length ? 1 : 0);
