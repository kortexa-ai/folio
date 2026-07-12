# Folio build log and handoff

Last updated: 2026-07-11 (America/Los_Angeles)

## Goal

Build the first client-only implementation of the learning-tablet brief, publish it as a private `kortexa-ai/folio` repository, and deploy it to GitHub Pages. Work lands directly on `main`.

## Current status

- Product brief reviewed and retained in the repository.
- First working app implementation written and locally validated.
- Private GitHub repository created and pushed: `https://github.com/kortexa-ai/folio`.
- GitHub Pages is blocked by the organization plan: GitHub's API returned `422 Your current plan does not support GitHub Pages for this repository.` The repo remains private as requested.
- The Actions workflow still runs tests/builds on every push; its deployment steps are gated by repository variable `PAGES_ENABLED=true` so CI stays green while Pages is unavailable.

## Implemented locally

- React + TypeScript + Vite static app.
- Single-digit addition, non-negative subtraction, and multiplication progression.
- Deterministic hints and automatic operation unlocking after five correct answers.
- Pencil/touch scratchpad using Pointer Events, coalesced samples, pressure, and basic palm rejection.
- Local progress, streak, reset, and JSON export.
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

1. Choose one Pages unblock: upgrade the `kortexa-ai` plan or make the repository public. Do not change visibility without approval.
2. Once unblocked, enable Pages with `gh api --method POST repos/kortexa-ai/folio/pages -f build_type=workflow`, set `gh variable set PAGES_ENABLED --repo kortexa-ai/folio --body true`, rerun the workflow, and test the live URL.
3. Continue local smoke-testing and accessibility polish.
4. Test model loading on a WebGPU device; the current development machine may not expose a suitable browser GPU.

## Validation log

- 2026-07-11: `npm test` — 2 tests passed.
- 2026-07-11: `npm run build` — production build passed with Vite 8.1.4. The optional ONNX runtime WASM asset is ~23.6 MB uncompressed; the core app JS is ~201 KB before gzip.
- 2026-07-11: Private repo created and root commit `6b5de15` pushed to `main`.
- 2026-07-11: Pages creation attempted through `gh`; blocked with HTTP 422 because the current organization plan does not support Pages for this private repository.
- 2026-07-11: Production preview smoke-test passed for index, manifest, service worker, and hashed JS asset (all HTTP 200 with project-relative URLs).
- 2026-07-11: GitHub Actions run `29179301833` passed tests and build after gating unavailable Pages deployment.
- 2026-07-11: Transformers.js integration reviewed against model metadata: text-generation/WebGPU tags and Q4 ONNX files confirmed; inference moved to a Web Worker and revision pinned.

## Known risks / follow-ups

- Confirm the exact output shape and browser compatibility of Transformers.js 4.2 with the LFM chat pipeline on a WebGPU device.
- SVG PWA icons work in modern browsers but PNG 192/512 variants improve iOS compatibility.
- Service worker is intentionally minimal; cache versioning should eventually incorporate the build hash.
- Current scratchpad ink is session-only and is intentionally not exported or sent to the tutor.
- Font CSS currently references Google Fonts; system fallbacks work offline, but bundling fonts would make appearance fully offline-consistent.
