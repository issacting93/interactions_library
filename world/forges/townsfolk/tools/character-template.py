"""Townsfolk character template: a blank person to draw a new character over.

Writes ../templates/character-template.svg: five views (front, three-quarters, side, back) of an
average townsperson with no coat or hat, one closed shape per body part, the skeleton with named
joints, and notes on what each view needs. Serve the repo root first:

    python3 -m http.server 8731          # from the repo root
    python3 world/forges/townsfolk/tools/character-template.py

Needs Python Playwright. Offline, set THREE_DIR to a local three@0.160.0 package folder.
"""
import asyncio, os
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get("TOWNSFOLK_URL", "http://localhost:8731/world/forges/townsfolk/index.html")

PPM, ELEV = 200, 8
VIEWS = [
    {"key": "S", "az": 0, "label": "S · front", "need": "required"},
    {"key": "SW", "az": 45, "label": "SW · three-quarter front", "need": "optional"},
    {"key": "W", "az": 90, "label": "W · side, facing left", "need": "required"},
    {"key": "NW", "az": 135, "label": "NW · three-quarter back", "need": "optional"},
    {"key": "N", "az": 180, "label": "N · back", "need": "required"},
]
CW, CH, PIV = 400, 540, (200, 482)
LEFT, TOP, GAP = 60, 330, 30
MINT, PICK, SIM, PLATE, GHOST, INK, OFF = "#5be39a", "#e8b04a", "#5cc8e0", "#161618", "#2e2d2a", "#ece8de", "#8a867d"
FONT = "IBM Plex Mono, Menlo, monospace"
SPAN = {
    "thigh": ("hip", "knee"), "shin": ("knee", "ankle"), "foot": ("heel", "toe"),
    "upper": ("shoulder", "elbow"), "fore": ("elbow", "wrist"), "hand": ("wrist", "fingertip"),
}


async def get():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--use-gl=swiftshader"])
        pg = await b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        if os.environ.get("THREE_DIR"):  # offline: serve three from a local package folder
            async def local(r):
                rel = r.request.url.split("three@0.160.0/")[1]
                await r.fulfill(path=os.path.join(os.environ["THREE_DIR"], rel), content_type="application/javascript")
            await pg.route("https://cdn.jsdelivr.net/npm/three@0.160.0/**", local)
        await pg.goto(URL); await pg.wait_for_function("window.Townsfolk"); await pg.wait_for_timeout(1500)
        out = await pg.evaluate(open(os.path.join(HERE, "sprites.js")).read(), {"template": 7, "override": {"coat": "none", "hat": "none"}, "dirs": VIEWS, "ppm": PPM, "elevation": ELEV})
        await b.close()
        if errs: print(errs)
        return out


def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, size=13, fill=OFF, anchor="start", fam=FONT, extra=""):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-family="{fam}" font-size="{size}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'


