# @forge/maw

The Maw's game: the Maw itself and its autopilot, stages, the run (built from games/the-maw/src/run), and its game UI (fangs, wing, HUD).

Needs: @forge/core, @forge/parts, @forge/motion, @forge/ecology.

These are classic scripts: a page loads each with `<script src>` and it puts its name on `window` (in the order of what it needs). Nothing here imports anything yet; see `docs/PACKAGES.md`.

Scripts: `ecology-maw-ai.js`, `ecology-maw.js`, `fangs.js`, `game-ui.js`, `maw-run.js`, `maw-stages.js`, `maw-wing.js`.
