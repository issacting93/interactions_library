# Instagram plan: interactions, instruments, invented languages

## 1. What the account is

**Position:** a lab notebook of interfaces that behave like instruments. The posts show dials, radars, sequencers, patch bays and alien scripts, all built in the browser and all actually working.

Most interface accounts on Instagram post static Dribbble shots. This one should post things that **move because someone is using them**. Every post shows an input (cursor, drag, knob, tap) and the system's response. That rule is the account's identity.

**Bio draft:**
> interfaces that behave like instruments
> dials · sequencers · node graphs · invented scripts
> all live in the browser ↓

Link in bio: a public build of `index.html`, the gallery. People who swipe through then have somewhere to touch the real thing.

---

## 1b. References and what we take from them

### Pinterest: `issacting96/scifi`
Contact sheets of all 25 pins are in `references/`. Six patterns repeat across them:

| Pattern on the board | Examples | What we take |
|---|---|---|
| **Product-poster telemetry.** A model code, one huge numeral, small spec text and a grid. | D350 Telemetry Index ("95%"), Orion N5, NASA "757" | Give every piece a **designation** (e.g. `SWP-06`) and one **hero number** on its cover, such as `112 BPM`, `270°` or `288 SMP`. |
| **Engineering annotation.** Leader lines, dimension marks, callouts. | "Engineering specification diagrams" blade, drone blueprint | A **SPEC** slide in every carousel: the piece frozen, with callouts naming each part and its behaviour. |
| **Telemetry laid over organic forms.** Bounding boxes and coordinates on a soft subject. | Flower with tracking boxes, glitch node-network | Overlay readouts on the **goo and blob** pieces. Series C stops being "oddly satisfying" and becomes "measured". |
| **Hardware-like control surfaces.** | dB attenuator dial, camera control plate, phone launcher setups | This is TAPE 08's home ground, and confirms that series A and B should lead. |
| **Diegetic fiction UI.** Interfaces that belong to a world. | LAPD ID card, Ursa Major star map, New World HUD, sakes orange terminal | **Yes to the fictional-machine framing** for series D and E. |
| **Light, papery diagrams between the dark posts.** | Mint telemetry, cream flowchart, white line art, architectural sections | Not every post should be charcoal. Add a **light "paper" template** for spec and process slides. |

**Colour:** the board leans on **safety orange and black**, with mint and cream as relief. TAPE 08 amber sits close to that orange, so it stays the single accent. A cream paper ground (around `#ECE8DE`, the TAPE 08 ink) lets the light posts use the same palette inverted.

### @thedatabase.co
I could only see the profile, not individual posts, because Instagram requires a login.
- It's a **curator**: "Index of the finest research & innovation", 35.5K followers. It posts other people's work and has submission and advertising highlights.
- **Takeaway:** treat curators like this as a **distribution channel**. Once there are about 9 strong posts, submit the best Reels to @thedatabase.co and similar index accounts. That's the fastest route to a design-literate audience.
- Its "index" framing also suits our numbered `SERIES · NN` system.

### @eight.seconds (Second Eight)
Again, I saw the profile only.
- A creative direction practice run as a **brand**, with a ® tagline ("CRAFTING MEMORABLE EXPERIENCES®"), 89.6K followers, and a steady mix of Reels and carousels.
- **Takeaway:** present the account as a practice with a name and a one-line promise, not as a personal portfolio. This raises the stakes on the handle decision in §9.

If you can screenshot 6–9 posts from each account you like, I can pull out their layout and type rules the same way I did for the board.

---

## 2. What we have, sorted into series

The library already holds about 35 pieces. They fall into five series, and each series gets its own recurring format so the grid reads as a system.

### A. INSTRUMENTS: interfaces that make sound (the strongest material)
Reels with audio stand out because almost nobody posts UI you can hear.

| Piece | What the post shows |
|---|---|
| **TAPE 08 Patch** (`tools/patch-bay/patch.html`) | Cables being patched while the sound changes live. Patch a delay loop, then try a loop with no delay and get "LOOP WITHOUT DELAY". SAVE AS FX collapses a whole patch into one node. |
| **Sweep Path** (`components/physics/sweep-path`) | Arm hex nodes; the sweep arm plays them in angular order. Strong as a square or 4:5 loop. |
| **Motif / Dyad** (`components/interaction/dyad`) | Spin the inner ring for pitch and the outer ring for duration, then commit the phrase. |
| **TAPE 08 Design Language** | Carousel: reels, knobs, LED switch, colour-as-signal rules. Design-system posts are saved and shared a lot. |

