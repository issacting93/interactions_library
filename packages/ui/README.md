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

The tank (`world/forges/fish-tool/Cybernetic Ecology.html`) and the Mutate rig and sheet (`packages/maw/game-ui.js`) follow the same rules, in their own stylesheets (2026-11-25, Zac: "restyle it as part of the system"). They do not link `t8-ui.css`: the tank's rules are older and far more specific, so it writes the shared values itself.
- Chosen is an amber fill with dark text everywhere: segments, kind chips, toggles, the Rings tab's ring numbers, the rig's Arc and Ring switch, an ability that is on.
- One accent. The rack's groups (View, Swim, Draw, Life, Pointer) and the dock's tabs each had their own colour on their controls; each now keeps it only as a dot by its label or tab. Sonar's cyan is gone: every ability is amber.
- Buttons: no fill, a hairline, 11 px caps at .2em, 10 px radius, 44 px (segments 38 in their 2 px frame; the 44 kinds 32, the kit's small size). Buttons over the scene sit on the panel colour at 90 %. The dock's current tab is ink with an amber underline.
- The round Lunge and dash pads stay round (they carry charge rings). The rig's drawn pieces (reticle, dial) use the token values written out, as SVG cannot read CSS variables.
- The rack is wider (248 px, was 212) so the larger caps keep each group on one line.
