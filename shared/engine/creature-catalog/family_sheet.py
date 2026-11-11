"""Build creatures-by-family.svg (repo root): every creature design, one line drawing each, by family.

Each creature is drawn from where its design lives in the system:

  kit       a species sheet in shared/data/creature-parts.json. Centre parts once; each left part again,
            mirrored about x = 200 (left to right, not turned). Parts the catalogue hides as empty (blank,
            retired, or the sheet's own frame) are left out.
  rig       an ecology species with no kit sheet: its rig drawing in
            world/forges/fish-tool/sigil-species-rig-svgs/mono/.
  specimen  a walker laid out in Bestiary Forge: its export in world/forges/walker-bestiary/specimens/.

Everything is restyled to one green line. Ids are prefixed per creature, so no id repeats and every mask a
shape points to is in the file. Run after any change to the kit:

    python3 shared/engine/creature-catalog/family_sheet.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
MONO = "world/forges/fish-tool/sigil-species-rig-svgs/mono/"
SPEC = "world/forges/walker-bestiary/specimens/"
LINE = "#3ea868"
COL, ROW, BOX_W, BOX_H = 278, 212, 236, 170      # cell pitch, and the box a drawing is fitted into
NUM = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")

ROSTER = [
    ("Wyrms", [("Butterfly Worm", "kit", "sheet-butterfly-worm"), ("Dragon-winged Worm", "kit", "sheet-dragon-winged-worm"),
               ("Dragon-winged Stub Worm", "kit", "sheet-dragon-winged-stub-worm"), ("Pearl-chasing Centiwyrm", "kit", "pearl-chasing-centiwyrm"),
               ("Pearl-clawed Hundred-worm", "kit", "pearl-clawed-hundred-worm"), ("Studded Leech", "kit", "sheet-studded-leech"),
               ("Ribbon Serpent", "kit", "sheet-serpent"), ("Chain Colony", "kit", "sheet-chain-colony"),
               ("Cloak Rogue", "kit", "sheet-cloak-rogue"), ("Lattice Eel", "kit", "sheet-lattice-eel"), ("Frond Serpent", "kit", "sheet-frond-serpent")]),
    ("Swifts & Lancers", [("Abyssal Lance Swift", "kit", "abyssal-lance-swift"), ("Ringed Lance Swift", "kit", "ringed-lance-swift"),
                          ("Ringed Lance Swift Mk II", "kit", "ringed-lance-swift-mk-ii"), ("Sickle Swift", "kit", "sheet-sickle-swift"),
                          ("Crowned Sickle Lancer", "kit", "crowned-sickle-lancer"), ("Blade Hunter", "kit", "sheet-blade-hunter"),
                          ("Strike Lance", "kit", "sheet-strike-lance")]),
    ("Monarchs & Seraphs", [("Ringed Lance Monarch", "kit", "ringed-lance-monarch"), ("Ophan Halo Monarch", "kit", "ophan-halo-monarch"),
                            ("Halo-eyed Seraph", "kit", "halo-eyed-seraph"), ("Black Monarch", "kit", "sheet-black-monarch"),
                            ("Crown Moth", "kit", "sheet-crown-moth"), ("Eye Wing", "kit", "sheet-eye-wing")]),
    ("Dragons", [("Koi-winged Dragon", "kit", "sheet-koi-winged-dragon"), ("Winged Dragon", "kit", "sheet-winged-dragon"),
                 ("Drape Vampire", "kit", "sheet-drape-vampire"), ("Shade Drake", "kit", "sheet-unnamed-no-30")]),
    ("Drifters", [("Angler-tailed Jelly", "kit", "sheet-angler-tailed-jelly"), ("Bell Jelly", "kit", "sheet-bell-jelly"),
                  ("Comb Drifter", "kit", "sheet-comb-drifter"), ("Lantern Wisp", "kit", "sheet-lantern-wisp"),
                  ("Glass Star", "kit", "sheet-glass-star"), ("Glass Manta", "kit", "sheet-glass-manta"), ("Bead Siphon", "kit", "sheet-bead-siphon")]),
    ("Fish & Puffers", [("Sigil Koi", "kit", "sheet-koi"), ("Blade Puffer", "kit", "sheet-blade-puffer"), ("Fin Puffer", "kit", "sheet-fin-puffer"),
                        ("Puffer-plated Angler", "kit", "sheet-puffer-plated-angler"), ("Lantern Angler", "kit", "sheet-lantern-angler")]),
    ("Crawlers", [("Pincer Crawler", "kit", "sheet-pincer-crawler"), ("Carapace Strider", "kit", "sheet-carapace-strider"),
                  ("Plated Scavenger", "kit", "sheet-plated-scavenger")]),
    ("Ground Walkers", [("Hooked Weaver", "specimen", "hooked-weaver.svg"), ("Hook Weaver", "kit", "hook-weaver"),
                        ("Halo Weaver Crawler", "specimen", "halo-weaver-crawler.svg"), ("Veil Crawler", "specimen", "veil-crawler.svg"),
                        ("Ringed Drift Kraken", "specimen", "ringed-drift-kraken.svg"), ("Hooded Lantern Kraken", "specimen", "hooded-lantern-kraken.svg"),
                        ("Scythe Walker", "kit", "scythe-walker")]),
]
NOTE = {"kit": "kit sheet · ", "rig": "ecology rig · ", "specimen": "Forge layout · "}


def prefix_ids(text, pre):
    """every id, and every reference to one, gets the creature's prefix; a reference with no id behind it is dropped"""
    have = set(re.findall(r'\sid="([^"]+)"', text))
    text = re.sub(r'\s(mask|clip-path)="url\(#([^)]+)\)"', lambda m: m.group(0) if m.group(2) in have else "", text)
    text = re.sub(r'\sid="([^"]+)"', lambda m: f' id="{pre}{m.group(1)}"', text)
    return re.sub(r"url\(#([^)]+)\)", lambda m: f"url(#{pre}{m.group(1)})", text)


