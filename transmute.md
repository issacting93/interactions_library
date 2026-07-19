# TRANSMUTE — a prompt for fusing two HTML interactions into a third

> Paste this, then attach or paste **Source A** and **Source B** (HTML/JS files).
> Replace the bracketed line at the bottom if you want to steer the outcome.

---

You are going to **transmute** two working HTML interactions into a third one that is neither.

Transmutation is not collage. A collage keeps both sources intact and puts them next to each other. A transmutation destroys something from each and produces a thing that could not be decomposed back into its inputs. Your job is the second one. If the result can be described as "A, with B's animation bolted on," you have failed.

**Do not write any code until Phase 4.** The reasoning is the work; the code is transcription.

---

## Phase 1 — Reduce each source to its grammar

For **each** source separately, state in prose (not code):

- **Mechanic** — what the user does, what happens. One sentence.
- **State model** — what actually varies. Usually 1–3 numbers. Name them.
- **Spatial logic** — the coordinate system the thing thinks in (polar? linear? tree? grid?).
- **Fixed point** — what *doesn't* move. There is always one. Find it. This is the most important line in this phase.
- **Vocabulary** — the primitive shapes and marks it draws with.
- **What's load-bearing vs. decorative** — be honest. Most sources have a feature the author believes is central that is actually garnish, and a detail they think is garnish that is doing all the work.

Read the *code*, not the screenshot. If a source has 14 copies of the same hand-placed SVG, that is a parametric system that hasn't been written yet — say so.

## Phase 2 — Find the isomorphism

Complete this sentence out loud:

> **"A's ⟨X⟩ is secretly B's ⟨Y⟩."**

Both sources are doing some same thing under different clothes. A rotating dial and a vertical dot-nav are the same object — one is the other unrolled. A skill tree and an orbital diagram are the same object — one has semantics, the other has only structure.

If you cannot complete that sentence honestly, **stop and say so.** Do not proceed to build. Two things with no shared structure can only be collaged, and you should tell the user that rather than deliver a mashup with a confident description.

## Phase 3 — Name the organizing principle

Name a single metaphor that both sources are **special cases of**. Two words maximum.

*(Worked example: a dial that rotates a selection to a fixed reader, fused with a nav that resolves content at a fixed panel → **rotor / stator**. The disc turns; the housing reads. Both sources are now instances of one machine.)*

Rules:
- If the name requires a paragraph to explain, it isn't one — you have a mashup. Go back to Phase 2.
- The name must **do work**: it should decide arguments for you later. If it can't settle a design question, it's a label, not a principle.
- Prefer names from mechanisms, anatomy, or physics over names from software.

## Phase 4 — Kill one mechanic

**This is the transmutation. Everything before was analysis.**

A and B each have: a selection model, a fixed point, and an owner of state. **They cannot both survive.** Two selection models in one interface is an interface with none.

State explicitly:
- What conflicts.
- **Which one dies.** Name it.
- What is lost. Say the cost out loud — do not pretend the loss is a win.

The loss is not a compromise. It is the mechanism. A thing that keeps both sources whole is a thing that has not been transmuted.

Then build.

## Phase 5 — Report what emerged

Something should fall out of the architecture that **was not in the spec.**

*(Worked example: making satellites physics nodes chasing rotating targets — done for the open/close animation — meant they also lag and stretch when the dial turns. Nobody asked for that. It became the best thing in the build.)*

If nothing emerged, the fusion was probably shallow. Say so honestly rather than dressing up a spec item as an emergent property. Report emergence as a *discovery*, not a feature you planned.

---

## Visual grammar — non-negotiable

The output keeps the technical-instrument / sci-fi drafting language. This grammar is what makes generated output read as *designed* rather than as random circles.

**Structure**
- Everything sits in one coordinate field with an explicit origin — polar or orthogonal, chosen, not defaulted.
- Space is divided into **bands, and each band has exactly one job** (structure / tick / data / orbit / void). This is the single move that separates instrumentation from soup.
- **Void bands are load-bearing.** Target 60–70% empty. Emptiness is a designed element, not leftover.
- Angles/positions **snap to a division grid**. Expose the snap strength as a parameter — that dial is the whole order↔chaos axis.
- **Crop the frame. Never center it.** Let the form run off the canvas edge.

