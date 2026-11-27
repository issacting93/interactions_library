# Capture

Headless screenshots and GIFs of the repo's pages, used for the dev logs (`docs/dev-logs/media/`).

## Setup

```sh
cd tools/capture
npm install            # playwright, three (3 versions), anime.js, clipper, fonts
npx playwright install chromium   # or set CHROME=/path/to/chrome
# from the repo root, in another shell:
python3 -m http.server 8731
```

The pages load three.js, anime.js, clipper and Google Fonts from CDNs. `cap.mjs` answers those requests from the local `node_modules` instead, so captures work offline and give the same result every run. Set `CAPTURE_BASE` if the server is not on `http://localhost:8731`. You also need `ffmpeg` on the path for GIFs.

## Scripts

- `cap.mjs`: shared helpers. `open()` launches Chrome on SwiftShader GL with the CDN routing, and can install Playwright's fake clock. `run()` advances fake time. `gif()` screenshots N frames, stepping the clock between them, and encodes them with ffmpeg (palettegen/paletteuse).
- `g-any.mjs <url> <out.gif|out.png> [clicks 'A|B'] [warm ms] [frames] [clip selector or x,y,w,h or -] [width] [step ms]`: the general one. It opens a page, clicks buttons by their text, warms up, then writes a still or a GIF.
- `g-walk.mjs`: the Walk page. It waits for the `[data-walker]` tiles before clicking one.
- `still.mjs`, `rt.mjs`: stills, on the fake clock and in real time.
- `svgshot.mjs`: renders an SVG sheet (such as `creatures-by-family.svg`) through an `<img>`.
- `ws-styles.mjs`: World Scene, one still per look.
- `tank-play.mjs`: Cybernetic Ecology with `#autopilot`, real-time frames into a GIF.

Fake time makes motion smooth however slowly a page renders. World Scene and the tank are too slow for it under software GL, so those are captured in real time.

Example:

```sh
node g-any.mjs '/world/forges/walker-bestiary/index.html#hexMech' ../../docs/dev-logs/media/hex-mech.gif '' 3000 44 - 480 60
```

## World Scene check (`world-scene-check.mjs`)

Scores every World Scene place after a change, with the numbers in `packages/ecology/scene-metrics.js`:
how the schooling creatures turn (rad/s), how far their bodies fold (rad), whether neighbours face the
same way, how many schools form, and (with `--picture`) whether the frame is near black, washed out or
blank. Seeded and stepped by hand, so the same code gives the same numbers.

    node world-scene-check.mjs               # every place, motion only (about 5 minutes)
    node world-scene-check.mjs garden spires # just these
    node world-scene-check.mjs --picture     # also draw each place and grade the frame (slow)
    node world-scene-check.mjs --baseline    # save this run as world-scene-baseline.json

It prints `ok` / `warn` / `FAIL` a place, says what got worse than the baseline, writes
`out/world-scene-check.json`, and exits 1 on a failure. Places where the ecosystem runs (World, The Hunt)
only warn on motion. A place can set its own limits (`check: { black: 0.92 }` for a dark one).

The headless browser cannot judge frame rate or the finished 3D bodies. For those, open World Scene on the
device with `?check` (or `?check=garden,trench`; `&settle=ms&measure=ms`): it steps through the places on
real frames and shows the same report with each frame, and Copy report gives the JSON.

## world-scene-smoke.mjs

`node world-scene-smoke.mjs` (about a minute): does World Scene still hang together after a change? Enters every place, opens every tab, and checks there are no page
errors, the shot list is in the Camera tab and the place look in the Look tab, the Style picker shows only where a place has a city, Glow reaches the place's data, each
moment swells and ends, and role state sits under `f.role`. Run it with `world-scene-check.mjs` (the motion and frame scores) before publishing.

Formatting: Prettier, `.prettierrc` at the repo root (width 120); `places/`, `packages/ecology/ecology-roles.js`, `packages/ecology/scene-metrics.js` and `packages/render/ecology-render.js` are formatted.
