# The tank on an entity world: plan for stages 2 and 3

Written 2026-11-20. Replaces the earlier outline of stage 2 ("a shared decision model") and stage 3 ("data into components"). It is planned around the four changes on branch `body-first-food-web` (`1a3777e`, rebased onto `the-maw-game` at `9390d90`).

## Where things stand

- **Stage 1 is done** (`6e93ba6`, 18 November): one entity world, one schedule of named systems, one clock, one seeded random stream. The replay test proves a seed replays. The entity world is still a layer over the old engine records.
- **`body-first-food-web` adds four ideas**, reviewed below. It is not merged into `the-maw-game`.

## The four ideas, reviewed

Reviewed by reading the code and tests on the branch. The branch's own checks were not rerun here.

| Idea | What it does | Verdict | Gap to close |
|---|---|---|---|
| **Food web from bodies** | A swimmer eats what is 2 to 100 times lighter than itself (weight is length cubed). Plate makes prey count heavier; claws let a hunter take prey nearer its own weight. Prey fear whatever could eat them by the same rule. Hand-written menus still apply first. | Keep. It is the right foundation: a new creature gets a place in the web from its body, with no list to edit. | Only swimmers use it. The Maw still eats by its own rule (anything up to 2.6 times its length) and is left out of the fear rule. Walkers still eat by hand lists of species keys. Weight is recomputed on every question. |
| **Body first movement** | The Maw's body is sent at the wanted velocity and its feet step after (`CreatureBody.steer`). | Keep. It answers the drifty turning, and "a wanted velocity" is the right thing for any mind to hand any body. | Only the Maw under the player's hand uses it. The crew walkers and the autopilot do not. |
| **Mission before rings** | A run is a list of beats, each with what it needs and what it gives, checked so no beat needs something no earlier beat gave. Runs can be shortened safely. | Keep. | The checker only knows three abilities: eyes, sonar and swim. Climbing, the first gate in the design, is not tracked, and neither are the other abilities (cloak, lure, puff, sting and the rest). |
| **Bloom dispersion** | Bloom options are spread apart so they are not near-twins. | Keep. Not part of the entity work. | The kit catalogue now marks identical drawings (`drawing`); the bloom could drop those copies outright before spreading. |

One note on the science: the cited paper (Brose, Williams and Martinez, 2006) finds that food webs persist best when hunters are about 10 to 100 times heavier than their prey. The lower bound of 2 in the rule is a game choice, not the paper's figure. The comment in `ecology-diet.js` should say so.

## The replan in one line

Stage 2 makes **one body, one web and one intent** that every creature shares. Stage 3 moves the data into components so the tank can grow, and expresses missions, set pieces and interactions as data on top of it.

## Stage 2: one body, one web, one intent

The earlier stage 2 was "a shared decision model". The branch shows what should be shared: not the deciding itself, but the three things every decision reads or writes.

| Step | What is built | Done when |
|---|---|---|
| **2.1 Body** | Every entity (swimmer, walker, the Maw, carcass, pod) gets a `Body` component: weight, length, plate, claws, and what it moves through (water, ground, air). Set at spawn and when a creature grows or sheds. | The web reads `Body` only; nothing recomputes weight from species data. |
| **2.2 Web** | The eat and fear rules move from `ecology-diet.js` into the core (`games/the-maw/src/core/web.ts`, built into `eco-core.js`). One function answers "can a eat b" and "should b fear a" for any two bodies. Hand menus become a small table of exceptions. | The branch's five web tests pass against the core. Walkers and the Maw ask the same function. Prey fear the Maw by its weight, with cloak and mimic as modifiers. |
| **2.3 Intent** | Every mind writes an `Intent` component: a wanted velocity, an urgency, and at most one act (bite, flee, hold). Minds are the swimmers' flocking, the walker brain, the Maw's autopilot and the player's hand. Bodies read it: swimmers through their own steering, anything with legs through `CreatureBody.steer`. | The crew walkers move body first like the Maw. The autopilot and the player drive the Maw through the same component. The turn check stays at or under today's 0.41 to 0.43 body lengths of carry. |
| **2.4 Sense** | One system builds, for each entity, the short list of what it can perceive: hunters and prey by the web, within its sight. A coarse grid makes "who is near" cheap. | The swimmers' and walkers' own neighbour loops are gone; the fear rule no longer needs its own distance test. |

Order: 2.1 and 2.2 first (they are mostly moving code that already exists and is tested), then 2.3, then 2.4. Each step must leave the replay test passing and the five-ring run clean.

What this buys: a creature composed from kit parts can be dropped into the tank with a body and nothing else, and it will hunt, flee and be hunted correctly. That is what the new creatures (Ladder wyrm, Argus warden and the others) need to become living species.

## Stage 3: data in components, and the game as data

| Step | What is built | Done when |
|---|---|---|
| **3.1 Stores** | Position, velocity, body, diet and intent live in the core's own typed stores, not in the old engine records. The engine modules become systems that read and write components, starting with the swimmers' sense, steer and move (the three most expensive systems in the replay timing). | The replay still matches. A tank of about 500 creatures holds 60 frames a second in the timing test (today's tank runs about 50). |
| **3.2 Mission as data** | Every place declares what it needs and gives across all abilities, including climbing. The checker moves into the core. The director reads the mission to decide what to spawn. | A place edited into a dead end is reported for any ability, not only eyes, sonar and swim. |
| **3.3 Set pieces** | A set piece is an entity with a body, a trigger and its own needs and gives, placed by a ring's settings. | One hand-designed set piece runs in one ring from data alone. |
| **3.4 Dynamic interactions** | Interactions are rules over pairs of components: the web, plus tags such as sting, lure, hitch and infect. Adding one is adding a rule, not editing three engines. | The existing interactions (sting, harpoon, hitch, infect, the pod chain) run as pair rules with the same results in the replay. |

3.1 is the only step that changes performance. 3.2 to 3.4 are the items from the earlier "do these too" list (set pieces, dynamic interactions) and depend on stage 2, not on 3.1, so they can start as soon as stage 2 lands.

## Suggested first slice

Merge `body-first-food-web` into `the-maw-game`, then do 2.1 and 2.2 together: the `Body` component and the web in the core, with walkers and the Maw moved onto it. It is the smallest piece that changes what the game does, and everything after it reads `Body`.

## Open questions

- **Should the Maw obey the same band as everything else?** Today it can eat anything up to 2.6 times its length. On the shared web it would be limited to prey 2 to 100 times lighter, which makes early rings harder and growth matter more.
- **Should hand menus go entirely?** Keeping them as exceptions preserves cases like the jelly taking a moth its own size. Removing them makes the web fully emergent but changes the current balance.
- **Does classification matter to the web?** Orders and families are by shape only. They could bias behaviour (for example, all the spines ambush), but nothing uses them that way yet.
