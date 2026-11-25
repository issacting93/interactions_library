"""Writes recipe-<name>.mjs for each koi concept: the name, blurb, swim and ecology pipeline/from-svg.mjs gives a new tank species.
They school and graze as the Sigil Koi does (BEH and ECO copied from it), with a small population so a mixed tank is not flooded."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
BEH = {"mood": "Schooler", "text": "Calm and sociable. Drifts in loose schools, grazes on wisps, and the school scatters together when something hunts it.",
       "school": 1.1, "wander": 0.4, "turn": 200, "vortex": 1, "z": [0.15, 0.6], "minSp": 0.3, "prey": ["wisp"], "sight": 3, "chase": 0.3}
ECO = {"pop": 2, "eats": ["wisp"], "graze": True, "catch": 0.3, "rest": 2, "flee": "school", "contagion": 1.3}
KOI = {
  "kohaku": ("Kohaku Koi", "The pond koi seen from above: a blunt round head, paddle pectorals, a short soft forked tail, red patches on white.", dict(waves=0.85, amp=0.9, fin=0.22, speed=0.85)),
  "butterfly": ("Butterfly Koi", "Long-finned, after paper koi lanterns: feathered pectorals and a long trailing tail, porcelain scales.", dict(waves=0.8, amp=0.85, fin=0.34, speed=0.75)),
  "sumi": ("Sumi Koi", "An ink-brush koi: fins and tail drawn as ragged strands, black on pale.", dict(waves=0.9, amp=1.0, fin=0.3, speed=0.85)),
  "ember": ("Ember Koi", "A koi of overlapping copper shards, flame fins and a long tail, lit from inside.", dict(waves=0.85, amp=0.95, fin=0.28, speed=0.8)),
  "ghost": ("Ghost Koi", "The deep koi: long and slender, a veil tail, half clear.", dict(waves=0.75, amp=0.8, fin=0.32, speed=0.7)),
}
for k, (name, blurb, sw) in KOI.items():
    swim = dict(len=1, waves=0.9, amp=1, ampPow=1.6, bend=1, fin=0.21, lag=0, sep=1, speed=1); swim.update(sw)
    rec = dict(key="koi-" + k, name=name, blurb=blurb, weight=1, swim=swim, ecology=dict(beh=BEH, eco=ECO))
    open(os.path.join(HERE, f"recipe-{k}.mjs"), "w").write("// written by recipes.py\nexport default " + json.dumps(rec, indent=1) + ";\n")
print("recipes:", ", ".join(KOI))
