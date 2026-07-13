import { describe, expect, it } from 'vitest';
import { detectAnswerCircle, detectScratchOut, groupStrokes, isConfident, isEmptyRing, isLegible, isQuestionMark, recognizeDigit, recognizeNumber, type Stroke } from './recognizer';

const wobble = (s: Stroke, amp: number, seed = 7): Stroke => {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 2;
  return s.map(p => ({ x: p.x + rnd() * amp, y: p.y + rnd() * amp }));
};

const line = (x1: number, y1: number, x2: number, y2: number, n = 14): Stroke =>
  Array.from({ length: n }, (_, i) => ({ x: x1 + (x2 - x1) * i / (n - 1), y: y1 + (y2 - y1) * i / (n - 1) }));
const arc = (cx: number, cy: number, rx: number, ry: number, a1: number, a2: number, n = 20): Stroke =>
  Array.from({ length: n }, (_, i) => {
    const a = (a1 + (a2 - a1) * i / (n - 1)) * Math.PI / 180;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });

describe('digit recognition', () => {
  it('recognizes a drawn 1', () => {
    expect(recognizeDigit([line(48, 10, 52, 90)])[0].digit).toBe('1');
  });
  it('recognizes a drawn 0', () => {
    expect(recognizeDigit([arc(50, 50, 28, 42, -90, 268)])[0].digit).toBe('0');
  });
  it('recognizes a drawn 7', () => {
    expect(recognizeDigit([[...line(25, 12, 78, 10), ...line(78, 10, 45, 92)]])[0].digit).toBe('7');
  });
  it('recognizes a two-stroke 4', () => {
    expect(recognizeDigit([line(56, 8, 26, 60), line(26, 60, 82, 60), line(64, 28, 66, 94)])[0].digit).toBe('4');
  });
});

describe('multi-digit numbers', () => {
  it('groups well-separated strokes into digit clusters', () => {
    const one = line(20, 10, 22, 90);
    const zero = arc(120, 50, 28, 42, -90, 268);
    expect(groupStrokes([zero, one]).length).toBe(2);
  });
  it('reads a handwritten 10', () => {
    const one = line(20, 10, 22, 90);
    const zero = arc(120, 50, 28, 42, -90, 268);
    expect(recognizeNumber([one, zero])?.value).toBe(10);
  });
  it('returns null for empty ink', () => {
    expect(recognizeNumber([])).toBeNull();
  });
});

describe('answer-circle gesture', () => {
  const seven: Stroke = [...line(140, 130, 175, 129), ...line(175, 129, 152, 185)];
  it('finds the strokes enclosed by a drawn ring', () => {
    const ring = arc(157, 157, 45, 48, -90, 262, 28);
    expect(detectAnswerCircle(ring, [seven])).toEqual([seven]);
  });
  it('ignores a ring around empty paper', () => {
    const ring = arc(400, 300, 40, 44, -90, 262, 28);
    expect(detectAnswerCircle(ring, [seven])).toBeNull();
  });
  it('does not treat a handwritten zero as a gesture', () => {
    const zero = arc(300, 150, 20, 32, -90, 265, 24);
    expect(detectAnswerCircle(zero, [seven])).toBeNull();
  });
  it('rejects an open, unclosed curve', () => {
    const openCurve = arc(157, 157, 45, 48, -90, 120, 20);
    expect(detectAnswerCircle(openCurve, [seven])).toBeNull();
  });
});

describe('question-mark gesture', () => {
  const hook: Stroke = [...arc(150, 126, 20, 20, 180, 435, 18), ...line(155, 145, 150, 166)];
  it('recognizes a hook-shaped question mark', () => {
    expect(isQuestionMark([hook])).toBe(true);
  });
  it('recognizes a question mark with its dot', () => {
    expect(isQuestionMark([hook, line(150, 182, 151, 188, 4)])).toBe(true);
  });
  it('does not mistake a 2 for a question mark', () => {
    const two: Stroke = [...arc(150, 126, 26, 22, 180, 340), ...line(174, 136, 122, 196), ...line(122, 196, 180, 196)];
    expect(isQuestionMark([two])).toBe(false);
  });
  it('does not mistake a 7 for a question mark', () => {
    const seven: Stroke = [...line(122, 108, 180, 108), ...line(180, 108, 142, 196)];
    expect(isQuestionMark([seven])).toBe(false);
  });
  it('does not mistake a 0 for a question mark', () => {
    expect(isQuestionMark([arc(150, 150, 28, 42, -90, 268, 24)])).toBe(false);
  });
});

