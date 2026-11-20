"""Add whole new creatures to the parts kit as sheets (shared/data/creature-parts.json), from added-sheets.json.

Each source drawing is fitted onto a kit sheet (centre line x = 200, at most 380 wide and 500 tall, top at y = 40) and every named
part group in it becomes one kit part: where it sits, its size, the widths of its top and bottom edges, and its drawing as a 1 px
line. Part ids are handed out after the kit's last and remembered in added-sheets.json, so running this again changes nothing.
Then: node analyse.cjs && python3 build.py (build.py needs a SHEETS line for each new sheet).

    python3 shared/engine/creature-catalog/add_sheets.py
"""
import json, os, re
import xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "..", "..", "data"); NS = "{http://www.w3.org/2000/svg}"
SPEC = json.load(open(os.path.join(HERE, "added-sheets.json"))); PARTS = json.load(open(os.path.join(DATA, "creature-parts.json")))
nums = lambda d: [float(x) for x in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", d)]
f1 = lambda v: ("%.1f" % v).rstrip("0").rstrip(".")
def place(d, k, dx, dy):
    out = ""
    for cmd, rest in re.findall(r"([MLCZ])([^MLCZ]*)", d):
        n = nums(rest); out += cmd + " ".join(f1(n[i] * k + dx) + " " + f1(n[i + 1] * k + dy) for i in range(0, len(n) - 1, 2))
    return out
nxt = max(int(p["id"][1:]) for p in PARTS if re.fullmatch(r"P\d+", p["id"])) + 1; have = {p["id"] for p in PARTS}; added = 0
for sh in SPEC["sheets"]:
    root = ET.parse(os.path.join(DATA, sh["source"])).getroot(); groups = [g for g in root.iter(NS + "g") if g.get("data-side")]
    allpts = [v for g in groups for p in g.iter(NS + "path") for v in [nums(p.get("d"))]]; xs = [x for n in allpts for x in n[0::2]]; ys = [y for n in allpts for y in n[1::2]]
    X0, X1, Y0, Y1 = min(xs), max(xs), min(ys), max(ys); k = min(380 / (X1 - X0), 500 / (Y1 - Y0)); cx = (X0 + X1) / 2; dx = 200 - cx * k; dy = 40 - Y0 * k
    if sh.get("loose"): k, dx, dy = 1, 0, 0      # a sheet of separate parts, not a creature: taken as drawn (centre parts on x = 200), not fitted as one figure
    for g in groups:
        key = sh["sheet"] + "/" + g.get("id"); own = [place(p.get("d"), k, dx, dy) for p in g if p.tag == NS + "path"]
        n = [nums(d) for d in own]; px = [x for q in n for x in q[0::2]]; py = [y for q in n for y in q[1::2]]; x0, x1, y0, y1 = min(px), max(px), min(py), max(py); w, h = x1 - x0, y1 - y0
        edge = lambda lo, hi: (lambda e: (max(e) - min(e)) if e else w)([x for x, y in zip(px, py) if lo <= y <= hi])
        side = "center" if g.get("data-side") == "C" else "left"; ox = 200 if side == "center" else (x0 + x1) / 2; oy = (y0 + y1) / 2
        pid = SPEC["ids"].get(key)
        if not pid: pid = "P%03d" % nxt; nxt += 1; SPEC["ids"][key] = pid
        part = {"species": sh["sheet"], "side": side, "tw": round(edge(y0, y0 + 0.12 * h), 1), "bw": round(edge(y1 - 0.12 * h, y1), 1), "w": round(w, 1), "h": round(h, 1), "ox": round(ox, 1), "oy": round(oy, 1),
                "svg": '<g transform="translate(-%s -%s)">%s</g>' % (f1(round(ox, 1)), f1(round(oy, 1)), "".join('<path d="%s" fill="none" stroke="#5fd38d" stroke-linejoin="round" stroke-width="1" vector-effect="non-scaling-stroke"/>' % d for d in own)),
                "defs": "", "id": pid, "from": os.path.basename(sh["source"]) + "#" + g.get("id")}
        if pid in have: PARTS[[p["id"] for p in PARTS].index(pid)] = part
        else: PARTS.append(part); have.add(pid); added += 1
    print("%-26s %2d parts  scale %.3f" % (sh["sheet"], len(groups), k))
json.dump(PARTS, open(os.path.join(DATA, "creature-parts.json"), "w"), ensure_ascii=False, separators=(",", ":"))
json.dump(SPEC, open(os.path.join(HERE, "added-sheets.json"), "w"), indent=1)
print(added, "parts added; the kit has", len(PARTS))
