#!/usr/bin/env python3
"""Kit candidates, round three: fifty more, with ten silhouettes that rounds one and two (and the six orders) do not have.

  python3 tools/kitgen/round3.py                  write packages/kit/data/kit-candidates-round3.json and kit-sources/kit-candidates-round3.svg (the picks below)
  python3 tools/kitgen/round3.py explore <dir>    run every plan over many seeds, keep what passes the gate, draw the best of each to choose from

Same grammar as round two (round2.py: one dominant mass, a small head where it travels, kindred not identical drawings in a run, parts layered,
checked against the designed species' range). The new silhouettes come from body plans no earlier round drew:

  pincers    a crab or scorpion: broad flat body, two jointed arms that end in a claw, small legs beneath
  fans       a fan worm or lyrebird: a small body under a half-circle of long blades
  tentacles  a cephalopod: a mantle, two eyes and a skirt of curling arms
  comets     a tadpole or comet: a heavy head and one long tail swung out in an S
  bells      a medusa: a wide bell, frilled arms in the middle, a fringe of strands hanging from the rim
  lilies     a sea lily: a long stalk, a cup, a crown of feathered arms, and a holdfast at the foot (it does not travel, so no head)
  striders   an arthropod: a head, a body slung between three pairs of jointed legs
  cloaks     a moth at rest: the great wings closed over the body to a point, a head peeping out
  corals     a branching colony: a trunk that forks and forks again (it does not travel, so no head)
  wreaths    a ring-worm: a body bent into a circle round a small mass, head meeting tail
"""
import sys, os, json, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import DATA, PARTS, CAT
import candidates as C1
from candidates import W, H, ray, arc, SEG, CLASP, HEAD, BAR, CORE, RING, SPEAR, WING, BLADE, RIB, BEAD
import round2 as R2
from round2 import B2, along, mass, head, details, wings, tail, run, MASS, LONG, EYE, END, FLOAT, FAMS, RIBS, passes, score, GATE
import measure as M

D = math.degrees
_reach = {}
def reach(pid):
    """how far a side part reaches from its root, and in which heading (0 down, 90 left, 180 up) when drawn unturned"""
    if pid not in _reach:
        rx, ry = R2.root(pid); P = [q for pts, _ in M.flat(R2.compose.lines({"parts": [{"part": pid, "x": 0, "y": 0, "free": True}]})) for q in pts]
        q = max(P, key=lambda q: (q[0] - rx) ** 2 + (q[1] - ry) ** 2); vx, vy = q[0] - rx, q[1] - ry; _reach[pid] = (math.hypot(vx, vy), D(math.atan2(-vx, vy)))
    return _reach[pid]
def spoke(b, pid, x, y, h, L, both=True):
    """a side part with its root at x, y, turned to reach in heading h and scaled to reach L"""
    r, h0 = reach(pid); return b.by_root(pid, x, y, L / r, h - h0, False, both)
def curl(x, y, h, L, turn, n=9):
    """a path that sets off at heading h and keeps turning by `turn` degrees a step"""
    pts = [(x, y)]
    for i in range(n): pts.append((pts[-1][0] - math.sin(math.radians(h)) * L / n, pts[-1][1] + math.cos(math.radians(h)) * L / n)); h += turn
    return pts
def dirof(p, q): return D(math.atan2(-(q[0] - p[0]), q[1] - p[1]))
def fam(R, n=None, fams=FAMS):
    f = list(R.choice(fams)); R.shuffle(f); return f if n is None else [f[i % len(f)] for i in range(n)]

def claw(b, R, x, y, h, size):
    """two blades that close on each other at the end of an arm heading h: a pincer"""
    for p, k in ((R.choice(BLADE[:24]), 22), (R.choice(BLADE[:24]), -22)): spoke(b, p, x, y, h + k, size)

