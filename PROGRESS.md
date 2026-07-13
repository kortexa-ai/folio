# Folio build log and handoff

Last updated: 2026-07-13 (America/Los_Angeles) — v4

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

## v3 "magical diary" rework (2026-07-13)

North-star redesign: the app is no longer a website with a scratchpad — it is one full-screen
notebook page that writes back (think the enchanted diary, not a quiz form).

- **All buttons removed from the learning flow.** The entire viewport is the ink canvas; the
  learner writes anywhere (Pencil on iPad, finger on iPhone — palm rejection kept). Two gestures
  replace the old Check/Hint/Clear buttons: **circle your answer** to hand it in (ring detection =
  closed stroke enclosing other ink, `detectAnswerCircle`), and **draw a `?`** for a hint (the $P
  recognizer gained question-mark templates; the gesture strokes fade out as the notebook
  "absorbs" them). Probed against partial digit strokes — no false positives.
- **The notebook speaks in its own hand.** Problems and replies render in a bundled OFL
  handwriting face (Patrick Hand, 22KB woff2 subset — no remote font) with a letter-by-letter
  ink-soak reveal. Feedback is written prose ("9 — beautifully done." / "8? Not this one — but
  you're close."), with tappable hand-drawn correction chips when recognition is unsure.
- **Chrome reduced to diary furniture:** ribbon bookmark → settings, chapter name in script →
  learning map, folded page corner → fresh page, page number, and a one-line gesture legend.
  First run, the notebook introduces itself and teaches the two gestures.
- **BYOK "wiser friends" (`src/cloud.ts`).** Optional keys for Anthropic / OpenAI / xAI /
  OpenRouter, model overrides, and a preferred-brain picker; all persisted in localStorage only.
  Escalation seam: deterministic whisper → local WebGPU brain → cloud (only from the second hint
  or after repeated misses). Every cloud call is wrapped in `CLOUD_SYSTEM_PROMPT` (Socratic,
  never answers, child-safe) regardless of whose key — per the concept doc's BYOK guardrail.
  Browser-direct calls (Anthropic CORS header, OpenAI-style endpoints); pure request
  builders/parsers unit-tested.
- **Little pictures.** Story pages get a generated illustration taped in like a polaroid:
  `gpt-image-1` with an OpenAI key, else fal.ai (`fal-ai/flux/schnell`), async and silent on
  failure, only when enabled.
- **iPhone works** as a smaller notebook (responsive margins/typography, safe-area insets,
  touch-drawn gestures verified via CDP touch events).
- Tests: 38 across curriculum, recognizer (incl. gestures), storage, and cloud builders.
  Verified end-to-end under Playwright/Chromium: welcome → doodle (no false triggers) → `?` hint →
  wrong answer circled (gentle nudge + chips) → right answer circled (praise + page turn) →
  contents/settings panels → key persistence across reload → dog-ear skip → e-ink mode → iPhone
  viewport with finger input.
- Known follow-ups: local-brain auto-suggest on capable devices; sending the actual ink image to
  multimodal cloud tutors (the concept doc's HWR wildcard); illustration count-accuracy for story
  scenes; real-device Pencil latency pass.

## v4: the notebook remembers + little-brain weave (2026-07-13)

**Progress tracking (storage v3, mastery model v2).**
- Per-topic **memory strength** with exponential decay whose half-life grows with practice
  (`effectiveStrength`); mastered chapters come back "for a polish" when they fade
  (`isReviewDue` → scheduler), replacing the old random 18% review.
- Per-topic outcome **history ring buffer** → struggle detection (≥4 misses in last 6);
  the scheduler answers struggle with a **warm-up on the weakest prerequisite** (35% chance).
- **Sessions** (30-minute gap rule; solved/misses/hints; capped at 40) → "days written";
  per-topic **time-on-task** (page-shown → solved, capped 5 min/page) and hint counts.
- Migrations: v1 → v3 and v2 → v3 (strength derived from mastery state); real-UI migration
  verified by loading a v2 record into localStorage in the browser.
- Kid-facing: mastery **streak dots** under the chapter script (★ once mastered), a hand-drawn
  **star flourish** on the mastery moment, contents rows with ★ / "we are here" / "time for a
  polish" / "tricky right now", days-written line. Grown-up-facing: a **For grown-ups** section
  in settings — per-chapter accuracy, minutes, hints, ★/⚑ flags.

**UX.**
- **Scribble-to-erase**: a vigorous zigzag (≥5 direction reversals, path ≫ box) over ink fades it
  away; a single strike-through or an 8 stays (crossed-out work is signal, per the concept doc).
- **Legibility bands** on circled answers, measured against synthetic scrawl: confident reads
  (<0.8) record attempts; uncertain reads (0.8–1.4) get an answer but never touch the mastery
  model; illegible or 3+-digit reads stay silent unless they look like a deliberate answer
  (≤4 strokes, tall) — so the arrays/represent chapters, which literally ask kids to circle
  groups of dots, no longer poison mastery with garbage attempts.
- **Idle whisper**: an untouched page murmurs one kind, kind-specific way to start after ~40s
  (`folio-idle-ms` localStorage override for testing).
- Review pages announce themselves ("Let's flip back to X — just to keep it shiny").

**Little brain, woven in (not bolted on).**
- Worker upgraded to a general `generate` API behind a **sequential queue** (interleaved
  generation on one pipeline is unsafe); tutor module tracks `isAwake`, worker is now lazy.
- `src/voice.ts`: the brain **retells story problems** around the learner's favorite things
  (new "stories about…" setting) and **pre-writes praise quips** — all prefetched into pools
  during the learner's thinking time (zero added latency), all validated hard
  (`acceptRewrite`: exact numbers preserved, none added, answer never leaked, question intact,
  length caps; `acceptQuip`: short, number-free) with instant deterministic fallback. The model
  never decides math; retold stories get neutral hints so guidance stays coherent.
- Enablement is now **persistent** (`folio-brain`) — the brain wakes with the notebook.
- Escalation seam unchanged: deterministic → local brain → BYOK cloud.

Tests: 60 across curriculum/scheduler, recognizer/gestures/legibility, storage/sessions,
voice validators, and cloud builders. Verified in-browser end-to-end (erase, silent group
circles, streak dots, mastery star, grown-ups table, v2 migration, idle whisper). The real
WebGPU generation path still needs an iPad pass — validators and gating are unit-covered.

## v4.3: the black-box journal (2026-07-13)

The pilot user has no computer attached to the iPad, so the notebook now carries its own
diagnostics: `src/journal.ts` is a 60-entry ring buffer in localStorage (synchronous writes
survive tab crashes) recording boots (with build stamp + screen + installed-PWA flag), global
errors/unhandled rejections, clean exits, brain lifecycle (waking / loading at 25% milestones /
awake / clean failure / sleep), and crash-guard trips. No learner content is ever recorded.
Settings → "If something goes wrong" shows the journal with **Copy journal** (clipboard, with a
select-all textarea fallback) and Clear. Verified in-browser: a seeded crashed-session journal
reads boot → waking → loading 25% → (crash) → boot → crash-guard tripped, and the copied
report includes the device UA. Build stamp injected via vite `define`. Tests: 67.

## v4.2: iOS crash fix — lighter brain + crash-loop guard (2026-07-13)

Field report: the page crashed in Safari on iOS. Diagnosis: the 350M q4 checkpoint can blow
iOS Safari's per-tab memory budget, and v4's auto-wake turned one bad load into a crash loop
(crash → reload → auto-wake → crash).

- **Model**: switched to `LiquidAI/LFM2.5-230M-ONNX` (q4) — the concept doc's floor model;
  LiquidAI's card lists q4 as the smallest/fastest WebGPU option, best on phones. Revision is
  temporarily `main`: huggingface.co is unreachable from this build environment, so the sha
  pin should be restored on the next pass.
- **Crash-loop guard**: a localStorage sentinel is armed while the brain is awake and the page
  visible; backgrounding (normal iOS PWA reclaim) and clean exits clear it, a crash cannot.
  Finding it at startup skips the wake, turns the setting off persistently, and explains in
  settings ("…seemed too heavy for this device last time…"). A clean load failure keeps the
  setting and just shows the error.
- **Gentle auto-wake**: waits 2.5s after first paint and never fires without WebGPU.
- Verified in Chromium with an init-script-planted sentinel (crash path: wake skipped, toggle
  off, message shown; clean-failure path: setting kept, sentinel cleared). Found and worked
  around en route: worker fetches bypass Playwright routes, and a clean reload's pagehide
  rightly clears the sentinel — which is exactly why real crashes (no pagehide) are caught.
- Still to confirm on the actual iPad: that 230M q4 fits. If it still crashes, the guard now
  contains the damage and the next candidates are fp16 embeddings variants or CPU (wasm)
  execution as a fallback tier.

## v4.1: the tutor sees your work (2026-07-13, autonomous session)

Milestone 2's wildcard from the implementation doc — send the rendered ink to the multimodal
cloud tutor instead of (only) transcribing it.

- `InkPad` exposes `snapshot()`: live strokes re-rendered onto a white offscreen canvas
  (bounded, long side ≤896px, ≥2.5px stroke width, JPEG ~5–10KB).
- Cloud escalations (second hint / repeated misses) attach that photo: Anthropic gets a base64
  image block, OpenAI-style providers (GPT/Grok/OpenRouter) get an `image_url` part; the prompt
  tells the tutor to ground its nudge in what the child actually wrote or drew. If the model
  rejects the image (400/no vision), `askCloud` retries once text-only — hints never break.
- Illustration prompts now blur the counts (`3 apples` → `some apples`) so a generated drawing
  can't contradict the arithmetic.
- Verified end-to-end under Playwright with an intercepted Anthropic endpoint: hint #1 stayed
  deterministic (zero calls), hint #2 carried a 7KB JPEG (inspected — working marks and the
  circled answer clearly legible) plus the grounding prompt, the mocked reply rendered on the
  page, and a forced 400-with-image fell back to a text-only retry (two calls captured).
  Tests: 63. Real-key quality pass on iPad still pending.
