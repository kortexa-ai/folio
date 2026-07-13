// On-device handwritten digit recognition — no keyboard, no model download.
// Implementation of the $P point-cloud recognizer (Vatavu, Anthony & Wobbrock, 2012)
// with synthetic digit templates. Good enough for a PoC; swappable for real HWR later.

export type Point = { x: number; y: number };
export type Stroke = Point[];

const N = 32; // resample size

// --- geometry helpers -------------------------------------------------------

const pathLength = (pts: Point[]) => {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
};

function resample(strokes: Stroke[], n = N): Point[] {
  const pts = strokes.flat();
  if (pts.length === 0) return [];
  const interval = pathLength(pts) / (n - 1) || 1;
  const out: Point[] = [pts[0]];
  let D = 0;
  const src = [...pts];
  for (let i = 1; i < src.length; i++) {
    const d = Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y);
    if (D + d >= interval) {
      const t = (interval - D) / d;
      const q = { x: src[i - 1].x + t * (src[i].x - src[i - 1].x), y: src[i - 1].y + t * (src[i].y - src[i - 1].y) };
      out.push(q);
      src.splice(i, 0, q);
      D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(out[out.length - 1]);
  return out.slice(0, n);
}

function normalize(pts: Point[]): Point[] {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const s = Math.max(w, h) || 1;
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return pts.map(p => ({ x: (p.x - cx) / s, y: (p.y - cy) / s }));
}

function cloudDistance(a: Point[], b: Point[], start: number): number {
  const matched = new Array(a.length).fill(false);
  let sum = 0, i = start;
  do {
    let min = Infinity, index = -1;
    for (let j = 0; j < b.length; j++) {
      if (matched[j]) continue;
      const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
      if (d < min) { min = d; index = j; }
    }
    matched[index] = true;
    sum += (1 - ((i - start + a.length) % a.length) / a.length) * min;
    i = (i + 1) % a.length;
  } while (i !== start);
  return sum;
}

function greedyMatch(a: Point[], b: Point[]): number {
  const step = Math.floor(Math.pow(a.length, 0.5));
  let min = Infinity;
  for (let i = 0; i < a.length; i += step) {
    min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  }
  return min;
}

// --- digit templates ---------------------------------------------------------
// Digits drawn as polylines in a 0..100 box; several variants per digit.

const line = (x1: number, y1: number, x2: number, y2: number, n = 12): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x: x1 + (x2 - x1) * i / (n - 1), y: y1 + (y2 - y1) * i / (n - 1) }));

const arc = (cx: number, cy: number, rx: number, ry: number, a1: number, a2: number, n = 16): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (a1 + (a2 - a1) * i / (n - 1)) * Math.PI / 180;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });

const T: Record<string, Stroke[][]> = {
  '0': [[arc(50, 50, 32, 46, -90, 270)], [arc(50, 50, 30, 44, 270, -90)]],
  '1': [[line(50, 4, 50, 96)], [[...line(30, 22, 52, 4), ...line(52, 4, 52, 96)]]],
  '2': [[[...arc(50, 26, 26, 22, 180, 340), ...line(74, 36, 22, 96), ...line(22, 96, 80, 96)]]],
  '3': [[[...arc(48, 27, 24, 23, 160, 400), ...arc(48, 73, 26, 24, -80, 160)]]],
  '4': [[line(58, 4, 24, 62), line(24, 62, 84, 62), line(64, 30, 64, 96)],
        [[...line(58, 4, 24, 62), ...line(24, 62, 84, 62)], line(64, 30, 64, 96)]],
  '5': [[[...line(74, 6, 32, 6), ...line(32, 6, 28, 46), ...arc(48, 68, 26, 28, -110, 150)]],
        [line(74, 6, 32, 6), [...line(32, 6, 28, 46), ...arc(48, 68, 26, 28, -110, 150)]]],
  '6': [[[...arc(58, 34, 34, 42, -70, -178), ...arc(48, 70, 24, 26, 178, 500)]]],
  '7': [[[...line(22, 8, 80, 8), ...line(80, 8, 42, 96)]],
        [[...line(22, 8, 80, 8), ...line(80, 8, 42, 96)], line(30, 52, 66, 52)]],
  '8': [[[...arc(50, 28, 22, 22, -90, 200), ...arc(50, 74, 26, 25, -160, 250)]]],
  '9': [[[...arc(46, 30, 26, 26, -20, 340), ...line(72, 34, 62, 96)]],
        [[...arc(46, 30, 26, 26, -20, 340), ...arc(74, 52, 40, 44, -60, 60, 10)]]],
};

