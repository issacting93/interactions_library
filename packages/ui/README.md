# @forge/ui

Interface: tokens and themes (css), the Forge design system (forge-ds/), hardware and TAPE 08 controls, the Bloom click menu.

Needs: nothing.

These are classic scripts: a page loads each with `<script src>` and it puts its name on `window` (in the order of what it needs). Nothing here imports anything yet; see `docs/PACKAGES.md`.

Scripts: `bloom.js`, `forge-anim.js`, `forge-ds/bloom-picker.js`, `hardware-ui.js`, `t8-ui.js`.

## One palette

The TAPE 08 values are in `tape08-tokens.css`. The game's pages (the tank, the field, the level editor) link that file and give its values their own short names; none of them states a shared colour itself. The same values are also the `[data-theme="t8"]` block of `tokens.css` and, under Forge Console's names, `forge-ds/tokens.json`. `node games/the-maw/tools/ui-tokens-check.mjs` fails if any of the three disagree or a game page stops linking the file; CI runs it.

Three steps of ink: `--t8-ink` (read), `--t8-ink-2` (labels), `--t8-ink-3` (quiet labels and units, the same value as Forge Console's `--ink-off`), and `--t8-ink-off` (drawn, not read).

Not yet one: the controls themselves. The editor, the field and the tank each still write their own buttons, tabs and tables; `t8-ui.css` has a set nobody in the game uses yet.
