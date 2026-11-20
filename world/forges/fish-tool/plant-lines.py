#!/usr/bin/env python3
"""The composed plants as line geometry the tank can stand up: shared/data/kit-plants-lines.js (window.KitPlants).
Run after compose-kit-creature.py plants. Each plant: its record from kit-plants.json plus lines, a list of polylines
[x, y, x, y, ...] in thousandths of its height (of its width, for a flat one): x from its centre line, y up from its foot."""
import json, re, os, sys
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
src = json.load(open(os.path.join(root, 'shared/data/kit-plants.json')))
out = []
for p in src['plants']:
    s = open(os.path.join(root, 'world/forges/fish-tool/exports/kit-plants', p['key'] + '.svg')).read()
    polys = []
    for d in re.findall(r'\sd="([^"]+)"', s):
        if re.search(r'[^MLCZ0-9eE.,\-\s]', d): sys.exit(p['key'] + ': a path uses a command this does not read')
        pts = []
        for cmd, body in re.findall(r'([MLCZ])([^MLCZ]*)', d):
            n = [float(v) for v in re.findall(r'-?\d+\.?\d*(?:[eE]-?\d+)?', body)]
            if cmd == 'M':
                if len(pts) > 1: polys.append(pts)
                pts = list(zip(n[0::2], n[1::2]))
            elif cmd == 'L': pts += list(zip(n[0::2], n[1::2]))
            elif cmd == 'C':   # a curve, as four straight steps
                for i in range(0, len(n), 6):
                    (ax, ay), (bx, by, cx_, cy_, dx, dy) = pts[-1], n[i:i + 6]
                    for t in (0.25, 0.5, 0.75, 1): u = 1 - t; pts.append((u*u*u*ax + 3*u*u*t*bx + 3*u*t*t*cx_ + t*t*t*dx, u*u*u*ay + 3*u*u*t*by + 3*u*t*t*cy_ + t*t*t*dy))
            elif pts: pts.append(pts[0])
        if len(pts) > 1: polys.append(pts)
    xs = [x for q in polys for x, _ in q]; ys = [y for q in polys for _, y in q]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys); flat = bool(p['eco'].get('flat'))
    k = 1000 / ((x1 - x0) if flat else (y1 - y0)); cx = (x0 + x1) / 2; base = (y0 + y1) / 2 if flat else y1
    lines = []
    for q in polys:
        a = []
        for x, y in q:
            v = (round((x - cx) * k), round((base - y) * k))
            if len(a) < 2 or (a[-2], a[-1]) != v: a += v
        if len(a) >= 4: lines.append(a)
    ids = []
    for q in p['parts']:
        i = q.get('part') or q.get('ring') or q.get('array')
        if i and i not in ids: ids.append(i)
    out.append({'key': p['key'], 'name': p['name'], 'kind': p['kind'], 'role': p['role'], 'eco': p['eco'], 'kit': ids, 'wide': round((x1 - x0) * k), 'tall': round((y1 - y0) * k),
                'segs': sum(len(a) // 2 - 1 for a in lines), 'lines': lines})
f = os.path.join(root, 'shared/data/kit-plants-lines.js')
open(f, 'w').write('// written by world/forges/fish-tool/plant-lines.py from kit-plants.json and exports/kit-plants: do not edit\nwindow.KitPlants = ' + json.dumps({'plants': out}, separators=(',', ':')) + ';\n')
print(len(out), 'plants,', sum(p['segs'] for p in out), 'segments,', os.path.getsize(f) // 1024, 'KB')
