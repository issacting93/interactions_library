"""Contact sheets of the kit's parts by feature, each part drawn alone with its id, through the composer's own geometry
(compose-kit-creature.py), to choose parts for a creature recipe.
  python3 world/forges/fish-tool/koi/kit-browse.py <out-dir> [feature ...]      default: body fin wing blade plate segment
"""
import sys, os, json, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("comp", os.path.join(HERE, "../compose-kit-creature.py")); comp = importlib.util.module_from_spec(spec); spec.loader.exec_module(comp)
CAT = json.load(open(os.path.join(comp.DATA, "creature-catalog.json")))["parts"]
out = sys.argv[1] if len(sys.argv) > 1 else "."; feats = sys.argv[2:] or ["body", "fin", "wing", "blade", "plate", "segment"]
os.makedirs(out, exist_ok=True)

def part_paths(pid):
    L = comp.lines({"parts": [{"part": pid, "x": 200, "y": 200, "free": True}]})
    pts = [q for s in L for q in [s["start"]] + [v for g in s["segs"] for v in g[1:]]]
    return L, pts

for feat in feats:
    ids = [pid for pid, c in CAT.items() if c.get("feature") == feat and not c.get("hidden") and not c.get("retired") and pid in comp.PARTS]
    cols, cell = 10, 170; rows = (len(ids) + cols - 1) // cols
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{cols * cell}" height="{rows * cell}"><rect width="100%" height="100%" fill="#f4f1ea"/>']
    for i, pid in enumerate(ids):
        L, pts = part_paths(pid)
        if not pts: continue
        x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts); y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
        k = (cell - 34) / max(x1 - x0, y1 - y0, 1); cx, cy = (i % cols) * cell, (i // cols) * cell
        ox, oy = cx + cell / 2 - (x0 + x1) / 2 * k, cy + (cell - 18) / 2 - (y0 + y1) / 2 * k
        t = lambda q: "%.1f %.1f" % (q[0] * k + ox, q[1] * k + oy)
        d = " ".join("M" + t(s["start"]) + "".join(g[0] + " ".join(t(q) for q in g[1:]) for g in s["segs"]) + ("Z" if s["closed"] else "") for s in L)
        svg.append(f'<path d="{d}" fill="none" stroke="#1c1b1a" stroke-width="0.8"/>')
        name = CAT[pid].get("name", "")[:20]
        svg.append(f'<text x="{cx + 5}" y="{cy + cell - 5}" font-family="monospace" font-size="11" fill="#444">{pid} {CAT[pid].get("side", "")} {name}</text>')
    svg.append("</svg>")
    open(os.path.join(out, feat + ".svg"), "w").write("".join(svg)); print(feat, len(ids))
