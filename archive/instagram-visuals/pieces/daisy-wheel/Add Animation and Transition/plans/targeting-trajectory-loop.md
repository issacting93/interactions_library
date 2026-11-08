# Targeting / Trajectory HUD Loop Plan

## Goal

Implement the two supplied Figma frames as a faithful, automatically looping React animation:

- File: `dUNWR0iqIZIYxRwcKU4HpB`
- Start state: node `1:19`
- End state: node `1:442`
- Playback: automatic, forward and reverse
- Pacing: cinematic and smooth

The result should preserve the Figma composition at its native 272×331 aspect ratio, scale cleanly within the viewport, and animate matched visual layers rather than simply cutting between or crossfading two complete screenshots.

## Confirmed Design Findings

- The app is currently an empty React 19 + Vite + Tailwind CSS v4 scaffold.
- There is no component library, animation package, or existing application state to preserve.
- Both Figma frames use the same black HUD shell and lower three-column control panel.
- Most controls, labels, rings, and decorative vectors are identical between states.
- The meaningful state changes are:
  - the main circular scope grows from approximately `103.145×106.91` at `top: 38px` to `147.145×152.516` at `top: 12.09px`;
  - the vertical trajectory group moves from approximately `top: 125px` to `top: 158px`, with its four markers spreading from tightly overlapped rows to `18px` gaps;
  - central telemetry that is hidden in the start state becomes visible in the end state;
  - the small target/heading indicator changes geometry and orientation;
  - state-specific background, scope, text, and terminal marker SVGs replace their start-state equivalents;
  - an additional lower trajectory accent appears only in the end state.
- Figma contains no prototype/keyframe timing metadata, so playback timing must be authored in CSS.

## Files and Assets

### `src/App.tsx`

Replace the empty root with the responsive HUD scene.

Structure the implementation into small local components where they reduce duplication:

- `HudScene`: normalized 272×331 design canvas.
- `StaticHud`: common background details and lower control panel, rendered once.
- `Scope`: paired start/end SVG layers inside one animated wrapper.
- `Trajectory`: four reusable trajectory marker rows whose positions interpolate.
- `Telemetry`: readout and marker layers that fade/transform between states.
- A small asset helper is acceptable for repeated decorative `<img>` markup, but no general-purpose abstraction or new dependency is needed.

Use semantic non-interactive containers (`main`, `figure`, or `div`) rather than the generated empty `<a>` element. Mark purely decorative SVG images with empty alt text and hide the composed visualization from assistive technology if it has no meaningful textual content.

### `src/index.css`

Keep the Tailwind import first, then add:

- black page/root defaults;
- the responsive design-canvas scaling rules;
- shared motion custom properties;
- keyframes for scope geometry, trajectory spacing, indicator transforms, state-specific SVG fades, and telemetry reveal;
- a `prefers-reduced-motion: reduce` rule that disables the loop and displays the start state without transitional blur or partial opacity.

Use CSS keyframes rather than React timers so the animation remains synchronized, lightweight, and reversible without rerenders.

### `public/assets/`

Copy the downloaded Figma SVG assets required by the final composition into `public/assets/`.

- Deduplicate shared assets by filename.
- Keep the state-specific assets with their provided stable filenames.
- Reference them with root-relative `/assets/<filename>.svg` URLs.
- Do not leave runtime references to `.figma/design-context`, temporary archives, Figma URLs, or `/tmp`.
- Include every visible Figma asset used by the common shell and either animated state; do not rasterize the frames or recreate supplied vectors.

The extracted design-context archives under `.figma/design-context/` are implementation inputs only and should not be imported by application code.

## Layout Approach

1. Render one full-viewport black root using `min-height: 100dvh`.
2. Center a single 272:331 aspect-ratio canvas.
3. Set its width to the smaller of the available viewport width and the height-derived width, preserving the entire composition without clipping.
4. Author layer geometry in the Figma coordinate system and scale the whole canvas uniformly. This preserves the very small HUD details while remaining responsive.
5. Keep the common shell and control panel static. Overlay only the layers that differ between state A and state B.
6. Preserve SVG root aspect ratios and do not apply broad global image sizing rules that distort supplied assets.

## Animation Model

Use one shared CSS animation timeline for every moving layer:

