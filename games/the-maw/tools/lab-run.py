#!/usr/bin/env python3
"""The lab's runner: play a level on many seeds with nothing drawn, keep every run's event log, and write one table to compare versions by.

    python3 games/the-maw/tools/lab-run.py --field field --seeds 1-20 --secs 120 --out lab/field-today
    python3 games/the-maw/tools/lab-run.py --stage floor --seeds 1-10 --secs 90 --out lab/s1
    python3 games/the-maw/tools/lab-run.py --field field --seeds 1-20 --secs 120 --out lab/field-new --compare lab/field-today

--field NAME   a field level in games/the-maw/levels (the field page's #run: Auto drives, fixed 1/60 s steps)
--stage ID     a tank stage (one of MawStages: floor, frond, shoals, deep, spires, colony, apex, lv-<file>; the tank's balance run: its autopilot plays)
--seeds        1-20, or 3,7,99
--jobs N       pages run side by side (default 3)
--compare DIR  a folder an earlier run wrote: prints each measure old against new, and which seeds' logs changed
--repeat       play the first seed twice and fail if its two logs differ

Writes OUT/logs/<seed>.jsonl (packages/lab's ForgeLog, one event a line), OUT/runs.csv (a row a seed) and OUT/summary.json (each measure's mean,
spread and range, and every seed's digest). Serves the repo itself; needs Python's playwright and Chrome (CHROME=..., else /usr/bin/google-chrome).
A run's numbers come from Auto or the autopilot, not a person: they compare one version of a level with the next, they do not say how it feels."""
import argparse, asyncio, csv, json, math, os, statistics, sys, threading, time, http.server
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']

class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass

def seeds_of(s):
    out = []
    for part in s.split(','):
        if '-' in part: a, b = part.split('-'); out += list(range(int(a), int(b) + 1))
        elif part.strip(): out.append(int(part))
    return out

def row_of(kind, r):
    """One run as a flat row: the shared measures first, then the page's own."""
    s = r['summary']; per = s.get('perMin', {})
    row = {'seed': r['seed'], 'digest': s['digest'], 'secs': s['secs'], 'events': s['events'], 'maw_meals_per_min': s['mawMealsPerMin'],
           'meals_per_min': per.get('meal', 0), 'deaths_per_min': per.get('death', 0), 'maw_hits': s['byType'].get('maw_hit', 0),
           'maw_deaths': s['byType'].get('maw_death', 0), 'grew': s['byType'].get('grow', 0)}
    if kind == 'field': row.update({'encounters_left': r['agents'], 'creatures_left': r['creatures'], 'mean_encounter_lv': r['meanLv']})
    else: row.update({'end': r['end'], 'cleared_at': r['cleared'] if r['cleared'] is not None else '', 'ai_hit_rate': r['hitRate'], 'energy_min': r['eMin']})
    return row

async def field_runs(browser, base, name, seeds, secs, jobs, progress):
    q = asyncio.Queue(); [q.put_nowait(s) for s in seeds]; out = {}
    async def worker():
        while not q.empty():
            s = q.get_nowait(); errs = []
            pg = await browser.new_page(viewport={'width': 640, 'height': 480}); pg.on('pageerror', lambda e: errs.append(str(e)))   # a fresh page a seed: a new hash alone does not load it again
            await pg.goto(f'{base}games/the-maw/field/index.html#level={name}&run={secs}&seed={s}')
            await pg.wait_for_function('window.__run', timeout=max(120000, secs * 8000))
            r = await pg.evaluate('window.__run'); r['seed'] = s; r['log'] = await pg.evaluate('window.__runLog()'); r['errors'] = list(errs)
            out[s] = r; progress(s); await pg.close()
    await asyncio.gather(*[worker() for _ in range(min(jobs, len(seeds)))]); return out

async def stage_runs(browser, base, sid, seeds, secs, jobs, progress):
    chunks = [seeds[i::jobs] for i in range(min(jobs, len(seeds)))]; out = {}
    async def worker(chunk):
        pg = await browser.new_page(viewport={'width': 640, 'height': 480}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'{base}world/forges/fish-tool/Cybernetic%20Ecology.html')
        await pg.wait_for_function('window.__stageBalance && window.ForgeLog', timeout=120000)
        for s in chunk:
            for attempt in range(60):   # the tank's walkers and the Maw come up a moment after the page
                res = await pg.evaluate('([id, secs, s]) => window.__stageBalance(id, { secs, seeds: [s], log: true })', [sid, secs, s])
                if not res.get('error') or 'not up yet' not in res['error']: break
                await pg.wait_for_timeout(1000)
            if res.get('error'): raise SystemExit(f'stage {sid}, seed {s}: {res["error"]}')
            r = res['runs'][0]; r['log'] = res['logs'][0]; r['errors'] = list(errs); out[s] = r; progress(s)
        await pg.close()
    await asyncio.gather(*[worker(c) for c in chunks]); return out

