"""Townsfolk sprite sheets: 8-direction walk cycles you can draw over.

For each of six townsfolk (ordinary and taken) writes ../sprites/NN-<name>[-taken].svg: 8 directions x
8 walk frames + idle, one closed shape per body part, the skeleton on its own layer, a pivot cross in
every cell. Serve the repo root first:

    python3 -m http.server 8731          # from the repo root
    python3 world/forges/townsfolk/tools/sprite-sheets.py

Needs Python Playwright. Offline, set THREE_DIR to a local three@0.160.0 package folder.
"""
import asyncio, json, os, re
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get("TOWNSFOLK_URL", "http://localhost:8731/world/forges/townsfolk/index.html")

PEOPLE = [1, 3, 7, 5, 6, 0]
DIRS = [  # az = where the camera sits around the person, 0 = in front of them
    {"key": "S", "az": 0, "label": "S", "sub": "toward you"},
    {"key": "SW", "az": 45, "label": "SW", "sub": ""},
    {"key": "W", "az": 90, "label": "W", "sub": "facing left"},
    {"key": "NW", "az": 135, "label": "NW", "sub": ""},
    {"key": "N", "az": 180, "label": "N", "sub": "away"},
    {"key": "NE", "az": 225, "label": "NE", "sub": ""},
    {"key": "E", "az": 270, "label": "E", "sub": "facing right"},
    {"key": "SE", "az": 315, "label": "SE", "sub": ""},
]
PPM, CW, CH, PIVOT, ELEV = 100, 192, 252, (96, 222), 8
LEFT, TOP, GAP = 110, 132, 24
MINT, PICK, WELL, PLATE, GHOST, INK, OFF = "#5be39a", "#e8b04a", "#121214", "#161618", "#2e2d2a", "#ece8de", "#8a867d"
FONT = "IBM Plex Mono, Menlo, monospace"


async def run():
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
        out = await pg.evaluate(open(os.path.join(HERE, "sprites.js")).read(), {"people": PEOPLE, "dirs": DIRS, "ppm": PPM, "elevation": ELEV})
        await b.close()
        if errs: print("page errors", errs)
        return out


