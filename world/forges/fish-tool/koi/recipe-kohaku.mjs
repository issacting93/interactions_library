// written by recipes.py
export default {
 "key": "koi-kohaku",
 "name": "Kohaku Koi",
 "blurb": "The pond koi seen from above: a blunt round head, paddle pectorals, a short soft forked tail, red patches on white.",
 "weight": 1,
 "swim": {
  "len": 1,
  "waves": 0.85,
  "amp": 0.9,
  "ampPow": 1.6,
  "bend": 1,
  "fin": 0.22,
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