const templates = Object.entries(T).flatMap(([digit, variants]) =>
  variants.map(strokes => ({ digit, cloud: normalize(resample(strokes)) })));

// Question-mark variants: a hook curling from the left over the top and down,
// with and without the dot underneath.
const QUESTION: Stroke[][] = [
  [[...arc(50, 26, 20, 20, 180, 435), ...line(55, 45, 50, 66)]],
  [[...arc(50, 26, 20, 20, 180, 435), ...line(55, 45, 50, 58)], line(50, 82, 51, 90, 4)],
  [[...arc(48, 24, 22, 19, 190, 430), ...line(54, 42, 48, 72)]],
  [[...arc(50, 28, 18, 22, 175, 440), ...line(56, 50, 52, 70)], line(52, 88, 53, 94, 4)],
];

const questionTemplates = QUESTION.map(strokes => ({ cloud: normalize(resample(strokes)) }));

// --- public API --------------------------------------------------------------

export type DigitGuess = { digit: string; score: number };

/** Recognize a single digit from one group of strokes. Returns ranked guesses. */
export function recognizeDigit(strokes: Stroke[]): DigitGuess[] {
  if (!strokes.length || strokes.flat().length < 2) return [];
  const cloud = normalize(resample(strokes));
  return templates
    .map(t => ({ digit: t.digit, score: greedyMatch(cloud, t.cloud) }))
    .sort((a, b) => a.score - b.score)
    .filter((g, i, all) => all.findIndex(x => x.digit === g.digit) === i);
}

