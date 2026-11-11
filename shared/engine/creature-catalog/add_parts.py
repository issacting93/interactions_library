"""Add hand-drawn parts to the kit (shared/data/creature-parts.json) under new ids.

new-parts.json lists each part: its id, species, side, what to call it (feature), and which path of which drawing it is. The path
is kept where it sits on the 400 x 400 sheet (the part's origin is the middle of its box; a centre part
sits on x = 200), drawn as a line in the kit's colour and weight. Running it again redraws the same ids.

    python3 shared/engine/creature-catalog/add_parts.py
    node shared/engine/creature-catalog/analyse.cjs && python3 shared/engine/creature-catalog/build.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
PARTS_FILE = os.path.join(ROOT, "shared", "data", "creature-parts.json")
NUM = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")


def main():
    spec = json.load(open(os.path.join(HERE, "new-parts.json")))
    parts = json.load(open(PARTS_FILE)); by_id = {p["id"]: p for p in parts}
    cache = {}
    for a in spec["parts"]:
        if a["source"] not in cache: cache[a["source"]] = re.findall(r'\sd="([^"]+)"', open(os.path.join(ROOT, a["source"])).read())
        d = " ".join(cache[a["source"]][a["path"]].split())
        if re.search(r"[A-BD-KN-Ya-z]", d): raise SystemExit(f'{a["id"]}: path must use absolute M L C Z only')
        n = [float(x) for x in NUM.findall(d)]; xs, ys = n[0::2], n[1::2]
        ox = 200.0 if a["side"] == "center" else round((min(xs) + max(xs)) / 2, 1)
        oy = round((min(ys) + max(ys)) / 2, 1)
        w, h = round(max(xs) - min(xs), 1), round(max(ys) - min(ys), 1)
        band = max(h * 0.15, 2)
        top = [abs(x - ox) for x, y in zip(xs, ys) if y <= min(ys) + band]
        bot = [abs(x - ox) for x, y in zip(xs, ys) if y >= max(ys) - band]
        rec = {"species": a["species"], "side": a["side"], "ox": ox, "oy": oy, "w": w, "h": h,
               "tw": round(2 * max(top), 1), "bw": round(2 * max(bot), 1),
               "svg": f'<g transform="translate({-ox:.1f} {-oy:.1f})"><path d="{d}" fill="none" stroke="#5fd38d" stroke-width="{spec["weight"]}" stroke-linejoin="round"/></g>',
               "defs": "", "id": a["id"], "feature": a.get("feature", "body" if a["side"] == "center" else "leg"), "from": f'{os.path.basename(a["source"])}#{a["what"]}', "added": True}
        if a["id"] in by_id: by_id[a["id"]].clear(); by_id[a["id"]].update(rec)
        else: parts.append(rec); by_id[a["id"]] = rec
    with open(PARTS_FILE, "w") as fh: json.dump(parts, fh, ensure_ascii=False, separators=(",", ":"))
    print(f'{len(spec["parts"])} parts added or redrawn: ' + ", ".join(a["id"] for a in spec["parts"]))


main()
