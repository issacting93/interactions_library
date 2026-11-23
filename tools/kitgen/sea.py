#!/usr/bin/env python3
"""Fifty sea creatures (fishes, sharks, whales) laid out in Bestiary Forge's own format, by rule.

  python3 tools/kitgen/sea.py            write packages/kit/data/kit-sea.json (layouts in Bestiary Forge's format) and render the sheet
  python3 tools/kitgen/sea.py explore    run every plan over many seeds and write the best of each to /tmp/sea-explore.json

Bestiary Forge (world/forges/bestiary-forge) lays a creature out as a list of placements: centre parts on the spine at x = 200 (turned 0 or 180
only), left parts on the left half (mirrored to the right by the page), and fans of a left part round a centre ({"array": ...}). This writes
exactly that, so every layout here opens in the forge unchanged; tools/kitgen/forge-render.mjs draws them with the forge's own assemble().

Each layout is also turned into a kit recipe (fans expanded, left parts mirrored) and measured against the designed species (measure.py, the
round-two gate), and the picks are the nearest to the designed species' grammar among the seeds that pass.
"""
import sys, os, json, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import DATA, PARTS, CAT
from candidates import W, H, BAR, WING, BLADE, HEAD, RING, SPEAR, RIB
import round2 as R2
from round2 import MASS, LONG, END, FLOAT, FAMS, RIBS, passes, score, GATE
from round3 import reach
import measure as M

EYES = "P505 P507 P071 P073 P106 P132 P162 P221".split()          # small round left parts: a pair of eyes
for _p in EYES: assert PARTS[_p]["side"] == "left", _p
FIN = BLADE + WING[22:]                                            # small and middling fins
BIGFIN = WING                                                      # the large side parts: pectoral wings, flukes

class F:
    """a layout in Bestiary Forge's format"""
    def __init__(self): self.pl = []
    def C(self, pid, y, s, turn=False):
        assert PARTS[pid]["side"] == "center", pid; p = {"part": pid, "x": 200, "y": round(y, 1), "scale": round(s, 3)}
        if turn: p["rotate"] = 180
        self.pl.append(p); return p
    def L(self, pid, x, y, s, rot=0, flipY=False):
        assert PARTS[pid]["side"] == "left", pid; p = {"part": pid, "x": round(min(x, 230), 1), "y": round(y, 1), "scale": round(s, 3), "rotate": round(((rot + 180) % 360) - 180, 1)}
        if flipY: p["flipY"] = True
        self.pl.append(p); return p
    def fin(self, pid, x, y, h, length):
        """a left part with its root at x, y, reaching `length` in heading h (0 down, 90 out to the left, 180 up)"""
        r, h0 = reach(pid); s = max(0.15, min(5, length / r)); rx, ry = R2.root(pid); a = math.radians(h - h0)
        return self.L(pid, x - s * (rx * math.cos(a) - ry * math.sin(a)), y - s * (rx * math.sin(a) + ry * math.cos(a)), s, h - h0)
    def fan(self, pid, cx, cy, count, radius, a0, a1, spin=0, scale=1, taper=0):
        self.pl.append({"array": pid, "cx": round(cx, 1), "cy": round(cy, 1), "count": count, "radius": round(radius, 1), "from": round(a0, 1), "to": round(a1, 1), "spin": round(spin, 1), "scale": round(scale, 3), "taper": taper})
    def spine(self, pids, y, w0, w1, lap=0.72, turn=False):
        """centre parts down the spine from y, widths running w0 to w1, each overlapping the last; returns where it ended"""
        n = len(pids)
        for i, pid in enumerate(pids):
            s = (w0 + (w1 - w0) * i / max(1, n - 1)) / W(pid); h = H(pid, s); self.C(pid, y + h / 2, s, turn); y += h * lap
        return y
    def body(self, pid, top, width):
        s = width / W(pid); h = H(pid, s); self.C(pid, top + h / 2, s); return {"top": top, "bot": top + h, "h": h, "w": width, "cy": top + h / 2}
    def eyes(self, R, y, dx, size):
        e = R.choice(EYES); self.L(e, 200 - dx, y, size / max(W(e), H(e)))