### B. DIALS & SELECTORS: radial and polar interaction
Rosette, Cyberpunk Dial, Signal Wheel, Polar Dial, Radial Depth, Radial Goo Bloom, Spine/Polar, Radial Interface, Daisy Wheel.
- Format: a **6–10 s seamless loop** with the cursor visible and a hairline caption plate giving the name and mechanic.
- Later, a carousel: **"9 ways to choose from a circle"**, with one dial per slide and the same layout on every slide.

### C. PHYSICS & ORGANIC: goo, springs, blobs
Blob, Goo Bloom, Gooey Node Bloom, Polar Dial springs, Ball (old CodePen).
- Format: satisfying loops. Slow down a frame-step to show the spring.
- Good for reach, since this is the most "oddly satisfying" content.

### D. HUD & SIGNAL: sci-fi readouts
Radar Display, Range Region, Sci-Fi Frame, Keyboard HUD, Map Indicator, Terrain Section, Tracking Iris, Particle Constellation, Parallax Rings, SVG Grid, Map (old CodePen).
- Format: full-bleed 4:5 stills plus short reels.
- The rule is to treat them as **artefacts from a fictional machine** rather than as UI kits. This ties into the game and narrative work (Ghost Signal).

### E. INVENTED SYSTEMS: generative languages and assets
Xenoglyph (8 glyph engines), Xenomandala, Glyph Editor, Asset Foundry (12 families × 6 palettes), Image FX Lab.
- Format: **seeded specimen sheets**. Each post is "SEED 0412", with one script shown as an alphabet, a paragraph and a mandala.
- Asset Foundry gives contact-sheet carousels.
- This series is the most "art" of the five and works well on the grid.

### F. PROCESS: the thinking (a recurring series, not a category)
- **TRANSMUTE** (`transmute.md`): "A + B → C". Slide 1 shows source A, slide 2 source B, slide 3 the grammar reduction (mechanic / state / fixed point), and slide 4 the result. This is the most original idea in the repo and should be a named series.
- **Spec → working**: for example, the node-set spec, then patch.html running.
- **v0 → v1**: Patch Bay v0 next to Patch v1, to show iteration.

---

## 3. Formats and specs

| Format | Size | Use |
|---|---|---|
| Reel | 1080×1920, 7–15 s, loops seamlessly | Instruments, dials, physics |
| Carousel | 1080×1350 (4:5), 5–10 slides | Design system, TRANSMUTE, specimens, "9 ways" |
| Single still | 1080×1350 | HUD artefacts, glyph specimens |

- **Grid crop:** the profile grid now crops to 3:4. Keep the important content in the centre 1080×1440 band of every cover.
- **Reels:** the opening frame must already be moving, with a cursor or finger in shot. Never open on a static UI.
- **Sound:** native audio for series A. Everything else gets a quiet consistent bed, or silence with on-screen captions.

### Visual frame (one template for every post)
Use the TAPE 08 language as the account's house style, even for pieces that are not TAPE 08:
- `--t8-ground` charcoal background with a 1 px hairline border inset 28 px.
- A top-left micro label: `SERIES A · 07`.
- A bottom plate: the name in Martian Mono and the mechanic in one line of Plex caps, e.g. `SWEEP PATH · ANGULAR STEP SEQUENCER · 112 BPM`.
- Colour rule on the frame: amber only marks the post number. Colour inside the piece is free.

The result is a grid that looks like one machine's logbook, whatever each piece looks like.

### Two templates, after the references in §1b

1. **LOGBOOK (dark).** The frame described above, used for Reels and live captures.
2. **SPEC SHEET (light, cream paper):**
   - The designation large in Martian Mono, for example `SWP-06 / SWEEP PATH`.
   - One hero numeral.
   - The piece frozen, with hairline leader-line callouts.
   - A small spec table (INPUT / STATE / BUILT).
   - Use it for carousel slide 2, for process posts, and for TRANSMUTE grammar slides.

