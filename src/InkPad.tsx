import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { lastVisibleIndex, scaleInkPoints, type InkDimensions } from './inkGeometry';
import { detectAnswerCircle, detectScratchOut, isEmptyRing, isQuestionMark, pointInPolygon, strokeCentroid, type Stroke } from './recognizer';

type InkStroke = {
  points: { x: number; y: number; pressure: number }[];
  kind: 'ink' | 'ring';
  fadeStart?: number; // set when the notebook "absorbs" a gesture
};

export type InkPadProps = {
  clearSignal: number;
  eink: boolean;
  /** A ring was drawn around some ink — the enclosed strokes are the handed-in answer. */
  onCircleAnswer: (enclosed: Stroke[]) => void;
  /** A question mark was drawn — the learner is asking for a hint. */
  onQuestionMark: () => void;
  /** The pen touched the page (used for idle detection). */
  onActivity?: () => void;
};

export type InkPadHandle = {
  /** A small photo of the page's ink (JPEG data URL), for the tutor to look at. Null when blank. */
  snapshot: () => string | null;
  /** Remove the newest visible stroke. */
  undo: () => boolean;
  /** Hand every visible stroke to the answer reader. */
  submit: () => boolean;
};

const FADE_MS = 650;
const SNAPSHOT_MAX = 896;

