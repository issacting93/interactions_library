#!/usr/bin/env python3
"""The kit parts the plants are made of, as polylines a page can place itself: packages/kit/data/kit-plant-parts.js (window.KitPlantParts).
Flora Grow (packages/flora/flora-grow.js) grows plants from these. Each part: side, w, h and lines, a list of
polylines [x, y, x, y, ...] about the part's own centre, y down, in kit sheet units (the same numbers a placement's scale multiplies).
Every part a plant in kit-plants.json uses is written, plus any ids given on the command line."""
import sys, os, json, importlib.util
import xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "../../../packages/kit/data")
spec = importlib.util.spec_from_file_location("kit", os.path.join(HERE, "export-kit-svg.py")); kit = importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
PARTS = {p["id"]: p for p in json.load(open(os.path.join(DATA, "creature-parts.json")))}
ids = []
for p in json.load(open(os.path.join(DATA, "kit-plants.json")))["plants"]:
    for q in p["parts"]:
        i = q.get("part") or q.get("ring") or q.get("array")
        if i not in ids: ids.append(i)
ids += [a for a in sys.argv[1:] if a in PARTS and a not in ids]
out = {}
for i in sorted(ids):
    p = PARTS[i]; acc = []; kit.walk(ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + p["svg"] + "</svg>"), (1, 0, 0, 1, 0, 0), acc); lines = []
    for sub in acc:
        pts = [sub["start"]]
        for g in sub["segs"]:
            if g[0] == "C":
                a, (b, c, d) = pts[-1], g[1:4]
                for t in (0.25, 0.5, 0.75, 1): u = 1 - t; pts.append((u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0], u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]))
            else: pts += list(g[1:])
        if sub["closed"]: pts.append(pts[0])
        flat = []
        for x, y in pts:
            v = (round(x, 1), round(y, 1))
            if len(flat) < 2 or (flat[-2], flat[-1]) != v: flat += v
        if len(flat) >= 4: lines.append(flat)
    out[i] = {"side": p["side"], "w": p["w"], "h": p["h"], "lines": lines}
f = os.path.join(DATA, "kit-plant-parts.js")
open(f, "w").write("// written by world/forges/fish-tool/plant-parts.py from creature-parts.json: do not edit\nwindow.KitPlantParts = " + json.dumps(out, separators=(",", ":")) + ";\n")
print(len(out), "parts,", sum(len(a) // 2 - 1 for p in out.values() for a in p["lines"]), "segments,", os.path.getsize(f) // 1024, "KB")
