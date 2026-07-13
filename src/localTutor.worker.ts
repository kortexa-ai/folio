/// <reference lib="webworker" />
// Mirrors kortexa-ai/lfm-2.5-230m.lab's worker exactly: AutoTokenizer +
// AutoModelForCausalLM + TextStreamer, with the sanitized chat template passed
// per call — the configuration known to run LFM2.5-230M in-browser stably.
import { AutoModelForCausalLM, AutoTokenizer, TextStreamer } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION, sanitizeChatTemplate } from './tutorPrompt';

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
type Model = Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>;

let tokenizer: Tokenizer | undefined;
let model: Model | undefined;
let chatTemplate: string | null = null;
let templatePatched = false;

type Request = {
  id: number;
  type: 'load' | 'generate' | 'dispose';
  system?: string;
  user?: string;
  maxNewTokens?: number;
  temperature?: number;
};

const progressReporter = (id: number) => (p: { status?: string; progress?: number }) => {
  const percent = p.progress == null ? '' : ` ${Math.round(p.progress)}%`;
  self.postMessage({ id, type: 'progress', message: `Preparing local tutor${percent}` });
};

async function handle({ id, type, system, user, maxNewTokens, temperature }: Request) {
  try {
    if (type === 'load') {
      if (!model) {
        tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
          revision: MODEL_REVISION, progress_callback: progressReporter(id),
        });
        const raw = (tokenizer as unknown as { chat_template?: unknown }).chat_template;
        if (typeof raw === 'string') {
          chatTemplate = sanitizeChatTemplate(raw);
          templatePatched = chatTemplate !== raw;
        }
        model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
          device: 'webgpu', dtype: 'q4', revision: MODEL_REVISION, progress_callback: progressReporter(id),
        });
      }
      self.postMessage({ id, type: 'result', text: templatePatched ? 'template-patched' : '' });
    } else if (type === 'generate') {
      if (!tokenizer || !model) throw new Error('Local tutor is not loaded.');
      const messages = [
        { role: 'system', content: system ?? '' },
        { role: 'user', content: user ?? '' },
      ];
      const inputs = tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true,
        return_dict: true,
        ...(chatTemplate ? { chat_template: chatTemplate } : {}),
      }) as Record<string, unknown>;
      let text = '';
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (chunk: string) => { text += chunk; },
      });
      const heat = temperature ?? 0.4;
      await (model as unknown as { generate: (options: object) => Promise<unknown> }).generate({
        ...inputs,
        max_new_tokens: maxNewTokens ?? 48,
        temperature: heat,
        do_sample: heat > 0,
        streamer,
      });
      self.postMessage({ id, type: 'result', text: text.trim() });
    } else {
      await (model as unknown as { dispose?: () => Promise<void> } | undefined)?.dispose?.();
      model = undefined;
      tokenizer = undefined;
      chatTemplate = null;
      self.postMessage({ id, type: 'result' });
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

// One request at a time: the model is not safe under interleaved generation.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (event: MessageEvent<Request>) => {
  queue = queue.then(() => handle(event.data));
};
