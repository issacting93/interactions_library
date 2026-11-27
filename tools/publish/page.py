"""Build a self-contained copy of a page that loads its scripts from packages/, for publishing as an artifact.

    python3 tools/publish/page.py <page.html> <out-dir>
    cd <out-dir> && python3 -m http.server 8743     # look at it, then publish the folder's files to the artifact

Writes index.html, every script the page loads from packages/ laid flat in js/<name>, and, when the page uses them, the tank species split
in two files (species-a.js, species-b.js: one published file may not be over 16 MB) and the kit (creature-parts.json, fetched from beside
the page). Every script is found from the page itself, so a new <script> needs no change here. The page may sit at any depth in the repo.

Used for the Maw's combat page and field (games/the-maw/combat, games/the-maw/field). Specimen and the Walker Bestiary keep their own
builds (specimen.py, bestiary.py), which also change a default or two."""
import json, os, re, shutil, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if len(sys.argv) < 3: sys.exit(__doc__)
PAGE, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
os.makedirs(os.path.join(out, "js"), exist_ok=True)
up = os.path.relpath(os.path.join(ROOT, "packages"), os.path.dirname(PAGE)).replace(os.sep, "/") + "/"   # e.g. ../../../packages/
s = open(PAGE).read()
SPECIES = '<script src="%skit/ecology-species.js"></script>' % up
species = SPECIES in s
if species: s = s.replace(SPECIES, '<script src="species-a.js"></script>\n<script src="species-b.js"></script>')
seen = {}
def flat(m):
    rel = m.group(2); name = os.path.basename(rel); src = os.path.join(ROOT, "packages", rel)
    assert os.path.exists(src), "missing " + rel
    assert seen.setdefault(name, rel) == rel, "two scripts named %s (%s, %s): rename one" % (name, seen[name], rel)
    shutil.copy(src, os.path.join(out, "js", name)); return m.group(1) + "js/" + name + m.group(3)
s = re.sub(r'(src=")' + re.escape(up) + r'([^"]+)(")', flat, s)
s = re.sub(r'(from ")' + re.escape(up) + r'([^"]+)(")', lambda m: flat(m).replace('from "js/', 'from "./js/'), s)
def css(m):   # a stylesheet from packages/ (the shared tokens): laid flat in css/
    rel = m.group(2); src = os.path.join(ROOT, "packages", rel); assert os.path.exists(src), "missing " + rel
    os.makedirs(os.path.join(out, "css"), exist_ok=True); shutil.copy(src, os.path.join(out, "css", os.path.basename(rel))); return m.group(1) + "css/" + os.path.basename(rel) + m.group(3)
s = re.sub(r'(href=")' + re.escape(up) + r'([^"]+\.css)(")', css, s)
kit = "PartLib.load()" in s
if kit:
    s = s.replace("PartLib.load()", 'PartLib.load("creature-parts.json")')
    shutil.copy(os.path.join(ROOT, "packages/kit/data/creature-parts.json"), out)
# the field reads levels and worlds from beside the page's folder (../levels, ../worlds): lay them beside the published page, and open the demo world
# when the address names nothing
if "'../worlds/'" in s or "'../levels/'" in s:
    gd = os.path.join(os.path.dirname(PAGE), "..")
    for d in ("levels", "worlds"):
        os.makedirs(os.path.join(out, d), exist_ok=True)
        for f in os.listdir(os.path.join(gd, d)):
            if f.endswith(".json"): shutil.copy(os.path.join(gd, d, f), os.path.join(out, d, f))
    s = s.replace("'../worlds/'", "'worlds/'").replace("'../levels/'", "'levels/'")
    if os.environ.get("DEFAULT_HASH"): s = s.replace("<script>", "<script>if (!location.hash) location.hash = '" + os.environ["DEFAULT_HASH"] + "';\n", 1)
assert up not in s, "a path into the repo is left in the page"
open(os.path.join(out, "index.html"), "w").write(s)
cut = 0
if species:
    # the first half sets window.__SPECIES_A; the second is the whole file with its SPECIES line taking the first half and adding the rest
    src = open(os.path.join(ROOT, "packages/kit/ecology-species.js")).read().split("\n")
    li = next(i for i, l in enumerate(src) if l.startswith("const SPECIES = ["))
    S = json.loads(src[li][16:].rstrip().rstrip(";")); tot = sum(len(json.dumps(x)) for x in S); acc = 0; cut = len(S)
    for i, x in enumerate(S):
        acc += len(json.dumps(x))
        if acc >= tot / 2: cut = i + 1; break
    b = list(src); b[li] = "const SPECIES = window.__SPECIES_A.concat(" + json.dumps(S[cut:], separators=(",", ":")) + ");"
    open(os.path.join(out, "species-a.js"), "w").write("// The tank species, first half. species-b.js holds the rest and the rest of ecology-species.js.\n"
                                                        "window.__SPECIES_A = " + json.dumps(S[:cut], separators=(",", ":")) + ";\n")
    open(os.path.join(out, "species-b.js"), "w").write("\n".join(b))
print("built %s: %d scripts%s%s" % (out, len(seen), ", species split at %d" % cut if species else "", ", kit" if kit else ""))
