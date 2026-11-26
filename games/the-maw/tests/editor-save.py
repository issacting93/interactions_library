#!/usr/bin/env python3
"""Saving from the editor into the repo (tools/editor-server.mjs): the server on its own, then the editor with it running and without. Files go to a temp folder.

    python3 games/the-maw/tests/editor-save.py
"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
TMP = tempfile.mkdtemp(prefix='forge-save-'); LV, WD = os.path.join(TMP, 'levels'), os.path.join(TMP, 'worlds')
for d, src in ((LV, 'levels'), (WD, 'worlds')): shutil.copytree(os.path.join(ROOT, 'games/the-maw', src), d)
PORT = 5200 + os.getpid() % 500
srv = subprocess.Popen(['node', os.path.join(ROOT, 'games/the-maw/tools/editor-server.mjs'), '--port', str(PORT), '--levels', LV, '--worlds', WD], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
BASE = 'http://127.0.0.1:%d' % PORT
fails = []
def check(name, ok, note=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  ' + str(note)[:300]) if note and not ok else '')); ok or fails.append(name)
def req(path, body=None, headers=None, method=None):
    r = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=dict({'content-type': 'application/json'}, **(headers or {})), method=method)
    try:
        with urllib.request.urlopen(r) as x: return x.status, x.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
for _ in range(50):
    try: urllib.request.urlopen(BASE + '/__forge/ping'); break
    except Exception: time.sleep(0.1)
lv = lambda n: json.load(open(os.path.join(LV, n + '.json'))); idx = lambda d: json.load(open(os.path.join(d, 'index.json')))
good = json.dumps({'format': 'forge-level', 'version': 4, 'kind': 'field', 'name': 'Probe', 'entities': []})
# the server alone
st, b = req('/__forge/save', {'kind': 'level', 'name': 'probe', 'text': good})
check('a level is written and indexed', st == 200 and json.loads(b)['created'] and 'probe' in idx(LV) and lv('probe')['name'] == 'Probe', b)
before = idx(LV); st, b = req('/__forge/save', {'kind': 'level', 'name': 'probe', 'text': good})
check('saving again replaces it and leaves the index alone', st == 200 and not json.loads(b)['created'] and idx(LV) == before)
check('the order of the index is kept', idx(LV)[:5] == ['field', 'duel', 'swift-water', 'field-gate', 'duel-gate'])
for bad, why in (({'kind': 'level', 'name': '../evil', 'text': good}, 'a path in the name'), ({'kind': 'level', 'name': 'Probe', 'text': good}, 'capitals'), ({'kind': 'level', 'name': 'x', 'text': '{nope'}, 'text that is not JSON'),
                 ({'kind': 'level', 'name': 'x', 'text': json.dumps({'format': 'forge-world'})}, 'the wrong format'), ({'kind': 'other', 'name': 'x', 'text': good}, 'an unknown kind')):
    st, _ = req('/__forge/save', bad); check('refuses ' + why, st == 400 and not os.path.exists(os.path.join(LV, 'x.json')) and not os.path.exists(os.path.join(TMP, 'evil.json')))
st, _ = req('/__forge/save', {'kind': 'level', 'name': 'x', 'text': good}, {'Origin': 'http://evil.example'}); check('refuses a page from another origin', st == 403)
st, _ = req('/__forge/save', {'kind': 'level', 'name': 'x', 'text': good}, {'Host': 'evil.example'}); check('refuses another host name', st == 403)
st, b = req('/games/the-maw/editor/index.html'); check('serves the editor page', st == 200 and b'Level editor' in b)
st, _ = req('/../../etc/passwd'); check('does not leave the repo', st in (403, 404))
st, _ = req('/.git/config'); check('does not serve .git', st == 404)
w = json.dumps({'format': 'forge-world', 'version': 1, 'name': 'Probe world', 'seed': 1, 'start': None, 'levels': [], 'links': []})
st, b = req('/__forge/save', {'kind': 'world', 'name': 'probe-world', 'text': w}); check('a world is written and indexed', st == 200 and 'probe-world' in idx(WD), b)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900}, accept_downloads=True); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + '/games/the-maw/editor/index.html'); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_function('window.__editor && window.ForgeKeys')
        await pg.wait_for_function("document.querySelector('#dirty').textContent.includes('the repo')")
        E = pg.evaluate; hint = lambda: E("document.querySelector('#hint').textContent")
        check('the editor sees the server', 'repo' in await E("document.querySelector('#dirty').textContent"))
        await pg.click('#new'); await pg.click("#new-pop button:has-text('Empty field')")
        await E("__editor.edit({ op: 'level', path: 'name', value: 'Fresh Water' })")
        check('an edit shows as not in the repo yet', 'not in the repo' in await E("document.querySelector('#dirty').textContent"))
        await pg.keyboard.press('Control+s'); await pg.wait_for_function("document.querySelector('#hint').textContent.startsWith('Saved')")
        check('Save writes the file', os.path.exists(os.path.join(LV, 'fresh-water.json')) and lv('fresh-water')['name'] == 'Fresh Water' and 'fresh-water' in idx(LV))
        check('the label says it is saved', 'saved to levels/fresh-water.json' in await E("document.querySelector('#dirty').textContent"), await E("document.querySelector('#dirty').textContent"))
        await pg.click('#new'); await pg.click("#new-pop button:has-text('Empty field')"); await E("__editor.edit({ op: 'level', path: 'name', value: 'Fresh Water' })")
        m0 = os.path.getmtime(os.path.join(LV, 'fresh-water.json')); await pg.wait_for_timeout(30); await pg.click('#save'); await pg.wait_for_timeout(300)
        check('a name that exists asks before replacing', 'already exists' in await hint() and os.path.getmtime(os.path.join(LV, 'fresh-water.json')) == m0, await hint())
        await pg.click('#save'); await pg.wait_for_function("document.querySelector('#hint').textContent.startsWith('Saved')")
        check('the second Save replaces it', True)
        # opening a repo file then saving it again does not ask
        await pg.click('#open'); await pg.click("#open-pop button:has-text('field')"); await pg.wait_for_timeout(400)
        await pg.click('#save'); await pg.wait_for_function("document.querySelector('#hint').textContent.startsWith('Saved')")
        check('a file opened from the repo saves without asking', 'field.json' in await hint())
        check('no page errors', not errs, errs)
        # without the server: it downloads
        import http.server, threading
        class H(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
            def log_message(self, *a): pass
        plain = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=plain.serve_forever, daemon=True).start()
        pg = await b.new_page(viewport={'width': 1440, 'height': 900}, accept_downloads=True); await pg.goto('http://127.0.0.1:%d/games/the-maw/editor/index.html' % plain.server_address[1]); await pg.wait_for_function('window.__editor'); await pg.wait_for_timeout(500)
        async with pg.expect_download() as d: await pg.click('#save')
        dl = await d.value; check('without the server Save downloads a file', dl.suggested_filename.endswith('.json'))
        lab = await E("document.querySelector('#dirty').textContent"); check('the label falls back', 'repo' not in lab, lab)
        await b.close()
asyncio.run(main())
try: srv.terminate()
except Exception: pass
shutil.rmtree(TMP, ignore_errors=True)
print('\n%d failed' % len(fails) if fails else '\nall passed'); sys.exit(1 if fails else 0)