def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def sheet(c):
    info, taken = c["info"], c["taken"]
    name = info["name"]; sl = slug(name) + ("-taken" if taken else "")
    cols = 9
    W = LEFT + 8 * CW + GAP + CW + 24
    H = TOP + len(c["rows"]) * CH + 28
    ms = info["period"] / 8 * 1000
    lay = lambda i, label, inner, extra="": f'<g id="{i}" inkscape:groupmode="layer" inkscape:label="{label}"{extra}>{inner}</g>'
    cellx = lambda col: LEFT + col * CW + (GAP if col == 8 else 0)
    celly = lambda row: TOP + row * CH
    # guides
    g = [f'<rect width="{W}" height="{H}" fill="{PLATE}"/>']
    hat = {"top": "top hat", "brim": "wide-brim hat", "hood": "hood", "none": "bare head"}[info["hat"]]
    coat = {"long": "long coat", "short": "short coat", "none": "no coat"}[info["coat"]]
    state = "Taken: a beat off and wrong joints at 90%" if taken else "Ordinary"
    g.append(f'<text x="{LEFT}" y="44" fill="{INK}" font-family="Martian Mono, {FONT}" font-size="22">{name}</text>')
    g.append(f'<text x="{LEFT}" y="68" fill="{OFF}" font-family="{FONT}" font-size="12">{info["H"]:.2f} m · {hat} · {coat} · {state}</text>')
    g.append(f'<text x="{LEFT}" y="88" fill="{OFF}" font-family="{FONT}" font-size="12">Walk cycle 8 frames at {ms:.0f} ms ({info["period"]*1000:.0f} ms per cycle, {info["speed"]:.2f} m/s) · frame 1 = left foot lands · idle in the last column</text>')
    g.append(f'<text x="{LEFT}" y="106" fill="{OFF}" font-family="{FONT}" font-size="12">Cell {CW}×{CH} px · 100 px = 1 m · pivot (amber cross) = ground under the hips, at {PIVOT[0]},{PIVOT[1]} in each cell · camera {ELEV}° above the horizon</text>')
    for col in range(cols):
        lab = "idle" if col == 8 else f"{col+1:02d}"
        g.append(f'<text x="{cellx(col)+CW/2}" y="{TOP-8}" fill="{OFF}" font-family="{FONT}" font-size="11" text-anchor="middle">{lab}</text>')
    for r, d in enumerate(c["rows"]):
        y = celly(r)
        g.append(f'<text x="{LEFT-14}" y="{y+CH/2}" fill="{INK}" font-family="{FONT}" font-size="15" text-anchor="end">{d["label"]}</text>')
        if d["sub"]: g.append(f'<text x="{LEFT-14}" y="{y+CH/2+16}" fill="{OFF}" font-family="{FONT}" font-size="10" text-anchor="end">{d["sub"]}</text>')
        for col in range(cols):
            x = cellx(col)
            g.append(f'<rect x="{x}" y="{y}" width="{CW}" height="{CH}" fill="none" stroke="{GHOST}"/>')
            gx, gy = x + PIVOT[0], y + PIVOT[1]
            g.append(f'<path d="M{x+6} {gy}H{x+CW-6}" stroke="#34332f" fill="none"/>')
            g.append(f'<path d="M{gx-6} {gy}H{gx+6}M{gx} {gy-6}V{gy+6}" stroke="{PICK}" fill="none"/>')
    guides = lay("guides", "Guides: cells, ground, pivots, labels (locked)", "".join(g), ' sodipodi:insensitive="true"')
    # sprites and skeleton
    S, K = [], []
    for r, d in enumerate(c["rows"]):
        for col, fr in enumerate(d["frames"]):
            fid = f'{d["key"]}-{"idle" if col == 8 else f"{col+1:02d}"}'
            tx, ty = cellx(col) + PIVOT[0], celly(r) + PIVOT[1]
            parts = []
            for grp in fr["groups"]:
                inner = []
                for pth in grp["paths"]:
                    if pth["cls"] == "part": a = f'fill="{PLATE}" stroke="{MINT}" stroke-width="1.1"'
                    elif pth["cls"] == "eye": a = f'fill="none" stroke="{PICK}" stroke-width="1.5"'
                    else: a = f'fill="none" stroke="{MINT}" stroke-width="0.9"'
                    inner.append(f'<path id="{sl}--{fid}--{grp["name"]}--{pth["name"]}" {a} d="{pth["d"]}"/>')
                parts.append(f'<g id="{sl}--{fid}--{grp["name"]}">{"".join(inner)}</g>')
            S.append(f'<g id="{sl}--{fid}" transform="translate({tx} {ty})" stroke-linejoin="round" stroke-linecap="round">{"".join(parts)}</g>')
            dots = "".join(f'<circle cx="{j[0]}" cy="{j[1]}" r="1.7"/>' for j in fr["joints"])
            K.append(f'<g id="{sl}--{fid}--skeleton" transform="translate({tx} {ty})"><path d="{fr["bones"]}" fill="none" stroke="{PICK}" stroke-width="0.9"/><g fill="{PLATE}" stroke="{PICK}" stroke-width="0.8">{dots}</g></g>')
    sprites = lay("sprites", "Sprites: one group per frame, one closed shape per body part", "".join(S))
    skel = lay("skeleton", "Skeleton (hide while drawing)", "".join(K), ' opacity="0.8"')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
           f'xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
           f'<title>{name} sprite template{" (taken)" if taken else ""}</title>{guides}{sprites}{skel}</svg>')
    return sl, svg


async def main():
    data = await run()
    out_dir = os.path.join(HERE, "..", "sprites"); os.makedirs(out_dir, exist_ok=True)
    over = 0
    names = []
    for c in data:
        for d in c["rows"]:
            for fr in d["frames"]:
                x0, y0, x1, y1 = fr["bounds"]
                if x0 + PIVOT[0] < 0 or x1 + PIVOT[0] > CW or y0 + PIVOT[1] < 0 or y1 + PIVOT[1] > CH:
                    over += 1; print("  over", c["info"]["name"], c["taken"], d["key"], [round(v) for v in (x0 + PIVOT[0], y0 + PIVOT[1], x1 + PIVOT[0], y1 + PIVOT[1])])
        sl, svg = sheet(c)
        n = PEOPLE.index(c["idx"]) + 1
        fn = os.path.join(out_dir, f"{n:02d}-{sl}.svg")
        open(fn, "w").write(svg); names.append(fn)
        print(os.path.relpath(fn), len(svg) // 1024, "KB")
    print("frames outside their cell:", over)

asyncio.run(main())
