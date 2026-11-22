#!/usr/bin/env python3
"""New creatures put together from kit parts, without adding anything to the kit.
  python3 world/forges/fish-tool/compose-kit-creature.py [out-dir]     (default: world/forges/fish-tool/exports/kit-creatures)
Reads packages/kit/data/kit-creatures.json: each creature is a name and a list of placements in paint order, in Bestiary Forge's own
plan format on a 400-wide canvas with the centre line at x = 200:
  {"part": "P707", "x": 150, "y": 210, "scale": 0.9, "rotate": -20, "flipY": false}     a part, its centre at x, y (centre parts sit on x = 200)
  {"array": "P290", "cx": 200, "cy": 150, "count": 3, "radius": 70, "from": -120, "to": -40, "spin": 0, "scale": 1, "taper": -0.3}     a fan of one left part
  {"ring": "P672", "cx": 200, "cy": 300, "count": 8, "radius": 60, "from": 0, "to": 360, "spin": 90, "scale": 0.5}     copies of any part round a centre, not mirrored
  {"part": "P707", "x": 120, "y": 90, "free": true}     a part put exactly there, off the centre line if it likes, and not mirrored
Left parts are mirrored to the right. A creature is a recipe of part ids, so the kit gets no new ids and no copied drawings.
  python3 world/forges/fish-tool/compose-kit-creature.py plants     the plants instead (packages/kit/data/kit-plants.json -> exports/kit-plants)
Writes one 1 px line SVG a creature, at the same size and style as the kit set (exports/kit-svg)."""
import sys, os, json, math, importlib.util
import xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "../../../packages/kit/data")
spec = importlib.util.spec_from_file_location("kit", os.path.join(HERE, "export-kit-svg.py")); kit = importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
f1 = lambda v: ("%.1f" % v).rstrip("0").rstrip(".")
PARTS = {p["id"]: p for p in json.load(open(os.path.join(DATA, "creature-parts.json")))}
_cache = {}
def subs(pid):
    if pid not in _cache:
        acc = []; kit.walk(ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + PARTS[pid]["svg"] + "</svg>"), (1, 0, 0, 1, 0, 0), acc); _cache[pid] = acc
    return _cache[pid]
def placements(recipe):
    for pl in recipe["parts"]:
        if "array" in pl:
            n = pl["count"]
            for i in range(n):
                t = i / (n - 1) if n > 1 else 0.5; a = pl["from"] + (pl["to"] - pl["from"]) * t; r = math.radians(a)
                yield {"part": pl["array"], "x": pl["cx"] + pl["radius"] * math.sin(r), "y": pl["cy"] - pl["radius"] * math.cos(r), "scale": pl.get("scale", 1) * (1 + pl.get("taper", 0) * t), "rotate": a + pl.get("spin", 0), "flipY": pl.get("flipY", False)}
        elif "ring" in pl:
            n = pl["count"]; a0 = pl.get("from", 0); a1 = pl.get("to", 360); full = abs(a1 - a0) >= 360
            for i in range(n):
                t = i / n if full else (i / (n - 1) if n > 1 else 0.5); a = a0 + (a1 - a0) * t; r = math.radians(a)
                yield {"part": pl["ring"], "x": pl["cx"] + pl["radius"] * math.sin(r), "y": pl["cy"] - pl["radius"] * math.cos(r), "scale": pl.get("scale", 1) * (1 + pl.get("taper", 0) * t), "rotate": a + pl.get("spin", 0), "flipY": pl.get("flipY", False), "free": True}
        else: yield pl
def lines(recipe):
    """every line of the creature as (points-with-curves, closed) in canvas units"""
    out = []
    for pl in placements(recipe):
        p = PARTS[pl["part"]]; s = pl.get("scale", 1); fy = -1 if pl.get("flipY") else 1; a = math.radians(pl.get("rotate", 0)); c, sn = math.cos(a), math.sin(a)
        free = bool(pl.get("free")); x0 = pl["x"] if free else 200 if p["side"] == "center" else pl["x"]; y0 = pl["y"]
        def tf(q, mx=1): X, Y = q[0] * s, q[1] * s * fy; X, Y = X * c - Y * sn, X * sn + Y * c; X += x0; return (X if mx > 0 else 400 - X, Y + y0)
        for mx in ((1,) if free or p["side"] == "center" else (1, -1)):
            for sub in subs(pl["part"]):
                out.append({"start": tf(sub["start"], mx), "segs": [(g[0],) + tuple(tf(q, mx) for q in g[1:]) for g in sub["segs"]], "closed": sub["closed"]})
    return out
def write(recipe, path, size=1024, pad=16):
    L = lines(recipe); P = [q for s in L for q in [s["start"]] + [v for g in s["segs"] for v in g[1:]]]
    x0, x1, y0, y1 = min(x for x, _ in P), max(x for x, _ in P), min(y for _, y in P), max(y for _, y in P); x0, x1 = min(x0, 400 - x1), max(x1, 400 - x0)
    k = (size - 2 * pad) / max(x1 - x0, y1 - y0); ox = (size - (x1 - x0) * k) / 2 - x0 * k; oy = (size - (y1 - y0) * k) / 2 - y0 * k; t = lambda q: f1(q[0] * k + ox) + " " + f1(q[1] * k + oy)
    d = ["M" + t(s["start"]) + "".join(g[0] + " ".join(t(q) for q in g[1:]) for g in s["segs"]) + ("Z" if s["closed"] else "") for s in L]
    open(path, "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">\n<title>%s</title>\n<g fill="none" stroke="#000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">\n%s\n</g>\n</svg>\n'
                          % (size, size, size, size, recipe["name"], "\n".join('<path vector-effect="non-scaling-stroke" d="%s"/>' % x for x in d)))
    return len(d)
if __name__ == "__main__":
    plants = "plants" in sys.argv[1:]; args = [a for a in sys.argv[1:] if a != "plants"]
    out = os.path.abspath(args[0] if args else os.path.join(HERE, "exports/kit-plants" if plants else "exports/kit-creatures")); os.makedirs(out, exist_ok=True)
    for r in json.load(open(os.path.join(DATA, "kit-plants.json" if plants else "kit-creatures.json")))["plants" if plants else "creatures"]:
        n = write(r, os.path.join(out, r["key"] + ".svg")); ids = sorted({pl.get("part") or pl.get("array") or pl["ring"] for pl in r["parts"]})
        print("%-22s %3d lines from %2d kit parts" % (r["name"], n, len(ids)))
