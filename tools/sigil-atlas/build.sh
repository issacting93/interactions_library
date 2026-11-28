#!/bin/sh
# Sigil Forge seals -> world/scenes/world-scene/sigils/seal-atlas.png (4 x 2 of 512 px, gold on transparent).  Needs node, rsvg-convert, python3 + Pillow.
set -e
cd "$(dirname "$0")/../.."
node tools/sigil-atlas/gen.js
python3 - <<'PY'
import subprocess
from PIL import Image
A = Image.new('RGBA', (2048, 1024), (0, 0, 0, 0))
for i in range(8):
    subprocess.run(['rsvg-convert', '-w', '512', '-h', '512', f'assets/sigils/seal-{i}.svg', '-o', f'/tmp/seal-{i}.png'], check=True)
    A.alpha_composite(Image.open(f'/tmp/seal-{i}.png').convert('RGBA'), ((i % 4) * 512, (i // 4) * 512))
A.save('world/scenes/world-scene/sigils/seal-atlas.png', optimize=True)
print('atlas written')
PY
