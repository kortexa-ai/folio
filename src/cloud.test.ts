import { describe, expect, it } from 'vitest';
import {
  activeBrain, buildChatRequest, buildImageRequest, coerceCloudSettings, extractChatText,
  extractImageUrl, freshCloudSettings, imageProvider, modelFor,
} from './cloud';

describe('cloud settings', () => {
  it('coerces valid stored settings and drops junk', () => {
    const settings = coerceCloudSettings({
      keys: { anthropic: 'sk-ant-x', bogus: 'nope', openai: 42 },
      models: { anthropic: 'claude-opus-4-8' },
      brain: 'anthropic', illustrations: false, extra: true,
    });
    expect(settings.keys).toEqual({ anthropic: 'sk-ant-x' });
    expect(settings.models.anthropic).toBe('claude-opus-4-8');
    expect(settings.brain).toBe('anthropic');
    expect(settings.illustrations).toBe(false);
  });
  it('falls back to fresh settings on garbage', () => {
    expect(coerceCloudSettings('nope')).toEqual(freshCloudSettings());
    expect(coerceCloudSettings({ brain: 'skynet' }).brain).toBe('auto');
  });
  it('picks the chosen brain when keyed, else the first keyed provider', () => {
    expect(activeBrain(freshCloudSettings())).toBeNull();
    expect(activeBrain({ ...freshCloudSettings(), keys: { xai: 'k' } })).toBe('xai');
    expect(activeBrain({ ...freshCloudSettings(), keys: { xai: 'k', openai: 'k2' }, brain: 'xai' })).toBe('xai');
    expect(activeBrain({ ...freshCloudSettings(), keys: { openai: 'k' }, brain: 'anthropic' })).toBe('openai');
    expect(activeBrain({ ...freshCloudSettings(), keys: { anthropic: '   ' } })).toBeNull();
  });
  it('prefers gpt-image over fal for pictures, as documented', () => {
    expect(imageProvider(freshCloudSettings())).toBeNull();
    expect(imageProvider({ ...freshCloudSettings(), keys: { fal: 'k' } })).toBe('fal');
    expect(imageProvider({ ...freshCloudSettings(), keys: { fal: 'k', openai: 'k' } })).toBe('openai');
  });
  it('uses the default model unless one is written in', () => {
    expect(modelFor(freshCloudSettings(), 'anthropic')).toBe('claude-sonnet-5');
    expect(modelFor({ ...freshCloudSettings(), models: { anthropic: ' claude-opus-4-8 ' } }, 'anthropic')).toBe('claude-opus-4-8');
    expect(modelFor(freshCloudSettings(), 'fal')).toBe('fal-ai/flux/schnell');
  });
});

describe('chat requests', () => {
  it('builds an Anthropic messages call with browser access headers', () => {
    const { url, init } = buildChatRequest('anthropic', 'sk-ant-x', 'claude-sonnet-5', 'be kind', 'help');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-x');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers.authorization).toBeUndefined();
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe('be kind');
    expect(body.messages).toEqual([{ role: 'user', content: 'help' }]);
  });
  it.each([
    ['openai', 'https://api.openai.com/v1/chat/completions'],
    ['xai', 'https://api.x.ai/v1/chat/completions'],
    ['openrouter', 'https://openrouter.ai/api/v1/chat/completions'],
  ] as const)('builds an OpenAI-style call for %s', (provider, expected) => {
    const { url, init } = buildChatRequest(provider, 'key-1', 'some-model', 'be kind', 'help');
    expect(url).toBe(expected);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key-1');
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'be kind' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'help' });
  });
  it('extracts reply text from both response shapes', () => {
    expect(extractChatText('anthropic', { content: [{ type: 'thinking' }, { type: 'text', text: ' count the dots ' }] })).toBe('count the dots');
    expect(extractChatText('openai', { choices: [{ message: { content: 'draw a ten-frame' } }] })).toBe('draw a ten-frame');
    expect(extractChatText('xai', {})).toBe('');
  });
});

describe('showing the tutor the page', () => {
  const INK = 'data:image/jpeg;base64,AAAABBBB';
  it('attaches the page photo as an Anthropic image block before the text', () => {
    const { init } = buildChatRequest('anthropic', 'k', 'claude-sonnet-5', 'sys', 'look at this', INK);
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAABBBB' } },
      { type: 'text', text: 'look at this' },
    ]);
  });
  it('attaches the page photo as an image_url part for OpenAI-style providers', () => {
    const { init } = buildChatRequest('xai', 'k', 'grok-4-fast', 'sys', 'look at this', INK);
    const body = JSON.parse(init.body as string);
    expect(body.messages[1].content).toEqual([
      { type: 'image_url', image_url: { url: INK } },
      { type: 'text', text: 'look at this' },
    ]);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });
  it('keeps plain string content when no image is attached', () => {
    const { init } = buildChatRequest('anthropic', 'k', 'claude-sonnet-5', 'sys', 'hello');
    expect(JSON.parse(init.body as string).messages[0].content).toBe('hello');
  });
});

describe('image requests', () => {
  it('builds a gpt-image call and reads back a data URL', () => {
    const { url, init } = buildImageRequest('openai', 'key-1', 'gpt-image-1', 'three apples');
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(JSON.parse(init.body as string).model).toBe('gpt-image-1');
    expect(extractImageUrl('openai', { data: [{ b64_json: 'AAAA' }] })).toBe('data:image/png;base64,AAAA');
    expect(extractImageUrl('openai', {})).toBeNull();
  });
  it('builds a fal.run call and reads back the hosted URL', () => {
    const { url, init } = buildImageRequest('fal', 'key-1', 'fal-ai/flux/schnell', 'three apples');
    expect(url).toBe('https://fal.run/fal-ai/flux/schnell');
    expect((init.headers as Record<string, string>).authorization).toBe('Key key-1');
    expect(extractImageUrl('fal', { images: [{ url: 'https://fal.media/x.png' }] })).toBe('https://fal.media/x.png');
    expect(extractImageUrl('fal', { images: [] })).toBeNull();
  });
});
