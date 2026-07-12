# Folio

Folio is a local-first, **handwriting-only** arithmetic notebook: a first software slice of the learning tablet described in [`eink-tablet-poc-implementation.md`](./eink-tablet-poc-implementation.md).

There is no keyboard anywhere in the app. Learners work problems out in ink and write their answer in a dashed box; an on-device [$P point-cloud recognizer](https://depts.washington.edu/acelab/proj/dollar/pdollar.html) reads the digits (with "did you mean" correction chips when it's unsure). No model download or network is needed for recognition.

Lessons are driven by a slice of the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy): 13 early-math micro-topics wired by real prerequisite edges. Chapters unlock when the concepts they depend on are mastered; every problem — story problems, missing-number equations, arrays, times tables — is generated fresh inside that reviewed structure, never pulled from a fixed bank. Tap the chapter name to see the learning map. See [`ATTRIBUTION.md`](./ATTRIBUTION.md).

Also included: adaptive review of mastered topics, local progress with versioned export/import (v1 exports migrate automatically), a PWA shell, an e-ink discipline mode (limited palette, no motion, simulated page-turn refresh), and an optional WebGPU local tutor powered by `LiquidAI/LFM2.5-350M-ONNX` that gives hints grounded in the current problem.

## Run locally

```sh
npm install
npm run dev
```

Run `npm test` and `npm run build` before publishing. GitHub Actions deploys `main` to GitHub Pages.

## Local tutor

Deterministic two-stage hints are always available per topic. Enabling local AI downloads a revision-pinned Q4 model from Hugging Face and runs inference in a Web Worker. The prompt lives in [`src/tutorPrompt.ts`](./src/tutorPrompt.ts). WebGPU and significant free storage/memory are required; unsupported devices fall back cleanly.

## Privacy

No account, analytics, API key, backend, or remote font request is used. Progress stays in `localStorage` unless the learner explicitly exports it, and versioned exports can be imported on another device.
