# Folio future improvements

This file holds worthwhile work intentionally deferred from the current product-polish pass.

## Reliability and offline

- Persist unfinished ink pages in IndexedDB and restore them after refresh, tab eviction, or accidental navigation.
- Precache the complete application shell from the Vite build manifest instead of caching assets only after first use.
- Show explicit offline readiness and local-model download/storage status.
- Add versioned recovery for interrupted progress writes.

## Accessibility

- Add optional visible hint, hand-in, erase, and undo controls for learners who cannot comfortably use gestures.
- Provide a dedicated reduced-motion setting in addition to respecting the system preference.
- Audit the complete experience with VoiceOver, keyboard navigation, switch control, and enlarged text.
- Add alternate high-contrast and dyslexia-friendly presentation modes without losing the notebook character.

## Privacy and security

- Add a restrictive Content Security Policy and a documented provider allowlist.
- Offer session-only API keys by default and make persistent storage an explicit grown-up choice.
- Add a lightweight grown-up lock for provider keys, reset controls, and detailed learning data.
- Pin all runtime dependency versions and automate tested dependency updates.

## Product research

- Test first-run gesture learning with children and educators on iPad, iPhone, and inexpensive Android tablets.
- Add a local scrapbook for selected story and wonder pages, with image/PDF export.
- Explain “why this page?” in the grown-up view using mastery, review, and prerequisite signals.
- Build an opt-in, privacy-preserving recognizer tuning workflow from manually exported diagnostics.

## Engineering scale

- Split `App.tsx` into mode components and focused hooks once the modes stabilize further.
- Model notebook transitions with a reducer/state machine to prevent impossible combinations of mode, intro, and page phase.
- Add Playwright coverage for real pointer traces, offline reloads, model fallback, import migrations, and mobile rotation.
- Add bundle-size and performance budgets to CI, keeping optional model code outside the initial application bundle.
- Add preview deployments for pull requests when the project moves back to a review-based workflow.
