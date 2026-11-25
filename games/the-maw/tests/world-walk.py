#!/usr/bin/env python3
"""Walking a world in the field: exits, the save on the device, a living level played forward for the time away.

    python3 games/the-maw/tests/world-walk.py

Plays games/the-maw/worlds/example.json in headless Chrome: field (living) joined to duel (frozen). The Maw is not steered to the exit;
the test puts the exit under it, which is what a walk to it would do. Needs playwright and /usr/bin/google-chrome."""
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
async def at(pg, id, timeout=120000):
    await pg.wait_for_function("window.__arena && __arena.WORLD && __arena.WORLD.here.id === %s && document.getElementById('msg')" % json.dumps(id), timeout=timeout)
    await pg.wait_for_timeout(400)
async def stand_on_exit(pg):
    await pg.wait_for_function('sim.time > 2.3', timeout=180000)   # the exit ignores the first two seconds of play, so nobody leaves where they arrived
    await pg.evaluate("(() => { const x = __arena.EXITS[0]; x.x = MAWP.x; x.y = MAWP.y; x.r = 400; })()")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 900, 'height': 700}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'games/the-maw/field/index.html#world=example'); await pg.evaluate("localStorage.clear()"); await pg.reload()
        await at(pg, 'field')
        w = await pg.evaluate("({ here: __arena.WORLD.here, exits: __arena.EXITS.length, seed: __arena.LEVEL.seed, dst: JSON.stringify(__arena.EXITS[0].to) })")
        check('a new world starts at its start, with the level its file and seed make', w['here']['first'] and w['here']['level'] == 'field-gate' and w['exits'] == 1, str(w['here']['seed']))
        await pg.wait_for_timeout(600)
        s = json.loads(await pg.evaluate("localStorage.getItem('forge-save:example')"))
        check('the save is on the device from the first moment', s['at'] == 'field' and s['levels']['field']['visits'] == 1)
        await pg.reload(); await at(pg, 'field')
        s = json.loads(await pg.evaluate("localStorage.getItem('forge-save:example')"))
        check('loading the page again resumes the level and counts nothing twice', s['levels']['field']['visits'] == 1)
        # the Maw grows here, and one of the field's encounters dies: both must be there after the walk
        pre = await pg.evaluate("""(() => { EcologyMaw.kit(maw, { eyes: 2, abil: ['spit'] });
          const sp = maw.sim.speciesRT, grow = (kind, i) => { const name = sp[i % sp.length].name, q = { kind, don: { sheet: maw.sheetOf(name), col: [0.3 + 0.1 * i, 0.5, 0.7], name, key: sp[i % sp.length].key, move: 'shoal' } };
            maw.stock = [q]; maw.offer = [{ kind, don: q.don, ref: q }]; maw.owed = 1; return EcologyMaw.choose(maw, 0); };   // as a meal would: one part grows from that donor
          const grew = [grow('reach', 1), grow('reach', 2), grow('bulk', 3), grow('wide', 4), grow('bulk', 5)].every(Boolean); if (!grew) throw new Error('a part did not grow');
          const A = AG.find((q) => q.lid && !q.dead); retireAgent(A); A.respawn = 18;
          return { teeth: maw.teeth.length, lv: JSON.stringify(maw.lv), plan: JSON.stringify(EcologyMaw.plan(maw)), rows: maw.rows.length, eyes: maw.ab.eyes, hist: maw.hist.length, lid: A.lid }; })()""")
        await stand_on_exit(pg)
        await at(pg, 'duel')
        post = await pg.evaluate("({ teeth: maw.teeth.length, lv: JSON.stringify(maw.lv), plan: JSON.stringify(EcologyMaw.plan(maw)), rows: maw.rows.length, eyes: maw.ab.eyes, spit: maw.ab.spit, carried: __arena.WORLD.carried })")
        check('the Maw comes through the door as it left: eyes, a gland, two neck rows, two body rows, tusks, in the same body', post['plan'] == pre['plan'] and post['rows'] == pre['rows'] and post['eyes'] == 2 and post['spit'] == 1 and post['carried'] == pre['hist'] and post['teeth'] == pre['teeth'] and post['lv'] == pre['lv'] == '{"wide":1,"bulk":2,"reach":2}', str([pre['hist'], post['carried'], pre['lv'], post['lv'], pre['rows'], post['rows']]))
        arr = await pg.evaluate("(() => { const x = __arena.EXITS[0]; return { d: Math.hypot(MAWP.x - x.x, MAWP.y - x.y), r: x.r, armed: !!x.armed }; })()")
        check('it arrives just inside the exit back, and that exit does not take it straight back', arr['d'] < arr['r'] * 6 and arr['d'] > arr['r'], str(arr))
        d0 = await pg.evaluate("(() => { const A = AG.find((q) => q.lid && !q.dead); retireAgent(A); A.respawn = 18; return A.lid; })()")
        s = json.loads(await pg.evaluate("localStorage.getItem('forge-save:example')"))
        d = await pg.evaluate("({ first: __arena.WORLD.here.first, lv: __arena.LEVEL.name, seed: __arena.LEVEL.seed })")
        check('walking into the exit saves and loads the next level', s['at'] == 'duel' and d['first'] and d['lv'] == 'Gate: one on one' and s['levels']['field']['leftAt'] is not None, str(s['levels']['field']))
        check('the two levels have seeds of their own', d['seed'] != w['seed'], '%s %s' % (w['seed'], d['seed']))
        clock = s['clock']
        await pg.wait_for_timeout(1500); await stand_on_exit(pg); await pg.wait_for_timeout(400)
        await at(pg, 'field')
        await pg.wait_for_function("document.getElementById('msg').hidden || /Back in/.test(document.getElementById('msg').textContent)", timeout=60000)
        f = await pg.evaluate("(() => { const A = AG.find((q) => q.lid === %s); return { dead: !!(A && A.dead), left: A ? A.respawn : null, away: __arena.WORLD.here.away }; })()" % json.dumps(pre['lid']))
        check('a living level went on while you were away: its dead encounter is that much nearer hatching', f['dead'] and f['left'] is not None and 18 - f['left'] >= f['away'] - 0.5, str(f))
        await pg.wait_for_timeout(1500); await stand_on_exit(pg); await pg.wait_for_timeout(400)
        await at(pg, 'duel')
        g = await pg.evaluate("(() => { const A = AG.find((q) => q.lid === %s); return { dead: !!(A && A.dead), left: A ? A.respawn : null }; })()" % json.dumps(d0))
        check('a frozen level waited: its dead encounter has the time it had', g['dead'] and g['left'] is not None and g['left'] > 14, str(g))
        await pg.wait_for_timeout(1500); await stand_on_exit(pg); await pg.wait_for_timeout(400)
        await at(pg, 'field')
        a = await pg.evaluate("({ away: __arena.WORLD.here.away, first: __arena.WORLD.here.first, msg: document.getElementById('msg').textContent })")
        check('coming back to a living level reports how long you were away, and it is not new', a['away'] > 2 and not a['first'], str(a))
        await pg.wait_for_function("document.getElementById('msg').hidden || /Back in/.test(document.getElementById('msg').textContent)", timeout=60000)
        check('the page played that time forward', True, document_msg(await pg.evaluate("document.getElementById('msg').textContent")))
        s = json.loads(await pg.evaluate("localStorage.getItem('forge-save:example')"))
        check('the clock only counts time played', s['clock'] > clock and s['levels']['field']['visits'] == 3, '%.1f s' % s['clock'])
        check('no page errors', not errs, str(errs[:2]))
        await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
def document_msg(t): return t[:60]
asyncio.run(main())