def expand(pl):
    """Bestiary Forge's expand(): a fan becomes its copies"""
    out = []
    for p in pl:
        if "array" not in p: out.append(p); continue
        n = p["count"]
        for i in range(n):
            t = 0.5 if n == 1 else i / (n - 1); th = p["from"] + (p["to"] - p["from"]) * t; rad = math.radians(th); s = p["scale"] * (1 + p.get("taper", 0) * (t - 0.5))
            out.append({"part": p["array"], "x": p["cx"] + p["radius"] * math.sin(rad), "y": p["cy"] - p["radius"] * math.cos(rad), "rotate": th + p.get("spin", 0), "scale": s})
    return out
def to_recipe(pl):
    """the layout as a kit recipe (every placement free, left parts with their mirror image), for measure.py and the kit sheet"""
    parts = []
    for p in expand(pl):
        c = PARTS[p["part"]]["side"] == "center"; q = {"part": p["part"], "x": 200 if c else p["x"], "y": p["y"], "scale": p["scale"], "free": True}
        rot = (180 if abs(((p.get("rotate", 0) % 360) + 360) % 360 - 180) < 1 else 0) if c else p.get("rotate", 0)
        if rot: q["rotate"] = rot
        if p.get("flipY"): q["flipY"] = True
        parts.append(q)
        if not c:
            m = dict(q); m["x"] = 400 - q["x"]; m["rotate"] = 180 - q.get("rotate", 0)
            if q.get("flipY"): m.pop("flipY")
            else: m["flipY"] = True
            parts.append(m)
    return {"parts": parts}

def fam(R, n, fams=FAMS):
    f = list(R.choice(fams)); R.shuffle(f); return [f[i % len(f)] for i in range(n)]

def fork_tail(f, R, y, w, n=3, spread=(16, 34), length=1.0):
    """a fish's tail: a short shrinking run, then two lobes"""
    y = f.spine(fam(R, n), y, w * 0.26, w * 0.16, 0.7); a, b = spread; lobe = fam(R, 2, RIBS + [BLADE[:20]])
    f.fin(lobe[0], 198, y - 8, a, w * 0.75 * length); f.fin(lobe[1], 198, y - 4, b, w * 0.5 * length); return y
def flukes(f, R, y, w, span):
    """a whale's tail: a long run narrowing to the stock, then two broad flukes held flat"""
    y = f.spine(fam(R, 4), y, w * 0.3, w * 0.14, 0.7); fl = R.choice(BIGFIN); f.fin(fl, 198, y - 6, R.uniform(70, 86), span)
    f.fin(R.choice(BLADE[:20]), 198, y - 2, R.uniform(30, 45), span * 0.45); return y

# ---------- fishes ----------
def minnow(R):
    """a spindle: small head, long body, pectorals behind the head, a pelvic pair, a forked tail"""
    f = F(); w = R.uniform(68, 84); m = f.body(R.choice(LONG), 92, w); f.eyes(R, m["top"] + m["h"] * 0.12, w * 0.24, w * 0.16)
    f.fin(R.choice(FIN), 200 - w * 0.36, m["top"] + m["h"] * 0.3, R.uniform(60, 80), w * R.uniform(0.9, 1.2)); f.fin(R.choice(BLADE), 200 - w * 0.3, m["top"] + m["h"] * 0.72, R.uniform(30, 50), w * 0.6)
    f.C(R.choice(RING[:2]), m["top"] + m["h"] * 0.45, w * 0.34 / W(RING[0])); hp = R.choice(HEAD); f.C(hp, m["top"] + 4, w * 0.7 / W(hp))
    fork_tail(f, R, m["bot"] - m["h"] * 0.1, w); return f
def lionfish(R):
    """a body under a mane: fans of long spines on both flanks, a striped tail"""
    f = F(); w = R.uniform(90, 110); m = f.body(R.choice(MASS), 120, w); rib = R.choice(RIBS)
    f.fan(rib[0], 200 - w * 0.2, m["cy"] - 6, R.randint(4, 5), w * 0.38, -150, -40, R.uniform(-90, -60), R.uniform(1.4, 2.0), -0.4)
    f.fan(rib[1], 200 - w * 0.2, m["cy"] + m["h"] * 0.2, 3, w * 0.3, -130, -80, R.uniform(-90, -60), R.uniform(1.0, 1.4), -0.3)
    hp = R.choice(HEAD); f.C(hp, m["top"] + 6, w * 0.6 / W(hp)); f.eyes(R, m["top"] + 8, w * 0.2, w * 0.14); f.C(R.choice(RING[:2]), m["cy"], w * 0.3 / W(RING[0]))
    fork_tail(f, R, m["bot"] - m["h"] * 0.1, w * 0.8, n=4); return f
