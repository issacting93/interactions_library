"""Repairs to the parts kit (shared/data/creature-parts.json). Ids never change. Safe to run again.

1. Studded Leech: its parts were cut from a triangulated fill, so they had no outlines and drew as a solid
   bar. leech-recut.json gives each part one clean piece of the leech's rig drawing (outline and fill),
   in the same place on the sheet. Leech parts it does not list are retired: they keep their id and
   draw nothing, since the clean pieces cover them.
2. Frames: a part that is nothing but the sheet's own frame or card (one plain rectangle, 150 units or
   more) is marked "frame", and the catalogue hides it with the empty parts. A clip outline that leaked
   into a part's drawing as a visible box is removed.
3. Dangling masks: a mask or clip reference to an id the part does not define is removed (a nested
   reference lost when the sheets were cut). Browsers ignored it; other editors hid the shape.

4. Strays: a part that sits far outside its sheet and belongs to nothing (STRAYS) is retired like the
   leech's spare parts: it keeps its id and draws nothing.

    python3 shared/engine/creature-catalog/kit_repairs.py
    node shared/engine/creature-catalog/analyse.cjs && python3 shared/engine/creature-catalog/build.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
PARTS_FILE = os.path.join(ROOT, "shared", "data", "creature-parts.json")
TOKEN = re.compile(r"[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?")
FILL, LINE, WEIGHT = "#2b4a3e", "#5fd38d", 0.6   # the leech's own fill, the kit's line colour; a fine line for small parts


def move(d, f):
    out, nums, pts = [], [], []
    def flush():
        for i in range(0, len(nums), 2):
            x, y = f(nums[i], nums[i + 1]); pts.append((x, y)); out.append(f"{x:.2f} {y:.2f}")
        nums.clear()
    for t in TOKEN.findall(d):
        if t in "MLCZ": flush(); out.append(t)
        else: nums.append(float(t))
    flush()
    return " ".join(out), pts


def leech(parts):
    spec = json.load(open(os.path.join(HERE, "leech-recut.json")))
    src = re.findall(r'\sd="([^"]+)"', open(os.path.join(ROOT, spec["source"])).read())
    k, dx, dy = spec["scale"], spec["dx"], spec["dy"]
    f = lambda x, y: (dx + k * x, dy + k * y)
    by_id = {p["id"]: p for p in parts}
    listed = set()
    for piece in spec["pieces"]:
        p = by_id[piece["part"]]; listed.add(p["id"])
        ds, pts = [], []
        for i in piece["paths"]:
            d, q = move(src[i], f); ds.append(d); pts += q
        xs, ys = [x for x, _ in pts], [y for _, y in pts]
        ox = 200.0 if piece["side"] == "center" else round((min(xs) + max(xs)) / 2, 1)
        oy = round((min(ys) + max(ys)) / 2, 1)
        w, h = round(max(xs) - min(xs), 1), round(max(ys) - min(ys), 1)
        band = max(h * 0.15, 2)
        top = [abs(x - ox) for x, y in pts if y <= min(ys) + band]
        bot = [abs(x - ox) for x, y in pts if y >= max(ys) - band]
        body = "".join(f'<path d="{d}" fill="{FILL}" stroke="{LINE}" stroke-width="{WEIGHT}" stroke-linejoin="round"/>' for d in ds)
        p.update({"side": piece["side"], "ox": ox, "oy": oy, "w": w, "h": h, "tw": round(2 * max(top), 1), "bw": round(2 * max(bot), 1),
                  "svg": f'<g transform="translate({-ox:.1f} {-oy:.1f})">{body}</g>', "defs": "", "feature": piece["what"].split()[0], "from": f'{os.path.basename(spec["source"])}#{piece["what"]}'})
    retired = 0
    for p in parts:
        if p["species"] == "sheet-studded-leech" and p["id"] not in listed and not p.get("retired"):
            p.update({"svg": "<g></g>", "defs": "", "retired": True}); retired += 1
    return len(listed), retired


def frames(parts):
    marked = leaked = 0
    for p in parts:
        ds = re.findall(r'\sd="([^"]+)"', p["svg"])
        if len(ds) == 1 and max(float(p["w"]), float(p["h"])) >= 150:
            v = [float(x) for x in re.findall(r"-?\d*\.?\d+", ds[0])]
            if len(v) <= 40 and len({round(x) for x in v[0::2]}) <= 6 and len({round(y) for y in v[1::2]}) <= 6:
                if not p.get("frame"): marked += 1
                p["frame"] = True
        p["svg"], n = re.subn(r'<path id="clip-path[^"]*"[^>]*/>', "", p["svg"]); leaked += n
    return marked, leaked


def masks(parts):
    n = 0
    for p in parts:
        have = set(re.findall(r'\sid="([^"]+)"', p["defs"]))
        def drop(m):
            nonlocal n
            if m.group(2) in have: return m.group(0)
            n += 1; return ""
        for key in ("svg", "defs"):
            p[key] = re.sub(r'\s(mask|clip-path)="url\(#([^)]+)\)"', drop, p[key])
    return n


STRAYS = ["P083"]   # Chain Colony: a small claw 475 units left of the sheet, attached to nothing


def strays(parts):
    n = 0
    for p in parts:
        if p["id"] in STRAYS and not p.get("retired"):
            p.update({"svg": "<g></g>", "defs": "", "retired": True}); n += 1
    return n


def main():
    parts = json.load(open(PARTS_FILE))
    a, r = leech(parts); fr, lk = frames(parts); m = masks(parts); st = strays(parts)
    with open(PARTS_FILE, "w") as fh: json.dump(parts, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"leech: {a} parts redrawn, {r} retired; frames marked: {fr}; leaked clip outlines removed: {lk}; dangling mask references removed: {m}; strays retired: {st}")


main()
