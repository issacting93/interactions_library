// tools/capture/world-scene-check.mjs -- score every World Scene place after a change (packages/ecology/scene-metrics.js), headless.
//
//   node world-scene-check.mjs                 motion only: each place settles 10 s and is measured 8 s of sim time (fast, no drawing)
//   node world-scene-check.mjs --picture       also draws each place (90 frames, so the 3D bodies start to build) and grades the frame
//   node world-scene-check.mjs garden spires   only these places
//   node world-scene-check.mjs --baseline      save this run as the baseline the next runs compare against
//
// Writes out/world-scene-check.json (and out/world-scene-<place>.png with --picture), prints one line a place with what got worse since the
// baseline (world-scene-baseline.json beside this file), and exits 1 if any place fails. Serves the repo straight from disk (no server needed).
// The headless browser draws with SwiftShader: frame rate here means nothing, and the solid bodies are often half built. The phone check
// (World Scene.html?check) measures those on a real device.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..'), OUT = path.join(HERE, 'out'), BASE = path.join(HERE, 'world-scene-baseline.json');
const args = process.argv.slice(2), PICTURE = args.includes('--picture'), SAVE = args.includes('--baseline'), only = args.filter((a) => !a.startsWith('--'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.csv': 'text/csv', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open() {
  const p = await browser.newPage({ viewport: { width: 640, height: 800 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  // the same numbers for the same code: Math.random seeded, so a run compares with the baseline and not with luck
  await p.addInitScript(() => { let s = 20261127; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; window.__seed = (v) => { s = v >>> 0; };
    window.requestAnimationFrame = () => 0; });   // and the page's own loop held: the check steps everything itself, so no real-time frames slip in first
  await p.route('http://repo.local/**', (r) => { const u = new URL(r.request().url()), f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' }); });
  await p.goto('http://repo.local/world/scenes/world-scene/World%20Scene.html?shots=0'); await p.waitForFunction(() => window.ENVX && window.SceneMetrics && typeof sim !== 'undefined', null, { timeout: 180000 }); await p.waitForTimeout(1500);
  return { p, errs };
}
let page = await open();
const ids = only.length ? only : await page.p.evaluate(() => Object.keys(ENVX.places));
const report = { when: new Date().toISOString(), places: {} };
for (const id of ids) {
  if (PICTURE && id !== ids[0]) { await page.p.close(); page = await open(); }   // a fresh page a place: drawing many places in one page runs out of time
  const r = await page.p.evaluate(([id, pic]) => {
    ENVX.manual(true); __seed(20261127); if (window.EcoCore && EcoCore.reseed) EcoCore.reseed(7); ENVX.set(id); const dt = 1 / 30;
    const rows = (ENVX.P && ENVX.P.cast) || [], keys = [...new Set(rows.filter((r) => ['stream', 'school', 'formation', 'wild'].includes(r.role) && (r.n | 0) >= 6).map((r) => r.species))];
    if (!keys.length) keys.push(rows.length ? rows.slice().sort((a, b) => (b.n | 0) - (a.n | 0))[0].species : 'koi');
    for (let i = 0; i < 300; i++) { EcologySim.step(sim, dt); ENVX.tick(dt); }
    const m = SceneMetrics.motion(sim, { species: keys }); for (let i = 0; i < 240; i++) { EcologySim.step(sim, dt); ENVX.tick(dt); m.sample(dt); }
    const rep = { motion: m.result(), free: !ENVX.P || !!(ENVX.P.setting && ENVX.P.setting.life), limits: (ENVX.P && ENVX.P.check) || null };
    if (pic) { ENVX.hidePanels && ENVX.hidePanels(); ENVX.shotT = 4; for (let i = 0; i < 90; i++) ENVX.step(dt); rep.picture = SceneMetrics.picture(document.getElementById('c'), 160); }
    rep.issues = SceneMetrics.grade(rep); return rep;
  }, [id, PICTURE]);
  if (r.picture) { fs.writeFileSync(path.join(OUT, `world-scene-${id}.jpg`), Buffer.from(r.picture.thumb.split(',')[1], 'base64')); delete r.picture.thumb; }
  r.errors = page.errs.splice(0); report.places[id] = r;
  // what got worse since the baseline
  const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')).places[id] : null, worse = [];
  if (base) for (const [k, m] of Object.entries(r.motion)) { const b = base.motion && base.motion[k]; if (!b) continue;
    if (m.turn95 > b.turn95 * 1.25 + 0.2) worse.push(`${k} turn95 ${b.turn95}->${m.turn95}`); if (m.bend95 > b.bend95 * 1.25 + 0.2) worse.push(`${k} bend95 ${b.bend95}->${m.bend95}`);
    if (m.align < b.align - 0.12) worse.push(`${k} align ${b.align}->${m.align}`); }
  const fails = r.issues.filter((x) => x.level === 'fail'), warns = r.issues.filter((x) => x.level === 'warn');
  const tag = r.errors.length || fails.length ? 'FAIL' : warns.length || worse.length ? 'warn' : 'ok  ';
  console.log(`${tag} ${id.padEnd(11)} ${Object.entries(r.motion).map(([k, m]) => `${k}: turn ${m.turn95} bend ${m.bend95} align ${m.align} groups ${m.groups}`).join(' | ')}`
    + (r.picture ? ` | black ${r.picture.black} flat ${r.picture.flat}` : '') + [...r.errors.map((e) => '\n     error: ' + e), ...r.issues.map((x) => `\n     ${x.level}: ${x.what} ${x.value} (limit ${x.limit})`), ...worse.map((w) => '\n     worse than baseline: ' + w)].join(''));
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'world-scene-check.json'), JSON.stringify(report, null, 1));
if (SAVE) { fs.writeFileSync(BASE, JSON.stringify(report, null, 1)); console.log('saved as baseline'); }
process.exit(Object.values(report.places).some((r) => r.errors.length || r.issues.some((x) => x.level === 'fail')) ? 1 : 0);
