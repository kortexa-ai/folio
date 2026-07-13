import { describe, expect, it } from 'vitest';
import { acceptContribution, acceptPassage, acceptQuip, acceptRewrite, fallbackOpening, fallbackTopics, acceptTopics, requiredNumbers } from './voice';

const ORIGINAL = 'Maya has 6 toy cars. A friend brings 3 more. How many toy cars altogether?';

describe('story retelling validator', () => {
  it('accepts a faithful retelling and strips wrapping quotes', () => {
    const out = acceptRewrite(ORIGINAL, 9, '"A brave dinosaur guards 6 shiny stones. A rocket drops off 3 more. How many stones altogether?"');
    expect(out).toBe('A brave dinosaur guards 6 shiny stones. A rocket drops off 3 more. How many stones altogether?');
  });
  it('rejects a retelling that changes a number', () => {
    expect(acceptRewrite(ORIGINAL, 9, 'A dinosaur has 7 stones. A rocket brings 3 more. How many stones?')).toBeNull();
  });
  it('rejects a retelling that drops a number', () => {
    expect(acceptRewrite(ORIGINAL, 9, 'A dinosaur has 6 stones and gets some more. How many stones?')).toBeNull();
  });
  it('rejects a retelling that leaks the answer', () => {
    expect(acceptRewrite(ORIGINAL, 9, 'A dinosaur has 6 stones, gets 3 more, makes 9. How many stones?')).toBeNull();
  });
  it('rejects missing question, markdown, and rambling', () => {
    expect(acceptRewrite(ORIGINAL, 9, 'A dinosaur has 6 stones and a rocket brings 3 more.')).toBeNull();
    expect(acceptRewrite(ORIGINAL, 9, '**A dinosaur** has 6 stones. 3 more come. How many?')).toBeNull();
    expect(acceptRewrite(ORIGINAL, 9, `${'A very long story. '.repeat(15)}6 and 3. How many?`)).toBeNull();
  });
  it('extracts required numbers in order', () => {
    expect(requiredNumbers(ORIGINAL)).toEqual(['6', '3']);
  });
});

describe('quip validator', () => {
  it('accepts a short clean cheer', () => {
    expect(acceptQuip('  "Splendid counting, little mathematician" ')).toBe('Splendid counting, little mathematician');
  });
  it('rejects numbers, markdown, and rambling', () => {
    expect(acceptQuip('You got 9 exactly right!')).toBeNull();
    expect(acceptQuip('**Wonderful!**')).toBeNull();
    expect(acceptQuip('What a wonderful, marvelous, extraordinary, magnificent, breathtaking piece of arithmetic!')).toBeNull();
  });
});

describe('story-beat validator (create mode)', () => {
  it('accepts a short beat and strips quotes', () => {
    expect(acceptContribution('"The dragon sneezed, and out came a tiny umbrella."'))
      .toBe('The dragon sneezed, and out came a tiny umbrella.');
  });
  it('rejects endings, links, markdown, and rambling', () => {
    expect(acceptContribution('And they lived happily. The end.')).toBeNull();
    expect(acceptContribution('See https://example.com for more')).toBeNull();
    expect(acceptContribution('**bold move**')).toBeNull();
    expect(acceptContribution('word '.repeat(60))).toBeNull();
  });
});

describe('wonder validators (explore mode)', () => {
  it('parses three clean topics from a model line', () => {
    expect(acceptTopics('volcanoes, the deep sea, why the moon changes')).toEqual(['volcanoes', 'the deep sea', 'why the moon changes']);
    expect(acceptTopics('1. volcanoes\n2. the deep sea\n3. old castles')).toEqual(['volcanoes', 'the deep sea', 'old castles']);
  });
  it('rejects too few, too long, or numbered-into-topics output', () => {
    expect(acceptTopics('volcanoes')).toBeNull();
    expect(acceptTopics(`${'very '.repeat(12)}long topic, b, c`)?.length ?? null).toBeNull();
  });
  it('accepts a passage and rejects links or essays', () => {
    expect(acceptPassage('An octopus has three hearts, and two of them stop when it swims. What would it feel like to rest a heart?'))
      .toContain('three hearts');
    expect(acceptPassage('Read more at www.example.com')).toBeNull();
    expect(acceptPassage('word '.repeat(120))).toBeNull();
  });
});

describe('chat template sanitizer', () => {
  it('strips generation tags the jinja parser cannot handle, leaving the rest intact', async () => {
    const { sanitizeChatTemplate } = await import('./tutorPrompt');
    const template = '{% for m in messages %}{% if m.role == "assistant" %}{% generation %}{{ m.content }}{% endgeneration %}{% else %}{{ m.content }}{% endif %}{% endfor %}';
    const patched = sanitizeChatTemplate(template);
    expect(patched).not.toContain('generation');
    expect(patched).toContain('{% for m in messages %}');
    expect(patched).toContain('{{ m.content }}');
    expect(sanitizeChatTemplate('{%- generation -%}x{%- endgeneration -%}')).toBe('x');
    expect(sanitizeChatTemplate('no tags here')).toBe('no tags here');
  });
});

describe('deterministic fallbacks', () => {
  it('openings weave in the name or an interest', () => {
    expect(fallbackOpening('dragons', 'Maya', () => 0.2)).toContain('Maya');
    expect(fallbackOpening('dragons', undefined, () => 0.7)).toContain('dragon');
  });
  it('fallback topics start from interests and always number three', () => {
    const topics = fallbackTopics('rockets, castles', () => 0);
    expect(topics).toHaveLength(3);
    expect(topics).toContain('rockets');
  });
});