**Rhythm:** about 2 dark posts to 1 light post. That gives a three-across row a light anchor, like the mint and cream pins between the dark ones on the board.

**Designations:**
- A three-letter code for the series, a number, and the name, e.g. `PCH-01 TAPE 08 PATCH`, `XGL-03 XENOGLYPH`, `RDR-12 RADAR`.
- Keep a registry of codes so none is ever reused. The README's piece table does this job for now.

---

## 4. Launch grid: the first 9 posts

Order them so the top 3×3 reads as a balanced mix (the grid fills newest-first, so post #9 sits top-left).

| # | Series | Post | Format |
|---|---|---|---|
| 1 | A | TAPE 08 Patch: patching a feedback echo, with sound | Reel |
| 2 | E | Xenoglyph specimen sheet, SEED 0001 | Carousel |
| 3 | B | Rosette: 3-state radial menu (RST-03) | Reel |
| 4 | F | TRANSMUTE 01: two sources → one new interaction | Carousel |
| 5 | D | Radar Display as a fictional-machine artefact | Still + reel |
| 6 | A | TAPE 08 design language: the rules | Carousel |
| 7 | C | Goo Bloom spring loop | Reel |
| 8 | A | Sweep Path with sound | Reel |
| 9 | E | Asset Foundry contact sheet, 12 families | Carousel |

Then settle into a weekly rhythm.

---

## 5. Cadence

- **3 posts a week:** Reel on Monday, carousel on Wednesday, wildcard on Saturday (still, archive, or work-in-progress).
- **Stories:** raw screen recordings of work in progress, with polls ("which dial next?") that feed what gets built.
- **Monthly:** one TRANSMUTE, and one "interact with it" post linking to the live gallery.
- **Curators:** after 9 posts, submit the best 2–3 Reels to index accounts such as @thedatabase.co. After that, submit about one a month.
- **Backlog:** about 35 pieces at three a week is roughly 12 weeks before anything new is needed. New builds keep the account going after that.

---

## 6. Captions

Keep them short, structured, and in the TAPE 08 label voice:

```
SWEEP PATH
Spatial step sequencer. Arm hexes; the arm fires them in angular order.

INPUT  tap to arm · drag to move
STATE  6 nodes · 1 angle · 112 BPM
BUILT  canvas · Web Audio

→ live in the browser, link in bio
```

Hashtags (5–8, rotate them): #interactiondesign #creativecoding #uidesign #webaudio #generativeart #hud #fui #soundtoys

---

## 7. Production pipeline (what to build next)

Recording by hand doesn't scale to about 35 pieces. Instead, build a small capture rig in this folder:

1. **`Instagram_Visuals/frame.html`**: the post template from §3. It loads any component in an iframe at the right size and adds the label plate.
2. **`Instagram_Visuals/capture.mjs`**: a Puppeteer script. It already works in this repo's setup.
   - Opens `frame.html?src=…&series=A&n=07`.
   - Replays a scripted cursor path.
   - Screenshots frames or uses `screencast`, then ffmpeg converts them to an MP4 at 1080×1920 or 1080×1350.
   - For audio pieces, records the tab audio, or renders it with `OfflineAudioContext` and muxes it in.
3. **`Instagram_Visuals/pieces/<id>/`**: one folder per piece, holding its adapter (`piece.js`), a copy of its source component (`source/`) and the renders (`exports/`). A `caption.txt` goes here too.
4. **Scripted cursor paths**: a small JSON for each piece (move, press, drag) so every loop is repeatable and perfect.

---

## 8. Things to check before posting

- **Third-party material:**
  - The font folders (Techla Free, Circular Abstracts, Neon Overdrive, Seldom Scene) need their licences checked before they appear in posts.
  - The S1090 / Machine56 assets belong to Machine56 and were released for their contest, which closed 31 Jul 2026. Don't repost work derived from them without permission.
- **Anti-AI contests:** some challenges (Machine56's included) ban AI-assisted work. Several of these pieces were built with AI help, so skip contests like that, or be upfront about how the work was made.
- **Mic and audio:** record audio pieces in DEMO mode, not MIC.
- **Accessibility:** add alt text to every post (Advanced settings), describing the interaction rather than the visual.

---

## 9. Decisions for you

1. **Account name:** your own name, or a studio or lab handle (for example, one that echoes TAPE 08 or the "fictional machine" framing)?
2. **Fictional-machine framing:** the board points to *yes*. The open question is whether the fictional world is Ghost Signal itself or a new neutral "machine" invented for the account.
3. **Live gallery:** publish `index.html` publicly (for example on GitHub Pages or Vercel) so the link in bio works?

---

## 10. Presentation modes: ways to show one piece

Choose **three house modes** and use them all the time. Consistency is what makes the account look authored.

| Mode | What it is | Best for | Source |
|---|---|---|---|
| **1. Assembly loop** ★ | Pure black background and white hairlines. The piece draws itself from single points, comes alive, is used once, then collapses back to points and loops. No frame and no text. | Radial Interface, Rosette, Cyberpunk Dial, Radar, Sci-Fi Frame, Signal Wheel | `references/pin-841610249102996545-reticle.gif`: an 800×600, 156-frame reticle that builds from dots into rings and back again |
| **2. Spec sheet** ★ | A cream product poster with the designation, one hero number, leader-line callouts and a spec table. | Carousel slide 2 for everything | D350 / Orion N5 pins |
| **3. Exploded view** ★ | The layers of the piece pulled apart in 3D perspective, so the rings, the goo filter and the hit areas can each be seen, then pushed back together. | Multi-ring dials, Polar Dial, Radial Depth, Hex Workspace | Architectural section pins |
| 4. In the hand | A real phone held in frame, with a thumb using the piece. It proves the piece is real and touchable. | Sweep Path, Motif, Signal Wheel | Phone launcher pins |
| 5. Diegetic scene | The piece placed inside a fictional device or document, with in-world data. | Radar, HUD set, Xenoglyph | LAPD card, star map |
| 6. Variant matrix | A 3×3 grid of the same piece at 9 seeds or settings. | Xenoglyph, Xenomandala, Asset Foundry | Destiny livery tiles |
| 7. Input / output split | The left half shows only the cursor or finger trail and the right half shows the response. It makes the mechanic easy to read. | Physics pieces, Tracking Iris | — |
| 8. Sound-on performance | A screen capture with the audio playing, the piece used like an instrument. | TAPE 08 Patch, Sweep Path, Motif | — |

**Recommended set:**
- Mode 1 for the Reel cover moment.
- Mode 2 for carousel slide 2.
- Mode 3 or 8 as the "how it works" slide.

**Why mode 1 suits this library:** most pieces are SVG strokes already (Vivus is used in SVG Grid). Animating `stroke-dashoffset`, and scaling rings out from their centres, can therefore be scripted for each piece instead of hand-animated.

### Built: the post stage (v0)
- **`stage/stage.html`:** renders a piece in ASSEMBLY, SPEC or EXPLODED mode, at 4:5, 9:16 or 1:1.
  - Each frame depends only on time, so any frame can be reproduced exactly.
  - URL params: `?piece=&mode=&format=&t=&capture=1`.
  - GUIDES shows the 3:4 grid crop and the 28 px gutter.
- **`stage/capture.mjs`:** writes `pieces/<id>/exports/<mode>-<format>.mp4`. SPEC is written as a `.png` instead. `npm run export:all` renders everything.
- **Pieces:** one folder per piece in `pieces/<id>/`, containing `piece.js`, `source/` and `exports/` (see README.md). Each calls `registerPiece()`, and the contract is written at the top of `stage.html`. Current pieces:
  - RST-03 Rosette
  - CYB-04 Cyberpunk Dial
  - SGW-05 Signal Wheel
  - BLM-06 Radial Goo Bloom
  - HEX-07 Hex Workspace
  - SPN-08 Spine Section
  - DSY-09 Daisy Wheel
  - GRT-10 Geared Reticle
  - GRT-11 Geared Reticle · Patch
- **Motion:** easing and springs come from anime.js v4, using `createSpring`, the same solver the source components use. Every frame is still a pure function of time. Capture runs at 60 fps by default.
- **Contact sheet:** `contact-sheet.png`.
