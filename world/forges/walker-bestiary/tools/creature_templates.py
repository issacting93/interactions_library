"""Creature templates: blank rig sheets for drawing a new walker by hand.

Writes ../templates/NN-<kind>-template.svg (strider, weaver, hundred-worm, pincer-crawler,
radial-star, kraken). Each sheet is the 400 x 400 Forge top view at 2x with a body, a skeleton
of numbered bones and joints, and optional pieces in a tray below. No dependencies.

    python3 world/forges/walker-bestiary/tools/creature_templates.py
"""
import math, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "templates")

MINT, PICK, SIM, PLATE, GHOST, INK, OFF, BODY = "#5be39a", "#e8b04a", "#5cc8e0", "#161618", "#2e2d2a", "#ece8de", "#8a867d", "#cfcac0"
FONT = "IBM Plex Mono, Menlo, monospace"
SX, SY, SC = 40, 64, 2            # the 400 x 400 Forge sheet, drawn at 2x
PANEL = 880
W, H = 1480, 990
DEG = math.pi / 180

BONES = {3: ["femur", "tibia", "tarsus"], 4: ["coxa", "femur", "tibia", "tarsus"], 6: [f"seg{i}" for i in range(1, 7)]}
JOINTS = {3: ["hip", "knee", "ankle", "tip"], 4: ["hip", "trochanter", "knee", "ankle", "tip"], 6: ["base", "j1", "j2", "j3", "j4", "j5", "tip"]}


def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def text(x, y, s, size=13, fill=OFF, anchor="start", fam=FONT, extra=""):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-family="{fam}" font-size="{size}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def f(v): return f"{v:.1f}"


def chain(hip, angles, lens):
    """Joints from a hip, each bone at an angle from forward (0 = up the sheet), pointing to the creature's left."""
    pts = [hip]
    for a, l in zip(angles, lens):
        x, y = pts[-1]
        pts.append((x - math.sin(a * DEG) * l, y - math.cos(a * DEG) * l))
    return pts


def capsule(A, B, w0, w1):
    dx, dy = B[0] - A[0], B[1] - A[1]; L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L; nx, ny = -uy, ux
    pts = [(A[0] + nx * w0, A[1] + ny * w0), (B[0] + nx * w1, B[1] + ny * w1)]
    for k in range(1, 6):
        t = k / 6 * math.pi
        pts.append((B[0] + nx * w1 * math.cos(t) + ux * w1 * math.sin(t), B[1] + ny * w1 * math.cos(t) + uy * w1 * math.sin(t)))
    pts += [(B[0] - nx * w1, B[1] - ny * w1), (A[0] - nx * w0, A[1] - ny * w0)]
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"


def ellipse(cx, cy, rx, ry, rot=0):
    pts = []
    for i in range(36):
        t = i / 36 * 2 * math.pi
        x, y = math.cos(t) * rx, math.sin(t) * ry
        c, s = math.cos(rot * DEG), math.sin(rot * DEG)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"


def mirror(d):  # mirror path data across x = 200
    out, toks, i = [], d.replace("M", " M ").replace("L", " L ").replace("Z", " Z ").split(), 0
    nums = []
    for t in toks:
        if t in "MLZ": out.append(t)
        else:
            nums.append(t)
            if len(nums) == 2: out.append(f"{f(400 - float(nums[0]))} {nums[1]}"); nums = []
    return " ".join(out)


def rotate(d, ang, cx=200, cy=200):
    c, s = math.cos(ang * DEG), math.sin(ang * DEG)
    out, nums = [], []
    for t in d.replace("M", " M ").replace("L", " L ").replace("Z", " Z ").split():
        if t in "MLZ": out.append(t)
        else:
            nums.append(float(t))
            if len(nums) == 2:
                x, y = nums[0] - cx, nums[1] - cy
                out.append(f"{f(cx + x * c - y * s)} {f(cy + x * s + y * c)}"); nums = []
    return " ".join(out)


