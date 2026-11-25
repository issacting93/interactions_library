#!/usr/bin/env python3
"""The level editor's World tab, in headless Chrome: places and links, checks against the levels' exits, dragging, undo, and Play world.

    python3 games/the-maw/tests/editor-world.py

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
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  ' + str(note)[:240]) if note and not ok else '')); ok or fails.append(name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, vw, vh in (('desktop', 1280, 800), ('phone', 390, 844)):
            ctx = await b.new_context(viewport={'width': vw, 'height': vh}); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(BASE + 'editor/index.html'); await pg.evaluate('localStorage.clear()'); await pg.reload()
            await pg.wait_for_function('window.__editor && __editor.WS.w && __editor.WS.files.length && Object.values(__editor.WS.lv).every((v) => v !== null)', timeout=60000)
            await pg.click('#ptabs [data-p=world]' if vw < 700 else '#tabs [data-p=world]')
            w = await pg.evaluate("({ ids: __editor.WS.w.levels.map((l) => l.id), chk: __editor.wChecks().length, canvas: !!document.getElementById('wgraph') })")
            check(name + ': the World tab opens on the example world, drawn, with nothing to fix', w['ids'] == ['field', 'duel'] and w['chk'] == 0 and w['canvas'], w)
            await pg.click("button:has-text('+ Place')")
            n = await pg.evaluate("({ sel: __editor.WS.sel, links: __editor.WS.w.links.map((k) => k.from + '>' + k.to), chk: __editor.wChecks().map((c) => c[1] + ':' + c[0].message) })")
            check(name + ': + Place adds a place linked both ways to the one chosen', n['sel'] == 'place-3' and 'field>place-3' in n['links'] and 'place-3>field' in n['links'], n)
            check(name + ': and the checks say the levels have no exits for that link', any('no exit to it' in c for c in n['chk']), n['chk'])
            await pg.select_option('#f-level', 'duel-gate'); await pg.click("[aria-label='While you are away'] button:has-text('Live')")
            q = await pg.evaluate("__editor.WS.w.levels.find((l) => l.id === 'place-3')")
            check(name + ': its level and whether it lives on are set from the panel', q['level'] == 'duel-gate' and q['away'] == 'live', q)
            await pg.fill("[aria-label='Flag that opens the way to field']", 'key'); await pg.keyboard.press('Tab')
            k = await pg.evaluate("__editor.WS.w.links.find((k) => k.from === 'place-3' && k.to === 'field')")
            check(name + ': a way out can be gated by a flag', k.get('needs') == 'key', k)
            await pg.locator('#wgraph').scroll_into_view_if_needed(); cv = await pg.locator('#wgraph').bounding_box(); P = await pg.evaluate("(() => { const cv = document.getElementById('wgraph'), l = __editor.WS.w.levels.find((x) => x.id === 'duel'); return l.at || null; })()")
            # drag the duel's box: find it by hit-testing the drawn layout, then move it 60 px
            pos = await pg.evaluate("(() => { const cv = document.getElementById('wgraph'), n = __editor.WS.w.levels.length, i = 1, a = -Math.PI / 2 + i / n * Math.PI * 2; return [0.5 + 0.34 * Math.cos(a), 0.5 + 0.36 * Math.sin(a)]; })()")
            x0, y0 = cv['x'] + pos[0] * cv['width'], cv['y'] + pos[1] * cv['height']
            await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move(x0 - 30, y0 - 20, steps=4); await pg.mouse.move(x0 - 60, y0 - 40, steps=4); await pg.mouse.up()
            at = await pg.evaluate("__editor.WS.w.levels.find((l) => l.id === 'duel').at || null")
            check(name + ': dragging a place moves it, and it stays where it was put', at is not None and abs(at[0] - (pos[0] - 60 / cv['width'])) < 0.02, [pos, at])
            await pg.click(".pane button:has-text('Undo')"); at2 = await pg.evaluate("__editor.WS.w.levels.find((l) => l.id === 'duel').at || null")
            check(name + ': undo takes the move back', at2 is None, at2)
            kept = await pg.evaluate("JSON.parse(localStorage.getItem('forge-world-draft')).levels.length")
            check(name + ': the world is kept on the device as it changes', kept == 3, kept)
            if name == 'desktop':
                # Play world with a place that has no level exit: allowed (only a warning), and the field opens the draft
                async with ctx.expect_page() as info: await pg.click("button:has-text('Play world')")
                g = await info.value; gerr = []; g.on('pageerror', lambda e: gerr.append(str(e)))
                await g.wait_for_function("window.__arena && __arena.WORLD && __arena.LEVEL", timeout=180000)
                r = await g.evaluate("({ name: __arena.WORLD.w.name, n: __arena.WORLD.w.levels.length, at: __arena.WORLD.here.id, level: __arena.LEVEL.name })")
                check('Play world opens the field on the draft, at its start', r['n'] == 3 and r['at'] == 'field' and r['level'] == 'Gate: the field', r)
                check('the field page has no errors', not gerr, gerr); await g.close()
                # a place playing a tank stage is an error, and Play world is off
                await pg.evaluate("__editor.wLoad((() => { const W = ForgeWorld, x = W.create({ name: 't', seed: 3 }); W.addLevel(x, { id: 'a', level: 'swift-water' }); return x; })())")
                await pg.wait_for_function("Object.values(__editor.WS.lv).every((v) => v !== null)", timeout=30000); await pg.wait_for_timeout(300)
                e = await pg.evaluate("({ chk: __editor.wChecks().map((c) => c[1] + ':' + c[0].message), off: document.querySelector('.pane button:not([disabled])') && [...document.querySelectorAll('.pane button')].find((x) => x.textContent === 'Play world').disabled })")
                check('a place that plays a tank stage is an error, and Play world is off', any(c.startswith('err:') and 'tank stage' in c for c in e['chk']) and e['off'], e)
            check(name + ': no script errors', not errs, errs); await ctx.close()
        await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
