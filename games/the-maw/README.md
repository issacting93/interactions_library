# The Maw

A roguelike run over the Cybernetic Ecology tank (`world/forges/fish-tool/Cybernetic Ecology.html`).

**The tank handles everything alive:**
- the creatures, their motion and their AI (`EcologySim`);
- the Maw's rig, its eating and its mutations (`EcologyMaw`, `EcologyDiet`);
- the director, the habitat and the walkers;
- the look: WebGL, Night and Route, and the TAPE 08 HUD.

**This folder holds the run around it:**
- **Rings:** the tank's seven places (`maw-stages.js`), always in order, always inward. Each run varies them from its seed: creature counts, landmarks, the ground, and sometimes a creature from the ring before.
- **Mission:** a run is written as a mission before it is built as places. Each place is a beat: what the Maw must already have there (the place's `kit`) and what clearing it gives (its `goal`). `MawRun.create(seed, places, { rings })` can leave places out for a shorter run, but only ones nothing later depends on. With the seven places as shipped, the shortest run is five rings; the Spires and the Colony are the two that can go. `run.mission.missing` lists any ring that needs what no ring before it gives. In the tank: `?run&rings=5`.
- **Gates:** each ring's goal is the key to its way in. When the Maw has it, a gate opens at a spot on the floor. Reaching the gate takes the Maw to the next ring, carrying everything it has. Meeting the last ring's goal wins the run.
- **The nest:** death ends the run. What the Maw saw and ate goes into the bestiary, along with the runs, wins and deepest ring. It is kept on the device (`localStorage` key `maw-nest-v1`).

## The core

The tank is moving to an entity component system in stages. Stage 1 is done: nothing about how creatures behave has changed, but there is now one of each of these (`src/core`, built to `shared/engine/ecology/eco-core.js` as `window.EcoCore`):

- **World:** every creature, walker, carcass and the Maw is an entity. Its components point at the records the engine already keeps (`creature`, `diet`, `hunter`, `walker`, `maw`, `player`, `carcass`).
- **Schedule:** the systems in the one order they run: `creatures`, `diet`, `maw-ai`, `maw`, `director`, `endless`, `run`, `world`. Each is timed (`__eco.systems.report()`).
- **Clock:** one step a frame, of a whole number of 1/240 s quanta. Hit-stop and the slowed Mutate screen are its `scale`.
- **Random:** one seeded stream (`EcoCore.random`). The engine scripts draw from it and fall back to `Math.random` where the core isn't loaded. A run reseeds it for each ring.

## The engine (Rust, in the browser)

`engine/` is the simulation engine in Rust. It is compiled to WebAssembly and built into one classic script, `shared/engine/ecology/eco-engine.js` (`window.EcoEngine`), which the tank loads right after `eco-core.js`. The WebAssembly (about 28 KB) travels inside the script, so there is nothing to fetch and the published copy and the Vercel build pick it up with no change.

It takes over the core one piece at a time, behind the names the tank already uses. So far:

| Piece | Rust | Takes over |
|---|---|---|
| Random | `engine/src/rng.rs` | `EcoCore.random`, `EcoCore.reseed` |
| Clock | `engine/src/clock.rs` | `EcoCore.Clock` |
| Food web | `engine/src/web.rs` | `EcoCore.Web.ratio`, `eats`, `fears`, `refusal` |
| Sense | `engine/src/sense.rs` | the swimmers' neighbour grid and density count in `ecology-sim.js` |

Everything else (steering, movement, the walkers, the Maw, diet, drawing, UI) is still JavaScript.

- **Sense is the first piece whose data lives in the engine.** Positions, species and a skip flag are columns in the engine's memory (`EcoEngine.Sense`: `x`, `y`, `sp`, `skip`), which the page writes through typed arrays. The engine builds the grid and the page reads it back in place (`order`, `starts`, `density`), with nothing copied. This is stage 3.1 of the entity plan, started.
- **On or off, a seed plays out the same.** The engine is on by default. `?engine=js` turns it off. If WebAssembly will not start, the tank carries on in JavaScript and `EcoEngine.why` says why.
- **Build:** `npm run build:engine` (needs Rust with `rustup target add wasm32-unknown-unknown`). The built script is committed, so the tank and the deploy do not need Rust.
- **Check:**
  - `npm run test:engine`: the Rust tests (19).
  - `npm test`: includes `tests/engine.test.ts`, the shipped WebAssembly against the TypeScript core, number for number.
  - `python3 world/forges/fish-tool/tests/engine-replay.py [seeds]`: the replay script in the tank with the engine off and on; every creature must end in the same place.

To move the next piece over: write it in `engine/src`, export it in `ffi.rs`, give it a face in `src/engine/index.ts`, and add it to the replay check before turning it on.

**Who eats whom** comes from bodies (`EcologyDiet`, `RULES.web`): a hunter takes prey between 2 and 100 times lighter than itself, weight going as length cubed. A species' hand-written menu still holds on top, and a wisp grazer never hunts. Prey run from whatever could eat them by the same rule. `diet.web = "lists"` goes back to the menus alone. `tests/web.test.ts` covers it.

**The Maw is moved body first:** under the hand on level ground its body is sent at the wanted velocity (`CreatureBody.steer`) whether or not its feet are down, and the feet step after it. `RULES.walk.hand` and `RULES.walk.grip` in `ecology-maw.js` set how much.

`world/forges/fish-tool/tests/replay.py` starts a run twice from a seed, plays 30 s on a script through a gate, and checks that every creature ends in the same place.

Next: stage 2 moves behaviour out of the engine's big update functions into systems over plain components, one at a time. Stage 3 makes drawing a view that only reads components.

## Layout

```
src/core/           ecs.ts (World), rng.ts, clock.ts, schedule.ts, events.ts; index.ts exposes window.EcoCore
src/engine/index.ts the Rust engine's loader: exposes window.EcoEngine and takes over the core's pieces
engine/             the Rust engine (Cargo crate): rng, clock, web, sense, ffi
src/run/run.ts      the run: rings, gates, nest (pure data and rules, no DOM)
src/run/index.ts    exposes it as window.MawRun
tests/run.test.ts   against the tank's real places
```

`npm run build` writes `eco-core.js` and `maw-run.js` into `shared/engine/ecology/`, classic scripts the tank loads. Don't edit those files by hand. The tank's glue is the "run" block in the page: `runBegin`, `ringPlace`, `runStep`, `runCard` and `runSheet`.

## Play

- **Locally:** serve the repo root and open the tank with `?run`.
- **Published copy:** `node world/forges/fish-tool/tests/build-artifact.mjs <out> --run`. This builds the same page with its title set to The Maw, and it opens on the Run.
- **Endless:** `?endless` on the tank, or a build made with `--endless`, skips the menu and starts Endless as soon as the Maw is ready. The tide turns through the seven places every 90 s and each full lap brings more hunters. There is no goal: the run ends when the Maw is eaten or starves, and the best time is kept on the device (`localStorage` key `maw-endless`). It is also in the menu as ∞ Endless.

## Deploy (Vercel)

`vercel.json` in this folder builds the Endless site. In Vercel, import the repo and set **Root Directory** to `games/the-maw`. Leave "Include files outside the root directory in the Build Step" on (the default), because the build reads the tank and the shared engine from the repo.

- Install: nothing (the game is static files).
- Build: `node ../../world/forges/fish-tool/tests/build-artifact.mjs dist --endless`. This writes `dist/`: `index.html` (title "The Maw: Endless"), `js/` (31 scripts), `species-a.js` and `species-b.js` (the species data, split), and `creature-parts.json`. About 19 MB.
- Output: `dist/` (ignored by git).

To try the same build locally: run the build command above from this folder, then serve `dist/` (for example `python3 -m http.server -d dist`).

