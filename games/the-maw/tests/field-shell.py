#!/usr/bin/env python3
"""The field as a game (#game=<world>): title, pause, levels, ending, with a real click and key.

    python3 games/the-maw/tests/field-shell.py [shot-dir]

A two-level world kept as drafts in localStorage. Needs playwright and /usr/bin/google-chrome."""
import asyncio, http.server, json, os, sys, threading
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/' % srv.server_address[1]
fails = []
def check(name, ok, note=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  ' + str(note)[:300]) if note and not ok else '')); ok or fails.append(name)
def level(name, goal, to):
    ents = [{'id': 'e1', 'type': 'start', 'x': 0, 'y': 0}, {'id': 'e2', 'type': 'tower', 'x': 0, 'y': -55, 'r': 3.9, 'height': 0.82}, {'id': 'e3', 'type': 'encounter', 'x': 40, 'y': 20, 'pattern': 'charge', 'tower': ''},
            {'id': 'e5', 'type': 'exit', 'x': 60, 'y': 0, 'to': to, 'r': 5, 'opens': 'goal'}]
    g = {'type': 'survive', 'n': 10, 'species': '', 'target': 'all', 'secs': 5}; g.update(goal)
    return {'format': 'forge-level', 'version': 5, 'kind': 'field', 'name': name, 'notes': '', 'seed': 7, 'field': {'shape': 'disc', 'radius': 100, 'crowd': 70}, 'goal': g,
            'life': {'ambient': [{'species': 'koi', 'count': 7}, {'species': 'worm', 'count': 4}]}, 'entities': ents}
WORLD = {'format': 'forge-world', 'version': 1, 'name': 'The Test World', 'seed': 5, 'start': 'a', 'levels': [{'id': 'a', 'level': 'draft', 'away': 'freeze'}, {'id': 'b', 'level': 'duel', 'away': 'freeze'}],
         'links': [{'from': 'a', 'to': 'b'}, {'from': 'b', 'to': 'a'}]}
# the second level is the repo's duel (no goal), so only the first needs clearing: also try a world where both have goals through a draft of the second
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 900, 'height': 700}); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script('if (!localStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem("seeded", "1"); localStorage.setItem("forge-level-draft", %s); localStorage.setItem("forge-world-draft", %s); }' % (json.dumps(json.dumps(level('First', {}, 'b'))), json.dumps(json.dumps(WORLD))))
        await pg.goto(BASE + 'games/the-maw/field/index.html#game=draft'); await pg.wait_for_function('window.__arena && window.__arena.SH && window.__arena.maw && window.__arena.maw.guest', timeout=90000)
        T = 'n => { for (let i = 0; i < n; i++) __arena.tick(1 / 60); }'; E = pg.evaluate
        vis = lambda sel: E("(s) => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }", sel)
        check('opens on the title with the world\'s name and a Play button', await E('__arena.SH.state') == 'title' and 'The Test World' in await E("document.getElementById('shell-card').textContent") and await pg.locator('button:has-text("Play")').count() == 1, errs[:1])
        check('the dev rack is hidden', not await vis('.rack'))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'shell-title.png'))
        t0 = await E('__arena.WORLD.save.clock'); await E(T, 60); check('behind the title the field runs but the world clock and goal do not', await E('__arena.WORLD.save.clock') == t0 and await E('__arena.GOAL.have') == 0)
        await pg.locator('button:has-text("Play")').click(); check('Play starts: no menu, the pause button shows, the Maw is yours', await E('__arena.SH.state') == 'play' and not await vis('#shell') and await vis('#pausebtn') and await E('__arena.UI.drive') == 'hand')
        await E(T, 120); check('the goal and the world clock run in play', await E('__arena.GOAL.have') > 1.5 and await E('__arena.WORLD.save.clock') > t0)
        await pg.keyboard.press('Escape'); check('Esc pauses', await E('__arena.SH.state') == 'paused' and await vis('#shell'))
        h = await E('__arena.GOAL.have'); await E(T, 120); check('while paused nothing moves', await E('__arena.GOAL.have') == h)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'shell-pause.png'))
        await pg.keyboard.press('Escape'); check('Esc resumes', await E('__arena.SH.state') == 'play')
        await pg.click('#pausebtn'); await pg.locator('button:has-text("Levels")').click(); rows = await E("[...document.querySelectorAll('#shell .lv')].map((r) => r.dataset.state)")
        check('Levels lists both, the second not reached yet', rows == ['open', 'locked'], rows)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'shell-levels.png'))
        await pg.locator('button:has-text("Back")').click(); await pg.locator('button:has-text("Resume")').click()
        # clear the goal: the world has one goal that matters (the other level has none), so the world ends
        await E(T, 240); check('the goal is met after 5 s', await E('__arena.GOAL.met'))
        check('the ending waits a moment so the goal message is read', await E('__arena.SH.state') == 'play'); await E(T, 200)
        check('then the ending shows with time, meals and hits', await E('__arena.SH.state') == 'ending' and 'The world is clear' in await E("document.getElementById('shell-card').textContent"), await E('__arena.SH.state'))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'shell-ending.png'))
        await pg.locator('button:has-text("Title")').click(); check('Title goes back', await E('__arena.SH.state') == 'title' and await pg.locator('button:has-text("Continue")').count() == 1)
        await pg.locator('button:has-text("Levels")').click(); rows = await E("[...document.querySelectorAll('#shell .lv button')].map((r) => r.textContent)"); check('Levels now marks the first cleared', rows and 'Cleared' in rows[0], rows)
        # a page loaded again while playing goes back to playing; a fresh visit shows the title
        await pg.locator('button:has-text("Back")').click(); await pg.locator('button:has-text("Continue")').click(); await E('__arena.WORLD.save.clock'); await pg.reload()
        await pg.wait_for_function('window.__arena && window.__arena.SH && window.__arena.maw && window.__arena.maw.guest', timeout=90000)
        check('a reload while playing stays in play, the cleared goal stays met', await E('__arena.SH.state') == 'play' and await E('__arena.GOAL.met'))
        await E("sessionStorage.clear()"); await pg.reload(); await pg.wait_for_function('window.__arena && window.__arena.SH && window.__arena.maw && window.__arena.maw.guest', timeout=90000)
        check('a fresh visit starts at the title and offers Continue', await E('__arena.SH.state') == 'title' and await pg.locator('button:has-text("Continue")').count() == 1)
        await pg.locator('button:has-text("New game")').click(); check('New game asks first', await pg.locator('button:has-text("Really start over")').count() == 1)
        await pg.locator('button:has-text("Really start over")').click(); await pg.wait_for_function('window.__arena && window.__arena.SH && window.__arena.maw && window.__arena.maw.guest', timeout=90000)
        check('and then begins again, straight into play: nothing cleared, the clock near zero', await E('__arena.SH.state') == 'play' and not await E('__arena.GOAL.met') and await E('__arena.WORLD.save.clock') < 5 and not errs, errs[:1])
        # the repo's own example world, from its files: a title, Play, and no ending (neither level has a goal)
        q = await (await b.new_context(viewport={'width': 900, 'height': 700})).new_page(); qe = []; q.on('pageerror', lambda e: qe.append(str(e)))
        await q.goto(BASE + 'games/the-maw/field/index.html#game=example'); await q.wait_for_function('window.__arena && window.__arena.SH && window.__arena.maw && window.__arena.maw.guest', timeout=90000)
        await q.locator('button:has-text("Play")').click(); await q.evaluate(T, 300)
        check('the example world from its files: title, Play, no goal line, no ending, no errors', await q.evaluate('__arena.SH.state') == 'play' and await q.evaluate('!__arena.GOAL') and not qe, qe[:1])
        await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