def build(views):
    W = LEFT * 2 + 5 * CW + 4 * GAP
    LEG_Y = TOP + CH + 60
    H = LEG_Y + 470
    lay = lambda i, label, inner, extra="": f'<g id="{i}" inkscape:groupmode="layer" inkscape:label="{label}"{extra}>{inner}</g>'
    cx = lambda i: LEFT + i * (CW + GAP)
    G = [f'<rect width="{W}" height="{H}" fill="{PLATE}"/>']
    G.append(text(LEFT, 58, "Character template", 30, INK, fam=f"Martian Mono, {FONT}"))
    G.append(text(LEFT, 90, "A new townsperson for the Townsfolk rig, in the idle pose. Draw S, W and N; SW and NW are optional. I mirror the other three directions.", 15))
    steps = [
        "1  Draw each part as one closed shape in its group on the Drawing layer. Reshape or replace the dashed starter shape.",
        "2  Keep both ends of a part over its joint dots. To change proportions, unlock the Skeleton layer and move the dots with your shapes.",
        "3  Left limbs are enough: I mirror them. Draw both if the sides differ.",
        "4  Cyan dashed groups are optional pieces. Anything in a group marked \"swings\" will hang and swing on Verlet points.",
        "5  Face, buttons and seams are open lines inside the part they sit on. Faces show only in the views that can see them.",
        "6  Fill in the Notes, save as SVG, and send it back.",
    ]
    for k, s in enumerate(steps): G.append(text(LEFT, 130 + k * 24, s, 14, "#cfcac0"))
    G.append(text(LEFT, 290, f"200 px = 1 m · reference body 1.78 m · pivot (amber cross) = ground under the hips · camera {ELEV}° above the horizon, matching the sprite sheets", 12))
    for i, v in enumerate(views):
        x = cx(i)
        G.append(f'<rect x="{x}" y="{TOP}" width="{CW}" height="{CH}" fill="none" stroke="{GHOST}"/>')
        G.append(text(x + 14, TOP + 26, v["label"], 15, INK))
        G.append(text(x + CW - 14, TOP + 26, v["need"], 12, PICK if v["need"] == "required" else OFF, "end"))
        gx, gy = x + PIV[0], TOP + PIV[1]
        G.append(f'<path d="M{x+10} {gy}H{x+CW-10}" stroke="#34332f" fill="none"/>')
        G.append(f'<path d="M{gx-9} {gy}H{gx+9}M{gx} {gy-9}V{gy+9}" stroke="{PICK}" stroke-width="1.4" fill="none"/>')
    # legend
    req = [("head", "head-top → neck-top"), ("neck", "neck-base → neck-top"), ("torso", "pelvis → chest, shoulder to shoulder")]
    for side in "LR":
        for part in ("upper", "fore", "hand"): a, b = SPAN[part]; req.append((f"arm-{side}--{part}", f"{a}-{side} → {b}-{side}"))
    for side in "LR":
        for part in ("thigh", "shin", "foot"): a, b = SPAN[part]; req.append((f"leg-{side}--{part}", f"{a}-{side} → {b}-{side}"))
    opt = [("hat", "sits on head-top"), ("hair", "rides the head"), ("coat-skirt (swings)", "hangs from the pelvis; its hem swings"),
           ("scarf (swings)", "wraps neck-base; the tail swings"), ("held-item", "held in the left hand, e.g. lantern or cane"), ("face", "eyes and mouth as open lines")]
    G.append(text(LEFT, LEG_Y, "Parts in each view", 16, INK))
    G.append(text(LEFT, LEG_Y + 22, "group name and the joints it spans", 12))
    for k, (n, s) in enumerate(req):
        col, row = k // 8, k % 8
        x, y = LEFT + col * 560, LEG_Y + 56 + row * 26
        G.append(text(x, y, n, 13, MINT)); G.append(text(x + 190, y, s, 12))
    ox = LEFT + 2 * 560 + 60
    G.append(text(ox, LEG_Y, "Optional pieces", 16, INK))
    G.append(text(ox, LEG_Y + 22, "cyan dashed hints, delete any you don't use", 12))
    for k, (n, s) in enumerate(opt):
        y = LEG_Y + 56 + k * 26
        G.append(text(ox, y, n, 13, SIM)); G.append(text(ox + 220, y, s, 12))
    guides = lay("guides", "Guides (locked)", "".join(G), ' sodipodi:insensitive="true"')

    # skeleton + drawing
    K, D = [], []
    for i, v in enumerate(views):
        fr, nm = v["frame"], v["frame"]["named"]
        tx, ty = cx(i) + PIV[0], TOP + PIV[1]
        dots, labels = [], []
        for k, (x, y, _) in nm.items():
            big = k in ("pelvis", "head")
            dots.append(f'<circle id="{v["key"]}--joint--{k}" cx="{x}" cy="{y}" r="{4.2 if big else 3.4}"/>')
            if v["key"] in ("S", "W") and not k.startswith(("heel", "toe", "fingertip")) and not (v["key"] == "W" and k.endswith("-R")):
                side = 1 if (k.endswith("-L") and v["key"] == "S") or k in ("pelvis", "chest", "head", "neck-base", "neck-top", "head-top") else -1
                if v["key"] == "W": side = -1
                labels.append(f'<text x="{x + side*8}" y="{y + 3.5}" font-size="10" text-anchor="{"start" if side > 0 else "end"}">{k}</text>')
        K.append(f'<g id="{v["key"]}--skeleton" transform="translate({tx} {ty})"><path d="{fr["bones"]}" fill="none" stroke="{PICK}" stroke-width="1.3"/>'
                 f'<g fill="{PLATE}" stroke="{PICK}" stroke-width="1.2">{"".join(dots)}</g><g fill="{PICK}" font-family="{FONT}">{"".join(labels)}</g></g>')
        starter = f'fill="none" stroke="{MINT}" stroke-width="1.5" stroke-dasharray="7 5"'
        parts = []
        face = []
        for grp in fr["groups"]:
            if grp["name"] in ("leg-L", "leg-R", "arm-L", "arm-R"):
                for pth in grp["paths"]:
                    pid = f'{v["key"]}--{grp["name"]}--{pth["name"]}'
                    parts.append(f'<g id="{pid}" inkscape:label="{grp["name"]}--{pth["name"]}"><path {starter} d="{pth["d"]}"/></g>')
            else:
                main, dets = [], []
                for pth in grp["paths"]:
                    if pth["name"].startswith(("eye", "mouth")): face.append(pth); continue
                    (main if pth["cls"] == "part" else dets).append(f'<path {starter} d="{pth["d"]}"/>' if pth["cls"] == "part" else f'<path fill="none" stroke="{MINT}" stroke-width="1.1" stroke-dasharray="3 4" d="{pth["d"]}"/>')
                gname = grp["name"]
                parts.append(f'<g id="{v["key"]}--{gname}" inkscape:label="{gname}">{"".join(main + dets)}</g>')
        # optional hints from the joints
        hint = f'fill="none" stroke="{SIM}" stroke-width="1.3" stroke-dasharray="5 5"'
        j = {k: (a[0], a[1]) for k, a in nm.items()}
        hx, hy = j["head-top"]; m = PPM
        opts = []
        opts.append(("hat", f'<path {hint} d="M{hx-0.17*m:.1f} {hy+0.03*m:.1f}H{hx+0.17*m:.1f}M{hx-0.08*m:.1f} {hy+0.03*m:.1f}V{hy-0.22*m:.1f}H{hx+0.08*m:.1f}V{hy+0.03*m:.1f}"/>'))
        hc = j["head"]; r = abs(hy - hc[1])
        opts.append(("hair", f'<path {hint} d="M{hc[0]-r*0.95:.1f} {hc[1]:.1f}A{r*0.95:.1f} {r*1.08:.1f} 0 0 1 {hc[0]+r*0.95:.1f} {hc[1]:.1f}"/>'))
        px, py = j["pelvis"]; ky = (j["knee-L"][1] + j["ankle-L"][1]) / 2
        opts.append(("coat-skirt--swings", f'<path {hint} d="M{px-0.12*m:.1f} {py:.1f}L{px+0.12*m:.1f} {py:.1f}L{px+0.22*m:.1f} {ky:.1f}L{px-0.22*m:.1f} {ky:.1f}Z"/>'))
        nx, ny = j["neck-base"]
        opts.append(("scarf--swings", f'<path {hint} d="M{nx-0.1*m:.1f} {ny-0.03*m:.1f}H{nx+0.1*m:.1f}V{ny+0.03*m:.1f}H{nx-0.1*m:.1f}ZM{nx+0.04*m:.1f} {ny+0.03*m:.1f}V{ny+0.28*m:.1f}"/>'))
        fx, fy = j["fingertip-L"]
        opts.append(("held-item", f'<path {hint} d="M{fx-0.04*m:.1f} {fy-0.02*m:.1f}H{fx+0.04*m:.1f}V{fy+0.28*m:.1f}H{fx-0.04*m:.1f}Z"/>'))
        if face:
            opts.append(("face", "".join(f'<path fill="none" stroke="{SIM}" stroke-width="1.4" d="{p["d"]}"/>' for p in face)))
        og = "".join(f'<g id="{v["key"]}--{n}" inkscape:label="{n.replace("--swings", " (swings)")}">{s}</g>' for n, s in opts)
        D.append(f'<g id="{v["key"]}" inkscape:label="{v["key"]} ({v["need"]})" transform="translate({tx} {ty})" stroke-linejoin="round" stroke-linecap="round">'
                 f'<g id="{v["key"]}--body" inkscape:label="body parts">{"".join(parts)}</g><g id="{v["key"]}--optional" inkscape:label="optional pieces">{og}</g></g>')
    skeleton = lay("skeleton", "Skeleton: joints and bones (locked)", "".join(K), ' sodipodi:insensitive="true" opacity="0.85"')
    drawing = lay("drawing", "Drawing: one group per view, one group per part", "".join(D))
    # notes
    nx, ny = ox, LEG_Y + 56 + len(opt) * 26 + 40
    fields = ["Name:", "Height (m):", "Pace (brisk, steady, shuffling…):", "Held item and hand:", "Pieces that swing:", "How the dial takes them:"]
    N = [text(nx, ny, "Notes", 16, INK)]
    for k, f in enumerate(fields):
        y = ny + 34 + k * 30
        N.append(text(nx, y, f, 13, "#cfcac0", extra=f' id="note-{k+1}"'))
        N.append(f'<path d="M{nx} {y+8}H{nx+700}" stroke="{GHOST}"/>')
    notes = lay("notes", "Notes (edit the text)", "".join(N))
    return W, H, (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
                  f'xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
                  f'<title>Townsfolk character template</title>{guides}{drawing}{skeleton}{notes}</svg>')


views = asyncio.run(get())
W, H, svg = build(views)
out = os.path.join(HERE, "..", "templates", "character-template.svg")
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w").write(svg)
print(W, H, len(svg) // 1024, "KB")
