/// <reference lib="webworker" />
import { pipeline } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION } from './tutorPrompt';

type Generator = ((input: unknown, options?: unknown) => Promise<unknown>) & { dispose: () => Promise<void> };
let generator: Generator | undefined;

type Request = {
  id: number;
  type: 'load' | 'generate' | 'dispose';
  system?: string;
  user?: string;
  maxNewTokens?: number;
  temperature?: number;
};

async function handle({ id, type, system, user, maxNewTokens, temperature }: Request) {
  try {
    if (type === 'load') {
      generator ??= await pipeline('text-generation', MODEL_ID, {
        device: 'webgpu', dtype: 'q4', revision: MODEL_REVISION,
        progress_callback: (p: { status?: string; progress?: number }) => {
          const percent = p.progress == null ? '' : ` ${Math.round(p.progress)}%`;
          self.postMessage({ id, type: 'progress', message: `Preparing local tutor${percent}` });
        }
      }) as unknown as Generator;
      self.postMessage({ id, type: 'result' });
    } else if (type === 'generate') {
      if (!generator) throw new Error('Local tutor is not loaded.');
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      const output = await generator(messages, { max_new_tokens: maxNewTokens ?? 48, temperature: temperature ?? 0.4, do_sample: true });
      const generated = (output as Array<{ generated_text: string | Array<{ role: string; content: string }> }>)?.[0]?.generated_text;
      const text = Array.isArray(generated) ? generated.at(-1)?.content?.trim() : String(generated ?? '').trim();
      self.postMessage({ id, type: 'result', text });
    } else {
      await generator?.dispose(); generator = undefined;
      self.postMessage({ id, type: 'result' });
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

// One request at a time: the pipeline is not safe under interleaved generation.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (event: MessageEvent<Request>) => {
  queue = queue.then(() => handle(event.data));
};