def angler(R):
    """a round body that is mostly mouth, a lure on a stalk over the head, small fins"""
    f = F(); w = R.uniform(130, 150); m = f.body(R.choice(MASS + FLOAT), 160, w); hp = R.choice(HEAD + BAR[:4]); f.C(hp, m["top"] + m["h"] * 0.3, w * 0.8 / W(hp))
    f.eyes(R, m["top"] + m["h"] * 0.2, w * 0.26, w * 0.12); y = f.spine(fam(R, 4), m["top"] + 6, w * 0.12, w * 0.08, 0.72, turn=True) if False else None
    y = m["top"] + 6; ws = w * 0.12
    for seg in fam(R, 4): s = ws / W(seg); h = H(seg, s); f.C(seg, y - h / 2, s, True); y -= h * 0.72; ws *= 0.9
    lure = R.choice(RING[:2] + ["P235", "P274"]); f.C(lure, y - 10, w * 0.2 / W(lure))
    f.fin(R.choice(FIN), 200 - w * 0.42, m["cy"] + 10, R.uniform(50, 70), w * 0.5); f.fin(R.choice(BLADE), 200 - w * 0.3, m["bot"] - 10, R.uniform(20, 40), w * 0.4)
    f.spine(fam(R, 3), m["bot"] - m["h"] * 0.12, w * 0.24, w * 0.16); return f
def flyingfish(R):
    """a slim body and two great pectoral wings held out, a second smaller pair behind"""
    f = F(); w = R.uniform(64, 78); m = f.body(R.choice(LONG), 110, w); hp = R.choice(HEAD); f.C(hp, m["top"] + 4, w * 0.7 / W(hp)); f.eyes(R, m["top"] + 8, w * 0.22, w * 0.15)
    f.fin(R.choice(BIGFIN), 200 - w * 0.3, m["top"] + m["h"] * 0.28, R.uniform(84, 104), R.uniform(150, 175)); f.fin(R.choice(FIN), 200 - w * 0.3, m["top"] + m["h"] * 0.78, R.uniform(50, 70), w * 1.0)
    f.C(R.choice(RING[:2]), m["top"] + m["h"] * 0.4, w * 0.36 / W(RING[0])); fork_tail(f, R, m["bot"] - m["h"] * 0.1, w, spread=(14, 28)); return f

# ---------- sharks ----------
def shark(R):
    """a pointed snout, a long tapering body, swept pectorals, a small pelvic pair, a long upper tail lobe"""
    f = F(); w = R.uniform(74, 90); sn = R.choice(SPEAR); ss = w * 0.62 / W(sn); top = 64
    f.C(sn, top + H(sn, ss) / 2, ss, True); m = f.body(R.choice(LONG + MASS[:6]), top + H(sn, ss) * 0.55, w); f.eyes(R, m["top"] + 8, w * 0.3, w * 0.12)
    f.fin(R.choice(BIGFIN[:20] + BLADE[:12]), 200 - w * 0.34, m["top"] + m["h"] * 0.42, R.uniform(30, 50), R.uniform(110, 140)); f.fin(R.choice(BLADE), 200 - w * 0.24, m["bot"] - 10, R.uniform(20, 36), w * 0.5)
    y = f.spine(fam(R, 4), m["bot"] - m["h"] * 0.12, w * 0.3, w * 0.14, 0.7); f.fin(R.choice(RIBS)[0], 198, y - 10, R.uniform(10, 18), w * 0.9); return f
def hammerhead(R):
    """a head that is a wide bar with the eyes at its ends"""
    f = F(); w = R.uniform(76, 90); bar = R.choice(BAR[:6] + ["P096", "P619"]); bs = w * 2.3 / W(bar); f.C(bar, 96, bs); f.eyes(R, 96, W(bar, bs) * 0.46, w * 0.16)
    m = f.body(R.choice(LONG + MASS[:6]), 96 + H(bar, bs) * 0.2, w); f.fin(R.choice(BIGFIN[:20] + BLADE[:12]), 200 - w * 0.34, m["top"] + m["h"] * 0.42, R.uniform(30, 50), R.uniform(110, 140))
    f.fin(R.choice(BLADE), 200 - w * 0.24, m["bot"] - 10, R.uniform(20, 36), w * 0.5); y = f.spine(fam(R, 4), m["bot"] - m["h"] * 0.12, w * 0.3, w * 0.14, 0.7); f.fin(R.choice(RIBS)[0], 198, y - 10, R.uniform(10, 18), w * 0.9); return f
