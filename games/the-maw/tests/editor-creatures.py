#!/usr/bin/env python3
"""The level editor's Creatures tab, in headless Chrome, and the field playing what it makes: a creature from a preset with its own health and body,
placed from its card and from the Add bar, and the Maw with its level's body, legs and kit.

    python3 games/the-maw/tests/editor-creatures.py

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
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, vw, vh in (('desktop', 1280, 800), ('phone', 390, 844)):
            ctx = await b.new_context(viewport={'width': vw, 'height': vh}); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(BASE + 'editor/index.html'); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_function('window.__editor && window.ForgeCatalog', timeout=60000)
            tabs = '#ptabs' if vw < 700 else '#tabs'
            await pg.click('#new'); await pg.click("#new-pop button:has-text('Empty field')"); await pg.click(tabs + ' [data-p=cre]')
            await pg.select_option("[aria-label='Preset']", 'rage'); await pg.click(".pane button:has-text('New from preset')")
            c = await pg.evaluate("(() => { const C = __editor.level.creatures || {}, k = Object.keys(C)[0]; return { k, c: C[k], sel: __editor.CS.sel }; })()")
            check(name + ': New from preset makes a creature with the stats that attack has today', c['c'] and c['c']['pattern'] == 'rage' and c['c']['from'] == 'hunter' and c['c']['hp'] == 3 and c['sel'] == c['k'], c)
            k = c['k']
            await pg.fill('#f-health', '9'); await pg.keyboard.press('Tab'); await pg.select_option('#f-body', 'dragon'); await pg.fill('#f-speed', '1.6'); await pg.keyboard.press('Tab')
            c2 = await pg.evaluate("__editor.level.creatures[%s]" % json.dumps(k))
            check(name + ': its health, body and speed are set from the card', c2['hp'] == 9 and c2['from'] == 'dragon' and abs(c2['speed'] - 1.6) < 1e-9, c2)
            await pg.click(".pane button:has-text('Place one')"); box = await pg.locator('#cv').bounding_box(); await pg.mouse.click(box['x'] + box['width'] * 0.65, box['y'] + box['height'] * 0.4)
            e = await pg.evaluate("__editor.level.entities.filter((q) => q.type === 'encounter' && q.creature).map((q) => [q.creature, q.pattern])")
            check(name + ': Place one puts an encounter on the map played by it', e == [[k, 'rage']], e)
            opts = await pg.evaluate("[...document.querySelectorAll('#pat optgroup')].map((g) => g.label + ':' + g.children.length)")
            check(name + ': the Add bar lists the level\'s creatures after the patterns', opts == ['Patterns:21', "This level's creatures:1"], opts)
            await pg.click(tabs + ' [data-p=cre]'); await pg.click("[aria-label=\"The Maw's body\"] button:has-text('serpent')"); await pg.click("[aria-label='Eyes it starts with'] button:has-text('2')"); await pg.click("[aria-label='Abilities it starts with'] button:has-text('spit')")
            m = await pg.evaluate("__editor.level.maw")
            check(name + ': the Maw takes a body, eyes and an ability for this level', m and m['body'] == 'serpent' and m['kit']['eyes'] == 2 and m['kit']['abil'] == ['spit'], m)
            chk = await pg.evaluate("__editor.checks.errors.map((x) => x.msg)")
            check(name + ': the level has nothing to fix', chk == [], chk)
            if name == 'desktop':
                text = await pg.evaluate("ForgeLevel.stringify(__editor.level)")
                await pg.evaluate("(t) => localStorage.setItem('forge-level-draft', t)", text)   # same origin: the field reads it (a new hash alone would not load the page again)
                fp = await ctx.new_page(); ferr = []; fp.on('pageerror', lambda e: ferr.append(str(e)))
                await fp.goto(BASE + 'field/index.html#level=draft'); await fp.wait_for_function("window.__arena && __arena.LEVEL && typeof AG !== 'undefined' && AG.length && maw && maw.guest", timeout=180000)
                r = await fp.evaluate("""(() => { const A = AG.find((q) => q.cre); return A ? { hp: A.maxHp, spd: A.spd, sp: SPECIES[A.B.f.sp].key, id: A.id, name: A.cre.name } : null; })()""")
                check('the field plays it: its own health, speed and body, attacking as a Rage Speed-Up', r and r['hp'] == 9 and abs(r['spd'] - 1.6) < 1e-9 and r['sp'] == 'dragon' and r['id'] == 'rage', r)
                mw = await fp.evaluate("({ body: maw.bodyKey, eyes: maw.ab.eyes, spit: maw.ab.spit, legs: maw.legFrom })")
                check('and its Maw: the level\'s serpent body on its legs, two eyes and a spitting gland', mw['body'] == 'serpent' and mw['eyes'] == 2 and mw['spit'] == 1 and mw['legs'] == 'stalker', mw)
                check('the field page has no errors', not ferr, ferr); await fp.close()
            await pg.click(tabs + ' [data-p=cre]'); await pg.evaluate("(k) => { __editor.CS.sel = k; __editor.setPane('cre'); }", k); await pg.click(".pane button:text-is('Remove')")
            g = await pg.evaluate("({ c: Object.keys(__editor.level.creatures || {}).length, refs: __editor.level.entities.filter((q) => q.creature).length, enc: __editor.level.entities.filter((q) => q.type === 'encounter').length })")
            check(name + ': Remove takes the creature away and its encounters fall back to the pattern\'s own', g['c'] == 0 and g['refs'] == 0 and g['enc'] >= 1, g)
            await pg.click('#undo'); u = await pg.evaluate("Object.keys(__editor.level.creatures || {}).length")
            check(name + ': and undo brings it back', u == 1, u)
            check(name + ': no script errors', not errs, errs); await ctx.close()
        await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
