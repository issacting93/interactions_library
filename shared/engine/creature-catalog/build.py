"""Build shared/data/creature-catalog.json: families, clean sheet names and features, and a readable name for
every part, without changing any id.

Ids stay exactly as they are (P001..P649, "sheet-koi", "ringed-lance-swift-mk-ii"): recipes, rigs,
attach points and saved worlds all point at them. The catalogue is a display layer every page reads.

    node shared/engine/creature-catalog/analyse.cjs     # only when creature-parts.json changes
    python3 shared/engine/creature-catalog/build.py
"""
import json, os, re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = json.load(open(os.path.join(HERE, "..", "..", "data", "creature-parts.json")))
SEEN = json.load(open(os.path.join(HERE, "analysis.json")))

# ── families: how the sheets group, by body plan ──────────────────────────────
FAMILIES = [
    ("wyrms", "Wyrms", "Long segmented bodies: worms, centiwyrms, leeches and serpents.", "trk-10"),
    ("swifts", "Swifts and lancers", "Fast fliers with blade or sickle wings and lance tails.", "trk-6"),
    ("monarchs", "Monarchs and seraphs", "Haloed, crowned and many-eyed: the ornate winged ones.", "trk-9"),
    ("dragons", "Dragons", "Winged and clawed, with draped or koi-finned wings.", "trk-7"),
    ("drifters", "Drifters", "Soft floaters: jellies, wisps, glass stars and mantas.", "trk-2"),
    ("fish", "Fish and puffers", "Finned swimmers: koi, puffers and anglers.", "trk-1"),
    ("crawlers", "Crawlers", "Legged and armoured: pincers, carapaces and plates.", "trk-8"),
    ("marks", "Marks and instruments", "Not creatures: the glyph alphabet and dial parts.", "trk-11"),
]

