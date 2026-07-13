import { describe, expect, it } from 'vitest';
import { detectAnswerCircle, groupStrokes, isQuestionMark, recognizeDigit, recognizeNumber, type Stroke } from './recognizer';

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
