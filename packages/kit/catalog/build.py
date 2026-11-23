"""Build packages/kit/data/creature-catalog.json: families, clean sheet names and features, and a readable name for
every part, without changing any id.

Ids stay exactly as they are (P001..P649, "sheet-koi", "ringed-lance-swift-mk-ii"): recipes, rigs,
attach points and saved worlds all point at them. The catalogue is a display layer every page reads.

    node packages/kit/catalog/analyse.cjs     # only when creature-parts.json changes
    python3 packages/kit/catalog/build.py
"""
import json, os, re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = json.load(open(os.path.join(HERE, "..", "data", "creature-parts.json")))
SEEN = json.load(open(os.path.join(HERE, "analysis.json")))

# ── families: how the sheets group, by body plan ──────────────────────────────
FAMILIES = [      # id, name, blurb, hue, order. The orders and families follow packages/kit/data/creature-taxonomy.json (creatures grouped by silhouette).
    ("strands", "Strands", "Thin strings of beads or links.", "trk-10", "Spinata"),
    ("barbed-spines", "Barbed spines", "Columns of barbed segments.", "trk-10", "Spinata"),
    ("ringbacks", "Ringbacks", "Columns of ringed segments, with legs, claws or horns.", "trk-10", "Spinata"),
    ("winged-worms", "Winged worms", "One pair of wings at the head of a long tail.", "trk-6", "Cruciata"),
    ("twin-finned", "Twin-finned", "Wings at the head and fins again at the tail.", "trk-6", "Cruciata"),
    ("drapes", "Drapes", "Draped wings on a short dense body.", "trk-7", "Alata"),
    ("split-wings", "Split wings", "Two wings and almost no body.", "trk-7", "Alata"),
    ("swifts", "Swifts", "One or two pairs of sickle blades on a slim body.", "trk-9", "Falcata"),
    ("seraphs", "Seraphs", "Many wings and blades layered around an ornate body.", "trk-9", "Falcata"),
    ("wardens", "Wardens", "An eye set in a horned plate.", "trk-4", "Coronata"),
    ("wheels", "Wheels", "A ring with spikes, rays or limbs radiating from it.", "trk-4", "Coronata"),
    ("bells", "Bells", "A hood over many trailing tendrils.", "trk-2", "Velata"),
    ("twin-tails", "Twin-tails", "A body ending in two long tails.", "trk-2", "Velata"),
    ("mechs", "Mechs", "Modelled walkers traced flat into the kit (the Blender qilin).", "trk-8", ""),
    ("marks", "Marks and instruments", "Not creatures: the glyph alphabet and dial parts.", "trk-11", ""),
]