- Half-cycle duration: `1.5s`.
- Endpoint hold: first `40%` of each half-cycle, approximately `600ms`.
- Transition: remaining `60%`, approximately `900ms`.
- Direction: `alternate`.
- Iteration: infinite.
- Transition easing: cinematic symmetric curve such as `cubic-bezier(0.65, 0, 0.35, 1)`.
- Full A → B → A loop: approximately `3s`.

All keyframes must use the same duration, direction, and phase so no layer drifts over repeated loops.

### Layer behavior

1. **Static shell and controls**
   - Do not animate.
   - Render once from the shared assets and exact Figma positions.

2. **Main scope**
   - Animate wrapper position and size from the start-state bounds to the end-state bounds.
   - Crossfade the two supplied scope SVG variants inside the moving wrapper because their internal tick geometry differs.
   - Keep both variants spatially aligned so the change reads as a zoom/expansion rather than a dissolve.

3. **Trajectory markers**
   - Render four marker rows once.
   - Animate the trajectory container from its start location to its end location.
   - Animate row offsets from the tightly packed start arrangement to the end-state `18px` spacing.
   - Allow the end-only lower accent to fade/translate in near the latter part of the transition.

4. **Telemetry/readout group**
   - Animate from `opacity: 0` to `opacity: 1`.
   - Add only a subtle vertical offset during reveal; avoid blur or glow not present in Figma.
   - Reverse naturally when returning to the start state.

5. **Heading/target indicator**
   - Use matched wrappers for shared pieces.
   - Interpolate position, scale, and rotation where CSS geometry maps cleanly.
   - Crossfade only the supplied state-specific text/vector assets that cannot be shape-morphed.

6. **State-specific background vectors**
   - Overlay and crossfade the start/end variants in place.
   - Keep the opacity handoff synchronized with the scope expansion so no frame appears doubled.

## Interaction and Accessibility

- The animation starts automatically on page load and requires no click target.
- The visual lower controls remain presentational; do not invent control behavior that is not part of the request.
- Do not add playback buttons, labels, cursor affordances, sound, or unrelated UI.
- Under reduced-motion preferences, stop all keyframes and show the complete start frame as a stable fallback.
- Prevent accidental page scrolling at the native aspect ratio while still allowing the canvas to shrink on short or narrow viewports.

## Implementation Sequence

1. Inventory the assets referenced by both generated Figma TSX files and copy only the needed SVGs into `public/assets/`, deduplicating shared files.
2. Build the normalized static HUD shell in `src/App.tsx` and match node `1:19` before adding motion.
3. Separate divergent layers into start/end variants while retaining one copy of every shared layer.
4. Add synchronized CSS variables and keyframes in `src/index.css`.
5. Match both endpoint states exactly at the `0%/40%` and `100%` keyframes.
6. Add responsive canvas scaling and reduced-motion behavior.
7. Inspect the animation in the existing supervised preview; do not start another development server.

## Verification

1. **Endpoint fidelity**
   - Pause or temporarily inspect the timeline at state A and compare against node `1:19`.
   - Inspect at state B and compare against node `1:442`.
   - Verify the canvas is 272×331 at native size and retains the aspect ratio when scaled.

2. **Asset integrity**
   - Confirm every referenced `/assets/*.svg` exists and is non-empty.
   - Confirm each visible static asset appears in its intended layer and position.
   - Search source code to ensure there are no Figma temporary URLs, `.figma/design-context` runtime paths, or `/tmp` references.

3. **Motion**
   - Observe at least two full loops.
   - Confirm A holds, transitions smoothly to B in about 900ms, B holds, and reverses without a jump.
   - Confirm scope, trajectory, telemetry, indicator, and state-specific crossfades remain phase-locked.
   - Confirm reduced-motion mode shows a stable start state.

4. **Responsive behavior**
   - Check the native 272×331 viewport.
   - Check a narrow mobile viewport and a wide desktop viewport.
   - Confirm the full HUD remains visible, centered, undistorted, and free of unintended scrollbars.

5. **Code verification**
   - Run `pnpm build` because this is a broad UI implementation rather than a localized edit.
   - Treat any TypeScript or Vite failure as blocking and correct it before completion.

## Out of Scope

- Adding interactive control behavior.
- Adding an animation library.
- Inferring additional intermediate states beyond smooth interpolation of the two supplied frames.
- Editing the source Figma file or adding prototype metadata.
- Deployment, commits, or changes to the Figma Make development-server scripts.
