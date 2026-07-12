import { describe, expect, it } from 'vitest';
import { groupStrokes, recognizeDigit, recognizeNumber, type Stroke } from './recognizer';

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
