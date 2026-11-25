#!/usr/bin/env python3
"""A field run replays: the same level and seed give the same event log, a different seed a different one.

    python3 games/the-maw/tests/field-run.py [seconds]

Loads the field page in headless Chrome with #run (a fixed-step run on Auto, nothing drawn) and compares the digests of the
event logs. Also runs the editor's Runs panel once on the duel. Needs playwright and /usr/bin/google-chrome."""
import asyncio, functools, http.server, os, sys, threading
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SECS = int(sys.argv[1]) if len(sys.argv) > 1 else 40
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/' % srv.server_address[1]
fails = []
def check(name, ok, note=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  ' + note) if note else '')); ok or fails.append(name)
async def run(b, frag):
    pg = await b.new_page(viewport={'width': 900, 'height': 700}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE + 'games/the-maw/field/index.html#' + frag); await pg.wait_for_function('window.__run', timeout=300000)
    r = await pg.evaluate('window.__run'); await pg.close(); r['errors'] = errs; return r
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for lv in ('field', 'duel'):
            a = await run(b, 'level=%s&run=%d' % (lv, SECS)); c = await run(b, 'level=%s&run=%d' % (lv, SECS))
            check(lv + ': a run finishes with no page error', not a['errors'] and a['steps'] == SECS * 60, str(a['errors'][:1]))
            check(lv + ': the same seed gives the same event log', a['digest'] == c['digest'] and a['events'] == c['events'], '%s %s, %d events' % (a['digest'], c['digest'], a['events']))
            check(lv + ': something happened', a['events'] > 0)
        d = await run(b, 'level=field&run=%d&seed=99' % SECS); a = await run(b, 'level=field&run=%d' % SECS)
        check('field: another seed gives another log', d['digest'] != a['digest'], d['digest'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 800}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + 'games/the-maw/editor/index.html'); await pg.wait_for_function('window.__editor', timeout=60000)
        await pg.evaluate("__editor.FRUN.secs = 20; __editor.fieldRun()")
        await pg.wait_for_function('!__editor.FRUN.running && __editor.FRUN.runs && __editor.FRUN.runs.length === 3', timeout=300000)
        runs = await pg.evaluate('__editor.FRUN.runs')
        check('editor: three runs come back, one for each seed', len({r['seed'] for r in runs}) == 3 and not errs, str([r['digest'] for r in runs]) + str(errs[:1]))
        await b.close()
    print('\n%s' % ('all passed' if not fails else '%d FAILED: %s' % (len(fails), fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