describe('scratch-out gesture', () => {
  const scribble = (): Stroke => {
    const s: Stroke = [];
    for (let i = 0; i < 7; i++) {
      const y = 115 + i * 11;
      s.push(...(i % 2 === 0 ? line(128, y, 232, y + 6, 7) : line(232, y, 128, y + 6, 7)));
    }
    return s;
  };
  const victim: Stroke = [...line(160, 118, 200, 116), ...line(200, 116, 172, 188)];
  const far: Stroke = line(400, 400, 402, 470);
  it('a vigorous scribble erases the ink beneath it and nothing else', () => {
    expect(detectScratchOut(scribble(), [victim, far])).toEqual([victim]);
  });
  it('scribbling on empty paper keeps the ink (it might be art)', () => {
    expect(detectScratchOut(scribble(), [far])).toBeNull();
  });
  it('an 8, a ring, and a single strike-through are not scratches', () => {
    const digit8: Stroke = [...arc(150, 128, 22, 22, -90, 200), ...arc(150, 174, 26, 25, -160, 250)];
    expect(detectScratchOut(digit8, [victim])).toBeNull();
    expect(detectScratchOut(arc(180, 150, 50, 44, -90, 260, 24), [victim])).toBeNull();
    expect(detectScratchOut(line(150, 150, 210, 152, 12), [victim])).toBeNull();
  });
});

describe('kid digit shapes from the field (2026-07-13 screenshots)', () => {
  it('reads an open 4 with a vertical arm, confidently', () => {
    // traced from the pilot iPhone: vertical down, along, then a crossing descender
    const arm: Stroke = [...line(355, 745, 350, 830, 10), ...line(350, 830, 470, 835, 12)];
    const cross: Stroke = line(455, 760, 462, 900, 12);
    const guess = recognizeNumber([arm, cross])!;
    expect(guess.value).toBe(4);
    expect(isConfident(guess)).toBe(true);
  });
  it('reads a wobbly open 4 as at least legible with 4 among the top guesses', () => {
    const arm = wobble([...line(355, 745, 350, 830, 10), ...line(350, 830, 470, 835, 12)], 6);
    const cross = wobble(line(455, 760, 462, 900, 12), 6);
    const guess = recognizeNumber([arm, cross])!;
    const candidates = [guess.value, ...guess.digits[0].slice(0, 3).map(d => Number(d.digit))];
    expect(candidates).toContain(4);
  });
  it('reads a 5 with the bar drawn from the stem — legible, so a correct 5 is accepted', () => {
    const bar: Stroke = line(430, 850, 530, 845, 10);
    const rest: Stroke = [...line(435, 855, 425, 940, 8), ...arc(465, 985, 60, 55, -100, 150, 16)];
    const guess = recognizeNumber([bar, rest])!;
    expect(guess.value).toBe(5);
    expect(isLegible(guess)).toBe(true);
  });
});

describe('empty answer rings (circle first, write after)', () => {
  it('a big closed loop is an empty ring; a digit-sized zero is not', () => {
    expect(isEmptyRing(arc(300, 300, 90, 100, -90, 262, 30))).toBe(true);
    expect(isEmptyRing(arc(300, 300, 28, 42, -90, 265, 24))).toBe(false);
  });
  it('an open curve and a dense scribble are not rings', () => {
    expect(isEmptyRing(arc(300, 300, 90, 100, -90, 120, 20))).toBe(false);
    const scribble: Stroke = [];
    for (let i = 0; i < 8; i++) {
      const y = 260 + i * 12;
      scribble.push(...(i % 2 === 0 ? line(220, y, 380, y + 5, 7) : line(380, y, 220, y + 5, 7)));
    }
    expect(isEmptyRing(scribble)).toBe(false);
  });
});

describe('legibility bands', () => {
  it('slightly wobbly digits are confident; very shaky ones stay legible', () => {
    const seven = (amp: number) => wobble([...line(122, 108, 180, 108), ...line(180, 108, 142, 196)], amp);
    const neat = recognizeNumber([seven(3)])!;
    expect(neat.value).toBe(7);
    expect(isConfident(neat)).toBe(true);
    const shaky = recognizeNumber([seven(5)])!;
    expect(shaky.value).toBe(7);
    expect(isLegible(shaky)).toBe(true);
  });
  it('a squiggle is not even legible', () => {
    const squiggle = wobble(arc(200, 150, 40, 20, 0, 500, 30), 14, 3);
    const guess = recognizeNumber([squiggle])!;
    expect(isLegible(guess)).toBe(false);
  });
  it('three tally sticks read as a 3-digit number and are dismissed as illegible', () => {
    const guess = recognizeNumber([line(150, 140, 152, 180, 8), line(170, 141, 171, 181, 8), line(190, 139, 192, 180, 8)])!;
    expect(guess.value).toBe(111);
    expect(isLegible(guess)).toBe(false);
  });
  it('a cluster of dots is legible but not confident (answered, never recorded)', () => {
    const dots = [arc(150, 150, 5, 5, 0, 330, 6), arc(190, 152, 5, 5, 0, 330, 6), arc(230, 149, 5, 5, 0, 330, 6)];
    const guess = recognizeNumber(dots)!;
    expect(isConfident(guess)).toBe(false);
  });
});