def stats(vals):
    v = [x for x in vals if isinstance(x, (int, float)) and not (isinstance(x, float) and math.isnan(x))]
    if not v: return None
    return {'mean': round(statistics.fmean(v), 3), 'sd': round(statistics.pstdev(v), 3) if len(v) > 1 else 0, 'min': min(v), 'max': max(v), 'n': len(v)}

def compare(old, new):
    print('\n%-22s %12s %12s %9s' % ('measure', 'before', 'now', 'change'))
    for k, b in new['measures'].items():
        a = old['measures'].get(k)
        if not a or not b: continue
        d = b['mean'] - a['mean']; pct = (d / a['mean'] * 100) if a['mean'] else float('inf') if d else 0
        flag = '  <- more than the spread' if a['sd'] and abs(d) > a['sd'] else ''
        print('%-22s %12.3f %12.3f %8s%%%s' % (k, a['mean'], b['mean'], ('%+.1f' % pct) if pct != float('inf') else 'new', flag))
    shared = sorted(set(old['digests']) & set(new['digests']), key=int)
    same = [s for s in shared if old['digests'][s] == new['digests'][s]]
    print('\nseeds in both: %d · logs unchanged: %d · changed: %d' % (len(shared), len(same), len(shared) - len(same)))
    if old.get('target') != new.get('target'): print('note: they ran different targets (%s, %s)' % (old.get('target'), new.get('target')))
    if old.get('secs') != new.get('secs'): print('note: different run lengths (%s s, %s s): digests cannot match' % (old.get('secs'), new.get('secs')))

async def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    g = ap.add_mutually_exclusive_group(required=True); g.add_argument('--field'); g.add_argument('--stage')
    ap.add_argument('--seeds', default='1-10'); ap.add_argument('--secs', type=int, default=120); ap.add_argument('--jobs', type=int, default=3)
    ap.add_argument('--out', required=True); ap.add_argument('--compare'); ap.add_argument('--repeat', action='store_true')
    a = ap.parse_args(); seeds = seeds_of(a.seeds); kind = 'field' if a.field else 'stage'; target = a.field or a.stage
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Quiet); threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = 'http://127.0.0.1:%d/' % srv.server_address[1]; t0 = time.time(); done = []
    def progress(s): done.append(s); print('  %s %s seed %d · %d of %d · %.0f s' % (kind, target, s, len(done), len(seeds), time.time() - t0), flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        run = field_runs if kind == 'field' else stage_runs
        res = await run(b, base, target, seeds, a.secs, a.jobs, progress)
        rep = None
        if a.repeat: rep = (await run(b, base, target, seeds[:1], a.secs, 1, lambda s: None))[seeds[0]]
        await b.close()
    os.makedirs(os.path.join(a.out, 'logs'), exist_ok=True); rows = []
    for s in seeds:
        r = res[s]; open(os.path.join(a.out, 'logs', '%d.jsonl' % s), 'w').write(r['log']); rows.append(row_of(kind, r))
        if r['errors']: print('  seed %d: page errors: %s' % (s, r['errors'][:2]))
    with open(os.path.join(a.out, 'runs.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    measures = {k: stats([r[k] for r in rows]) for k in rows[0] if k not in ('seed', 'digest', 'end')}
    summary = {'target': kind + ':' + target, 'secs': a.secs, 'seeds': seeds, 'when': time.strftime('%Y-%m-%d %H:%M'), 'measures': measures, 'digests': {str(r['seed']): r['digest'] for r in rows}}
    if kind == 'stage': summary['ends'] = {e: sum(1 for r in rows if r['end'] == e) for e in sorted({r['end'] for r in rows})}
    json.dump(summary, open(os.path.join(a.out, 'summary.json'), 'w'), indent=1)
    print('\n%s · %d seeds · %d s each · %.0f s in all · %s' % (summary['target'], len(seeds), a.secs, time.time() - t0, a.out))
    for k in ('maw_meals_per_min', 'meals_per_min', 'deaths_per_min', 'maw_deaths', 'grew'):
        m = measures.get(k); m and print('  %-20s mean %.2f  (%.2f to %.2f)' % (k, m['mean'], m['min'], m['max']))
    if kind == 'stage': print('  ends:', summary['ends'])
    bad = 0
    if rep is not None:
        same = rep['summary']['digest'] == res[seeds[0]]['summary']['digest']; print('  repeat of seed %d: %s' % (seeds[0], 'the same log' if same else 'A DIFFERENT LOG'))
        bad += not same
    if a.compare: compare(json.load(open(os.path.join(a.compare, 'summary.json'))), summary)
    sys.exit(1 if bad else 0)

asyncio.run(main())
