// "Wiser friends": bring-your-own-key access to frontier models, called
// directly from the browser. Keys never leave this device — they live in
// localStorage and travel only to the provider the learner's grown-up chose.
// The notebook's safety prompt wraps every call regardless of whose key it is.

export type ChatProviderId = 'anthropic' | 'openai' | 'xai' | 'openrouter';
export type ProviderId = ChatProviderId | 'fal';

export type CloudSettings = {
  version: 1;
  keys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  brain: ChatProviderId | 'auto';
  illustrations: boolean;
};

export const CHAT_PROVIDERS: { id: ChatProviderId; label: string; defaultModel: string; keyHint: string }[] = [
  { id: 'anthropic', label: 'Claude', defaultModel: 'claude-sonnet-5', keyHint: 'console.anthropic.com' },
  { id: 'openai', label: 'GPT', defaultModel: 'gpt-5.1-mini', keyHint: 'platform.openai.com' },
  { id: 'xai', label: 'Grok', defaultModel: 'grok-4-fast', keyHint: 'console.x.ai' },
  { id: 'openrouter', label: 'OpenRouter', defaultModel: 'openrouter/auto', keyHint: 'openrouter.ai' },
];

export const FAL_DEFAULT_MODEL = 'fal-ai/flux/schnell';

export const freshCloudSettings = (): CloudSettings =>
  ({ version: 1, keys: {}, models: {}, brain: 'auto', illustrations: true });

const PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'xai', 'openrouter', 'fal'];

export function coerceCloudSettings(raw: unknown): CloudSettings {
  const settings = freshCloudSettings();
  if (!raw || typeof raw !== 'object') return settings;
  const value = raw as Partial<CloudSettings>;
  for (const id of PROVIDER_IDS) {
    if (typeof value.keys?.[id] === 'string') settings.keys[id] = value.keys[id];
    if (typeof value.models?.[id] === 'string') settings.models[id] = value.models[id];
  }
  if (value.brain === 'auto' || CHAT_PROVIDERS.some(p => p.id === value.brain)) settings.brain = value.brain!;
  if (typeof value.illustrations === 'boolean') settings.illustrations = value.illustrations;
  return settings;
}

export const loadCloudSettings = (): CloudSettings => {
  try { return coerceCloudSettings(JSON.parse(localStorage.getItem('folio-cloud') ?? '')); }
  catch { return freshCloudSettings(); }
};
export const saveCloudSettings = (settings: CloudSettings) =>
  localStorage.setItem('folio-cloud', JSON.stringify(settings));

export const modelFor = (settings: CloudSettings, id: ProviderId): string =>
  settings.models[id]?.trim() ||
  (id === 'fal' ? FAL_DEFAULT_MODEL : CHAT_PROVIDERS.find(p => p.id === id)!.defaultModel);

/** The chat provider to consult: the chosen one if it has a key, else the first with a key. */
export function activeBrain(settings: CloudSettings): ChatProviderId | null {
  if (settings.brain !== 'auto' && settings.keys[settings.brain]?.trim()) return settings.brain;
  return CHAT_PROVIDERS.find(p => settings.keys[p.id]?.trim())?.id ?? null;
}

/** Who can draw pictures: GPT if an OpenAI key exists, otherwise fal.ai. */
export const imageProvider = (settings: CloudSettings): 'openai' | 'fal' | null =>
  settings.keys.openai?.trim() ? 'openai' : settings.keys.fal?.trim() ? 'fal' : null;

// --- request builders (pure, unit-tested) ------------------------------------

const OPENAI_STYLE_URLS: Record<Exclude<ChatProviderId, 'anthropic'>, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

/**
 * Build a chat call, optionally attaching an image (a photo of the notebook
 * page, as a data URL) so the tutor can see the child's actual working.
 */
export function buildChatRequest(provider: ChatProviderId, key: string, model: string, system: string, user: string, image?: string): { url: string; init: RequestInit } {
  if (provider === 'anthropic') {
    const content = image
      ? [
          { type: 'image', source: { type: 'base64', media_type: image.slice(5, image.indexOf(';')), data: image.slice(image.indexOf(',') + 1) } },
          { type: 'text', text: user },
        ]
      : user;
    return {
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 300, system, messages: [{ role: 'user', content }] }),
      },
    };
  }
  const content = image
    ? [{ type: 'image_url', image_url: { url: image } }, { type: 'text', text: user }]
    : user;
  return {
    url: OPENAI_STYLE_URLS[provider],
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
    },
  };
}

export function extractChatText(provider: ChatProviderId, json: unknown): string {
  if (provider === 'anthropic') {
    const content = (json as { content?: { type?: string; text?: string }[] })?.content;
    return content?.find(part => part.type === 'text')?.text?.trim() ?? '';
  }
  const choices = (json as { choices?: { message?: { content?: string } }[] })?.choices;
  return choices?.[0]?.message?.content?.trim() ?? '';
}

export function buildImageRequest(provider: 'openai' | 'fal', key: string, model: string, prompt: string): { url: string; init: RequestInit } {
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/images/generations',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, prompt, size: '1024x1024', quality: 'low', n: 1 }),
      },
    };
  }
  return {
    url: `https://fal.run/${model}`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Key ${key}` },
      body: JSON.stringify({ prompt, image_size: 'square', num_images: 1 }),
    },
  };
}

export function extractImageUrl(provider: 'openai' | 'fal', json: unknown): string | null {
  if (provider === 'openai') {
    const b64 = (json as { data?: { b64_json?: string }[] })?.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  }
  return (json as { images?: { url?: string }[] })?.images?.[0]?.url ?? null;
}

// --- fetch wrappers -----------------------------------------------------------

async function call(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  return response.json();
}

/**
 * Ask the configured wiser friend one question, optionally showing it the
 * page. If a call with an image fails (some models can't see), it quietly
 * retries once as text only. Throws when even that fails.
 */
export async function askCloud(settings: CloudSettings, system: string, user: string, image?: string): Promise<string> {
  const brain = activeBrain(settings);
  if (!brain) throw new Error('No cloud key is configured.');
  const key = settings.keys[brain]!.trim();
  const model = modelFor(settings, brain);
  if (image) {
    try {
      const { url, init } = buildChatRequest(brain, key, model, system, user, image);
      return extractChatText(brain, await call(url, init, 45_000));
    } catch { /* fall through to text-only */ }
  }
  const { url, init } = buildChatRequest(brain, key, model, system, user);
  return extractChatText(brain, await call(url, init, 30_000));
}

/** Draw a small picture for the page. Returns a data/hosted URL, or null when no key. */
export async function generateIllustration(settings: CloudSettings, prompt: string): Promise<string | null> {
  const provider = imageProvider(settings);
  if (!provider || !settings.illustrations) return null;
  const key = settings.keys[provider]!.trim();
  const model = provider === 'openai' ? 'gpt-image-1' : modelFor(settings, 'fal');
  const { url, init } = buildImageRequest(provider, key, model, prompt);
  return extractImageUrl(provider, await call(url, init, 90_000));
}
