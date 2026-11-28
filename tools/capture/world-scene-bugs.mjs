// tools/capture/world-scene-bugs.mjs -- the World Scene bugs fixed on 27 Nov stay fixed. Headless, about a minute.
//   node world-scene-bugs.mjs
// 1. Four Seasons: the stone dragon takes the season (frost, moss, fungus, rust in turn), and grows as the season does.
// 2. The glass tower shader links, and takes the place's growth (uMoss and the rest are in its uniforms).
// 3. The Hunt's shots are close enough to see creatures (every shot at zoom 1.4 or closer, none overhead).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errs = [];
page.on('pageerror', (e) => errs.push('page error: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text().slice(0, 200)));
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
const r = await page.evaluate(() => {
  ENVX.manual(true);
  const out = {};
  ENVX.set('seasons');
  const total = ENVX.total(),
    dragon = EcologySpecies.SPECIES.find((s) => s.key === 'dragon'),
    koi = EcologySpecies.SPECIES.find((s) => s.key === 'koi');
  out.seasons = [0.1, 0.35, 0.6, 0.85].map((u) => {
    ENVX.shotT = u * total;
    const st = ENVX.creatureStyle(),
      L = ENVX.styledLookFor ? ENVX.styledLookFor(dragon) : null;
    return {
      u,
      key: st.key.split(':').pop(),
      grow: +(st.grow(dragon) ?? -1).toFixed(2),
      koiGrow: st.grow(koi),
      look: L && L.grow,
    };
  });
  out.glassLinked = gl.getProgramParameter(towerGlassProg.p, gl.LINK_STATUS);
  out.glassUniforms = ['uMoss', 'uMossBase', 'uMossH', 'uKind', 'uMossC', 'uMossTip'].map((k) => !!towerGlassProg.u[k]);
  out.hunt = ENVX.places.hunt.shots.map((s) => [s.kind, s.zoom || 1]);
  return out;
});
const fails = [],
  check = (ok, what) => !ok && fails.push(what);
const kinds = r.seasons.map((s) => s.key);
check(
  JSON.stringify(kinds) === JSON.stringify(['frost', 'moss', 'fungus', 'rust']),
  'the stone look does not follow the seasons: ' + kinds
);
check(
  r.seasons.every((s) => s.grow > 0.1),
  'the stone dragon carries no growth: ' + JSON.stringify(r.seasons.map((s) => s.grow))
);
check(
  r.seasons.every((s) => s.koiGrow === null),
  'a creature that is not stone gets a growth amount'
);
check(r.glassLinked, 'the glass tower shader does not link');
check(r.glassUniforms.every(Boolean), 'the glass tower shader has no growth uniforms: ' + r.glassUniforms);
check(
  r.hunt.every((s) => s[0] !== 'above' && s[1] >= 1.4),
  'a Hunt shot is too wide or overhead: ' + JSON.stringify(r.hunt)
);
for (const e of errs) fails.push(e);
console.log(JSON.stringify(r));
console.log(fails.length ? 'FAILED:\n  ' + fails.join('\n  ') : 'all passed');
await browser.close();
process.exit(fails.length ? 1 : 0);
