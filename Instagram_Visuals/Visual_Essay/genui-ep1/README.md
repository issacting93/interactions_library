# Visual essay: Generative UI Ep.1 — The Point of Interface

Supporting visuals for `Visual_Essay/Generative UI Ep.1 — Live Real-Time Generation Script.md`
(≈1:50, 9:16 — "The Point of Interface," a 3-part design series; this episode covers *runtime*
generative UI only — build-time is parked for a later part). Built as its own mini pipeline,
parallel to `Instagram_Visuals/pieces/` — these are narration b-roll for one script, not standalone
grid posts, so they don't go through `stage/stage.html`'s STORY/SPEC/EXPLODED contract. The capture
convention (`?driven=1` + `window.essayStep(ms)`, deterministic puppeteer frame-stepping) is
borrowed from `pieces/gear-lock/capture-story.mjs`.

**The script was substantially restructured partway through production** (new intro, a "two types"
framing beat, Meta/Google examples, and the accessibility/personalization pairing replaced the
original hook → history → today → insight → outro shape). Several shots built for the earlier
draft are now explicitly **parked for later parts** by the script itself — see that section below.
They're kept in `shots/` rather than deleted, since parts 2 and 3 will likely want them.

## Visual language

All ten shots are re-skinned to the "Design Research in the Age of AI" system (the same one
`../templates/research-core.css` and `../design-system/` document) — near-black ground, IBM Plex
Mono as the only typeface, hairline rules, and the deck's own motifs (the dot grid, the Venn
"human ring + AI disc" mark used in `intro-title.html`). The earlier TAPE 08 retro-sci-fi look
(Martian Mono, cyan HUD rings, amber `#E8B04A`) is fully retired from this folder.

On top of the base tokens, the episode carries its own small colour grammar, applied consistently
across all ten shots rather than per-file:

- **Violet (`--rt-part1` / `#9B90E8`)** — this show's own identity colour, since the episode is
  literally "Part 1 of 3." Used for the recurring accent: the wordmark highlight and chip in
  `intro-title.html`, the rule and chip in `endcard.html`, the cursor in `vibe-code.html`, the
  fulcrum and reading text in `seesaw.html`.
- **Teal (`--rt-cat-teal` / `#4FD9A8`)** — "this is live / generating right now": the real-time
  band in `genui-vs-genai.html`, the artifact label/dot/bars in `chat-canvas.html`, the callout +
  live-dot in `frozen-app.html`.
- **Amber (`--rt-cat-amber` / `#E0A857`)** — the paired "built / static" state opposite teal, used
  only in `genui-vs-genai.html`'s build-time band.
- **Coral (`--rt-part2` / `#E8573E`)** — the warning stamp in `feed-placeholder.html`.
- **Part1/part2/part3 as listener identity** — `wrapped-cards.html` and `shelf-grid.html` both
  depict the same three stand-in listeners; their colours are now tied to part1 (violet) / part2
  (coral) / part3 (amber) respectively in *both* files, so "Listener A" reads as one identity
  across shots instead of two unrelated palettes.

`origin-supple.html` is the one shot with a nested exception: its outer stage (title card, lower
third, diagram caption) is on-system dark ground, but the three dialog-box mockups it compares
keep their own realistic colours (white window chrome; the enlarged variant's amber controls, now
matched to `--rt-part3` exactly; the high-contrast variant's black/yellow, whose ground was
already `#0A0A0A` — identical to this system's own `--rt-ground`) — those three colour treatments
*are* the research content being illustrated, not brand chrome, so they're deliberately left alone.

Product-swatch and card-art colours standing in for photography (the carousel cards in
`frozen-app.html`) are likewise left as varied, naturalistic hues rather than locked to the
brand palette.

## Social safe zones

All ten shots are laid out to stay inside the region Instagram Reels, TikTok, and YouTube Shorts
each draw their own chrome over: the account-name/follow strip at the top, the caption/sound-title
band at the bottom, and the like/comment/share icon rail on the right. The numbers used here are a
conservative composite of all three platforms' published safe-area guidance (collected Oct 2026) —
**top:250px, bottom:350px, right:160px** — sized to clear TikTok's rail (the most aggressive of the
three) rather than tuned per platform, since these shots are meant to post to any of them unedited.

To preview a shot against these margins, open it with `?safezone=1` added to the URL (combine with
`?driven=1` for a frozen frame, e.g. `?driven=1&safezone=1`) — `shots/essay-core.js`'s
`injectSafeZoneGuide()` draws the unsafe bands in red and the safe box in a green dashed outline.
This is dev-only: `capture-shots.mjs` never passes `safezone=1`, so it never reaches a rendered
video. `window.SAFE_ZONE` in that same file holds the four margin numbers if a new shot's layout
needs to check against them directly.

