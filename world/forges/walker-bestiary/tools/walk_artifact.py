#!/usr/bin/env python3
"""Build walk.html as one page that needs no frame, for publishing where a page cannot hold one.

walk.html puts its controls round the Bestiary in a frame. This writes the same page with the
Bestiary's own markup and scripts in the same document, the Blender qilin carried as a script
(window.BLENDER_MECH_GLB), and every file it loads copied beside it.

    python3 world/forges/walker-bestiary/tools/walk_artifact.py <out-folder>

Writes <out-folder>/walk-page.html (no doctype: the publisher wraps it) and the files it loads.
"""
import base64, re, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent.parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else "walk-artifact"); out.mkdir(parents=True, exist_ok=True)

best = (HERE / "index.html").read_text()
walk = (HERE / "walk.html").read_text()

b_style = re.search(r"<style>(.*?)</style>", best, re.S).group(1)
b_fonts = re.search(r'<link rel="stylesheet"[^>]*>', best).group(0)
b_body = best[best.index('<div class="app">'):best.index('<script src=')]
b_scripts = best[best.index('<script src='):]

copies = {}
def take(rel_from_here):
    src = (HERE / rel_from_here).resolve()
    dst = str(src.relative_to(ROOT)) if "shared" in src.parts else "specimens/" + src.name
    copies[dst] = src
    return dst

def classic(m):
    path = m.group(1)
    if "forge-world.js" in path: return ""                       # nothing to save to on a published page
    return '<script src="%s"></script>' % take(path)
b_scripts = re.sub(r'<script src="([^"]+)"></script>', classic, b_scripts)
b_scripts = b_scripts.replace('from "../../../shared/engine/motion/walker.js"', 'from "./%s"' % take("../../../shared/engine/motion/walker.js"))
b_scripts = b_scripts.replace('from "../../../shared/engine/motion/walker-brain.js"', 'from "./%s"' % take("../../../shared/engine/motion/walker-brain.js"))
b_scripts = b_scripts.replace("PartLib.load()", 'PartLib.load("%s")' % take("../../../shared/data/creature-parts.json"))
b_scripts = b_scripts.replace("MechSlots.load()", 'MechSlots.load("%s")' % take("../../../shared/data/mech-slots.json"))
b_scripts = b_scripts.replace('"../../../shared/data/mechs/hand-mech.svg"', '"%s"' % take("../../../shared/data/mechs/hand-mech.svg"))
b_scripts = b_scripts.replace('"../../../shared/data/mechs/blender-mech.glb"', '"blender-mech.glb"')   # not fetched: the model rides in mech-glb.js
b_scripts = b_scripts.replace('const DEFAULT_ORDER = ["strider"];', 'const DEFAULT_ORDER = ["glbMech", "strider"];')
for name in re.findall(r'"([a-z-]+)": "[A-Z]', re.search(r"const SPECIMENS = \{(.*?)\};", b_scripts).group(1)) + ["scythe-leg"]:
    take("specimens/%s.svg" % name)
assert "../../" not in b_scripts, "a path still points outside the page"

glb = base64.b64encode((ROOT / "shared/data/mechs/blender-mech.glb").read_bytes()).decode()
(out / "mech-glb.js").write_text('window.BLENDER_MECH_GLB = "%s";\n' % glb)

w_head = walk[walk.index("<title>"):walk.index('<style id="wkStyle">')]
w_style = re.search(r'<style id="wkStyle">(.*?)</style>', walk, re.S).group(1)
w_body = walk[walk.index('<div class="wk" id="wk">'):walk.index('<script id="wkScript">')]
w_script = re.search(r'<script id="wkScript">(.*?)</script>', walk, re.S).group(1)
w_head = "\n".join(l for l in w_head.splitlines() if 'name="viewport"' not in l)
w_body = re.sub(r'<iframe id="wkFrame"[^>]*></iframe>', b_body.strip(), w_body)
fit = """
/* the Bestiary sits inside this page's stage */
#wkHost .app { display: block; height: 100%; padding: 0; }
#wkHost .stage { height: 100% !important; min-height: 0 !important; border: 0; }
#wkHost .rail, #wkHost .hint, #wkHost .tag { display: none; }
"""
page = "\n".join([w_head.strip(), b_fonts, "<style>" + b_style + "</style>", '<style id="wkStyle">' + w_style + fit + "</style>", w_body,
                  '<script>window.WALK_ARTIFACT = true;</script>', '<script src="mech-glb.js"></script>', b_scripts.strip(), '<script id="wkScript">' + w_script + "</script>", ""])
(out / "walk-page.html").write_text(page)
for dst, src in copies.items():
    (out / dst).parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(src, out / dst)
print("wrote", out / "walk-page.html", len(page) // 1024, "KB and", len(copies) + 1, "files")
for dst in sorted(copies): print(" ", dst)
