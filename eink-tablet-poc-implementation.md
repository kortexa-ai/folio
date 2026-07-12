# PoC Implementation Plan: Learning Tablet Software as an iPad PWA
*Companion to "Concept: E-Ink AI Learning Tablet" — draft v0.1*

---

## Purpose and honest framing

Before committing to hardware, prove the software experience: handwriting-first AI tutoring with generated, interactive lessons. The PoC is a website / installable PWA running on iPad with Apple Pencil. This deliberately sacrifices two pillars of the final product — e-ink (we get a glossy LCD) and distraction control (iOS notifications will do their worst) — to de-risk everything else cheaply and fast.

**What the PoC proves:**
- The core loop feels good: write with a pen → get tutor feedback on your actual worked steps → lesson adapts.
- On-the-fly lesson and diagram generation is coherent, grounded, and fast enough.
- The local/cloud two-brain split works in practice (or teaches us where the seam really belongs).
- Assessment → mastery model → adaptive next-lesson actually closes the loop.

**What the PoC does not prove:** e-ink rendering constraints, battery life, distraction-free value proposition, fleet/school management. Those are hardware-phase questions. We simulate one of them anyway (see "E-ink discipline mode" below) so we don't design ourselves into an LCD-shaped corner.

## Target platform

- iPad (any Pencil-capable model; primary test device should be a mid-range one, not a Pro).
- Safari as the runtime, installed to home screen as a PWA (standalone display, no browser chrome).
- Landscape and portrait both supported; portrait is primary (it's a notebook).
- No App Store submission for the PoC — Safari PWA keeps iteration at web speed.

## Stack

- **App shell:** TypeScript + React (or Preact for weight), Vite build.
- **Rendering:** three.js on a full-viewport WebGL canvas for the "page" — ink, diagrams, generated illustrations, and stepped animations all live in one scene graph. Orthographic camera, 2D-in-3D; three.js buys us cheap layering, zoom/pan, transitions, and later fancier interactive diagrams (3D geometry, physics demos) for free.
- **Ink capture:** Pointer Events with `getCoalescedEvents()` for full Pencil sample rate and `getPredictedEvents()` for perceived latency; pressure and tilt from the pointer event; `touch-action: none` on the canvas; palm rejection = ignore `pointerType === "touch"` while a `pen` pointer is active.
- **State:** a small store (Zustand-class), persisted through a storage adapter (below).
- **PWA:** manifest + service worker (Workbox) precaching the app shell and lesson scaffolds for offline.

## Architecture: same two brains, browser edition

**Local brain.** Run a sub-1B model in-browser via WebGPU (e.g., LFM 2.5 230M–class through transformers.js / ONNX Runtime Web, or a WebLLM-supported equivalent). iPad Safari has WebGPU as of recent iPadOS, so this is genuinely testable on-device. Its PoC duties: hints, quick checks, session flow, escalate-or-not decisions. **Fallback flag:** if in-browser inference proves too slow or memory-hungry on the test iPad, stub the local brain with a cheap cloud model behind the same interface and record that finding — it directly informs the hardware spec.

**Cloud brain.** Frontier models (Fable/Opus, GPT 5.5/5.6 class) plus an image model for diagrams. Browser can't call these APIs directly (keys in client = leaked keys; CORS besides), so the PoC needs one thin backend: a stateless proxy (single Cloudflare Worker / small Node service) that holds keys, enforces the tutor system prompt and safety wrapper, and streams responses. This is the only server component in the PoC. BYOK can be tested by letting the proxy accept a user-supplied key per session.

**Handwriting recognition.** The make-or-break subsystem. PoC strategy: don't build — evaluate. Wire an HWR interface with two swappable implementations: (a) an in-browser model (e.g., a small on-device HWR net via ONNX) and (b) a cloud HWR API through the proxy. Additionally, test the shortcut that may make dedicated HWR partially unnecessary: send the rendered ink as an image to the multimodal cloud tutor, which reads handwriting shockingly well and sees the *spatial* work (crossed-out steps, arrows, diagram annotations) that text transcription destroys. The PoC should measure all three on real student-style scrawl.

## The page model

Everything on screen is a **Page**: an ordered stack of layers in the three.js scene —

1. Lesson layer: generated text and problems, rendered as textures/SDF text.
2. Illustration layer: cloud-generated diagrams and images.
3. Animation layer: stepped sequences (frame N advances on tap or tutor cue) — matching the e-ink flipbook principle from the concept doc, so nothing we build depends on 60fps.
4. Ink layer: the student's strokes, chunked into stroke objects with timestamps, so the tutor can reference "step 3" both spatially and temporally.

**E-ink discipline mode (recommended):** a debug toggle that limits the palette to the Kaleido-ish gamut, disables smooth animation, and adds a simulated refresh flash on page turns. Costs a day, saves us from falling in love with LCD-only interactions.

## Content pipeline (PoC scale)

Pick one wedge: e.g., a single middle-school math unit. Hand-author 5–10 lesson scaffolds (learning objective, prerequisite tags, problem archetypes, assessment blueprint) as JSON — this stands in for the publisher pipeline. The cloud brain instantiates each scaffold freshly per student per session: wording, numbers, examples, and diagrams generated on the fly, grounded in the scaffold. Even at PoC scale, generation happens *inside* reviewed structure, proving the anti-textbook-dump, anti-freestyle middle path.

## Personal data and storage

Per-student data (profile, mastery model over the concept graph, assessment history, session logs, recent ink) is stored **on-device, initially in localStorage** behind a `StorageAdapter` interface with `get/set/list/export/import`.

Two constraints to design around, both handled by the adapter seam:
- localStorage is ~5MB and synchronous; ink strokes and session logs will blow past it quickly. Plan to swap the adapter's backend to IndexedDB the moment it pinches, without touching app code. Ink for *completed* sessions can be discarded or downsampled — the mastery model, not the raw strokes, is the persistent asset.
- iOS can evict web storage for sites unused for extended periods; installed PWAs fare better, and calling `navigator.storage.persist()` helps. Regardless: an explicit **Export/Import** button (JSON download) is the PoC's backup story, and doubles as the future cloud-sync test harness.

No accounts, no server-side student data in the PoC. The proxy stays stateless. This keeps the privacy surface near zero while we're experimenting — consistent with the local-first story in the concept doc.

## Milestones

1. **Ink on glass (week 1–2):** PWA shell, three.js page, Pencil ink with pressure, palm rejection, e-ink discipline toggle. Success = writing feels like writing.
2. **The tutor sees your work (week 3–4):** proxy up; ink → image and/or HWR text → cloud tutor; streamed feedback rendered on the page. Success = "you flipped the sign in step 3"-grade feedback on real handwriting.
3. **Local brain online (week 5–6):** WebGPU model running hints/checks/escalation; measure latency and memory on the test iPad; fallback stub if needed. Success = data on where the local/cloud seam belongs.
4. **The loop closes (week 7–8):** lesson scaffolds, on-the-fly instantiation with generated diagrams, quick assessments updating the mastery model, next lesson adapting. Success = a stranger's kid does two sessions and the second one is visibly *theirs*.
5. **Kitchen-table pilot (week 9+):** a handful of real students, export their (anonymized, consented) session data, write up findings for the hardware decision and the Steve/publisher conversation.

## Risks and mitigations

- **WebGPU model perf on iPad Safari** → fallback stub behind the same interface; the failure itself is a useful hardware-spec finding.
- **HWR quality on kid handwriting** → three swappable approaches measured side by side; multimodal-vision path as the wildcard.
- **Safari PWA quirks** (storage eviction, audio autoplay limits, no Push in some configs) → installed-PWA testing from day one, `persist()`, export/import safety net.
- **localStorage ceiling** → adapter seam, IndexedDB swap pre-planned, ink downsampling policy.
- **Cloud latency making tutoring feel dead** → streaming everywhere, local-brain acknowledgments ("checking your work…" is generated locally, instantly), diagram generation prefetched during the student's writing time.
- **LCD seduction** → e-ink discipline mode used in every design review.

## Open questions

1. React vs. going frameworkless around the three.js canvas — how much shell UI does the PoC really have?
2. Does the PoC need audio (tutor voice / read-aloud), or is that scope creep for phase one?
3. One shared iPad profile vs. simple local multi-student switcher for the kitchen-table pilot?
4. How much of the lesson scaffold format should be co-designed with the publisher now vs. retrofitted after the pilot?

---
*Prepared for follow-up conversation with Steve. Sibling document: eink-learning-tablet-concept.md*