const bounds = (s: Stroke) => {
  const xs = s.map(p => p.x), ys = s.map(p => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

/** Group strokes into digit clusters by horizontal proximity/overlap, left to right. */
export function groupStrokes(strokes: Stroke[]): Stroke[][] {
  if (!strokes.length) return [];
  const boxed = strokes.map(s => ({ s, b: bounds(s) })).sort((a, b) => a.b.minX - b.b.minX);
  const heights = boxed.map(({ b }) => Math.max(b.maxY - b.minY, b.maxX - b.minX, 8));
  const gapLimit = 0.35 * (heights.reduce((a, h) => a + h, 0) / heights.length);
  const groups: { strokes: Stroke[]; maxX: number }[] = [];
  for (const { s, b } of boxed) {
    const last = groups[groups.length - 1];
    if (last && b.minX - last.maxX < gapLimit) {
      last.strokes.push(s);
      last.maxX = Math.max(last.maxX, b.maxX);
    } else groups.push({ strokes: [s], maxX: b.maxX });
  }
  return groups.map(g => g.strokes);
}

export type NumberGuess = { value: number; digits: DigitGuess[][] };

/** Read a whole (multi-digit) number from raw answer strokes. */
export function recognizeNumber(strokes: Stroke[]): NumberGuess | null {
  const groups = groupStrokes(strokes);
  if (!groups.length) return null;
  const digits = groups.map(recognizeDigit);
  if (digits.some(d => d.length === 0)) return null;
  return { value: Number(digits.map(d => d[0].digit).join('')), digits };
}

// --- gestures ----------------------------------------------------------------
// The notebook has no buttons: circling ink hands an answer in, and a drawn
// question mark asks for a hint.

const strokeCentroid = (s: Stroke): Point => ({
  x: s.reduce((a, p) => a + p.x, 0) / s.length,
  y: s.reduce((a, p) => a + p.y, 0) / s.length,
});

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Does `candidate` look like a ring drawn around other ink? Returns the
 * enclosed strokes (the handed-in answer) or null. Requiring enclosure keeps
 * a handwritten 0 from reading as a gesture.
 */
export function detectAnswerCircle(candidate: Stroke, others: Stroke[]): Stroke[] | null {
  if (candidate.length < 8) return null;
  const b = bounds(candidate);
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  if (Math.min(w, h) < 26) return null;
  const gap = Math.hypot(candidate[0].x - candidate[candidate.length - 1].x, candidate[0].y - candidate[candidate.length - 1].y);
  if (gap > 0.45 * Math.max(w, h)) return null;
  const enclosed = others.filter(s => s.length > 1 && pointInPolygon(strokeCentroid(s), candidate));
  return enclosed.length ? enclosed : null;
}

/** Does this group of strokes read as a drawn question mark (hint, please)? */
export function isQuestionMark(strokes: Stroke[]): boolean {
  if (!strokes.length || strokes.flat().length < 6) return false;
  const cloud = normalize(resample(strokes));
  const question = Math.min(...questionTemplates.map(t => greedyMatch(cloud, t.cloud)));
  const digit = Math.min(...templates.map(t => greedyMatch(cloud, t.cloud)));
  return question < digit * 0.9 && question < 3.2;
}

/**
 * A vigorous scribble over existing ink erases it. Requires real back-and-forth
 * (many direction reversals + a path much longer than its box), so a single
 * cross-out stroke or an 8 stays on the page. Returns the strokes to erase.
 */
export function detectScratchOut(candidate: Stroke, others: Stroke[]): Stroke[] | null {
  if (candidate.length < 10) return null;
  const b = bounds(candidate);
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const diag = Math.hypot(w, h);
  if (diag < 24) return null;
  if (pathLength(candidate) / diag < 2.9) return null;
  const reversals = (axis: 'x' | 'y') => {
    let flips = 0, direction = 0;
    for (let i = 1; i < candidate.length; i++) {
      const d = candidate[i][axis] - candidate[i - 1][axis];
      if (Math.abs(d) < 2) continue;
      const s = Math.sign(d);
      if (direction !== 0 && s !== direction) flips++;
      direction = s;
    }
    return flips;
  };
  if (Math.max(reversals('x'), reversals('y')) < 5) return null;
  const victims = others.filter(s => {
    const v = bounds(s);
    const ix = Math.max(0, Math.min(b.maxX, v.maxX) - Math.max(b.minX, v.minX));
    const iy = Math.max(0, Math.min(b.maxY, v.maxY) - Math.max(b.minY, v.minY));
    const area = Math.max((v.maxX - v.minX) * (v.maxY - v.minY), 1);
    return (ix * iy) / area >= 0.5;
  });
  return victims.length ? victims : null;
}

// Score bands measured against template + wobbled synthetic ink: real digits
// land ≤ ~1.0, doodles/squiggles ≥ ~1.7. Between the bands we answer without
// recording an attempt, so group-drawings never poison the mastery model.
export const CONFIDENT_SCORE = 0.8;
export const LEGIBLE_SCORE = 1.4;

export const worstScore = (guess: NumberGuess): number =>
  Math.max(...guess.digits.map(d => d[0].score));

/** Trustworthy enough to record an attempt against mastery. */
export const isConfident = (guess: NumberGuess): boolean => worstScore(guess) < CONFIDENT_SCORE;

/** Readable enough to say something about at all (may still be a misread). */
export const isLegible = (guess: NumberGuess): boolean =>
  worstScore(guess) < LEGIBLE_SCORE && guess.digits.length <= 2;

/** Alternative readings of the number, for "did you mean" correction chips. */
export function alternatives(guess: NumberGuess, count = 3): number[] {
  const alts = new Set<number>();
  for (let pos = 0; pos < guess.digits.length; pos++) {
    for (const alt of guess.digits[pos].slice(1, 3)) {
      const digits = guess.digits.map((d, i) => (i === pos ? alt.digit : d[0].digit));
      alts.add(Number(digits.join('')));
    }
  }
  alts.delete(guess.value);
  return [...alts].slice(0, count);
}
