import { useEffect, useRef } from 'react';
import { detectAnswerCircle, isQuestionMark, type Stroke } from './recognizer';

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
};

const FADE_MS = 650;

export function InkPad({ clearSignal, eink, onCircleAnswer, onQuestionMark }: InkPadProps) {
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

  const localPoints = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    return events.map(e => ({ x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.35 }));
  };

  /** Gesture pass, run when a stroke finishes: answer ring first, then question mark. */
  const interpret = (finished: InkStroke) => {
    const others = strokes.current.filter(s => s !== finished && s.fadeStart == null && s.kind === 'ink');
    const enclosed = detectAnswerCircle(finished.points, others.map(s => s.points));
    if (enclosed) {
      finished.kind = 'ring';
      return onCircleAnswer(enclosed);
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
      aria-label="Notebook page — write anywhere. Circle your answer to hand it in; draw a question mark for a hint."
      onPointerDown={event => {
        if (event.pointerType === 'touch' && penActive.current) return; // palm rejection
        if (event.pointerType === 'pen') penActive.current = true;
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
}