def rim(cx, cy, rx, ry, a):  # point on a body ellipse at an angle from forward, on the creature's left
    return (cx - math.sin(a * DEG) * rx, cy - math.cos(a * DEG) * ry)


# ---------------- body plans ----------------
def plan_strider():
    body = [("head", ellipse(200, 150, 46, 52)), ("abdomen", ellipse(200, 262, 64, 80)), ("waist", ellipse(200, 200, 14, 10))]
    limbs = []
    for i, a in enumerate([48, 80, 108, 142]):
        hip = rim(200, 150, 40, 44, a)
        js = chain(hip, [a - 10, a + 4, a + 14], [50, 52, 38])
        limbs.append((f"leg-{i+1}", js, 3, [7, 5.5, 4, 2.5]))
    return dict(key="strider", title="Strider", plan="8 legs around a two-part body",
                rig="3 bones per leg (two-bone IK + tarsus) · alternate gait · walker",
                tip="Legs fan from the head. The femur rises, the tibia comes down, the tarsus plants.",
                body=body, limbs=limbs)


def plan_weaver():
    body = [("head", ellipse(200, 116, 24, 24)), ("body", ellipse(200, 210, 36, 76))]
    limbs = []
    for i, (a, bend) in enumerate([(42, -1), (140, 1)]):
        hip = rim(200, 190 if a < 90 else 232, 32, 60, a)
        angs = [a, a - 22 * bend, a + 8 * bend, a + 34 * bend] if a < 90 else [a, a + 18, a - 6, a - 30]
        js = chain(hip, angs, [18, 52, 52, 44] if a < 90 else [16, 44, 44, 38])
        limbs.append((f"leg-{i+1}", js, 4, [9, 8, 6.5, 5, 1.5]))
    return dict(key="weaver", title="Weaver", plan="4 long legs, two reaching forward and two back",
                rig="4 bones per leg (FABRIK) · alternate gait (diagonal pairs) · weaver: lays a silk dragline",
                tip="Like the Hook Weaver: hip knot, arm, elbow, blade. The blade is the last bone.",
                body=body, limbs=limbs, silk=True)


def plan_worm():
    body = [("head", ellipse(200, 96, 30, 26)), ("segment-1", ellipse(200, 150, 30, 18)), ("tail", "M186 318L214 318L206 360L200 378L194 360Z")]
    limbs = [("leg-1", chain((176, 150), [92, 104, 118], [30, 26, 18]), 3, [5, 4, 3, 1.8]),
             ("claw", chain((184, 84), [28, 6, -14], [28, 26, 24]), 3, [6, 5, 4, 1.5])]
    ghosts = [ellipse(200, y, 30, 18) for y in (192, 234, 276)]
    for y in (192, 234, 276):
        js = chain((176, y), [92, 104, 118], [30, 26, 18])
        for k in range(3): ghosts.append(capsule(js[k], js[k + 1], [5, 4, 3][k], [4, 3, 1.8][k]))
    return dict(key="hundred-worm", title="Hundred-worm", plan="head with claws, one repeating segment with a leg pair, tail",
                rig="segments follow the head at a fixed gap (4–28 of them) · 3 bones per leg · ripple gait · FABRIK claws",
                tip="Draw segment 1 and its leg only. The faint segments below show how it repeats.",
                body=body, limbs=limbs, ghosts=ghosts)


def plan_pincer():
    body = [("head", ellipse(200, 136, 28, 26)), ("body", ellipse(200, 236, 46, 82))]
    limbs = []
    for i, a in enumerate([68, 100, 132]):
        hip = rim(200, 236, 40, 70, a)
        limbs.append((f"leg-{i+1}", chain(hip, [a - 8, a + 6, a + 16], [46, 44, 30]), 3, [6.5, 5, 4, 2]))
    limbs.append(("claw", chain((180, 126), [34, 8, -12], [40, 36, 34]), 3, [8, 7, 9, 2]))
    return dict(key="pincer-crawler", title="Pincer crawler", plan="6 legs and a pair of claws on a long body",
                rig="3 bones per leg · 3-bone FABRIK claws that strike · alternate gait (tripods) · hunter",
                tip="The claw's last bone is the pincer. Draw it open; it reads better when it strikes.",
                body=body, limbs=limbs)