Two violations recurred enough to be worth naming:
- **Full-width centered or right-aligned text or containers** (a stamp line, a right-aligned chat
  bubble, a header's icon row) computed against the full 1080px canvas instead of the safe width —
  easy to miss because the text looks centered and correct until you check it against the actual
  right boundary.
- **Content sized without a bottom budget in mind** — a few shots (`genui-vs-genai.html`,
  `wrapped-cards.html`, `vibe-code.html`, `chat-canvas.html`) originally used close to the full
  1920px canvas height with no margin reserved at either end, which meant compressing them for the
  safe box also meant compressing the *content*, not just repositioning it. `shots/intro-title.html`
  and `shots/endcard.html` needed no changes — both already compose around the vertical centre.

`origin-supple.html` and `frozen-app.html` are each a partial exception, for different reasons, both
explained in their own file header comments: `origin-supple.html`'s three dialog mockups keep their
*own* realistic colours (that's the research content being illustrated) but their *position* was
still brought inside the safe box, since a legibility problem isn't excused by being diegetic the
way a colour choice is. `frozen-app.html` looks like a real phone screen rather than a bounded
diagram, so letting its header/footer sit at the literal canvas edges — which would look "correct"
on an actual phone — would instead place them exactly where Reels/TikTok/Shorts draw their own
chrome; it moved inward like everything else. `shots/feed-placeholder.html` is the one shot left
alone: it's explicitly a stand-in ("drop a real, licensed News Feed shot here"), its cards are
never meant to be final pixels, and its one genuinely load-bearing element — the "PLACEHOLDER"
warning text — was already safely positioned.

## Layout

```
genui-ep1/
  README.md
  capture-shots.mjs      puppeteer + ffmpeg → exports/<shot>-9x16.mp4, 1080×1920
  shots/
    essay-core.js         shared time/easing/draw-on helpers (see its own header comment)
    <shot>.html            one shot, pure function of time t — open directly to preview/loop
  exports/
    <shot>-9x16.mp4
```

## Shot → script beat map (current script)

| Beat | Time | Shot file | What it is |
|---|---|---|---|
| Intro | 0:00–0:12 | `shots/intro-title.html` | Three stages in one clip: the "THE POINT OF INTERFACE" show title (key over camera), a quick montage of three interfaces reshaping (feed / search / chat), then the series card "GENERATIVE UI · PART 1 OF 3" |
| Two types | 0:12–0:30 | `shots/genui-vs-genai.html` | Runtime vs. build-time cutaway — now ends by dimming the build-time (right) column and popping a "TODAY'S FOCUS" chip over runtime, per the script's note to "highlight the left panel as today's focus and dim the right" |
| Not a new idea: Meta | 0:30–0:40 | **not built — needs a real screen recording** | Script asks for a screen recording of your own Meta feed, scrolling, with post formats outlined and labelled. Personal account content — not something to fabricate |
| Not a new idea: Google | 0:40–0:55 | **not built — needs a real screen recording** | Script asks for a screen recording in Google Search: typing a number for the calculator, then an AI Mode query with clickable components highlighted. Public interaction, not personal — I can attempt this with browser automation if you want, rather than you capturing it by hand; just say so |
| Accessibility | 0:55–1:20 | `shots/origin-supple.html` | "SUPPLE, 2004" title card with a lower-third credit (Gajos · Weld · Wobbrock), crossfading into three redrawn versions of the *same* settings dialog — standard, enlarged for motor impairment, high-contrast for low vision |
| Personalization | 1:20–1:40 | `shots/wrapped-cards.html` | Three generic "year in review" story cards, same format, different data per listener — unbranded (no Spotify marks), with the script's own "same format, different data" line as the overlay caption |
| Outro / tease | 1:40–1:50 | `shots/endcard.html` | Series title card: already reads `GENERATIVE UI · EP. 01` + `PART 1 OF 3` — no changes needed |
| Outro / tease (teaser flash) | 1:40–1:50 | `shots/vibe-code.html` (ending only) | "A quick teaser flash of a prompt turning into a finished app (build time)" — this shot's prompt → wireframe → flash-to-white sequence already is that teaser; trim to just that ending for this cut |

## Parked for later parts (built, not used in this episode's edit)

The script's own "Parked for later parts" section defers this material — these shots stay in
`shots/` for parts 2/3, but don't belong in Part 1's edit:

| Shot file | What it is | Likely home |
|---|---|---|
| `shots/chat-canvas.html` | Chat thread → artifact panel drawing itself on live | Part 2 or 3 (chat-canvas vs. localized components) |
| `shots/frozen-app.html` | Frozen chrome + one live-swapping carousel + callout bracket | Part 2 or 3 (same) |
| `shots/seesaw.html` | Structure vs. Personalization balance beam, with the CHI 2008 citation | Part 2 or 3 (the structure/personalization trade-off, and Gajos's accuracy-vs-predictability + cognitive-cost findings) |
| `shots/feed-placeholder.html` | Placeholder stand-in for a real Facebook feed shot | Only needed if a future part revives the original Hook |
| `shots/shelf-grid.html` | Generic 3-column "different shelves" comparison | Superseded by `wrapped-cards.html` for this episode's personalization beat; may still suit a future part |

**Not rebuilt / not fabricated, by design:** the real Facebook News Feed and Spotify-branded
screenshots the earlier draft called for. `feed-placeholder.html` is a clearly marked stand-in;
`shelf-grid.html` and `wrapped-cards.html` both sidestep brand recreation by being generic,
unbranded diagrams rather than likenesses of a specific product.

## Preview

```sh
# from the repo root
python3 -m http.server 8765
open http://localhost:8765/Instagram_Visuals/Visual_Essay/genui-ep1/shots/intro-title.html
```

Every shot free-runs and loops on its own clock — just open the file. Add `?driven=1` to freeze
the free-run (used by the capture script, not needed for manual preview).

## Export

```sh
cd Instagram_Visuals
npm install                                   # once: puppeteer-core (already a devDependency)
python3 -m http.server 8765                   # from the repo root, separate terminal
node Visual_Essay/genui-ep1/capture-shots.mjs intro-title        # → exports/intro-title-9x16.mp4
node Visual_Essay/genui-ep1/capture-shots.mjs genui-vs-genai
node Visual_Essay/genui-ep1/capture-shots.mjs origin-supple
node Visual_Essay/genui-ep1/capture-shots.mjs wrapped-cards
node Visual_Essay/genui-ep1/capture-shots.mjs endcard
node Visual_Essay/genui-ep1/capture-shots.mjs vibe-code
# parked (build only if a later part needs them):
node Visual_Essay/genui-ep1/capture-shots.mjs chat-canvas
node Visual_Essay/genui-ep1/capture-shots.mjs frozen-app
node Visual_Essay/genui-ep1/capture-shots.mjs seesaw
node Visual_Essay/genui-ep1/capture-shots.mjs feed-placeholder
node Visual_Essay/genui-ep1/capture-shots.mjs shelf-grid
```

`capture-shots.mjs <shot> [seconds] [fps]` — `seconds` defaults to that shot's own loop length
(see `LOOP_S` at the top of the script); `fps` defaults to 60. Output is always 1080×1920 (this
essay is vertical-only). Needs Google Chrome and `ffmpeg`, same as the rest of `Instagram_Visuals`.

All eleven MP4s in `exports/` were re-rendered on 2026-10-19 under the current visual language and
the safe-zone layout above — none predate either pass. Re-run the relevant export command after any
future edit to a shot's `.html` file, since the exports are a snapshot, not generated on demand.

## Layout note: vertical stacking

`wrapped-cards.html`, `shelf-grid.html`, and `genui-vs-genai.html` were originally laid out as
side-by-side columns (2–3 across). At 9:16 that made each column too narrow to read comfortably,
so all three were rebuilt as full-width stacked rows/bands instead — `genui-vs-genai.html` now
reads top (REAL-TIME) / divider / bottom (BUILD-TIME) with each band's icon on the right rather
than a mirrored left/right split. Same content and timing, just re-flowed for the format.

## Editing notes

- `intro-title.html`'s three stages land at roughly: show title 0–2.0s, montage 1.8–5.5s, series
  card 5.3s onward. Cut the on-camera intro over the first stage, the "three interfaces reshaping"
  line over the montage, and hold the series card through "Generative UI, Part 1 of 3."
- `genui-vs-genai.html`'s dim-the-right-panel moment starts at t=3.0s and settles by t=3.7s — cut
  to "let's start with runtime" right as that finishes.
- `origin-supple.html`: title card holds to about t=2.1s, then the three dialogs pop in staggered
  (standard, then enlarged, then high-contrast), fully settled by about t=3.3s, holding to t=8.3s.
- `wrapped-cards.html`'s three cards pop in staggered starting t=0.2s, with their stat numbers
  counting up through about t=1.6s — don't cut before the numbers finish landing.
- `vibe-code.html`'s flash-to-white sting sits right before loop-end (t≈6.05–6.2s of 6.6s) — for
  the Outro, cut in on the prompt-typing beginning and let it run through the flash.
- All shots are pure functions of time (see `shots/essay-core.js`), so any frame is reproducible —
  if a cut needs an exact moment, call `window.essayStep(ms)` in the console to preview it before
  re-exporting with a trimmed `seconds` argument.
- Every number in `origin-supple.html` is sourced from the script's own "Sources" section (Gajos
  et al.) — if the script's figures change, update the shot to match rather than letting it drift.
