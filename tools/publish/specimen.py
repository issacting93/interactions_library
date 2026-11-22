"""Build the self-contained copy of Specimen that is published as the "Specimen" artifact.

The page in the repo (world/forges/fish-tool/Specimen.html) loads its scripts from shared/ by relative path. This writes a folder that
stands alone: index.html, every script it loads flattened to js/<name>, the kit (creature-parts.json), and the tank species split into
two files (species-a.js, species-b.js) so neither is over the artifact file limit. Every script the page names is found from the page
itself, so a new <script> in Specimen.html needs no change here.

    python3 tools/publish/specimen.py <out-dir>
    cd <out-dir> && python3 -m http.server 8743     # look at it, then publish the folder's files to the Specimen artifact

Two things differ from the repo page on purpose: the kit is fetched from beside the page, and solids are on unless #core=0."""
import json, os, re, shutil, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAGE = os.path.join(ROOT, "world/forges/fish-tool/Specimen.html")
out = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit(__doc__)
os.makedirs(os.path.join(out, "js"), exist_ok=True)
s = open(PAGE).read()
SPECIES = '<script src="../../../shared/engine/ecology/ecology-species.js"></script>'
assert SPECIES in s; s = s.replace(SPECIES, '<script src="species-a.js"></script>\n<script src="species-b.js"></script>')
seen = {}
def flat(m):
    rel = m.group(2); name = os.path.basename(rel); src = os.path.join(ROOT, "shared", rel)
    assert os.path.exists(src), "missing " + rel
    assert seen.setdefault(name, rel) == rel, "two scripts named %s (%s, %s): rename one" % (name, seen[name], rel)
    shutil.copy(src, os.path.join(out, "js", name)); return m.group(1) + "js/" + name + m.group(3)
s = re.sub(r'(src=")\.\./\.\./\.\./shared/([^"]+)(")', flat, s)
s = re.sub(r'(from ")\.\./\.\./\.\./shared/([^"]+)(")', lambda m: flat(m).replace('from "js/', 'from "./js/'), s)
for a, b in [('const parts = await window.PartLib.load();', 'const parts = await window.PartLib.load("creature-parts.json");'),
             ("core: hash.get('core') === '1' ? 1 : 0,", "core: hash.get('core') === '0' ? 0 : 1,")]:
    assert a in s, a; s = s.replace(a, b)
assert "../../../" not in s, "a path into the repo is left in the page"
open(os.path.join(out, "index.html"), "w").write(s)
shutil.copy(os.path.join(ROOT, "shared/data/creature-parts.json"), out)
# the species file, split in two: the first half sets window.__SPECIES_A; the second is the whole file with its SPECIES line taking the
# first half and adding the rest (everything after that line, the strokes-to-ribbons builder, is kept)
src = open(os.path.join(ROOT, "shared/engine/ecology/ecology-species.js")).read().split("\n")
li = next(i for i, l in enumerate(src) if l.startswith("const SPECIES = ["))
S = json.loads(src[li][16:].rstrip().rstrip(";")); tot = sum(len(json.dumps(x)) for x in S); acc = 0; cut = len(S)
for i, x in enumerate(S):
    acc += len(json.dumps(x))
    if acc >= tot / 2: cut = i + 1; break
a = "window.__SPECIES_A = " + json.dumps(S[:cut], separators=(",", ":")) + ";\n"
b = list(src); b[li] = "const SPECIES = window.__SPECIES_A.concat(" + json.dumps(S[cut:], separators=(",", ":")) + ");"
open(os.path.join(out, "species-a.js"), "w").write("// The tank species, first half. species-b.js holds the rest and the rest of ecology-species.js.\n" + a)
open(os.path.join(out, "species-b.js"), "w").write("\n".join(b))
print("built %s: %d scripts, species %d + %d" % (out, len(seen), cut, len(S) - cut))
for n in sorted(seen): print("  js/" + n)