def sawfish(R):
    """a long flat saw for a snout, teeth set along both its edges, wide pectorals at the shoulders"""
    f = F(); w = R.uniform(76, 92); saw = fam(R, 5); y = 34; ws = w * 0.2
    top = y
    for seg in saw: s = ws / W(seg); h = H(seg, s); f.C(seg, y + h / 2, s); y += h * 0.74; ws *= 1.08
    n = 5; teeth = fam(R, n, RIBS)                                  # kindred teeth, each drawn differently
    for i in range(n): f.fin(teeth[i], 200 - w * 0.06, top + 10 + (y - top - 20) * i / (n - 1), R.uniform(70, 100), w * 0.36)
    m = f.body(R.choice(LONG + MASS[:6]), y - 8, w); f.eyes(R, m["top"] + 10, w * 0.28, w * 0.13)
    f.fin(R.choice(BIGFIN), 200 - w * 0.36, m["top"] + m["h"] * 0.3, R.uniform(50, 70), R.uniform(110, 135)); fork_tail(f, R, m["bot"] - m["h"] * 0.1, w * 0.8, n=2); return f

# ---------- whales ----------
def baleen(R):
    """a long body, long pectoral flippers far forward, a narrow stock and wide flat flukes"""
    f = F(); w = R.uniform(84, 100); m = f.body(R.choice(LONG), 50, w); hp = R.choice(HEAD + BAR[:4]); f.C(hp, m["top"] + 6, w * 0.86 / W(hp)); f.eyes(R, m["top"] + m["h"] * 0.3, w * 0.42, w * 0.1)
    f.fin(R.choice(BLADE[:24] + RIB), 200 - w * 0.38, m["top"] + m["h"] * 0.42, R.uniform(30, 50), R.uniform(100, 150)); f.C(R.choice(RING[:2]), m["cy"] + 10, w * 0.3 / W(RING[0]))
    y = f.spine(fam(R, 2), m["bot"] - m["h"] * 0.12, w * 0.5, w * 0.4, 0.7); flukes(f, R, y - 6, w, R.uniform(110, 140)); return f
def sperm(R):
    """the great block head, a third of the whole, small flippers behind it, flukes"""
    f = F(); w = R.uniform(104, 122); hp = R.choice(MASS[:12] + BAR[:4]); m = f.body(hp, 50, w); f.eyes(R, m["bot"] - m["h"] * 0.18, w * 0.42, w * 0.1)
    b2 = R.choice(LONG); bs = w * 0.8 / W(b2); f.C(b2, m["bot"] + H(b2, bs) * 0.36, bs); f.fin(R.choice(BLADE), 200 - w * 0.3, m["bot"] + 10, R.uniform(40, 60), w * 0.5)
    flukes(f, R, m["bot"] + H(b2, bs) * 0.7, w * 0.8, R.uniform(100, 130)); return f
def narwhal(R):
    """a whale with one long tusk straight forward, small flippers, flukes"""
    f = F(); w = R.uniform(84, 98); tusk = fam(R, 5); y = 24; ws = w * 0.1
    for seg in tusk: s = ws / W(seg); h = H(seg, s); f.C(seg, y + h / 2, s); y += h * 0.8; ws *= 1.1
    m = f.body(R.choice(LONG + MASS[:8]), y - 10, w); hp = R.choice(HEAD); f.C(hp, m["top"] + 8, w * 0.7 / W(hp)); f.eyes(R, m["top"] + m["h"] * 0.24, w * 0.34, w * 0.11)
    f.fin(R.choice(BLADE), 200 - w * 0.36, m["top"] + m["h"] * 0.42, R.uniform(40, 60), w * 0.62); flukes(f, R, m["bot"] - m["h"] * 0.12, w * 0.8, R.uniform(96, 124)); return f

