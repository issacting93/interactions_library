"""Shared by the kit-candidate tools: the kit's parts with their catalogue facts, and drawing a recipe (Bestiary Forge's plan format,
the one packages/kit/data/kit-creatures.json uses) as lines. Geometry comes from world/forges/fish-tool/compose-kit-creature.py."""
import os, json, math, importlib.util
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
DATA = os.path.join(ROOT, "packages/kit/data")
_spec = importlib.util.spec_from_file_location("compose", os.path.join(ROOT, "world/forges/fish-tool/compose-kit-creature.py"))
compose = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(compose)
PARTS = compose.PARTS
CAT = json.load(open(os.path.join(DATA, "creature-catalog.json")))
f1 = lambda v: ("%.1f" % v).rstrip("0").rstrip(".")

def info(pid):
    """what the catalogue says of a part, with its size: { id, feature, side (C or L), hidden, drawing, sheet, w, h, name }"""
    p = PARTS[pid]; c = CAT["parts"][pid]
    return {"id": pid, "feature": c["feature"], "side": "C" if p["side"] == "center" else "L", "hidden": c.get("hidden"), "drawing": c.get("drawing", pid),
            "sheet": p["species"], "w": p["w"], "h": p["h"], "ox": p["ox"], "oy": p["oy"], "name": c.get("name", pid)}

def shown():
    """one part a drawing: every part that draws something, repeats of the same drawing left out"""
    seen = set(); out = []
    for pid in PARTS:
        i = info(pid)
        if i["hidden"] or i["drawing"] in seen: continue
        seen.add(i["drawing"]); out.append(i)
    return out

def path_d(recipe, k=1, ox=0, oy=0):
    """a recipe's lines as SVG path data, scaled by k and moved by ox, oy"""
    t = lambda q: f1(q[0] * k + ox) + " " + f1(q[1] * k + oy)
    return ["M" + t(s["start"]) + "".join(g[0] + " ".join(t(q) for q in g[1:]) for g in s["segs"]) + ("Z" if s["closed"] else "") for s in compose.lines(recipe)]

def bounds(recipe):
    P = [q for s in compose.lines(recipe) for q in [s["start"]] + [v for g in s["segs"] for v in g[1:]]]
    return min(x for x, _ in P), min(y for _, y in P), max(x for x, _ in P), max(y for _, y in P)
