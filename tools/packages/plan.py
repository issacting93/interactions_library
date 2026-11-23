# Where each file under shared/ goes. Run from the repo root: python3 plan.py > moves.tsv
import os, sys
PKG = {  # package: script stems (flat in packages/<name>/)
  'core':    'rng eco-core surface svg-utils kit-utils registry watch',
  'kit':     'creature-arch creature-catalog creature-classical creature-record creature-cells maw-cells attach-points mech-slots ecology-species',
  'parts':   'part-solid limb-art part-lib',
  'motion':  'ik gaits skeleton creature-body walker walker-brain world-brain world-gen appendage-solid skin-leg solid-look looks species-rig creature-walk creature-rig creature-sprites ground-walkers',
  'ecology': 'ecology-sim ecology-diet ecology-director ecology-habitat ecology-walkers ecology-walk eco-engine ecology-loop',
  'render':  'ecology-render style-recipes route-atmo-gl2 creature-look holy-light',
  'flora':   'ecology-flora',
  'city':    'city-grammar city-grammar-mesh city-wfc city-placement terrain tower-engine tower-engine-gl2 tower-presets creature-spire naqsh-pattern-engine radial-lattice spire-generator forge-building rule-sets',
  'glyph':   'glyph-system script-search xenoglyph-engine sigil-generator',
  'ui':      'bloom hardware-ui t8-ui forge-anim bloom-picker',
  'maw':     'ecology-maw ecology-maw-ai maw-stages maw-run fangs maw-wing game-ui',
  'forge':   'tower-forge-ui forge-generators forge-registry forge-overrides forge-ai forge-env chimera map-elites node-graph-engine pixel-fx-engine gaze-camera pixel-fx-engine',
}
of = {s: p for p, ss in PKG.items() for s in ss.split()}
SPECIAL = [  # (old prefix, new prefix): whole folders, checked before the stems
  ('shared/data/', 'packages/kit/data/'),
  ('shared/engine/creature-catalog/', 'packages/kit/catalog/'),
  ('shared/engine/city/grammar/', 'packages/city/grammar/'),
  ('shared/engine/creatures/', 'packages/motion/creatures/'),        # the six built creatures and their README
  ('shared/engine/mech/blade-mech.js', 'packages/forge/mech/blade-mech.js'),
  ('shared/engine/mech/hex-mech.js', 'packages/forge/mech/hex-mech.js'),
  ('shared/engine/mech/creature-mech.js', 'packages/forge/mech/creature-mech.js'),
  ('shared/engine/mech/README.md', 'packages/forge/mech/README.md'),
  ('shared/engine/generators/README.md', 'packages/forge/generators.md'),
  ('shared/engine/creatures/registry.js', 'packages/core/registry.js'),
  ('shared/look/game/', 'packages/maw/'),
  ('shared/look/forge-ds/', 'packages/ui/forge-ds/'),
  ('shared/look/ui/', 'packages/ui/'),
  ('shared/look/skins/', 'packages/render/'),
  ('shared/look/style/', 'packages/render/'),
  ('shared/look/creature-look.js', 'packages/render/creature-look.js'),
  ('shared/look/', 'packages/ui/'),                                  # tokens, themes, forge-anim
  ('shared/vendor/', 'packages/core/vendor/'),
]
def dest(f):
    for a, b in sorted(SPECIAL, key=lambda x: -len(x[0])):
        if f == a or (a.endswith('/') and f.startswith(a)): return b + f[len(a):] if a.endswith('/') else b
    stem = os.path.basename(f)[:-3] if f.endswith('.js') else None
    if stem in of: return f'packages/{of[stem]}/{os.path.basename(f)}'
    return None
if __name__ == '__main__':
    bad = []
    for root, _, fs in os.walk('shared'):
        for n in fs:
            f = os.path.join(root, n); d = dest(f)
            if d: print(f + '\t' + d)
            else: bad.append(f)
    if bad: sys.stderr.write('UNPLACED:\n  ' + '\n  '.join(bad) + '\n'); sys.exit(1)
