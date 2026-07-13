import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { detectAnswerCircle, detectScratchOut, isQuestionMark, type Stroke } from './recognizer';

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
  const fadeTimer = useRef(0);

  const draw = () => {
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

  /** Fade absorbed gesture strokes out, then drop them. In e-ink mode they vanish in one refresh. */
  const absorb = (targets: InkStroke[]) => {
    const start = performance.now();
    for (const s of targets) s.fadeStart = start;
    if (eink) {
      strokes.current = strokes.current.filter(s => s.fadeStart == null);
      return draw();
    }
    cancelAnimationFrame(fadeTimer.current);
    const tick = () => {
      draw();
      if (strokes.current.some(s => s.fadeStart != null && performance.now() - s.fadeStart < FADE_MS)) {
        fadeTimer.current = requestAnimationFrame(tick);
      } else {
        strokes.current = strokes.current.filter(s => s.fadeStart == null);
        draw();
      }
    };
    fadeTimer.current = requestAnimationFrame(tick);
  };

  const resize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = box.width * ratio;
    canvas.height = box.height * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    draw();
  };

  useEffect(() => { resize(); addEventListener('resize', resize); return () => removeEventListener('resize', resize); }, []);
  useEffect(() => { strokes.current = []; active.current = null; lastEnd.current = null; draw(); }, [clearSignal]);
  useEffect(draw, [eink]);

  useImperativeHandle(handle, () => ({
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
          // keep strokes at least ~2.5px wide in the exported image
          ctx.lineWidth = Math.max(1.8 + s.points[i].pressure * 2.6, 2.5 / scale);
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
      }
      return canvas.toDataURL('image/jpeg', 0.82);
    },
  }), []);

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
    if (scratched) {
      return absorb([finished, ...strokes.current.filter(s => scratched.includes(s.points))]);
    }
    const previous = lastEnd.current;
    const groups: InkStroke[][] = [[finished]];
    if (previous && previous.stroke !== finished && previous.stroke.fadeStart == null && performance.now() - previous.at < 1600) {
      groups.push([previous.stroke, finished]); // hook then its dot
    }
    for (const group of groups) {
      if (isQuestionMark(group.map(s => s.points))) {
        absorb(group);
        return onQuestionMark();
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="ink"
      aria-label="Notebook page — write anywhere. Circle your answer to hand it in; draw a question mark for a hint; scribble hard over ink to erase it."
      onPointerDown={event => {
        if (event.pointerType === 'touch' && penActive.current) return; // palm rejection
        if (event.pointerType === 'pen') penActive.current = true;
        onActivity?.();
        event.currentTarget.setPointerCapture(event.pointerId);
        active.current = { points: localPoints(event), kind: 'ink' };
        strokes.current.push(active.current);
        draw();
      }}
      onPointerMove={event => {
        if (!active.current) return;
        active.current.points.push(...localPoints(event));
        const rect = event.currentTarget.getBoundingClientRect();
        predicted.current = (event.nativeEvent.getPredictedEvents?.() ?? [])
          .map(e => ({ x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.35 }));
        draw();
      }}
      onPointerUp={event => {
        const finished = active.current;
        active.current = null;
        predicted.current = [];
        if (event.pointerType === 'pen') penActive.current = false;
        draw();
        if (finished && finished.points.length > 1) {
          interpret(finished);
          lastEnd.current = { stroke: finished, at: performance.now() };
        }
      }}
      onPointerCancel={() => { active.current = null; predicted.current = []; penActive.current = false; draw(); }}
    />
  );
});
