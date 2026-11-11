"""Swap new drawings into the parts kit (shared/data/creature-parts.json) without changing any id.

swaps.json names a source sheet and, for each new shape, its bounding box on that sheet and either
  - the part ids it replaces ("shapes"): each gets the new drawing scaled so its longest side matches the
    old part's, centred on the old part's origin, so creatures built from that id keep their layout; or
  - a new part id to add ("add"): the drawing at its drawn size, on its own sheet.
Line widths follow "stroke": drawn widths are brought to the kit's weight, and thinned by the same factor
as the drawing when it is shrunk, so small parts don't clog. Width, height and the top and bottom socket
widths are measured again; ids, species, side and origin stay.

The part each swap overwrote is kept in shared/data/kit-sources/replaced-parts.json. A part that was
swapped before but is no longer in swaps.json gets its original drawing back, so the script can be run
after any edit to swaps.json and always gives the same kit.

    python3 shared/engine/creature-catalog/swap_shapes.py
    node shared/engine/creature-catalog/analyse.cjs && python3 shared/engine/creature-catalog/build.py
"""
import json, os, re
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
PARTS_FILE = os.path.join(ROOT, "shared", "data", "creature-parts.json")
ORIG_FILE = os.path.join(ROOT, "shared", "data", "kit-sources", "replaced-parts.json")
SWAPS = json.load(open(os.path.join(HERE, "swaps.json")))
NS = "{http://www.w3.org/2000/svg}"
NUM = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")
TOKEN = re.compile(r"[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?")
STYLE_KEYS = {"fill", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity"}
STROKE = SWAPS.get("stroke", {"kit_weight": 1, "drawn_weight": 1, "min": 0})


def read_source(path):
    text = open(path).read()
    rules = {}
    m = re.search(r"<style>(.*?)</style>", text, re.S)
    if m:
        for name, body in re.findall(r"\.([\w-]+)\s*\{([^}]*)\}", m.group(1)):
            rules[name] = dict((k.strip(), v.strip()) for k, v in (kv.split(":") for kv in body.split(";") if ":" in kv))
    paths = []
    for el in ET.fromstring(text).iter(NS + "path"):
        if el.get("transform"): raise SystemExit("source paths with a transform are not supported")
        d = el.get("d")
        if re.search(r"[A-BD-KN-Ya-z]", d): raise SystemExit("source paths must use absolute M L C Z only")
        style = {}
        for c in (el.get("class") or "").split(): style.update(rules.get(c, {}))
        style.update({k: v for k, v in el.attrib.items() if k in STYLE_KEYS})
        style = {k: v for k, v in style.items() if k in STYLE_KEYS}
        if style.get("stroke", "none") != "none": style.setdefault("stroke-width", "1")
        v = [float(x) for x in NUM.findall(d)]
        paths.append({"d": d, "style": style, "box": [min(v[0::2]), min(v[1::2]), max(v[0::2]), max(v[1::2])]})
    return paths


def inside(b, box, tol=0.5):
    return b[0] >= box[0] - tol and b[1] >= box[1] - tol and b[2] <= box[2] + tol and b[3] <= box[3] + tol


def move(d, f):
    """apply f(x, y) -> (x, y) to every point of an absolute M/L/C/Z path"""
    out, nums = [], []
    def flush():
        for i in range(0, len(nums), 2):
            x, y = f(nums[i], nums[i + 1]); out.append(f"{x:.2f} {y:.2f}")
        nums.clear()
    for t in TOKEN.findall(d):
        if t in "MLCZ": flush(); out.append(t)
        else: nums.append(float(t))
    flush()
    return " ".join(out)


def draw(src, box, ox, oy, k):
    """the shape in `box`, scaled by k about its centre and moved to (ox, oy); returns the part fields"""
    mine = [p for p in src if inside(p["box"], box)]
    if not mine: raise SystemExit(f"no source paths inside {box}")
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    f = lambda x, y: (ox + (x - cx) * k, oy + (y - cy) * k)
    weight = STROKE["kit_weight"] / STROKE["drawn_weight"] * min(k, 1)
    body = []
    for q in mine:
        st = dict(q["style"])
        if "stroke-width" in st: st["stroke-width"] = f'{max(float(st["stroke-width"]) * weight, STROKE["min"]):.2f}'
        body.append(f'<path d="{move(q["d"], f)}" ' + " ".join(f'{a}="{v}"' for a, v in sorted(st.items())) + "/>")
    pts = []
    for q in mine:
        v = [float(x) for x in NUM.findall(q["d"])]
        pts += [f(v[i], v[i + 1]) for i in range(0, len(v), 2)]
    xs, ys = [x for x, _ in pts], [y for _, y in pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    band = max(h * 0.15, 2)
    top = [abs(x - ox) for x, y in pts if y <= min(ys) + band]
    bot = [abs(x - ox) for x, y in pts if y >= max(ys) - band]
    w, h = round(w, 1), round(h, 1)
    return {"svg": f'<g transform="translate({-ox:.1f} {-oy:.1f})">{"".join(body)}</g>', "defs": "",
            "w": w, "h": h, "tw": round(2 * max(top), 1) if top else w, "bw": round(2 * max(bot), 1) if bot else w}


def main():
    src = read_source(os.path.join(ROOT, SWAPS["source"]))
    parts = json.load(open(PARTS_FILE))
    orig = json.load(open(ORIG_FILE)) if os.path.exists(ORIG_FILE) else {"parts": {}}
    tag = os.path.basename(SWAPS["source"])
    wanted = {pid for s in SWAPS["shapes"] for pid in s["replace"]}
    added = {a["part"] for a in SWAPS.get("add", {}).get("parts", [])}

    # undo: back to the original drawing for anything swapped earlier and no longer wanted; drop stale added parts
    out = []
    mine = lambda p: str(p.get("from", "")).startswith(tag + "#")   # only what this script drew; other tools mark parts too
    for p in parts:
        if p.get("added") and mine(p):
            if p["id"] in added: out.append(p)
            continue
        if mine(p) and p["id"] not in wanted:
            p = dict(orig["parts"][p["id"]])
        out.append(p)
    parts = out
    by_id = {p["id"]: p for p in parts}

    done = 0
    for shape in SWAPS["shapes"]:
        box = shape["bbox"]; size = max(box[2] - box[0], box[3] - box[1])
        for pid in shape["replace"]:
            p = by_id[pid]
            if not mine(p): orig["parts"].setdefault(pid, dict(p))
            base = orig["parts"].get(pid, p)
            k = max(float(base["w"]), float(base["h"])) / size
            p.update(draw(src, box, float(p["ox"]), float(p["oy"]), k))
            p["from"] = f"{tag}#{shape['id']}"
            done += 1

    add = SWAPS.get("add", {})
    for a in add.get("parts", []):
        rec = {"species": add["species"], "side": "center", "ox": 200, "oy": 200}
        rec.update(draw(src, a["bbox"], 200, 200, 1))
        rec.update({"id": a["part"], "from": f"{tag}#{a['id']}", "added": True})
        if a["part"] in by_id: by_id[a["part"]].clear(); by_id[a["part"]].update(rec)
        else: parts.append(rec); by_id[a["part"]] = rec

    with open(PARTS_FILE, "w") as fh:
        json.dump(parts, fh, ensure_ascii=False, separators=(",", ":"))
    with open(ORIG_FILE, "w") as fh:
        json.dump(orig, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"swapped {done} parts from {len(SWAPS['shapes'])} shapes; added {len(add.get('parts', []))} parts")


main()