**Ink**
- **Three line weights. No more.** Hairline (texture) / primary (structure) / heavy (mass).
- **One accent color, and it is a route — not a scatter.** A single continuous path: origin → break → orthogonal trace → *fixed destination* (a boxed value, a terminal, a read position). Under 5% of total ink. If the accent appears in three unrelated places, it is decoration and it has failed.
- **Type stays axis-aligned**, always — even inside a rotating polar frame. Rotated labels read as mandala; upright labels read as instrument. Counter-rotate children if the parent turns.
- Micro-text is **texture, not information**. Rows of small marks. Do not make it legible.
- Escape traces: a few paths that leave the coordinate system orthogonally and terminate at the frame edge.

**If a writing system / glyph set is supplied**
- Glyphs are **identity, not language.** One symbol per node.
- Never let alien script carry information the user must actually read. If the interface has a job (a portfolio, a nav, a control), labels stay legible and glyphs index.
- Deal glyph assignments **from the seed**, so re-seeding rewrites the script along with the chrome.

---

## Technical constraints — non-negotiable

- **Zero runtime dependencies.** No CDN, no React, no Babel, no Tailwind, no anime.js. Every external fetch is a failure point, and "graceful degradation" usually means *the main feature silently doesn't work*. Vanilla HTML + inline CSS + inline JS. One file.
- **Write the springs yourself.** Semi-implicit Euler, per-channel velocity:
  ```js
  function stepSpring(v, vel, target, dt, k, c){
    const a = k*(target - v) - c*vel;
    vel += a*dt; v += vel*dt;
    return [v, vel];
  }
  ```
  Stagger via `startAt` timestamps the integrator skips until due. Expose stiffness/damping as live sliders.
- **One rAF loop owns the DOM.** Plain objects for state, a pooled set of elements, `frame()` writes attributes. No framework in the render path.
- **Namespace every `id`.** Figma exports reuse `path-1-inside-1` / `paint0_radial` across every element; they all silently resolve to the first. Generate IDs, and grep the output: every `id` unique, every `url(#…)` resolves.
- **Interaction**: click + keyboard + touch. Hover is *garnish* — gate it behind `(hover:hover) and (pointer:fine)`. Hover-only is broken on every phone.
- **Mobile**: `touch-action` on the canvas, `overscroll-behavior:none`, `env(safe-area-inset-*)`, and hit-testing derived from `getBoundingClientRect()` against a fixed viewBox so it's resolution-agnostic.
- **External images**: preload with `new Image()` and only commit on success. SVG `<image>` `onerror` is unreliable. Never render a broken frame.

---

## Verify — do not assume

Before delivering, **prove the thing works** rather than asserting it:

- **Physics constants are coupled.** Spacing, radius, pull strength, and blur `stdDeviation` jointly determine whether metaballs actually merge. Compute the settled gaps numerically and check them against the merge threshold (~2× blur). *A goo filter over blobs that never touch is decoration doing nothing* — this exact failure is easy to ship and hard to see.
- Simulate the integrator headlessly: confirm motion happens, overshoots, and settles. Confirm angular wrapping takes the short path.
- Check layout math at **both** orientations before claiming responsive.
- Audit IDs and filter references programmatically.
- When you tune coupled constants, **leave a comment saying they're coupled.**

State what you verified and what you didn't. If something is a guess, label it a guess.

---

## Output

1. **Phases 1–4 in prose, before any code.** Brief. The isomorphism sentence and the kill decision are the deliverable — the code is downstream of them.
2. One self-contained `.html` file.
3. A short close covering: what emerged (Phase 5), what you verified numerically, one honest trade-off or risk, and the one thing that most wants tuning next.

Do not narrate tool use. Do not pad. Do not describe the result as "seamless," "elegant," or "perfect" — describe what it *does* and what it *cost*.

---

## Failure modes — read before starting

- **Collage wearing a fusion's clothes.** Both mechanics survive, sitting side by side. Test: name the organizing principle. If you can't, you collaged.
- **The accent scattered.** Green/orange sprinkled on six unrelated elements instead of tracing one route to one destination.
- **Dead physics.** Springs configured, blur applied, nothing actually merges or overshoots. Verify numerically.
- **Cargo-culted goo.** A metaball filter over elements that never approach each other.
- **Alien script over real content.** Beautiful, unusable. Glyphs index; they don't label.
- **Density mistaken for richness.** The reference images are 70% empty. Restraint is the effect.
- **CDN optimism.** "It falls back gracefully" = "it's broken and doesn't say so."
- **Claiming without checking.** Every "this works" that wasn't run is a guess with confident punctuation.

---

**Source A:** `[paste / attach]`
**Source B:** `[paste / attach]`
**Steer (optional):** `[e.g. "the result should be a navigation, not a toy" / "keep A's palette" / "N is data-driven, not hardcoded"]`