# ── sheets: id → (name, family, features) ─────────────────────────────────────
SHEETS = {
    "sheet-butterfly-worm": ("Butterfly worm", "winged-worms", ["butterfly wings", "segments", "fins"]),
    "sheet-dragon-winged-worm": ("Gryphon worm", "winged-worms", ["dragon wings", "segments"]),
    "sheet-dragon-winged-stub-worm": ("Stub drake", "drapes", ["dragon wings", "short body", "rings"]),
    "pearl-chasing-centiwyrm": ("Pearl centiwyrm", "ringbacks", ["many legs", "pearl eyes", "segments"]),
    "pearl-clawed-hundred-worm": ("Clawed centiwyrm", "ringbacks", ["claws", "pearl eyes", "segments"]),
    "sheet-studded-leech": ("Studded leech", "strands", ["studs", "shard plates"]),
    "sheet-serpent": ("Finned serpent", "ringbacks", ["coils", "horned head", "rings"]),
    "sheet-chain-colony": ("Bramble wyrm", "barbed-spines", ["linked bodies", "shard plates"]),
    "abyssal-lance-swift": ("Abyssal lance swift", "swifts", ["blade wings", "lance tail", "rings"]),
    "ringed-lance-swift": ("Ringed lance swift", "swifts", ["blade wings", "rings", "lance tail"]),
    "ringed-lance-swift-mk-ii": ("Twin-ring lance swift", "swifts", ["blade wings", "rings", "lance tail"]),
    "sheet-sickle-swift": ("Sickle swift", "swifts", ["sickle wings", "rings"]),
    "crowned-sickle-lancer": ("Crowned lancer", "swifts", ["sickle wings", "crown", "rings"]),
    "sheet-blade-hunter": ("Blade hunter", "barbed-spines", ["spine body"]),
    "ringed-lance-monarch": ("Lance monarch", "seraphs", ["shield wings", "crown", "lance"]),
    "ophan-halo-monarch": ("Ophan monarch", "seraphs", ["halo", "shield wings", "eyes"]),
    "halo-eyed-seraph": ("Halo-eyed seraph", "seraphs", ["halo", "eyes", "feather wings"]),
    "sheet-black-monarch": ("Black monarch", "split-wings", ["solid wings", "crown"]),
    "sheet-crown-moth": ("Crown moth", "winged-worms", ["crown", "moth wings", "rings"]),
    "sheet-eye-wing": ("Eye-wing", "seraphs", ["eyed wings", "solid fills"]),
    "sheet-koi-winged-dragon": ("Fin dragon", "twin-finned", ["koi fins", "claws", "horns"]),
    "sheet-winged-dragon": ("Spine dragon", "twin-finned", ["wings", "spine"]),
    "sheet-drape-vampire": ("Drape vampire", "drapes", ["draped wings"]),
    "sheet-unnamed-no-30": ("Shade bell", "bells", ["wisp wings", "horned head"]),
    "sheet-angler-tailed-jelly": ("Angler jelly", "twin-tails", ["bell", "lure tail"]),
    "sheet-bell-jelly": ("Bell jelly", "bells", ["bell", "tendrils"]),
    "sheet-comb-drifter": ("Comb drifter", "bells", ["comb fins", "tendrils"]),
    "sheet-lantern-wisp": ("Lantern wisp", "twin-tails", ["lanterns", "wisp tail"]),
    "sheet-glass-star": ("Glass star", "wheels", ["glass rays", "rings"]),
    "sheet-glass-manta": ("Glass manta", "twin-finned", ["wide fins", "spine"]),
    "sheet-koi": ("Sigil koi", "winged-worms", ["koi fins", "scales", "rings"]),
    "sheet-blade-puffer": ("Blade puffer", "wheels", ["blade fins", "rings"]),
    "sheet-fin-puffer": ("Fin puffer", "wheels", ["fan fins", "rings"]),
    "sheet-puffer-plated-angler": ("Halo angler", "twin-tails", ["plates", "lure", "rings"]),
    "sheet-lantern-angler": ("Lantern angler", "twin-tails", ["lure", "spine"]),
    "sheet-pincer-crawler": ("Pincer crawler", "ringbacks", ["pincers", "legs", "rings"]),
    "sheet-carapace-strider": ("Carapace strider", "wheels", ["carapace", "long legs"]),
    "sheet-plated-scavenger": ("Ring scavenger", "ringbacks", ["plates", "segments"]),
    "sheet-xenoglyph": ("Xenoglyph alphabet", "marks", ["glyphs"]),
    "sheet-spine-dial": ("Spine dial", "marks", ["dials", "switches"]),
    "sheet-new-ornaments": ("Ornament plates", "seraphs", ["medallions", "bodies", "crests"]),
    "sheet-drape-vampire-ii": ("Horned vampire", "drapes", ["draped wings", "horns", "jawed head"]),
    "sheet-new-a": ("Wishbone drake", "twin-finned", ["long wings", "bone waist", "tail fins"]),
    "sheet-new-b": ("Hook-wing drake", "drapes", ["draped wings", "segmented body", "tail fins"]),
    "sheet-new-c": ("Ring-heart drake", "drapes", ["draped wings", "lower fins", "ringed core"]),
    "sheet-blender-qilin": ("Blender qilin", "mechs", ["domed plates", "long legs", "upright head"]),
    "sheet-eye-plate": ("Thorn warden", "wardens", ["ringed eye", "horned plate", "claws"]),
}