def pincers(R):
    b = B2(); w = R.uniform(118, 140); m = mass(b, R, 215, w); details(b, R, m, 2); head(b, R, m, 0.36)
    sh = (200 - w * 0.36, m["top"] + m["h"] * 0.2); el = (200 - w * R.uniform(0.95, 1.2), m["top"] - R.uniform(10, 26)); tip = (200 - w * R.uniform(0.35, 0.5), m["top"] - R.uniform(95, 125))
    (x, y), (tx, ty) = along(b, run(R, 5), [sh, el, tip], w * 0.17, w * 0.24, lap=0.66, flip=True); claw(b, R, x, y, D(math.atan2(-tx, ty)) + 180, w * R.uniform(0.5, 0.62))
    for i, rib in enumerate(run(R, 3, RIBS)): spoke(b, rib, 200 - w * 0.4, m["top"] + m["h"] * (0.5 + 0.2 * i), 50 + 24 * i, w * R.uniform(0.6, 0.8))
    wings(b, R, m, 0.7, R.uniform(0.5, 0.8), pool=BLADE); tail(b, R, m["bot"] - m["h"] * 0.12, 2, w * 0.2); return b

def fans(R):
    b = B2(); w = R.uniform(84, 100); m = mass(b, R, 250, w, pool=FLOAT + MASS[:8]); details(b, R, m, 1); hp = R.choice(HEAD); b.centre(hp, m["top"] + 4, w * 0.4 / W(hp)); y0 = m["top"] + 6
    outer = run(R, 5, RIBS); inner = run(R, 4, RIBS)
    for i, a in enumerate((180, 160, 140, 120, 100)): spoke(b, outer[i], 200, y0, a, (150 - 10 * i) * R.uniform(0.92, 1.08))
    for i, a in enumerate((170, 150, 130, 110)): spoke(b, inner[i], 200, y0 + 6, a, (88 - 6 * i) * R.uniform(0.92, 1.08))
    wings(b, R, m, 0.3, R.uniform(0.7, 1.1), pool=BLADE + WING[24:]); tail(b, R, m["bot"] - m["h"] * 0.14, R.randint(3, 4), w * 0.26); return b

def tentacles(R):
    b = B2(); w = R.uniform(100, 120); pid = R.choice(LONG); m = mass(b, R, 70, w, pid=pid); details(b, R, m, 1)
    hp = R.choice(HEAD); hs = w * 0.62 / W(hp); hy = m["bot"] - H(hp, hs) * 0.2; b.centre(hp, hy, hs); e = R.choice(EYE); b.pair(e, W(hp, hs) * 0.28, hy, w * 0.14 / W(e))
    for i, (h0, L, turn) in enumerate(((8, 190, 5), (26, 175, 7), (48, 160, -6), (72, 135, 9))):
        pts = curl(200 - w * (0.1 + 0.08 * i), hy + H(hp, hs) * 0.3, h0 * R.uniform(0.8, 1.2), L * R.uniform(0.9, 1.1), turn * R.uniform(0.8, 1.3), 10); along(b, fam(R, 6, FAMS), pts, w * 0.2, w * 0.07, lap=0.7)
    wings(b, R, m, 0.2, R.uniform(0.5, 0.9), pool=BLADE + WING[22:]); return b

def comets(R):
    b = B2(); w = R.uniform(120, 145); m = mass(b, R, 90, w); details(b, R, m, 2); head(b, R, m, 0.4); wings(b, R, m, 0.4, R.uniform(0.8, 1.3), pool=BLADE + WING[20:])
    y = m["bot"] - m["h"] * 0.1; ws = w * 0.26
    for seg in fam(R, 8):                                            # the tail, straight down the centre, shrinking
        sg = ws / W(seg); hh = H(seg, sg); b.centre(seg, y + hh / 2, sg); y += hh * 0.72; ws *= 0.9
    for sgn in (1,):                                                # two streamers swung out in an S, mirror images
        per = R.choice((1.0, 1.5)); amp = R.uniform(40, 62); pts = curl(200 - w * 0.25, m["bot"] - m["h"] * 0.3, 0, R.uniform(210, 250), 0, 16); pts = [(x - amp * math.sin(i / 16 * 2 * math.pi * per) * (0.4 + i / 16) - i * 2.5, yy) for i, (x, yy) in enumerate(pts)]
        along(b, fam(R, 10), pts, w * 0.2, w * 0.08, lap=0.7)
    b.centre(R.choice(END), y + 8, 1.0 * min(1.2, w * 0.18 / W(END[0]))); return b

