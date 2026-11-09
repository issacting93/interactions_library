"""Rig sheets: every walker laid flat as an editable SVG.

Opens the Walker Bestiary in headless Chromium, runs layout.js inside it, and writes
../rigs/NN-<walker>.svg plus ../rigs/walker-rigs-all.svg (all of them on one sheet, one Inkscape
layer per walker). Serve the repo root first:

    python3 -m http.server 8731          # from the repo root
    python3 world/forges/walker-bestiary/tools/rig-sheets.py

Needs Python Playwright (pip install playwright && playwright install chromium). Offline, set
THREE_DIR to a local three@0.160.0 package folder and the CDN requests are served from it.
"""
import asyncio, math, os, re
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "rigs")
URL = os.environ.get("WALKER_URL", "http://localhost:8731/world/forges/walker-bestiary/index.html")
CELL, GAP, LEFT, TOP, COLS = 1100, 40, 40, 160, 4
NUMBERED = ["strider", "brood", "worm", "pincer", "star", "colossus", "hooked-weaver", "hook-weaver",
            "halo-weaver-crawler", "veil-crawler", "ringed-drift-kraken", "hooded-lantern-kraken", "scythe-walker"]


async def render():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--use-gl=swiftshader"])
        pg = await b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        if os.environ.get("THREE_DIR"):
            async def local(r):
                rel = r.request.url.split("three@0.160.0/")[1]
                await r.fulfill(path=os.path.join(os.environ["THREE_DIR"], rel), content_type="application/javascript")
            await pg.route("https://cdn.jsdelivr.net/npm/three@0.160.0/**", local)
        await pg.goto(URL)
        await pg.wait_for_function("window.WalkerBestiary")
        out = await pg.evaluate(open(os.path.join(HERE, "layout.js")).read())
        await b.close()
        if errs: print("page errors:", errs)
        return out


def slug(name): return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def combine(sheets):
    rows = math.ceil(len(sheets) / COLS)
    W = LEFT * 2 + COLS * CELL + (COLS - 1) * GAP
    H = TOP + rows * CELL + (rows - 1) * GAP + LEFT
    plate = [f'<rect width="{W}" height="{H}" fill="#161618"/>']
    body = []
    for i, (n, sl, s) in enumerate(sheets):
        x0, y0 = LEFT + (i % COLS) * (CELL + GAP), TOP + (i // COLS) * (CELL + GAP)
        plate.append(f'<rect x="{x0}" y="{y0}" width="{CELL}" height="{CELL}" fill="none" stroke="#2e2d2a"/>')
        w, h = (float(v) for v in re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', s).groups())
        k = min(CELL / w, CELL / h)
        tx, ty = x0 + (CELL - w * k) / 2, y0 + (CELL - h * k) / 2
        inner = s[s.index(">", s.index("<svg")) + 1: s.rindex("</svg>")]
        inner = re.sub(r"<title>.*?</title>", "", inner, flags=re.S)
        inner = re.sub(r'<g id="plate"[^>]*>.*?</g>', "", inner, count=1, flags=re.S)
        inner = re.sub(r'id="([^"]+)"', lambda m: f'id="{sl}--{m.group(1)}"', inner)
        body.append(f'<g id="walker-{sl}" inkscape:groupmode="layer" inkscape:label="{n:02d} {sl}" '
                    f'transform="translate({tx:.1f} {ty:.1f}) scale({k:.4f})">{inner.strip()}</g>')
    plate.append(f'<text x="{LEFT}" y="78" fill="#ece8de" font-family="Martian Mono, IBM Plex Mono, monospace" font-size="44">Walker Bestiary · rigs</text>')
    plate.append(f'<text x="{LEFT}" y="112" fill="#8a867d" font-family="IBM Plex Mono, monospace" font-size="20">{len(sheets)} walkers · top view, nose up · limbs in their drawn shape · one layer per walker, one group per leg, one closed outline per bone</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
            f'xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
            f'<title>Walker Bestiary rigs</title>\n'
            f'<g id="plate" inkscape:groupmode="layer" inkscape:label="Plate (locked)" sodipodi:insensitive="true">{"".join(plate)}</g>\n'
            + "\n".join(body) + "\n</svg>\n")


async def main():
    out = await render()
    os.makedirs(OUT, exist_ok=True)
    keys = [k for k in NUMBERED if k in out] + [k for k in out if k not in NUMBERED]
    sheets = []
    for i, k in enumerate(keys):
        sl = slug(out[k]["name"]); fn = os.path.join(OUT, f"{i+1:02d}-{sl}.svg")
        open(fn, "w").write(out[k]["svg"]); sheets.append((i + 1, sl, out[k]["svg"]))
        print(os.path.relpath(fn), round(out[k]["w"]), "x", round(out[k]["h"]))
    open(os.path.join(OUT, "walker-rigs-all.svg"), "w").write(combine(sheets))
    print("rigs/walker-rigs-all.svg")


asyncio.run(main())
