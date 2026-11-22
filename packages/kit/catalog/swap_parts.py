"""Give a kit part another kit part's drawing, without changing any id.

part-swaps.json lists {"from": "P680", "into": ["P292", …]}: each "into" part gets the "from" part's line work, set to the old
drawing's longest side and centred where the old drawing sat, so creatures built from that id keep their layout. Width, height
and the top and bottom edge widths are measured again; id, sheet, side and origin stay. Both parts must be on the same side.

The drawing each swap overwrote is kept in packages/kit/data/kit-sources/replaced-parts.json ("swapped"). A part that was swapped
before and is no longer listed gets that drawing back, so the script can be run after any edit and always gives the same kit.
Run it after swap_shapes.py and add_sheets.py, never before.

    python3 packages/kit/catalog/swap_parts.py
    python3 packages/kit/catalog/one_px.py && node packages/kit/catalog/analyse.cjs
    python3 world/forges/fish-tool/kit-duplicates.py && python3 packages/kit/catalog/build.py
"""
import json, os, sys, importlib.util
import xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..", "..", "..")
PARTS_FILE = os.path.join(ROOT, "packages", "kit", "data", "creature-parts.json"); ORIG_FILE = os.path.join(ROOT, "packages", "kit", "data", "kit-sources", "replaced-parts.json")
spec = importlib.util.spec_from_file_location("kit", os.path.join(ROOT, "world", "forges", "fish-tool", "export-kit-svg.py")); kit = importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
SWAPS = json.load(open(os.path.join(HERE, "part-swaps.json")))
KEEP = ("svg", "defs", "w", "h", "tw", "bw")
f1 = lambda v: ("%.1f" % v).rstrip("0").rstrip(".")

def subs(part):
    """the part's line work in its own frame (origin at 0, 0)"""
    acc = []; kit.walk(ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + part["svg"] + "</svg>"), (1, 0, 0, 1, 0, 0), acc); return acc
def pts(acc): return [q for s in acc for q in [s["start"]] + [g[-1] for g in s["segs"]]] + [c for s in acc for g in s["segs"] if g[0] == "C" for c in g[1:3]]
def box(acc):
    p = [q for s in acc for q in [s["start"]] + [g[-1] for g in s["segs"]]]; xs = [x for x, _ in p]; ys = [y for _, y in p]; return min(xs), min(ys), max(xs), max(ys)

def redraw(src, old, part):
    a, b = box(subs(src)), box(subs(old)); k = max(b[2] - b[0], b[3] - b[1]) / max(a[2] - a[0], a[3] - a[1])
    ox, oy = float(part["ox"]), float(part["oy"])
    # a centre part stays on the centre line; a side part sits where the old one's box was
    cx = 0 if part["side"] == "center" else (b[0] + b[2]) / 2; sx = 0 if part["side"] == "center" else (a[0] + a[2]) / 2
    f = lambda p: (ox + cx + (p[0] - sx) * k, oy + (b[1] + b[3]) / 2 + (p[1] - (a[1] + a[3]) / 2) * k)
    paths = []; allp = []
    for s in subs(src):
        d = "M" + " ".join(f1(v) for v in f(s["start"])); allp.append(f(s["start"]))
        for g in s["segs"]:
            d += g[0] + " ".join(f1(v) for q in g[1:] for v in f(q)); allp.append(f(g[-1]))
        paths.append('<path d="%s" fill="none" stroke="#5fd38d" stroke-linejoin="round" stroke-width="1" vector-effect="non-scaling-stroke"/>' % (d + ("Z" if s["closed"] else "")))
    xs = [x for x, _ in allp]; ys = [y for _, y in allp]; w, h = max(xs) - min(xs), max(ys) - min(ys)
    edge = lambda lo, hi: (lambda e: (max(e) - min(e)) if e else w)([x for x, y in allp if lo <= y <= hi])
    return {"svg": '<g transform="translate(-%s -%s)">%s</g>' % (f1(ox), f1(oy), "".join(paths)), "defs": "", "w": round(w, 1), "h": round(h, 1),
            "tw": round(edge(min(ys), min(ys) + 0.12 * h), 1), "bw": round(edge(max(ys) - 0.12 * h, max(ys)), 1)}

def main():
    parts = json.load(open(PARTS_FILE)); orig = json.load(open(ORIG_FILE)) if os.path.exists(ORIG_FILE) else {"parts": {}}
    kept = orig.setdefault("swapped", {}); by = {p["id"]: p for p in parts}; wanted = {i: s["from"] for s in SWAPS["swaps"] for i in s["into"]}
    for p in parts:      # undo first: every swapped part back to the drawing it had
        if "swap" in p:
            p.update(kept[p["id"]]); del p["swap"]
            if p["id"] not in wanted: del kept[p["id"]]
    source = {i: dict(by[i]) for i in set(wanted.values())}      # sources as they are with no swap applied
    for i, s in wanted.items():
        p, q = by[i], source[s]
        if p["side"] != q["side"]: sys.exit(f"{i} is a {p['side']} part and {s} a {q['side']} part")
        kept[i] = {k: p[k] for k in KEEP}; p.update(redraw(q, p, p)); p["swap"] = s
    json.dump(parts, open(PARTS_FILE, "w"), ensure_ascii=False, separators=(",", ":")); json.dump(orig, open(ORIG_FILE, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(wanted)} parts redrawn from {len(source)} drawings")
main()
