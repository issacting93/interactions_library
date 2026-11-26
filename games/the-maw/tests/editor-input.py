#!/usr/bin/env python3
"""The level editor's input, with a real mouse and keyboard in headless Chrome: tools by key, place tools that stay armed, click and box selection,
pan and zoom, copy and paste, the Selection panel, the shortcut overlay and the action finder. (docs/EDITOR.md)

    python3 games/the-maw/tests/editor-input.py
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
        E = pg.evaluate; n = lambda t: E("__editor.level.entities.filter((e) => e.type === '%s').length" % t)
        sel = lambda: E("[...__editor.multi].length"); view = lambda: E("JSON.stringify(__editor.view)")
        await pg.click('#new'); await pg.click("#new-pop button:has-text('Empty field')")
        bx = await pg.locator('#cv').bounding_box(); cx, cy = bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2
        await pg.mouse.move(cx, cy); await pg.locator('#cv').focus()
        # tools by key; a place tool stays armed
        T0 = await n('tower'); await E("__editor.level.entities.filter((e) => e.type === 'tower').forEach((e) => __editor.edit({ op: 'remove', id: e.id }))"); T0 = await n('tower')
        await pg.keyboard.press('t')
        for i in range(4): await pg.mouse.click(cx - 180 + i * 90, cy - 130)
        check('T arms the tower tool and it stays armed: four clicks, four towers', await n('tower') == T0 + 4, await n('tower'))
        st = await pg.inner_text('#hint'); check('the status line says what a click will do', 'place tower' in st.lower(), st)
        await pg.keyboard.press('Escape'); await pg.mouse.click(cx + 250, cy + 200); check('Esc ends placing: the next click places nothing', await n('tower') == T0 + 4)
        await pg.keyboard.press('g'); await pg.mouse.click(cx - 100, cy + 120); await pg.mouse.click(cx + 100, cy + 120); await pg.keyboard.press('v')
        check('G places groves; V goes back to Select', await n('grove') == 2 and await E("!__editor.placing"))
        # selection: click, shift-click, box, all, none
        await pg.mouse.click(cx - 180, cy - 130); a = await sel(); await pg.keyboard.down('Shift'); await pg.mouse.click(cx - 90, cy - 130); await pg.keyboard.up('Shift')
        check('click selects one, Shift-click adds', a == 1 and await sel() == 2, [a, await sel()])
        v0 = await view(); await pg.mouse.move(cx - 240, cy - 190); await pg.mouse.down(); await pg.mouse.move(cx - 60, cy - 100, steps=5); await pg.mouse.move(cx + 140, cy - 70, steps=5); await pg.mouse.up()
        check('dragging on empty ground draws a box and selects what it holds, without moving the view', await sel() == 4 + T0 - T0 and await view() == v0, [await sel(), v0, await view()])
        await pg.keyboard.press('Control+a'); check('Ctrl+A selects everything', await sel() == await E('__editor.level.entities.length'), await sel())
        # the Selection panel
        await pg.mouse.click(cx + 300, cy - 250); check('a click on empty ground selects nothing', await sel() == 0)
        await pg.mouse.move(cx - 240, cy - 190); await pg.mouse.down(); await pg.mouse.move(cx + 140, cy - 70, steps=8); await pg.mouse.up()
        labels = await E("[...document.querySelectorAll('#pane .f label')].map((l) => l.textContent)")
        check('with several towers selected the inspector edits what they share', 'Radius' in labels and 'Height' in labels and 'X' in labels, labels)
        await pg.fill('#f-radius', '9'); await pg.keyboard.press('Tab')
        check('a value set there is set on all of them', await E("__editor.level.entities.filter((e) => e.type === 'tower').every((e) => e.r === 9)"))
        ph = await E("document.getElementById('f-x').placeholder"); check('a value they do not share shows as MIXED', ph == 'MIXED', ph)
        await pg.click("#pane button:has-text('Line up across')"); check('Line up across gives them one Y', await E("new Set(__editor.level.entities.filter((e) => e.type === 'tower').map((e) => e.y)).size === 1"))
        # copy, paste, duplicate, undo as one step
        await pg.locator('#cv').focus(); await pg.keyboard.press('Control+c'); await pg.keyboard.press('Control+v')
        check('Ctrl+C then Ctrl+V pastes the four, selected and offset', await n('tower') == T0 + 8 and await sel() == 4, [await n('tower'), await sel()])
        await pg.keyboard.press('Control+z'); check('and one undo takes the paste back', await n('tower') == T0 + 4, await n('tower'))
        # panning and zooming
        v0 = json.loads(await view()); await pg.keyboard.down('Space'); await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 80, cy + 40, steps=4); await pg.mouse.up(); await pg.keyboard.up('Space')
        v1 = json.loads(await view()); check('Space-drag pans and selects nothing new', v1['x'] != v0['x'] and v1['k'] == v0['k'] and await n('tower') == T0 + 4, [v0, v1])
        await pg.keyboard.press('h'); cur = await E("document.getElementById('cv').style.cursor"); await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx - 60, cy, steps=3); await pg.mouse.up(); v2 = json.loads(await view()); await pg.keyboard.press('v')
        check('H is the hand: the cursor is a grab hand and a drag pans', cur == 'grab' and v2['x'] != v1['x'], [cur, v1, v2])
        await pg.mouse.move(cx, cy); await pg.mouse.wheel(0, -120); v3 = json.loads(await view()); check('a mouse wheel zooms', v3['k'] > v2['k'], [v2, v3])
        await pg.mouse.wheel(12, 7); v4 = json.loads(await view()); check('a trackpad\'s two fingers pan', v4['k'] == v3['k'] and v4['x'] != v3['x'], [v3, v4])
        await pg.keyboard.press('f'); v5 = json.loads(await view()); check('F fits the level', v5['x'] == 0 and v5['y'] == 0, v5)
        # the overlay, the finder, tooltips
        await pg.keyboard.press('?'); h = await E("(() => { const b = document.querySelector('.fk-box'); return b ? b.textContent : ''; })()")
        check('? shows every shortcut by group', all(w in h for w in ('Tools', 'Edit', 'View', 'Place a tower', 'Select all', 'Fit the level')), h[:200])
        await pg.keyboard.press('Escape'); check('Esc closes it and keeps the selection', await E("!document.querySelector('.fk-back')"))
        await pg.keyboard.press('Control+k'); await pg.keyboard.type('exit'); await pg.keyboard.press('Enter')
        pl = await E("__editor.placing ? __editor.placing.type : null"); check('Ctrl+K finds an action by name and runs it', pl == 'exit', pl)
        await pg.keyboard.press('Escape')
        tips = await E("({ undo: document.getElementById('undo').title, tower: document.querySelector('[data-add=tower]').title, n: [...document.querySelectorAll('button')].filter((b) => b.title).length })")
        check('buttons say their keys', 'Undo (' in tips['undo'] and tips['tower'].endswith('(T)') and tips['n'] >= 12, tips)
        await pg.click('#tabs [data-p=level]'); await pg.fill('#f-name', 'tgv x'); check('typing in a field does not fire shortcuts', await E("!__editor.placing") and await n('tower') == T0 + 4)
        check('no script errors', not errs, errs[:2]); await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