# ── sheets: id → (name, family, features) ─────────────────────────────────────
SHEETS = {
    "sheet-butterfly-worm": ("Butterfly worm", "wyrms", ["butterfly wings", "segments", "fins"]),
    "sheet-dragon-winged-worm": ("Dragon-winged worm", "wyrms", ["dragon wings", "segments"]),
    "sheet-dragon-winged-stub-worm": ("Stub worm", "wyrms", ["dragon wings", "short body", "rings"]),
    "pearl-chasing-centiwyrm": ("Pearl-chasing centiwyrm", "wyrms", ["many legs", "pearl eyes", "segments"]),
    "pearl-clawed-hundred-worm": ("Pearl-clawed hundred worm", "wyrms", ["claws", "pearl eyes", "segments"]),
    "sheet-studded-leech": ("Studded leech", "wyrms", ["studs", "shard plates"]),
    "sheet-serpent": ("Serpent", "wyrms", ["coils", "horned head", "rings"]),
    "sheet-chain-colony": ("Chain colony", "wyrms", ["linked bodies", "shard plates"]),
    "abyssal-lance-swift": ("Abyssal lance swift", "swifts", ["blade wings", "lance tail", "rings"]),
    "ringed-lance-swift": ("Ringed lance swift", "swifts", ["blade wings", "rings", "lance tail"]),
    "ringed-lance-swift-mk-ii": ("Ringed lance swift II", "swifts", ["blade wings", "rings", "lance tail"]),
    "sheet-sickle-swift": ("Sickle swift", "swifts", ["sickle wings", "rings"]),
    "crowned-sickle-lancer": ("Crowned sickle lancer", "swifts", ["sickle wings", "crown", "rings"]),
    "sheet-blade-hunter": ("Blade hunter", "swifts", ["spine body"]),
    "ringed-lance-monarch": ("Ringed lance monarch", "monarchs", ["shield wings", "crown", "lance"]),
    "ophan-halo-monarch": ("Ophan halo monarch", "monarchs", ["halo", "shield wings", "eyes"]),
    "halo-eyed-seraph": ("Halo-eyed seraph", "monarchs", ["halo", "eyes", "feather wings"]),
    "sheet-black-monarch": ("Black monarch", "monarchs", ["solid wings", "crown"]),
    "sheet-crown-moth": ("Crown moth", "monarchs", ["crown", "moth wings", "rings"]),
    "sheet-eye-wing": ("Eye-wing", "monarchs", ["eyed wings", "solid fills"]),
    "sheet-koi-winged-dragon": ("Koi-winged dragon", "dragons", ["koi fins", "claws", "horns"]),
    "sheet-winged-dragon": ("Winged dragon", "dragons", ["wings", "spine"]),
    "sheet-drape-vampire": ("Drape vampire", "dragons", ["draped wings", "horned skull", "hooked spine"]),
    "sheet-unnamed-no-30": ("Shade drake", "dragons", ["wisp wings", "horned head"]),
    "sheet-angler-tailed-jelly": ("Angler-tailed jelly", "drifters", ["bell", "lure tail"]),
    "sheet-bell-jelly": ("Bell jelly", "drifters", ["bell", "tendrils"]),
    "sheet-comb-drifter": ("Comb drifter", "drifters", ["comb fins", "tendrils"]),
    "sheet-lantern-wisp": ("Lantern wisp", "drifters", ["lanterns", "wisp tail"]),
    "sheet-glass-star": ("Glass star", "drifters", ["glass rays", "rings"]),
    "sheet-glass-manta": ("Glass manta", "drifters", ["wide fins", "spine"]),
    "sheet-koi": ("Koi", "fish", ["koi fins", "scales", "rings"]),
    "sheet-blade-puffer": ("Blade puffer", "fish", ["blade fins", "rings"]),
    "sheet-fin-puffer": ("Fin puffer", "fish", ["fan fins", "rings"]),
    "sheet-puffer-plated-angler": ("Plated angler", "fish", ["plates", "lure", "rings"]),
    "sheet-lantern-angler": ("Lantern angler", "fish", ["lure", "spine"]),
    "sheet-pincer-crawler": ("Pincer crawler", "crawlers", ["pincers", "legs", "rings"]),
    "sheet-carapace-strider": ("Carapace strider", "crawlers", ["carapace", "long legs"]),
    "sheet-plated-scavenger": ("Plated scavenger", "crawlers", ["plates", "segments"]),
    "sheet-xenoglyph": ("Xenoglyph alphabet", "marks", ["glyphs"]),
    "sheet-spine-dial": ("Spine dial", "marks", ["dials", "switches"]),
    "sheet-new-ornaments": ("Ornament plates", "monarchs", ["medallions", "bodies", "crests"]),
    "hook-weaver": ("Hook Weaver", "crawlers", ["hooked legs", "bodies"]),
    "scythe-walker": ("Scythe Walker", "crawlers", ["scythe legs", "bodies"]),
    "sheet-cloak-rogue": ("Cloak rogue", "wyrms", ["cloak", "ringed head", "fin pairs"]),
    "sheet-lattice-eel": ("Lattice eel", "wyrms", ["lattice body", "skull", "streamers"]),
    "sheet-frond-serpent": ("Frond serpent", "wyrms", ["fronds", "segments"]),
    "sheet-strike-lance": ("Strike lance", "swifts", ["blades", "lance body"]),
    "sheet-bead-siphon": ("Bead siphon", "drifters", ["beads", "fins", "strips"]),
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
    if p.get("feature"): return p["feature"]   # named by whoever drew or added it (add_parts.py, kit_repairs.py)
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
    if a.get("ink", 0) < 12 or p.get("frame") or p.get("retired"):   # draws nothing, or is only the sheet's frame (kit_repairs.py)
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

sheets_out = {}
order = 0
for fam, _, _, _ in FAMILIES:
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
    "about": "Display names for the parts kit. Ids never change; pages read names, families and hidden flags from here. Built by shared/engine/creature-catalog/build.py.",
    "families": [{"id": i, "name": n, "blurb": b, "hue": h, "sheets": [s for s, v in sheets_out.items() if v["family"] == i]} for i, n, b, h in FAMILIES],
    "sheets": sheets_out,
    "parts": parts_out,
}
dst = os.path.join(HERE, "..", "..", "data", "creature-catalog.json")
json.dump(out, open(dst, "w"), indent=1)
hid = sum(1 for e in parts_out.values() if "hidden" in e)
print(f"{len(sheets_out)} sheets in {len(FAMILIES)} families; {len(parts_out)} parts, {hid} hidden ({sum(1 for e in parts_out.values() if e.get('hidden')=='empty')} empty, {sum(1 for e in parts_out.values() if e.get('hidden')=='repeat')} repeats)")
