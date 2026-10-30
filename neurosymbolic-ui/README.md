# Neurosymbolic UI

> Folder name is provisional — rename freely once the project has a settled title.

Research track on **hybrid (neurosymbolic) generative UI**: an LLM makes judgment calls about what a visitor needs, while a fixed grammar/constraint solver decides what layout is actually allowed. The LLM scores options; it never lays out the page itself. This is contrasted against a purely **agentic** approach (LLM free-writes the UI, a checker rejects rule-breaks and asks for retries).

Working title from the source deck: **"GenUI with Constraints"** (aka "Agentic Interface Study").

## Live sources

- Research pitch deck: https://claude.ai/artifact/PusgZ8tTjtUSn2B8YLnpYz — a Slides-type artifact (requires the Slides runtime; not something we can mirror as plain files, so it stays link-only here)
- Prototype 03 — Hybrid vs Agentic in Chat: https://claude.ai/artifact/D21UcruD4DqeXBD6TmnAQL (pulled into `prototypes/hybrid-vs-agentic-chat.html`)
- Prototype 02 — Hybrid vs Agentic (landing page), referenced from the deck but not yet pulled: https://claude.ai/artifact/37Er4QjqAijag3LaZXSGBc

## The core idea

| Condition | What changes per visitor | What stays fixed |
|---|---|---|
| Today's practice (baseline) | Product picks only ("recently viewed" rows); chat is text-only | The whole layout |
| Fully AI-generated (agentic) | AI writes the whole page from brand guidelines; a checker sends back mistakes | Nothing |
| **Hybrid (proposal)** | AI picks content and sections, within brand rules | Brand rules, plus the buy and chat buttons |

Mechanically, the hybrid pipeline is three stages: **LLM → grammar + solver → interface.** The LLM reads intent and scores which components fit (weights). It never places anything. A constraint solver enumerates every reply skeleton that satisfies the brand grammar (e.g. "quick replies always close a reply," "at most one product widget," "a product widget is always followed by the action bar") and picks among the valid ones using those weights. The result is always on-brand by construction, and when a message is a *refine* on the same need rather than a *switch* to a new one, the solver is anchored to the previous reply's skeleton (same length, same action-bar slot) so the layout doesn't jump around.

## Study design (from the deck)

- **2 studies**: a brand chat agent (inline cards/buttons in replies) and a landing page that builds around a typed query.
- **3 conditions** per study (table above), **2 visits** each (first load, then a return visit with context), **~160 online participants per study** (to confirm by power analysis; preregistered).
- **Draft hypotheses**: both generated conditions beat the static baseline on relevance (H1); hybrid feels more in-control on the return visit than fully-generated (H2); hybrid is as relevant as fully-generated but earns more trust (H3).
- **Open question flagged in the deck**: the LLM's refine-vs-switch read can be wrong — a false "refine" freezes a layout that should've changed, and a false "switch" moves one that should've stayed. Labelling accuracy here could become its own small evaluation.

## Prior art cited in the deck

- Vercel's `json-render` and Google's A2UI use a similar approved-component-set + LLM-selection pattern; Workday's Sana assistant reportedly does too.
- Academic: Cao/Jiang/Xia (CHI 2025) on generative task-driven UI data models; Chen et al. on generative interfaces for LMs; Findlater & McGrenere (CHI 2004) and Gajos et al. (CHI 2008) on adaptive vs. adaptable menus; Joshi et al. (ACL 2025) on declarative task-oriented agents; Lindley et al. (CHI 2026 workshop) on what GenUI means for HCI practice; Vaithilingam et al. (CHI 2024) DynaVis; Yang et al. (CHI 2024) ReactGenie.

## Prototypes

`prototypes/hybrid-vs-agentic-chat.html` — open directly in a browser. Runs a scripted 5-message conversation (breakfast idea → two refinements → two topic switches) through two simulated assistants side by side: the hybrid solver and the agentic generate-then-check loop. Shows per-turn metrics (time, approx. tokens, LLM calls, rules broken, layout slots changed) and a running log. Falls back to a deterministic local simulation when there's no live model connection (e.g. outside the Claude Artifacts runtime) — this is expected when opened as a plain file.

