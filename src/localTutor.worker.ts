/// <reference lib="webworker" />
import { pipeline } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION, sanitizeChatTemplate } from './tutorPrompt';

type Generator = ((input: unknown, options?: unknown) => Promise<unknown>) & {
  dispose: () => Promise<void>;
  tokenizer?: { chat_template?: string | Record<string, string> | { name: string; template: string }[] | null };
};
let generator: Generator | undefined;

/** Strip Jinja tags our parser can't handle, before the template is first compiled. */
function patchChatTemplate(g: Generator): boolean {
  const tokenizer = g.tokenizer;
  if (!tokenizer?.chat_template) return false;
  const t = tokenizer.chat_template;
  if (typeof t === 'string') {
    const patched = sanitizeChatTemplate(t);
    if (patched === t) return false;
    tokenizer.chat_template = patched;
    return true;
  }
  let changed = false;
  if (Array.isArray(t)) {
    for (const entry of t) {
      const patched = sanitizeChatTemplate(entry.template);
      if (patched !== entry.template) { entry.template = patched; changed = true; }
    }
  } else {
    for (const key of Object.keys(t)) {
      const patched = sanitizeChatTemplate(t[key]);
      if (patched !== t[key]) { t[key] = patched; changed = true; }
    }
  }
  return changed;
}

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
      const patched = patchChatTemplate(generator);
      self.postMessage({ id, type: 'result', text: patched ? 'template-patched' : '' });
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