def bells(R):
    b = B2(); w = R.uniform(160, 185); pid = R.choice(HEAD[:12] + BAR[:6] + FLOAT[:3]); m = mass(b, R, 70, w, pid=pid); details(b, R, m, 2); y0 = m["bot"] - m["h"] * 0.12
    for i, dx in enumerate((0.05, 0.14)):                                              # frilled arms in the middle, short and heavy
        L = 120 - 26 * i; pts = [(200 - w * dx, y0), (200 - w * dx - 5, y0 + L * 0.5), (200 - w * dx, y0 + L)]; along(b, fam(R, 4), pts, w * 0.2, w * 0.1, lap=0.7)
    for i, dx in enumerate((0.24, 0.32, 0.4, 0.46)):                                   # the fringe: long thin strands from the rim
        L = R.uniform(140, 175) * (1 - 0.14 * i); pts = [(200 - w * dx, y0 - 4), (200 - w * dx - 4 * i, y0 + L * 0.5), (200 - w * dx - 12 * i, y0 + L)]
        along(b, fam(R, 7), pts, w * 0.1, w * 0.04, lap=0.7)
    return b

def lilies(R):
    b = B2(); w = R.uniform(84, 100); m = mass(b, R, 110, w, pool=MASS[:10] + FLOAT); details(b, R, m, 1); y0 = m["top"] + 8
    for i, a in enumerate((180, 156, 132, 108)): spoke(b, run(R, 4, RIBS)[i], 200, y0, a, (140 - 12 * i) * R.uniform(0.92, 1.08))
    for i, a in enumerate((166, 144, 120)): spoke(b, run(R, 3, RIBS)[i], 200, y0 + 10, a, (84 - 6 * i) * R.uniform(0.92, 1.08))
    y = m["bot"] - m["h"] * 0.1; ws = w * 0.2
    for seg in fam(R, 5):
        sg = ws / W(seg); hh = H(seg, sg); b.centre(seg, y + hh / 2, sg); y += hh * 0.66; ws *= 0.96
    for i, a in enumerate((60, 36, 14)): spoke(b, run(R, 3, RIBS)[i], 200, y, a, 70 * R.uniform(0.9, 1.1))
    b.centre(R.choice(BAR[:6]), y + 6, 0.5); return b

def striders(R):
    b = B2(); w = R.uniform(100, 120); m = mass(b, R, 150, w); details(b, R, m, 2); head(b, R, m, 0.4)
    ab = R.choice(MASS); abs_ = w * 0.7 / W(ab); ay = m["bot"] - 6 + H(ab, abs_) / 2; b.put(ab, 200, ay, abs_)
    for i in range(3):
        y = m["top"] + m["h"] * (0.32 + 0.24 * i); k = w * (0.5 + 0.08 * i)
        pts = [(200 - w * 0.3, y), (200 - w * 0.3 - k, y - 22 + 6 * i), (200 - w * 0.3 - k * 1.5 - 14 * i, y + 20), (200 - w * 0.3 - k * 1.6 - 22 * i, y + 120 - 10 * i)]
        along(b, fam(R, 7), pts, w * 0.2, w * 0.1, lap=0.66, flip=True)
    wings(b, R, m, 0.3, R.uniform(0.5, 0.9), pool=BLADE); return b

def cloaks(R):
    b = B2(); w = R.uniform(70, 90); m = mass(b, R, 150, w, pool=LONG + MASS[:6]); head(b, R, m, 0.55); y0 = m["top"] + 20
    wp = R.choice(WING); s = R.uniform(2.0, 2.6)
    spoke(b, wp, 200 - 6, y0, R.uniform(-6, 4), reach(wp)[0] * 0 + R.uniform(230, 260)); spoke(b, R.choice(WING), 200 - 4, y0 + 14, R.uniform(14, 26), R.uniform(150, 190))
    for a in (150, 128):
        a_ = R.uniform(-4, 4) + a; spoke(b, R.choice(RIBS)[0], 200 - 3, m["top"], a_, 100 - (150 - a))
    details(b, R, m, 2)
    for i, p in enumerate(fam(R, 4, RIBS)[:2]): spoke(b, p, 200 - 8, m['bot'] - 30 - 20 * i, 160 + 12 * i, 60)
    return b

