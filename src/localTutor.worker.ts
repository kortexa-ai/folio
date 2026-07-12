/// <reference lib="webworker" />
import { pipeline } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION, SYSTEM_PROMPT } from './tutorPrompt';

type Generator = ((input: unknown, options?: unknown) => Promise<unknown>) & { dispose: () => Promise<void> };
let generator: Generator | undefined;

self.onmessage = async (event: MessageEvent<{ id: number; type: 'load' | 'hint' | 'dispose'; problem?: string; attempt?: string }>) => {
  const { id, type } = event.data;
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
    } else if (type === 'hint') {
      if (!generator) throw new Error('Local tutor is not loaded.');
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Problem: ${event.data.problem}. Learner's attempt: ${event.data.attempt || 'no answer yet'}. Give one hint.` }
      ];
      const output = await generator(messages, { max_new_tokens: 42, temperature: 0.3, do_sample: true });
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
};
