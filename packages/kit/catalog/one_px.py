"""Every line in the kit one pixel wide.

Sets every stroked path in the parts kit, and in the copies of it other tools keep, to stroke-width 1 with
vector-effect="non-scaling-stroke", so a part draws a 1 px line at whatever size a page shows it. Fills, colours and shapes are not
touched; a path with no stroke stays as it is. Run it after swap_shapes.py (which writes drawn widths back).

    python3 packages/kit/catalog/one_px.py [--dry-run]
"""
import json, os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
FILES = ["packages/kit/data/creature-parts.json", "world/forges/bestiary-forge/library.json",
         "world/creature-architecture-system/tools/block-forge/parts.json", "world/creature-architecture-system/tools/tower-forge-ornament/parts.json"]
TAG = re.compile(r"<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*?)(/?)>")
count = {"set": 0, "kept": 0}

def tag(m):
    name, attrs, close = m.group(1), m.group(2), m.group(3)
    stroke = re.search(r'\sstroke="([^"]*)"', attrs)
    if not stroke or stroke.group(1) == "none": count["kept"] += 1; return m.group(0)
    attrs = re.sub(r'\sstroke-width="[^"]*"', "", attrs); attrs = re.sub(r'\svector-effect="[^"]*"', "", attrs)
    count["set"] += 1
    return "<%s%s stroke-width=\"1\" vector-effect=\"non-scaling-stroke\"%s>" % (name, attrs.rstrip(), close)

def walk(v):
    if isinstance(v, str): return TAG.sub(tag, v) if "<" in v and "stroke" in v else v
    if isinstance(v, list): return [walk(x) for x in v]
    if isinstance(v, dict): return {k: walk(x) for k, x in v.items()}
    return v

for rel in FILES:
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path): print("missing", rel); continue
    text = open(path).read(); before = dict(count); data = walk(json.loads(text))
    compact = "\n" not in text.strip()[:2000]
    out = json.dumps(data, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(data, ensure_ascii=False, indent=1)
    print("%-70s %5d lines set to 1 px, %4d left (no stroke)" % (rel, count["set"] - before["set"], count["kept"] - before["kept"]))
    if "--dry-run" not in sys.argv: open(path, "w").write(out + ("\n" if text.endswith("\n") else ""))