export const InkPad = forwardRef<InkPadHandle, InkPadProps>(function InkPad(
  { clearSignal, eink, onCircleAnswer, onQuestionMark, onActivity }: InkPadProps, handle) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<InkStroke[]>([]);
  const active = useRef<InkStroke | null>(null);
  const predicted = useRef<{ x: number; y: number; pressure: number }[]>([]);
  const penActive = useRef(false);
  const lastEnd = useRef<{ stroke: InkStroke; at: number } | null>(null);
  const pageSize = useRef<InkDimensions>({ width: 0, height: 0 });
  const fadeTimer = useRef(0);
  const drawFrame = useRef(0);
  const ringRecheck = useRef(0);

  const draw = () => {
    drawFrame.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const ink = eink ? '#1a1a1a' : '#31519a';
    const now = performance.now();
    const render = (points: InkStroke['points'], color: string, alpha = 1) => {
      if (points.length < 2) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineWidth = 1.8 + points[i].pressure * 2.6;
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (const s of strokes.current) {
      const alpha = s.fadeStart == null || eink ? 1 : Math.max(0, 1 - (now - s.fadeStart) / FADE_MS);
      render(s.points, ink, alpha);
    }
    if (active.current && predicted.current.length) {
      render([...active.current.points.slice(-2), ...predicted.current], ink);
    }
  };

  // Pointer events can arrive much faster than the display refresh rate. Draw
  // once per frame instead of repainting the whole page for every event.
  const scheduleDraw = () => {
    if (!drawFrame.current) drawFrame.current = requestAnimationFrame(draw);
  };

  const undo = () => {
    const index = lastVisibleIndex(strokes.current);
    if (index < 0) return false;
    const [removed] = strokes.current.splice(index, 1);
    if (lastEnd.current?.stroke === removed) lastEnd.current = null;
    scheduleDraw();
    return true;
  };

  const submit = () => {
    const live = strokes.current.filter(stroke => stroke.fadeStart == null && stroke.points.length > 1);
    if (!live.length) return false;
    onCircleAnswer(live.map(stroke => stroke.points));
    return true;
  };

  /** Fade absorbed gesture strokes out, then drop them. In e-ink mode they vanish in one refresh. */
  const absorb = (targets: InkStroke[]) => {
    const start = performance.now();
    for (const s of targets) s.fadeStart = start;
    if (eink) {
      strokes.current = strokes.current.filter(s => s.fadeStart == null);
      return scheduleDraw();
    }
    cancelAnimationFrame(fadeTimer.current);
    const tick = () => {
      draw();
      if (strokes.current.some(s => s.fadeStart != null && performance.now() - s.fadeStart < FADE_MS)) {
        fadeTimer.current = requestAnimationFrame(tick);
      } else {
        strokes.current = strokes.current.filter(s => s.fadeStart == null);
        scheduleDraw();
      }
    };
    fadeTimer.current = requestAnimationFrame(tick);
  };

  const resize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const next = { width: box.width, height: box.height };
    const previous = pageSize.current;
    if (previous.width && previous.height) {
      for (const stroke of strokes.current) stroke.points = scaleInkPoints(stroke.points, previous, next);
      if (active.current) active.current.points = scaleInkPoints(active.current.points, previous, next);
      predicted.current = scaleInkPoints(predicted.current, previous, next);
    }
    pageSize.current = next;
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = box.width * ratio;
    canvas.height = box.height * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    scheduleDraw();
  };

  useEffect(() => {
    resize();
    const observer = new ResizeObserver(resize);
    if (canvasRef.current) observer.observe(canvasRef.current);
    addEventListener('orientationchange', resize);
    return () => {
      observer.disconnect();
      removeEventListener('orientationchange', resize);
      cancelAnimationFrame(drawFrame.current);
      cancelAnimationFrame(fadeTimer.current);
      clearTimeout(ringRecheck.current);
    };
  }, []);
  useEffect(() => { strokes.current = []; active.current = null; lastEnd.current = null; clearTimeout(ringRecheck.current); scheduleDraw(); }, [clearSignal]);
  useEffect(scheduleDraw, [eink]);

  useImperativeHandle(handle, () => ({
    submit,
    undo,
    snapshot: () => {
      const live = strokes.current.filter(s => s.fadeStart == null && s.points.length > 1);
      if (!live.length) return null;
      const points = live.flatMap(s => s.points);
      const minX = Math.min(...points.map(p => p.x)) - 24, maxX = Math.max(...points.map(p => p.x)) + 24;
      const minY = Math.min(...points.map(p => p.y)) - 24, maxY = Math.max(...points.map(p => p.y)) + 24;
      const w = maxX - minX, h = maxY - minY;
      if (w < 8 || h < 8) return null;
      const scale = Math.min(1, SNAPSHOT_MAX / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.translate(-minX, -minY);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111111';
      for (const s of live) {
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineWidth = Math.max(1.8 + s.points[i].pressure * 2.6, 2.5 / scale);
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
      }
      return canvas.toDataURL('image/jpeg', 0.82);
    },
  }));

  const localPoints = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    return events.map(e => ({ x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.35 }));
  };

  /** Gesture pass, run when a stroke finishes: answer ring, then scratch-out, then question mark. */
  const interpret = (finished: InkStroke) => {
    const others = strokes.current.filter(s => s !== finished && s.fadeStart == null && s.kind === 'ink');
    const enclosed = detectAnswerCircle(finished.points, others.map(s => s.points));
    if (enclosed) {
      finished.kind = 'ring';
      return onCircleAnswer(enclosed);
    }
    const scratched = detectScratchOut(finished.points, others.map(s => s.points));
    if (scratched) return absorb([finished, ...strokes.current.filter(s => scratched.includes(s.points))]);
    const previous = lastEnd.current;
    const groups: InkStroke[][] = [[finished]];
    if (previous && previous.stroke !== finished && previous.stroke.fadeStart == null && performance.now() - previous.at < 1600) {
      groups.push([previous.stroke, finished]);
    }
    for (const group of groups) {
      if (isQuestionMark(group.map(s => s.points))) {
        absorb(group);
        return onQuestionMark();
      }
    }
    const container = strokes.current.find(s =>
      s !== finished && s.fadeStart == null &&
      (s.kind === 'ring' || (s.kind === 'ink' && isEmptyRing(s.points))) &&
      pointInPolygon(strokeCentroid(finished.points), s.points));
    if (container) {
      container.kind = 'ring';
      clearTimeout(ringRecheck.current);
      ringRecheck.current = window.setTimeout(() => {
        const inside = strokes.current.filter(s => s.kind === 'ink' && s.fadeStart == null && pointInPolygon(strokeCentroid(s.points), container.points));
        if (inside.length) onCircleAnswer(inside.map(s => s.points));
      }, 900);
    }
  };

  const finishStroke = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    const finished = active.current;
    active.current = null;
    predicted.current = [];
    if (event?.pointerType === 'pen') penActive.current = false;
    scheduleDraw();
    if (finished && finished.points.length > 1) {
      interpret(finished);
      lastEnd.current = { stroke: finished, at: performance.now() };
    }
  };

  const cancelStroke = () => {
    const unfinished = active.current;
    active.current = null;
    predicted.current = [];
    penActive.current = false;
    if (unfinished) strokes.current = strokes.current.filter(s => s !== unfinished);
    scheduleDraw();
  };

  return (
    <canvas
      ref={canvasRef}
      className="ink"
      tabIndex={0}
      aria-label="Notebook page — write anywhere. Circle your answer to hand it in; draw a question mark for a hint; scribble hard over ink to erase it. Press Control or Command Z to undo the last stroke."
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          undo();
        }
      }}
      onPointerDown={event => {
        if (event.pointerType === 'touch' && penActive.current) return;
        if (event.pointerType === 'pen') penActive.current = true;
        onActivity?.();
        event.currentTarget.setPointerCapture(event.pointerId);
        active.current = { points: localPoints(event), kind: 'ink' };
        strokes.current.push(active.current);
        scheduleDraw();
      }}
      onPointerMove={event => {
        if (!active.current) return;
        active.current.points.push(...localPoints(event));
        const rect = event.currentTarget.getBoundingClientRect();
        predicted.current = (event.nativeEvent.getPredictedEvents?.() ?? [])
          .map(e => ({ x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.35 }));
        scheduleDraw();
      }}
      onPointerUp={finishStroke}
      onLostPointerCapture={() => { if (active.current) finishStroke(); }}
      onPointerCancel={cancelStroke}
    />
  );
});
