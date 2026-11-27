#!/usr/bin/env python3
"""Goals on field levels: each kind is met by what it asks, exits that open on the goal stay shut until then, and a world flag is set.

    python3 games/the-maw/tests/field-goal.py

Loads the field page with a level draft and a world draft kept in localStorage (so no file is written), then plays it with the page's own tick. Needs playwright and /usr/bin/google-chrome."""
import asyncio, functools, http.server, json, os, sys, threading
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/' % srv.server_address[1]
fails = []
def check(name, ok, note=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  ' + note) if note else '')); ok or fails.append(name)
def level(goal, extra=()):
    ents = [{'id': 'e1', 'type': 'start', 'x': 0, 'y': 0}, {'id': 'e2', 'type': 'tower', 'x': 0, 'y': -55, 'r': 3.9, 'height': 0.82},
            {'id': 'e3', 'type': 'encounter', 'x': 40, 'y': 20, 'pattern': 'charge', 'tower': ''}, {'id': 'e4', 'type': 'encounter', 'x': -40, 'y': 30, 'pattern': 'sweep', 'tower': ''},
            {'id': 'e5', 'type': 'exit', 'x': 60, 'y': 0, 'to': 'b', 'r': 5, 'opens': 'goal'}, {'id': 'e6', 'type': 'exit', 'x': -60, 'y': 0, 'to': 'b', 'r': 5, 'opens': 'always'}] + list(extra)
    g = {'type': 'none', 'n': 10, 'species': '', 'target': 'all', 'secs': 60}; g.update(goal)
    return {'format': 'forge-level', 'version': 5, 'kind': 'field', 'name': 'Goal test', 'notes': '', 'seed': 7, 'field': {'shape': 'disc', 'radius': 100, 'crowd': 70},
            'goal': g, 'life': {'ambient': [{'species': 'koi', 'count': 7}, {'species': 'worm', 'count': 4}]}, 'entities': ents}
WORLD = {'format': 'forge-world', 'version': 1, 'name': 'Goal world', 'seed': 5, 'start': 'a', 'levels': [{'id': 'a', 'level': 'draft', 'away': 'freeze'}, {'id': 'b', 'level': 'duel', 'away': 'freeze'}],
         'links': [{'from': 'a', 'to': 'b'}, {'from': 'b', 'to': 'a'}]}
async def open_(b, lv, world=True):
    pg = await b.new_page(viewport={'width': 900, 'height': 700}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script('localStorage.clear(); localStorage.setItem("forge-level-draft", %s); localStorage.setItem("forge-world-draft", %s);' % (json.dumps(json.dumps(lv)), json.dumps(json.dumps(WORLD))))
    await pg.goto(BASE + 'games/the-maw/field/index.html#' + ('world=draft' if world else 'level=draft')); await pg.wait_for_function('window.__arena && window.__arena.GOAL !== undefined && window.__arena.maw && window.__arena.maw.guest', timeout=90000)
    pg.errs = errs; return pg
TICK = 'n => { for (let i = 0; i < n; i++) __arena.tick(1 / 60); }'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        # none: nothing to meet, every exit open
        pg = await open_(b, level({})); await pg.evaluate(TICK, 30)
        check('no goal: no goal line, exits open', await pg.evaluate('!__arena.GOAL && __arena.EXITS.every((x) => __arena.exitOpen(x))') and await pg.evaluate("document.getElementById('goal').hidden"), str(pg.errs[:1])); await pg.close()
        # survive
        pg = await open_(b, level({'type': 'survive', 'secs': 5}))
        shut = await pg.evaluate("__arena.EXITS.map((x) => [x.opens, __arena.exitOpen(x)])")
        check('survive: the goal exit is shut and the always exit is open', shut == [['goal', False], ['always', True]], str(shut))
        await pg.evaluate(TICK, 120); mid = await pg.evaluate('__arena.GOAL.met'); line = await pg.evaluate("document.getElementById('goal').textContent")
        check('survive: not met at 2 s, the line counts', not mid and 'Survive 5 s' in line, line)
        await pg.evaluate(TICK, 240); after = await pg.evaluate("[__arena.GOAL.met, __arena.exitOpen(__arena.EXITS[0]), JSON.stringify(__arena.WORLD.save.run.flags), document.getElementById('goal').classList.contains('met')]")
        check('survive: met at 5 s, the exit opens, the flag is set, the line shows it', after[0] and after[1] and 'cleared-a' in after[2] and after[3], str(after)); await pg.close()
        # eat
        pg = await open_(b, level({'type': 'eat', 'n': 3, 'species': ''}))
        await pg.evaluate("() => { const f = __arena.sim.fish.find((q) => !q.dead); for (let i = 0; i < 2; i++) __arena.sim.hooks.onMeal(__arena.maw.guest, f); }"); await pg.evaluate(TICK, 5)
        two = await pg.evaluate('[__arena.GOAL.have, __arena.GOAL.met]')
        await pg.evaluate("() => { const f = __arena.sim.fish.find((q) => !q.dead); __arena.sim.hooks.onMeal(__arena.maw.guest, f); }"); await pg.evaluate(TICK, 5)
        check('eat: two meals do not meet 3, the third does', two == [2, False] and await pg.evaluate('__arena.GOAL.met'), str(two))
        await pg.evaluate("() => { const f = __arena.sim.fish.find((q) => !q.dead); __arena.sim.hooks.onMeal(__arena.AG[0].B.f, f); }")
        check('eat: only the Maw\'s meals count', await pg.evaluate('__arena.GOAL.have') == 3); await pg.close()
        pg = await open_(b, level({'type': 'eat', 'n': 2, 'species': 'koi'}))
        await pg.evaluate("() => { const w = __arena.sim.fish.find((q) => !q.dead && q.sp !== 'koi'); __arena.sim.hooks.onMeal(__arena.maw.guest, w); }"); await pg.evaluate(TICK, 3)
        check('eat koi: another species does not count', await pg.evaluate('__arena.GOAL.have') == 0); await pg.close()
        # kill
        pg = await open_(b, level({'type': 'kill', 'target': 'e3'}))
        await pg.evaluate(TICK, 5); await pg.evaluate("() => { for (const A of __arena.AG) if (A.lid === 'e4') { A.dead = true; A.respawn = 20; } }"); await pg.evaluate(TICK, 5)
        check('defeat e3: another encounter dying does not count', not await pg.evaluate('__arena.GOAL.met'))
        await pg.evaluate("() => { for (const A of __arena.AG) if (A.lid === 'e3') { A.dead = true; A.respawn = 20; } }"); await pg.evaluate(TICK, 5)
        check('defeat e3: that one dying meets it', await pg.evaluate('__arena.GOAL.met')); await pg.close()
        pg = await open_(b, level({'type': 'kill', 'target': 'all'})); await pg.evaluate(TICK, 5)
        await pg.evaluate("() => { for (const A of __arena.AG) if (A.lid === 'e3') { A.dead = true; A.respawn = 20; } }"); await pg.evaluate(TICK, 5); half = await pg.evaluate('[__arena.GOAL.have, __arena.GOAL.need, __arena.GOAL.met]')
        await pg.evaluate("() => { for (const A of __arena.AG) if (A.lid) { A.dead = true; A.respawn = 20; } }"); await pg.evaluate(TICK, 5)
        check('defeat all: needs every encounter', half == [1, 2, False] and await pg.evaluate('__arena.GOAL.met'), str(half)); await pg.close()
        # reach: a beacon on the Maw's start
        pg = await open_(b, level({'type': 'reach'}, [{'id': 'e7', 'type': 'beacon', 'x': 0, 'y': 0, 'r': 8}])); await pg.evaluate(TICK, 20)
        check('reach: the Maw standing in the beacon meets it', await pg.evaluate('__arena.GOAL.met')); await pg.close()
        pg = await open_(b, level({'type': 'reach'}, [{'id': 'e7', 'type': 'beacon', 'x': 70, 'y': 70, 'r': 6}])); await pg.evaluate(TICK, 20)
        check('reach: a far beacon is not met', not await pg.evaluate('__arena.GOAL.met')); await pg.close()
        # a level with no world: the goal still counts
        pg = await open_(b, level({'type': 'survive', 'secs': 5}), world=False); await pg.evaluate(TICK, 330)
        check('no world: the goal is met all the same', await pg.evaluate('__arena.GOAL.met') and not pg.errs, str(pg.errs[:1])); await pg.close()
        await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
