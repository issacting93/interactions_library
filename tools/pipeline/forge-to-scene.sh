#!/bin/sh
# Forge -> World Scene: one command from what is made in the forges to what is published.
#   tools/pipeline/forge-to-scene.sh [stage ...]      (no stage = all, in this order)
#     sigils   Sigil Forge seals -> the gold etching atlas the towers wear
#     towers   every Forge spire tower built as solids (Solid Tower code), checked with no browser
#     scene    World Scene headless: smoke test, then the scene check against the baseline
#     build    the publishable folder (OUT, default /home/claude/ws-pub) and the changed-file list (OUT.files.json)
# A stage that fails stops the run. Publishing itself is the Artifact tool: it takes OUT.files.json (only files that differ from the last build).
set -e
cd "$(dirname "$0")/../.."
OUT=${OUT:-/home/claude/ws-pub}
STAGES=${*:-sigils towers scene build}
for s in $STAGES; do
  echo "== $s"
  case $s in
    sigils) tools/sigil-atlas/build.sh ;;
    towers) node tools/pipeline/solid-towers.mjs ;;
    scene)  /home/claude/ws.sh world-scene-smoke.mjs | tail -3; /home/claude/ws.sh world-scene-check.mjs | tail -20 ;;
    build)
      [ -d "$OUT" ] && (cd "$OUT" && find . -type f -exec sha256sum {} + | sort -k2 > "$OUT.prev.sha") || : > "$OUT.prev.sha"
      python3 tools/publish/world-scene.py "$OUT" | tail -1
      (cd "$OUT" && find . -type f -exec sha256sum {} + | sort -k2) > "$OUT.sha"
      python3 - "$OUT" <<'PY'
import sys, json
out = sys.argv[1]
def rd(p):
    try: return dict((l.split(None, 1)[1].strip(), l.split()[0]) for l in open(p) if l.strip())
    except OSError: return {}
prev, cur = rd(out + '.prev.sha'), rd(out + '.sha')
ch = [k[2:] for k, v in cur.items() if prev.get(k) != v]
json.dump([{'as': f, 'path': out + '/' + f} for f in ch], open(out + '.files.json', 'w'))
print(len(ch), 'files changed since the last build ->', out + '.files.json')
PY
      ;;
    *) echo "unknown stage $s"; exit 2 ;;
  esac
done
