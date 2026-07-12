# Folio

Folio is a local-first arithmetic notebook: a first software slice of the handwriting-first learning tablet described in [`eink-tablet-poc-implementation.md`](./eink-tablet-poc-implementation.md).

The current app is entirely client-side and works without AI. It includes single-digit addition, subtraction, and multiplication; adaptive unlocking; a Pencil/touch scratchpad; local progress; export; a PWA shell; and an optional WebGPU tutor powered by `LiquidAI/LFM2.5-350M-ONNX`.

## Run locally

```sh
npm install
npm run dev
```

Run `npm test` and `npm run build` before publishing. GitHub Actions deploys `main` to GitHub Pages.

## Local tutor

The deterministic tutor is always available. Enabling local AI downloads the quantized model from Hugging Face and keeps inference in the browser. The prompt lives in [`src/localTutor.ts`](./src/localTutor.ts). WebGPU and significant free storage/memory are required; unsupported devices fall back cleanly.

## Privacy

No account, analytics, API key, or backend is used. Progress stays in `localStorage` unless the learner explicitly exports it.
