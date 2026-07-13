# Folio

Folio is **a notebook that writes back** — the software slice of the learning-tablet concept in [`eink-tablet-poc-implementation.md`](./eink-tablet-poc-implementation.md), redesigned around the north star: a kid's homework notebook that magically presents the right thing to learn next, not a website that tests you.

The whole screen is one ruled page. There are no buttons, no answer boxes, no forms — the notebook writes a problem in its own hand, and the learner writes anywhere with a pencil (iPad) or a finger (iPhone — it's just a smaller notebook). Two gestures do everything:

- **Circle your answer** to hand it in. An on-device [$P point-cloud recognizer](https://depts.washington.edu/acelab/proj/dollar/pdollar.html) reads the digits inside the ring (with tappable "or was it…" corrections when unsure).
- **Draw a `?`** and the notebook absorbs it and whispers a hint.

Get it right and the page turns itself. The only chrome is a ribbon bookmark (settings), the chapter name in small script (the learning map), a folded corner (fresh page), and a page number.

Lessons are driven by a slice of the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy): 13 early-math micro-topics wired by real prerequisite edges. Chapters unlock as the ideas they lean on are mastered, and every problem is generated fresh inside that reviewed structure — never pulled from a fixed bank. See [`ATTRIBUTION.md`](./ATTRIBUTION.md).

## The two brains (plus wiser friends)

- **Deterministic whispers** — two hint stages per problem, always available, offline.
- **The notebook's own little brain** — an optional on-device tutor (`LiquidAI/LFM2.5-350M-ONNX` over WebGPU, in a Web Worker) that grounds hints in the current problem. Nothing written ever leaves the device.
- **Wiser friends (BYOK)** — optional bring-your-own-key escalation to Claude, GPT, Grok, or OpenRouter when the learner is truly stuck (second hint or repeated misses). Keys live in `localStorage`, go directly from the browser to the chosen provider, and every call is wrapped in Folio's pedagogy/safety prompt ([`src/tutorPrompt.ts`](./src/tutorPrompt.ts)) — hints only, never answers.
- **Little pictures** — with an OpenAI key the notebook illustrates story pages via `gpt-image-1`; otherwise a fal.ai key is used. Drawings appear taped in like small photographs.

The escalation seam (deterministic → local → cloud) is the product experiment from the concept doc, in miniature.

## Run locally

```sh
npm install
npm run dev
```

Run `npm test` and `npm run build` before publishing. GitHub Actions deploys `main` to GitHub Pages.

## Privacy

No account, analytics, backend, or remote font (the handwriting face is bundled, see ATTRIBUTION.md). Progress stays in `localStorage` unless explicitly exported; versioned exports import cleanly on another device. Cloud calls happen only if a parent adds an API key, and only to that provider. Also included: an e-ink discipline mode (limited palette, no motion, simulated page-turn refresh) to keep the design honest to the eventual hardware.
