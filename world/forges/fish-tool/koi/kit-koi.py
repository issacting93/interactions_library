"""Draws the kit koi (koi/kit-koi.json) with the composer (compose-kit-creature.py): one 1 px line SVG each, as the kit set is drawn,
and a sheet of all of them side by side for review.
  python3 world/forges/fish-tool/koi/kit-koi.py [out-dir]       default: world/forges/fish-tool/koi/kit
"""
import sys, os, json, importlib.util, re
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("comp", os.path.join(HERE, "../compose-kit-creature.py")); comp = importlib.util.module_from_spec(spec); spec.loader.exec_module(comp)
out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "kit")); os.makedirs(out, exist_ok=True)
CAT = json.load(open(os.path.join(comp.DATA, "creature-catalog.json")))["parts"]
R = json.load(open(os.path.join(HERE, "kit-koi.json")))["creatures"]
cells = []
for i, r in enumerate(R):
    path = os.path.join(out, r["key"] + ".svg"); n = comp.write(r, path, size=800)
    ids = sorted({pl.get("part") or pl.get("array") or pl.get("ring") for pl in r["parts"]})
    print("%-22s %3d lines from %2d kit parts: %s" % (r["name"], n, len(ids), " ".join(ids)))
    body = re.search(r"<g[^>]*>(.*)</g>", open(path).read(), re.S).group(1)
    names = ", ".join(sorted({CAT.get(x, {}).get("name", x).rsplit(" ", 1)[0] for x in ids}))
    cells.append((r, body, ids, names))
W, H = 800, 900; NC = min(4, len(cells)); NR = (len(cells) + NC - 1) // NC
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"><rect width="100%%" height="100%%" fill="#f4f1ea"/>' % (W * NC, H * NR, W * NC, H * NR)]
for i, (r, body, ids, names) in enumerate(cells):
    svg.append('<g transform="translate(%d %d)"><g fill="none" stroke="#1c1b1a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">%s</g>' % (i % NC * W, i // NC * H, body))
    svg.append('<text x="40" y="830" font-family="monospace" font-size="22" fill="#222">%s</text>' % r["name"])
    svg.append('<text x="40" y="862" font-family="monospace" font-size="14" fill="#666">%s</text></g>' % " ".join(ids))
svg.append("</svg>"); open(os.path.join(out, "sheet.svg"), "w").write("".join(svg))
