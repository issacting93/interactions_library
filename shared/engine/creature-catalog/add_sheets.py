"""Cut whole kit sheets from rig drawings (see new-sheets.json for the rules), under new part ids.

For swimmers that live in the ecology but had no parts in the kit. Running it again redraws the same ids
and removes any part of these sheets that the drawing no longer has.

    python3 shared/engine/creature-catalog/add_sheets.py
    node shared/engine/creature-catalog/analyse.cjs && python3 shared/engine/creature-catalog/build.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
PARTS_FILE = os.path.join(ROOT, "shared", "data", "creature-parts.json")
NUM = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")
TOKEN = re.compile(r"[MLZ]|-?\d*\.?\d+(?:e-?\d+)?")
SPEC = json.load(open(os.path.join(HERE, "new-sheets.json")))


def read(path):
    out = []
    for m in re.finditer(r"<path\b([^>]*)>", open(path).read()):
        a = m.group(1); d = re.search(r'\sd="([^"]+)"', a).group(1)
        if re.search(r"[A-KN-Ya-z]", d): raise SystemExit(f"{path}: paths must use absolute M L Z only")
        n = [float(x) for x in NUM.findall(d)]
        pid = re.search(r'\sid="([^"]+)"', a); sw = re.search(r'stroke-width="([^"]+)"', a)
        out.append({"d": d, "id": pid.group(1) if pid else "", "sw": float(sw.group(1)) if sw else 1,
                    "box": [min(n[0::2]), min(n[1::2]), max(n[0::2]), max(n[1::2])]})
    return out


def sides(paths):
    """centre / left / dropped right twin, per the rules in new-sheets.json"""
    for p in paths:
        x0, _, x1, _ = p["box"]; p["mid"] = (x0 + x1) / 2; p["wd"] = x1 - x0
        p["side"] = "center" if abs(p["mid"]) < 0.06 * p["wd"] else ("left" if p["mid"] < 0 else "right")
    lefts = [p for p in paths if p["side"] == "left"]
    for r in [p for p in paths if p["side"] == "right"]:
        tol = 0.08 * r["wd"]
        twin = next((l for l in lefts if not l.get("twin") and abs(l["box"][0] + r["box"][2]) < tol and abs(l["box"][2] + r["box"][0]) < tol
                     and abs(l["box"][1] - r["box"][1]) < tol and abs(l["box"][3] - r["box"][3]) < tol), None)
        if twin: twin["twin"] = True; r["side"] = "drop"
        else: r["side"] = "alone"
    for l in lefts:
        if not l.get("twin"): l["side"] = "alone"
    return [p for p in paths if p["side"] != "drop"]


def feature(sheet, p, side, w, h):
    f = None
    for word, name in sheet.get("names", {}).items():
        if f"-{word}" in p["id"]: f = name
    f = f or sheet.get("by_side", {}).get(side) or ("segment" if side == "center" else "fin")
    if f in sheet.get("big", {}) and max(w, h) >= sheet["big"][f][1]: f = sheet["big"][f][0]
    if side in sheet.get("thin", {}) and w < sheet["thin"][side][1] * h: f = sheet["thin"][side][0]
    return f


def main():
    parts = json.load(open(PARTS_FILE))
    keys = {s["species"] for s in SPEC["sheets"]}
    parts = [p for p in parts if p["species"] not in keys]
    taken = {p["id"] for p in parts}; report = []
    for sheet in SPEC["sheets"]:
        paths = sides(read(os.path.join(ROOT, sheet["source"])))
        x0 = min(p["box"][0] for p in paths); x1 = max(p["box"][2] for p in paths)
        y0 = min(p["box"][1] for p in paths); y1 = max(p["box"][3] for p in paths)
        k = min(392 / (2 * max(-x0, x1)), 392 / (y1 - y0)); cy = (y0 + y1) / 2
        weight = min(max(paths[0]["sw"] * k, SPEC["weight"]["min"]), SPEC["weight"]["max"])
        n = sheet["first"]
        for p in paths:
            pts = []; out = []; nums = []
            for t in TOKEN.findall(p["d"]):
                if t in "MLZ": out.append(t)
                else:
                    nums.append(float(t))
                    if len(nums) == 2:
                        x, y = 200 + k * nums[0], 200 + k * (nums[1] - cy); pts.append((x, y)); out.append(f"{x:.2f} {y:.2f}"); nums = []
            xs = [x for x, _ in pts]; ys = [y for _, y in pts]
            side = "left" if p["side"] == "left" else "center"
            ox = 200.0 if side == "center" else round((min(xs) + max(xs)) / 2, 1)
            oy = round((min(ys) + max(ys)) / 2, 1)
            w, h = round(max(xs) - min(xs), 1), round(max(ys) - min(ys), 1)
            band = max(h * 0.15, 2)
            top = [abs(x - ox) for x, y in pts if y <= min(ys) + band]; bot = [abs(x - ox) for x, y in pts if y >= max(ys) - band]
            pid = f"P{n}"; n += 1
            if pid in taken: raise SystemExit(f"{pid} is already in the kit; move 'first' for {sheet['species']}")
            taken.add(pid)
            parts.append({"species": sheet["species"], "side": side, "ox": ox, "oy": oy, "w": w, "h": h,
                          "tw": round(2 * max(top), 1), "bw": round(2 * max(bot), 1),
                          "svg": f'<g transform="translate({-ox:.1f} {-oy:.1f})"><path d="{" ".join(out)}" fill="{sheet["fill"]}" stroke="{SPEC["stroke"]}" stroke-width="{weight:.2f}" stroke-linejoin="round"/></g>',
                          "defs": "", "id": pid, "feature": feature(sheet, p, side, w, h),
                          "from": f'{os.path.basename(sheet["source"])}#{p["id"] or len(report)}', "added": True})
        report.append(f'{sheet["species"]}: P{sheet["first"]}..P{n - 1} ({n - sheet["first"]} parts, line {weight:.2f})')
    with open(PARTS_FILE, "w") as fh: json.dump(parts, fh, ensure_ascii=False, separators=(",", ":"))
    print("\n".join(report))


main()
