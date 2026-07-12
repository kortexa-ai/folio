# Folio build log and handoff

Last updated: 2026-07-11 (America/Los_Angeles)

## Goal

Build the first client-only implementation of the learning-tablet brief, publish it as a private `kortexa-ai/folio` repository, and deploy it to GitHub Pages. Work lands directly on `main`.

## Current status

- Product brief reviewed and retained in the repository.
- First working app implementation written and locally validated.
- GitHub repository has not yet been created. The intended name `kortexa-ai/folio` was confirmed available.
- Pages has not yet been enabled or deployed.

## Implemented locally

- React + TypeScript + Vite static app.
- Single-digit addition, non-negative subtraction, and multiplication progression.
- Deterministic hints and automatic operation unlocking after five correct answers.
- Pencil/touch scratchpad using Pointer Events, coalesced samples, pressure, and basic palm rejection.
- Local progress, streak, reset, and JSON export.
- Optional e-ink discipline mode.
- Installable PWA manifest and offline app-shell service worker.
- Optional WebGPU local tutor using `LiquidAI/LFM2.5-350M-ONNX` via Transformers.js.
- Strict, short arithmetic-tutor system prompt in `src/localTutor.ts`.
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

1. Initialize Git on `main`, create private `kortexa-ai/folio`, and push the validated checkpoint.
2. Configure Pages for GitHub Actions and wait for a successful deployment.
3. Open the live site and test the core lesson flow and static asset paths.
4. Add further tests/accessibility polish and test model loading if time permits.

## Validation log

- 2026-07-11: `npm test` — 2 tests passed.
- 2026-07-11: `npm run build` — production build passed with Vite 8.1.4. The optional ONNX runtime WASM asset is ~23.6 MB uncompressed; the core app JS is ~201 KB before gzip.

## Known risks / follow-ups

- Confirm the exact output shape and browser compatibility of Transformers.js 4.2 with the LFM chat pipeline on a WebGPU device.
- SVG PWA icons work in modern browsers but PNG 192/512 variants improve iOS compatibility.
- Service worker is intentionally minimal; cache versioning should eventually incorporate the build hash.
- Current scratchpad ink is session-only and is intentionally not exported or sent to the tutor.
- Font CSS currently references Google Fonts; system fallbacks work offline, but bundling fonts would make appearance fully offline-consistent.
