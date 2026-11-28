"""Build World Scene (world/scenes/world-scene/World Scene.html) for publishing as an artifact.

    python3 tools/publish/world-scene.py <out-dir>

page.py does the packages/ scripts and the species split. This adds what page.py leaves out because it lives beside the page or
elsewhere in world/: the page's own scripts (src/*.js, places/*.js, the Forge host), its stylesheet, the city grammar's sheets
(fetched from js/grammar/) and the parts sheet (fetched from packages/kit/data/).
"""
import os, re, shutil, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PAGE_DIR = os.path.join(ROOT, 'world', 'scenes', 'world-scene')
out = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit(__doc__)

if os.path.exists(out): shutil.rmtree(out)
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'publish', 'page.py'), os.path.join(PAGE_DIR, 'World Scene.html'), out], check=True)

html_path = os.path.join(out, 'index.html')
html = open(html_path, encoding='utf8').read()

# the page's own files: kept where they are relative to the page (./src/, ./places/, ./world-scene.css, ./forge-host.js)
for name in os.listdir(PAGE_DIR):
    if name.endswith('.js') or name.endswith('.css'):
        shutil.copy(os.path.join(PAGE_DIR, name), os.path.join(out, name))
for sub in ('src', 'places', 'sigils'):
    shutil.copytree(os.path.join(PAGE_DIR, sub), os.path.join(out, sub))

# a script from elsewhere in world/ (not packages/): laid in js/ like page.py's
for m in set(re.findall(r'<script src="(\.\./[^"]+\.js)"', html)):
    src = os.path.normpath(os.path.join(PAGE_DIR, m))
    if os.sep + 'packages' + os.sep in src: continue
    shutil.copy(src, os.path.join(out, 'js', os.path.basename(src)))
    html = html.replace(f'<script src="{m}"', f'<script src="js/{os.path.basename(src)}"')
open(html_path, 'w', encoding='utf8').write(html)

# what the page fetches: the city grammar's sheets (beside city-grammar.js) and the parts sheet
os.makedirs(os.path.join(out, 'js', 'grammar'), exist_ok=True)
for sheet in ('districts.csv', 'modules.csv', 'sockets.csv'):
    shutil.copy(os.path.join(ROOT, 'packages', 'city', 'grammar', sheet), os.path.join(out, 'js', 'grammar', sheet))
os.makedirs(os.path.join(out, 'packages', 'kit', 'data'), exist_ok=True)
shutil.copy(os.path.join(ROOT, 'packages', 'kit', 'data', 'creature-parts.json'), os.path.join(out, 'packages', 'kit', 'data', 'creature-parts.json'))

# anything still pointing outside the folder is a miss
left = [s for s in re.findall(r'<script src="([^"]+)"', html) if s.startswith('../')]
print('built', out, '(missed: ' + ', '.join(left) + ')' if left else '')
