#!/usr/bin/env python3
"""All the creatures in one SVG: exports/all-creatures.svg.
  python3 world/forges/fish-tool/export-all-svg.py      (after export-kit-svg.py and export-svg.mjs)
Every creature of the kit (exports/kit-svg), then the tank species that have no kit sheet (exports/creatures-svg), each at its full
drawn size (longest side 1024 px) in its own named group, laid out in a grid with its name under it. Plain coordinates, no
transforms, black 1 px strokes, no fills: each group can be lifted out as it is."""
import os, re, math, glob
HERE = os.path.dirname(os.path.abspath(__file__)); EXP = os.path.join(HERE, "exports")
TANK_ONLY = [("rogue", "Cloak Rogue"), ("eel", "Lattice Eel"), ("siphon", "Bead Siphon"), ("strike-lance", "Strike Lance"), ("frond-serpent", "Frond Serpent")]
CELL, LAB, COLS, GAP = 1056, 64, 8, 48
def load(path):
    s = open(path).read(); w, h = (float(v) for v in re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', s).groups())
    return w, h, re.findall(r'\sd="([^"]+)"', s), (re.search(r"<title>([^<]*)</title>", s) or [None, None])[1]
f2 = lambda v: ("%.2f" % v).rstrip("0").rstrip(".")
def shift(d, dx, dy):      # the path moved: every coordinate pair of M, L and C
    out = []
    for cmd, rest in re.findall(r"([MLCZ])([^MLCZ]*)", d):
        n = [float(x) for x in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", rest)]
        out.append(cmd + " ".join(f2(n[i] + dx) + " " + f2(n[i + 1] + dy) for i in range(0, len(n) - 1, 2)))
    return "".join(out)
items = []
for p in sorted(glob.glob(os.path.join(EXP, "kit-svg", "*.svg"))):
    if os.path.basename(p) == "sheet.svg": continue
    w, h, ds, title = load(p); items.append((os.path.basename(p)[:-4], title or os.path.basename(p)[:-4].replace("-", " ").capitalize(), w, h, ds))
for key, name in TANK_ONLY:
    w, h, ds, _ = load(os.path.join(EXP, "creatures-svg", key + ".svg")); items.append((name.lower().replace(" ", "-"), name, w, h, ds))
items.sort(key=lambda it: it[1].lower()); rows = math.ceil(len(items) / COLS); W = COLS * (CELL + GAP) + GAP; H = rows * (CELL + LAB + GAP) + GAP; body = []
for i, (key, name, w, h, ds) in enumerate(items):
    x0 = GAP + (i % COLS) * (CELL + GAP); y0 = GAP + (i // COLS) * (CELL + LAB + GAP); dx = x0 + (CELL - w) / 2; dy = y0 + (CELL - h) / 2
    body.append('<g id="%s">\n<title>%s</title>\n%s\n</g>' % (key, name, "\n".join('<path d="%s"/>' % shift(d, dx, dy) for d in ds)))
    body.append('<text x="%s" y="%s" text-anchor="middle" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="28" fill="#000" stroke="none">%s</text>' % (f2(x0 + CELL / 2), f2(y0 + CELL + 40), name))
open(os.path.join(EXP, "all-creatures.svg"), "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">\n<title>All creatures</title>\n<g fill="none" stroke="#000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">\n%s\n</g>\n</svg>\n' % (W, H, W, H, "\n".join(body)))
print(len(items), "creatures in", os.path.join(EXP, "all-creatures.svg"), "%d x %d" % (W, H), "%.1f MB" % (os.path.getsize(os.path.join(EXP, "all-creatures.svg")) / 1e6))
