import { describe, expect, it } from 'vitest';
import { acceptQuip, acceptRewrite, requiredNumbers } from './voice';

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
    expect(acceptQuip('What a wonderful, marvelous, extraordinary, magnificent piece of arithmetic!')).toBeNull();
  });
});
