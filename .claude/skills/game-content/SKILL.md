---
name: game-content
description: How to capture game devlog, playthrough, and behind-the-scenes video content from this repo's own tools and games — the Playwright/ffmpeg capture pipeline in tools/capture/, the fake-clock-vs-real-time decision rule, the director's-checklist pattern for multi-scene shoots, and the Kokoro narration step. Load this before capturing footage of any tool/page/game in this repo for a dev log, a social post, a trailer, or any other video deliverable, even if the request doesn't use the word "skill" — phrases like "record a playthrough," "capture some footage," "make a devlog clip," "screen recording," or "behind the scenes" all mean this.
---

# Game content capture

This repo already has a working pipeline for turning a live page in this repo — a
Forge tool, a world scene, a tank sim, a shipped game — into video. It was built and
hardened across the Nov 2026 dev-log shoot (85 scenes across four logs) and the
Endless gameplay capture. Use it instead of improvising a new capture method each
time; the hard parts (why a given page hangs, what a plausible viewport is, how to
avoid the concurrency mess) are already solved below.

## The pipeline, in order

1. **Serve the repo root.** `python3 -m http.server 8731` from the repo root — every
   relative path in `world/`, `shared/`, `library/` assumes this. Check it isn't
   already running first (`lsof -nP -iTCP:8731 -sTCP:LISTEN`); it usually is.
2. **`cd tools/capture && npm install`** if `node_modules/` isn't there yet
   (gitignored). `npx playwright install chromium` if Playwright complains about a
   missing browser build after an `npm install` bumped its version.
3. **Pick a capture script** — see the decision rule below.
4. **Encode with the script's own ffmpeg call** (already wired into `cap.mjs`) —
   don't hand-rebuild the ffmpeg command elsewhere.
5. **For more than a couple of clips, open a director's checklist first** — see
   "Multi-scene shoots" below. For one clip, just shoot it.
6. **Narrate, if the deliverable wants voiceover** — see "Narration" below.

## The fake-clock vs. real-time decision

`tools/capture/cap.mjs` gives you two different ways to drive a page, and picking
the wrong one is the single most common way a capture comes out blank, black, or
hung. This isn't a style choice — it follows from how the page gets its content:

| Capture script | How it drives the page | Use it for |
|---|---|---|
| `g-any.mjs` / `g-walk.mjs` | Installs Playwright's fake clock and steps it in small increments, screenshotting each step. Fast, deterministic, cheap to encode. | Everything **except** the row below — most Forge pages, generator showcases, static-ish UI |
| `g-rt.mjs` | Lets the page run in real wall-clock time and records the actual rendered video (Playwright's native `recordVideo`, via `cap.mjs`'s `openRec`/`closeRec`). Slower, but the only thing that works on... | Any page that does an async `fetch()` before it's interactive (`PartLib.load()` is the recurring one — Maw Hex Study, Specimen, Maw Forge, the fish-tool pages generally), and any page using `shared/engine/ecology/ecology-render.js`'s WebGL2 renderer (World Scene, Cybernetic Ecology, the tank, `body.html`) |

Stepping a fake clock never lets a pending `fetch()` resolve between frames, so a
`PartLib.load()` page just renders its empty/loading state forever under
`g-any.mjs` — it looks "captured" (a file gets written) but is blank or wrong.
Conversely, `page.clock.runFor()` + screenshot is what the walker/gait/generator
pages actually need, because stepping *is* how you get deterministic motion out of
them without waiting in real time.

**The one reversed exception found so far**: Weeping Seraph
(`library/components/rigged/weeping-seraph/weeping-seraph.html`) renders fully
black under `g-rt.mjs` (confirmed via raw pixel readback) and correctly under the
fake clock — the opposite of the WebGL rule above. If a capture comes back
unexpectedly blank, try the other script before assuming the page itself is
broken.