def corals(R):
    b = B2(); w = R.uniform(90, 110); y = 340; hb = R.choice(BAR[:6]); b.centre(hb, y, w * 1.3 / W(hb))
    ws = w * 0.34; fl = fam(R, 4)
    for seg in fl:
        sg = ws / W(seg); hh = H(seg, sg); b.centre(seg, y - hh / 2 - 6, sg, flip=True); y -= hh * 0.72; ws *= 0.9
    def branch(x, y, h, L, depth, ws):
        pts = [(x, y), (x - math.sin(math.radians(h)) * L, y + math.cos(math.radians(h)) * L)]; end, (tx, ty) = along(b, fam(R, 3, FAMS + RIBS), pts, ws, ws * 0.75, lap=0.7)
        if depth: 
            for d in (R.uniform(26, 38), -R.uniform(26, 38)):
                branch(end[0], end[1], h + d, L * 0.72, depth - 1, ws * 0.8)
        else: b.pair(R.choice(BEAD), 0, end[1], 0.5) if False else None
    for h in (R.uniform(138, 152),): branch(200 - 4, y, h, R.uniform(70, 90), 3, w * 0.26)
    cs = R.choice(HEAD); b.centre(cs, y - 40, w * 0.5 / W(cs)); return b

def wreaths(R):
    b = B2(); r = R.uniform(88, 102); cy = 210; m = mass(b, R, cy - 40, R.uniform(100, 120), pool=MASS); details(b, R, m, 1); wp = R.choice(WING)
    for a0, a1, w0, w1 in ((178, 90, 34, 50), (90, 4, 50, 28)): along(b, fam(R, 6), arc(200, cy, r, a0, a1, 16), w0, w1, lap=0.68, flip=False)
    hp = R.choice(HEAD); hs = 62 / W(hp); b.centre(hp, cy - r - 4, hs); e = R.choice(EYE); b.pair(e, 12, cy - r - 4, 9 / W(e))
    wings(b, R, {"top": cy - 40, "h": 80, "w": 2 * r}, 0.4, 0.7, pool=BLADE + WING[24:], inset=0.5); return b

PLANS = [("pincers", "Chelata", "The pincers", "Broad flat body, two jointed arms that end in a claw, small legs beneath.", pincers),
         ("fans", "Flabellata", "The fans", "A small body under a half-circle of long blades.", fans),
         ("tentacles", "Brachiata", "The tentacles", "A mantle, two eyes, and a skirt of curling arms.", tentacles),
         ("comets", "Caudata", "The comets", "A heavy head and one long tail, with streamers swung out in an S.", comets),
         ("bells", "Campanata", "The bells", "A wide bell, frilled arms in the middle, a fringe hanging from the rim.", bells),
         ("lilies", "Pedunculata", "The lilies", "A long stalk, a cup, a crown of feathered arms; it does not travel, so no head.", lilies),
         ("striders", "Ambulata", "The striders", "A head, a body slung between three pairs of jointed legs.", striders),
         ("cloaks", "Involuta", "The cloaks", "The great wings closed over the body to a point, a head peeping out.", cloaks),
         ("corals", "Ramosa", "The corals", "A trunk that forks and forks again; it does not travel, so no head.", corals),
         ("wreaths", "Annulata", "The wreaths", "A body bent into a circle round a small mass, head meeting tail.", wreaths)]
NOUN = {"pincers": "pincer", "fans": "fan", "tentacles": "squid", "comets": "comet", "bells": "bell", "lilies": "lily", "striders": "strider", "cloaks": "cloak", "corals": "coral", "wreaths": "wreath"}

def make(plan, seed):
    fn = {p[0]: p[4] for p in PLANS}[plan]; return fn(random.Random("r3" + plan + str(seed))).parts

if __name__ == "__main__" and len(sys.argv) > 2 and sys.argv[1] == "explore":
    out = sys.argv[2]; os.makedirs(out, exist_ok=True); only = sys.argv[3:] or [p[0] for p in PLANS]; N = 70
    for key, order, common, rule, fn in PLANS:
        if key not in only: continue
        ok = []; fail = {}; allm = []
        for seed in range(N):
            try: parts = make(key, seed); m = M.measure({"parts": parts})
            except Exception as e: fail["error " + repr(e)[:70]] = fail.get("error " + repr(e)[:70], 0) + 1; continue
            allm.append((seed, parts, m))
            if passes(m): ok.append((score(m), seed, parts, m))
            else:
                for k in GATE:
                    if not GATE[k][0] <= m[k] <= GATE[k][1]: fail[k] = fail.get(k, 0) + 1
        ok.sort(key=lambda t: t[0])
        pool = [(sc, seed, parts, m) for sc, seed, parts, m in ok[:15]] or [(0, s, p, m) for s, p, m in allm[:15]]
        C1.sheet([("%s %d%s" % (key, seed, "" if ok else " FAIL"), "kinds %d rep %.2f big %.2f core %.2f" % (m["kinds"], m["repeat"], m["big"], m["core"]), {"parts": parts}) for sc, seed, parts, m in pool], os.path.join(out, key + ".svg"), title=order + " . " + rule)
        print("%-10s %d of %d pass; failed on: %s" % (key, len(ok), N, ", ".join("%s %d" % kv for kv in sorted(fail.items(), key=lambda kv: -kv[1]))))

