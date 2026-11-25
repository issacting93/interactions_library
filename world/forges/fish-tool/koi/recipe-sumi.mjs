// written by recipes.py
export default {
 "key": "koi-sumi",
 "name": "Sumi Koi",
 "blurb": "An ink-brush koi: fins and tail drawn as ragged strands, black on pale.",
 "weight": 1,
 "swim": {
  "len": 1,
  "waves": 0.9,
  "amp": 1.0,
  "ampPow": 1.6,
  "bend": 1,
  "fin": 0.3,
  "lag": 0,
  "sep": 1,
  "speed": 0.85
 },
 "ecology": {
  "beh": {
   "mood": "Schooler",
   "text": "Calm and sociable. Drifts in loose schools, grazes on wisps, and the school scatters together when something hunts it.",
   "school": 1.1,
   "wander": 0.4,
   "turn": 200,
   "vortex": 1,
   "z": [
    0.15,
    0.6
   ],
   "minSp": 0.3,
   "prey": [
    "wisp"
   ],
   "sight": 3,
   "chase": 0.3
  },
  "eco": {
   "pop": 2,
   "eats": [
    "wisp"
   ],
   "graze": true,
   "catch": 0.3,
   "rest": 2,
   "flee": "school",
   "contagion": 1.3
  }
 }
};
