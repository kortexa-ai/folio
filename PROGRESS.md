# Folio build log and handoff

Last updated: 2026-07-11 (America/Los_Angeles)

## Goal

Build the first client-only implementation of the learning-tablet brief, publish it as a private `kortexa-ai/folio` repository, and deploy it to GitHub Pages. Work lands directly on `main`.

## Current status

- Product brief reviewed and retained in the repository.
- First working app implementation written and locally validated.
- Public GitHub repository created and pushed: `https://github.com/kortexa-ai/folio`.
- GitHub Pages is enabled with the Actions deployment source at `https://kortexa-ai.github.io/folio/`.
- Repository variable `PAGES_ENABLED=true` enables the deployment steps after every successful test/build on `main`.

## Implemented locally

- React + TypeScript + Vite static app.
- Single-digit addition, non-negative subtraction, and multiplication progression.
- Deterministic hints and automatic operation unlocking after five correct answers.
- Pencil/touch scratchpad using Pointer Events, coalesced samples, pressure, and basic palm rejection.
- Local progress, streak, reset, and validated, versioned JSON export/import.
- Optional e-ink discipline mode.
- Installable PWA manifest and offline app-shell service worker.
- Optional WebGPU local tutor using `LiquidAI/LFM2.5-350M-ONNX` via Transformers.js.
- Strict, short arithmetic-tutor system prompt in `src/tutorPrompt.ts`.
- Model inference runs off the UI thread in a dedicated Web Worker; the model revision and Q4 dtype are pinned and GPU resources are disposed on page exit.
- Unit tests for problem generation and learning progression.
- GitHub Pages Actions workflow.

## Decisions

- The app is valuable without a model: deterministic tutoring is the reliable default.
- Local AI is explicitly enabled by the user because model download and device requirements are significant.
- The 350M LFM checkpoint is used instead of the 1.2B model to make in-browser use more plausible.
- No backend, accounts, analytics, cloud inference, or API keys in this version.
- Direct canvas rendering is used for the arithmetic scratchpad; three.js is deferred until interactive diagrams justify its cost.
- Direct commits to `main`; no pull requests.

## Resume here

1. Continue accessibility and real iPad/Pencil testing.
2. Test model loading on a WebGPU device; the current development machine may not expose a suitable browser GPU.

## Validation log

- 2026-07-11: `npm test` — 2 tests passed.
- 2026-07-11: `npm run build` — production build passed with Vite 8.1.4. The optional ONNX runtime WASM asset is ~23.6 MB uncompressed; the core app JS is ~201 KB before gzip.
- 2026-07-11: Private repo created and root commit `6b5de15` pushed to `main`.
- 2026-07-11: Pages creation attempted through `gh`; blocked with HTTP 422 because the current organization plan does not support Pages for this private repository.
- 2026-07-11: Production preview smoke-test passed for index, manifest, service worker, and hashed JS asset (all HTTP 200 with project-relative URLs).
- 2026-07-11: GitHub Actions run `29179301833` passed tests and build after gating unavailable Pages deployment.
- 2026-07-11: Transformers.js integration reviewed against model metadata: text-generation/WebGPU tags and Q4 ONNX files confirmed; inference moved to a Web Worker and revision pinned.
- 2026-07-11: Added validated progress import and removed the only remote font dependency. Test suite now has 4 passing tests across arithmetic and storage behavior; production build passes.
- 2026-07-11: Added raster 192px and 512px install icons for stronger iPad/Safari PWA compatibility and precached them for offline use.
- 2026-07-11: Hardened service-worker updates: navigation is network-first, old Folio caches are removed on activation, and offline navigation falls back to the cached shell.
- 2026-07-11: Latest full CI checkpoint `cd26361` passed. Updated checkout/setup-node Actions to v5 after GitHub flagged the v4 Node 20 runtime as deprecated.
- 2026-07-11: With explicit approval, changed `kortexa-ai/folio` from private to public, enabled Pages with the Actions source, and set `PAGES_ENABLED=true`.
- 2026-07-11: First public deployment succeeded in Actions run `29183066595`. Smoke-tested the live HTML, JS, CSS, manifest, service worker, and install icon at `https://kortexa-ai.github.io/folio/`; every endpoint returned HTTP 200 over HTTPS.

## Known risks / follow-ups

- Confirm the exact output shape and browser compatibility of Transformers.js 4.2 with the LFM chat pipeline on a WebGPU device.
- Service worker is intentionally small. Cache version changes are currently manual; a Vite PWA plugin could inject build revisions later.
- Current scratchpad ink is session-only and is intentionally not exported or sent to the tutor.
- System font stacks keep the app fully independent of remote font services; a custom bundled typeface can be considered later.

## v2 rework (2026-07-12)

- **Removed the keyboard.** The numeric input field is gone; answers are handwritten into a dashed answer zone on the ink page and read by an on-device $P point-cloud digit recognizer (`src/recognizer.ts`) with multi-digit grouping and tap-to-correct alternative chips. No downloads, works offline.
- **Curriculum is now a prerequisite graph, not a ladder.** `src/curriculum.ts` embeds 13 micro-topics and 16 dependency edges extracted from the Marble Skill Taxonomy (ODbL/CC BY-SA, see ATTRIBUTION.md). Topics unlock when prerequisites are mastered (first-try streak or accuracy threshold); mastered topics get occasional spaced review.
- **Lessons are generated, and varied.** Per-topic generators produce story problems with rotating names/objects, missing-number equations, making-ten scaffolds, array-drawing prompts, and times tables — each with two deterministic hint stages; the optional local model receives the full problem statement.
- **Learning map** panel (tap the chapter name) shows mastered / open / locked topics with taxonomy names, ages, and per-topic accuracy.
- **E-ink discipline mode upgraded** from a grayscale filter to limited palette + motion removal + a simulated refresh flash on page turns.
- **Storage v2** keyed by taxonomy topic id, with automatic migration of v1 per-operation exports.
- Tests: 17 across curriculum, recognizer, and storage. `npm test` and `npm run build` green.