# ── part features: what each Kit role reads as on a creature ──────────────────
FEATURE = {"core": "body", "halo": "halo", "buttress": "wing", "segment": "segment", "lamp": "lantern",
           "spire": "spine", "rib": "rib", "bead": "ring", "blade": "blade", "hook": "claw", "frieze": "frond"}
PRIORITY = ["core", "halo", "buttress", "segment", "lamp", "spire", "rib", "bead", "blade", "hook", "frieze"]


def roles_of(p):
    """Port of kit.html's rolesOf() (itself from Spire Forge); kept in step by hand."""
    if p["species"] == "sheet-xenoglyph":
        return ["glyph"]
    w, h = float(p["w"]), float(p["h"]); m = max(w, h); C = p["side"] == "center"; r = []
    if m < 14: return r
    if 24 <= w <= 95 and 12 <= h <= 52 and w >= h * 1.1: r.append("frieze")
    if not C and 18 <= m <= 60: r.append("hook")
    if C and abs(w - h) < 0.22 * w and 20 <= m <= 60: r.append("bead")
    if C and h >= 250 and w <= 230: r.append("core")
    if C and 25 <= h <= 95 and w <= 64 and h >= 1.25 * w: r.append("segment")
    if not C and 40 <= h <= 140 and h >= 1.9 * w: r.append("rib")
    if C and 100 <= w <= 250 and abs(w - h) < 0.16 * w: r.append("halo")
    if C and 24 <= w <= 100 and 30 <= h <= 130: r.append("lamp")
    if not C and 22 <= m <= 130: r.append("blade")
    if C and h >= 60 and w <= 38 and h >= 2.4 * w: r.append("spire")
    if not C and 90 <= m <= 240: r.append("buttress")
    return r


def feature_of(p, roles):
    if "glyph" in roles: return "glyph"
    if p["species"] == "sheet-spine-dial": return "dial"
    for k in PRIORITY:
        if k in roles: return FEATURE[k]
    w, h = float(p["w"]), float(p["h"])
    if max(w, h) < 14: return "fleck"
    if p["side"] != "center": return "wing" if max(w, h) > 130 else "fin"
    return "body" if max(w, h) >= 100 else "plate"


SIDE = {"left": "L", "right": "R", "center": "C"}

missing = sorted({p["species"] for p in PARTS} - set(SHEETS))
assert not missing, f"sheets without a catalogue entry: {missing}"

# hide what draws nothing, and exact repeats within a sheet (same 12x12 signature and size)
first = {}
parts_out = {}
counters = defaultdict(int)
by_sheet = defaultdict(list)
for p in PARTS:
    a = SEEN.get(p["id"], {})
    roles = roles_of(p)
    feat = feature_of(p, roles)
    key = (p["species"], a.get("sig"), round(float(p["w"])), round(float(p["h"])), p["side"])
    entry = {"feature": feat, "side": SIDE.get(p["side"], p["side"])}
    if a.get("ink", 0) < 12:
        entry["hidden"] = "empty"
    elif key in first:
        entry["hidden"] = "repeat"; entry["same"] = first[key]
    else:
        first[key] = p["id"]
    if "hidden" not in entry:
        counters[(p["species"], feat)] += 1
        entry["n"] = counters[(p["species"], feat)]
    parts_out[p["id"]] = entry
    by_sheet[p["species"]].append((p, entry, a))

for p in PARTS:
    e = parts_out[p["id"]]
    base = SHEETS[p["species"]][0]
    e["name"] = f'{base} {e["feature"]} {e["n"]:02d}' if "n" in e else f'{base} {e["feature"]} ({e["hidden"]})'