**A physically-timed pointer mechanic** (a coil/charge/hold-to-release control,
like the Maw's lunge) needs a third, hybrid approach: fake clock for the
deterministic parts, with a real Playwright `mouse.down()` / wait / `mouse.up()`
sequence interleaved so the hold duration is real wall-clock time (the charge logic
reads elapsed time, not clock-stepped frames). Build this as a small one-off script
from `cap.mjs`'s exports rather than editing `g-any.mjs` for a single mechanic.

**If a game/page exposes an autopilot or AI-driven mode** (check for a debug key
handler — e.g. Cybernetic Ecology's `?endless` mode toggles autopilot on `p`, handing
control to the same `EcologyMawAI` brain that drives NPCs elsewhere), prefer that
over trying to script human-like input yourself. It already has correct timing and
decision-making built in, and sidesteps the hold-duration problem entirely for
anything that needs a convincing "real play" capture.

## Encoding conventions

- **mp4 is the default deliverable** (`video()`/`openRec`+`closeRec` in
  `cap.mjs`): h264, `yuv420p`, `crf 18`, 25fps. Both `g-any.mjs` and `g-walk.mjs`
  default their clock step to 40ms for exactly this reason (`1000/40 = 25fps`) —
  if you ever see a capture come out at 14-20fps, someone passed a coarser custom
  `step` (don't; a coarser step was the actual bug behind a whole batch of dev-log
  clips reading as "low framerate" — see the Nov 2026 shoot's checklist for the
  postmortem).
- **gif only when the deliverable specifically needs it** — a doc that already
  illustrates other entries as GIFs, a place a GIF is embedded inline somewhere
  that doesn't support video. Don't default to GIF for a fresh ask.
- Viewport: 1280×800 is `cap.mjs`'s default, but check whether the page's own
  content needs more. A right-rail panel or an off-screen control can sit below
  the fold at the default height and silently fail to be captured (the click still
  registers — it just doesn't appear on screen). A taller viewport
  (`open(url, {h: 1900})`) usually fixes it. **Don't fight this with Playwright's
  `recordVideo` and a huge viewport at the same time** — a taller real-time
  recording context can hang indefinitely (observed: 1100%+ CPU, 15+ minutes, no
  output) rather than fail cleanly. If a taller-viewport real-time capture hangs,
  kill it and fall back to the existing/cropped framing rather than forcing it.
- `recordVideo` does not reflect page scroll — if a capture needs to show scrolled
  content, do a manual real-time capture (sequential `page.screenshot()` calls
  interleaved with actions, encoded afterward) instead of relying on
  `openRec`/`closeRec`.
- Don't percent-encode a `#` in a capture URL — a literal `%23` breaks hash-based
  page routing, since the browser never sees it as a fragment.

## Capturing a page you don't have locally (an Artifact export, a cloud build)

If the thing to capture only exists as a published Claude Docs Artifact (richer or
newer than what's checked into the repo — this has happened more than once), pull
its files down (`Artifact` tool, `action: "read"` with `paths`) into a scratch
directory, serve *that* on its own port (`python3 -m http.server <free-port>
--directory <dir>`), and point `cap.mjs` at it with `CAPTURE_BASE=http://localhost:<port>`
so its asset-routing allowlist matches the right origin. Don't mix it into the
main repo's served tree.

## Running more than one capture at once

Running two or three single-browser capture jobs side by side (e.g. one for dev
logs, one for an unrelated game) is fine. What isn't fine is one job fanning out
into many parallel sub-jobs each spawning their own Chromium — a prior pass that
did this hit 100+ concurrent Chromium processes, CPU thrash, silently-overwritten
output files (two concurrent jobs writing the same filename), and a checklist file
edited by more than one writer at once (git-style "modified since read" conflicts,
but on a plain markdown file with no merge tooling). If a shoot has many scenes,
run them **sequentially within one job**, not fanned out — the wall-clock cost of
sequential capture is much cheaper than the cleanup cost of a race.

## Multi-scene shoots: the director's-checklist pattern

For anything bigger than a clip or two — "capture footage of all the scenes in
this dev log," "film every variant of X" — write a checklist file first (see
`docs/dev-logs/shoot-checklist.md` for the full worked example) rather than
shooting ad hoc:

- **Status key**: `HAVE` (an existing capture already matches), `SHOT` (captured
  this pass), `NEEDED` (not shot yet), `GONE` (the feature no longer exists —
  don't plan around it), `BRANCH` (exists only on an unmerged branch).
- **Setup key**: `A` self-contained, loads with no saved state · `B` needs a saved
  world/seeded app state · `C` needs a branch checkout or historical commit · `D`
  needs hardware or is otherwise special-cased.
- One table per source (per dev log, per game mode, whatever the natural grouping
  is), columns `# | Claim | Page | Setup | Status`.
- A **Progress log** section at the bottom, appended to (never rewritten) as the
  shoot goes, recording gotchas, mismatches between what a claim says and what the
  page actually shows, and anything flagged as weak/partial — this is where the
  genuinely useful operational knowledge accumulates, and it's what a future skill
  update like this one gets written from.
- If a claim doesn't match any page you can find, say so in the Progress log and
  shoot the closest honest analog rather than silently faking the claim or
  silently dropping the row.

## Narration (Kokoro)

`tools/narration/` wraps the Kokoro text-to-speech model (local, open-weight,
no API key) for voiceover — use it instead of a cloud TTS API (ElevenLabs/Google
TTS) for anything in this repo:

```sh
tools/narration/.venv/bin/python tools/narration/narrate.py "Some line of narration." out.wav [voice]
```

Defaults to the `af_heart` voice (American English, 24kHz) if you omit it; run
with no arguments for a smoke test. 54 voices are available (see
`tools/narration/README.md` for the full list and language prefixes) but only
`af_heart` has actually been listened to and verified — try a couple of voices on
a short line before committing to one for a real pass. The venv uses Homebrew's
python3.11, not the repo's system Python (too old for Kokoro's deps); don't fight
this, just use `tools/narration/.venv/bin/python` directly as shown above.

Write the script as plain text first (match `docs/dev-logs/STYLE.md`'s voice if
the narration is for dev-log content), run it through `narrate.py` to get a
`.wav`, then either hand both files to an editor or mux them yourself
(`ffmpeg -i clip.mp4 -i voice.wav -c:v copy -c:a aac -shortest out.mp4` for a
straight voice-over-footage pairing; a real edit with music/pacing needs more
than a one-line mux and should stay as separate audio/video files for whoever's
cutting the final piece).

## Known page-specific gotchas (grows over time)

- `walker-bestiary/index.html`'s right rail is a tall `overflow-y:auto` list —
  several panels (hex-bloom remix, bloom-of-blooms breed) sit below the roster and
  off-screen at the default viewport.
- Kit Mech's design picker is an `<input type=range>` slider — the generic
  text-click matcher in `g-any.mjs`/`g-rt.mjs` can't drive it; a capture of it
  will only show whatever design it defaults to.
- SVG `<g class="...">` elements and icon-only buttons (prev/next arrows, grid
  tiles) usually need a direct CSS/data-* selector via a small ad-hoc script,
  not the generic text-click matcher.
- The Pincer Crawler never engages tower-climbing on `body.html#pincer,tower` —
  stays at 0% off-ground. This is a real bug in the climb logic, not a capture
  artifact; don't spend time trying to get a "working" capture of it.