def ranked(plan, N=70):
    ok = []
    for seed in range(N):
        try: parts = make(plan, seed); m = M.measure({"parts": parts})
        except Exception: continue
        if passes(m): ok.append((score(m), seed))
    return [seed for _, seed in sorted(ok)]

# the fifty: five of each plan, chosen from the candidates that passed the gate (every other one down the ranking, so they differ), then looked over by eye
PICKS = [("pincers", (59, 26, 47, 17, 67)), ("fans", (37, 0, 11, 65, 36)), ("tentacles", (9, 15, 62, 6, 36)), ("comets", (21, 40, 59, 3, 12)), ("bells", (2, 28, 52, 45, 25)),
         ("lilies", (50, 20, 42, 33, 32)), ("striders", (23, 62, 12, 8, 31)), ("cloaks", (43, 18, 49, 41, 3)), ("corals", (44, 64, 29, 7, 60)), ("wreaths", (38, 24, 64, 28, 39))]

def build():
    out = []; used = set(); n = 0
    for plan, seeds in PICKS:
        order = [p for p in PLANS if p[0] == plan][0][1]
        for seed in seeds:
            parts = make(plan, seed); m = M.measure({"parts": parts}); n += 1
            big = sorted({p["part"] for p in parts}, key=lambda pid: -W(pid, max(q["scale"] for q in parts if q["part"] == pid)) * H(pid, max(q["scale"] for q in parts if q["part"] == pid)))
            name = None
            for pid in big:
                for word in CAT["sheets"][PARTS[pid]["species"]]["name"].replace("-", " ").split():
                    cand = word.capitalize() + " " + NOUN[plan]
                    if cand.lower() not in used and word.lower() not in ("new", "a", "b", "c", "ii", "plates"): name = cand; break
                if name: break
            used.add(name.lower())
            out.append({"key": name.lower().replace(" ", "-"), "name": name, "no": n, "plan": plan, "order": order, "seed": seed, "uses": sorted({p["part"] for p in parts}),
                        "measures": {k: round(m[k], 2) for k in ("kinds", "repeat", "big", "overlap", "core", "aspect")}, "passes": passes(m), "parts": parts})
    return out

if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "picks":
    for key, *_ in PLANS: r = ranked(key); print('("%s", %s),' % (key, tuple(r[0:10:2])), "# %d pass" % len(r))
elif __name__ == "__main__" and len(sys.argv) == 1:
    import statistics
    cands = build(); bad = [c["name"] for c in cands if not c["passes"]]
    doc = {"about": "Candidates, not yet creatures: fifty more new kinds put together from kit parts by rule (tools/kitgen/round3.py), for Zac to pick from. Round three: ten silhouettes that rounds one and two and the six orders do not have, "
                    "built to the same grammar as round two and checked against the designed species' range (measures). Ten plans, five of each. Recipes are in kit-creatures.json's format "
                    "(part ids and placements on a 400-wide canvas, centre line x = 200; every placement free, its mirror image beside it). Names are working names, taken from the species whose part is the candidate's largest.",
           "gate": GATE, "plans": [{"key": p[0], "order": p[1], "common": p[2], "rule": p[3]} for p in PLANS], "candidates": cands}
    open(os.path.join(DATA, "kit-candidates-round3.json"), "w").write(json.dumps(doc, indent=1) + "\n")
    C1.candidate_sheet(cands, os.path.join(DATA, "kit-sources", "kit-candidates-round3.svg"), plans=PLANS, title="Kit candidates, round three: fifty more, ten new silhouettes")
    print("%d candidates, %d different kit parts; outside the gate: %s" % (len(cands), len({u for c in cands for u in c["uses"]}), ", ".join(bad) or "none"))
    print("medians: " + ", ".join("%s %.2f" % (k, statistics.median(c["measures"][k] for c in cands)) for k in ("kinds", "repeat", "big", "overlap", "core", "aspect")))
