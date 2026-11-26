#!/usr/bin/env python3
"""The level editor's Ecology tab, in headless Chrome: who is in the level, the food web's tiers and arrows, the checks, a kind's card, and the
habitat map reading the tank's own rule (a floor scavenger settles by a carcass, not in open water).

    python3 games/the-maw/tests/editor-eco.py

Needs playwright and /usr/bin/google-chrome."""
import asyncio, http.server, json, os, sys, threading
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/games/the-maw/' % srv.server_address[1]
fails = []
def check(name, ok, note=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  ' + str(note)[:300]) if note and not ok else '')); ok or fails.append(name)
STAGE = """(roster) => fetch('../levels/swift-water.json').then((r) => r.text()).then((t) => { const l = ForgeLevel.parse(t); l.stage.roster = roster;
  l.entities = l.entities.filter((e) => e.type !== 'landmark').concat([{ id: 'e90', type: 'landmark', kind: 'carcass', x: -50, y: -45 }]); __editor.load(l); })"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, vw, vh in (('desktop', 1280, 800), ('phone', 390, 844)):
            pg = await b.new_page(viewport={'width': vw, 'height': vh}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(BASE + 'editor/index.html'); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_function('window.__editor && window.ForgeCatalog', timeout=60000)
            await pg.click(('#ptabs' if vw < 700 else '#tabs') + ' [data-p=eco]')
            f = await pg.evaluate("(() => { const m = __editor.ecoMembers(__editor.level), W = __editor.ecoWeb(m); return { n: m.size, amb: [...m.values()].filter((x) => x.why === 'ambient').length, enc: [...m.values()].filter((x) => x.why === 'encounter').length, tiers: Math.max(...W.keys.map((k) => W.tier[k])), canvas: !!document.getElementById('egraph') && document.getElementById('egraph').height > 100 }; })()")
            check(name + ': a field lists its ambient creatures and the kinds its encounters are played by, in tiers', f['amb'] == 5 and f['enc'] > 5 and f['tiers'] >= 2 and f['canvas'], f)
            await pg.evaluate(STAGE, {'swift': 30, 'wisp': 12, 'plated-scavenger': 4})
            await pg.wait_for_timeout(300); await pg.click(('#ptabs' if vw < 700 else '#tabs') + ' [data-p=eco]')
            w = await pg.evaluate("(() => { const m = __editor.ecoMembers(__editor.level), W = __editor.ecoWeb(m); return { keys: W.keys.sort(), swift: W.eats.swift, wisp: W.by.wisp, tier: W.tier }; })()")
            check(name + ': a stage\'s roster is its food web: the swift eats the wisp, a tier above it', w['keys'] == ['plated-scavenger', 'swift', 'wisp'] and w['swift'] == ['wisp'] and w['wisp'] == ['swift'] and w['tier']['swift'] == 1 and w['tier']['wisp'] == 0, w)
            c0 = await pg.evaluate("__editor.ecoChecks(__editor.level, __editor.ecoMembers(__editor.level), __editor.ecoWeb(__editor.ecoMembers(__editor.level))).map((c) => c[1])")
            check(name + ': grazers are not counted as hunters, so a stage of grazers is not warned', c0 == [], c0)
            await pg.evaluate(STAGE, {'hunter': 3, 'wisp': 4})
            await pg.wait_for_timeout(300); await pg.click(('#ptabs' if vw < 700 else '#tabs') + ' [data-p=eco]')
            c1 = await pg.evaluate("__editor.ecoChecks(__editor.level, __editor.ecoMembers(__editor.level), __editor.ecoWeb(__editor.ecoMembers(__editor.level))).map((c) => c[1])")
            check(name + ': a hunter with nothing to eat here is pointed out', any('hunts, but nothing it eats is here' in c for c in c1), c1)
            await pg.evaluate(STAGE, {'plated-scavenger': 4, 'swift': 10, 'wisp': 30})
            await pg.wait_for_timeout(300); await pg.click(('#ptabs' if vw < 700 else '#tabs') + ' [data-p=eco]'); await pg.select_option('.pane select', 'plated-scavenger'); await pg.wait_for_timeout(400)
            card = await pg.evaluate("[...document.querySelectorAll('.ekv dd')].map((d) => d.textContent)")
            check(name + ': a kind\'s card says what it eats, how it escapes, its depth and what it looks for', len(card) >= 6 and 'carcasses' in card[-1] and card[-2] == 'on the floor', card)
            hab = await pg.evaluate("""(() => { const cv = document.getElementById('ehab'), g = cv.getContext('2d'), d = devicePixelRatio || 1, W = cv.width, at = (lx, ly) => { const s = W / 200; let a = 0; const x0 = Math.round((lx + 100) * s), y0 = Math.round((ly + 100) * s), R = Math.round(14 * s);
              const px = g.getImageData(Math.max(0, x0 - R), Math.max(0, y0 - R), 2 * R, 2 * R).data; for (let i = 0; i < px.length; i += 4) if (px[i] > 180 && px[i + 1] > 120 && px[i + 2] < 120) a++; return a; }; return { carcass: at(-50, -45), open: at(60, 60) }; })()""")
            check(name + ': the habitat map sets a floor scavenger down by the carcass, not in open water', hab['carcass'] > hab['open'] * 2 and hab['carcass'] > 0, hab)
            check(name + ': no script errors', not errs, errs); await pg.close()
        await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
