#!/usr/bin/env python3
"""The goal in the level editor: the Level tab sets it, the Beacon tool places one, an exit's Opens is a setting, the checks speak.

    python3 games/the-maw/tests/editor-goal.py
"""
import asyncio, http.server, json, os, sys, threading
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/games/the-maw/editor/index.html' % srv.server_address[1]
fails = []
def check(name, ok, note=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  ' + str(note)[:300]) if note and not ok else '')); ok or fails.append(name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_function('window.__editor && window.ForgeKeys')
        E = pg.evaluate; await pg.click('#new'); await pg.click("#new-pop button:has-text('Empty field')")
        check('a new level has no goal', await E('__editor.level.goal.type') == 'none')
        await E("__editor.setPane('level')")
        sel = pg.locator('#f-goal'); check('the Level tab has a Goal setting', await sel.count() == 1)
        await sel.select_option('eat'); check('choosing Eat sets the goal', await E('__editor.level.goal.type') == 'eat')
        await pg.locator('#f-how-many').fill('4'); await pg.locator('#f-how-many').dispatch_event('change')
        check('how many is kept', await E('__editor.level.goal.n') == 4, await E('JSON.stringify(__editor.level.goal)'))
        await pg.locator('#f-goal').select_option('reach')
        check('Reach with no beacon is an error in the checks', await E("__editor.checks.errors.some((e) => /beacon/.test(e.msg))"))
        await pg.keyboard.press('b'); bx = await pg.locator('#cv').bounding_box(); await pg.mouse.click(bx['x'] + bx['width'] / 2 + 60, bx['y'] + bx['height'] / 2 + 40)
        check('B places a beacon', await E("__editor.level.entities.some((e) => e.type === 'beacon')"))
        await pg.keyboard.press('x'); await pg.mouse.click(bx['x'] + bx['width'] / 2 - 90, bx['y'] + bx['height'] / 2)
        ex = await E("__editor.level.entities.find((e) => e.type === 'exit')"); check('a placed exit opens on the goal', ex and ex['opens'] == 'goal', ex)
        await pg.keyboard.press('Escape'); await pg.locator('#cv').focus(); await pg.keyboard.press('Control+z')
        check('undo takes the exit back, then the beacon', not await E("__editor.level.entities.some((e) => e.type === 'exit')"))
        check('no page errors', not errs, errs[:1])
        await pg.screenshot(path='/tmp/editor-goal.png'); await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