def plan_star():
    body = [("body", ellipse(200, 200, 48, 48)), ("core", ellipse(200, 200, 26, 26))]
    js = chain(rim(200, 200, 46, 46, 30), [30, 30, 30, 30], [32, 32, 28, 24])
    limbs = [("ray", js, 4, [11, 9, 7, 5, 1.5])]
    ghosts = []
    for r in (60, 120, 180, 240, 300):
        for k in range(4): ghosts.append(rotate(capsule(js[k], js[k + 1], [11, 9, 7, 5][k], [9, 7, 5, 1.5][k]), r))
    return dict(key="radial-star", title="Radial star", plan="6 rays around a round body, no front or back",
                rig="4 bones per ray (FABRIK) · alternate gait (every other ray) · slides any direction while it spins",
                tip="Draw one ray. It repeats six times around the body; the faint rays show where.",
                body=body, limbs=limbs, ghosts=ghosts, radial=True)


def plan_kraken():
    body = [("mantle", ellipse(200, 150, 58, 78)), ("hood", "M146 120Q200 40 254 120L240 104Q200 64 160 104Z")]
    limbs = []
    for i, a in enumerate([112, 132, 152, 172]):
        hip = rim(200, 150, 50, 70, a)
        angs = [a + k * (5 if i % 2 else -4) for k in range(6)]
        limbs.append((f"tentacle-{i+1}", chain(hip, angs, [19, 19, 18, 17, 16, 15]), 6, [7, 6.2, 5.4, 4.6, 3.8, 3, 1.4]))
    return dict(key="kraken", title="Kraken", plan="a floating mantle with tentacles trailing behind",
                rig="6 bones per tentacle, all free (FABRIK) · ripple gait · body floats and bobs · lantern pulses",
                tip="Tentacles can curl as drawn; the spine follows them. Put the lantern in the accent group.",
                body=body, limbs=limbs, lantern=True)


PLANS = [plan_strider(), plan_weaver(), plan_worm(), plan_pincer(), plan_star(), plan_kraken()]