PLANS = [("minnow", "fish", "Minnows", "A spindle: small head, pectorals, a pelvic pair, a forked tail.", minnow),
         ("lionfish", "fish", "Lionfish", "A body under a mane of spines fanned on both flanks.", lionfish),
         ("angler", "fish", "Anglers", "A round body, mostly mouth, a lure on a stalk over the head.", angler),
         ("flyingfish", "fish", "Flying fish", "A slim body with two great pectoral wings held out.", flyingfish),
         ("shark", "shark", "Sharks", "Pointed snout, tapering body, swept pectorals, a long upper tail lobe.", shark),
         ("hammerhead", "shark", "Hammerheads", "A head that is a wide bar, the eyes at its ends.", hammerhead),
         ("sawfish", "shark", "Sawfish", "A long saw for a snout, teeth along both edges.", sawfish),
         ("baleen", "whale", "Great whales", "A long body, long flippers forward, wide flat flukes.", baleen),
         ("sperm", "whale", "Block-heads", "A great block head a third of the whole, small flippers, flukes.", sperm),
         ("narwhal", "whale", "Narwhals", "A whale with one long tusk held straight forward.", narwhal)]
FN = {p[0]: p[4] for p in PLANS}
NOUN = {"minnow": "minnow", "lionfish": "lionfish", "angler": "angler", "flyingfish": "flyer", "shark": "shark", "hammerhead": "hammerhead", "sawfish": "sawfish", "baleen": "whale", "sperm": "sperm whale", "narwhal": "narwhal"}

def make(plan, seed): return FN[plan](random.Random("sea" + plan + str(seed))).pl
def inframe(pl):
    x0, y0, x1, y1 = M.bounds(to_recipe(pl)) if hasattr(M, "bounds") else __import__("kitlib").bounds(to_recipe(pl)); return x0 >= 6 and x1 <= 394 and y0 >= 6 and y1 <= 394
def ranked(plan, N=60):
    ok = []
    for s in range(N):
        try: pl = make(plan, s); m = M.measure(to_recipe(pl))
        except Exception as e: continue
        if passes(m) and inframe(pl): ok.append((score(m), s, m))
    return sorted(ok)

if __name__ == "__main__":
    if sys.argv[1:2] == ["explore"]:
        out = {}
        for key, *_ in PLANS:
            r = ranked(key); print("%-11s %d of 60 pass and fit the frame" % (key, len(r))); out[key] = [{"seed": s, "layout": make(key, s)} for _, s, _ in r[:15]]
        json.dump(out, open("/tmp/sea-explore.json", "w")); sys.exit()
    cands = []; used = set(); n = 0
    for key, group, common, rule, fn in PLANS:
        r = ranked(key); print("%-11s %d of 60 pass and fit the frame" % (key, len(r)))
        for sc, seed, m in r[0:10:2]:
            pl = make(key, seed); rec = to_recipe(pl); n += 1
            big = sorted({p["part"] for p in rec["parts"]}, key=lambda q: -max(W(q, p["scale"]) * H(q, p["scale"]) for p in rec["parts"] if p["part"] == q)); name = None
            for pid in big:
                for word in CAT["sheets"][PARTS[pid]["species"]]["name"].replace("-", " ").split():
                    c = word.capitalize() + " " + NOUN[key]
                    if c.lower() not in used and word.lower() not in ("new", "a", "b", "c", "ii", "plates"): name = c; break
                if name: break
            used.add(name.lower())
            cands.append({"key": name.lower().replace(" ", "-"), "name": name, "no": n, "group": group, "plan": key, "seed": seed, "layout": pl, "parts": rec["parts"],
                          "measures": {k: round(m[k], 2) for k in ("kinds", "repeat", "big", "overlap", "core", "aspect")}})
    doc = {"about": "Fifty sea creatures (tools/kitgen/sea.py): fishes, sharks and whales laid out by rule in Bestiary Forge's format. 'layout' is the forge's own placement list "
                    "(centre parts on the spine, left parts mirrored by the page, fans as {array}); paste it into the forge or draw it with tools/kitgen/forge-render.mjs. 'parts' is the same "
                    "creature as a kit recipe. Each passed the designed species' gate (round two) and fits the 400 x 400 frame. Names are working names.",
           "gate": GATE, "plans": [{"key": p[0], "group": p[1], "common": p[2], "rule": p[3]} for p in PLANS], "candidates": cands}
    open(os.path.join(DATA, "kit-sea.json"), "w").write(json.dumps(doc, indent=1) + "\n"); print(len(cands), "written")
