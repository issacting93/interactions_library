# Research-language templates (9:16)

Four reusable diagram templates in the visual language of `Design Research in the Age of AI (2).pdf`
(a 16:9 slide deck) — pure black ground, a single monospace face throughout, a letter-spaced
micro-label + title header with a hairline rule, a footer with the series name and a page index,
and a categorical colour system coding roles/categories across every diagram. Built for The Point
of Interface, but generic enough to reuse across any episode.

This is a **different thing** from `Visual_Essay/genui-ep1/` next door: that folder holds narration
b-roll tied to one specific script; this folder holds blank, swappable diagram shells.

## The four templates

| File | Ported from (deck page) | What changed for 9:16 |
|---|---|---|
| `timeline.html` | p.9, the multi-lane UX history chart | Six side-by-side swimlane columns don't fit 1080px wide, so time now flows top-to-bottom along a single spine, with each event's lane shown as a coloured tag instead of a full column. Keeps the dashed "today" tick and the boxed terminal node. |
| `network.html` | p.7–8, the hub-and-spoke node graphs | The deck's left-sidebar legend moves to a top row (no spare side column at 9:16). Hubs are laid out in a loose two-column flow down the page instead of a single wide spread. |
| `flowchart.html` | p.10, "Methods without rigour" | Rotated from a horizontal node chain to a vertical one — 5 nodes don't fit legibly across 1080px. Keeps the dashed, annotated "skip" arrow connecting non-adjacent nodes. |
| `history.html` | p.6, the dated label/value rows | Same pattern, just given more entries since 9:16 has far more vertical room than a 16:9 slide. Closes on a pull-quote, matching the deck's "They looked back to go forward." beat. |

Every template is **placeholder content** — open the file, find the `EVENTS` / `HUBS` / `STEPS` /
`ENTRIES` constant near the top of its `<script>` block, and replace the values. Layout, spacing,
and motion all key off that data, so nothing else needs to change.

## Shared foundation

```
templates/
  README.md
  research-core.css      shared tokens + header/footer/legend chrome (see its own header comment)
  essay-core.js           same deterministic time/easing helpers as genui-ep1 (copied, not linked,
                           so this folder stays portable on its own)
  capture-templates.mjs   puppeteer + ffmpeg → exports/<template>-9x16.mp4
  timeline.html / network.html / flowchart.html / history.html
  exports/
    <template>-9x16.mp4
```

`research-core.css` exposes: `.rt-border` (the inset hairline frame), `.rt-header` / `.rt-micro` /
`.rt-title` (the label+title block), `.rt-rule` (the divider under it), `.rt-footer` (series name +
page index), `.rt-legend` (a row of colour-dot + label pairs), plus the colour tokens
(`--rt-ground`, `--rt-ink`, `--rt-ink-2`, `--rt-line`, `--rt-part1/2/3`, `--rt-cat-*`). Reuse these
classes/variables in a new template rather than re-declaring the chrome from scratch.

## Social safe zones

`.rt-header` (top:260px) and `.rt-footer` (bottom:366px) are positioned to clear the region
Instagram Reels, TikTok, and YouTube Shorts each draw their own chrome over — the account/follow
strip at the top, the caption/sound-title band at the bottom, the like/comment/share rail on the
right. The margins (**top:250px, bottom:350px, right:160px**) are a conservative composite of all
three platforms' guidance (collected Oct 2026), sized to clear TikTok's rail — the most aggressive
of the three — rather than tuned per platform. Each template's own content (the timeline's events,
the network's hubs, the flowchart's steps, the history's entries and pull-quote) is positioned or
scaled to land inside that same budget: see each file's own header comment for its specific numbers.
`timeline.html` auto-distributes its events evenly across the available band by index rather than
using hand-placed y-values, so it stays safe-zone-clean for any number of events a new template
swaps in; the other three use hand-tuned values sized to their current data and may need re-checking
if you add significantly more content (`network.html`'s `HUBS`, `flowchart.html`'s `STEPS`,
`history.html`'s `ENTRIES`).

To preview a template against these margins, add `?safezone=1` to the URL (combine with `?driven=1`
for a frozen frame) — `essay-core.js`'s `injectSafeZoneGuide()` draws the unsafe bands in red and
the safe box in a green dashed outline. This is dev-only: `capture-templates.mjs` never passes
`safezone=1`, so it never reaches a rendered video. `window.SAFE_ZONE` in that same file holds the
four margin numbers if a new template's layout needs to check against them directly.

## A note on two recurring bugs found while building these

Three of the four templates shipped with the same mistake at first: a child element absolutely
positioned inside an already-offset container (e.g. `.chain{top:300px}`) had its own JS-computed
`top`/`left` *also* add that same 300px, double-offsetting it off-screen or far from where it
should be. If you add new positioned children inside `.lane`, `.chain`, `.entries`, etc., position
them **relative to that container's own origin** (don't re-add the container's offset). Caught and
fixed by rendering an intermediate frame and eyeballing it before export each time — worth doing
again for any new template built from these.

## Preview

```sh
# from the repo root
python3 -m http.server 8765
open http://localhost:8765/Instagram_Visuals/Visual_Essay/templates/timeline.html
```

Every template free-runs and loops on its own clock. Add `?driven=1` to freeze the free-run (used
by the capture script, not needed for manual preview).

## Export

```sh
cd Instagram_Visuals
npm install                                      # once: puppeteer-core (already a devDependency)
python3 -m http.server 8765                      # from the repo root, separate terminal
node Visual_Essay/templates/capture-templates.mjs timeline    # → exports/timeline-9x16.mp4
node Visual_Essay/templates/capture-templates.mjs network
node Visual_Essay/templates/capture-templates.mjs flowchart
node Visual_Essay/templates/capture-templates.mjs history
```

`capture-templates.mjs <template> [seconds] [fps]` — `seconds` defaults to that template's own loop
length (see `LOOP_S` at the top of the script); `fps` defaults to 60. Needs Google Chrome and
`ffmpeg`, same as the rest of `Instagram_Visuals`.

## Adding a fifth template

1. Copy the closest existing template as a starting point (its header/footer/rule markup already
   uses the shared `research-core.css` classes).
2. Replace its data constant and redraw logic; keep the `step(t)` pure-function-of-time pattern and
   `runEssay(step)` call so it stays capturable.
3. Add it to `LOOP_S` in `capture-templates.mjs`.
4. Render an intermediate frame with puppeteer and look at it before trusting the layout — see the
   note above on the double-offset bug.