def build(p):
    lay = lambda i, label, inner, extra="": f'<g id="{i}" inkscape:groupmode="layer" inkscape:label="{label}"{extra}>{inner}</g>'
    sheet = lambda inner: f'<g transform="translate({SX} {SY}) scale({SC})">{inner}</g>'
    key = p["key"]
    # guides
    G = [f'<rect width="{W}" height="{H}" fill="{PLATE}"/>']
    g = [f'<rect x="0" y="0" width="400" height="400" fill="none" stroke="{GHOST}" stroke-width="0.6"/>']
    for v in range(25, 400, 25):
        g.append(f'<path d="M{v} 0V400M0 {v}H400" stroke="#1f1f22" stroke-width="0.5"/>')
    g.append(f'<path d="M200 0V400" stroke="#3a3935" stroke-width="0.6" stroke-dasharray="4 3"/>')
    g.append(f'<path d="M200 6l-4 7h8z" fill="{OFF}"/>')
    g.append(text(206, 13, "front", 6.5))
    g.append(text(100, 389, "left side: draw here", 6.5, anchor="middle")); g.append(text(300, 389, "right side: mirrored", 6.5, anchor="middle"))
    # mirrored and repeated ghosts
    gh = []
    for lname, js, n, ws in p["limbs"]:
        for k in range(n):
            d = capsule(js[k], js[k + 1], ws[k], ws[k + 1])
            if not p.get("radial"): gh.append(mirror(d))
    for _, d in p["body"]: pass
    for d in p.get("ghosts", []):
        gh.append(d)
        if not p.get("radial"): gh.append(mirror(d))
    g.append(f'<g fill="none" stroke="{MINT}" stroke-width="0.7" stroke-dasharray="2 2.5" opacity="0.28">' + "".join(f'<path d="{d}"/>' for d in gh) + "</g>")
    G.append(sheet("".join(g)))
    # panel
    x, y = PANEL, 74
    G.append(text(x, y, f"Creature template", 13, OFF)); y += 34
    G.append(text(x, y, p["title"], 28, INK, fam=f"Martian Mono, {FONT}")); y += 28
    G.append(text(x, y, p["plan"], 14, BODY)); y += 22
    for ln in p["rig"].split(" · "): G.append(text(x, y, ln, 11.5, OFF)); y += 17
    y += 16
    steps = [
        "1  Top view, front up. Draw the body on the centre line and the",
        "    left limbs only. I mirror the right side.",
        "2  Each bone has a group between two joint dots: draw that stretch",
        "    as one closed shape. Or draw the whole limb as one shape in the",
        "    limb group and I'll cut it at the joints.",
        "3  The amber line through each limb is its spine; the bones follow",
        "    it. Unlock Skeleton to move the joints.",
        "4  Body parts can overlap. Keep each one a closed shape.",
        "5  Optional pieces wait in the tray under the sheet. Drag each one",
        "    onto the creature, or delete it.",
        "6  Fill in the Notes, save as SVG, and send it back.",
    ]
    for s in steps: G.append(text(x, y, s, 12, BODY)); y += 21
    y += 6
    words, ln = p["tip"].split(), ""
    for w in words:
        if len(ln) + len(w) + 1 > 70: G.append(text(x, y, ln, 12, PICK)); y += 19; ln = w
        else: ln = (ln + " " + w).strip()
    G.append(text(x, y, ln, 12, PICK)); y += 36
    G.append(text(x, y, "Groups", 15, INK)); y += 24
    rows = [(n, "body part") for n, _ in p["body"]]
    for lname, js, n, ws in p["limbs"]:
        rows.append((lname, " · ".join(BONES[n] if lname != "claw" else ["upper", "fore", "pincer"])))
    for n, s in rows: G.append(text(x, y, n, 12, MINT)); G.append(text(x + 130, y, s, 11.5)); y += 20
    opts = ["ornaments", "accent", "veil", "halo", "eyes"] + (["silk (spinneret)"] if p.get("silk") else []) + (["lantern"] if p.get("lantern") else [])
    G.append(text(x, y, "optional:  " + " · ".join(opts), 11.5, SIM)); y += 36
    notes_y = y
    guides = lay("guides", "Guides (locked)", "".join(G), ' sodipodi:insensitive="true"')
    # drawing
    starter = f'fill="none" stroke="{MINT}" stroke-width="0.9" stroke-dasharray="3.5 2.5"'
    hint = f'fill="none" stroke="{SIM}" stroke-width="0.8" stroke-dasharray="2.5 2.5"'
    G2 = []
    D = ['<g id="body" inkscape:label="body (centre line)">']
    for n, d in p["body"]: D.append(f'<g id="{key}--{n}" inkscape:label="{n}"><path {starter} d="{d}"/></g>')
    D.append("</g>")
    D.append('<g id="limbs" inkscape:label="left limbs">')
    for lname, js, n, ws in p["limbs"]:
        names = BONES[n] if lname != "claw" else ["upper", "fore", "pincer"]
        D.append(f'<g id="{key}--{lname}" inkscape:label="{lname}">')
        for k in range(n):
            D.append(f'<g id="{key}--{lname}--{names[k]}" inkscape:label="{lname}--{names[k]}"><path {starter} d="{capsule(js[k], js[k+1], ws[k], ws[k+1])}"/></g>')
        D.append("</g>")
    D.append("</g>")
    # optional hints
    head = p["body"][0][1]
    hx, hy = (200, 72) if key == "hundred-worm" else (200, 150) if key in ("strider", "kraken") else (200, 116) if key == "weaver" else (200, 122) if key == "pincer-crawler" else (200, 200)
    tray = [("ornaments (mirrored)", "ornaments", "M-7 6l-6 -8l6 -6l6 6z"), ("accent (solid fill)", "accent", ellipse(0, 0, 6, 6)),
            ("veil (grey shadow)", "veil", "M-10 6Q-12 -8 0 -6Q12 -8 10 6Q0 2 -10 6Z"), ("halo (stands upright)", "halo", ellipse(0, 0, 8, 8) + ellipse(0, 0, 5, 5)),
            ("eyes", "eyes", ellipse(-3.5, 0, 2.2, 2.2) + ellipse(3.5, 0, 2.2, 2.2))]
    if p.get("silk"): tray.append(("silk: spinneret point", "silk", "M-5 0h10M0 -5v10"))
    if p.get("lantern"): tray.append(("lantern (glows)", "lantern", ellipse(0, 0, 7, 7)))
    O = []
    for k, (lab, n, d) in enumerate(tray):
        tx, ty = 22 + k * 54, 418
        O.append(f'<g id="{key}--{n}" inkscape:label="{lab}" transform="translate({tx} {ty})"><path {hint} d="{d}"/></g>')
        G2.append(text(tx, ty + 14, n, 5.5, SIM, "middle"))
    D.append('<g id="optional" inkscape:label="optional (delete what you don\'t use)">' + "".join(O) + "</g>")
    drawing = lay("drawing", "Drawing", sheet("".join(D)), ' stroke-linejoin="round" stroke-linecap="round"')
    # skeleton
    K = []
    for li, (lname, js, n, ws) in enumerate(p["limbs"]):
        jn = JOINTS[n] if lname != "claw" else ["shoulder", "elbow", "wrist", "tip"]
        K.append(f'<g id="{key}--{lname}--spine" inkscape:label="{lname} spine" data-joints="{" ".join(jn)}">')
        K.append(f'<path d="M' + "L".join(f"{f(a)} {f(b)}" for a, b in js) + f'" fill="none" stroke="{PICK}" stroke-width="0.8"/>')
        for k, (a, b) in enumerate(js):
            K.append(f'<circle id="{key}--{lname}--{jn[k]}" cx="{f(a)}" cy="{f(b)}" r="{2.6 if k == 0 else 2}" fill="{PLATE}" stroke="{PICK}" stroke-width="0.7"/>')
            if li == 0 or lname == "claw":
                K.append(text(f(a - 4), f(b - 3.5), jn[k], 5.5, PICK, "end"))
        K.append("</g>")
    traylab = lay("tray", "Optional tray labels (locked)", sheet(f'<rect x="4" y="404" width="{len(G2) * 54 + 10}" height="30" fill="none" stroke="{GHOST}" stroke-width="0.5"/>' + text(4, 401, "optional pieces: drag each onto the creature, or delete it", 5.5, OFF) + "".join(G2)), ' sodipodi:insensitive="true"')
    skeleton = lay("skeleton", "Skeleton: limb spines and joints (locked)", sheet("".join(K)), ' sodipodi:insensitive="true"')
    # notes
    fields = ["Name:", "Size (next to a 1.75 m person):", "Behaviour (walker, weaver, crawler, kraken…):", "How it moves:", "What swings or glows:"]
    N = [text(PANEL, notes_y, "Notes", 15, INK)]
    for k, s in enumerate(fields):
        yy = notes_y + 30 + k * 28
        N.append(text(PANEL, yy, s, 12, BODY, extra=f' id="note-{k+1}"'))
        N.append(f'<path d="M{PANEL} {yy+8}H{W-40}" stroke="{GHOST}"/>')
    notes = lay("notes", "Notes (edit the text)", "".join(N))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
            f'xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
            f'data-sheet-transform="translate({SX} {SY}) scale({SC})"><title>{p["title"]} creature template</title>{guides}{traylab}{drawing}{skeleton}{notes}</svg>')


os.makedirs(OUT, exist_ok=True)
for i, p in enumerate(PLANS):
    fn = os.path.join(OUT, f"{i+1:02d}-{p['key']}-template.svg")
    open(fn, "w").write(build(p)); print(fn)
