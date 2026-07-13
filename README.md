# Folio

Folio is **a notebook that writes back** — the software slice of the learning-tablet concept in [`eink-tablet-poc-implementation.md`](./eink-tablet-poc-implementation.md), redesigned around the north star: a kid's homework notebook that magically presents the right thing to learn next, not a website that tests you.

The whole screen is one ruled page. There are no buttons, no answer boxes, no forms — the notebook writes a problem in its own hand, and the learner writes anywhere with a pencil (iPad) or a finger (iPhone — it's just a smaller notebook). Two gestures do everything:

- **Circle your answer** to hand it in. An on-device [$P point-cloud recognizer](https://depts.washington.edu/acelab/proj/dollar/pdollar.html) reads the digits inside the ring (with tappable "or was it…" corrections when unsure, and a legibility floor so circled drawings never count against the learner).
- **Draw a `?`** and the notebook absorbs it and whispers a hint.
- **Scribble hard** over anything to erase it (a single cross-out stays — crossed-out work is part of thinking).

Get it right and the page turns itself; master a chapter and the notebook draws a star. If a page sits untouched, the notebook whispers a gentle way to start. The only chrome is a ribbon bookmark (settings), the chapter name in small script with mastery dots (tap for the learning map), a folded corner (fresh page), and a page number.

## The notebook remembers

Lessons are driven by a slice of the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy): 13 early-math micro-topics wired by real prerequisite edges (see [`ATTRIBUTION.md`](./ATTRIBUTION.md)). On top of that graph each topic carries a **decaying memory strength** — mastered chapters quietly return "for a polish" as they fade (spaced review), repeated misses flag a chapter as tricky and trigger **warm-ups on its weakest prerequisite**, and every problem is generated fresh inside the reviewed structure, never pulled from a bank.

Progress is tracked as sessions (solved/missed/hints, days written) and per-topic time-on-task. The kid-facing view stays whimsical — stars, dots, "we are here" — while a **For grown-ups** section in settings shows the numbers: accuracy, minutes, hints, and tricky flags per chapter. Everything exports/imports as versioned JSON (v1/v2 exports migrate automatically).

## The two brains (plus wiser friends)

- **Deterministic whispers** — two hint stages per problem, always available, offline.
- **The notebook's own little brain** — an optional on-device model (`LiquidAI/LFM2.5-230M-ONNX` over WebGPU, in a Web Worker) that is woven into the experience, not bolted on: it **retells story problems around the learner's favorite things** ("stories about… dinosaurs, rockets"), cheers in its own words, and whispers hints. It never decides math — the deterministic generator computes every number and answer, the model only rewords, and each generation must pass a strict validator (exact numbers preserved, no new numbers, answer never leaked) or the deterministic text is used. All of it is prefetched during the learner's thinking time, so it adds zero latency; once enabled, the brain wakes with the notebook. Nothing written ever leaves the device.
- **Wiser friends (BYOK)** — optional bring-your-own-key escalation to Claude, GPT, Grok, or OpenRouter when the learner is truly stuck (second hint or repeated misses). **The tutor sees the page**: escalations attach a small photo of the actual ink, so feedback can ground in the child's real working — their dot groups, crossings-out, drawings — not just a transcribed answer (models that can't see images quietly fall back to text). Keys live in `localStorage`, go directly from the browser to the chosen provider, and every call is wrapped in Folio's pedagogy/safety prompt ([`src/tutorPrompt.ts`](./src/tutorPrompt.ts)) — hints only, never answers.
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
