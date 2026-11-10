"""Swap new drawings into the parts kit (shared/data/creature-parts.json) without changing any id.

swaps.json names a source sheet and, for each new shape, its bounding box on that sheet and the part ids
it replaces. Each replaced part gets the new drawing scaled so its longest side matches the old part's,
centred on the old part's origin, so creatures built from that id keep their layout. Stroke widths stay
as drawn. Width, height and the top and bottom socket widths are measured again; ids, species, side and
origin stay.

    python3 shared/engine/creature-catalog/swap_shapes.py
    node shared/engine/creature-catalog/analyse.cjs && python3 shared/engine/creature-catalog/build.py

Running it twice gives the same result: it always draws from the source sheet.
"""
import json, os, re
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
PARTS_FILE = os.path.join(ROOT, "shared", "data", "creature-parts.json")
SWAPS = json.load(open(os.path.join(HERE, "swaps.json")))
NS = "{http://www.w3.org/2000/svg}"
NUM = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")
TOKEN = re.compile(r"[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?")
STYLE_KEYS = {"fill", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity"}


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
        v = [float(x) for x in NUM.findall(d)]
        paths.append({"d": d, "style": {k: v for k, v in style.items() if k in STYLE_KEYS},
                      "box": [min(v[0::2]), min(v[1::2]), max(v[0::2]), max(v[1::2])]})
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


def main():
    src = read_source(os.path.join(ROOT, SWAPS["source"]))
    parts = json.load(open(PARTS_FILE))
    by_id = {p["id"]: p for p in parts}
    done = 0
    for shape in SWAPS["shapes"]:
        box = shape["bbox"]
        mine = [p for p in src if inside(p["box"], box)]
        if not mine: raise SystemExit(f"{shape['id']}: no source paths inside its box")
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        sw, sh = box[2] - box[0], box[3] - box[1]
        for pid in shape["replace"]:
            p = by_id[pid]
            ox, oy = float(p["ox"]), float(p["oy"])
            k = max(float(p["w"]), float(p["h"])) / max(sw, sh)
            f = lambda x, y: (ox + (x - cx) * k, oy + (y - cy) * k)
            body = "".join(
                f'<path d="{move(q["d"], f)}" ' + " ".join(f'{a}="{v}"' for a, v in sorted(q["style"].items())) + "/>"
                for q in mine)
            p["svg"] = f'<g transform="translate({-ox:.1f} {-oy:.1f})">{body}</g>'
            p["defs"] = ""
            # size and sockets, measured as the kit builder does (world/creature-architecture-system/tools/kit-scripts/parts.py)
            pts = []
            for q in mine:
                v = [float(x) for x in NUM.findall(q["d"])]
                pts += [f(v[i], v[i + 1]) for i in range(0, len(v), 2)]
            xs, ys = [x for x, _ in pts], [y for _, y in pts]
            w, h = max(xs) - min(xs), max(ys) - min(ys)
            band = max(h * 0.15, 2)
            top = [abs(x - ox) for x, y in pts if y <= min(ys) + band]
            bot = [abs(x - ox) for x, y in pts if y >= max(ys) - band]
            p["w"], p["h"] = round(w, 1), round(h, 1)
            p["tw"] = round(2 * max(top), 1) if top else p["w"]
            p["bw"] = round(2 * max(bot), 1) if bot else p["w"]
            p["from"] = f"{os.path.basename(SWAPS['source'])}#{shape['id']}"
            done += 1
    with open(PARTS_FILE, "w") as fh:
        json.dump(parts, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"swapped {done} parts from {len(SWAPS['shapes'])} shapes")


main()
