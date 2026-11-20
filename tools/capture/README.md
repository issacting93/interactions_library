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