`prototypes/wfc-patch-regen.html` — open directly in a browser (relative paths assume it stays two levels under the repo root, next to `shared/` and `tools/patch/`). Follow-up prototype exploring whether [Wave Function Collapse](https://github.com/mxgmn/WaveFunctionCollapse) is a better model than the chat prototype's "filter candidates by two hand-picked properties" for *incremental* regeneration — i.e. when one cell in an already-resolved layout changes, what's the principled way to decide what else has to change?

It treats a signal chain between a fixed INPUT and OUTPUT as a WFC grid, with real `tools/patch` node types (`gain`, `effect`/TAPE SAT, `delay`, `limiter`) as the tile vocabulary and a small symbolic grammar (no immediate repeats, at most one DELAY in the chain, LIMITER only in the slot before OUTPUT) as the adjacency rules. An "intent" preset stands in for the neural judge, biasing which legal tile gets picked. Every visual piece — node cards, ports, cables, the LED toggle repurposed as a pin/anchor control — is `tools/patch`'s own components, used through their existing `P.ui.*` API; the only new code is the WFC engine and the grammar.

The thing it's actually demonstrating: click any module to swap it, and only the neighbours that are *no longer legal* re-collapse — propagation stops the instant a neighbour's existing value is still valid, logged live ("stable → slot 6 stays GAIN; ripple stops here"). "Regenerate all" is the naive comparison: it re-solves every unpinned slot from scratch, so you can see the difference in how much visibly changes.

Caveats, in the same spirit as the chat prototype's:
- The grammar is intentionally loose (gain is legal almost everywhere), so the implemented backtracking path for contradictions is correct but rarely exercises — same limitation as the chat prototype's `RULES` array.
- "Intent" is three hardcoded weight presets, not a live model call — there's no `window.claude.use('sample')` here at all, unlike the chat prototype. The neurosymbolic *shape* (neural-style soft weights feeding a symbolic solver that guarantees validity) is real; the weights themselves are not learned or inferred.
- It's a 1-D chain (6 interior slots), not a 2-D page grid. `wfc-component-layout.html` (below) is where a real multi-axis WFC grid gets tested.

`prototypes/wfc-component-layout.html` — open directly in a browser (same path depth as the other two). A layout generator in the literal sense: WFC assembles a bento-style page out of this repo's own, already-built, already-running components (`components/…` — the exact files `index.html`'s gallery serves), rendered live in iframes, not synthetic placeholder tiles. 8 regions form a non-uniform adjacency graph (read directly off the `grid-template-areas`, not a row/column matrix — the hero region touches six others, each frame touches two), each restricted to a role-appropriate pool of 10 real components (generative/ambient pieces for the two HERO regions, interaction widgets for the four WIDGET regions, decorative HUD pieces for the two FRAME regions), under four rules: role restriction, global no-duplicate-component, "at most one of the two frames occupied," and "a widget can only sit empty if some neighbour is occupied." SWAP on any region triggers the same ripple-and-stop propagation as the patch-chain prototype, generalized from a 2-neighbour chain to an arbitrary graph; PIN protects a region from "Regenerate all." The embedded components are still fully live — the Tracking Iris genuinely follows your cursor, Spine Unit genuinely locks on click.

This one caught a real, instructive bug during build: a rule written as a one-directional implication ("FILL forces the very next slot to DROP") only got re-checked on whichever cell collapsed *second*; a cell that collapsed *first*, before its neighbor existed to constrain it, could end up permanently violating the rule, because propagation never revisits an already-collapsed cell. The fix was adding the implication's contrapositive explicitly. This version's four rules are all written to be symmetric/self-correcting for that reason (checked fresh from both sides every propagation pass), and it's verified by a 3,000-trial headless stress test (boot + 6 random incremental edits each, zero rule violations) rather than by eyeballing a handful of screenshots — the earlier bug was exactly the kind that a screenshot or two can miss.

`wfc-component-layout.html`'s honest weakness: the *content* is a grab-bag. There's no real reason Terrain Grid belongs in "hero" more than Radar Display — swapping components demonstrates the mechanism but doesn't mean anything the way swapping `product_card` for `compare_table` meant something in the chat prototype. `prototypes/wfc-landing-page.html` (below) is the attempt to fix that: real product-page content instead of generative-art placeholders.

`prototypes/wfc-landing-page.html` — open directly in a browser (same path depth). A landing-page generator whose grammar comes from actual researched SaaS landing-page convention, not an invented one: hero → problem/stakes → solution → proof → objection-handling → close, social proof placed near the hero rather than buried, a CTA that repeats after Features and after Social Proof, testimonials sitting immediately before pricing, FAQ sitting right before the final close. Each rule card in the UI cites what it's grounded in (PAS/PASTOR copywriting frameworks, and sourced claims like "social proof worked hardest when it sat right next to the headline, not halfway down the page").

Structurally this is a step up from the other two: 10 slots, HERO and CTA_FINAL fixed as anchors, 8 interior slots each resolving to one of 8 real section types *or* EMPTY — so the page's actual **length** varies (a "Minimal" pass might generate 3 sections, "Long-form" might generate 7), not just which component fills a fixed slot. Content is built entirely from `shared/t8-ui.css`/`t8-ui.js` (buttons, cards, accordion, dialog, badges — the same shadcn/ui-shaped kit shown in `shared/t8-ui-gallery.html`) and `shared/hardware-ui.js` (the Showcase section mounts a real, draggable cable and two live knobs — `tools/patch`'s own components, decoupled). The signup dialog in the final CTA is a real native `<dialog>`, auto-wired by `t8-ui.js`'s mutation observer the instant WFC generates it.

Two bugs surfaced building this one, both caught by a headless stress-test harness (Node, no browser) before any UI work started:
1. A missing contrapositive, same class as the patch-chain bug above (problem/stakes could land *after* pricing because nothing enforced it — fixed with a static positional restriction, same shape as the social-proof-near-the-top rule).
2. A worse one: a rule written as `if (left is confirmed X) { require Y } else { forbid Y }` — where the `else` fired on *left is merely undecided*, not *left is confirmed not-X*. Three-valued logic (true / false / unknown) collapsed into two, and the rule spent "unknown" as "false." The result wasn't a visible rule violation — the solver was 100% rule-compliant — it just made three whole section types (Features, Social Proof, CTA-repeat) structurally unreachable, 0 occurrences in 2,000 trials. A pure correctness check would never have caught this; it took a separate frequency tally across many generations. Both fixes verified by a 5,000-trial stress test (boot + 10 random edits each) before any content was written.
