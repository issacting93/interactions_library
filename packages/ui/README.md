# @forge/ui

Interface: tokens and themes (css), the Forge design system (forge-ds/), hardware and TAPE 08 controls, the Bloom click menu.

Needs: nothing.

These are classic scripts: a page loads each with `<script src>` and it puts its name on `window` (in the order of what it needs). Nothing here imports anything yet; see `docs/PACKAGES.md`.

Scripts: `bloom.js`, `forge-anim.js`, `forge-ds/bloom-picker.js`, `hardware-ui.js`, `t8-ui.js`.

## One palette

The TAPE 08 values are in `tape08-tokens.css`. The game's pages (the tank, the field, the level editor) link that file and give its values their own short names; none of them states a shared colour itself. The same values are also the `[data-theme="t8"]` block of `tokens.css` and, under Forge Console's names, `forge-ds/tokens.json`. `node games/the-maw/tools/ui-tokens-check.mjs` fails if any of the three disagree or a game page stops linking the file; CI runs it.

Three steps of ink: `--t8-ink` (read), `--t8-ink-2` (labels), `--t8-ink-3` (quiet labels and units, the same value as Forge Console's `--ink-off`), and `--t8-ink-off` (drawn, not read).

One set of controls (2026-11-25): `t8-ui.css` has the buttons, fields, segmented choice (`t8-seg`), tab strip (`t8-tabstrip`), progress bar (`t8-bar`), dense table (`t8-table dense`) and hairline panel (`t8-panelbox`) a tool page needs. Use them by class, or put `t8-controls` on a page's body to style its bare buttons, fields and tables and the wrapper names a page's script already makes (`.seg`, `.prog`) the same way. The region rules carry no specificity, so a page's own rule for one button wins. Selected is `aria-pressed` or `aria-selected`, never a class. A live specimen is in `t8-ui-gallery.html` (Tool controls).

Used by the level editor and the field page (`games/the-maw/field`: its buttons and segmented choices; it keeps its own chips, the round Lunge and the corner buttons over the scene).

Not moved, and why:
- **The tank's play screen and stage menu** (`#play`, `.t8m`). Its buttons are drawn over the running scene (a dark fill under each), several are round or sized for a thumb, and the menu card's class is set by script (`pCard.className = ...`), so a class put in the markup is wiped. Opting the whole of `#play` into `t8-controls` would also reach the Mutate rig's nodes and switch, which lay themselves out. Moving it means changing the script that builds the menu.
- **The tank's rack** (the free tank's side panels). Each group is tinted its own colour and the chosen one is marked with a class, not `aria-pressed`. It is an older control, not the shared one.
- **The Mutate sheet** (`packages/maw/game-ui.js`). Its footer buttons are built by its own script with their own classes; not a clean swap.