# sheets added with "named" take each part's name from its group id in the source file ("…#lower-lash" -> "Eye plate lower lash")
added_file = os.path.join(HERE, "added-sheets.json")
if os.path.exists(added_file):
    named = {os.path.basename(s["source"]) for s in json.load(open(added_file))["sheets"] if s.get("named")}
    for p in PARTS:
        if p.get("from", "").split("#")[0] in named and "#" in p.get("from", "") and p["id"] in parts_out:
            label = p["from"].split("#")[1].replace("-", " "); base = SHEETS[p["species"]][0]
            parts_out[p["id"]]["name"] = f"{base} {label}"

# the same drawing filed under several ids (kit-duplicates.py): every copy names its drawing (the first shown id), and the drawing lists them
drawings = {}
dup_file = os.path.join(HERE, "duplicates.json")
if os.path.exists(dup_file):
    sheet_of = {p["id"]: p["species"] for p in PARTS}
    for g in json.load(open(dup_file))["same"]:
        ids = [i for i in g["parts"] if i in parts_out]
        if len(ids) < 2: continue
        home = next((i for i in ids if "hidden" not in parts_out[i]), ids[0])
        for i in ids: parts_out[i]["drawing"] = home
        drawings[home] = {"parts": ids, "sheets": sorted({sheet_of[i] for i in ids}, key=lambda s: list(SHEETS).index(s))}

sheets_out = {}
order = 0
for fam, *_ in FAMILIES:
    for sid, (name, f, feats) in SHEETS.items():
        if f != fam: continue
        rows = by_sheet[sid]
        shown = [(p, e, a) for p, e, a in rows if "hidden" not in e]
        # the thumbnail: the biggest body, else the biggest wing or halo, else the most-inked part
        pool = shown or rows
        def rank(t):
            p, e, a = t
            pref = {"body": 3, "wing": 2, "halo": 1}.get(e["feature"], 0)
            return (pref, float(p["w"]) * float(p["h"]) if pref else a.get("ink", 0))
        hero = max(pool, key=rank)[0]["id"]
        order += 1
        sheets_out[sid] = {"name": name, "family": fam, "features": feats, "order": order, "hero": hero,
                           "parts": len(rows), "shown": len(shown),
                           "hidden": {"empty": sum(1 for _, e, _ in rows if e.get("hidden") == "empty"),
                                      "repeat": sum(1 for _, e, _ in rows if e.get("hidden") == "repeat")}}

out = {
    "about": "Display names for the parts kit. Ids never change; pages read names, families and hidden flags from here. drawings: line work filed under several ids (from duplicates.json), keyed by the id that stands for it; each such part names it in \"drawing\". Built by packages/kit/catalog/build.py.",
    "orders": [{"name": o["name"], "common": o["common"], "rule": o["rule"], "families": [f for f, _, _, _, od in FAMILIES if od == o["name"]]} for o in json.load(open(os.path.join(HERE, "..", "data", "creature-taxonomy.json")))["orders"]],
    "families": [{"id": i, "name": n, "blurb": b, "hue": h, "order": od, "sheets": [s for s, v in sheets_out.items() if v["family"] == i]} for i, n, b, h, od in FAMILIES],
    "sheets": sheets_out,
    "parts": parts_out,
    "drawings": drawings,
}
dst = os.path.join(HERE, "..", "data", "creature-catalog.json")
json.dump(out, open(dst, "w"), indent=1)
hid = sum(1 for e in parts_out.values() if "hidden" in e)
print(f"{len(parts_out) - sum(len(d['parts']) - 1 for d in drawings.values())} distinct drawings; {len(drawings)} filed more than once")
print(f"{len(sheets_out)} sheets in {len(FAMILIES)} families; {len(parts_out)} parts, {hid} hidden ({sum(1 for e in parts_out.values() if e.get('hidden')=='empty')} empty, {sum(1 for e in parts_out.values() if e.get('hidden')=='repeat')} repeats)")
