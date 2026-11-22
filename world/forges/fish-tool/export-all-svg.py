#!/usr/bin/env python3
"""All the creatures in one SVG: exports/all-creatures.svg.
  python3 world/forges/fish-tool/export-all-svg.py      (after export-kit-svg.py and export-svg.mjs)
Every creature of the kit (exports/kit-svg), the creatures composed from kit parts (exports/kit-creatures), then the tank species that have no kit sheet (exports/creatures-svg), each at its full
drawn size (longest side 1024 px) in its own named group, laid out by order and family (packages/kit/data/creature-taxonomy.json) with its name and scientific name under it. The same drawing is written to creatures-by-family.svg at the repo root. Plain coordinates, no
transforms, black 1 px strokes, no fills: each group can be lifted out as it is."""
import os, re, math, glob
HERE = os.path.dirname(os.path.abspath(__file__)); EXP = os.path.join(HERE, "exports")
TANK_ONLY = [("rogue", "Cloak rogue"), ("eel", "Lattice eel"), ("siphon", "Rosary eel"), ("strike-lance", "Strike lance"), ("frond-serpent", "Frond wing")]
CELL, LAB, COLS, GAP = 1056, 96, 6, 48
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
for p in sorted(glob.glob(os.path.join(EXP, "kit-svg", "*.svg")) + glob.glob(os.path.join(EXP, "kit-creatures", "*.svg"))):      # kit sheets, then the creatures composed from kit parts
    if os.path.basename(p) == "sheet.svg": continue
    w, h, ds, title = load(p); items.append((os.path.basename(p)[:-4], title or os.path.basename(p)[:-4].replace("-", " ").capitalize(), w, h, ds))
for key, name in TANK_ONLY:
    w, h, ds, _ = load(os.path.join(EXP, "creatures-svg", key + ".svg")); items.append((name.lower().replace(" ", "-"), name, w, h, ds))
# laid out by the classification (packages/kit/data/creature-taxonomy.json): a band per family under its order's heading; anything unclassified goes last
import json
TAX = json.load(open(os.path.join(HERE, "../../../packages/kit/data/creature-taxonomy.json"))); norm = lambda t: re.sub(r"[^a-z0-9]", "", t.lower()); by = {norm(it[1]): it for it in items}; bands = []; used = set()
for o in TAX["orders"]:
    for fi, fm in enumerate(o["families"]):
        g = fm["genera"][0]; got = [(by[norm(sp["common"])], g["name"] + " " + sp["sci"]) for sp in g["species"] if norm(sp["common"]) in by]; used |= {norm(sp["common"]) for sp in g["species"]}
        if got: bands.append((o["name"] + " · " + o["common"] if fi == 0 else "", fm["common"] + " · " + g["note"], got))
rest = [(it, "") for k, it in sorted(by.items()) if k not in used]
if rest: bands.append(("", "Unclassified", rest))
HEAD, SUB = 150, 90; W = COLS * (CELL + GAP) + GAP; y = GAP; body = []
txt = lambda x, yy, size, t, anchor="start", fill="#000": '<text x="%s" y="%s" text-anchor="%s" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="%d" fill="%s" stroke="none">%s</text>' % (f2(x), f2(yy), anchor, size, fill, t)
for order, family, got in bands:
    if order: y += 40; body.append(txt(GAP, y + 70, 72, order.upper())); y += HEAD
    body.append(txt(GAP, y + 40, 36, family, fill="#555")); y += SUB; body.append('<g id="%s">' % re.sub(r"[^a-z0-9]+", "-", family.split(" · ")[0].lower()))
    for i, ((key, name, w, h, ds), sci) in enumerate(got):
        x0 = GAP + (i % COLS) * (CELL + GAP); y0 = y + (i // COLS) * (CELL + LAB + GAP); dx = x0 + (CELL - w) / 2; dy = y0 + (CELL - h) / 2
        body.append('<g id="%s">\n<title>%s</title>\n%s\n</g>' % (key, name, "\n".join('<path d="%s"/>' % shift(d, dx, dy) for d in ds)))
        body.append(txt(x0 + CELL / 2, y0 + CELL + 34, 28, name, "middle")); body.append(txt(x0 + CELL / 2, y0 + CELL + 62, 20, sci, "middle", "#777"))
    body.append("</g>"); y += math.ceil(len(got) / COLS) * (CELL + LAB + GAP)
H = y + GAP
doc = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">\n<title>All creatures, by order and family</title>\n<g fill="none" stroke="#000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">\n%s\n</g>\n</svg>\n' % (W, H, W, H, "\n".join(body))
open(os.path.join(EXP, "all-creatures.svg"), "w").write(doc); open(os.path.join(HERE, "../../../creatures-by-family.svg"), "w").write(doc)      # the family sheet at the repo root is the same drawing
print(len(items), "creatures in", os.path.join(EXP, "all-creatures.svg"), "and creatures-by-family.svg,", "%d x %d" % (W, H), "%.1f MB" % (os.path.getsize(os.path.join(EXP, "all-creatures.svg")) / 1e6))