def one_line(svg):
    """restyle the drawn paths (not the masks) to one line"""
    def path(m):
        tag = re.sub(r'\s(?:fill|stroke|stroke-width|stroke-opacity|fill-opacity|opacity|vector-effect|id|class|style)="[^"]*"', "", m.group(0))
        return tag[:5] + f' fill="none" stroke="{LINE}" stroke-width="1" vector-effect="non-scaling-stroke"' + tag[5:]
    svg = re.sub(r"<path\b[^>]*>", path, svg)
    return re.sub(r'(<g\b[^>]*?)\s(?:stroke-width|fill|stroke|opacity)="[^"]*"', r"\1", svg)


def wide_masks(defs):
    """a mask's default region follows its content's box; give it room so a moved or mirrored part isn't cut off"""
    return re.sub(r"<mask\b(?![^>]*\sx=)", '<mask x="-100000" y="-100000" width="200000" height="200000"', defs)


def from_kit(species, parts, hidden):
    mine = [p for p in parts if p["species"] == species and hidden.get(p["id"]) != "empty"]
    if not mine: raise SystemExit(f"no kit parts for {species}")
    defs, body, box = "", "", [1e9, 1e9, -1e9, -1e9]
    for p in mine:
        ox, oy, w, h = float(p["ox"]), float(p["oy"]), float(p["w"]), float(p["h"])
        art = f'<g transform="translate({ox} {oy})">{one_line(p["svg"])}</g>'
        defs += wide_masks(p["defs"]); body += art
        xs = [ox - w / 2, ox + w / 2]
        if p["side"] == "left":
            body += f'<g transform="matrix(-1 0 0 1 400 0)">{art}</g>'; xs += [400 - ox - w / 2, 400 - ox + w / 2]
        box = [min(box[0], *xs), min(box[1], oy - h / 2), max(box[2], *xs), max(box[3], oy + h / 2)]
    return defs, body, box


def from_file(path, kind):
    text = open(os.path.join(ROOT, path)).read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', text).group(1).split()]
    inner = text[text.index(">", text.index("<svg")) + 1: text.rindex("</svg>")]
    defs = "".join(re.findall(r"<defs>(.*?)</defs>", inner, flags=re.S)); inner = re.sub(r"<defs>.*?</defs>", "", inner, flags=re.S)
    if kind == "rig" and 'stroke="none"' in inner:
        # a baked rig: one path of fill triangles, one of line triangles. The line triangles have no width
        # (the width was in their normals), so each is a segment: keep that path and stroke it
        body = one_line("".join(m for m in re.findall(r"<path\b[^>]*>", inner) if re.search(r'fill="#5FD38D"', m, flags=re.I)))
    else:
        body = one_line(inner)
    if kind == "specimen": box = [0, 0, 400, 400]
    else:
        n = [float(x) for d in re.findall(r'\sd="([^"]+)"', body) for x in NUM.findall(d)]
        box = [min(n[0::2]), min(n[1::2]), max(n[0::2]), max(n[1::2])] if n else [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]]
    return wide_masks(defs), body, box


def main():
    parts = json.load(open(os.path.join(ROOT, "shared/data/creature-parts.json")))
    hidden = {k: v.get("hidden") for k, v in json.load(open(os.path.join(ROOT, "shared/data/creature-catalog.json")))["parts"].items()}
    cols, n, total = [], 0, 0
    rows = max(len(c) for _, c in ROSTER)
    for ci, (family, creatures) in enumerate(ROSTER):
        out = [f'<text x="0" y="22" font-family="monospace" font-size="15" font-weight="700" fill="#111">{family.replace("&", "&amp;")}</text>',
               f'<text x="0" y="36" font-family="monospace" font-size="9" fill="#888">{len(creatures)} creatures</text>']
        for ri, (name, kind, key) in enumerate(creatures):
            n += 1; pre = f"c{n:02d}-"
            defs, body, box = from_kit(key, parts, hidden) if kind == "kit" else from_file((MONO if kind == "rig" else SPEC) + key, kind)
            w, h = max(box[2] - box[0], 1), max(box[3] - box[1], 1)
            k = min(BOX_W / w, BOX_H / h)
            art = prefix_ids((f"<defs>{defs}</defs>" if defs.strip() else "") + body, pre)
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            out.append(f'<g id="{slug}" transform="translate(0,{40 + ri * ROW})">'
                       f'<text x="0" y="12" font-family="monospace" font-size="10" font-weight="700" fill="#111">{name}</text>'
                       f'<text x="0" y="23" font-family="monospace" font-size="7" fill="#aaa">{NOTE[kind]}{key}</text>'
                       f'<g transform="translate({COL / 2 - 9:.1f},{30 + BOX_H / 2:.1f}) scale({k:.5f}) translate({-(box[0] + box[2]) / 2:.2f},{-(box[1] + box[3]) / 2:.2f})">{art}</g></g>')
            total += 1
        cols.append(f'<g transform="translate({20 + ci * COL},20)">{"".join(out)}</g>')
    W, H = 20 + len(ROSTER) * COL + 20, 20 + 40 + rows * ROW + 20
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><title>Creatures by family</title>'
           f'<rect width="{W}" height="{H}" fill="#fff"/>' + "".join(cols) + "</svg>\n")
    open(os.path.join(ROOT, "creatures-by-family.svg"), "w").write(svg)
    print(f"creatures-by-family.svg: {total} creatures in {len(ROSTER)} families, {len(svg) // 1024} KB")


main()
